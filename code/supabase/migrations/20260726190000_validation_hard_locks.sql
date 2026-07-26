-- 20260726000006: Production validation enforcement.
-- Invoice validation warns and records acknowledgement state; it must not block
-- authorized reviewers from moving an invoice into approval after review.
-- Other core safety checks below remain hard locks.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Invoice validation failures are recorded as approval warnings.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.invoice_hard_validation_failures(p_invoice_id uuid)
RETURNS text[]
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_invoice public.invoices%ROWTYPE;
  v_failures text[] := ARRAY[]::text[];
  v_line_count integer := 0;
  v_line_sum numeric := 0;
  v_bad_line_count integer := 0;
  v_expected_total numeric := 0;
  v_vendor record;
  v_variance_count integer := 0;
BEGIN
  SELECT *
  INTO v_invoice
  FROM public.invoices
  WHERE id = p_invoice_id
    AND COALESCE(deleted_at, NULL) IS NULL;

  IF v_invoice.id IS NULL THEN
    RETURN ARRAY['invoice_not_found'];
  END IF;

  IF NULLIF(btrim(COALESCE(v_invoice.invoice_number, '')), '') IS NOT NULL
     AND NULLIF(btrim(COALESCE(v_invoice.vendor_name, '')), '') IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.invoices other
       WHERE other.id <> v_invoice.id
         AND other.organization_id IS NOT DISTINCT FROM v_invoice.organization_id
         AND other.brand_id IS NOT DISTINCT FROM v_invoice.brand_id
         AND other.location_id IS NOT DISTINCT FROM v_invoice.location_id
         AND lower(btrim(COALESCE(other.invoice_number, ''))) = lower(btrim(v_invoice.invoice_number))
         AND lower(btrim(COALESCE(other.vendor_name, ''))) = lower(btrim(v_invoice.vendor_name))
         AND COALESCE(other.deleted_at, NULL) IS NULL
         AND COALESCE(other.status, '') NOT IN ('rejected', 'duplicate')
     ) THEN
    v_failures := array_append(v_failures, 'duplicate_invoice');
  END IF;

  SELECT
    COUNT(*)::integer,
    COALESCE(SUM(COALESCE(total_price, 0)), 0),
    COALESCE(SUM(CASE WHEN abs((COALESCE(quantity, 0) * COALESCE(unit_price, 0)) - COALESCE(total_price, 0)) >= 0.01 THEN 1 ELSE 0 END), 0)::integer
  INTO v_line_count, v_line_sum, v_bad_line_count
  FROM public.invoice_line_items
  WHERE invoice_id = v_invoice.id;

  IF v_bad_line_count > 0 THEN
    v_failures := array_append(v_failures, 'line_item_total_mismatch');
  END IF;

  IF v_line_count > 0 AND abs(v_line_sum - COALESCE(v_invoice.subtotal, 0)) >= 0.01 THEN
    v_failures := array_append(v_failures, 'invoice_subtotal_mismatch');
  END IF;

  v_expected_total := COALESCE(v_invoice.subtotal, 0)
    + COALESCE(v_invoice.tax_amount, 0)
    + COALESCE(v_invoice.fuel_surcharge, 0)
    + COALESCE(v_invoice.delivery_fee, 0)
    + COALESCE(v_invoice.other_charges, 0);

  IF abs(v_expected_total - COALESCE(v_invoice.total_amount, 0)) >= 0.01 THEN
    v_failures := array_append(v_failures, 'invoice_total_mismatch');
  END IF;

  IF v_invoice.vendor_id IS NULL THEN
    v_failures := array_append(v_failures, 'vendor_not_linked');
  ELSE
    SELECT status, approval_status
    INTO v_vendor
    FROM public.vendors
    WHERE id = v_invoice.vendor_id;

    IF v_vendor.status = 'blacklisted'
       OR COALESCE(v_vendor.approval_status, '') IN ('suspended', 'rejected') THEN
      v_failures := array_append(v_failures, 'vendor_blocked');
    END IF;
  END IF;

  SELECT COUNT(*)::integer
  INTO v_variance_count
  FROM public.reconciliation_variances
  WHERE invoice_id = v_invoice.id
    AND COALESCE(is_resolved, false) IS FALSE;

  IF v_variance_count > 0 THEN
    v_failures := array_append(v_failures, 'unresolved_reconciliation_variance');
  END IF;

  RETURN v_failures;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_invoice_validation_state_on_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_failures text[];
