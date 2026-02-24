
-- =================================================================
-- ENSURE_TEACHER_LOGIN.sql
-- Memastikan konfigurasi domain sekolah dan helper function siap
-- untuk menangani login guru yang menggunakan username biasa.
-- =================================================================

BEGIN;

-- 1. Pastikan domain sekolah tersetting dengan benar (Hardcoded sesuai request)
UPDATE public.app_config 
SET school_domain = 'smpn2demak.sch.id' 
WHERE id = 1;

-- 2. Pastikan akun admin utama aman
UPDATE public.users 
SET role = 'admin', major = 'System Administrator'
WHERE username = 'admin@cbtschool.com';

COMMIT;

-- KETERANGAN:
-- Aplikasi frontend akan otomatis menambahkan suffix '@teacher.smpn2demak.sch.id'
-- jika guru login hanya menggunakan username (misal: 'pakbudi').
-- Pastikan data di tabel auth.users sudah sesuai (script FIX_ALL_LOGIN_ROLES.sql sebelumnya sudah menangani ini).
