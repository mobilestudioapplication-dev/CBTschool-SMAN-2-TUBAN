
-- =================================================================
-- FIX_IMPORT_PHOTO_URL_ERROR.sql
-- TUJUAN: Memperbaiki error "column photourl does not exist" saat import.
-- MASALAH: Typo nama kolom pada fungsi import (photourl vs photo_url).
-- =================================================================

BEGIN;

-- 1. Refresh Cache Schema
NOTIFY pgrst, 'reload config';

-- 2. Update Fungsi Import dengan Nama Kolom yang Benar
CREATE OR REPLACE FUNCTION public.admin_import_users(users_data json)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  updated_count int;
  inserted_count int;
  v_config_domain text;
  v_clean_domain text;
  v_teacher_domain text;
BEGIN
  IF NOT (SELECT auth.email() = 'admin@cbtschool.com') THEN
    RAISE EXCEPTION '403: Forbidden';
  END IF;

  -- AMBIL DOMAIN DINAMIS
  SELECT email_domain INTO v_config_domain FROM public.app_config WHERE id = 1;
  v_clean_domain := REGEXP_REPLACE(v_config_domain, '^@', '');
  IF v_clean_domain IS NULL OR v_clean_domain = '' THEN v_clean_domain := 'smpn2demak.sch.id'; END IF;
  
  v_teacher_domain := 'teacher.' || v_clean_domain;

  -- Temp table sesuai format JSON dari frontend (CamelCase)
  CREATE TEMP TABLE incoming_users_import (
    "username" text,
    "password" text,
    "fullName" text,
    "nisn" text,
    "class" text,
    "major" text,
    "gender" text,
    "religion" text,
    "photoUrl" text, -- Nama di JSON/CSV
    "role" text
  ) ON COMMIT DROP;

  INSERT INTO incoming_users_import
  SELECT * FROM json_populate_recordset(null::incoming_users_import, users_data);
  
  -- Normalisasi Data
  UPDATE incoming_users_import SET role = 'student' WHERE role IS NULL OR role = '';
  UPDATE incoming_users_import SET class = 'STAFF' WHERE role = 'teacher' AND (class IS NULL OR class = '');

  -- Update Auth Users
  UPDATE auth.users au
  SET 
    email = CASE 
        WHEN i.role = 'teacher' THEN i."username" || '@' || v_teacher_domain
        ELSE i."nisn" || '@' || v_clean_domain 
    END,
    encrypted_password = crypt(i."password", gen_salt('bf')),
    raw_user_meta_data = jsonb_build_object(
          'full_name', i."fullName", 
          'nisn', i."nisn", 
          'class', i."class", 
          'major', i."major", 
          'role', i."role", 
          'password_text', i."password",
          'photo_url', i."photoUrl"
    ),
    updated_at = now()
  FROM incoming_users_import i
  JOIN public.users pu ON ((i.role = 'student' AND pu.nisn = i.nisn) OR (i.role = 'teacher' AND pu.username = i.username))
  WHERE au.id = pu.id;

  -- Update Public Users (PERBAIKAN UTAMA DI SINI)
  WITH updated_public_users AS (
      UPDATE public.users pu
      SET 
        full_name = i."fullName", 
        class = i."class", 
        major = i."major", 
        gender = i."gender", 
        religion = i."religion", 
        -- FIX: Gunakan kolom 'photo_url' (snake_case) yang benar
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

  -- Insert Baru
  WITH new_auth_users AS (
    INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at)
    SELECT
      uuid_generate_v4(), '00000000-0000-0000-0000-000000000000',
      CASE 
        WHEN i.role = 'teacher' THEN i."username" || '@' || v_teacher_domain 
        ELSE i."nisn" || '@' || v_clean_domain 
      END,
      crypt(i."password", gen_salt('bf')), now(), '{"provider": "email", "providers": ["email"]}'::jsonb,
      jsonb_build_object(
          'full_name', i."fullName", 
          'nisn', i."nisn", 
          'class', i."class", 
          'major', i."major", 
          'gender', i."gender", 
          'religion', i."religion", 
          'photo_url', COALESCE(i."photoUrl", ''), 
          'password_text', i."password", 
          'role', i."role"
      ),
      'authenticated', 'authenticated', now(), now()
    FROM incoming_users_import i
    WHERE NOT EXISTS (SELECT 1 FROM public.users pu WHERE (i.role = 'student' AND pu.nisn = i.nisn) OR (i.role = 'teacher' AND pu.username = i.username))
    RETURNING id, email, raw_user_meta_data
  )
  INSERT INTO public.users (id, username, full_name, nisn, class, major, gender, religion, photo_url, password_text, qr_login_password, role)
  SELECT 
    nau.id,
    CASE WHEN (nau.raw_user_meta_data->>'role') = 'teacher' THEN split_part(nau.email, '@', 1) ELSE (nau.raw_user_meta_data->>'nisn') END,
    (nau.raw_user_meta_data->>'full_name'), 
    (nau.raw_user_meta_data->>'nisn'), 
    (nau.raw_user_meta_data->>'class'), 
    (nau.raw_user_meta_data->>'major'), 
    (nau.raw_user_meta_data->>'gender'), 
    (nau.raw_user_meta_data->>'religion'), 
    (nau.raw_user_meta_data->>'photo_url'), -- FIX: Mapping ke photo_url yang benar
    (nau.raw_user_meta_data->>'password_text'), 
    (nau.raw_user_meta_data->>'password_text'), 
    (nau.raw_user_meta_data->>'role')
  FROM new_auth_users nau;

  SELECT count(*) INTO inserted_count FROM incoming_users_import i WHERE NOT EXISTS (SELECT 1 FROM public.users pu WHERE (i.role = 'student' AND pu.nisn = i.nisn) OR (i.role = 'teacher' AND pu.username = i.username));

  -- Insert Identities
  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  SELECT uuid_generate_v4(), au.id, jsonb_build_object('sub', au.id, 'email', au.email), 'email', au.email, now(), now(), now()
  FROM auth.users au WHERE NOT EXISTS (SELECT 1 FROM auth.identities WHERE user_id = au.id);

  RETURN json_build_object('success', true, 'updated', updated_count, 'inserted', inserted_count, 'domain_used', v_clean_domain);
END;
$$;

COMMIT;

SELECT 'Sukses! Fungsi import telah diperbaiki (photo_url fix).' as status;
