
-- =================================================================
-- FIX_CRITICAL_EMPTY_AUTH.sql
-- JALANKAN INI JIKA TABEL 'AUTHENTICATION -> USERS' KOSONG
-- =================================================================

BEGIN;

-- 1. Pastikan Ekstensi Enkripsi Aktif
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. === BAGIAN A: BUAT AKUN ADMIN (WAJIB) ===
DO $$
DECLARE
  v_admin_email text := 'admin@cbtschool.com';
  v_admin_pass text := 'admin123'; -- Password Default Admin
  v_admin_id uuid;
BEGIN
  -- Cek apakah admin sudah ada (untuk menghindari duplikat error jika dijalankan 2x)
  SELECT id INTO v_admin_id FROM auth.users WHERE email = v_admin_email;

  IF v_admin_id IS NULL THEN
    -- Admin belum ada, BUAT BARU
    v_admin_id := uuid_generate_v4();
    
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at, 
      raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at
    ) VALUES (
      v_admin_id,
      '00000000-0000-0000-0000-000000000000',
      v_admin_email,
      crypt(v_admin_pass, gen_salt('bf')),
      now(), -- Langsung dikonfirmasi
      '{"provider": "email", "providers": ["email"]}'::jsonb,
      '{"full_name": "Administrator", "role": "admin", "is_admin": true}'::jsonb,
      'authenticated', 'authenticated', now(), now()
    );

    -- Pastikan data admin juga ada di public.users
    INSERT INTO public.users (id, username, full_name, role, gender, religion)
    VALUES (v_admin_id, v_admin_email, 'Administrator', 'admin', 'Laki-laki', 'Islam')
    ON CONFLICT (username) DO NOTHING;
    
    RAISE NOTICE 'Akun Admin berhasil dibuat. Email: %, Password: %', v_admin_email, v_admin_pass;
  ELSE
    -- Admin sudah ada, reset password saja untuk memastikan
    UPDATE auth.users 
    SET encrypted_password = crypt(v_admin_pass, gen_salt('bf')),
        email_confirmed_at = now()
    WHERE id = v_admin_id;
    
    RAISE NOTICE 'Akun Admin sudah ada. Password direset ke: %', v_admin_pass;
  END IF;
END $$;

-- 3. === BAGIAN B: PULIHKAN AKUN SISWA & GURU DARI PUBLIC.USERS ===
-- Loop semua data di tabel public.users dan buatkan akun loginnya
DO $$
DECLARE
    r RECORD;
    v_email text;
    v_pass text;
    v_domain text;
    count_restored INT := 0;
BEGIN
    -- Ambil domain sekolah
    SELECT COALESCE(NULLIF(school_domain, ''), 'smpn2demak.sch.id') INTO v_domain FROM public.app_config LIMIT 1;

    FOR r IN SELECT * FROM public.users WHERE username <> 'admin@cbtschool.com' LOOP
        
        -- Tentukan Email Login
        IF r.role = 'teacher' OR position('@' in r.username) > 0 THEN
             v_email := r.username; -- Guru pakai email asli
             -- Fix jika guru input username biasa
             IF position('@' in v_email) = 0 THEN v_email := v_email || '@teacher.' || v_domain; END IF;
        ELSE
             -- Siswa pakai NISN@domain
             v_email := COALESCE(NULLIF(r.nisn, ''), r.username) || '@' || v_domain;
        END IF;

        -- Tentukan Password (Prioritas: Password Text -> NISN)
        v_pass := COALESCE(NULLIF(r.password_text, ''), NULLIF(r.nisn, ''), '123456');

        -- Cek & Insert ke Auth
        IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = r.id) THEN
            INSERT INTO auth.users (
                id, instance_id, email, encrypted_password, email_confirmed_at, 
                raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at
            ) VALUES (
                r.id, -- PENTING: ID harus sama
                '00000000-0000-0000-0000-000000000000',
                v_email,
                crypt(v_pass, gen_salt('bf')),
                now(),
                '{"provider": "email", "providers": ["email"]}'::jsonb,
                jsonb_build_object(
                    'full_name', r.full_name,
                    'nisn', r.nisn,
                    'class', r.class,
                    'role', r.role,
                    'password_text', v_pass
                ),
                'authenticated', 'authenticated', now(), now()
            );
            count_restored := count_restored + 1;
        END IF;
    END LOOP;
    
    RAISE NOTICE 'Berhasil memulihkan % akun siswa/guru ke tabel Auth.', count_restored;
END $$;

COMMIT;
