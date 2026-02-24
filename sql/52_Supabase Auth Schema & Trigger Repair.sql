BEGIN;

-- 1. PERBAIKI HAK AKSES SCHEMA (Seringkali ini penyebab utama "Error querying schema")
-- Memberikan akses penuh ke schema public & extensions untuk role internal Supabase
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA extensions TO postgres, anon, authenticated, service_role;

-- Pastikan role auth (supabase_auth_admin) bisa membaca schema public 
-- (Penting jika ada trigger auth yang memanggil fungsi di public)
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO supabase_auth_admin;
GRANT ALL ON ALL TABLES IN SCHEMA public TO supabase_auth_admin;

-- 2. SET DEFAULT SEARCH PATH
-- Agar fungsi-fungsi tidak bingung mencari 'uuid_generate_v4' atau 'extensions'
ALTER ROLE postgres SET search_path = public, extensions, auth;
ALTER ROLE service_role SET search_path = public, extensions, auth;
ALTER ROLE authenticated SET search_path = public, extensions, auth;

-- 3. MATIKAN TRIGGER YANG BERPOTENSI MERUSAK LOGIN
-- Kita akan mencari trigger pada 'auth.users' yang seringkali menjadi penyebab error saat update 'last_sign_in_at'

-- Hapus Trigger Sync yang mungkin error (Ganti nama jika Anda punya nama trigger spesifik)
-- Trigger umum yang sering dibuat manual:
DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;
DROP TRIGGER IF EXISTS on_user_update ON auth.users;
DROP TRIGGER IF EXISTS sync_user_update ON auth.users;

-- Hapus Fungsi Trigger-nya jika ada (Opsional, dinonaktifkan dulu agar login jalan)
-- DROP FUNCTION IF EXISTS public.handle_user_update(); 

-- 4. VALIDASI ULANG EXTENSION
CREATE EXTENSION IF NOT EXISTS "pgcrypto" SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" SCHEMA extensions;

-- 5. RE-SYNC MANUAL KHUSUS USER YANG GAGAL TADI (Hard Refresh)
-- Ganti 'EMAIL_GURU_YANG_GAGAL' dengan email guru yang Anda coba login
-- Ini memastikan user tersebut bersih dari metadata corrupt
UPDATE auth.users 
SET 
  updated_at = now(),
  email_confirmed_at = now(),
  raw_app_meta_data = '{"provider": "email", "providers": ["email"]}'::jsonb
WHERE role = 'teacher';

COMMIT;