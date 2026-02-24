-- PERBAIKAN FINAL UNTUK MASALAH GAGAL SIMPAN (RLS & CONSTRAINT)
-- Script ini akan membersihkan duplikat, memperbaiki constraint, dan memastikan permission RLS benar.

BEGIN;

-- 1. BERSIHKAN DUPLIKAT DATA JAWABAN (Penyebab utama error constraint)
-- Hapus jawaban lama jika ada duplikat (session_id, question_id), sisakan yang terbaru
-- FIX: Menggunakan 'ctid' untuk menghapus duplikat karena updated_at mungkin tidak ada atau tidak reliable
DELETE FROM public.student_answers a
WHERE a.ctid NOT IN (
    SELECT max(b.ctid)
    FROM public.student_answers b
    GROUP BY b.session_id, b.question_id
);

-- 2. PERBAIKI CONSTRAINT UNIQUE
-- Hapus constraint lama jika ada (untuk memastikan nama constraint benar)
ALTER TABLE public.student_answers DROP CONSTRAINT IF EXISTS student_answers_session_id_question_id_key;
ALTER TABLE public.student_answers DROP CONSTRAINT IF EXISTS unique_session_question;

-- Tambahkan constraint UNIQUE baru
ALTER TABLE public.student_answers
ADD CONSTRAINT student_answers_session_id_question_id_key UNIQUE (session_id, question_id);

-- 3. PERBAIKI RLS (ROW LEVEL SECURITY)
-- Pastikan tabel exam_sessions bisa dibaca oleh pemiliknya (PENTING untuk validasi jawaban)
ALTER TABLE public.student_exam_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Siswa bisa lihat sesi sendiri" ON public.student_exam_sessions;
CREATE POLICY "Siswa bisa lihat sesi sendiri" ON public.student_exam_sessions
FOR SELECT
USING (auth.uid() = user_id);

-- Reset RLS pada tabel student_answers
ALTER TABLE public.student_answers ENABLE ROW LEVEL SECURITY;

-- Hapus semua policy lama yang mungkin konflik
DROP POLICY IF EXISTS "Siswa Full Access Jawaban Sendiri" ON public.student_answers;
DROP POLICY IF EXISTS "Siswa manage jawaban sendiri" ON public.student_answers;
DROP POLICY IF EXISTS "Siswa bisa insert jawaban mereka sendiri" ON public.student_answers;
DROP POLICY IF EXISTS "Siswa bisa update jawaban mereka sendiri" ON public.student_answers;
DROP POLICY IF EXISTS "Siswa bisa lihat jawaban mereka sendiri" ON public.student_answers;
DROP POLICY IF EXISTS "Siswa Akses Jawaban Sendiri" ON public.student_answers;

-- Buat Policy BARU yang KOMPREHENSIF
-- Menggunakan subquery sederhana untuk performa dan kejelasan
CREATE POLICY "Siswa Akses Jawaban Sendiri" ON public.student_answers
FOR ALL
USING (
    session_id IN (
        SELECT id FROM public.student_exam_sessions 
        WHERE user_id = auth.uid()
    )
)
WITH CHECK (
    session_id IN (
        SELECT id FROM public.student_exam_sessions 
        WHERE user_id = auth.uid()
    )
);

-- 4. GRANT PERMISSIONS
-- Pastikan role authenticated memiliki akses penuh ke tabel
GRANT ALL ON public.student_answers TO authenticated;
GRANT ALL ON public.student_exam_sessions TO authenticated;

-- 5. OPTIMASI INDEX
CREATE INDEX IF NOT EXISTS idx_student_answers_session_id ON public.student_answers(session_id);
CREATE INDEX IF NOT EXISTS idx_student_exam_sessions_user_id ON public.student_exam_sessions(user_id);

COMMIT;
