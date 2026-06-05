-- ============================================================
-- Migration 055: Fix admin_delete_user RPC Storage Constraint
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_delete_user(target_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    caller_role TEXT;
    v_email TEXT;
    v_full_name TEXT;
    v_role TEXT;
BEGIN
    -- 1. Check if caller is authenticated
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- 2. Verify the caller is a platform_admin
    caller_role := COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '');
    
    IF caller_role != 'platform_admin' THEN
        RAISE EXCEPTION 'Insufficient permissions: only platform_admin can delete users permanently';
    END IF;

    -- 3. Prevent self-deletion via this route
    IF target_user_id = auth.uid() THEN
        RAISE EXCEPTION 'You cannot delete your own account.';
    END IF;

    -- 4. Gather user details before deletion for the archive
    SELECT email, full_name, role INTO v_email, v_full_name, v_role
    FROM public.profiles
    WHERE id = target_user_id;

    -- If profile was missing, fallback to auth.users for email
    IF v_email IS NULL THEN
        SELECT email INTO v_email FROM auth.users WHERE id = target_user_id;
    END IF;

    -- 5. Archive the user
    INSERT INTO public.archived_users (original_user_id, email, full_name, role, deleted_by)
    VALUES (target_user_id, v_email, v_full_name, v_role, auth.uid());

    -- 6. Detach any files the user uploaded to prevent Foreign Key constraints from blocking deletion
    UPDATE storage.objects SET owner = NULL WHERE owner = target_user_id;

    -- 7. Delete the user from auth.users
    -- Because this function is SECURITY DEFINER, it runs with the privileges 
    -- of the user who created it (postgres superuser during migrations),
    -- allowing it to safely bypass the auth schema restrictions.
    DELETE FROM auth.users WHERE id = target_user_id;

    RETURN jsonb_build_object('success', true);
END;
$$;
