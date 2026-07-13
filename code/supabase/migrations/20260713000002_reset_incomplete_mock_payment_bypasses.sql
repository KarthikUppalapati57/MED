-- Reset incomplete mock subscription bypasses so paid onboarding must collect a real Stripe payment method.
UPDATE public.profiles
SET payment_verified = false,
    payment_method_type = 'stripe_subscription',
    pending_payment_metadata = COALESCE(pending_payment_metadata, '{}'::jsonb) || jsonb_build_object(
      'provider', 'stripe',
      'previous_provider', 'mock_subscription',
      'requires_payment_method_collection', true,
      'reset_reason', 'mock_subscription_requires_stripe_payment_method',
      'reset_at', now()
    ),
    updated_at = now()
WHERE organization_id IS NULL
  AND COALESCE(payment_method_type, '') = 'mock_subscription'
  AND pending_checkout_session_id IS NULL;

NOTIFY pgrst, 'reload schema';
