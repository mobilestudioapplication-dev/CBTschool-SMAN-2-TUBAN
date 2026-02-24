-- =================================================================
-- CBT SCHOOL PATCH: BRANDING SYNC OPTIMIZATION
-- Memastikan tabel konfigurasi memiliki default yang kuat untuk branding.
-- =================================================================

-- 1. Verifikasi dan Tambahkan kolom jika belum ada (Safe Patch)
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='app_config' AND column_name='school_name') THEN
        ALTER TABLE public.app_config ADD COLUMN school_name TEXT NOT NULL DEFAULT 'CBT SCHOOL';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='app_config' AND column_name='logo_url') THEN
        ALTER TABLE public.app_config ADD COLUMN logo_url TEXT;
    END IF;
END $$;

-- 2. Berikan izin SELECT publik agar BrandingManager di Client bisa membaca logo/nama tanpa login
-- Hal ini penting agar favicon & title berubah bahkan di halaman LOGIN.
GRANT SELECT ON public.app_config TO anon, authenticated;

-- 3. Pastikan RLS mengizinkan pembacaan publik
DROP POLICY IF EXISTS "Public can read config" ON public.app_config;
CREATE POLICY "Public can read config" ON public.app_config FOR SELECT USING (true);

-- 4. Tambahkan komentar metadata
COMMENT ON TABLE public.app_config IS 'Centralized application configuration for branding and rules.';
COMMENT ON COLUMN public.app_config.school_name IS 'Primary school name used for titles, footers, and sharing tags.';
COMMENT ON COLUMN public.app_config.logo_url IS 'URL for school logo used for headers and dynamic favicon.';