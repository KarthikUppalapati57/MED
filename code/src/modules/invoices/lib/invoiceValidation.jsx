import React from 'react';
import { api } from '@/lib/apiClient';

const PASS = { status: 'pass', message: '' };

// Explicit org/brand/location scope for the invoice being checked - never the
// caller's currently-active ContextSwitcher scope. Without this, a branch_manager
// validating an invoice outside their active context silently compares against
// the wrong location's data (withActiveScope() falls back to ambient context
// for any key not already present in the filter conditions).
function invoiceScope(invoice) {
  const scope = {};
  if (invoice?.organization_id) scope.organization_id = invoice.organization_id;
  if (invoice?.brand_id) scope.brand_id = invoice.brand_id;
  if (invoice?.location_id) scope.location_id = invoice.location_id;
  return scope;
}

async function checkDuplicate(invoice) {
  if (!invoice?.invoice_number || !invoice?.vendor_name) return PASS;
  try {
    const existing = await api.entities.Invoice.filter({
      invoice_number: invoice.invoice_number,
      vendor_name: invoice.vendor_name,
      ...invoiceScope(invoice),
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

// Line-item math vs invoice totals, computed client-side. Deliberately NOT the
// validate_invoice() RPC: that function persists its result (UPDATE ... SET
// validation_results, updated_at) on every call, which re-fires the unfiltered
// trg_invoices_webhook - meaning just opening the confirm dialog (even if the
// user cancels) silently wrote to the invoice and re-invoked extraction. A
// read-only check has no business writing to the row it's checking.
async function checkInvoiceMath(invoice) {
  if (!invoice?.id) return PASS;
  try {
    const lines = await api.entities.InvoiceLineItem.filter(
      { invoice_id: invoice.id, ...invoiceScope(invoice) }
    );
    const discrepancies = [];
    let lineSum = 0;
    for (const line of lines) {
      const expected = (Number(line.quantity) || 0) * (Number(line.unit_price) || 0);
      const got = Number(line.total_price) || 0;
      lineSum += got;
      if (Math.abs(expected - got) >= 0.01) {
        discrepancies.push(`line total: expected $${expected.toFixed(2)}, got $${got.toFixed(2)}`);
      }
    }

    const subtotal = Number(invoice.subtotal) || 0;
    if (lines.length > 0 && Math.abs(lineSum - subtotal) >= 0.01) {
      discrepancies.push(`subtotal: expected $${lineSum.toFixed(2)}, got $${subtotal.toFixed(2)}`);
    }

    const expectedTotal = subtotal
      + (Number(invoice.tax_amount) || 0)
      + (Number(invoice.fuel_surcharge) || 0)
      + (Number(invoice.delivery_fee) || 0)
      + (Number(invoice.other_charges) || 0);
    const totalAmount = Number(invoice.total_amount) || 0;
    if (Math.abs(expectedTotal - totalAmount) >= 0.01) {
      discrepancies.push(`total: expected $${expectedTotal.toFixed(2)}, got $${totalAmount.toFixed(2)}`);
    }

    if (discrepancies.length === 0) return PASS;
    return { status: 'fail', message: `Line items don't reconcile with the invoice total (${discrepancies.join('; ')}).` };
  } catch (e) {
    console.error('[Validation] Invoice math check error:', e);
    return { status: 'warning', message: 'Could not verify line-item math.' };
  }
}

// Vendor stand-in for "fraud detection" - a blacklisted/suspended vendor is the
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
      { vendor_id: invoice.vendor_id, status: 'approved', ...invoiceScope(invoice) },
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

// Three-way match: reads real reconciliation_variances rows produced by the
// reconcile_invoice_lines() RPC.
async function checkDeliveryMatch(invoice) {
  if (!invoice?.id) return PASS;
  try {
    const variances = await api.entities.ReconciliationVariance.filter({
      invoice_id: invoice.id,
      is_resolved: false,
      ...invoiceScope(invoice),
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
    .map(r => `${r.status === 'fail' ? 'Error:' : 'Warning:'} ${r.message}`);
}

// Shared approve gate: always surfaces the validation outcome (clean or not)
// before approving, via the caller's own useConfirm() instance. Used by both
// the invoice editor and the Payments page so approving from either place goes
// through the same checks instead of two different opinions of what's safe.
export async function runApprovalGate(confirm, invoice) {
  const results = await runInvoiceValidationChecks(invoice);
  const issues = summarizeValidationIssues(results);
  const clean = issues.length === 0;
  return confirm({
    title: clean ? 'All validation checks passed' : `Validation found ${issues.length} issue(s)`,
    description: clean ? (
      'Duplicate check, line-item math, vendor status, price deviation, and three-way match all came back clean.'
    ) : (
      <>
        {issues.map((line, i) => (
          <React.Fragment key={i}>
            {line}
            <br />
          </React.Fragment>
        ))}
      </>
    ),
    confirmLabel: 'Approve',
    destructive: !clean,
  });
}

export async function runBatchApprovalGate(confirm, selected) {
  const perInvoice = await Promise.all(selected.map(async (inv) => ({
    inv,
    issues: summarizeValidationIssues(await runInvoiceValidationChecks(inv)),
  })));
  const withIssues = perInvoice.filter(r => r.issues.length > 0);
  const clean = withIssues.length === 0;
  return confirm({
    title: clean
      ? `All ${selected.length} invoice(s) passed validation`
      : `${withIssues.length} of ${selected.length} invoice(s) have validation issues`,
    description: clean ? (
      'Duplicate check, line-item math, vendor status, price deviation, and three-way match all came back clean for every selected invoice.'
    ) : (
      <>
        {withIssues.map(({ inv, issues }) => (
          <React.Fragment key={inv.id}>
            <strong>{inv.vendor_name || 'Unknown vendor'} #{inv.invoice_number || inv.id}</strong>
            <br />
            {issues.join(' Â· ')}
            <br />
            <br />
          </React.Fragment>
        ))}
      </>
    ),
    confirmLabel: 'Approve all',
    destructive: !clean,
  });
}