BEGIN
  IF COALESCE(NEW.status, '') NOT IN ('pending_approval', 'approved')
     AND COALESCE(NEW.ap_status, '') NOT IN ('pending_approval', 'approved') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND COALESCE(OLD.status, '') = COALESCE(NEW.status, '')
     AND COALESCE(OLD.ap_status, '') = COALESCE(NEW.ap_status, '') THEN
    RETURN NEW;
  END IF;

  v_failures := public.invoice_hard_validation_failures(NEW.id);

  NEW.validation_results := COALESCE(NEW.validation_results, '{}'::jsonb)
    || jsonb_build_object(
      'approval_validation_checked_at', now(),
      'approval_validation_failures', to_jsonb(v_failures),
      'approval_validation_acknowledgement_required', COALESCE(array_length(v_failures, 1), 0) > 0
    );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_invoice_validation_before_approval ON public.invoices;
DROP FUNCTION IF EXISTS public.enforce_invoice_validation_before_approval();
DROP TRIGGER IF EXISTS record_invoice_validation_state_on_approval ON public.invoices;
CREATE TRIGGER record_invoice_validation_state_on_approval
BEFORE INSERT OR UPDATE OF status, ap_status
ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.record_invoice_validation_state_on_approval();

REVOKE ALL ON FUNCTION public.invoice_hard_validation_failures(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.invoice_hard_validation_failures(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Validate hierarchy payload before submitting to platform review.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.validate_onboarding_address_payload(p_address jsonb, p_label text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_country text := lower(btrim(COALESCE(p_address->>'country', 'United States')));
  v_postal text := btrim(COALESCE(p_address->>'postalCode', p_address->>'zipCode', p_address->>'zip', ''));
BEGIN
  IF p_address IS NULL OR COALESCE(jsonb_typeof(p_address), 'null') <> 'object' THEN
    RAISE EXCEPTION '% must be an address object', p_label;
  END IF;

  IF NULLIF(btrim(COALESCE(p_address->>'line1', '')), '') IS NULL
     OR NULLIF(btrim(COALESCE(p_address->>'city', '')), '') IS NULL
     OR NULLIF(btrim(COALESCE(p_address->>'state', '')), '') IS NULL
     OR NULLIF(v_postal, '') IS NULL
     OR NULLIF(btrim(COALESCE(p_address->>'country', '')), '') IS NULL THEN
    RAISE EXCEPTION '% must include line 1, city, state, postal code, and country', p_label;
  END IF;

  IF v_country IN ('us', 'usa', 'united states', 'united states of america')
     AND v_postal !~ '^\d{5}(-?\d{4})?$' THEN
    RAISE EXCEPTION '% postal code is invalid', p_label;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_onboarding_hierarchy_payload(p_hierarchy jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  org_item jsonb;
  brand_item jsonb;
  location_item jsonb;
  v_org_name text;
  v_brand_name text;
  v_location_name text;
  v_org_address jsonb;
  v_org_mailing jsonb;
  v_brand_address jsonb;
  v_location_business jsonb;
  v_location_mailing jsonb;
BEGIN
  IF p_hierarchy IS NULL OR COALESCE(jsonb_typeof(p_hierarchy), 'null') <> 'array' THEN
    RAISE EXCEPTION 'Onboarding hierarchy must be an array';
  END IF;

  IF jsonb_array_length(p_hierarchy) = 0 THEN
    RAISE EXCEPTION 'Onboarding hierarchy must include at least one organization';
  END IF;

  FOR org_item IN SELECT value FROM jsonb_array_elements(p_hierarchy)
  LOOP
    v_org_name := NULLIF(btrim(org_item->>'name'), '');
    IF v_org_name IS NULL OR NULLIF(btrim(org_item->>'slug'), '') IS NULL THEN
      RAISE EXCEPTION 'Each organization requires a name and slug';
    END IF;

    IF COALESCE(jsonb_typeof(org_item->'brands'), 'null') <> 'array'
       OR jsonb_array_length(org_item->'brands') = 0 THEN
      RAISE EXCEPTION 'Organization % requires at least one brand', v_org_name;
    END IF;

    v_org_address := NULLIF(COALESCE(org_item#>'{metadata,organization_business_address}', org_item#>'{metadata,organization_address}'), 'null'::jsonb);
    IF v_org_address IS NOT NULL THEN
      PERFORM public.validate_onboarding_address_payload(v_org_address, 'Organization ' || v_org_name || ' business/service address');
      v_org_mailing := CASE
        WHEN COALESCE((org_item#>>'{metadata,organization_mailing_same_as_business}')::boolean, true) THEN v_org_address
        ELSE NULLIF(org_item#>'{metadata,organization_mailing_address}', 'null'::jsonb)
      END;
      PERFORM public.validate_onboarding_address_payload(v_org_mailing, 'Organization ' || v_org_name || ' mailing address');
    END IF;

    FOR brand_item IN SELECT value FROM jsonb_array_elements(org_item->'brands')
    LOOP
      v_brand_name := NULLIF(btrim(brand_item->>'name'), '');
      IF v_brand_name IS NULL THEN
        RAISE EXCEPTION 'Every brand in organization % requires a name', v_org_name;
      END IF;

      IF COALESCE(jsonb_typeof(brand_item->'locations'), 'null') <> 'array'
         OR jsonb_array_length(brand_item->'locations') = 0 THEN
        RAISE EXCEPTION 'Brand % requires at least one location', v_brand_name;
      END IF;

      v_brand_address := NULLIF(brand_item#>'{metadata,brand_address}', 'null'::jsonb);
      IF v_brand_address IS NOT NULL THEN
        PERFORM public.validate_onboarding_address_payload(v_brand_address, 'Brand ' || v_brand_name || ' address');
      END IF;

      FOR location_item IN SELECT value FROM jsonb_array_elements(brand_item->'locations')
      LOOP
        v_location_name := NULLIF(btrim(location_item->>'name'), '');
        IF v_location_name IS NULL THEN
          RAISE EXCEPTION 'Every location in brand % requires a name', v_brand_name;
        END IF;

        v_location_business := location_item->'business_address';
        v_location_mailing := location_item->'mailing_address';
        PERFORM public.validate_onboarding_address_payload(v_location_business, 'Location ' || v_location_name || ' business/service address');
        PERFORM public.validate_onboarding_address_payload(v_location_mailing, 'Location ' || v_location_name || ' mailing address');
      END LOOP;
    END LOOP;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_onboarding_hierarchy_for_review(p_user_id uuid, p_hierarchy jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_business_status text;
  v_payment_verified boolean;
  v_pending_payment_metadata jsonb;
  v_usps_address_validation_enabled boolean;
  v_submission_id uuid;
  v_run_id uuid;
BEGIN
  IF auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Not authorized to submit hierarchy for another user';
  END IF;

  SELECT business_verification_status, payment_verified, pending_payment_metadata
  INTO v_business_status, v_payment_verified, v_pending_payment_metadata
  FROM public.profiles
  WHERE id = p_user_id;

  IF COALESCE(v_business_status, 'not_started') <> 'verified' THEN
    RAISE EXCEPTION 'Business verification must be completed before hierarchy setup';
  END IF;

  IF COALESCE(v_payment_verified, false) IS NOT TRUE
     AND COALESCE(v_pending_payment_metadata->>'provider', '') NOT IN ('free_plan', 'stripe') THEN
    RAISE EXCEPTION 'Payment method verification must be completed before hierarchy setup';
  END IF;

  PERFORM public.validate_onboarding_hierarchy_payload(p_hierarchy);

  SELECT usps_address_validation_enabled
  INTO v_usps_address_validation_enabled
  FROM public.platform_onboarding_settings
  WHERE id = true;

  IF COALESCE(v_usps_address_validation_enabled, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'USPS address validation must be enabled before address onboarding can be submitted';
  END IF;

  INSERT INTO public.onboarding_hierarchy_submissions (user_id, hierarchy_payload, status, rejection_reason, reviewed_by, reviewed_at)
  VALUES (p_user_id, p_hierarchy, 'pending_review', NULL, NULL, NULL)
  ON CONFLICT (user_id) DO UPDATE
  SET hierarchy_payload = EXCLUDED.hierarchy_payload,
      status = 'pending_review',
      rejection_reason = NULL,
      reviewed_by = NULL,
      reviewed_at = NULL,
      updated_at = now()
  RETURNING id INTO v_submission_id;

  UPDATE public.profiles
  SET hierarchy_review_status = 'pending_review',
      onboarding_status = 'pending_review',
      onboarding_current_step = 'hierarchy_review',
      updated_at = now()
  WHERE id = p_user_id;

  INSERT INTO public.notifications(user_id, type, title, message, is_read)
  SELECT p.id, 'system', 'Tenant workspace pending review',
         COALESCE(p.full_name, p.email, 'A tenant') || ' submitted an organization hierarchy for review.', false
  FROM public.profiles p WHERE p.role = 'platform_admin';

  BEGIN
    v_run_id := public.get_or_create_onboarding_run(p_user_id);
    PERFORM public.record_onboarding_event(v_run_id, p_user_id, 'hierarchy_setup', 'submitted', 'pending_review', jsonb_build_object('submission_id', v_submission_id));
  EXCEPTION WHEN undefined_function THEN
    NULL;
  END;

  RETURN jsonb_build_object('success', true, 'status', 'pending_review', 'submission_id', v_submission_id);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.validate_onboarding_address_payload(jsonb, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.validate_onboarding_hierarchy_payload(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.submit_onboarding_hierarchy_for_review(uuid, jsonb) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Business verification contact OTP and profile privilege hard locks.
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS enforce_business_verification_contact_otp ON public.business_verifications;
CREATE TRIGGER enforce_business_verification_contact_otp
BEFORE INSERT OR UPDATE OF metadata, verification_status
ON public.business_verifications
FOR EACH ROW
EXECUTE FUNCTION public.enforce_business_verification_contact_otp();

CREATE OR REPLACE FUNCTION public.protect_profile_security_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role OR
     NEW.organization_id IS DISTINCT FROM OLD.organization_id OR
     NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR
     NEW.brand_id IS DISTINCT FROM OLD.brand_id OR
     NEW.location_id IS DISTINCT FROM OLD.location_id OR
     NEW.access_level IS DISTINCT FROM OLD.access_level OR
     NEW.access_permissions IS DISTINCT FROM OLD.access_permissions OR
     NEW.invoice_approval_limit IS DISTINCT FROM OLD.invoice_approval_limit OR
     NEW.has_unlimited_approval IS DISTINCT FROM OLD.has_unlimited_approval THEN

    IF current_setting('role') IN ('authenticated', 'anon')
       AND current_setting('app.trusted_profile_write', true) IS DISTINCT FROM 'on' THEN
       RAISE EXCEPTION '42501: Privilege escalation attempt detected. You cannot modify roles, permissions, approval limits, or organization bindings.'
         USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_security_columns ON public.profiles;
CREATE TRIGGER trg_protect_profile_security_columns
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.protect_profile_security_columns();

COMMIT;

NOTIFY pgrst, 'reload schema';
