
-- =================================================================
-- SQL_FIX_TEACHER_LOGIN_CREDENTIALS.sql
-- TUJUAN: Memperbaiki login Guru yang gagal terus menerus.
-- 1. Memastikan email di sistem Auth sesuai format: username@teacher.domain
-- 2. Memaksa reset password di sistem Auth agar sama dengan 'Password Asli' (password_text)
-- =================================================================

BEGIN;

-- 1. Pastikan ekstensi enkripsi aktif
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Update konfigurasi domain sekolah (Hardcode untuk kepastian)
UPDATE public.app_config 
SET school_domain = 'smpn2demak.sch.id' 
WHERE id = 1;

-- 3. EKSEKUSI PERBAIKAN MASSAL KHUSUS GURU
DO $$
DECLARE
    r RECORD;
    v_domain TEXT := 'smpn2demak.sch.id';
    v_target_email TEXT;
    v_target_pass TEXT;
    v_clean_username TEXT;
    count_fixed INT := 0;
BEGIN
    -- Loop hanya untuk user dengan role 'teacher'
    FOR r IN SELECT * FROM public.users WHERE role = 'teacher' LOOP
        
        -- A. TENTUKAN USERNAME BERSIH
        -- Ambil bagian depan sebelum @ jika ada, atau ambil utuh
        v_clean_username := split_part(r.username, '@', 1);

        -- B. TENTUKAN PASSWORD YANG AKAN DIPAKAI
        -- Prioritas: password_text (dari Excel/Input) > qr_login_password > default '123456'
        IF r.password_text IS NOT NULL AND r.password_text <> '' THEN
            v_target_pass := r.password_text;
        ELSIF r.qr_login_password IS NOT NULL AND r.qr_login_password <> '' THEN
            v_target_pass := r.qr_login_password;
        ELSE
            v_target_pass := '123456'; -- Default password jika kosong
        END IF;

        -- C. TENTUKAN EMAIL LOGIN (Sesuai Logika Frontend LoginScreenGuru.tsx)
        -- Format: username@teacher.smpn2demak.sch.id
        v_target_email := v_clean_username || '@teacher.' || v_domain;

        -- D. UPDATE AUTH.USERS (Sistem Login Inti)
        -- Kita cari user berdasarkan ID yang sama di public.users
        IF EXISTS (SELECT 1 FROM auth.users WHERE id = r.id) THEN
            UPDATE auth.users 
            SET 
                email = v_target_email,
                encrypted_password = crypt(v_target_pass, gen_salt('bf')),
                email_confirmed_at = now(),
                updated_at = now(),
                raw_app_meta_data = '{"provider": "email", "providers": ["email"]}'::jsonb,
                raw_user_meta_data = jsonb_build_object(
                    'full_name', r.full_name,
                    'nisn', v_clean_username, -- Gunakan username sebagai ID
                    'class', 'STAFF',
                    'role', 'teacher',
                    'major', r.major,
                    'password_text', v_target_pass
                )
            WHERE id = r.id;
        ELSE
            -- Jika akun auth hilang, buat baru (Restore)
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

        -- E. SINKRONISASI IDENTITIES (Penting untuk Supabase baru)
        -- Hapus identitas lama yang mungkin konflik
        DELETE FROM auth.identities WHERE user_id = r.id;
        
        -- Masukkan identitas baru yang sesuai email baru
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

        -- F. UPDATE PUBLIC.USERS (Data Tampilan)
        -- Simpan username bersih (tanpa @teacher...) agar mudah dibaca di tabel admin
        -- Simpan password text agar admin bisa melihatnya
        UPDATE public.users 
        SET 
            username = v_clean_username, 
            password_text = v_target_pass,
            qr_login_password = v_target_pass,
            class = 'STAFF', -- Pastikan class STAFF
            role = 'teacher' -- Pastikan role teacher
        WHERE id = r.id;

        count_fixed := count_fixed + 1;
    END LOOP;

    RAISE NOTICE 'Selesai! % Akun Guru berhasil diperbaiki.', count_fixed;
END $$;

COMMIT;

-- 4. Tampilkan Hasil (Kredensial yang Valid)
SELECT full_name, username, password_text as "PASSWORD LOGIN" 
FROM public.users 
WHERE role = 'teacher';
