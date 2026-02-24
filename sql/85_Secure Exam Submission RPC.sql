-- PERBAIKAN FITUR SUBMIT UJIAN & AUTO SAVE

-- 1. Pastikan RLS di student_exam_sessions mengizinkan UPDATE oleh siswa
-- (Terutama untuk update sisa waktu dan status)
ALTER TABLE public.student_exam_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Siswa update sesi sendiri" ON public.student_exam_sessions;
CREATE POLICY "Siswa update sesi sendiri" ON public.student_exam_sessions
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 2. Buat RPC (Remote Procedure Call) untuk Submit Ujian yang Aman
-- Menggunakan SECURITY DEFINER agar bypass RLS untuk memastikan update berhasil
-- namun tetap memvalidasi kepemilikan sesi.
CREATE OR REPLACE FUNCTION submit_exam(
    p_session_id UUID,
    p_score NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER 
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_result JSONB;
BEGIN
    -- Ambil user_id dari sesi
    SELECT user_id INTO v_user_id
    FROM public.student_exam_sessions
    WHERE id = p_session_id;

    -- Validasi: Pastikan sesi milik user yang sedang login
    IF v_user_id IS NULL OR v_user_id != auth.uid() THEN
        RAISE EXCEPTION 'Unauthorized: Session does not belong to user';
    END IF;

    -- Update status sesi menjadi Selesai
    UPDATE public.student_exam_sessions
    SET 
        status = 'Selesai',
        score = p_score,
        finished_at = NOW(),
        time_left_seconds = 0
    WHERE id = p_session_id;

    v_result := jsonb_build_object(
        'success', true,
        'message', 'Exam submitted successfully',
        'score', p_score
    );

    RETURN v_result;
END;
$$;

-- 3. Pastikan kolom score tipe datanya memadai (NUMERIC/FLOAT)
-- (Idempotent: hanya ubah jika perlu, biasanya sudah numeric/int)
DO $$
BEGIN
    -- Cek tipe data kolom score, jika integer ubah ke numeric agar presisi
    -- (Opsional, tergantung kebutuhan scoring)
    NULL; 
END $$;
