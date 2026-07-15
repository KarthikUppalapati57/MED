-- Acceptance test for update_vendor_metrics_on_invoice reverse-path fix
-- (20260715000001_vendor_module_hardening.sql). Seeds an org/vendor, approves an
-- invoice, reverts it, and asserts vendors.total_spent/unpaid_ap return to zero.
BEGIN;

DO $$
DECLARE
  v_org uuid := gen_random_uuid();
  v_vendor uuid := gen_random_uuid();
  v_invoice uuid := gen_random_uuid();
  v_spent numeric;
  v_ap numeric;
BEGIN
  INSERT INTO public.organizations (id, name, slug)
  VALUES (v_org, 'Metrics Reversal Test Org', 'metrics-reversal-' || replace(v_org::text, '-', ''));

  INSERT INTO public.vendors (id, organization_id, name, status)
  VALUES (v_vendor, v_org, 'Reversal Test Vendor', 'active');

  -- Approve a $500 invoice: total_spent and unpaid_ap should both go to 500.
  INSERT INTO public.invoices (id, organization_id, vendor_id, vendor_name, invoice_number, total_amount, status, payment_status)
  VALUES (v_invoice, v_org, v_vendor, 'Reversal Test Vendor', 'INV-REV-1', 500.00, 'approved', 'unpaid');

  SELECT total_spent, unpaid_ap INTO v_spent, v_ap FROM public.vendors WHERE id = v_vendor;
  ASSERT v_spent = 500.00, format('expected total_spent=500 after approval, got %s', v_spent);
  ASSERT v_ap = 500.00, format('expected unpaid_ap=500 after approval, got %s', v_ap);

  -- Revert the invoice out of approved (e.g. flagged for review): both figures should reverse.
  UPDATE public.invoices SET status = 'flagged' WHERE id = v_invoice;

  SELECT total_spent, unpaid_ap INTO v_spent, v_ap FROM public.vendors WHERE id = v_vendor;
  ASSERT v_spent = 0.00, format('expected total_spent=0 after reverting approval, got %s', v_spent);
  ASSERT v_ap = 0.00, format('expected unpaid_ap=0 after reverting approval, got %s', v_ap);

  -- Re-approve, then pay it off, then soft-delete: total_spent/unpaid_ap should both settle at 0
  -- (paid invoices don't double-subtract unpaid_ap on delete).
  UPDATE public.invoices SET status = 'approved' WHERE id = v_invoice;
  UPDATE public.invoices SET payment_status = 'paid' WHERE id = v_invoice;

  SELECT total_spent, unpaid_ap INTO v_spent, v_ap FROM public.vendors WHERE id = v_vendor;
  ASSERT v_spent = 500.00, format('expected total_spent=500 after re-approval, got %s', v_spent);
  ASSERT v_ap = 0.00, format('expected unpaid_ap=0 after payment, got %s', v_ap);

  UPDATE public.invoices SET deleted_at = now() WHERE id = v_invoice;

  SELECT total_spent, unpaid_ap INTO v_spent, v_ap FROM public.vendors WHERE id = v_vendor;
  ASSERT v_spent = 0.00, format('expected total_spent=0 after soft-delete of paid invoice, got %s', v_spent);
  ASSERT v_ap = 0.00, format('expected unpaid_ap=0 after soft-delete of paid invoice, got %s', v_ap);

  RAISE NOTICE 'vendor_metrics_reversal_acceptance: PASSED';
END $$;

ROLLBACK;
