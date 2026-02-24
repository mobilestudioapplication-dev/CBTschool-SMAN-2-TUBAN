
-- =================================================================
-- MODUL UPDATE: FUNGSI UPSERT USER DENGAN DUKUNGAN ROLE
-- Jalankan script ini di SQL Editor Supabase
-- =================================================================

CREATE OR REPLACE FUNCTION public.admin_upsert_user(
  p_id uuid,
  p_username text,
  p_password text,
  p_full_name text,
  p_nisn text,
  p_class text,
  p_major text,
  p_gender text,
  p_religion text,
  p_photo_url text,
  p_role text DEFAULT 'student' -- Parameter Baru
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER 
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id uuid;
  v_final_role text := p_role;
  v_final_class text := p_class;
BEGIN
  -- Validasi Admin
  IF NOT (SELECT auth.email() = 'admin@cbtschool.com') THEN
    RAISE EXCEPTION '403: Forbidden - Hanya admin yang boleh mengubah data.';
  END IF;

  -- Logika Default untuk Guru
  IF v_final_role = 'teacher' THEN
    v_final_class := 'STAFF'; -- Marker khusus untuk guru di kolom class
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

    -- Update Password jika ada
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
      crypt(p_password, gen_salt('bf')),
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
    
    -- Trigger handle_new_user akan mengisi public.users, 
    -- TAPI trigger default mungkin belum handle 'role'. 
    -- Kita update manual public.users untuk memastikan role masuk benar.
    -- (Tunggu sebentar agar trigger selesai atau gunakan ON CONFLICT di trigger yg sudah diupdate sebelumnya)
    
    -- Force update role di public.users untuk memastikan konsistensi
    UPDATE public.users 
    SET role = v_final_role, class = v_final_class 
    WHERE id = v_user_id;
    
  END IF;

  RETURN v_user_id;
END;
$$;

SELECT 'Fungsi admin_upsert_user berhasil diperbarui dengan dukungan Role.' as status;
