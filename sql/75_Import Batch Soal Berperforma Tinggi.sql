
-- =================================================================
-- OPTIMASI PERFORMA & FIX TYPE CASTING: BULK IMPORT SOAL
-- Mengganti metode looping dengan Set-Based Operation & Safe JSON Casting
-- =================================================================

CREATE OR REPLACE FUNCTION public.admin_import_questions(
  p_test_token text,
  p_questions_data json
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER 
SET search_path = public, extensions
AS $$
DECLARE
  v_test_id uuid;
  v_inserted_count int;
BEGIN
  -- 1. Validasi Admin (Security Layer)
  IF NOT (SELECT auth.email() = 'admin@cbtschool.com') THEN
    RAISE EXCEPTION '403: Forbidden - Akses Ditolak';
  END IF;

  -- 2. Lookup Test ID (Sekali jalan, di-cache oleh query planner)
  SELECT id INTO v_test_id FROM public.tests WHERE token = p_test_token;
  
  IF v_test_id IS NULL THEN
    RAISE EXCEPTION 'Token ujian tidak valid: %', p_test_token;
  END IF;

  -- 3. BULK INSERT (THE OPTIMIZATION)
  -- Menggunakan json_to_recordset untuk memparsing JSON array langsung ke format tabel virtual.
  
  WITH inserted_rows AS (
    INSERT INTO public.questions (
      test_id,
      type,
      question,
      options,
      matching_right_options,
      answer_key,
      correct_answer_index, -- Legacy column support
      cognitive_level,
      weight,
      difficulty,
      topic
    )
    SELECT
      v_test_id,
      -- Validasi tipe soal (Default ke multiple_choice jika null)
      COALESCE(x.type, 'multiple_choice'),
      x.question,
      -- Pastikan options tidak null (Array kosong jika null)
      COALESCE(x.options, ARRAY[]::text[]),
      COALESCE(x.matching_right_options, ARRAY[]::text[]),
      x.answer_key,
      -- FIX CRITICAL: Ekstraksi aman dari JSON '{"index": 0}' ke Integer 0
      CASE 
        WHEN x.type = 'multiple_choice' THEN 
            COALESCE((x.answer_key ->> 'index')::integer, 0)
        ELSE 0 
      END,
      COALESCE(x.cognitive_level, 'L1'),
      COALESCE(x.weight, 1),
      COALESCE(x.difficulty, 'Medium'),
      COALESCE(x.topic, 'Umum')
    FROM json_to_recordset(p_questions_data) AS x(
      type text,
      question text,
      options text[],
      matching_right_options text[],
      answer_key jsonb,
      cognitive_level text,
      weight numeric,
      difficulty text,
      topic text
    )
    RETURNING id
  )
  SELECT count(*) INTO v_inserted_count FROM inserted_rows;

  -- 4. Return Summary
  RETURN json_build_object(
    'status', 'success',
    'inserted', v_inserted_count,
    'test_id', v_test_id,
    'message', format('Berhasil mengimpor %s soal dalam satu batch.', v_inserted_count)
  );
END;
$$;

-- Refresh schema cache untuk memastikan Supabase API menggunakan versi terbaru
NOTIFY pgrst, 'reload config';
