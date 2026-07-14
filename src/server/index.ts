import { Hono } from 'hono';
import { cors } from 'hono/cors';

type Bindings = {
  AI: any; // bound to Cloudflare Workers AI
};

const app = new Hono<{ Bindings: Bindings }>();

// Enable CORS for local development (production will be same-origin)
app.use('/api/*', cors());

/**
 * Single, unified API endpoint for Campaign Companion actions
 */
app.post('/api/companion', async (c) => {
  try {
    const payload = await c.req.json();
    const { action, channel, text, image } = payload;

    // --- ACTION: IMAGE OCR (Llama 3.2 Vision) ---
    if (action === 'ocr' && image) {
      let base64Data = image;
      if (base64Data.startsWith('data:')) {
        base64Data = base64Data.split(',')[1];
      }

      // Convert Base64 string directly into a binary byte array for Workers AI
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const imageArray = Array.from(bytes);

      const systemPrompt = `You are an expert visual data extraction agent. 
Analyze the image containing handwritten contact lists or sign-up rosters.
Extract all contacts containing Name, Email, and Phone Number.
Format your response strictly as a JSON array of objects.

Output schema:
[
  { "name": "Contact Name", "email": "contact@domain.com", "phone": "+1234567890" }
]

Do not return any conversational text, introductions, markdown tags (except json block), or general comments. Only return JSON.`;

      const aiResponse = await c.env.AI.run('@cf/meta/llama-3.2-11b-vision-instruct', {
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: 'Extract all records from this image.' }
        ],
        image: imageArray,
      });

      const parsedData = parseAIResponse(aiResponse.response || aiResponse.text);
      return c.json({ success: true, data: parsedData });
    }

    // --- ACTION: EXCEL/CSV ROSTER SANITIZATION (Llama 3.1) ---
    if (action === 'sanitize' && text) {
      const systemPrompt = `You are an expert contact cleaning and normalization agent. 
Your goal is to parse messy raw spreadsheet rows and standardize them for a "${channel}" campaign.

Rules:
1. Names: Standardize casing and strip junk symbols.
2. Phone Numbers: Strip symbols and normalize to digits.
3. Email: Validate email syntax.
4. Validation Status: Mark each contact as "valid" or "invalid" based on this campaign channel ("${channel}").
   - If channel is 'sms', 'call', or 'rvm' (Ringless Voicemail): A valid phone number is REQUIRED.
   - If channel is 'email': A valid email is REQUIRED.
5. Provide a short "notes" explanation if flagged "invalid".

Output schema:
[
  { "name": "Name", "email": "email@example.com", "phone": "+1234567890", "status": "valid" | "invalid", "notes": "Reason here or blank" }
]

Only reply with raw JSON. Do not chat.`;

      const aiResponse = await c.env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Clean up this list:\n\n${text}` }
        ]
      });

      const parsedData = parseAIResponse(aiResponse.response || aiResponse.text);
      return c.json({ success: true, data: parsedData });
    }

    return c.json({ error: 'Invalid or missing action parameters.' }, 400);

  } catch (err: any) {
    console.error(err);
    return c.json({ error: 'Internal Worker error', details: err.message }, 500);
  }
});

// Robust parser to extract clean JSON blocks from AI markdown responses
function parseAIResponse(aiText: string): any[] {
  if (!aiText) return [];
  try {
    const jsonMatch = aiText.match(/```json\s*([\s\S]*?)\s*```/);
    const cleanedString = jsonMatch ? jsonMatch[1] : aiText;
    return JSON.parse(cleanedString.trim());
  } catch (err) {
    console.error('Failed to parse AI output as JSON:', aiText);
    return [];
  }
}

export default app;