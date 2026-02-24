-- Trigger untuk mengupdate progress (jumlah soal terjawab) di student_exam_sessions
-- Setiap kali ada insert/update/delete di student_answers

CREATE OR REPLACE FUNCTION public.update_exam_progress()
RETURNS TRIGGER AS $$
DECLARE
    v_session_id UUID;
    v_answered_count INTEGER;
BEGIN
    IF (TG_OP = 'DELETE') THEN
        v_session_id := OLD.session_id;
    ELSE
        v_session_id := NEW.session_id;
    END IF;

    -- Hitung jumlah jawaban yang tidak null/kosong
    SELECT COUNT(*) INTO v_answered_count
    FROM public.student_answers
    WHERE session_id = v_session_id
      AND (
          answer_value IS NOT NULL 
          OR (student_answer->>'value') IS NOT NULL
      );

    -- Update tabel session
    UPDATE public.student_exam_sessions
    SET progress = v_answered_count
    WHERE id = v_session_id;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger jika sudah ada
DROP TRIGGER IF EXISTS trigger_update_exam_progress ON public.student_answers;

-- Buat trigger
CREATE TRIGGER trigger_update_exam_progress
AFTER INSERT OR UPDATE OR DELETE ON public.student_answers
FOR EACH ROW
EXECUTE FUNCTION public.update_exam_progress();

-- Tambahkan kolom progress jika belum ada (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'student_exam_sessions' AND column_name = 'progress'
    ) THEN
        ALTER TABLE public.student_exam_sessions ADD COLUMN progress INTEGER DEFAULT 0;
    END IF;
END $$;
