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
  image: string;
  expectedRecordCount?: number;
}

interface SanitizeRequest {
  action: 'sanitize';
  text: string;
  channel: 'sms' | 'call' | 'rvm' | 'email';
  expectedRecordCount?: number;
}

type ActionRequest = OCRRequest | SanitizeRequest;

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

interface AIMessage {
  role: 'system' | 'user';
  content: string;
}

// ============================================================================
// Constants
// ============================================================================

const MAX_REQUEST_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_BASE64_LENGTH = 5 * 1024 * 1024;
const MAX_TEXT_INPUT_LENGTH = 100000;

const ALLOWED_CHANNELS = ['sms', 'call', 'rvm', 'email'] as const;
const VISION_MODEL = '@cf/meta/llama-3.2-11b-vision-instruct';
const TEXT_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

// ============================================================================
// Hono App Setup
// ============================================================================

type HonoContext = Context<{ Bindings: Bindings }>;
const app = new Hono<{ Bindings: Bindings }>();

// Fixed CORS: fallback to '*' when no Origin header (e.g. curl, server-to-server)
app.use('/api/*', cors({
  origin: (origin) => origin || '*',
  allowMethods: ['POST', 'GET', 'OPTIONS'],
  allowHeaders: ['Content-Type'],
  credentials: true,
  maxAge: 86400,
}));

// ============================================================================
// Middleware
// ============================================================================

app.use(async (c, next) => {
  const contentLength = c.req.header('content-length');
  if (contentLength && parseInt(contentLength, 10) > MAX_REQUEST_SIZE_BYTES) {
    return c.json(
      { success: false, error: 'Request body exceeds maximum size' },
      413
    );
  }
  await next();
});

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Extract Base64 data from data URI or return raw Base64 string
 */
function extractBase64(input: string): string {
  if (input.startsWith('data:')) {
    const matches = input.match(/;base64,([A-Za-z0-9+/=]+)/);
    if (matches?.[1]) {
      return matches[1];
    }
  }
  return input;
}

/**
 * Convert Base64 string to Uint8Array for Workers AI vision tasks
 */
function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Extract and parse JSON from AI response, handling markdown and formatting quirks
 */
function extractJSON(aiText: string): unknown {
  if (!aiText || typeof aiText !== 'string') {
    throw new Error('Invalid AI response: not a string');
  }

  const trimmed = aiText.trim();

  // Try markdown code block extraction – FIXED REGEX
  const jsonBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (jsonBlockMatch?.[1]) {
    const jsonString = jsonBlockMatch[1].trim();
    try {
      return JSON.parse(jsonString);
    } catch {
      // Fall through to next strategy
    }
  }

  // Try direct JSON parse
  try {
    return JSON.parse(trimmed);
  } catch {
    // Fall through to next strategy
  }

  // Try to find JSON array
  const arrayMatch = trimmed.match(/^\s*(\[[\s\S]*\])\s*$/);
  if (arrayMatch?.[1]) {
    try {
      return JSON.parse(arrayMatch[1]);
    } catch {
      // Fall through to next strategy
    }
  }

  // Try to find JSON object
  const objectMatch = trimmed.match(/^\s*(\{[\s\S]*\})\s*$/);
  if (objectMatch?.[1]) {
    try {
      return JSON.parse(objectMatch[1]);
    } catch {
      // Fall through
    }
  }

  throw new Error('Could not extract valid JSON from AI response');
}

/**
 * Call vision model for image analysis – FIXED INPUT FORMAT
 */
async function runVisionModel(
  ai: Env['AI'],
  systemPrompt: string,
  imageArray: Uint8Array
): Promise<string> {
  try {
    const messages = [
      {
        role: 'user',
        content: [
          { type: 'text', text: systemPrompt },
          { type: 'image', image: Array.from(imageArray) }
        ]
      }
    ];

    const response = await ai.run(VISION_MODEL, { messages });

    // Llama 3.2 11B Vision Instruct returns { response: string }
    const result = response.response || '';
    if (!result) {
      throw new Error('Empty response from vision model');
    }

    return result;
  } catch (error) {
    console.error('Vision model error:', error instanceof Error ? error.message : String(error));
    throw new Error('Vision model failed to process image');
  }
}
    // FIXED: vision model returns .description
    const result = response.description || '';
    if (!result) {
      throw new Error('Empty response from vision model');
    }

    return result;
  } catch (error) {
    console.error('Vision model error:', error instanceof Error ? error.message : String(error));
    throw new Error('Vision model failed to process image');
  }
}

/**
 * Call text model for data processing and cleaning – unchanged (text models use .response)
 */
async function runTextModel(
  ai: Env['AI'],
  systemPrompt: string,
  userMessage: string
): Promise<string> {
  try {
    const messages: AIMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage }
    ];

    const response = await ai.run(TEXT_MODEL, {
      messages
    });

    const result = response.response || response.text || '';
    if (!result) {
      throw new Error('Empty response from text model');
    }

    return result;
  } catch (error) {
    console.error('Text model error:', error instanceof Error ? error.message : String(error));
    throw new Error('Text model failed to process data');
  }
}

// ============================================================================
// Action Handlers
// ============================================================================

/**
 * Handle OCR action: extract contacts from image
 */
