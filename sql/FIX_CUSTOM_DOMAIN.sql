
-- =================================================================
-- FITUR: CUSTOM DOMAIN USERNAME SISWA
-- Jalankan script ini di SQL Editor Supabase
-- =================================================================

-- 1. Pastikan kolom school_domain ada di tabel app_config
ALTER TABLE public.app_config 
ADD COLUMN IF NOT EXISTS school_domain text DEFAULT 'sekolah.sch.id';

COMMENT ON COLUMN public.app_config.school_domain IS 'Domain kustom untuk username siswa (misal: smkn1sby.sch.id)';

-- 2. Update Fungsi Import Massal (Excel) agar Dinamis
-- Fungsi ini sekarang akan mengambil domain dari app_config, bukan hardcoded.
CREATE OR REPLACE FUNCTION public.admin_import_users(users_data json)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  updated_count int;
  inserted_count int;
  v_domain text;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION '403: Forbidden';
  END IF;

  -- AMBIL DOMAIN DARI KONFIGURASI (DEFAULT JIKA KOSONG)
  SELECT COALESCE(NULLIF(school_domain, ''), 'sekolah.sch.id') INTO v_domain FROM public.app_config LIMIT 1;

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
  
  -- Pastikan NISN tidak kosong
  IF EXISTS (SELECT 1 FROM incoming_users_import WHERE nisn IS NULL OR nisn = '') THEN
    RAISE EXCEPTION 'Data tidak valid: Ditemukan baris dengan NISN kosong.';
  END IF;

  -- Langkah 1: Perbarui pengguna yang sudah ada (UPSERT Logic)
  WITH updated_public_users AS (
      UPDATE public.users pu
      SET
        full_name = i."fullName",
        class = i.class,
        major = i.major,
        gender = i.gender,
        religion = i.religion,
        photo_url = COALESCE(i."photoUrl", pu.photo_url),
        -- REVISI: Generate username menggunakan v_domain yang diambil dari DB
        username = i.nisn || '@' || v_domain, 
        updated_at = now()
      FROM incoming_users_import i
      WHERE pu.nisn = i.nisn
      RETURNING pu.id
  )
  SELECT count(*) INTO updated_count FROM updated_public_users;
  
  -- Juga perbarui metadata auth.users
  UPDATE auth.users au
  SET 
    email = i.nisn || '@' || v_domain,
    raw_user_meta_data = au.raw_user_meta_data || jsonb_build_object(
          'full_name', i."fullName",
          'class', i.class,
          'major', i.major
        )
  FROM incoming_users_import i
  JOIN public.users pu ON i.nisn = pu.nisn
  WHERE au.id = pu.id;

  -- Langkah 2: Masukkan pengguna baru
  WITH new_auth_users AS (
    INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_user_meta_data, aud, role)
    SELECT
      uuid_generate_v4(),
      i.nisn || '@' || v_domain, -- REVISI: Gunakan v_domain
      crypt(COALESCE(i.password, i.nisn), gen_salt('bf')),
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

  RETURN json_build_object(
    'updated', updated_count,
    'inserted', inserted_count,
    'total', updated_count + inserted_count,
    'domain_used', v_domain
  );
END;
$$;

-- 3. Update Fungsi Repair Login (Agar tombol "Perbaiki Login" juga mengikuti domain baru)
CREATE OR REPLACE FUNCTION public.repair_student_logins()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
    r RECORD;
    auth_id UUID;
    target_email TEXT;
    v_domain TEXT; -- Variabel domain
    processed_count INT := 0;
    created_count INT := 0;
    updated_count INT := 0;
    skipped_count INT := 0;
BEGIN
    IF NOT is_admin() THEN
      RAISE EXCEPTION '403: Forbidden';
    END IF;

    -- AMBIL DOMAIN DARI CONFIG
    SELECT COALESCE(NULLIF(school_domain, ''), 'sekolah.sch.id') INTO v_domain FROM public.app_config LIMIT 1;

    UPDATE auth.users SET email_confirmed_at = now() WHERE email_confirmed_at IS NULL;

    FOR r IN SELECT * FROM public.users WHERE username <> 'admin@cbtschool.com' AND nisn IS NOT NULL LOOP
        processed_count := processed_count + 1;
        -- Generate target email sesuai domain baru
        target_email := r.nisn || '@' || v_domain;

        SELECT id INTO auth_id FROM auth.users WHERE id = r.id;

        IF auth_id IS NULL THEN
            INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_user_meta_data, aud, role)
            VALUES (r.id, target_email, crypt(r.nisn, gen_salt('bf')), now(),
                    jsonb_build_object('full_name', r.full_name),
                    'authenticated', 'authenticated');
            created_count := created_count + 1;
        ELSE
            -- Jika email lama TIDAK SAMA dengan target domain baru, UPDATE!
            IF EXISTS (SELECT 1 FROM auth.users WHERE id = r.id AND (email <> target_email OR encrypted_password <> crypt(r.nisn, gen_salt('bf')))) THEN
                UPDATE auth.users
                SET
                  email = target_email,
                  encrypted_password = crypt(r.nisn, gen_salt('bf')),
                  email_confirmed_at = now()
                WHERE id = r.id;
                updated_count := updated_count + 1;
            ELSE
                skipped_count := skipped_count + 1;
            END IF;
        END IF;

        -- Update juga di tabel public
        UPDATE public.users SET username = target_email WHERE id = r.id AND username <> target_email;
    END LOOP;

    RETURN json_build_object(
        'message', 'Perbaikan selesai. Domain user kini: ' || v_domain,
        'processed', processed_count,
        'created', created_count,
        'updated_or_reset', updated_count,
        'skipped_ok', skipped_count
    );
END;
$$;

-- Konfirmasi
SELECT school_domain as current_domain_setting FROM public.app_config;
