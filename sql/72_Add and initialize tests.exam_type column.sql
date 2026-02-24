
-- =================================================================
-- FIX_EXAM_TYPE_COLUMN.sql
-- TUJUAN: Memastikan kolom exam_type ada di database untuk menyimpan kategori ujian.
-- =================================================================

BEGIN;

-- 1. Tambahkan kolom exam_type jika belum ada
ALTER TABLE public.tests 
ADD COLUMN IF NOT EXISTS exam_type TEXT DEFAULT 'Umum';

-- 2. Berikan komentar untuk dokumentasi
COMMENT ON COLUMN public.tests.exam_type IS 'Kategori ujian (misal: PTS, PAS, US, Placement Test)';

-- 3. Update data lama yang mungkin NULL menjadi 'Umum'
UPDATE public.tests 
SET exam_type = 'Umum' 
WHERE exam_type IS NULL OR exam_type = '';

COMMIT;

-- 4. Refresh Cache Schema Supabase (PENTING AGAR API TERBARU)
NOTIFY pgrst, 'reload config';

-- Konfirmasi
SELECT token, subject, exam_type FROM public.tests LIMIT 5;
