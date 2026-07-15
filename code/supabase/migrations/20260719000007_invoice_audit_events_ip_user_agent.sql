-- 20260719000007: invoice_audit_events.ip_address / user_agent
--
-- Closes the schema-parity half of tracker item 9.7: audit_logs already has ip_address/
-- user_agent (006_saas_billing_and_audit.sql, extended 015_create_error_logs_and_audit_
-- hardening.sql) but invoice_audit_events never got them.
--
-- Note on what this can and can't capture: invoice_audit_events is currently written to by
-- exactly one path -- the trigger_invoice_status_audit trigger firing on invoices UPDATE
-- (086_invoice_audit_events.sql) -- which has no HTTP request context to draw a real IP or
-- user-agent from (it's a plain DB trigger, not a request handler). Adding the columns here
-- is for schema parity and to leave room for a future direct caller of
-- log_invoice_audit_event(); it does NOT fabricate values for the trigger path, which is the
-- honest answer for that path today.

BEGIN;

ALTER TABLE public.invoice_audit_events ADD COLUMN IF NOT EXISTS ip_address text;
ALTER TABLE public.invoice_audit_events ADD COLUMN IF NOT EXISTS user_agent text;

COMMIT;
