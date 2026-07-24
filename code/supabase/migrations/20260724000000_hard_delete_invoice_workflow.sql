-- 20260724000000: Change invoice workflow deletion from soft delete to hard delete.

CREATE OR REPLACE FUNCTION public.hard_delete_invoice_workflow(p_invoice_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_invoice RECORD;
BEGIN
  SELECT id, organization_id
    INTO v_invoice
  FROM public.invoices
  WHERE id = p_invoice_id
  FOR UPDATE;

  IF v_invoice.id IS NULL THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  PERFORM public.assert_financial_actor(v_invoice.organization_id);

  -- Cascading deletes of approved/paid invoice_line_items pass through the
  -- same internal bypass used by product sync. This keeps edit protection in
  -- place while allowing an intentional invoice hard delete to complete.
  PERFORM set_config('app.invoice_product_sync', 'on', true);

  DELETE FROM public.invoices
   WHERE id = p_invoice_id;

  PERFORM set_config('app.invoice_product_sync', '', true);

  RETURN FOUND;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.invoice_product_sync', '', true);
  RAISE;
END;
$$;

COMMENT ON FUNCTION public.hard_delete_invoice_workflow(UUID)
IS 'Permanently deletes an invoice row after financial actor authorization. Related rows follow their foreign key cascade/set-null rules.';

REVOKE ALL ON FUNCTION public.hard_delete_invoice_workflow(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hard_delete_invoice_workflow(UUID) TO authenticated, service_role;

-- Backward compatibility for older clients that still call the previous RPC name.
CREATE OR REPLACE FUNCTION public.soft_delete_invoice_workflow(p_invoice_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN public.hard_delete_invoice_workflow(p_invoice_id);
END;
$$;

COMMENT ON FUNCTION public.soft_delete_invoice_workflow(UUID)
IS 'Compatibility wrapper. Invoice deletion is now hard delete via hard_delete_invoice_workflow.';

REVOKE ALL ON FUNCTION public.soft_delete_invoice_workflow(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.soft_delete_invoice_workflow(UUID) TO authenticated, service_role;
