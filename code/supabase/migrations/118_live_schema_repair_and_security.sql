-- Migration 118: Live schema repair and security hardening
-- Repairs functions that drifted from the live schema and removes unsafe auth fallbacks.

BEGIN;

-- Keep useful audit attribution columns rather than silently dropping values in RPCs.
ALTER TABLE public.invitations
  ADD COLUMN IF NOT EXISTS accepted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_invitations_accepted_by ON public.invitations(accepted_by);
CREATE INDEX IF NOT EXISTS idx_payments_created_by ON public.payments(created_by);

-- Auth helpers must not trust user_metadata. app_metadata is server-controlled.
CREATE OR REPLACE FUNCTION public.get_auth_org()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT NULLIF(auth.jwt() -> 'app_metadata' ->> 'organization_id', '')::uuid;
$$;

CREATE OR REPLACE FUNCTION public.get_auth_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(NULLIF(auth.jwt() -> 'app_metadata' ->> 'role', ''), 'ground_staff');
$$;

-- Revoke direct access to query text/statistics from normal authenticated users.
REVOKE ALL ON public.vw_slow_queries FROM anon, authenticated, public;

-- brands uses brand_id in the live schema.
CREATE OR REPLACE FUNCTION public.setup_organization_full(
  p_user_id UUID,
  p_org_name TEXT,
  p_org_slug TEXT,
  p_brand_name TEXT,
  p_location_name TEXT,
  p_location_address TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_org_id UUID;
  v_brand_id UUID;
  v_location_id UUID;
BEGIN
  IF auth.uid() != p_user_id AND public.get_auth_role() != 'platform_admin' THEN
    RAISE EXCEPTION 'Not authorized to onboard another user';
  END IF;

  INSERT INTO public.organizations (name, slug, owner_id)
  VALUES (p_org_name, p_org_slug, p_user_id)
  RETURNING id INTO v_org_id;

  INSERT INTO public.brands (organization_id, name)
  VALUES (v_org_id, p_brand_name)
  RETURNING brand_id INTO v_brand_id;

  INSERT INTO public.locations (organization_id, brand_id, name, address)
  VALUES (v_org_id, v_brand_id, p_location_name, p_location_address)
  RETURNING id INTO v_location_id;

  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES (v_org_id, p_user_id, 'org_owner')
  ON CONFLICT (organization_id, user_id) DO UPDATE SET role = EXCLUDED.role;

  INSERT INTO public.brand_members (brand_id, user_id, role)
  VALUES (v_brand_id, p_user_id, 'org_owner')
  ON CONFLICT (brand_id, user_id) DO UPDATE SET role = EXCLUDED.role;

  INSERT INTO public.location_members (location_id, user_id, role)
  VALUES (v_location_id, p_user_id, 'org_owner')
  ON CONFLICT (location_id, user_id) DO UPDATE SET role = EXCLUDED.role;

  UPDATE public.profiles
  SET organization_id = v_org_id,
      brand_id        = v_brand_id,
      location_id     = v_location_id,
      role            = 'org_owner',
      access_level    = 'organization',
      updated_at      = now()
  WHERE id = p_user_id;

  UPDATE auth.users
  SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object(
    'role', 'org_owner',
    'organization_id', v_org_id::text,
    'brand_id', v_brand_id::text,
    'location_id', v_location_id::text
  )
  WHERE id = p_user_id;

  RETURN jsonb_build_object(
    'org_id',      v_org_id,
    'brand_id',    v_brand_id,
    'location_id', v_location_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_invitation(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_invite RECORD;
  v_user_id UUID;
  v_user_email TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;

  SELECT * INTO v_invite
  FROM public.invitations
  WHERE token::text = p_token
    AND accepted_at IS NULL
    AND LOWER(email) = LOWER(v_user_email);

  IF v_invite IS NULL THEN
    RAISE EXCEPTION 'Invalid, expired, or already-accepted invitation';
  END IF;

  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES (v_invite.organization_id, v_user_id, v_invite.role)
  ON CONFLICT (organization_id, user_id) DO UPDATE SET role = EXCLUDED.role;

  IF v_invite.brand_id IS NOT NULL THEN
    INSERT INTO public.brand_members (brand_id, user_id, role)
    VALUES (v_invite.brand_id, v_user_id, v_invite.role)
    ON CONFLICT (brand_id, user_id) DO UPDATE SET role = EXCLUDED.role;
  END IF;

  IF v_invite.location_id IS NOT NULL THEN
    INSERT INTO public.location_members (location_id, user_id, role)
    VALUES (v_invite.location_id, v_user_id, v_invite.role)
    ON CONFLICT (location_id, user_id) DO UPDATE SET role = EXCLUDED.role;
  END IF;

  UPDATE public.profiles
  SET role            = v_invite.role,
      organization_id = v_invite.organization_id,
      brand_id        = COALESCE(v_invite.brand_id, brand_id),
      location_id     = COALESCE(v_invite.location_id, location_id),
      access_level    = COALESCE(v_invite.access_level, access_level),
      updated_at      = now()
  WHERE id = v_user_id;

  UPDATE public.invitations
  SET accepted_at = now(),
      accepted_by = v_user_id
  WHERE id = v_invite.id;

  UPDATE auth.users
  SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object(
    'role', v_invite.role,
    'organization_id', v_invite.organization_id::text,
    'brand_id', COALESCE(v_invite.brand_id::text, ''),
    'location_id', COALESCE(v_invite.location_id::text, '')
  )
  WHERE id = v_user_id;

  RETURN jsonb_build_object(
    'success',         true,
    'role',            v_invite.role,
    'organization_id', v_invite.organization_id,
    'brand_id',        v_invite.brand_id,
    'location_id',     v_invite.location_id
  );
END;
$$;

-- invoice_line_items uses internal_product_id and total_price in the live schema.
CREATE OR REPLACE FUNCTION public.calculate_invoice_allocations(p_invoice_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_org_id UUID;
  v_tax NUMERIC;
  v_fuel NUMERIC;
  v_delivery NUMERIC;
  v_other NUMERIC;
  v_cat_record RECORD;
BEGIN
  SELECT organization_id,
         COALESCE(tax_amount, 0),
         COALESCE(fuel_surcharge, 0),
         COALESCE(delivery_fee, 0),
         COALESCE(other_charges, 0)
  INTO v_org_id, v_tax, v_fuel, v_delivery, v_other
  FROM public.invoices
  WHERE id = p_invoice_id;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  DELETE FROM public.invoice_allocations WHERE invoice_id = p_invoice_id;

  FOR v_cat_record IN (
    SELECT
      COALESCE(p.category, 'uncategorized') AS cat_name,
      SUM(COALESCE(ili.total_price, ili.quantity * ili.unit_price, 0)) AS total_amount
    FROM public.invoice_line_items ili
    LEFT JOIN public.products p ON ili.internal_product_id = p.id
    WHERE ili.invoice_id = p_invoice_id
    GROUP BY COALESCE(p.category, 'uncategorized')
  ) LOOP
    IF COALESCE(v_cat_record.total_amount, 0) > 0 THEN
      INSERT INTO public.invoice_allocations (organization_id, invoice_id, allocation_type, category_name, gl_code, amount)
      SELECT
        v_org_id,
        p_invoice_id,
        'line_items',
        v_cat_record.cat_name,
        (SELECT gl_code FROM public.gl_mappings WHERE organization_id = v_org_id AND LOWER(category) = LOWER(v_cat_record.cat_name) LIMIT 1),
        v_cat_record.total_amount;
    END IF;
  END LOOP;

  IF v_tax > 0 THEN
    INSERT INTO public.invoice_allocations (organization_id, invoice_id, allocation_type, category_name, amount)
    VALUES (v_org_id, p_invoice_id, 'tax', 'Tax', v_tax);
  END IF;

  IF v_delivery > 0 THEN
    INSERT INTO public.invoice_allocations (organization_id, invoice_id, allocation_type, category_name, amount)
    VALUES (v_org_id, p_invoice_id, 'delivery', 'Delivery Fee', v_delivery);
  END IF;

  IF v_fuel > 0 THEN
    INSERT INTO public.invoice_allocations (organization_id, invoice_id, allocation_type, category_name, amount)
    VALUES (v_org_id, p_invoice_id, 'fuel', 'Fuel Surcharge', v_fuel);
  END IF;

  IF v_other > 0 THEN
    INSERT INTO public.invoice_allocations (organization_id, invoice_id, allocation_type, category_name, amount)
    VALUES (v_org_id, p_invoice_id, 'other', 'Other Charges', v_other);
  END IF;

  RETURN jsonb_build_object('success', true, 'message', 'Allocations calculated');
END;
$$;

CREATE OR REPLACE FUNCTION public.record_invoice_payment(
  p_invoice_id UUID,
  p_amount NUMERIC,
  p_reference TEXT,
  p_payment_method TEXT DEFAULT 'manual'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_invoice RECORD;
  v_new_paid_amount NUMERIC;
  v_new_status TEXT;
  v_payment_id UUID;
BEGIN
  SELECT * INTO v_invoice FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;

  IF v_invoice.id IS NULL THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  v_new_paid_amount := COALESCE(v_invoice.paid_amount, 0) + COALESCE(p_amount, 0);
  v_new_status := CASE WHEN v_new_paid_amount >= COALESCE(v_invoice.total_amount, 0) THEN 'paid' ELSE 'partially_paid' END;

  UPDATE public.invoices
  SET paid_amount = v_new_paid_amount,
      payment_status = CASE WHEN v_new_status = 'paid' THEN 'paid' ELSE 'partial' END,
      status = v_new_status,
      ap_status = CASE WHEN v_new_status = 'paid' THEN 'paid' ELSE ap_status END,
      payment_reference = p_reference,
      updated_at = now()
  WHERE id = p_invoice_id;

  INSERT INTO public.payments (
    invoice_id, vendor_id, vendor_name, invoice_number,
    amount, payment_method, status, transaction_id, payment_date,
    payment_account_id, organization_id, brand_id, location_id, created_by
  )
  VALUES (
    v_invoice.id, v_invoice.vendor_id, v_invoice.vendor_name, v_invoice.invoice_number,
    p_amount, p_payment_method, 'completed', p_reference, CURRENT_DATE,
    v_invoice.payment_account_id, v_invoice.organization_id, v_invoice.brand_id, v_invoice.location_id, auth.uid()
  )
  RETURNING id INTO v_payment_id;

  RETURN jsonb_build_object(
    'status', v_new_status,
    'paid_amount', v_new_paid_amount,
    'payment_id', v_payment_id
  );
END;
$$;

-- recipe_ingredients does not store name; join products for display names.
CREATE OR REPLACE FUNCTION public.calculate_theoretical_depletion(
  p_org_id UUID,
  p_sales_json JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF NOT public.is_platform_admin() AND p_org_id != public.get_auth_org() THEN
    RAISE EXCEPTION 'Access Denied: Tenant context violation.';
  END IF;

  WITH sales AS (
    SELECT
      (elem->>'name')::TEXT AS sale_name,
      COALESCE((elem->>'qty')::NUMERIC, 0) AS sale_qty
    FROM jsonb_array_elements(p_sales_json) elem
  ),
  matched_recipes AS (
    SELECT
      s.sale_qty,
      r.id AS recipe_id
    FROM sales s
    JOIN public.recipes r ON lower(trim(r.name)) = lower(trim(s.sale_name))
    WHERE r.organization_id = p_org_id
  ),
  depletions AS (
    SELECT
      ri.product_id,
      COALESCE(p.name, ri.product_id::text) AS product_name,
      SUM(ri.quantity * mr.sale_qty) AS total_used,
      MAX(ri.unit) AS unit
    FROM matched_recipes mr
    JOIN public.recipe_ingredients ri ON ri.recipe_id = mr.recipe_id
    LEFT JOIN public.products p ON p.id = ri.product_id
    WHERE ri.organization_id = p_org_id
    GROUP BY ri.product_id, COALESCE(p.name, ri.product_id::text)
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'product_id', d.product_id,
      'product_name', d.product_name,
      'total_used', d.total_used,
      'unit', d.unit
    ) ORDER BY d.total_used DESC
  ), '[]'::jsonb)
  INTO v_result
  FROM depletions d;

  RETURN v_result;
END;
$$;

-- POS data exposes revenue and quantity_sold, not total_sales/actual_cost.
CREATE OR REPLACE FUNCTION public.get_cross_location_benchmarks(p_org_id UUID)
RETURNS TABLE (
    name TEXT,
    sales NUMERIC,
    "laborCost" NUMERIC,
    cogs NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT public.is_platform_admin() AND public.get_my_org() != p_org_id THEN
        RAISE EXCEPTION 'Unauthorized: You do not have access to this organization data.';
    END IF;

    RETURN QUERY
    WITH date_range AS (
        SELECT (now() - interval '30 days') AS start_date
    ),
    sales_by_location AS (
        SELECT ps.location_id, COALESCE(SUM(ps.revenue), 0) AS sales
        FROM public.pos_sales_data ps
        WHERE ps.date >= (SELECT start_date FROM date_range)
        GROUP BY ps.location_id
    ),
    cogs_by_location AS (
        SELECT i.location_id, COALESCE(SUM(i.total_amount), 0) AS cogs
        FROM public.invoices i
        WHERE COALESCE(i.invoice_date, i.created_at::date) >= (SELECT start_date::date FROM date_range)
        GROUP BY i.location_id
    ),
    location_sales AS (
        SELECT
            l.id AS location_id,
            l.name AS location_name,
            COALESCE(s.sales, 0) AS sales,
            COALESCE(c.cogs, 0) AS cogs
        FROM public.locations l
        LEFT JOIN sales_by_location s ON l.id = s.location_id
        LEFT JOIN cogs_by_location c ON l.id = c.location_id
        WHERE l.organization_id = p_org_id
        GROUP BY l.id, l.name, s.sales, c.cogs
    ),
    location_labor AS (
        SELECT
            l.id AS location_id,
            COALESCE(SUM(EXTRACT(EPOCH FROM (es.end_time - es.start_time))/3600 * COALESCE(e.hourly_rate, 15)), 0) AS labor_cost
        FROM public.locations l
        LEFT JOIN public.employees e ON l.id = e.location_id
        LEFT JOIN public.employee_shifts es
            ON e.id = es.employee_id
            AND es.start_time >= (SELECT start_date FROM date_range)
        WHERE l.organization_id = p_org_id
        GROUP BY l.id
    )
    SELECT
        ls.location_name AS name,
        ROUND(ls.sales, 2) AS sales,
        ROUND(ll.labor_cost::NUMERIC, 2) AS "laborCost",
        ROUND(ls.cogs, 2) AS cogs
    FROM location_sales ls
    JOIN location_labor ll ON ls.location_id = ll.location_id
    ORDER BY ls.sales DESC;
END;
$$;

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

    SELECT COALESCE(AVG(revenue), 3000) INTO avg_daily_sales
    FROM public.pos_sales_data
    WHERE location_id = p_location_id AND date >= (now() - interval '30 days');

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

CREATE OR REPLACE FUNCTION public.ai_chat_response(p_org_id UUID, p_query TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_lower_query TEXT := lower(p_query);
    v_sales_yesterday NUMERIC;
    v_forecast_tomorrow NUMERIC;
    v_labor_cost NUMERIC;
    v_pending_invoices INT;
    v_variance NUMERIC;
BEGIN
    IF NOT public.is_platform_admin() AND public.get_my_org() != p_org_id THEN
        RAISE EXCEPTION 'Unauthorized: You do not have access to this organization data.';
    END IF;

    IF v_lower_query LIKE '%variance%' OR v_lower_query LIKE '%food cost%' THEN
        WITH invoice_spend AS (
            SELECT COALESCE(SUM(i.total_amount), 0) AS amount
            FROM public.invoices i
            WHERE i.location_id IN (SELECT id FROM public.locations WHERE organization_id = p_org_id)
              AND COALESCE(i.invoice_date, i.created_at::date) >= (now() - interval '7 days')::date
        ),
        sales AS (
            SELECT COALESCE(SUM(ps.revenue), 0) AS amount
            FROM public.pos_sales_data ps
            WHERE ps.location_id IN (SELECT id FROM public.locations WHERE organization_id = p_org_id)
              AND ps.date >= (now() - interval '7 days')::date
        )
        SELECT invoice_spend.amount - (sales.amount * 0.30)
        INTO v_variance
        FROM invoice_spend, sales;

        RETURN 'Based on available invoice and POS data, estimated food cost variance over the last 7 days is $' || round(v_variance, 2) || '.';

    ELSIF v_lower_query LIKE '%labor%' OR v_lower_query LIKE '%schedule%' OR v_lower_query LIKE '%staff%' THEN
        SELECT COALESCE(AVG(revenue), 5200.00) INTO v_forecast_tomorrow
        FROM public.pos_sales_data
        WHERE location_id IN (SELECT id FROM public.locations WHERE organization_id = p_org_id);

        SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (es.end_time - es.start_time))/3600 * COALESCE(e.hourly_rate, 15)), 1600.00)
        INTO v_labor_cost
        FROM public.employee_shifts es
        JOIN public.employees e ON es.employee_id = e.id
        WHERE e.location_id IN (SELECT id FROM public.locations WHERE organization_id = p_org_id)
          AND date_trunc('day', es.start_time) = date_trunc('day', now() + interval '1 day');

        RETURN 'Tomorrow forecast predicts $' || round(v_forecast_tomorrow, 2) || ' in sales. Current scheduled labor is $' || round(v_labor_cost, 2) || ' (' || round((v_labor_cost / NULLIF(v_forecast_tomorrow, 0)) * 100, 1) || '%).';

    ELSIF v_lower_query LIKE '%brief%' OR v_lower_query LIKE '%yesterday%' OR v_lower_query LIKE '%summary%' THEN
        SELECT COUNT(*) INTO v_pending_invoices
        FROM public.invoices
        WHERE location_id IN (SELECT id FROM public.locations WHERE organization_id = p_org_id)
          AND status = 'pending_review';

        SELECT COALESCE(SUM(revenue), 0) INTO v_sales_yesterday
        FROM public.pos_sales_data
        WHERE location_id IN (SELECT id FROM public.locations WHERE organization_id = p_org_id)
          AND date_trunc('day', date) = date_trunc('day', now() - interval '1 day');

        RETURN 'Yesterday briefing: sales were $' || round(v_sales_yesterday, 2) || '. There are ' || v_pending_invoices || ' invoices pending review.';

    ELSE
        RETURN 'I am analyzing your organization data. Try asking about food cost variance, labor schedule, or yesterday briefing.';
    END IF;
END;
$$;

COMMIT;
