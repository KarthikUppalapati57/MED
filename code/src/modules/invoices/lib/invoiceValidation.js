import { api } from '@/lib/apiClient';

const PASS = { status: 'pass', message: '' };

async function checkDuplicate(invoice) {
  if (!invoice?.invoice_number || !invoice?.vendor_name) return PASS;
  try {
    const existing = await api.entities.Invoice.filter({
      invoice_number: invoice.invoice_number,
      vendor_name: invoice.vendor_name,
    });
    const isDuplicate = existing.some(e => e.id !== invoice.id);
    return isDuplicate
      ? { status: 'fail', message: `Invoice #${invoice.invoice_number} from ${invoice.vendor_name} already exists.` }
      : PASS;
  } catch (e) {
    console.error('[Validation] Duplicate check error:', e);
    return { status: 'warning', message: 'Could not check for duplicate invoices.' };
  }
}

// Line-item math vs invoice totals — the DB is the source of truth (validate_invoice RPC).
async function checkInvoiceMath(invoice) {
  if (!invoice?.id) return PASS;
  try {
    const { data, error } = await api.client.rpc('validate_invoice', { p_invoice_id: invoice.id });
    if (error) throw error;
    if (data?.line_math === 'fail' || data?.total_math === 'fail') {
      const detail = (data.discrepancies || [])
        .map(d => `${d.field ?? 'line'}: expected $${d.expected}, got $${d.got}`)
        .join('; ');
      return { status: 'fail', message: `Line items don't reconcile with the invoice total${detail ? ` (${detail})` : ''}.` };
    }
    return PASS;
  } catch (e) {
    console.error('[Validation] Invoice math check error:', e);
    return { status: 'warning', message: 'Could not verify line-item math.' };
  }
}

// Vendor stand-in for "fraud detection" — a blacklisted/suspended vendor is the
// one signal we actually have data for; a hardcoded pass was theater, not a check.
async function checkVendorRisk(invoice) {
  if (!invoice?.vendor_id) return { status: 'warning', message: 'Invoice is not linked to a vendor record.' };
  try {
    const vendor = await api.entities.Vendor.get(invoice.vendor_id);
    if (vendor.status === 'blacklisted' || ['suspended', 'rejected'].includes(vendor.approval_status)) {
      return { status: 'fail', message: `Vendor "${vendor.name}" is ${vendor.status === 'blacklisted' ? 'blacklisted' : vendor.approval_status}.` };
    }
    if (vendor.status === 'inactive') {
      return { status: 'warning', message: `Vendor "${vendor.name}" is marked inactive.` };
    }
    if (vendor.approval_status && vendor.approval_status !== 'approved') {
      return { status: 'warning', message: `Vendor "${vendor.name}" is not fully approved yet (${vendor.approval_status}).` };
    }
    return PASS;
  } catch (e) {
    console.error('[Validation] Vendor risk check error:', e);
    return { status: 'warning', message: 'Could not verify vendor status.' };
  }
}

// Compares against this vendor's own recent approved invoices instead of a flat
// dollar threshold, so the same $6k invoice reads differently for different vendors.
async function checkPriceDeviation(invoice) {
  const amount = Number(invoice?.total_amount) || 0;
  const flatFallback = amount > 5000
    ? { status: 'warning', message: `Amount ($${amount.toLocaleString()}) is unusually high.` }
    : PASS;

  if (!invoice?.vendor_id) return flatFallback;

  try {
    const history = await api.entities.Invoice.filter(
      { vendor_id: invoice.vendor_id, status: 'approved' },
      { orderBy: '-approved_date', limit: 10 }
    );
    const priorAmounts = history.filter(h => h.id !== invoice.id).map(h => Number(h.total_amount) || 0);
    if (priorAmounts.length === 0) return flatFallback;

    const avg = priorAmounts.reduce((a, b) => a + b, 0) / priorAmounts.length;
    if (avg > 0 && amount > avg * 1.5) {
      const pctOver = Math.round((amount / avg - 1) * 100);
      return {
        status: 'warning',
        message: `Amount ($${amount.toLocaleString()}) is ${pctOver}% above this vendor's recent average ($${avg.toLocaleString(undefined, { maximumFractionDigits: 0 })}).`,
      };
    }
    return PASS;
  } catch (e) {
    console.error('[Validation] Price deviation check error:', e);
    return { status: 'warning', message: 'Could not compare against vendor history.' };
  }
}

// Three-way match: reads real reconciliation_variances rows. Only as good as
// reconcile_invoice_lines() upstream, which is still a stub — flagged separately.
async function checkDeliveryMatch(invoice) {
  if (!invoice?.id) return PASS;
  try {
    const variances = await api.entities.ReconciliationVariance.filter({
      invoice_id: invoice.id,
      is_resolved: false,
    });
    if (variances.length > 0) {
      const types = [...new Set(variances.map(v => v.variance_type))].join(', ');
      return { status: 'fail', message: `Unresolved reconciliation variance(s): ${types}.` };
    }
    return PASS;
  } catch (e) {
    console.error('[Validation] Delivery match check error:', e);
    return { status: 'warning', message: 'Could not check three-way match status.' };
  }
}

export const VALIDATION_CHECK_LABELS = {
  duplicate_check: 'Duplicate Check',
  invoice_math: 'Line Item Math',
  vendor_risk: 'Vendor Risk',
  price_deviation: 'Price Deviation',
  delivery_match: 'Delivery / Three-Way Match',
};

export async function runInvoiceValidationChecks(invoice) {
  const [duplicate_check, invoice_math, vendor_risk, price_deviation, delivery_match] = await Promise.all([
    checkDuplicate(invoice),
    checkInvoiceMath(invoice),
    checkVendorRisk(invoice),
    checkPriceDeviation(invoice),
    checkDeliveryMatch(invoice),
  ]);
  return { duplicate_check, invoice_math, vendor_risk, price_deviation, delivery_match };
}

export function summarizeValidationIssues(results) {
  return Object.values(results)
    .filter(r => r.status !== 'pass' && r.message)
    .map(r => `${r.status === 'fail' ? '✗' : '⚠'} ${r.message}`);
}

// Warn-and-confirm, never block: returns true if the caller should proceed.
export async function confirmApprovalWithValidation(invoice) {
  const results = await runInvoiceValidationChecks(invoice);
  const issues = summarizeValidationIssues(results);
  if (issues.length === 0) return true;
  return window.confirm(
    `Validation found the following issue(s) with this invoice:\n\n${issues.join('\n')}\n\nApprove anyway?`
  );
}
