BEGIN;

-- Performance is intentionally location-only. The browser may request a scope,
-- but authorization is derived from the authenticated profile and memberships.
CREATE OR REPLACE FUNCTION public.assert_performance_location_access(
  p_organization_id uuid,
  p_location_id uuid,
  p_write boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_auth_org uuid;
  v_auth_brand uuid;
  v_auth_location uuid;
  v_location_org uuid;
  v_location_brand uuid;
BEGIN
  IF auth.role() = 'service_role' THEN
    IF p_organization_id IS NULL OR p_location_id IS NULL THEN
      RAISE EXCEPTION 'Performance requires organization and location context'
        USING ERRCODE = '22023';
    END IF;
    RETURN;
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_organization_id IS NULL OR p_location_id IS NULL THEN
    RAISE EXCEPTION 'Performance requires one selected location'
      USING ERRCODE = '22023';
  END IF;

  SELECT public.normalize_app_role(p.role),
         p.organization_id,
         p.brand_id,
         p.location_id
    INTO v_role, v_auth_org, v_auth_brand, v_auth_location
  FROM public.profiles p
  WHERE p.id = auth.uid()
    AND p.deleted_at IS NULL;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Authenticated profile not found'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_manager_or_above() THEN
    RAISE EXCEPTION 'Role is not authorized for Performance'
      USING ERRCODE = '42501';
  END IF;

  SELECT l.organization_id, l.brand_id
    INTO v_location_org, v_location_brand
  FROM public.locations l
  WHERE l.id = p_location_id
    AND l.deleted_at IS NULL;

  IF v_location_org IS NULL OR v_location_org IS DISTINCT FROM p_organization_id THEN
    RAISE EXCEPTION 'Location does not belong to the active organization'
      USING ERRCODE = '42501';
  END IF;

  -- Preserve the project-wide platform-admin exception while still requiring a
  -- concrete, valid organization/brand/location hierarchy for Performance.
  IF v_role <> 'platform_admin' AND (
    v_auth_org IS DISTINCT FROM p_organization_id
    OR v_auth_location IS DISTINCT FROM p_location_id
    OR v_auth_brand IS NULL
    OR v_auth_brand IS DISTINCT FROM v_location_brand
  ) THEN
    RAISE EXCEPTION 'Performance location is outside the active hierarchy context'
      USING ERRCODE = '42501';
  END IF;

  IF p_write AND NOT public.is_manager_or_above() THEN
    RAISE EXCEPTION 'Role is not authorized to manage Performance budgets'
      USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_performance_location_access(uuid, uuid, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_performance_location_access(uuid, uuid, boolean)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_location_category_performance_report(
  p_organization_id uuid,
  p_location_id uuid,
  p_date_from date,
  p_date_to date,
  p_comparison_date_from date DEFAULT NULL,
  p_comparison_date_to date DEFAULT NULL,
  p_category_names text[] DEFAULT NULL,
  p_vendor_ids uuid[] DEFAULT NULL,
  p_timezone text DEFAULT 'UTC',
  p_selected_category text DEFAULT NULL,
  p_trend_categories text[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_performance_location_access(
    p_organization_id, p_location_id, false
  );
  RETURN public.get_category_performance_report(
    p_organization_id,
    ARRAY[p_location_id],
    p_date_from,
    p_date_to,
    p_comparison_date_from,
    p_comparison_date_to,
    p_category_names,
    p_vendor_ids,
    p_timezone,
    p_selected_category,
    p_trend_categories
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_location_category_performance_drilldown(
  p_organization_id uuid,
  p_location_id uuid,
  p_category text,
  p_date_from date,
  p_date_to date,
  p_comparison_date_from date DEFAULT NULL,
  p_comparison_date_to date DEFAULT NULL,
  p_vendor_ids uuid[] DEFAULT NULL,
  p_timezone text DEFAULT 'UTC'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_performance_location_access(
    p_organization_id, p_location_id, false
  );
  RETURN public.get_category_performance_drilldown(
    p_organization_id,
    p_category,
    ARRAY[p_location_id],
    p_date_from,
    p_date_to,
    p_comparison_date_from,
    p_comparison_date_to,
    p_vendor_ids,
    p_timezone
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_location_price_movers_report(
  p_organization_id uuid,
  p_location_id uuid,
  p_date_from date,
  p_date_to date,
  p_comparison_date_from date DEFAULT NULL,
  p_comparison_date_to date DEFAULT NULL,
  p_category_names text[] DEFAULT NULL,
  p_vendor_ids uuid[] DEFAULT NULL,
  p_timezone text DEFAULT 'UTC',
  p_product_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_performance_location_access(
    p_organization_id, p_location_id, false
  );
  RETURN public.get_price_movers_report(
    p_organization_id,
    ARRAY[p_location_id],
    p_date_from,
    p_date_to,
    p_comparison_date_from,
    p_comparison_date_to,
    p_category_names,
    p_vendor_ids,
    p_timezone,
    p_product_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_location_price_movers_drilldown(
  p_organization_id uuid,
  p_location_id uuid,
  p_product_id uuid DEFAULT NULL,
  p_product_name text DEFAULT NULL,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_comparison_date_from date DEFAULT NULL,
  p_comparison_date_to date DEFAULT NULL,
  p_vendor_ids uuid[] DEFAULT NULL,
  p_timezone text DEFAULT 'UTC'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_performance_location_access(
    p_organization_id, p_location_id, false
  );
  RETURN public.get_price_movers_drilldown(
    p_organization_id,
    p_product_id,
    p_product_name,
    ARRAY[p_location_id],
    p_date_from,
    p_date_to,
    p_comparison_date_from,
    p_comparison_date_to,
    p_vendor_ids,
    p_timezone
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_location_inventory_usage_report(
  p_organization_id uuid,
  p_location_id uuid,
  p_date_from date,
  p_date_to date,
  p_category_names text[] DEFAULT NULL,
  p_timezone text DEFAULT 'UTC'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_performance_location_access(
    p_organization_id, p_location_id, false
  );
  RETURN public.get_inventory_usage_report(
    p_organization_id,
    ARRAY[p_location_id],
    p_date_from,
    p_date_to,
    p_category_names,
    p_timezone
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_location_inventory_usage_drilldown(
  p_organization_id uuid,
  p_location_id uuid,
  p_inventory_id uuid DEFAULT NULL,
  p_product_id uuid DEFAULT NULL,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_timezone text DEFAULT 'UTC'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_performance_location_access(
    p_organization_id, p_location_id, false
  );
  RETURN public.get_inventory_usage_drilldown(
    p_organization_id,
    p_inventory_id,
    p_product_id,
    ARRAY[p_location_id],
    p_date_from,
    p_date_to,
    p_timezone
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_location_performance_budget(
  p_organization_id uuid,
  p_location_id uuid,
  p_period_start date,
  p_period_end date,
  p_category text,
  p_target_amount numeric
)
RETURNS public.budget_targets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_brand_id uuid;
  v_existing_id uuid;
  v_result public.budget_targets;
BEGIN
  PERFORM public.assert_performance_location_access(
    p_organization_id, p_location_id, true
  );

  IF p_period_start IS NULL OR p_period_end IS NULL OR p_period_end < p_period_start THEN
    RAISE EXCEPTION 'A valid budget period is required' USING ERRCODE = '22023';
  END IF;
  IF NULLIF(trim(p_category), '') IS NULL THEN
    RAISE EXCEPTION 'Budget category is required' USING ERRCODE = '22023';
  END IF;
  IF p_target_amount IS NULL OR p_target_amount < 0 THEN
    RAISE EXCEPTION 'Budget amount must be non-negative' USING ERRCODE = '22023';
  END IF;

  SELECT l.brand_id INTO v_brand_id
  FROM public.locations l
  WHERE l.id = p_location_id
    AND l.organization_id = p_organization_id;

  SELECT bt.id INTO v_existing_id
  FROM public.budget_targets bt
  WHERE bt.organization_id = p_organization_id
    AND bt.location_id = p_location_id
    AND bt.brand_id IS NOT DISTINCT FROM v_brand_id
    AND bt.period_start = p_period_start
    AND bt.period_end = p_period_end
    AND bt.category = trim(p_category)
  ORDER BY bt.updated_at DESC NULLS LAST, bt.created_at DESC NULLS LAST
  LIMIT 1;

  IF v_existing_id IS NULL THEN
    INSERT INTO public.budget_targets (
      organization_id,
      brand_id,
      location_id,
      period_start,
      period_end,
      category,
      target_amount,
      target_percent,
      created_by,
      updated_by
    )
    VALUES (
      p_organization_id,
      v_brand_id,
      p_location_id,
      p_period_start,
      p_period_end,
      trim(p_category),
      p_target_amount,
      NULL,
      auth.uid(),
      auth.uid()
    )
    RETURNING * INTO v_result;
  ELSE
    UPDATE public.budget_targets
    SET target_amount = p_target_amount,
        target_percent = NULL,
        updated_by = auth.uid(),
        updated_at = now()
    WHERE id = v_existing_id
    RETURNING * INTO v_result;
  END IF;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_location_performance_budget(
  p_organization_id uuid,
  p_location_id uuid,
  p_period_start date,
  p_period_end date,
  p_category text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_brand_id uuid;
  v_deleted boolean := false;
BEGIN
  PERFORM public.assert_performance_location_access(
    p_organization_id, p_location_id, true
  );

  SELECT l.brand_id INTO v_brand_id
  FROM public.locations l
  WHERE l.id = p_location_id
    AND l.organization_id = p_organization_id;

  DELETE FROM public.budget_targets bt
  WHERE bt.organization_id = p_organization_id
    AND bt.location_id = p_location_id
    AND bt.brand_id IS NOT DISTINCT FROM v_brand_id
    AND bt.period_start = p_period_start
    AND bt.period_end = p_period_end
    AND bt.category = trim(p_category);

  v_deleted := FOUND;
  RETURN v_deleted;
END;
$$;

-- Normal application users must enter through the validating wrappers.
REVOKE EXECUTE ON FUNCTION public.get_category_performance_report(
  uuid, uuid[], date, date, date, date, text[], uuid[], text, text, text[]
) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_category_performance_drilldown(
  uuid, text, uuid[], date, date, date, date, uuid[], text
) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_price_movers_report(
  uuid, uuid[], date, date, date, date, text[], uuid[], text, uuid
) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_price_movers_drilldown(
  uuid, uuid, text, uuid[], date, date, date, date, uuid[], text
) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_inventory_usage_report(
  uuid, uuid[], date, date, text[], text
) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_inventory_usage_drilldown(
  uuid, uuid, uuid, uuid[], date, date, text
) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.get_location_category_performance_report(
  uuid, uuid, date, date, date, date, text[], uuid[], text, text, text[]
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_location_category_performance_drilldown(
  uuid, uuid, text, date, date, date, date, uuid[], text
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_location_price_movers_report(
  uuid, uuid, date, date, date, date, text[], uuid[], text, uuid
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_location_price_movers_drilldown(
  uuid, uuid, uuid, text, date, date, date, date, uuid[], text
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_location_inventory_usage_report(
  uuid, uuid, date, date, text[], text
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_location_inventory_usage_drilldown(
  uuid, uuid, uuid, uuid, date, date, text
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.upsert_location_performance_budget(
  uuid, uuid, date, date, text, numeric
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_location_performance_budget(
  uuid, uuid, date, date, text
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_location_category_performance_report(
  uuid, uuid, date, date, date, date, text[], uuid[], text, text, text[]
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_location_category_performance_drilldown(
  uuid, uuid, text, date, date, date, date, uuid[], text
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_location_price_movers_report(
  uuid, uuid, date, date, date, date, text[], uuid[], text, uuid
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_location_price_movers_drilldown(
  uuid, uuid, uuid, text, date, date, date, date, uuid[], text
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_location_inventory_usage_report(
  uuid, uuid, date, date, text[], text
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_location_inventory_usage_drilldown(
  uuid, uuid, uuid, uuid, date, date, text
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.upsert_location_performance_budget(
  uuid, uuid, date, date, text, numeric
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_location_performance_budget(
  uuid, uuid, date, date, text
) TO authenticated, service_role;

REVOKE INSERT, UPDATE, DELETE ON public.budget_targets FROM authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
