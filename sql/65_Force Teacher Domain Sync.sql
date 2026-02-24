
-- =================================================================
-- FIX_TEACHER_DOMAIN_SYNC.sql
-- TUJUAN: MEMAKSA SYSTEM MENGGUNAKAN DOMAIN DARI MENU KONFIGURASI
-- =================================================================

BEGIN;

-- 1. FUNGSI SINKRONISASI AKUN GURU (YANG DIKLIK ADMIN)
-- Fungsi ini sekarang akan membaca 'email_domain' dari tabel app_config
CREATE OR REPLACE FUNCTION public.repair_teacher_logins()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    r RECORD;
    v_config_domain TEXT;
    v_clean_domain TEXT;
    v_email TEXT;
    v_pass TEXT;
    count_fixed INT := 0;
    count_created INT := 0;
BEGIN
    -- Ambil domain AKTIF dari tabel konfigurasi
    SELECT email_domain INTO v_config_domain FROM public.app_config WHERE id = 1;
    
    -- Bersihkan karakter '@' di depan jika ada (misal: @sekolah.id -> sekolah.id)
    v_clean_domain := REGEXP_REPLACE(v_config_domain, '^@', '');
    
    -- Fallback jika konfigurasi kosong
    IF v_clean_domain IS NULL OR v_clean_domain = '' THEN
        v_clean_domain := 'smpn2demak.sch.id'; 
    END IF;

    -- Loop semua user dengan role 'teacher'
    FOR r IN SELECT * FROM public.users WHERE role = 'teacher' LOOP
        
        -- A. TENTUKAN PASSWORD (Prioritas: Password Text > Default)
        v_pass := COALESCE(NULLIF(r.password_text, ''), '123456');

        -- B. TENTUKAN EMAIL LOGIN (FORMAT: username@teacher.[DOMAIN_KONFIGURASI])
        -- Kita bersihkan username dari karakter @ dan spasi
        v_email := regexp_replace(r.username, '@.*', '') || '@teacher.' || v_clean_domain;

        -- C. UPDATE / INSERT KE AUTH (Sistem Login)
        IF EXISTS (SELECT 1 FROM auth.users WHERE id = r.id) THEN
            UPDATE auth.users 
            SET 
                email = v_email, -- Update email sesuai config terbaru
                encrypted_password = crypt(v_pass, gen_salt('bf', 10)),
                email_confirmed_at = now(),
                raw_user_meta_data = jsonb_build_object(
                    'full_name', r.full_name,
                    'nisn', r.username, -- Gunakan username sebagai ID referensi
                    'class', 'STAFF',
                    'major', r.major,
                    'role', 'teacher',
                    'password_text', v_pass
                ),
                updated_at = now()
            WHERE id = r.id;
            
            count_fixed := count_fixed + 1;
        ELSE
            -- Buat baru jika hilang
            INSERT INTO auth.users (
                id, instance_id, email, encrypted_password, email_confirmed_at, 
                raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at
            ) VALUES (
                r.id,
                '00000000-0000-0000-0000-000000000000',
                v_email,
                crypt(v_pass, gen_salt('bf', 10)),
                now(),
                '{"provider": "email", "providers": ["email"]}'::jsonb,
                jsonb_build_object(
                    'full_name', r.full_name,
                    'nisn', r.username,
                    'class', 'STAFF',
                    'major', r.major,
                    'role', 'teacher',
                    'password_text', v_pass
                ),
                'authenticated', 'authenticated', now(), now()
            );
            count_created := count_created + 1;
        END IF;
        
        -- D. PASTIKAN IDENTITY JUGA UPDATE (Agar login jalan)
        DELETE FROM auth.identities WHERE user_id = r.id; -- Hapus identitas lama yang mungkin salah domain
        
        INSERT INTO auth.identities (
            id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
        ) VALUES (
            uuid_generate_v4(),
            r.id,
            jsonb_build_object('sub', r.id, 'email', v_email),
            'email',
            v_email,
            now(), now(), now()
        );

        -- E. KEMBALIKAN PASSWORD TEXT KE PUBLIC (Agar admin bisa lihat)
        UPDATE public.users 
        SET password_text = v_pass, qr_login_password = v_pass 
        WHERE id = r.id;

    END LOOP;

    RETURN json_build_object(
        'status', 'success',
        'fixed', count_fixed,
        'created', count_created,
        'domain_used', v_clean_domain,
        'message', 'Sukses! Data guru disinkronkan menggunakan domain: ' || v_clean_domain
    );
END;
$$;

