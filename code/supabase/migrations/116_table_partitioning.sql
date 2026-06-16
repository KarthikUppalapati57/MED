-- Phase 5 Track A: High-Volume Data Partitioning

-- 1. Rename existing tables to safely archive them and free up the names
ALTER TABLE public.audit_logs RENAME TO audit_logs_old;
ALTER TABLE public.error_logs RENAME TO error_logs_old;

-- Rename indexes so we can reuse the names for the new partitioned tables
ALTER INDEX IF EXISTS idx_audit_logs_module RENAME TO idx_audit_logs_module_old;
ALTER INDEX IF EXISTS idx_audit_logs_user_id RENAME TO idx_audit_logs_user_id_old;
ALTER INDEX IF EXISTS idx_audit_logs_organization_id RENAME TO idx_audit_logs_organization_id_old;

ALTER INDEX IF EXISTS idx_error_logs_created_at RENAME TO idx_error_logs_created_at_old;
ALTER INDEX IF EXISTS idx_error_logs_severity RENAME TO idx_error_logs_severity_old;
ALTER INDEX IF EXISTS idx_error_logs_user_id RENAME TO idx_error_logs_user_id_old;

-- 2. Create the partitioned `audit_logs` table
CREATE TABLE public.audit_logs (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    organization_id uuid,
    user_id uuid,
    action text NOT NULL,
    table_name text NOT NULL,
    record_id uuid,
    old_data jsonb,
    new_data jsonb,
    ip_address text,
    user_agent text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    entity_type text,
    entity_id text,
    module text,
    field_changed text,
    old_value text,
    new_value text,
    user_email text,
    details text,
    org_id uuid,
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- Create partitions for audit_logs
CREATE TABLE public.audit_logs_y2025 PARTITION OF public.audit_logs
    FOR VALUES FROM ('2025-01-01') TO ('2026-01-01');

CREATE TABLE public.audit_logs_y2026 PARTITION OF public.audit_logs
    FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');

CREATE TABLE public.audit_logs_default PARTITION OF public.audit_logs DEFAULT;

-- Recreate indexes on audit_logs (PostgreSQL 11+ automatically cascades these to partitions)
CREATE INDEX idx_audit_logs_module ON public.audit_logs USING btree (module);
CREATE INDEX idx_audit_logs_user_id ON public.audit_logs USING btree (user_id);
CREATE INDEX idx_audit_logs_organization_id ON public.audit_logs USING btree (organization_id);

-- Enable RLS and recreate policies for audit_logs
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "System can insert audit logs" ON public.audit_logs
    FOR INSERT TO public WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "audit_logs_authenticated_insert" ON public.audit_logs
    FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Platform admins can view all audit logs" ON public.audit_logs
    FOR SELECT USING (
        EXISTS ( SELECT 1 FROM profiles WHERE profiles.id = (select auth.uid()) AND profiles.role = 'platform_admin'::text )
    );

-- 3. Create the partitioned `error_logs` table
CREATE TABLE public.error_logs (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    message text NOT NULL,
    stack text,
    component_stack text,
    route text,
    user_id uuid,
    severity text DEFAULT 'error',
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- Create partitions for error_logs
CREATE TABLE public.error_logs_y2025 PARTITION OF public.error_logs
    FOR VALUES FROM ('2025-01-01') TO ('2026-01-01');

CREATE TABLE public.error_logs_y2026 PARTITION OF public.error_logs
    FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');

CREATE TABLE public.error_logs_default PARTITION OF public.error_logs DEFAULT;

-- Recreate indexes on error_logs
CREATE INDEX idx_error_logs_created_at ON public.error_logs USING btree (created_at DESC);
CREATE INDEX idx_error_logs_severity ON public.error_logs USING btree (severity);
CREATE INDEX idx_error_logs_user_id ON public.error_logs USING btree (user_id);

-- Enable RLS and recreate policies for error_logs
ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "error_logs_authenticated_insert" ON public.error_logs
    FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

-- 4. Migrate existing data seamlessly into the new partitioned structures
-- Setting created_at to now() if it's null to satisfy NOT NULL constraints.
INSERT INTO public.audit_logs 
SELECT 
    id, organization_id, user_id, action, table_name, record_id, 
    old_data, new_data, ip_address, user_agent, COALESCE(created_at, now()), 
    entity_type, entity_id, module, field_changed, old_value, new_value, 
    user_email, details, org_id 
FROM public.audit_logs_old;

INSERT INTO public.error_logs 
SELECT 
    id, message, stack, component_stack, route, user_id, 
    severity, metadata, COALESCE(created_at, now())
FROM public.error_logs_old;

-- 5. Drop the old unpartitioned tables
DROP TABLE public.audit_logs_old;
DROP TABLE public.error_logs_old;
