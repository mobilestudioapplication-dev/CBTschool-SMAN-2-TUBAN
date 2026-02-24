
-- =================================================================
-- FIX IMPORT SYNC: MEMASTIKAN FORMAT DATA KONSISTEN
-- Jalankan di SQL Editor Supabase
-- =================================================================

-- 1. Refresh Cache Schema
NOTIFY pgrst, 'reload config';

-- 2. Update Fungsi Import untuk menangani parameter JSON dengan nama kolom yang pasti
CREATE OR REPLACE FUNCTION public.admin_import_questions(
  p_test_token text,
  p_questions_data json
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_test_id uuid;
  v_inserted_count int := 0;
BEGIN
  -- Validasi Admin
  IF NOT (SELECT auth.email() = 'admin@cbtschool.com') THEN
    RAISE EXCEPTION '403: Forbidden';
  END IF;

  -- Dapatkan ID Ujian
  SELECT id INTO v_test_id FROM public.tests WHERE token = p_test_token;
  
  IF v_test_id IS NULL THEN
    RAISE EXCEPTION 'Token ujian tidak valid: %', p_test_token;
  END IF;

  -- Insert Data dengan pemetaan eksplisit dari JSON ke Tabel
  -- Menggunakan COALESCE untuk nilai default jika JSON null
  WITH inserted_rows AS (
    INSERT INTO public.questions (
      test_id,
      type,
      question,
      options,
      matching_right_options,
      answer_key,
      correct_answer_index,
      cognitive_level,
      weight,
      difficulty,
      topic
    )
    SELECT
      v_test_id,
      COALESCE(x.type, 'multiple_choice'),
      x.question,
      COALESCE(x.options, ARRAY[]::text[]),
      COALESCE(x.matching_right_options, ARRAY[]::text[]),
      x.answer_key,
      -- Logika Correct Answer Index untuk kompatibilitas
      COALESCE(
        CASE 
           WHEN x.type = 'multiple_choice' AND x.answer_key ? 'index' 
           THEN (x.answer_key->>'index')::smallint
           ELSE 0
        END, 
      0),
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

  RETURN json_build_object(
    'status', 'success',
    'inserted', v_inserted_count,
    'test_id', v_test_id
  );
END;
$$;

SELECT 'Fungsi Import Soal Berhasil Diperbarui.' as status;
