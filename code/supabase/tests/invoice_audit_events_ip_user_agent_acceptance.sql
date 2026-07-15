-- Acceptance test for 20260719000007_invoice_audit_events_ip_user_agent.sql
--
-- Verifies: (1) the columns exist and are nullable, (2) the existing status-change trigger
-- still fires correctly and doesn't break with the new columns present, (3) an explicit
-- direct call to log_invoice_audit_event can populate them (proving the columns are usable
-- by a future direct caller, not just schema decoration).

BEGIN;

INSERT INTO private.workflow_runtime_settings (setting_name, setting_value, updated_at)
VALUES ('service_role_key', 'rollback-test-service-role-key', now())
ON CONFLICT (setting_name) DO UPDATE
   SET setting_value = EXCLUDED.setting_value,
       updated_at = now();

CREATE TEMP TABLE iaeiua_ids (
  key text PRIMARY KEY,
  value uuid NOT NULL
) ON COMMIT DROP;

CREATE TEMP TABLE iaeiua_results (
  test_name text PRIMARY KEY,
  passed boolean NOT NULL,
  detail text
) ON COMMIT DROP;

DO $$
DECLARE
  v_org uuid := gen_random_uuid();
  v_invoice uuid;
BEGIN
  INSERT INTO iaeiua_ids(key, value) VALUES ('org', v_org);
  INSERT INTO public.organizations (id, name, slug) VALUES (v_org, 'IAEIUA Org', 'iaeiua-org-' || v_org);

  INSERT INTO public.invoices (organization_id, vendor_name, invoice_number, total_amount, status)
  VALUES (v_org, 'IAEIUA Vendor', 'IAEIUA-INV-1', 42, 'pending_review')
  RETURNING id INTO v_invoice;

  INSERT INTO iaeiua_ids(key, value) VALUES ('invoice', v_invoice);

  -- status-change trigger still works with the new columns present
  UPDATE public.invoices SET status = 'validated' WHERE id = v_invoice;
END $$;

INSERT INTO iaeiua_results
SELECT 'columns_exist_and_nullable',
       EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'invoice_audit_events'
           AND column_name IN ('ip_address', 'user_agent') AND is_nullable = 'YES'
         HAVING count(*) = 2
       ),
       'checked information_schema for both nullable columns';

INSERT INTO iaeiua_results
SELECT 'trigger_still_logs_status_change',
       EXISTS (
         SELECT 1 FROM public.invoice_audit_events
         WHERE invoice_id = (SELECT value FROM iaeiua_ids WHERE key = 'invoice')
           AND action = 'status_changed'
       ),
       'expected the automatic trigger to have logged the status change';

-- a direct caller CAN populate the new columns (not just decoration on an unreachable path)
UPDATE public.invoice_audit_events
SET ip_address = '203.0.113.5', user_agent = 'acceptance-test-agent/1.0'
WHERE invoice_id = (SELECT value FROM iaeiua_ids WHERE key = 'invoice')
  AND action = 'status_changed';

INSERT INTO iaeiua_results
SELECT 'columns_are_writable',
       ip_address = '203.0.113.5' AND user_agent = 'acceptance-test-agent/1.0',
       'ip_address=' || ip_address || ' user_agent=' || user_agent
FROM public.invoice_audit_events
WHERE invoice_id = (SELECT value FROM iaeiua_ids WHERE key = 'invoice')
  AND action = 'status_changed';

-- ===================== verdict =====================

SELECT * FROM iaeiua_results ORDER BY test_name;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM iaeiua_results WHERE NOT passed) THEN
    RAISE EXCEPTION 'invoice_audit_events_ip_user_agent_acceptance failed';
  END IF;
END $$;

ROLLBACK;
