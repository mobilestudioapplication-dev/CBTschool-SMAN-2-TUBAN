-- 1. Create save_answer RPC to bypass RLS issues and update progress
CREATE OR REPLACE FUNCTION save_answer(
    p_session_id BIGINT,
    p_question_id BIGINT,
    p_answer_value TEXT,
    p_student_answer JSONB,
    p_is_unsure BOOLEAN
)
RETURNS VOID AS $$
DECLARE
    v_progress INT;
BEGIN
    -- 1. Insert/Update Answer
    INSERT INTO student_answers (session_id, question_id, answer_value, student_answer, is_unsure, answered_at)
    VALUES (p_session_id, p_question_id, p_answer_value, p_student_answer, p_is_unsure, NOW())
    ON CONFLICT (session_id, question_id)
    DO UPDATE SET
        answer_value = EXCLUDED.answer_value,
        student_answer = EXCLUDED.student_answer,
        is_unsure = EXCLUDED.is_unsure,
        answered_at = NOW();

    -- 2. Update Progress (Count distinct answered questions)
    -- Optimization: We can just count from student_answers for this session
    SELECT COUNT(*) INTO v_progress 
    FROM student_answers 
    WHERE session_id = p_session_id AND answer_value IS NOT NULL;

    UPDATE student_exam_sessions 
    SET progress = v_progress, time_left_seconds = GREATEST(0, time_left_seconds) -- Ensure not negative
    WHERE id = p_session_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Grant permissions
GRANT EXECUTE ON FUNCTION save_answer(BIGINT, BIGINT, TEXT, JSONB, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION save_answer(BIGINT, BIGINT, TEXT, JSONB, BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION save_answer(BIGINT, BIGINT, TEXT, JSONB, BOOLEAN) TO anon;

-- 3. One-time fix for existing sessions with 0 progress
UPDATE student_exam_sessions s
SET progress = (
    SELECT COUNT(*) 
    FROM student_answers a 
    WHERE a.session_id = s.id AND a.answer_value IS NOT NULL
)
WHERE s.progress = 0 AND s.status != 'Diskualifikasi';
