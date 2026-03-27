/**
 * Invoice Extraction Service
 *
 * Sends documents to the Supabase Edge Function for extraction.
 * The Edge Function uses Gemini for structured extraction.
 */

import { supabase } from '@/lib/supabaseClient';

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

    // Get the user's JWT for authenticated requests
    const { data: { session } } = await supabase.auth.getSession();
    const accessToken = session?.access_token;

    const headers = {
      'apikey': SUPABASE_ANON_KEY,
    };

    // Add Authorization header if user is authenticated
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    onProgress?.('Sending to AI for extraction...');

    // 130 second client-side timeout (server has 150s limit)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 130000);

    let response;
    try {
      response = await fetch(EXTRACT_INVOICE_URL, {
        method: 'POST',
        headers,
        body: formData,
        signal: controller.signal,
      });
    } catch (fetchErr) {
      clearTimeout(timeoutId);
      if (fetchErr.name === 'AbortError') {
        throw new Error('Extraction timed out. The file may be too large or complex. Please try a smaller file or a single-page image.');
      }
      throw fetchErr;
    }
    clearTimeout(timeoutId);

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
      extraction_method: result.extraction_method || 'gemini',
      raw_text: result.raw_text || '',
    };
  } catch (err) {
    console.error('Invoice extraction error:', err);
    throw err;
  }
}
