
-- =================================================================
-- MODUL: UPDATE KONFIGURASI KOP SURAT (HEADER GLOBAL)
-- Menambahkan kolom untuk Header 1 dan Header 2 KOP Surat
-- =================================================================

BEGIN;

-- 1. Tambahkan kolom header KOP ke tabel app_config
ALTER TABLE public.app_config
ADD COLUMN IF NOT EXISTS kop_header1 TEXT DEFAULT 'PEMERINTAH PROVINSI JAWA TIMUR',
ADD COLUMN IF NOT EXISTS kop_header2 TEXT DEFAULT 'DINAS PENDIDIKAN';

-- 2. Berikan komentar
COMMENT ON COLUMN public.app_config.kop_header1 IS 'Baris pertama KOP Surat (misal: PEMERINTAH KABUPATEN...)';
COMMENT ON COLUMN public.app_config.kop_header2 IS 'Baris kedua KOP Surat (misal: DINAS PENDIDIKAN DAN KEBUDAYAAN)';

COMMIT;

-- 3. Refresh cache
NOTIFY pgrst, 'reload config';

SELECT 'Tabel app_config berhasil diperbarui dengan kolom Header KOP.' as status;
