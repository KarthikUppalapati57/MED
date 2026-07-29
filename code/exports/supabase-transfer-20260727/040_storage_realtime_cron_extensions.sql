-- Extracted storage, realtime, cron, pg_net, and extension statements
-- Generated: 2026-07-27

-- Source: 001_initial_schema.sql
-- ============================================================
-- MEVS Platform - Supabase Database Schema
-- Run this in your Supabase SQL Editor:
-- https://gsupqfmwlsmwoybphimx.supabase.co
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Source: 008_storage_policies.sql
-- ============================================================
-- 007: MEVS SAAS READINESS - STORAGE SECURITY
-- ============================================================

-- NOTE: This migration assumes you will create these buckets in the Supabase Dashboard
-- or via the CLI. These policies secure them at the SQL level.

-- buckets: 'invoices', 'avatars'

-- 1. INVOICES BUCKET POLICIES
-- Only users from the same organization can view invoices
DROP POLICY IF EXISTS "Tenant Isolation Invoices View" ON storage.objects;

CREATE POLICY "Tenant Isolation Invoices View" ON storage.objects FOR SELECT USING (
    bucket_id = 'invoices' AND (
        (auth.jwt() -> 'user_metadata' ->> 'role' = 'platform_admin') OR
        ( (storage.foldername(name))[1] = (auth.jwt() -> 'user_metadata' ->> 'organization_id') )
    )
);

DROP POLICY IF EXISTS "Tenant Isolation Invoices Insert" ON storage.objects;

CREATE POLICY "Tenant Isolation Invoices Insert" ON storage.objects FOR INSERT WITH CHECK (
    bucket_id = 'invoices' AND (
        (auth.jwt() -> 'user_metadata' ->> 'role' = 'platform_admin') OR
        ( (storage.foldername(name))[1] = (auth.jwt() -> 'user_metadata' ->> 'organization_id') )
    )
);

DROP POLICY IF EXISTS "Tenant Isolation Invoices Delete" ON storage.objects;

CREATE POLICY "Tenant Isolation Invoices Delete" ON storage.objects FOR DELETE USING (
    bucket_id = 'invoices' AND (
        (auth.jwt() -> 'user_metadata' ->> 'role' = 'platform_admin') OR
        ( (storage.foldername(name))[1] = (auth.jwt() -> 'user_metadata' ->> 'organization_id') )
    )
);

-- 2. AVATARS BUCKET POLICIES
-- Avatars are public to view, but only the organization owners can manage their org's avatars
DROP POLICY IF EXISTS "Public Avatars View" ON storage.objects;

CREATE POLICY "Public Avatars View" ON storage.objects FOR SELECT USING (
    bucket_id = 'avatars'
);

DROP POLICY IF EXISTS "Tenant Isolation Avatars Manage" ON storage.objects;

CREATE POLICY "Tenant Isolation Avatars Manage" ON storage.objects FOR ALL USING (
    bucket_id = 'avatars' AND (
        (auth.jwt() -> 'user_metadata' ->> 'role' = 'platform_admin') OR
        ( (storage.foldername(name))[1] = (auth.jwt() -> 'user_metadata' ->> 'organization_id') )
    )
);

-- Source: 046_storage_security.sql
-- Add CHECK constraints directly to existing INSERT and UPDATE policies
-- For 'invoices' bucket
DROP POLICY IF EXISTS "Tenant Isolation Invoices Insert" ON storage.objects;

CREATE POLICY "Tenant Isolation Invoices Insert" ON storage.objects FOR INSERT WITH CHECK (
    bucket_id = 'invoices' AND (
        (public.is_platform_admin()) OR
        ( (storage.foldername(name))[1] = public.get_my_org()::text )
    ) AND public.check_file_security(bucket_id, metadata)
);

-- For 'avatars' bucket
-- Note: 'avatars' manage policy is an ALL policy, we must split it or add a specific INSERT policy
-- Since 008 created an ALL policy, we can redefine it
DROP POLICY IF EXISTS "Tenant Isolation Avatars Manage" ON storage.objects;

-- Recreate SELECT/UPDATE/DELETE
DROP POLICY IF EXISTS "Tenant Isolation Avatars Update" ON storage.objects;

CREATE POLICY "Tenant Isolation Avatars Update" ON storage.objects FOR UPDATE USING (
    bucket_id = 'avatars' AND (
        (public.is_platform_admin()) OR
        ( (storage.foldername(name))[1] = public.get_my_org()::text )
    )
);

DROP POLICY IF EXISTS "Tenant Isolation Avatars Delete" ON storage.objects;

CREATE POLICY "Tenant Isolation Avatars Delete" ON storage.objects FOR DELETE USING (
    bucket_id = 'avatars' AND (
        (public.is_platform_admin()) OR
        ( (storage.foldername(name))[1] = public.get_my_org()::text )
    )
);

-- Recreate INSERT with security check
DROP POLICY IF EXISTS "Tenant Isolation Avatars Insert" ON storage.objects;

CREATE POLICY "Tenant Isolation Avatars Insert" ON storage.objects FOR INSERT WITH CHECK (
    bucket_id = 'avatars' AND (
        (public.is_platform_admin()) OR
        ( (storage.foldername(name))[1] = public.get_my_org()::text )
    ) AND public.check_file_security(bucket_id, metadata)
);

-- Source: 047_fix_user_metadata_vulnerability.sql
-- 3. Fix older Storage policies from migration 008 that use user_metadata
-- Invoices View
DROP POLICY IF EXISTS "Tenant Isolation Invoices View" ON storage.objects;

CREATE POLICY "Tenant Isolation Invoices View" ON storage.objects FOR SELECT USING (
    bucket_id = 'invoices' AND (
        (public.is_platform_admin()) OR
        ( (storage.foldername(name))[1] = public.get_my_org()::text )
    )
);

-- Invoices Delete
DROP POLICY IF EXISTS "Tenant Isolation Invoices Delete" ON storage.objects;

CREATE POLICY "Tenant Isolation Invoices Delete" ON storage.objects FOR DELETE USING (
    bucket_id = 'invoices' AND (
        (public.is_platform_admin()) OR
        ( (storage.foldername(name))[1] = public.get_my_org()::text )
    )
);

-- Source: 066_webhook_triggers.sql
-- Migration: 066_webhook_triggers
-- Description: Triggers for queuing webhooks and invoking the dispatcher

CREATE EXTENSION IF NOT EXISTS pg_net;

-- Source: 067_realtime_events.sql
-- Add the table to the supabase_realtime publication to enable WebSocket broadcasting
ALTER PUBLICATION supabase_realtime ADD TABLE event_logs;

-- Source: 071_workflow_depth_completion.sql
-- Keep webhook dispatch from remaining purely passive when pg_net is available.
CREATE OR REPLACE FUNCTION public.notify_webhook_dispatcher()
RETURNS TRIGGER AS $$
DECLARE
  v_dispatcher_url TEXT;
BEGIN
  v_dispatcher_url := current_setting('app.settings.webhook_dispatcher_url', true);

  IF v_dispatcher_url IS NOT NULL AND v_dispatcher_url <> '' THEN
    PERFORM net.http_post(
      url := v_dispatcher_url,
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := jsonb_build_object('queue_id', NEW.id)
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Source: 076_dashboard_persistence.sql
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'dashboard_action_status'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.dashboard_action_status;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'dashboard_handoff_notes'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.dashboard_handoff_notes;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'dashboard_review_logs'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.dashboard_review_logs;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'dashboard_escalation_rules'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.dashboard_escalation_rules;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'dashboard_report_preferences'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.dashboard_report_preferences;
    END IF;
  END IF;
END $$;

-- Source: 077_dashboard_report_scheduler.sql
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'dashboard_report_deliveries'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.dashboard_report_deliveries;
    END IF;
  END IF;
END $$;

-- Source: 080_invoice_document_intake.sql
CREATE EXTENSION IF NOT EXISTS "pgsodium" WITH SCHEMA pgsodium;

CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA vault;

-- Source: 081_vendor_item_matching.sql
CREATE EXTENSION IF NOT EXISTS fuzzystrmatch WITH SCHEMA extensions;

-- Source: 107_dashboard_materialized_views.sql
-- 5. Set up pg_cron to run the refresh every 5 minutes (Requires pg_cron extension)
-- Supabase supports pg_cron natively.
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Unschedule if it exists to prevent duplicates
SELECT cron.unschedule('refresh_dashboard_views') 
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'refresh_dashboard_views');

