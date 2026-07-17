-- Adds a platform-admin review gate between payment and organization creation. Today,
-- performOnboarding() calls setup_onboarding_hierarchy() directly the moment payment
-- succeeds, creating organizations/brands/locations immediately with no review. New flow:
-- the tenant's hierarchy gets SUBMITTED for review (stored, not yet applied); a platform
-- admin Approves (runs the real setup_onboarding_hierarchy), Rejects (terminal, same
-- vocabulary as reject_business_verification), or Requests Resubmit (sends the tenant back
-- to the Hierarchy step -- no re-payment needed, payment_verified is untouched).
--
-- setup_onboarding_hierarchy() already has an admin-bypass auth check
-- (`auth.uid() != p_user_id AND get_auth_role() != 'platform_admin'`), so
-- approve_onboarding_hierarchy() can call it directly on the tenant's behalf without any
-- change to that function -- it was already built to allow this.
--
-- Deliberate scope decision: submit_onboarding_hierarchy_for_review() only re-checks the
-- same top-level preconditions setup_onboarding_hierarchy() checks (business verified,
-- payment verified) plus a non-empty-array sanity check. It does NOT duplicate that
-- function's full per-field validation (org/brand/location names, required addresses, etc.)
-- -- the frontend's own validateHierarchy() already blocks submission of incomplete data in
-- the normal path, and if malformed data somehow reaches approval anyway,
-- approve_onboarding_hierarchy() surfaces setup_onboarding_hierarchy()'s exception to the
-- admin, who can Reject or Request Resubmit with a note. Duplicating ~150 lines of nested
-- validation here was judged not worth the maintenance burden of keeping two copies in sync.

BEGIN;

CREATE TABLE public.onboarding_hierarchy_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id),
  hierarchy_payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_review'
    CHECK (status IN ('pending_review', 'approved', 'rejected', 'failed')),
  rejection_reason TEXT,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

CREATE INDEX idx_onboarding_hierarchy_submissions_status ON public.onboarding_hierarchy_submissions(status);

-- Internal-only table, same grant shape as onboarding_admin_actions: no direct
-- SELECT/INSERT/UPDATE/DELETE for anon/authenticated -- access only through the
-- SECURITY DEFINER RPCs below.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS hierarchy_review_status TEXT;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_hierarchy_review_status_check
  CHECK (hierarchy_review_status IS NULL OR hierarchy_review_status IN ('pending_review', 'approved', 'rejected', 'failed'));

