
-- =================================================================
-- FIX_QUESTION_DELETE_POLICY.sql
-- TUJUAN:
-- 1. Memastikan pengguna (Admin/Guru) memiliki izin DELETE pada tabel questions.
-- 2. Memastikan Foreign Key ke 'student_answers' bersifat ON DELETE CASCADE
--    (agar saat soal dihapus, jawaban siswa terkait juga ikut terhapus otomatis, bukan error).
-- =================================================================

BEGIN;

-- 1. BERSIHKAN & PERBAIKI POLICY RLS (KEBIJAKAN AKSES)
-- Hapus policy lama yang mungkin berkonflik atau membatasi delete
DROP POLICY IF EXISTS "Authenticated can manage questions" ON public.questions;
DROP POLICY IF EXISTS "Admin Full Access" ON public.questions;
DROP POLICY IF EXISTS "Teacher can manage questions" ON public.questions;
DROP POLICY IF EXISTS "Public can read questions" ON public.questions; -- Hapus policy read sementara

-- Buat Policy READ Publik (Siswa butuh baca soal)
CREATE POLICY "Public can read questions" 
ON public.questions FOR SELECT USING (true);

-- Buat Policy MANAGE (Insert/Update/Delete) untuk Authenticated (Admin/Guru)
CREATE POLICY "Authenticated can manage questions" 
ON public.questions 
FOR ALL 
TO authenticated 
USING (true) 
WITH CHECK (true);

-- 2. PERBAIKI FOREIGN KEY CONSTRAINT (AGAR BISA HAPUS SOAL YANG SUDAH DIJAWAB)
-- Hapus constraint lama
ALTER TABLE public.student_answers
DROP CONSTRAINT IF EXISTS student_answers_question_id_fkey;

-- Buat ulang dengan ON DELETE CASCADE
ALTER TABLE public.student_answers
ADD CONSTRAINT student_answers_question_id_fkey
FOREIGN KEY (question_id)
REFERENCES public.questions(id)
ON DELETE CASCADE;

COMMIT;

-- 3. REFRESH CACHE SCHEMA SUPABASE
NOTIFY pgrst, 'reload config';

-- Konfirmasi
SELECT 'Berhasil! Kebijakan Hapus Soal telah diperbaiki (RLS & Cascade).' as status;
