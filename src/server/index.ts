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
  image: string;          // full data:image/... URI
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

const MAX_REQUEST_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
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
// Middleware – log every request
// ============================================================================

app.use(async (c, next) => {
  const start = Date.now();
  console.log(`[REQUEST] ${c.req.method} ${new URL(c.req.url).pathname}`);

  const contentLength = c.req.header('content-length');
  if (contentLength && parseInt(contentLength, 10) > MAX_REQUEST_SIZE_BYTES) {
    console.warn(`[REJECTED] Body too large: ${contentLength} bytes`);
    return c.json({ success: false, error: 'Request body exceeds maximum size' }, 413);
  }

  await next();

  console.log(`[RESPONSE] ${c.res.status} (${Date.now() - start}ms)`);
});

// ============================================================================
// Licence Agreement Helper
// ============================================================================

const agreedModels = new Set<string>();

/**
 * Ensure the model has accepted its licence. If we get error 5016,
 * send an "agree" prompt once and mark the model as agreed.
 */
async function ensureModelAgreement(ai: Env['AI'], model: string) {
  if (agreedModels.has(model)) return; // already agreed in this Worker instance

  console.log(`[LICENCE] Checking licence for ${model}...`);
  try {
    // A dummy call just to trigger the licence check
    // We send a minimal valid prompt (text only)
    const dummyMessages = [{ role: 'user', content: 'agree' }];
    await ai.run(model, { messages: dummyMessages });
    console.log(`[LICENCE] ${model} already accepted`);
  } catch (err: any) {
    const msg = err?.message || String(err);
    if (msg.includes('5016')) {
      console.log(`[LICENCE] ${model} requires agreement, sending 'agree'...`);
      // Send the actual "agree" prompt
      await ai.run(model, { messages: [{ role: 'user', content: 'agree' }] });
      console.log(`[LICENCE] ${model} agreement successful`);
    } else {
      console.warn(`[LICENCE] Unexpected error during check for ${model}:`, msg);
      // Not a licence error – rethrow so the caller can handle it
      throw err;
    }
  }
  agreedModels.add(model);
}

// ============================================================================
// Utility Functions (with logging)
// ============================================================================

function extractJSON(aiText: string): unknown {
  console.log(`[JSON-EXTRACT] Raw text length: ${aiText.length}`);
  console.log(`[JSON-EXTRACT] First 500 chars: ${aiText.substring(0, 500)}`);

  if (!aiText || typeof aiText !== 'string') {
    console.error('[JSON-EXTRACT] Input is not a string');
    throw new Error('Invalid AI response: not a string');
  }

  const trimmed = aiText.trim();

  // Try markdown code block
  const jsonBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (jsonBlockMatch?.[1]) {
    const jsonString = jsonBlockMatch[1].trim();
    console.log('[JSON-EXTRACT] Found code block, parsing...');
    try {
      const parsed = JSON.parse(jsonString);
      console.log('[JSON-EXTRACT] Successfully parsed from code block');
      return parsed;
    } catch (e) {
      console.warn('[JSON-EXTRACT] Code block parse failed:', e);
    }
  }

  // Direct parse
  try {
    const parsed = JSON.parse(trimmed);
    console.log('[JSON-EXTRACT] Direct parse succeeded');
    return parsed;
  } catch (e) {
    console.warn('[JSON-EXTRACT] Direct parse failed:', e);
  }

  // Outer array
  const arrayMatch = trimmed.match(/^\s*(\[[\s\S]*\])\s*$/);
  if (arrayMatch?.[1]) {
    try {
      const parsed = JSON.parse(arrayMatch[1]);
      console.log('[JSON-EXTRACT] Parsed outer array');
      return parsed;
    } catch (e) {
      console.warn('[JSON-EXTRACT] Outer array parse failed:', e);
    }
  }

  // Outer object
  const objectMatch = trimmed.match(/^\s*(\{[\s\S]*\})\s*$/);
  if (objectMatch?.[1]) {
    try {
      const parsed = JSON.parse(objectMatch[1]);
      console.log('[JSON-EXTRACT] Parsed outer object');
      return parsed;
    } catch (e) {
      console.warn('[JSON-EXTRACT] Outer object parse failed:', e);
    }
  }

  console.error('[JSON-EXTRACT] All strategies failed');
  throw new Error('Could not extract valid JSON from AI response');
}