CREATE OR REPLACE FUNCTION public.submit_onboarding_hierarchy_for_review(p_user_id uuid, p_hierarchy jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_business_status TEXT;
  v_payment_verified BOOLEAN;
  v_pending_payment_metadata JSONB;
  v_submission_id UUID;
  v_run_id UUID;
BEGIN
  IF auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Not authorized to submit hierarchy for another user';
  END IF;

  SELECT business_verification_status, payment_verified, pending_payment_metadata
  INTO v_business_status, v_payment_verified, v_pending_payment_metadata
  FROM public.profiles
  WHERE id = p_user_id;

  IF COALESCE(v_business_status, 'not_started') <> 'verified' THEN
    RAISE EXCEPTION 'Business verification must be completed before hierarchy setup';
  END IF;

  IF COALESCE(v_payment_verified, false) IS NOT TRUE
     AND COALESCE(v_pending_payment_metadata->>'provider', '') NOT IN ('free_plan', 'stripe') THEN
    RAISE EXCEPTION 'Payment method verification must be completed before hierarchy setup';
  END IF;

  IF p_hierarchy IS NULL OR COALESCE(jsonb_typeof(p_hierarchy), 'null') <> 'array' OR jsonb_array_length(p_hierarchy) = 0 THEN
    RAISE EXCEPTION 'Onboarding hierarchy must include at least one organization';
  END IF;

  INSERT INTO public.onboarding_hierarchy_submissions (user_id, hierarchy_payload, status, rejection_reason, reviewed_by, reviewed_at)
  VALUES (p_user_id, p_hierarchy, 'pending_review', NULL, NULL, NULL)
  ON CONFLICT (user_id) DO UPDATE
  SET hierarchy_payload = EXCLUDED.hierarchy_payload,
      status = 'pending_review',
      rejection_reason = NULL,
      reviewed_by = NULL,
      reviewed_at = NULL,
      updated_at = now()
  RETURNING id INTO v_submission_id;

  UPDATE public.profiles
  SET hierarchy_review_status = 'pending_review',
      onboarding_status = 'pending_review',
      onboarding_current_step = 'hierarchy_review',
      updated_at = now()
  WHERE id = p_user_id;

  INSERT INTO public.notifications(user_id, type, title, message, is_read)
  SELECT p.id, 'system', 'Tenant workspace pending review',
         COALESCE(p.full_name, p.email, 'A tenant') || ' submitted an organization hierarchy for review.', false
  FROM public.profiles p WHERE p.role = 'platform_admin';

  BEGIN
    v_run_id := public.get_or_create_onboarding_run(p_user_id);
    PERFORM public.record_onboarding_event(v_run_id, p_user_id, 'hierarchy_setup', 'submitted', 'pending_review', jsonb_build_object('submission_id', v_submission_id));
  EXCEPTION WHEN undefined_function THEN
    NULL;
  END;

  RETURN jsonb_build_object('success', true, 'status', 'pending_review', 'submission_id', v_submission_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.approve_onboarding_hierarchy(p_user_id uuid, p_note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_hierarchy JSONB;
  v_result JSONB;
BEGIN
  IF public.get_auth_role() <> 'platform_admin' THEN
    RAISE EXCEPTION 'Platform admin access required';
  END IF;

  SELECT hierarchy_payload INTO v_hierarchy
  FROM public.onboarding_hierarchy_submissions
  WHERE user_id = p_user_id AND status = 'pending_review';

  IF v_hierarchy IS NULL THEN
    RAISE EXCEPTION 'No pending hierarchy submission for this tenant';
  END IF;

  v_result := public.setup_onboarding_hierarchy(p_user_id, v_hierarchy);

  UPDATE public.onboarding_hierarchy_submissions
  SET status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
  WHERE user_id = p_user_id AND status = 'pending_review';

  UPDATE public.profiles SET hierarchy_review_status = 'approved' WHERE id = p_user_id;

  INSERT INTO public.notifications(user_id, organization_id, type, title, message, is_read)
  SELECT p_user_id, (v_result->>'primary_org_id')::uuid, 'system', 'Workspace approved',
         'Your organization workspace has been approved and created.', false;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reject_onboarding_hierarchy(p_user_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_run_id UUID;
BEGIN
  IF public.get_auth_role() <> 'platform_admin' THEN
    RAISE EXCEPTION 'Platform admin access required';
  END IF;

  IF NULLIF(btrim(COALESCE(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'A rejection reason is required';
  END IF;

  UPDATE public.onboarding_hierarchy_submissions
  SET status = 'rejected', rejection_reason = p_reason, reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
  WHERE user_id = p_user_id AND status = 'pending_review';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No pending hierarchy submission for this tenant';
  END IF;

  UPDATE public.profiles
  SET hierarchy_review_status = 'rejected',
      onboarding_status = 'blocked',
      updated_at = now()
  WHERE id = p_user_id;

  INSERT INTO public.notifications(user_id, type, title, message, is_read)
  VALUES (p_user_id, 'system', 'Workspace setup rejected', p_reason, false);

  BEGIN
    v_run_id := public.get_or_create_onboarding_run(p_user_id);
    PERFORM public.record_onboarding_event(v_run_id, p_user_id, 'hierarchy_setup', 'admin_rejected', 'rejected', jsonb_build_object('actor_user_id', auth.uid(), 'reason', p_reason));
  EXCEPTION WHEN undefined_function THEN
    NULL;
  END;

  RETURN jsonb_build_object('success', true, 'status', 'rejected');
END;
$function$;

CREATE OR REPLACE FUNCTION public.request_onboarding_hierarchy_resubmit(p_user_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_run_id UUID;
BEGIN
  IF public.get_auth_role() <> 'platform_admin' THEN
    RAISE EXCEPTION 'Platform admin access required';
  END IF;

  IF NULLIF(btrim(COALESCE(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Tell the tenant what needs to change';
  END IF;

  UPDATE public.onboarding_hierarchy_submissions
  SET status = 'failed', rejection_reason = p_reason, reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
  WHERE user_id = p_user_id AND status = 'pending_review';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No pending hierarchy submission for this tenant';
  END IF;

  UPDATE public.profiles
  SET hierarchy_review_status = 'failed',
      onboarding_status = 'blocked',
      onboarding_current_step = 'hierarchy_setup',
      updated_at = now()
  WHERE id = p_user_id;

  INSERT INTO public.notifications(user_id, type, title, message, is_read)
  VALUES (p_user_id, 'system', 'Workspace setup needs changes', p_reason, false);

  BEGIN
    v_run_id := public.get_or_create_onboarding_run(p_user_id);
    PERFORM public.record_onboarding_event(v_run_id, p_user_id, 'hierarchy_setup', 'more_info_requested', 'failed', jsonb_build_object('actor_user_id', auth.uid(), 'reason', p_reason));
  EXCEPTION WHEN undefined_function THEN
    NULL;
  END;

  RETURN jsonb_build_object('success', true, 'status', 'failed');
END;
$function$;

CREATE OR REPLACE FUNCTION public.platform_hierarchy_review_queue()
RETURNS SETOF public.onboarding_hierarchy_submissions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'platform_admin'
  ) THEN
    RAISE EXCEPTION 'platform_admin role required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT * FROM public.onboarding_hierarchy_submissions
  WHERE status IN ('pending_review', 'rejected', 'failed')
  ORDER BY created_at DESC
  LIMIT 200;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_onboarding_hierarchy_for_review(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_onboarding_hierarchy(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_onboarding_hierarchy(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_onboarding_hierarchy_resubmit(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_hierarchy_review_queue() TO authenticated;

COMMIT;
