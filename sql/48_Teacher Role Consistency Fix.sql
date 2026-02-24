
-- =================================================================
-- FIX_TEACHER_ROLE.sql
-- PERBAIKAN: KONSISTENSI ROLE GURU (DB & AUTH)
-- =================================================================

BEGIN;

-- 1. UPDATE TRIGGER handle_new_user
-- Agar saat user dibuat, role dari metadata langsung masuk ke public.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role text;
  v_class text;
BEGIN
  -- Ambil role dan class dari metadata
  v_role := COALESCE(new.raw_user_meta_data ->> 'role', 'student');
  v_class := COALESCE(new.raw_user_meta_data ->> 'class', '');

  -- Logika fallback untuk Class
  IF v_role = 'teacher' AND (v_class = '' OR v_class IS NULL OR v_class = 'Belum diatur') THEN
    v_class := 'STAFF';
  ELSIF v_class = '' OR v_class IS NULL THEN
    v_class := 'Belum diatur';
  END IF;

  INSERT INTO public.users (
    id, username, full_name, nisn, class, major, gender, religion, photo_url, role, password_text, qr_login_password
  )
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data ->> 'full_name', 'Nama Belum Diatur'),
    COALESCE(new.raw_user_meta_data ->> 'nisn', split_part(new.email, '@', 1)),
    v_class, -- Gunakan v_class yang sudah diproses
    COALESCE(new.raw_user_meta_data ->> 'major', 'Belum diatur'),
    COALESCE(new.raw_user_meta_data ->> 'gender', 'Laki-laki'),
    COALESCE(new.raw_user_meta_data ->> 'religion', 'Islam'),
    COALESCE(new.raw_user_meta_data ->> 'photo_url', ''),
    v_role, -- Gunakan v_role
    new.raw_user_meta_data ->> 'password_text',
    new.raw_user_meta_data ->> 'password_text'
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role, -- Update role jika conflict
    class = EXCLUDED.class, -- Update class jika conflict
    major = EXCLUDED.major, -- Update mapel/jurusan
    username = EXCLUDED.username,
    updated_at = now();
  RETURN new;
END;
$$;

-- 2. UPDATE FUNGSI ADMIN UPSERT
-- Memastikan role ditulis ke Metadata (Auth) DAN Tabel Public
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
  -- FIX: Jangan langsung COALESCE p_class di sini agar kita bisa cek null-nya
  v_final_class text := p_class;
BEGIN
  IF NOT (SELECT auth.email() = 'admin@cbtschool.com') THEN
    RAISE EXCEPTION '403: Forbidden';
  END IF;

  -- Validasi Role
  IF v_final_role NOT IN ('student', 'teacher', 'admin') THEN
     v_final_role := 'student';
  END IF;

  -- Logika Class Berdasarkan Role
  IF v_final_role = 'teacher' THEN
    -- Jika guru, class default STAFF
    IF v_final_class IS NULL OR v_final_class = '' OR v_final_class = 'Belum diatur' THEN
        v_final_class := 'STAFF';
    END IF;
  ELSE
    -- Jika siswa, default Belum diatur
    IF v_final_class IS NULL OR v_final_class = '' THEN
        v_final_class := 'Belum diatur';
    END IF;
  END IF;

  IF p_id IS NOT NULL THEN
    v_user_id := p_id;

    -- UPDATE AUTH (PENTING: Tulis Role ke Metadata)
    UPDATE auth.users
    SET
      email = p_username,
      raw_user_meta_data = jsonb_build_object(
        'full_name', p_full_name,
        'nisn', p_nisn,
        'class', v_final_class,
        'major', p_major, -- Mapel Guru
        'gender', p_gender,
        'religion', p_religion,
        'photo_url', p_photo_url,
        'role', v_final_role, -- ROLE UTAMA
        'password_text', p_password
      ),
      updated_at = now()
    WHERE id = v_user_id;

    IF p_password IS NOT NULL AND p_password <> '' THEN
      UPDATE auth.users SET encrypted_password = crypt(p_password, gen_salt('bf')) WHERE id = v_user_id;
    END IF;

    -- UPDATE PUBLIC
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
        'role', v_final_role, -- ROLE UTAMA
        'password_text', p_password
      ),
      'authenticated',
      'authenticated'
    );
    
    -- Force Insert Public (Double Check)
    INSERT INTO public.users (id, username, full_name, role, class, major, gender, religion, nisn, photo_url, password_text)
    VALUES (
        v_user_id, p_username, p_full_name, v_final_role, v_final_class, p_major, p_gender, p_religion, p_nisn, p_photo_url, p_password
    )
    ON CONFLICT (id) DO UPDATE SET
        role = v_final_role,
        class = v_final_class,
        major = p_major;
  END IF;

  RETURN v_user_id;
END;
$$;

-- 3. PERBAIKAN DATA (REPAIR EXISTING TEACHERS)
-- Memastikan semua user yang role-nya 'teacher' di public, juga 'teacher' di auth metadata
-- Dan class-nya adalah STAFF
DO $$
BEGIN
  -- Update metadata auth.users agar sesuai dengan public.users
  UPDATE auth.users au
  SET raw_user_meta_data = jsonb_set(
      COALESCE(raw_user_meta_data, '{}'::jsonb),
      '{role}',
      '"teacher"'
  )
  FROM public.users pu
  WHERE au.id = pu.id AND pu.role = 'teacher';

  -- Update class guru menjadi STAFF jika masih 'Belum diatur'
  UPDATE public.users
  SET class = 'STAFF'
  WHERE role = 'teacher' AND (class IS NULL OR class = '' OR class = 'Belum diatur');
  
  -- Sinkronkan class di metadata juga
  UPDATE auth.users au
  SET raw_user_meta_data = jsonb_set(
      COALESCE(raw_user_meta_data, '{}'::jsonb),
      '{class}',
      '"STAFF"'
  )
  FROM public.users pu
  WHERE au.id = pu.id AND pu.role = 'teacher';
  
END $$;

COMMIT;

SELECT 'Role Guru & Logika Class Berhasil Diperbaiki (Revisi v2)' as status;
