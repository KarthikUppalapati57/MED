-- Latest 20260727 migration delta
-- Generated: 2026-07-27
-- Migration count: 19


-- ==========================================================================
-- Source: 20260727000000_notification_dispatch_result_tracking.sql
-- ==========================================================================

-- 20260727000000: Track per-channel notification dispatch outcome.
-- enforce_notification_delivery_preference() called notify-channel-dispatch but never told it
-- which row to report back to, so a failed (or successful) email/SMS send had nowhere durable to
-- land -- only a server-side console.error nobody but a developer with log access could see.
-- Threading notification_id through lets the edge function record the outcome on the row itself.
-- Gating logic (in_app_enabled/critical_only/skip_channel_dispatch/email_enabled/phone_enabled)
-- is unchanged; see notification_delivery_preference_enforcement_acceptance.sql for that.

BEGIN;

CREATE OR REPLACE FUNCTION public.enforce_notification_delivery_preference()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_module_key text;
  v_is_critical boolean;
  v_in_app_enabled boolean;
  v_critical_only boolean;
  v_email_enabled boolean;
  v_phone_enabled boolean;
  v_send_email boolean;
  v_send_sms boolean;
  v_functions_url text;
  v_service_role_key text;
  v_url text;
BEGIN
  v_module_key := COALESCE(
    NEW.metadata->>'module_key',
    CASE NEW.type
      WHEN 'approval' THEN 'invoices'
      WHEN 'invoice' THEN 'invoices'
      WHEN 'invoice_approved' THEN 'invoices'
      WHEN 'payment' THEN 'payments'
      WHEN 'payment_failed' THEN 'payments'
      WHEN 'billing' THEN 'payments'
      WHEN 'inventory' THEN 'inventory'
      WHEN 'low_inventory' THEN 'inventory'
      WHEN 'order' THEN 'inventory'
      WHEN 'vendor_update' THEN 'vendors'
      WHEN 'labor_alert' THEN 'labor'
      ELSE 'dashboard'
    END
  );

  v_is_critical := COALESCE((NEW.metadata->>'critical')::boolean, false)
    OR NEW.metadata->>'priority' = 'critical'
    OR NEW.type IN ('error', 'warning', 'payment_failed', 'low_inventory', 'AI_alert');

  SELECT in_app_enabled, critical_only, email_enabled, phone_enabled
    INTO v_in_app_enabled, v_critical_only, v_email_enabled, v_phone_enabled
  FROM public.notification_delivery_preferences
  WHERE user_id = NEW.user_id AND module_key = v_module_key;

  IF NOT FOUND THEN
    v_in_app_enabled := true;
    v_critical_only := false;
    v_email_enabled := false;
    v_phone_enabled := false;
  END IF;

  IF NOT v_in_app_enabled THEN
    RETURN NULL;
  END IF;

  IF v_critical_only AND NOT v_is_critical THEN
    RETURN NULL;
  END IF;

  IF NEW.metadata->>'skip_channel_dispatch' = 'true' THEN
    RETURN NEW;
  END IF;

  v_send_email := v_email_enabled OR v_is_critical;
  v_send_sms := v_phone_enabled;

  IF v_send_email OR v_send_sms THEN
    BEGIN
      SELECT setting_value INTO v_functions_url FROM private.workflow_runtime_settings WHERE setting_name = 'functions_url';
      SELECT setting_value INTO v_service_role_key FROM private.workflow_runtime_settings WHERE setting_name = 'service_role_key';

      IF v_service_role_key IS NOT NULL AND length(trim(v_service_role_key)) > 0 THEN
        v_url := COALESCE(NULLIF(trim(v_functions_url), ''), 'https://gsupqfmwlsmwoybphimx.supabase.co/functions/v1') || '/notify-channel-dispatch';

        PERFORM net.http_post(
          url := v_url,
          body := jsonb_build_object(
            'notification_id', NEW.id,
            'user_id', NEW.user_id,
            'title', NEW.title,
            'message', COALESCE(NEW.message, NEW.body),
            'send_email', v_send_email,
            'send_sms', v_send_sms
          ),
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || v_service_role_key
          )
        );
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- Same rule as before: a dispatch failure must never block the in-app row landing.
      NULL;
    END;
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ==========================================================================
-- Source: 20260727000001_strict_location_performance_security.sql
-- ==========================================================================

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

-- ==========================================================================
-- Source: 20260727000002_align_performance_with_active_hierarchy.sql
-- ==========================================================================

BEGIN;

-- Align Performance with the existing organization -> active brand -> active
-- location context model. This migration is intentionally Performance-only.
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

  -- platform_admin follows the existing project-wide cross-organization
  -- exception, but still must name a real location in the named organization.
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

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ==========================================================================
-- Source: 20260727000003_enrich_location_inventory_usage_evidence.sql
-- ==========================================================================

BEGIN;

-- Performance-only enrichment of the secured, single-location Inventory Usage
-- response. The shared base report remains unchanged for other modules.
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
DECLARE
  v_result jsonb;
  v_table_rows jsonb;
