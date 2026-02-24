
-- =================================================================
-- SQL_FIX_TEACHER_IMPORT.sql
-- MODUL: PERBAIKAN LOGIC IMPORT & LOGIN GURU (ENTERPRISE)
-- Jalankan script ini di SQL Editor Supabase
-- =================================================================

BEGIN;

-- 1. Pastikan ekstensi enkripsi aktif
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. UPDATE FUNGSI IMPORT (AGAR CERDAS MENDETEKSI GURU)
CREATE OR REPLACE FUNCTION public.admin_import_users(users_data json)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  updated_count int;
  inserted_count int;
  v_domain text;
  v_teacher_domain text;
BEGIN
  -- Validasi Admin
  IF NOT (SELECT auth.email() = 'admin@cbtschool.com') THEN
    RAISE EXCEPTION '403: Forbidden';
  END IF;

  -- Ambil Domain Sekolah
  SELECT COALESCE(NULLIF(school_domain, ''), 'smpn2demak.sch.id') INTO v_domain FROM public.app_config LIMIT 1;
  v_teacher_domain := 'teacher.' || v_domain;

  -- Buat tabel sementara
  CREATE TEMP TABLE incoming_users_import (
    "username" text,
    "password" text,
    "fullName" text,
    "nisn" text,
    "class" text,
    "major" text,
    "gender" text,
    "religion" text,
    "photoUrl" text,
    "role" text
  ) ON COMMIT DROP;

  INSERT INTO incoming_users_import
  SELECT * FROM json_populate_recordset(null::incoming_users_import, users_data);
  
  -- NORMALISASI DATA
  -- 1. Jika Role kosong, default ke student
  UPDATE incoming_users_import SET role = 'student' WHERE role IS NULL OR role = '';
  
  -- 2. Jika Guru, pastikan Kelas = STAFF (jika kosong)
  UPDATE incoming_users_import SET class = 'STAFF' WHERE role = 'teacher' AND (class IS NULL OR class = '');

  -- 3. Jika Guru, Username tidak boleh kosong. Jika Siswa, NISN tidak boleh kosong.
  IF EXISTS (SELECT 1 FROM incoming_users_import WHERE role = 'student' AND (nisn IS NULL OR nisn = '')) THEN
    RAISE EXCEPTION 'Data Siswa Invalid: NISN wajib diisi.';
  END IF;
  
  IF EXISTS (SELECT 1 FROM incoming_users_import WHERE role = 'teacher' AND (username IS NULL OR username = '')) THEN
    RAISE EXCEPTION 'Data Guru Invalid: Username wajib diisi.';
  END IF;

  -- =========================================================
  -- LOGIKA UPDATE (UPSERT)
  -- =========================================================
  
  -- A. Update Auth Users (Login)
  UPDATE auth.users au
  SET 
    -- LOGIKA EMAIL PINTAR:
    -- Jika Guru: username@teacher.domain
    -- Jika Siswa: nisn@domain
    email = CASE 
        WHEN i.role = 'teacher' THEN i."username" || '@' || v_teacher_domain
        ELSE i."nisn" || '@' || v_domain 
    END,
    encrypted_password = crypt(i."password", gen_salt('bf')),
    email_confirmed_at = now(),
    raw_user_meta_data = jsonb_build_object(
          'full_name', i."fullName",
          'nisn', i."nisn",
          'class', i."class",
          'major', i."major",
          'role', i."role",
          'password_text', i."password"
    ),
    updated_at = now()
  FROM incoming_users_import i
  JOIN public.users pu ON (
      -- Kunci Unik: Jika siswa pakai NISN, Jika Guru pakai Username
      (i.role = 'student' AND pu.nisn = i.nisn) OR 
      (i.role = 'teacher' AND pu.username = i.username)
  )
  WHERE au.id = pu.id;

  -- B. Update Public Users (Profil)
  WITH updated_public_users AS (
      UPDATE public.users pu
      SET
        full_name = i."fullName",
        class = i."class",
        major = i."major",
        gender = i."gender",
        religion = i."religion",
        photo_url = COALESCE(i."photoUrl", pu.photo_url),
        password_text = i."password",
        qr_login_password = i."password",
        role = i."role",
        updated_at = now()
      FROM incoming_users_import i
      WHERE (i.role = 'student' AND pu.nisn = i.nisn) OR (i.role = 'teacher' AND pu.username = i.username)
      RETURNING pu.id
  )
  SELECT count(*) INTO updated_count FROM updated_public_users;

  -- =========================================================
  -- LOGIKA INSERT BARU
  -- =========================================================
  
  WITH new_auth_users AS (
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at, 
      raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at
    )
    SELECT
      uuid_generate_v4(),
      '00000000-0000-0000-0000-000000000000',
      -- Generate Email
      CASE 
        WHEN i.role = 'teacher' THEN i."username" || '@' || v_teacher_domain
        ELSE i."nisn" || '@' || v_domain 
      END,
      crypt(i."password", gen_salt('bf')),
      now(),
      '{"provider": "email", "providers": ["email"]}'::jsonb,
      jsonb_build_object(
          'full_name', i."fullName",
          'nisn', i."nisn",
          'class', i."class",
          'major', i."major",
          'gender', i."gender",
          'religion', i."religion",
          'photo_url', COALESCE(i."photoUrl", 'https://ui-avatars.com/api/?name=' || i."fullName"),
          'password_text', i."password",
          'role', i."role"
      ),
      'authenticated',
      'authenticated',
      now(),
      now()
    FROM incoming_users_import i
    WHERE NOT EXISTS (
        SELECT 1 FROM public.users pu 
        WHERE (i.role = 'student' AND pu.nisn = i.nisn) OR (i.role = 'teacher' AND pu.username = i.username)
    )
    RETURNING id, email, raw_user_meta_data
  )
  -- Insert ke Public Users
  INSERT INTO public.users (id, username, full_name, nisn, class, major, gender, religion, photo_url, password_text, qr_login_password, role)
  SELECT 
    nau.id,
    -- Untuk Public Users:
    -- Guru: Username biasa (misal: 'pakbudi') agar enak dilihat
    -- Siswa: NISN (misal: '12345')
    CASE 
        WHEN (nau.raw_user_meta_data->>'role') = 'teacher' THEN split_part(nau.email, '@', 1) 
        ELSE (nau.raw_user_meta_data->>'nisn')
    END,
    (nau.raw_user_meta_data->>'full_name'),
    (nau.raw_user_meta_data->>'nisn'),
    (nau.raw_user_meta_data->>'class'),
    (nau.raw_user_meta_data->>'major'),
    (nau.raw_user_meta_data->>'gender'),
    (nau.raw_user_meta_data->>'religion'),
    (nau.raw_user_meta_data->>'photo_url'),
    (nau.raw_user_meta_data->>'password_text'),
    (nau.raw_user_meta_data->>'password_text'),
    (nau.raw_user_meta_data->>'role')
  FROM new_auth_users nau;

  SELECT count(*) INTO inserted_count FROM incoming_users_import i 
  WHERE NOT EXISTS (
      SELECT 1 FROM public.users pu 
      WHERE (i.role = 'student' AND pu.nisn = i.nisn) OR (i.role = 'teacher' AND pu.username = i.username)
  ); 

  -- 3. INSERT IDENTITIES (CRITICAL FIX FOR LOGIN)
  INSERT INTO auth.identities (
    id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
  )
  SELECT
    uuid_generate_v4(),
    au.id,
    jsonb_build_object('sub', au.id, 'email', au.email),
    'email',
    au.email,
    now(), now(), now()
  FROM auth.users au
  WHERE NOT EXISTS (SELECT 1 FROM auth.identities WHERE user_id = au.id);

  RETURN json_build_object(
    'success', true,
    'updated', updated_count,
    'inserted', inserted_count,
    'total', updated_count + inserted_count
  );
END;
$$;

COMMIT;

SELECT 'Sistem Import Guru & Siswa Berhasil Diperbarui.' as status;
