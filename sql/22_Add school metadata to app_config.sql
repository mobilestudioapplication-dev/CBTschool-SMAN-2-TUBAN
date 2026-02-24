
-- =================================================================
-- MODUL: PENDUKUNG FITUR CETAK DOKUMEN ADMINISTRASI
-- Menambahkan metadata sekolah untuk KOP Surat (Berita Acara)
-- =================================================================

BEGIN;

-- 1. Tambahkan kolom detail sekolah ke tabel app_config
ALTER TABLE public.app_config
ADD COLUMN IF NOT EXISTS school_address TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS school_district TEXT DEFAULT 'KABUPATEN',
ADD COLUMN IF NOT EXISTS school_code TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS region_code TEXT DEFAULT '';

-- 2. Berikan komentar untuk dokumentasi
COMMENT ON COLUMN public.app_config.school_address IS 'Alamat lengkap sekolah untuk KOP surat';
COMMENT ON COLUMN public.app_config.school_district IS 'Nama Kabupaten/Kota (misal: KAB. DEMAK)';
COMMENT ON COLUMN public.app_config.school_code IS 'Kode Sekolah/Madrasah (misal: 0114)';
COMMENT ON COLUMN public.app_config.region_code IS 'Kode Wilayah/Rayon (misal: 06)';

COMMIT;

-- 3. Refresh schema cache agar API Supabase mendeteksi kolom baru
NOTIFY pgrst, 'reload config';

-- Konfirmasi
SELECT 'Tabel konfigurasi berhasil diperbarui dengan kolom detail sekolah.' as status;
