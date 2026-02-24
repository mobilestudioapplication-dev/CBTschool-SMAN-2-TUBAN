
-- =================================================================
-- ENABLE REALTIME MONITORING
-- Jalankan script ini agar Admin bisa melihat progres siswa secara live
-- =================================================================

BEGIN;

-- 1. Ubah identitas replikasi tabel menjadi FULL
-- Ini memastikan saat ada UPDATE, frontend menerima data baris lengkap
ALTER TABLE public.student_exam_sessions REPLICA IDENTITY FULL;

-- 2. Tambahkan tabel ke publikasi 'supabase_realtime'
-- Supabase secara default menggunakan publikasi ini untuk fitur realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.student_exam_sessions;

COMMIT;

-- Konfirmasi
SELECT 'Realtime Monitoring Enabled for Exams' as status;
