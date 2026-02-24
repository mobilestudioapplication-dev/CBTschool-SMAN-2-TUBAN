
-- =================================================================
-- FIX RPC FINAL: admin_upsert_user
-- Menggunakan DEFAULT NULL untuk semua parameter agar fleksibel
-- dan mencegah error "Could not find function" jika parameter null/missing.
-- =================================================================

BEGIN;

-- 1. Refresh Cache Schema
NOTIFY pgrst, 'reload config';

-- 2. Hapus versi lama (Clean Slate)
DROP FUNCTION IF EXISTS public.admin_upsert_user(uuid, text, text, text, text, text, text, text, text, text);
DROP FUNCTION IF EXISTS public.admin_upsert_user(uuid, text, text, text, text, text, text, text, text, text, text);

-- 3. Buat Fungsi Baru dengan DEFAULT NULL untuk semua parameter
CREATE OR REPLACE FUNCTION public.admin_upsert_user(
  p_id uuid DEFAULT NULL,
  p_username text DEFAULT NULL,
  p_password text DEFAULT NULL,
  p_full_name text DEFAULT NULL,
  p_nisn text DEFAULT NULL,
  p_class text DEFAULT NULL,
  p_major text DEFAULT NULL,
  p_gender text DEFAULT NULL,
  p_religion text DEFAULT NULL,
  p_photo_url text DEFAULT NULL,
  p_role text DEFAULT 'student'
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER 
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id uuid;
  v_final_role text := COALESCE(p_role, 'student');
  v_final_class text := COALESCE(p_class, 'Belum diatur');
BEGIN
  -- Validasi Admin
  IF NOT (SELECT auth.email() = 'admin@cbtschool.com') THEN
    RAISE EXCEPTION '403: Forbidden - Hanya admin yang boleh mengubah data.';
  END IF;

  -- Logika Default untuk Guru
  IF v_final_role = 'teacher' THEN
    -- Jika guru, class biasanya STAFF, tapi jika admin input spesifik, biarkan.
    -- Jika kosong, set STAFF.
    IF p_class IS NULL OR p_class = '' THEN
        v_final_class := 'STAFF';
    END IF;
  END IF;

  -- Validasi Role
  IF v_final_role NOT IN ('student', 'teacher', 'admin') THEN
     v_final_role := 'student';
  END IF;

  IF p_id IS NOT NULL THEN
    -- === UPDATE ===
    v_user_id := p_id;

    -- Update Auth Meta
    UPDATE auth.users
    SET
      email = p_username,
      raw_user_meta_data = jsonb_build_object(
        'full_name', p_full_name,
        'nisn', p_nisn,
        'class', v_final_class,
        'major', p_major,
        'gender', p_gender,
        'religion', p_religion,
        'photo_url', p_photo_url,
        'role', v_final_role
      ),
      updated_at = now()
    WHERE id = v_user_id;

    -- Update Password HANYA JIKA DIISI
    IF p_password IS NOT NULL AND p_password <> '' THEN
      UPDATE auth.users
      SET encrypted_password = crypt(p_password, gen_salt('bf'))
      WHERE id = v_user_id;
    END IF;

    -- Update Public Table
    UPDATE public.users
    SET
      username = p_username,
      full_name = p_full_name,
      nisn = p_nisn,
      class = v_final_class,
      major = p_major,
      gender = p_gender,
      religion = p_religion,
      photo_url = p_photo_url,
      role = v_final_role,
      updated_at = now()
    WHERE id = v_user_id;

  ELSE
    -- === INSERT ===
    v_user_id := uuid_generate_v4();
    
    INSERT INTO auth.users (
      id, email, encrypted_password, email_confirmed_at, raw_user_meta_data, aud, role
    )
    VALUES (
      v_user_id,
      p_username,
      crypt(COALESCE(p_password, p_nisn, '123456'), gen_salt('bf')), -- Default pass jika kosong
      now(),
      jsonb_build_object(
        'full_name', p_full_name,
        'nisn', p_nisn,
        'class', v_final_class,
        'major', p_major,
        'gender', p_gender,
        'religion', p_religion,
        'photo_url', p_photo_url,
        'role', v_final_role
      ),
      'authenticated',
      'authenticated'
    );
    
    -- Force update role di public.users untuk memastikan konsistensi
    -- (Trigger handle_new_user mungkin belum mengcover role atau ada delay)
    -- Kita gunakan ON CONFLICT untuk safety jika trigger sudah duluan
    INSERT INTO public.users (id, username, full_name, role, class, major, gender, religion, nisn, photo_url)
    VALUES (
        v_user_id, p_username, p_full_name, v_final_role, v_final_class, p_major, p_gender, p_religion, p_nisn, p_photo_url
    )
    ON CONFLICT (id) DO UPDATE SET
        role = v_final_role,
        class = v_final_class,
        username = EXCLUDED.username,
        full_name = EXCLUDED.full_name;
    
  END IF;

  RETURN v_user_id;
END;
$$;

-- 4. Grant Permission (Just in case)
GRANT EXECUTE ON FUNCTION public.admin_upsert_user TO authenticated, service_role;

COMMIT;

SELECT 'Fungsi admin_upsert_user DIPERBAIKI (Default Params). Silakan coba simpan user lagi.' as status;
