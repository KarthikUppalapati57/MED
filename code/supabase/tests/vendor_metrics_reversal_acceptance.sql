-- Acceptance test for update_vendor_metrics_on_invoice reverse-path fix
-- (20260715000001_vendor_module_hardening.sql). Seeds an org/vendor, approves an
-- invoice, reverts it, and asserts vendors.total_spent/unpaid_ap return to zero.
BEGIN;

DO $$
DECLARE
  v_tenant uuid := gen_random_uuid();
  v_org uuid := gen_random_uuid();
  v_brand uuid := gen_random_uuid();
  v_location uuid := gen_random_uuid();
  v_vendor uuid := gen_random_uuid();
  v_invoice uuid := gen_random_uuid();
  v_spent numeric;
  v_ap numeric;
BEGIN
  -- enforce_invoice_approval_authorization() now gates every write that sets
  -- status/ap_status='approved' (added by 20260628000005, after this test was written) and
  -- raises "Not authenticated" with no JWT claims set at all, which this test never sets since
  -- it's testing the metrics trigger, not approval authorization. auth.role() reads
  -- request.jwt.claim.role specifically (not the actual session role), so SET LOCAL ROLE alone
  -- doesn't satisfy the assert function's service_role bypass -- the JWT claim needs setting too.
  -- trg_invoices_webhook (invoke_edge_function) fires on every invoice insert/update and hard-
  -- fails without a configured service_role_key (CLAUDE.md notes it's unfiltered -- fires on
  -- every update, not just relevant ones -- but that's tracked separately; this test just needs
  -- webhook dispatch configured, like a real deployment would have it, not disabled). The
  -- private schema isn't even service_role-accessible, so this has to happen before switching.
  INSERT INTO private.workflow_runtime_settings (setting_name, setting_value)
  VALUES ('service_role_key', 'local-test-fake-service-role-key')
  ON CONFLICT (setting_name) DO UPDATE SET setting_value = EXCLUDED.setting_value;

  SET LOCAL ROLE service_role;
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);

  -- invoices.tenant_id is auto-populated from organizations.tenant_id (sync_tenant_id_from_organization)
  -- and is itself NOT NULL, so the org needs a real tenant, not just a blank tenant_id.
  INSERT INTO public.tenants (id, name, slug)
  VALUES (v_tenant, 'Metrics Reversal Test Tenant', 'metrics-reversal-tenant-' || replace(v_tenant::text, '-', ''));

  INSERT INTO public.organizations (id, name, slug, tenant_id)
  VALUES (v_org, 'Metrics Reversal Test Org', 'metrics-reversal-' || replace(v_org::text, '-', ''), v_tenant);

  -- organization_id/brand_id/location_id are all NOT NULL on invoices now (the "black-hole bug"
  -- fix, after this test was written) -- vendors itself still has no such requirement.
  INSERT INTO public.brands (brand_id, organization_id, name)
  VALUES (v_brand, v_org, 'Metrics Reversal Test Brand');

  INSERT INTO public.locations (id, organization_id, brand_id, name)
  VALUES (v_location, v_org, v_brand, 'Metrics Reversal Test Location');

  INSERT INTO public.vendors (id, organization_id, name, status)
  VALUES (v_vendor, v_org, 'Reversal Test Vendor', 'active');

  -- Approve a $500 invoice: total_spent and unpaid_ap should both go to 500.
  INSERT INTO public.invoices (id, organization_id, brand_id, location_id, vendor_id, vendor_name, invoice_number, total_amount, status, payment_status)
  VALUES (v_invoice, v_org, v_brand, v_location, v_vendor, 'Reversal Test Vendor', 'INV-REV-1', 500.00, 'approved', 'unpaid');

  SELECT total_spent, unpaid_ap INTO v_spent, v_ap FROM public.vendors WHERE id = v_vendor;
  ASSERT v_spent = 500.00, format('expected total_spent=500 after approval, got %s', v_spent);
  ASSERT v_ap = 500.00, format('expected unpaid_ap=500 after approval, got %s', v_ap);

  -- Revert the invoice out of approved (e.g. flagged for review): both figures should reverse.
  UPDATE public.invoices SET status = 'rejected', ap_status = 'rejected' WHERE id = v_invoice;

  SELECT total_spent, unpaid_ap INTO v_spent, v_ap FROM public.vendors WHERE id = v_vendor;
  ASSERT v_spent = 0.00, format('expected total_spent=0 after reverting approval, got %s', v_spent);
  ASSERT v_ap = 0.00, format('expected unpaid_ap=0 after reverting approval, got %s', v_ap);

  -- Re-approve, then pay it off: total_spent/unpaid_ap should both settle at 0
  -- (paid invoices don't double-subtract unpaid_ap on delete).
  UPDATE public.invoices SET status = 'approved' WHERE id = v_invoice;
  UPDATE public.invoices SET payment_status = 'paid' WHERE id = v_invoice;

  SELECT total_spent, unpaid_ap INTO v_spent, v_ap FROM public.vendors WHERE id = v_vendor;
  ASSERT v_spent = 500.00, format('expected total_spent=500 after re-approval, got %s', v_spent);
  ASSERT v_ap = 0.00, format('expected unpaid_ap=0 after payment, got %s', v_ap);

  RAISE NOTICE 'vendor_metrics_reversal_acceptance: PASSED';
END $$;

ROLLBACK;
