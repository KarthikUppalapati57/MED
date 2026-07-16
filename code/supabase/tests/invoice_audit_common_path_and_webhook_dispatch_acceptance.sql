-- Acceptance test for 20260719000015_invoice_audit_common_path_and_webhook_dispatch.sql
--
-- Verifies (9.9): log_invoice_audit_event still writes invoice_audit_events unconditionally
-- (unchanged, InvoiceAuditLog.jsx depends on it), AND additionally mirrors into the common
-- audit_logs ledger via log_audit_event when an authenticated actor context is present. Also
-- proves the mirror is best-effort: a direct-SQL/no-JWT context (assert_org_actor has nothing
-- to authenticate) must NOT block the invoice status update itself.
--
-- Verifies (9.10): an insert into audit_logs is queued onto webhook_events_queue for an org's
-- subscribed webhook endpoint, reusing the existing queue_webhook_event()/webhook_endpoints/
-- webhook_subscriptions infrastructure -- no new dispatch machinery.

BEGIN;

INSERT INTO private.workflow_runtime_settings (setting_name, setting_value, updated_at)
VALUES ('service_role_key', 'rollback-test-service-role-key', now())
ON CONFLICT (setting_name) DO UPDATE
   SET setting_value = EXCLUDED.setting_value,
       updated_at = now();

CREATE TEMP TABLE iacp_ids (
  key text PRIMARY KEY,
  value uuid NOT NULL
) ON COMMIT DROP;

CREATE TEMP TABLE iacp_results (
  test_name text PRIMARY KEY,
  passed boolean NOT NULL,
  detail text
) ON COMMIT DROP;

GRANT SELECT, INSERT, UPDATE, DELETE ON iacp_ids TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON iacp_results TO authenticated;

DO $$
DECLARE
  v_org uuid := gen_random_uuid();
  v_org_manager uuid := gen_random_uuid();
  v_invoice_direct uuid;
  v_invoice_authed uuid;
  v_endpoint uuid;
BEGIN
  INSERT INTO iacp_ids(key, value) VALUES ('org', v_org), ('org_manager', v_org_manager);

  INSERT INTO public.organizations (id, name, slug) VALUES (v_org, 'IACP Org', 'iacp-org-' || v_org);

  INSERT INTO auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES
    (v_org_manager, 'authenticated', 'authenticated', 'iacp-org-manager@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

  INSERT INTO public.profiles (id, email, full_name, role, status, organization_id, invoice_approval_limit)
  VALUES (v_org_manager, 'iacp-org-manager@example.test', 'IACP Org Manager', 'org_manager', 'active', v_org, 1000000)
  ON CONFLICT (id) DO UPDATE SET organization_id = EXCLUDED.organization_id, role = EXCLUDED.role;

  INSERT INTO public.invoices (organization_id, vendor_name, invoice_number, total_amount, status)
  VALUES (v_org, 'IACP Vendor', 'IACP-INV-DIRECT', 42, 'pending_review')
  RETURNING id INTO v_invoice_direct;

  INSERT INTO public.invoices (organization_id, vendor_name, invoice_number, total_amount, status)
  VALUES (v_org, 'IACP Vendor', 'IACP-INV-AUTHED', 42, 'pending_review')
  RETURNING id INTO v_invoice_authed;

  INSERT INTO iacp_ids(key, value) VALUES ('invoice_direct', v_invoice_direct), ('invoice_authed', v_invoice_authed);

  -- webhook endpoint subscribed to audit_logs.insert for this org
  INSERT INTO public.webhook_endpoints (organization_id, url, secret, status)
  VALUES (v_org, 'https://example.test/iacp-webhook', 'iacp-secret', 'active')
  RETURNING id INTO v_endpoint;

  INSERT INTO public.webhook_subscriptions (endpoint_id, event_type)
  VALUES (v_endpoint, 'audit_logs.insert');

  INSERT INTO iacp_ids(key, value) VALUES ('endpoint', v_endpoint);
END $$;

-- ===== direct-SQL/no-JWT context: status change must succeed despite no authenticated actor =====

DO $$
BEGIN
  BEGIN
    UPDATE public.invoices SET status = 'validated'
    WHERE id = (SELECT value FROM iacp_ids WHERE key = 'invoice_direct');
    INSERT INTO iacp_results VALUES ('direct_context_update_not_blocked', true, 'update succeeded');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO iacp_results VALUES ('direct_context_update_not_blocked', false, SQLERRM);
  END;
END $$;

INSERT INTO iacp_results
SELECT 'direct_context_invoice_audit_events_still_logged',
       EXISTS (
         SELECT 1 FROM public.invoice_audit_events
         WHERE invoice_id = (SELECT value FROM iacp_ids WHERE key = 'invoice_direct')
           AND action = 'status_changed'
       ),
       'invoice_audit_events must still be written unconditionally (existing behavior)';

-- ===== authenticated actor context: status change mirrors into audit_logs =====

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM iacp_ids WHERE key = 'org_manager'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

UPDATE public.invoices SET status = 'validated'
WHERE id = (SELECT value FROM iacp_ids WHERE key = 'invoice_authed');

RESET ROLE;

INSERT INTO iacp_results
SELECT 'authed_context_mirrors_into_audit_logs',
       EXISTS (
         SELECT 1 FROM public.audit_logs
         WHERE organization_id = (SELECT value FROM iacp_ids WHERE key = 'org')
           AND table_name = 'invoices'
           AND record_id = (SELECT value FROM iacp_ids WHERE key = 'invoice_authed')
           AND action = 'status_changed'
       ),
       'expected a mirrored audit_logs row for the authenticated status change';

-- ===== 9.10: the audit_logs insert queued a webhook event for the subscribed endpoint =====

INSERT INTO iacp_results
SELECT 'audit_logs_insert_queues_webhook_event',
       EXISTS (
         SELECT 1 FROM public.webhook_events_queue
         WHERE organization_id = (SELECT value FROM iacp_ids WHERE key = 'org')
           AND endpoint_id = (SELECT value FROM iacp_ids WHERE key = 'endpoint')
           AND event_type = 'audit_logs.insert'
       ),
       'expected queue_webhook_event() to have queued an event for the subscribed endpoint';

-- ===================== verdict =====================

SELECT * FROM iacp_results ORDER BY test_name;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM iacp_results WHERE NOT passed) THEN
    RAISE EXCEPTION 'invoice_audit_common_path_and_webhook_dispatch_acceptance failed';
  END IF;
END $$;

ROLLBACK;
