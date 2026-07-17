import { Hono, Context } from 'hono';
import { cors } from 'hono/cors';

// ============================================================================
// Types
// ============================================================================

interface Bindings {
  AI: any; // Cloudflare Workers AI binding
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

// ============================================================================
// Constants
// ============================================================================

const MAX_REQUEST_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_SIZE_BYTES  = 5 * 1024 * 1024;
const MAX_TEXT_INPUT_LENGTH = 100_000;

const ALLOWED_CHANNELS = ['sms', 'call', 'rvm', 'email'] as const;

// Gemma 4 — handles both text and vision
const MODEL = '@cf/google/gemma-4-26b-a4b-it';

// ============================================================================
// Hono App
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
// Middleware — logging + size guard
// ============================================================================

app.use(async (c, next) => {
  const start = Date.now();
  const path = c.req.path;

  const contentLength = c.req.header('content-length');
  if (contentLength && parseInt(contentLength, 10) > MAX_REQUEST_SIZE_BYTES) {
    return c.json({ success: false, error: 'Request body exceeds maximum size' }, 413);
  }

  await next();

  console.log(`[RES] ${c.res.status} ${c.req.method} ${path} ${Date.now() - start}ms`);
});

// ============================================================================
// Utility — JSON extraction from AI responses
// ============================================================================

function extractJSON(aiText: string): unknown {
  if (!aiText || typeof aiText !== 'string') {
    throw new Error('Invalid AI response: not a string');
  }

  let text = aiText.trim();

  // Strip markdown code fences
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fence?.[1]) {
    text = fence[1].trim();
  }

  // If surrounding noise exists, extract the JSON payload
  if (!text.startsWith('[') && !text.startsWith('{')) {
    const arr = text.match(/\[[\s\S]*\]/);
    if (arr) {
      text = arr[0];
    } else {
      const obj = text.match(/\{[\s\S]*\}/);
      if (obj) text = obj[0];
    }
  }

  // Repair truncated arrays
  if (text.startsWith('[') && !text.endsWith(']')) {
    text += ']';
  }

  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`JSON parse failed: ${(e as Error).message} | text: ${text.slice(0, 200)}`);
  }
}

// ============================================================================
// Utility — extract text content from various AI response shapes
// ============================================================================

function extractAIContent(response: any): string {
  // OpenAI chat completions format (Gemma 4 uses this)
  if (response?.choices?.[0]?.message?.content) {
    return response.choices[0].message.content;
  }

  // Native Workers AI format
  if (response?.response) {
    return response.response;
  }

  // Direct string
  if (typeof response === 'string') {
    return response;
  }

  // Deep fallback — regex search for "content" field
  const str = JSON.stringify(response);
  const match = str.match(/"content"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (match?.[1]) {
    return match[1].replace(/\\"/g, '"').replace(/\\n/g, '\n');
  }

  return '';
}

// ============================================================================
// AI Model Wrappers
// ============================================================================

async function runVisionModel(
  ai: Bindings['AI'],
  systemPrompt: string,
  imageDataUri: string
): Promise<string> {
  const response = await ai.run(MODEL, {
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: systemPrompt },
          { type: 'image_url', image_url: { url: imageDataUri } },
        ],
      },
    ],
    max_tokens: 8192,  // generous — reasoning models consume tokens for thinking
    temperature: 0.1,
  });

  const result = extractAIContent(response);

  // FIX: Only reject truly empty/whitespace responses.
  // "[]" is a valid response when no contacts are found.
  if (!result || !result.trim()) {
    throw new Error('Empty response from vision model');
  }

  return result;
}

async function runTextModel(
  ai: Bindings['AI'],
  systemPrompt: string,
  userMessage: string
): Promise<string> {
  const response = await ai.run(MODEL, {
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    max_tokens: 8192,
    temperature: 0.1,
  });

  const result = extractAIContent(response);

  // FIX: Was `result.trim().length < 20` which rejected valid "[]" responses.
  if (!result || !result.trim()) {
    throw new Error('Empty response from text model');
  }

  return result;
}

// ============================================================================
// Action Handlers
// ============================================================================

