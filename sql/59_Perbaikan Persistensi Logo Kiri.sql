
-- =================================================================
-- FIX_LEFT_LOGO_PERSISTENCE.sql
-- TUJUAN: Memperbaiki masalah logo kiri tidak tersimpan.
-- Masalah ini terjadi karena kolom 'left_logo_url' belum ada di database.
-- =================================================================

BEGIN;

-- 1. Tambahkan kolom left_logo_url jika belum ada
ALTER TABLE public.app_config 
ADD COLUMN IF NOT EXISTS left_logo_url TEXT;

-- 2. Berikan komentar
COMMENT ON COLUMN public.app_config.left_logo_url IS 'URL Logo Pemerintah/Kabupaten (Posisi Kiri)';

-- 3. Paksa Refresh Cache Schema Supabase
-- Agar API segera mengenali kolom baru ini
NOTIFY pgrst, 'reload config';

COMMIT;

-- Konfirmasi: Tampilkan data saat ini
SELECT school_name, logo_url, left_logo_url FROM public.app_config WHERE id = 1;
