-- Function to duplicate a test and its questions
CREATE OR REPLACE FUNCTION admin_duplicate_test(p_original_test_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    v_original_test RECORD;
    v_new_test_id UUID;
    v_new_token TEXT;
    v_new_name TEXT;
    v_question_count INT;
BEGIN
    -- 1. Get the original test
    SELECT * INTO v_original_test FROM tests WHERE id = p_original_test_id;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Test not found');
    END IF;

    -- 2. Generate a new unique token
    LOOP
        -- Generate a random 6-character alphanumeric token (uppercase)
        v_new_token := upper(substring(md5(random()::text), 1, 6));
        
        -- Check if it exists
        IF NOT EXISTS (SELECT 1 FROM tests WHERE token = v_new_token) THEN
            EXIT; -- Unique token found
        END IF;
    END LOOP;

    -- 3. Create new test name
    v_new_name := 'Copy of ' || v_original_test.subject;

    -- 4. Insert the new test
    INSERT INTO tests (
        token,
        name,
        subject,
        duration_minutes,
        questions_to_display,
        randomize_questions,
        randomize_answers,
        exam_type,
        created_at,
        updated_at
    ) VALUES (
        v_new_token,
        v_original_test.name, -- Keep the original "name" (often same as subject or internal code)
        v_new_name,           -- Update the "subject" (display name)
        v_original_test.duration_minutes,
        v_original_test.questions_to_display,
        v_original_test.randomize_questions,
        v_original_test.randomize_answers,
        v_original_test.exam_type,
        NOW(),
        NOW()
    ) RETURNING id INTO v_new_test_id;

    -- 5. Duplicate questions
    INSERT INTO questions (
        test_id,
        type,
        question,
        image_url,
        options,
        option_images,
        correct_answer_index,
        answer_key,
        matching_right_options,
        metadata,
        weight,
        difficulty,
        topic
    )
    SELECT
        v_new_test_id,
        type,
        question,
        image_url,
        options,
        option_images,
        correct_answer_index,
        answer_key,
        matching_right_options,
        metadata,
        weight,
        difficulty,
        topic
    FROM questions
    WHERE test_id = p_original_test_id;

    GET DIAGNOSTICS v_question_count = ROW_COUNT;

    RETURN jsonb_build_object(
        'success', true, 
        'message', 'Test duplicated successfully',
        'new_token', v_new_token,
        'question_count', v_question_count
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;
