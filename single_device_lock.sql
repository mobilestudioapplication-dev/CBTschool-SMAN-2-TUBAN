-- 1. Add active_session_token column to users table
-- This token will store the unique ID of the device/browser currently logged in
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'active_session_token') THEN
        ALTER TABLE users ADD COLUMN active_session_token TEXT;
    END IF;
END $$;

-- 2. RPC to Claim Session (Login and Lock Device)
-- When a user logs in, this function is called with a new random token.
-- It invalidates any previous session by overwriting the token.
CREATE OR REPLACE FUNCTION claim_session(p_user_id UUID, p_session_token TEXT)
RETURNS VOID AS $$
BEGIN
    UPDATE users
    SET 
        active_session_token = p_session_token,
        updated_at = NOW()
    WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. RPC to Validate Session
-- Can be used for periodic checks if Realtime is not available
CREATE OR REPLACE FUNCTION validate_session(p_user_id UUID, p_session_token TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    v_current_token TEXT;
BEGIN
    SELECT active_session_token INTO v_current_token
    FROM users
    WHERE id = p_user_id;
    
    RETURN v_current_token = p_session_token;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. RPC to Logout (Clear Session)
CREATE OR REPLACE FUNCTION clear_session(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE users
    SET active_session_token = NULL
    WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Grant Permissions
GRANT EXECUTE ON FUNCTION claim_session(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION claim_session(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION claim_session(UUID, TEXT) TO anon;

GRANT EXECUTE ON FUNCTION validate_session(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION validate_session(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION validate_session(UUID, TEXT) TO anon;

GRANT EXECUTE ON FUNCTION clear_session(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION clear_session(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION clear_session(UUID) TO anon;
