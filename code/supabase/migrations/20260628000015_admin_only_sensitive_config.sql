BEGIN;

-- Batch 3c-4: lock remaining sensitive archived/config/billing/AI tables.
-- employees is intentionally excluded; staff data is handled by a separate sync workflow.
-- archived_invitations.token is a raw invitation credential and is column-revoked from user roles.
-- business_verifications keeps a narrow self onboarding INSERT/SELECT path; admin review remains admin-only.
-- franchise_agreements are scoped to any org that is a party to the agreement.
-- ai_insights is admin-only because metadata can contain cross-location aggregate detail.

DO $$
DECLARE
  v_policy record;
BEGIN
  FOR v_policy IN
    SELECT tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'archived_brands',
        'archived_locations',
        'archived_profiles',
        'archived_invitations',
        'business_verifications',
        'franchise_agreements',
        'subscriptions',
        'ai_insights'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_policy.policyname, v_policy.tablename);
  END LOOP;
END $$;

REVOKE ALL PRIVILEGES ON
  public.archived_brands,
  public.archived_locations,
  public.archived_profiles,
  public.archived_invitations,
  public.business_verifications,
  public.franchise_agreements,
  public.subscriptions,
  public.ai_insights
FROM anon, authenticated;

REVOKE TRUNCATE, REFERENCES, TRIGGER ON
  public.archived_brands,
  public.archived_locations,
  public.archived_profiles,
  public.archived_invitations,
  public.business_verifications,
  public.franchise_agreements,
  public.subscriptions,
  public.ai_insights
FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.archived_brands,
  public.archived_locations,
  public.archived_profiles,
  public.business_verifications,
  public.franchise_agreements,
  public.subscriptions,
  public.ai_insights
TO authenticated;

GRANT INSERT, UPDATE, DELETE ON public.archived_invitations TO authenticated;

GRANT ALL PRIVILEGES ON
  public.archived_brands,
  public.archived_locations,
  public.archived_profiles,
  public.archived_invitations,
  public.business_verifications,
  public.franchise_agreements,
  public.subscriptions,
  public.ai_insights
TO service_role;

REVOKE SELECT ON public.archived_invitations FROM anon, authenticated;
REVOKE SELECT (token) ON public.archived_invitations FROM anon, authenticated;
GRANT SELECT (
  id,
  email,
  role,
  invited_by,
  accepted_at,
  expires_at,
  created_at,
  organization_id,
  location_id,
  brand_id,
  access_level,
  archived_at,
  archived_by
) ON public.archived_invitations TO authenticated;

CREATE POLICY archived_brands_admin_select
  ON public.archived_brands
  FOR SELECT
  USING (public.is_admin() AND organization_id = public.get_auth_org());

CREATE POLICY archived_brands_admin_insert
  ON public.archived_brands
  FOR INSERT
  WITH CHECK (public.is_admin() AND organization_id = public.get_auth_org());

CREATE POLICY archived_brands_admin_update
  ON public.archived_brands
  FOR UPDATE
  USING (public.is_admin() AND organization_id = public.get_auth_org())
  WITH CHECK (public.is_admin() AND organization_id = public.get_auth_org());

CREATE POLICY archived_brands_admin_delete
  ON public.archived_brands
  FOR DELETE
  USING (public.is_admin() AND organization_id = public.get_auth_org());

CREATE POLICY archived_locations_admin_select
  ON public.archived_locations
  FOR SELECT
  USING (public.is_admin() AND organization_id = public.get_auth_org());

CREATE POLICY archived_locations_admin_insert
  ON public.archived_locations
  FOR INSERT
  WITH CHECK (public.is_admin() AND organization_id = public.get_auth_org());

CREATE POLICY archived_locations_admin_update
  ON public.archived_locations
  FOR UPDATE
  USING (public.is_admin() AND organization_id = public.get_auth_org())
  WITH CHECK (public.is_admin() AND organization_id = public.get_auth_org());

CREATE POLICY archived_locations_admin_delete
  ON public.archived_locations
  FOR DELETE
  USING (public.is_admin() AND organization_id = public.get_auth_org());

CREATE POLICY archived_profiles_admin_select
  ON public.archived_profiles
  FOR SELECT
  USING (public.is_admin() AND organization_id = public.get_auth_org());

CREATE POLICY archived_profiles_admin_insert
  ON public.archived_profiles
  FOR INSERT
  WITH CHECK (public.is_admin() AND organization_id = public.get_auth_org());

