-- COMPREHENSIVE DATABASE FIX FOR CBT APP
-- Run this script in your Supabase SQL Editor to fix:
-- 1. Exam Submission Error (invalid input syntax for type uuid)
-- 2. Progress Bar showing 0/0 (Real-time progress tracking)
-- 3. RLS Policies blocking answer saving

-- ==========================================
-- 1. FIX SUBMIT_EXAM RPC
-- ==========================================
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

-- ==========================================
-- 2. FIX SAVE_ANSWER RPC (Auto-calculates Progress)
-- ==========================================
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
    -- A. Insert/Update Answer
    INSERT INTO student_answers (session_id, question_id, answer_value, student_answer, is_unsure, answered_at)
    VALUES (p_session_id, p_question_id, p_answer_value, p_student_answer, p_is_unsure, NOW())
    ON CONFLICT (session_id, question_id)
    DO UPDATE SET
        answer_value = EXCLUDED.answer_value,
        student_answer = EXCLUDED.student_answer,
        is_unsure = EXCLUDED.is_unsure,
        answered_at = NOW();

    -- B. Update Progress (Count distinct answered questions)
    SELECT COUNT(*) INTO v_progress 
    FROM student_answers 
    WHERE session_id = p_session_id AND answer_value IS NOT NULL;

    -- C. Update Session Progress
    UPDATE student_exam_sessions 
    SET progress = v_progress, time_left_seconds = GREATEST(0, time_left_seconds)
    WHERE id = p_session_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==========================================
-- 3. ENSURE SCHEMA INTEGRITY
-- ==========================================
-- Ensure end_time column exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'student_exam_sessions' AND column_name = 'end_time') THEN
        ALTER TABLE student_exam_sessions ADD COLUMN end_time TIMESTAMPTZ;
    END IF;
END $$;

-- Ensure unique constraint for answers
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'student_answers_session_id_question_id_key'
    ) THEN
        ALTER TABLE student_answers ADD CONSTRAINT student_answers_session_id_question_id_key UNIQUE (session_id, question_id);
    END IF;
END $$;

-- ==========================================
-- 4. GRANT PERMISSIONS
-- ==========================================
GRANT EXECUTE ON FUNCTION submit_exam(BIGINT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION submit_exam(BIGINT, INT) TO service_role;
GRANT EXECUTE ON FUNCTION submit_exam(BIGINT, INT) TO anon;

GRANT EXECUTE ON FUNCTION save_answer(BIGINT, BIGINT, TEXT, JSONB, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION save_answer(BIGINT, BIGINT, TEXT, JSONB, BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION save_answer(BIGINT, BIGINT, TEXT, JSONB, BOOLEAN) TO anon;

-- ==========================================
-- 5. DATA REPAIR (One-Time Fix)
-- ==========================================
-- Recalculate progress for all existing sessions
UPDATE student_exam_sessions s
SET progress = (
    SELECT COUNT(*) 
    FROM student_answers a 
    WHERE a.session_id = s.id AND a.answer_value IS NOT NULL
)
WHERE s.status != 'Diskualifikasi';
