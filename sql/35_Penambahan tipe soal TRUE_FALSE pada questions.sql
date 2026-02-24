
-- =================================================================
-- MODUL: PENAMBAHAN TIPE SOAL BENAR/SALAH (TKA 2026)
-- Jalankan script ini di SQL Editor Supabase
-- =================================================================

BEGIN;

-- 1. Hapus constraint lama pada kolom type
ALTER TABLE public.questions 
DROP CONSTRAINT IF EXISTS questions_type_check;

-- 2. Tambahkan constraint baru yang mencakup 'true_false'
-- TKA 2026 Standards: SINGLE, MULTIPLE, MATCHING, ESSAY, TRUE_FALSE
ALTER TABLE public.questions 
ADD CONSTRAINT questions_type_check 
CHECK (type IN ('multiple_choice', 'complex_multiple_choice', 'matching', 'essay', 'true_false'));

-- 3. Refresh schema cache
NOTIFY pgrst, 'reload config';

COMMIT;

-- Konfirmasi
SELECT 'Tipe soal TRUE_FALSE berhasil ditambahkan.' as status;
