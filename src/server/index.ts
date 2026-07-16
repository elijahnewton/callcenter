import { Hono, Context } from 'hono';
import { cors } from 'hono/cors';

// ============================================================================
// Types & Interfaces
// ============================================================================

interface Bindings {
  AI: Env['AI'];
}

interface Env {
  AI: any;
}

interface Contact {
  name: string;
  email: string;
  phone: string;
}

interface SanitizedContact extends Contact {
  status: 'valid' | 'invalid';
  notes: string;
}

interface OCRRequest {
  action: 'ocr';
  image: string;          // now expects full data:image/... URI
  expectedRecordCount?: number;
}

interface SanitizeRequest {
  action: 'sanitize';
  text: string;
  channel: 'sms' | 'call' | 'rvm' | 'email';
  expectedRecordCount?: number;
}

type ActionRequest = OCRRequest | SanitizeRequest;

// ============================================================================
// Constants
// ============================================================================

const MAX_REQUEST_SIZE_BYTES = 10 * 1024 * 1024;   // 10 MB overall
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;      // 5 MB for data URI
const MAX_TEXT_INPUT_LENGTH = 100000;

const ALLOWED_CHANNELS = ['sms', 'call', 'rvm', 'email'] as const;
const VISION_MODEL = '@cf/meta/llama-3.2-11b-vision-instruct';
const TEXT_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

// ============================================================================
// Hono App Setup
// ============================================================================

type HonoContext = Context<{ Bindings: Bindings }>;
const app = new Hono<{ Bindings: Bindings }>();

app.use('/api/*', cors({
  origin: (origin) => origin || '*',
  allowMethods: ['POST', 'GET', 'OPTIONS'],
  allowHeaders: ['Content-Type'],
  credentials: true,
  maxAge: 86400,
}));

// ============================================================================
// Middleware – log every incoming request
// ============================================================================

app.use(async (c, next) => {
  const start = Date.now();
  const method = c.req.method;
  const path = new URL(c.req.url).pathname;

  console.log(`[REQUEST] ${method} ${path}`);

  const contentLength = c.req.header('content-length');
  if (contentLength && parseInt(contentLength, 10) > MAX_REQUEST_SIZE_BYTES) {
    console.warn(`[REJECTED] Body too large: ${contentLength} bytes`);
    return c.json({ success: false, error: 'Request body exceeds maximum size' }, 413);
  }

  await next();

  const duration = Date.now() - start;
  console.log(`[RESPONSE] ${method} ${path} → ${c.res.status} (${duration}ms)`);
});

// ============================================================================
// Utility Functions (logging embedded)
// ============================================================================

/**
 * Extract and parse JSON from AI response – logs every step
 */
function extractJSON(aiText: string): unknown {
  console.log(`[JSON-EXTRACT] Raw AI text length: ${aiText.length}`);
  console.log(`[JSON-EXTRACT] First 500 chars: ${aiText.substring(0, 500)}`);

  if (!aiText || typeof aiText !== 'string') {
    console.error('[JSON-EXTRACT] Invalid input: not a string');
    throw new Error('Invalid AI response: not a string');
  }

  const trimmed = aiText.trim();

  // Try markdown code block
  const jsonBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (jsonBlockMatch?.[1]) {
    const jsonString = jsonBlockMatch[1].trim();
    console.log('[JSON-EXTRACT] Found code block, trying parse...');
    try {
      const parsed = JSON.parse(jsonString);
      console.log('[JSON-EXTRACT] Successfully parsed JSON from code block');
      return parsed;
    } catch (e) {
      console.warn('[JSON-EXTRACT] Failed to parse code block JSON', e);
    }
  }

  // Try direct parse
  try {
    const parsed = JSON.parse(trimmed);
    console.log('[JSON-EXTRACT] Successfully parsed direct JSON');
    return parsed;
  } catch (e) {
    console.warn('[JSON-EXTRACT] Direct parse failed', e);
  }

  // Try to extract array
  const arrayMatch = trimmed.match(/^\s*(\[[\s\S]*\])\s*$/);
  if (arrayMatch?.[1]) {
    try {
      const parsed = JSON.parse(arrayMatch[1]);
      console.log('[JSON-EXTRACT] Parsed outer array');
      return parsed;
    } catch (e) {
      console.warn('[JSON-EXTRACT] Outer array parse failed', e);
    }
  }

  // Try to extract object
  const objectMatch = trimmed.match(/^\s*(\{[\s\S]*\})\s*$/);
  if (objectMatch?.[1]) {
    try {
      const parsed = JSON.parse(objectMatch[1]);
      console.log('[JSON-EXTRACT] Parsed outer object');
      return parsed;
    } catch (e) {
      console.warn('[JSON-EXTRACT] Outer object parse failed', e);
    }
  }

  console.error('[JSON-EXTRACT] All extraction strategies failed');
  throw new Error('Could not extract valid JSON from AI response');
}

