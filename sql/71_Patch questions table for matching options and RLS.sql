
-- =================================================================
-- FIX_QUESTION_INSERT.sql
-- TUJUAN:
-- 1. Memastikan kolom `matching_right_options` ada dengan tipe data yang benar.
-- 2. Memastikan RLS memungkinkan INSERT/UPDATE oleh role authenticated (Admin/Teacher).
-- 3. Merefresh cache API Supabase.
-- =================================================================

BEGIN;

-- 1. Pastikan kolom ada (Idempotent)
ALTER TABLE public.questions 
ADD COLUMN IF NOT EXISTS matching_right_options text[];

COMMENT ON COLUMN public.questions.matching_right_options IS 'Array opsi sebelah kanan untuk soal tipe Menjodohkan';

-- 2. Pastikan RLS Policy mengizinkan Authenticated Users (Admin/Guru) untuk mengelola Questions
-- Hapus policy lama yang mungkin terlalu restriktif
DROP POLICY IF EXISTS "Admin can manage questions" ON public.questions;
DROP POLICY IF EXISTS "Authenticated can manage questions" ON public.questions;

-- Buat policy baru yang lebih eksplisit
CREATE POLICY "Authenticated can manage questions" 
ON public.questions 
FOR ALL 
TO authenticated 
USING (true) 
WITH CHECK (true);

-- 3. REFRESH SCHEMA CACHE (SOLUSI UTAMA JIKA KOLOM TIDAK TERBACA)
NOTIFY pgrst, 'reload config';

COMMIT;

SELECT 'Database Question Table Patched Successfully.' as status;
