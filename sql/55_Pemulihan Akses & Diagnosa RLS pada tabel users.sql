BEGIN;

-- 1. DIAGNOSA: MATIKAN SEMENTARA RLS DI TABEL USER
-- Ini adalah cara tercepat untuk membuktikan apakah Policy yang bikin crash.
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;

-- 2. BERIKAN AKSES EKSPLISIT (SAFEGUARD)
-- Memastikan role 'authenticated' (user yang login) boleh SELECT tabel users
GRANT SELECT, INSERT, UPDATE ON TABLE public.users TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.users TO service_role;

-- 3. PERBAIKI SEQUENCE (OPSIONAL TAPI PENTING)
-- Kadang error schema muncul karena ID auto-increment tidak sinkron
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- 4. PAKSA REFRESH SCHEMA CACHE
NOTIFY pgrst, 'reload config';

COMMIT;