BEGIN
  PERFORM public.assert_performance_location_access(
    p_organization_id, p_location_id, false
  );

  v_result := public.get_inventory_usage_report(
    p_organization_id,
    ARRAY[p_location_id],
    p_date_from,
    p_date_to,
    p_category_names,
    p_timezone
  );

  SELECT COALESCE(
    jsonb_agg(
      source.row_data
      || jsonb_build_object(
        'currentOnHandQuantity', evidence.current_on_hand_quantity,
        'reorderPoint', evidence.reorder_point,
        'unitCost', evidence.unit_cost,
        'unitCostSource', evidence.unit_cost_source,
        'usageValue', CASE
          WHEN NULLIF(source.row_data->>'actualUsage', '') IS NULL
            OR evidence.unit_cost IS NULL
          THEN NULL
          ELSE round(
            (source.row_data->>'actualUsage')::numeric * evidence.unit_cost,
            2
          )
        END,
        'currentInventoryValue', evidence.current_inventory_value,
        'currentInventoryValueSource', evidence.current_inventory_value_source
      )
      ORDER BY source.ordinality
    ),
    '[]'::jsonb
  )
  INTO v_table_rows
  FROM jsonb_array_elements(COALESCE(v_result->'tableRows', '[]'::jsonb))
    WITH ORDINALITY AS source(row_data, ordinality)
  LEFT JOIN LATERAL (
    SELECT
      inv.current_quantity::numeric AS current_on_hand_quantity,
      CASE
        WHEN inv.reorder_point > 0 THEN inv.reorder_point::numeric
        WHEN inv.par_level > 0 THEN inv.par_level::numeric
        ELSE NULL
      END AS reorder_point,
      CASE
        WHEN inv.unit_cost > 0 THEN inv.unit_cost::numeric
        WHEN product.latest_price > 0 THEN product.latest_price::numeric
        ELSE NULL
      END AS unit_cost,
      CASE
        WHEN inv.unit_cost > 0 THEN 'inventory.unit_cost'
        WHEN product.latest_price > 0 THEN 'products.latest_price'
        ELSE 'unavailable'
      END AS unit_cost_source,
      CASE
        WHEN inv.current_value IS NOT NULL THEN inv.current_value::numeric
        WHEN inv.current_quantity IS NOT NULL
          AND (
            CASE
              WHEN inv.unit_cost > 0 THEN inv.unit_cost
              WHEN product.latest_price > 0 THEN product.latest_price
              ELSE NULL
            END
          ) IS NOT NULL
        THEN round(
          inv.current_quantity
          * CASE
              WHEN inv.unit_cost > 0 THEN inv.unit_cost
              WHEN product.latest_price > 0 THEN product.latest_price
            END,
          2
        )
        ELSE NULL
      END AS current_inventory_value,
      CASE
        WHEN inv.current_value IS NOT NULL THEN 'inventory.current_value'
        WHEN inv.current_quantity IS NOT NULL
          AND (inv.unit_cost > 0 OR product.latest_price > 0)
        THEN 'calculated_current_quantity_x_unit_cost'
        ELSE 'unavailable'
      END AS current_inventory_value_source
    FROM public.inventory inv
    LEFT JOIN public.products product
      ON product.id = inv.internal_product_id
     AND product.organization_id = p_organization_id
     AND product.deleted_at IS NULL
    WHERE inv.id = NULLIF(source.row_data->>'inventoryId', '')::uuid
      AND inv.organization_id = p_organization_id
      AND inv.location_id = p_location_id
      AND inv.deleted_at IS NULL
    LIMIT 1
  ) evidence ON TRUE;

  RETURN jsonb_set(
    COALESCE(v_result, '{}'::jsonb),
    '{tableRows}',
    v_table_rows,
    true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_location_inventory_usage_report(
  uuid, uuid, date, date, text[], text
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_location_inventory_usage_report(
  uuid, uuid, date, date, text[], text
) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_location_inventory_usage_report(
  uuid, uuid, date, date, text[], text
) IS
  'Secured single-location Performance Inventory Usage report enriched with current on-hand, reorder, cost provenance, and current-value evidence.';

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ==========================================================================
-- Source: 20260727010000_close_unguarded_report_rpc_scope.sql
-- ==========================================================================

-- 20260727010000: Close the same scope-trust gap that 20260726000005 fixed for 6 report RPCs,
-- found in 6 more via a direct pg_proc audit of every SECURITY DEFINER function taking a
-- tenant-scope parameter. Each of these took org_id/location_id as a plain argument and used it
-- to filter results with NO check that it matched the caller's real session -- any authenticated
-- user could pass any organization's (or, for get_labor_schedule_variance, ANY tenant's, since it
-- had no org parameter at all and NULL location_id aggregated across the whole platform) id and
-- get that data back. Fix mirrors the guard clause already used correctly by sibling functions in
-- this same database (get_role_dashboard_summary, get_cross_location_benchmarks): validate the
-- parameter against get_my_org()/get_auth_org() (or get_my_accessible_location_ids() where there's
-- no org parameter), unless the caller is platform_admin. No other logic in any of these 6
-- functions is changed.
--
-- Deliberately NOT touched here (found in the same audit, tracked separately, needs a product
-- decision rather than an unambiguous-bug fix): get_cross_location_benchmarks, get_location_benchmarks,
-- get_menu_engineering_data, get_labor_forecast check org membership but not location-level role
-- restriction, so a location_manager/ground_staff confined to one location can see sibling
-- locations' benchmarks within their own org -- same shape as the still-undeployed
-- require_exact_location_match_for_org_wide_roles migration, and shouldn't be decided unilaterally
-- in an urgent-fix pass. get_inventory_totals reads org from auth.jwt() instead of the
-- profiles-based resolver this codebase otherwise standardized on. get_product_purchase_report
-- defaults to the caller's own org but doesn't hard-block an explicitly-passed foreign org_id.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_labor_schedule_variance(p_start_date date, p_end_date date, p_location_id uuid)
 RETURNS TABLE(date date, projected_sales numeric, scheduled_labor numeric, suggested_labor numeric, variance_amount numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  IF p_location_id IS NULL THEN
    RAISE EXCEPTION 'A specific location is required for this report.';
  END IF;
  IF NOT public.is_platform_admin() AND p_location_id NOT IN (SELECT public.get_my_accessible_location_ids()) THEN
    RAISE EXCEPTION 'Unauthorized: You do not have access to this location''s data.';
  END IF;

  RETURN QUERY
  WITH date_series AS (
    SELECT generate_series(p_start_date, p_end_date, '1 day'::interval)::date AS d
  ),
  daily_sales AS (
    SELECT
      m.date,
      SUM(m.total_revenue) as projected_sales
    FROM public.mv_daily_sales_summary m
    WHERE m.date >= p_start_date AND m.date <= p_end_date
      AND (p_location_id IS NULL OR m.location_id = p_location_id)
    GROUP BY m.date
  ),
  daily_labor AS (
    SELECT
      s.shift_start::date AS date,
      SUM(s.labor_cost) as scheduled_labor
    FROM public.employee_shifts s
    WHERE s.shift_start >= p_start_date AND s.shift_start <= p_end_date
      AND (p_location_id IS NULL OR s.location_id = p_location_id)
    GROUP BY s.shift_start::date
  )
  SELECT
    ds.d AS date,
    COALESCE(s.projected_sales, 0) AS projected_sales,
    COALESCE(l.scheduled_labor, 0) AS scheduled_labor,
    (COALESCE(s.projected_sales, 0) * 0.25)::numeric(15,2) AS suggested_labor,
    (COALESCE(l.scheduled_labor, 0) - (COALESCE(s.projected_sales, 0) * 0.25))::numeric(15,2) AS variance_amount
  FROM date_series ds
  LEFT JOIN daily_sales s ON ds.d = s.date
  LEFT JOIN daily_labor l ON ds.d = l.date
  ORDER BY ds.d;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_performance_dashboard_metrics(p_organization_id uuid, p_start_date date, p_end_date date, p_brand_id uuid DEFAULT NULL::uuid, p_location_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_total_sales NUMERIC := 0;
  v_total_cogs NUMERIC := 0;
  v_total_labor NUMERIC := 0;
  v_today_sales NUMERIC := 0;
  v_today_cogs NUMERIC := 0;
  v_today_labor NUMERIC := 0;
  v_trend_data JSONB := '[]'::jsonb;
  v_movers_data JSONB := '[]'::jsonb;
  v_category_data JSONB := '[]'::jsonb;
  v_pending_invoices_count INT := 0;
BEGIN
  IF NOT public.is_platform_admin() AND public.get_my_org() != p_organization_id THEN
    RAISE EXCEPTION 'Unauthorized: You do not have access to this organization''s data.';
  END IF;

  SELECT
    COALESCE(SUM(total_revenue), 0),
    COALESCE(SUM(CASE WHEN date = CURRENT_DATE THEN total_revenue ELSE 0 END), 0)
  INTO v_total_sales, v_today_sales
  FROM public.mv_daily_sales_summary
  WHERE organization_id = p_organization_id
    AND (p_brand_id IS NULL OR brand_id = p_brand_id)
    AND (p_location_id IS NULL OR location_id = p_location_id)
    AND date >= p_start_date
    AND date <= p_end_date;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'date', s.date,
      'name', to_char(s.date, 'Dy'),
      'actual', s.total_revenue,
      'forecast', s.total_revenue * 1.05
    )
  ), '[]'::jsonb)
  INTO v_trend_data
  FROM (
    SELECT date, total_revenue
    FROM public.mv_daily_sales_summary
    WHERE organization_id = p_organization_id
      AND (p_brand_id IS NULL OR brand_id = p_brand_id)
      AND (p_location_id IS NULL OR location_id = p_location_id)
      AND date >= p_start_date
      AND date <= p_end_date
    ORDER BY date ASC
  ) s;

  SELECT
    COALESCE(SUM(total_amount), 0),
    COALESCE(SUM(CASE WHEN invoice_date = CURRENT_DATE THEN total_amount ELSE 0 END), 0),
    COUNT(CASE WHEN status IN ('pending_review', 'validated', 'flagged') THEN 1 END)
  INTO v_total_cogs, v_today_cogs, v_pending_invoices_count
  FROM public.invoices
  WHERE organization_id = p_organization_id
    AND (p_brand_id IS NULL OR brand_id = p_brand_id)
    AND (p_location_id IS NULL OR location_id = p_location_id)
    AND invoice_date >= p_start_date
    AND invoice_date <= p_end_date;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object('name', COALESCE(category_name, 'Uncategorized'), 'spend', amount)
  ), '[]'::jsonb)
  INTO v_category_data
  FROM (
    SELECT category_name, SUM(amount) AS amount
    FROM public.invoice_allocations
    WHERE organization_id = p_organization_id
      AND created_at::DATE >= p_start_date
      AND created_at::DATE <= p_end_date
    GROUP BY category_name
    ORDER BY amount DESC
    LIMIT 8
  ) c;

  SELECT COALESCE(SUM(labor_cost), 0)
  INTO v_total_labor
  FROM public.employee_shifts
  WHERE organization_id = p_organization_id
    AND (p_location_id IS NULL OR location_id = p_location_id)
    AND COALESCE(shift_start, start_time)::DATE >= p_start_date
    AND COALESCE(shift_start, start_time)::DATE <= p_end_date;

  SELECT COALESCE(SUM(labor_cost), 0)
  INTO v_today_labor
  FROM public.employee_shifts
  WHERE organization_id = p_organization_id
    AND (p_location_id IS NULL OR location_id = p_location_id)
    AND COALESCE(shift_start, start_time)::DATE = CURRENT_DATE;

  RETURN jsonb_build_object(
    'sales', jsonb_build_object('total', v_total_sales, 'today', v_today_sales),
    'cogs', jsonb_build_object('total', v_total_cogs, 'today', v_today_cogs),
    'labor', jsonb_build_object('total', v_total_labor, 'today', v_today_labor),
    'trend', v_trend_data,
    'categories', v_category_data,
    'movers', v_movers_data,
    'pending_invoices_count', v_pending_invoices_count
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_pnl_summary(p_org_id uuid, p_start_date date, p_end_date date, p_brand_id uuid DEFAULT NULL::uuid, p_location_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_total_revenue NUMERIC(15,2) := 0;
  v_total_labor NUMERIC(15,2) := 0;
  v_total_cogs_allocated NUMERIC(15,2) := 0;
  v_total_invoices_raw NUMERIC(15,2) := 0;
  v_total_cogs NUMERIC(15,2) := 0;
BEGIN
  IF NOT public.is_platform_admin() AND public.get_my_org() != p_org_id THEN
    RAISE EXCEPTION 'Unauthorized: You do not have access to this organization''s data.';
  END IF;

  SELECT COALESCE(SUM(total_revenue), 0) INTO v_total_revenue
  FROM public.mv_daily_sales_summary
  WHERE organization_id = p_org_id
    AND date >= p_start_date
    AND date <= p_end_date
    AND (p_brand_id IS NULL OR brand_id = p_brand_id)
    AND (p_location_id IS NULL OR location_id = p_location_id);

  SELECT COALESCE(SUM(labor_cost), 0) INTO v_total_labor
  FROM public.employee_shifts
  WHERE organization_id = p_org_id
    AND shift_start >= p_start_date
    AND shift_start <= p_end_date
    AND (p_location_id IS NULL OR location_id = p_location_id);

  SELECT COALESCE(SUM(a.amount), 0) INTO v_total_cogs_allocated
  FROM public.invoice_allocations a
  JOIN public.invoices i ON i.id = a.invoice_id
  WHERE a.organization_id = p_org_id
    AND a.allocation_type = 'line_items'
    AND i.invoice_date >= p_start_date
    AND i.invoice_date <= p_end_date
    AND (p_brand_id IS NULL OR i.brand_id = p_brand_id)
    AND (p_location_id IS NULL OR i.location_id = p_location_id);

  IF v_total_cogs_allocated > 0 THEN
    v_total_cogs := v_total_cogs_allocated;
  ELSE
    SELECT COALESCE(SUM(total_amount), 0) INTO v_total_invoices_raw
    FROM public.invoices
    WHERE organization_id = p_org_id
      AND invoice_date >= p_start_date
      AND invoice_date <= p_end_date
      AND status != 'void'
      AND (p_brand_id IS NULL OR brand_id = p_brand_id)
      AND (p_location_id IS NULL OR location_id = p_location_id);

    v_total_cogs := v_total_invoices_raw;
  END IF;

  RETURN jsonb_build_object(
    'total_revenue', v_total_revenue,
    'total_labor_cost', v_total_labor,
    'total_cogs', v_total_cogs,
    'prime_cost', (v_total_cogs + v_total_labor)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_product_dashboard_summary(p_organization_id uuid, p_brand_id uuid DEFAULT NULL::uuid, p_location_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(total_products bigint, inventoried_count bigint, tax_exempt_count bigint, category_count bigint, missing_product_id_count bigint, uncategorized_count bigint, unmapped_vendor_item_count bigint, price_variance_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH scoped AS (
    SELECT *
    FROM public.products p
    WHERE p.organization_id = p_organization_id
      AND (public.is_platform_admin() OR p_organization_id = public.get_auth_org())
      AND p.deleted_at IS NULL
      AND (p_brand_id IS NULL OR p.brand_id IS NULL OR p.brand_id = p_brand_id)
      AND (p_location_id IS NULL OR p.location_id IS NULL OR p.location_id = p_location_id)
  )
  SELECT
    COUNT(*)::bigint,
    COUNT(*) FILTER (WHERE is_inventoried IS TRUE)::bigint,
    COUNT(*) FILTER (WHERE is_tax_exempt IS TRUE)::bigint,
    COUNT(DISTINCT NULLIF(accounting_category, ''))::bigint,
    COUNT(*) FILTER (WHERE COALESCE(product_id, '') = '')::bigint,
    COUNT(*) FILTER (WHERE COALESCE(category, '') = '' OR category = 'Uncategorized')::bigint,
    COUNT(*) FILTER (
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.vendor_item_mappings vim
        WHERE vim.internal_product_id = scoped.id
          AND vim.organization_id = scoped.organization_id
      )
    )::bigint,
    0::bigint
  FROM scoped;
$function$;

CREATE OR REPLACE FUNCTION public.get_flagged_vendor_items(p_organization_id uuid)
 RETURNS TABLE(id uuid, vendor_item_name text, vendor_name text, internal_product_id uuid, internal_product_name text, previous_price numeric, latest_price numeric, variance_percent numeric, invoice_date timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    IF NOT public.is_platform_admin() AND public.get_my_org() != p_organization_id THEN
        RAISE EXCEPTION 'Unauthorized: You do not have access to this organization''s data.';
    END IF;

    RETURN QUERY
    SELECT
        vi.id,
        vi.vendor_item_name,
        v.name AS vendor_name,
        vim.internal_product_id,
        p.name AS internal_product_name,
        vi.previous_price,
        vi.last_price AS latest_price,
        vi.last_price_change_percent AS variance_percent,
        i.invoice_date::timestamptz
    FROM public.vendor_items vi
    JOIN public.vendors v ON vi.vendor_id = v.id
    LEFT JOIN public.vendor_item_mappings vim ON vim.vendor_item_id = vi.id
    LEFT JOIN public.products p ON vim.internal_product_id = p.id
    LEFT JOIN public.invoices i ON vi.last_invoice_id = i.id
    WHERE vi.organization_id = p_organization_id
      AND vi.price_variance_flag = true
    ORDER BY vi.updated_at DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_product_verification_queue(p_organization_id uuid, p_brand_id uuid DEFAULT NULL::uuid, p_location_id uuid DEFAULT NULL::uuid, p_status text DEFAULT NULL::text, p_search text DEFAULT NULL::text)
 RETURNS TABLE(internal_product_id uuid, product_id text, name text, description text, category text, accounting_category text, suggested_category text, suggested_accounting_category text, category_confidence numeric, category_review_status text, latest_price numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    p.id,
    p.product_id,
    p.name,
    p.description,
    p.category,
    p.accounting_category,
    NULL::text,
    NULL::text,
    NULL::numeric,
    'verified'::text,
    p.latest_price
  FROM public.products p
  WHERE p.organization_id = p_organization_id
    AND (public.is_platform_admin() OR p_organization_id = public.get_auth_org())
    AND p.deleted_at IS NULL
    AND (p_brand_id IS NULL OR p.brand_id IS NULL OR p.brand_id = p_brand_id)
    AND (p_location_id IS NULL OR p.location_id IS NULL OR p.location_id = p_location_id)
    AND (
      COALESCE(NULLIF(p_search, ''), NULL) IS NULL
      OR p.name ILIKE '%' || p_search || '%'
      OR p.description ILIKE '%' || p_search || '%'
      OR p.product_id ILIKE '%' || p_search || '%'
    )
  ORDER BY p.updated_at DESC
  LIMIT 100;
$function$;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ==========================================================================
-- Source: 20260727020000_close_unguarded_write_rpc_scope.sql
-- ==========================================================================

-- 20260727020000: Same class of gap as 20260727010000, found in write-path RPCs this time while
-- auditing the remaining SECURITY DEFINER functions (105 total scope-parameter functions; this
-- covers a further batch beyond the 6 report RPCs already fixed).
--
-- Two are severe:
--   - org_remove_member trusted an explicitly-passed target_org_id with no check that it matched
--     the caller's own org -- an org_manager in Org A could pass Org B's id and forcibly remove a
--     user from Org B, wiping their profile's org/brand/location and demoting them to
--     ground_staff. A destructive cross-tenant write, not just a read leak.
--   - record_payment_ledger had EXECUTE granted to anon (not just authenticated) and zero
--     authorization check in the body -- a completely unauthenticated caller could insert
--     fabricated general-ledger entries (debit/credit postings) for any organization, with no
--     real underlying bill or payment required.
-- Three more are read-only versions of the same pattern already fixed for the report RPCs:
-- resolve_payment_provider_config, get_payment_approval_settings, get_product_approval_setting.
--
-- NOT touched here, flagged separately for a product decision rather than treated as an
-- unambiguous bug: insert_onboarding_address also has zero check and is anon-executable, but
-- that may be intentional (address capture can legitimately happen before a full auth session
-- exists during signup) -- needs a decision on what a legitimate caller looks like before adding
-- a guard, not a same-shape copy-paste fix.

BEGIN;

CREATE OR REPLACE FUNCTION public.org_remove_member(target_user_id uuid, target_org_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  caller_role TEXT;
  caller_org  UUID;
BEGIN
  caller_role := public.get_auth_role();

  IF caller_role NOT IN ('org_manager', 'tenant_super_admin', 'platform_admin') THEN
    RAISE EXCEPTION 'Insufficient permissions: only org_manager, tenant_super_admin, or platform_admin can remove users';
  END IF;

  IF public.is_platform_admin() THEN
    caller_org := COALESCE(target_org_id, public.get_auth_org());
  ELSE
    caller_org := public.get_auth_org();
    IF target_org_id IS NOT NULL AND target_org_id != caller_org THEN
      RAISE EXCEPTION 'Cannot remove members from another organization';
    END IF;
  END IF;

  IF target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot remove yourself. Transfer ownership first.';
  END IF;

  DELETE FROM public.organization_members
  WHERE user_id = target_user_id AND organization_id = caller_org;

  DELETE FROM public.brand_members
  WHERE user_id = target_user_id
    AND brand_id IN (SELECT id FROM public.brands WHERE organization_id = caller_org);

  DELETE FROM public.location_members
  WHERE user_id = target_user_id
    AND location_id IN (SELECT id FROM public.locations WHERE organization_id = caller_org);

  PERFORM set_config('app.trusted_profile_write', 'on', true);
  UPDATE public.profiles
  SET organization_id = NULL, brand_id = NULL, location_id = NULL, role = 'ground_staff'
  WHERE id = target_user_id AND organization_id = caller_org;

  IF (SELECT raw_app_meta_data->>'organization_id' FROM auth.users WHERE id = target_user_id) = caller_org::text THEN
      UPDATE auth.users
      SET raw_app_meta_data = raw_app_meta_data - 'organization_id' - 'role' - 'brand_id' - 'location_id'
      WHERE id = target_user_id;
  END IF;

  PERFORM public.log_audit_event(jsonb_build_object(
    'organization_id', caller_org,
    'user_id', auth.uid(),
    'action', 'org_member_removed',
    'table_name', 'organization_members',
    'entity_type', 'user',
    'entity_id', target_user_id::text,
    'record_id', target_user_id::text,
    'details', jsonb_build_object('removed_user_id', target_user_id, 'removed_from_org', caller_org)
  ));

  RETURN jsonb_build_object('success', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.record_payment_ledger(p_organization_id uuid, p_bill_id uuid, p_source_payment_id uuid, p_payment_method text, p_amount numeric, p_payment_date timestamp with time zone, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_ledger_payment_id UUID;
BEGIN
  IF NOT public.is_platform_admin() AND NOT (public.is_manager_or_above() AND public.get_my_org() = p_organization_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT id INTO v_ledger_payment_id
  FROM public.ledger_payments
  WHERE source_payment_id = p_source_payment_id;

  IF v_ledger_payment_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'ledger_payment_id', v_ledger_payment_id,
      'message', 'Payment already recorded.'
    );
  END IF;

  INSERT INTO public.ledger_payments (
    organization_id, bill_id, source_payment_id, payment_method,
    amount, payment_date, status, created_by
  ) VALUES (
    p_organization_id, p_bill_id, p_source_payment_id, p_payment_method,
    p_amount, p_payment_date, 'completed', p_user_id
  )
  RETURNING id INTO v_ledger_payment_id;

  INSERT INTO public.ledger_entries (
    organization_id, account_code, debit, credit, reference_type, reference_id
  ) VALUES
    (p_organization_id, '2000', p_amount, 0, 'payment', p_source_payment_id),
    (p_organization_id, '1000', 0, p_amount, 'payment', p_source_payment_id);

  RETURN jsonb_build_object('success', true, 'ledger_payment_id', v_ledger_payment_id);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.record_payment_ledger(uuid, uuid, uuid, text, numeric, timestamptz, uuid) FROM anon;

CREATE OR REPLACE FUNCTION public.resolve_payment_provider_config(p_tenant_id uuid DEFAULT NULL::uuid, p_organization_id uuid DEFAULT NULL::uuid, p_brand_id uuid DEFAULT NULL::uuid, p_location_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN NOT public.is_platform_admin()
      AND p_organization_id IS NOT NULL
      AND p_organization_id != public.get_auth_org()
    THEN jsonb_build_object(
      'collection_provider', 'not_configured',
      'payout_provider', 'not_configured',
      'check_provider', 'checkbook',
      'enabled', false,
      'settings', '{}'::jsonb
    )
    ELSE COALESCE((
      SELECT jsonb_build_object(
        'id', ppc.id,
        'tenant_id', ppc.tenant_id,
        'organization_id', ppc.organization_id,
        'brand_id', ppc.brand_id,
        'location_id', ppc.location_id,
        'collection_provider', ppc.collection_provider,
        'payout_provider', ppc.payout_provider,
        'check_provider', ppc.check_provider,
        'enabled', ppc.enabled,
        'settings', ppc.settings
      )
      FROM public.payment_provider_configs ppc
      WHERE ppc.enabled = true
        AND ppc.deleted_at IS NULL
        AND (ppc.tenant_id IS NULL OR ppc.tenant_id = p_tenant_id)
        AND (ppc.organization_id IS NULL OR ppc.organization_id = p_organization_id)
        AND (ppc.brand_id IS NULL OR ppc.brand_id = p_brand_id)
        AND (ppc.location_id IS NULL OR ppc.location_id = p_location_id)
      ORDER BY
        CASE WHEN ppc.location_id IS NOT NULL THEN 1 ELSE 0 END DESC,
        CASE WHEN ppc.brand_id IS NOT NULL THEN 1 ELSE 0 END DESC,
        CASE WHEN ppc.organization_id IS NOT NULL THEN 1 ELSE 0 END DESC,
        CASE WHEN ppc.tenant_id IS NOT NULL THEN 1 ELSE 0 END DESC,
        ppc.updated_at DESC
      LIMIT 1
    ), jsonb_build_object(
      'collection_provider', 'not_configured',
      'payout_provider', 'not_configured',
      'check_provider', 'checkbook',
      'enabled', false,
      'settings', '{}'::jsonb
    ))
  END;
$function$;

REVOKE EXECUTE ON FUNCTION public.resolve_payment_provider_config(uuid, uuid, uuid, uuid) FROM anon;

CREATE OR REPLACE FUNCTION public.get_payment_approval_settings(p_organization_id uuid, p_brand_id uuid DEFAULT NULL::uuid, p_location_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN NOT public.is_platform_admin() AND p_organization_id != public.get_auth_org() THEN '{}'::jsonb
    ELSE COALESCE((
      SELECT os.settings
      FROM public.operational_settings os
      WHERE os.organization_id = p_organization_id
        AND os.category = 'payments'
        AND (
          (p_location_id IS NOT NULL AND os.location_id = p_location_id)
          OR (p_brand_id IS NOT NULL AND os.brand_id = p_brand_id AND os.location_id IS NULL)
          OR (os.brand_id IS NULL AND os.location_id IS NULL)
        )
      ORDER BY
        CASE
          WHEN p_location_id IS NOT NULL AND os.location_id = p_location_id THEN 1
          WHEN p_brand_id IS NOT NULL AND os.brand_id = p_brand_id AND os.location_id IS NULL THEN 2
          ELSE 3
        END,
        os.updated_at DESC NULLS LAST
      LIMIT 1
    ), '{}'::jsonb)
  END;
$function$;

CREATE OR REPLACE FUNCTION public.get_product_approval_setting(p_organization_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN NOT public.is_platform_admin() AND p_organization_id != public.get_auth_org() THEN false
    ELSE COALESCE(
      (SELECT (settings->>'require_location_manager_approval')::boolean
       FROM public.operational_settings
       WHERE organization_id = p_organization_id
         AND scope = 'organization'
         AND brand_id IS NULL
         AND location_id IS NULL
         AND category = 'product_approval'),
      false
    )
  END;
$function$;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ==========================================================================
-- Source: 20260727020000_restore_performance_report_rpc_execute_grants.sql
-- ==========================================================================

-- 20260727020000: Restore execute grants for performance report RPCs after
-- SECURITY INVOKER hardening. The functions still run as the caller so table
-- RLS and tenant_scope_visible() enforce scope, but authenticated users must be
-- allowed to invoke the report RPCs from the Performance tabs.

BEGIN;

GRANT EXECUTE ON FUNCTION public.get_category_performance_report(
  uuid, uuid[], date, date, date, date, text[], uuid[], text, text, text[]
) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_category_performance_drilldown(
  uuid, text, uuid[], date, date, date, date, uuid[], text
) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_price_movers_report(
  uuid, uuid[], date, date, date, date, text[], uuid[], text, uuid
) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_price_movers_drilldown(
  uuid, uuid, text, uuid[], date, date, date, date, uuid[], text
) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_inventory_usage_report(
  uuid, uuid[], date, date, text[], text
) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_inventory_usage_drilldown(
  uuid, uuid, uuid, uuid[], date, date, text
) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ==========================================================================
-- Source: 20260727030000_close_unguarded_event_and_usage_rpc_scope.sql
-- ==========================================================================

-- 20260727030000: Final batch of the same class of gap from 20260727010000/20260727020000.
-- emit_domain_event had no check at all and is authenticated-callable -- any logged-in user
-- could inject a fake domain event tagged with another organization's id, which the realtime
-- dispatch (useRealtimeEvents.js listens on event_logs inserts) and the webhook queue both
-- trust as real, letting a caller spoof events/webhooks into a victim org's stream.
-- generate_daily_theoretical_usage had no check and EXECUTE granted to anon -- a completely
-- unauthenticated caller could pull recipe ingredient usage and cost data for any organization.

BEGIN;

CREATE OR REPLACE FUNCTION public.emit_domain_event(p_event_name text, p_entity_type text, p_entity_id uuid, p_org_id uuid, p_payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_event_id UUID;
BEGIN
    IF p_org_id IS NOT NULL AND NOT public.is_platform_admin() AND p_org_id != public.get_auth_org() THEN
        RAISE EXCEPTION 'Cannot emit domain events for another organization';
    END IF;

    INSERT INTO public.event_logs (event_name, entity_type, entity_id, organization_id, payload)
    VALUES (p_event_name, p_entity_type, p_entity_id, p_org_id, p_payload)
    RETURNING id INTO v_event_id;

    -- Automatically queue a webhook if there are active subscriptions
    -- This unifies Real-Time UI events and Webhooks!
    IF p_org_id IS NOT NULL THEN
        INSERT INTO public.webhook_events_queue (organization_id, endpoint_id, event_type, payload)
        SELECT we.organization_id, we.id, p_event_name, p_payload
        FROM public.webhook_endpoints we
        JOIN public.webhook_subscriptions ws ON we.id = ws.endpoint_id
        WHERE we.organization_id = p_org_id
          AND we.status = 'active'
          AND (ws.event_type = p_event_name OR ws.event_type = '*');
    END IF;

    RETURN v_event_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.generate_daily_theoretical_usage(p_org_id uuid, p_date date)
 RETURNS TABLE(ingredient_id uuid, ingredient_name text, unit text, theoretical_usage numeric, cost_value numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT public.is_platform_admin() AND p_org_id != public.get_auth_org() THEN
    RAISE EXCEPTION 'Access Denied: Tenant context violation.';
  END IF;

  RETURN QUERY
  WITH daily_sales AS (
    SELECT psd.pos_item_id, SUM(psd.quantity_sold) AS total_sold
    FROM public.pos_sales_data psd
    WHERE psd.organization_id = p_org_id
      AND psd.date = p_date
    GROUP BY psd.pos_item_id
  ),
  mapped_recipes AS (
    SELECT ds.pos_item_id, ds.total_sold, pmm.recipe_id
    FROM daily_sales ds
    JOIN public.pos_menu_mapping pmm
      ON pmm.pos_item_id = ds.pos_item_id
     AND pmm.organization_id = p_org_id
  ),
  recipe_ingredients_exploded AS (
    SELECT
      ri.product_id AS ingredient_id,
      (ri.quantity * mr.total_sold) AS ingredient_usage,
      p.name AS ingredient_name,
      COALESCE(ri.unit, p.base_unit, 'ea') AS unit,
      COALESCE(p.latest_price, p.average_price, 0) AS cost_per_unit
    FROM mapped_recipes mr
    JOIN public.recipe_ingredients ri ON ri.recipe_id = mr.recipe_id
    JOIN public.products p ON p.id = ri.product_id
  )
  SELECT
    rie.ingredient_id,
    rie.ingredient_name,
    rie.unit,
    SUM(rie.ingredient_usage) AS theoretical_usage,
    SUM(rie.ingredient_usage * rie.cost_per_unit) AS cost_value
  FROM recipe_ingredients_exploded rie
  GROUP BY rie.ingredient_id, rie.ingredient_name, rie.unit
  ORDER BY theoretical_usage DESC;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.generate_daily_theoretical_usage(uuid, date) FROM anon;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ==========================================================================
-- Source: 20260727030000_resecure_performance_base_report_rpcs.sql
-- ==========================================================================

BEGIN;

-- Final-state guard after 20260727020000. Normal authenticated Performance
-- clients must use the single-location wrappers, which assert the active
-- organization -> brand -> location hierarchy. Keep the shared base functions
-- available to service_role and to the SECURITY DEFINER wrappers only.
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

GRANT EXECUTE ON FUNCTION public.get_category_performance_report(
  uuid, uuid[], date, date, date, date, text[], uuid[], text, text, text[]
) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_category_performance_drilldown(
  uuid, text, uuid[], date, date, date, date, uuid[], text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_price_movers_report(
  uuid, uuid[], date, date, date, date, text[], uuid[], text, uuid
) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_price_movers_drilldown(
  uuid, uuid, text, uuid[], date, date, date, date, uuid[], text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_inventory_usage_report(
  uuid, uuid[], date, date, text[], text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_inventory_usage_drilldown(
  uuid, uuid, uuid, uuid[], date, date, text
) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ==========================================================================
-- Source: 20260727040000_fix_inventory_totals_jwt_and_dead_overload.sql
-- ==========================================================================

-- 20260727040000: Two cleanup items from the final pass of the SECURITY DEFINER audit.
--
-- 1. get_inventory_totals checked p_org_id against auth.jwt() ->> 'organization_id' -- the exact
--    JWT/app_metadata read pattern this codebase's Phase 1/2a work already replaced everywhere
--    else, specifically because JWT claims can drift from profiles (the two-source-of-truth
--    bug). Switched to the same get_auth_org() comparison every other guarded function in this
--    codebase uses. No other logic changed.
--
-- 2. can_access_dashboard_scope exists as two overloaded functions with different parameter
--    order: (p_org_id, p_scope, p_brand_id, p_location_id) and (p_org_id, p_brand_id,
--    p_location_id, p_scope). Checked every live RLS policy that calls it (19 policies across 6
--    dashboard_* tables) -- all of them call it positionally as (organization_id, brand_id,
--    location_id, scope), which only matches the second overload's types. The first overload is
--    unreachable dead code (also confirmed zero references anywhere in src/). Dropping it so
--    there's only one definition to read, edit, and reason about.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_inventory_totals(p_org_id uuid, p_search_term text DEFAULT NULL::text, p_location_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_payload JSONB;
BEGIN
  -- Strict multi-tenant enforcement
  IF NOT public.is_platform_admin() AND p_org_id != public.get_auth_org() THEN
    RAISE EXCEPTION 'Access Denied: Tenant Context Violations Precluded Processing.';
  END IF;

  WITH filtered_inventory AS (
    SELECT *
    FROM public.inventory
    WHERE organization_id = p_org_id
      AND (p_location_id IS NULL OR location_id = p_location_id)
      AND (p_search_term IS NULL OR p_search_term = '' OR product_name ILIKE '%' || p_search_term || '%')
  ),
  filtered_wastage AS (
    SELECT value
    FROM public.wastage_logs
    WHERE organization_id = p_org_id
      AND (p_location_id IS NULL OR location_id = p_location_id)
      AND created_at >= date_trunc('month', now())
  )
  SELECT jsonb_build_object(
    'totalItems', count(*),
    'totalValue', coalesce(sum(current_quantity * unit_cost), 0),
    'lowStock', count(*) FILTER (WHERE current_quantity <= coalesce(reorder_point, 5)),
    'totalWastageValue', coalesce((SELECT sum(value) FROM filtered_wastage), 0)
  )
  INTO v_payload
  FROM filtered_inventory;

  RETURN v_payload;
END;
$function$;

DROP FUNCTION IF EXISTS public.can_access_dashboard_scope(uuid, text, uuid, uuid);

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ==========================================================================
-- Source: 20260727060000_correct_performance_budget_scope.sql
-- ==========================================================================

BEGIN;

-- Phase 5: Performance budgets are exact-location, exact-period category
-- targets. PostgreSQL ordinary UNIQUE constraints treat NULL values as
-- distinct, so protect logical rows with normalized scope keys.
DO $$
DECLARE
  v_duplicate_count integer;
BEGIN
  SELECT count(*)::integer
    INTO v_duplicate_count
  FROM (
    SELECT 1
    FROM public.budget_targets
    GROUP BY
      organization_id,
      COALESCE(brand_id, '00000000-0000-0000-0000-000000000000'::uuid),
      COALESCE(location_id, '00000000-0000-0000-0000-000000000000'::uuid),
      period_start,
      period_end,
      btrim(category)
    HAVING count(*) > 1
  ) duplicates;

  IF v_duplicate_count > 0 THEN
    RAISE EXCEPTION
      'Duplicate logical budget_targets rows exist; resolve duplicates before applying Performance budget scope protection. Duplicate groups: %',
      v_duplicate_count
      USING ERRCODE = '23505';
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS budget_targets_logical_scope_unique_idx
  ON public.budget_targets (
    organization_id,
    COALESCE(brand_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(location_id, '00000000-0000-0000-0000-000000000000'::uuid),
    period_start,
    period_end,
    btrim(category)
  );

COMMENT ON INDEX public.budget_targets_logical_scope_unique_idx IS
  'Prevents duplicate Performance budget rows for organization, normalized brand/location scope, exact period, and trimmed category.';

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
DECLARE
  v_result jsonb;
  v_table_rows jsonb;
  v_categories_over_budget integer := 0;
  v_has_budget boolean := false;
  v_location_brand_id uuid;
BEGIN
  PERFORM public.assert_performance_location_access(
    p_organization_id, p_location_id, false
  );

  SELECT l.brand_id
    INTO v_location_brand_id
  FROM public.locations l
  WHERE l.id = p_location_id
    AND l.organization_id = p_organization_id
    AND l.deleted_at IS NULL;

  v_result := public.get_category_performance_report(
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

  WITH source_rows AS (
    SELECT row_data, ordinality
    FROM jsonb_array_elements(COALESCE(v_result->'tableRows', '[]'::jsonb))
      WITH ORDINALITY AS source(row_data, ordinality)
  ),
  exact_budgets AS (
    SELECT
      btrim(bt.category) AS category,
      bt.target_amount::numeric AS target_amount
    FROM public.budget_targets bt
    WHERE bt.organization_id = p_organization_id
      AND bt.location_id = p_location_id
      AND bt.brand_id IS NOT DISTINCT FROM v_location_brand_id
      AND bt.period_start = p_date_from
      AND bt.period_end = p_date_to
  ),
  enriched_rows AS (
    SELECT
      source_rows.ordinality,
      source_rows.row_data,
      exact_budgets.target_amount,
      NULLIF(source_rows.row_data->>'currentSpend', '')::numeric AS current_spend
    FROM source_rows
    LEFT JOIN exact_budgets
      ON exact_budgets.category = btrim(source_rows.row_data->>'category')
  )
  SELECT
    COALESCE(jsonb_agg(
      row_data || jsonb_build_object(
        'budget', target_amount,
        'budgetVariance', CASE
          WHEN target_amount IS NULL THEN NULL
          ELSE round(current_spend - target_amount, 2)
        END
      )
      ORDER BY ordinality
    ), '[]'::jsonb),
    COALESCE(count(*) FILTER (
      WHERE target_amount IS NOT NULL AND current_spend > target_amount
    ), 0)::integer,
    COALESCE(bool_or(target_amount IS NOT NULL), false)
  INTO v_table_rows, v_categories_over_budget, v_has_budget
  FROM enriched_rows;

  v_result := jsonb_set(
    COALESCE(v_result, '{}'::jsonb),
    '{tableRows}',
    v_table_rows,
    true
  );
  v_result := jsonb_set(
    v_result,
    '{summary,categoriesOverBudget}',
    to_jsonb(CASE WHEN v_has_budget THEN v_categories_over_budget ELSE NULL END),
    true
  );
  v_result := jsonb_set(
    v_result,
    '{metadata,hasBudgetData}',
    to_jsonb(v_has_budget),
    true
  );
  v_result := jsonb_set(
    v_result,
    '{metadata,budgetScope}',
    to_jsonb('exact_location_brand_period_category'::text),
    true
  );
  v_result := jsonb_set(
    v_result,
    '{metadata,budgetPeriodRule}',
    to_jsonb('exact_period_match'::text),
    true
  );

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_location_category_performance_report(
  uuid, uuid, date, date, date, date, text[], uuid[], text, text, text[]
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_location_category_performance_report(
  uuid, uuid, date, date, date, date, text[], uuid[], text, text, text[]
) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_location_category_performance_report(
  uuid, uuid, date, date, date, date, text[], uuid[], text, text, text[]
) IS
  'Secured single-location Performance Category report with exact active-location brand, location, period, and category budget matching.';

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ==========================================================================
-- Source: 20260727070000_expose_price_mover_impact_evidence.sql
-- ==========================================================================

-- Phase 7 Price Movers: expose normalized quantity and impact evidence.
-- Safe comparison: same internal_product_id + same normalized UOM.
-- Normalized unit cost = total_price / NULLIF(quantity * COALESCE(conversion_multiplier, 1), 0).
-- Eligibility: is_purchasing_spend_invoice (same as Category Report).

BEGIN;

-- Ensure UOM normalization helper exists (may be missing if product-module
-- migration was not applied to this environment).
CREATE OR REPLACE FUNCTION public.normalize_product_report_unit(p_unit text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN NULLIF(trim(COALESCE(p_unit, '')), '') IS NULL THEN 'Each'
    WHEN lower(trim(p_unit)) IN ('ea', 'each', 'unit', 'units') THEN 'Each'
    WHEN lower(trim(p_unit)) IN ('cs', 'case', 'cases') THEN 'Case'
    WHEN lower(trim(p_unit)) IN ('lb', 'lbs', 'pound', 'pounds') THEN 'Pound'
    WHEN lower(trim(p_unit)) IN ('oz', 'ounce', 'ounces') THEN 'Ounce'
    WHEN lower(trim(p_unit)) IN ('gal', 'gallon', 'gallons') THEN 'Gallon'
    WHEN lower(trim(p_unit)) IN ('qt', 'quart', 'quarts') THEN 'Quart'
    WHEN lower(trim(p_unit)) IN ('pt', 'pint', 'pints') THEN 'Pint'
    WHEN lower(trim(p_unit)) IN ('floz', 'fl oz', 'fluid ounce', 'fluid ounces') THEN 'Fluid Ounce'
    WHEN lower(trim(p_unit)) IN ('kg', 'kilogram', 'kilograms') THEN 'Kilogram'
    WHEN lower(trim(p_unit)) IN ('g', 'gram', 'grams') THEN 'Gram'
    WHEN lower(trim(p_unit)) IN ('box', 'boxes') THEN 'Box'
    WHEN lower(trim(p_unit)) IN ('bag', 'bags') THEN 'Bag'
    WHEN lower(trim(p_unit)) IN ('btl', 'bottle', 'bottles') THEN 'Bottle'
    WHEN lower(trim(p_unit)) IN ('can', 'cans') THEN 'Can'
    ELSE initcap(trim(p_unit))
  END;
$$;

CREATE OR REPLACE FUNCTION public.get_price_movers_report(
  p_organization_id uuid DEFAULT NULL,
  p_location_ids uuid[] DEFAULT NULL,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
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
DECLARE
  v_org_id uuid := COALESCE(p_organization_id, public.get_auth_org());
  v_tz text := COALESCE(NULLIF(trim(p_timezone), ''), 'UTC');
  v_result jsonb;
  v_outlier_threshold numeric := 50; -- abs % change above this flagged as outlier
BEGIN
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organization context is required';
  END IF;
  IF p_date_from IS NULL OR p_date_to IS NULL THEN
    RAISE EXCEPTION 'date_from and date_to are required';
  END IF;

  WITH eligible_invoices AS (
    SELECT i.*
    FROM public.invoices i
    WHERE i.organization_id = v_org_id
      AND public.is_purchasing_spend_invoice(i.status, i.ap_status, i.deleted_at)
      AND public.tenant_scope_visible(i.organization_id, i.brand_id, i.location_id, i.deleted_at)
      AND (
        p_location_ids IS NULL OR cardinality(p_location_ids) = 0
        OR i.location_id = ANY (p_location_ids)
      )
      AND (
        p_vendor_ids IS NULL OR cardinality(p_vendor_ids) = 0
        OR i.vendor_id = ANY (p_vendor_ids)
      )
  ),
  mapped_lines AS (
    SELECT
      ili.id AS line_id,
      ili.invoice_id,
      i.invoice_date,
      i.vendor_id,
      COALESCE(NULLIF(trim(i.vendor_name), ''), 'Unknown vendor') AS vendor_name,
      i.location_id,
      ili.internal_product_id,
      COALESCE(p.name, ili.item_name, 'Unknown product') AS product_name,
      COALESCE(NULLIF(trim(p.category), ''), 'Uncategorized') AS category_name,
      public.normalize_product_report_unit(
        COALESCE(NULLIF(trim(p.report_by_unit), ''), NULLIF(trim(ili.vendor_unit), ''), 'Each')
      ) AS report_unit,
      COALESCE(ili.quantity, 0)::numeric AS quantity,
      COALESCE(ili.unit_price, 0)::numeric AS unit_price,
      COALESCE(ili.total_price, COALESCE(ili.quantity, 0) * COALESCE(ili.unit_price, 0))::numeric AS total_price,
      COALESCE(vim.conversion_multiplier, 1)::numeric AS conversion_multiplier,
      CASE
        WHEN ili.internal_product_id IS NULL THEN 'unmapped'
        WHEN vim.is_verified IS TRUE THEN 'verified'
        WHEN vim.internal_product_id IS NOT NULL THEN 'mapped'
        ELSE 'mapped'
      END AS mapping_status,
      NULLIF(trim(ili.vendor_unit), '') AS vendor_unit,
      NULLIF(trim(vi.pack_size), '') AS pack_size
    FROM eligible_invoices i
    JOIN public.invoice_line_items ili ON ili.invoice_id = i.id
    LEFT JOIN public.products p ON p.id = ili.internal_product_id AND p.deleted_at IS NULL
    LEFT JOIN LATERAL (
      SELECT m.conversion_multiplier, m.is_verified, m.internal_product_id
      FROM public.vendor_item_mappings m
      WHERE m.internal_product_id = ili.internal_product_id
        AND (ili.vendor_item_id IS NULL OR m.vendor_item_id = ili.vendor_item_id)
      ORDER BY m.is_verified DESC NULLS LAST
      LIMIT 1
    ) vim ON TRUE
    LEFT JOIN public.vendor_items vi ON vi.id = ili.vendor_item_id
    WHERE (
        p_category_names IS NULL OR cardinality(p_category_names) = 0
        OR COALESCE(NULLIF(trim(p.category), ''), 'Uncategorized') = ANY (p_category_names)
      )
      AND (p_product_id IS NULL OR ili.internal_product_id = p_product_id)
  ),
  priced AS (
    SELECT
      ml.*,
      (ml.quantity * ml.conversion_multiplier) AS normalized_qty,
      CASE
        WHEN (ml.quantity * ml.conversion_multiplier) = 0 THEN NULL
        ELSE round(ml.total_price / (ml.quantity * ml.conversion_multiplier), 6)
      END AS normalized_unit_cost
    FROM mapped_lines ml
  ),
  current_rows AS (
    SELECT * FROM priced
    WHERE invoice_date >= p_date_from AND invoice_date <= p_date_to
  ),
  previous_rows AS (
    SELECT * FROM priced
    WHERE p_comparison_date_from IS NOT NULL
      AND p_comparison_date_to IS NOT NULL
      AND invoice_date >= p_comparison_date_from
      AND invoice_date <= p_comparison_date_to
  ),
  current_agg AS (
    SELECT
      internal_product_id,
      product_name,
      category_name,
      report_unit,
      (array_agg(vendor_name ORDER BY total_price DESC))[1] AS primary_vendor,
      (array_agg(vendor_id ORDER BY total_price DESC))[1] AS primary_vendor_id,
      (array_agg(mapping_status ORDER BY CASE mapping_status WHEN 'verified' THEN 0 WHEN 'mapped' THEN 1 ELSE 2 END))[1] AS mapping_status,
      (array_agg(pack_size) FILTER (WHERE pack_size IS NOT NULL))[1] AS pack_size,
      round(sum(total_price)::numeric, 2) AS current_spend,
      round(sum(normalized_qty)::numeric, 4) AS current_qty,
      CASE WHEN sum(normalized_qty) = 0 THEN NULL
           ELSE round(sum(total_price) / sum(normalized_qty), 6)
      END AS current_price,
      count(DISTINCT invoice_id)::bigint AS invoice_count,
      max(invoice_date) AS last_purchase
    FROM current_rows
    GROUP BY internal_product_id, product_name, category_name, report_unit
  ),
  previous_agg AS (
    SELECT
      internal_product_id,
      report_unit,
      round(sum(total_price)::numeric, 2) AS previous_spend,
      round(sum(normalized_qty)::numeric, 4) AS previous_qty,
      CASE WHEN sum(normalized_qty) = 0 THEN NULL
           ELSE round(sum(total_price) / sum(normalized_qty), 6)
      END AS previous_price
    FROM previous_rows
    GROUP BY internal_product_id, report_unit
  ),
  joined AS (
    SELECT
      c.internal_product_id AS product_id,
      c.product_name AS product,
      c.primary_vendor AS vendor,
      c.primary_vendor_id AS vendor_id,
      c.category_name AS category,
      c.report_unit AS unit,
      c.pack_size,
      c.current_price,
      p.previous_price,
      c.current_spend,
      COALESCE(p.previous_spend, 0) AS previous_spend,
      c.current_qty,
      c.invoice_count,
      c.last_purchase,
      c.mapping_status,
      CASE
        WHEN c.internal_product_id IS NULL THEN 'not_comparable'
        WHEN c.current_price IS NULL THEN 'not_comparable'
        WHEN p.previous_price IS NULL THEN 'not_comparable'
        WHEN c.report_unit IS DISTINCT FROM p.report_unit THEN 'not_comparable'
        ELSE 'comparable'
      END AS comparability_status,
      CASE
        WHEN c.internal_product_id IS NULL OR c.current_price IS NULL OR p.previous_price IS NULL
          OR c.report_unit IS DISTINCT FROM p.report_unit
        THEN NULL
        ELSE round(c.current_price - p.previous_price, 6)
      END AS price_change,
      CASE
        WHEN c.internal_product_id IS NULL OR c.current_price IS NULL OR p.previous_price IS NULL
          OR c.report_unit IS DISTINCT FROM p.report_unit
        THEN NULL
        WHEN p.previous_price = 0 AND c.current_price = 0 THEN 0
        WHEN p.previous_price = 0 THEN NULL
        ELSE round(((c.current_price - p.previous_price) / abs(p.previous_price)) * 100, 2)
      END AS percentage_change,
      CASE
        WHEN c.internal_product_id IS NULL OR c.current_price IS NULL OR p.previous_price IS NULL
          OR c.report_unit IS DISTINCT FROM p.report_unit
          OR c.current_qty IS NULL OR c.current_qty = 0
        THEN NULL
        ELSE round((c.current_price - p.previous_price) * c.current_qty, 2)
      END AS estimated_impact
    FROM current_agg c
    LEFT JOIN previous_agg p
      ON p.internal_product_id IS NOT DISTINCT FROM c.internal_product_id
     AND p.report_unit = c.report_unit
  ),
  enriched AS (
    SELECT
      j.*,
      CASE
        WHEN j.comparability_status <> 'comparable' OR j.percentage_change IS NULL THEN 'n/a'
        WHEN abs(j.percentage_change) >= v_outlier_threshold THEN 'outlier'
        ELSE 'normal'
      END AS outlier_status
    FROM joined j
  ),
  comparable AS (
    SELECT * FROM enriched WHERE comparability_status = 'comparable'
  ),
  summary AS (
    SELECT
      (SELECT count(*) FROM comparable WHERE price_change > 0)::int AS products_with_increases,
      (SELECT count(*) FROM comparable WHERE price_change < 0)::int AS products_with_decreases,
      (SELECT round(avg(percentage_change)::numeric, 2) FROM comparable WHERE percentage_change IS NOT NULL) AS average_price_change,
      (SELECT round(coalesce(sum(estimated_impact), 0)::numeric, 2) FROM comparable WHERE estimated_impact > 0) AS estimated_unfavorable_impact,
      (SELECT round(coalesce(sum(estimated_impact), 0)::numeric, 2) FROM comparable WHERE estimated_impact < 0) AS estimated_favorable_impact,
      (SELECT count(*) FROM enriched WHERE comparability_status = 'not_comparable')::int AS non_comparable_count,
      (SELECT count(*) FROM enriched)::int AS total_products,
      (SELECT count(DISTINCT vendor_id) FROM comparable WHERE price_change > 0 AND vendor_id IS NOT NULL)::int AS vendors_driving_increases
  ),
  largest_increase AS (
    SELECT jsonb_build_object(
      'product', product,
      'vendor', vendor,
      'category', category,
      'priceChange', price_change,
      'percentageChange', percentage_change,
      'estimatedImpact', estimated_impact,
      'normalizedPurchasedQuantity', current_qty,
      'normalizedQuantityUnit', unit,
      'currentWeightedUnitPrice', current_price,
      'comparisonWeightedUnitPrice', previous_price,
      'unitPriceDifference', price_change,
      'mappingConfidence', CASE mapping_status WHEN 'verified' THEN 'verified' WHEN 'mapped' THEN 'mapped_unverified' ELSE mapping_status END,
      'impactEvidenceComplete', (
        comparability_status = 'comparable'
        AND mapping_status = 'verified'
        AND estimated_impact IS NOT NULL
        AND current_qty IS NOT NULL
        AND current_qty <> 0
        AND price_change IS NOT NULL
        AND unit IS NOT NULL
      ),
      'impactFormula', 'unitPriceDifference * normalizedPurchasedQuantity'
    ) AS obj
    FROM comparable
    WHERE price_change IS NOT NULL
    ORDER BY price_change DESC NULLS LAST
    LIMIT 1
  ),
  largest_decrease AS (
    SELECT jsonb_build_object(
      'product', product,
      'vendor', vendor,
      'category', category,
      'priceChange', price_change,
      'percentageChange', percentage_change,
      'estimatedImpact', estimated_impact,
      'normalizedPurchasedQuantity', current_qty,
      'normalizedQuantityUnit', unit,
      'currentWeightedUnitPrice', current_price,
      'comparisonWeightedUnitPrice', previous_price,
      'unitPriceDifference', price_change,
      'mappingConfidence', CASE mapping_status WHEN 'verified' THEN 'verified' WHEN 'mapped' THEN 'mapped_unverified' ELSE mapping_status END,
      'impactEvidenceComplete', (
        comparability_status = 'comparable'
        AND mapping_status = 'verified'
        AND estimated_impact IS NOT NULL
        AND current_qty IS NOT NULL
        AND current_qty <> 0
        AND price_change IS NOT NULL
        AND unit IS NOT NULL
      ),
      'impactFormula', 'unitPriceDifference * normalizedPurchasedQuantity'
    ) AS obj
    FROM comparable
    WHERE price_change IS NOT NULL
    ORDER BY price_change ASC NULLS LAST
    LIMIT 1
  ),
  most_volatile AS (
    SELECT jsonb_build_object(
      'product', product,
      'vendor', vendor,
      'category', category,
      'percentageChange', percentage_change,
      'estimatedImpact', estimated_impact,
      'normalizedPurchasedQuantity', current_qty,
      'normalizedQuantityUnit', unit,
      'currentWeightedUnitPrice', current_price,
      'comparisonWeightedUnitPrice', previous_price,
      'unitPriceDifference', price_change,
      'mappingConfidence', CASE mapping_status WHEN 'verified' THEN 'verified' WHEN 'mapped' THEN 'mapped_unverified' ELSE mapping_status END,
      'impactEvidenceComplete', (
        comparability_status = 'comparable'
        AND mapping_status = 'verified'
        AND estimated_impact IS NOT NULL
        AND current_qty IS NOT NULL
        AND current_qty <> 0
        AND price_change IS NOT NULL
        AND unit IS NOT NULL
      ),
      'impactFormula', 'unitPriceDifference * normalizedPurchasedQuantity'
    ) AS obj
    FROM comparable
    WHERE percentage_change IS NOT NULL
    ORDER BY abs(percentage_change) DESC NULLS LAST
    LIMIT 1
  ),
  ranking AS (
    SELECT jsonb_agg(
      jsonb_build_object(
        'product', product,
        'productId', product_id,
        'vendor', vendor,
        'category', category,
        'percentageChange', percentage_change,
        'priceChange', price_change,
        'estimatedImpact', estimated_impact,
        'currentPrice', current_price,
      'normalizedPurchasedQuantity', current_qty,
      'normalizedQuantityUnit', unit,
      'currentWeightedUnitPrice', current_price,
      'comparisonWeightedUnitPrice', previous_price,
      'unitPriceDifference', price_change,
      'mappingConfidence', CASE mapping_status WHEN 'verified' THEN 'verified' WHEN 'mapped' THEN 'mapped_unverified' ELSE mapping_status END,
      'impactEvidenceComplete', (
        comparability_status = 'comparable'
        AND mapping_status = 'verified'
        AND estimated_impact IS NOT NULL
        AND current_qty IS NOT NULL
        AND current_qty <> 0
        AND price_change IS NOT NULL
        AND unit IS NOT NULL
      ),
      'impactFormula', 'unitPriceDifference * normalizedPurchasedQuantity'
      )
      ORDER BY estimated_impact DESC NULLS LAST
    ) AS arr
    FROM (
      SELECT * FROM comparable
      WHERE estimated_impact IS NOT NULL
      ORDER BY estimated_impact DESC NULLS LAST
      LIMIT 20
    ) top_impact
  ),
  -- Histogram buckets of percentage change
  hist AS (
    SELECT
      width_bucket(percentage_change, -50, 50, 10) AS bucket,
      count(*)::int AS count
    FROM comparable
    WHERE percentage_change IS NOT NULL
      AND percentage_change BETWEEN -50 AND 50
    GROUP BY 1
  ),
  distribution AS (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'bucket', bucket,
        'label', CASE bucket
          WHEN 1 THEN '-50 to -40'
          WHEN 2 THEN '-40 to -30'
          WHEN 3 THEN '-30 to -20'
          WHEN 4 THEN '-20 to -10'
          WHEN 5 THEN '-10 to 0'
          WHEN 6 THEN '0 to 10'
          WHEN 7 THEN '10 to 20'
          WHEN 8 THEN '20 to 30'
          WHEN 9 THEN '30 to 40'
          WHEN 10 THEN '40 to 50'
          ELSE 'other'
        END,
        'count', count
      )
      ORDER BY bucket
    ), '[]'::jsonb) AS arr
    FROM hist
  ),
  scatter AS (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'productId', product_id,
        'product', product,
        'percentageChange', percentage_change,
        'estimatedImpact', estimated_impact,
        'currentSpend', current_spend,
        'category', category,
      'normalizedPurchasedQuantity', current_qty,
      'normalizedQuantityUnit', unit,
      'currentWeightedUnitPrice', current_price,
      'comparisonWeightedUnitPrice', previous_price,
      'unitPriceDifference', price_change,
      'mappingConfidence', CASE mapping_status WHEN 'verified' THEN 'verified' WHEN 'mapped' THEN 'mapped_unverified' ELSE mapping_status END,
      'impactEvidenceComplete', (
        comparability_status = 'comparable'
        AND mapping_status = 'verified'
        AND estimated_impact IS NOT NULL
        AND current_qty IS NOT NULL
        AND current_qty <> 0
        AND price_change IS NOT NULL
        AND unit IS NOT NULL
      ),
      'impactFormula', 'unitPriceDifference * normalizedPurchasedQuantity'
      )
    ), '[]'::jsonb) AS arr
    FROM comparable
    WHERE percentage_change IS NOT NULL AND estimated_impact IS NOT NULL
  ),
  category_inflation AS (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'category', category,
        'averagePercentageChange', average_percentage_change,
        'unfavorableImpact', unfavorable_impact,
        'productCount', product_count
      )
      ORDER BY average_percentage_change DESC NULLS LAST
    ), '[]'::jsonb) AS arr
    FROM (
      SELECT
        category,
        round(avg(percentage_change)::numeric, 2) AS average_percentage_change,
        round(sum(estimated_impact) FILTER (WHERE estimated_impact > 0)::numeric, 2) AS unfavorable_impact,
        count(*)::int AS product_count
      FROM comparable
      WHERE percentage_change IS NOT NULL
      GROUP BY category
    ) cat
  ),
  vendor_impact AS (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'vendor', vendor,
        'vendorId', vendor_id,
        'unfavorableImpact', unfavorable_impact,
        'favorableImpact', favorable_impact,
        'netImpact', net_impact,
        'productsIncreased', products_increased,
        'productCount', product_count
      )
      ORDER BY unfavorable_impact DESC NULLS LAST
    ), '[]'::jsonb) AS arr
    FROM (
      SELECT
        vendor,
        vendor_id,
        round(sum(estimated_impact) FILTER (WHERE estimated_impact > 0)::numeric, 2) AS unfavorable_impact,
        round(sum(estimated_impact) FILTER (WHERE estimated_impact < 0)::numeric, 2) AS favorable_impact,
        round(sum(estimated_impact)::numeric, 2) AS net_impact,
        count(*) FILTER (WHERE price_change > 0)::int AS products_increased,
        count(*)::int AS product_count
      FROM comparable
      WHERE vendor IS NOT NULL AND estimated_impact IS NOT NULL
      GROUP BY vendor, vendor_id
    ) ven
  ),
  -- Trend for top volatile / impact products (daily or weekly points in current period)
  top_trend_products AS (
    SELECT product_id
    FROM comparable
    WHERE product_id IS NOT NULL AND percentage_change IS NOT NULL
    ORDER BY abs(COALESCE(estimated_impact, 0)) DESC
    LIMIT 5
  ),
  trend AS (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'bucket', t.bucket,
        'bucketStart', t.bucket_start,
        'product', t.product_name,
        'productId', t.internal_product_id,
        'unitCost', t.unit_cost
      )
      ORDER BY t.bucket_start, t.product_name
    ), '[]'::jsonb) AS arr
    FROM (
      SELECT
        cr.invoice_date::text AS bucket,
        cr.invoice_date AS bucket_start,
        cr.internal_product_id,
        cr.product_name,
        round(avg(cr.normalized_unit_cost)::numeric, 6) AS unit_cost
      FROM current_rows cr
      WHERE cr.internal_product_id IN (SELECT product_id FROM top_trend_products)
        AND cr.normalized_unit_cost IS NOT NULL
      GROUP BY cr.invoice_date, cr.internal_product_id, cr.product_name
    ) t
  ),
  filter_options AS (
    SELECT
      COALESCE((
        SELECT jsonb_agg(DISTINCT category_name ORDER BY category_name)
        FROM priced WHERE category_name IS NOT NULL
      ), '[]'::jsonb) AS categories,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', vendor_id, 'name', vendor_name) ORDER BY vendor_name)
        FROM (
          SELECT DISTINCT vendor_id, vendor_name FROM priced WHERE vendor_id IS NOT NULL
        ) v
      ), '[]'::jsonb) AS vendors
  )
  SELECT jsonb_build_object(
    'summary', jsonb_build_object(
      'productsWithIncreases', s.products_with_increases,
      'productsWithDecreases', s.products_with_decreases,
      'averagePriceChange', s.average_price_change,
      'estimatedUnfavorableImpact', s.estimated_unfavorable_impact,
      'estimatedFavorableImpact', s.estimated_favorable_impact,
      'largestPriceIncrease', (SELECT obj FROM largest_increase),
      'largestPriceDecrease', (SELECT obj FROM largest_decrease),
      'mostVolatileProduct', (SELECT obj FROM most_volatile),
      'vendorsDrivingIncreases', s.vendors_driving_increases,
      'nonComparableProducts', s.non_comparable_count,
      'totalProducts', s.total_products
    ),
    'ranking', COALESCE((SELECT arr FROM ranking), '[]'::jsonb),
    'trend', COALESCE((SELECT arr FROM trend), '[]'::jsonb),
    'distribution', COALESCE((SELECT arr FROM distribution), '[]'::jsonb),
    'scatter', COALESCE((SELECT arr FROM scatter), '[]'::jsonb),
    'categoryInflation', COALESCE((SELECT arr FROM category_inflation), '[]'::jsonb),
    'vendorImpact', COALESCE((SELECT arr FROM vendor_impact), '[]'::jsonb),
    'tableRows', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'productId', e.product_id,
          'product', e.product,
          'vendor', e.vendor,
          'vendorId', e.vendor_id,
          'category', e.category,
          'unit', e.unit,
          'packSize', e.pack_size,
          'currentPrice', e.current_price,
          'previousPrice', e.previous_price,
          'priceChange', e.price_change,
          'percentageChange', e.percentage_change,
          'currentSpend', e.current_spend,
          'estimatedImpact', e.estimated_impact,
          'normalizedPurchasedQuantity', e.current_qty,
          'normalizedQuantityUnit', e.unit,
          'currentWeightedUnitPrice', e.current_price,
          'comparisonWeightedUnitPrice', e.previous_price,
          'unitPriceDifference', e.price_change,
          'mappingConfidence', CASE e.mapping_status WHEN 'verified' THEN 'verified' WHEN 'mapped' THEN 'mapped_unverified' ELSE e.mapping_status END,
          'impactEvidenceComplete', (
            e.comparability_status = 'comparable'
            AND e.mapping_status = 'verified'
            AND e.estimated_impact IS NOT NULL
            AND e.current_qty IS NOT NULL
            AND e.current_qty <> 0
            AND e.price_change IS NOT NULL
            AND e.unit IS NOT NULL
          ),
          'impactFormula', 'unitPriceDifference * normalizedPurchasedQuantity',
          'invoiceCount', e.invoice_count,
          'lastPurchase', e.last_purchase,
          'mappingStatus', e.mapping_status,
          'comparabilityStatus', e.comparability_status,
          'outlierStatus', e.outlier_status
        )
        ORDER BY COALESCE(e.estimated_impact, 0) DESC
      )
      FROM enriched e
    ), '[]'::jsonb),
    'insights', COALESCE((
      SELECT jsonb_agg(ins ORDER BY (ins->>'impact')::numeric DESC)
      FROM (
        SELECT jsonb_build_object(
          'id', 'unfavorable-impact',
          'impact', abs(s.estimated_unfavorable_impact),
          'text', format(
            'Estimated unfavorable purchasing impact from price increases is $%s.',
            to_char(s.estimated_unfavorable_impact, 'FM999,999,990')
          )
        ) AS ins
        WHERE s.estimated_unfavorable_impact > 0
        UNION ALL
        SELECT jsonb_build_object(
          'id', 'avg-change',
          'impact', abs(COALESCE(s.average_price_change, 0)) * 100,
          'text', format(
            'Average comparable price change is %s%% across %s products.',
            to_char(COALESCE(s.average_price_change, 0), 'FM990.0'),
            s.products_with_increases + s.products_with_decreases
          )
        )
        WHERE s.average_price_change IS NOT NULL
        UNION ALL
        SELECT jsonb_build_object(
          'id', 'non-comparable',
          'impact', s.non_comparable_count,
          'text', format(
            '%s products are not comparable due to missing product mapping or incompatible units.',
            s.non_comparable_count
          )
        )
        WHERE s.non_comparable_count > 0
        UNION ALL
        SELECT jsonb_build_object(
          'id', 'largest-inc',
          'impact', abs(COALESCE((SELECT (obj->>'estimatedImpact')::numeric FROM largest_increase), 0)),
          'text', format(
            '%s had the largest price increase (%s%%).',
            (SELECT obj->>'product' FROM largest_increase),
            (SELECT obj->>'percentageChange' FROM largest_increase)
          )
        )
        WHERE EXISTS (SELECT 1 FROM largest_increase WHERE obj IS NOT NULL)
      ) insight_rows
    ), '[]'::jsonb),
    'metadata', jsonb_build_object(
      'currency', 'USD',
      'timezone', v_tz,
      'dataFreshness', to_char(now() AT TIME ZONE v_tz, 'YYYY-MM-DD HH24:MI'),
      'priceDefinition', 'Normalized weighted-average unit cost = line total_price / (quantity * COALESCE(conversion_multiplier, 1)). Estimated impact evidence is unitPriceDifference * normalizedPurchasedQuantity. Complete evidence requires a verified unit mapping, non-zero normalized quantity, same internal product, and same normalized UOM.',
      'outlierThresholdPercent', v_outlier_threshold,
      'filterOptions', jsonb_build_object(
        'categories', (SELECT categories FROM filter_options),
        'vendors', (SELECT vendors FROM filter_options)
      )
    )
  )
  INTO v_result
  FROM summary s;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_price_movers_report(
  uuid, uuid[], date, date, date, date, text[], uuid[], text, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_price_movers_report(
  uuid, uuid[], date, date, date, date, text[], uuid[], text, uuid
) TO service_role;

CREATE OR REPLACE FUNCTION public.get_price_movers_drilldown(
  p_organization_id uuid DEFAULT NULL,
  p_product_id uuid DEFAULT NULL,
  p_product_name text DEFAULT NULL,
  p_location_ids uuid[] DEFAULT NULL,
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
DECLARE
  v_org_id uuid := COALESCE(p_organization_id, public.get_auth_org());
  v_result jsonb;
BEGIN
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organization context is required';
  END IF;
  IF p_date_from IS NULL OR p_date_to IS NULL THEN
    RAISE EXCEPTION 'date_from and date_to are required';
  END IF;
  IF p_product_id IS NULL AND NULLIF(trim(COALESCE(p_product_name, '')), '') IS NULL THEN
    RAISE EXCEPTION 'product_id or product_name is required';
  END IF;

  WITH eligible_invoices AS (
    SELECT i.*
    FROM public.invoices i
    WHERE i.organization_id = v_org_id
      AND public.is_purchasing_spend_invoice(i.status, i.ap_status, i.deleted_at)
      AND public.tenant_scope_visible(i.organization_id, i.brand_id, i.location_id, i.deleted_at)
      AND (
        p_location_ids IS NULL OR cardinality(p_location_ids) = 0
        OR i.location_id = ANY (p_location_ids)
      )
      AND (
        p_vendor_ids IS NULL OR cardinality(p_vendor_ids) = 0
        OR i.vendor_id = ANY (p_vendor_ids)
      )
  ),
  lines AS (
    SELECT
      ili.id AS line_id,
      ili.invoice_id,
      i.invoice_number,
      i.invoice_date,
      i.vendor_id,
      COALESCE(NULLIF(trim(i.vendor_name), ''), 'Unknown vendor') AS vendor_name,
      l.name AS location_name,
      ili.internal_product_id,
      COALESCE(p.name, ili.item_name) AS product_name,
      COALESCE(NULLIF(trim(p.category), ''), 'Uncategorized') AS category_name,
      public.normalize_product_report_unit(
        COALESCE(NULLIF(trim(p.report_by_unit), ''), NULLIF(trim(ili.vendor_unit), ''), 'Each')
      ) AS report_unit,
      COALESCE(ili.quantity, 0)::numeric AS quantity,
      COALESCE(ili.unit_price, 0)::numeric AS unit_price,
      COALESCE(ili.total_price, 0)::numeric AS total_price,
      COALESCE(vim.conversion_multiplier, 1)::numeric AS conversion_multiplier,
      CASE
        WHEN ili.internal_product_id IS NULL THEN 'unmapped'
        WHEN vim.is_verified IS TRUE THEN 'verified'
        WHEN vim.internal_product_id IS NOT NULL THEN 'mapped'
        ELSE 'mapped'
      END AS mapping_status,
      NULLIF(trim(ili.vendor_unit), '') AS vendor_unit,
      NULLIF(trim(vi.pack_size), '') AS pack_size,
      i.status
    FROM eligible_invoices i
    JOIN public.invoice_line_items ili ON ili.invoice_id = i.id
    LEFT JOIN public.products p ON p.id = ili.internal_product_id
    LEFT JOIN public.locations l ON l.id = i.location_id
    LEFT JOIN LATERAL (
      SELECT m.conversion_multiplier, m.is_verified, m.internal_product_id
      FROM public.vendor_item_mappings m
      WHERE m.internal_product_id = ili.internal_product_id
      ORDER BY m.is_verified DESC NULLS LAST
      LIMIT 1
    ) vim ON TRUE
    LEFT JOIN public.vendor_items vi ON vi.id = ili.vendor_item_id
    WHERE (
      (p_product_id IS NOT NULL AND ili.internal_product_id = p_product_id)
      OR (
        p_product_id IS NULL
        AND lower(COALESCE(p.name, ili.item_name, '')) = lower(trim(p_product_name))
      )
    )
  ),
  priced AS (
    SELECT
      *,
      quantity * conversion_multiplier AS normalized_qty,
      CASE WHEN quantity * conversion_multiplier = 0 THEN NULL
           ELSE round(total_price / (quantity * conversion_multiplier), 6)
      END AS normalized_unit_cost
    FROM lines
  ),
  current_rows AS (
    SELECT * FROM priced
    WHERE invoice_date >= p_date_from AND invoice_date <= p_date_to
  ),
  previous_rows AS (
    SELECT * FROM priced
    WHERE p_comparison_date_from IS NOT NULL
      AND p_comparison_date_to IS NOT NULL
      AND invoice_date >= p_comparison_date_from
      AND invoice_date <= p_comparison_date_to
  ),
  summary AS (
    SELECT
      (SELECT product_name FROM current_rows LIMIT 1) AS product,
      (SELECT category_name FROM current_rows LIMIT 1) AS category,
      (SELECT report_unit FROM current_rows LIMIT 1) AS unit,
      (SELECT pack_size FROM current_rows WHERE pack_size IS NOT NULL LIMIT 1) AS pack_size,
      (array_agg(mapping_status ORDER BY CASE mapping_status WHEN 'verified' THEN 0 WHEN 'mapped' THEN 1 ELSE 2 END))[1] AS mapping_status,
      round(sum(normalized_qty)::numeric, 4) AS current_qty,
      CASE WHEN sum(normalized_qty) = 0 THEN NULL
           ELSE round(sum(total_price) / sum(normalized_qty), 6) END AS current_price,
      (SELECT CASE WHEN sum(pr.normalized_qty) = 0 THEN NULL
                   ELSE round(sum(pr.total_price) / sum(pr.normalized_qty), 6) END
       FROM previous_rows pr) AS previous_price,
      round(sum(total_price)::numeric, 2) AS current_spend,
      count(DISTINCT invoice_id)::bigint AS invoice_count,
      count(DISTINCT vendor_id)::bigint AS vendor_count
    FROM current_rows
  ),
  price_history AS (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'date', invoice_date,
        'unitCost', round(avg(normalized_unit_cost)::numeric, 6),
        'spend', round(sum(total_price)::numeric, 2),
        'quantity', round(sum(normalized_qty)::numeric, 4)
      )
      ORDER BY invoice_date
    ), '[]'::jsonb) AS arr
    FROM current_rows
    WHERE normalized_unit_cost IS NOT NULL
    GROUP BY invoice_date
  ),
  vendor_comparison AS (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'vendor', vendor_name,
        'vendorId', vendor_id,
        'currentPrice', CASE WHEN sum(normalized_qty) = 0 THEN NULL
                             ELSE round(sum(total_price) / sum(normalized_qty), 6) END,
        'spend', round(sum(total_price)::numeric, 2),
        'invoiceCount', count(DISTINCT invoice_id),
        'unit', (array_agg(report_unit))[1]
      )
      ORDER BY sum(total_price) DESC
    ), '[]'::jsonb) AS arr
    FROM current_rows
    GROUP BY vendor_id, vendor_name
  ),
  purchases AS (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'invoiceId', invoice_id,
        'invoiceNumber', invoice_number,
        'date', invoice_date,
        'vendor', vendor_name,
        'quantity', quantity,
        'unitPrice', unit_price,
        'normalizedUnitCost', normalized_unit_cost,
        'amount', total_price,
        'unit', report_unit,
        'status', status,
        'location', location_name
      )
      ORDER BY invoice_date DESC
    ), '[]'::jsonb) AS arr
    FROM current_rows
  ),
  normalization AS (
    SELECT jsonb_build_object(
      'reportUnit', (SELECT unit FROM summary),
      'packSize', (SELECT pack_size FROM summary),
      'conversionMultiplier', (SELECT conversion_multiplier FROM current_rows LIMIT 1),
      'formula', 'normalized_unit_cost = total_price / (quantity * COALESCE(conversion_multiplier, 1))',
      'comparabilityRule', 'Same internal_product_id and normalized UOM required across periods'
    ) AS obj
  )
  SELECT jsonb_build_object(
    'productId', p_product_id,
    'summary', jsonb_build_object(
      'product', s.product,
      'category', s.category,
      'unit', s.unit,
      'packSize', s.pack_size,
      'currentPrice', s.current_price,
      'previousPrice', s.previous_price,
      'priceChange', CASE WHEN s.current_price IS NULL OR s.previous_price IS NULL THEN NULL
                          ELSE round(s.current_price - s.previous_price, 6) END,
      'percentageChange', CASE
        WHEN s.current_price IS NULL OR s.previous_price IS NULL THEN NULL
        WHEN s.previous_price = 0 AND s.current_price = 0 THEN 0
        WHEN s.previous_price = 0 THEN NULL
        ELSE round(((s.current_price - s.previous_price) / abs(s.previous_price)) * 100, 2)
      END,
      'currentSpend', s.current_spend,
      'estimatedImpact', CASE WHEN s.current_price IS NULL OR s.previous_price IS NULL OR s.current_qty IS NULL OR s.current_qty = 0 THEN NULL ELSE round((s.current_price - s.previous_price) * s.current_qty, 2) END,
      'normalizedPurchasedQuantity', s.current_qty,
      'normalizedQuantityUnit', s.unit,
      'currentWeightedUnitPrice', s.current_price,
      'comparisonWeightedUnitPrice', s.previous_price,
      'unitPriceDifference', CASE WHEN s.current_price IS NULL OR s.previous_price IS NULL THEN NULL ELSE round(s.current_price - s.previous_price, 6) END,
      'mappingConfidence', CASE s.mapping_status WHEN 'verified' THEN 'verified' WHEN 'mapped' THEN 'mapped_unverified' ELSE s.mapping_status END,
      'impactEvidenceComplete', (
        s.mapping_status = 'verified'
        AND s.current_price IS NOT NULL
        AND s.previous_price IS NOT NULL
        AND s.current_qty IS NOT NULL
        AND s.current_qty <> 0
      ),
      'impactFormula', 'unitPriceDifference * normalizedPurchasedQuantity',
      'invoiceCount', s.invoice_count,
      'vendorCount', s.vendor_count
    ),
    'priceHistory', (SELECT arr FROM price_history),
    'vendorComparison', (SELECT arr FROM vendor_comparison),
    'purchaseHistory', (SELECT arr FROM purchases),
    'normalization', (SELECT obj FROM normalization)
  )
  INTO v_result
  FROM summary s;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_price_movers_drilldown(
  uuid, uuid, text, uuid[], date, date, date, date, uuid[], text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_price_movers_drilldown(
  uuid, uuid, text, uuid[], date, date, date, date, uuid[], text
) TO service_role;

CREATE INDEX IF NOT EXISTS idx_invoice_line_items_org_product
  ON public.invoice_line_items (organization_id, internal_product_id);

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ==========================================================================
-- Source: 20260727080000_location_timezone_performance_reports.sql
-- ==========================================================================

BEGIN;

ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS timezone text;

COMMENT ON COLUMN public.locations.timezone IS
  'IANA timezone used by secured Performance report wrappers for location business-date boundaries. Invalid or missing values fall back to UTC.';

CREATE OR REPLACE FUNCTION public.resolve_performance_location_timezone(
  p_organization_id uuid,
  p_location_id uuid
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_timezone text;
BEGIN
  SELECT NULLIF(btrim(l.timezone), '')
    INTO v_timezone
  FROM public.locations l
  WHERE l.organization_id = p_organization_id
    AND l.id = p_location_id
    AND l.deleted_at IS NULL;

  IF v_timezone IS NULL THEN
    RETURN 'UTC';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = v_timezone) THEN
    RETURN v_timezone;
  END IF;

  RETURN 'UTC';
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_performance_location_timezone(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_performance_location_timezone(uuid, uuid)
  TO service_role;

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
DECLARE
  v_location_brand_id uuid;
  v_timezone text;
  v_result jsonb;
  v_table_rows jsonb;
BEGIN
  PERFORM public.assert_performance_location_access(
    p_organization_id, p_location_id, false
  );

  v_timezone := public.resolve_performance_location_timezone(p_organization_id, p_location_id);

  SELECT l.brand_id
    INTO v_location_brand_id
  FROM public.locations l
  WHERE l.id = p_location_id
    AND l.organization_id = p_organization_id
    AND l.deleted_at IS NULL;

  v_result := public.get_category_performance_report(
    p_organization_id,
    ARRAY[p_location_id],
    p_date_from,
    p_date_to,
    p_comparison_date_from,
    p_comparison_date_to,
    p_category_names,
    p_vendor_ids,
    v_timezone,
    p_selected_category,
    p_trend_categories
  );

  WITH rows AS (
    SELECT source.row_data, source.ordinality
    FROM jsonb_array_elements(COALESCE(v_result->'tableRows', '[]'::jsonb))
      WITH ORDINALITY AS source(row_data, ordinality)
  ), scoped_budgets AS (
    SELECT
      btrim(bt.category) AS category,
      sum(bt.target_amount)::numeric AS budget
    FROM public.budget_targets bt
    WHERE bt.organization_id = p_organization_id
      AND bt.location_id = p_location_id
      AND bt.brand_id IS NOT DISTINCT FROM v_location_brand_id
      AND bt.period_start = p_date_from
      AND bt.period_end = p_date_to
      AND bt.category IS NOT NULL
    GROUP BY btrim(bt.category)
  )
  SELECT COALESCE(
    jsonb_agg(
      rows.row_data
      || jsonb_build_object(
        'budget', scoped_budgets.budget,
        'budgetVariance', CASE
          WHEN scoped_budgets.budget IS NULL THEN NULL
          ELSE round(
            COALESCE(NULLIF(rows.row_data->>'currentSpend', '')::numeric, 0)
            - scoped_budgets.budget,
            2
          )
        END
      )
      ORDER BY rows.ordinality
    ),
    '[]'::jsonb
  )
  INTO v_table_rows
  FROM rows
  LEFT JOIN scoped_budgets
    ON scoped_budgets.category = btrim(rows.row_data->>'category');

  RETURN jsonb_set(
    jsonb_set(
      COALESCE(v_result, '{}'::jsonb),
      '{tableRows}',
      v_table_rows,
      true
    ),
    '{metadata}',
    COALESCE(v_result->'metadata', '{}'::jsonb)
      || jsonb_build_object(
        'timezone', v_timezone,
        'timezoneSource', 'locations.timezone',
        'timezoneFallback', CASE WHEN v_timezone = 'UTC' THEN 'UTC when missing or invalid' ELSE NULL END,
        'budgetScope', 'exact_location_brand_period_category',
        'budgetPeriodRule', 'exact_period_match'
      ),
    true
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
DECLARE
  v_timezone text;
BEGIN
  PERFORM public.assert_performance_location_access(
    p_organization_id, p_location_id, false
  );
  v_timezone := public.resolve_performance_location_timezone(p_organization_id, p_location_id);
  RETURN public.get_category_performance_drilldown(
    p_organization_id,
    p_category,
    ARRAY[p_location_id],
    p_date_from,
    p_date_to,
    p_comparison_date_from,
    p_comparison_date_to,
    p_vendor_ids,
    v_timezone
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
DECLARE
  v_timezone text;
BEGIN
  PERFORM public.assert_performance_location_access(
    p_organization_id, p_location_id, false
  );
  v_timezone := public.resolve_performance_location_timezone(p_organization_id, p_location_id);
  RETURN public.get_price_movers_report(
    p_organization_id,
    ARRAY[p_location_id],
    p_date_from,
    p_date_to,
    p_comparison_date_from,
    p_comparison_date_to,
    p_category_names,
    p_vendor_ids,
    v_timezone,
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
DECLARE
  v_timezone text;
BEGIN
  PERFORM public.assert_performance_location_access(
    p_organization_id, p_location_id, false
  );
  v_timezone := public.resolve_performance_location_timezone(p_organization_id, p_location_id);
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
    v_timezone
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
DECLARE
  v_timezone text;
  v_result jsonb;
  v_table_rows jsonb;
BEGIN
  PERFORM public.assert_performance_location_access(
    p_organization_id, p_location_id, false
  );

  v_timezone := public.resolve_performance_location_timezone(p_organization_id, p_location_id);

  v_result := public.get_inventory_usage_report(
    p_organization_id,
    ARRAY[p_location_id],
    p_date_from,
    p_date_to,
    p_category_names,
    v_timezone
  );

  SELECT COALESCE(
    jsonb_agg(
      source.row_data
      || jsonb_build_object(
        'currentOnHandQuantity', evidence.current_on_hand_quantity,
        'reorderPoint', evidence.reorder_point,
        'unitCost', evidence.unit_cost,
        'unitCostSource', evidence.unit_cost_source,
        'usageValue', CASE
          WHEN NULLIF(source.row_data->>'actualUsage', '') IS NULL
            OR evidence.unit_cost IS NULL
          THEN NULL
          ELSE round(
            (source.row_data->>'actualUsage')::numeric * evidence.unit_cost,
            2
          )
        END,
        'currentInventoryValue', evidence.current_inventory_value,
        'currentInventoryValueSource', evidence.current_inventory_value_source
      )
      ORDER BY source.ordinality
    ),
    '[]'::jsonb
  )
  INTO v_table_rows
  FROM jsonb_array_elements(COALESCE(v_result->'tableRows', '[]'::jsonb))
    WITH ORDINALITY AS source(row_data, ordinality)
  LEFT JOIN LATERAL (
    SELECT
      inv.current_quantity::numeric AS current_on_hand_quantity,
      CASE
        WHEN inv.reorder_point > 0 THEN inv.reorder_point::numeric
        WHEN inv.par_level > 0 THEN inv.par_level::numeric
        ELSE NULL
      END AS reorder_point,
      CASE
        WHEN inv.unit_cost > 0 THEN inv.unit_cost::numeric
        WHEN product.latest_price > 0 THEN product.latest_price::numeric
        ELSE NULL
      END AS unit_cost,
      CASE
        WHEN inv.unit_cost > 0 THEN 'inventory.unit_cost'
        WHEN product.latest_price > 0 THEN 'products.latest_price'
        ELSE 'unavailable'
      END AS unit_cost_source,
      CASE
        WHEN inv.current_value IS NOT NULL THEN inv.current_value::numeric
        WHEN inv.current_quantity IS NOT NULL
          AND (
            CASE
              WHEN inv.unit_cost > 0 THEN inv.unit_cost
              WHEN product.latest_price > 0 THEN product.latest_price
              ELSE NULL
            END
          ) IS NOT NULL
        THEN round(
          inv.current_quantity
          * CASE
              WHEN inv.unit_cost > 0 THEN inv.unit_cost
              WHEN product.latest_price > 0 THEN product.latest_price
            END,
          2
        )
        ELSE NULL
      END AS current_inventory_value,
      CASE
        WHEN inv.current_value IS NOT NULL THEN 'inventory.current_value'
        WHEN inv.current_quantity IS NOT NULL
          AND (inv.unit_cost > 0 OR product.latest_price > 0)
        THEN 'calculated_current_quantity_x_unit_cost'
        ELSE 'unavailable'
      END AS current_inventory_value_source
    FROM public.inventory inv
    LEFT JOIN public.products product
      ON product.id = inv.internal_product_id
     AND product.organization_id = p_organization_id
     AND product.deleted_at IS NULL
    WHERE inv.id = NULLIF(source.row_data->>'inventoryId', '')::uuid
      AND inv.organization_id = p_organization_id
      AND inv.location_id = p_location_id
      AND inv.deleted_at IS NULL
    LIMIT 1
  ) evidence ON TRUE;

  RETURN jsonb_set(
    jsonb_set(
      COALESCE(v_result, '{}'::jsonb),
      '{tableRows}',
      v_table_rows,
      true
    ),
    '{metadata}',
    COALESCE(v_result->'metadata', '{}'::jsonb)
      || jsonb_build_object(
        'timezone', v_timezone,
        'timezoneSource', 'locations.timezone',
        'timezoneFallback', CASE WHEN v_timezone = 'UTC' THEN 'UTC when missing or invalid' ELSE NULL END
      ),
    true
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
DECLARE
  v_timezone text;
BEGIN
  PERFORM public.assert_performance_location_access(
    p_organization_id, p_location_id, false
  );
  v_timezone := public.resolve_performance_location_timezone(p_organization_id, p_location_id);
  RETURN public.get_inventory_usage_drilldown(
    p_organization_id,
    p_inventory_id,
    p_product_id,
    ARRAY[p_location_id],
    p_date_from,
    p_date_to,
    v_timezone
  );
END;
$$;

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

COMMENT ON FUNCTION public.get_location_inventory_usage_report(
  uuid, uuid, date, date, text[], text
) IS
  'Secured single-location Performance Inventory Usage report enriched with current on-hand, reorder, cost provenance, current-value evidence, and server-derived location timezone.';

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ==========================================================================
-- Source: 20260727110000_performance_scalability_bounds.sql
-- ==========================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.assert_performance_report_bounds(
  p_date_from date,
  p_date_to date,
  p_max_days integer DEFAULT 548
)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_date_from IS NULL OR p_date_to IS NULL THEN
    RAISE EXCEPTION 'date_from and date_to are required';
  END IF;

  IF p_date_to < p_date_from THEN
    RAISE EXCEPTION 'date_to must be on or after date_from';
  END IF;

  IF (p_date_to - p_date_from) + 1 > p_max_days THEN
    RAISE EXCEPTION 'Performance report range exceeds % days', p_max_days;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.limit_performance_jsonb_array(
  p_rows jsonb,
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(
    jsonb_agg(row_data ORDER BY ordinality),
    '[]'::jsonb
  )
  FROM jsonb_array_elements(COALESCE(p_rows, '[]'::jsonb))
    WITH ORDINALITY AS source(row_data, ordinality)
  WHERE ordinality > GREATEST(COALESCE(p_offset, 0), 0)
    AND ordinality <= GREATEST(COALESCE(p_offset, 0), 0) + LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500);
$$;

CREATE OR REPLACE FUNCTION public.with_performance_limit_metadata(
  p_result jsonb,
  p_key text,
  p_total_count integer,
  p_limit integer,
  p_offset integer,
  p_started_at timestamptz,
  p_max_days integer DEFAULT 548
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT jsonb_set(
    COALESCE(p_result, '{}'::jsonb),
    '{metadata}',
    COALESCE(p_result->'metadata', '{}'::jsonb)
      || jsonb_build_object(
        'detailLimit', LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500),
        'detailOffset', GREATEST(COALESCE(p_offset, 0), 0),
        'detailTotalCount', GREATEST(COALESCE(p_total_count, 0), 0),
        'detailReturnedCount', jsonb_array_length(COALESCE(p_result->p_key, '[]'::jsonb)),
        'detailTruncated', GREATEST(COALESCE(p_total_count, 0), 0) > GREATEST(COALESCE(p_offset, 0), 0) + LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500),
        'maxInteractiveRangeDays', p_max_days,
        'queryDurationMs', round((EXTRACT(epoch FROM (clock_timestamp() - p_started_at)) * 1000)::numeric, 2)
      ),
    true
  );
$$;

CREATE OR REPLACE FUNCTION public.get_location_performance_overview_rollup(
  p_organization_id uuid,
  p_location_id uuid,
  p_date_from date,
  p_date_to date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_started_at timestamptz := clock_timestamp();
  v_timezone text;
  v_brand_id uuid;
  v_result jsonb;
BEGIN
  PERFORM public.assert_performance_location_access(p_organization_id, p_location_id, false);
  PERFORM public.assert_performance_report_bounds(p_date_from, p_date_to);

  v_timezone := public.resolve_performance_location_timezone(p_organization_id, p_location_id);

  SELECT l.brand_id
    INTO v_brand_id
  FROM public.locations l
  WHERE l.id = p_location_id
    AND l.organization_id = p_organization_id
    AND l.deleted_at IS NULL;

  WITH invoice_scope AS (
    SELECT
      i.id,
      i.total_amount,
      COALESCE(i.paid_amount, 0) AS paid_amount,
      COALESCE(i.credit_applied, 0) AS credit_applied,
      lower(COALESCE(i.payment_status, '')) AS payment_status
    FROM public.invoices i
    WHERE i.organization_id = p_organization_id
      AND i.location_id = p_location_id
      AND i.deleted_at IS NULL
      AND i.invoice_date >= p_date_from
      AND i.invoice_date <= p_date_to
      AND public.tenant_scope_visible(i.organization_id, i.brand_id, i.location_id, i.deleted_at)
  ),
  invoice_rollup AS (
    SELECT
      COALESCE(sum(GREATEST(0, total_amount - paid_amount - credit_applied))
        FILTER (WHERE payment_status IN ('unpaid', 'partial', 'processing')), 0)::numeric AS unpaid_balance,
      count(*) FILTER (WHERE payment_status IN ('unpaid', 'partial', 'processing'))::int AS unpaid_count
    FROM invoice_scope
  ),
  payment_rollup AS (
    SELECT
      COALESCE(sum(amount) FILTER (WHERE lower(COALESCE(status, '')) IN ('completed', 'paid')), 0)::numeric AS completed_amount,
      COALESCE(sum(amount) FILTER (WHERE lower(COALESCE(status, '')) IN ('pending', 'processing', 'scheduled')), 0)::numeric AS scheduled_amount,
      COALESCE(sum(amount) FILTER (WHERE lower(COALESCE(status, '')) IN ('failed', 'cancelled', 'refunded')), 0)::numeric AS failed_amount,
      count(*)::int AS payment_count
    FROM public.payments p
    WHERE p.organization_id = p_organization_id
      AND p.location_id = p_location_id
      AND p.deleted_at IS NULL
      AND COALESCE(p.payment_date, (p.created_at AT TIME ZONE v_timezone)::date) >= p_date_from
      AND COALESCE(p.payment_date, (p.created_at AT TIME ZONE v_timezone)::date) <= p_date_to
      AND public.tenant_scope_visible(p.organization_id, p.brand_id, p.location_id, p.deleted_at)
  ),
  product_rollup AS (
    SELECT
      count(*)::int AS total_products,
      count(*) FILTER (WHERE NULLIF(btrim(COALESCE(category, accounting_category)), '') IS NOT NULL)::int AS categorized_products
    FROM public.products p
    WHERE p.organization_id = p_organization_id
      AND p.deleted_at IS NULL
      AND (
        p.location_id = p_location_id
        OR (p.location_id IS NULL AND p.brand_id IS NOT DISTINCT FROM v_brand_id)
        OR (p.location_id IS NULL AND p.brand_id IS NULL)
      )
  ),
  inventory_rollup AS (
    SELECT
      COALESCE(sum(current_value), 0)::numeric AS current_inventory_value,
      count(*) FILTER (
        WHERE COALESCE(reorder_point, par_level, 0) > 0
          AND COALESCE(current_quantity, 0) <= COALESCE(reorder_point, par_level, 0)
      )::int AS low_stock_count,
      count(*)::int AS inventory_count
    FROM public.inventory inv
    WHERE inv.organization_id = p_organization_id
      AND inv.location_id = p_location_id
      AND inv.deleted_at IS NULL
      AND public.tenant_scope_visible(inv.organization_id, inv.brand_id, inv.location_id, inv.deleted_at)
  ),
  recipe_base AS (
    SELECT
      COALESCE(cost_per_serving, total_cost, 0)::numeric AS cost,
      COALESCE(selling_price, suggested_price, 0)::numeric AS price,
      COALESCE(target_margin_percent, 0)::numeric AS target_margin
    FROM public.recipes r
    WHERE r.organization_id = p_organization_id
      AND r.deleted_at IS NULL
      AND (
        r.location_id = p_location_id
        OR (r.location_id IS NULL AND r.brand_id IS NOT DISTINCT FROM v_brand_id)
        OR (r.location_id IS NULL AND r.brand_id IS NULL)
      )
      AND public.tenant_scope_visible(r.organization_id, r.brand_id, r.location_id, r.deleted_at)
  ),
  recipe_rollup AS (
    SELECT
      count(*)::int AS recipe_count,
      COALESCE(avg(((price - cost) / NULLIF(price, 0)) * 100) FILTER (WHERE price > 0), 0)::numeric AS average_recipe_margin,
      count(*) FILTER (
        WHERE price > 0
          AND target_margin > 0
          AND ((price - cost) / NULLIF(price, 0)) * 100 < target_margin
      )::int AS recipe_margin_risk_count
    FROM recipe_base
  )
  SELECT jsonb_build_object(
    'payments', jsonb_build_object(
      'completedAmount', pr.completed_amount,
      'scheduledAmount', pr.scheduled_amount,
      'failedAmount', pr.failed_amount,
      'paymentCount', pr.payment_count,
      'invoiceUnpaidBalance', ir.unpaid_balance,
      'invoiceUnpaidCount', ir.unpaid_count
    ),
    'products', jsonb_build_object(
      'totalProducts', prod.total_products,
      'categorizedProducts', prod.categorized_products
    ),
    'inventory', jsonb_build_object(
      'currentInventoryValue', inv.current_inventory_value,
      'lowStockCount', inv.low_stock_count,
      'inventoryCount', inv.inventory_count
    ),
    'recipes', jsonb_build_object(
      'recipeCount', rec.recipe_count,
      'averageRecipeMargin', round(rec.average_recipe_margin, 2),
      'recipeMarginRiskCount', rec.recipe_margin_risk_count
    ),
    'metadata', jsonb_build_object(
      'timezone', v_timezone,
      'aggregation', 'server_rollup',
      'maxInteractiveRangeDays', 548,
      'queryDurationMs', round((EXTRACT(epoch FROM (clock_timestamp() - v_started_at)) * 1000)::numeric, 2)
    )
  )
  INTO v_result
  FROM invoice_rollup ir, payment_rollup pr, product_rollup prod, inventory_rollup inv, recipe_rollup rec;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_location_performance_overview_rollup(uuid, uuid, date, date)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_location_performance_overview_rollup(uuid, uuid, date, date)
  TO authenticated, service_role;

CREATE INDEX IF NOT EXISTS idx_perf_invoices_org_loc_date_active
  ON public.invoices(organization_id, location_id, invoice_date)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_perf_payments_org_loc_payment_date_active
  ON public.payments(organization_id, location_id, payment_date)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_perf_allocations_org_loc_invoice_category
  ON public.invoice_allocations(organization_id, location_id, invoice_id, category_name)
  WHERE allocation_type = 'line_items';

CREATE INDEX IF NOT EXISTS idx_perf_line_items_org_product_invoice
  ON public.invoice_line_items(organization_id, internal_product_id, invoice_id);

CREATE INDEX IF NOT EXISTS idx_perf_inventory_org_loc_active
  ON public.inventory(organization_id, location_id, internal_product_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_perf_inventory_movements_org_loc_date
  ON public.inventory_movements(organization_id, location_id, created_at, inventory_id);

CREATE INDEX IF NOT EXISTS idx_perf_count_sessions_org_loc_completed
  ON public.count_sessions(organization_id, location_id, completed_at)
  WHERE deleted_at IS NULL AND lower(status) = 'completed';

CREATE INDEX IF NOT EXISTS idx_perf_wastage_org_loc_date_active
  ON public.wastage_logs(organization_id, location_id, created_at)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_perf_products_hierarchy_active
  ON public.products(organization_id, brand_id, location_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_perf_recipes_hierarchy_active
  ON public.recipes(organization_id, brand_id, location_id)
  WHERE deleted_at IS NULL;

COMMENT ON FUNCTION public.get_location_performance_overview_rollup(uuid, uuid, date, date) IS
  'Server-side bounded rollup for the Performance overview, replacing browser aggregation over large entity lists.';
COMMENT ON FUNCTION public.assert_performance_report_bounds(date, date, integer) IS
  'Rejects missing, reversed, or overly broad interactive Performance reporting ranges.';
COMMENT ON FUNCTION public.limit_performance_jsonb_array(jsonb, integer, integer) IS
  'Applies a bounded slice to report detail arrays before returning them to the browser.';

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ==========================================================================
-- Source: 20260727120000_finish_price_movers_security_invoker.sql
-- ==========================================================================

-- Re-supersedes the original 20260726000005_harden_performance_report_scope.sql intent for
-- get_price_movers_report / get_price_movers_drilldown, timestamped after every other
-- 2026-07-27 migration that touches these two functions (000001, 050000-original-attempt,
-- 070000) so this is guaranteed to run last on any future full replay/squash -- otherwise
-- 20260727070000_expose_price_mover_impact_evidence.sql's CREATE OR REPLACE (which had to
-- re-specify every attribute, including SECURITY DEFINER) would silently win the race and
-- undo this fix again.
--
-- Context: harden_performance_report_scope_acceptance.sql caught these two back on SECURITY
-- DEFINER, re-introduced by 20260727070000 when it shipped new impact-evidence logic. This is
-- not the same class of bug the original migration closed, though. Since
-- 20260727000001_strict_location_performance_security.sql, ordinary authenticated/anon callers
-- cannot reach either function at all -- EXECUTE is revoked down to service_role only, and the
-- only real entry point is get_location_price_movers_report/drilldown, which run
-- assert_performance_location_access() (exact org+location hierarchy match) before delegating
-- here. That check is what actually gates access now, not this function's own security mode.
--
-- This is purely a consistency / defense-in-depth fix: the other 4 of the original 6 report
-- RPCs (category performance, inventory usage) are still SECURITY INVOKER and were never
-- touched by the newer migrations, so leaving these two on DEFINER is an unexplained
-- inconsistency between structurally-identical, equally-gated functions. If EXECUTE is ever
-- accidentally re-granted to authenticated directly on the base function (already happened
-- once this same day, see 20260727020000_restore_performance_report_rpc_execute_grants.sql,
-- corrected by 20260727030000_resecure_performance_base_report_rpcs.sql), INVOKER means RLS
-- still backstops the existing internal tenant_scope_visible() filter; DEFINER means it
-- wouldn't. No query logic changes.

BEGIN;

ALTER FUNCTION public.get_price_movers_report(
  uuid, uuid[], date, date, date, date, text[], uuid[], text, uuid
) SECURITY INVOKER;

ALTER FUNCTION public.get_price_movers_drilldown(
  uuid, uuid, text, uuid[], date, date, date, date, uuid[], text
) SECURITY INVOKER;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ==========================================================================
-- Source: 20260727130000_custom_plan_only.sql
-- ==========================================================================

-- Switch commercial model from public fixed tiers to client-specific custom plans.
-- Pricing is discussed with each client; public Starter/Starter + AI/Advanced rows are retired.

BEGIN;

INSERT INTO public.plans (id, name, description, price_monthly, features, is_active)
VALUES (
  'custom',
  'Custom plan',
  'Custom commercial package discussed with each client before onboarding.',
  0.00,
  '["invoices", "products", "vendors", "payments", "inventory", "recipes", "analytics", "ai", "advanced_modules"]'::jsonb,
  true
)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    price_monthly = EXCLUDED.price_monthly,
    features = EXCLUDED.features,
    is_active = EXCLUDED.is_active;

UPDATE public.organizations
SET plan_id = 'custom'
WHERE plan_id IS NULL
   OR plan_id IN ('free', 'starter', 'starter-ai', 'advanced')
   OR NOT EXISTS (SELECT 1 FROM public.plans p WHERE p.id = organizations.plan_id);

UPDATE public.locations
SET plan_id = 'custom'
WHERE plan_id IS NULL
   OR plan_id IN ('free', 'starter', 'starter-ai', 'advanced')
   OR NOT EXISTS (SELECT 1 FROM public.plans p WHERE p.id = locations.plan_id);

UPDATE public.profiles
SET pending_onboarding_plan_id = 'custom',
    updated_at = now()
WHERE pending_onboarding_plan_id IN ('free', 'starter', 'starter-ai', 'advanced')
   OR (
     pending_onboarding_plan_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.plans p WHERE p.id = profiles.pending_onboarding_plan_id)
   );

UPDATE public.onboarding_coupon_redemptions
SET plan_id = 'custom'
WHERE plan_id IN ('free', 'starter', 'starter-ai', 'advanced')
   OR NOT EXISTS (SELECT 1 FROM public.plans p WHERE p.id = onboarding_coupon_redemptions.plan_id);

DELETE FROM public.plans
WHERE id IN ('free', 'starter', 'starter-ai', 'advanced');

ALTER TABLE public.organizations
  ALTER COLUMN plan_id SET DEFAULT 'custom';

ALTER TABLE public.locations
  ALTER COLUMN plan_id SET DEFAULT 'custom';

COMMENT ON TABLE public.plans IS 'Client-specific commercial plan catalog. Public fixed pricing tiers are retired; each client uses a custom discussed package.';
COMMENT ON COLUMN public.plans.price_monthly IS 'Internal monthly amount. Public landing pages do not expose fixed plan pricing.';

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ==========================================================================
-- Source: 20260727130000_enforce_invoice_approval_limits_by_default.sql
-- ==========================================================================

-- Makes the invoice-approval dollar-limit check in enforce_invoice_approval_authorization()
-- unconditional. It was gated behind a per-org `enforceApprovalLimits` setting
-- (operational_settings, category 'payments') that defaults off, and confirmed live: zero of
-- the 12 production organizations have ever turned it on. Combined with approval_policies being
-- empty (a separate, deliberately untouched issue -- that table and
-- evaluate_invoice_approval_policy/execute_approval_step are left as dead/unused, per decision),
-- every invoice on every org has been auto-approved regardless of amount -- the hierarchy-based
-- per-user invoice_approval_limit check, correctly cascaded via update_user_approval_limit
-- (org_manager -> branch_manager -> location_manager, each capped at their own superior's
-- limit), has never actually run. requireSeparateApprover is untouched: still opt-in, still
-- defaults off, unrelated setting.
--
-- Companion data fix, required for this not to be an outage: every real profile on production
-- currently has invoice_approval_limit = 0 and has_unlimited_approval = false, in every role,
-- including platform_admin/tenant_super_admin -- confirmed via direct query. Making the check
-- unconditional against that data as-is would mean nobody, including platform admins, could
-- approve anything. Grants has_unlimited_approval = true to platform_admin/tenant_super_admin
-- only -- the same two roles assert_can_approve_invoice_scope() already treats as an
-- unconditional bypass, so this extends an existing exception rather than creating a new one.
-- org_manager/branch_manager/location_manager/ground_staff are deliberately left at their
-- current $0 limit -- real numbers for those tiers are a business decision. There is already a
-- working admin UI for it (UserManagement.jsx:272, calls update_user_approval_limit) -- it has
-- simply never been used, since enforcement has never been live until this migration. Until an
-- org sets real limits there, only platform_admin/tenant_super_admin can approve any invoice at
-- that org.
--
-- Also added: an explicit auth.role() = 'service_role' bypass on the new unconditional check,
-- mirroring the one assert_can_approve_invoice_scope() already has just above it in the same
-- function. Without it, a legitimate backend/service-role-driven approval (auth.uid() is NULL
-- in that context) would hit `v_user_limit IS NULL` and be rejected -- not a real limit
-- violation, just no session to read a limit from.

BEGIN;

CREATE OR REPLACE FUNCTION public.enforce_invoice_approval_authorization()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_vendor_autopay boolean;
  v_settings jsonb;
  v_require_separate_approver boolean;
  v_user_limit numeric;
  v_has_unlimited boolean;
  v_amount numeric;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'approved' OR NEW.ap_status = 'approved' THEN
      v_settings := public.get_payment_approval_settings(NEW.organization_id, NEW.brand_id, NEW.location_id);
      v_require_separate_approver := COALESCE((v_settings->>'requireSeparateApprover')::boolean, false);

      IF v_require_separate_approver
        AND NEW.created_by IS NOT NULL
        AND NEW.created_by = auth.uid() THEN
        RAISE EXCEPTION 'Invoice submitters cannot approve their own invoices';
      END IF;

      PERFORM public.assert_can_approve_invoice_scope(
        NEW.organization_id,
        NEW.brand_id,
        NEW.location_id
      );

      IF auth.role() IS DISTINCT FROM 'service_role' THEN
        SELECT invoice_approval_limit, COALESCE(has_unlimited_approval, false)
          INTO v_user_limit, v_has_unlimited
        FROM public.profiles
        WHERE id = auth.uid()
          AND deleted_at IS NULL;

        v_amount := COALESCE(NEW.total_amount, 0);
        IF NOT COALESCE(v_has_unlimited, false)
          AND (v_user_limit IS NULL OR v_amount > v_user_limit) THEN
          RAISE EXCEPTION 'Approval limit exceeded. Your limit is $%, but the invoice is $%.',
            COALESCE(v_user_limit, 0), v_amount;
        END IF;
      END IF;

      SELECT autopay_enabled INTO v_vendor_autopay FROM public.vendors WHERE id = NEW.vendor_id;
      IF v_vendor_autopay AND NOT public.is_owner_or_admin() THEN
        RAISE EXCEPTION 'AutoPay invoice approval requires an org manager, tenant super admin, or platform admin';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF (NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved')
    OR (NEW.ap_status = 'approved' AND OLD.ap_status IS DISTINCT FROM 'approved') THEN
    v_settings := public.get_payment_approval_settings(NEW.organization_id, NEW.brand_id, NEW.location_id);
    v_require_separate_approver := COALESCE((v_settings->>'requireSeparateApprover')::boolean, false);

    IF v_require_separate_approver
      AND COALESCE(OLD.created_by, NEW.created_by) IS NOT NULL
      AND COALESCE(OLD.created_by, NEW.created_by) = auth.uid() THEN
      RAISE EXCEPTION 'Invoice submitters cannot approve their own invoices';
    END IF;

    PERFORM public.assert_can_approve_invoice_scope(
      NEW.organization_id,
      NEW.brand_id,
      NEW.location_id
    );

    IF auth.role() IS DISTINCT FROM 'service_role' THEN
      SELECT invoice_approval_limit, COALESCE(has_unlimited_approval, false)
        INTO v_user_limit, v_has_unlimited
      FROM public.profiles
      WHERE id = auth.uid()
        AND deleted_at IS NULL;

      v_amount := COALESCE(NEW.total_amount, OLD.total_amount, 0);
      IF NOT COALESCE(v_has_unlimited, false)
        AND (v_user_limit IS NULL OR v_amount > v_user_limit) THEN
        RAISE EXCEPTION 'Approval limit exceeded. Your limit is $%, but the invoice is $%.',
          COALESCE(v_user_limit, 0), v_amount;
      END IF;
    END IF;

    SELECT autopay_enabled INTO v_vendor_autopay FROM public.vendors WHERE id = NEW.vendor_id;
    IF v_vendor_autopay AND NOT public.is_owner_or_admin() THEN
      RAISE EXCEPTION 'AutoPay invoice approval requires an org manager, tenant super admin, or platform admin';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

UPDATE public.profiles
SET has_unlimited_approval = true,
    updated_at = now()
WHERE role IN ('platform_admin', 'tenant_super_admin')
  AND deleted_at IS NULL
  AND COALESCE(has_unlimited_approval, false) = false;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ==========================================================================
-- Source: 20260727150000_fix_performance_drilldown_rpc_coherence.sql
-- ==========================================================================

-- Fix linked-db lint failures and tighten the location-scoped inventory drilldown contract.
--
-- 1. get_inventory_usage_drilldown compared inventory.internal_product_id (uuid) to
--    inventory.product_id from the inv CTE, which is text in the live schema. It also accepted
--    a caller-supplied inventory_id without rechecking p_location_ids, so the secured
--    get_location_inventory_usage_drilldown wrapper could delegate to a sibling location row.
-- 2. get_price_movers_drilldown nested aggregate calls inside jsonb_agg(), which PostgreSQL
--    rejects. Aggregate by date/vendor first, then JSON-aggregate the prepared rows.
--
-- This migration preserves the current RPC exposure model: authenticated users call the
-- location-scoped wrappers; base drilldowns remain callable only by service_role/internal code.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_inventory_usage_drilldown(
  p_organization_id uuid DEFAULT NULL,
  p_inventory_id uuid DEFAULT NULL,
  p_product_id uuid DEFAULT NULL,
  p_location_ids uuid[] DEFAULT NULL,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_timezone text DEFAULT 'UTC'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid := COALESCE(p_organization_id, public.get_auth_org());
  v_tz text := COALESCE(NULLIF(trim(p_timezone), ''), 'UTC');
  v_inv_id uuid := p_inventory_id;
  v_result jsonb;
BEGIN
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organization context is required';
  END IF;
  IF p_date_from IS NULL OR p_date_to IS NULL THEN
    RAISE EXCEPTION 'date_from and date_to are required';
  END IF;
  IF v_inv_id IS NULL AND p_product_id IS NULL THEN
    RAISE EXCEPTION 'inventory_id or product_id is required';
  END IF;

  IF v_inv_id IS NULL THEN
    SELECT id INTO v_inv_id
    FROM public.inventory
    WHERE organization_id = v_org_id
      AND deleted_at IS NULL
      AND internal_product_id = p_product_id
      AND (
        p_location_ids IS NULL OR cardinality(p_location_ids) = 0
        OR location_id = ANY (p_location_ids)
      )
    ORDER BY updated_at DESC NULLS LAST
    LIMIT 1;
  END IF;

  WITH inv AS (
    SELECT
      i.*,
      COALESCE(p.name, i.product_name) AS product,
      COALESCE(NULLIF(trim(COALESCE(p.category, i.category)), ''), 'Uncategorized') AS category,
      COALESCE(loc.name, i.location, 'Unknown') AS location_name,
      public.normalize_product_report_unit(
        COALESCE(NULLIF(trim(i.current_unit), ''), NULLIF(trim(p.report_by_unit), ''), 'Each')
      ) AS unit,
      COALESCE(i.unit_cost, p.latest_price, 0)::numeric AS unit_cost
    FROM public.inventory i
    LEFT JOIN public.products p ON p.id = i.internal_product_id
    LEFT JOIN public.locations loc ON loc.id = i.location_id
    WHERE i.id = v_inv_id
      AND i.organization_id = v_org_id
      AND i.deleted_at IS NULL
      AND (
        p_location_ids IS NULL OR cardinality(p_location_ids) = 0
        OR i.location_id = ANY (p_location_ids)
      )
  ),
  counts AS (
    SELECT
      cs.id AS session_id,
      (cs.completed_at AT TIME ZONE v_tz)::date AS count_date,
      cs.completed_at,
      COALESCE(
        NULLIF(cs.counted_data->(v_inv_id::text)->>'counted_quantity', '')::numeric,
        NULLIF(cs.counted_data->(v_inv_id::text)->>'count', '')::numeric
      ) AS counted_qty,
      cs.status
    FROM public.count_sessions cs
    JOIN public.count_sheets sh ON sh.id = cs.count_sheet_id
    WHERE cs.organization_id = v_org_id
      AND lower(cs.status) = 'completed'
      AND cs.counted_data ? (v_inv_id::text)
      AND (cs.completed_at AT TIME ZONE v_tz)::date >= p_date_from - 90
      AND (cs.completed_at AT TIME ZONE v_tz)::date <= p_date_to
    ORDER BY cs.completed_at DESC
    LIMIT 50
  ),
  movements AS (
    SELECT
      im.id,
      im.movement_type,
      im.quantity,
      im.source_type,
      im.source_id,
      im.created_at,
      (im.created_at AT TIME ZONE v_tz)::date AS movement_date,
      CASE
        WHEN im.movement_type IN ('purchase_order', 'invoice_received') THEN 'receipt'
        WHEN im.movement_type IN ('transfer_in') OR (im.movement_type = 'transfer' AND im.quantity >= 0) THEN 'transfer_in'
        WHEN im.movement_type IN ('transfer_out') OR (im.movement_type = 'transfer' AND im.quantity < 0) THEN 'transfer_out'
        WHEN im.movement_type IN ('wastage', 'spoilage') THEN 'waste'
        WHEN im.movement_type = 'manual_adjustment' THEN 'adjustment'
        WHEN im.movement_type IN ('count_variance', 'stock_count') THEN 'count_variance'
        WHEN im.movement_type IN ('recipe_consumption', 'sales_depletion', 'pos_adjustment') THEN 'pos_excluded'
        ELSE 'other'
      END AS class
    FROM public.inventory_movements im
    WHERE im.organization_id = v_org_id
      AND im.inventory_id = v_inv_id
      AND (im.created_at AT TIME ZONE v_tz)::date >= p_date_from
      AND (im.created_at AT TIME ZONE v_tz)::date <= p_date_to
  ),
  waste AS (
    SELECT
      w.id,
      w.quantity,
      w.unit,
      w.value,
      w.reason,
      w.created_at,
      (w.created_at AT TIME ZONE v_tz)::date AS waste_date
    FROM public.wastage_logs w
    JOIN inv ON true
    WHERE w.organization_id = v_org_id
      AND (
        (w.product_id IS NOT NULL AND w.product_id = inv.product_id)
        OR lower(w.product_name) = lower(inv.product_name)
      )
      AND (w.created_at AT TIME ZONE v_tz)::date >= p_date_from
      AND (w.created_at AT TIME ZONE v_tz)::date <= p_date_to
    ORDER BY w.created_at DESC
    LIMIT 50
  ),
  usage_trend AS (
    SELECT
      movement_date AS bucket,
      round(sum(CASE WHEN class = 'receipt' THEN quantity ELSE 0 END)::numeric, 4) AS received,
      round(sum(CASE WHEN class = 'transfer_in' THEN quantity ELSE 0 END)::numeric, 4) AS transfers_in,
      round(sum(CASE WHEN class = 'transfer_out' THEN abs(quantity) ELSE 0 END)::numeric, 4) AS transfers_out,
      round(sum(CASE WHEN class = 'waste' THEN abs(quantity) ELSE 0 END)::numeric, 4) AS waste_qty,
      round(sum(CASE WHEN class = 'adjustment' THEN quantity ELSE 0 END)::numeric, 4) AS adjustments
    FROM movements
    WHERE class <> 'pos_excluded'
    GROUP BY movement_date
    ORDER BY movement_date
  ),
  location_comp AS (
    SELECT
      COALESCE(loc.name, i.location, 'Unknown') AS location,
      i.location_id,
      i.current_quantity,
      COALESCE(i.unit_cost, 0) AS unit_cost,
      round(i.current_quantity * COALESCE(i.unit_cost, 0), 2) AS value
    FROM public.inventory i
    LEFT JOIN public.locations loc ON loc.id = i.location_id
    WHERE i.organization_id = v_org_id
      AND i.deleted_at IS NULL
      AND (
        p_location_ids IS NULL OR cardinality(p_location_ids) = 0
        OR i.location_id = ANY (p_location_ids)
      )
      AND (
        ((SELECT internal_product_id FROM inv) IS NOT NULL AND i.internal_product_id = (SELECT internal_product_id FROM inv))
        OR lower(i.product_name) = lower((SELECT product FROM inv))
      )
  )
  SELECT jsonb_build_object(
    'inventoryId', v_inv_id,
    'summary', jsonb_build_object(
      'product', (SELECT product FROM inv),
      'category', (SELECT category FROM inv),
      'location', (SELECT location_name FROM inv),
      'unit', (SELECT unit FROM inv),
      'unitCost', (SELECT unit_cost FROM inv),
      'currentQuantity', (SELECT current_quantity FROM inv),
      'lastCountedDate', (SELECT last_counted_date FROM inv)
    ),
    'countHistory', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'sessionId', session_id,
        'date', count_date,
        'countedQuantity', counted_qty,
        'status', status
      ) ORDER BY completed_at DESC)
      FROM counts
    ), '[]'::jsonb),
    'receiptHistory', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'movementId', id,
        'date', movement_date,
        'quantity', quantity,
        'sourceType', source_type,
        'sourceId', source_id,
        'movementType', movement_type
      ) ORDER BY created_at DESC)
      FROM movements WHERE class = 'receipt'
    ), '[]'::jsonb),
    'wasteHistory', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', id,
        'date', waste_date,
        'quantity', quantity,
        'unit', unit,
        'value', value,
        'reason', reason
      ) ORDER BY created_at DESC)
      FROM waste
    ), '[]'::jsonb),
    'transferHistory', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'movementId', id,
        'date', movement_date,
        'quantity', quantity,
        'class', class,
        'sourceId', source_id,
        'movementType', movement_type
      ) ORDER BY created_at DESC)
      FROM movements WHERE class IN ('transfer_in', 'transfer_out')
    ), '[]'::jsonb),
    'adjustmentHistory', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'movementId', id,
        'date', movement_date,
        'quantity', quantity,
        'sourceType', source_type,
        'movementType', movement_type
      ) ORDER BY created_at DESC)
      FROM movements WHERE class IN ('adjustment', 'count_variance')
    ), '[]'::jsonb),
    'usageTrend', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'bucket', bucket,
        'received', received,
        'transfersIn', transfers_in,
        'transfersOut', transfers_out,
        'wasteQty', waste_qty,
        'adjustments', adjustments
      ) ORDER BY bucket)
      FROM usage_trend
    ), '[]'::jsonb),
    'locationComparison', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'location', location,
        'locationId', location_id,
        'currentQuantity', current_quantity,
        'unitCost', unit_cost,
        'value', value
      ))
      FROM location_comp
    ), '[]'::jsonb),
    'normalization', jsonb_build_object(
      'reportUnit', (SELECT unit FROM inv),
      'formula', 'Actual Usage = Opening + Receipts + Transfers In - Transfers Out + Adjustments(signed) - Closing',
      'wasteRule', 'Waste is reported separately and is not added into Actual Usage',
      'posExcluded', true
    )
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_price_movers_drilldown(
  p_organization_id uuid DEFAULT NULL,
  p_product_id uuid DEFAULT NULL,
  p_product_name text DEFAULT NULL,
  p_location_ids uuid[] DEFAULT NULL,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_comparison_date_from date DEFAULT NULL,
  p_comparison_date_to date DEFAULT NULL,
  p_vendor_ids uuid[] DEFAULT NULL,
  p_timezone text DEFAULT 'UTC'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid := COALESCE(p_organization_id, public.get_auth_org());
  v_result jsonb;
BEGIN
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organization context is required';
  END IF;
  IF p_date_from IS NULL OR p_date_to IS NULL THEN
    RAISE EXCEPTION 'date_from and date_to are required';
  END IF;
  IF p_product_id IS NULL AND NULLIF(trim(COALESCE(p_product_name, '')), '') IS NULL THEN
    RAISE EXCEPTION 'product_id or product_name is required';
  END IF;

  WITH eligible_invoices AS (
    SELECT i.*
    FROM public.invoices i
    WHERE i.organization_id = v_org_id
      AND public.is_purchasing_spend_invoice(i.status, i.ap_status, i.deleted_at)
      AND public.tenant_scope_visible(i.organization_id, i.brand_id, i.location_id, i.deleted_at)
      AND (
        p_location_ids IS NULL OR cardinality(p_location_ids) = 0
        OR i.location_id = ANY (p_location_ids)
      )
      AND (
        p_vendor_ids IS NULL OR cardinality(p_vendor_ids) = 0
        OR i.vendor_id = ANY (p_vendor_ids)
      )
  ),
  lines AS (
    SELECT
      ili.id AS line_id,
      ili.invoice_id,
      i.invoice_number,
      i.invoice_date,
      i.vendor_id,
      COALESCE(NULLIF(trim(i.vendor_name), ''), 'Unknown vendor') AS vendor_name,
      l.name AS location_name,
      ili.internal_product_id,
      COALESCE(p.name, ili.item_name) AS product_name,
      COALESCE(NULLIF(trim(p.category), ''), 'Uncategorized') AS category_name,
      public.normalize_product_report_unit(
        COALESCE(NULLIF(trim(p.report_by_unit), ''), NULLIF(trim(ili.vendor_unit), ''), 'Each')
      ) AS report_unit,
      COALESCE(ili.quantity, 0)::numeric AS quantity,
      COALESCE(ili.unit_price, 0)::numeric AS unit_price,
      COALESCE(ili.total_price, 0)::numeric AS total_price,
      COALESCE(vim.conversion_multiplier, 1)::numeric AS conversion_multiplier,
      CASE
        WHEN ili.internal_product_id IS NULL THEN 'unmapped'
        WHEN vim.is_verified IS TRUE THEN 'verified'
        WHEN vim.internal_product_id IS NOT NULL THEN 'mapped'
        ELSE 'mapped'
      END AS mapping_status,
      NULLIF(trim(ili.vendor_unit), '') AS vendor_unit,
      NULLIF(trim(vi.pack_size), '') AS pack_size,
      i.status
    FROM eligible_invoices i
    JOIN public.invoice_line_items ili ON ili.invoice_id = i.id
    LEFT JOIN public.products p ON p.id = ili.internal_product_id
    LEFT JOIN public.locations l ON l.id = i.location_id
    LEFT JOIN LATERAL (
      SELECT m.conversion_multiplier, m.is_verified, m.internal_product_id
      FROM public.vendor_item_mappings m
      WHERE m.internal_product_id = ili.internal_product_id
      ORDER BY m.is_verified DESC NULLS LAST
      LIMIT 1
    ) vim ON TRUE
    LEFT JOIN public.vendor_items vi ON vi.id = ili.vendor_item_id
    WHERE (
      (p_product_id IS NOT NULL AND ili.internal_product_id = p_product_id)
      OR (
        p_product_id IS NULL
        AND lower(COALESCE(p.name, ili.item_name, '')) = lower(trim(p_product_name))
      )
    )
  ),
  priced AS (
    SELECT
      *,
      quantity * conversion_multiplier AS normalized_qty,
      CASE WHEN quantity * conversion_multiplier = 0 THEN NULL
           ELSE round(total_price / (quantity * conversion_multiplier), 6)
      END AS normalized_unit_cost
    FROM lines
  ),
  current_rows AS (
    SELECT * FROM priced
    WHERE invoice_date >= p_date_from AND invoice_date <= p_date_to
  ),
  previous_rows AS (
    SELECT * FROM priced
    WHERE p_comparison_date_from IS NOT NULL
      AND p_comparison_date_to IS NOT NULL
      AND invoice_date >= p_comparison_date_from
      AND invoice_date <= p_comparison_date_to
  ),
  summary AS (
    SELECT
      (SELECT product_name FROM current_rows LIMIT 1) AS product,
      (SELECT category_name FROM current_rows LIMIT 1) AS category,
      (SELECT report_unit FROM current_rows LIMIT 1) AS unit,
      (SELECT pack_size FROM current_rows WHERE pack_size IS NOT NULL LIMIT 1) AS pack_size,
      (array_agg(mapping_status ORDER BY CASE mapping_status WHEN 'verified' THEN 0 WHEN 'mapped' THEN 1 ELSE 2 END))[1] AS mapping_status,
      round(sum(normalized_qty)::numeric, 4) AS current_qty,
      CASE WHEN sum(normalized_qty) = 0 THEN NULL
           ELSE round(sum(total_price) / sum(normalized_qty), 6) END AS current_price,
      (SELECT CASE WHEN sum(pr.normalized_qty) = 0 THEN NULL
                   ELSE round(sum(pr.total_price) / sum(pr.normalized_qty), 6) END
       FROM previous_rows pr) AS previous_price,
      round(sum(total_price)::numeric, 2) AS current_spend,
      count(DISTINCT invoice_id)::bigint AS invoice_count,
      count(DISTINCT vendor_id)::bigint AS vendor_count
    FROM current_rows
  ),
  price_history_rows AS (
    SELECT
      invoice_date,
      round(avg(normalized_unit_cost)::numeric, 6) AS unit_cost,
      round(sum(total_price)::numeric, 2) AS spend,
      round(sum(normalized_qty)::numeric, 4) AS quantity
    FROM current_rows
    WHERE normalized_unit_cost IS NOT NULL
    GROUP BY invoice_date
  ),
  price_history AS (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'date', invoice_date,
        'unitCost', unit_cost,
        'spend', spend,
        'quantity', quantity
      )
      ORDER BY invoice_date
    ), '[]'::jsonb) AS arr
    FROM price_history_rows
  ),
  vendor_comparison_rows AS (
    SELECT
      vendor_id,
      vendor_name,
      CASE WHEN sum(normalized_qty) = 0 THEN NULL
           ELSE round(sum(total_price) / sum(normalized_qty), 6) END AS current_price,
      round(sum(total_price)::numeric, 2) AS spend,
      count(DISTINCT invoice_id) AS invoice_count,
      (array_agg(report_unit))[1] AS unit
    FROM current_rows
    GROUP BY vendor_id, vendor_name
  ),
  vendor_comparison AS (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'vendor', vendor_name,
        'vendorId', vendor_id,
        'currentPrice', current_price,
        'spend', spend,
        'invoiceCount', invoice_count,
        'unit', unit
      )
      ORDER BY spend DESC
    ), '[]'::jsonb) AS arr
    FROM vendor_comparison_rows
  ),
  purchases AS (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'invoiceId', invoice_id,
        'invoiceNumber', invoice_number,
        'date', invoice_date,
        'vendor', vendor_name,
        'quantity', quantity,
        'unitPrice', unit_price,
        'normalizedUnitCost', normalized_unit_cost,
        'amount', total_price,
        'unit', report_unit,
        'status', status,
        'location', location_name
      )
      ORDER BY invoice_date DESC
    ), '[]'::jsonb) AS arr
    FROM current_rows
  ),
  normalization AS (
    SELECT jsonb_build_object(
      'reportUnit', (SELECT unit FROM summary),
      'packSize', (SELECT pack_size FROM summary),
      'conversionMultiplier', (SELECT conversion_multiplier FROM current_rows LIMIT 1),
      'formula', 'normalized_unit_cost = total_price / (quantity * COALESCE(conversion_multiplier, 1))',
      'comparabilityRule', 'Same internal_product_id and normalized UOM required across periods'
    ) AS obj
  )
  SELECT jsonb_build_object(
    'productId', p_product_id,
    'summary', jsonb_build_object(
      'product', s.product,
      'category', s.category,
      'unit', s.unit,
      'packSize', s.pack_size,
      'currentPrice', s.current_price,
      'previousPrice', s.previous_price,
      'priceChange', CASE WHEN s.current_price IS NULL OR s.previous_price IS NULL THEN NULL
                          ELSE round(s.current_price - s.previous_price, 6) END,
      'percentageChange', CASE
        WHEN s.current_price IS NULL OR s.previous_price IS NULL THEN NULL
        WHEN s.previous_price = 0 AND s.current_price = 0 THEN 0
        WHEN s.previous_price = 0 THEN NULL
        ELSE round(((s.current_price - s.previous_price) / abs(s.previous_price)) * 100, 2)
      END,
      'currentSpend', s.current_spend,
      'estimatedImpact', CASE WHEN s.current_price IS NULL OR s.previous_price IS NULL OR s.current_qty IS NULL OR s.current_qty = 0 THEN NULL ELSE round((s.current_price - s.previous_price) * s.current_qty, 2) END,
      'normalizedPurchasedQuantity', s.current_qty,
      'normalizedQuantityUnit', s.unit,
      'currentWeightedUnitPrice', s.current_price,
      'comparisonWeightedUnitPrice', s.previous_price,
      'unitPriceDifference', CASE WHEN s.current_price IS NULL OR s.previous_price IS NULL THEN NULL ELSE round(s.current_price - s.previous_price, 6) END,
      'mappingConfidence', CASE s.mapping_status WHEN 'verified' THEN 'verified' WHEN 'mapped' THEN 'mapped_unverified' ELSE s.mapping_status END,
      'impactEvidenceComplete', (
        s.mapping_status = 'verified'
        AND s.current_price IS NOT NULL
        AND s.previous_price IS NOT NULL
        AND s.current_qty IS NOT NULL
        AND s.current_qty <> 0
      ),
      'impactFormula', 'unitPriceDifference * normalizedPurchasedQuantity',
      'invoiceCount', s.invoice_count,
      'vendorCount', s.vendor_count
    ),
    'priceHistory', (SELECT arr FROM price_history),
    'vendorComparison', (SELECT arr FROM vendor_comparison),
    'purchaseHistory', (SELECT arr FROM purchases),
    'normalization', (SELECT obj FROM normalization)
  )
  INTO v_result
  FROM summary s;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_inventory_usage_drilldown(
  uuid, uuid, uuid, uuid[], date, date, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_inventory_usage_drilldown(
  uuid, uuid, uuid, uuid[], date, date, text
) TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_price_movers_drilldown(
  uuid, uuid, text, uuid[], date, date, date, date, uuid[], text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_price_movers_drilldown(
  uuid, uuid, text, uuid[], date, date, date, date, uuid[], text
) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ==========================================================================
-- Source: 20260727160000_fix_count_sessions_status_check_saved_closed.sql
-- ==========================================================================

-- 20260717000001_inventory_count_session_persistence.sql was meant to widen
-- count_sessions_status_check to allow 'saved'/'closed' (the values
-- save_inventory_count_session/close_inventory_count_session actually write),
-- but it never took effect on production -- the live constraint was still the
-- original 4-value one from 051_inventory_count_sheets.sql, so every "Save
-- inventory count" failed with "violates check constraint
-- count_sessions_status_check". Re-applying idempotently here so a fresh
-- replay (or any environment that also missed the earlier migration) gets it.

ALTER TABLE public.count_sessions DROP CONSTRAINT IF EXISTS count_sessions_status_check;

ALTER TABLE public.count_sessions
  ADD CONSTRAINT count_sessions_status_check
  CHECK (status IN ('in_progress', 'review', 'completed', 'cancelled', 'saved', 'closed'));
