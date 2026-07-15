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
  expectedRecordCount?: number; // Added to prevent silent data loss
}

interface SanitizeRequest {
  action: 'sanitize';
  text: string;
  channel: 'sms' | 'call' | 'rvm' | 'email';
  expectedRecordCount?: number; // Added to prevent silent data loss
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
const VISION_MODEL = '@cf/meta/llama-3.2-90b-vision-preview';
const TEXT_MODEL = '@cf/meta/llama-3.1-70b-instruct';

// ============================================================================
// Hono App Setup
// ============================================================================

type HonoContext = Context<{ Bindings: Bindings }>;
const app = new Hono<{ Bindings: Bindings }>();

// Fixed CORS: Dynamically allow the requesting origin (handles localhost & production)
app.use('/api/*', cors({
  origin: (origin) => origin, 
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
    const matches = input.match(/;base64,(.+)/);
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

  // Try markdown code block extraction
  const jsonBlockMatch = trimmed.match(/
http://googleusercontent.com/immersive_entry_chip/0
