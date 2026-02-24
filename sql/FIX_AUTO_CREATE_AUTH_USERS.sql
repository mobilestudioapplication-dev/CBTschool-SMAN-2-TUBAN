
-- =================================================================
-- FIX_AUTO_CREATE_AUTH_USERS.sql (REVISI FINAL - SAFE MODE)
-- TUJUAN: 
-- 1. Memperbaiki login siswa/guru yang gagal ("Invalid login credentials").
-- 2. Mengatasi error "duplicate key value violates unique constraint identities_pkey".
-- 3. Sinkronisasi data publik dengan data otentikasi.
-- =================================================================

BEGIN;

-- 1. Pastikan Ekstensi Kriptografi Aktif
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Pastikan kolom pendukung di public.users tersedia
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS password_text TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS qr_login_password TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'student';

-- 3. UPDATE FUNGSI IMPORT (Agar import masa depan juga aman)
CREATE OR REPLACE FUNCTION public.admin_import_users(users_data json)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  updated_count int;
  inserted_count int;
  v_domain text := 'smpn2demak.sch.id';
BEGIN
  IF NOT (SELECT auth.email() = 'admin@cbtschool.com') THEN
    RAISE EXCEPTION '403: Forbidden Access';
  END IF;

  CREATE TEMP TABLE incoming_users_import (
    "username" text, "password" text, "fullName" text, "nisn" text, 
    "class" text, "major" text, "gender" text, "religion" text, "photoUrl" text, "role" text
  ) ON COMMIT DROP;

  INSERT INTO incoming_users_import
  SELECT TRIM("username"), TRIM("password"), TRIM("fullName"), TRIM("nisn"), TRIM("class"), TRIM("major"), TRIM("gender"), TRIM("religion"), TRIM("photoUrl"), TRIM("role")
  FROM json_populate_recordset(null::incoming_users_import, users_data);
  
  -- Normalisasi
  UPDATE incoming_users_import SET role = 'student' WHERE role IS NULL OR role = '';

  -- 1. UPDATE USER LAMA
  UPDATE auth.users au
  SET 
    email = CASE WHEN i."username" LIKE '%@%' THEN i."username" ELSE i."username" || '@' || v_domain END,
    encrypted_password = crypt(i."password", gen_salt('bf', 10)),
    updated_at = now(),
    raw_user_meta_data = jsonb_build_object(
          'full_name', i."fullName", 'nisn', i.nisn, 'class', i.class, 
          'role', i."role", 'password_text', i."password"
    )
  FROM incoming_users_import i JOIN public.users pu ON i.nisn = pu.nisn
  WHERE au.id = pu.id;

  WITH updated_public_users AS (
      UPDATE public.users pu
      SET
        full_name = i."fullName", class = i.class, major = i.major, gender = i.gender,
        religion = i.religion, photo_url = COALESCE(i."photoUrl", pu.photo_url),
        username = i."username", password_text = i."password", qr_login_password = i."password",
        role = i."role", updated_at = now()
      FROM incoming_users_import i
      WHERE pu.nisn = i.nisn
      RETURNING pu.id
  )
  SELECT count(*) INTO updated_count FROM updated_public_users;

  -- 2. INSERT USER BARU
  WITH new_auth_users AS (
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at, 
      raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at
    )
    SELECT
      uuid_generate_v4(), '00000000-0000-0000-0000-000000000000',
      CASE WHEN i."username" LIKE '%@%' THEN i."username" ELSE i."username" || '@' || v_domain END,
      crypt(i."password", gen_salt('bf', 10)), now(),
      '{"provider": "email", "providers": ["email"]}'::jsonb,
      jsonb_build_object(
          'full_name', i."fullName", 'nisn', i.nisn, 'class', i.class, 'major', i.major,
          'role', i."role", 'password_text', i."password"
      ),
      'authenticated', 'authenticated', now(), now()
    FROM incoming_users_import i
    WHERE NOT EXISTS (SELECT 1 FROM public.users pu WHERE pu.nisn = i.nisn)
    RETURNING id, email
  )
  -- Insert ke Public Users via Query langsung (menghindari trigger race condition)
  INSERT INTO public.users (id, username, full_name, nisn, class, major, gender, religion, photo_url, password_text, qr_login_password, role)
  SELECT 
    nau.id,
    (SELECT i."username" FROM incoming_users_import i WHERE (CASE WHEN i."username" LIKE '%@%' THEN i."username" ELSE i."username" || '@' || v_domain END) = nau.email LIMIT 1),
    (SELECT i."fullName" FROM incoming_users_import i WHERE (CASE WHEN i."username" LIKE '%@%' THEN i."username" ELSE i."username" || '@' || v_domain END) = nau.email LIMIT 1),
    (SELECT i."nisn" FROM incoming_users_import i WHERE (CASE WHEN i."username" LIKE '%@%' THEN i."username" ELSE i."username" || '@' || v_domain END) = nau.email LIMIT 1),
    (SELECT i."class" FROM incoming_users_import i WHERE (CASE WHEN i."username" LIKE '%@%' THEN i."username" ELSE i."username" || '@' || v_domain END) = nau.email LIMIT 1),
    (SELECT i."major" FROM incoming_users_import i WHERE (CASE WHEN i."username" LIKE '%@%' THEN i."username" ELSE i."username" || '@' || v_domain END) = nau.email LIMIT 1),
    (SELECT i."gender" FROM incoming_users_import i WHERE (CASE WHEN i."username" LIKE '%@%' THEN i."username" ELSE i."username" || '@' || v_domain END) = nau.email LIMIT 1),
    (SELECT i."religion" FROM incoming_users_import i WHERE (CASE WHEN i."username" LIKE '%@%' THEN i."username" ELSE i."username" || '@' || v_domain END) = nau.email LIMIT 1),
    (SELECT i."photoUrl" FROM incoming_users_import i WHERE (CASE WHEN i."username" LIKE '%@%' THEN i."username" ELSE i."username" || '@' || v_domain END) = nau.email LIMIT 1),
    (SELECT i."password" FROM incoming_users_import i WHERE (CASE WHEN i."username" LIKE '%@%' THEN i."username" ELSE i."username" || '@' || v_domain END) = nau.email LIMIT 1),
    (SELECT i."password" FROM incoming_users_import i WHERE (CASE WHEN i."username" LIKE '%@%' THEN i."username" ELSE i."username" || '@' || v_domain END) = nau.email LIMIT 1),
    (SELECT i."role" FROM incoming_users_import i WHERE (CASE WHEN i."username" LIKE '%@%' THEN i."username" ELSE i."username" || '@' || v_domain END) = nau.email LIMIT 1)
  FROM new_auth_users nau;

  SELECT count(*) INTO inserted_count FROM incoming_users_import i WHERE NOT EXISTS (SELECT 1 FROM public.users pu WHERE pu.nisn = i.nisn); -- Approx

  -- 3. INSERT IDENTITIES (FIXED: UUID GENERATE V4 untuk ID)
  INSERT INTO auth.identities (
    id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
  )
  SELECT
    uuid_generate_v4(), -- FIX: Gunakan ID baru agar tidak bentrok
    au.id,
    jsonb_build_object('sub', au.id, 'email', au.email),
    'email',
    au.email,
    now(), now(), now()
  FROM auth.users au
  JOIN incoming_users_import i ON 
    au.email = CASE WHEN i."username" LIKE '%@%' THEN i."username" ELSE i."username" || '@' || v_domain END
  ON CONFLICT (provider, provider_id) DO UPDATE 
  SET identity_data = EXCLUDED.identity_data, updated_at = now();

  RETURN json_build_object('success', true, 'updated', updated_count, 'inserted', inserted_count);
