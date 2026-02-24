
-- =================================================================
-- FIX_MONITORING_RESET.sql (REVISI V2)
-- TUJUAN: 
-- 1. Membuka akses Admin ke tabel monitoring (Sesi & Jadwal)
-- 2. Memastikan fungsi Reset Device berfungsi
-- 3. Menangani error jika Realtime sudah aktif sebelumnya
-- =================================================================

BEGIN;

-- 1. PERBAIKI RLS UNTUK SESI UJIAN (Agar Admin bisa lihat semua)
ALTER TABLE public.student_exam_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin view all sessions" ON public.student_exam_sessions;
CREATE POLICY "Admin view all sessions" 
ON public.student_exam_sessions 
FOR ALL 
USING (
  auth.email() = 'admin@cbtschool.com' OR 
  (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'teacher')
);

-- 2. PERBAIKI RLS UNTUK JADWAL (Penyebab Loading Terus jika gagal load)
ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin view all schedules" ON public.schedules;
CREATE POLICY "Admin view all schedules" 
ON public.schedules 
FOR ALL 
USING (true); -- Jadwal aman dibaca publik (siswa butuh validasi token)

-- 3. AKTIFKAN REALTIME MONITORING (Safe Mode)
-- Cek dulu apakah tabel sudah ada di publikasi untuk menghindari error 42710
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    AND schemaname = 'public'
    AND tablename = 'student_exam_sessions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.student_exam_sessions;
  END IF;
END $$;

-- 4. PERBAIKI FUNGSI RESET DEVICE (Admin Reset)
CREATE OR REPLACE FUNCTION public.admin_reset_device_login(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Reset status login user
  UPDATE public.users
  SET 
    active_device_id = NULL,
    is_login_active = FALSE,
    last_device_info = NULL
  WHERE id = p_user_id;
  
  -- Opsional: Reset juga sesi ujiannya agar waktu kembali (jika diperlukan)
  -- UPDATE public.student_exam_sessions 
  -- SET status = 'Mengerjakan' 
  -- WHERE user_id = p_user_id AND status = 'Mengerjakan';
END;
$$;

COMMIT;

SELECT 'Monitoring & Reset Device Fixed (Safe Mode)' as status;
