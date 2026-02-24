
-- =================================================================
-- FIX_TYPE_DETECTION.sql
-- OTOMATISASI PERBAIKAN TIPE SOAL BERDASARKAN STRUKTUR DATA
-- Jalankan di SQL Editor Supabase
-- =================================================================

BEGIN;

-- 1. Refresh Cache Schema Supabase (PENTING AGAR API TERBARU)
NOTIFY pgrst, 'reload config';

-- 2. Pastikan semua soal memiliki default SINGLE jika masih NULL
UPDATE public.questions
SET type = 'SINGLE'
WHERE type IS NULL;

-- 3. AUTO-DETECT: PG KOMPLEKS (MULTIPLE)
-- Jika answer_key adalah Array JSON (contoh: [0, 2]), ubah ke MULTIPLE
UPDATE public.questions
SET type = 'MULTIPLE'
WHERE jsonb_typeof(answer_key) = 'array';

-- 4. AUTO-DETECT: MENJODOHKAN (MATCHING)
-- Jika answer_key adalah Object JSON (contoh: {"0": 1}), ubah ke MATCHING
UPDATE public.questions
SET type = 'MATCHING'
WHERE jsonb_typeof(answer_key) = 'object';

-- 5. AUTO-DETECT: ESSAY (ISIAN)
-- Jika answer_key adalah String panjang (bukan angka string sederhana), ubah ke ESSAY
UPDATE public.questions
SET type = 'ESSAY'
WHERE jsonb_typeof(answer_key) = 'string'
  AND length(answer_key::text) > 4 -- Panjang minimal untuk dianggap essay
  AND answer_key::text !~ '^[0-9]+$'; -- Bukan angka saja

-- 6. AUTO-DETECT: PG BIASA (SINGLE) - SAFETY CHECK
-- Jika answer_key adalah angka (integer index), pastikan tipe SINGLE
UPDATE public.questions
SET type = 'SINGLE'
WHERE jsonb_typeof(answer_key) = 'number';

COMMIT;

-- Tampilkan hasil untuk verifikasi
SELECT type, count(*) as jumlah_soal 
FROM public.questions 
GROUP BY type;
