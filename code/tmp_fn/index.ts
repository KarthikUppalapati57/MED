import { encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-client-info, apikey",
};

const INVOICE_SCHEMA_PROMPT = `You are an expert invoice data extractor. Extract all invoice information from the provided document and return ONLY valid JSON with this exact structure:
{
  "vendor_name": "string",
  "vendor_address": "string or null",
  "account_number": "string or null",
  "invoice_number": "string",
  "invoice_date": "YYYY-MM-DD",
  "due_date": "YYYY-MM-DD or null",
  "payment_terms": "string or null (e.g. Net 30)",
  "purchase_order": "string or null",
  "subtotal": number,
  "tax_amount": number,
  "fuel_surcharge": number,
  "delivery_fee": number,
  "other_charges": number,
  "total_amount": number,
  "line_items": [
    {
      "product_id": "string or null",
      "description": "string",
      "quantity": number,
      "unit": "string (ea, lb, cs, etc.)",
      "unit_price": number,
      "extended_price": number
    }
  ]
}
Return ONLY the JSON object, no markdown, no explanation. Be precise with numbers and dates. If a field is not found, use null for strings and 0 for numbers. Extract ALL line items from the invoice.`;

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const startTime = Date.now();
  console.log(`[extract-invoice] Request received at ${new Date().toISOString()}`);

  try {
    const GEMINI_API_KEY = Deno.env.get("gemini_api_key");
    if (!GEMINI_API_KEY) {
      const keys = Object.keys(Deno.env.toObject()).filter(k => !k.startsWith('SUPABASE_') && !k.startsWith('DENO_'));
      throw new Error(`gemini_api_key is not configured in Edge Function secrets. Available custom keys are: [${keys.join(', ')}]`);
    }

    // Parse the multipart form data
    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return new Response(JSON.stringify({ error: "No file uploaded" }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    console.log(`[extract-invoice] File received: ${file.name}, size: ${file.size} bytes, type: ${file.type}`);

    // Validate file type
    const allowedTypes = [
      "application/pdf",
      "image/png",
      "image/jpeg",
      "image/tiff",
      "image/webp",
    ];

    if (!allowedTypes.includes(file.type)) {
      return new Response(
        JSON.stringify({
          error: `Unsupported file type: ${file.type}. Allowed: ${allowedTypes.join(", ")}`,
        }),
        {
          status: 400,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        }
      );
    }

    // Read file and encode to base64 using Deno's efficient encoder
    const encodeStart = Date.now();
    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    const base64 = encodeBase64(uint8Array);
    console.log(`[extract-invoice] Base64 encoding took ${Date.now() - encodeStart}ms (${base64.length} chars)`);

    const mimeType = file.type;

    // Call Gemini API
    const geminiStart = Date.now();
    console.log(`[extract-invoice] Calling Gemini API (gemini-2.0-flash)...`);
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000); // 120s timeout for Gemini call

    let geminiResponse: Response;
    try {
      geminiResponse = await fetch(geminiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: INVOICE_SCHEMA_PROMPT + "\n\nExtract all invoice data from this document. Be precise with numbers, dates, and line items.",
                },
                {
                  inline_data: {
                    mime_type: mimeType,
                    data: base64,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0,
            responseMimeType: "application/json",
          },
        }),
      });
    } catch (fetchErr: unknown) {
      clearTimeout(timeoutId);
      if (fetchErr instanceof DOMException && fetchErr.name === 'AbortError') {
        console.error(`[extract-invoice] Gemini API timed out after 120s`);
        return new Response(
          JSON.stringify({ error: "AI extraction timed out. The document may be too large or complex. Please try a smaller file or a single-page image." }),
          { status: 504, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
        );
      }
      throw fetchErr;
    }
    clearTimeout(timeoutId);

    console.log(`[extract-invoice] Gemini API responded in ${Date.now() - geminiStart}ms with status ${geminiResponse.status}`);

    if (!geminiResponse.ok) {
      const errorData = await geminiResponse.json().catch(() => ({}));
      const errorMsg = (errorData as any)?.error?.message || `Gemini API error: ${geminiResponse.status}`;
      console.error(`[extract-invoice] Gemini API error: ${errorMsg}`);
      throw new Error(errorMsg);
    }

    const geminiData = await geminiResponse.json();
    const content = (geminiData as any)?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    if (!content) {
      console.error(`[extract-invoice] Empty response from Gemini API`);
      throw new Error("Gemini returned an empty response. The document may not be readable.");
    }

    // Parse JSON from response (strip markdown code fences if present)
    const jsonStr = content
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();

    let invoiceData;
    try {
      invoiceData = JSON.parse(jsonStr);
    } catch (parseErr) {
      console.error(`[extract-invoice] Failed to parse Gemini response as JSON: ${jsonStr.substring(0, 200)}`);
      throw new Error("Failed to parse AI response. Please try again.");
    }

    // Add metadata
    invoiceData.extraction_method = "gemini";

    const totalTime = Date.now() - startTime;
    console.log(`[extract-invoice] Success! Total processing time: ${totalTime}ms`);

    return new Response(JSON.stringify(invoiceData), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const totalTime = Date.now() - startTime;
    console.error(`[extract-invoice] Error after ${totalTime}ms:`, errorMessage);

    return new Response(
      JSON.stringify({ error: `Extraction failed: ${errorMessage}` }),
      {
        status: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      }
    );
  }
});
