-- Dedicated tenant adapter for vendor_statement_lines.
-- The table is child-scoped by statement_id and does not contain organization_id,
-- so it cannot use the generic tenant_insert_row RPC.

BEGIN;

CREATE OR REPLACE FUNCTION public.tenant_insert_vendor_statement_lines(
  p_organization_id UUID,
  p_lines JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
VOLATILE
SET search_path = ''
AS $$
DECLARE
  route JSONB;
  target_schema TEXT;
  result JSONB;
  sql TEXT;
BEGIN
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_id is required';
  END IF;

  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' THEN
    RAISE EXCEPTION 'lines must be a JSON array';
  END IF;

  PERFORM public.assert_tenant_scope(p_organization_id, NULL, NULL);

  route := public.get_tenant_data_route(p_organization_id, NULL, NULL);
  target_schema := COALESCE(route->>'write_target', 'public');

  IF target_schema <> 'public' AND target_schema !~ '^tenant_[a-z0-9_]+$' THEN
    RAISE EXCEPTION 'Unsafe tenant target schema: %', target_schema;
  END IF;

  IF to_regclass(format('%I.vendor_statement_lines', target_schema)) IS NULL THEN
    RAISE EXCEPTION 'Routed vendor_statement_lines table does not exist: %', target_schema;
  END IF;

  sql := format(
    'WITH inserted AS (
       INSERT INTO %I.vendor_statement_lines (
         statement_id,
         invoice_number,
         invoice_date,
         amount,
         status,
         matched_invoice_id,
         notes
       )
       SELECT
         statement_id,
         invoice_number,
         invoice_date,
         amount,
         COALESCE(status, ''unmatched''),
         matched_invoice_id,
         notes
       FROM jsonb_to_recordset($1) AS line(
         statement_id UUID,
         invoice_number TEXT,
         invoice_date DATE,
         amount NUMERIC,
         status TEXT,
         matched_invoice_id UUID,
         notes TEXT
       )
       RETURNING *
     )
     SELECT COALESCE(jsonb_agg(to_jsonb(inserted)), ''[]''::jsonb) FROM inserted',
    target_schema
  );

  EXECUTE sql USING p_lines INTO result;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.tenant_insert_vendor_statement_lines(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tenant_insert_vendor_statement_lines(UUID, JSONB) TO authenticated, service_role;

COMMENT ON FUNCTION public.tenant_insert_vendor_statement_lines(UUID, JSONB) IS
  'Tenant-routed bulk insert for vendor statement lines, scoped through the parent statement organization.';

COMMIT;
