
-- =================================================================
-- FIX_LOGIN_CRITICAL_FINAL.sql
-- PERBAIKAN TOTAL: 
-- 1. Mengisi qr_login_password siswa yang kosong
-- 2. Sinkronisasi password Auth agar login berhasil
-- 3. Memaksa domain sekolah ke smpn2demak.sch.id
-- =================================================================

BEGIN;

-- 1. Pastikan ekstensi enkripsi aktif
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Paksa domain sekolah ke smpn2demak.sch.id
UPDATE public.app_config 
SET school_domain = 'smpn2demak.sch.id' 
WHERE id = 1;

-- 3. Pastikan kolom pendukung ada
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS password_text TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS qr_login_password TEXT;

-- 4. PERBAIKI TRIGGER (Agar user baru otomatis punya qr_login_password)
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

-- 5. JALANKAN SINKRONISASI DATA MASSAL (NUCLEAR OPTION)
DO $$
DECLARE
    r RECORD;
    final_email TEXT;
    final_pass TEXT;
    target_username TEXT;
    v_domain TEXT := 'smpn2demak.sch.id';
    count_fixed INT := 0;
BEGIN
    -- Loop semua user (kecuali admin)
    FOR r IN SELECT * FROM public.users WHERE username NOT LIKE '%admin%' AND nisn IS NOT NULL AND nisn <> '' LOOP
        
        -- LOGIKA PASSWORD: Prioritas password_text > qr_login_password > NISN
        IF r.password_text IS NOT NULL AND r.password_text <> '' THEN
            final_pass := trim(r.password_text);
        ELSIF r.qr_login_password IS NOT NULL AND r.qr_login_password <> '' THEN
            final_pass := trim(r.qr_login_password);
        ELSE
            final_pass := trim(r.nisn);
        END IF;

        -- A. FORMAT DATA BARU
        -- Auth Email: NISN@domain
        final_email := trim(r.nisn) || '@' || v_domain;
        
        -- Public Username: NISN Saja (Untuk tampilan bersih)
        target_username := trim(r.nisn);

        -- B. UPDATE AUTH (Sistem Login) - Reset Password
        -- Jika user ada di auth, update. Jika tidak, buat baru (di blok bawah).
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
            -- KASUS HILANG: User ada di Public tapi hilang di Auth (Orphan)
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

        -- C. UPDATE PUBLIC (Data Tampilan & QR)
        UPDATE public.users 
        SET 
            username = target_username, 
            password_text = final_pass,
            qr_login_password = final_pass 
        WHERE id = r.id;

        count_fixed := count_fixed + 1;
    END LOOP;

    RAISE NOTICE 'Selesai! % akun siswa berhasil diperbaiki (Password disinkronkan ke NISN/PasswordText).', count_fixed;
END $$;

COMMIT;

-- 6. Cek hasil: Pastikan password text terisi
SELECT id, username, password_text FROM public.users WHERE username NOT LIKE '%admin%' LIMIT 10;
