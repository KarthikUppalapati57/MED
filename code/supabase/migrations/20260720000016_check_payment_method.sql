-- Adds "Check" as a third tenant subscription payment method alongside Card (Stripe) and
-- ACH (Dwolla). Unlike those two, a mailed paper check can't be verified electronically at
-- checkout time -- create-checkout-session (edge function, updated alongside this migration)
-- records the tenant's intent to pay by check but leaves profiles.payment_verified = false,
-- so the tenant is held on the Payment step (a dedicated "awaiting check" screen, not the
-- normal wizard) until a platform admin confirms the check actually arrived.
--
-- confirm_check_payment_received() is that admin-side confirmation -- the same shape as
-- approve_business_verification(): platform_admin only, flips payment_verified true, notifies
-- the tenant, and logs an onboarding_step_events row so this shows up alongside the other
-- onboarding history.

BEGIN;

ALTER TABLE public.profiles
  DROP CONSTRAINT profiles_payment_method_type_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_payment_method_type_check
  CHECK (payment_method_type IS NULL OR payment_method_type = ANY (ARRAY['card'::text, 'ach'::text, 'check'::text, 'free_plan'::text, 'mock_subscription'::text, 'stripe_subscription'::text, 'trial_coupon'::text]));

CREATE OR REPLACE FUNCTION public.confirm_check_payment_received(p_user_id uuid, p_note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_actor UUID := auth.uid();
  v_run_id UUID;
BEGIN
  IF public.get_auth_role() <> 'platform_admin' THEN
    RAISE EXCEPTION 'Platform admin access required';
  END IF;

  UPDATE public.profiles
  SET payment_verified = true,
      payment_method_verified_at = now(),
      pending_payment_metadata = COALESCE(pending_payment_metadata, '{}'::jsonb) || jsonb_build_object(
        'status', 'received',
        'confirmed_by', v_actor,
        'confirmed_at', now(),
        'note', p_note
      ),
      updated_at = now()
  WHERE id = p_user_id
    AND payment_method_type = 'check';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No pending check payment found for this tenant';
  END IF;

  INSERT INTO public.notifications(user_id, organization_id, type, title, message, is_read)
  SELECT p_user_id, organization_id, 'system', 'Check payment received',
         'Your check payment has been received and confirmed. You can continue setting up your workspace.', false
  FROM public.profiles WHERE id = p_user_id;

  v_run_id := public.get_or_create_onboarding_run(p_user_id);
  PERFORM public.record_onboarding_event(v_run_id, p_user_id, 'payment_method', 'completed', 'check_received', jsonb_build_object('actor_user_id', v_actor, 'note', p_note));

  RETURN jsonb_build_object('success', true, 'status', 'payment_verified');
END;
$function$;

GRANT EXECUTE ON FUNCTION public.confirm_check_payment_received(uuid, text) TO authenticated;

COMMIT;
