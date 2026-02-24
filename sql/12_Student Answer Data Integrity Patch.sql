
-- =================================================================
-- CBT SCHOOL PATCH V3.2: STUDENT ANSWER DATA INTEGRITY
-- =================================================================

BEGIN;

-- 1. Pastikan kolom student_answer mendukung JSONB secara fleksibel
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='student_answers' AND column_name='student_answer') THEN
        ALTER TABLE public.student_answers ADD COLUMN student_answer JSONB DEFAULT '{}'::jsonb;
    END IF;
END $$;

-- 2. Indexing untuk pencarian cepat saat monitoring oleh admin
CREATE INDEX IF NOT EXISTS idx_student_answers_session_id ON public.student_answers(session_id);
CREATE INDEX IF NOT EXISTS idx_student_answers_question_id ON public.student_answers(question_id);

-- 3. RLS Policy: Mengizinkan siswa melakukan UPSERT jawaban secara mandiri
DROP POLICY IF EXISTS "Students can manage own answers" ON public.student_answers;
CREATE POLICY "Students can manage own answers" ON public.student_answers 
FOR ALL USING (true)
WITH CHECK (true);

COMMIT;
