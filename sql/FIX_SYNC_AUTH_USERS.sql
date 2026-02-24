
-- =================================================================
-- FIX_SYNC_AUTH_USERS.sql
-- PERBAIKAN DARURAT: GENERATE AKUN LOGIN DARI DATA PROFIL SISWA
-- Jalankan ini jika siswa ada di tabel 'users' tapi tidak bisa login
-- =================================================================

BEGIN;

-- 1. Pastikan Ekstensi Enkripsi Aktif
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Pastikan Konfigurasi Domain Sekolah Benar
UPDATE public.app_config SET school_domain = 'smpn2demak.sch.id' WHERE id = 1;

-- 3. JALANKAN PROSES SINKRONISASI
DO $$
DECLARE
    student_record RECORD;
    new_email TEXT;
    new_password TEXT;
    domain_name TEXT := 'smpn2demak.sch.id';
    count_restored INT := 0;
    count_updated INT := 0;
BEGIN
    -- Loop semua siswa yang ada di tabel profil publik (kecuali admin)
    FOR student_record IN 
        SELECT * FROM public.users 
        WHERE nisn IS NOT NULL AND nisn <> '' 
        AND username NOT LIKE '%admin%'
    LOOP
        -- Format Login yang Wajib:
        -- Email: [NISN]@smpn2demak.sch.id
        -- Password: [NISN]
        new_email := student_record.nisn || '@' || domain_name;
        new_password := student_record.nisn;

        -- Cek apakah ID user ini sudah ada di sistem Auth Supabase?
        IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = student_record.id) THEN
            -- KASUS KRITIKAL: User ada di Public tapi TIDAK ADA di Auth.
            -- Kita buatkan akun loginnya secara manual menggunakan ID yang sama.
            
            INSERT INTO auth.users (
                id,
                instance_id,
                email,
                encrypted_password,
                email_confirmed_at,
                raw_app_meta_data,
                raw_user_meta_data,
                aud,
                role,
                created_at,
                updated_at
            ) VALUES (
                student_record.id, -- PENTING: Gunakan ID yang sama dengan public.users
                '00000000-0000-0000-0000-000000000000',
                new_email,
                crypt(new_password, gen_salt('bf')), -- Hash Password
                now(),
                '{"provider": "email", "providers": ["email"]}'::jsonb,
                jsonb_build_object(
                    'full_name', student_record.full_name,
                    'nisn', student_record.nisn,
                    'class', student_record.class,
                    'gender', student_record.gender
                ),
                'authenticated',
                'authenticated',
                now(),
                now()
            );
            
            -- Update username di public agar sinkron
            UPDATE public.users SET username = new_email WHERE id = student_record.id;
            
            count_restored := count_restored + 1;
        ELSE
            -- User sudah ada di Auth, kita pastikan passwordnya benar (Reset Password massal)
            UPDATE auth.users
            SET 
                email = new_email,
                encrypted_password = crypt(new_password, gen_salt('bf')),
                email_confirmed_at = now()
            WHERE id = student_record.id;
            
            UPDATE public.users SET username = new_email WHERE id = student_record.id;
            
            count_updated := count_updated + 1;
        END IF;
    END LOOP;

    RAISE NOTICE 'Selesai! Akun dipulihkan: %, Akun diupdate: %', count_restored, count_updated;
END $$;

COMMIT;

-- 4. Cek Hasil (Harusnya user 123456 muncul di sini sekarang)
SELECT id, email, created_at FROM auth.users WHERE email LIKE '123456%';
