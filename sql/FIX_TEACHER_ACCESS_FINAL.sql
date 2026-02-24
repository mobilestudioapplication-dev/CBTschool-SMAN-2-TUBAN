
-- =================================================================
-- FIX_TEACHER_ACCESS_FINAL.sql
-- SOLUSI PERMANEN MASALAH LOGIN GURU
-- =================================================================

BEGIN;

-- 1. Pastikan Ekstensi Enkripsi Aktif
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Pastikan Domain Sekolah Benar
UPDATE public.app_config 
SET school_domain = 'smpn2demak.sch.id',
    email_domain = '@smpn2demak.sch.id'
WHERE id = 1;

-- 3. RESET & STANDARISASI AKUN GURU
-- Script ini akan mengubah email login guru menjadi: [username]@teacher.smpn2demak.sch.id
-- Dan password menjadi: Password asli dari Excel (jika ada) ATAU '123456'
DO $$
DECLARE
    r RECORD;
    v_domain TEXT := 'smpn2demak.sch.id';
    v_clean_username TEXT;
    v_target_email TEXT;
    v_target_pass TEXT;
    count_fixed INT := 0;
BEGIN
    -- Loop hanya user dengan role 'teacher'
    FOR r IN SELECT * FROM public.users WHERE role = 'teacher' LOOP
        
        -- A. BERSIHKAN USERNAME (Ambil bagian sebelum @ jika ada)
        v_clean_username := split_part(r.username, '@', 1);
        
        -- B. TENTUKAN PASSWORD (Prioritas: Password Text > QR > 123456)
        IF r.password_text IS NOT NULL AND r.password_text <> '' THEN
            v_target_pass := r.password_text;
        ELSIF r.qr_login_password IS NOT NULL AND r.qr_login_password <> '' THEN
            v_target_pass := r.qr_login_password;
        ELSE
            v_target_pass := '123456'; -- Default password
        END IF;

        -- C. FORMAT EMAIL STANDAR (WAJIB SAMA DENGAN FRONTEND)
        -- Format: username@teacher.smpn2demak.sch.id
        v_target_email := v_clean_username || '@teacher.' || v_domain;

        -- D. UPDATE AUTH.USERS (Kunci Pintu Masuk)
        IF EXISTS (SELECT 1 FROM auth.users WHERE id = r.id) THEN
            UPDATE auth.users 
            SET 
                email = v_target_email,
                encrypted_password = crypt(v_target_pass, gen_salt('bf')),
                email_confirmed_at = now(),
                updated_at = now(),
                raw_user_meta_data = jsonb_build_object(
                    'full_name', r.full_name,
                    'nisn', v_clean_username, 
                    'class', 'STAFF',
                    'role', 'teacher',
                    'major', r.major,
                    'password_text', v_target_pass
                )
            WHERE id = r.id;
        ELSE
            -- Jika akun hilang, buat baru
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

        -- E. FIX IDENTITIES (Agar tidak error duplikat provider)
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

        -- F. UPDATE PUBLIC USERS (Agar tampilan di Admin Dashboard bersih)
        UPDATE public.users 
        SET 
            username = v_clean_username, -- Tampilkan username saja tanpa email
            password_text = v_target_pass,
            qr_login_password = v_target_pass
        WHERE id = r.id;

        count_fixed := count_fixed + 1;
    END LOOP;

    RAISE NOTICE 'Selesai! % Akun Guru berhasil distandarisasi.', count_fixed;
END $$;

COMMIT;

-- Tampilkan daftar akun guru yang valid untuk dicoba login
SELECT 
    full_name as "Nama Guru", 
    username as "Username Login", 
    username || '@teacher.smpn2demak.sch.id' as "Email Sistem (Internal)",
    password_text as "Password"
FROM public.users 
WHERE role = 'teacher';
