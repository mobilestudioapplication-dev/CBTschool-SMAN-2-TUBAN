
-- =================================================================
-- FIX_IMPORT_AND_LOGIN.sql (SOLUSI TOTALITAS)
-- TUJUAN: Login Siswa SUKSES menggunakan NISN & Password sesuai Excel.
-- =================================================================

BEGIN;

-- 1. Pastikan Ekstensi Enkripsi Aktif
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Pastikan kolom password_text ada (untuk menyimpan password asli dari Excel)
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS password_text TEXT;

-- 3. Update Konfigurasi Domain Sekolah (Hardcode agar konsisten)
UPDATE public.app_config 
SET school_domain = 'smpn2demak.sch.id' 
WHERE id = 1;

-- 4. UPDATE FUNGSI IMPORT (AGAR DATA BARU SESUAI STANDAR)
CREATE OR REPLACE FUNCTION public.admin_import_users(users_data json)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  updated_count int;
  inserted_count int;
  v_domain text := 'smpn2demak.sch.id'; -- DOMAIN WAJIB
BEGIN
  -- Validasi Admin
  IF NOT (SELECT auth.email() = 'admin@cbtschool.com') THEN
    RAISE EXCEPTION '403: Forbidden';
  END IF;

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
    "photoUrl" text
  ) ON COMMIT DROP;

  INSERT INTO incoming_users_import
  SELECT * FROM json_populate_recordset(null::incoming_users_import, users_data);
  
  -- Validasi Wajib
  IF EXISTS (SELECT 1 FROM incoming_users_import WHERE nisn IS NULL OR nisn = '') THEN
    RAISE EXCEPTION 'Data tidak valid: NISN tidak boleh kosong.';
  END IF;

  -- =========================================================
  -- LANGKAH 1: UPDATE DATA (JIKA NISN SUDAH ADA)
  -- =========================================================
  
  -- Update Public Users (Tabel Profil Tampil)
  -- Username di sini disimpan MURNI sesuai Excel (tanpa @domain)
  WITH updated_public_users AS (
      UPDATE public.users pu
      SET
        full_name = i."fullName",
        class = i.class,
        major = i.major,
        gender = i.gender,
        religion = i.religion,
        photo_url = COALESCE(i."photoUrl", pu.photo_url),
        username = i."username", -- Simpan username murni (misal: 123456)
        password_text = i."password", -- Simpan password asli
        updated_at = now()
      FROM incoming_users_import i
      WHERE pu.nisn = i.nisn
      RETURNING pu.id
  )
  SELECT count(*) INTO updated_count FROM updated_public_users;
  
  -- Update Auth Users (Tabel Login Internal)
  -- Email DI SINI wajib pakai @domain agar Supabase mau menerima
  UPDATE auth.users au
  SET 
    email = i."username" || '@' || v_domain, -- INTERNAL: Tambah domain
    encrypted_password = crypt(i."password", gen_salt('bf')), -- Hash password
    email_confirmed_at = now(),
    raw_user_meta_data = au.raw_user_meta_data || jsonb_build_object(
          'full_name', i."fullName",
          'nisn', i.nisn,
          'class', i.class,
          'password_text', i."password"
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
      i."username" || '@' || v_domain, -- INTERNAL: Tambah domain
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
          'password_text', i."password"
      ),
      'authenticated',
      'authenticated'
    FROM incoming_users_import i
    WHERE NOT EXISTS (SELECT 1 FROM public.users pu WHERE pu.nisn = i.nisn)
    RETURNING id, raw_user_meta_data
  )
  -- Insert ke Public Users (Manual trigger logic disini agar presisi)
  INSERT INTO public.users (id, username, full_name, nisn, class, major, gender, religion, photo_url, password_text)
  SELECT 
    nau.id,
    (nau.raw_user_meta_data->>'nisn'), -- Username publik = NISN MURNI
    (nau.raw_user_meta_data->>'full_name'),
    (nau.raw_user_meta_data->>'nisn'),
    (nau.raw_user_meta_data->>'class'),
    (nau.raw_user_meta_data->>'major'),
    (nau.raw_user_meta_data->>'gender'),
    (nau.raw_user_meta_data->>'religion'),
    (nau.raw_user_meta_data->>'photo_url'),
    (nau.raw_user_meta_data->>'password_text')
  FROM new_auth_users nau;

  -- Hitung total insert
  SELECT count(*) INTO inserted_count FROM incoming_users_import i WHERE NOT EXISTS (SELECT 1 FROM public.users pu WHERE pu.nisn = i.nisn); -- Estimasi kasar karena CTE sulit dihitung langsung

  RETURN json_build_object(
    'updated', updated_count,
    'inserted', inserted_count,
    'total', updated_count + inserted_count
  );
