
-- =================================================================
-- SQL FULL FIX: SUPPORT TKA 2026 (REVISI DATA CLEANING)
-- Menyelaraskan database dengan format Frontend (huruf kecil)
-- =================================================================

BEGIN;

-- 1. Pastikan ekstensi aktif
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Tambahkan kolom jika belum ada
ALTER TABLE public.questions
ADD COLUMN IF NOT EXISTS type text DEFAULT 'multiple_choice',
ADD COLUMN IF NOT EXISTS matching_right_options text[],
ADD COLUMN IF NOT EXISTS answer_key jsonb,
ADD COLUMN IF NOT EXISTS audio_url text,
ADD COLUMN IF NOT EXISTS video_url text,
ADD COLUMN IF NOT EXISTS cognitive_level text DEFAULT 'L1',
ADD COLUMN IF NOT EXISTS weight numeric DEFAULT 1;

-- 3. PERBAIKAN DATA (DATA CLEANING) - PENTING!
-- Ubah semua format lama/kapital menjadi format internal sistem (lowercase snake_case)
-- agar sesuai dengan types.ts di frontend
UPDATE public.questions SET type = 'multiple_choice' WHERE type IN ('SINGLE', 'Single', 'single', 'PG');
UPDATE public.questions SET type = 'complex_multiple_choice' WHERE type IN ('MULTIPLE', 'Multiple', 'multiple', 'COMPLEX');
UPDATE public.questions SET type = 'matching' WHERE type IN ('MATCHING', 'Matching', 'JODOHKAN');
UPDATE public.questions SET type = 'essay' WHERE type IN ('ESSAY', 'Essay', 'URAIAN');

-- Set default jika ada yang null atau ngawur
UPDATE public.questions SET type = 'multiple_choice' 
WHERE type IS NULL OR type NOT IN ('multiple_choice', 'complex_multiple_choice', 'matching', 'essay');

-- 4. Terapkan Constraint Baru (Sekarang aman karena data sudah bersih)
ALTER TABLE public.questions DROP CONSTRAINT IF EXISTS questions_type_check;
ALTER TABLE public.questions ADD CONSTRAINT questions_type_check 
  CHECK (type IN ('multiple_choice', 'complex_multiple_choice', 'matching', 'essay'));

-- 5. Komentar kolom
COMMENT ON COLUMN public.questions.type IS 'Tipe soal: multiple_choice, complex_multiple_choice, matching, essay';

-- 6. Update tabel student_answers
ALTER TABLE public.student_answers
ADD COLUMN IF NOT EXISTS answer_value jsonb;

COMMIT;

-- 7. Refresh schema cache
NOTIFY pgrst, 'reload config';

-- Konfirmasi
SELECT type, count(*) as jumlah FROM public.questions GROUP BY type;
