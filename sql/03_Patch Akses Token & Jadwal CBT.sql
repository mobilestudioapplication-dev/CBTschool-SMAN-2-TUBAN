
-- =================================================================
-- CBT SCHOOL PATCH: TOKEN & SCHEDULE ACCESS PERMISSIONS (REVISED)
-- Jalankan skrip ini di SQL Editor Supabase untuk memperbaiki error 403
-- =================================================================

-- 1. Berikan hak akses pembacaan (SELECT) publik pada tabel pendukung ujian
-- Siswa perlu membaca ini UNTUK memvalidasi token sebelum sesi dibuat.

DROP POLICY IF EXISTS "Public can read tests" ON public.tests;
CREATE POLICY "Public can read tests" ON public.tests 
FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public can read questions" ON public.questions;
CREATE POLICY "Public can read questions" ON public.questions 
FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public can read schedules" ON public.schedules;
CREATE POLICY "Public can read schedules" ON public.schedules 
FOR SELECT USING (true);

-- 2. Grant akses eksplisit ke role yang digunakan aplikasi
GRANT SELECT ON public.tests TO anon, authenticated;
GRANT SELECT ON public.questions TO anon, authenticated;
GRANT SELECT ON public.schedules TO anon, authenticated;

-- 3. Tambahkan Index untuk performa validasi token
CREATE INDEX IF NOT EXISTS idx_tests_token_lookup ON public.tests(token);
CREATE INDEX IF NOT EXISTS idx_schedules_test_id_lookup ON public.schedules(test_id);

-- Pesan konfirmasi: "Patch Keamanan Token Berhasil Diterapkan."
