-- Restore the legacy vendor phone field expected by the vendor onboarding UI.
-- Some live environments were missing this column even though older schema files
-- and current vendor pages still read/write vendors.phone.
ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS phone TEXT;
