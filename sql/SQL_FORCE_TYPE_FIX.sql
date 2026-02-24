
-- =================================================================
-- SQL_FORCE_TYPE_FIX.sql
-- PERBAIKAN PAKSA TIPE SOAL (REVISI FINAL)
-- Jalankan di SQL Editor Supabase
-- =================================================================

BEGIN;

-- 1. Refresh Cache Schema (Penting agar Supabase sadar ada perubahan struktur)
NOTIFY pgrst, 'reload config';

-- 2. Pastikan kolom type ada
ALTER TABLE public.questions 
ADD COLUMN IF NOT EXISTS type text DEFAULT 'SINGLE';

-- 3. LOGIKA DETEKSI CERDAS & UPDATE MASSAL

-- A. DETEKSI MENJODOHKAN (Prioritas Tertinggi)
-- Jika punya opsi kanan (matching_right_options), PASTI Menjodohkan
UPDATE public.questions
SET type = 'MATCHING'
WHERE matching_right_options IS NOT NULL 
  AND cardinality(matching_right_options) > 0;

-- B. DETEKSI PG KOMPLEKS
-- Jika answer_key berbentuk JSON ARRAY (misal: [0, 2])
UPDATE public.questions
SET type = 'MULTIPLE'
WHERE jsonb_typeof(answer_key) = 'array';

-- C. DETEKSI ESSAY
-- Jika answer_key berbentuk STRING dan panjangnya > 2 karakter (bukan "A", "B")
-- Dan bukan angka murni (untuk menghindari bug legacy index yang tersimpan sebagai string)
UPDATE public.questions
SET type = 'ESSAY'
WHERE jsonb_typeof(answer_key) = 'string'
  AND length(answer_key::text) > 3
  AND answer_key::text !~ '^[0-9]+$';

-- D. DETEKSI PG BIASA (Default/Fallback)
-- Jika answer_key adalah angka (integer index) ATAU string pendek (huruf/angka)
UPDATE public.questions
SET type = 'SINGLE'
WHERE type IS NULL 
   OR (type NOT IN ('MULTIPLE', 'MATCHING', 'ESSAY'));

COMMIT;

-- VERIFIKASI HASIL
SELECT type, count(*) as jumlah_soal FROM public.questions GROUP BY type;
