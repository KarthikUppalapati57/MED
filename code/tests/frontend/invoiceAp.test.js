import { describe, expect, it } from 'vitest';
import { isInvoicePaymentReady } from '../../src/lib/invoiceAp';

describe('isInvoicePaymentReady', () => {
  it('treats AP-approved invoices as payable even when coarse status lags', () => {
    expect(isInvoicePaymentReady({
      status: 'pending_review',
      ap_status: 'approved',
      payment_status: 'unpaid',
      paid_amount: 0,
      total_amount: 125,
    })).toBe(true);
  });

  it('blocks rejected and fully paid invoices', () => {
    expect(isInvoicePaymentReady({
      status: 'rejected',
      ap_status: 'rejected',
      payment_status: 'unpaid',
      paid_amount: 0,
      total_amount: 125,
    })).toBe(false);

    expect(isInvoicePaymentReady({
      status: 'approved',
      ap_status: 'approved',
      payment_status: 'paid',
      paid_amount: 125,
      total_amount: 125,
    })).toBe(false);
  });

  it('keeps partially paid invoices ready for the remaining balance', () => {
    expect(isInvoicePaymentReady({
      status: 'partially_paid',
      ap_status: 'approved',
      payment_status: 'partial',
      paid_amount: 50,
      total_amount: 125,
    })).toBe(true);
  });
});