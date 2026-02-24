
-- =================================================================
-- MIGRATION: UPGRADE STANDAR TKA & ASESMEN NASIONAL 2026
-- Jalankan script ini di SQL Editor Supabase
-- =================================================================

BEGIN;

-- 1. Update Tabel QUESTIONS
-- Menambahkan kolom untuk mendukung tipe soal baru dan metadata pendidikan
ALTER TABLE public.questions
ADD COLUMN IF NOT EXISTS type text DEFAULT 'SINGLE' CHECK (type IN ('SINGLE', 'MULTIPLE', 'MATCHING', 'ESSAY')),
ADD COLUMN IF NOT EXISTS cognitive_level text DEFAULT 'L1' CHECK (cognitive_level IN ('L1', 'L2', 'L3')),
ADD COLUMN IF NOT EXISTS weight numeric DEFAULT 1,
ADD COLUMN IF NOT EXISTS answer_key jsonb; -- Menyimpan kunci jawaban kompleks

-- Migrasi data lama: Pindahkan correct_answer_index ke format answer_key JSONB
-- Contoh: index 2 menjadi [2] untuk konsistensi
UPDATE public.questions
SET answer_key = to_jsonb(correct_answer_index)
WHERE answer_key IS NULL;

-- 2. Update Tabel STUDENT_ANSWERS
-- Menambahkan kolom untuk menyimpan jawaban siswa yang kompleks
ALTER TABLE public.student_answers
ADD COLUMN IF NOT EXISTS answer_value jsonb; -- Bisa berupa array index, object matching, atau string essay

-- 3. Update Policy RLS (Jika perlu, untuk kolom baru)
-- Karena kita menggunakan "FOR ALL" untuk admin di modul sebelumnya, 
-- biasanya tidak perlu update policy, tapi kita pastikan akses publik tetap aman.

COMMENT ON COLUMN public.questions.type IS 'Tipe soal: SINGLE (PG Biasa), MULTIPLE (PG Kompleks), MATCHING (Menjodohkan), ESSAY (Isian)';
COMMENT ON COLUMN public.questions.answer_key IS 'Menyimpan kunci jawaban dalam format JSON. Array int untuk PG/Multi, Object untuk Matching, String untuk Essay.';

COMMIT;

-- Konfirmasi
SELECT 'Database upgraded to TKA 2026 Standards' as status;
