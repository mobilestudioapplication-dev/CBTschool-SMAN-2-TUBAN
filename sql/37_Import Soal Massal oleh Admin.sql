
-- =================================================================
-- MODUL: IMPORT SOAL MASSAL (TKA 2026 COMPLIANT)
-- Jalankan script ini di SQL Editor Supabase
-- =================================================================

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
  -- 1. Validasi Admin
  IF NOT (SELECT auth.email() = 'admin@cbtschool.com') THEN
    RAISE EXCEPTION '403: Forbidden';
  END IF;

  -- 2. Dapatkan ID Ujian dari Token
  SELECT id INTO v_test_id FROM public.tests WHERE token = p_test_token;
  
  IF v_test_id IS NULL THEN
    RAISE EXCEPTION 'Token ujian tidak ditemukan: %', p_test_token;
  END IF;

  -- 3. Insert Data
  -- Kita menggunakan json_populate_recordset untuk memetakan JSON ke struktur tabel sementara,
  -- lalu memasukkannya ke tabel questions.
  
  WITH inserted_rows AS (
    INSERT INTO public.questions (
      test_id,
      type,
      question,
      options,
      matching_right_options, -- Pastikan kolom ini ada di tabel (jika belum, script migrasi sebelumnya harus dijalankan)
      answer_key,
      correct_answer_index, -- FIX: Kolom wajib diisi (Legacy support & Constraint NOT NULL)
      cognitive_level,
      weight,
      difficulty,
      topic
    )
    SELECT
      v_test_id,
      x.type,
      x.question,
      x.options,
      x.matching_right_options,
      x.answer_key,
      -- FIX: Hitung correct_answer_index untuk memenuhi constraint NOT NULL
      -- Ambil dari answer_key jika tipe SINGLE, selain itu isi 0
      COALESCE(
        CASE 
          WHEN x.type = 'multiple_choice' THEN (x.answer_key #>> '{}')::integer
          ELSE 0 
        END, 
      0),
      x.cognitive_level,
      COALESCE(x.weight, 1),
      COALESCE(x.difficulty, 'Medium'),
      x.topic
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

-- Pastikan kolom matching_right_options ada untuk soal menjodohkan (jika belum ada di migrasi sebelumnya)
ALTER TABLE public.questions 
ADD COLUMN IF NOT EXISTS matching_right_options text[];

COMMENT ON FUNCTION public.admin_import_questions IS 'Mengimpor soal massal dari JSON yang sudah diparsing klien, mendukung struktur data TKA 2026.';