async function handleOCRAction(
  c: HonoContext,
  request: OCRRequest
): Promise<Response> {
  if (!request.image || typeof request.image !== 'string') {
    return c.json({ success: false, error: 'Missing or invalid image parameter' }, 400);
  }

  if (request.image.length > MAX_IMAGE_BASE64_LENGTH) {
    return c.json({ success: false, error: 'Image data exceeds maximum size' }, 413);
  }

  let base64Data: string;
  try {
    base64Data = extractBase64(request.image);
    if (!base64Data) throw new Error('No Base64 data found');
  } catch {
    return c.json({ success: false, error: 'Invalid Base64 image data' }, 400);
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
    const imageArray = base64ToUint8Array(base64Data);
    const aiText = await runVisionModel(c.env.AI, systemPrompt, imageArray);

    const data = extractJSON(aiText) as unknown;

    if (!Array.isArray(data)) {
      return c.json({ success: false, error: 'Invalid response structure from model' }, 500);
    }

    const validatedData: Contact[] = data.map((item: unknown) => {
      const obj = item as Record<string, unknown>;
      return {
        name: String(obj.name || ''),
        email: String(obj.email || ''),
        phone: String(obj.phone || ''),
      };
    });

    // Guard against silent data loss
    if (request.expectedRecordCount !== undefined && validatedData.length !== request.expectedRecordCount) {
      console.warn(`[OCR] Data loss detected. Expected: ${request.expectedRecordCount}, Extracted: ${validatedData.length}`);
      return c.json(
        {
          success: false,
          error: `Verification failed: Expected ${request.expectedRecordCount} records, but AI extracted ${validatedData.length}. Please retry.`
        },
        422
      );
    }

    return c.json({ success: true, data: validatedData }, 200);
  } catch (error) {
    console.error('OCR processing failed:', error instanceof Error ? error.message : String(error));
    return c.json({ success: false, error: 'Failed to process image' }, 500);
  }
}

/**
 * Handle sanitize action: clean and validate contacts for campaign
 */
async function handleSanitizeAction(
  c: HonoContext,
  request: SanitizeRequest
): Promise<Response> {
  if (!request.text || typeof request.text !== 'string') {
    return c.json({ success: false, error: 'Missing or invalid text parameter' }, 400);
  }

  if (!ALLOWED_CHANNELS.includes(request.channel)) {
    return c.json({ success: false, error: `Invalid channel. Must be one of: ${ALLOWED_CHANNELS.join(', ')}` }, 400);
  }

  if (request.text.length > MAX_TEXT_INPUT_LENGTH) {
    return c.json({ success: false, error: 'Text input exceeds maximum size' }, 413);
  }

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
    const aiText = await runTextModel(c.env.AI, systemPrompt, userMessage);

    const data = extractJSON(aiText) as unknown;

    if (!Array.isArray(data)) {
      return c.json({ success: false, error: 'Invalid response structure from model' }, 500);
    }

    const validatedData: SanitizedContact[] = data.map((item: unknown) => {
      const obj = item as Record<string, unknown>;
      const status = obj.status === 'valid' ? 'valid' : 'invalid';
      return {
        name: String(obj.name || ''),
        email: String(obj.email || ''),
        phone: String(obj.phone || ''),
        status,
        notes: String(obj.notes || ''),
      };
    });

    // Guard against silent data loss
    let expected = request.expectedRecordCount;
    if (expected === undefined) {
      try {
        const parsedInput = JSON.parse(request.text);
        if (Array.isArray(parsedInput)) {
          expected = parsedInput.length;
        }
      } catch {
        // Input is raw text/CSV, cannot auto-detect length
      }
    }

    if (expected !== undefined && validatedData.length !== expected) {
      console.warn(`[Sanitize] Data loss detected. Expected: ${expected}, Returned: ${validatedData.length}`);
      return c.json(
        {
          success: false,
          error: `Verification failed: Expected ${expected} records, but AI returned ${validatedData.length}. Please retry.`
        },
        422
      );
    }

    return c.json({ success: true, data: validatedData }, 200);
  } catch (error) {
    console.error('Sanitization processing failed:', error instanceof Error ? error.message : String(error));
    return c.json({ success: false, error: 'Failed to process contact data' }, 500);
  }
}

// ============================================================================
// Route Handlers
// ============================================================================

/**
 * Main unified API endpoint for Campaign Companion actions
 */
app.post('/api/companion', async (c) => {
  try {
    const request = await c.req.json<ActionRequest>();

    if (!request.action || typeof request.action !== 'string') {
      return c.json({ success: false, error: 'Missing or invalid action parameter' }, 400);
    }

    switch (request.action) {
      case 'ocr':
        return await handleOCRAction(c, request as OCRRequest);
      case 'sanitize':
        return await handleSanitizeAction(c, request as SanitizeRequest);
      default:
        return c.json({ success: false, error: `Unknown action: ${request.action}` }, 400);
    }
  } catch (error) {
    if (error instanceof SyntaxError) {
      console.error('JSON parse error:', error.message);
      return c.json({ success: false, error: 'Invalid JSON in request body' }, 400);
    }

    console.error('Request processing error:', error instanceof Error ? error.message : String(error));
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

/**
 * Health check endpoint
 */
app.get('/api/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() }, 200);
});

/**
 * 404 handler for undefined routes
 */
app.notFound((c) => {
  return c.json({ success: false, error: 'Endpoint not found' }, 404);
});

/**
 * Error handler for unhandled exceptions
 */
app.onError((err, c) => {
  console.error('Unhandled error:', err instanceof Error ? err.message : String(err));
  return c.json({ success: false, error: 'Internal server error' }, 500);
});

export default app;
