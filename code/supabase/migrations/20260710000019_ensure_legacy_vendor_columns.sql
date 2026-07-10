-- Ensure legacy columns exist so that triggers and legacy queries do not fail
-- The trigger neutralize_vendor_bank_details requires bank_details to exist on the NEW record.
ALTER TABLE public.vendors 
  ADD COLUMN IF NOT EXISTS contact_name TEXT,
  ADD COLUMN IF NOT EXISTS bank_details JSONB DEFAULT '{}'::jsonb;
