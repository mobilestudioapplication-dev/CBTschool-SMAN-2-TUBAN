
-- =================================================================
-- PATCH: ANTI CHEAT SUPPORT
-- Jalankan script ini di SQL Editor Supabase
-- =================================================================

BEGIN;

-- 1. Tambahkan kolom 'violations' untuk melacak jumlah kecurangan
ALTER TABLE public.student_exam_sessions 
ADD COLUMN IF NOT EXISTS violations INT DEFAULT 0;

-- 2. Pastikan enum/check constraint status mendukung 'Diskualifikasi'
-- (Jika constraint sudah ada, kita drop dulu untuk memastikan update)
ALTER TABLE public.student_exam_sessions 
DROP CONSTRAINT IF EXISTS student_exam_sessions_status_check;

ALTER TABLE public.student_exam_sessions 
ADD CONSTRAINT student_exam_sessions_status_check 
CHECK (status IN ('Mengerjakan', 'Selesai', 'Diskualifikasi'));

COMMIT;

-- Konfirmasi
SELECT 'Database ready for Anti-Cheat System' as status;
