-- 1. Drop the Foreign Key constraint causing the issue
-- This allows creating 'student' users in public.users without requiring them to exist in auth.users
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_id_fkey;

-- 2. Ensure ID generation is enabled (UUID)
CREATE EXTENSION IF NOT EXISTS pgcrypto;
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'users' 
          AND column_name = 'id' 
          AND column_default IS NULL
    ) THEN
        ALTER TABLE public.users ALTER COLUMN id SET DEFAULT gen_random_uuid();
    END IF;
END $$;

-- 3. Re-define the sync function (Idempotent) to ensure logic is correct
CREATE OR REPLACE FUNCTION public.sync_all_users(users_data JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    user_record JSONB;
    v_inserted INT := 0;
    v_updated INT := 0;
    v_deleted INT := 0;
    v_username TEXT;
    v_password TEXT;
    v_full_name TEXT;
    v_nisn TEXT;
    v_class TEXT;
    v_major TEXT;
    v_gender TEXT;
    v_religion TEXT;
    v_photo_url TEXT;
    v_existing_id UUID;
BEGIN
    FOR user_record IN SELECT * FROM jsonb_array_elements(users_data)
    LOOP
        v_username := user_record->>'username';
        v_password := COALESCE(user_record->>'password', user_record->>'nisn');
        v_full_name := COALESCE(user_record->>'full_name', user_record->>'fullName'); 
        v_nisn := user_record->>'nisn';
        v_class := user_record->>'class';
        v_major := user_record->>'major';
        v_gender := user_record->>'gender';
        v_religion := user_record->>'religion';
        v_photo_url := COALESCE(user_record->>'photo_url', user_record->>'photoUrl'); 

        v_existing_id := NULL;

        -- Check by NISN
        IF v_nisn IS NOT NULL AND v_nisn != '' THEN
            SELECT id INTO v_existing_id FROM public.users WHERE nisn = v_nisn LIMIT 1;
        END IF;

        -- Check by Username
        IF v_existing_id IS NULL THEN
            SELECT id INTO v_existing_id FROM public.users WHERE username = v_username LIMIT 1;
        END IF;

        IF v_existing_id IS NOT NULL THEN
            UPDATE public.users SET
                username = v_username,
                full_name = v_full_name,
                nisn = v_nisn,
                class = v_class,
                major = v_major,
                gender = v_gender,
                religion = v_religion,
                photo_url = v_photo_url,
                password_text = v_password,
                updated_at = NOW()
            WHERE id = v_existing_id;
            v_updated := v_updated + 1;
        ELSE
            INSERT INTO public.users (
                username, full_name, nisn, class, major, gender, religion, photo_url, password_text, role
            ) VALUES (
                v_username, v_full_name, v_nisn, v_class, v_major, v_gender, v_religion, v_photo_url, v_password, 'student'
            );
            v_inserted := v_inserted + 1;
        END IF;
    END LOOP;

    RETURN jsonb_build_object('inserted', v_inserted, 'updated', v_updated, 'deleted', v_deleted);
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_all_users(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_all_users(JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_all_users(JSONB) TO postgres;
