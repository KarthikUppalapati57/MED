-- The business verification review notification trigger reads NEW.rejection_reason.
-- Keep this nullable because automatic verification failures may not have an admin reason yet.
ALTER TABLE public.business_verifications
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

NOTIFY pgrst, 'reload schema';
