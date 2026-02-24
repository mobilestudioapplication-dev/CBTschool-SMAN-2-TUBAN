
-- =================================================================
-- SQL_FIX_PRINT_CONFIG_FINAL.sql
-- Menambahkan konfigurasi default ukuran kertas jika belum ada
-- =================================================================

BEGIN;

-- 1. Tambahkan kolom default_paper_size jika belum ada
ALTER TABLE public.app_config 
ADD COLUMN IF NOT EXISTS default_paper_size text DEFAULT 'A4';

-- 2. Pastikan ada constraint atau default value yang valid
UPDATE public.app_config 
SET default_paper_size = 'A4' 
WHERE default_paper_size IS NULL OR default_paper_size = '';

-- 3. Berikan komentar
COMMENT ON COLUMN public.app_config.default_paper_size IS 'Ukuran kertas default (A4/F4) untuk mencetak kartu ujian presisi.';

COMMIT;

SELECT 'Konfigurasi kertas berhasil diperbarui.' as status;