END;
$$;

-- 4. EKSEKUSI PERBAIKAN DATA MASSAL (RESET LOGIN SISWA)
-- Mengembalikan semua siswa agar login menggunakan Password Text (dari Excel) atau NISN
DO $$
DECLARE
    r RECORD;
    v_domain TEXT := 'smpn2demak.sch.id';
    v_pass TEXT;
    v_email TEXT;
BEGIN
    FOR r IN SELECT * FROM public.users WHERE role = 'student' LOOP
        -- Tentukan Password (Prioritas: Password dari Excel > NISN)
        IF r.password_text IS NOT NULL AND r.password_text <> '' THEN
            v_pass := r.password_text;
        ELSE
            v_pass := r.nisn;
        END IF;

        -- Tentukan Email
        v_email := r.nisn || '@' || v_domain;

        -- Update Public Users (Sync data login QR)
        UPDATE public.users 
        SET qr_login_password = v_pass
        WHERE id = r.id;

        -- Update Auth Users (jika ada)
        IF EXISTS (SELECT 1 FROM auth.users WHERE id = r.id) THEN
            UPDATE auth.users
            SET encrypted_password = crypt(v_pass, gen_salt('bf', 10)),
                email = v_email,
                email_confirmed_at = now()
            WHERE id = r.id;
        ELSE
            -- Buat Auth Users jika hilang
            INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, role, raw_app_meta_data, raw_user_meta_data, aud, created_at, updated_at)
            VALUES (
                r.id, 
                v_email, 
                crypt(v_pass, gen_salt('bf', 10)), 
                now(), 
                'authenticated',
                '{"provider": "email", "providers": ["email"]}'::jsonb,
                jsonb_build_object('full_name', r.full_name, 'nisn', r.nisn, 'class', r.class, 'role', 'student', 'password_text', v_pass),
                'authenticated', now(), now()
            );
        END IF;

        -- Fix Identity (FIX: UUID GENERATE V4)
        -- Kita hanya insert jika belum ada identity untuk provider email ini
        INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
        VALUES (
            uuid_generate_v4(), -- FIX: Gunakan ID baru
            r.id, 
            jsonb_build_object('sub', r.id, 'email', v_email), 
            'email', v_email, now(), now(), now()
        )
        ON CONFLICT (provider, provider_id) DO UPDATE SET identity_data = EXCLUDED.identity_data;
        
    END LOOP;
END $$;

COMMIT;

SELECT 'PERBAIKAN SELESAI. Tabel Identities kini menggunakan UUID acak untuk mencegah konflik ID.' as status;