-- 2. UPDATE FUNGSI IMPORT (AGAR SAAT IMPORT CSV JUGA PAKAI DOMAIN CONFIG)
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

  CREATE TEMP TABLE incoming_users_import (
    "username" text, "password" text, "fullName" text, "nisn" text, "class" text, "major" text, "gender" text, "religion" text, "photoUrl" text, "role" text
  ) ON COMMIT DROP;

  INSERT INTO incoming_users_import
  SELECT * FROM json_populate_recordset(null::incoming_users_import, users_data);
  
  UPDATE incoming_users_import SET role = 'student' WHERE role IS NULL OR role = '';
  UPDATE incoming_users_import SET class = 'STAFF' WHERE role = 'teacher' AND (class IS NULL OR class = '');

  -- Update Auth dengan Domain yang Benar
  UPDATE auth.users au
  SET 
    email = CASE 
        WHEN i.role = 'teacher' THEN i."username" || '@' || v_teacher_domain -- INI KUNCINYA
        ELSE i."nisn" || '@' || v_clean_domain 
    END,
    encrypted_password = crypt(i."password", gen_salt('bf')),
    raw_user_meta_data = jsonb_build_object(
          'full_name', i."fullName", 'nisn', i."nisn", 'class', i."class", 'major', i."major", 'role', i."role", 'password_text', i."password"
    ),
    updated_at = now()
  FROM incoming_users_import i
  JOIN public.users pu ON ((i.role = 'student' AND pu.nisn = i.nisn) OR (i.role = 'teacher' AND pu.username = i.username))
  WHERE au.id = pu.id;

  -- Update Public
  WITH updated_public_users AS (
      UPDATE public.users pu
      SET full_name = i."fullName", class = i."class", major = i."major", gender = i."gender", religion = i."religion", photoUrl = COALESCE(i."photoUrl", pu.photo_url), password_text = i."password", qr_login_password = i."password", role = i."role", updated_at = now()
      FROM incoming_users_import i
      WHERE (i.role = 'student' AND pu.nisn = i.nisn) OR (i.role = 'teacher' AND pu.username = i.username)
      RETURNING pu.id
  )
  SELECT count(*) INTO updated_count FROM updated_public_users;

  -- Insert Baru (Juga pakai domain dinamis)
  WITH new_auth_users AS (
    INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at)
    SELECT
      uuid_generate_v4(), '00000000-0000-0000-0000-000000000000',
      CASE 
        WHEN i.role = 'teacher' THEN i."username" || '@' || v_teacher_domain 
        ELSE i."nisn" || '@' || v_clean_domain 
      END,
      crypt(i."password", gen_salt('bf')), now(), '{"provider": "email", "providers": ["email"]}'::jsonb,
      jsonb_build_object('full_name', i."fullName", 'nisn', i."nisn", 'class', i."class", 'major', i."major", 'gender', i."gender", 'religion', i."religion", 'photo_url', COALESCE(i."photoUrl", ''), 'password_text', i."password", 'role', i."role"),
      'authenticated', 'authenticated', now(), now()
    FROM incoming_users_import i
    WHERE NOT EXISTS (SELECT 1 FROM public.users pu WHERE (i.role = 'student' AND pu.nisn = i.nisn) OR (i.role = 'teacher' AND pu.username = i.username))
    RETURNING id, email, raw_user_meta_data
  )
  INSERT INTO public.users (id, username, full_name, nisn, class, major, gender, religion, photo_url, password_text, qr_login_password, role)
  SELECT 
    nau.id,
    CASE WHEN (nau.raw_user_meta_data->>'role') = 'teacher' THEN split_part(nau.email, '@', 1) ELSE (nau.raw_user_meta_data->>'nisn') END,
    (nau.raw_user_meta_data->>'full_name'), (nau.raw_user_meta_data->>'nisn'), (nau.raw_user_meta_data->>'class'), (nau.raw_user_meta_data->>'major'), (nau.raw_user_meta_data->>'gender'), (nau.raw_user_meta_data->>'religion'), (nau.raw_user_meta_data->>'photo_url'), (nau.raw_user_meta_data->>'password_text'), (nau.raw_user_meta_data->>'password_text'), (nau.raw_user_meta_data->>'role')
  FROM new_auth_users nau;

  SELECT count(*) INTO inserted_count FROM incoming_users_import i WHERE NOT EXISTS (SELECT 1 FROM public.users pu WHERE (i.role = 'student' AND pu.nisn = i.nisn) OR (i.role = 'teacher' AND pu.username = i.username));

  -- Insert Identities (Login Fix)
  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  SELECT uuid_generate_v4(), au.id, jsonb_build_object('sub', au.id, 'email', au.email), 'email', au.email, now(), now(), now()
  FROM auth.users au WHERE NOT EXISTS (SELECT 1 FROM auth.identities WHERE user_id = au.id);

  RETURN json_build_object('success', true, 'updated', updated_count, 'inserted', inserted_count, 'domain_used', v_clean_domain);
END;
$$;

COMMIT;

-- EKSEKUSI PERBAIKAN SEKARANG JUGA
SELECT public.repair_teacher_logins();
