-- =================================================================
-- FIX_SYSTEM_SCHEMA_ERROR.sql
-- TUJUAN: Memperbaiki "Database error querying schema" saat Login
-- METODE: Reset Search Path & Grant Permissions
-- =================================================================

BEGIN;

-- 1. PAKSA SEMUA ROLE MELIHAT SCHEMA YANG BENAR
-- Seringkali login gagal karena role 'postgres' atau 'service_role' 
-- tidak bisa melihat schema 'extensions' atau 'auth' secara default.

ALTER ROLE postgres SET search_path = public, extensions, auth;
ALTER ROLE service_role SET search_path = public, extensions, auth;
ALTER ROLE authenticated SET search_path = public, extensions, auth;
ALTER ROLE anon SET search_path = public, extensions, auth;

-- Khusus role internal Supabase Auth (penting!)
ALTER ROLE supabase_admin SET search_path = public, extensions, auth;
ALTER ROLE supabase_auth_admin SET search_path = public, extensions, auth;

-- 2. PASTIKAN PERMISSIONS DIBUKA
-- Memberi izin role Auth untuk membaca schema public (jika ada trigger profile)
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role, supabase_auth_admin;
GRANT USAGE ON SCHEMA extensions TO postgres, anon, authenticated, service_role, supabase_auth_admin;

-- Beri akses fungsi-fungsi dasar ke semua user (agar tidak error saat generate token)
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA extensions TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA extensions TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA extensions TO anon;

-- 3. VALIDASI ULANG LOKASI EKSTENSI
-- Pastikan pgcrypto ada di schema 'extensions', bukan 'public' (penyebab bentrok)
CREATE EXTENSION IF NOT EXISTS "pgcrypto" SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" SCHEMA extensions;

-- 4. REFRESH SCHEMA CACHE SUPABASE
-- Memberitahu PostgREST API untuk reload konfigurasi
NOTIFY pgrst, 'reload config';

COMMIT;