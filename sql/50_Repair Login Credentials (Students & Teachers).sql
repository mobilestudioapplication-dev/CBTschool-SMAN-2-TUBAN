
-- =================================================================
-- MASTER FIX: REPAIR LOGIN CREDENTIALS (STUDENT & TEACHER)
-- Jalankan script ini untuk memperbaiki error "Invalid login credentials"
-- =================================================================

BEGIN;

-- 1. Pastikan Ekstensi Enkripsi Aktif
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. [FIX] Pastikan Kolom school_domain Ada sebelum di-update
ALTER TABLE public.app_config 
ADD COLUMN IF NOT EXISTS school_domain TEXT DEFAULT 'smpn2demak.sch.id';

-- 3. Pastikan Domain Sekolah Konsisten
UPDATE public.app_config 
SET school_domain = 'smpn2demak.sch.id' 
WHERE id = 1;

-- 4. JALANKAN LOGIKA PERBAIKAN MASSAL
DO $$
DECLARE
    r RECORD;
    final_email TEXT;
    final_pass TEXT;
    v_domain TEXT;
    count_student INT := 0;
    count_teacher INT := 0;
BEGIN
    -- Ambil domain sekolah
    SELECT COALESCE(NULLIF(school_domain, ''), 'smpn2demak.sch.id') INTO v_domain FROM public.app_config LIMIT 1;

    -- Loop semua user (Kecuali Admin Utama)
    FOR r IN SELECT * FROM public.users WHERE username <> 'admin@cbtschool.com' LOOP
        
        -- === LOGIKA 1: MENENTUKAN EMAIL LOGIN ===
        IF r.role = 'teacher' THEN
            -- Guru: Gunakan Email asli mereka
            -- Jika username tidak valid email, tambahkan fake domain agar Supabase tidak error
            IF position('@' in r.username) > 0 THEN
                final_email := r.username;
            ELSE
                final_email := r.username || '@teacher.smpn2demak.sch.id';
            END IF;
        ELSE
            -- Siswa: Gunakan Format NISN@domain
            -- Fallback jika NISN kosong, gunakan username
            IF r.nisn IS NOT NULL AND r.nisn <> '' THEN
                final_email := r.nisn || '@' || v_domain;
            ELSE
                final_email := r.username || '@' || v_domain; 
            END IF;
        END IF;

        -- === LOGIKA 2: MENENTUKAN PASSWORD ===
        -- Prioritas: Password Text (Excel) > QR Password > NISN (Siswa) / Default (Guru)
        IF r.password_text IS NOT NULL AND r.password_text <> '' THEN
            final_pass := r.password_text;
        ELSIF r.qr_login_password IS NOT NULL AND r.qr_login_password <> '' THEN
            final_pass := r.qr_login_password;
        ELSE
            IF r.role = 'teacher' THEN
                final_pass := '123456'; -- Default password Guru jika kosong
            ELSE
                final_pass := r.nisn;   -- Default password Siswa (NISN)
            END IF;
        END IF;

        -- === LOGIKA 3: EKSEKUSI PERBAIKAN DI AUTH.USERS ===
        
        -- Cek apakah user sudah ada di Auth?
        IF EXISTS (SELECT 1 FROM auth.users WHERE id = r.id) THEN
            -- UPDATE CREDENTIALS
            UPDATE auth.users 
            SET 
                email = final_email,
                encrypted_password = crypt(final_pass, gen_salt('bf')),
                email_confirmed_at = now(),
                raw_user_meta_data = jsonb_build_object(
                    'full_name', r.full_name,
                    'nisn', r.nisn,
                    'class', r.class,
                    'role', COALESCE(r.role, 'student'),
                    'password_text', final_pass
                )
            WHERE id = r.id;
        ELSE
            -- RE-CREATE CREDENTIALS (Jika hilang)
            INSERT INTO auth.users (
                id, instance_id, email, encrypted_password, email_confirmed_at, 
                raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at
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
                    'role', COALESCE(r.role, 'student'),
                    'password_text', final_pass
                ),
                'authenticated', 'authenticated', now(), now()
            );
        END IF;

        -- === LOGIKA 4: SINKRONISASI KEMBALI KE PUBLIC (DATA TAMPILAN) ===
        -- Agar Guru bisa login pakai email, dan Siswa pakai NISN (di frontend)
        UPDATE public.users 
        SET 
            username = CASE WHEN r.role = 'teacher' THEN final_email ELSE r.nisn END, -- Guru=Email, Siswa=NISN
            password_text = final_pass,
            qr_login_password = final_pass
        WHERE id = r.id;

        -- Counter
        IF r.role = 'teacher' THEN
            count_teacher := count_teacher + 1;
        ELSE
            count_student := count_student + 1;
        END IF;

    END LOOP;

    RAISE NOTICE 'Perbaikan Selesai. Guru: %, Siswa: %', count_teacher, count_student;
END $$;

COMMIT;

-- Konfirmasi Hasil
SELECT role, count(*) as jumlah_akun_aktif FROM public.users GROUP BY role;
