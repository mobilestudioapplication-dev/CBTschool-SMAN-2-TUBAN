
-- =================================================================
-- FIX_RPC_AND_LOGIN.sql
-- 1. Perbaikan Fungsi Simpan User (Mengatasi Error "Could not find function")
-- 2. Perbaikan Trigger agar Role Guru tersimpan otomatis
-- =================================================================

BEGIN;

-- 1. Refresh Cache Schema (PENTING)
NOTIFY pgrst, 'reload config';

-- 2. Hapus fungsi lama (Bersihkan semua variasi)
DROP FUNCTION IF EXISTS public.admin_upsert_user(uuid, text, text, text, text, text, text, text, text, text);
DROP FUNCTION IF EXISTS public.admin_upsert_user(uuid, text, text, text, text, text, text, text, text, text, text);

-- 3. Buat Ulang Fungsi admin_upsert_user (FINAL VERSION)
-- Menggunakan DEFAULT NULL agar fleksibel terhadap parameter yang dikirim frontend
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

  -- Logika Khusus Guru
  IF v_final_role = 'teacher' THEN
    -- Guru defaultnya kelas STAFF jika tidak diisi
    IF v_final_class IS NULL OR v_final_class = '' OR v_final_class = 'Belum diatur' THEN
        v_final_class := 'STAFF';
    END IF;
  END IF;

  IF p_id IS NOT NULL THEN
    -- === UPDATE USER ===
    v_user_id := p_id;

    -- Update Auth (Metadata)
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
        'role', v_final_role,
        'password_text', p_password 
      ),
      updated_at = now()
    WHERE id = v_user_id;

    -- Update Password jika diisi
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
      password_text = COALESCE(p_password, password_text),
      updated_at = now()
    WHERE id = v_user_id;

  ELSE
    -- === INSERT USER BARU ===
    v_user_id := uuid_generate_v4();
    
    INSERT INTO auth.users (
      id, email, encrypted_password, email_confirmed_at, raw_user_meta_data, aud, role
    )
    VALUES (
      v_user_id,
      p_username,
      crypt(COALESCE(p_password, p_nisn, '123456'), gen_salt('bf')),
      now(),
      jsonb_build_object(
        'full_name', p_full_name,
        'nisn', p_nisn,
        'class', v_final_class,
        'major', p_major,
        'gender', p_gender,
        'religion', p_religion,
        'photo_url', p_photo_url,
        'role', v_final_role,
        'password_text', p_password
      ),
      'authenticated',
      'authenticated'
    );
    
    -- Insert ke Public Users (Memastikan Role masuk)
    INSERT INTO public.users (id, username, full_name, role, class, major, gender, religion, nisn, photo_url, password_text)
    VALUES (
        v_user_id, p_username, p_full_name, v_final_role, v_final_class, p_major, p_gender, p_religion, p_nisn, p_photo_url, p_password
    )
    ON CONFLICT (id) DO UPDATE SET
        role = v_final_role,
        class = v_final_class,
        major = p_major,
        username = EXCLUDED.username;
    
  END IF;

  RETURN v_user_id;
END;
$$;

-- 4. Grant Permission
GRANT EXECUTE ON FUNCTION public.admin_upsert_user TO authenticated, service_role;

COMMIT;

SELECT 'Fungsi Simpan User Berhasil Diperbaiki.' as status;