-- Schedule the refresh every 5 minutes
SELECT cron.schedule(
  'refresh_dashboard_views',
  '*/5 * * * *',
  $$SELECT public.refresh_dashboard_materialized_views();$$
);

-- Source: 109_database_monitoring.sql
-- Enable the pg_stat_statements extension (must be run as superuser)
CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA extensions;

-- Source: 110_server_side_metrics_and_sync.sql
-- Migration 110: Server-Side Metrics and POS Sync (Phase 3 Thin Client Optimization)
-- NOTE: Do not wrap in BEGIN/COMMIT because CREATE INDEX CONCURRENTLY cannot run inside a transaction block.

-- 1. Trigram Indexing for blazing-fast ILIKE searches
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

-- Source: 111_fix_dashboard_performance.sql
-- 3. Update the pg_cron schedule to 1-minute, but ONLY for Sales Data
-- Unscheduling the 5-minute cron
SELECT cron.unschedule('refresh_dashboard_views') 
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'refresh_dashboard_views');

-- Reschedule to every minute
SELECT cron.schedule(
  'refresh_dashboard_views',
  '* * * * *',
  $$SELECT public.refresh_dashboard_materialized_views();$$
);

-- Source: 115_resolve_advisor_lints.sql
ALTER EXTENSION fuzzystrmatch SET SCHEMA extensions;

-- Source: 120_native_workflow_triggers.sql
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 1. Create a generic trigger function that dispatches events to Edge Functions
CREATE OR REPLACE FUNCTION public.invoke_edge_function()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  function_name TEXT := TG_ARGV[0];
  v_url TEXT;
  v_service_role_key TEXT;
  v_headers JSONB;
  v_payload JSONB;
BEGIN
  -- Construct the Edge Function URL. 
  -- We default to the known production URL, but allow overrides via custom settings if needed.
  v_url := COALESCE(current_setting('app.settings.functions_url', true), 'https://gsupqfmwlsmwoybphimx.supabase.co/functions/v1') || '/' || function_name;
  v_service_role_key := current_setting('app.settings.service_role_key', true);

  IF v_service_role_key IS NULL OR length(trim(v_service_role_key)) = 0 THEN
    RAISE EXCEPTION 'app.settings.service_role_key is required for invoke_edge_function';
  END IF;
  
  v_headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || v_service_role_key
  );

  v_payload := jsonb_build_object(
    'type', TG_OP,
    'table', TG_TABLE_NAME,
    'schema', TG_TABLE_SCHEMA,
    'record', CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN row_to_json(NEW) ELSE null END,
    'old_record', CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN row_to_json(OLD) ELSE null END
  );

  PERFORM net.http_post(
      url := v_url,
      body := v_payload,
      headers := v_headers
  );
  
  RETURN NULL; -- AFTER trigger
END;
$$;

-- 6. Setup pg_cron for Webhook Dispatcher
-- We set up a cron job to call the webhook-dispatcher every minute to process retries/queue.
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
DECLARE
  v_url TEXT;
  v_service_role_key TEXT;
  v_job_id INT;
