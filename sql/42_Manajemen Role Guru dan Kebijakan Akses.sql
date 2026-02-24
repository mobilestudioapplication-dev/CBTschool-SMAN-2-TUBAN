
-- =================================================================
-- MODUL: PENAMBAHAN ROLE GURU & MANAJEMEN AKSES
-- Jalankan script ini di SQL Editor Supabase
-- =================================================================

BEGIN;

-- 1. Tambahkan kolom ROLE pada tabel users
-- Default adalah 'student' agar kompatibel dengan data lama
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS role text DEFAULT 'student';

-- Validasi role hanya boleh: student, teacher, admin
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users ADD CONSTRAINT users_role_check 
  CHECK (role IN ('student', 'teacher', 'admin'));

-- 2. Update Role Admin Utama
UPDATE public.users 
SET role = 'admin' 
WHERE username = 'admin@cbtschool.com';

-- 3. Fungsi Helper untuk Cek Role
CREATE OR REPLACE FUNCTION public.is_teacher()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = auth.uid() AND role = 'teacher'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin_or_teacher()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = auth.uid() AND (role = 'admin' OR role = 'teacher')
  ) OR auth.email() = 'admin@cbtschool.com';
$$;

-- 4. UPDATE RLS POLICY (KEBIJAKAN KEAMANAN)
-- Izinkan Guru mengelola Bank Soal, Ujian, dan Jadwal

-- Tabel: TESTS
DROP POLICY IF EXISTS "Teacher can manage tests" ON public.tests;
CREATE POLICY "Teacher can manage tests" ON public.tests
  FOR ALL USING (is_admin_or_teacher());

-- Tabel: QUESTIONS
DROP POLICY IF EXISTS "Teacher can manage questions" ON public.questions;
CREATE POLICY "Teacher can manage questions" ON public.questions
  FOR ALL USING (is_admin_or_teacher());

-- Tabel: SCHEDULES
DROP POLICY IF EXISTS "Teacher can manage schedules" ON public.schedules;
CREATE POLICY "Teacher can manage schedules" ON public.schedules
  FOR ALL USING (is_admin_or_teacher());

-- Tabel: MASTER DATA (Read Only untuk Guru)
-- Guru butuh baca kelas/jurusan untuk bikin jadwal, tapi tidak boleh edit
DROP POLICY IF EXISTS "Teacher can read master data classes" ON public.master_classes;
CREATE POLICY "Teacher can read master data classes" ON public.master_classes
  FOR SELECT USING (is_admin_or_teacher());

DROP POLICY IF EXISTS "Teacher can read master data majors" ON public.master_majors;
CREATE POLICY "Teacher can read master data majors" ON public.master_majors
  FOR SELECT USING (is_admin_or_teacher());

-- Tabel: USERS (Read Only untuk Guru)
-- Guru butuh lihat daftar siswa untuk laporan nilai
DROP POLICY IF EXISTS "Teacher can read users" ON public.users;
CREATE POLICY "Teacher can read users" ON public.users
  FOR SELECT USING (true); -- Public read access is already common, but ensure specific logic if needed

-- Tabel: EXAM SESSIONS & ANSWERS (Read Only / Grading)
-- Guru boleh melihat hasil ujian
DROP POLICY IF EXISTS "Teacher can view sessions" ON public.student_exam_sessions;
CREATE POLICY "Teacher can view sessions" ON public.student_exam_sessions
  FOR SELECT USING (is_admin_or_teacher());

DROP POLICY IF EXISTS "Teacher can view answers" ON public.student_answers;
CREATE POLICY "Teacher can view answers" ON public.student_answers
  FOR SELECT USING (is_admin_or_teacher());

-- 5. FUNGSI UNTUK MEMBUAT AKUN GURU (Jalankan manual oleh Admin via SQL)
-- Contoh cara pakai: SELECT create_teacher_account('guru1@sekolah.sch.id', 'password123', 'Budi S.Pd', 'Wali Kelas');
CREATE OR REPLACE FUNCTION public.create_teacher_account(
  p_email text,
  p_password text,
  p_fullname text,
  p_position text DEFAULT 'Guru'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  -- Cek apakah email sudah ada
  IF EXISTS (SELECT 1 FROM auth.users WHERE email = p_email) THEN
    RAISE EXCEPTION 'Email sudah terdaftar';
  END IF;

  v_user_id := uuid_generate_v4();

  -- Insert ke Auth
  INSERT INTO auth.users (
    id, email, encrypted_password, email_confirmed_at, raw_user_meta_data, role, aud
  ) VALUES (
    v_user_id,
    p_email,
    crypt(p_password, gen_salt('bf')),
    now(),
    jsonb_build_object('full_name', p_fullname, 'role', 'teacher', 'position', p_position),
    'authenticated',
    'authenticated'
  );

  -- Insert ke Public Users
  INSERT INTO public.users (
    id, username, full_name, gender, religion, role, class, major
  ) VALUES (
    v_user_id,
    p_email,
    p_fullname,
    'Laki-laki', -- Default
    'Islam',     -- Default
    'teacher',   -- ROLE PENTING
    'STAFF',     -- Marker untuk Guru
    p_position
  );

  RETURN v_user_id;
END;
$$;

COMMIT;

-- Konfirmasi
SELECT 'Role Guru dan Kebijakan Akses Berhasil Dikonfigurasi' as status;
