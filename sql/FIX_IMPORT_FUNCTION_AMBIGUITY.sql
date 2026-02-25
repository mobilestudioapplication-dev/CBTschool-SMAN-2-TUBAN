-- 1. Drop ALL potential versions of the function to remove ambiguity
DROP FUNCTION IF EXISTS public.admin_import_questions(text, jsonb);
DROP FUNCTION IF EXISTS public.admin_import_questions(text, json);

-- 2. Change the weight column type to NUMERIC to support decimals (Idempotent)
DO $$
BEGIN
    -- Check if the column exists
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'questions' 
          AND column_name = 'weight'
    ) THEN
        -- Alter the column type to NUMERIC(5, 2) which supports values like 123.45
        -- Using NUMERIC is better for exact decimal representation than FLOAT
        ALTER TABLE public.questions ALTER COLUMN weight TYPE NUMERIC(5, 2);
        
        -- If there was a default value, ensure it's compatible (usually it is)
        ALTER TABLE public.questions ALTER COLUMN weight SET DEFAULT 1.0;
    END IF;
END $$;

-- 3. Recreate the function with the correct signature
CREATE OR REPLACE FUNCTION public.admin_import_questions(
    p_test_token TEXT,
    p_questions_data JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    v_test_id public.tests.id%TYPE;
    v_inserted_count INT := 0;
    q JSONB;
BEGIN
    -- Get Test ID
    SELECT id INTO v_test_id FROM public.tests WHERE token = p_test_token;
    
    IF v_test_id IS NULL THEN
        RAISE EXCEPTION 'Ujian dengan token % tidak ditemukan', p_test_token;
    END IF;

    -- Loop through questions
    FOR q IN SELECT * FROM jsonb_array_elements(p_questions_data)
    LOOP
        INSERT INTO public.questions (
            test_id,
            question,
            type,
            options,
            matching_right_options,
            answer_key,
            difficulty,
            weight,
            topic,
            correct_answer_index
        ) VALUES (
            v_test_id,
            (q->>'question'),
            (q->>'type'),
            (SELECT ARRAY(SELECT jsonb_array_elements_text(q->'options'))),
            (SELECT ARRAY(SELECT jsonb_array_elements_text(q->'matching_right_options'))),
            (q->'answer_key'),
            (q->>'difficulty'),
            COALESCE((q->>'weight')::NUMERIC, 1.0), -- Support Decimal
            COALESCE((q->>'topic'), 'Umum'),
            COALESCE((q->'answer_key'->>'index')::INT, 0)
        );
        v_inserted_count := v_inserted_count + 1;
    END LOOP;

    RETURN jsonb_build_object('inserted', v_inserted_count);
END;
$$;

-- 4. Grant permissions
GRANT EXECUTE ON FUNCTION public.admin_import_questions(TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_import_questions(TEXT, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_import_questions(TEXT, JSONB) TO postgres;