BEGIN
  v_url := COALESCE(current_setting('app.settings.functions_url', true), 'https://gsupqfmwlsmwoybphimx.supabase.co/functions/v1') || '/webhook-dispatcher';
  v_service_role_key := current_setting('app.settings.service_role_key', true);

  IF v_service_role_key IS NULL OR length(trim(v_service_role_key)) = 0 THEN
    RAISE NOTICE 'Skipping process-webhook-queue cron schedule: app.settings.service_role_key is not configured';
    RETURN;
  END IF;
  
  -- Create the cron job if it doesn't exist
  SELECT jobid INTO v_job_id FROM cron.job WHERE jobname = 'process-webhook-queue';
  
  IF v_job_id IS NULL THEN
    PERFORM cron.schedule(
      'process-webhook-queue',
      '* * * * *', -- Every minute
      format(
        'SELECT net.http_post(''%s'', ''{}''::jsonb, ''{"Content-Type": "application/json", "Authorization": "Bearer %s"}''::jsonb);',
        v_url,
        replace(v_service_role_key, '''', '''''')
      )
    );
  END IF;
END $$;

-- Source: 122_harden_native_workflow_triggers.sql
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION public.invoke_edge_function()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  function_name text := TG_ARGV[0];
  v_url text;
  v_functions_url text;
  v_service_role_key text;
  v_headers jsonb;
  v_payload jsonb;
BEGIN
  SELECT setting_value
    INTO v_functions_url
    FROM private.workflow_runtime_settings
   WHERE setting_name = 'functions_url';

  SELECT setting_value
    INTO v_service_role_key
    FROM private.workflow_runtime_settings
   WHERE setting_name = 'service_role_key';

  v_url := COALESCE(
    NULLIF(trim(v_functions_url), ''),
    'https://gsupqfmwlsmwoybphimx.supabase.co/functions/v1'
  ) || '/' || function_name;

  IF v_service_role_key IS NULL OR length(trim(v_service_role_key)) = 0 THEN
    RAISE EXCEPTION 'private.workflow_runtime_settings.service_role_key is required for invoke_edge_function';
  END IF;

  v_headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || v_service_role_key
  );

  v_payload := jsonb_build_object(
    'type', TG_OP,
    'table', TG_TABLE_NAME,
    'schema', TG_TABLE_SCHEMA,
    'record', CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN row_to_json(NEW) ELSE NULL END,
    'old_record', CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN row_to_json(OLD) ELSE NULL END
  );

  PERFORM net.http_post(
    url := v_url,
    body := v_payload,
    headers := v_headers
  );

  RETURN NULL;
END;
$$;

DO $$
DECLARE
  v_url text;
  v_functions_url text;
  v_service_role_key text;
  v_job_id int;
BEGIN
  SELECT jobid
    INTO v_job_id
    FROM cron.job
   WHERE jobname = 'process-webhook-queue';

  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;

  SELECT setting_value
    INTO v_functions_url
    FROM private.workflow_runtime_settings
   WHERE setting_name = 'functions_url';

  SELECT setting_value
    INTO v_service_role_key
    FROM private.workflow_runtime_settings
   WHERE setting_name = 'service_role_key';

  IF v_service_role_key IS NULL OR length(trim(v_service_role_key)) = 0 THEN
    RAISE NOTICE 'Skipping process-webhook-queue cron schedule: private.workflow_runtime_settings.service_role_key is not configured';
    RETURN;
  END IF;

  v_url := COALESCE(
    NULLIF(trim(v_functions_url), ''),
    'https://gsupqfmwlsmwoybphimx.supabase.co/functions/v1'
  ) || '/webhook-dispatcher';

  PERFORM cron.schedule(
    'process-webhook-queue',
    '* * * * *',
    format(
      'SELECT net.http_post(%L, %L::jsonb, jsonb_build_object(%L, %L, %L, %L));',
      v_url,
      '{}',
      'Content-Type',
      'application/json',
      'Authorization',
      'Bearer ' || v_service_role_key
    )
  );
END $$;

-- Source: 125_fix_storage_fk.sql
-- 1. Fix storage.objects owner when the migration role owns the managed storage table.
DO $guard$
BEGIN
  ALTER TABLE storage.objects DROP CONSTRAINT IF EXISTS objects_owner_fkey;
  ALTER TABLE storage.objects ADD CONSTRAINT objects_owner_fkey
      FOREIGN KEY (owner) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Skipping storage.objects owner FK repair: migration role does not own storage.objects';
END $guard$;

-- 2. Fix storage.buckets owner when the migration role owns the managed storage table.
DO $guard$
BEGIN
  ALTER TABLE storage.buckets DROP CONSTRAINT IF EXISTS buckets_owner_fkey;
  ALTER TABLE storage.buckets ADD CONSTRAINT buckets_owner_fkey
      FOREIGN KEY (owner) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Skipping storage.buckets owner FK repair: migration role does not own storage.buckets';
END $guard$;

-- Source: 126_fix_admin_delete_rpc.sql
-- ============================================================
-- Migration 055: Fix admin_delete_user RPC Storage Constraint
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_delete_user(target_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    caller_role TEXT;
    v_email TEXT;
    v_full_name TEXT;
    v_role TEXT;
BEGIN
    -- 1. Check if caller is authenticated
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- 2. Verify the caller is a platform_admin
    caller_role := COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '');
    
    IF caller_role != 'platform_admin' THEN
        RAISE EXCEPTION 'Insufficient permissions: only platform_admin can delete users permanently';
    END IF;

    -- 3. Prevent self-deletion via this route
    IF target_user_id = auth.uid() THEN
        RAISE EXCEPTION 'You cannot delete your own account.';
    END IF;

    -- 4. Gather user details before deletion for the archive
    SELECT email, full_name, role INTO v_email, v_full_name, v_role
    FROM public.profiles
    WHERE id = target_user_id;

    -- If profile was missing, fallback to auth.users for email
    IF v_email IS NULL THEN
        SELECT email INTO v_email FROM auth.users WHERE id = target_user_id;
    END IF;

    -- 5. Archive the user
    INSERT INTO public.archived_users (original_user_id, email, full_name, role, deleted_by)
    VALUES (target_user_id, v_email, v_full_name, v_role, auth.uid());

    -- 6. Detach any files the user uploaded to prevent Foreign Key constraints from blocking deletion
    UPDATE storage.objects SET owner = NULL WHERE owner = target_user_id;

    -- 7. Delete the user from auth.users
    -- Because this function is SECURITY DEFINER, it runs with the privileges 
    -- of the user who created it (postgres superuser during migrations),
    -- allowing it to safely bypass the auth schema restrictions.
    DELETE FROM auth.users WHERE id = target_user_id;

    RETURN jsonb_build_object('success', true);
END;
$$;

-- Source: 20260617003000_secure_webhook_dispatcher_cron.sql
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION public.dispatch_webhook_queue()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_url text;
  v_functions_url text;
  v_service_role_key text;
BEGIN
  SELECT setting_value
    INTO v_functions_url
    FROM private.workflow_runtime_settings
   WHERE setting_name = 'functions_url';

  SELECT setting_value
    INTO v_service_role_key
    FROM private.workflow_runtime_settings
   WHERE setting_name = 'service_role_key';

  IF v_service_role_key IS NULL OR length(trim(v_service_role_key)) = 0 THEN
    RAISE EXCEPTION 'private.workflow_runtime_settings.service_role_key is required for dispatch_webhook_queue';
  END IF;

  v_url := COALESCE(
    NULLIF(trim(v_functions_url), ''),
    'https://gsupqfmwlsmwoybphimx.supabase.co/functions/v1'
  ) || '/webhook-dispatcher';

  PERFORM net.http_post(
    url := v_url,
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_role_key
    )
  );
END;
$$;

DO $$
DECLARE
  v_job_id int;
BEGIN
  SELECT jobid
    INTO v_job_id
    FROM cron.job
   WHERE jobname = 'process-webhook-queue';

  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;

  PERFORM cron.schedule(
    'process-webhook-queue',
    '* * * * *',
    'SELECT public.dispatch_webhook_queue();'
  );
END $$;

-- Source: 20260623000000_create_invoices_storage_bucket.sql
-- 1. Create the bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('invoices', 'invoices', true)
ON CONFLICT (id) DO NOTHING;

-- 2. (Skipped: RLS is enabled by default in Supabase storage)

-- 3. Policy: Public Access to View Invoices
-- (Since the bucket is public, we allow anyone to read the objects)
DROP POLICY IF EXISTS "Public Access to View Invoices" ON storage.objects;

CREATE POLICY "Public Access to View Invoices"
ON storage.objects FOR SELECT
USING ( bucket_id = 'invoices' );

-- 4. Policy: Authenticated Users can Upload Invoices
DROP POLICY IF EXISTS "Authenticated Users can Upload Invoices" ON storage.objects;

CREATE POLICY "Authenticated Users can Upload Invoices"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK ( bucket_id = 'invoices' );

-- 5. Policy: Authenticated Users can Delete Invoices
DROP POLICY IF EXISTS "Authenticated Users can Delete Invoices" ON storage.objects;

CREATE POLICY "Authenticated Users can Delete Invoices"
ON storage.objects FOR DELETE
TO authenticated
USING ( bucket_id = 'invoices' );

-- Source: 20260624000001_secure_invoices_bucket.sql
-- Ensure the bucket exists and make it private
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'invoices',
    'invoices',
    false,
    52428800, -- 50MB
    ARRAY['application/pdf', 'image/jpeg', 'image/png']
)
ON CONFLICT (id) DO UPDATE SET
    public = false;

-- Enable RLS on storage.objects if not already enabled (skipped as it is owned by supabase_storage_admin)

-- Drop existing policies on invoices bucket if any
DROP POLICY IF EXISTS "Authenticated users can upload invoices" ON storage.objects;

DROP POLICY IF EXISTS "Authenticated users can view invoices" ON storage.objects;

-- Create secure policies
-- 1. Upload policy: Only authenticated users can upload
CREATE POLICY "Authenticated users can upload invoices"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'invoices');

-- 2. View policy: Only authenticated users can view/download
CREATE POLICY "Authenticated users can view invoices"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'invoices');

-- 3. Delete policy: Only authenticated users can delete
CREATE POLICY "Authenticated users can delete invoices"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'invoices');

-- Source: 20260624000003_strict_storage_rls.sql
-- Remove the old policy we created previously
DROP POLICY IF EXISTS "invoices_bucket_authenticated_access" ON storage.objects;

-- Create strict policies

-- 1. Read Policy: Users can only read files within their organization's folder
CREATE POLICY "invoices_bucket_org_read"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'invoices' 
  AND (storage.foldername(name))[1] = auth.jwt()->>'user_org_id'
);

-- 2. Insert Policy: Users can only upload files into their organization's folder
CREATE POLICY "invoices_bucket_org_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'invoices' 
  AND (storage.foldername(name))[1] = auth.jwt()->>'user_org_id'
);

-- 3. Delete Policy: Users can only delete files within their organization's folder
CREATE POLICY "invoices_bucket_org_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'invoices' 
  AND (storage.foldername(name))[1] = auth.jwt()->>'user_org_id'
);

-- 4. Edge Function Internal Access: Allow service role to do anything
CREATE POLICY "invoices_bucket_service_role"
ON storage.objects FOR ALL
TO service_role
USING (bucket_id = 'invoices')
WITH CHECK (bucket_id = 'invoices');

-- Source: 20260624000011_batch4_admin_accounting.sql
-- 4. Retry stuck integrations
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- In a real environment, we'd ensure permissions, but we can try to schedule:
    BEGIN
      PERFORM cron.schedule(
        'retry_stuck_integrations',
        '*/30 * * * *',
        'UPDATE public.integrations SET status = ''failed'', metadata = jsonb_set(COALESCE(metadata, ''{}''::jsonb), ''{last_error}'', ''"Timeout during sync"'') WHERE status = ''syncing'' AND updated_at < now() - interval ''1 hour'''
      );
    EXCEPTION WHEN OTHERS THEN
      -- Ignore if insufficient privileges for cron
    END;
  END IF;
END $$;

-- Source: 20260626000007_start_invoice_extraction_workflow.sql
CREATE OR REPLACE FUNCTION public.start_invoice_extraction_workflow(p_invoice_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_invoice public.invoices%ROWTYPE;
  v_functions_url TEXT;
  v_service_role_key TEXT;
  v_url TEXT;
  v_headers JSONB;
  v_payload JSONB;
  v_request_id BIGINT;
BEGIN
  SELECT *
    INTO v_invoice
  FROM public.invoices
  WHERE id = p_invoice_id
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice % not found', p_invoice_id USING ERRCODE = 'P0002';
  END IF;

  PERFORM public.assert_org_actor(v_invoice.organization_id);

  IF v_invoice.status NOT IN ('extracting', 'uploading', 'extract_failed') THEN
    RETURN jsonb_build_object(
      'success', true,
      'queued', false,
      'reason', 'invoice_not_extractable',
      'status', v_invoice.status
    );
  END IF;

  IF v_invoice.status = 'extracting'
     AND v_invoice.extraction_started_at IS NOT NULL
     AND v_invoice.extraction_started_at > now() - interval '5 minutes' THEN
    RETURN jsonb_build_object(
      'success', true,
      'queued', false,
      'reason', 'extraction_already_running',
      'status', v_invoice.status,
      'extraction_started_at', v_invoice.extraction_started_at
    );
  END IF;

  UPDATE public.invoices
     SET status = 'extracting',
         ap_status = 'processing',
         extraction_started_at = NULL,
         validation_results = COALESCE(validation_results, '{}'::jsonb) - 'error',
         updated_at = now()
   WHERE id = p_invoice_id
   RETURNING * INTO v_invoice;

  SELECT setting_value
    INTO v_functions_url
    FROM private.workflow_runtime_settings
   WHERE setting_name = 'functions_url';

  SELECT setting_value
    INTO v_service_role_key
    FROM private.workflow_runtime_settings
   WHERE setting_name = 'service_role_key';

  IF v_service_role_key IS NULL OR length(trim(v_service_role_key)) = 0 THEN
    RAISE EXCEPTION 'private.workflow_runtime_settings.service_role_key is required for invoice extraction dispatch';
  END IF;

  v_url := COALESCE(
    NULLIF(trim(v_functions_url), ''),
    'https://gsupqfmwlsmwoybphimx.supabase.co/functions/v1'
  ) || '/invoice-processing';

  v_headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || v_service_role_key
  );

  v_payload := jsonb_build_object(
    'type', 'INSERT',
    'table', 'invoices',
    'schema', 'public',
    'record', row_to_json(v_invoice),
    'old_record', NULL
  );

  SELECT net.http_post(
    url := v_url,
    body := v_payload,
    headers := v_headers
  ) INTO v_request_id;

  RETURN jsonb_build_object(
    'success', true,
    'queued', true,
    'request_id', v_request_id,
    'invoice_id', v_invoice.id
  );
END;
$$;

COMMENT ON FUNCTION public.start_invoice_extraction_workflow(UUID) IS
  'Tenant-safe workflow entrypoint that enqueues invoice extraction through pg_net after validating invoice access.';

-- Source: 20260626000009_extend_invoice_processing_pg_net_timeout.sql
CREATE OR REPLACE FUNCTION public.invoke_edge_function()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  function_name text := TG_ARGV[0];
  v_url text;
  v_functions_url text;
  v_service_role_key text;
  v_headers jsonb;
  v_payload jsonb;
BEGIN
  SELECT setting_value
    INTO v_functions_url
    FROM private.workflow_runtime_settings
   WHERE setting_name = 'functions_url';

  SELECT setting_value
    INTO v_service_role_key
    FROM private.workflow_runtime_settings
   WHERE setting_name = 'service_role_key';

  v_url := COALESCE(
    NULLIF(trim(v_functions_url), ''),
    'https://gsupqfmwlsmwoybphimx.supabase.co/functions/v1'
  ) || '/' || function_name;

  IF v_service_role_key IS NULL OR length(trim(v_service_role_key)) = 0 THEN
    RAISE EXCEPTION 'private.workflow_runtime_settings.service_role_key is required for invoke_edge_function';
  END IF;

  v_headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || v_service_role_key
  );

  v_payload := jsonb_build_object(
    'type', TG_OP,
    'table', TG_TABLE_NAME,
    'schema', TG_TABLE_SCHEMA,
    'record', CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN row_to_json(NEW) ELSE NULL END,
    'old_record', CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN row_to_json(OLD) ELSE NULL END
  );

  PERFORM net.http_post(
    url := v_url,
    body := v_payload,
    headers := v_headers,
    timeout_milliseconds := CASE WHEN function_name = 'invoice-processing' THEN 180000 ELSE 30000 END
  );

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.start_invoice_extraction_workflow(p_invoice_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_invoice public.invoices%ROWTYPE;
  v_functions_url TEXT;
  v_service_role_key TEXT;
  v_url TEXT;
  v_headers JSONB;
  v_payload JSONB;
  v_request_id BIGINT;
BEGIN
  SELECT *
    INTO v_invoice
  FROM public.invoices
  WHERE id = p_invoice_id
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice % not found', p_invoice_id USING ERRCODE = 'P0002';
  END IF;

  PERFORM public.assert_org_actor(v_invoice.organization_id);

  IF v_invoice.status NOT IN ('extracting', 'uploading', 'extract_failed') THEN
    RETURN jsonb_build_object(
      'success', true,
      'queued', false,
      'reason', 'invoice_not_extractable',
      'status', v_invoice.status
    );
  END IF;

  IF v_invoice.status = 'extracting'
     AND v_invoice.extraction_started_at IS NOT NULL
     AND v_invoice.extraction_started_at > now() - interval '5 minutes' THEN
    RETURN jsonb_build_object(
      'success', true,
      'queued', false,
      'reason', 'extraction_already_running',
      'status', v_invoice.status,
      'extraction_started_at', v_invoice.extraction_started_at
    );
  END IF;

  UPDATE public.invoices
     SET status = 'extracting',
         ap_status = 'processing',
         extraction_started_at = NULL,
         validation_results = COALESCE(validation_results, '{}'::jsonb) - 'error',
         updated_at = now()
   WHERE id = p_invoice_id
   RETURNING * INTO v_invoice;

  SELECT setting_value
    INTO v_functions_url
    FROM private.workflow_runtime_settings
   WHERE setting_name = 'functions_url';

  SELECT setting_value
    INTO v_service_role_key
    FROM private.workflow_runtime_settings
   WHERE setting_name = 'service_role_key';

  IF v_service_role_key IS NULL OR length(trim(v_service_role_key)) = 0 THEN
    RAISE EXCEPTION 'private.workflow_runtime_settings.service_role_key is required for invoice extraction dispatch';
  END IF;

  v_url := COALESCE(
    NULLIF(trim(v_functions_url), ''),
    'https://gsupqfmwlsmwoybphimx.supabase.co/functions/v1'
  ) || '/invoice-processing';

  v_headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || v_service_role_key
  );

  v_payload := jsonb_build_object(
    'type', 'INSERT',
    'table', 'invoices',
    'schema', 'public',
    'record', row_to_json(v_invoice),
    'old_record', NULL
  );

  SELECT net.http_post(
    url := v_url,
    body := v_payload,
    headers := v_headers,
    timeout_milliseconds := 180000
  ) INTO v_request_id;

  RETURN jsonb_build_object(
    'success', true,
    'queued', true,
    'request_id', v_request_id,
    'invoice_id', v_invoice.id
  );
END;
$$;

-- Source: 20260711000004_vendor_onboarding_flow.sql
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'vendor_documents',
  'vendor_documents',
  false,
  20971520,
  ARRAY['application/pdf', 'image/png', 'image/jpeg', 'text/csv']::text[]
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS vendor_documents_magic_link_upload ON storage.objects;

CREATE POLICY vendor_documents_magic_link_upload
ON storage.objects
FOR INSERT
TO anon, authenticated
WITH CHECK (
  bucket_id = 'vendor_documents'
  AND name LIKE 'w9_documents/%'
  AND public.is_valid_vendor_document_upload_token(name)
);

DROP POLICY IF EXISTS vendor_documents_manager_read ON storage.objects;

CREATE POLICY vendor_documents_manager_read
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'vendor_documents' AND public.is_manager_or_above());

