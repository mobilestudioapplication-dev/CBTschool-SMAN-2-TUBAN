
-- =================================================================
-- EMERGENCY FIX: RESET ADMIN & ENABLE TEACHER DOMAIN
-- Jalankan ini jika Anda sama sekali tidak bisa login
-- =================================================================

BEGIN;

-- 1. Reset Password Admin ke 'admin123' (Ganti nanti setelah login)
--    Pastikan akun admin ada di auth.users
DO $$
DECLARE
  v_admin_id uuid;
BEGIN
  SELECT id INTO v_admin_id FROM auth.users WHERE email = 'admin@cbtschool.com';
  
  IF v_admin_id IS NOT NULL THEN
    UPDATE auth.users
    SET encrypted_password = crypt('admin123', gen_salt('bf')),
        email_confirmed_at = now()
    WHERE id = v_admin_id;
  END IF;
END $$;

-- 2. Pastikan Domain Sekolah di Setting Benar
UPDATE public.app_config 
SET school_domain = 'smpn2demak.sch.id' 
WHERE id = 1;

COMMIT;

-- 3. Cek apakah ada user 'teacher' yang username-nya belum email
SELECT id, username, role 
FROM public.users 
WHERE role = 'teacher' AND position('@' in username) = 0;
