-- 5.3: file-count/total-bytes tracking per org, aggregated off invoice_documents
-- (populated since the register_invoice_document RPC landed). SECURITY INVOKER so it
-- naturally respects the caller's existing RLS on invoice_documents (financial_scope
-- visibility) rather than duplicating scope logic -- an org_manager sees their org's full
-- totals, a location_manager sees only what they can already see.

CREATE OR REPLACE FUNCTION public.get_org_document_stats()
RETURNS TABLE (
  organization_id uuid,
  file_count bigint,
  total_bytes bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
  SELECT
    organization_id,
    count(*) AS file_count,
    COALESCE(sum(file_size), 0) AS total_bytes
  FROM public.invoice_documents
  GROUP BY organization_id;
$function$;

REVOKE ALL ON FUNCTION public.get_org_document_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_org_document_stats() TO authenticated;
