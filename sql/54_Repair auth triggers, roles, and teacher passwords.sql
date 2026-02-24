BEGIN;

-- 1. BERSIHKAN TRIGGER PENYEBAB "DATABASE ERROR QUERYING SCHEMA"
-- Trigger ini biasanya sisa tutorial lama yang mencoba sync user tapi codingnya salah.
-- Kita hapus dulu agar LOGIN BERHASIL. Nanti bisa dibuat ulang jika perlu.

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;
DROP TRIGGER IF EXISTS on_user_signup ON auth.users;

-- Hapus fungsinya juga jika ada (karena fungsi ini yang biasanya error)
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.handle_user_update() CASCADE;

-- 2. PERBAIKI HAK AKSES "SUPABASE_AUTH_ADMIN"
-- User sistem 'supabase_auth_admin' adalah aktor yang bekerja saat proses login.
-- Dia WAJIB bisa baca schema public. Jika tidak, login akan crash.

GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT USAGE ON SCHEMA extensions TO supabase_auth_admin;

-- Beri akses penuh ke tabel & fungsi public agar tidak ada error "Permission denied"
GRANT ALL ON ALL TABLES IN SCHEMA public TO supabase_auth_admin;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO supabase_auth_admin;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO supabase_auth_admin;

-- 3. PERBAIKI ROLE POSTGRES & SERVICE_ROLE (Agar Dashboard Admin aman)
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO postgres, service_role;

-- 4. FORCE RE-HASH PASSWORD GURU (Sekali lagi untuk memastikan)
-- Kita pastikan user Guru memiliki password yang valid dan status confirmed.
UPDATE auth.users
SET 
    encrypted_password = extensions.crypt('123456', extensions.gen_salt('bf')),
    email_confirmed_at = now(),
    raw_app_meta_data = '{"provider": "email", "providers": ["email"]}'::jsonb,
    updated_at = now()
WHERE id IN (SELECT id FROM public.users WHERE role = 'teacher');

-- 5. REFRESH SCHEMA CACHE
-- Memberitahu API Supabase untuk membaca ulang permission di atas.
NOTIFY pgrst, 'reload config';

COMMIT;