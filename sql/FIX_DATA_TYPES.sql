
-- =================================================================
-- FIX_DATA_TYPES.sql
-- 1. MEMAKSA SUPABASE MEMUAT ULANG SCHEMA (CACHE RELOAD)
-- 2. OTOMATISASI PERBAIKAN DATA TIPE SOAL BERDASARKAN KONTEN
-- Jalankan di SQL Editor Supabase
-- =================================================================

BEGIN;

-- 1. Refresh Schema Cache Supabase (PENTING AGAR KOLOM BARU TERBACA DI API)
NOTIFY pgrst, 'reload config';

-- 2. Pastikan kolom type memiliki default 'SINGLE' untuk baris yang NULL
UPDATE public.questions
SET type = 'SINGLE'
WHERE type IS NULL;

-- 3. AUTO-DETECT: Soal MENJODOHKAN
-- Jika kolom matching_right_options terisi, ubah tipe menjadi MATCHING
UPDATE public.questions
SET type = 'MATCHING'
WHERE matching_right_options IS NOT NULL 
  AND cardinality(matching_right_options) > 0
  AND (type = 'SINGLE' OR type IS NULL);

-- 4. AUTO-DETECT: Soal PG KOMPLEKS
-- Jika answer_key adalah Array JSON dan isinya lebih dari 1, ubah tipe menjadi MULTIPLE
UPDATE public.questions
SET type = 'MULTIPLE'
WHERE jsonb_typeof(answer_key) = 'array' 
  AND jsonb_array_length(answer_key) > 1
  AND (type = 'SINGLE' OR type IS NULL);

-- 5. AUTO-DETECT: Soal ESSAY
-- Jika answer_key adalah string panjang (bukan angka/huruf tunggal), kemungkinan ESSAY
UPDATE public.questions
SET type = 'ESSAY'
WHERE jsonb_typeof(answer_key) = 'string'
  AND length(answer_key::text) > 3 
  AND type = 'SINGLE';

COMMIT;

-- Tampilkan hasil perbaikan
SELECT type, count(*) as total_soal 
FROM public.questions 
GROUP BY type;