DROP POLICY IF EXISTS vendor_documents_manager_write ON storage.objects;

CREATE POLICY vendor_documents_manager_write
ON storage.objects
FOR ALL
TO authenticated
USING (bucket_id = 'vendor_documents' AND public.is_manager_or_above())
WITH CHECK (bucket_id = 'vendor_documents' AND public.is_manager_or_above());

-- Source: 20260717000003_payment_reminders_and_failure_notify.sql
-- Reimplements the org_owner/branch_manager/location_manager/ground_staff visibility rule
-- from financial_scope_visible(), but against an EXPLICIT target user's profile instead of
-- auth.uid() -- financial_scope_visible only ever checks the calling session's own access,
-- which is meaningless inside a cron job that has to evaluate many different users' access.
CREATE OR REPLACE FUNCTION public.send_due_date_reminders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_setting RECORD;
  v_profile RECORD;
  v_invoice RECORD;
BEGIN
  FOR v_setting IN
    SELECT user_id, organization_id, reminder_days
    FROM public.invoice_reminder_settings
    WHERE enabled = true
  LOOP
    SELECT role, organization_id, brand_id, location_id
      INTO v_profile
    FROM public.profiles
    WHERE id = v_setting.user_id
      AND deleted_at IS NULL;

    IF v_profile.role IS NULL THEN
      CONTINUE;
    END IF;

    FOR v_invoice IN
      SELECT i.id, i.due_date, (i.due_date - CURRENT_DATE) AS days_out
      FROM public.invoices i
      WHERE i.deleted_at IS NULL
        AND i.organization_id = v_setting.organization_id
        AND COALESCE(i.payment_status, 'unpaid') NOT IN ('paid', 'auto_pay')
        AND i.due_date IS NOT NULL
        AND (i.due_date - CURRENT_DATE) = ANY(v_setting.reminder_days)
        AND (
          v_profile.role IN ('org_owner', 'platform_admin')
          OR (
            v_profile.role = 'branch_manager'
            AND (
              i.brand_id = v_profile.brand_id
              OR i.location_id IN (SELECT l.id FROM public.locations l WHERE l.brand_id = v_profile.brand_id)
            )
          )
          OR (
            v_profile.role IN ('location_manager', 'ground_staff')
            AND i.location_id = v_profile.location_id
          )
        )
    LOOP
      INSERT INTO public.invoice_reminder_log (invoice_id, user_id, reminder_day)
      VALUES (v_invoice.id, v_setting.user_id, v_invoice.days_out)
      ON CONFLICT (invoice_id, user_id, reminder_day) DO NOTHING;

      IF FOUND THEN
        INSERT INTO public.notifications (user_id, organization_id, type, title, message, is_read, metadata)
        VALUES (
          v_setting.user_id,
          v_setting.organization_id,
          'invoice',
          CASE WHEN v_invoice.days_out <= 0 THEN 'Invoice overdue' ELSE 'Invoice due soon' END,
          CASE WHEN v_invoice.days_out <= 0
            THEN format('An invoice was due on %s and is still unpaid.', to_char(v_invoice.due_date, 'Mon DD, YYYY'))
            ELSE format('An invoice is due in %s day%s (%s).', v_invoice.days_out, CASE WHEN v_invoice.days_out = 1 THEN '' ELSE 's' END, to_char(v_invoice.due_date, 'Mon DD, YYYY'))
          END,
          false,
          jsonb_build_object('invoice_id', v_invoice.id, 'due_in_days', v_invoice.days_out)
        );
      END IF;
    END LOOP;
  END LOOP;

  -- Trigger the email side (plain SQL can't call Resend). Same secure-dispatch pattern as
  -- dispatch_webhook_queue(): read the functions URL/service key from
  -- private.workflow_runtime_settings rather than hardcoding credentials in this function.
  DECLARE
    v_functions_url text;
    v_service_role_key text;
    v_url text;
  BEGIN
    SELECT setting_value INTO v_functions_url FROM private.workflow_runtime_settings WHERE setting_name = 'functions_url';
    SELECT setting_value INTO v_service_role_key FROM private.workflow_runtime_settings WHERE setting_name = 'service_role_key';

    IF v_service_role_key IS NOT NULL AND length(trim(v_service_role_key)) > 0 THEN
      v_url := COALESCE(NULLIF(trim(v_functions_url), ''), 'https://gsupqfmwlsmwoybphimx.supabase.co/functions/v1') || '/send-due-date-reminder-emails';

      PERFORM net.http_post(
        url := v_url,
        body := '{}'::jsonb,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_service_role_key
        )
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- Notifications already landed above; a failure to trigger the email side is non-fatal.
    NULL;
  END;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule('send_due_date_reminders')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send_due_date_reminders');

      PERFORM cron.schedule(
        'send_due_date_reminders',
        '0 8 * * *',
        'SELECT public.send_due_date_reminders();'
      );
    EXCEPTION WHEN OTHERS THEN
      -- local/CI without cron privileges: skip, not fatal
      NULL;
    END;
  END IF;
END $$;

-- Source: 20260718000004_fix_reminders_role_list.sql
CREATE OR REPLACE FUNCTION public.send_due_date_reminders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_setting RECORD;
  v_profile RECORD;
  v_invoice RECORD;
BEGIN
  FOR v_setting IN
    SELECT user_id, organization_id, reminder_days
    FROM public.invoice_reminder_settings
    WHERE enabled = true
  LOOP
    SELECT role, organization_id, brand_id, location_id
      INTO v_profile
    FROM public.profiles
    WHERE id = v_setting.user_id
      AND deleted_at IS NULL;

    IF v_profile.role IS NULL THEN
      CONTINUE;
    END IF;

    FOR v_invoice IN
      SELECT i.id, i.due_date, (i.due_date - CURRENT_DATE) AS days_out
      FROM public.invoices i
      WHERE i.deleted_at IS NULL
        AND i.organization_id = v_setting.organization_id
        AND COALESCE(i.payment_status, 'unpaid') NOT IN ('paid', 'auto_pay')
        AND i.due_date IS NOT NULL
        AND (i.due_date - CURRENT_DATE) = ANY(v_setting.reminder_days)
        AND (
          v_profile.role IN ('org_manager', 'tenant_super_admin', 'platform_admin')
          OR (
            v_profile.role = 'branch_manager'
            AND (
              i.brand_id = v_profile.brand_id
              OR i.location_id IN (SELECT l.id FROM public.locations l WHERE l.brand_id = v_profile.brand_id)
            )
          )
          OR (
            v_profile.role IN ('location_manager', 'ground_staff')
            AND i.location_id = v_profile.location_id
          )
        )
    LOOP
      INSERT INTO public.invoice_reminder_log (invoice_id, user_id, reminder_day)
      VALUES (v_invoice.id, v_setting.user_id, v_invoice.days_out)
      ON CONFLICT (invoice_id, user_id, reminder_day) DO NOTHING;

      IF FOUND THEN
        INSERT INTO public.notifications (user_id, organization_id, type, title, message, is_read, metadata)
        VALUES (
          v_setting.user_id,
          v_setting.organization_id,
          'invoice',
          CASE WHEN v_invoice.days_out <= 0 THEN 'Invoice overdue' ELSE 'Invoice due soon' END,
          CASE WHEN v_invoice.days_out <= 0
            THEN format('An invoice was due on %s and is still unpaid.', to_char(v_invoice.due_date, 'Mon DD, YYYY'))
            ELSE format('An invoice is due in %s day%s (%s).', v_invoice.days_out, CASE WHEN v_invoice.days_out = 1 THEN '' ELSE 's' END, to_char(v_invoice.due_date, 'Mon DD, YYYY'))
          END,
          false,
          jsonb_build_object('invoice_id', v_invoice.id, 'due_in_days', v_invoice.days_out)
        );
      END IF;
    END LOOP;
  END LOOP;

  -- Trigger the email side (plain SQL can't call Resend). Same secure-dispatch pattern as
  -- dispatch_webhook_queue(): read the functions URL/service key from
  -- private.workflow_runtime_settings rather than hardcoding credentials in this function.
  DECLARE
    v_functions_url text;
    v_service_role_key text;
    v_url text;
  BEGIN
    SELECT setting_value INTO v_functions_url FROM private.workflow_runtime_settings WHERE setting_name = 'functions_url';
    SELECT setting_value INTO v_service_role_key FROM private.workflow_runtime_settings WHERE setting_name = 'service_role_key';

    IF v_service_role_key IS NOT NULL AND length(trim(v_service_role_key)) > 0 THEN
      v_url := COALESCE(NULLIF(trim(v_functions_url), ''), 'https://gsupqfmwlsmwoybphimx.supabase.co/functions/v1') || '/send-due-date-reminder-emails';

      PERFORM net.http_post(
        url := v_url,
        body := '{}'::jsonb,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_service_role_key
        )
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- Notifications already landed above; a failure to trigger the email side is non-fatal.
    NULL;
  END;
END;
$$;

-- Source: 20260721000019_production_reporting_and_backup_hardening.sql
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('db-backups', 'db-backups', false, 104857600, ARRAY['application/json'])
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Service role can manage db backups" ON storage.objects;

CREATE POLICY "Service role can manage db backups" ON storage.objects
  FOR ALL TO service_role
  USING (bucket_id = 'db-backups')
  WITH CHECK (bucket_id = 'db-backups');

DROP POLICY IF EXISTS "Authenticated users cannot read db backups" ON storage.objects;

CREATE POLICY "Authenticated users cannot read db backups" ON storage.objects
  FOR SELECT TO authenticated
  USING (false);

-- Source: 20260721000020_invoice_module_production_hardening.sql
-- ---------------------------------------------------------------------------
-- 1. Storage: make the final migration state explicit for invoice documents.
-- ---------------------------------------------------------------------------

UPDATE storage.buckets
   SET public = false,
       file_size_limit = COALESCE(file_size_limit, 52428800),
       allowed_mime_types = COALESCE(
         allowed_mime_types,
         ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']::text[]
       )
 WHERE id = 'invoices';

DROP POLICY IF EXISTS "Public Access to View Invoices" ON storage.objects;

DROP POLICY IF EXISTS "Tenant Isolation Invoices View" ON storage.objects;

DROP POLICY IF EXISTS "Tenant Isolation Invoices Insert" ON storage.objects;

DROP POLICY IF EXISTS "Tenant Isolation Invoices Delete" ON storage.objects;

DROP POLICY IF EXISTS "Authenticated users can view invoices" ON storage.objects;

DROP POLICY IF EXISTS "Authenticated users can upload invoices" ON storage.objects;

DROP POLICY IF EXISTS "Authenticated users can delete invoices" ON storage.objects;

DROP POLICY IF EXISTS "invoices_bucket_authenticated_access" ON storage.objects;

DROP POLICY IF EXISTS "invoices_bucket_org_read" ON storage.objects;

DROP POLICY IF EXISTS "invoices_bucket_org_insert" ON storage.objects;

DROP POLICY IF EXISTS "invoices_bucket_org_delete" ON storage.objects;

DROP POLICY IF EXISTS "invoices_bucket_service_role" ON storage.objects;

CREATE POLICY "invoices_bucket_org_read"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'invoices'
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] = public.get_auth_org()::text
);

