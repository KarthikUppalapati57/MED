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
