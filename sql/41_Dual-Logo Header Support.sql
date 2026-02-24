
-- =================================================================
-- MODUL: DUKUNGAN DUAL LOGO (STANDAR KOP SURAT RESMI)
-- Menambahkan kolom untuk Logo Pemerintah (Kiri)
-- =================================================================

BEGIN;

-- 1. Tambahkan kolom left_logo_url ke tabel app_config
ALTER TABLE public.app_config 
ADD COLUMN IF NOT EXISTS left_logo_url TEXT;

-- 2. Berikan komentar
COMMENT ON COLUMN public.app_config.left_logo_url IS 'URL Logo Pemerintah/Kabupaten (Posisi Kiri di KOP)';
COMMENT ON COLUMN public.app_config.logo_url IS 'URL Logo Sekolah (Posisi Kanan di KOP)';

COMMIT;

-- 3. Refresh cache
NOTIFY pgrst, 'reload config';

-- Konfirmasi
SELECT 'Kolom left_logo_url berhasil ditambahkan.' as status;
