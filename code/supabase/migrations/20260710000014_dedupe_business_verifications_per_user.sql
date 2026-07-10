-- Make business verification submission idempotent per onboarding user.
-- A tenant user should have one current business verification review row; resubmits update it.
BEGIN;

WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY user_id
      ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM public.business_verifications
  WHERE user_id IS NOT NULL
)
DELETE FROM public.business_verifications bv
USING ranked r
WHERE bv.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS business_verifications_one_per_user_idx
  ON public.business_verifications(user_id)
  WHERE user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.merge_business_verification_per_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_existing_id UUID;
BEGIN
  SELECT id
  INTO v_existing_id
  FROM public.business_verifications
  WHERE user_id = NEW.user_id
  ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
  LIMIT 1;

  IF v_existing_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.business_verifications
  SET organization_id = COALESCE(NEW.organization_id, organization_id),
      legal_business_name = NEW.legal_business_name,
      business_type = NEW.business_type,
      identifier_type = NEW.identifier_type,
      identifier_last4 = NEW.identifier_last4,
      provider_name = NEW.provider_name,
      provider_reference_id = NEW.provider_reference_id,
      verification_status = NEW.verification_status,
      trust_score = NEW.trust_score,
      metadata = COALESCE(NEW.metadata, '{}'::jsonb),
      reviewed_by = NULL,
      reviewed_at = NULL,
      rejection_reason = NULL,
      updated_at = now()
  WHERE id = v_existing_id;

  NEW.id := v_existing_id;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_merge_business_verification_per_user ON public.business_verifications;
CREATE TRIGGER trg_merge_business_verification_per_user
  BEFORE INSERT ON public.business_verifications
  FOR EACH ROW
  EXECUTE FUNCTION public.merge_business_verification_per_user();

COMMIT;

NOTIFY pgrst, 'reload schema';
