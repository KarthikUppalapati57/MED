BEGIN;

ALTER TABLE public.vendor_banking_details
  ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS vendor_banking_details_one_default_per_vendor_idx
  ON public.vendor_banking_details (vendor_id)
  WHERE is_default = true
    AND deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.set_vendor_banking_default()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.is_default IS NOT TRUE THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.vendor_banking_details vbd
      WHERE vbd.vendor_id = NEW.vendor_id
        AND vbd.is_default = true
        AND vbd.deleted_at IS NULL
    ) THEN
      NEW.is_default := true;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_vendor_banking_default ON public.vendor_banking_details;
CREATE TRIGGER set_vendor_banking_default
BEFORE INSERT ON public.vendor_banking_details
FOR EACH ROW
EXECUTE FUNCTION public.set_vendor_banking_default();

CREATE OR REPLACE FUNCTION public.get_vendor_payment_account(p_vendor_id uuid)
RETURNS TABLE (
  id uuid,
  banking_secret_id uuid,
  account_last4 text,
  is_default boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Ponytail: fallback picks any active+verified alternate with no explicit
  -- ordering. If the business needs ranked fallback, add a priority column then.
  SELECT vbd.id,
         vbd.banking_secret_id,
         vbd.account_last4,
         vbd.is_default
  FROM public.vendor_banking_details vbd
  WHERE vbd.vendor_id = p_vendor_id
    AND vbd.is_active = true
    AND vbd.verification_state = 'verified'
    AND vbd.banking_secret_id IS NOT NULL
    AND vbd.deleted_at IS NULL
  ORDER BY vbd.is_default DESC, vbd.created_at ASC, vbd.id ASC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_vendor_payment_account(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_vendor_payment_account(uuid) TO service_role;

GRANT SELECT (is_default) ON public.vendor_banking_details TO authenticated;

COMMIT;
