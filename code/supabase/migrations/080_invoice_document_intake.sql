-- 080: Invoice document intake and secure credentials
-- Creates tables for document intake and ingestion jobs. Enables vault for secure integration credentials.

BEGIN;

CREATE SCHEMA IF NOT EXISTS pgsodium;
CREATE EXTENSION IF NOT EXISTS "pgsodium" WITH SCHEMA pgsodium;

CREATE SCHEMA IF NOT EXISTS vault;
CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA vault;

CREATE TABLE IF NOT EXISTS public.invoice_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID REFERENCES public.invoices(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT,
  file_size BIGINT,
  file_hash TEXT,
  source TEXT CHECK (source IN ('upload', 'email', 'edi', 'mobile', 'api')),
  page_count INTEGER DEFAULT 1,
  thumbnails JSONB DEFAULT '[]'::jsonb,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.invoice_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Invoice documents read access" ON public.invoice_documents;
CREATE POLICY "Invoice documents read access" ON public.invoice_documents FOR SELECT USING (
  public.is_platform_admin()
  OR organization_id = public.get_my_org()
  OR organization_id IN (
    SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Invoice documents write access" ON public.invoice_documents;
CREATE POLICY "Invoice documents write access" ON public.invoice_documents FOR ALL USING (
  public.is_platform_admin()
  OR organization_id = public.get_my_org()
  OR organization_id IN (
    SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
  )
) WITH CHECK (
  public.is_platform_admin()
  OR organization_id = public.get_my_org()
  OR organization_id IN (
    SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
  )
);

CREATE OR REPLACE FUNCTION public.touch_invoice_documents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_invoice_documents_updated_at ON public.invoice_documents;
CREATE TRIGGER trg_invoice_documents_updated_at
  BEFORE UPDATE ON public.invoice_documents
  FOR EACH ROW EXECUTE FUNCTION public.touch_invoice_documents_updated_at();


CREATE TABLE IF NOT EXISTS public.invoice_ingestion_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  source TEXT CHECK (source IN ('email', 'upload', 'api')),
  status TEXT CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'retrying')),
  source_metadata JSONB DEFAULT '{}'::jsonb,
  error_details TEXT,
  attempts INTEGER DEFAULT 0,
  next_retry_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.invoice_ingestion_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Ingestion jobs read access" ON public.invoice_ingestion_jobs;
CREATE POLICY "Ingestion jobs read access" ON public.invoice_ingestion_jobs FOR SELECT USING (
  public.is_platform_admin()
  OR organization_id = public.get_my_org()
  OR organization_id IN (
    SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Ingestion jobs write access" ON public.invoice_ingestion_jobs;
CREATE POLICY "Ingestion jobs write access" ON public.invoice_ingestion_jobs FOR ALL USING (
  public.is_platform_admin()
  OR organization_id = public.get_my_org()
  OR organization_id IN (
    SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
  )
) WITH CHECK (
  public.is_platform_admin()
  OR organization_id = public.get_my_org()
  OR organization_id IN (
    SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
  )
);

CREATE OR REPLACE FUNCTION public.touch_invoice_ingestion_jobs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_invoice_ingestion_jobs_updated_at ON public.invoice_ingestion_jobs;
CREATE TRIGGER trg_invoice_ingestion_jobs_updated_at
  BEFORE UPDATE ON public.invoice_ingestion_jobs
  FOR EACH ROW EXECUTE FUNCTION public.touch_invoice_ingestion_jobs_updated_at();

-- Add secure integration credential storage function
CREATE OR REPLACE FUNCTION public.save_secure_integration_credential(
  p_organization_id UUID,
  p_provider TEXT,
  p_metadata JSONB,
  p_secret TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_secret_id UUID;
  v_integration_id UUID;
  v_result JSONB;
BEGIN
  -- Validate permissions
  IF NOT public.is_platform_admin() AND NOT (public.is_manager_or_above() AND public.get_my_org() = p_organization_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- Store secret in vault
  SELECT id INTO v_secret_id FROM vault.secrets WHERE name = p_provider || '_' || p_organization_id::text;
  IF v_secret_id IS NOT NULL THEN
    -- Update existing secret (pgsodium/vault does not support direct update easily, so delete and insert)
    DELETE FROM vault.secrets WHERE id = v_secret_id;
  END IF;
  
  SELECT * INTO v_secret_id FROM vault.create_secret(p_secret, p_provider || '_' || p_organization_id::text, 'Email IMAP Password');

  -- Update or insert integration
  SELECT id INTO v_integration_id FROM public.integrations WHERE organization_id = p_organization_id AND provider = p_provider;
  
  -- Create new metadata with secret_id instead of raw password
  p_metadata = p_metadata - 'password' || jsonb_build_object('secret_id', v_secret_id);

  IF v_integration_id IS NOT NULL THEN
    UPDATE public.integrations SET metadata = p_metadata WHERE id = v_integration_id RETURNING jsonb_build_object('id', id, 'metadata', metadata) INTO v_result;
  ELSE
    INSERT INTO public.integrations (organization_id, provider, metadata, is_active) VALUES (p_organization_id, p_provider, p_metadata, true) RETURNING jsonb_build_object('id', id, 'metadata', metadata) INTO v_result;
  END IF;

  RETURN v_result;
END;
$$;

COMMIT;
