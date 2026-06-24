import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

describe('Payment routing regression contract', () => {
  it('keeps paid invoice approvals out of payable queue navigation', () => {
    const invoicesSource = read('src/pages/Invoices.jsx');
    const paymentsSource = read('src/pages/Payments.jsx');
    const legacyRedirectSource = read('src/lib/LegacyRedirectHandler.jsx');

    expect(invoicesSource).toContain('navigate(`/Payments/history?invoice=${invoice.id}`)');
    expect(invoicesSource).toContain('Paid invoice approved and recorded in Payment History');
    expect(invoicesSource).not.toContain('Paid invoice approved and sent to Bill Pay');

    expect(paymentsSource).toContain("const queryTab = queryParams.get('tab')");
    expect(paymentsSource).toContain("const activeTab = currentSubPath || queryTab || 'invoices'");
    expect(legacyRedirectSource).toContain("'/Payments:history': '/Payments/history'");
    expect(legacyRedirectSource).toContain("'/Payments:payment-history': '/Payments/history'");
  });

  it('guards payment RPCs from paid, overpaid, and non-payments-routed invoices', () => {
    const migration = read('supabase/migrations/20260624000012_payment_routing_guardrails.sql');

    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.schedule_invoice_payment');
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.record_invoice_payment');
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.schedule_payment_batch');

    expect(migration.match(/COALESCE\(v_invoice\.ap_routing_destination, 'payments'\) <> 'payments'/g)).toHaveLength(3);
    expect(migration).toContain("Paid invoices cannot be scheduled for payment");
    expect(migration).toContain("Paid invoices cannot receive another payment");
    expect(migration).toContain("Paid invoice % cannot be scheduled");
    expect(migration).toContain('Payment amount % exceeds remaining balance %');
    expect(migration).toContain('Payment reference is required');
    expect(migration).toContain("v_invoice.status NOT IN ('approved', 'scheduled', 'partially_paid')");
  });
});