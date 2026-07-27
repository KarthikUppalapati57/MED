-- Acceptance test for 20260727160000_fix_count_sessions_status_check_saved_closed.sql
-- Proves count_sessions.status accepts 'saved'/'closed' (what
-- save_inventory_count_session/close_inventory_count_session actually write) and still
-- rejects invalid values. Self-cleaning single DO block (rather than this repo's usual
-- BEGIN;...ROLLBACK; wrapper) so it also runs via tools that execute one statement at a
-- time; still safe to run under BEGIN/ROLLBACK too.
DO $$
DECLARE
  v_org uuid := gen_random_uuid();
  v_session_id uuid;
  v_rejected boolean := false;
BEGIN
  INSERT INTO public.organizations (id, name, slug)
  VALUES (v_org, 'Count Session Status Test Org', 'count-session-status-test-' || replace(v_org::text, '-', ''));

  INSERT INTO public.count_sessions (organization_id, status, items, total_value, item_count)
  VALUES (v_org, 'saved', '[]'::jsonb, 0, 0)
  RETURNING id INTO v_session_id;

  UPDATE public.count_sessions SET status = 'closed' WHERE id = v_session_id;

  ASSERT (SELECT status FROM public.count_sessions WHERE id = v_session_id) = 'closed',
    'status must accept saved -> closed, the values save_inventory_count_session/close_inventory_count_session actually write';

  BEGIN
    INSERT INTO public.count_sessions (organization_id, status, items, total_value, item_count)
    VALUES (v_org, 'not_a_real_status', '[]'::jsonb, 0, 0);
    v_rejected := false;
  EXCEPTION WHEN check_violation THEN
    v_rejected := true;
  END;

  ASSERT v_rejected, 'an invalid status must still be rejected by the check constraint';

  DELETE FROM public.organizations WHERE id = v_org;
  RAISE NOTICE 'fix_count_sessions_status_check_saved_closed_acceptance: PASSED';
EXCEPTION WHEN OTHERS THEN
  DELETE FROM public.organizations WHERE id = v_org;
  RAISE;
END $$;