CREATE POLICY archived_profiles_admin_update
  ON public.archived_profiles
  FOR UPDATE
  USING (public.is_admin() AND organization_id = public.get_auth_org())
  WITH CHECK (public.is_admin() AND organization_id = public.get_auth_org());

CREATE POLICY archived_profiles_admin_delete
  ON public.archived_profiles
  FOR DELETE
  USING (public.is_admin() AND organization_id = public.get_auth_org());

CREATE POLICY archived_invitations_admin_select
  ON public.archived_invitations
  FOR SELECT
  USING (public.is_admin() AND organization_id = public.get_auth_org());

CREATE POLICY archived_invitations_admin_insert
  ON public.archived_invitations
  FOR INSERT
  WITH CHECK (public.is_admin() AND organization_id = public.get_auth_org());

CREATE POLICY archived_invitations_admin_update
  ON public.archived_invitations
  FOR UPDATE
  USING (public.is_admin() AND organization_id = public.get_auth_org())
  WITH CHECK (public.is_admin() AND organization_id = public.get_auth_org());

CREATE POLICY archived_invitations_admin_delete
  ON public.archived_invitations
  FOR DELETE
  USING (public.is_admin() AND organization_id = public.get_auth_org());

CREATE POLICY business_verifications_admin_or_self_select
  ON public.business_verifications
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR (public.is_admin() AND organization_id = public.get_auth_org())
  );

CREATE POLICY business_verifications_admin_or_self_insert
  ON public.business_verifications
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    OR (public.is_admin() AND organization_id = public.get_auth_org())
  );

CREATE POLICY business_verifications_admin_update
  ON public.business_verifications
  FOR UPDATE
  USING (public.is_admin() AND organization_id = public.get_auth_org())
  WITH CHECK (public.is_admin() AND organization_id = public.get_auth_org());

CREATE POLICY business_verifications_admin_delete
  ON public.business_verifications
  FOR DELETE
  USING (public.is_admin() AND organization_id = public.get_auth_org());

CREATE POLICY franchise_agreements_party_admin_select
  ON public.franchise_agreements
  FOR SELECT
  USING (
    public.is_admin()
    AND public.get_auth_org() IN (organization_id, parent_org_id, child_org_id)
  );

CREATE POLICY franchise_agreements_party_admin_insert
  ON public.franchise_agreements
  FOR INSERT
  WITH CHECK (
    public.is_admin()
    AND public.get_auth_org() IN (organization_id, parent_org_id, child_org_id)
  );

CREATE POLICY franchise_agreements_party_admin_update
  ON public.franchise_agreements
  FOR UPDATE
  USING (
    public.is_admin()
    AND public.get_auth_org() IN (organization_id, parent_org_id, child_org_id)
  )
  WITH CHECK (
    public.is_admin()
    AND public.get_auth_org() IN (organization_id, parent_org_id, child_org_id)
  );

CREATE POLICY franchise_agreements_party_admin_delete
  ON public.franchise_agreements
  FOR DELETE
  USING (
    public.is_admin()
    AND public.get_auth_org() IN (organization_id, parent_org_id, child_org_id)
  );

CREATE POLICY subscriptions_admin_select
  ON public.subscriptions
  FOR SELECT
  USING (public.is_admin() AND organization_id = public.get_auth_org());

CREATE POLICY subscriptions_admin_insert
  ON public.subscriptions
  FOR INSERT
  WITH CHECK (public.is_admin() AND organization_id = public.get_auth_org());

CREATE POLICY subscriptions_admin_update
  ON public.subscriptions
  FOR UPDATE
  USING (public.is_admin() AND organization_id = public.get_auth_org())
  WITH CHECK (public.is_admin() AND organization_id = public.get_auth_org());

CREATE POLICY subscriptions_admin_delete
  ON public.subscriptions
  FOR DELETE
  USING (public.is_admin() AND organization_id = public.get_auth_org());

CREATE POLICY ai_insights_admin_select
  ON public.ai_insights
  FOR SELECT
  USING (public.is_admin() AND organization_id = public.get_auth_org());

CREATE POLICY ai_insights_admin_insert
  ON public.ai_insights
  FOR INSERT
  WITH CHECK (public.is_admin() AND organization_id = public.get_auth_org());

CREATE POLICY ai_insights_admin_update
  ON public.ai_insights
  FOR UPDATE
  USING (public.is_admin() AND organization_id = public.get_auth_org())
  WITH CHECK (public.is_admin() AND organization_id = public.get_auth_org());

CREATE POLICY ai_insights_admin_delete
  ON public.ai_insights
  FOR DELETE
  USING (public.is_admin() AND organization_id = public.get_auth_org());

COMMIT;
