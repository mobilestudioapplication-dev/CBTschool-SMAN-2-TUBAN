
-- =================================================================
-- SQL SCRIPT: PERBAIKAN TIPE SOAL (MANUAL & OTOMATIS)
-- Jalankan blok kode yang Anda butuhkan di SQL Editor Supabase.
-- =================================================================

-- -----------------------------------------------------------------
-- BAGIAN 1: CEK DATA (DIAGNOSA)
-- Lihat data soal terbaru untuk mengetahui ID mana yang salah tipe.
-- -----------------------------------------------------------------
SELECT 
    id, 
    type, 
    left(question, 40) as pertanyaaan, 
    jsonb_typeof(answer_key) as tipe_kunci_jawaban,
    answer_key
FROM public.questions 
ORDER BY id DESC 
LIMIT 20;


-- -----------------------------------------------------------------
-- BAGIAN 2: UPDATE MANUAL (PER ID) - PALING AMAN
-- Ganti angka 'ID_SOAL' dengan ID yang Anda lihat di hasil BAGIAN 1.
-- -----------------------------------------------------------------

-- A. Ubah menjadi ESSAY
/*
UPDATE public.questions 
SET type = 'essay' 
WHERE id = 123; -- Ganti 123 dengan ID Soal Essay Anda
*/

-- B. Ubah menjadi PG KOMPLEKS (Pilihan Ganda Lebih dari 1)
/*
UPDATE public.questions 
SET type = 'complex_multiple_choice' 
WHERE id = 124; -- Ganti 124 dengan ID Soal PG Kompleks Anda
*/

-- C. Ubah menjadi MENJODOHKAN
/*
UPDATE public.questions 
SET type = 'matching' 
WHERE id = 125; -- Ganti 125 dengan ID Soal Menjodohkan Anda
*/


-- -----------------------------------------------------------------
-- BAGIAN 3: UPDATE OTOMATIS (SMART DETECTION)
-- Jalankan ini jika Anda ingin sistem menebak tipe soal 
-- berdasarkan bentuk kunci jawabannya.
-- -----------------------------------------------------------------

BEGIN;

-- 1. Deteksi MENJODOHKAN
-- Jika punya opsi kanan (matching_right_options), ubah ke 'matching'
UPDATE public.questions
SET type = 'matching'
WHERE matching_right_options IS NOT NULL 
  AND cardinality(matching_right_options) > 0;

-- 2. Deteksi PG KOMPLEKS
-- Jika kunci jawaban berupa Array JSON (misal: [0, 2]), ubah ke 'complex_multiple_choice'
UPDATE public.questions
SET type = 'complex_multiple_choice'
WHERE jsonb_typeof(answer_key) = 'array';

-- 3. Deteksi ESSAY
-- Jika kunci jawaban berupa String Teks (misal: "Soekarno"), ubah ke 'essay'
-- Kita tambahkan filter panjang > 1 agar tidak tertukar dengan kunci jawaban "A" atau "B"
UPDATE public.questions
SET type = 'essay'
WHERE jsonb_typeof(answer_key) = 'string'
  AND length(answer_key::text) > 3 
  AND answer_key::text !~ '^[0-9]+$'; -- Pastikan bukan angka string

-- 4. Deteksi PG BIASA (Default)
-- Jika kunci jawaban berupa Object {index: ...} atau Integer, pastikan 'multiple_choice'
UPDATE public.questions
SET type = 'multiple_choice'
WHERE jsonb_typeof(answer_key) = 'object' 
   OR jsonb_typeof(answer_key) = 'number';

COMMIT;

-- -----------------------------------------------------------------
-- BAGIAN 4: KONFIRMASI HASIL
-- -----------------------------------------------------------------
SELECT type, count(*) as jumlah_soal 
FROM public.questions 
GROUP BY type;