CREATE POLICY "invoices_bucket_org_insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'invoices'
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] = public.get_auth_org()::text
);

CREATE POLICY "invoices_bucket_org_delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'invoices'
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] = public.get_auth_org()::text
);

CREATE POLICY "invoices_bucket_service_role"
ON storage.objects
FOR ALL
TO service_role
USING (bucket_id = 'invoices')
WITH CHECK (bucket_id = 'invoices');

-- Source: 20260721000022_remote_lint_cleanup.sql
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- pgTAP helper functions are test-only and should not live in the public runtime schema.
-- Keeping them there causes schema lint failures on modern Postgres catalogs.
DROP EXTENSION IF EXISTS pgtap CASCADE;

-- Source: 20260721200000_fix_integration_cron_and_manual_payment_payout.sql
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule('retry_stuck_integrations')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'retry_stuck_integrations');
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    BEGIN
      PERFORM cron.schedule(
        'retry_stuck_integrations',
        '*/30 * * * *',
        $cron$
        UPDATE public.integrations
           SET is_active = false,
               metadata = jsonb_set(
                 jsonb_set(COALESCE(metadata, '{}'::jsonb), '{sync_status}', '"failed"', true),
                 '{last_error}',
                 '"Timeout during sync"',
                 true
               ),
               updated_at = now()
         WHERE COALESCE(metadata->>'sync_status', metadata->>'status') = 'syncing'
           AND updated_at < now() - interval '1 hour';
        $cron$
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;
END $$;

-- Source: 20260721201000_decommission_orphaned_stripe_sync_worker.sql
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule('stripe-sync-worker')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'stripe-sync-worker');
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;
END $$;

