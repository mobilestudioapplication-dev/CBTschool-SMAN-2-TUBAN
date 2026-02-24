
-- =================================================================
-- SQL_AUTO_CREATE_AUTH_USERS.sql
-- SYSTEM ARCHITECT NOTE:
-- Skrip ini mem-bypass batasan Client-side Supabase untuk memungkinkan
-- pembuatan akun Login (Auth) secara massal dari Excel.
-- Updated: Menangani auth.identities (PENTING UNTUK LOGIN), konflik Trigger, dan Duplikasi.
-- =================================================================

BEGIN;

-- 1. Pastikan Ekstensi Kriptografi Aktif
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Pastikan kolom pendukung di public.users tersedia
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS password_text TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS qr_login_password TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'student';

-- 3. FUNGSI UTAMA: IMPORT USER KE AUTH & PUBLIC
CREATE OR REPLACE FUNCTION public.admin_import_users(users_data json)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions -- Akses ke extensions untuk uuid/pgcrypto
AS $$
DECLARE
  updated_count int;
  inserted_count int;
  v_domain text := 'smpn2demak.sch.id'; -- Default domain
BEGIN
  -- Validasi Admin
  IF NOT (SELECT auth.email() = 'admin@cbtschool.com') THEN
    RAISE EXCEPTION '403: Forbidden Access';
  END IF;

  -- Tabel Sementara
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

  -- Parse JSON
  INSERT INTO incoming_users_import
  SELECT 
    TRIM("username"), TRIM("password"), TRIM("fullName"), TRIM("nisn"), 
    TRIM("class"), TRIM("major"), TRIM("gender"), TRIM("religion"), TRIM("photoUrl"), TRIM("role")
  FROM json_populate_recordset(null::incoming_users_import, users_data);
  
  -- Validasi
  IF EXISTS (SELECT 1 FROM incoming_users_import WHERE username IS NULL OR username = '') THEN
    RAISE EXCEPTION 'Excel Error: Kolom Username tidak boleh kosong.';
  END IF;
  
  -- Normalisasi
  UPDATE incoming_users_import SET role = 'student' WHERE role IS NULL OR role = '';
  UPDATE incoming_users_import SET class = 'STAFF' WHERE role IN ('teacher', 'admin') AND (class IS NULL OR class = '');

  -- =========================================================
  -- LANGKAH 1: UPDATE USER YANG SUDAH ADA (Berdasarkan NISN)
  -- =========================================================
  
  -- A. Update Auth Users
  UPDATE auth.users au
  SET 
    email = CASE 
        WHEN i."username" LIKE '%@%' THEN i."username" 
        ELSE i."username" || '@' || v_domain 
    END,
    encrypted_password = crypt(i."password", gen_salt('bf', 10)), -- Explicit cost 10 for compatibility
    email_confirmed_at = now(),
    raw_app_meta_data = '{"provider": "email", "providers": ["email"]}'::jsonb,
    raw_user_meta_data = jsonb_build_object(
          'full_name', i."fullName",
          'nisn', i.nisn,
          'class', i.class,
          'major', i.major,
          'role', i."role",
          'password_text', i."password",
          'username_excel', i."username"
        ),
    updated_at = now()
  FROM incoming_users_import i
  JOIN public.users pu ON i.nisn = pu.nisn
  WHERE au.id = pu.id;

  -- B. Update Public Users
  WITH updated_public_users AS (
      UPDATE public.users pu
      SET
        full_name = i."fullName",
        class = i.class,
        major = i.major,
        gender = i.gender,
        religion = i.religion,
        photo_url = COALESCE(i."photoUrl", pu.photo_url),
        username = i."username",
        password_text = i."password",
        qr_login_password = i."password",
        role = i."role",
        updated_at = now()
      FROM incoming_users_import i
      WHERE pu.nisn = i.nisn
      RETURNING pu.id
  )
  SELECT count(*) INTO updated_count FROM updated_public_users;

  -- =========================================================
  -- LANGKAH 2: INSERT USER BARU
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
        WHEN i."username" LIKE '%@%' THEN i."username" 
        ELSE i."username" || '@' || v_domain 
      END,
      crypt(i."password", gen_salt('bf', 10)),
      now(),
      '{"provider": "email", "providers": ["email"]}'::jsonb,
      jsonb_build_object(
          'full_name', i."fullName",
          'nisn', i.nisn,
          'class', i.class,
          'major', i.major,
          'gender', i.gender,
          'religion', i.religion,
          'photo_url', COALESCE(i."photoUrl", 'https://ui-avatars.com/api/?name=' || i."fullName"),
          'password_text', i."password",
          'username_excel', i."username",
          'role', i."role"
      ),
      'authenticated',
      'authenticated',
      now(),
      now()
    FROM incoming_users_import i
    WHERE NOT EXISTS (SELECT 1 FROM public.users pu WHERE pu.nisn = i.nisn)
    AND NOT EXISTS (
        SELECT 1 FROM auth.users au 
        WHERE au.email = (
            CASE 
                WHEN i."username" LIKE '%@%' THEN i."username" 
                ELSE i."username" || '@' || v_domain 
            END
        )
    )
    RETURNING id, email
  )
  -- Insert ke Public Users (Menggunakan data dari auth insert untuk konsistensi ID)
  -- Catatan: Trigger handle_new_user mungkin berjalan, tapi kita gunakan ON CONFLICT di sini untuk memastikan data lengkap
  , inserted_public_records AS (
      INSERT INTO public.users (
        id, username, full_name, nisn, class, major, gender, religion, photo_url, password_text, qr_login_password, role
      )
      SELECT 
        nau.id,
        (SELECT i."username" FROM incoming_users_import i 
         WHERE (CASE WHEN i."username" LIKE '%@%' THEN i."username" ELSE i."username" || '@' || v_domain END) = nau.email LIMIT 1),
        (SELECT i."fullName" FROM incoming_users_import i 
         WHERE (CASE WHEN i."username" LIKE '%@%' THEN i."username" ELSE i."username" || '@' || v_domain END) = nau.email LIMIT 1),
        (SELECT i."nisn" FROM incoming_users_import i 
         WHERE (CASE WHEN i."username" LIKE '%@%' THEN i."username" ELSE i."username" || '@' || v_domain END) = nau.email LIMIT 1),
        (SELECT i."class" FROM incoming_users_import i 
         WHERE (CASE WHEN i."username" LIKE '%@%' THEN i."username" ELSE i."username" || '@' || v_domain END) = nau.email LIMIT 1),
        (SELECT i."major" FROM incoming_users_import i 
         WHERE (CASE WHEN i."username" LIKE '%@%' THEN i."username" ELSE i."username" || '@' || v_domain END) = nau.email LIMIT 1),
        (SELECT i."gender" FROM incoming_users_import i 
         WHERE (CASE WHEN i."username" LIKE '%@%' THEN i."username" ELSE i."username" || '@' || v_domain END) = nau.email LIMIT 1),
        (SELECT i."religion" FROM incoming_users_import i 
         WHERE (CASE WHEN i."username" LIKE '%@%' THEN i."username" ELSE i."username" || '@' || v_domain END) = nau.email LIMIT 1),
        (SELECT i."photoUrl" FROM incoming_users_import i 
         WHERE (CASE WHEN i."username" LIKE '%@%' THEN i."username" ELSE i."username" || '@' || v_domain END) = nau.email LIMIT 1),
        (SELECT i."password" FROM incoming_users_import i 
         WHERE (CASE WHEN i."username" LIKE '%@%' THEN i."username" ELSE i."username" || '@' || v_domain END) = nau.email LIMIT 1),
        (SELECT i."password" FROM incoming_users_import i 
         WHERE (CASE WHEN i."username" LIKE '%@%' THEN i."username" ELSE i."username" || '@' || v_domain END) = nau.email LIMIT 1),
        (SELECT i."role" FROM incoming_users_import i 
         WHERE (CASE WHEN i."username" LIKE '%@%' THEN i."username" ELSE i."username" || '@' || v_domain END) = nau.email LIMIT 1)
      FROM new_auth_users nau
      ON CONFLICT (id) DO UPDATE SET
        username = EXCLUDED.username,
        full_name = EXCLUDED.full_name,
        class = EXCLUDED.class,
        major = EXCLUDED.major,
        password_text = EXCLUDED.password_text,
        qr_login_password = EXCLUDED.qr_login_password,
        role = EXCLUDED.role
  )
  SELECT count(*) INTO inserted_count FROM new_auth_users;

  -- =========================================================
  -- LANGKAH 3: INSERT IDENTITIES (CRITICAL FIX FOR LOGIN)
  -- =========================================================
  -- Memastikan setiap user (baru/lama) memiliki entry di auth.identities
  -- agar bisa login menggunakan email provider.
  
  INSERT INTO auth.identities (
    id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
  )
  SELECT
    au.id, -- Gunakan ID user sebagai ID identity (standar sederhana untuk manual insert)
    au.id,
    jsonb_build_object('sub', au.id, 'email', au.email),
    'email',
    au.email,
    now(),
    now(),
    now()
  FROM auth.users au
  JOIN incoming_users_import i ON 
    au.email = CASE WHEN i."username" LIKE '%@%' THEN i."username" ELSE i."username" || '@' || v_domain END
  ON CONFLICT (provider, provider_id) DO UPDATE 
  SET identity_data = EXCLUDED.identity_data, updated_at = now();

  RETURN json_build_object(
    'success', true,
    'updated', updated_count,
    'inserted', inserted_count,
    'total', updated_count + inserted_count
  );
END;
$$;

COMMIT;

SELECT 'Sukses! Fungsi Import User diperbarui: Password Hash (Cost 10) & Auth Identities Fix.' as status;
