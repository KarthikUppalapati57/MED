-- Restore the shared calendar dimension after data cleanup and make invoice fact
-- syncing resilient to missing date rows.

CREATE OR REPLACE FUNCTION public.ensure_dim_date(p_date date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_date_key integer;
BEGIN
  IF p_date IS NULL THEN
    RETURN NULL;
  END IF;

  v_date_key := to_char(p_date, 'YYYYMMDD')::integer;

  INSERT INTO public.dim_date (
    date_key,
    full_date,
    day_of_week,
    day_name,
    day_of_month,
    day_of_year,
    week_of_year,
    month_number,
    month_name,
    quarter,
    year,
    is_weekend,
    is_month_end,
    fiscal_quarter
  ) VALUES (
    v_date_key,
    p_date,
    extract(dow from p_date)::smallint,
    trim(to_char(p_date, 'Day')),
    extract(day from p_date)::smallint,
    extract(doy from p_date)::smallint,
    extract(week from p_date)::smallint,
    extract(month from p_date)::smallint,
    trim(to_char(p_date, 'Month')),
    extract(quarter from p_date)::smallint,
    extract(year from p_date)::smallint,
    extract(dow from p_date) in (0, 6),
    p_date = (date_trunc('month', p_date)::date + interval '1 month - 1 day')::date,
    'FY' || extract(year from p_date)::text || '-Q' || extract(quarter from p_date)::text
  )
  ON CONFLICT (date_key) DO NOTHING;

  RETURN v_date_key;
END;
$$;

INSERT INTO public.dim_date (
  date_key,
  full_date,
  day_of_week,
  day_name,
  day_of_month,
  day_of_year,
  week_of_year,
  month_number,
  month_name,
  quarter,
  year,
  is_weekend,
  is_month_end,
  fiscal_quarter
)
SELECT
  to_char(d::date, 'YYYYMMDD')::integer,
  d::date,
  extract(dow from d)::smallint,
  trim(to_char(d, 'Day')),
  extract(day from d)::smallint,
  extract(doy from d)::smallint,
  extract(week from d)::smallint,
  extract(month from d)::smallint,
  trim(to_char(d, 'Month')),
  extract(quarter from d)::smallint,
  extract(year from d)::smallint,
  extract(dow from d) in (0, 6),
  d::date = (date_trunc('month', d)::date + interval '1 month - 1 day')::date,
  'FY' || extract(year from d)::text || '-Q' || extract(quarter from d)::text
FROM generate_series('2020-01-01'::date, '2035-12-31'::date, '1 day'::interval) AS d
ON CONFLICT (date_key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.sync_fact_invoices()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_vendor_key uuid;
  v_user_key uuid;
  v_invoice_date_key integer;
  v_due_date_key integer;
BEGIN
  SELECT id INTO v_vendor_key FROM public.dim_vendor WHERE source_vendor_id = NEW.vendor_id LIMIT 1;
  SELECT id INTO v_user_key FROM public.dim_user WHERE source_user_id = NEW.created_by LIMIT 1;

  v_invoice_date_key := public.ensure_dim_date(COALESCE(NEW.invoice_date, NEW.created_at::date, now()::date));
  v_due_date_key := public.ensure_dim_date(NEW.due_date);

  INSERT INTO public.fact_invoices (
    source_invoice_id, invoice_date_key, due_date_key,
    vendor_key, created_by_key,
    organization_id, location_id, invoice_number,
    status, payment_status, source,
    total_amount, subtotal, tax_amount,
    fuel_surcharge, delivery_fee, other_charges,
    line_item_count
  ) VALUES (
    NEW.id,
    v_invoice_date_key,
    v_due_date_key,
    v_vendor_key,
    v_user_key,
    NEW.organization_id,
    NEW.location_id,
    NEW.invoice_number,
    NEW.status,
    NEW.payment_status,
    NEW.source,
    NEW.total_amount,
    NEW.subtotal,
    NEW.tax_amount,
    NEW.fuel_surcharge,
    NEW.delivery_fee,
    NEW.other_charges,
    COALESCE(jsonb_array_length(NEW.line_items), 0)
  )
  ON CONFLICT (source_invoice_id) DO UPDATE SET
    invoice_date_key = EXCLUDED.invoice_date_key,
    due_date_key     = EXCLUDED.due_date_key,
    vendor_key       = EXCLUDED.vendor_key,
    status           = EXCLUDED.status,
    payment_status   = EXCLUDED.payment_status,
    total_amount     = EXCLUDED.total_amount,
    subtotal         = EXCLUDED.subtotal,
    tax_amount       = EXCLUDED.tax_amount,
    fuel_surcharge   = EXCLUDED.fuel_surcharge,
    delivery_fee     = EXCLUDED.delivery_fee,
    other_charges    = EXCLUDED.other_charges,
    line_item_count  = EXCLUDED.line_item_count;

  RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_dim_date(date) TO authenticated, service_role;