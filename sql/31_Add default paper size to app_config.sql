
-- =================================================================
-- FITUR: OPSI UKURAN KERTAS CETAK KARTU
-- Jalankan script ini di SQL Editor Supabase
-- =================================================================

-- 1. Tambahkan kolom default_paper_size ke tabel app_config
ALTER TABLE public.app_config 
ADD COLUMN IF NOT EXISTS default_paper_size text DEFAULT 'A4';

COMMENT ON COLUMN public.app_config.default_paper_size IS 'Ukuran kertas default untuk cetak (A4, F4, Letter, Legal)';

-- Konfirmasi
SELECT 'Kolom default_paper_size berhasil ditambahkan.' as status;
