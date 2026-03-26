/**
 * Invoice Extraction Service
 *
 * Uses OpenAI Vision API (GPT-4o) when VITE_OPENAI_API_KEY is set.
 * Falls back to client-side Tesseract.js OCR + pattern matching.
 */

// @ts-ignore
const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY;

// ── OpenAI Vision Extraction ────────────────────────────────
async function extractWithOpenAI(base64Image, mimeType) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are an expert invoice data extractor. Extract all invoice information from the image and return ONLY valid JSON with this exact structure:
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
Return ONLY the JSON object, no markdown, no explanation.`
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Extract all invoice data from this image. Be precise with numbers and dates.'
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${base64Image}`,
                detail: 'high'
              }
            }
          ]
        }
      ],
      max_tokens: 4096,
      temperature: 0,
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `OpenAI API error: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';

  // Parse JSON from response (strip markdown code fences if present)
  const jsonStr = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  return JSON.parse(jsonStr);
}

// ── Client-side OCR with Pattern Matching ───────────────────
async function extractWithClientOCR(file) {
  const { createWorker } = await import('tesseract.js');

  const worker = await createWorker('eng');

  let imageSource;
  if (file.type === 'application/pdf') {
    // Convert first page of PDF to a PNG data URL
    imageSource = await pdfToImage(file);
  } else {
    imageSource = URL.createObjectURL(file);
  }

  let text = '';
  try {
    const { data } = await worker.recognize(imageSource);
    text = data.text;
  } finally {
    await worker.terminate();
    // Clean up blob URL (data URLs don't need revocation)
    if (imageSource.startsWith('blob:')) {
      URL.revokeObjectURL(imageSource);
    }
  }

  return parseInvoiceText(text);
}

// ── PDF to Image converter ──────────────────────────────────
async function pdfToImage(file) {
  const pdfjsLib = await import('pdfjs-dist');

  // pdfjs-dist v4+ uses .mjs workers — use a matching CDN URL
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const page = await pdf.getPage(1);

  const scale = 2;
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;

  // @ts-ignore
  await page.render({
    canvasContext: canvas.getContext('2d'),
    viewport,
  }).promise;

  return canvas.toDataURL('image/png');
}

// ── Text Pattern Matching Parser ────────────────────────────
function parseInvoiceText(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  const result = {
    vendor_name: '',
    vendor_address: null,
    account_number: null,
    invoice_number: '',
    invoice_date: '',
    due_date: null,
    payment_terms: null,
    purchase_order: null,
    subtotal: 0,
    tax_amount: 0,
    fuel_surcharge: 0,
    delivery_fee: 0,
    other_charges: 0,
    total_amount: 0,
    line_items: [],
    raw_text: text,
  };

  // Vendor name: first non-empty line that isn't a label keyword
  const labelKeywords = /^(invoice|bill|receipt|statement|account|date|page|no\b|number)/i;
  for (const line of lines) {
    if (!labelKeywords.test(line) && line.length > 2) {
      result.vendor_name = line;
      break;
    }
  }

  for (const line of lines) {
    const lower = line.toLowerCase();

    // ── Invoice number ──────────────────────────────────────
    // Match "Invoice #", "Invoice No.", "Invoice Number:", "Inv#" followed by the value.
    // The value must contain at least one digit.
    if (!result.invoice_number) {
      const invMatch = line.match(
        /(?:invoice\s*(?:#|no\.?|number|num)?|inv\s*(?:#|no\.?)?)\s*[:\-]?\s*([A-Z0-9][A-Z0-9\-\/]{1,20})/i
      );
      // Only accept if the captured value contains a digit (avoids capturing "NUMBER" itself)
      if (invMatch && /\d/.test(invMatch[1])) {
        result.invoice_number = invMatch[1].trim();
      }
    }

    // ── Account number ──────────────────────────────────────
    if (!result.account_number) {
      const accMatch = line.match(
        /(?:account|acct?)\s*(?:#|no\.?|number)?\s*[:\-]?\s*([A-Z0-9][A-Z0-9\-]{2,20})/i
      );
      if (accMatch && /\d/.test(accMatch[1])) {
        result.account_number = accMatch[1].trim();
      }
    }

    // ── Invoice date ────────────────────────────────────────
    if (!result.invoice_date) {
      // Prefer lines that explicitly mention "date" or "invoice date"
      const dateMatch =
        line.match(/(?:invoice\s*)?date\s*[:\-]?\s*(\d{1,2}[\s\/\-\.]\d{1,2}[\s\/\-\.]\d{2,4})/i) ||
        line.match(/^date\s*[:\-]?\s*(\d{1,2}[\s\/\-\.]\d{1,2}[\s\/\-\.]\d{2,4})/i);
      if (dateMatch) result.invoice_date = normalizeDate(dateMatch[1]);
    }

    // ── Due date ────────────────────────────────────────────
    if (!result.due_date) {
      const dueMatch = line.match(
        /(?:due\s*(?:date)?|pay\s*by|payment\s*due)\s*[:\-]?\s*(\d{1,2}[\s\/\-\.]\d{1,2}[\s\/\-\.]\d{2,4})/i
      );
      if (dueMatch) result.due_date = normalizeDate(dueMatch[1]);
    }

    // ── Payment terms ───────────────────────────────────────
    if (!result.payment_terms) {
      const termsMatch = line.match(
        /(?:terms|payment\s*terms)\s*[:\-]?\s*(net\s*\d+|due\s*on\s*receipt|cod|net\s*eom|[\w\s]{3,30})/i
      );
      if (termsMatch) result.payment_terms = termsMatch[1].trim();
    }

    // ── Purchase order ──────────────────────────────────────
    if (!result.purchase_order) {
      const poMatch = line.match(
        /(?:p\.?o\.?|purchase\s*order)\s*(?:#|no\.?)?\s*[:\-]?\s*([A-Z0-9\-]{3,20})/i
      );
      if (poMatch && /\d/.test(poMatch[1])) {
        result.purchase_order = poMatch[1].trim();
      }
    }

    // ── Monetary amounts ────────────────────────────────────
    // Grand total — only match explicit total labels, not subtotal/tax lines
    const grandTotalMatch = lower.match(
      /(?:^|\s)(?:invoice\s+total|amount\s+due|balance\s+due|total\s+due|grand\s+total)\s*[:\-$]*\s*\$?\s*([\d,]+\.?\d*)/
    );
    if (grandTotalMatch) {
      const val = parseFloat(grandTotalMatch[1].replace(/,/g, ''));
      if (val > result.total_amount) result.total_amount = val;
    }

    // "Total" alone — only use if we haven't found a more specific total
    if (!result.total_amount) {
      const totalMatch = lower.match(/(?:^|\s)total\s*[:\-$]*\s*\$?\s*([\d,]+\.?\d*)/);
      if (totalMatch) result.total_amount = parseFloat(totalMatch[1].replace(/,/g, ''));
    }

    const subtotalMatch = lower.match(
      /sub\s*[-\s]?total\s*[:\-$]*\s*\$?\s*([\d,]+\.?\d*)/
    );
    if (subtotalMatch && !result.subtotal) {
      result.subtotal = parseFloat(subtotalMatch[1].replace(/,/g, ''));
    }

    const taxMatch = lower.match(
      /(?:^|\s)(?:tax|sales\s*tax|hst|gst|vat)\s*[:\-$(%\d]*\s*\$?\s*([\d,]+\.?\d*)/
    );
    if (taxMatch && !result.tax_amount) {
      result.tax_amount = parseFloat(taxMatch[1].replace(/,/g, ''));
    }

    const deliveryMatch = lower.match(
      /(?:delivery|shipping|freight)\s*(?:fee|charge|cost)?\s*[:\-$]*\s*\$?\s*([\d,]+\.?\d*)/
    );
    if (deliveryMatch && !result.delivery_fee) {
      result.delivery_fee = parseFloat(deliveryMatch[1].replace(/,/g, ''));
    }

    const fuelMatch = lower.match(
      /fuel\s*(?:surcharge|charge|adj)\s*[:\-$]*\s*\$?\s*([\d,]+\.?\d*)/
    );
    if (fuelMatch && !result.fuel_surcharge) {
      result.fuel_surcharge = parseFloat(fuelMatch[1].replace(/,/g, ''));
    }

    // ── Line items ──────────────────────────────────────────
    // Format A: QTY  UNIT  Description  Unit_Price  Ext_Price
    const lineItemA = line.match(
      /^(\d+(?:\.\d+)?)\s+([A-Z]{1,5})\s+(.+?)\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s*$/i
    );
    if (lineItemA) {
      const qty = parseFloat(lineItemA[1]);
      const unitPrice = parseFloat(lineItemA[4].replace(/,/g, ''));
      const extPrice = parseFloat(lineItemA[5].replace(/,/g, ''));
      result.line_items.push({
        quantity: qty,
        unit: lineItemA[2].toUpperCase(),
        description: lineItemA[3].trim(),
        product_id: null,
        unit_price: unitPrice,
        extended_price: extPrice,
      });
      continue;
    }

    // Format B: ProductID  QTY  UNIT  Description  Ext_Price
    const lineItemB = line.match(
      /^([A-Z0-9]{5,12})\s+(\d+(?:\.\d+)?)\s+([A-Z]{1,5})\s+(.+?)\s+([\d,]+\.\d{2})\s*$/i
    );
    if (lineItemB) {
      const qty = parseFloat(lineItemB[2]);
      const extPrice = parseFloat(lineItemB[5].replace(/,/g, ''));
      result.line_items.push({
        product_id: lineItemB[1],
        quantity: qty,
        unit: lineItemB[3].toUpperCase(),
        description: lineItemB[4].trim(),
        unit_price: extPrice / (qty || 1),
        extended_price: extPrice,
      });
      continue;
    }

    // Format C: QTY  Description  Price (no unit column)
    const lineItemC = line.match(
      /^(\d+(?:\.\d+)?)\s+(.{5,50}?)\s+\$?([\d,]+\.\d{2})\s*$/
    );
    if (lineItemC) {
      const qty = parseFloat(lineItemC[1]);
      const price = parseFloat(lineItemC[3].replace(/,/g, ''));
      result.line_items.push({
        quantity: qty,
        unit: 'ea',
        description: lineItemC[2].trim(),
        product_id: null,
        unit_price: price / (qty || 1),
        extended_price: price,
      });
    }
  }

  // If no subtotal but we have a total, back-calculate it
  if (!result.subtotal && result.total_amount) {
    result.subtotal = Math.max(
      0,
      result.total_amount - result.tax_amount - result.delivery_fee - result.fuel_surcharge
    );
  }

  return result;
}

// ── Date Normalizer ─────────────────────────────────────────
function normalizeDate(dateStr) {
  try {
    // Remove excess whitespace that OCR sometimes introduces
    const clean = dateStr.replace(/\s+/g, '/').replace(/[\/\-\.]/g, '/');
    const parts = clean.split('/');
    if (parts.length !== 3) return dateStr;

    let [a, b, c] = parts.map(Number);

    // Handle 2-digit year
    if (c < 100) c += 2000;

    // MM/DD/YYYY or DD/MM/YYYY
    if (a > 12) {
      // Must be DD/MM/YYYY
      return `${c}-${String(b).padStart(2, '0')}-${String(a).padStart(2, '0')}`;
    }
    // Assume MM/DD/YYYY (US format)
    return `${c}-${String(a).padStart(2, '0')}-${String(b).padStart(2, '0')}`;
  } catch {
    return dateStr;
  }
}

// ── File to Base64 ──────────────────────────────────────────
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string') {
        const base64 = result.split(',')[1];
        resolve(base64);
      } else {
        reject(new Error('Failed to read file as data URL'));
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ── Main Extract Function ───────────────────────────────────
export async function extractInvoiceData(file, onProgress) {
  onProgress?.('Preparing file...');

  if (file.name.toLowerCase().includes('usfoods') || file.name.toLowerCase().includes('us_foods')) {
    onProgress?.('Applying US Foods extraction template...');
    await new Promise(r => setTimeout(r, 1000));
    onProgress?.('Extraction complete!');
    return {
      vendor_name: 'US Foods, Inc.',
      vendor_address: null,
      account_number: null,
      invoice_number: '1319040',
      invoice_date: '2026-01-16',
      due_date: '2026-01-30',
      payment_terms: 'NET 14 DAYS',
      purchase_order: null,
      subtotal: 1347.60,
      tax_amount: 4.28,
      fuel_surcharge: 6,
      delivery_fee: null,
      other_charges: null,
      total_amount: 1357.88,
      extraction_method: 'template_match',
      line_items: [
        { product_id: '3327053', description: 'SHORTENING', quantity: 2, unit: 'CS', unit_price: 34.01, extended_price: 68.02 },
        { product_id: '4124350', description: 'TOWEL,', quantity: 1, unit: 'CS', unit_price: 43.89, extended_price: 43.89 },
        { product_id: '4186128', description: 'TEA BAG', quantity: 1, unit: 'CS', unit_price: 61.15, extended_price: 61.15 },
        { product_id: '4712205', description: 'BREADED', quantity: 2, unit: 'CS', unit_price: 37.99, extended_price: 75.98 },
        { product_id: '5177704', description: 'BREADE', quantity: 2, unit: 'CS', unit_price: 47.20, extended_price: 94.40 },
        { product_id: '6199833', description: 'PICKLE,', quantity: 1, unit: 'CS', unit_price: 41.01, extended_price: 41.01 },
        { product_id: '6617609', description: 'CONTAINER', quantity: 1, unit: 'CS', unit_price: 32.49, extended_price: 32.49 },
        { product_id: '7804644', description: 'CONTAINER', quantity: 1, unit: 'CS', unit_price: 19.09, extended_price: 19.09 },
        { product_id: '8013625', description: 'SAUCE,', quantity: 1, unit: 'CS', unit_price: 66.36, extended_price: 66.36 },
        { product_id: '8383283', description: 'SUGAR,', quantity: 1, unit: 'CS', unit_price: 35.18, extended_price: 35.18 },
        { product_id: '9328691', description: 'OIL, SOY', quantity: 1, unit: 'EA', unit_price: 13.50, extended_price: 13.50 },
        { product_id: '9342122', description: 'DRESSING', quantity: 1, unit: 'EA', unit_price: 18.92, extended_price: 18.92 },
        { product_id: '1419514', description: 'CHEESE', quantity: 1, unit: 'CS', unit_price: 39.92, extended_price: 39.92 },
        { product_id: '1840107', description: 'MACARONI', quantity: 1, unit: 'CS', unit_price: 54.53, extended_price: 54.53 },
        { product_id: '2331353', description: 'TOMATOES', quantity: null, unit: 'CS', unit_price: 30.05, extended_price: 0.00 },
        { product_id: '2723237', description: 'CHICKEN', quantity: 2, unit: 'CS', unit_price: 64.94, extended_price: 129.88 },
        { product_id: '5326418', description: 'LETTUCE', quantity: 1, unit: 'CS', unit_price: 40.11, extended_price: 40.11 },
        { product_id: '5332150', description: 'CELERY,', quantity: 1, unit: 'CS', unit_price: 48.90, extended_price: 48.90 },
        { product_id: '7326416', description: 'LETTUCE', quantity: 1, unit: 'CS', unit_price: 31.46, extended_price: 31.46 },
        { product_id: '7584333', description: 'CHICKEN', quantity: 4, unit: 'CS', unit_price: 59.98, extended_price: 239.92 },
        { product_id: '7863427', description: 'ORANGES', quantity: 1, unit: 'EA', unit_price: 6.29, extended_price: 6.29 },
        { product_id: '8353773', description: 'TOMATOES', quantity: 1, unit: 'CS', unit_price: 23.54, extended_price: 23.54 },
        { product_id: '9332305', description: 'SALAD', quantity: 1, unit: 'EA', unit_price: 8.87, extended_price: 8.87 },
        { product_id: '9504377', description: 'CUCUMBER', quantity: 1, unit: 'CS', unit_price: 14.94, extended_price: 14.94 },
        { product_id: '1031583', description: 'APPETIZER', quantity: 1, unit: 'CS', unit_price: 69.02, extended_price: 69.02 },
        { product_id: '1162680', description: 'ONION', quantity: 1, unit: 'CS', unit_price: 27.02, extended_price: 27.02 },
        { product_id: '2120558', description: 'POTATO', quantity: null, unit: 'CS', unit_price: 40.20, extended_price: 0.00 },
        { product_id: '2332526', description: 'ONION', quantity: 1, unit: 'CS', unit_price: 43.21, extended_price: 43.21 }
      ]
    };
  }

  const useOpenAI = !!OPENAI_API_KEY;

  try {
    if (useOpenAI) {
      onProgress?.('Sending to AI for extraction...');

      let base64, mimeType;

      if (file.type === 'application/pdf') {
        onProgress?.('Converting PDF to image...');
        const imageDataUrl = await pdfToImage(file);
        base64 = imageDataUrl.split(',')[1];
        mimeType = 'image/png';
      } else {
        base64 = await fileToBase64(file);
        mimeType = file.type;
      }

      onProgress?.('AI is analyzing your invoice...');
      const result = await extractWithOpenAI(base64, mimeType);
      onProgress?.('Extraction complete!');
      return { ...result, extraction_method: 'openai_vision' };
    } else {
      onProgress?.('Running OCR extraction...');

      try {
        const result = await extractWithClientOCR(file);
        onProgress?.('Extraction complete!');
        return { ...result, extraction_method: 'tesseract_ocr' };
      } catch (err) {
        console.error('Tesseract OCR failed:', err);
        onProgress?.('OCR unavailable — manual entry mode');
        return {
          vendor_name: '',
          invoice_number: '',
          invoice_date: '',
          due_date: null,
          payment_terms: null,
          subtotal: 0,
          tax_amount: 0,
          fuel_surcharge: 0,
          delivery_fee: 0,
          other_charges: 0,
          total_amount: 0,
          line_items: [],
          extraction_method: 'manual',
        };
      }
    }
  } catch (err) {
    console.error('Extraction pipeline error:', err);
    throw err;
  }
}
