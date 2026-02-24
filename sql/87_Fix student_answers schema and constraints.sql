-- SCRIPT UNTUK MEMPERBAIKI SKEMA DATABASE student_answers
-- Masalah: Kolom session_id atau question_id kemungkinan bertipe UUID padahal aplikasi mengirimkan INTEGER (ID Serial)
-- Error: "invalid input syntax for type uuid: \"14\""

-- 1. Pastikan tabel student_answers menggunakan tipe data yang benar (BIGINT untuk ID Serial)
DO $$ 
BEGIN
    -- Ubah tipe session_id jika perlu
    BEGIN
        ALTER TABLE student_answers ALTER COLUMN session_id TYPE BIGINT USING session_id::text::bigint;
    EXCEPTION WHEN others THEN 
        RAISE NOTICE 'Gagal mengubah tipe session_id, mungkin sudah benar atau tabel kosong';
    END;

    -- Ubah tipe question_id jika perlu
    BEGIN
        ALTER TABLE student_answers ALTER COLUMN question_id TYPE BIGINT USING question_id::text::bigint;
    EXCEPTION WHEN others THEN 
        RAISE NOTICE 'Gagal mengubah tipe question_id, mungkin sudah benar atau tabel kosong';
    END;
END $$;

-- 2. Pastikan constraint UNIQUE ada untuk mendukung fitur UPSERT (ON CONFLICT)
-- Fitur autosave menggunakan: .upsert(payload, { onConflict: 'session_id,question_id' })
ALTER TABLE student_answers DROP CONSTRAINT IF EXISTS student_answers_session_id_question_id_key;
ALTER TABLE student_answers ADD CONSTRAINT student_answers_session_id_question_id_key UNIQUE (session_id, question_id);

-- 3. Pastikan kolom student_answer bertipe JSONB untuk fleksibilitas jawaban (Multiple Choice, Matching, dll)
DO $$ 
BEGIN
    ALTER TABLE student_answers ADD COLUMN IF NOT EXISTS student_answer JSONB;
EXCEPTION WHEN others THEN 
    RAISE NOTICE 'Kolom student_answer mungkin sudah ada';
END $$;

-- 4. Tambahkan index untuk performa
CREATE INDEX IF NOT EXISTS idx_student_answers_session ON student_answers(session_id);
