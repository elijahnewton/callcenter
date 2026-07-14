export default {
  async fetch(request, env) {
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
      const payload = await request.json();

      if (!payload || !payload.action) {
        return new Response(JSON.stringify({ error: 'Missing process action parameter' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // --- MODEL DEFINITIONS ---
      // We must use a multimodal model for images. Gemma is text-only.
      const VISION_MODEL = '@cf/meta/llama-3.2-11b-vision-instruct';
      const TEXT_MODEL = '@cf/google/gemma-4-26b-a4b-it'; 
      
      const SYSTEM_PROMPT = "You are a helpful data extraction assistant. You only output valid raw JSON arrays. Do not include markdown formatting or conversational text.";

      // -------------------------------------------------------------
      // ACTION: OCR (Visual Roster Extraction)
      // -------------------------------------------------------------
      if (payload.action === 'ocr') {
        if (!payload.image) {
          return new Response(JSON.stringify({ error: 'Missing image payload data' }), { status: 400, headers: corsHeaders });
        }

        const binaryBuffer = Uint8Array.from(atob(payload.image), c => c.charCodeAt(0));

        // Using the dedicated Vision model for the image
        const modelResponse = await env.AI.run(VISION_MODEL, {
          prompt: 'Extract names and phones from image. Return raw JSON array of objects with structure: [{"name":"Name","phone":"CleanNumber"}]. No markdown.',
          image: [...binaryBuffer]
        });

        const responseText = extractAiResponseText(modelResponse);
        if (!responseText) throw new Error('No text returned from the AI OCR vision engine.');

        const structuredRecords = sanitizeAndExtractJson(responseText);
        return new Response(JSON.stringify({ data: structuredRecords }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // -------------------------------------------------------------
      // ACTION: PARSE_TEXT (Raw Text List Parser)
      // -------------------------------------------------------------
      if (payload.action === 'parse_text') {
        if (!payload.text) {
          return new Response(JSON.stringify({ error: 'Missing text content' }), { status: 400, headers: corsHeaders });
        }

        // Using Gemma for text reasoning
        const modelResponse = await env.AI.run(TEXT_MODEL, {
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: `Parse contacts from text list. Return raw JSON array of objects with structure: [{"name":"Name","phone":"CleanNumber"}]. Text: ${payload.text}` }
          ]
        });

        const responseText = extractAiResponseText(modelResponse);
        if (!responseText) throw new Error('No text returned from the AI text parsing engine.');

        const structuredRecords = sanitizeAndExtractJson(responseText);
        return new Response(JSON.stringify({ data: structuredRecords }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // -------------------------------------------------------------
      // ACTION: SANITIZE (Messy Spreadsheet Normalization)
      // -------------------------------------------------------------
      if (payload.action === 'sanitize') {
        if (!payload.data || !Array.isArray(payload.data)) {
          return new Response(JSON.stringify({ error: 'Missing spreadsheet data' }), { status: 400, headers: corsHeaders });
        }

        const rowsToProcess = payload.data.slice(0, 200);

        // Using Gemma for text reasoning
        const modelResponse = await env.AI.run(TEXT_MODEL, {
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: `Normalize names/phones. Return raw JSON array of objects with structure: [{"name":"Name","phone":"CleanNumber"}]. Data: ${JSON.stringify(rowsToProcess)}` }
          ]
        });

        const responseText = extractAiResponseText(modelResponse);
        if (!responseText) throw new Error('No text returned from the AI sanitization engine.');

        const structuredRecords = sanitizeAndExtractJson(responseText);
        return new Response(JSON.stringify({ data: structuredRecords }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      return new Response(JSON.stringify({ error: `Unknown action: ${payload.action}` }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } catch (err) {
      return new Response(JSON.stringify({ error: err.message || 'Internal processing error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
};

/**
 * Safely extracts the text from Cloudflare's AI response regardless of whether
 * it uses the legacy flat structure or the newer OpenAI-compatible schema.
 */
function extractAiResponseText(modelResponse) {
  if (!modelResponse) return null;
  if (modelResponse.choices && modelResponse.choices.length > 0 && modelResponse.choices[0].message) {
    return modelResponse.choices[0].message.content;
  }
  if (modelResponse.response) {
    return modelResponse.response;
  }
  return null;
}

/**
 * Parses raw text generated by the LLM, extracts the JSON array block starting 
 * with [ and ending with ], and cleans up potential markdown wrappers.
 */
function sanitizeAndExtractJson(rawText) {
  const text = rawText.trim();
  const startIndex = text.indexOf('[');
  const endIndex = text.lastIndexOf(']');

  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    throw new Error('The AI model response did not contain a valid JSON array.');
  }

  const jsonStr = text.substring(startIndex, endIndex + 1);

  try {
    return JSON.parse(jsonStr);
  } catch (err) {
    const cleanedStr = jsonStr
      .replace(/,\s*([\]}])/g, '$1') 
      .replace(/\\"/g, '"')         
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, ''); 

    try {
      return JSON.parse(cleanedStr);
    } catch (e) {
      throw new Error(`Failed to parse extracted JSON array: ${err.message}`);
    }
  }
}
