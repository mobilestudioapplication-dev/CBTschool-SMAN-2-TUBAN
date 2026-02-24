
-- =================================================================
-- MODUL: PENAMBAHAN FITUR ACAK SOAL & JAWABAN
-- Jalankan script ini di SQL Editor Supabase
-- =================================================================

BEGIN;

-- 1. Tambahkan kolom untuk konfigurasi pengacakan
ALTER TABLE public.tests
ADD COLUMN IF NOT EXISTS randomize_questions BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS randomize_answers BOOLEAN DEFAULT FALSE;

-- 2. Berikan komentar untuk dokumentasi
COMMENT ON COLUMN public.tests.randomize_questions IS 'Apakah urutan soal diacak untuk siswa?';
COMMENT ON COLUMN public.tests.randomize_answers IS 'Apakah urutan opsi jawaban (A,B,C,D,E) diacak?';

COMMIT;

-- 3. Refresh schema cache
NOTIFY pgrst, 'reload config';

-- Konfirmasi
SELECT 'Kolom randomize_questions dan randomize_answers berhasil ditambahkan.' as status;
