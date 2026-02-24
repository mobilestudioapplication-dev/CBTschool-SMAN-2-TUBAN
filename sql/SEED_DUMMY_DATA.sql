
-- =================================================================
-- SEED_DUMMY_DATA.sql (REVISI ANTI-DUPLIKAT)
-- JALANKAN INI UNTUK MENGISI DATA CONTOH
-- =================================================================

BEGIN;

-- 1. Pastikan Ekstensi Enkripsi Aktif
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Pastikan Konfigurasi Domain Sekolah Benar
UPDATE public.app_config 
SET school_domain = 'smpn2demak.sch.id' 
WHERE id = 1;

-- 3. Fungsi Sementara untuk Membuat User (Aman dari Duplikat)
CREATE OR REPLACE FUNCTION public.force_create_user(
    p_nisn text, 
    p_name text, 
    p_class text, 
    p_role text, 
    p_pass text
) RETURNS void AS $$
DECLARE
    v_uuid uuid;
    v_email text;
    v_domain text := 'smpn2demak.sch.id';
BEGIN
    -- Tentukan Email berdasarkan Role
    IF p_role = 'teacher' THEN
        v_email := p_nisn || '@teacher.' || v_domain; -- guru01@teacher.smpn2demak.sch.id
    ELSE
        v_email := p_nisn || '@' || v_domain; -- 1001@smpn2demak.sch.id
    END IF;

    -- Cek apakah user sudah ada di auth.users ATAU public.users
    -- Kita prioritaskan cek NISN atau Email
    SELECT id INTO v_uuid FROM public.users WHERE nisn = p_nisn OR username = v_email LIMIT 1;
    
    IF v_uuid IS NULL THEN
        -- Jika belum ada di public, cek di auth (mungkin orphan)
        SELECT id INTO v_uuid FROM auth.users WHERE email = v_email LIMIT 1;
    END IF;

    IF v_uuid IS NULL THEN
        -- User benar-benar baru, generate UUID
        v_uuid := uuid_generate_v4();

        -- A. Insert ke AUTH.USERS (Login System)
        -- Ini mungkin memicu trigger handle_new_user yang mengisi public.users
        INSERT INTO auth.users (
            id, email, encrypted_password, email_confirmed_at, role, raw_user_meta_data, aud
        ) VALUES (
            v_uuid, 
            v_email, 
            crypt(p_pass, gen_salt('bf')), 
            now(), 
            'authenticated',
            jsonb_build_object(
                'full_name', p_name, 
                'nisn', p_nisn, 
                'class', p_class, 
                'role', p_role, 
                'password_text', p_pass
            ),
            'authenticated'
        );
    ELSE
        -- User sudah ada, update password di Auth
        UPDATE auth.users 
        SET encrypted_password = crypt(p_pass, gen_salt('bf')),
            raw_user_meta_data = jsonb_build_object(
                'full_name', p_name, 
                'nisn', p_nisn, 
                'class', p_class, 
                'role', p_role, 
                'password_text', p_pass
            )
        WHERE id = v_uuid;
    END IF;

    -- B. Insert/Update ke PUBLIC.USERS (Data Profil)
    -- Gunakan ON CONFLICT agar tidak error jika trigger sudah membuatnya duluan
    INSERT INTO public.users (
        id, username, full_name, nisn, class, role, password_text, qr_login_password, gender, religion, major
    ) VALUES (
        v_uuid, 
        v_email, -- Username di database pakai email lengkap agar unik
        p_name, 
        p_nisn, 
        p_class, 
        p_role, 
        p_pass, 
        p_pass,
        'Laki-laki', 
        'Islam',
        CASE WHEN p_role = 'teacher' THEN 'Guru Mapel' ELSE 'Umum' END
    )
    ON CONFLICT (id) DO UPDATE SET
        username = EXCLUDED.username,
        full_name = EXCLUDED.full_name,
        nisn = EXCLUDED.nisn,
        class = EXCLUDED.class,
        role = EXCLUDED.role,
        password_text = EXCLUDED.password_text,
        qr_login_password = EXCLUDED.qr_login_password,
        major = EXCLUDED.major;
        
    RAISE NOTICE 'User diproses: % (%)', p_name, v_email;
END;
$$ LANGUAGE plpgsql;

-- 4. EKSEKUSI PEMBUATAN DATA DUMMY
-- Format: (NISN/Username, Nama, Kelas, Role, Password)

-- Siswa 1
SELECT public.force_create_user('1001', 'Siswa Percobaan 1', 'VII-A', 'student', '1001');

-- Siswa 2
SELECT public.force_create_user('1002', 'Siswa Percobaan 2', 'VII-B', 'student', '1002');

-- Guru 1
SELECT public.force_create_user('guru01', 'Budi Santoso S.Pd', 'STAFF', 'teacher', '123456');

-- 5. Bersihkan Fungsi Sementara
DROP FUNCTION public.force_create_user(text, text, text, text, text);

COMMIT;
