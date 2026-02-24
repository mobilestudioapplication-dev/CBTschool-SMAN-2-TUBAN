
-- =================================================================
-- FIX_CONFIG_PERSISTENCE.sql
-- TUJUAN: Memastikan tabel app_config memiliki semua kolom KOP Surat
--         agar data dari menu Konfigurasi bisa tersimpan permanen.
-- =================================================================

BEGIN;

-- 1. Tambahkan kolom jika belum ada (Safe Migration)
ALTER TABLE public.app_config 
ADD COLUMN IF NOT EXISTS school_address TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS school_district TEXT DEFAULT 'KABUPATEN',
ADD COLUMN IF NOT EXISTS school_code TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS region_code TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS school_phone TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS school_email TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS school_website TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS kop_header1 TEXT DEFAULT 'PEMERINTAH PROVINSI',
ADD COLUMN IF NOT EXISTS kop_header2 TEXT DEFAULT 'DINAS PENDIDIKAN',
ADD COLUMN IF NOT EXISTS default_paper_size TEXT DEFAULT 'A4';

-- 2. Pastikan Row ID=1 Ada (Untuk update)
INSERT INTO public.app_config (id, school_name)
VALUES (1, 'SEKOLAH MENENGAH KEJURUAN')
ON CONFLICT (id) DO NOTHING;

-- 3. Berikan Izin Akses (RLS) agar Admin bisa UPDATE
-- Pastikan Admin bisa mengubah konfigurasi
DROP POLICY IF EXISTS "Admin can update config" ON public.app_config;
CREATE POLICY "Admin can update config" ON public.app_config 
FOR UPDATE 
USING (auth.email() = 'admin@cbtschool.com'); -- Atau sesuaikan dengan fungsi is_admin()

-- 4. Refresh Cache Schema Supabase
NOTIFY pgrst, 'reload config';

COMMIT;

-- Verifikasi Struktur Tabel
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'app_config';
