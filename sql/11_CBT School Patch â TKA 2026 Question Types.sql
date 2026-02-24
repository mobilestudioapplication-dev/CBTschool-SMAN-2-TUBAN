
-- =================================================================
-- CBT SCHOOL PATCH V3: TKA 2026 QUESTION TYPES SUPPORT
-- =================================================================

BEGIN;

-- 1. Tambahkan Enum Tipe Soal (Opsional, menggunakan TEXT agar lebih fleksibel di frontend)
-- 2. Perbarui tabel questions
ALTER TABLE public.questions 
ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'multiple_choice',
ADD COLUMN IF NOT EXISTS weight INT DEFAULT 1,
ADD COLUMN IF NOT EXISTS answer_key JSONB,
ADD COLUMN IF NOT EXISTS metadata JSONB; -- Untuk menyimpan item menjodohkan (left/right lists)

-- 3. Migrasi Data Lama (PG Biasa)
UPDATE public.questions 
SET 
  answer_key = jsonb_build_object('index', correct_answer_index),
  type = 'multiple_choice'
WHERE answer_key IS NULL;

-- 4. Perbarui tabel jawaban siswa untuk mendukung format JSON
-- Menggunakan JSONB pada selected_answer_index (bisa angka tunggal, array, atau objek pasangan)
ALTER TABLE public.student_answers 
RENAME COLUMN selected_answer_index TO legacy_index;

ALTER TABLE public.student_answers
ADD COLUMN IF NOT EXISTS student_answer JSONB;

-- 5. Berikan izin baru
GRANT ALL ON public.questions TO authenticated, service_role;
GRANT ALL ON public.student_answers TO anon, authenticated, service_role;

COMMIT;
