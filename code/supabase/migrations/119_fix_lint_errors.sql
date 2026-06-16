-- Migration 119: Fix PL/pgSQL Linter Errors
BEGIN;

-- 1. Fix get_labor_forecast "date" ambiguous reference
CREATE OR REPLACE FUNCTION public.get_labor_forecast(p_location_id UUID)
RETURNS TABLE (
    date TEXT,
    "salesForecast" NUMERIC,
    "scheduledLabor" NUMERIC,
    "suggestedLabor" NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    avg_daily_sales NUMERIC;
BEGIN
    IF NOT public.is_platform_admin()
       AND public.get_my_org() != (SELECT organization_id FROM public.locations WHERE id = p_location_id) THEN
        RAISE EXCEPTION 'Unauthorized: You do not have access to this location data.';
    END IF;

    SELECT COALESCE(AVG(ps.revenue), 3000) INTO avg_daily_sales
    FROM public.pos_sales_data ps
    WHERE ps.location_id = p_location_id AND ps.date >= (now() - interval '30 days');

    RETURN QUERY
    WITH dates AS (
        SELECT generate_series(
            date_trunc('day', now()),
            date_trunc('day', now() + interval '6 days'),
            interval '1 day'
        ) AS d
    ),
    scheduled AS (
        SELECT
            date_trunc('day', es.start_time) AS shift_date,
            COALESCE(SUM(EXTRACT(EPOCH FROM (es.end_time - es.start_time))/3600 * COALESCE(e.hourly_rate, 15)), 0) AS labor_cost
        FROM public.employee_shifts es
        JOIN public.employees e ON es.employee_id = e.id
        WHERE e.location_id = p_location_id
        GROUP BY date_trunc('day', es.start_time)
    )
    SELECT
        to_char(d.d, 'Mon DD') AS date,
        ROUND(avg_daily_sales * (1 + (random() * 0.4 - 0.2))::NUMERIC, 2) AS "salesForecast",
        ROUND(COALESCE(s.labor_cost::NUMERIC, 0), 2) AS "scheduledLabor",
        ROUND(avg_daily_sales * 0.28, 2) AS "suggestedLabor"
    FROM dates d
    LEFT JOIN scheduled s ON d.d = s.shift_date
    ORDER BY d.d ASC;
END;
$$;

-- 2. Fix schedule_invoice_payment: never read variable "v_org_id"
CREATE OR REPLACE FUNCTION public.schedule_invoice_payment(
  p_invoice_id UUID, 
  p_payment_account_id UUID, 
  p_date DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_invoice_status TEXT;
BEGIN
  -- Verify the invoice exists and get its status
  SELECT status INTO v_invoice_status
  FROM public.invoices WHERE id = p_invoice_id;

  IF v_invoice_status NOT IN ('approved', 'scheduled') THEN
    RAISE EXCEPTION 'Invoice must be approved to schedule payment';
  END IF;

  -- Update the invoice
  UPDATE public.invoices
  SET payment_account_id = p_payment_account_id,
      scheduled_payment_date = p_date,
      status = CASE WHEN status = 'approved' THEN 'scheduled' ELSE status END,
      ap_status = CASE WHEN ap_status = 'approved' THEN 'scheduled' ELSE ap_status END,
      updated_at = now()
  WHERE id = p_invoice_id;

  RETURN jsonb_build_object('status', 'scheduled', 'scheduled_payment_date', p_date);
END;
$$;

-- 3. Fix reconcile_invoice_lines: unused variable "v_variance_id", "v_match_id", "v_tolerance"
CREATE OR REPLACE FUNCTION public.reconcile_invoice_lines(p_invoice_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_org_id UUID;
  v_po_id UUID;
  v_line RECORD;
BEGIN
  SELECT organization_id, purchase_order_id INTO v_org_id, v_po_id 
  FROM public.invoices WHERE id = p_invoice_id;

  -- Delete existing matches and variances for this invoice
  DELETE FROM public.invoice_line_matches WHERE invoice_line_id IN (SELECT id FROM public.invoice_line_items WHERE invoice_id = p_invoice_id);
  DELETE FROM public.reconciliation_variances WHERE invoice_id = p_invoice_id;

  FOR v_line IN (SELECT * FROM public.invoice_line_items WHERE invoice_id = p_invoice_id) LOOP
    INSERT INTO public.invoice_line_matches (organization_id, invoice_line_id, match_status, match_confidence)
    VALUES (v_org_id, v_line.id, 'unmatched', 0.0);

    -- If no PO linked, create a missing_po variance
    IF v_po_id IS NULL THEN
      INSERT INTO public.reconciliation_variances 
      (organization_id, invoice_id, invoice_line_id, variance_type, expected_value, actual_value, variance_amount)
      VALUES (v_org_id, p_invoice_id, v_line.id, 'missing_po', 0, v_line.total_price, v_line.total_price);
    END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'reconciled_lines', (SELECT count(*) FROM public.invoice_line_items WHERE invoice_id = p_invoice_id));
END;
$$;

-- 4. Fix schedule_payment_batch: auto variable "i" shadows a previously defined variable, unused variable "i".
CREATE OR REPLACE FUNCTION public.schedule_payment_batch(
    p_vendor_id UUID,
    p_payment_account_id UUID,
    p_scheduled_date DATE,
    p_invoice_ids UUID[],
    p_amounts NUMERIC[]
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_scheduled_payment_id UUID;
    v_total NUMERIC := 0;
BEGIN
    -- Calculate total
    FOR i IN 1 .. array_length(p_amounts, 1) LOOP
        v_total := v_total + p_amounts[i];
    END LOOP;

    -- Create scheduled payment record
    INSERT INTO public.scheduled_payments (
        organization_id,
        vendor_id,
        payment_account_id,
        total_amount,
        scheduled_date,
        status,
        created_by
    ) VALUES (
        public.get_my_org(),
        p_vendor_id,
        p_payment_account_id,
        v_total,
        p_scheduled_date,
        'scheduled',
        auth.uid()
    ) RETURNING id INTO v_scheduled_payment_id;

    -- Insert intersection records
    FOR i IN 1 .. array_length(p_invoice_ids, 1) LOOP
        INSERT INTO public.scheduled_payment_invoices (
            scheduled_payment_id,
            invoice_id,
            amount_applied
        ) VALUES (
            v_scheduled_payment_id,
            p_invoice_ids[i],
            p_amounts[i]
        );
        
        -- Update invoice status
        UPDATE public.invoices 
        SET scheduled_payment_date = p_scheduled_date,
            status = 'scheduled'
        WHERE id = p_invoice_ids[i];
    END LOOP;

    RETURN v_scheduled_payment_id;
END;
$$;

-- 5. Fix match_vendor: unused variable "v_vendor_id".
CREATE OR REPLACE FUNCTION public.match_vendor(p_org_id UUID, p_vendor_name TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_exact_match UUID;
  v_alias_match UUID;
  v_fuzzy_match UUID;
BEGIN
  -- 1. Exact match on vendors table
  SELECT id INTO v_exact_match FROM public.vendors 
  WHERE organization_id = p_org_id AND LOWER(name) = LOWER(p_vendor_name)
  LIMIT 1;
  
  IF v_exact_match IS NOT NULL THEN
    RETURN v_exact_match;
  END IF;

  -- 2. Exact match on vendor_aliases
  SELECT canonical_vendor_id INTO v_alias_match FROM public.vendor_aliases
  WHERE organization_id = p_org_id AND LOWER(alias_name) = LOWER(p_vendor_name) AND is_verified = true
  LIMIT 1;

  IF v_alias_match IS NOT NULL THEN
    RETURN v_alias_match;
  END IF;

  -- 3. Fuzzy match using Levenshtein distance
  -- Only consider if distance <= 3 (e.g. slight typo)
  SELECT id INTO v_fuzzy_match FROM public.vendors
  WHERE organization_id = p_org_id AND extensions.levenshtein(LOWER(name), LOWER(p_vendor_name)) <= 3
  ORDER BY extensions.levenshtein(LOWER(name), LOWER(p_vendor_name)) ASC
  LIMIT 1;
  
  RETURN v_fuzzy_match;
END;
$$;

-- 6. Fix admin_update_user_role: unused parameter "new_location".
-- NOTE: Dropping the old signature to prevent duplicated signatures.
DROP FUNCTION IF EXISTS public.admin_update_user_role(UUID, TEXT, TEXT, TEXT, TEXT, JSONB, UUID, UUID, TEXT, JSONB);
DROP FUNCTION IF EXISTS public.admin_update_user_role(UUID, TEXT, TEXT, TEXT, TEXT, JSONB, UUID, UUID, TEXT);

CREATE OR REPLACE FUNCTION public.admin_update_user_role(
  target_user_id    UUID,
  new_role          TEXT         DEFAULT NULL,
  new_status        TEXT         DEFAULT NULL,
  new_department    TEXT         DEFAULT NULL,
  new_location      TEXT         DEFAULT NULL,
  new_permissions   JSONB        DEFAULT NULL,
  new_brand_id      UUID         DEFAULT NULL,
  new_location_id   UUID         DEFAULT NULL,
  new_access_level  TEXT         DEFAULT NULL,
  new_signing_privileges JSONB   DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_role TEXT;
  caller_org  UUID;
  target_org  UUID;
BEGIN
  -- Suppress unused parameter warning
  IF new_location IS NOT NULL THEN
    -- location string is currently not used but passed by API
  END IF;

  caller_role := public.get_auth_role();
  caller_org  := public.get_auth_org();

  IF caller_role NOT IN ('org_owner', 'platform_admin') THEN
    RAISE EXCEPTION 'Insufficient permissions: only org_owner or platform_admin can update user roles';
  END IF;

  SELECT organization_id INTO target_org
  FROM public.profiles
  WHERE id = target_user_id;

  IF caller_role = 'org_owner' AND target_org IS DISTINCT FROM caller_org THEN
    RAISE EXCEPTION 'Cannot modify users outside your organization';
  END IF;

  IF caller_role != 'platform_admin' AND new_role IS NOT NULL THEN
    IF NOT public.can_invite_role(new_role) THEN
      RAISE EXCEPTION 'Cannot assign a role equal to or above your own';
    END IF;
  END IF;

  IF target_user_id = auth.uid() AND caller_role = 'org_owner' AND new_role != 'org_owner' THEN
    RAISE EXCEPTION 'Cannot change your own role. Transfer ownership first.';
  END IF;
  
  -- Update membership tables
  IF new_role IS NOT NULL AND target_org IS NOT NULL THEN
      INSERT INTO public.organization_members (organization_id, user_id, role)
      VALUES (target_org, target_user_id, new_role)
      ON CONFLICT (organization_id, user_id) DO UPDATE SET role = EXCLUDED.role;
  END IF;

  UPDATE public.profiles
  SET role               = COALESCE(new_role, role),
      status             = COALESCE(new_status, status),
      department         = COALESCE(new_department, department),
      permissions        = COALESCE(new_permissions, permissions),
      signing_privileges = COALESCE(new_signing_privileges, signing_privileges),
      brand_id           = COALESCE(new_brand_id, brand_id),
      location_id        = COALESCE(new_location_id, location_id),
      access_level       = COALESCE(new_access_level, access_level),
      updated_at         = now()
  WHERE id = target_user_id;

  -- Only update app_metadata if this is their ACTIVE org
  IF (SELECT raw_app_meta_data->>'organization_id' FROM auth.users WHERE id = target_user_id) = target_org::text THEN
      UPDATE auth.users
      SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object(
        'role', COALESCE(new_role, (SELECT role FROM public.profiles WHERE id = target_user_id))
      )
      WHERE id = target_user_id;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- 7. Fix org_remove_member: unused variable "active_org".
CREATE OR REPLACE FUNCTION public.org_remove_member(
    target_user_id UUID,
    target_org_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_role TEXT;
  caller_org  UUID;
BEGIN
  caller_role := public.get_auth_role();
  caller_org  := COALESCE(target_org_id, public.get_auth_org());

  IF caller_role != 'org_owner' AND caller_role != 'platform_admin' THEN
    RAISE EXCEPTION 'Insufficient permissions: only org_owner or platform_admin can remove users';
  END IF;

  IF target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot remove yourself. Transfer ownership first.';
  END IF;

  -- Remove from organization_members
  DELETE FROM public.organization_members 
  WHERE user_id = target_user_id AND organization_id = caller_org;
  
  -- Remove from brand_members for this org
  DELETE FROM public.brand_members 
  WHERE user_id = target_user_id 
    AND brand_id IN (SELECT id FROM public.brands WHERE organization_id = caller_org);
    
  -- Remove from location_members for this org
  DELETE FROM public.location_members 
  WHERE user_id = target_user_id 
    AND location_id IN (SELECT id FROM public.locations WHERE organization_id = caller_org);

  -- Update profiles if this was their active org
  UPDATE public.profiles 
  SET organization_id = NULL, brand_id = NULL, location_id = NULL, role = 'ground_staff'
  WHERE id = target_user_id AND organization_id = caller_org;

  -- Update app_metadata if this is their active context
  IF (SELECT raw_app_meta_data->>'organization_id' FROM auth.users WHERE id = target_user_id) = caller_org::text THEN
      UPDATE auth.users
      SET raw_app_meta_data = raw_app_meta_data - 'organization_id' - 'role' - 'brand_id' - 'location_id'
      WHERE id = target_user_id;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

COMMIT;
