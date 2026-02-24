-- FIX UNTUK ERROR UUID PADA student_answers
-- Jalankan ini di SQL Editor Supabase Anda

DO $$ 
BEGIN
    -- Mengubah tipe session_id menjadi BIGINT agar sesuai dengan ID numerik
    BEGIN
        ALTER TABLE student_answers ALTER COLUMN session_id TYPE BIGINT USING session_id::text::bigint;
    EXCEPTION WHEN others THEN 
        RAISE NOTICE 'session_id sudah bertipe benar atau tabel kosong';
    END;

    -- Mengubah tipe question_id menjadi BIGINT
    BEGIN
        ALTER TABLE student_answers ALTER COLUMN question_id TYPE BIGINT USING question_id::text::bigint;
    EXCEPTION WHEN others THEN 
        RAISE NOTICE 'question_id sudah bertipe benar atau tabel kosong';
    END;
END $$;

-- Memastikan constraint UNIQUE untuk fitur UPSERT (Auto-save)
ALTER TABLE student_answers DROP CONSTRAINT IF EXISTS student_answers_session_id_question_id_key;
ALTER TABLE student_answers ADD CONSTRAINT student_answers_session_id_question_id_key UNIQUE (session_id, question_id);