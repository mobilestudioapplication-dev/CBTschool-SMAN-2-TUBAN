
-- =================================================================
-- FIX: PASTIKAN STRUKTUR TABEL QUESTIONS MENDUKUNG TKA 2026
-- Jalankan script ini di SQL Editor Supabase
-- =================================================================

BEGIN;

-- 1. Tambahkan kolom yang mungkin hilang untuk fitur Menjodohkan
ALTER TABLE public.questions
ADD COLUMN IF NOT EXISTS matching_right_options text[]; -- Menyimpan opsi kolom kanan

-- 2. Pastikan kolom TKA lainnya ada
ALTER TABLE public.questions
ADD COLUMN IF NOT EXISTS type text DEFAULT 'SINGLE' CHECK (type IN ('SINGLE', 'MULTIPLE', 'MATCHING', 'ESSAY')),
ADD COLUMN IF NOT EXISTS answer_key jsonb,
ADD COLUMN IF NOT EXISTS audio_url text,
ADD COLUMN IF NOT EXISTS video_url text,
ADD COLUMN IF NOT EXISTS cognitive_level text DEFAULT 'L1',
ADD COLUMN IF NOT EXISTS weight numeric DEFAULT 1;

-- 3. Beri komentar untuk kejelasan
COMMENT ON COLUMN public.questions.matching_right_options IS 'Array opsi sebelah kanan untuk soal tipe Menjodohkan (MATCHING)';
COMMENT ON COLUMN public.questions.type IS 'Tipe soal: SINGLE, MULTIPLE, MATCHING, ESSAY';

COMMIT;

-- Konfirmasi
SELECT 'Tabel Questions berhasil diperbarui dengan kolom matching_right_options.' as status;
