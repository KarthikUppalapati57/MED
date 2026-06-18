-- Resolve remote lint errors after API-role grant mitigations.
--
-- Fixes get_location_benchmarks referencing a non-existent user_profiles table
-- and removes an unused variable from get_three_way_match_status.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_location_benchmarks(
  p_organization_id uuid,
  p_start_date date,
  p_end_date date
)
RETURNS TABLE (
  location_id uuid,
  location_name text,
  total_revenue numeric,
  total_cogs numeric,
  total_labor numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM public.profiles p
     WHERE p.id = auth.uid()
       AND p.organization_id = p_organization_id
       AND p.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  WITH sales AS (
    SELECT
      m.location_id,
      SUM(m.total_revenue) AS rev
    FROM public.mv_daily_sales_summary m
    WHERE m.organization_id = p_organization_id
      AND m.date >= p_start_date
      AND m.date <= p_end_date
    GROUP BY m.location_id
  ),
  cogs AS (
    SELECT
      i.location_id,
      SUM(i.total_amount) AS cogs
    FROM public.invoices i
    WHERE i.organization_id = p_organization_id
      AND i.invoice_date >= p_start_date
      AND i.invoice_date <= p_end_date
    GROUP BY i.location_id
  ),
  labor AS (
    SELECT
      s.location_id,
      SUM(s.labor_cost) AS labor
    FROM public.employee_shifts s
    WHERE s.organization_id = p_organization_id
      AND DATE(s.shift_start) >= p_start_date
      AND DATE(s.shift_start) <= p_end_date
    GROUP BY s.location_id
  )
  SELECT
    l.id AS location_id,
    l.name AS location_name,
    COALESCE(s.rev, 0)::numeric AS total_revenue,
    COALESCE(c.cogs, 0)::numeric AS total_cogs,
    COALESCE(lab.labor, 0)::numeric AS total_labor
  FROM public.locations l
  LEFT JOIN sales s ON l.id = s.location_id
  LEFT JOIN cogs c ON l.id = c.location_id
  LEFT JOIN labor lab ON l.id = lab.location_id
  WHERE l.organization_id = p_organization_id
  ORDER BY COALESCE(s.rev, 0) DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_three_way_match_status(p_purchase_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_po record;
  v_invoice record;
  v_po_total numeric := 0;
  v_inv_total numeric := 0;
  v_rec_qty numeric := 0;
  v_po_qty numeric := 0;
  v_variance_amount numeric := 0;
  v_variance_percent numeric := 0;
  v_status text := 'matched';
BEGIN
  SELECT * INTO v_po FROM public.purchase_orders WHERE id = p_purchase_order_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'PO not found');
  END IF;

  v_po_total := v_po.total_amount;

  SELECT * INTO v_invoice
    FROM public.invoices
   WHERE purchase_order_id = p_purchase_order_id
   ORDER BY created_at DESC
   LIMIT 1;

  IF FOUND THEN
    v_inv_total := v_invoice.total_amount;
  END IF;

  SELECT COALESCE(SUM(quantity), 0)
    INTO v_po_qty
    FROM public.purchase_order_items
   WHERE purchase_order_id = p_purchase_order_id;

  SELECT COALESCE(SUM(ri.quantity_received), 0)
    INTO v_rec_qty
    FROM public.receivings r
    JOIN public.receiving_items ri ON ri.receiving_id = r.id
   WHERE r.purchase_order_id = p_purchase_order_id;

  IF v_inv_total > 0 AND v_po_total > 0 THEN
    v_variance_amount := ABS(v_inv_total - v_po_total);
    v_variance_percent := (v_variance_amount / v_po_total) * 100;
  END IF;

  IF v_rec_qty < v_po_qty THEN
    v_status := 'quantity_variance';
  END IF;

  IF v_variance_percent > 5 OR v_variance_amount > 50 THEN
    v_status := 'price_variance';
  END IF;

  IF v_rec_qty < v_po_qty AND (v_variance_percent > 5 OR v_variance_amount > 50) THEN
    v_status := 'critical_variance';
  END IF;

  RETURN jsonb_build_object(
    'po_total', v_po_total,
    'invoice_total', v_inv_total,
    'po_quantity', v_po_qty,
    'received_quantity', v_rec_qty,
    'variance_amount', v_variance_amount,
    'variance_percent', v_variance_percent,
    'match_status', v_status
  );
END;
$$;

COMMIT;
