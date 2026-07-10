-- Platform onboarding review selects invitations.status directly.
-- Keep a physical compatibility column while invite-detail RPCs continue deriving active/expired/closed states.
ALTER TABLE public.invitations
  ADD COLUMN IF NOT EXISTS status TEXT;

UPDATE public.invitations
SET status = CASE
  WHEN accepted_at IS NOT NULL THEN 'accepted'
  WHEN closed_at IS NOT NULL THEN 'closed'
  WHEN expires_at IS NOT NULL AND expires_at <= now() THEN 'expired'
  ELSE COALESCE(status, 'pending')
END
WHERE status IS NULL
   OR accepted_at IS NOT NULL
   OR closed_at IS NOT NULL
   OR (expires_at IS NOT NULL AND expires_at <= now());

NOTIFY pgrst, 'reload schema';
