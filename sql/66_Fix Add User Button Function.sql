
-- =================================================================
-- FIX_ADD_USER_BUTTON.sql
-- TUJUAN: Memperbaiki tombol Simpan/Tambah User yang macet.
-- MASALAH: Frontend mengirim parameter 'p_role' tapi database belum siap.
-- =================================================================

BEGIN;

-- 1. Refresh Cache Schema (Penting agar API Supabase sadar ada perubahan)
NOTIFY pgrst, 'reload config';

-- 2. Hapus versi fungsi lama untuk menghindari konflik (Overloading)
DROP FUNCTION IF EXISTS public.admin_upsert_user(uuid, text, text, text, text, text, text, text, text, text);
DROP FUNCTION IF EXISTS public.admin_upsert_user(uuid, text, text, text, text, text, text, text, text, text, text);

-- 3. Buat Ulang Fungsi admin_upsert_user (Versi Kompatibel Penuh)
-- Menggunakan DEFAULT NULL untuk parameter agar tidak error jika ada yang kosong.
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
  p_role text DEFAULT 'student' -- Parameter ini yang sering menyebabkan error jika hilang
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

  -- Logika Guru: Jika class kosong, set STAFF otomatis
  IF v_final_role = 'teacher' THEN
    IF p_class IS NULL OR p_class = '' OR p_class = 'Belum diatur' THEN
        v_final_class := 'STAFF';
    END IF;
  END IF;

  -- Validasi Role (Safety check)
  IF v_final_role NOT IN ('student', 'teacher', 'admin') THEN
     v_final_role := 'student';
  END IF;

  IF p_id IS NOT NULL THEN
    -- === UPDATE USER ===
    v_user_id := p_id;

    -- Update Auth Users (Metadata & Login)
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

    -- Update Password HANYA JIKA DIISI
    IF p_password IS NOT NULL AND p_password <> '' THEN
      UPDATE auth.users SET encrypted_password = crypt(p_password, gen_salt('bf')) WHERE id = v_user_id;
    END IF;

    -- Update Public Users (Data Tampilan)
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
      password_text = COALESCE(p_password, password_text), -- Update password text jika ada baru
      updated_at = now()
    WHERE id = v_user_id;

  ELSE
    -- === INSERT USER BARU ===
    v_user_id := uuid_generate_v4();
    
    -- Insert ke Auth Users
    INSERT INTO auth.users (
      id, email, encrypted_password, email_confirmed_at, raw_user_meta_data, aud, role
    )
    VALUES (
      v_user_id,
      p_username,
      crypt(COALESCE(p_password, p_nisn, '123456'), gen_salt('bf')), -- Default password jika kosong
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
    
    -- Insert ke Public Users (Menggunakan ON CONFLICT untuk keamanan ganda)
    INSERT INTO public.users (
        id, username, full_name, nisn, class, major, gender, religion, photo_url, role, password_text
    ) VALUES (
        v_user_id, p_username, p_full_name, p_nisn, v_final_class, p_major, p_gender, p_religion, p_photo_url, v_final_role, p_password
    )
    ON CONFLICT (id) DO UPDATE SET
        username = EXCLUDED.username,
        full_name = EXCLUDED.full_name,
        class = EXCLUDED.class,
        role = EXCLUDED.role;
        
  END IF;

  RETURN v_user_id;
END;
$$;

-- 4. Berikan Izin Eksekusi
GRANT EXECUTE ON FUNCTION public.admin_upsert_user TO authenticated, service_role;

COMMIT;

SELECT 'Sukses! Fungsi Simpan User telah diperbaiki.' as status;
