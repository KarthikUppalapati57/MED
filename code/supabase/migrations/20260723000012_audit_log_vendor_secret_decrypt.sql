BEGIN;

-- Both functions' own source comments acknowledged "audit logging is deferred to the audit
-- phase" and never got it (VO-GAP-023). Log every successful decrypt to vendor_onboarding_events
-- -- the audit trail this module already uses for every other lifecycle event -- rather than
-- adding a new table for one more append-only event stream.
CREATE OR REPLACE FUNCTION public.get_vendor_tax_for_audit(p_tax_row_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_secret_id uuid;
  v_secret text;
  v_vendor_id uuid;
BEGIN
  -- Ponytail: service-role/audit/dispute path ONLY, never user-facing.
  SELECT tax_secret_id, vendor_id
    INTO v_secret_id, v_vendor_id
  FROM public.vendor_tax_information
  WHERE id = p_tax_row_id
    AND deleted_at IS NULL;

  IF v_secret_id IS NULL THEN
    RAISE EXCEPTION 'Vendor tax secret for row % not found', p_tax_row_id;
  END IF;

  SELECT decrypted_secret
    INTO v_secret
  FROM vault.decrypted_secrets
  WHERE id = v_secret_id;

  IF v_secret IS NULL THEN
    RAISE EXCEPTION 'Vault secret % not found', v_secret_id;
  END IF;

  INSERT INTO public.vendor_onboarding_events (vendor_id, event_type, actor_id, actor_type, metadata)
  VALUES (
    v_vendor_id,
    'tax_secret_decrypted',
    auth.uid(),
    'system',
    jsonb_build_object('tax_row_id', p_tax_row_id, 'secret_id', v_secret_id)
  );

  RETURN v_secret;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_vendor_banking_for_audit(p_banking_row_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_secret_id uuid;
  v_secret text;
  v_vendor_id uuid;
BEGIN
  -- Ponytail: service-role/audit/dispute path ONLY, never user-facing.
  SELECT banking_secret_id, vendor_id
    INTO v_secret_id, v_vendor_id
  FROM public.vendor_banking_details
  WHERE id = p_banking_row_id
    AND deleted_at IS NULL;

  IF v_secret_id IS NULL THEN
    RAISE EXCEPTION 'Vendor banking secret for row % not found', p_banking_row_id;
  END IF;

  SELECT decrypted_secret
    INTO v_secret
  FROM vault.decrypted_secrets
  WHERE id = v_secret_id;

  IF v_secret IS NULL THEN
    RAISE EXCEPTION 'Vault secret % not found', v_secret_id;
  END IF;

  INSERT INTO public.vendor_onboarding_events (vendor_id, event_type, actor_id, actor_type, metadata)
  VALUES (
    v_vendor_id,
    'banking_secret_decrypted',
    auth.uid(),
    'system',
    jsonb_build_object('banking_row_id', p_banking_row_id, 'secret_id', v_secret_id)
  );

  RETURN v_secret::jsonb;
END;
$function$;

COMMIT;
