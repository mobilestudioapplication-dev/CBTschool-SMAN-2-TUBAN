
-- =================================================================
-- FIX_PRINT_CONFIG.sql
-- Memastikan kolom konfigurasi sekolah lengkap untuk fitur KOP Surat
-- =================================================================

-- 1. Tambahkan kolom jika belum ada
ALTER TABLE public.app_config 
ADD COLUMN IF NOT EXISTS school_address TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS school_district TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS school_phone TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS school_email TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS school_website TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS kop_header1 TEXT DEFAULT 'PEMERINTAH PROVINSI JAWA TENGAH',
ADD COLUMN IF NOT EXISTS kop_header2 TEXT DEFAULT 'DINAS PENDIDIKAN DAN KEBUDAYAAN';

-- 2. Pastikan ada data default minimal di row pertama
INSERT INTO public.app_config (id, school_name)
VALUES (1, 'SEKOLAH MENENGAH PERTAMA NEGERI')
ON CONFLICT (id) DO UPDATE SET 
    kop_header1 = COALESCE(NULLIF(public.app_config.kop_header1, ''), 'PEMERINTAH PROVINSI'),
    kop_header2 = COALESCE(NULLIF(public.app_config.kop_header2, ''), 'DINAS PENDIDIKAN');

-- Konfirmasi
SELECT school_name, kop_header1, kop_header2 FROM public.app_config WHERE id = 1;
