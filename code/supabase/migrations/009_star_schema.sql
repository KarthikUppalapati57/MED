-- ============================================================
-- 009: MEVS STAR SCHEMA TRANSFORMATION
-- Adds dimension + fact tables for analytics/reporting
-- Existing operational tables remain UNTOUCHED
-- ============================================================

-- ============================================================
-- 1. DIMENSION: dim_date  (Calendar Dimension)
--    Pre-populated from 2020-01-01 to 2030-12-31
--    date_key uses YYYYMMDD integer format for fast joins
-- ============================================================
CREATE TABLE IF NOT EXISTS public.dim_date (
    date_key       INTEGER PRIMARY KEY,          -- YYYYMMDD format
    full_date      DATE NOT NULL UNIQUE,
    day_of_week    SMALLINT NOT NULL,             -- 0=Sun … 6=Sat (ISO)
    day_name       TEXT NOT NULL,
    day_of_month   SMALLINT NOT NULL,
    day_of_year    SMALLINT NOT NULL,
    week_of_year   SMALLINT NOT NULL,
    month_number   SMALLINT NOT NULL,
    month_name     TEXT NOT NULL,
    quarter        SMALLINT NOT NULL,
    year           SMALLINT NOT NULL,
    is_weekend     BOOLEAN NOT NULL,
    is_month_end   BOOLEAN NOT NULL,
    fiscal_quarter TEXT NOT NULL                  -- e.g. 'FY2025-Q3'
);

-- Populate dim_date (2020-01-01  →  2030-12-31)
INSERT INTO public.dim_date (
    date_key, full_date,
    day_of_week, day_name, day_of_month, day_of_year, week_of_year,
    month_number, month_name, quarter, year,
    is_weekend, is_month_end, fiscal_quarter
)
SELECT
    TO_CHAR(d, 'YYYYMMDD')::INTEGER                       AS date_key,
    d                                                       AS full_date,
    EXTRACT(DOW FROM d)::SMALLINT                           AS day_of_week,
    TO_CHAR(d, 'Day')                                       AS day_name,
    EXTRACT(DAY FROM d)::SMALLINT                           AS day_of_month,
    EXTRACT(DOY FROM d)::SMALLINT                           AS day_of_year,
    EXTRACT(WEEK FROM d)::SMALLINT                          AS week_of_year,
    EXTRACT(MONTH FROM d)::SMALLINT                         AS month_number,
    TO_CHAR(d, 'Month')                                     AS month_name,
    EXTRACT(QUARTER FROM d)::SMALLINT                       AS quarter,
    EXTRACT(YEAR FROM d)::SMALLINT                          AS year,
    EXTRACT(DOW FROM d) IN (0, 6)                           AS is_weekend,
    d = (DATE_TRUNC('month', d) + INTERVAL '1 month - 1 day')::DATE AS is_month_end,
    'FY' || EXTRACT(YEAR FROM d)::TEXT || '-Q' || EXTRACT(QUARTER FROM d)::TEXT AS fiscal_quarter
FROM generate_series('2020-01-01'::DATE, '2030-12-31'::DATE, '1 day'::INTERVAL) AS d
ON CONFLICT (date_key) DO NOTHING;

-- Helper: convert a DATE to its date_key
CREATE OR REPLACE FUNCTION public.date_to_key(d DATE)
RETURNS INTEGER AS $$
    SELECT CASE WHEN d IS NULL THEN NULL
           ELSE TO_CHAR(d, 'YYYYMMDD')::INTEGER END;
$$ LANGUAGE sql IMMUTABLE;


-- ============================================================
-- 2. DIMENSION: dim_vendor
-- ============================================================
CREATE TABLE IF NOT EXISTS public.dim_vendor (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_vendor_id UUID UNIQUE,                -- FK back to vendors.id
    name            TEXT NOT NULL,
    email           TEXT,
    status          TEXT,
    organization_id UUID REFERENCES public.organizations(id),
    location_id     UUID REFERENCES public.locations(id),
    valid_from      TIMESTAMPTZ DEFAULT now(),
    valid_to        TIMESTAMPTZ,
    is_current      BOOLEAN DEFAULT true
);