END;
$$;

-- 5. PERBAIKAN DATA LAMA (RESET TOTAL SEMUA SISWA)
-- Ini akan memaksa semua siswa yang ada di database untuk mengikuti format baru:
-- Public Username: NISN (tanpa domain)
-- Auth Email: NISN@smpn2demak.sch.id
-- Password: NISN (atau password_text jika ada)
DO $$
DECLARE
    r RECORD;
    final_email TEXT;
    final_pass TEXT;
    clean_username TEXT;
    v_domain TEXT := 'smpn2demak.sch.id';
    count_fixed INT := 0;
BEGIN
    -- Loop semua user (kecuali admin)
    FOR r IN SELECT * FROM public.users WHERE username NOT LIKE '%admin%' AND nisn IS NOT NULL AND nisn <> '' LOOP
        
        -- 1. Tentukan Password: Prioritas kolom 'password_text' -> NISN
        IF r.password_text IS NOT NULL AND r.password_text <> '' THEN
            final_pass := trim(r.password_text);
        ELSE
            final_pass := trim(r.nisn);
        END IF;

        -- 2. Tentukan Email Internal (Wajib pakai domain)
        final_email := trim(r.nisn) || '@' || v_domain;
        
        -- 3. Tentukan Username Publik (Wajib MURNI NISN/Username Excel)
        clean_username := trim(r.nisn);

        -- A. UPDATE AUTH (Sistem Login)
        IF EXISTS (SELECT 1 FROM auth.users WHERE id = r.id) THEN
            UPDATE auth.users 
            SET email = final_email, 
                encrypted_password = crypt(final_pass, gen_salt('bf')),
                email_confirmed_at = now(),
                updated_at = now(),
                raw_user_meta_data = jsonb_build_object(
                    'full_name', r.full_name,
                    'nisn', r.nisn,
                    'class', r.class,
                    'password_text', final_pass
                )
            WHERE id = r.id;
        ELSE
            -- Jika user auth hilang, recreate
            INSERT INTO auth.users (
                id, instance_id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at
            ) VALUES (
                r.id,
                '00000000-0000-0000-0000-000000000000',
                final_email,
                crypt(final_pass, gen_salt('bf')),
                now(),
                '{"provider": "email", "providers": ["email"]}'::jsonb,
                jsonb_build_object(
                    'full_name', r.full_name,
                    'nisn', r.nisn,
                    'class', r.class,
                    'password_text', final_pass
                ),
                'authenticated', 'authenticated', now(), now()
            );
        END IF;

        -- B. UPDATE PUBLIC (Agar tampilan bersih tanpa @domain)
        UPDATE public.users 
        SET 
            username = clean_username, 
            password_text = final_pass
        WHERE id = r.id;

        count_fixed := count_fixed + 1;
    END LOOP;

    RAISE NOTICE 'Selesai! % akun siswa berhasil diperbaiki.', count_fixed;
END $$;

COMMIT;

SELECT 'DATABASE BERHASIL DISINKRONISASI. SILAKAN COBA LOGIN.' as status;
