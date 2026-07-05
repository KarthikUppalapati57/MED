BEGIN;

CREATE OR REPLACE FUNCTION public.validate_invoice(p_invoice_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice public.invoices%ROWTYPE;
  v_line_discrepancies jsonb := '[]'::jsonb;
  v_total_discrepancies jsonb := '[]'::jsonb;
  v_discrepancies jsonb := '[]'::jsonb;
  v_line record;
  v_expected_line_total numeric;
  v_line_sum numeric := 0;
  v_expected_total numeric;
  v_result jsonb;
BEGIN
  SELECT *
    INTO v_invoice
  FROM public.invoices
  WHERE id = p_invoice_id
    AND public.tenant_scope_visible(organization_id, brand_id, location_id, deleted_at);

  IF v_invoice.id IS NULL THEN
    RAISE EXCEPTION 'Invoice % not found or not visible', p_invoice_id;
  END IF;

  FOR v_line IN
    SELECT id, quantity, unit_price, total_price
    FROM public.invoice_line_items
    WHERE invoice_id = p_invoice_id
  LOOP
    v_expected_line_total := COALESCE(v_line.quantity, 0) * COALESCE(v_line.unit_price, 0);
    v_line_sum := v_line_sum + COALESCE(v_line.total_price, 0);

    -- ponytail: fixed 0.01 epsilon assumes 2-decimal money and is not
    -- currency-aware. Upgrade path: derive epsilon from currency scale.
    IF abs(v_expected_line_total - COALESCE(v_line.total_price, 0)) >= 0.01 THEN
      v_line_discrepancies := v_line_discrepancies || jsonb_build_array(
        jsonb_build_object(
          'line_id', v_line.id,
          'field', 'total_price',
          'expected', v_expected_line_total,
          'got', COALESCE(v_line.total_price, 0)
        )
      );
    END IF;
  END LOOP;

  IF abs(v_line_sum - COALESCE(v_invoice.subtotal, 0)) >= 0.01 THEN
    v_total_discrepancies := v_total_discrepancies || jsonb_build_array(
      jsonb_build_object(
        'field', 'subtotal',
        'expected', v_line_sum,
        'got', COALESCE(v_invoice.subtotal, 0)
      )
    );
  END IF;

  v_expected_total :=
    COALESCE(v_invoice.subtotal, 0)
    + COALESCE(v_invoice.tax_amount, 0)
    + COALESCE(v_invoice.fuel_surcharge, 0)
    + COALESCE(v_invoice.delivery_fee, 0)
    + COALESCE(v_invoice.other_charges, 0);

  IF abs(v_expected_total - COALESCE(v_invoice.total_amount, 0)) >= 0.01 THEN
    v_total_discrepancies := v_total_discrepancies || jsonb_build_array(
      jsonb_build_object(
        'field', 'total_amount',
        'expected', v_expected_total,
        'got', COALESCE(v_invoice.total_amount, 0)
      )
    );
  END IF;

  v_discrepancies := v_line_discrepancies || v_total_discrepancies;

  v_result := jsonb_build_object(
    'line_math', CASE WHEN jsonb_array_length(v_line_discrepancies) = 0 THEN 'pass' ELSE 'fail' END,
    'total_math', CASE WHEN jsonb_array_length(v_total_discrepancies) = 0 THEN 'pass' ELSE 'fail' END,
    'discrepancies', v_discrepancies
  );

  UPDATE public.invoices
     SET validation_results = COALESCE(validation_results, '{}'::jsonb) || v_result,
         updated_at = now()
   WHERE id = p_invoice_id;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.validate_invoice(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.validate_invoice(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.validate_invoice(uuid) TO authenticated, service_role;

COMMIT;
