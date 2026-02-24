
-- =================================================================
-- MODUL: UPDATE KELENGKAPAN KOP SURAT
-- Jalankan script ini di SQL Editor Supabase
-- =================================================================

BEGIN;

-- 1. Tambahkan kolom kontak ke tabel app_config
ALTER TABLE public.app_config
ADD COLUMN IF NOT EXISTS school_phone TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS school_email TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS school_website TEXT DEFAULT '';

-- 2. Berikan komentar
COMMENT ON COLUMN public.app_config.school_phone IS 'Nomor Telepon Sekolah untuk KOP';
COMMENT ON COLUMN public.app_config.school_email IS 'Email Sekolah untuk KOP';
COMMENT ON COLUMN public.app_config.school_website IS 'Website Sekolah untuk KOP';

COMMIT;

-- 3. Refresh cache
NOTIFY pgrst, 'reload config';

SELECT 'Tabel app_config berhasil diperbarui dengan data kontak.' as status;
