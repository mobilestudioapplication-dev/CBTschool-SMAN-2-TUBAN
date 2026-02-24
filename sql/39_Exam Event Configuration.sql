
-- =================================================================
-- MODUL: FITUR JENIS KEGIATAN UJIAN & TAHUN AJARAN GLOBAL
-- Jalankan script ini di SQL Editor Supabase
-- =================================================================

BEGIN;

-- 1. Tambahkan kolom untuk Nama Kegiatan Global
ALTER TABLE public.app_config
ADD COLUMN IF NOT EXISTS current_exam_event TEXT DEFAULT 'UJIAN SEKOLAH BERBASIS KOMPUTER';

COMMENT ON COLUMN public.app_config.current_exam_event IS 'Nama kegiatan ujian yang sedang berlangsung (untuk header cetak)';

-- 2. Tambahkan kolom Tahun Ajaran Global
ALTER TABLE public.app_config
ADD COLUMN IF NOT EXISTS academic_year TEXT DEFAULT '2023/2024';

COMMENT ON COLUMN public.app_config.academic_year IS 'Tahun ajaran yang aktif (misal: 2023/2024)';

-- 3. Tambahkan kolom kategori/tipe pada tabel ujian (Tests)
ALTER TABLE public.tests
ADD COLUMN IF NOT EXISTS exam_type TEXT DEFAULT 'Umum';

COMMENT ON COLUMN public.tests.exam_type IS 'Kategori ujian (misal: PTS, PAS, US, Placement Test)';

COMMIT;

-- 4. Refresh schema cache
NOTIFY pgrst, 'reload config';

-- Konfirmasi
SELECT 'Fitur Kegiatan Ujian & Tahun Ajaran berhasil ditambahkan.' as status;
