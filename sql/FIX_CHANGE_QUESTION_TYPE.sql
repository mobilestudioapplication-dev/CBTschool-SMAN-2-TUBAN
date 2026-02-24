
-- =================================================================
-- FIX_CHANGE_QUESTION_TYPE.sql
-- TUJUAN: MEMASTIKAN & MEMPERBAIKI TIPE SOAL (SEMUA TIPE)
-- Jalankan di SQL Editor Supabase
-- =================================================================

BEGIN;

-- 1. Pastikan kolom pendukung ada
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS type text DEFAULT 'SINGLE';
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS matching_right_options text[];
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS answer_key jsonb;

-- 2. Pastikan Constraint Valid
ALTER TABLE public.questions DROP CONSTRAINT IF EXISTS questions_type_check;
ALTER TABLE public.questions ADD CONSTRAINT questions_type_check 
  CHECK (type IN ('SINGLE', 'MULTIPLE', 'MATCHING', 'ESSAY'));

-- 3. AUTO-FIX: Perbaiki soal MENJODOHKAN
-- Logika: Jika punya opsi kanan (matching_right_options), pasti Menjodohkan.
UPDATE public.questions
SET type = 'MATCHING'
WHERE (type = 'SINGLE' OR type IS NULL)
  AND matching_right_options IS NOT NULL 
  AND cardinality(matching_right_options) > 0;

-- 4. AUTO-FIX: Perbaiki soal PG KOMPLEKS (MULTIPLE)
-- Logika: Jika answer_key berupa Array JSON (misal: [0, 2]), pasti PG Kompleks.
UPDATE public.questions
SET type = 'MULTIPLE'
WHERE (type = 'SINGLE' OR type IS NULL)
  AND jsonb_typeof(answer_key) = 'array';

-- 5. AUTO-FIX: Perbaiki soal ESSAY
-- Logika: Jika answer_key berupa String panjang (bukan angka/huruf tunggal 'A'), kemungkinan besar Essay.
UPDATE public.questions
SET type = 'ESSAY'
WHERE (type = 'SINGLE' OR type IS NULL)
  AND jsonb_typeof(answer_key) = 'string'
  -- Filter tambahan: Pastikan bukan string angka "1" atau huruf "A" (legacy single choice)
  AND length(answer_key::text) > 3;

-- 6. AUTO-FIX: Set default SINGLE untuk sisanya
UPDATE public.questions
SET type = 'SINGLE'
WHERE type IS NULL;

COMMIT;

-- Tampilkan Laporan Hasil Perbaikan
SELECT type, count(*) as jumlah_soal 
FROM public.questions 
GROUP BY type;
