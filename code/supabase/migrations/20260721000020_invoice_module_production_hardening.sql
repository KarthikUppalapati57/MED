-- 20260721000020: Invoice module production hardening
--
-- Closes the high-risk invoice checklist gaps that can be enforced locally:
-- public invoice storage reads, approval/AP-state drift, post-approval financial edits,
-- self-approval, duplicate manual payment recording, and the discoverable reconciliation RPC.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Storage: make the final migration state explicit for invoice documents.
-- ---------------------------------------------------------------------------

UPDATE storage.buckets
   SET public = false,
       file_size_limit = COALESCE(file_size_limit, 52428800),
       allowed_mime_types = COALESCE(
         allowed_mime_types,
         ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']::text[]
       )
 WHERE id = 'invoices';

DROP POLICY IF EXISTS "Public Access to View Invoices" ON storage.objects;
DROP POLICY IF EXISTS "Tenant Isolation Invoices View" ON storage.objects;
DROP POLICY IF EXISTS "Tenant Isolation Invoices Insert" ON storage.objects;
DROP POLICY IF EXISTS "Tenant Isolation Invoices Delete" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view invoices" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload invoices" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete invoices" ON storage.objects;
DROP POLICY IF EXISTS "invoices_bucket_authenticated_access" ON storage.objects;
DROP POLICY IF EXISTS "invoices_bucket_org_read" ON storage.objects;
DROP POLICY IF EXISTS "invoices_bucket_org_insert" ON storage.objects;
DROP POLICY IF EXISTS "invoices_bucket_org_delete" ON storage.objects;
DROP POLICY IF EXISTS "invoices_bucket_service_role" ON storage.objects;

CREATE POLICY "invoices_bucket_org_read"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'invoices'
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] = public.get_auth_org()::text
);

CREATE POLICY "invoices_bucket_org_insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'invoices'
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] = public.get_auth_org()::text
);

CREATE POLICY "invoices_bucket_org_delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'invoices'
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] = public.get_auth_org()::text
);

CREATE POLICY "invoices_bucket_service_role"
ON storage.objects
FOR ALL
TO service_role
USING (bucket_id = 'invoices')
WITH CHECK (bucket_id = 'invoices');

