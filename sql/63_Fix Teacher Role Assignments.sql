
-- =================================================================
-- SQL_FIX_TEACHER_ROLE_MANUAL.sql
-- MODUL: PERBAIKAN AKSES LOGIN GURU
-- Jalankan ini untuk mengubah akun yang "nyangkut" menjadi akun Guru
-- =================================================================

BEGIN;

-- GANTI EMAIL DI BAWAH INI DENGAN EMAIL GURU YANG BERMASALAH
-- Contoh: 'budi@teacher.smpn2demak.sch.id' atau '123456@teacher.smpn2demak.sch.id'
DO $$
DECLARE
    v_target_email text := 'admin@cbtschool.com'; -- <--- GANTI EMAIL INI JIKA PERLU, ATAU BIARKAN UNTUK MEMPERBAIKI SEMUA
BEGIN

    -- 1. UPDATE PUBLIC PROFILE (Data Tampilan)
    -- Mengubah semua user yang memiliki username mengandung '@teacher' atau 'guru' menjadi role teacher
    UPDATE public.users
    SET 
        role = 'teacher',
        class = 'STAFF',
        major = 'Guru Mapel'
    WHERE 
        (username LIKE '%@teacher.%' OR username LIKE 'guru%')
        AND role <> 'teacher';

    -- 2. UPDATE AUTH METADATA (Sistem Login)
    -- Ini yang paling penting agar App.tsx mengenali user sebagai teacher
    UPDATE auth.users
    SET raw_user_meta_data = jsonb_set(
        COALESCE(raw_user_meta_data, '{}'::jsonb),
        '{role}',
        '"teacher"'
    )
    WHERE email LIKE '%@teacher.%';
    
    -- 3. UPDATE CLASS DI METADATA
    UPDATE auth.users
    SET raw_user_meta_data = jsonb_set(
        COALESCE(raw_user_meta_data, '{}'::jsonb),
        '{class}',
        '"STAFF"'
    )
    WHERE email LIKE '%@teacher.%';

END $$;

COMMIT;

-- Tampilkan daftar guru yang sekarang aktif untuk konfirmasi
SELECT username, role, class FROM public.users WHERE role = 'teacher';
