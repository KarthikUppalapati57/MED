BEGIN;

-- Transfer-rule step: two-endpoint RLS for transfer-style operational tables.
-- commissary_routes is a route header/config-operational record: origin_location_id plus destination stops in commissary_route_stops.
-- No target table has deleted_at in the live schema, so soft-delete predicates are not applicable here.

CREATE OR REPLACE FUNCTION public.transfer_scope_visible(
  p_organization_id uuid,
  p_from_location_id uuid,
  p_to_location_id uuid,
  p_deleted_at timestamptz DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p_deleted_at IS NULL
    AND (
      public.is_platform_admin()
      OR (
        p_organization_id = public.get_auth_org()
        AND (
          public.get_auth_role() = 'org_owner'
          OR p_from_location_id = ANY (ARRAY(SELECT public.get_my_accessible_location_ids()))
          OR p_to_location_id = ANY (ARRAY(SELECT public.get_my_accessible_location_ids()))
        )
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.transfer_from_scope_writable(
  p_organization_id uuid,
  p_from_location_id uuid,
  p_deleted_at timestamptz DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p_deleted_at IS NULL
    AND public.is_manager_or_above()
    AND (
      public.is_platform_admin()
      OR (
        p_organization_id = public.get_auth_org()
        AND (
          public.get_auth_role() = 'org_owner'
          OR p_from_location_id = ANY (ARRAY(SELECT public.get_my_accessible_location_ids()))
        )
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.intercompany_from_scope_writable(
  p_organization_id uuid,
  p_from_location_id uuid,
  p_deleted_at timestamptz DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p_deleted_at IS NULL
    AND public.get_auth_role() IN ('branch_manager', 'org_owner', 'platform_admin')
    AND (
      public.is_platform_admin()
      OR (
        p_organization_id = public.get_auth_org()
        AND (
          public.get_auth_role() = 'org_owner'
          OR p_from_location_id = ANY (ARRAY(SELECT public.get_my_accessible_location_ids()))
        )
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.commissary_route_scope_visible(
  p_organization_id uuid,
  p_route_id uuid,
  p_origin_location_id uuid,
  p_deleted_at timestamptz DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p_deleted_at IS NULL
    AND (
      public.is_platform_admin()
      OR (
        p_organization_id = public.get_auth_org()
        AND (
          public.get_auth_role() = 'org_owner'
          OR p_origin_location_id = ANY (ARRAY(SELECT public.get_my_accessible_location_ids()))
          OR EXISTS (
            SELECT 1
            FROM public.commissary_route_stops crs
            WHERE crs.route_id = p_route_id
              AND crs.destination_location_id = ANY (ARRAY(SELECT public.get_my_accessible_location_ids()))
          )
        )
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.commissary_route_scope_writable(
  p_organization_id uuid,
  p_origin_location_id uuid,
  p_deleted_at timestamptz DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p_deleted_at IS NULL
    AND public.is_manager_or_above()
    AND (
      public.is_platform_admin()
      OR (
        p_organization_id = public.get_auth_org()
        AND (
          public.get_auth_role() = 'org_owner'
          OR p_origin_location_id = ANY (ARRAY(SELECT public.get_my_accessible_location_ids()))
        )
      )
    );
$$;

DO $$
DECLARE
  v_policy record;
BEGIN
  FOR v_policy IN
    SELECT tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('transfers', 'intercompany_transfers', 'commissary_routes')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_policy.policyname, v_policy.tablename);
  END LOOP;
END $$;

REVOKE ALL PRIVILEGES ON public.transfers, public.intercompany_transfers, public.commissary_routes FROM anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.transfers, public.intercompany_transfers, public.commissary_routes FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE ON public.transfers, public.intercompany_transfers, public.commissary_routes TO authenticated;
GRANT ALL PRIVILEGES ON public.transfers, public.intercompany_transfers, public.commissary_routes TO service_role;

GRANT EXECUTE ON FUNCTION public.transfer_scope_visible(uuid, uuid, uuid, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_from_scope_writable(uuid, uuid, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.intercompany_from_scope_writable(uuid, uuid, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.commissary_route_scope_visible(uuid, uuid, uuid, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.commissary_route_scope_writable(uuid, uuid, timestamptz) TO authenticated;

CREATE POLICY transfers_endpoint_select
  ON public.transfers
  FOR SELECT
  USING (public.transfer_scope_visible(organization_id, from_location_id, to_location_id, NULL));

CREATE POLICY transfers_from_scope_insert
  ON public.transfers
  FOR INSERT
  WITH CHECK (public.transfer_from_scope_writable(organization_id, from_location_id, NULL));

CREATE POLICY transfers_from_scope_update
  ON public.transfers
  FOR UPDATE
  USING (public.transfer_from_scope_writable(organization_id, from_location_id, NULL))
  WITH CHECK (public.transfer_from_scope_writable(organization_id, from_location_id, NULL));

CREATE POLICY intercompany_transfers_endpoint_select
  ON public.intercompany_transfers
  FOR SELECT
  USING (public.transfer_scope_visible(organization_id, from_location_id, to_location_id, NULL));

CREATE POLICY intercompany_transfers_branch_from_scope_insert
  ON public.intercompany_transfers
  FOR INSERT
  WITH CHECK (public.intercompany_from_scope_writable(organization_id, from_location_id, NULL));

CREATE POLICY intercompany_transfers_branch_from_scope_update
  ON public.intercompany_transfers
  FOR UPDATE
  USING (public.intercompany_from_scope_writable(organization_id, from_location_id, NULL))
  WITH CHECK (public.intercompany_from_scope_writable(organization_id, from_location_id, NULL));

CREATE POLICY commissary_routes_endpoint_select
  ON public.commissary_routes
  FOR SELECT
  USING (public.commissary_route_scope_visible(organization_id, id, origin_location_id, NULL));

CREATE POLICY commissary_routes_origin_scope_insert
  ON public.commissary_routes
  FOR INSERT
  WITH CHECK (public.commissary_route_scope_writable(organization_id, origin_location_id, NULL));

CREATE POLICY commissary_routes_origin_scope_update
  ON public.commissary_routes
  FOR UPDATE
  USING (public.commissary_route_scope_writable(organization_id, origin_location_id, NULL))
  WITH CHECK (public.commissary_route_scope_writable(organization_id, origin_location_id, NULL));

COMMIT;