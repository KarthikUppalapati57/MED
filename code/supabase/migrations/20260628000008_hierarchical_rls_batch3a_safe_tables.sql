BEGIN;

-- Batch 3a excludes: commissary_routes, transfers, intercompany_transfers.
-- They use origin/from/to location columns rather than a single location_id; wiring them needs
-- an explicit two-location route/transfer rule instead of guessing one side.

CREATE OR REPLACE FUNCTION public.batch3a_vendor_scope_visible(
  p_organization_id uuid,
  p_vendor_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.vendors v
    WHERE v.id = p_vendor_id
      AND v.organization_id = p_organization_id
      AND public.reference_scope_visible(v.organization_id, v.brand_id, v.location_id, NULL)
  );
$$;

CREATE OR REPLACE FUNCTION public.batch3a_vendor_scope_writable(
  p_organization_id uuid,
  p_vendor_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.vendors v
    WHERE v.id = p_vendor_id
      AND v.organization_id = p_organization_id
      AND public.reference_scope_writable(v.organization_id, v.brand_id, v.location_id, NULL, 'location_manager')
  );
$$;

CREATE OR REPLACE FUNCTION public.batch3a_vendor_item_scope_visible(
  p_organization_id uuid,
  p_vendor_item_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.vendor_items vi
    WHERE vi.id = p_vendor_item_id
      AND vi.organization_id = p_organization_id
      AND public.batch3a_vendor_scope_visible(vi.organization_id, vi.vendor_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.batch3a_vendor_item_scope_writable(
  p_organization_id uuid,
  p_vendor_item_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.vendor_items vi
    WHERE vi.id = p_vendor_item_id
      AND vi.organization_id = p_organization_id
      AND public.batch3a_vendor_scope_writable(vi.organization_id, vi.vendor_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.batch3a_count_sheet_visible(
  p_organization_id uuid,
  p_count_sheet_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.count_sheets cs
    WHERE cs.id = p_count_sheet_id
      AND cs.organization_id = p_organization_id
      AND public.tenant_scope_visible(cs.organization_id, NULL, cs.location_id, NULL)
  );
$$;

CREATE OR REPLACE FUNCTION public.batch3a_count_sheet_writable(
  p_organization_id uuid,
  p_count_sheet_id uuid,
  p_allow_ground_staff boolean DEFAULT true
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.count_sheets cs
    WHERE cs.id = p_count_sheet_id
      AND cs.organization_id = p_organization_id
      AND public.tenant_scope_writable(cs.organization_id, NULL, cs.location_id, NULL, p_allow_ground_staff)
  );
$$;

CREATE OR REPLACE FUNCTION public.batch3a_recipe_scope_visible(
  p_organization_id uuid,
  p_recipe_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.recipes r
    WHERE r.id = p_recipe_id
      AND r.organization_id = p_organization_id
      AND public.reference_scope_visible(r.organization_id, r.brand_id, r.location_id, r.deleted_at)
  );
$$;

CREATE OR REPLACE FUNCTION public.batch3a_recipe_scope_writable(
  p_organization_id uuid,
  p_recipe_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.recipes r
    WHERE r.id = p_recipe_id
      AND r.organization_id = p_organization_id
      AND public.reference_scope_writable(r.organization_id, r.brand_id, r.location_id, r.deleted_at, 'location_manager')
  );
$$;
CREATE OR REPLACE FUNCTION public.batch3a_pos_menu_mapping_visible(
  p_organization_id uuid,
  p_pos_item_id uuid,
  p_recipe_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.pos_items pi
    WHERE pi.id = p_pos_item_id
      AND pi.organization_id = p_organization_id
      AND public.reference_scope_visible(pi.organization_id, NULL, pi.location_id, NULL)
  )
  AND public.batch3a_recipe_scope_visible(p_organization_id, p_recipe_id);
$$;

CREATE OR REPLACE FUNCTION public.batch3a_pos_menu_mapping_writable(
  p_organization_id uuid,
  p_pos_item_id uuid,
  p_recipe_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.pos_items pi
    WHERE pi.id = p_pos_item_id
      AND pi.organization_id = p_organization_id
      AND public.reference_scope_writable(pi.organization_id, NULL, pi.location_id, NULL, 'location_manager')
  )
  AND public.batch3a_recipe_scope_writable(p_organization_id, p_recipe_id);
$$;

CREATE OR REPLACE FUNCTION public.batch3a_order_scope_visible(
  p_organization_id uuid,
  p_auto_order_id uuid,
  p_purchase_order_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_auto_order_id IS NOT NULL THEN EXISTS (
      SELECT 1 FROM public.auto_orders ao
      WHERE ao.id = p_auto_order_id
        AND ao.organization_id = p_organization_id
        AND public.tenant_scope_visible(ao.organization_id, ao.brand_id, ao.location_id, NULL)
    )
    WHEN p_purchase_order_id IS NOT NULL THEN EXISTS (
      SELECT 1 FROM public.purchase_orders po
      WHERE po.id = p_purchase_order_id
        AND po.organization_id = p_organization_id
        AND public.tenant_scope_visible(po.organization_id, NULL, po.location_id, NULL)
    )
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION public.batch3a_order_scope_writable(
  p_organization_id uuid,
  p_auto_order_id uuid,
  p_purchase_order_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_auto_order_id IS NOT NULL THEN EXISTS (
      SELECT 1 FROM public.auto_orders ao
      WHERE ao.id = p_auto_order_id
        AND ao.organization_id = p_organization_id
        AND public.tenant_scope_writable(ao.organization_id, ao.brand_id, ao.location_id, NULL, false)
    )
    WHEN p_purchase_order_id IS NOT NULL THEN EXISTS (
      SELECT 1 FROM public.purchase_orders po
      WHERE po.id = p_purchase_order_id
        AND po.organization_id = p_organization_id
        AND public.tenant_scope_writable(po.organization_id, NULL, po.location_id, NULL, false)
    )
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION public.batch3a_iot_sensor_visible(
  p_organization_id uuid,
  p_sensor_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.iot_sensors s
    WHERE s.id = p_sensor_id
      AND s.organization_id = p_organization_id
      AND public.tenant_scope_visible(s.organization_id, NULL, s.location_id, NULL)
  );
$$;

CREATE OR REPLACE FUNCTION public.batch3a_iot_sensor_writable(
  p_organization_id uuid,
  p_sensor_id uuid,
  p_allow_ground_staff boolean DEFAULT true
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.iot_sensors s
    WHERE s.id = p_sensor_id
      AND s.organization_id = p_organization_id
      AND public.tenant_scope_writable(s.organization_id, NULL, s.location_id, NULL, p_allow_ground_staff)
  );
$$;

CREATE OR REPLACE FUNCTION public.batch3a_webhook_endpoint_visible(
  p_organization_id uuid,
  p_endpoint_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.webhook_endpoints we
    WHERE we.id = p_endpoint_id
      AND we.organization_id = p_organization_id
      AND (public.is_platform_admin() OR we.organization_id = public.get_auth_org())
  );
$$;

CREATE OR REPLACE FUNCTION public.batch3a_webhook_endpoint_writable(
  p_organization_id uuid,
  p_endpoint_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.webhook_endpoints we
    WHERE we.id = p_endpoint_id
      AND we.organization_id = p_organization_id
      AND (public.is_platform_admin() OR (we.organization_id = public.get_auth_org() AND public.is_manager_or_above()))
  );
$$;

DO $$
DECLARE
  v_table text;
  v_policy record;
  v_tables text[] := ARRAY[
    'time_clocks','shift_schedules','employee_shifts','count_sheets','pos_orders','pos_sales_data',
    'delivery_channels','labor_forecasts','iot_sensors','budgets','vendor_items','vendor_item_prices',
    'vendor_item_mappings','vendor_aliases','pos_items','pos_menu_mapping','smart_prep_plans','budget_targets',
    'count_sessions','recipe_ingredients','receivings','temperature_logs','vendor_issues','vendor_statements',
    'edi_transmissions','webhook_events_queue'
  ];
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    FOR v_policy IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = v_table
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_policy.policyname, v_table);
    END LOOP;
  END LOOP;
END $$;

-- Location-scoped direct tables.
CREATE POLICY batch3a_time_clocks_select ON public.time_clocks
  FOR SELECT USING (public.tenant_scope_visible(organization_id, NULL, location_id, NULL));
CREATE POLICY batch3a_time_clocks_insert ON public.time_clocks
  FOR INSERT WITH CHECK (public.tenant_scope_writable(organization_id, NULL, location_id, NULL, true));
CREATE POLICY batch3a_time_clocks_update ON public.time_clocks
  FOR UPDATE USING (public.tenant_scope_writable(organization_id, NULL, location_id, NULL, true))
  WITH CHECK (public.tenant_scope_writable(organization_id, NULL, location_id, NULL, true));

CREATE POLICY batch3a_shift_schedules_select ON public.shift_schedules
  FOR SELECT USING (public.tenant_scope_visible(organization_id, NULL, location_id, NULL));
CREATE POLICY batch3a_shift_schedules_insert ON public.shift_schedules
  FOR INSERT WITH CHECK (public.tenant_scope_writable(organization_id, NULL, location_id, NULL, false));
CREATE POLICY batch3a_shift_schedules_update ON public.shift_schedules
  FOR UPDATE USING (public.tenant_scope_writable(organization_id, NULL, location_id, NULL, false))
  WITH CHECK (public.tenant_scope_writable(organization_id, NULL, location_id, NULL, false));

CREATE POLICY batch3a_employee_shifts_select ON public.employee_shifts
  FOR SELECT USING (public.tenant_scope_visible(organization_id, NULL, location_id, NULL));
CREATE POLICY batch3a_employee_shifts_insert ON public.employee_shifts
  FOR INSERT WITH CHECK (public.tenant_scope_writable(organization_id, NULL, location_id, NULL, false));
CREATE POLICY batch3a_employee_shifts_update ON public.employee_shifts
  FOR UPDATE USING (public.tenant_scope_writable(organization_id, NULL, location_id, NULL, false))
  WITH CHECK (public.tenant_scope_writable(organization_id, NULL, location_id, NULL, false));

CREATE POLICY batch3a_count_sheets_select ON public.count_sheets
  FOR SELECT USING (public.tenant_scope_visible(organization_id, NULL, location_id, NULL));
CREATE POLICY batch3a_count_sheets_insert ON public.count_sheets
  FOR INSERT WITH CHECK (public.tenant_scope_writable(organization_id, NULL, location_id, NULL, true));
CREATE POLICY batch3a_count_sheets_update ON public.count_sheets
  FOR UPDATE USING (public.tenant_scope_writable(organization_id, NULL, location_id, NULL, true))
  WITH CHECK (public.tenant_scope_writable(organization_id, NULL, location_id, NULL, true));

CREATE POLICY batch3a_pos_orders_select ON public.pos_orders
  FOR SELECT USING (public.tenant_scope_visible(organization_id, NULL, location_id, NULL));
CREATE POLICY batch3a_pos_orders_insert ON public.pos_orders
  FOR INSERT WITH CHECK (public.tenant_scope_writable(organization_id, NULL, location_id, NULL, false));
CREATE POLICY batch3a_pos_orders_update ON public.pos_orders
  FOR UPDATE USING (public.tenant_scope_writable(organization_id, NULL, location_id, NULL, false))
  WITH CHECK (public.tenant_scope_writable(organization_id, NULL, location_id, NULL, false));

CREATE POLICY batch3a_pos_sales_data_select ON public.pos_sales_data
  FOR SELECT USING (public.tenant_scope_visible(organization_id, NULL, location_id, NULL));
CREATE POLICY batch3a_pos_sales_data_insert ON public.pos_sales_data
  FOR INSERT WITH CHECK (public.tenant_scope_writable(organization_id, NULL, location_id, NULL, true));
CREATE POLICY batch3a_pos_sales_data_update ON public.pos_sales_data
  FOR UPDATE USING (public.tenant_scope_writable(organization_id, NULL, location_id, NULL, true))
  WITH CHECK (public.tenant_scope_writable(organization_id, NULL, location_id, NULL, true));

CREATE POLICY batch3a_delivery_channels_select ON public.delivery_channels
  FOR SELECT USING (public.tenant_scope_visible(organization_id, NULL, location_id, NULL));
CREATE POLICY batch3a_delivery_channels_insert ON public.delivery_channels
  FOR INSERT WITH CHECK (public.tenant_scope_writable(organization_id, NULL, location_id, NULL, false));
CREATE POLICY batch3a_delivery_channels_update ON public.delivery_channels
  FOR UPDATE USING (public.tenant_scope_writable(organization_id, NULL, location_id, NULL, false))
  WITH CHECK (public.tenant_scope_writable(organization_id, NULL, location_id, NULL, false));

CREATE POLICY batch3a_labor_forecasts_select ON public.labor_forecasts
  FOR SELECT USING (public.tenant_scope_visible(organization_id, NULL, location_id, NULL));
CREATE POLICY batch3a_labor_forecasts_insert ON public.labor_forecasts
  FOR INSERT WITH CHECK (public.tenant_scope_writable(organization_id, NULL, location_id, NULL, false));
CREATE POLICY batch3a_labor_forecasts_update ON public.labor_forecasts
  FOR UPDATE USING (public.tenant_scope_writable(organization_id, NULL, location_id, NULL, false))
  WITH CHECK (public.tenant_scope_writable(organization_id, NULL, location_id, NULL, false));

CREATE POLICY batch3a_iot_sensors_select ON public.iot_sensors
  FOR SELECT USING (public.tenant_scope_visible(organization_id, NULL, location_id, NULL));
CREATE POLICY batch3a_iot_sensors_insert ON public.iot_sensors
  FOR INSERT WITH CHECK (public.tenant_scope_writable(organization_id, NULL, location_id, NULL, false));
CREATE POLICY batch3a_iot_sensors_update ON public.iot_sensors
  FOR UPDATE USING (public.tenant_scope_writable(organization_id, NULL, location_id, NULL, false))
  WITH CHECK (public.tenant_scope_writable(organization_id, NULL, location_id, NULL, false));

CREATE POLICY batch3a_budgets_select ON public.budgets
  FOR SELECT USING (public.tenant_scope_visible(organization_id, NULL, location_id, NULL));
CREATE POLICY batch3a_budgets_insert ON public.budgets
  FOR INSERT WITH CHECK (public.tenant_scope_writable(organization_id, NULL, location_id, NULL, false));
CREATE POLICY batch3a_budgets_update ON public.budgets
  FOR UPDATE USING (public.tenant_scope_writable(organization_id, NULL, location_id, NULL, false))
  WITH CHECK (public.tenant_scope_writable(organization_id, NULL, location_id, NULL, false));

-- Reference direct / parent-derived tables.
CREATE POLICY batch3a_budget_targets_select ON public.budget_targets
  FOR SELECT USING (public.reference_scope_visible(organization_id, brand_id, location_id, NULL));
CREATE POLICY batch3a_budget_targets_insert ON public.budget_targets
  FOR INSERT WITH CHECK (public.reference_scope_writable(organization_id, brand_id, location_id, NULL, 'location_manager'));
CREATE POLICY batch3a_budget_targets_update ON public.budget_targets
  FOR UPDATE USING (public.reference_scope_writable(organization_id, brand_id, location_id, NULL, 'location_manager'))
  WITH CHECK (public.reference_scope_writable(organization_id, brand_id, location_id, NULL, 'location_manager'));

CREATE POLICY batch3a_smart_prep_plans_select ON public.smart_prep_plans
  FOR SELECT USING (public.reference_scope_visible(organization_id, brand_id, location_id, NULL));
CREATE POLICY batch3a_smart_prep_plans_insert ON public.smart_prep_plans
  FOR INSERT WITH CHECK (public.reference_scope_writable(organization_id, brand_id, location_id, NULL, 'location_manager'));
CREATE POLICY batch3a_smart_prep_plans_update ON public.smart_prep_plans
  FOR UPDATE USING (public.reference_scope_writable(organization_id, brand_id, location_id, NULL, 'location_manager'))
  WITH CHECK (public.reference_scope_writable(organization_id, brand_id, location_id, NULL, 'location_manager'));

CREATE POLICY batch3a_pos_items_select ON public.pos_items
  FOR SELECT USING (public.reference_scope_visible(organization_id, NULL, location_id, NULL));
CREATE POLICY batch3a_pos_items_insert ON public.pos_items
  FOR INSERT WITH CHECK (public.reference_scope_writable(organization_id, NULL, location_id, NULL, 'location_manager'));
CREATE POLICY batch3a_pos_items_update ON public.pos_items
  FOR UPDATE USING (public.reference_scope_writable(organization_id, NULL, location_id, NULL, 'location_manager'))
  WITH CHECK (public.reference_scope_writable(organization_id, NULL, location_id, NULL, 'location_manager'));

CREATE POLICY batch3a_vendor_items_select ON public.vendor_items
  FOR SELECT USING (public.batch3a_vendor_scope_visible(organization_id, vendor_id));
CREATE POLICY batch3a_vendor_items_insert ON public.vendor_items
  FOR INSERT WITH CHECK (public.batch3a_vendor_scope_writable(organization_id, vendor_id));
CREATE POLICY batch3a_vendor_items_update ON public.vendor_items
  FOR UPDATE USING (public.batch3a_vendor_scope_writable(organization_id, vendor_id))
  WITH CHECK (public.batch3a_vendor_scope_writable(organization_id, vendor_id));

CREATE POLICY batch3a_vendor_item_prices_select ON public.vendor_item_prices
  FOR SELECT USING (public.batch3a_vendor_scope_visible(organization_id, vendor_id));
CREATE POLICY batch3a_vendor_item_prices_insert ON public.vendor_item_prices
  FOR INSERT WITH CHECK (public.batch3a_vendor_scope_writable(organization_id, vendor_id));
CREATE POLICY batch3a_vendor_item_prices_update ON public.vendor_item_prices
  FOR UPDATE USING (public.batch3a_vendor_scope_writable(organization_id, vendor_id))
  WITH CHECK (public.batch3a_vendor_scope_writable(organization_id, vendor_id));

CREATE POLICY batch3a_vendor_item_mappings_select ON public.vendor_item_mappings
  FOR SELECT USING (public.batch3a_vendor_item_scope_visible(organization_id, vendor_item_id));
CREATE POLICY batch3a_vendor_item_mappings_insert ON public.vendor_item_mappings
  FOR INSERT WITH CHECK (public.batch3a_vendor_item_scope_writable(organization_id, vendor_item_id));
CREATE POLICY batch3a_vendor_item_mappings_update ON public.vendor_item_mappings
  FOR UPDATE USING (public.batch3a_vendor_item_scope_writable(organization_id, vendor_item_id))
  WITH CHECK (public.batch3a_vendor_item_scope_writable(organization_id, vendor_item_id));

CREATE POLICY batch3a_vendor_aliases_select ON public.vendor_aliases
  FOR SELECT USING (public.batch3a_vendor_scope_visible(organization_id, canonical_vendor_id));
CREATE POLICY batch3a_vendor_aliases_insert ON public.vendor_aliases
  FOR INSERT WITH CHECK (public.batch3a_vendor_scope_writable(organization_id, canonical_vendor_id));
CREATE POLICY batch3a_vendor_aliases_update ON public.vendor_aliases
  FOR UPDATE USING (public.batch3a_vendor_scope_writable(organization_id, canonical_vendor_id))
  WITH CHECK (public.batch3a_vendor_scope_writable(organization_id, canonical_vendor_id));

CREATE POLICY batch3a_pos_menu_mapping_select ON public.pos_menu_mapping
  FOR SELECT USING (public.batch3a_pos_menu_mapping_visible(organization_id, pos_item_id, recipe_id));
CREATE POLICY batch3a_pos_menu_mapping_insert ON public.pos_menu_mapping
  FOR INSERT WITH CHECK (public.batch3a_pos_menu_mapping_writable(organization_id, pos_item_id, recipe_id));
CREATE POLICY batch3a_pos_menu_mapping_update ON public.pos_menu_mapping
  FOR UPDATE USING (public.batch3a_pos_menu_mapping_writable(organization_id, pos_item_id, recipe_id))
  WITH CHECK (public.batch3a_pos_menu_mapping_writable(organization_id, pos_item_id, recipe_id));

-- Parent-inherited tables.
CREATE POLICY batch3a_count_sessions_select ON public.count_sessions
  FOR SELECT USING (public.batch3a_count_sheet_visible(organization_id, count_sheet_id));
CREATE POLICY batch3a_count_sessions_insert ON public.count_sessions
  FOR INSERT WITH CHECK (public.batch3a_count_sheet_writable(organization_id, count_sheet_id, true));
CREATE POLICY batch3a_count_sessions_update ON public.count_sessions
  FOR UPDATE USING (public.batch3a_count_sheet_writable(organization_id, count_sheet_id, true))
  WITH CHECK (public.batch3a_count_sheet_writable(organization_id, count_sheet_id, true));

CREATE POLICY batch3a_recipe_ingredients_select ON public.recipe_ingredients
  FOR SELECT USING (public.batch3a_recipe_scope_visible(organization_id, recipe_id));
CREATE POLICY batch3a_recipe_ingredients_insert ON public.recipe_ingredients
  FOR INSERT WITH CHECK (public.batch3a_recipe_scope_writable(organization_id, recipe_id));
CREATE POLICY batch3a_recipe_ingredients_update ON public.recipe_ingredients
  FOR UPDATE USING (public.batch3a_recipe_scope_writable(organization_id, recipe_id))
  WITH CHECK (public.batch3a_recipe_scope_writable(organization_id, recipe_id));

CREATE POLICY batch3a_receivings_select ON public.receivings
  FOR SELECT USING (public.batch3a_order_scope_visible(organization_id, order_id, purchase_order_id));
CREATE POLICY batch3a_receivings_insert ON public.receivings
  FOR INSERT WITH CHECK (public.batch3a_order_scope_writable(organization_id, order_id, purchase_order_id));
CREATE POLICY batch3a_receivings_update ON public.receivings
  FOR UPDATE USING (public.batch3a_order_scope_writable(organization_id, order_id, purchase_order_id))
  WITH CHECK (public.batch3a_order_scope_writable(organization_id, order_id, purchase_order_id));

CREATE POLICY batch3a_temperature_logs_select ON public.temperature_logs
  FOR SELECT USING (public.batch3a_iot_sensor_visible(organization_id, sensor_id));
CREATE POLICY batch3a_temperature_logs_insert ON public.temperature_logs
  FOR INSERT WITH CHECK (public.batch3a_iot_sensor_writable(organization_id, sensor_id, true));
CREATE POLICY batch3a_temperature_logs_update ON public.temperature_logs
  FOR UPDATE USING (public.batch3a_iot_sensor_writable(organization_id, sensor_id, true))
  WITH CHECK (public.batch3a_iot_sensor_writable(organization_id, sensor_id, true));

CREATE POLICY batch3a_vendor_issues_select ON public.vendor_issues
  FOR SELECT USING (public.batch3a_vendor_scope_visible(organization_id, vendor_id));
CREATE POLICY batch3a_vendor_issues_insert ON public.vendor_issues
  FOR INSERT WITH CHECK (public.batch3a_vendor_scope_writable(organization_id, vendor_id));
CREATE POLICY batch3a_vendor_issues_update ON public.vendor_issues
  FOR UPDATE USING (public.batch3a_vendor_scope_writable(organization_id, vendor_id))
  WITH CHECK (public.batch3a_vendor_scope_writable(organization_id, vendor_id));

CREATE POLICY batch3a_vendor_statements_select ON public.vendor_statements
  FOR SELECT USING (public.batch3a_vendor_scope_visible(organization_id, vendor_id));
CREATE POLICY batch3a_vendor_statements_insert ON public.vendor_statements
  FOR INSERT WITH CHECK (public.batch3a_vendor_scope_writable(organization_id, vendor_id));
CREATE POLICY batch3a_vendor_statements_update ON public.vendor_statements
  FOR UPDATE USING (public.batch3a_vendor_scope_writable(organization_id, vendor_id))
  WITH CHECK (public.batch3a_vendor_scope_writable(organization_id, vendor_id));

CREATE POLICY batch3a_edi_transmissions_select ON public.edi_transmissions
  FOR SELECT USING (public.batch3a_order_scope_visible(organization_id, order_id, NULL));
CREATE POLICY batch3a_edi_transmissions_insert ON public.edi_transmissions
  FOR INSERT WITH CHECK (public.batch3a_order_scope_writable(organization_id, order_id, NULL));
CREATE POLICY batch3a_edi_transmissions_update ON public.edi_transmissions
  FOR UPDATE USING (public.batch3a_order_scope_writable(organization_id, order_id, NULL))
  WITH CHECK (public.batch3a_order_scope_writable(organization_id, order_id, NULL));

CREATE POLICY batch3a_webhook_events_queue_select ON public.webhook_events_queue
  FOR SELECT USING (public.batch3a_webhook_endpoint_visible(organization_id, endpoint_id));
CREATE POLICY batch3a_webhook_events_queue_insert ON public.webhook_events_queue
  FOR INSERT WITH CHECK (public.batch3a_webhook_endpoint_writable(organization_id, endpoint_id));
CREATE POLICY batch3a_webhook_events_queue_update ON public.webhook_events_queue
  FOR UPDATE USING (public.batch3a_webhook_endpoint_writable(organization_id, endpoint_id))
  WITH CHECK (public.batch3a_webhook_endpoint_writable(organization_id, endpoint_id));

REVOKE ALL PRIVILEGES ON TABLE
  public.time_clocks, public.shift_schedules, public.employee_shifts, public.count_sheets,
  public.pos_orders, public.pos_sales_data, public.delivery_channels, public.labor_forecasts,
  public.iot_sensors, public.budgets, public.vendor_items, public.vendor_item_prices,
  public.vendor_item_mappings, public.vendor_aliases, public.pos_items, public.pos_menu_mapping,
  public.smart_prep_plans, public.budget_targets, public.count_sessions, public.recipe_ingredients,
  public.receivings, public.temperature_logs, public.vendor_issues, public.vendor_statements,
  public.edi_transmissions, public.webhook_events_queue
FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE ON TABLE
  public.time_clocks, public.shift_schedules, public.employee_shifts, public.count_sheets,
  public.pos_orders, public.pos_sales_data, public.delivery_channels, public.labor_forecasts,
  public.iot_sensors, public.budgets, public.vendor_items, public.vendor_item_prices,
  public.vendor_item_mappings, public.vendor_aliases, public.pos_items, public.pos_menu_mapping,
  public.smart_prep_plans, public.budget_targets, public.count_sessions, public.recipe_ingredients,
  public.receivings, public.temperature_logs, public.vendor_issues, public.vendor_statements,
  public.edi_transmissions, public.webhook_events_queue
TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.time_clocks, public.shift_schedules, public.employee_shifts, public.count_sheets,
  public.pos_orders, public.pos_sales_data, public.delivery_channels, public.labor_forecasts,
  public.iot_sensors, public.budgets, public.vendor_items, public.vendor_item_prices,
  public.vendor_item_mappings, public.vendor_aliases, public.pos_items, public.pos_menu_mapping,
  public.smart_prep_plans, public.budget_targets, public.count_sessions, public.recipe_ingredients,
  public.receivings, public.temperature_logs, public.vendor_issues, public.vendor_statements,
  public.edi_transmissions, public.webhook_events_queue
TO service_role;

COMMIT;