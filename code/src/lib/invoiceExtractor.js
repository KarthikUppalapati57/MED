/**
 * Invoice Extraction Service
 *
 * Sends documents to the Supabase Edge Function for extraction.
 * The Edge Function uses OpenAI Vision (GPT-4o) for structured extraction.
 */

// @ts-ignore
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
// @ts-ignore
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const EXTRACT_INVOICE_URL = `${SUPABASE_URL}/functions/v1/extract-invoice`;

/**
 * Main extraction entry point.
 * Sends the file to the Supabase Edge Function and returns structured invoice data.
 *
 * @param {File} file - The invoice file (PDF, PNG, JPG, etc.)
 * @param {(msg: string) => void} [onProgress] - Optional progress callback
 * @returns {Promise<Object>} Extracted invoice data
 */
export async function extractInvoiceData(file, onProgress) {
  onProgress?.('Preparing file for upload...');

  try {
    // Build multipart form data
    const formData = new FormData();
    formData.append('file', file);

    onProgress?.('Sending to Docling AI for extraction...');

    const response = await fetch(EXTRACT_INVOICE_URL, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMsg = errorData.error || errorData.detail || `Server error: ${response.status}`;
      throw new Error(errorMsg);
    }

    onProgress?.('Processing extracted data...');

    const result = await response.json();

    onProgress?.('Extraction complete!');

    return {
      vendor_name: result.vendor_name || '',
      vendor_address: result.vendor_address || null,
      account_number: result.account_number || null,
      invoice_number: result.invoice_number || '',
      invoice_date: result.invoice_date || '',
      due_date: result.due_date || null,
      payment_terms: result.payment_terms || null,
      purchase_order: result.purchase_order || null,
      subtotal: result.subtotal || 0,
      tax_amount: result.tax_amount || 0,
      fuel_surcharge: result.fuel_surcharge || 0,
      delivery_fee: result.delivery_fee || 0,
      other_charges: result.other_charges || 0,
      total_amount: result.total_amount || 0,
      line_items: result.line_items || [],
      extraction_method: result.extraction_method || 'docling',
      raw_text: result.raw_text || '',
    };
  } catch (err) {
    console.error('Invoice extraction error:', err);
    throw err;
  }
}