async function handleOCRAction(c: HonoContext, request: OCRRequest): Promise<Response> {
  if (!request.image?.startsWith('data:image/')) {
    return c.json({ success: false, error: 'Image must be a valid data URI' }, 400);
  }

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
    const data = extractJSON(aiText);

    if (!Array.isArray(data)) {
      return c.json({ success: false, error: 'Invalid response structure from model' }, 500);
    }

    const contacts: Contact[] = (data as any[]).map((item) => ({
      name:  String(item?.name  ?? ''),
      email: String(item?.email ?? ''),
      phone: String(item?.phone ?? ''),
    }));

    console.log(`[OCR] Extracted ${contacts.length} contacts`);
    return c.json({ success: true, data: contacts });
  } catch (error) {
    console.error('[OCR]', error instanceof Error ? error.message : String(error));
    return c.json({ success: false, error: 'Failed to process image' }, 500);
  }
}

async function handleSanitizeAction(c: HonoContext, request: SanitizeRequest): Promise<Response> {
  if (!request.text || typeof request.text !== 'string') {
    return c.json({ success: false, error: 'Missing or invalid text parameter' }, 400);
  }
  if (!ALLOWED_CHANNELS.includes(request.channel)) {
    return c.json({ success: false, error: `Invalid channel. Must be one of: ${ALLOWED_CHANNELS.join(', ')}` }, 400);
  }
  if (request.text.length > MAX_TEXT_INPUT_LENGTH) {
    return c.json({ success: false, error: 'Text input exceeds maximum size' }, 413);
  }

  const channelRequirement: Record<string, string> = {
    sms:   'A valid phone number is REQUIRED.',
    call:  'A valid phone number is REQUIRED.',
    rvm:   'A valid phone number is REQUIRED.',
    email: 'A valid email address is REQUIRED.',
  };

  const systemPrompt = `You are an expert contact data cleaning and validation agent.
Your task: Parse and standardize messy spreadsheet, CSV, or roster data for a "${request.channel}" campaign.

Normalization rules:
1. Names: Standardize capitalization, remove special characters and junk
2. Phone numbers: Extract digits only, validate format (at least 10 digits after country code)
3. Email addresses: Validate basic email syntax (must contain @ and domain)
4. Status: Mark as "valid" or "invalid" based on campaign channel requirements
   - Campaign channel: "${request.channel}"
   - Requirement: ${channelRequirement[request.channel] ?? 'Unknown'}
5. Notes: Provide brief explanation (max 30 chars) if marked invalid, otherwise empty string

Output format MUST be valid JSON only. No explanations, markdown, or other text.

Schema:
[
  { "name": "John Doe", "email": "john@example.com", "phone": "+1234567890", "status": "valid", "notes": "" },
  { "name": "Incomplete", "email": "", "phone": "", "status": "invalid", "notes": "Missing contact info" }
]

If no valid data, return: []`;

  // FIX: Was broken template literal with escaped braces
  const userMessage = `Clean and validate this contact list for ${request.channel} campaigns:\n\n${request.text}`;

  try {
    const aiText = await runTextModel(c.env.AI, systemPrompt, userMessage);
    const data = extractJSON(aiText);

    if (!Array.isArray(data)) {
      return c.json({ success: false, error: 'Invalid response structure from model' }, 500);
    }

    const validatedData: SanitizedContact[] = (data as any[]).map((item) => ({
      name:   String(item?.name   ?? ''),
      email:  String(item?.email  ?? ''),
      phone:  String(item?.phone  ?? ''),
      status: item?.status === 'valid' ? 'valid' as const : 'invalid' as const,
      notes:  String(item?.notes  ?? ''),
    }));

    console.log(`[SANITIZE] Returned ${validatedData.length} contacts`);
    return c.json({ success: true, data: validatedData });
  } catch (error) {
    console.error('[SANITIZE]', error instanceof Error ? error.message : String(error));
    return c.json({ success: false, error: 'Failed to process contact data' }, 500);
  }
}

// ============================================================================
// Routes
// ============================================================================

app.post('/api/companion', async (c) => {
  try {
    const request = await c.req.json<ActionRequest>();

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
      return c.json({ success: false, error: 'Invalid JSON in request body' }, 400);
    }
    console.error('[COMPANION]', error instanceof Error ? error.message : String(error));
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

app.get('/api/health', (c) =>
  c.json({ status: 'ok', timestamp: new Date().toISOString() })
);

app.notFound((c) =>
  c.json({ success: false, error: 'Endpoint not found' }, 404)
);

app.onError((err, c) => {
  console.error('[ERROR]', err instanceof Error ? err.message : String(err));
  return c.json({ success: false, error: 'Internal server error' }, 500);
});

export default app;