/**
 * Call vision model – logs prompt length, model response time, and any errors
 */
async function runVisionModel(
  ai: Env['AI'],
  systemPrompt: string,
  imageDataUri: string   // full data:image/... string
): Promise<string> {
  const start = Date.now();
  console.log(`[VISION] Model: ${VISION_MODEL}`);
  console.log(`[VISION] Prompt length: ${systemPrompt.length} chars`);
  console.log(`[VISION] Image URI starts with: ${imageDataUri.substring(0, 100)}...`);

  try {
    const messages = [
      {
        role: 'user',
        content: [
          { type: 'text', text: systemPrompt },
          { type: 'image', image: imageDataUri }   // string form
        ]
      }
    ];

    console.log('[VISION] Sending request to Workers AI...');
    const response = await ai.run(VISION_MODEL, { messages });
    const duration = Date.now() - start;

    console.log(`[VISION] Received response in ${duration}ms`);
    console.log(`[VISION] Raw response keys: ${Object.keys(response).join(', ')}`);

    const result = response.response || '';
    if (!result) {
      console.error('[VISION] Response field "response" was empty');
      console.error('[VISION] Full response object:', JSON.stringify(response).substring(0, 500));
      throw new Error('Empty response from vision model');
    }

    console.log(`[VISION] Output length: ${result.length} chars`);
    console.log(`[VISION] First 300 chars: ${result.substring(0, 300)}`);
    return result;
  } catch (error) {
    const duration = Date.now() - start;
    console.error(`[VISION] Failed after ${duration}ms`);
    console.error('[VISION] Error:', error instanceof Error ? error.message : String(error));
    if (error instanceof Error && error.stack) {
      console.error('[VISION] Stack:', error.stack);
    }
    throw new Error('Vision model failed to process image');
  }
}

/**
 * Call text model – logs prompt details and response timing
 */
async function runTextModel(
  ai: Env['AI'],
  systemPrompt: string,
  userMessage: string
): Promise<string> {
  const start = Date.now();
  console.log(`[TEXT] Model: ${TEXT_MODEL}`);
  console.log(`[TEXT] System prompt length: ${systemPrompt.length} chars`);
  console.log(`[TEXT] User message length: ${userMessage.length} chars`);

  try {
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage }
    ];

    console.log('[TEXT] Sending request to Workers AI...');
    const response = await ai.run(TEXT_MODEL, { messages });
    const duration = Date.now() - start;

    console.log(`[TEXT] Received response in ${duration}ms`);
    console.log(`[TEXT] Raw response keys: ${Object.keys(response).join(', ')}`);

    const result = response.response || response.text || '';
    if (!result) {
      console.error('[TEXT] Response fields "response"/"text" empty');
      console.error('[TEXT] Full response:', JSON.stringify(response).substring(0, 500));
      throw new Error('Empty response from text model');
    }

    console.log(`[TEXT] Output length: ${result.length} chars`);
    console.log(`[TEXT] First 300 chars: ${result.substring(0, 300)}`);
    return result;
  } catch (error) {
    const duration = Date.now() - start;
    console.error(`[TEXT] Failed after ${duration}ms`);
    console.error('[TEXT] Error:', error instanceof Error ? error.message : String(error));
    if (error instanceof Error && error.stack) {
      console.error('[TEXT] Stack:', error.stack);
    }
    throw new Error('Text model failed to process data');
  }
}

// ============================================================================
// Action Handlers (with detailed logging of request/response)
// ============================================================================

