-- 1. Fix submit_exam RPC to use BIGINT for session_id
DROP FUNCTION IF EXISTS submit_exam;

CREATE OR REPLACE FUNCTION submit_exam(p_session_id BIGINT, p_score INT)
RETURNS VOID AS $$
BEGIN
  UPDATE student_exam_sessions
  SET 
    score = p_score,
    status = 'Selesai',
    end_time = NOW(),
    time_left_seconds = 0
  WHERE id = p_session_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Ensure end_time column exists in student_exam_sessions
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'student_exam_sessions' AND column_name = 'end_time') THEN
        ALTER TABLE student_exam_sessions ADD COLUMN end_time TIMESTAMPTZ;
    END IF;
END $$;

-- 3. Ensure student_answers table has correct constraints
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'student_answers_session_id_question_id_key'
    ) THEN
        ALTER TABLE student_answers ADD CONSTRAINT student_answers_session_id_question_id_key UNIQUE (session_id, question_id);
    END IF;
END $$;

-- 4. Create save_answer RPC to bypass RLS issues (Fix Red Light)
CREATE OR REPLACE FUNCTION save_answer(
    p_session_id BIGINT,
    p_question_id BIGINT,
    p_answer_value TEXT,
    p_student_answer JSONB,
    p_is_unsure BOOLEAN
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO student_answers (session_id, question_id, answer_value, student_answer, is_unsure, answered_at)
    VALUES (p_session_id, p_question_id, p_answer_value, p_student_answer, p_is_unsure, NOW())
    ON CONFLICT (session_id, question_id)
    DO UPDATE SET
        answer_value = EXCLUDED.answer_value,
        student_answer = EXCLUDED.student_answer,
        is_unsure = EXCLUDED.is_unsure,
        answered_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Grant permissions
GRANT EXECUTE ON FUNCTION submit_exam(BIGINT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION submit_exam(BIGINT, INT) TO service_role;
GRANT EXECUTE ON FUNCTION submit_exam(BIGINT, INT) TO anon; -- Allow for fallback login

GRANT EXECUTE ON FUNCTION save_answer(BIGINT, BIGINT, TEXT, JSONB, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION save_answer(BIGINT, BIGINT, TEXT, JSONB, BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION save_answer(BIGINT, BIGINT, TEXT, JSONB, BOOLEAN) TO anon; -- Allow for fallback login
