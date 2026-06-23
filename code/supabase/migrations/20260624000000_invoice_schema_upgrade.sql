-- Migration 20260624000000_invoice_schema_upgrade.sql
-- Goal: Add payment terms, soft-delete archiving, and total_price enforcement to invoices.
-- Applies to tenant_template and dynamically propagates to all existing active tenants.

BEGIN;

-- 1. Upgrade the blueprint schema (tenant_template)
ALTER TABLE tenant_template.invoices 
  ADD COLUMN IF NOT EXISTS payment_terms TEXT,
  ADD COLUMN IF NOT EXISTS discount_date DATE,
  ADD COLUMN IF NOT EXISTS extraction_started_at TIMESTAMPTZ;

-- 2. Create the archived_invoices table in the template
CREATE TABLE IF NOT EXISTS tenant_template.archived_invoices (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL,
  vendor_name TEXT,
  invoice_number TEXT,
  total_amount NUMERIC(10,2),
  status TEXT,
  file_url TEXT,
  archived_at TIMESTAMPTZ DEFAULT now(),
  original_created_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE tenant_template.archived_invoices ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE tenant_template.archived_invoices TO service_role;

-- 3. Create the Archiving Trigger Function
CREATE OR REPLACE FUNCTION public.archive_deleted_invoice()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Insert into the exact schema where the delete occurred
  EXECUTE format(
    'INSERT INTO %I.archived_invoices (id, organization_id, vendor_name, invoice_number, total_amount, status, file_url, original_created_at, deleted_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
    TG_TABLE_SCHEMA
  )
  USING OLD.id, OLD.organization_id, OLD.vendor_name, OLD.invoice_number, OLD.total_amount, OLD.status, OLD.file_url, OLD.created_at, auth.uid();
  RETURN OLD;
END;
$$;

-- 4. Apply Trigger to template
DROP TRIGGER IF EXISTS archive_invoice_on_delete ON tenant_template.invoices;
CREATE TRIGGER archive_invoice_on_delete
BEFORE DELETE ON tenant_template.invoices
FOR EACH ROW
EXECUTE FUNCTION public.archive_deleted_invoice();

-- 5. Create trigger function to enforce line item total price
CREATE OR REPLACE FUNCTION public.enforce_invoice_line_item_total()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.extended_price := COALESCE(NEW.quantity, 0) * COALESCE(NEW.unit_price, 0);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_line_item_total ON tenant_template.invoice_line_items;
CREATE TRIGGER enforce_line_item_total
BEFORE INSERT OR UPDATE ON tenant_template.invoice_line_items
FOR EACH ROW
EXECUTE FUNCTION public.enforce_invoice_line_item_total();

-- 6. Add to tenant_template_tables manifest so future tenants get the archive table
INSERT INTO public.tenant_template_tables (table_name, table_group, copy_order, is_required)
VALUES ('archived_invoices', 'finance', 15, false)
ON CONFLICT (table_name) DO NOTHING;


-- 7. Propagate all changes to EXISTING tenant schemas
DO $$
DECLARE
  tenant RECORD;
  schema_name TEXT;
BEGIN
  FOR tenant IN SELECT * FROM public.tenant_registry WHERE status IN ('active', 'migrating') LOOP
    schema_name := tenant.schema_name;

    -- Upgrade columns
    EXECUTE format('ALTER TABLE %I.invoices ADD COLUMN IF NOT EXISTS payment_terms TEXT;', schema_name);
    EXECUTE format('ALTER TABLE %I.invoices ADD COLUMN IF NOT EXISTS discount_date DATE;', schema_name);
    EXECUTE format('ALTER TABLE %I.invoices ADD COLUMN IF NOT EXISTS extraction_started_at TIMESTAMPTZ;', schema_name);

    -- Create archived_invoices table in tenant schema
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS %I.archived_invoices (LIKE tenant_template.archived_invoices INCLUDING ALL);',
      schema_name
    );
    EXECUTE format('ALTER TABLE %I.archived_invoices ENABLE ROW LEVEL SECURITY;', schema_name);
    EXECUTE format('GRANT ALL ON TABLE %I.archived_invoices TO service_role;', schema_name);

    -- Apply archive trigger
    EXECUTE format('DROP TRIGGER IF EXISTS archive_invoice_on_delete ON %I.invoices;', schema_name);
    EXECUTE format(
      'CREATE TRIGGER archive_invoice_on_delete BEFORE DELETE ON %I.invoices FOR EACH ROW EXECUTE FUNCTION public.archive_deleted_invoice();',
      schema_name
    );

    -- Apply total price trigger
    EXECUTE format('DROP TRIGGER IF EXISTS enforce_line_item_total ON %I.invoice_line_items;', schema_name);
    EXECUTE format(
      'CREATE TRIGGER enforce_line_item_total BEFORE INSERT OR UPDATE ON %I.invoice_line_items FOR EACH ROW EXECUTE FUNCTION public.enforce_invoice_line_item_total();',
      schema_name
    );

    RAISE NOTICE 'Upgraded schema %', schema_name;
  END LOOP;
END;
$$;

COMMIT;
