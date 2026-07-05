BEGIN;

CREATE OR REPLACE FUNCTION public.financial_scope_visible(
  p_organization_id uuid,
  p_brand_id uuid DEFAULT NULL,
  p_location_id uuid DEFAULT NULL,
  p_deleted_at timestamptz DEFAULT NULL
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

CREATE OR REPLACE FUNCTION public.financial_scope_writable(
  p_organization_id uuid,
  p_brand_id uuid DEFAULT NULL,
  p_location_id uuid DEFAULT NULL,
  p_deleted_at timestamptz DEFAULT NULL,
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

  RETURN public.financial_scope_visible(
    p_organization_id,
    p_brand_id,
    p_location_id,
    p_deleted_at
  );
END;
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
      AND public.financial_scope_visible(
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
      AND public.financial_scope_writable(
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
    ELSE public.financial_scope_visible(p_organization_id, NULL, NULL, NULL)
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
    ELSE public.financial_scope_writable(p_organization_id, NULL, NULL, NULL, false)
  END;
$$;

CREATE OR REPLACE FUNCTION public.invoice_line_match_visible(p_invoice_line_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.invoice_line_items ili
    WHERE ili.id = p_invoice_line_id
      AND public.invoice_visible(ili.invoice_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.invoice_line_match_writable(p_invoice_line_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.invoice_line_items ili
    WHERE ili.id = p_invoice_line_id
      AND public.invoice_writable(ili.invoice_id, false)
  );
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
    ELSE public.financial_scope_visible(p_organization_id, NULL, NULL, NULL)
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
    ELSE public.financial_scope_writable(p_organization_id, NULL, NULL, NULL, false)
  END;
$$;

DO $$
DECLARE
  v_table text;
  v_policy text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'invoices',
    'payments',
    'invoice_allocations',
    'credit_requests',
    'invoice_line_items',
    'invoice_documents',
    'reconciliation_variances',
    'invoice_audit_events',
    'ledger_bills',
    'invoice_line_matches',
    'ledger_payments',
    'ledger_entries'
  ]
  LOOP
    FOR v_policy IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = v_table
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_policy, v_table);
    END LOOP;
  END LOOP;
END $$;

REVOKE TRUNCATE, REFERENCES, TRIGGER ON
  public.invoices,
  public.payments,
  public.invoice_allocations,
  public.credit_requests,
  public.invoice_line_items,
  public.invoice_documents,
  public.reconciliation_variances,
  public.invoice_audit_events,
  public.ledger_bills,
  public.invoice_line_matches,
  public.ledger_payments,
  public.ledger_entries
FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE ON
  public.invoices,
  public.payments,
  public.invoice_allocations,
  public.credit_requests,
  public.invoice_line_items,
  public.invoice_documents,
  public.reconciliation_variances,
  public.ledger_bills,
  public.invoice_line_matches,
  public.ledger_payments
TO authenticated;

GRANT SELECT, INSERT ON
  public.invoice_audit_events,
  public.ledger_entries
TO authenticated;

CREATE POLICY "financial_invoices_select"
ON public.invoices
FOR SELECT
USING (
  public.financial_scope_visible(organization_id, brand_id, location_id, deleted_at)
);

CREATE POLICY "financial_invoices_insert"
ON public.invoices
FOR INSERT
WITH CHECK (
  organization_id = public.get_auth_org()
  AND created_by = auth.uid()
  AND public.financial_scope_writable(organization_id, brand_id, location_id, NULL, true)
);

CREATE POLICY "financial_invoices_update"
ON public.invoices
FOR UPDATE
USING (
  public.financial_scope_writable(organization_id, brand_id, location_id, deleted_at, false)
)
WITH CHECK (
  public.financial_scope_writable(organization_id, brand_id, location_id, deleted_at, false)
);

CREATE POLICY "financial_payments_select"
ON public.payments
FOR SELECT
USING (
  public.financial_scope_visible(organization_id, brand_id, location_id, deleted_at)
);

CREATE POLICY "financial_payments_insert"
ON public.payments
FOR INSERT
WITH CHECK (
  public.financial_scope_writable(organization_id, brand_id, location_id, deleted_at, false)
);

CREATE POLICY "financial_payments_update"
ON public.payments
FOR UPDATE
USING (
  public.financial_scope_writable(organization_id, brand_id, location_id, deleted_at, false)
)
WITH CHECK (
  public.financial_scope_writable(organization_id, brand_id, location_id, deleted_at, false)
);

CREATE POLICY "financial_invoice_allocations_select"
ON public.invoice_allocations
FOR SELECT
USING (
  public.financial_scope_visible(organization_id, NULL, location_id, NULL)
);

CREATE POLICY "financial_invoice_allocations_insert"
ON public.invoice_allocations
FOR INSERT
WITH CHECK (
  public.financial_scope_writable(organization_id, NULL, location_id, NULL, false)
);

CREATE POLICY "financial_invoice_allocations_update"
ON public.invoice_allocations
FOR UPDATE
USING (
  public.financial_scope_writable(organization_id, NULL, location_id, NULL, false)
)
WITH CHECK (
  public.financial_scope_writable(organization_id, NULL, location_id, NULL, false)
);

CREATE POLICY "financial_credit_requests_select"
ON public.credit_requests
FOR SELECT
USING (
  public.financial_scope_visible(organization_id, NULL, location_id, NULL)
);

CREATE POLICY "financial_credit_requests_insert"
ON public.credit_requests
FOR INSERT
WITH CHECK (
  public.financial_scope_writable(organization_id, NULL, location_id, NULL, true)
);

CREATE POLICY "financial_credit_requests_update"
ON public.credit_requests
FOR UPDATE
USING (
  public.financial_scope_writable(organization_id, NULL, location_id, NULL, false)
)
WITH CHECK (
  public.financial_scope_writable(organization_id, NULL, location_id, NULL, false)
);

CREATE POLICY "financial_invoice_line_items_select"
ON public.invoice_line_items
FOR SELECT
USING (
  public.invoice_child_visible(organization_id, invoice_id)
);

CREATE POLICY "financial_invoice_line_items_insert"
ON public.invoice_line_items
FOR INSERT
WITH CHECK (
  public.invoice_child_writable(organization_id, invoice_id)
);

CREATE POLICY "financial_invoice_line_items_update"
ON public.invoice_line_items
FOR UPDATE
USING (
  public.invoice_child_writable(organization_id, invoice_id)
)
WITH CHECK (
  public.invoice_child_writable(organization_id, invoice_id)
);

CREATE POLICY "financial_invoice_documents_select"
ON public.invoice_documents
FOR SELECT
USING (
  public.invoice_child_visible(organization_id, invoice_id)
);

CREATE POLICY "financial_invoice_documents_insert"
ON public.invoice_documents
FOR INSERT
WITH CHECK (
  public.invoice_child_writable(organization_id, invoice_id)
);

CREATE POLICY "financial_invoice_documents_update"
ON public.invoice_documents
FOR UPDATE
USING (
  public.invoice_child_writable(organization_id, invoice_id)
)
WITH CHECK (
  public.invoice_child_writable(organization_id, invoice_id)
);

CREATE POLICY "financial_reconciliation_variances_select"
ON public.reconciliation_variances
FOR SELECT
USING (
  public.invoice_child_visible(organization_id, invoice_id)
);

CREATE POLICY "financial_reconciliation_variances_insert"
ON public.reconciliation_variances
FOR INSERT
WITH CHECK (
  public.invoice_child_writable(organization_id, invoice_id)
);

CREATE POLICY "financial_reconciliation_variances_update"
ON public.reconciliation_variances
FOR UPDATE
USING (
  public.invoice_child_writable(organization_id, invoice_id)
)
WITH CHECK (
  public.invoice_child_writable(organization_id, invoice_id)
);

CREATE POLICY "financial_invoice_audit_events_select"
ON public.invoice_audit_events
FOR SELECT
USING (
  public.invoice_child_visible(organization_id, invoice_id)
);

CREATE POLICY "financial_invoice_audit_events_insert"
ON public.invoice_audit_events
FOR INSERT
WITH CHECK (
  public.invoice_child_visible(organization_id, invoice_id)
);

CREATE POLICY "financial_ledger_bills_select"
ON public.ledger_bills
FOR SELECT
USING (
  deleted_at IS NULL
  AND public.invoice_child_visible(organization_id, invoice_id)
);

CREATE POLICY "financial_ledger_bills_insert"
ON public.ledger_bills
FOR INSERT
WITH CHECK (
  public.invoice_child_writable(organization_id, invoice_id)
);

CREATE POLICY "financial_ledger_bills_update"
ON public.ledger_bills
FOR UPDATE
USING (
  deleted_at IS NULL
  AND public.invoice_child_writable(organization_id, invoice_id)
)
WITH CHECK (
  deleted_at IS NULL
  AND public.invoice_child_writable(organization_id, invoice_id)
);

CREATE POLICY "financial_invoice_line_matches_select"
ON public.invoice_line_matches
FOR SELECT
USING (
  public.invoice_line_match_visible(invoice_line_id)
);

CREATE POLICY "financial_invoice_line_matches_insert"
ON public.invoice_line_matches
FOR INSERT
WITH CHECK (
  public.invoice_line_match_writable(invoice_line_id)
);

CREATE POLICY "financial_invoice_line_matches_update"
ON public.invoice_line_matches
FOR UPDATE
USING (
  public.invoice_line_match_writable(invoice_line_id)
)
WITH CHECK (
  public.invoice_line_match_writable(invoice_line_id)
);

CREATE POLICY "financial_ledger_payments_select"
ON public.ledger_payments
FOR SELECT
USING (
  deleted_at IS NULL
  AND public.ledger_payment_visible(organization_id, bill_id)
);

CREATE POLICY "financial_ledger_payments_insert"
ON public.ledger_payments
FOR INSERT
WITH CHECK (
  public.ledger_payment_writable(organization_id, bill_id)
);

CREATE POLICY "financial_ledger_payments_update"
ON public.ledger_payments
FOR UPDATE
USING (
  deleted_at IS NULL
  AND public.ledger_payment_writable(organization_id, bill_id)
)
WITH CHECK (
  deleted_at IS NULL
  AND public.ledger_payment_writable(organization_id, bill_id)
);

CREATE POLICY "financial_ledger_entries_select"
ON public.ledger_entries
FOR SELECT
USING (
  public.financial_scope_visible(organization_id, NULL, NULL, NULL)
);

CREATE POLICY "financial_ledger_entries_insert"
ON public.ledger_entries
FOR INSERT
WITH CHECK (
  public.financial_scope_writable(organization_id, NULL, NULL, NULL, false)
);

COMMIT;
