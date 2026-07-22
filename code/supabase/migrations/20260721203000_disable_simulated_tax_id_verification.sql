-- Disable simulated EIN/SSN verification in production settings.
-- Contact verification and platform-admin review remain active; tax-id vaulting is only used
-- when a platform admin intentionally re-enables these toggles after connecting a real provider.

ALTER TABLE public.platform_onboarding_settings
  ALTER COLUMN ein_verification_enabled SET DEFAULT false,
  ALTER COLUMN ssn_verification_enabled SET DEFAULT false;

UPDATE public.platform_onboarding_settings
SET ein_verification_enabled = false,
    ssn_verification_enabled = false,
    updated_at = now()
WHERE id = true;