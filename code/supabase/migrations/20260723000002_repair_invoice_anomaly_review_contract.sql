-- 20260723000002: Repair invoice anomaly review contract
--
-- Production can end up with the hardened anomaly view from 20260721000020
-- without the review columns added by 20260721000021. Re-establish the full
-- table/RPC/view contract expected by the invoice module.

BEGIN;

CREATE TABLE IF NOT EXISTS public.invoice_anomaly_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  brand_id uuid REFERENCES public.brands(brand_id) ON DELETE SET NULL,
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  anomaly_type text NOT NULL,
  decision text NOT NULL CHECK (decision IN ('opened_for_review', 'accepted_historical', 'finance_cleanup_requested')),
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.invoice_anomaly_reviews
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.invoice_anomaly_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_anomaly_reviews FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS invoice_anomaly_reviews_select ON public.invoice_anomaly_reviews;
CREATE POLICY invoice_anomaly_reviews_select
ON public.invoice_anomaly_reviews
FOR SELECT
USING (
  public.financial_scope_visible(organization_id, brand_id, location_id, NULL)
);

DROP POLICY IF EXISTS invoice_anomaly_reviews_insert ON public.invoice_anomaly_reviews;
CREATE POLICY invoice_anomaly_reviews_insert
ON public.invoice_anomaly_reviews
FOR INSERT
WITH CHECK (
  public.financial_scope_writable(organization_id, brand_id, location_id, NULL, false)
);

CREATE INDEX IF NOT EXISTS idx_invoice_anomaly_reviews_invoice_created
  ON public.invoice_anomaly_reviews(invoice_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.record_invoice_anomaly_review(
  p_invoice_id uuid,
  p_anomaly_type text,
  p_decision text,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice public.invoices%ROWTYPE;
  v_review_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_decision NOT IN ('opened_for_review', 'accepted_historical', 'finance_cleanup_requested') THEN
    RAISE EXCEPTION 'Unsupported invoice anomaly decision %', p_decision;
  END IF;

  SELECT * INTO v_invoice
  FROM public.invoices
  WHERE id = p_invoice_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF v_invoice.id IS NULL THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  PERFORM public.assert_financial_actor(v_invoice.organization_id);

  INSERT INTO public.invoice_anomaly_reviews (
    invoice_id,
    organization_id,
    brand_id,
    location_id,
    anomaly_type,
    decision,
    notes,
    created_by
  ) VALUES (
    v_invoice.id,
    v_invoice.organization_id,
    v_invoice.brand_id,
    v_invoice.location_id,
    COALESCE(NULLIF(p_anomaly_type, ''), 'unknown'),
    p_decision,
    p_notes,
    auth.uid()
  )
  RETURNING id INTO v_review_id;

  UPDATE public.invoices
     SET validation_results = COALESCE(validation_results, '{}'::jsonb)
       || jsonb_build_object(
            'invoice_anomaly_review',
            jsonb_build_object(
              'decision', p_decision,
              'anomaly_type', COALESCE(NULLIF(p_anomaly_type, ''), 'unknown'),
              'reviewed_by', auth.uid(),
              'reviewed_at', now(),
              'notes', p_notes
            )
          ),
         updated_at = now()
   WHERE id = v_invoice.id;

  RETURN jsonb_build_object(
    'success', true,
    'review_id', v_review_id,
    'decision', p_decision
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_invoice_anomaly_review(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_invoice_anomaly_review(uuid, text, text, text) TO authenticated, service_role;

DROP VIEW IF EXISTS public.invoice_production_anomalies;
CREATE VIEW public.invoice_production_anomalies AS
WITH invoice_anomalies AS (
  SELECT
    i.id,
    i.organization_id,
    i.brand_id,
    i.location_id,
    i.tenant_id,
    i.invoice_number,
    i.vendor_name,
    i.status,
    i.ap_status,
    i.payment_status,
    i.paid_amount,
    i.total_amount,
    CASE
      WHEN i.status = 'rejected'
        AND COALESCE(i.payment_status, 'unpaid') IN ('partial', 'paid', 'auto_pay', 'processing')
        THEN 'rejected_invoice_has_payment_state'
      WHEN i.status = 'rejected'
        AND COALESCE(i.paid_amount, 0) > 0
        THEN 'rejected_invoice_has_paid_amount'
      WHEN i.status = 'approved' AND i.ap_status IS DISTINCT FROM 'approved'
        THEN 'approved_status_ap_status_desync'
      WHEN i.status = 'scheduled' AND i.ap_status IS DISTINCT FROM 'scheduled'
        THEN 'scheduled_status_ap_status_desync'
      WHEN i.status = 'paid' AND (i.ap_status IS DISTINCT FROM 'paid' OR i.payment_status IS DISTINCT FROM 'paid')
        THEN 'paid_status_desync'
      WHEN i.status = 'rejected' AND i.ap_status IS DISTINCT FROM 'rejected'
        THEN 'rejected_status_ap_status_desync'
    END AS anomaly_type,
    i.updated_at
  FROM public.invoices i
  WHERE i.deleted_at IS NULL
)
SELECT
  a.id,
  a.organization_id,
  a.brand_id,
  a.location_id,
  a.tenant_id,
  a.invoice_number,
  a.vendor_name,
  a.status,
  a.ap_status,
  a.payment_status,
  a.paid_amount,
  a.total_amount,
  a.anomaly_type,
  latest_review.decision AS latest_review_decision,
  latest_review.created_at AS latest_reviewed_at,
  a.updated_at
FROM invoice_anomalies a
LEFT JOIN LATERAL (
  SELECT r.decision, r.created_at
  FROM public.invoice_anomaly_reviews r
  WHERE r.invoice_id = a.id
    AND r.anomaly_type = a.anomaly_type
  ORDER BY r.created_at DESC
  LIMIT 1
) latest_review ON true
WHERE a.anomaly_type IS NOT NULL
  AND COALESCE(latest_review.decision, '') NOT IN ('accepted_historical', 'finance_cleanup_requested');

REVOKE ALL ON public.invoice_production_anomalies FROM PUBLIC, anon;
GRANT SELECT ON public.invoice_production_anomalies TO authenticated, service_role;

COMMIT;