-- Source: 20260722000015_audit_logs_hierarchy_visibility.sql
-- 7. Realtime was silently dead on both audit-log pages: audit_logs was never added to the
--    supabase_realtime publication (confirmed: 0 rows in pg_publication_tables for it), so
--    their postgres_changes subscriptions never fired. Register it (auto-cascades to
--    partitions).
ALTER PUBLICATION supabase_realtime ADD TABLE public.audit_logs;

-- Source: 20260723000001_provider_neutral_ach_foundation.sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Source: 20260723000010_scope_vendor_documents_storage_rls.sql
-- vendor_documents_manager_read/write (both is_manager_or_above() only, no tenant scoping at
-- all) let any manager-tier user in ANY organization read/write ANY object in the bucket,
-- including other tenants' W-9s. _write was FOR ALL, which also covers SELECT -- so dropping
-- only _read and leaving _write in place would NOT have closed the read hole (Postgres ORs
-- permissive policies together, see CLAUDE.md workflow rules). Both must go.
DROP POLICY IF EXISTS vendor_documents_manager_read ON storage.objects;

DROP POLICY IF EXISTS vendor_documents_manager_write ON storage.objects;

-- SELECT/UPDATE/DELETE act on an object that (by the time it's read/modified) always has a
-- matching vendor_documents row -- submit-tax-info and the admin-upload flow both insert that
-- row using the exact same storage_path as storage.objects.name. Scope through that row with
-- the same reference_scope_visible/writable() functions the vendor_documents table itself
-- already uses, so storage access can never be broader than table access.
CREATE POLICY vendor_documents_manager_read
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'vendor_documents'
  AND public.is_manager_or_above()
  AND EXISTS (
    SELECT 1 FROM public.vendor_documents vd
    WHERE vd.storage_path = storage.objects.name
      AND vd.deleted_at IS NULL
      AND public.reference_scope_visible(vd.organization_id, vd.brand_id, vd.location_id, vd.deleted_at)
  )
);

