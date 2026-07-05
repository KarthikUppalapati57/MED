BEGIN;

-- Batch 3b-cont: org-level wiring for tables excluded from 3b due to lacking brand/location columns.
-- pos_configurations is intentionally org-level for now despite having location_id; it can be
-- tightened to location-scoped later if POS configuration diverges per location.
-- loyalty_memberships has organization_id and customer_id -> customers(id); prefer direct org-level
-- policy on its own organization_id per the Batch 3b-cont decision.

DO $$
DECLARE
  v_table text;
  v_policy record;
  v_tables text[] := ARRAY[
    'customers',
    'marketing_campaigns',
    'loyalty_memberships',
    'gl_mappings',
    'tolerance_configurations',
    'closed_periods',
    'pos_configurations'
  ];
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    FOR v_policy IN
      SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = v_table
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_policy.policyname, v_table);
    END LOOP;
  END LOOP;
END $$;

-- Org-level, manager+ write.
CREATE POLICY batch3b_cont_customers_select ON public.customers
  FOR SELECT USING (public.batch3b_org_visible(organization_id));
CREATE POLICY batch3b_cont_customers_insert ON public.customers
  FOR INSERT WITH CHECK (public.batch3b_org_writable(organization_id, false));
CREATE POLICY batch3b_cont_customers_update ON public.customers
  FOR UPDATE USING (public.batch3b_org_writable(organization_id, false))
  WITH CHECK (public.batch3b_org_writable(organization_id, false));

CREATE POLICY batch3b_cont_marketing_campaigns_select ON public.marketing_campaigns
  FOR SELECT USING (public.batch3b_org_visible(organization_id));
CREATE POLICY batch3b_cont_marketing_campaigns_insert ON public.marketing_campaigns
  FOR INSERT WITH CHECK (public.batch3b_org_writable(organization_id, false));
CREATE POLICY batch3b_cont_marketing_campaigns_update ON public.marketing_campaigns
  FOR UPDATE USING (public.batch3b_org_writable(organization_id, false))
  WITH CHECK (public.batch3b_org_writable(organization_id, false));

CREATE POLICY batch3b_cont_loyalty_memberships_select ON public.loyalty_memberships
  FOR SELECT USING (public.batch3b_org_visible(organization_id));
CREATE POLICY batch3b_cont_loyalty_memberships_insert ON public.loyalty_memberships
  FOR INSERT WITH CHECK (public.batch3b_org_writable(organization_id, false));
CREATE POLICY batch3b_cont_loyalty_memberships_update ON public.loyalty_memberships
  FOR UPDATE USING (public.batch3b_org_writable(organization_id, false))
  WITH CHECK (public.batch3b_org_writable(organization_id, false));

-- Org-level, admin-only write.
CREATE POLICY batch3b_cont_gl_mappings_select ON public.gl_mappings
  FOR SELECT USING (public.batch3b_org_visible(organization_id));
CREATE POLICY batch3b_cont_gl_mappings_insert ON public.gl_mappings
  FOR INSERT WITH CHECK (public.batch3b_org_writable(organization_id, true));
CREATE POLICY batch3b_cont_gl_mappings_update ON public.gl_mappings
  FOR UPDATE USING (public.batch3b_org_writable(organization_id, true))
  WITH CHECK (public.batch3b_org_writable(organization_id, true));

CREATE POLICY batch3b_cont_tolerance_configurations_select ON public.tolerance_configurations
  FOR SELECT USING (public.batch3b_org_visible(organization_id));
CREATE POLICY batch3b_cont_tolerance_configurations_insert ON public.tolerance_configurations
  FOR INSERT WITH CHECK (public.batch3b_org_writable(organization_id, true));
CREATE POLICY batch3b_cont_tolerance_configurations_update ON public.tolerance_configurations
  FOR UPDATE USING (public.batch3b_org_writable(organization_id, true))
  WITH CHECK (public.batch3b_org_writable(organization_id, true));

CREATE POLICY batch3b_cont_closed_periods_select ON public.closed_periods
  FOR SELECT USING (public.batch3b_org_visible(organization_id));
CREATE POLICY batch3b_cont_closed_periods_insert ON public.closed_periods
  FOR INSERT WITH CHECK (public.batch3b_org_writable(organization_id, true));
CREATE POLICY batch3b_cont_closed_periods_update ON public.closed_periods
  FOR UPDATE USING (public.batch3b_org_writable(organization_id, true))
  WITH CHECK (public.batch3b_org_writable(organization_id, true));

CREATE POLICY batch3b_cont_pos_configurations_select ON public.pos_configurations
  FOR SELECT USING (public.batch3b_org_visible(organization_id));
CREATE POLICY batch3b_cont_pos_configurations_insert ON public.pos_configurations
  FOR INSERT WITH CHECK (public.batch3b_org_writable(organization_id, true));
CREATE POLICY batch3b_cont_pos_configurations_update ON public.pos_configurations
  FOR UPDATE USING (public.batch3b_org_writable(organization_id, true))
  WITH CHECK (public.batch3b_org_writable(organization_id, true));

REVOKE ALL PRIVILEGES ON TABLE
  public.customers,
  public.marketing_campaigns,
  public.loyalty_memberships,
  public.gl_mappings,
  public.tolerance_configurations,
  public.closed_periods,
  public.pos_configurations
FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE ON TABLE
  public.customers,
  public.marketing_campaigns,
  public.loyalty_memberships,
  public.gl_mappings,
  public.tolerance_configurations,
  public.closed_periods,
  public.pos_configurations
TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.customers,
  public.marketing_campaigns,
  public.loyalty_memberships,
  public.gl_mappings,
  public.tolerance_configurations,
  public.closed_periods,
  public.pos_configurations
TO service_role;

COMMIT;