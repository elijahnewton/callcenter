/**
 * Cloudflare Worker API for Roster Extractor and Data Sanitizer
 * Host or bind to: /api/companion-process
 */

export interface Env {
  AI: any; // Cloudflare Workers AI Binding
}

interface OCRPayload {
  action: 'ocr';
  image: string; // Base64 string
}

interface ParseTextPayload {
  action: 'parse_text';
  text: string; // Raw text list
}

interface SanitizePayload {
  action: 'sanitize';
  data: any[]; // Decoded spreadsheet row array
}

type WorkerPayload = OCRPayload | ParseTextPayload | SanitizePayload;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // CORS configuration for local dev and cross-origin compatibility
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Handle CORS OPTIONS pre-flight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Only allow POST request pipeline
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    try {
      const payload = await request.json<WorkerPayload>();

      if (!payload.action) {
        return new Response(JSON.stringify({ error: 'Missing process action parameter' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // -------------------------------------------------------------
      // ACTION: OCR (Visual Roster Extraction)
      // -------------------------------------------------------------
      if (payload.action === 'ocr') {
        const ocrPayload = payload as OCRPayload;
        if (!ocrPayload.image) {
          return new Response(JSON.stringify({ error: 'Missing image payload data for OCR' }), {
            status: 400,
            headers: corsHeaders
          });
        }

        // Convert base64 representation to binary buffer
        const binaryBuffer = Uint8Array.from(atob(ocrPayload.image), c => c.charCodeAt(0));

        // Invoke Cloudflare Vision model
        const modelResponse = await env.AI.run('@cf/meta/llama-3.2-11b-vision-instruct', {
          prompt: 'Extract names and phones from image. Return raw JSON: [{"name":"Name","phone":"CleanNumber"}]. No markdown.',
          image: [...binaryBuffer]
        });

        if (!modelResponse || !modelResponse.response) {
          throw new Error('No text returned from the AI OCR vision engine.');
        }

        const structuredRecords = sanitizeAndExtractJson(modelResponse.response);

        return new Response(JSON.stringify({ data: structuredRecords }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // -------------------------------------------------------------
      // ACTION: PARSE_TEXT (Raw Text List Parser)
      // -------------------------------------------------------------
      if (payload.action === 'parse_text') {
        const textPayload = payload as ParseTextPayload;
        if (!textPayload.text) {
          return new Response(JSON.stringify({ error: 'Missing text content for parsing' }), {
            status: 400,
            headers: corsHeaders
          });
        }

        // Invoke Cloudflare Llama Instruct model for raw text parsing
        const modelResponse = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
          prompt: `Parse contacts from text list. Return raw JSON: [{"name":"Name","phone":"CleanNumber"}]. No markdown. Text: ${textPayload.text}`
        });

        if (!modelResponse || !modelResponse.response) {
          throw new Error('No text returned from the AI text parsing engine.');
        }

        const structuredRecords = sanitizeAndExtractJson(modelResponse.response);

        return new Response(JSON.stringify({ data: structuredRecords }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // -------------------------------------------------------------
      // ACTION: SANITIZE (Messy Spreadsheet Normalization)
      // -------------------------------------------------------------
      if (payload.action === 'sanitize') {
        const sanitizePayload = payload as SanitizePayload;
        if (!sanitizePayload.data || !Array.isArray(sanitizePayload.data)) {
          return new Response(JSON.stringify({ error: 'Missing spreadsheet array data' }), {
            status: 400,
            headers: corsHeaders
          });
        }

        // Ensure we only process a maximum of 200 rows as requested
        const rowsToProcess = sanitizePayload.data.slice(0, 200);

        // Invoke Cloudflare Llama Instruct model for cleaning values
        const modelResponse = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
          prompt: `Normalize names/phones. Return raw JSON: [{"name":"Name","phone":"CleanNumber"}]. No markdown. Data: ${JSON.stringify(rowsToProcess)}`
        });

        if (!modelResponse || !modelResponse.response) {
          throw new Error('No text returned from the AI sanitization engine.');
        }

        const structuredRecords = sanitizeAndExtractJson(modelResponse.response);

        return new Response(JSON.stringify({ data: structuredRecords }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ error: `Unknown action: ${payload.action}` }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } catch (err: any) {
      return new Response(JSON.stringify({ error: err.message || 'Internal processing error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
};

/**
 * Parses raw text generated by the LLM, extracts the JSON array block starting 
 * with [ and ending with ], and cleans up potential markdown wrappers.
 */
function sanitizeAndExtractJson(rawText: string): any[] {
  const text = rawText.trim();
  
  // Find substring starting with '[' and ending with ']'
  const startIndex = text.indexOf('[');
  const endIndex = text.lastIndexOf(']');
  
  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    throw new Error('The AI model response did not contain a valid JSON array matching the structure.');
  }
  
  const jsonStr = text.substring(startIndex, endIndex + 1);
  
  try {
    return JSON.parse(jsonStr);
  } catch (err: any) {
    // Attempt standard cleanups: remove trailing commas and strip control characters
    const cleanedStr = jsonStr
      .replace(/,\s*([\]}])/g, '$1') // remove trailing commas before closing braces/brackets
      .replace(/\\"/g, '"')         // unescape quotes if double escaped
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, ''); // remove control chars
    
    try {
      return JSON.parse(cleanedStr);
    } catch (e: any) {
      throw new Error(`Failed to parse extracted JSON array: ${err.message}`);
    }
  }
}
