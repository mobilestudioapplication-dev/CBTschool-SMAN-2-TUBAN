
-- =================================================================
-- CBT SCHOOL PATCH: DYNAMIC EMAIL DOMAIN & MASS MIGRATION
-- Memungkinkan admin mengubah domain email sekolah secara massal
-- =================================================================

BEGIN;

-- 1. Tambahkan kolom email_domain ke app_config
ALTER TABLE public.app_config 
ADD COLUMN IF NOT EXISTS email_domain TEXT NOT NULL DEFAULT '@smkn8sby.sch.id';

-- 2. Fungsi Prosedural untuk Migrasi Domain Massal
CREATE OR REPLACE FUNCTION public.admin_update_email_domain(new_domain text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, auth, extensions
AS $$
DECLARE
    current_config_domain text;
BEGIN
    -- Validasi akses admin
    IF NOT (SELECT auth.email() = 'admin@cbtschool.com') THEN
        RAISE EXCEPTION '403: Unauthorized';
    END IF;

    -- Pastikan domain diawali dengan @
    IF NOT (new_domain LIKE '@%') THEN
        new_domain := '@' || new_domain;
    END IF;

    -- Ambil domain lama dari config
    SELECT email_domain INTO current_config_domain FROM public.app_config WHERE id = 1;

    -- A. Update Email di auth.users (Sistem Autentikasi)
    -- Kita hanya mengubah bagian domain, membiarkan bagian local-part (NISN) tetap sama.
    UPDATE auth.users
    SET email = split_part(email, '@', 1) || new_domain
    WHERE email LIKE '%' || current_config_domain
      AND email <> 'admin@cbtschool.com';

    -- B. Update Username di public.users (Profil Publik)
    UPDATE public.users
    SET username = nisn || new_domain
    WHERE username LIKE '%' || current_config_domain
      AND username <> 'admin@cbtschool.com';

    -- C. Update Konfigurasi Utama
    UPDATE public.app_config
    SET email_domain = new_domain
    WHERE id = 1;

END;
$$;

COMMIT;
