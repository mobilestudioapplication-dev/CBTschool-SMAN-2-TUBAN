
-- =================================================================
-- REVISI: IMPORT USER DENGAN USERNAME & PASSWORD MANUAL (EXCEL)
-- Jalankan script ini di SQL Editor Supabase
-- =================================================================

-- 1. Hapus fungsi lama agar bersih
DROP FUNCTION IF EXISTS public.admin_import_users(json);

-- 2. Buat Fungsi Baru: admin_import_users
-- Logika: Menerima username & password eksplisit dari Excel
CREATE OR REPLACE FUNCTION public.admin_import_users(users_data json)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  updated_count int;
  inserted_count int;
BEGIN
  -- Validasi Admin
  IF NOT (SELECT auth.email() = 'admin@cbtschool.com') THEN
    RAISE EXCEPTION '403: Forbidden';
  END IF;

  -- Buat tabel sementara untuk data import
  CREATE TEMP TABLE incoming_users_import (
    "username" text, -- Ini akan jadi email/login identifier di auth.users
    "password" text, -- Password plain text dari excel
    "fullName" text,
    "nisn" text,
    "class" text,
    "major" text,
    "gender" text,
    "religion" text,
    "photoUrl" text
  ) ON COMMIT DROP;

  -- Parse JSON ke tabel sementara
  INSERT INTO incoming_users_import
  SELECT * FROM json_populate_recordset(null::incoming_users_import, users_data);
  
  -- Validasi Data Kritis
  IF EXISTS (SELECT 1 FROM incoming_users_import WHERE nisn IS NULL OR nisn = '') THEN
    RAISE EXCEPTION 'Data tidak valid: Ditemukan baris dengan NISN kosong.';
  END IF;
  
  IF EXISTS (SELECT 1 FROM incoming_users_import WHERE username IS NULL OR username = '') THEN
    RAISE EXCEPTION 'Data tidak valid: Ditemukan baris dengan Username kosong.';
  END IF;

  -- =========================================================
  -- LANGKAH 1: UPDATE USER LAMA (Berdasarkan NISN)
  -- =========================================================
  
  -- 1a. Update tabel publik (Data Profil)
  WITH updated_public_users AS (
      UPDATE public.users pu
      SET
        full_name = i."fullName",
        class = i.class,
        major = i.major,
        gender = i.gender,
        religion = i.religion,
        photo_url = COALESCE(i."photoUrl", pu.photo_url),
        username = i."username", -- Update username sesuai Excel
        updated_at = now()
      FROM incoming_users_import i
      WHERE pu.nisn = i.nisn
      RETURNING pu.id
  )
  SELECT count(*) INTO updated_count FROM updated_public_users;
  
  -- 1b. Update tabel auth (Data Login)
  -- Kita update email dan password user yang cocok NISN-nya
  UPDATE auth.users au
  SET 
    email = i."username", -- Update email login sesuai Excel
    encrypted_password = crypt(i."password", gen_salt('bf')), -- Update password sesuai Excel
    raw_user_meta_data = au.raw_user_meta_data || jsonb_build_object(
          'full_name', i."fullName",
          'class', i.class,
          'major', i.major
        ),
    updated_at = now()
  FROM incoming_users_import i
  JOIN public.users pu ON i.nisn = pu.nisn
  WHERE au.id = pu.id;

  -- =========================================================
  -- LANGKAH 2: INSERT USER BARU
  -- =========================================================
  
  WITH new_auth_users AS (
    INSERT INTO auth.users (
      id, 
      email, 
      encrypted_password, 
      email_confirmed_at, 
      raw_user_meta_data, 
      aud, 
      role
    )
    SELECT
      uuid_generate_v4(),
      i."username", -- Gunakan username langsung dari Excel
      crypt(i."password", gen_salt('bf')), -- Gunakan password langsung dari Excel
      now(),
      jsonb_build_object(
          'full_name', i."fullName",
          'nisn', i.nisn,
          'class', i.class,
          'major', i.major,
          'gender', i.gender,
          'religion', i.religion,
          'photo_url', COALESCE(i."photoUrl", 'https://ui-avatars.com/api/?name=' || i."fullName")
      ),
      'authenticated',
      'authenticated'
    FROM incoming_users_import i
    WHERE NOT EXISTS (SELECT 1 FROM public.users pu WHERE pu.nisn = i.nisn)
    RETURNING *
  )
  SELECT count(*) INTO inserted_count FROM new_auth_users;

  -- (Trigger handle_new_user di database akan otomatis mengisi public.users untuk data baru ini)

  RETURN json_build_object(
    'updated', updated_count,
    'inserted', inserted_count,
    'total', updated_count + inserted_count
  );
END;
$$;

-- Konfirmasi
SELECT 'Fungsi Import Manual Username/Password Berhasil Diperbarui' as status;
