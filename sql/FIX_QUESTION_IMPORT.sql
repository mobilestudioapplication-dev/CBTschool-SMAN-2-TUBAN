-- 1. Ensure columns exist (Idempotent)
ALTER TABLE public.tests ADD COLUMN IF NOT EXISTS token TEXT;
ALTER TABLE public.tests ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.tests ADD COLUMN IF NOT EXISTS subject TEXT;
ALTER TABLE public.tests ADD COLUMN IF NOT EXISTS duration_minutes INT;
ALTER TABLE public.tests ADD COLUMN IF NOT EXISTS exam_type TEXT DEFAULT 'Umum';
ALTER TABLE public.tests ADD COLUMN IF NOT EXISTS randomize_questions BOOLEAN DEFAULT TRUE;
ALTER TABLE public.tests ADD COLUMN IF NOT EXISTS randomize_answers BOOLEAN DEFAULT FALSE;
ALTER TABLE public.tests ADD COLUMN IF NOT EXISTS questions_to_display INT DEFAULT 0;

-- Ensure token is unique
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tests_token_key') THEN
        ALTER TABLE public.tests ADD CONSTRAINT tests_token_key UNIQUE (token);
    END IF;
END $$;

ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'multiple_choice';
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS image_url TEXT DEFAULT NULL;
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS options TEXT[] DEFAULT NULL;
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS correct_answer_index INT DEFAULT 0;
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS answer_key JSONB DEFAULT NULL;
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS matching_right_options TEXT[] DEFAULT NULL;
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT NULL;
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS weight INT DEFAULT 1;
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS difficulty TEXT DEFAULT 'Medium';
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS topic TEXT DEFAULT '';
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS option_images TEXT[] DEFAULT NULL;

-- Enable RLS
ALTER TABLE public.tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;

-- Create permissive policies
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.tests;
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.questions;

CREATE POLICY "Enable all access for authenticated users" ON public.tests FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Enable all access for authenticated users" ON public.questions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Grant permissions
GRANT ALL ON TABLE public.tests TO authenticated;
GRANT ALL ON TABLE public.questions TO authenticated;

-- 2. Create the RPC function for Bulk Import
CREATE OR REPLACE FUNCTION admin_import_questions(
    p_test_token TEXT,
    p_questions_data JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
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
            COALESCE((q->>'weight')::INT, 1),
            COALESCE((q->>'topic'), 'Umum'),
            COALESCE((q->'answer_key'->>'index')::INT, 0)
        );
        v_inserted_count := v_inserted_count + 1;
    END LOOP;

    RETURN jsonb_build_object('inserted', v_inserted_count);
END;
$$;

GRANT EXECUTE ON FUNCTION admin_import_questions TO authenticated;
GRANT EXECUTE ON FUNCTION admin_import_questions TO service_role;
GRANT EXECUTE ON FUNCTION admin_import_questions TO postgres;
