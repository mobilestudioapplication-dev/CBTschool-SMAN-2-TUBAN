
-- =================================================================
-- CLEANUP_EMPTY_OPTIONS.sql
-- Membersihkan data opsi jawaban yang kosong ("" atau "-") 
-- agar tampilan di siswa bersih (misal: hanya muncul A, B, C, D).
-- =================================================================

BEGIN;

-- 1. Bersihkan elemen array kosong di kolom 'options' pada tabel questions
-- Fungsi ini akan menghapus string kosong atau '-' dari array options
UPDATE public.questions
SET options = ARRAY(
    SELECT x 
    FROM unnest(options) AS x 
    WHERE x IS NOT NULL 
      AND trim(x) <> '' 
      AND trim(x) <> '-'
)
WHERE type IN ('multiple_choice', 'complex_multiple_choice');

-- 2. Pastikan tidak ada soal yang opsinya jadi kurang dari 2 setelah dibersihkan
-- (Optional: hanya untuk pengecekan)
-- SELECT id, question, cardinality(options) as jumlah_opsi FROM public.questions WHERE cardinality(options) < 2;

COMMIT;

SELECT 'Pembersihan opsi kosong selesai. Bank soal kini bersih.' as status;