-- ============================================================
-- 3. DIMENSION: dim_product
-- ============================================================
CREATE TABLE IF NOT EXISTS public.dim_product (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_product_id   UUID UNIQUE,             -- FK back to products.id (uuid)
    product_code        TEXT,                     -- products.product_id (text code)
    name                TEXT NOT NULL,
    category            TEXT,
    latest_price        NUMERIC(12,2),
    organization_id     UUID REFERENCES public.organizations(id),
    location_id         UUID REFERENCES public.locations(id),
    valid_from          TIMESTAMPTZ DEFAULT now(),
    valid_to            TIMESTAMPTZ,
    is_current          BOOLEAN DEFAULT true
);

-- ============================================================
-- 4. DIMENSION: dim_user
-- ============================================================
CREATE TABLE IF NOT EXISTS public.dim_user (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_user_id  UUID UNIQUE,                 -- FK back to profiles.id
    full_name       TEXT,
    email           TEXT,
    role            TEXT,
    organization_id UUID REFERENCES public.organizations(id),
    valid_from      TIMESTAMPTZ DEFAULT now(),
    valid_to        TIMESTAMPTZ,
    is_current      BOOLEAN DEFAULT true
);


-- ============================================================
-- 5. FACT: fact_invoices
-- ============================================================
CREATE TABLE IF NOT EXISTS public.fact_invoices (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_invoice_id UUID UNIQUE,               -- FK back to invoices.id
    invoice_date_key  INTEGER REFERENCES public.dim_date(date_key),
    due_date_key      INTEGER REFERENCES public.dim_date(date_key),
    vendor_key        UUID REFERENCES public.dim_vendor(id),
    created_by_key    UUID REFERENCES public.dim_user(id),
    organization_id   UUID REFERENCES public.organizations(id),
    location_id       UUID REFERENCES public.locations(id),
    invoice_number    TEXT,
    status            TEXT,
    payment_status    TEXT,
    source            TEXT,
    total_amount      NUMERIC(12,2),
    subtotal          NUMERIC(12,2),
    tax_amount        NUMERIC(10,2),
    fuel_surcharge    NUMERIC(10,2),
    delivery_fee      NUMERIC(10,2),
    other_charges     NUMERIC(10,2),
    line_item_count   INTEGER DEFAULT 0,
    created_at        TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 6. FACT: fact_payments
-- ============================================================
CREATE TABLE IF NOT EXISTS public.fact_payments (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_payment_id UUID UNIQUE,
    payment_date_key  INTEGER REFERENCES public.dim_date(date_key),
    due_date_key      INTEGER REFERENCES public.dim_date(date_key),
    vendor_key        UUID REFERENCES public.dim_vendor(id),
    invoice_id        UUID,                      -- reference back to source
    created_by_key    UUID REFERENCES public.dim_user(id),
    organization_id   UUID REFERENCES public.organizations(id),
    amount            NUMERIC(12,2),
    payment_method    TEXT,
    status            TEXT,
    created_at        TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 7. FACT: fact_inventory
-- ============================================================
CREATE TABLE IF NOT EXISTS public.fact_inventory (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_inventory_id UUID UNIQUE,
    snapshot_date_key INTEGER REFERENCES public.dim_date(date_key),
    product_key       UUID REFERENCES public.dim_product(id),
    organization_id   UUID REFERENCES public.organizations(id),
    location_id       UUID REFERENCES public.locations(id),
    location_name     TEXT,
    current_quantity  NUMERIC(10,2),
    current_value     NUMERIC(12,2),
    unit_cost         NUMERIC(10,2),
    par_level         NUMERIC(10,2),
    reorder_point     NUMERIC(10,2),
    created_at        TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 8. FACT: fact_wastage
-- ============================================================
CREATE TABLE IF NOT EXISTS public.fact_wastage (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_wastage_id UUID UNIQUE,
    wastage_date_key  INTEGER REFERENCES public.dim_date(date_key),
    product_key       UUID REFERENCES public.dim_product(id),
    organization_id   UUID REFERENCES public.organizations(id),
    location_id       UUID REFERENCES public.locations(id),
    logged_by_key     UUID REFERENCES public.dim_user(id),
    quantity          NUMERIC(10,2),
    unit              TEXT,
    value             NUMERIC(10,2),
    reason            TEXT,
    created_at        TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 9. FACT: fact_orders
-- ============================================================
CREATE TABLE IF NOT EXISTS public.fact_orders (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_order_id   UUID UNIQUE,
    order_date_key    INTEGER REFERENCES public.dim_date(date_key),
    delivery_date_key INTEGER REFERENCES public.dim_date(date_key),
    vendor_key        UUID REFERENCES public.dim_vendor(id),
    created_by_key    UUID REFERENCES public.dim_user(id),
    approved_by_key   UUID REFERENCES public.dim_user(id),
    organization_id   UUID REFERENCES public.organizations(id),
    order_number      TEXT,
    status            TEXT,
    total_amount      NUMERIC(12,2),
    item_count        INTEGER DEFAULT 0,
    created_at        TIMESTAMPTZ DEFAULT now()
);


-- ============================================================
-- 10. INITIAL DATA LOAD — Dimensions
-- ============================================================

-- Load dim_vendor from vendors
INSERT INTO public.dim_vendor (source_vendor_id, name, email, status, organization_id, location_id)
SELECT id, name, email, status, organization_id, location_id
FROM public.vendors
ON CONFLICT (source_vendor_id) DO UPDATE SET
    name = EXCLUDED.name,
    email = EXCLUDED.email,
    status = EXCLUDED.status,
    location_id = EXCLUDED.location_id;

-- Load dim_product from products
INSERT INTO public.dim_product (source_product_id, product_code, name, category, latest_price, organization_id, location_id)
SELECT id, product_id, name, category, latest_price, organization_id, location_id
FROM public.products
ON CONFLICT (source_product_id) DO UPDATE SET
    product_code = EXCLUDED.product_code,
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    latest_price = EXCLUDED.latest_price,
    location_id = EXCLUDED.location_id;

-- Load dim_user from profiles
INSERT INTO public.dim_user (source_user_id, full_name, email, role, organization_id)
SELECT id, full_name, email, role, organization_id
FROM public.profiles
ON CONFLICT (source_user_id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    email = EXCLUDED.email,
    role = EXCLUDED.role;


-- ============================================================
-- 11. INITIAL DATA LOAD — Facts
-- ============================================================

-- fact_invoices
INSERT INTO public.fact_invoices (
    source_invoice_id, invoice_date_key, due_date_key,
    vendor_key, created_by_key,
    organization_id, location_id, invoice_number,
    status, payment_status, source,
    total_amount, subtotal, tax_amount,
    fuel_surcharge, delivery_fee, other_charges,
    line_item_count
)
SELECT
    i.id,
    public.date_to_key(i.invoice_date),
    public.date_to_key(i.due_date),
    dv.id,
    du.id,
    i.organization_id,
    i.location_id,
    i.invoice_number,
    i.status,
    i.payment_status,
    i.source,
    i.total_amount,
    i.subtotal,
    i.tax_amount,
    i.fuel_surcharge,
    i.delivery_fee,
    i.other_charges,
    COALESCE(jsonb_array_length(i.line_items), 0)
FROM public.invoices i
LEFT JOIN public.dim_vendor dv ON dv.source_vendor_id = i.vendor_id
LEFT JOIN public.dim_user du ON du.source_user_id = i.created_by
ON CONFLICT (source_invoice_id) DO NOTHING;

-- fact_payments
INSERT INTO public.fact_payments (
    source_payment_id, payment_date_key, due_date_key,
    vendor_key, invoice_id, created_by_key,
    organization_id, amount, payment_method, status
)
SELECT
    p.id,
    public.date_to_key(p.payment_date),
    public.date_to_key(p.due_date),
    dv.id,
    p.invoice_id,
    du.id,
    p.organization_id,
    p.amount,
    p.payment_method,
    p.status
FROM public.payments p
LEFT JOIN public.dim_vendor dv ON dv.source_vendor_id = p.vendor_id
LEFT JOIN public.dim_user du ON du.source_user_id = p.created_by
ON CONFLICT (source_payment_id) DO NOTHING;

-- fact_inventory
INSERT INTO public.fact_inventory (
    source_inventory_id, snapshot_date_key, product_key,
    organization_id, location_id, location_name,
    current_quantity, current_value, unit_cost,
    par_level, reorder_point
)
SELECT
    inv.id,
    public.date_to_key(COALESCE(inv.last_counted_date, inv.created_at::date)),
    dp.id,
    inv.organization_id,
    inv.location_id,
    inv.location,
    inv.current_quantity,
    NULL AS current_value,
    NULL AS unit_cost,
    NULL AS par_level,
    NULL AS reorder_point
FROM public.inventory inv
LEFT JOIN public.dim_product dp ON dp.product_code = inv.product_id
ON CONFLICT (source_inventory_id) DO NOTHING;

-- fact_wastage
INSERT INTO public.fact_wastage (
    source_wastage_id, wastage_date_key, product_key,
    organization_id, location_id, logged_by_key,
    quantity, unit, value, reason
)
SELECT
    w.id,
    public.date_to_key(w.created_at::date),
    dp.id,
    w.organization_id,
    w.location_id,
    du.id,
    w.quantity,
    w.unit,
    w.value,
    w.reason
FROM public.wastage_logs w
LEFT JOIN public.dim_product dp ON dp.product_code = w.product_id
LEFT JOIN public.dim_user du ON du.source_user_id = w.logged_by
ON CONFLICT (source_wastage_id) DO NOTHING;

-- fact_orders
INSERT INTO public.fact_orders (
    source_order_id, order_date_key, delivery_date_key,
    vendor_key, created_by_key, approved_by_key,
    organization_id, order_number, status,
    total_amount, item_count
)
SELECT
    ao.id,
    public.date_to_key(ao.created_at::date),
    public.date_to_key(ao.delivery_date),
    dv.id,
    du_created.id,
    du_approved.id,
    ao.organization_id,
    ao.order_number,
    ao.status,
    ao.total_amount,
    COALESCE(jsonb_array_length(ao.items), 0)
FROM public.auto_orders ao
LEFT JOIN public.dim_vendor dv ON dv.source_vendor_id = ao.vendor_id
LEFT JOIN public.dim_user du_created ON du_created.source_user_id = ao.created_by
LEFT JOIN public.dim_user du_approved ON du_approved.source_user_id = ao.approved_by
ON CONFLICT (source_order_id) DO NOTHING;


-- ============================================================
-- 12. SYNC TRIGGERS — Keep star schema in sync with OLTP
-- ============================================================

-- --- dim_vendor sync ---
CREATE OR REPLACE FUNCTION public.sync_dim_vendor()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.dim_vendor (source_vendor_id, name, email, status, organization_id, location_id)
    VALUES (NEW.id, NEW.name, NEW.email, NEW.status, NEW.organization_id, NEW.location_id)
    ON CONFLICT (source_vendor_id) DO UPDATE SET
        name = EXCLUDED.name,
        email = EXCLUDED.email,
        status = EXCLUDED.status,
        organization_id = EXCLUDED.organization_id,
        location_id = EXCLUDED.location_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sync_dim_vendor ON public.vendors;
CREATE TRIGGER trg_sync_dim_vendor
    AFTER INSERT OR UPDATE ON public.vendors
    FOR EACH ROW EXECUTE FUNCTION public.sync_dim_vendor();

-- --- dim_product sync ---
CREATE OR REPLACE FUNCTION public.sync_dim_product()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.dim_product (source_product_id, product_code, name, category, latest_price, organization_id, location_id)
    VALUES (NEW.id, NEW.product_id, NEW.name, NEW.category, NEW.latest_price, NEW.organization_id, NEW.location_id)
    ON CONFLICT (source_product_id) DO UPDATE SET
        product_code = EXCLUDED.product_code,
        name = EXCLUDED.name,
        category = EXCLUDED.category,
        latest_price = EXCLUDED.latest_price,
        organization_id = EXCLUDED.organization_id,
        location_id = EXCLUDED.location_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sync_dim_product ON public.products;
CREATE TRIGGER trg_sync_dim_product
    AFTER INSERT OR UPDATE ON public.products
    FOR EACH ROW EXECUTE FUNCTION public.sync_dim_product();

-- --- dim_user sync ---
CREATE OR REPLACE FUNCTION public.sync_dim_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.dim_user (source_user_id, full_name, email, role, organization_id)
    VALUES (NEW.id, NEW.full_name, NEW.email, NEW.role, NEW.organization_id)
    ON CONFLICT (source_user_id) DO UPDATE SET
        full_name = EXCLUDED.full_name,
        email = EXCLUDED.email,
        role = EXCLUDED.role,
        organization_id = EXCLUDED.organization_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sync_dim_user ON public.profiles;
CREATE TRIGGER trg_sync_dim_user
    AFTER INSERT OR UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.sync_dim_user();

-- --- fact_invoices sync ---
CREATE OR REPLACE FUNCTION public.sync_fact_invoices()
RETURNS TRIGGER AS $$
DECLARE
    v_vendor_key UUID;
    v_user_key UUID;
BEGIN
    SELECT id INTO v_vendor_key FROM public.dim_vendor WHERE source_vendor_id = NEW.vendor_id LIMIT 1;
    SELECT id INTO v_user_key FROM public.dim_user WHERE source_user_id = NEW.created_by LIMIT 1;

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
        public.date_to_key(NEW.invoice_date),
        public.date_to_key(NEW.due_date),
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sync_fact_invoices ON public.invoices;
CREATE TRIGGER trg_sync_fact_invoices
    AFTER INSERT OR UPDATE ON public.invoices
    FOR EACH ROW EXECUTE FUNCTION public.sync_fact_invoices();

-- --- fact_payments sync ---
CREATE OR REPLACE FUNCTION public.sync_fact_payments()
RETURNS TRIGGER AS $$
DECLARE
    v_vendor_key UUID;
    v_user_key UUID;
BEGIN
    SELECT id INTO v_vendor_key FROM public.dim_vendor WHERE source_vendor_id = NEW.vendor_id LIMIT 1;
    SELECT id INTO v_user_key FROM public.dim_user WHERE source_user_id = NEW.created_by LIMIT 1;

    INSERT INTO public.fact_payments (
        source_payment_id, payment_date_key, due_date_key,
        vendor_key, invoice_id, created_by_key,
        organization_id, amount, payment_method, status
    ) VALUES (
        NEW.id,
        public.date_to_key(NEW.payment_date),
        public.date_to_key(NEW.due_date),
        v_vendor_key,
        NEW.invoice_id,
        v_user_key,
        NEW.organization_id,
        NEW.amount,
        NEW.payment_method,
        NEW.status
    )
    ON CONFLICT (source_payment_id) DO UPDATE SET
        payment_date_key = EXCLUDED.payment_date_key,
        due_date_key     = EXCLUDED.due_date_key,
        vendor_key       = EXCLUDED.vendor_key,
        amount           = EXCLUDED.amount,
        payment_method   = EXCLUDED.payment_method,
        status           = EXCLUDED.status;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sync_fact_payments ON public.payments;
CREATE TRIGGER trg_sync_fact_payments
    AFTER INSERT OR UPDATE ON public.payments
    FOR EACH ROW EXECUTE FUNCTION public.sync_fact_payments();

-- --- fact_inventory sync ---
CREATE OR REPLACE FUNCTION public.sync_fact_inventory()
RETURNS TRIGGER AS $$
DECLARE
    v_product_key UUID;
BEGIN
    SELECT id INTO v_product_key FROM public.dim_product WHERE product_code = NEW.product_id LIMIT 1;

    INSERT INTO public.fact_inventory (
        source_inventory_id, snapshot_date_key, product_key,
        organization_id, location_id, location_name,
        current_quantity, current_value, unit_cost,
        par_level, reorder_point
    ) VALUES (
        NEW.id,
        public.date_to_key(COALESCE(NEW.last_counted_date, now()::date)),
        v_product_key,
        NEW.organization_id,
        NEW.location_id,
        NEW.location,
        NEW.current_quantity,
        NULL AS current_value,
        NULL AS unit_cost,
        NULL AS par_level,
        NULL AS reorder_point
    )
    ON CONFLICT (source_inventory_id) DO UPDATE SET
        snapshot_date_key = EXCLUDED.snapshot_date_key,
        product_key       = EXCLUDED.product_key,
        current_quantity  = EXCLUDED.current_quantity,
        current_value     = EXCLUDED.current_value,
        unit_cost         = EXCLUDED.unit_cost,
        par_level         = EXCLUDED.par_level,
        reorder_point     = EXCLUDED.reorder_point;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sync_fact_inventory ON public.inventory;
CREATE TRIGGER trg_sync_fact_inventory
    AFTER INSERT OR UPDATE ON public.inventory
    FOR EACH ROW EXECUTE FUNCTION public.sync_fact_inventory();

-- --- fact_wastage sync ---
CREATE OR REPLACE FUNCTION public.sync_fact_wastage()
RETURNS TRIGGER AS $$
DECLARE
    v_product_key UUID;
    v_user_key UUID;
BEGIN
    SELECT id INTO v_product_key FROM public.dim_product WHERE product_code = NEW.product_id LIMIT 1;
    SELECT id INTO v_user_key FROM public.dim_user WHERE source_user_id = NEW.logged_by LIMIT 1;

    INSERT INTO public.fact_wastage (
        source_wastage_id, wastage_date_key, product_key,
        organization_id, location_id, logged_by_key,
        quantity, unit, value, reason
    ) VALUES (
        NEW.id,
        public.date_to_key(NEW.created_at::date),
        v_product_key,
        NEW.organization_id,
        NEW.location_id,
        v_user_key,
        NEW.quantity,
        NEW.unit,
        NEW.value,
        NEW.reason
    )
    ON CONFLICT (source_wastage_id) DO UPDATE SET
        wastage_date_key = EXCLUDED.wastage_date_key,
        product_key      = EXCLUDED.product_key,
        quantity         = EXCLUDED.quantity,
        value            = EXCLUDED.value,
        reason           = EXCLUDED.reason;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sync_fact_wastage ON public.wastage_logs;
CREATE TRIGGER trg_sync_fact_wastage
    AFTER INSERT OR UPDATE ON public.wastage_logs
    FOR EACH ROW EXECUTE FUNCTION public.sync_fact_wastage();

-- --- fact_orders sync ---
CREATE OR REPLACE FUNCTION public.sync_fact_orders()
RETURNS TRIGGER AS $$
DECLARE
    v_vendor_key UUID;
    v_created_key UUID;
    v_approved_key UUID;
BEGIN
    SELECT id INTO v_vendor_key FROM public.dim_vendor WHERE source_vendor_id = NEW.vendor_id LIMIT 1;
    SELECT id INTO v_created_key FROM public.dim_user WHERE source_user_id = NEW.created_by LIMIT 1;
    SELECT id INTO v_approved_key FROM public.dim_user WHERE source_user_id = NEW.approved_by LIMIT 1;

    INSERT INTO public.fact_orders (
        source_order_id, order_date_key, delivery_date_key,
        vendor_key, created_by_key, approved_by_key,
        organization_id, order_number, status,
        total_amount, item_count
    ) VALUES (
        NEW.id,
        public.date_to_key(NEW.created_at::date),
        public.date_to_key(NEW.delivery_date),
        v_vendor_key,
        v_created_key,
        v_approved_key,
        NEW.organization_id,
        NEW.order_number,
        NEW.status,
        NEW.total_amount,
        COALESCE(jsonb_array_length(NEW.items), 0)
    )
    ON CONFLICT (source_order_id) DO UPDATE SET
        delivery_date_key = EXCLUDED.delivery_date_key,
        vendor_key        = EXCLUDED.vendor_key,
        approved_by_key   = EXCLUDED.approved_by_key,
        status            = EXCLUDED.status,
        total_amount      = EXCLUDED.total_amount,
        item_count        = EXCLUDED.item_count;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sync_fact_orders ON public.auto_orders;
CREATE TRIGGER trg_sync_fact_orders
    AFTER INSERT OR UPDATE ON public.auto_orders
    FOR EACH ROW EXECUTE FUNCTION public.sync_fact_orders();


-- ============================================================
-- 13. ROW LEVEL SECURITY on Star Schema Tables
-- ============================================================
ALTER TABLE public.dim_date ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dim_vendor ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dim_product ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dim_user ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fact_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fact_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fact_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fact_wastage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fact_orders ENABLE ROW LEVEL SECURITY;

-- dim_date is shared / public — everyone can read it
DROP POLICY IF EXISTS "dim_date_read_all" ON public.dim_date;
CREATE POLICY "dim_date_read_all" ON public.dim_date FOR SELECT USING (true);

-- Dimension + Fact tables: tenant isolation via organization_id
DO $$
DECLARE
    t TEXT;
BEGIN
    FOR t IN SELECT unnest(ARRAY[
        'dim_vendor', 'dim_product', 'dim_user',
        'fact_invoices', 'fact_payments', 'fact_inventory', 'fact_wastage', 'fact_orders'
    ])
    LOOP
        -- Platform admin full access
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'star_platform_admin_' || t, t);
        EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL USING (
            (auth.jwt() -> ''user_metadata'' ->> ''role'' = ''platform_admin'')
        )', 'star_platform_admin_' || t, t);

        -- Tenant isolation
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'star_tenant_isolation_' || t, t);
        EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (
            organization_id = (auth.jwt() -> ''user_metadata'' ->> ''organization_id'')::uuid
        )', 'star_tenant_isolation_' || t, t);
    END LOOP;
END $$;


-- ============================================================
-- 14. PERFORMANCE INDEXES on Fact Tables
-- ============================================================

-- fact_invoices
CREATE INDEX IF NOT EXISTS idx_fact_inv_date      ON public.fact_invoices(invoice_date_key);
CREATE INDEX IF NOT EXISTS idx_fact_inv_due        ON public.fact_invoices(due_date_key);
CREATE INDEX IF NOT EXISTS idx_fact_inv_vendor     ON public.fact_invoices(vendor_key);
CREATE INDEX IF NOT EXISTS idx_fact_inv_user       ON public.fact_invoices(created_by_key);
CREATE INDEX IF NOT EXISTS idx_fact_inv_org        ON public.fact_invoices(organization_id);
CREATE INDEX IF NOT EXISTS idx_fact_inv_status     ON public.fact_invoices(status);

-- fact_payments
CREATE INDEX IF NOT EXISTS idx_fact_pay_date       ON public.fact_payments(payment_date_key);
CREATE INDEX IF NOT EXISTS idx_fact_pay_vendor     ON public.fact_payments(vendor_key);
CREATE INDEX IF NOT EXISTS idx_fact_pay_org        ON public.fact_payments(organization_id);
CREATE INDEX IF NOT EXISTS idx_fact_pay_status     ON public.fact_payments(status);

-- fact_inventory
CREATE INDEX IF NOT EXISTS idx_fact_inv_snap_date  ON public.fact_inventory(snapshot_date_key);
CREATE INDEX IF NOT EXISTS idx_fact_inv_product    ON public.fact_inventory(product_key);
CREATE INDEX IF NOT EXISTS idx_fact_inv_org2       ON public.fact_inventory(organization_id);

-- fact_wastage
CREATE INDEX IF NOT EXISTS idx_fact_wst_date       ON public.fact_wastage(wastage_date_key);
CREATE INDEX IF NOT EXISTS idx_fact_wst_product    ON public.fact_wastage(product_key);
CREATE INDEX IF NOT EXISTS idx_fact_wst_org        ON public.fact_wastage(organization_id);

-- fact_orders
CREATE INDEX IF NOT EXISTS idx_fact_ord_date       ON public.fact_orders(order_date_key);
CREATE INDEX IF NOT EXISTS idx_fact_ord_vendor     ON public.fact_orders(vendor_key);
CREATE INDEX IF NOT EXISTS idx_fact_ord_org        ON public.fact_orders(organization_id);
CREATE INDEX IF NOT EXISTS idx_fact_ord_status     ON public.fact_orders(status);

-- Dimension lookups
CREATE INDEX IF NOT EXISTS idx_dim_vendor_org      ON public.dim_vendor(organization_id);
CREATE INDEX IF NOT EXISTS idx_dim_product_org     ON public.dim_product(organization_id);
CREATE INDEX IF NOT EXISTS idx_dim_user_org        ON public.dim_user(organization_id);
CREATE INDEX IF NOT EXISTS idx_dim_date_year_month ON public.dim_date(year, month_number);


-- ============================================================
-- 15. SAMPLE ANALYTICAL VIEWS
-- ============================================================

-- Monthly spend by vendor
CREATE OR REPLACE VIEW public.v_monthly_spend_by_vendor AS
SELECT
    d.year,
    d.month_number,
    d.month_name,
    v.name AS vendor_name,
    COUNT(f.id) AS invoice_count,
    SUM(f.total_amount) AS total_spend,
    AVG(f.total_amount) AS avg_invoice_amount
FROM public.fact_invoices f
JOIN public.dim_date d ON f.invoice_date_key = d.date_key
JOIN public.dim_vendor v ON f.vendor_key = v.id
GROUP BY d.year, d.month_number, d.month_name, v.name;

-- Monthly wastage summary
CREATE OR REPLACE VIEW public.v_monthly_wastage AS
SELECT
    d.year,
    d.month_number,
    d.month_name,
    p.name AS product_name,
    p.category,
    SUM(w.quantity) AS total_quantity,
    SUM(w.value) AS total_value,
    w.reason
FROM public.fact_wastage w
JOIN public.dim_date d ON w.wastage_date_key = d.date_key
JOIN public.dim_product p ON w.product_key = p.id
GROUP BY d.year, d.month_number, d.month_name, p.name, p.category, w.reason;

-- Payment aging
CREATE OR REPLACE VIEW public.v_payment_status_summary AS
SELECT
    d.year,
    d.quarter,
    d.fiscal_quarter,
    fp.status,
    fp.payment_method,
    COUNT(fp.id) AS payment_count,
    SUM(fp.amount) AS total_amount
FROM public.fact_payments fp
JOIN public.dim_date d ON fp.payment_date_key = d.date_key
GROUP BY d.year, d.quarter, d.fiscal_quarter, fp.status, fp.payment_method;

-- Grant access to views
GRANT SELECT ON public.v_monthly_spend_by_vendor TO authenticated;
GRANT SELECT ON public.v_monthly_wastage TO authenticated;
GRANT SELECT ON public.v_payment_status_summary TO authenticated;


-- ============================================================
-- DONE! Star schema tables, triggers, RLS, and indexes deployed.
-- ============================================================
