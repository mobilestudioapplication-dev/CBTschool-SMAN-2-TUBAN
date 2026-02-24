
-- =================================================================
-- FIX_LOGIN_SYNC_PASSWORD.sql (REVISI BERSIH)
-- TUJUAN: 
-- 1. Login System (Auth) -> Tetap pakai format Email (NISN@sekolah...)
-- 2. Data Siswa (Public) -> KEMBALI KE FORMAT ASLI (NISN saja)
-- =================================================================

BEGIN;

-- 1. Pastikan ekstensi enkripsi aktif
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Pastikan domain sekolah tersetting
UPDATE public.app_config 
SET school_domain = 'smpn2demak.sch.id' 
WHERE id = 1;

-- 3. JALANKAN PERBAIKAN
DO $$
DECLARE
    student_record RECORD;
    target_email TEXT;
    target_username TEXT; -- Variable baru untuk username asli
    password_to_use TEXT;
    domain_name TEXT;
    count_processed INT := 0;
    count_updated INT := 0;
BEGIN
    -- Ambil domain dari config
    SELECT COALESCE(NULLIF(school_domain, ''), 'smpn2demak.sch.id') INTO domain_name FROM public.app_config LIMIT 1;

    -- Loop semua siswa (kecuali admin)
    FOR student_record IN 
        SELECT * FROM public.users 
        WHERE nisn IS NOT NULL AND nisn <> '' 
        AND username NOT LIKE '%admin%'
    LOOP
        count_processed := count_processed + 1;

        -- A. TENTUKAN PASSWORD
        IF student_record.password_text IS NOT NULL AND student_record.password_text <> '' THEN
            password_to_use := student_record.password_text;
        ELSE
            password_to_use := student_record.nisn;
        END IF;

        -- B. TENTUKAN FORMAT DATA
        -- 1. Untuk Auth (Wajib Email): NISN + @domain
        target_email := student_record.nisn || '@' || domain_name;
        
        -- 2. Untuk Public (Tampilan): NISN Saja (Sesuai Excel)
        target_username := student_record.nisn; 

        -- C. UPDATE AUTH.USERS (SISTEM LOGIN)
        -- Cek apakah user ada di auth
        IF EXISTS (SELECT 1 FROM auth.users WHERE id = student_record.id) THEN
            -- Reset login credential
            UPDATE auth.users
            SET 
                email = target_email,
                encrypted_password = crypt(password_to_use, gen_salt('bf')),
                email_confirmed_at = now(),
                raw_user_meta_data = jsonb_build_object(
                    'full_name', student_record.full_name,
                    'nisn', student_record.nisn,
                    'class', student_record.class,
                    'password_text', password_to_use
                )
            WHERE id = student_record.id;
        ELSE
            -- Buat user auth baru jika hilang (sinkronisasi ID)
            INSERT INTO auth.users (
                id, instance_id, email, encrypted_password, email_confirmed_at, 
                raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at
            ) VALUES (
                student_record.id,
                '00000000-0000-0000-0000-000000000000',
                target_email,
                crypt(password_to_use, gen_salt('bf')),
                now(),
                '{"provider": "email", "providers": ["email"]}'::jsonb,
                jsonb_build_object(
                    'full_name', student_record.full_name,
                    'nisn', student_record.nisn,
                    'class', student_record.class,
                    'password_text', password_to_use
                ),
                'authenticated', 'authenticated', now(), now()
            );
        END IF;
        
        -- D. UPDATE PUBLIC.USERS (DATA TAMPILAN)
        -- Kembalikan username menjadi NISN murni (hapus @domain jika ada)
        UPDATE public.users 
        SET 
            username = target_username, -- Kembali ke NISN saja
            password_text = password_to_use
        WHERE id = student_record.id;

        count_updated := count_updated + 1;
    END LOOP;

    RAISE NOTICE 'Selesai. % Data Siswa dikembalikan ke format NISN.', count_updated;
END $$;

COMMIT;

-- 4. VERIFIKASI HASIL
SELECT id, username, password_text FROM public.users WHERE username NOT LIKE '%admin%' LIMIT 5;
