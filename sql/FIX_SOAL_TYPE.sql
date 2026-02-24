
-- =================================================================
-- FIX_SOAL_TYPE.sql
-- PERBAIKAN STRUKTUR TABEL QUESTIONS UNTUK MENYIMPAN TIPE SOAL
-- Jalankan di SQL Editor Supabase
-- =================================================================

BEGIN;

-- 1. Pastikan kolom-kolom penting untuk TKA 2026 ada
ALTER TABLE public.questions
ADD COLUMN IF NOT EXISTS type text DEFAULT 'SINGLE',
ADD COLUMN IF NOT EXISTS matching_right_options text[],
ADD COLUMN IF NOT EXISTS answer_key jsonb,
ADD COLUMN IF NOT EXISTS audio_url text,
ADD COLUMN IF NOT EXISTS video_url text,
ADD COLUMN IF NOT EXISTS cognitive_level text DEFAULT 'L1',
ADD COLUMN IF NOT EXISTS weight numeric DEFAULT 1;

-- 2. Hapus constraint lama jika ada (untuk menghindari konflik nama)
ALTER TABLE public.questions DROP CONSTRAINT IF EXISTS questions_type_check;

-- 3. Tambahkan constraint validasi untuk tipe soal
ALTER TABLE public.questions ADD CONSTRAINT questions_type_check 
  CHECK (type IN ('SINGLE', 'MULTIPLE', 'MATCHING', 'ESSAY'));

-- 4. Tambahkan komentar untuk dokumentasi
COMMENT ON COLUMN public.questions.type IS 'Tipe soal: SINGLE, MULTIPLE, MATCHING, ESSAY';
COMMENT ON COLUMN public.questions.answer_key IS 'Kunci jawaban kompleks (JSON)';
COMMENT ON COLUMN public.questions.matching_right_options IS 'Opsi kanan untuk soal menjodohkan';

COMMIT;

-- 5. Refresh Schema Cache (opsional, membantu Supabase API membaca kolom baru)
NOTIFY pgrst, 'reload config';

SELECT 'Berhasil! Tabel questions sekarang siap menyimpan Tipe Soal.' as status;
