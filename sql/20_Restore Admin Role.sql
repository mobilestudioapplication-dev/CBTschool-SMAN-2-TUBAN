
-- =================================================================
-- FIX_ADMIN_ROLE_DATA.sql
-- Memperbaiki role admin yang mungkin hilang/salah
-- Termasuk migrasi skema jika kolom role belum ada
-- =================================================================

BEGIN;

-- 0. Pastikan kolom role ada di public.users (Migrasi Schema Otomatis)
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS role text DEFAULT 'student';

-- 0b. Pastikan constraint check ada (Opsional tapi bagus untuk integritas)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_role_check') THEN
        ALTER TABLE public.users 
        ADD CONSTRAINT users_role_check CHECK (role IN ('student', 'teacher', 'admin'));
    END IF;
END $$;

-- 1. Update di auth.users (Metadata)
UPDATE auth.users 
SET raw_user_meta_data = jsonb_set(
    COALESCE(raw_user_meta_data, '{}'::jsonb), 
    '{role}', 
    '"admin"'
)
WHERE email = 'admin@cbtschool.com';

-- 2. Update di public.users (Kolom)
UPDATE public.users 
SET role = 'admin' 
WHERE username = 'admin@cbtschool.com';

COMMIT;

SELECT 'Admin role restored and schema updated.' as status;
