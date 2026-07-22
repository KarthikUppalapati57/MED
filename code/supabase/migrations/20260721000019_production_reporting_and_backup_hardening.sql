BEGIN;

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

CREATE OR REPLACE FUNCTION public.run_custom_report(p_metrics TEXT[], p_dimension TEXT, p_start_date DATE DEFAULT NULL, p_end_date DATE DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org UUID := public.get_auth_org();
  v_start DATE := COALESCE(p_start_date, CURRENT_DATE - INTERVAL '30 days');
  v_end DATE := COALESCE(p_end_date, CURRENT_DATE);
  v_result JSONB;
BEGIN
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'organization context is required';
  END IF;

  IF p_dimension NOT IN ('date', 'week', 'month', 'location') THEN
    RAISE EXCEPTION 'unsupported report dimension: %', p_dimension;
  END IF;

  WITH pos_rollup AS (
    SELECT
      CASE p_dimension
        WHEN 'date' THEN to_char(date_trunc('day', po.order_date), 'YYYY-MM-DD')
        WHEN 'week' THEN to_char(date_trunc('week', po.order_date), 'IYYY-IW')
        WHEN 'month' THEN to_char(date_trunc('month', po.order_date), 'YYYY-MM')
        WHEN 'location' THEN COALESCE(l.name, 'Unassigned')
      END AS dimension,
      SUM(po.total_amount)::NUMERIC AS sales_revenue,
      COUNT(*)::NUMERIC AS pos_transaction_count
    FROM public.pos_orders po
    LEFT JOIN public.locations l ON l.id = po.location_id
    WHERE po.organization_id = v_org
      AND po.order_date::DATE BETWEEN v_start AND v_end
    GROUP BY 1
  ), inventory_rollup AS (
    SELECT
      CASE p_dimension
        WHEN 'date' THEN to_char(date_trunc('day', im.created_at), 'YYYY-MM-DD')
        WHEN 'week' THEN to_char(date_trunc('week', im.created_at), 'IYYY-IW')
        WHEN 'month' THEN to_char(date_trunc('month', im.created_at), 'YYYY-MM')
        WHEN 'location' THEN COALESCE(l.name, 'Unassigned')
      END AS dimension,
      SUM(CASE WHEN im.movement_type IN ('wastage', 'spoilage') THEN ABS(im.quantity) * COALESCE(i.unit_cost, 0) ELSE 0 END)::NUMERIC AS inventory_waste,
      SUM(CASE WHEN im.quantity < 0 THEN ABS(im.quantity) * COALESCE(i.unit_cost, 0) ELSE 0 END)::NUMERIC AS cogs
    FROM public.inventory_movements im
    LEFT JOIN public.inventory i ON i.id = im.inventory_id
    LEFT JOIN public.locations l ON l.id = im.location_id
    WHERE im.organization_id = v_org
      AND im.created_at::DATE BETWEEN v_start AND v_end
    GROUP BY 1
  ), labor_rollup AS (
    SELECT
      CASE p_dimension
        WHEN 'date' THEN to_char(date_trunc('day', es.shift_start), 'YYYY-MM-DD')
        WHEN 'week' THEN to_char(date_trunc('week', es.shift_start), 'IYYY-IW')
        WHEN 'month' THEN to_char(date_trunc('month', es.shift_start), 'YYYY-MM')
        WHEN 'location' THEN COALESCE(l.name, 'Unassigned')
      END AS dimension,
      SUM(COALESCE(es.labor_cost, 0))::NUMERIC AS labor_cost
    FROM public.employee_shifts es
    LEFT JOIN public.locations l ON l.id = es.location_id
    WHERE es.organization_id = v_org
      AND es.shift_start::DATE BETWEEN v_start AND v_end
    GROUP BY 1
  ), merged AS (
    SELECT dimension FROM pos_rollup
    UNION SELECT dimension FROM inventory_rollup
    UNION SELECT dimension FROM labor_rollup
  )
  SELECT COALESCE(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'dimension', m.dimension,
    'sales_revenue', CASE WHEN 'sales_revenue' = ANY(p_metrics) THEN COALESCE(p.sales_revenue, 0) END,
    'pos_transaction_count', CASE WHEN 'pos_transaction_count' = ANY(p_metrics) THEN COALESCE(p.pos_transaction_count, 0) END,
    'cogs', CASE WHEN 'cogs' = ANY(p_metrics) THEN COALESCE(i.cogs, 0) END,
    'inventory_waste', CASE WHEN 'inventory_waste' = ANY(p_metrics) THEN COALESCE(i.inventory_waste, 0) END,
    'labor_cost', CASE WHEN 'labor_cost' = ANY(p_metrics) THEN COALESCE(l.labor_cost, 0) END
  )) ORDER BY m.dimension), '[]'::JSONB)
  INTO v_result
  FROM merged m
  LEFT JOIN pos_rollup p USING (dimension)
  LEFT JOIN inventory_rollup i USING (dimension)
  LEFT JOIN labor_rollup l USING (dimension);

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.run_custom_report(TEXT[], TEXT, DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_custom_report(TEXT[], TEXT, DATE, DATE) TO authenticated;

COMMIT;

