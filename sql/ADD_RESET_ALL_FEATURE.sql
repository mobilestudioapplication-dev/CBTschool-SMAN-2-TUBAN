-- Function to reset device login for multiple users at once
CREATE OR REPLACE FUNCTION public.admin_reset_all_device_logins(p_user_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Reset login status for all provided user IDs
  UPDATE public.users
  SET 
    active_device_id = NULL,
    is_login_active = FALSE,
    last_device_info = NULL
  WHERE id = ANY(p_user_ids);
END;
$$;

-- Function to reset exam sessions (delete/restart) for multiple sessions at once
-- This might be useful if "Reset All" implies resetting the exam progress too
CREATE OR REPLACE FUNCTION public.admin_reset_all_exam_sessions(p_session_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Delete the sessions so students can start over
  -- OR update them to 'Mengerjakan' if just resuming?
  -- Usually "Reset" in exam context means "Delete attempt so they can start again"
  -- But let's be careful. The individual "Reset" button ONLY resets device login.
  -- So we will stick to device login reset for consistency.
  
  -- However, providing this function just in case we need a "Hard Reset" later.
  DELETE FROM public.student_exam_sessions
  WHERE id = ANY(p_session_ids);
END;
$$;