async function handleOCRAction(
  c: HonoContext,
  request: OCRRequest
): Promise<Response> {
  console.log('[OCR-ACTION] Received OCR request');

  // Validate image input
  if (!request.image || typeof request.image !== 'string') {
    console.warn('[OCR-ACTION] Missing or invalid image parameter');
    return c.json({ success: false, error: 'Missing or invalid image parameter' }, 400);
  }

  // Check that it's a data URI
  if (!request.image.startsWith('data:image/')) {
    console.warn('[OCR-ACTION] Image does not start with data:image/');
    return c.json({ success: false, error: 'Image must be a valid data URI' }, 400);
  }

  // Optional size check (approximate)
  const base64Part = request.image.split(',')[1] || '';
  const estimatedBytes = base64Part.length * 0.75;   // rough estimate
  if (estimatedBytes > MAX_IMAGE_SIZE_BYTES) {
    console.warn(`[OCR-ACTION] Image too large, estimated ${Math.round(estimatedBytes)} bytes`);
    return c.json({ success: false, error: 'Image data exceeds maximum size' }, 413);
  }

  console.log(`[OCR-ACTION] Image URI starts with: ${request.image.substring(0, 60)}...`);
  console.log(`[OCR-ACTION] Estimated image size: ~${Math.round(estimatedBytes / 1024)} KB`);

  const systemPrompt = `You are an expert visual data extraction specialist.
Your task: Analyze the provided image and extract all visible contacts from handwritten lists, rosters, or sign-up sheets.

For each contact, extract:
- Full name
- Email address
- Phone number

Output format MUST be valid JSON only. No explanations, markdown, or other text.

Schema:
[
  { "name": "John Doe", "email": "john@example.com", "phone": "+1234567890" },
  { "name": "Jane Smith", "email": "jane@example.com", "phone": "+0987654321" }
]

If no contacts found, return: []`;

  try {
    console.log('[OCR-ACTION] Starting vision model call...');
    const aiText = await runVisionModel(c.env.AI, systemPrompt, request.image);

    console.log('[OCR-ACTION] Extracting JSON from AI response...');
    const data = extractJSON(aiText) as unknown;

    if (!Array.isArray(data)) {
      console.error('[OCR-ACTION] Parsed data is not an array, type:', typeof data);
      return c.json({ success: false, error: 'Invalid response structure from model' }, 500);
    }

    console.log(`[OCR-ACTION] Extracted ${data.length} contacts`);
    const validatedData: Contact[] = data.map((item: unknown, index) => {
      const obj = item as Record<string, unknown>;
      console.log(`[OCR-ACTION] Contact ${index}:`, JSON.stringify(obj));
      return {
        name: String(obj.name || ''),
        email: String(obj.email || ''),
        phone: String(obj.phone || ''),
      };
    });

    if (request.expectedRecordCount !== undefined && validatedData.length !== request.expectedRecordCount) {
      console.warn(`[OCR-ACTION] Record count mismatch: expected ${request.expectedRecordCount}, got ${validatedData.length}`);
      return c.json({
        success: false,
        error: `Verification failed: Expected ${request.expectedRecordCount} records, but AI extracted ${validatedData.length}. Please retry.`
      }, 422);
    }

    console.log(`[OCR-ACTION] Success – returning ${validatedData.length} contacts`);
    return c.json({ success: true, data: validatedData }, 200);
  } catch (error) {
    console.error('[OCR-ACTION] Processing error:', error instanceof Error ? error.message : String(error));
    if (error instanceof Error && error.stack) {
      console.error('[OCR-ACTION] Stack:', error.stack);
    }
    return c.json({ success: false, error: 'Failed to process image' }, 500);
  }
}

