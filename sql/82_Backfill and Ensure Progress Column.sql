-- Script untuk memastikan kolom progress ada dan datanya terisi untuk sesi yang sudah berjalan
-- Jalankan ini jika progress bar masih 0/0 padahal siswa sudah mengerjakan

-- 1. Pastikan kolom progress ada
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'student_exam_sessions' AND column_name = 'progress'
    ) THEN
        ALTER TABLE public.student_exam_sessions ADD COLUMN progress INTEGER DEFAULT 0;
    END IF;
END $$;

-- 2. Hitung ulang progress untuk semua sesi yang ada (Backfill)
UPDATE public.student_exam_sessions s
SET progress = (
    SELECT COUNT(*)
    FROM public.student_answers a
    WHERE a.session_id = s.id
    AND (
        a.answer_value IS NOT NULL 
        OR (a.student_answer->>'value') IS NOT NULL
        OR (a.is_unsure = true) -- Opsional: hitung ragu-ragu sebagai progress atau tidak, biasanya tidak
    )
);

-- 3. Pastikan trigger update_progress_trigger sudah terpasang (dari langkah sebelumnya)
-- (Script trigger ada di file update_progress_trigger.sql)
