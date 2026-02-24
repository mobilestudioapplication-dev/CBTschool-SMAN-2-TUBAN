
-- =================================================================
-- RESET_ADMIN_CREDENTIALS.sql
-- Jalankan ini jika Anda lupa password admin atau login manual gagal
-- =================================================================

BEGIN;

-- 1. Pastikan ekstensi aktif
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Pastikan kolom pendukung ada (FIX ERROR column does not exist)
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS password_text TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS qr_login_password TEXT;

-- 3. Reset Password Admin ke '1234567890'
UPDATE auth.users
SET encrypted_password = crypt('1234567890', gen_salt('bf')),
    email_confirmed_at = now()
WHERE email = 'admin@cbtschool.com';

-- 4. Pastikan data public.users sinkron
UPDATE public.users
SET password_text = '1234567890',
    qr_login_password = '1234567890'
WHERE username = 'admin@cbtschool.com';

COMMIT;

SELECT 'Password Admin berhasil direset menjadi: 1234567890' as status;
