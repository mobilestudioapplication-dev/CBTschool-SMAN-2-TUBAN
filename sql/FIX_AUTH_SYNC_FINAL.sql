
-- =================================================================
-- FIX_LOGIN_AND_QR_SYNC.sql
-- PERBAIKAN TOTAL: 
-- 1. Mengisi qr_login_password siswa yang kosong
-- 2. Sinkronisasi password Auth agar login berhasil
-- =================================================================

BEGIN;

-- 1. Pastikan ekstensi enkripsi aktif
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Pastikan kolom pendukung ada
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS password_text TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS qr_login_password TEXT;

-- 3. PERBAIKI TRIGGER (Agar user baru otomatis punya qr_login_password)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  -- Tentukan password awal: ambil dari metadata, atau default ke NISN (bagian depan email)
  v_pass TEXT := COALESCE(new.raw_user_meta_data ->> 'password_text', split_part(new.email, '@', 1));
BEGIN
  INSERT INTO public.users (id, username, full_name, nisn, class, major, gender, religion, photo_url, password_text, qr_login_password)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data ->> 'full_name', 'Nama Belum Diatur'),
    COALESCE(new.raw_user_meta_data ->> 'nisn', split_part(new.email, '@', 1)),
    COALESCE(new.raw_user_meta_data ->> 'class', 'Belum diatur'),
    COALESCE(new.raw_user_meta_data ->> 'major', 'Belum diatur'),
    COALESCE(new.raw_user_meta_data ->> 'gender', 'Laki-laki'),
    COALESCE(new.raw_user_meta_data ->> 'religion', 'Islam'),
    COALESCE(new.raw_user_meta_data ->> 'photo_url', 'https://ui-avatars.com/api/?name=' || COALESCE(new.raw_user_meta_data ->> 'full_name', 'User')),
    v_pass, -- Simpan password text
    v_pass  -- Simpan juga ke qr_login_password
  )
  ON CONFLICT (id) DO UPDATE SET
    username = EXCLUDED.username,
    password_text = EXCLUDED.password_text,
    qr_login_password = EXCLUDED.qr_login_password;
  RETURN new;
END;
$$;

-- 4. JALANKAN SINKRONISASI DATA MASSAL (Untuk data yang sudah ada)
DO $$
DECLARE
    r RECORD;
    final_email TEXT;
    final_pass TEXT;
    v_domain TEXT;
    count_fixed INT := 0;
BEGIN
    -- Ambil domain sekolah default
    SELECT COALESCE(NULLIF(school_domain, ''), 'smpn2demak.sch.id') INTO v_domain FROM public.app_config LIMIT 1;

    -- Loop semua user (kecuali admin)
    FOR r IN SELECT * FROM public.users WHERE username NOT LIKE '%admin%' LOOP
        
        -- LOGIKA EMAIL
        IF position('@' in r.username) > 0 THEN
            final_email := r.username;
        ELSE
            final_email := r.nisn || '@' || v_domain;
        END IF;

        -- LOGIKA PASSWORD: Prioritas password_text > qr_login_password > NISN
        IF r.password_text IS NOT NULL AND r.password_text <> '' THEN
            final_pass := r.password_text;
        ELSIF r.qr_login_password IS NOT NULL AND r.qr_login_password <> '' THEN
            final_pass := r.qr_login_password;
        ELSE
            final_pass := r.nisn;
        END IF;

        -- A. UPDATE AUTH (Sistem Login)
        -- Ini memperbaiki "Invalid login credentials" dengan me-reset password di sistem auth
        UPDATE auth.users 
        SET email = final_email, 
            encrypted_password = crypt(final_pass, gen_salt('bf')),
            email_confirmed_at = now(),
            raw_user_meta_data = jsonb_build_object(
                'full_name', r.full_name,
                'nisn', r.nisn,
                'class', r.class,
                'password_text', final_pass
            )
        WHERE id = r.id;

        -- B. UPDATE PUBLIC (Data Tampilan & QR)
        -- Ini mengisi kolom qr_login_password yang kosong di screenshot
        UPDATE public.users 
        SET 
            username = final_email, 
            password_text = final_pass,
            qr_login_password = final_pass 
        WHERE id = r.id;

        -- C. INSERT AUTH JIKA HILANG (Recovery)
        IF NOT FOUND THEN
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

        count_fixed := count_fixed + 1;
    END LOOP;

    RAISE NOTICE 'Selesai! % akun siswa berhasil diperbaiki (Password & QR disinkronkan).', count_fixed;
END $$;

COMMIT;

-- 5. Cek hasil: Kolom qr_login_password harusnya sudah terisi sekarang
SELECT id, username, qr_login_password FROM public.users WHERE username NOT LIKE '%admin%' LIMIT 10;