CREATE POLICY vendor_documents_manager_update
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'vendor_documents'
  AND EXISTS (
    SELECT 1 FROM public.vendor_documents vd
    WHERE vd.storage_path = storage.objects.name
      AND vd.deleted_at IS NULL
      AND public.reference_scope_writable(vd.organization_id, vd.brand_id, vd.location_id, vd.deleted_at, 'location_manager')
  )
)
WITH CHECK (
  bucket_id = 'vendor_documents'
  AND EXISTS (
    SELECT 1 FROM public.vendor_documents vd
    WHERE vd.storage_path = storage.objects.name
      AND vd.deleted_at IS NULL
      AND public.reference_scope_writable(vd.organization_id, vd.brand_id, vd.location_id, vd.deleted_at, 'location_manager')
  )
);

CREATE POLICY vendor_documents_manager_delete
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'vendor_documents'
  AND EXISTS (
    SELECT 1 FROM public.vendor_documents vd
    WHERE vd.storage_path = storage.objects.name
      AND vd.deleted_at IS NULL
      AND public.reference_scope_writable(vd.organization_id, vd.brand_id, vd.location_id, vd.deleted_at, 'location_manager')
  )
);

-- INSERT is different: DocumentVault.jsx uploads to storage BEFORE the vendor_documents row
-- exists (admin_uploads/{vendor_id}/{timestamp}_{name}), so there's nothing to join yet. Scope
-- off the vendor_id embedded in the path instead, mirroring how the anon magic-link INSERT
-- policy already scopes off a value derived from the path (the token) rather than a row.
CREATE POLICY vendor_documents_manager_insert
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'vendor_documents'
  AND name ~ '^admin_uploads/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/'
  AND EXISTS (
    SELECT 1 FROM public.vendors v
    WHERE v.id = (split_part(storage.objects.name, '/', 2))::uuid
      AND public.reference_scope_writable(v.organization_id, v.brand_id, v.location_id, NULL, 'location_manager')
  )
);

-- Source: 20260726000002_notification_delivery_preference_enforcement.sql
CREATE OR REPLACE FUNCTION public.enforce_notification_delivery_preference()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_module_key text;
  v_is_critical boolean;
  v_in_app_enabled boolean;
  v_critical_only boolean;
  v_email_enabled boolean;
  v_phone_enabled boolean;
  v_send_email boolean;
  v_send_sms boolean;
  v_functions_url text;
  v_service_role_key text;
  v_url text;
BEGIN
  -- Resolve module key the same way notificationService.js's moduleForNotification() does:
  -- explicit metadata.module_key wins, else map from type, else fall back to 'dashboard'.
  v_module_key := COALESCE(
    NEW.metadata->>'module_key',
    CASE NEW.type
      WHEN 'approval' THEN 'invoices'
      WHEN 'invoice' THEN 'invoices'
      WHEN 'invoice_approved' THEN 'invoices'
      WHEN 'payment' THEN 'payments'
      WHEN 'payment_failed' THEN 'payments'
      WHEN 'billing' THEN 'payments'
      WHEN 'inventory' THEN 'inventory'
      WHEN 'low_inventory' THEN 'inventory'
      WHEN 'order' THEN 'inventory'
      WHEN 'vendor_update' THEN 'vendors'
      WHEN 'labor_alert' THEN 'labor'
      ELSE 'dashboard'
    END
  );

  -- Mirrors notificationService.js's CRITICAL_TYPES / isCriticalNotification().
  v_is_critical := COALESCE((NEW.metadata->>'critical')::boolean, false)
    OR NEW.metadata->>'priority' = 'critical'
    OR NEW.type IN ('error', 'warning', 'payment_failed', 'low_inventory', 'AI_alert');

  SELECT in_app_enabled, critical_only, email_enabled, phone_enabled
    INTO v_in_app_enabled, v_critical_only, v_email_enabled, v_phone_enabled
  FROM public.notification_delivery_preferences
  WHERE user_id = NEW.user_id AND module_key = v_module_key;

  IF NOT FOUND THEN
    -- No stored row => same defaults the table's own column defaults encode.
    v_in_app_enabled := true;
    v_critical_only := false;
    v_email_enabled := false;
    v_phone_enabled := false;
  END IF;

  IF NOT v_in_app_enabled THEN
    RETURN NULL; -- silently cancel the insert, same "skip" behavior createNotification() already does client-side
  END IF;

  IF v_critical_only AND NOT v_is_critical THEN
    RETURN NULL;
  END IF;

  -- A caller that already sends its own specialized email (e.g. send_due_date_reminders(), which
  -- triggers send-due-date-reminder-emails separately) sets this to skip a duplicate generic one.
  IF NEW.metadata->>'skip_channel_dispatch' = 'true' THEN
    RETURN NEW;
  END IF;

  v_send_email := v_email_enabled OR v_is_critical;
  v_send_sms := v_phone_enabled;

  IF v_send_email OR v_send_sms THEN
    BEGIN
      SELECT setting_value INTO v_functions_url FROM private.workflow_runtime_settings WHERE setting_name = 'functions_url';
      SELECT setting_value INTO v_service_role_key FROM private.workflow_runtime_settings WHERE setting_name = 'service_role_key';

      IF v_service_role_key IS NOT NULL AND length(trim(v_service_role_key)) > 0 THEN
        v_url := COALESCE(NULLIF(trim(v_functions_url), ''), 'https://gsupqfmwlsmwoybphimx.supabase.co/functions/v1') || '/notify-channel-dispatch';

        PERFORM net.http_post(
          url := v_url,
          body := jsonb_build_object(
            'user_id', NEW.user_id,
            'title', NEW.title,
            'message', COALESCE(NEW.message, NEW.body),
            'send_email', v_send_email,
            'send_sms', v_send_sms
          ),
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || v_service_role_key
          )
        );
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- The in-app row is already landing via this same trigger's RETURN NEW below; a dispatch
      -- failure (or pg_net/net schema missing locally) must never block that.
      NULL;
    END;
  END IF;

  RETURN NEW;
END;
$$;

-- send_due_date_reminders() (most recently redefined in 20260718000004_fix_reminders_role_list.sql)
-- already triggers its own dedicated send-due-date-reminder-emails call with properly formatted
-- invoice/vendor/amount content; mark its notification inserts so the new trigger above doesn't
-- also fire a second, generic email for the same event. CREATE OR REPLACE with only the
-- metadata's added skip_channel_dispatch key changed; rest of the function body is unchanged
-- from 20260718000004_fix_reminders_role_list.sql:9-108.
CREATE OR REPLACE FUNCTION public.send_due_date_reminders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_setting RECORD;
  v_profile RECORD;
  v_invoice RECORD;
