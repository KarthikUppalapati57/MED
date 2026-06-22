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
 * // The extractInvoiceData function has been deprecated and removed.
// All invoice extraction now happens securely and asynchronously on the server-side via
// the 'invoice-processing' Edge Function responding to database inserts.
 */
