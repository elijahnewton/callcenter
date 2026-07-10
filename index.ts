/**
 * Dedicated Cloudflare Worker API for Roster Extractor and Data Sanitizer
 * Host or bind to: /api/companion-process
 */

export interface Env {
  AI: any; // Cloudflare Workers AI Binding
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Standard CORS headers for development/production interop
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    try {
      const payload = await request.json<{ action: 'ocr' | 'sanitize'; image?: string; data?: any[] }>();

      // -------------------------------------------------------------
      // ACTION: OCR (Image to structured data)
      // -------------------------------------------------------------
      if (payload.action === 'ocr') {
        if (!payload.image) {
          return new Response(JSON.stringify({ error: 'Missing image payload' }), { status: 400, headers: corsHeaders });
        }

        // Convert base64 payload to binary array for Workers AI vision processing
        const binaryBuffer = Uint8Array.from(atob(payload.image), c => c.charCodeAt(0));

        const modelResponse = await env.AI.run('@cf/meta/llama-3.2-11b-vision-instruct', {
          prompt: 'Analyze this image. It contains a list of names and phone numbers. Extract every full name and matching telephone number. Return STRICTLY a raw JSON array of objects with the keys "name" and "phone". Do not add introductory conversational text, markdown code blocks, or markdown formatting fences. JSON Schema: [{"name": "John Doe", "phone": "0770000000"}]',
          image: [...binaryBuffer],
        });

        const structuredRecords = sanitizeAndExtractJson(modelResponse.response);
        return new Response(JSON.stringify({ data: structuredRecords }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // -------------------------------------------------------------
      // ACTION: SANITIZE (Messy sheet normalization)
      // -------------------------------------------------------------
      if (payload.action === 'sanitize') {
        if (!payload.data || !Array.isArray(payload.data)) {
          return new Response(JSON.stringify({ error: 'Missing dirty spreadsheet row array data' }), { status: 400, headers: corsHeaders });
        }

        // Slice dirty rows to avoid exceeding system context window limits
        const targetDataSample = payload.data.slice(0, 200);

        const modelResponse = await env.AI.run('@cf/meta/llama-3-8b-instruct', {
          prompt: `You are an expert data migration engine. Clean up the following messy roster array. Find columns containing names (split them if combined) and telephone/contact columns. Normalize all phone numbers into plain strings without formatting (spaces, brackets, hyphens). Return STRICTLY a raw, clean JSON array matching this format: [{"name": "Clean Name", "phone": "CleanNumber"}]. Avoid markdown wraps. Input Data: ${JSON.stringify(targetDataSample)}`
        });

        const structuredRecords = sanitizeAndExtractJson(modelResponse.response);
        return new Response(JSON.stringify({ data: structuredRecords }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ error: 'Unknown pipeline request action' }), { status: 400, headers: corsHeaders });

    } catch (err: any) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
};

/**
 * Robust JSON extraction helper. Parses raw output, cleanly handles and strips 
 * potential markdown wrappers, and handles regex matching blocks.
 */
function sanitizeAndExtractJson(rawText: string): any[] {
  let cleanText = rawText.trim();
  
  // Strip common AI code blocks and markdown fences securely
  if (cleanText.startsWith('```')) {
    cleanText = cleanText.replace(/^
