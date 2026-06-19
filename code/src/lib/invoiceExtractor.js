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

const moneyZeroPattern = '(?:\\$\\s*)?(?:0|0\\.00|\\.00)';

export function detectPaidInvoiceStatus(invoiceData = {}) {
  const rawText = String(invoiceData.raw_text || '');
  const fieldsText = [
    invoiceData.payment_terms,
    invoiceData.notes,
    invoiceData.status,
    invoiceData.payment_status,
    invoiceData.balance_due,
    invoiceData.amount_due,
  ].filter(Boolean).join(' ');
  const text = `${rawText}\n${fieldsText}`.replace(/\s+/g, ' ').toUpperCase();

  const strongPatterns = [
    /\bPAID\s+IN\s+FULL\b/,
    /\bPAYMENT\s+(?:RECEIVED|APPLIED|POSTED|PROCESSED)\b/,
    /\bPAID\s+STAMP\b/,
    new RegExp(`\\b(?:BALANCE|AMOUNT)\\s+DUE\\s*[:#-]?\\s*${moneyZeroPattern}\\b`, 'i'),
    new RegExp(`\\bTOTAL\\s+DUE\\s*[:#-]?\\s*${moneyZeroPattern}\\b`, 'i'),
    new RegExp(`\\bBALANCE\\s*[:#-]?\\s*${moneyZeroPattern}\\b`, 'i'),
  ];

  const mediumPatterns = [
    /\bPAID\b/,
    /\bZERO\s+BALANCE\b/,
    /\bNO\s+BALANCE\s+DUE\b/,
    /\bCREDIT\s+CARD\s+PAYMENT\b/,
    /\bACH\s+PAYMENT\b/,
  ];

  const negativePatterns = [
    /\bNOT\s+PAID\b/,
    /\bUNPAID\b/,
    /\bPAST\s+DUE\b/,
    /\bPAYMENT\s+DUE\b/,
    /\bPLEASE\s+PAY\b/,
  ];

  const negativeMatches = negativePatterns.filter((pattern) => pattern.test(text)).map((pattern) => pattern.source);
  const strongMatches = strongPatterns.filter((pattern) => pattern.test(text)).map((pattern) => pattern.source);
  const mediumMatches = mediumPatterns.filter((pattern) => pattern.test(text)).map((pattern) => pattern.source);

  let confidence = 'none';
  let shouldMarkPaid = false;

  if (strongMatches.length > 0 && negativeMatches.length === 0) {
    confidence = 'high';
    shouldMarkPaid = true;
  } else if (mediumMatches.length > 0 && negativeMatches.length === 0) {
    confidence = 'medium';
  } else if (negativeMatches.length > 0) {
    confidence = 'blocked';
  }

  return {
    detected: strongMatches.length > 0 || mediumMatches.length > 0,
    should_mark_paid: shouldMarkPaid,
    confidence,
    matched_signals: [...strongMatches, ...mediumMatches],
    blocking_signals: negativeMatches,
    reviewed_by_user: false,
  };
}

/**
 * Main extraction entry point.
 * Sends the file to the Supabase Edge Function and returns structured invoice data.
 *
 * @param {File} file - The invoice file (PDF, PNG, JPG, etc.)
 * @param {(msg: string) => void} [onProgress] - Optional progress callback
 * @returns {Promise<Object>} Extracted invoice data
 */
export async function extractInvoiceData(file, onProgress) {
  console.log('[extractInvoiceData] Started extraction process for file:', file?.name);
  onProgress?.('Preparing file for upload...');

  try {
    // Build multipart form data
    const formData = new FormData();
    formData.append('file', file);

    console.log('[extractInvoiceData] Checking session...');
    let accessToken = null;
    
    try {
      // Prevent getSession from hanging indefinitely (known Supabase lock issue)
      const sessionPromise = supabase.auth.getSession();
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Auth timeout')), 3000));
      const result = await Promise.race([sessionPromise, timeoutPromise]);
      accessToken = result?.data?.session?.access_token;
      console.log('[extractInvoiceData] Session retrieved safely.');
    } catch (authError) {
      console.warn('[extractInvoiceData] Warning: Could not get local session (may have timed out). Proceeding with anon key.', authError);
    }
    
    const headers = {
      'apikey': SUPABASE_ANON_KEY,
    };

    // Add Authorization header: use user's JWT if available; otherwise, fallback to the anon key.
    // The Supabase Edge Function Gateway requires a Bearer token in all requests.
    headers['Authorization'] = `Bearer ${accessToken || SUPABASE_ANON_KEY}`;

    console.log('[extractInvoiceData] Getting ready to call Edge Function...');
    onProgress?.('Sending to Gemini AI for extraction...');

    // 130 second client-side timeout (server has 150s limit)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      console.warn('[extractInvoiceData] Client-side fetch timeout triggered.');
      controller.abort();
    }, 130000);

    let response;
    console.log('[extractInvoiceData] Calling fetch on:', EXTRACT_INVOICE_URL);
    try {
      response = await fetch(EXTRACT_INVOICE_URL, {
        method: 'POST',
        headers,
        body: formData,
        signal: controller.signal,
      });
      console.log('[extractInvoiceData] Fetch returned response with status:', response.status);
    } catch (fetchErr) {
      console.error('[extractInvoiceData] Fetch threw an error:', fetchErr);
      clearTimeout(timeoutId);
      if (fetchErr.name === 'AbortError') {
        throw new Error('Extraction timed out. The file may be too large or complex. Please try a smaller file or a single-page image.');
      }
      throw fetchErr;
    }
    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error('[extractInvoiceData] Server returned non-ok status.', response.status);
      const errorData = await response.json().catch(() => ({}));
      const errorMsg = errorData.error || errorData.detail || `Server error: ${response.status}`;
      throw new Error(errorMsg);
    }

    onProgress?.('Processing extracted data...');

    const result = await response.json();

    onProgress?.('Extraction complete!');

    const extractedInvoice = {
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
      line_items: (result.line_items || []).map(item => ({
        vendor_item_code: item.vendor_item_code || '',
        description: item.description || '',
        quantity: item.quantity || 0,
        unit: item.unit || 'ea',
        unit_price: item.unit_price || 0,
        discount: item.discount || 0,
        adjustment: item.adjustment || 0,
        extended_price: item.extended_price || 0,
      })),
      extraction_method: result.extraction_method || 'gemini',
      raw_text: result.raw_text || '',
    };

    const paidStatusDetection = detectPaidInvoiceStatus(extractedInvoice);

    return {
      ...extractedInvoice,
      paid_status_detection: paidStatusDetection,
      payment_status: paidStatusDetection.should_mark_paid ? 'paid' : (result.payment_status || 'unpaid'),
    };
  } catch (err) {
    console.error('Invoice extraction error:', err);
    throw err;
  }
}