BEGIN
  FOR v_setting IN
    SELECT user_id, organization_id, reminder_days
    FROM public.invoice_reminder_settings
    WHERE enabled = true
  LOOP
    SELECT role, organization_id, brand_id, location_id
      INTO v_profile
    FROM public.profiles
    WHERE id = v_setting.user_id
      AND deleted_at IS NULL;

    IF v_profile.role IS NULL THEN
      CONTINUE;
    END IF;

    FOR v_invoice IN
      SELECT i.id, i.due_date, (i.due_date - CURRENT_DATE) AS days_out
      FROM public.invoices i
      WHERE i.deleted_at IS NULL
        AND i.organization_id = v_setting.organization_id
        AND COALESCE(i.payment_status, 'unpaid') NOT IN ('paid', 'auto_pay')
        AND i.due_date IS NOT NULL
        AND (i.due_date - CURRENT_DATE) = ANY(v_setting.reminder_days)
        AND (
          v_profile.role IN ('org_manager', 'tenant_super_admin', 'platform_admin')
          OR (
            v_profile.role = 'branch_manager'
            AND (
              i.brand_id = v_profile.brand_id
              OR i.location_id IN (SELECT l.id FROM public.locations l WHERE l.brand_id = v_profile.brand_id)
            )
          )
          OR (
            v_profile.role IN ('location_manager', 'ground_staff')
            AND i.location_id = v_profile.location_id
          )
        )
    LOOP
      INSERT INTO public.invoice_reminder_log (invoice_id, user_id, reminder_day)
      VALUES (v_invoice.id, v_setting.user_id, v_invoice.days_out)
      ON CONFLICT (invoice_id, user_id, reminder_day) DO NOTHING;

      IF FOUND THEN
        INSERT INTO public.notifications (user_id, organization_id, type, title, message, is_read, metadata)
        VALUES (
          v_setting.user_id,
          v_setting.organization_id,
          'invoice',
          CASE WHEN v_invoice.days_out <= 0 THEN 'Invoice overdue' ELSE 'Invoice due soon' END,
          CASE WHEN v_invoice.days_out <= 0
            THEN format('An invoice was due on %s and is still unpaid.', to_char(v_invoice.due_date, 'Mon DD, YYYY'))
            ELSE format('An invoice is due in %s day%s (%s).', v_invoice.days_out, CASE WHEN v_invoice.days_out = 1 THEN '' ELSE 's' END, to_char(v_invoice.due_date, 'Mon DD, YYYY'))
          END,
          false,
          jsonb_build_object('invoice_id', v_invoice.id, 'due_in_days', v_invoice.days_out, 'skip_channel_dispatch', true)
        );
      END IF;
    END LOOP;
  END LOOP;

  -- Trigger the email side (plain SQL can't call Resend). Same secure-dispatch pattern as
  -- dispatch_webhook_queue(): read the functions URL/service key from
  -- private.workflow_runtime_settings rather than hardcoding credentials in this function.
  DECLARE
    v_functions_url text;
    v_service_role_key text;
    v_url text;
  BEGIN
    SELECT setting_value INTO v_functions_url FROM private.workflow_runtime_settings WHERE setting_name = 'functions_url';
    SELECT setting_value INTO v_service_role_key FROM private.workflow_runtime_settings WHERE setting_name = 'service_role_key';

    IF v_service_role_key IS NOT NULL AND length(trim(v_service_role_key)) > 0 THEN
      v_url := COALESCE(NULLIF(trim(v_functions_url), ''), 'https://gsupqfmwlsmwoybphimx.supabase.co/functions/v1') || '/send-due-date-reminder-emails';

      PERFORM net.http_post(
        url := v_url,
        body := '{}'::jsonb,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_service_role_key
        )
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END;
$$;

-- Source: 20260726000004_schedule_missing_notification_cron_jobs.sql
DO $$
DECLARE
  v_functions_url text;
  v_service_role_key text;
  v_reports_url text;
  v_expiry_url text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RETURN;
  END IF;

  SELECT setting_value INTO v_functions_url FROM private.workflow_runtime_settings WHERE setting_name = 'functions_url';
  SELECT setting_value INTO v_service_role_key FROM private.workflow_runtime_settings WHERE setting_name = 'service_role_key';

  IF v_service_role_key IS NULL OR length(trim(v_service_role_key)) = 0 THEN
    RAISE NOTICE 'Skipping schedule-reports/onboarding-expiry-monitor cron schedule: private.workflow_runtime_settings.service_role_key is not configured';
    RETURN;
  END IF;

  v_reports_url := COALESCE(NULLIF(trim(v_functions_url), ''), 'https://gsupqfmwlsmwoybphimx.supabase.co/functions/v1') || '/schedule-reports';
  v_expiry_url := COALESCE(NULLIF(trim(v_functions_url), ''), 'https://gsupqfmwlsmwoybphimx.supabase.co/functions/v1') || '/onboarding-expiry-monitor';

  BEGIN
    PERFORM cron.unschedule('schedule-reports')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'schedule-reports');

    PERFORM cron.schedule(
      'schedule-reports',
      '0 6 * * *',
      format(
        'SELECT net.http_post(%L, ''{}''::jsonb, jsonb_build_object(%L, %L, %L, %L));',
        v_reports_url,
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_service_role_key
      )
    );
  EXCEPTION WHEN OTHERS THEN
    NULL; -- local/CI without cron privileges: skip, not fatal
  END;

  BEGIN
    PERFORM cron.unschedule('onboarding-expiry-monitor')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'onboarding-expiry-monitor');

    PERFORM cron.schedule(
      'onboarding-expiry-monitor',
      '0 9 * * *',
      format(
        'SELECT net.http_post(%L, ''{}''::jsonb, jsonb_build_object(%L, %L, %L, %L));',
        v_expiry_url,
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_service_role_key
      )
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END $$;

-- Source: 20260727000000_notification_dispatch_result_tracking.sql
CREATE OR REPLACE FUNCTION public.enforce_notification_delivery_preference()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_module_key text;
  v_is_critical boolean;
  v_in_app_enabled boolean;
  v_critical_only boolean;
  v_email_enabled boolean;
  v_phone_enabled boolean;
  v_send_email boolean;
  v_send_sms boolean;
  v_functions_url text;
  v_service_role_key text;
  v_url text;
BEGIN
  v_module_key := COALESCE(
    NEW.metadata->>'module_key',
    CASE NEW.type
      WHEN 'approval' THEN 'invoices'
      WHEN 'invoice' THEN 'invoices'
      WHEN 'invoice_approved' THEN 'invoices'
      WHEN 'payment' THEN 'payments'
      WHEN 'payment_failed' THEN 'payments'
      WHEN 'billing' THEN 'payments'
      WHEN 'inventory' THEN 'inventory'
      WHEN 'low_inventory' THEN 'inventory'
      WHEN 'order' THEN 'inventory'
      WHEN 'vendor_update' THEN 'vendors'
      WHEN 'labor_alert' THEN 'labor'
      ELSE 'dashboard'
    END
  );

  v_is_critical := COALESCE((NEW.metadata->>'critical')::boolean, false)
    OR NEW.metadata->>'priority' = 'critical'
    OR NEW.type IN ('error', 'warning', 'payment_failed', 'low_inventory', 'AI_alert');

  SELECT in_app_enabled, critical_only, email_enabled, phone_enabled
    INTO v_in_app_enabled, v_critical_only, v_email_enabled, v_phone_enabled
  FROM public.notification_delivery_preferences
  WHERE user_id = NEW.user_id AND module_key = v_module_key;

  IF NOT FOUND THEN
    v_in_app_enabled := true;
    v_critical_only := false;
    v_email_enabled := false;
    v_phone_enabled := false;
  END IF;

  IF NOT v_in_app_enabled THEN
    RETURN NULL;
  END IF;

  IF v_critical_only AND NOT v_is_critical THEN
    RETURN NULL;
  END IF;

  IF NEW.metadata->>'skip_channel_dispatch' = 'true' THEN
    RETURN NEW;
  END IF;

  v_send_email := v_email_enabled OR v_is_critical;
  v_send_sms := v_phone_enabled;

  IF v_send_email OR v_send_sms THEN
    BEGIN
      SELECT setting_value INTO v_functions_url FROM private.workflow_runtime_settings WHERE setting_name = 'functions_url';
      SELECT setting_value INTO v_service_role_key FROM private.workflow_runtime_settings WHERE setting_name = 'service_role_key';

      IF v_service_role_key IS NOT NULL AND length(trim(v_service_role_key)) > 0 THEN
        v_url := COALESCE(NULLIF(trim(v_functions_url), ''), 'https://gsupqfmwlsmwoybphimx.supabase.co/functions/v1') || '/notify-channel-dispatch';

        PERFORM net.http_post(
          url := v_url,
          body := jsonb_build_object(
            'notification_id', NEW.id,
            'user_id', NEW.user_id,
            'title', NEW.title,
            'message', COALESCE(NEW.message, NEW.body),
            'send_email', v_send_email,
            'send_sms', v_send_sms
          ),
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || v_service_role_key
          )
        );
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- Same rule as before: a dispatch failure must never block the in-app row landing.
      NULL;
    END;
  END IF;

  RETURN NEW;
END;
$$;

