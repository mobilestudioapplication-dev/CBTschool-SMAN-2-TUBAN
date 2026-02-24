-- =================================================================
-- CBT SCHOOL: CRITICAL TOKEN & SCHEMA PATCH
-- Menjamin kolom token tersedia dan dapat diakses oleh siswa
-- =================================================================

-- 1. Pastikan kolom token ada di tabel tests
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tests' AND column_name='token') THEN
        ALTER TABLE public.tests ADD COLUMN token TEXT;
    END IF;
END $$;

-- 2. Pastikan token unik dan memiliki index untuk performa tinggi
CREATE UNIQUE INDEX IF NOT EXISTS idx_tests_token_unique ON public.tests(token);

-- 3. Perbaiki kebijakan RLS (Row Level Security)
-- Siswa harus bisa membaca tabel tests dan schedules UNTUK VALIDASI sebelum ujian dimulai
ALTER TABLE public.tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read tests" ON public.tests;
CREATE POLICY "Public can read tests" ON public.tests 
FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public can read schedules" ON public.schedules;
CREATE POLICY "Public can read schedules" ON public.schedules 
FOR SELECT USING (true);

-- 4. Berikan izin eksplisit ke role anonim (siswa sebelum login Supabase Auth)
GRANT SELECT ON public.tests TO anon, authenticated;
GRANT SELECT ON public.schedules TO anon, authenticated;
GRANT SELECT ON public.questions TO anon, authenticated;

-- Log: "Database schema and permissions for tokens have been updated."