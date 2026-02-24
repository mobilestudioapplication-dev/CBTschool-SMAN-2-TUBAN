
-- =================================================================
-- FIX_TEACHER_LOGIN_V2.sql
-- SOLUSI FINAL LOGIN GURU & PEMISAHAN ADMIN
-- =================================================================

BEGIN;

-- 1. Pastikan Ekstensi Enkripsi Aktif
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Kunci Domain Sekolah agar konsisten
UPDATE public.app_config 
SET school_domain = 'smpn2demak.sch.id',
    email_domain = '@smpn2demak.sch.id'
WHERE id = 1;

-- 3. NORMALISASI & RESET AKUN GURU
-- Ubah semua username guru menjadi huruf kecil & tanpa spasi
DO $$
DECLARE
    r RECORD;
    v_domain TEXT := 'smpn2demak.sch.id';
    v_raw_username TEXT;
    v_clean_username TEXT; -- Username bersih (kecil, tanpa spasi)
    v_target_email TEXT;
    v_target_pass TEXT := '123456'; -- Password Default
    count_fixed INT := 0;
BEGIN
    -- Loop hanya user dengan role 'teacher'
    FOR r IN SELECT * FROM public.users WHERE role = 'teacher' LOOP
        
        -- A. AMBIL BASE USERNAME
        v_raw_username := split_part(r.username, '@', 1);
        
        -- B. BERSIHKAN USERNAME (Huruf Kecil, Hapus Spasi, Hapus Karakter Aneh)
        -- Contoh: "Pak Budi" -> "pakbudi"
        v_clean_username := lower(regexp_replace(v_raw_username, '\s+', '', 'g'));
        
        -- C. GENERATE EMAIL BARU
        v_target_email := v_clean_username || '@teacher.' || v_domain;

        -- D. UPDATE AUTH.USERS (Login System)
        IF EXISTS (SELECT 1 FROM auth.users WHERE id = r.id) THEN
            UPDATE auth.users 
            SET 
                email = v_target_email,
                encrypted_password = crypt(v_target_pass, gen_salt('bf')),
                email_confirmed_at = now(),
                updated_at = now(),
                raw_user_meta_data = jsonb_build_object(
                    'full_name', r.full_name,
                    'nisn', v_clean_username, -- Simpan username bersih sebagai ID
                    'class', 'STAFF',
                    'role', 'teacher',
                    'major', r.major,
                    'password_text', v_target_pass
                )
            WHERE id = r.id;
        ELSE
            -- Jika akun auth hilang, buat baru
            INSERT INTO auth.users (
                id, instance_id, email, encrypted_password, email_confirmed_at, 
                raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at
            ) VALUES (
                r.id,
                '00000000-0000-0000-0000-000000000000',
                v_target_email,
                crypt(v_target_pass, gen_salt('bf')),
                now(),
                '{"provider": "email", "providers": ["email"]}'::jsonb,
                jsonb_build_object(
                    'full_name', r.full_name,
                    'nisn', v_clean_username,
                    'class', 'STAFF',
                    'role', 'teacher',
                    'password_text', v_target_pass
                ),
                'authenticated', 'authenticated', now(), now()
            );
        END IF;

        -- E. FIX IDENTITIES (Penting untuk login)
        DELETE FROM auth.identities WHERE user_id = r.id;
        INSERT INTO auth.identities (
            id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
        ) VALUES (
            uuid_generate_v4(),
            r.id,
            jsonb_build_object('sub', r.id, 'email', v_target_email),
            'email',
            v_target_email,
            now(), now(), now()
        );

        -- F. UPDATE PUBLIC USERS (Tampilan)
        UPDATE public.users 
        SET 
            username = v_clean_username, -- Tampilkan username bersih
            password_text = v_target_pass,
            qr_login_password = v_target_pass
        WHERE id = r.id;

        count_fixed := count_fixed + 1;
    END LOOP;

    RAISE NOTICE 'Selesai! % Akun Guru berhasil dinormalisasi.', count_fixed;
END $$;

COMMIT;

-- Tampilkan daftar akun guru yang valid untuk dicoba login
SELECT 
    full_name as "Nama Guru", 
    username as "Username Login (Gunakan Ini)", 
    password_text as "Password (Default)"
FROM public.users 
WHERE role = 'teacher';
