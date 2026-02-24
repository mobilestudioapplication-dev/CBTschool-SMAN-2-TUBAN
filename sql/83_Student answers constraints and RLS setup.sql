-- Memastikan tabel student_answers memiliki constraint yang benar untuk UPSERT
-- dan RLS policy yang mengizinkan siswa menyimpan jawaban

-- 1. Pastikan Unique Constraint ada (untuk ON CONFLICT)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'student_answers_session_id_question_id_key'
    ) THEN
        ALTER TABLE public.student_answers
        ADD CONSTRAINT student_answers_session_id_question_id_key UNIQUE (session_id, question_id);
    END IF;
END $$;

-- 2. Pastikan RLS Policy Insert/Update aktif
ALTER TABLE public.student_answers ENABLE ROW LEVEL SECURITY;

-- Policy untuk INSERT (Siswa bisa insert jawaban untuk sesinya sendiri)
DROP POLICY IF EXISTS "Siswa bisa insert jawaban mereka sendiri" ON public.student_answers;
CREATE POLICY "Siswa bisa insert jawaban mereka sendiri" ON public.student_answers
FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.student_exam_sessions s
        WHERE s.id = session_id
        AND s.user_id = auth.uid()
    )
);

-- Policy untuk UPDATE (Siswa bisa update jawaban mereka sendiri)
DROP POLICY IF EXISTS "Siswa bisa update jawaban mereka sendiri" ON public.student_answers;
CREATE POLICY "Siswa bisa update jawaban mereka sendiri" ON public.student_answers
FOR UPDATE
USING (
    EXISTS (
        SELECT 1 FROM public.student_exam_sessions s
        WHERE s.id = session_id
        AND s.user_id = auth.uid()
    )
);

-- Policy untuk SELECT (Siswa bisa lihat jawaban mereka sendiri)
DROP POLICY IF EXISTS "Siswa bisa lihat jawaban mereka sendiri" ON public.student_answers;
CREATE POLICY "Siswa bisa lihat jawaban mereka sendiri" ON public.student_answers
FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.student_exam_sessions s
        WHERE s.id = session_id
        AND s.user_id = auth.uid()
    )
);
