
-- =================================================================
-- SQL_REPAIR_TEACHER_LOGINS.sql
-- MODUL: PERBAIKAN & SINKRONISASI AKUN GURU (MANUAL SYNC)
-- Jalankan script ini di SQL Editor Supabase
-- =================================================================

BEGIN;

-- 1. Pastikan ekstensi enkripsi aktif
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. FUNGSI PERBAIKAN LOGIN GURU (ENTERPRISE GRADE)
CREATE OR REPLACE FUNCTION public.repair_teacher_logins()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    r RECORD;
    v_domain TEXT;
    v_email TEXT;
    v_pass TEXT;
    count_fixed INT := 0;
    count_created INT := 0;
BEGIN
    -- Validasi Admin
    IF NOT (SELECT auth.email() = 'admin@cbtschool.com') THEN
        RAISE EXCEPTION '403: Forbidden - Access Denied';
    END IF;

    -- Ambil domain sekolah dari konfigurasi
    SELECT COALESCE(NULLIF(school_domain, ''), 'smpn2demak.sch.id') INTO v_domain FROM public.app_config LIMIT 1;

    -- Loop semua user dengan role 'teacher'
    FOR r IN SELECT * FROM public.users WHERE role = 'teacher' LOOP
        
        -- A. TENTUKAN PASSWORD
        -- Prioritas: Password Text (Input Admin) > '123456' (Default)
        IF r.password_text IS NOT NULL AND r.password_text <> '' THEN
            v_pass := r.password_text;
        ELSE
            v_pass := '123456'; -- Default password guru jika tidak diatur
        END IF;

        -- B. TENTUKAN EMAIL (Username Login)
        -- Jika username sudah format email, gunakan. Jika tidak, format manual.
        IF position('@' in r.username) > 0 THEN
            v_email := r.username;
        ELSE
            -- Format standar: username@teacher.domain
            v_email := r.username || '@teacher.' || v_domain;
        END IF;

        -- C. EKSEKUSI PERBAIKAN (UPSERT KE AUTH.USERS)
        
        -- Cek apakah akun auth sudah ada
        IF EXISTS (SELECT 1 FROM auth.users WHERE id = r.id) THEN
            -- UPDATE (Reset Password & Email)
            UPDATE auth.users 
            SET 
                email = v_email,
                encrypted_password = crypt(v_pass, gen_salt('bf', 10)),
                email_confirmed_at = now(),
                raw_user_meta_data = jsonb_build_object(
                    'full_name', r.full_name,
                    'nisn', r.nisn, -- NIP/ID
                    'class', 'STAFF',
                    'major', r.major,
                    'role', 'teacher',
                    'password_text', v_pass
                ),
                updated_at = now()
            WHERE id = r.id;
            
            count_fixed := count_fixed + 1;
        ELSE
            -- CREATE (Jika hilang di sistem login)
            INSERT INTO auth.users (
                id, instance_id, email, encrypted_password, email_confirmed_at, 
                raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at
            ) VALUES (
                r.id, -- PENTING: ID harus sama dengan public.users
                '00000000-0000-0000-0000-000000000000',
                v_email,
                crypt(v_pass, gen_salt('bf', 10)),
                now(),
                '{"provider": "email", "providers": ["email"]}'::jsonb,
                jsonb_build_object(
                    'full_name', r.full_name,
                    'nisn', r.nisn,
                    'class', 'STAFF',
                    'major', r.major,
                    'role', 'teacher',
                    'password_text', v_pass
                ),
                'authenticated', 'authenticated', now(), now()
            );
            
            count_created := count_created + 1;
        END IF;
        
        -- D. PASTIKAN IDENTITY ADA (Penting untuk Supabase Auth v2)
        INSERT INTO auth.identities (
            id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
        ) VALUES (
            uuid_generate_v4(), -- Generate ID baru untuk identity
            r.id,
            jsonb_build_object('sub', r.id, 'email', v_email),
            'email',
            v_email, -- Provider ID adalah email
            now(), now(), now()
        ) ON CONFLICT (provider, provider_id) DO UPDATE 
        SET identity_data = EXCLUDED.identity_data, updated_at = now();

        -- E. UPDATE KEMBALI PUBLIC USER (Agar konsisten)
        UPDATE public.users 
        SET 
            password_text = v_pass, 
            qr_login_password = v_pass 
        WHERE id = r.id;

    END LOOP;

    RETURN json_build_object(
        'status', 'success',
        'fixed', count_fixed,
        'created', count_created,
        'message', 'Sukses! ' || (count_fixed + count_created) || ' akun guru telah diperbaiki dan disinkronkan.'
    );
END;
$$;

COMMIT;

SELECT 'Fungsi repair_teacher_logins berhasil diinstal.' as status;