async function runVisionModel(
  ai: Env['AI'],
  systemPrompt: string,
  imageDataUri: string
): Promise<string> {
  console.log(`[VISION] Model: ${VISION_MODEL}`);
  console.log(`[VISION] Prompt length: ${systemPrompt.length} chars`);

  // Ensure licence
  await ensureModelAgreement(ai, VISION_MODEL);

  const messages = [
    {
      role: 'user',
      content: [
        { type: 'text', text: systemPrompt },
        { type: 'image', image: imageDataUri }   // string
      ]
    }
  ];

  try {
    console.log('[VISION] Sending request...');
    const response = await ai.run(VISION_MODEL, { messages });
    console.log(`[VISION] Response keys: ${Object.keys(response).join(', ')}`);

    const result = response.response || '';
    if (!result) {
      console.error('[VISION] Empty response field');
      console.error('[VISION] Full response:', JSON.stringify(response).substring(0, 500));
      throw new Error('Empty response from vision model');
    }

    console.log(`[VISION] Output length: ${result.length} chars, first 300: ${result.substring(0, 300)}`);
    return result;
  } catch (error) {
    console.error('[VISION] Failed:', error instanceof Error ? error.message : String(error));
    throw new Error('Vision model failed to process image');
  }
}

async function runTextModel(
  ai: Env['AI'],
  systemPrompt: string,
  userMessage: string
): Promise<string> {
  console.log(`[TEXT] Model: ${TEXT_MODEL}`);
  console.log(`[TEXT] System prompt length: ${systemPrompt.length}, user message length: ${userMessage.length}`);

  // Ensure licence
  await ensureModelAgreement(ai, TEXT_MODEL);

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage }
  ];

  try {
    console.log('[TEXT] Sending request...');
    const response = await ai.run(TEXT_MODEL, { messages });
    console.log(`[TEXT] Response keys: ${Object.keys(response).join(', ')}`);

    const result = response.response || response.text || '';
    if (!result) {
      console.error('[TEXT] Empty response fields');
      console.error('[TEXT] Full response:', JSON.stringify(response).substring(0, 500));
      throw new Error('Empty response from text model');
    }

    console.log(`[TEXT] Output length: ${result.length} chars, first 300: ${result.substring(0, 300)}`);
    return result;
  } catch (error) {
    console.error('[TEXT] Failed:', error instanceof Error ? error.message : String(error));
    throw new Error('Text model failed to process data');
  }
}

// ============================================================================
// Action Handlers (already include logging)
// ============================================================================

async function handleOCRAction(c: HonoContext, request: OCRRequest): Promise<Response> {
  console.log('[OCR-ACTION] Received OCR request');

  if (!request.image || typeof request.image !== 'string') {
    return c.json({ success: false, error: 'Missing or invalid image parameter' }, 400);
  }
  if (!request.image.startsWith('data:image/')) {
    return c.json({ success: false, error: 'Image must be a valid data URI' }, 400);
  }

  // Rough size check
  const base64Part = request.image.split(',')[1] || '';
  if (base64Part.length * 0.75 > MAX_IMAGE_SIZE_BYTES) {
    return c.json({ success: false, error: 'Image data exceeds maximum size' }, 413);
  }

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
    const aiText = await runVisionModel(c.env.AI, systemPrompt, request.image);
    const data = extractJSON(aiText) as any[];

    if (!Array.isArray(data)) {
      return c.json({ success: false, error: 'Invalid response structure' }, 500);
    }

    const contacts: Contact[] = data.map(item => ({
      name: String(item.name || ''),
      email: String(item.email || ''),
      phone: String(item.phone || ''),
    }));

    console.log(`[OCR-ACTION] Success – ${contacts.length} contacts`);
    return c.json({ success: true, data: contacts });
  } catch (error) {
    console.error('[OCR-ACTION] Failed:', error instanceof Error ? error.message : String(error));
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