CREATE OR REPLACE FUNCTION public.assert_financial_actor(
  p_organization_id UUID,
  p_allowed_roles TEXT[] DEFAULT ARRAY[
    'location_manager',
    'branch_manager',
    'brand_manager',
    'org_manager',
    'tenant_super_admin',
    'platform_admin',
    'org_owner',
    'owner',
    'admin'
  ]
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
DECLARE
  v_role TEXT;
  v_profile_org UUID;
  v_profile_tenant UUID;
  v_org_tenant UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT role, organization_id, tenant_id
    INTO v_role, v_profile_org, v_profile_tenant
  FROM public.profiles
  WHERE id = auth.uid()
    AND deleted_at IS NULL;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'User profile not found';
  END IF;

  IF v_role = 'tenant_super_admin' THEN
    SELECT tenant_id INTO v_org_tenant
    FROM public.organizations
    WHERE id = p_organization_id;

    IF v_profile_tenant IS DISTINCT FROM v_org_tenant THEN
      RAISE EXCEPTION 'Cross-tenant financial access denied';
    END IF;
  ELSIF v_role <> 'platform_admin' AND v_profile_org IS DISTINCT FROM p_organization_id THEN
    RAISE EXCEPTION 'Cross-organization financial access denied';
  END IF;

  IF NOT v_role = ANY(p_allowed_roles) THEN
    RAISE EXCEPTION 'Insufficient financial permissions';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_financial_actor(UUID, TEXT[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_financial_actor(UUID, TEXT[]) TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Status consistency and historical anomaly visibility.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.invoice_production_anomalies AS
SELECT
  id,
  organization_id,
  brand_id,
  location_id,
  tenant_id,
  invoice_number,
  vendor_name,
  status,
  ap_status,
  payment_status,
  paid_amount,
  total_amount,
  CASE
    WHEN status = 'rejected'
      AND COALESCE(payment_status, 'unpaid') IN ('partial', 'paid', 'auto_pay', 'processing')
      THEN 'rejected_invoice_has_payment_state'
    WHEN status = 'rejected'
      AND COALESCE(paid_amount, 0) > 0
      THEN 'rejected_invoice_has_paid_amount'
    WHEN status = 'approved' AND ap_status IS DISTINCT FROM 'approved'
      THEN 'approved_status_ap_status_desync'
    WHEN status = 'scheduled' AND ap_status IS DISTINCT FROM 'scheduled'
      THEN 'scheduled_status_ap_status_desync'
    WHEN status = 'paid' AND (ap_status IS DISTINCT FROM 'paid' OR payment_status IS DISTINCT FROM 'paid')
      THEN 'paid_status_desync'
    WHEN status = 'rejected' AND ap_status IS DISTINCT FROM 'rejected'
      THEN 'rejected_status_ap_status_desync'
  END AS anomaly_type,
  updated_at
FROM public.invoices
WHERE deleted_at IS NULL
  AND (
    (status = 'rejected' AND COALESCE(payment_status, 'unpaid') IN ('partial', 'paid', 'auto_pay', 'processing'))
    OR (status = 'rejected' AND COALESCE(paid_amount, 0) > 0)
    OR (status = 'approved' AND ap_status IS DISTINCT FROM 'approved')
    OR (status = 'scheduled' AND ap_status IS DISTINCT FROM 'scheduled')
    OR (status = 'paid' AND (ap_status IS DISTINCT FROM 'paid' OR payment_status IS DISTINCT FROM 'paid'))
    OR (status = 'rejected' AND ap_status IS DISTINCT FROM 'rejected')
  );

REVOKE ALL ON public.invoice_production_anomalies FROM PUBLIC, anon;
GRANT SELECT ON public.invoice_production_anomalies TO authenticated, service_role;

ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_no_rejected_paid_state;
ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_no_rejected_paid_state CHECK (
    status <> 'rejected'
    OR (
      COALESCE(payment_status, 'unpaid') NOT IN ('partial', 'paid', 'auto_pay', 'processing')
      AND COALESCE(paid_amount, 0) = 0
    )
  ) NOT VALID;

CREATE OR REPLACE FUNCTION public.normalize_invoice_ap_state()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'approved' THEN
    NEW.ap_status := 'approved';
  ELSIF NEW.status = 'scheduled' THEN
    NEW.ap_status := 'scheduled';
  ELSIF NEW.status = 'paid' THEN
    NEW.ap_status := 'paid';
    NEW.payment_status := 'paid';
  ELSIF NEW.status = 'rejected' THEN
    IF COALESCE(NEW.payment_status, 'unpaid') IN ('partial', 'paid', 'auto_pay', 'processing')
      OR COALESCE(NEW.paid_amount, 0) > 0 THEN
      RAISE EXCEPTION 'Rejected invoices cannot carry paid or in-flight payment state';
    END IF;
    NEW.ap_status := 'rejected';
  END IF;

  IF NEW.payment_status = 'paid' THEN
    NEW.status := 'paid';
    NEW.ap_status := 'paid';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS normalize_invoice_ap_state ON public.invoices;
CREATE TRIGGER normalize_invoice_ap_state
  BEFORE INSERT OR UPDATE OF status, ap_status, payment_status, paid_amount
  ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.normalize_invoice_ap_state();

-- ---------------------------------------------------------------------------
-- 3. Approval controls: no self-approval, autopay bar retained.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_invoice_approval_authorization()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_vendor_autopay boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'approved' OR NEW.ap_status = 'approved' THEN
      IF NEW.created_by IS NOT NULL AND NEW.created_by = auth.uid() THEN
        RAISE EXCEPTION 'Invoice submitters cannot approve their own invoices';
      END IF;

      PERFORM public.assert_can_approve_invoice_scope(
        NEW.organization_id,
        NEW.brand_id,
        NEW.location_id
      );

      SELECT autopay_enabled INTO v_vendor_autopay FROM public.vendors WHERE id = NEW.vendor_id;
      IF v_vendor_autopay AND NOT public.is_owner_or_admin() THEN
        RAISE EXCEPTION 'AutoPay invoice approval requires an org manager, tenant super admin, or platform admin';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF (NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved')
    OR (NEW.ap_status = 'approved' AND OLD.ap_status IS DISTINCT FROM 'approved') THEN
    IF COALESCE(OLD.created_by, NEW.created_by) IS NOT NULL
      AND COALESCE(OLD.created_by, NEW.created_by) = auth.uid() THEN
      RAISE EXCEPTION 'Invoice submitters cannot approve their own invoices';
    END IF;

    PERFORM public.assert_can_approve_invoice_scope(
      NEW.organization_id,
      NEW.brand_id,
      NEW.location_id
    );

    SELECT autopay_enabled INTO v_vendor_autopay FROM public.vendors WHERE id = NEW.vendor_id;
    IF v_vendor_autopay AND NOT public.is_owner_or_admin() THEN
      RAISE EXCEPTION 'AutoPay invoice approval requires an org manager, tenant super admin, or platform admin';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_invoice_approval_authorization ON public.invoices;
CREATE TRIGGER enforce_invoice_approval_authorization
BEFORE INSERT OR UPDATE OF status, ap_status
ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.enforce_invoice_approval_authorization();

-- ---------------------------------------------------------------------------
-- 4. Financial immutability after approval/payment.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_locked_invoice_financial_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status IN ('approved', 'scheduled', 'partially_paid', 'paid')
    OR OLD.ap_status IN ('approved', 'scheduled', 'paid', 'closed')
    OR COALESCE(OLD.payment_status, 'unpaid') IN ('partial', 'paid', 'auto_pay')
    OR COALESCE(OLD.paid_amount, 0) > 0 THEN
    IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
      OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
      OR NEW.brand_id IS DISTINCT FROM OLD.brand_id
      OR NEW.location_id IS DISTINCT FROM OLD.location_id
      OR NEW.vendor_id IS DISTINCT FROM OLD.vendor_id
      OR NEW.vendor_name IS DISTINCT FROM OLD.vendor_name
      OR NEW.invoice_number IS DISTINCT FROM OLD.invoice_number
      OR NEW.invoice_date IS DISTINCT FROM OLD.invoice_date
      OR NEW.due_date IS DISTINCT FROM OLD.due_date
      OR NEW.total_amount IS DISTINCT FROM OLD.total_amount
      OR NEW.subtotal IS DISTINCT FROM OLD.subtotal
      OR NEW.tax_amount IS DISTINCT FROM OLD.tax_amount
      OR NEW.delivery_fee IS DISTINCT FROM OLD.delivery_fee
      OR NEW.fuel_surcharge IS DISTINCT FROM OLD.fuel_surcharge
      OR NEW.other_charges IS DISTINCT FROM OLD.other_charges
      OR NEW.currency IS DISTINCT FROM OLD.currency
      OR NEW.account_number IS DISTINCT FROM OLD.account_number
      OR NEW.purchase_order_id IS DISTINCT FROM OLD.purchase_order_id
      OR NEW.line_items IS DISTINCT FROM OLD.line_items THEN
      RAISE EXCEPTION 'Approved, scheduled, partially paid, or paid invoice financial fields are immutable';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_locked_invoice_financial_fields ON public.invoices;
CREATE TRIGGER guard_locked_invoice_financial_fields
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_locked_invoice_financial_fields();

CREATE OR REPLACE FUNCTION public.guard_locked_invoice_line_items()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice record;
  v_invoice_id uuid;
BEGIN
  v_invoice_id := COALESCE(NEW.invoice_id, OLD.invoice_id);

  SELECT status, ap_status, payment_status, paid_amount
    INTO v_invoice
  FROM public.invoices
  WHERE id = v_invoice_id;

  IF v_invoice.status IN ('approved', 'scheduled', 'partially_paid', 'paid')
    OR v_invoice.ap_status IN ('approved', 'scheduled', 'paid', 'closed')
    OR COALESCE(v_invoice.payment_status, 'unpaid') IN ('partial', 'paid', 'auto_pay')
    OR COALESCE(v_invoice.paid_amount, 0) > 0 THEN
    RAISE EXCEPTION 'Invoice line items are immutable after approval or payment activity';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS guard_locked_invoice_line_items ON public.invoice_line_items;
CREATE TRIGGER guard_locked_invoice_line_items
  BEFORE INSERT OR UPDATE OR DELETE ON public.invoice_line_items
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_locked_invoice_line_items();

-- ---------------------------------------------------------------------------
-- 5. Payment idempotency and status guards.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_payment_reference_uniqueness()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.invoice_id IS NOT NULL
    AND NULLIF(trim(COALESCE(NEW.transaction_id, '')), '') IS NOT NULL
    AND COALESCE(NEW.status, 'pending') NOT IN ('failed', 'cancelled', 'refunded')
    AND EXISTS (
      SELECT 1
      FROM public.payments p
      WHERE p.invoice_id = NEW.invoice_id
        AND p.id IS DISTINCT FROM NEW.id
        AND p.transaction_id = NEW.transaction_id
        AND COALESCE(p.status, 'pending') NOT IN ('failed', 'cancelled', 'refunded')
    ) THEN
    RAISE EXCEPTION 'A non-reversed payment with reference % already exists for this invoice', NEW.transaction_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_payment_reference_uniqueness ON public.payments;
CREATE TRIGGER guard_payment_reference_uniqueness
  BEFORE INSERT OR UPDATE OF invoice_id, transaction_id, status
  ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_payment_reference_uniqueness();

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
  v_existing_payment_id UUID;
  v_remaining NUMERIC;
  v_new_paid_amount NUMERIC;
  v_new_status TEXT;
  v_payment_id UUID;
BEGIN
  IF COALESCE(p_amount, 0) <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be greater than zero';
  END IF;

  IF NULLIF(trim(COALESCE(p_reference, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Payment reference is required';
  END IF;

  SELECT * INTO v_invoice
    FROM public.invoices
   WHERE id = p_invoice_id
   FOR UPDATE;

  IF v_invoice.id IS NULL THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  PERFORM public.assert_financial_actor(v_invoice.organization_id);

  IF COALESCE(v_invoice.ap_routing_destination, 'payments') <> 'payments' THEN
    RAISE EXCEPTION 'Invoice is routed to %, not Payments', v_invoice.ap_routing_destination;
  END IF;

  IF v_invoice.status = 'rejected' OR v_invoice.ap_status = 'rejected' THEN
    RAISE EXCEPTION 'Rejected invoices cannot receive payments';
  END IF;

  SELECT id
    INTO v_existing_payment_id
  FROM public.payments
  WHERE invoice_id = p_invoice_id
    AND transaction_id = p_reference
    AND COALESCE(status, 'pending') NOT IN ('failed', 'cancelled', 'refunded')
  LIMIT 1;

  IF v_existing_payment_id IS NOT NULL THEN
    RAISE EXCEPTION 'Payment reference % has already been recorded for this invoice', p_reference;
  END IF;

  IF COALESCE(v_invoice.payment_status, 'unpaid') IN ('paid', 'auto_pay') OR v_invoice.status = 'paid' THEN
    RAISE EXCEPTION 'Paid invoices cannot receive another payment';
  END IF;

  IF v_invoice.status NOT IN ('approved', 'scheduled', 'partially_paid') THEN
    RAISE EXCEPTION 'Invoice must be approved before recording payment';
  END IF;

  v_remaining := GREATEST(0, COALESCE(v_invoice.total_amount, 0) - COALESCE(v_invoice.paid_amount, 0));
  IF p_amount > v_remaining THEN
    RAISE EXCEPTION 'Payment amount % exceeds remaining balance %', p_amount, v_remaining;
  END IF;

  v_new_paid_amount := COALESCE(v_invoice.paid_amount, 0) + p_amount;
  v_new_status := CASE
    WHEN v_new_paid_amount >= COALESCE(v_invoice.total_amount, 0) THEN 'paid'
    ELSE 'partially_paid'
  END;

  UPDATE public.invoices
     SET paid_amount = v_new_paid_amount,
         payment_status = CASE WHEN v_new_status = 'paid' THEN 'paid' ELSE 'partial' END,
         status = v_new_status,
         ap_status = CASE WHEN v_new_status = 'paid' THEN 'paid' ELSE ap_status END,
         payment_reference = p_reference,
         updated_at = now()
   WHERE id = p_invoice_id;

  INSERT INTO public.payments (
    invoice_id,
    vendor_id,
    vendor_name,
    invoice_number,
    amount,
    payment_method,
    status,
    transaction_id,
    payment_date,
    payment_account_id,
    organization_id,
    brand_id,
    location_id,
    created_by
  ) VALUES (
    v_invoice.id,
    v_invoice.vendor_id,
    v_invoice.vendor_name,
    v_invoice.invoice_number,
    p_amount,
    p_payment_method,
    'completed',
    p_reference,
    CURRENT_DATE,
    v_invoice.payment_account_id,
    v_invoice.organization_id,
    v_invoice.brand_id,
    v_invoice.location_id,
    auth.uid()
  )
  RETURNING id INTO v_payment_id;

  PERFORM public.log_invoice_audit_event(
    v_invoice.id,
    'payment_recorded',
    'Payment recorded through tenant-safe financial RPC',
    to_jsonb(v_invoice),
    jsonb_build_object(
      'payment_id', v_payment_id,
      'amount', p_amount,
      'payment_method', p_payment_method,
      'reference', p_reference,
      'status', v_new_status
    )
  );

  RETURN jsonb_build_object(
    'status', v_new_status,
    'paid_amount', v_new_paid_amount,
    'payment_id', v_payment_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_invoice_payment(uuid, numeric, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_invoice_payment(uuid, numeric, text, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. Make the public reconciliation RPC surface the real PO-level match result.
-- ---------------------------------------------------------------------------

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
  v_match JSONB;
  v_status TEXT;
  v_reconciled_count INTEGER := 0;
  v_variance_count INTEGER := 0;
BEGIN
  SELECT organization_id, purchase_order_id
    INTO v_org_id, v_po_id
  FROM public.invoices
  WHERE id = p_invoice_id
    AND deleted_at IS NULL;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  DELETE FROM public.invoice_line_matches
  WHERE invoice_line_id IN (
    SELECT id FROM public.invoice_line_items WHERE invoice_id = p_invoice_id
  );

  DELETE FROM public.reconciliation_variances
  WHERE invoice_id = p_invoice_id;

  IF v_po_id IS NOT NULL THEN
    v_match := public.get_three_way_match_status(v_po_id);
    v_status := COALESCE(v_match->>'match_status', 'unmatched');
  ELSE
    v_match := jsonb_build_object('match_status', 'missing_po');
    v_status := 'missing_po';
  END IF;

  FOR v_line IN SELECT * FROM public.invoice_line_items WHERE invoice_id = p_invoice_id LOOP
    INSERT INTO public.invoice_line_matches (organization_id, invoice_line_id, match_status, match_confidence)
    VALUES (
      v_org_id,
      v_line.id,
      CASE WHEN v_status = 'matched' THEN 'exact' ELSE 'variance' END,
      CASE WHEN v_status = 'matched' THEN 1.0 ELSE 0.5 END
    );

    v_reconciled_count := v_reconciled_count + 1;

    IF v_status = 'missing_po' THEN
      INSERT INTO public.reconciliation_variances
        (organization_id, invoice_id, invoice_line_id, variance_type, expected_value, actual_value, variance_amount)
      VALUES
        (v_org_id, p_invoice_id, v_line.id, 'missing_po', 0, COALESCE(v_line.total_price, 0), COALESCE(v_line.total_price, 0));
      v_variance_count := v_variance_count + 1;
    END IF;

    IF v_status IN ('price_variance', 'critical_variance') THEN
      INSERT INTO public.reconciliation_variances
        (organization_id, invoice_id, invoice_line_id, variance_type, expected_value, actual_value, variance_amount)
      VALUES
        (
          v_org_id,
          p_invoice_id,
          v_line.id,
          'price',
          NULL,
          COALESCE(v_line.total_price, 0),
          COALESCE((v_match->>'variance_amount')::numeric, 0)
        );
      v_variance_count := v_variance_count + 1;
    END IF;

    IF v_status IN ('quantity_variance', 'critical_variance') THEN
      INSERT INTO public.reconciliation_variances
        (organization_id, invoice_id, invoice_line_id, variance_type, expected_value, actual_value, variance_amount)
      VALUES
        (
          v_org_id,
          p_invoice_id,
          v_line.id,
          'quantity',
          COALESCE((v_match->>'po_quantity')::numeric, 0),
          COALESCE((v_match->>'received_quantity')::numeric, 0),
          ABS(COALESCE((v_match->>'po_quantity')::numeric, 0) - COALESCE((v_match->>'received_quantity')::numeric, 0))
        );
      v_variance_count := v_variance_count + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'reconciled_lines', v_reconciled_count,
    'variance_count', v_variance_count,
    'match_status', v_status,
    'match', v_match
  );
END;
$$;

COMMIT;
