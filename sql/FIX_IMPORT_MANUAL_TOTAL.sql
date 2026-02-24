
-- =================================================================
-- FIX_IMPORT_MANUAL_TOTAL.sql
-- PERBAIKAN FINAL: IMPORT USERNAME SESUAI EXCEL (TANPA MODIFIKASI)
-- Jalankan script ini di SQL Editor Supabase
-- =================================================================

BEGIN;

-- 1. Pastikan ekstensi enkripsi aktif
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Pastikan kolom penyimpanan password asli (plain text) tersedia
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS password_text TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS qr_login_password TEXT;

-- 3. UPDATE FUNGSI IMPORT (LOGIKA BARU: EXCEL IS KING)
CREATE OR REPLACE FUNCTION public.admin_import_users(users_data json)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  updated_count int;
  inserted_count int;
  v_domain text := 'smpn2demak.sch.id'; -- Domain default untuk kebutuhan Auth
BEGIN
  -- Validasi Admin
  IF NOT (SELECT auth.email() = 'admin@cbtschool.com') THEN
    RAISE EXCEPTION '403: Forbidden';
  END IF;

  -- Buat tabel sementara
  CREATE TEMP TABLE incoming_users_import (
    "username" text, -- Username dari Excel
    "password" text, -- Password dari Excel
    "fullName" text,
    "nisn" text,
    "class" text,
    "major" text,
    "gender" text,
    "religion" text,
    "photoUrl" text
  ) ON COMMIT DROP;

  INSERT INTO incoming_users_import
  SELECT * FROM json_populate_recordset(null::incoming_users_import, users_data);
  
  -- Validasi Wajib
  IF EXISTS (SELECT 1 FROM incoming_users_import WHERE username IS NULL OR username = '') THEN
    RAISE EXCEPTION 'Data Excel Invalid: Kolom Username tidak boleh kosong.';
  END IF;
  
  IF EXISTS (SELECT 1 FROM incoming_users_import WHERE password IS NULL OR password = '') THEN
    RAISE EXCEPTION 'Data Excel Invalid: Kolom Password tidak boleh kosong.';
  END IF;

  -- =========================================================
  -- LANGKAH 1: UPDATE DATA YANG SUDAH ADA (Berdasarkan NISN)
  -- =========================================================
  
  -- A. Update Public Users (Data Tampilan)
  WITH updated_public_users AS (
      UPDATE public.users pu
      SET
        full_name = i."fullName",
        class = i.class,
        major = i.major,
        gender = i.gender,
        religion = i.religion,
        photo_url = COALESCE(i."photoUrl", pu.photo_url),
        -- PENTING: Simpan username persis seperti Excel (tanpa tambahan domain)
        username = i."username", 
        password_text = i."password",
        qr_login_password = i."password",
        updated_at = now()
      FROM incoming_users_import i
      WHERE pu.nisn = i.nisn
      RETURNING pu.id
  )
  SELECT count(*) INTO updated_count FROM updated_public_users;
  
  -- B. Update Auth Users (Sistem Login di Balik Layar)
  UPDATE auth.users au
  SET 
    -- LOGIKA SMART EMAIL:
    -- Jika username Excel sudah ada '@', gunakan apa adanya.
    -- Jika belum (misal cuma NISN), baru tambahkan @domain.
    email = CASE 
        WHEN i."username" LIKE '%@%' THEN i."username" 
        ELSE i."username" || '@' || v_domain 
    END,
    encrypted_password = crypt(i."password", gen_salt('bf')),
    email_confirmed_at = now(),
    raw_user_meta_data = au.raw_user_meta_data || jsonb_build_object(
          'full_name', i."fullName",
          'nisn', i.nisn,
          'class', i.class,
          'password_text', i."password",
          'username_excel', i."username" -- Simpan username asli di metadata juga
        ),
    updated_at = now()
  FROM incoming_users_import i
  JOIN public.users pu ON i.nisn = pu.nisn
  WHERE au.id = pu.id;

  -- =========================================================
  -- LANGKAH 2: INSERT DATA BARU
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
      -- LOGIKA SMART EMAIL untuk data baru juga
      CASE 
        WHEN i."username" LIKE '%@%' THEN i."username" 
        ELSE i."username" || '@' || v_domain 
      END,
      crypt(i."password", gen_salt('bf')),
      now(),
      jsonb_build_object(
          'full_name', i."fullName",
          'nisn', i.nisn,
          'class', i.class,
          'major', i.major,
          'gender', i.gender,
          'religion', i.religion,
          'photo_url', COALESCE(i."photoUrl", 'https://ui-avatars.com/api/?name=' || i."fullName"),
          'password_text', i."password",
          'username_excel', i."username" -- PENTING: Kita simpan username raw di sini
      ),
      'authenticated',
      'authenticated'
    FROM incoming_users_import i
    WHERE NOT EXISTS (SELECT 1 FROM public.users pu WHERE pu.nisn = i.nisn)
    RETURNING id, raw_user_meta_data
  )
  -- Insert ke Public Users
  INSERT INTO public.users (id, username, full_name, nisn, class, major, gender, religion, photo_url, password_text, qr_login_password)
  SELECT 
    nau.id,
    -- AMBIL USERNAME DARI METADATA (YANG DIJAMIN RAW/ASLI DARI EXCEL)
    (nau.raw_user_meta_data->>'username_excel'), 
    (nau.raw_user_meta_data->>'full_name'),
    (nau.raw_user_meta_data->>'nisn'),
    (nau.raw_user_meta_data->>'class'),
    (nau.raw_user_meta_data->>'major'),
    (nau.raw_user_meta_data->>'gender'),
    (nau.raw_user_meta_data->>'religion'),
    (nau.raw_user_meta_data->>'photo_url'),
    (nau.raw_user_meta_data->>'password_text'),
    (nau.raw_user_meta_data->>'password_text')
  FROM new_auth_users nau;

  -- Hitung total insert
  SELECT count(*) INTO inserted_count FROM incoming_users_import i WHERE NOT EXISTS (SELECT 1 FROM public.users pu WHERE pu.nisn = i.nisn);

  RETURN json_build_object(
    'updated', updated_count,
    'inserted', inserted_count,
    'total', updated_count + inserted_count
  );
END;
$$;

COMMIT;

SELECT 'Fungsi Import Username Sesuai Excel Berhasil Diperbarui.' as status;