async function handleSanitizeAction(
  c: HonoContext,
  request: SanitizeRequest
): Promise<Response> {
  console.log('[SANITIZE-ACTION] Received sanitize request');
  console.log(`[SANITIZE-ACTION] Channel: ${request.channel}`);

  if (!request.text || typeof request.text !== 'string') {
    console.warn('[SANITIZE-ACTION] Missing text parameter');
    return c.json({ success: false, error: 'Missing or invalid text parameter' }, 400);
  }

  if (!ALLOWED_CHANNELS.includes(request.channel)) {
    console.warn(`[SANITIZE-ACTION] Invalid channel: ${request.channel}`);
    return c.json({ success: false, error: `Invalid channel. Must be one of: ${ALLOWED_CHANNELS.join(', ')}` }, 400);
  }

  if (request.text.length > MAX_TEXT_INPUT_LENGTH) {
    console.warn(`[SANITIZE-ACTION] Text too long: ${request.text.length} chars`);
    return c.json({ success: false, error: 'Text input exceeds maximum size' }, 413);
  }

  console.log(`[SANITIZE-ACTION] Input text length: ${request.text.length} chars`);

  const channelRequirements: Record<string, string> = {
    sms: 'A valid phone number is REQUIRED.',
    call: 'A valid phone number is REQUIRED.',
    rvm: 'A valid phone number is REQUIRED.',
    email: 'A valid email address is REQUIRED.'
  };

  const systemPrompt = `You are an expert contact data cleaning and validation agent.
Your task: Parse and standardize messy spreadsheet, CSV, or roster data for a "${request.channel}" campaign.

Normalization rules:
1. Names: Standardize capitalization, remove special characters and junk
2. Phone numbers: Extract digits only, validate format (at least 10 digits after country code)
3. Email addresses: Validate basic email syntax (must contain @ and domain)
4. Status: Mark as "valid" or "invalid" based on campaign channel requirements
   - Campaign channel: "${request.channel}"
   - Requirement: ${channelRequirements[request.channel] || 'Unknown'}
5. Notes: Provide brief explanation (max 30 chars) if marked invalid, otherwise empty string

Output format MUST be valid JSON only. No explanations, markdown, or other text.

Schema:
[
  { "name": "John Doe", "email": "john@example.com", "phone": "+1234567890", "status": "valid", "notes": "" },
  { "name": "Incomplete", "email": "", "phone": "", "status": "invalid", "notes": "Missing contact info" }
]

If no valid data, return: []`;

  try {
    const userMessage = `Clean and validate this contact list for ${request.channel} campaigns:\n\n${request.text}`;
    console.log('[SANITIZE-ACTION] Starting text model call...');
    const aiText = await runTextModel(c.env.AI, systemPrompt, userMessage);

    console.log('[SANITIZE-ACTION] Extracting JSON from AI response...');
    const data = extractJSON(aiText) as unknown;

    if (!Array.isArray(data)) {
      console.error('[SANITIZE-ACTION] Parsed data is not an array, type:', typeof data);
      return c.json({ success: false, error: 'Invalid response structure from model' }, 500);
    }

    console.log(`[SANITIZE-ACTION] Received ${data.length} contacts`);
    const validatedData: SanitizedContact[] = data.map((item: unknown, index) => {
      const obj = item as Record<string, unknown>;
      const status = obj.status === 'valid' ? 'valid' : 'invalid';
      console.log(`[SANITIZE-ACTION] Contact ${index}:`, JSON.stringify(obj));
      return {
        name: String(obj.name || ''),
        email: String(obj.email || ''),
        phone: String(obj.phone || ''),
        status,
        notes: String(obj.notes || ''),
      };
    });

    let expected = request.expectedRecordCount;
    if (expected === undefined) {
      try {
        const parsedInput = JSON.parse(request.text);
        if (Array.isArray(parsedInput)) {
          expected = parsedInput.length;
        }
      } catch { /* not JSON, can't detect */ }
    }

    if (expected !== undefined && validatedData.length !== expected) {
      console.warn(`[SANITIZE-ACTION] Record count mismatch: expected ${expected}, got ${validatedData.length}`);
      return c.json({
        success: false,
        error: `Verification failed: Expected ${expected} records, but AI returned ${validatedData.length}. Please retry.`
      }, 422);
    }

    console.log(`[SANITIZE-ACTION] Success – returning ${validatedData.length} contacts`);
    return c.json({ success: true, data: validatedData }, 200);
  } catch (error) {
    console.error('[SANITIZE-ACTION] Processing error:', error instanceof Error ? error.message : String(error));
    if (error instanceof Error && error.stack) {
      console.error('[SANITIZE-ACTION] Stack:', error.stack);
    }
    return c.json({ success: false, error: 'Failed to process contact data' }, 500);
  }
}

// ============================================================================
// Route Handlers
// ============================================================================

app.post('/api/companion', async (c) => {
  console.log('[API] /api/companion called');
  try {
    const request = await c.req.json<ActionRequest>();
    console.log(`[API] Action: ${request.action}`);

    if (!request.action || typeof request.action !== 'string') {
      console.warn('[API] Missing or invalid action parameter');
      return c.json({ success: false, error: 'Missing or invalid action parameter' }, 400);
    }

    switch (request.action) {
      case 'ocr':
        return await handleOCRAction(c, request as OCRRequest);
      case 'sanitize':
        return await handleSanitizeAction(c, request as SanitizeRequest);
      default:
        console.warn(`[API] Unknown action: ${request.action}`);
        return c.json({ success: false, error: `Unknown action: ${request.action}` }, 400);
    }
  } catch (error) {
    if (error instanceof SyntaxError) {
      console.error('[API] JSON parse error:', error.message);
      return c.json({ success: false, error: 'Invalid JSON in request body' }, 400);
    }
    console.error('[API] Unexpected error:', error instanceof Error ? error.message : String(error));
    if (error instanceof Error && error.stack) {
      console.error('[API] Stack:', error.stack);
    }
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

app.get('/api/health', (c) => {
  console.log('[HEALTH] Health check called');
  return c.json({ status: 'ok', timestamp: new Date().toISOString() }, 200);
});

app.notFound((c) => {
  console.warn(`[404] Not found: ${c.req.url}`);
  return c.json({ success: false, error: 'Endpoint not found' }, 404);
});

app.onError((err, c) => {
  console.error('[ONERROR] Unhandled error:', err instanceof Error ? err.message : String(err));
  if (err instanceof Error && err.stack) {
    console.error('[ONERROR] Stack:', err.stack);
  }
  return c.json({ success: false, error: 'Internal server error' }, 500);
});

export default app;
