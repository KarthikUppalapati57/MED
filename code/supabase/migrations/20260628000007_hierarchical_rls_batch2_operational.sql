BEGIN;

-- Step A: publish honest generic tenant helpers and keep compatibility wrappers.
CREATE OR REPLACE FUNCTION public.tenant_scope_visible(
  p_organization_id uuid,
  p_brand_id uuid DEFAULT NULL,
  p_location_id uuid DEFAULT NULL,
  p_deleted_at timestamp with time zone DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_org_id uuid;
BEGIN
  IF p_deleted_at IS NOT NULL THEN
    RETURN false;
  END IF;

  IF auth.role() = 'service_role' THEN
    RETURN true;
  END IF;

  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  SELECT role, organization_id
    INTO v_role, v_org_id
  FROM public.profiles
  WHERE id = auth.uid()
    AND deleted_at IS NULL;

  IF v_role IS NULL THEN
    RETURN false;
  END IF;

  IF v_role = 'platform_admin' THEN
    RETURN true;
  END IF;

  IF p_organization_id IS NULL OR v_org_id IS DISTINCT FROM p_organization_id THEN
    RETURN false;
  END IF;

  IF v_role = 'org_owner' THEN
    RETURN true;
  END IF;

  IF p_brand_id IS NULL AND p_location_id IS NULL THEN
    RETURN false;
  END IF;

  IF v_role = 'branch_manager' THEN
    RETURN (
      p_brand_id IN (SELECT id FROM public.get_my_accessible_brand_ids() id)
      OR p_location_id IN (SELECT id FROM public.get_my_accessible_location_ids() id)
    );
  END IF;

  IF v_role = 'location_manager' THEN
    RETURN p_location_id IN (SELECT id FROM public.get_my_accessible_location_ids() id);
  END IF;

  IF v_role = 'ground_staff' THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.organization_id = p_organization_id
        AND p.location_id = p_location_id
        AND (
          p_brand_id IS NULL
          OR p.brand_id IS NULL
          OR p.brand_id = p_brand_id
        )
        AND p.deleted_at IS NULL
    );
  END IF;

  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.tenant_scope_writable(
  p_organization_id uuid,
  p_brand_id uuid DEFAULT NULL,
  p_location_id uuid DEFAULT NULL,
  p_deleted_at timestamp with time zone DEFAULT NULL,
  p_allow_ground_staff boolean DEFAULT false
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN true;
  END IF;

  v_role := public.get_auth_role();

  IF v_role = 'ground_staff' AND NOT p_allow_ground_staff THEN
    RETURN false;
  END IF;

  IF v_role NOT IN ('ground_staff', 'location_manager', 'branch_manager', 'org_owner', 'platform_admin') THEN
    RETURN false;
  END IF;

  RETURN public.tenant_scope_visible(
    p_organization_id,
    p_brand_id,
    p_location_id,
    p_deleted_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.financial_scope_visible(
  p_organization_id uuid,
  p_brand_id uuid DEFAULT NULL,
  p_location_id uuid DEFAULT NULL,
  p_deleted_at timestamp with time zone DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.tenant_scope_visible(p_organization_id, p_brand_id, p_location_id, p_deleted_at);
$$;

CREATE OR REPLACE FUNCTION public.financial_scope_writable(
  p_organization_id uuid,
  p_brand_id uuid DEFAULT NULL,
  p_location_id uuid DEFAULT NULL,
  p_deleted_at timestamp with time zone DEFAULT NULL,
  p_allow_ground_staff boolean DEFAULT false
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.tenant_scope_writable(p_organization_id, p_brand_id, p_location_id, p_deleted_at, p_allow_ground_staff);
$$;

CREATE OR REPLACE FUNCTION public.invoice_visible(p_invoice_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.invoices i
    WHERE i.id = p_invoice_id
      AND public.tenant_scope_visible(
        i.organization_id,
        i.brand_id,
        i.location_id,
        i.deleted_at
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.invoice_writable(
  p_invoice_id uuid,
  p_allow_ground_staff boolean DEFAULT false
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.invoices i
    WHERE i.id = p_invoice_id
      AND public.tenant_scope_writable(
        i.organization_id,
        i.brand_id,
        i.location_id,
        i.deleted_at,
        p_allow_ground_staff
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.invoice_child_visible(
  p_organization_id uuid,
  p_invoice_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_invoice_id IS NOT NULL THEN public.invoice_visible(p_invoice_id)
    ELSE public.tenant_scope_visible(p_organization_id, NULL, NULL, NULL)
  END;
$$;

CREATE OR REPLACE FUNCTION public.invoice_child_writable(
  p_organization_id uuid,
  p_invoice_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_invoice_id IS NOT NULL THEN public.invoice_writable(p_invoice_id, false)
    ELSE public.tenant_scope_writable(p_organization_id, NULL, NULL, NULL, false)
  END;
$$;

CREATE OR REPLACE FUNCTION public.ledger_payment_visible(
  p_organization_id uuid,
  p_bill_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_bill_id IS NOT NULL THEN EXISTS (
      SELECT 1
      FROM public.ledger_bills lb
      WHERE lb.id = p_bill_id
        AND lb.deleted_at IS NULL
        AND public.invoice_child_visible(lb.organization_id, lb.invoice_id)
    )
    ELSE public.tenant_scope_visible(p_organization_id, NULL, NULL, NULL)
  END;
$$;

CREATE OR REPLACE FUNCTION public.ledger_payment_writable(
  p_organization_id uuid,
  p_bill_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_bill_id IS NOT NULL THEN EXISTS (
      SELECT 1
      FROM public.ledger_bills lb
      WHERE lb.id = p_bill_id
        AND lb.deleted_at IS NULL
        AND public.invoice_child_writable(lb.organization_id, lb.invoice_id)
    )
    ELSE public.tenant_scope_writable(p_organization_id, NULL, NULL, NULL, false)
  END;
$$;

-- Step B: hybrid reference-data scope for vendors/products/recipes.
CREATE OR REPLACE FUNCTION public.reference_scope_visible(
  p_organization_id uuid,
  p_brand_id uuid DEFAULT NULL,
  p_location_id uuid DEFAULT NULL,
  p_deleted_at timestamp with time zone DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_org_id uuid;
BEGIN
  IF p_deleted_at IS NOT NULL THEN
    RETURN false;
  END IF;

  IF auth.role() = 'service_role' THEN
    RETURN true;
  END IF;

  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  SELECT role, organization_id
    INTO v_role, v_org_id
  FROM public.profiles
  WHERE id = auth.uid()
    AND deleted_at IS NULL;

  IF v_role IS NULL THEN
    RETURN false;
  END IF;

  IF v_role = 'platform_admin' THEN
    RETURN true;
  END IF;

  IF p_organization_id IS NULL OR v_org_id IS DISTINCT FROM p_organization_id THEN
    RETURN false;
  END IF;

  IF v_role = 'org_owner' THEN
    RETURN true;
  END IF;

  IF p_location_id IS NOT NULL THEN
    RETURN p_location_id IN (SELECT id FROM public.get_my_accessible_location_ids() id);
  END IF;

  IF p_brand_id IS NOT NULL THEN
    RETURN p_brand_id IN (SELECT id FROM public.get_my_accessible_brand_ids() id);
  END IF;

  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.reference_scope_writable(
  p_organization_id uuid,
  p_brand_id uuid DEFAULT NULL,
  p_location_id uuid DEFAULT NULL,
  p_deleted_at timestamp with time zone DEFAULT NULL,
  p_role_required text DEFAULT 'location_manager'
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN true;
  END IF;

  IF p_deleted_at IS NOT NULL THEN
    RETURN false;
  END IF;

  v_role := public.get_auth_role();

  IF v_role = 'platform_admin' THEN
    RETURN true;
  END IF;

  IF p_organization_id IS DISTINCT FROM public.get_auth_org() THEN
    RETURN false;
  END IF;

  IF p_location_id IS NOT NULL THEN
    IF v_role NOT IN ('location_manager', 'branch_manager', 'org_owner') THEN
      RETURN false;
    END IF;

    IF p_role_required = 'branch_manager' AND v_role = 'location_manager' THEN
      RETURN false;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.locations l
      WHERE l.id = p_location_id
        AND l.organization_id = p_organization_id
        AND (p_brand_id IS NULL OR l.brand_id = p_brand_id)
    ) THEN
      RETURN false;
    END IF;

    RETURN p_location_id IN (SELECT id FROM public.get_my_accessible_location_ids() id);
  END IF;

  IF p_brand_id IS NOT NULL THEN
    IF v_role NOT IN ('branch_manager', 'org_owner') THEN
      RETURN false;
    END IF;

    RETURN p_brand_id IN (SELECT id FROM public.get_my_accessible_brand_ids() id);
  END IF;

  RETURN false;
END;
$$;

-- Step A continued: update Batch 1 policies to tenant_scope_* names.
DROP POLICY IF EXISTS financial_invoices_select ON public.invoices;
DROP POLICY IF EXISTS financial_invoices_insert ON public.invoices;
DROP POLICY IF EXISTS financial_invoices_update ON public.invoices;
DROP POLICY IF EXISTS financial_payments_select ON public.payments;
DROP POLICY IF EXISTS financial_payments_insert ON public.payments;
DROP POLICY IF EXISTS financial_payments_update ON public.payments;
DROP POLICY IF EXISTS financial_invoice_allocations_select ON public.invoice_allocations;
DROP POLICY IF EXISTS financial_invoice_allocations_insert ON public.invoice_allocations;
DROP POLICY IF EXISTS financial_invoice_allocations_update ON public.invoice_allocations;
DROP POLICY IF EXISTS financial_credit_requests_select ON public.credit_requests;
DROP POLICY IF EXISTS financial_credit_requests_insert ON public.credit_requests;
DROP POLICY IF EXISTS financial_credit_requests_update ON public.credit_requests;
DROP POLICY IF EXISTS financial_ledger_entries_select ON public.ledger_entries;
DROP POLICY IF EXISTS financial_ledger_entries_insert ON public.ledger_entries;

CREATE POLICY financial_invoices_select ON public.invoices
  FOR SELECT
  USING (public.tenant_scope_visible(organization_id, brand_id, location_id, deleted_at));

CREATE POLICY financial_invoices_insert ON public.invoices
  FOR INSERT
  WITH CHECK (
    organization_id = public.get_auth_org()
    AND created_by = auth.uid()
    AND public.tenant_scope_writable(organization_id, brand_id, location_id, NULL, true)
  );

CREATE POLICY financial_invoices_update ON public.invoices
  FOR UPDATE
  USING (public.tenant_scope_writable(organization_id, brand_id, location_id, deleted_at, false))
  WITH CHECK (public.tenant_scope_writable(organization_id, brand_id, location_id, deleted_at, false));

CREATE POLICY financial_payments_select ON public.payments
  FOR SELECT
  USING (public.tenant_scope_visible(organization_id, brand_id, location_id, deleted_at));

CREATE POLICY financial_payments_insert ON public.payments
  FOR INSERT
  WITH CHECK (public.tenant_scope_writable(organization_id, brand_id, location_id, deleted_at, false));

CREATE POLICY financial_payments_update ON public.payments
  FOR UPDATE
  USING (public.tenant_scope_writable(organization_id, brand_id, location_id, deleted_at, false))
  WITH CHECK (public.tenant_scope_writable(organization_id, brand_id, location_id, deleted_at, false));

CREATE POLICY financial_invoice_allocations_select ON public.invoice_allocations
  FOR SELECT
  USING (public.tenant_scope_visible(organization_id, NULL, location_id, NULL));

CREATE POLICY financial_invoice_allocations_insert ON public.invoice_allocations
  FOR INSERT
  WITH CHECK (public.tenant_scope_writable(organization_id, NULL, location_id, NULL, false));

CREATE POLICY financial_invoice_allocations_update ON public.invoice_allocations
  FOR UPDATE
  USING (public.tenant_scope_writable(organization_id, NULL, location_id, NULL, false))
  WITH CHECK (public.tenant_scope_writable(organization_id, NULL, location_id, NULL, false));

CREATE POLICY financial_credit_requests_select ON public.credit_requests
  FOR SELECT
  USING (public.tenant_scope_visible(organization_id, NULL, location_id, NULL));

CREATE POLICY financial_credit_requests_insert ON public.credit_requests
  FOR INSERT
  WITH CHECK (public.tenant_scope_writable(organization_id, NULL, location_id, NULL, true));

CREATE POLICY financial_credit_requests_update ON public.credit_requests
  FOR UPDATE
  USING (public.tenant_scope_writable(organization_id, NULL, location_id, NULL, false))
  WITH CHECK (public.tenant_scope_writable(organization_id, NULL, location_id, NULL, false));

CREATE POLICY financial_ledger_entries_select ON public.ledger_entries
  FOR SELECT
  USING (public.tenant_scope_visible(organization_id, NULL, NULL, NULL));

CREATE POLICY financial_ledger_entries_insert ON public.ledger_entries
  FOR INSERT
  WITH CHECK (public.tenant_scope_writable(organization_id, NULL, NULL, NULL, false));

-- Step C: replace stale operational policies.
DROP POLICY IF EXISTS "RLS_SaaS_Isolation_auto_orders" ON public.auto_orders;
DROP POLICY IF EXISTS RLS_SaaS_Isolation_auto_orders ON public.auto_orders;
DROP POLICY IF EXISTS operational_auto_orders_select ON public.auto_orders;
DROP POLICY IF EXISTS operational_auto_orders_insert ON public.auto_orders;
DROP POLICY IF EXISTS operational_auto_orders_update ON public.auto_orders;
DROP POLICY IF EXISTS "RLS_SaaS_Isolation_inventory" ON public.inventory;
DROP POLICY IF EXISTS RLS_SaaS_Isolation_inventory ON public.inventory;
DROP POLICY IF EXISTS "Users can view inventory" ON public.inventory;
DROP POLICY IF EXISTS operational_inventory_select ON public.inventory;
DROP POLICY IF EXISTS operational_inventory_insert ON public.inventory;
DROP POLICY IF EXISTS operational_inventory_update ON public.inventory;
DROP POLICY IF EXISTS "Manager+ can manage inventory movements" ON public.inventory_movements;
DROP POLICY IF EXISTS "Users can view inventory movements" ON public.inventory_movements;
DROP POLICY IF EXISTS operational_inventory_movements_select ON public.inventory_movements;
DROP POLICY IF EXISTS operational_inventory_movements_insert ON public.inventory_movements;
DROP POLICY IF EXISTS operational_inventory_movements_update ON public.inventory_movements;
DROP POLICY IF EXISTS "RLS_SaaS_Isolation_products" ON public.products;
DROP POLICY IF EXISTS RLS_SaaS_Isolation_products ON public.products;
DROP POLICY IF EXISTS "Users can view products" ON public.products;
DROP POLICY IF EXISTS operational_products_select ON public.products;
DROP POLICY IF EXISTS operational_products_insert ON public.products;
DROP POLICY IF EXISTS operational_products_update ON public.products;
DROP POLICY IF EXISTS "Manager+ can manage purchase orders" ON public.purchase_orders;
DROP POLICY IF EXISTS "Users can view purchase orders" ON public.purchase_orders;
DROP POLICY IF EXISTS operational_purchase_orders_select ON public.purchase_orders;
DROP POLICY IF EXISTS operational_purchase_orders_insert ON public.purchase_orders;
DROP POLICY IF EXISTS operational_purchase_orders_update ON public.purchase_orders;
DROP POLICY IF EXISTS "RLS_SaaS_Isolation_recipes" ON public.recipes;
DROP POLICY IF EXISTS RLS_SaaS_Isolation_recipes ON public.recipes;
DROP POLICY IF EXISTS "Users can view recipes" ON public.recipes;
DROP POLICY IF EXISTS operational_recipes_select ON public.recipes;
DROP POLICY IF EXISTS operational_recipes_insert ON public.recipes;
DROP POLICY IF EXISTS operational_recipes_update ON public.recipes;
DROP POLICY IF EXISTS "RLS_SaaS_Isolation_vendors" ON public.vendors;
DROP POLICY IF EXISTS RLS_SaaS_Isolation_vendors ON public.vendors;
DROP POLICY IF EXISTS "Users can view vendors in their organization" ON public.vendors;
DROP POLICY IF EXISTS "Users can update vendors in their organization" ON public.vendors;
DROP POLICY IF EXISTS operational_vendors_select ON public.vendors;
DROP POLICY IF EXISTS operational_vendors_insert ON public.vendors;
DROP POLICY IF EXISTS operational_vendors_update ON public.vendors;
DROP POLICY IF EXISTS "RLS_SaaS_Isolation_wastage_logs" ON public.wastage_logs;
DROP POLICY IF EXISTS RLS_SaaS_Isolation_wastage_logs ON public.wastage_logs;
DROP POLICY IF EXISTS operational_wastage_logs_select ON public.wastage_logs;
DROP POLICY IF EXISTS operational_wastage_logs_insert ON public.wastage_logs;
DROP POLICY IF EXISTS operational_wastage_logs_update ON public.wastage_logs;

CREATE POLICY operational_vendors_select ON public.vendors
  FOR SELECT
  USING (public.reference_scope_visible(organization_id, brand_id, location_id, NULL));

CREATE POLICY operational_vendors_insert ON public.vendors
  FOR INSERT
  WITH CHECK (public.reference_scope_writable(organization_id, brand_id, location_id, NULL, 'location_manager'));

CREATE POLICY operational_vendors_update ON public.vendors
  FOR UPDATE
  USING (public.reference_scope_writable(organization_id, brand_id, location_id, NULL, 'location_manager'))
  WITH CHECK (public.reference_scope_writable(organization_id, brand_id, location_id, NULL, 'location_manager'));

CREATE POLICY operational_products_select ON public.products
  FOR SELECT
  USING (public.reference_scope_visible(organization_id, brand_id, location_id, deleted_at));

CREATE POLICY operational_products_insert ON public.products
  FOR INSERT
  WITH CHECK (public.reference_scope_writable(organization_id, brand_id, location_id, NULL, 'location_manager'));

CREATE POLICY operational_products_update ON public.products
  FOR UPDATE
  USING (public.reference_scope_writable(organization_id, brand_id, location_id, deleted_at, 'location_manager'))
  WITH CHECK (public.reference_scope_writable(organization_id, brand_id, location_id, deleted_at, 'location_manager'));

CREATE POLICY operational_recipes_select ON public.recipes
  FOR SELECT
  USING (public.reference_scope_visible(organization_id, brand_id, location_id, deleted_at));

CREATE POLICY operational_recipes_insert ON public.recipes
  FOR INSERT
  WITH CHECK (public.reference_scope_writable(organization_id, brand_id, location_id, NULL, 'location_manager'));

CREATE POLICY operational_recipes_update ON public.recipes
  FOR UPDATE
  USING (public.reference_scope_writable(organization_id, brand_id, location_id, deleted_at, 'location_manager'))
  WITH CHECK (public.reference_scope_writable(organization_id, brand_id, location_id, deleted_at, 'location_manager'));

CREATE POLICY operational_inventory_select ON public.inventory
  FOR SELECT
  USING (public.tenant_scope_visible(organization_id, brand_id, location_id, deleted_at));

CREATE POLICY operational_inventory_insert ON public.inventory
  FOR INSERT
  WITH CHECK (public.tenant_scope_writable(organization_id, brand_id, location_id, NULL, true));

CREATE POLICY operational_inventory_update ON public.inventory
  FOR UPDATE
  USING (public.tenant_scope_writable(organization_id, brand_id, location_id, deleted_at, true))
  WITH CHECK (public.tenant_scope_writable(organization_id, brand_id, location_id, deleted_at, true));

CREATE POLICY operational_wastage_logs_select ON public.wastage_logs
  FOR SELECT
  USING (public.tenant_scope_visible(organization_id, brand_id, location_id, NULL));

CREATE POLICY operational_wastage_logs_insert ON public.wastage_logs
  FOR INSERT
  WITH CHECK (public.tenant_scope_writable(organization_id, brand_id, location_id, NULL, true));

CREATE POLICY operational_wastage_logs_update ON public.wastage_logs
  FOR UPDATE
  USING (public.tenant_scope_writable(organization_id, brand_id, location_id, NULL, true))
  WITH CHECK (public.tenant_scope_writable(organization_id, brand_id, location_id, NULL, true));

CREATE POLICY operational_auto_orders_select ON public.auto_orders
  FOR SELECT
  USING (public.tenant_scope_visible(organization_id, brand_id, location_id, NULL));

CREATE POLICY operational_auto_orders_insert ON public.auto_orders
  FOR INSERT
  WITH CHECK (public.tenant_scope_writable(organization_id, brand_id, location_id, NULL, false));

CREATE POLICY operational_auto_orders_update ON public.auto_orders
  FOR UPDATE
  USING (public.tenant_scope_writable(organization_id, brand_id, location_id, NULL, false))
  WITH CHECK (public.tenant_scope_writable(organization_id, brand_id, location_id, NULL, false));

CREATE POLICY operational_purchase_orders_select ON public.purchase_orders
  FOR SELECT
  USING (public.tenant_scope_visible(organization_id, NULL, location_id, NULL));

CREATE POLICY operational_purchase_orders_insert ON public.purchase_orders
  FOR INSERT
  WITH CHECK (public.tenant_scope_writable(organization_id, NULL, location_id, NULL, false));

CREATE POLICY operational_purchase_orders_update ON public.purchase_orders
  FOR UPDATE
  USING (public.tenant_scope_writable(organization_id, NULL, location_id, NULL, false))
  WITH CHECK (public.tenant_scope_writable(organization_id, NULL, location_id, NULL, false));

CREATE POLICY operational_inventory_movements_select ON public.inventory_movements
  FOR SELECT
  USING (public.tenant_scope_visible(organization_id, NULL, location_id, NULL));

CREATE POLICY operational_inventory_movements_insert ON public.inventory_movements
  FOR INSERT
  WITH CHECK (public.tenant_scope_writable(organization_id, NULL, location_id, NULL, false));

CREATE POLICY operational_inventory_movements_update ON public.inventory_movements
  FOR UPDATE
  USING (public.tenant_scope_writable(organization_id, NULL, location_id, NULL, false))
  WITH CHECK (public.tenant_scope_writable(organization_id, NULL, location_id, NULL, false));

REVOKE ALL PRIVILEGES ON TABLE
  public.vendors,
  public.products,
  public.recipes,
  public.inventory,
  public.wastage_logs,
  public.auto_orders,
  public.purchase_orders,
  public.inventory_movements
FROM anon, authenticated;

REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE
  public.vendors,
  public.products,
  public.recipes,
  public.inventory,
  public.wastage_logs,
  public.auto_orders,
  public.purchase_orders,
  public.inventory_movements
FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE ON TABLE
  public.vendors,
  public.products,
  public.recipes,
  public.inventory,
  public.wastage_logs,
  public.auto_orders,
  public.purchase_orders,
  public.inventory_movements
TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.vendors,
  public.products,
  public.recipes,
  public.inventory,
  public.wastage_logs,
  public.auto_orders,
  public.purchase_orders,
  public.inventory_movements
TO service_role;

COMMIT;
