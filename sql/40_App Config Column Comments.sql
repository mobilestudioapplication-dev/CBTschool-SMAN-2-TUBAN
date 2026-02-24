
-- =================================================================
-- SQL_CONFIG_DOCUMENTATION.sql
-- TUJUAN: Mendokumentasikan kolom konfigurasi aset untuk kejelasan.
-- =================================================================

-- 1. Berikan komentar pada kolom signature_url
COMMENT ON COLUMN public.app_config.signature_url IS 'URL gambar tanda tangan kepala sekolah. Format wajib: PNG Transparan. Max 500KB.';

-- 2. Berikan komentar pada kolom stamp_url
COMMENT ON COLUMN public.app_config.stamp_url IS 'URL gambar stempel sekolah. Format wajib: PNG Transparan. Max 500KB.';

-- Konfirmasi
SELECT 'Dokumentasi kolom aset konfigurasi berhasil diperbarui.' as status;
