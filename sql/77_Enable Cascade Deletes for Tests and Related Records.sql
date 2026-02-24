
-- =================================================================
-- FIX_DELETE_FEATURES.sql
-- TUJUAN: Mengaktifkan fitur Hapus Mapel & Hapus Soal secara tuntas.
-- METODE: Mengubah Foreign Key menjadi ON DELETE CASCADE.
-- =================================================================

BEGIN;

-- 1. PERBAIKI RELASI TABEL QUESTIONS (Soal)
-- Hapus constraint lama
ALTER TABLE public.questions
DROP CONSTRAINT IF EXISTS questions_test_id_fkey;

-- Buat ulang dengan CASCADE (Jika Mapel dihapus, Soal ikut terhapus)
ALTER TABLE public.questions
ADD CONSTRAINT questions_test_id_fkey
FOREIGN KEY (test_id)
REFERENCES public.tests(id)
ON DELETE CASCADE;

-- 2. PERBAIKI RELASI TABEL SCHEDULES (Jadwal)
ALTER TABLE public.schedules
DROP CONSTRAINT IF EXISTS schedules_test_id_fkey;

ALTER TABLE public.schedules
ADD CONSTRAINT schedules_test_id_fkey
FOREIGN KEY (test_id)
REFERENCES public.tests(id)
ON DELETE CASCADE;

-- 3. PERBAIKI RELASI TABEL STUDENT_EXAM_SESSIONS (Sesi Ujian Siswa)
-- Penting: Jika Jadwal dihapus (efek Mapel dihapus), Sesi juga harus hilang
ALTER TABLE public.student_exam_sessions
DROP CONSTRAINT IF EXISTS student_exam_sessions_schedule_id_fkey;

ALTER TABLE public.student_exam_sessions
ADD CONSTRAINT student_exam_sessions_schedule_id_fkey
FOREIGN KEY (schedule_id)
REFERENCES public.schedules(id)
ON DELETE CASCADE;

-- 4. PERBAIKI RELASI TABEL STUDENT_ANSWERS (Jawaban Siswa)
-- Jika Sesi dihapus, Jawaban detail harus hilang
ALTER TABLE public.student_answers
DROP CONSTRAINT IF EXISTS student_answers_session_id_fkey;

ALTER TABLE public.student_answers
ADD CONSTRAINT student_answers_session_id_fkey
FOREIGN KEY (session_id)
REFERENCES public.student_exam_sessions(id)
ON DELETE CASCADE;

-- Juga jika Soal dihapus manual, jawaban terkait harus hilang
ALTER TABLE public.student_answers
DROP CONSTRAINT IF EXISTS student_answers_question_id_fkey;

ALTER TABLE public.student_answers
ADD CONSTRAINT student_answers_question_id_fkey
FOREIGN KEY (question_id)
REFERENCES public.questions(id)
ON DELETE CASCADE;

-- 5. PASTIKAN RLS POLICY MENGIZINKAN DELETE UNTUK ADMIN
-- Policy untuk Tests
DROP POLICY IF EXISTS "Admin can manage tests" ON public.tests;
CREATE POLICY "Admin can manage tests" ON public.tests FOR ALL USING (is_admin());

-- Policy untuk Questions
DROP POLICY IF EXISTS "Admin can manage questions" ON public.questions;
CREATE POLICY "Admin can manage questions" ON public.questions FOR ALL USING (is_admin());

-- Policy untuk Schedules
DROP POLICY IF EXISTS "Admin can manage schedules" ON public.schedules;
CREATE POLICY "Admin can manage schedules" ON public.schedules FOR ALL USING (is_admin());

COMMIT;

-- Konfirmasi
SELECT 'Fitur DELETE (Cascade) berhasil diaktifkan. Anda sekarang bisa menghapus Mapel dan Soal.' as status;
