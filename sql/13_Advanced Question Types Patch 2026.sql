
-- =================================================================
-- CBT SCHOOL ENTERPRISE PATCH 2026: ADVANCED QUESTION TYPES
-- FOCUS: questions & student_answers structure
-- =================================================================

BEGIN;

-- 1. TRANSFORMASI TABEL QUESTIONS
-- Menambahkan kolom pendukung jika belum ada
ALTER TABLE public.questions 
ADD COLUMN IF NOT EXISTS weight INT DEFAULT 1,
ADD COLUMN IF NOT EXISTS answer_key JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- 2. NORMALISASI DATA LAMA (Mencegah Error "multiple_choice" masif)
-- Jika ada data lama yang 'type'-nya null atau salah, set ke multiple_choice
UPDATE public.questions 
SET type = 'multiple_choice' 
WHERE type IS NULL OR type = '';

-- Migrasi Kunci Jawaban Lama (Integer) ke format JSONB baru untuk kompatibilitas
UPDATE public.questions 
SET answer_key = jsonb_build_object('index', correct_answer_index)
WHERE (answer_key = '{}'::jsonb OR answer_key IS NULL) 
AND type = 'multiple_choice';

-- 3. UPGRADE TABEL JAWABAN SISWA (CRITICAL)
-- Tabel ini harus mendukung penyimpanan data non-integer (JSONB)
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='student_answers' AND column_name='student_answer') THEN
        ALTER TABLE public.student_answers ADD COLUMN student_answer JSONB DEFAULT '{}'::jsonb;
    END IF;
END $$;

-- 4. OPTIMASI RLS (Row Level Security)
-- Memastikan siswa bisa membaca metadata (penting untuk Menjodohkan)
DROP POLICY IF EXISTS "Public Read Questions" ON public.questions;
CREATE POLICY "Public Read Questions" ON public.questions 
FOR SELECT USING (true);

DROP POLICY IF EXISTS "Students can insert/update answers" ON public.student_answers;
CREATE POLICY "Students can insert/update answers" ON public.student_answers 
FOR ALL USING (true) 
WITH CHECK (true);

-- 5. FUNCTION UNTUK ADMIN: Memperbaiki Tipe Soal Secara Massal (Helper)
-- Contoh cara pakai: SELECT public.set_question_type(123, 'matching');
CREATE OR REPLACE FUNCTION public.set_question_type(q_id BIGINT, q_type TEXT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.questions SET type = q_type WHERE id = q_id;
END;
$$;

COMMIT;

-- LOG: Database schema upgraded to support TKA 2026 Standards.
