-- =====================================================================
-- SETUP_SQL.sql (AUTO-GENERATED)
-- Gabungan berurutan file SQL 01 sampai 79
-- Folder: SQL WAJIB INSTALL SAAT MEMBUAT DATABASE BARU
-- =====================================================================

-- =====================================================================
-- START: 01_CBT School Unified Setup.sql
-- =====================================================================

-- =================================================================
-- CBT SCHOOL UNIFIED SETUP SCRIPT (V2.4) - IDEMPOTENT & SAFE UPDATES
-- Project: ytlizvulzbnubvdlhtpz
-- =================================================================

-- 0. INITIAL CLEANUP & EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. TABLES DEFINITION
-- -----------------------------------------------------------------

-- App Configuration
CREATE TABLE IF NOT EXISTS public.app_config (
  id smallint PRIMARY KEY DEFAULT 1,
  school_name text NOT NULL DEFAULT 'CBT School SMK',
  logo_url text,
  primary_color char(7) DEFAULT '#2563eb',
  enable_anti_cheat boolean DEFAULT true,
  anti_cheat_violation_limit smallint DEFAULT 3,
  allow_student_manual_login boolean DEFAULT true,
  allow_student_qr_login boolean DEFAULT true,
  allow_admin_manual_login boolean DEFAULT true,
  allow_admin_qr_login boolean DEFAULT true,
  headmaster_name text,
  headmaster_nip text,
  card_issue_date text,
  signature_url text,
  stamp_url text,
  student_data_sheet_url text,
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT pk_app_config CHECK (id = 1)
);

-- Public User Profiles
CREATE TABLE IF NOT EXISTS public.users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text NOT NULL UNIQUE,
  qr_login_password text,
  full_name text NOT NULL,
  nisn text UNIQUE,
  class text,
  major text,
  religion text DEFAULT 'Islam',
  gender text NOT NULL CHECK (gender IN ('Laki-laki', 'Perempuan')),
  photo_url text,
  updated_at timestamptz DEFAULT now()
);

-- Master Data
CREATE TABLE IF NOT EXISTS public.master_classes (id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), name text NOT NULL UNIQUE, created_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS public.master_majors (id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), name text NOT NULL UNIQUE, created_at timestamptz DEFAULT now());

-- Exams and Questions
CREATE TABLE IF NOT EXISTS public.tests (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  token text NOT NULL UNIQUE,
  name text NOT NULL,
  subject text NOT NULL,
  duration_minutes int NOT NULL,
  questions_to_display int,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.questions (
  id bigserial PRIMARY KEY,
  test_id uuid NOT NULL REFERENCES public.tests(id) ON DELETE CASCADE,
  question text NOT NULL,
  image_url text,
  options text[] NOT NULL,
  option_images text[],
  correct_answer_index smallint NOT NULL,
  difficulty text NOT NULL CHECK (difficulty IN ('Easy', 'Medium', 'Hard')),
  topic text
);

-- Schedules and Announcements
CREATE TABLE IF NOT EXISTS public.schedules (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  test_id uuid NOT NULL REFERENCES public.tests(id) ON DELETE CASCADE,
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  assigned_to text[]
);

CREATE TABLE IF NOT EXISTS public.announcements (id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), title text NOT NULL UNIQUE, content text NOT NULL, created_at timestamptz DEFAULT now());

-- Student Sessions
CREATE TABLE IF NOT EXISTS public.student_exam_sessions (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  schedule_id uuid NOT NULL REFERENCES public.schedules(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'Mengerjakan' CHECK (status IN ('Mengerjakan', 'Selesai', 'Diskualifikasi')),
  progress int NOT NULL DEFAULT 0,
  time_left_seconds int NOT NULL,
  violations int NOT NULL DEFAULT 0,
  score smallint,
  started_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, schedule_id)
);

CREATE TABLE IF NOT EXISTS public.student_answers (
  id bigserial PRIMARY KEY,
  session_id bigint NOT NULL REFERENCES public.student_exam_sessions(id) ON DELETE CASCADE,
  question_id bigint NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  selected_answer_index smallint,
  is_unsure boolean DEFAULT false,
  answered_at timestamptz DEFAULT now(),
  UNIQUE(session_id, question_id)
);

-- 2. BUSINESS LOGIC FUNCTIONS (RPC)
-- -----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
  SELECT auth.email() = 'admin@cbtschool.com';
$$;

-- Function to handle automated user profile creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.users (id, username, full_name, nisn, class, major, gender, religion, photo_url)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data ->> 'full_name', 'Nama Belum Diatur'),
    COALESCE(new.raw_user_meta_data ->> 'nisn', split_part(new.email, '@', 1)),
    COALESCE(new.raw_user_meta_data ->> 'class', 'Belum diatur'),
    COALESCE(new.raw_user_meta_data ->> 'major', 'Belum diatur'),
    COALESCE(new.raw_user_meta_data ->> 'gender', 'Laki-laki'),
    COALESCE(new.raw_user_meta_data ->> 'religion', 'Islam'),
    new.raw_user_meta_data ->> 'photo_url'
  );
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Atomic Session Creator
CREATE OR REPLACE FUNCTION public.create_exam_session(
  p_user_uuid uuid,
  p_schedule_uuid uuid,
  p_duration_seconds integer
) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_session_id bigint;
BEGIN
  SELECT id INTO v_session_id FROM public.student_exam_sessions
  WHERE user_id = p_user_uuid AND schedule_id = p_schedule_uuid;

  IF v_session_id IS NOT NULL THEN
    RETURN v_session_id;
  ELSE
    INSERT INTO public.student_exam_sessions(user_id, schedule_id, status, time_left_seconds)
    VALUES (p_user_uuid, p_schedule_uuid, 'Mengerjakan', p_duration_seconds)
    RETURNING id INTO v_session_id;
    RETURN v_session_id;
  END IF;
END;
$$;

-- [FIXED] CORE SYNC FUNCTION
CREATE OR REPLACE FUNCTION public.sync_all_users(users_data json)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  deleted_count int := 0;
  updated_count int := 0;
  inserted_count int := 0;
BEGIN
  -- Validasi akses admin
  IF NOT (SELECT auth.email() = 'admin@cbtschool.com') THEN
    RAISE EXCEPTION '403: Hanya Administrator Utama yang dapat melakukan sinkronisasi.';
  END IF;

  -- 1. Tabel sementara untuk data sheet
  CREATE TEMP TABLE IF NOT EXISTS incoming_users (
    username text,
    password text,
    fullName text,
    nisn text,
    class text,
    major text,
    gender text,
    religion text,
    photoUrl text
  ) ON COMMIT DROP;

  -- FIX: Gunakan TRUNCATE alih-alih DELETE tanpa WHERE untuk menghindari error 'Safe Updates'
  TRUNCATE incoming_users; 

  INSERT INTO incoming_users
  SELECT * FROM json_populate_recordset(null::incoming_users, users_data);
  
  -- 2. Hapus siswa yang tidak ada di sheet
  WITH deleted_users AS (
    DELETE FROM auth.users
    WHERE email <> 'admin@cbtschool.com'
      AND id IN (
        SELECT u.id FROM public.users u
        WHERE u.nisn IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM incoming_users i WHERE i.nisn = u.nisn
        )
      )
    RETURNING *
  )
  SELECT count(*) INTO deleted_count FROM deleted_users;

  -- 3. Update siswa yang sudah ada
  WITH updated_rows AS (
    UPDATE public.users pu
    SET
      full_name = i.fullName,
      class = i.class,
      major = i.major,
      gender = i.gender,
      religion = i.religion,
      photo_url = i.photoUrl,
      updated_at = now()
    FROM incoming_users i
    WHERE pu.nisn = i.nisn
    RETURNING pu.id
  )
  SELECT count(*) INTO updated_count FROM updated_rows;

  -- 4. Insert siswa baru ke auth.users
  WITH new_users AS (
    INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_user_meta_data, aud, role)
    SELECT
      uuid_generate_v4(),
      i.nisn || '@smpn2depok.sch.id',
      crypt(COALESCE(i.password, i.nisn), gen_salt('bf')),
      now(),
      jsonb_build_object(
          'full_name', i.fullName,
          'nisn', i.nisn,
          'class', i.class,
          'major', i.major,
          'gender', i.gender,
          'religion', i.religion,
          'photo_url', i.photoUrl
      ),
      'authenticated',
      'authenticated'
    FROM incoming_users i
    WHERE NOT EXISTS (SELECT 1 FROM public.users pu WHERE pu.nisn = i.nisn)
    RETURNING *
  )
  SELECT count(*) INTO inserted_count FROM new_users;

  RETURN json_build_object(
    'deleted', deleted_count,
    'updated', updated_count,
    'inserted', inserted_count
  );
END;
$$;

-- 3. SECURITY POLICIES (RLS)
-- -----------------------------------------------------------------

ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_majors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_exam_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_answers ENABLE ROW LEVEL SECURITY;

-- CLEANUP OLD POLICIES TO PREVENT "ALREADY EXISTS" ERROR
DO $$ 
DECLARE 
    pol record;
BEGIN
    FOR pol IN 
        SELECT policyname, tablename 
        FROM pg_policies 
        WHERE schemaname = 'public' 
        AND policyname IN ('Public Read Access', 'Student Update Own Session', 'Student Manage Own Answers', 'Admin Full Access')
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol.policyname, pol.tablename);
    END LOOP;
END $$;

-- Public Access
CREATE POLICY "Public Read Access" ON public.app_config FOR SELECT USING (true);
CREATE POLICY "Public Read Access" ON public.users FOR SELECT USING (true);
CREATE POLICY "Public Read Access" ON public.master_classes FOR SELECT USING (true);
CREATE POLICY "Public Read Access" ON public.master_majors FOR SELECT USING (true);
CREATE POLICY "Public Read Access" ON public.tests FOR SELECT USING (true);
CREATE POLICY "Public Read Access" ON public.questions FOR SELECT USING (true);
CREATE POLICY "Public Read Access" ON public.schedules FOR SELECT USING (true);
CREATE POLICY "Public Read Access" ON public.announcements FOR SELECT USING (true);
CREATE POLICY "Public Read Access" ON public.student_exam_sessions FOR SELECT USING (true);

-- Student Interactive Access
CREATE POLICY "Student Update Own Session" ON public.student_exam_sessions FOR UPDATE USING (true);
CREATE POLICY "Student Manage Own Answers" ON public.student_answers FOR ALL USING (true);

-- Admin Full Control
CREATE POLICY "Admin Full Access" ON public.app_config FOR ALL USING (is_admin());
CREATE POLICY "Admin Full Access" ON public.users FOR ALL USING (is_admin());
CREATE POLICY "Admin Full Access" ON public.master_classes FOR ALL USING (is_admin());
CREATE POLICY "Admin Full Access" ON public.master_majors FOR ALL USING (is_admin());
CREATE POLICY "Admin Full Access" ON public.tests FOR ALL USING (is_admin());
CREATE POLICY "Admin Full Access" ON public.questions FOR ALL USING (is_admin());
CREATE POLICY "Admin Full Access" ON public.schedules FOR ALL USING (is_admin());
CREATE POLICY "Admin Full Access" ON public.announcements FOR ALL USING (is_admin());
CREATE POLICY "Admin Full Access" ON public.student_exam_sessions FOR ALL USING (is_admin());
CREATE POLICY "Admin Full Access" ON public.student_answers FOR ALL USING (is_admin());

-- 4. STORAGE SETUP
-- -----------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public) VALUES ('question_assets', 'question_assets', true) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('config_assets', 'config_assets', true) ON CONFLICT DO NOTHING;

DO $$ 
BEGIN
    DROP POLICY IF EXISTS "Admin Manage Assets" ON storage.objects;
    DROP POLICY IF EXISTS "Public View Assets" ON storage.objects;
END $$;

CREATE POLICY "Admin Manage Assets" ON storage.objects FOR ALL TO authenticated USING (bucket_id IN ('question_assets', 'config_assets'));
CREATE POLICY "Public View Assets" ON storage.objects FOR SELECT TO anon USING (bucket_id IN ('question_assets', 'config_assets'));

-- 5. SEED INITIAL CONFIG
INSERT INTO public.app_config (id, school_name) VALUES (1, 'SMPN 2 DEPOK') ON CONFLICT DO NOTHING;

-- END: 01_CBT School Unified Setup.sql

-- =====================================================================
-- START: 02_Promote User to Admin and Update Name.sql
-- =====================================================================

UPDATE auth.users 
SET raw_user_meta_data = '{"is_admin": true, "full_name": "Administrator Utama"}' 
WHERE email = 'admin@cbtschool.com';

-- END: 02_Promote User to Admin and Update Name.sql

-- =====================================================================
-- START: 03_Patch Akses Token & Jadwal CBT.sql
-- =====================================================================


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

-- END: 03_Patch Akses Token & Jadwal CBT.sql

-- =====================================================================
-- START: 04_Token dan kebijakan RLS untuk tests & schedules.sql
-- =====================================================================

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

-- END: 04_Token dan kebijakan RLS untuk tests & schedules.sql

-- =====================================================================
-- START: 05_User Profile and Name Sync Repair.sql
-- =====================================================================


-- =================================================================
-- CBT SCHOOL: USER PROFILE & NAME SYNC REPAIR (ENTERPRISE GRADE)
-- Menangani masalah "Nama Belum Diatur" secara permanen
-- =================================================================

BEGIN;

-- 1. Perbarui Fungsi Trigger agar lebih fleksibel (Case Insensitive Metadata)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, username, full_name, nisn, class, major, gender, religion, photo_url)
  VALUES (
    new.id,
    new.email,
    -- Cek berbagai kemungkinan key metadata (full_name atau fullName)
    COALESCE(
      new.raw_user_meta_data ->> 'full_name', 
      new.raw_user_meta_data ->> 'fullName', 
      'Siswa Baru'
    ),
    COALESCE(new.raw_user_meta_data ->> 'nisn', split_part(new.email, '@', 1)),
    COALESCE(new.raw_user_meta_data ->> 'class', 'Belum diatur'),
    COALESCE(new.raw_user_meta_data ->> 'major', 'Belum diatur'),
    COALESCE(new.raw_user_meta_data ->> 'gender', 'Laki-laki'),
    COALESCE(new.raw_user_meta_data ->> 'religion', 'Islam'),
    COALESCE(
        new.raw_user_meta_data ->> 'photo_url', 
        new.raw_user_meta_data ->> 'photourl',
        'https://res.cloudinary.com/dt1nrarpq/image/upload/v1763714039/boy_cdad6k.png'
    )
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    updated_at = now();
  RETURN new;
END;
$$;

-- 2. Fungsi REPAIR: Memperbaiki user yang namanya masih placeholder
CREATE OR REPLACE FUNCTION public.repair_missing_names()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    updated_count int := 0;
BEGIN
    -- Update nama di public.users dari metadata di auth.users
    UPDATE public.users p
    SET 
        full_name = COALESCE(au.raw_user_meta_data ->> 'full_name', au.raw_user_meta_data ->> 'fullName'),
        updated_at = now()
    FROM auth.users au
    WHERE p.id = au.id 
    AND (p.full_name = 'Nama Belum Diatur' OR p.full_name IS NULL)
    AND (au.raw_user_meta_data ->> 'full_name' IS NOT NULL OR au.raw_user_meta_data ->> 'fullName' IS NOT NULL);

    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RETURN json_build_object('status', 'success', 'updated_records', updated_count);
END;
$$;

-- 3. Perkuat Fungsi Sync Utama (Update agar mengirim metadata yang konsisten)
CREATE OR REPLACE FUNCTION public.sync_all_users(users_data json)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  deleted_count int := 0;
  updated_count int := 0;
  inserted_count int := 0;
BEGIN
  IF NOT (SELECT auth.email() = 'admin@cbtschool.com') THEN
    RAISE EXCEPTION '403: Unauthorized';
  END IF;

  CREATE TEMP TABLE incoming_users (
    username text, password text, "fullName" text, nisn text, 
    class text, major text, gender text, religion text, "photoUrl" text
  ) ON COMMIT DROP;

  INSERT INTO incoming_users
  SELECT * FROM json_populate_recordset(null::incoming_users, users_data);
  
  -- Hapus user yang tidak ada di sheet
  WITH deleted_users AS (
    DELETE FROM auth.users
    WHERE email <> 'admin@cbtschool.com'
      AND id IN (
        SELECT u.id FROM public.users u
        WHERE u.nisn IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM incoming_users i WHERE i.nisn = u.nisn
        )
      )
    RETURNING *
  )
  SELECT count(*) INTO deleted_count FROM deleted_users;

  -- Update user lama (Metadata & Profile)
  WITH updated_rows AS (
    UPDATE public.users pu
    SET
      full_name = i."fullName",
      class = i.class,
      major = i.major,
      gender = i.gender,
      religion = i.religion,
      photo_url = i."photoUrl",
      updated_at = now()
    FROM incoming_users i
    WHERE pu.nisn = i.nisn
    RETURNING pu.id
  )
  SELECT count(*) INTO updated_count FROM updated_rows;

  -- Pastikan metadata di auth.users juga terupdate
  UPDATE auth.users au
  SET raw_user_meta_data = jsonb_build_object(
      'full_name', i."fullName",
      'nisn', i.nisn,
      'class', i.class,
      'major', i.major,
      'photo_url', i."photoUrl"
  )
  FROM incoming_users i
  WHERE au.email = i.nisn || '@smkn8sby.sch.id';

  -- Insert user baru
  WITH new_users AS (
    INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_user_meta_data, aud, role)
    SELECT
      uuid_generate_v4(),
      i.nisn || '@smkn8sby.sch.id',
      crypt(COALESCE(i.password, i.nisn), gen_salt('bf')),
      now(),
      jsonb_build_object(
          'full_name', i."fullName",
          'nisn', i.nisn,
          'class', i.class,
          'major', i.major,
          'photo_url', i."photoUrl"
      ),
      'authenticated',
      'authenticated'
    FROM incoming_users i
    WHERE NOT EXISTS (SELECT 1 FROM public.users pu WHERE pu.nisn = i.nisn)
    RETURNING *
  )
  SELECT count(*) INTO inserted_count FROM new_users;

  RETURN json_build_object(
    'deleted', deleted_count,
    'updated', updated_count,
    'inserted', inserted_count
  );
END;
$$;

COMMIT;

-- Eksekusi perbaikan langsung untuk data yang ada sekarang
SELECT public.repair_missing_names();

-- END: 05_User Profile and Name Sync Repair.sql

-- =====================================================================
-- START: 06_User Sync & Metadata Patch.sql
-- =====================================================================


-- =================================================================
-- CBT SCHOOL PATCH: FIX SYNC NULL ERROR & METADATA CONSISTENCY
-- Selesaikan masalah "null value in column full_name violates not-null constraint"
-- =================================================================

BEGIN;

-- 1. Perbarui Trigger handle_new_user agar lebih protektif
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_full_name TEXT;
    v_nisn TEXT;
BEGIN
    -- Ekstrak data dari metadata dengan fallback yang kuat
    v_full_name := COALESCE(
        new.raw_user_meta_data ->> 'full_name', 
        new.raw_user_meta_data ->> 'fullName',
        new.raw_user_meta_data ->> 'nama',
        'Siswa Baru'
    );
    
    v_nisn := COALESCE(
        new.raw_user_meta_data ->> 'nisn', 
        split_part(new.email, '@', 1),
        '0000000000'
    );

    INSERT INTO public.users (
        id, 
        username, 
        full_name, 
        nisn, 
        class, 
        major, 
        gender, 
        religion, 
        photo_url
    )
    VALUES (
        new.id,
        new.email,
        v_full_name,
        v_nisn,
        COALESCE(new.raw_user_meta_data ->> 'class', 'Belum diatur'),
        COALESCE(new.raw_user_meta_data ->> 'major', 'Belum diatur'),
        COALESCE(new.raw_user_meta_data ->> 'gender', 'Laki-laki'),
        COALESCE(new.raw_user_meta_data ->> 'religion', 'Islam'),
        COALESCE(new.raw_user_meta_data ->> 'photo_url', 'https://res.cloudinary.com/dt1nrarpq/image/upload/v1763714039/boy_cdad6k.png')
    )
    ON CONFLICT (id) DO UPDATE SET
        full_name = EXCLUDED.full_name,
        nisn = EXCLUDED.nisn,
        username = EXCLUDED.username,
        updated_at = now();

    RETURN new;
END;
$$;

-- 2. Perbarui Fungsi Sinkronisasi Utama (RPC)
CREATE OR REPLACE FUNCTION public.sync_all_users(users_data json)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  deleted_count int := 0;
  updated_count int := 0;
  inserted_count int := 0;
  test_record RECORD;
BEGIN
  -- Validasi akses admin
  IF NOT (SELECT auth.email() = 'admin@cbtschool.com') THEN
    RAISE EXCEPTION '403: Unauthorized';
  END IF;

  -- Gunakan tabel sementara dengan penamaan kolom yang sesuai format JSON Frontend
  CREATE TEMP TABLE incoming_sync_data (
    username text, 
    password text, 
    "fullName" text, -- Perhatikan penggunaan kutipan ganda agar case-sensitive sesuai JSON
    nisn text, 
    class text, 
    major text, 
    gender text, 
    religion text, 
    "photoUrl" text
  ) ON COMMIT DROP;

  INSERT INTO incoming_sync_data
  SELECT * FROM json_populate_recordset(null::incoming_sync_data, users_data);
  
  -- Hapus user yang tidak ada di sheet (kecuali admin)
  WITH deleted_users AS (
    DELETE FROM auth.users
    WHERE email <> 'admin@cbtschool.com'
      AND id IN (
        SELECT u.id FROM public.users u
        WHERE u.nisn IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM incoming_sync_data i WHERE i.nisn = u.nisn
        )
      )
    RETURNING *
  )
  SELECT count(*) INTO deleted_count FROM deleted_users;

  -- Update user lama (Metadata & Profile)
  -- Gunakan COALESCE untuk menjamin tidak ada NULL pada kolom NOT NULL
  WITH updated_rows AS (
    UPDATE public.users pu
    SET
      full_name = COALESCE(i."fullName", 'Tanpa Nama'),
      class = COALESCE(i.class, 'Tanpa Kelas'),
      major = COALESCE(i.major, 'Tanpa Jurusan'),
      gender = COALESCE(i.gender, 'Laki-laki'),
      religion = COALESCE(i.religion, 'Islam'),
      photo_url = i."photoUrl",
      updated_at = now()
    FROM incoming_sync_data i
    WHERE pu.nisn = i.nisn
    RETURNING pu.id
  )
  SELECT count(*) INTO updated_count FROM updated_rows;

  -- Pastikan metadata di auth.users juga terupdate agar konsisten saat login ulang
  UPDATE auth.users au
  SET raw_user_meta_data = jsonb_build_object(
      'full_name', COALESCE(i."fullName", 'Tanpa Nama'),
      'nisn', i.nisn,
      'class', COALESCE(i.class, 'Tanpa Kelas'),
      'major', COALESCE(i.major, 'Tanpa Jurusan'),
      'gender', COALESCE(i.gender, 'Laki-laki'),
      'photo_url', i."photoUrl"
  )
  FROM incoming_sync_data i
  WHERE au.email = i.nisn || '@smkn8sby.sch.id';

  -- Insert user baru
  WITH new_auth_entries AS (
    INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_user_meta_data, aud, role)
    SELECT
      uuid_generate_v4(),
      i.nisn || '@smkn8sby.sch.id',
      crypt(COALESCE(i.password, i.nisn), gen_salt('bf')),
      now(),
      jsonb_build_object(
          'full_name', COALESCE(i."fullName", 'Siswa Baru'),
          'nisn', i.nisn,
          'class', COALESCE(i.class, 'Tanpa Kelas'),
          'major', COALESCE(i.major, 'Tanpa Jurusan'),
          'gender', COALESCE(i.gender, 'Laki-laki'),
          'photo_url', i."photoUrl"
      ),
      'authenticated',
      'authenticated'
    FROM incoming_sync_data i
    WHERE NOT EXISTS (SELECT 1 FROM public.users pu WHERE pu.nisn = i.nisn)
    RETURNING *
  )
  SELECT count(*) INTO inserted_count FROM new_auth_entries;

  RETURN json_build_object(
    'deleted', deleted_count,
    'updated', updated_count,
    'inserted', inserted_count
  );
END;
$$;

COMMIT;

-- END: 06_User Sync & Metadata Patch.sql

-- =====================================================================
-- START: 07_Admin Mass-Delete Function.sql
-- =====================================================================


-- =================================================================
-- CBT SCHOOL PATCH: ADMIN MASS DELETE FUNCTION (ENTERPRISE GRADE)
-- Menghapus data secara aman dengan urutan integritas referensial
-- =================================================================

CREATE OR REPLACE FUNCTION public.admin_mass_delete(selected_modules json)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_users boolean := COALESCE((selected_modules->>'users')::boolean, false);
  v_tests boolean := COALESCE((selected_modules->>'tests')::boolean, false);
  v_master boolean := COALESCE((selected_modules->>'masterData')::boolean, false);
  v_announcements boolean := COALESCE((selected_modules->>'announcements')::boolean, false);
  v_schedules boolean := COALESCE((selected_modules->>'schedules')::boolean, false);
  
  deleted_info text := 'Penghapusan berhasil: ';
BEGIN
  -- 1. Validasi Otoritas Admin
  IF NOT (SELECT auth.email() = 'admin@cbtschool.com') THEN
    RAISE EXCEPTION '403: Unauthorized - Hanya Administrator Utama yang dapat melakukan ini.';
  END IF;

  -- 2. Proses Penghapusan (Urutan Berdasarkan Constraint)
  
  -- A. Hapus Jadwal (Jika dipilih secara spesifik)
  IF v_schedules AND NOT v_tests THEN
    DELETE FROM public.schedules;
    deleted_info := deleted_info || 'Jadwal, ';
  END IF;

  -- B. Hapus Bank Soal & Ujian (Menghapus Questions, Sessions, Answers via CASCADE)
  IF v_tests THEN
    TRUNCATE TABLE public.tests RESTART IDENTITY CASCADE;
    deleted_info := deleted_info || 'Bank Soal (Semua Soal & Sesi Ujian), ';
  END IF;

  -- C. Hapus Pengguna (Menghapus profil publik & akun auth)
  IF v_users THEN
    -- Hapus dari auth.users kecuali akun admin
    DELETE FROM auth.users WHERE email <> 'admin@cbtschool.com';
    deleted_info := deleted_info || 'Semua Pengguna Siswa, ';
  END IF;

  -- D. Hapus Data Master (Kelas & Jurusan)
  IF v_master THEN
    TRUNCATE TABLE public.master_classes RESTART IDENTITY CASCADE;
    TRUNCATE TABLE public.master_majors RESTART IDENTITY CASCADE;
    deleted_info := deleted_info || 'Data Master (Kelas & Jurusan), ';
  END IF;

  -- E. Hapus Pengumuman
  IF v_announcements THEN
    DELETE FROM public.announcements;
    deleted_info := deleted_info || 'Semua Pengumuman, ';
  END IF;

  -- Bersihkan teks output jika tidak ada yang dipilih
  IF deleted_info = 'Penghapusan berhasil: ' THEN
    RETURN 'Tidak ada modul yang dipilih untuk dihapus.';
  END IF;

  RETURN rtrim(deleted_info, ', ') || '.';
END;
$$;

-- END: 07_Admin Mass-Delete Function.sql

-- =====================================================================
-- START: 08_Dynamic Email Domain Migration Patch.sql
-- =====================================================================


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

-- END: 08_Dynamic Email Domain Migration Patch.sql

-- =====================================================================
-- START: 09_Sinkronisasi Pengguna dengan Domain Dinamis.sql
-- =====================================================================


-- =================================================================
-- CBT SCHOOL PATCH: DYNAMIC DOMAIN FOR SPREADSHEET SYNC
-- Pastikan proses sinkronisasi spreadsheet selalu menggunakan domain terbaru
-- =================================================================

CREATE OR REPLACE FUNCTION public.sync_all_users(users_data json)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  deleted_count int := 0;
  updated_count int := 0;
  inserted_count int := 0;
  v_active_domain text;
BEGIN
  -- 1. Ambil domain aktif dari konfigurasi
  SELECT email_domain INTO v_active_domain FROM public.app_config WHERE id = 1;
  
  -- Fallback jika domain kosong
  IF v_active_domain IS NULL THEN
    v_active_domain := '@smkn8sby.sch.id';
  END IF;

  -- Validasi akses admin
  IF NOT (SELECT auth.email() = 'admin@cbtschool.com') THEN
    RAISE EXCEPTION '403: Unauthorized';
  END IF;

  -- 2. Tabel sementara dengan penamaan kolom yang sesuai format JSON Frontend
  CREATE TEMP TABLE incoming_sync_data (
    username text, 
    password text, 
    "fullName" text,
    nisn text, 
    class text, 
    major text, 
    gender text, 
    religion text, 
    "photoUrl" text
  ) ON COMMIT DROP;

  INSERT INTO incoming_sync_data
  SELECT * FROM json_populate_recordset(null::incoming_sync_data, users_data);
  
  -- 3. Hapus user yang tidak ada di sheet (kecuali admin)
  WITH deleted_users AS (
    DELETE FROM auth.users
    WHERE email <> 'admin@cbtschool.com'
      AND id IN (
        SELECT u.id FROM public.users u
        WHERE u.nisn IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM incoming_sync_data i WHERE i.nisn = u.nisn
        )
      )
    RETURNING *
  )
  SELECT count(*) INTO deleted_count FROM deleted_users;

  -- 4. Update user lama (Metadata & Profile)
  -- Gunakan domain aktif untuk username
  WITH updated_rows AS (
    UPDATE public.users pu
    SET
      full_name = COALESCE(i."fullName", 'Tanpa Nama'),
      username = i.nisn || v_active_domain, -- Gunakan domain dinamis
      class = COALESCE(i.class, 'Tanpa Kelas'),
      major = COALESCE(i.major, 'Tanpa Jurusan'),
      gender = COALESCE(i.gender, 'Laki-laki'),
      religion = COALESCE(i.religion, 'Islam'),
      photo_url = i."photoUrl",
      updated_at = now()
    FROM incoming_sync_data i
    WHERE pu.nisn = i.nisn
    RETURNING pu.id
  )
  SELECT count(*) INTO updated_count FROM updated_rows;

  -- 5. Update metadata di auth.users agar konsisten
  UPDATE auth.users au
  SET email = i.nisn || v_active_domain, -- Gunakan domain dinamis
      raw_user_meta_data = jsonb_build_object(
      'full_name', COALESCE(i."fullName", 'Tanpa Nama'),
      'nisn', i.nisn,
      'class', COALESCE(i.class, 'Tanpa Kelas'),
      'major', COALESCE(i.major, 'Tanpa Jurusan'),
      'gender', COALESCE(i.gender, 'Laki-laki'),
      'photo_url', i."photoUrl"
  )
  FROM incoming_sync_data i
  WHERE au.id IN (SELECT id FROM public.users WHERE nisn = i.nisn);

  -- 6. Insert user baru
  WITH new_auth_entries AS (
    INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_user_meta_data, aud, role)
    SELECT
      uuid_generate_v4(),
      i.nisn || v_active_domain, -- Gunakan domain dinamis
      crypt(COALESCE(i.password, i.nisn), gen_salt('bf')),
      now(),
      jsonb_build_object(
          'full_name', COALESCE(i."fullName", 'Siswa Baru'),
          'nisn', i.nisn,
          'class', COALESCE(i.class, 'Tanpa Kelas'),
          'major', COALESCE(i.major, 'Tanpa Jurusan'),
          'gender', COALESCE(i.gender, 'Laki-laki'),
          'photo_url', i."photoUrl"
      ),
      'authenticated',
      'authenticated'
    FROM incoming_sync_data i
    WHERE NOT EXISTS (SELECT 1 FROM public.users pu WHERE pu.nisn = i.nisn)
    RETURNING *
  )
  SELECT count(*) INTO inserted_count FROM new_auth_entries;

  RETURN json_build_object(
    'deleted', deleted_count,
    'updated', updated_count,
    'inserted', inserted_count
  );
END;
$$;

-- END: 09_Sinkronisasi Pengguna dengan Domain Dinamis.sql

-- =====================================================================
-- START: 10_Branding Config Defaults & Public Read.sql
-- =====================================================================

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

-- END: 10_Branding Config Defaults & Public Read.sql

-- =====================================================================
-- START: 11_CBT School Patch â TKA 2026 Question Types.sql
-- =====================================================================


-- =================================================================
-- CBT SCHOOL PATCH V3: TKA 2026 QUESTION TYPES SUPPORT
-- =================================================================

BEGIN;

-- 1. Tambahkan Enum Tipe Soal (Opsional, menggunakan TEXT agar lebih fleksibel di frontend)
-- 2. Perbarui tabel questions
ALTER TABLE public.questions 
ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'multiple_choice',
ADD COLUMN IF NOT EXISTS weight INT DEFAULT 1,
ADD COLUMN IF NOT EXISTS answer_key JSONB,
ADD COLUMN IF NOT EXISTS metadata JSONB; -- Untuk menyimpan item menjodohkan (left/right lists)

-- 3. Migrasi Data Lama (PG Biasa)
UPDATE public.questions 
SET 
  answer_key = jsonb_build_object('index', correct_answer_index),
  type = 'multiple_choice'
WHERE answer_key IS NULL;

-- 4. Perbarui tabel jawaban siswa untuk mendukung format JSON
-- Menggunakan JSONB pada selected_answer_index (bisa angka tunggal, array, atau objek pasangan)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'student_answers'
      AND column_name = 'selected_answer_index'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'student_answers'
      AND column_name = 'legacy_index'
  ) THEN
    ALTER TABLE public.student_answers
    RENAME COLUMN selected_answer_index TO legacy_index;
  END IF;
END $$;

ALTER TABLE public.student_answers
ADD COLUMN IF NOT EXISTS student_answer JSONB;

-- 5. Berikan izin baru
GRANT ALL ON public.questions TO authenticated, service_role;
GRANT ALL ON public.student_answers TO anon, authenticated, service_role;

COMMIT;

-- END: 11_CBT School Patch â TKA 2026 Question Types.sql

-- =====================================================================
-- START: 12_Student Answer Data Integrity Patch.sql
-- =====================================================================


-- =================================================================
-- CBT SCHOOL PATCH V3.2: STUDENT ANSWER DATA INTEGRITY
-- =================================================================

BEGIN;

-- 1. Pastikan kolom student_answer mendukung JSONB secara fleksibel
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='student_answers' AND column_name='student_answer') THEN
        ALTER TABLE public.student_answers ADD COLUMN student_answer JSONB DEFAULT '{}'::jsonb;
    END IF;
END $$;

-- 2. Indexing untuk pencarian cepat saat monitoring oleh admin
CREATE INDEX IF NOT EXISTS idx_student_answers_session_id ON public.student_answers(session_id);
CREATE INDEX IF NOT EXISTS idx_student_answers_question_id ON public.student_answers(question_id);

-- 3. RLS Policy: Mengizinkan siswa melakukan UPSERT jawaban secara mandiri
DROP POLICY IF EXISTS "Students can manage own answers" ON public.student_answers;
CREATE POLICY "Students can manage own answers" ON public.student_answers 
FOR ALL USING (true)
WITH CHECK (true);

COMMIT;

-- END: 12_Student Answer Data Integrity Patch.sql

-- =====================================================================
-- START: 13_Advanced Question Types Patch 2026.sql
-- =====================================================================


-- =================================================================
-- CBT SCHOOL ENTERPRISE PATCH 2026: ADVANCED QUESTION TYPES
-- FOCUS: questions & student_answers structure
-- =================================================================

BEGIN;

-- 1. TRANSFORMASI TABEL QUESTIONS
-- Menambahkan kolom pendukung jika belum ada
ALTER TABLE public.questions 
ADD COLUMN IF NOT EXISTS weight INT DEFAULT 1,
ADD COLUMN IF NOT EXISTS answer_key JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- 2. NORMALISASI DATA LAMA (Mencegah Error "multiple_choice" masif)
-- Jika ada data lama yang 'type'-nya null atau salah, set ke multiple_choice
UPDATE public.questions 
SET type = 'multiple_choice' 
WHERE type IS NULL OR type = '';

-- Migrasi Kunci Jawaban Lama (Integer) ke format JSONB baru untuk kompatibilitas
UPDATE public.questions 
SET answer_key = jsonb_build_object('index', correct_answer_index)
WHERE (answer_key = '{}'::jsonb OR answer_key IS NULL) 
AND type = 'multiple_choice';

-- 3. UPGRADE TABEL JAWABAN SISWA (CRITICAL)
-- Tabel ini harus mendukung penyimpanan data non-integer (JSONB)
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='student_answers' AND column_name='student_answer') THEN
        ALTER TABLE public.student_answers ADD COLUMN student_answer JSONB DEFAULT '{}'::jsonb;
    END IF;
END $$;

-- 4. OPTIMASI RLS (Row Level Security)
-- Memastikan siswa bisa membaca metadata (penting untuk Menjodohkan)
DROP POLICY IF EXISTS "Public Read Questions" ON public.questions;
CREATE POLICY "Public Read Questions" ON public.questions 
FOR SELECT USING (true);

DROP POLICY IF EXISTS "Students can insert/update answers" ON public.student_answers;
CREATE POLICY "Students can insert/update answers" ON public.student_answers 
FOR ALL USING (true) 
WITH CHECK (true);

-- 5. FUNCTION UNTUK ADMIN: Memperbaiki Tipe Soal Secara Massal (Helper)
-- Contoh cara pakai: SELECT public.set_question_type(123, 'matching');
CREATE OR REPLACE FUNCTION public.set_question_type(q_id BIGINT, q_type TEXT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.questions SET type = q_type WHERE id = q_id;
END;
$$;

COMMIT;

-- LOG: Database schema upgraded to support TKA 2026 Standards.

-- END: 13_Advanced Question Types Patch 2026.sql

-- =====================================================================
-- START: 14_Anti-Cheat Support for student_exam_sessions.sql
-- =====================================================================


-- =================================================================
-- PATCH: ANTI CHEAT SUPPORT
-- Jalankan script ini di SQL Editor Supabase
-- =================================================================

BEGIN;

-- 1. Tambahkan kolom 'violations' untuk melacak jumlah kecurangan
ALTER TABLE public.student_exam_sessions 
ADD COLUMN IF NOT EXISTS violations INT DEFAULT 0;

-- 2. Pastikan enum/check constraint status mendukung 'Diskualifikasi'
-- (Jika constraint sudah ada, kita drop dulu untuk memastikan update)
ALTER TABLE public.student_exam_sessions 
DROP CONSTRAINT IF EXISTS student_exam_sessions_status_check;

ALTER TABLE public.student_exam_sessions 
ADD CONSTRAINT student_exam_sessions_status_check 
CHECK (status IN ('Mengerjakan', 'Selesai', 'Diskualifikasi'));

COMMIT;

-- Konfirmasi
SELECT 'Database ready for Anti-Cheat System' as status;

-- END: 14_Anti-Cheat Support for student_exam_sessions.sql

-- =====================================================================
-- START: 15_Keep-alive Cron Heartbeat.sql
-- =====================================================================


-- =================================================================
-- MODUL: DATABASE KEEP-ALIVE (CRON JOB)
-- Jalankan script ini di SQL Editor Supabase
-- Tujuan: Mencegah database 'pausing' dan menjaga performa tetap cepat
-- =================================================================

-- 1. Pastikan ekstensi pg_cron aktif
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 2. Berikan izin akses ke schema cron (diperlukan agar job bisa jalan)
GRANT USAGE ON SCHEMA cron TO postgres;

-- 3. Hapus jadwal lama dengan nama yang sama (Clean up sebelum install)
-- Menggunakan DO block untuk menangani error jika job belum ada
DO $$
BEGIN
    PERFORM cron.unschedule('keep-alive-heartbeat');
EXCEPTION WHEN OTHERS THEN
    -- Abaikan error jika job tidak ditemukan
END $$;

-- 4. Jadwalkan Job Baru (Setiap 3 Menit)
-- Syntax: cron.schedule(job_name, cron_expression, sql_command)
-- '*/3 * * * *' artinya: Every 3 minutes
SELECT cron.schedule(
  'keep-alive-heartbeat', -- Nama Job unik
  '*/3 * * * *',          -- Jadwal Cron
  $$
    DO BEGIN
      -- A. Query ringan ke tabel config (Menjaga koneksi disk tetap aktif)
      PERFORM id FROM public.app_config LIMIT 1;
      
      -- B. Query hitung user (Menjaga index user tetap di RAM/Cache)
      PERFORM count(*) FROM public.users;
      
      -- C. Query ping sederhana
      PERFORM 1;
    END $$
);

-- 5. Konfirmasi: Tampilkan daftar job yang aktif
SELECT jobid, jobname, schedule, command, active FROM cron.job;

-- END: 15_Keep-alive Cron Heartbeat.sql

-- =====================================================================
-- START: 16_TKA 2026 Schema Migration (Questions & Answers).sql
-- =====================================================================


-- =================================================================
-- SQL FULL FIX: SUPPORT TKA 2026 (REVISI DATA CLEANING)
-- Menyelaraskan database dengan format Frontend (huruf kecil)
-- =================================================================

BEGIN;

-- 1. Pastikan ekstensi aktif
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Tambahkan kolom jika belum ada
ALTER TABLE public.questions
ADD COLUMN IF NOT EXISTS type text DEFAULT 'multiple_choice',
ADD COLUMN IF NOT EXISTS matching_right_options text[],
ADD COLUMN IF NOT EXISTS answer_key jsonb,
ADD COLUMN IF NOT EXISTS audio_url text,
ADD COLUMN IF NOT EXISTS video_url text,
ADD COLUMN IF NOT EXISTS cognitive_level text DEFAULT 'L1',
ADD COLUMN IF NOT EXISTS weight numeric DEFAULT 1;

-- 3. PERBAIKAN DATA (DATA CLEANING) - PENTING!
-- Ubah semua format lama/kapital menjadi format internal sistem (lowercase snake_case)
-- agar sesuai dengan types.ts di frontend
UPDATE public.questions SET type = 'multiple_choice' WHERE type IN ('SINGLE', 'Single', 'single', 'PG');
UPDATE public.questions SET type = 'complex_multiple_choice' WHERE type IN ('MULTIPLE', 'Multiple', 'multiple', 'COMPLEX');
UPDATE public.questions SET type = 'matching' WHERE type IN ('MATCHING', 'Matching', 'JODOHKAN');
UPDATE public.questions SET type = 'essay' WHERE type IN ('ESSAY', 'Essay', 'URAIAN');

-- Set default jika ada yang null atau ngawur
UPDATE public.questions SET type = 'multiple_choice' 
WHERE type IS NULL OR type NOT IN ('multiple_choice', 'complex_multiple_choice', 'matching', 'essay');

-- 4. Terapkan Constraint Baru (Sekarang aman karena data sudah bersih)
ALTER TABLE public.questions DROP CONSTRAINT IF EXISTS questions_type_check;
ALTER TABLE public.questions ADD CONSTRAINT questions_type_check 
  CHECK (type IN ('multiple_choice', 'complex_multiple_choice', 'matching', 'essay'));

-- 5. Komentar kolom
COMMENT ON COLUMN public.questions.type IS 'Tipe soal: multiple_choice, complex_multiple_choice, matching, essay';

-- 6. Update tabel student_answers
ALTER TABLE public.student_answers
ADD COLUMN IF NOT EXISTS answer_value jsonb;

COMMIT;

-- 7. Refresh schema cache
NOTIFY pgrst, 'reload config';

-- Konfirmasi
SELECT type, count(*) as jumlah FROM public.questions GROUP BY type;

-- END: 16_TKA 2026 Schema Migration (Questions & Answers).sql

-- =====================================================================
-- START: 17_Perbaikan Tipe Soal (Manual & Otomatis).sql
-- =====================================================================


-- =================================================================
-- SQL SCRIPT: PERBAIKAN TIPE SOAL (MANUAL & OTOMATIS)
-- Jalankan blok kode yang Anda butuhkan di SQL Editor Supabase.
-- =================================================================

-- -----------------------------------------------------------------
-- BAGIAN 1: CEK DATA (DIAGNOSA)
-- Lihat data soal terbaru untuk mengetahui ID mana yang salah tipe.
-- -----------------------------------------------------------------
SELECT 
    id, 
    type, 
    left(question, 40) as pertanyaaan, 
    jsonb_typeof(answer_key) as tipe_kunci_jawaban,
    answer_key
FROM public.questions 
ORDER BY id DESC 
LIMIT 20;


-- -----------------------------------------------------------------
-- BAGIAN 2: UPDATE MANUAL (PER ID) - PALING AMAN
-- Ganti angka 'ID_SOAL' dengan ID yang Anda lihat di hasil BAGIAN 1.
-- -----------------------------------------------------------------

-- A. Ubah menjadi ESSAY
/*
UPDATE public.questions 
SET type = 'essay' 
WHERE id = 123; -- Ganti 123 dengan ID Soal Essay Anda
*/

-- B. Ubah menjadi PG KOMPLEKS (Pilihan Ganda Lebih dari 1)
/*
UPDATE public.questions 
SET type = 'complex_multiple_choice' 
WHERE id = 124; -- Ganti 124 dengan ID Soal PG Kompleks Anda
*/

-- C. Ubah menjadi MENJODOHKAN
/*
UPDATE public.questions 
SET type = 'matching' 
WHERE id = 125; -- Ganti 125 dengan ID Soal Menjodohkan Anda
*/


-- -----------------------------------------------------------------
-- BAGIAN 3: UPDATE OTOMATIS (SMART DETECTION)
-- Jalankan ini jika Anda ingin sistem menebak tipe soal 
-- berdasarkan bentuk kunci jawabannya.
-- -----------------------------------------------------------------

BEGIN;

-- 1. Deteksi MENJODOHKAN
-- Jika punya opsi kanan (matching_right_options), ubah ke 'matching'
UPDATE public.questions
SET type = 'matching'
WHERE matching_right_options IS NOT NULL 
  AND cardinality(matching_right_options) > 0;

-- 2. Deteksi PG KOMPLEKS
-- Jika kunci jawaban berupa Array JSON (misal: [0, 2]), ubah ke 'complex_multiple_choice'
UPDATE public.questions
SET type = 'complex_multiple_choice'
WHERE jsonb_typeof(answer_key) = 'array';

-- 3. Deteksi ESSAY
-- Jika kunci jawaban berupa String Teks (misal: "Soekarno"), ubah ke 'essay'
-- Kita tambahkan filter panjang > 1 agar tidak tertukar dengan kunci jawaban "A" atau "B"
UPDATE public.questions
SET type = 'essay'
WHERE jsonb_typeof(answer_key) = 'string'
  AND length(answer_key::text) > 3 
  AND answer_key::text !~ '^[0-9]+$'; -- Pastikan bukan angka string

-- 4. Deteksi PG BIASA (Default)
-- Jika kunci jawaban berupa Object {index: ...} atau Integer, pastikan 'multiple_choice'
UPDATE public.questions
SET type = 'multiple_choice'
WHERE jsonb_typeof(answer_key) = 'object' 
   OR jsonb_typeof(answer_key) = 'number';

COMMIT;

-- -----------------------------------------------------------------
-- BAGIAN 4: KONFIRMASI HASIL
-- -----------------------------------------------------------------
SELECT type, count(*) as jumlah_soal 
FROM public.questions 
GROUP BY type;

-- END: 17_Perbaikan Tipe Soal (Manual & Otomatis).sql

-- =====================================================================
-- START: 18_Enable Realtime Monitoring for Student Exam Sessions.sql
-- =====================================================================


-- =================================================================
-- ENABLE REALTIME MONITORING
-- Jalankan script ini agar Admin bisa melihat progres siswa secara live
-- =================================================================

BEGIN;

-- 1. Ubah identitas replikasi tabel menjadi FULL
-- Ini memastikan saat ada UPDATE, frontend menerima data baris lengkap
ALTER TABLE public.student_exam_sessions REPLICA IDENTITY FULL;

-- 2. Tambahkan tabel ke publikasi 'supabase_realtime'
-- Supabase secara default menggunakan publikasi ini untuk fitur realtime
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'student_exam_sessions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.student_exam_sessions;
  END IF;
END $$;

COMMIT;

-- Konfirmasi
SELECT 'Realtime Monitoring Enabled for Exams' as status;

-- END: 18_Enable Realtime Monitoring for Student Exam Sessions.sql

-- =====================================================================
-- START: 19_Single-Device Authentication System.sql
-- =====================================================================


-- =================================================================
-- MODUL: SINGLE DEVICE AUTHENTICATION SYSTEM
-- Jalankan script ini di SQL Editor Supabase
-- =================================================================

BEGIN;

-- 1. Tambahkan kolom pelacakan perangkat di tabel users
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS active_device_id TEXT,
ADD COLUMN IF NOT EXISTS last_device_info JSONB,
ADD COLUMN IF NOT EXISTS is_login_active BOOLEAN DEFAULT FALSE;

-- 2. Fungsi: Verifikasi dan Kunci Perangkat (Dipanggil saat Siswa Login)
CREATE OR REPLACE FUNCTION public.verify_and_lock_device(
  p_nisn text,
  p_device_id text,
  p_device_info jsonb
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_user_id uuid;
  v_stored_device_id text;
  v_is_active boolean;
BEGIN
  -- Ambil data user
  SELECT id, active_device_id, is_login_active 
  INTO v_user_id, v_stored_device_id, v_is_active
  FROM public.users 
  WHERE nisn = p_nisn;

  IF v_user_id IS NULL THEN
    RETURN json_build_object('status', 'error', 'message', 'User tidak ditemukan');
  END IF;

  -- Logika Kunci Perangkat
  IF v_stored_device_id IS NULL OR v_stored_device_id = '' THEN
    -- Kasus 1: Login Pertama (Belum ada device terikat) -> Bind Device
    UPDATE public.users 
    SET active_device_id = p_device_id,
        last_device_info = p_device_info,
        is_login_active = true,
        updated_at = now()
    WHERE id = v_user_id;
    
    RETURN json_build_object('status', 'success', 'message', 'Device Bound');

  ELSIF v_stored_device_id = p_device_id THEN
    -- Kasus 2: Device Cocok -> Izinkan & Update timestamp
    UPDATE public.users 
    SET is_login_active = true,
        updated_at = now()
    WHERE id = v_user_id;
    
    RETURN json_build_object('status', 'success', 'message', 'Device Match');

  ELSE
    -- Kasus 3: Device Tidak Cocok -> Blokir
    RETURN json_build_object(
        'status', 'locked', 
        'message', 'Akun sedang aktif di perangkat lain. Minta Reset Login ke Pengawas.'
    );
  END IF;
END;
$$;

-- 3. Fungsi: Admin Reset Login (Melepas Kunci Perangkat)
CREATE OR REPLACE FUNCTION public.admin_reset_device_login(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Validasi Admin (Opsional, lebih aman dicek di RLS/App level juga)
  IF NOT (SELECT auth.email() = 'admin@cbtschool.com') THEN
    RAISE EXCEPTION '403: Forbidden';
  END IF;

  -- Reset Device ID dan Status Login
  UPDATE public.users
  SET active_device_id = NULL,
      is_login_active = FALSE,
      last_device_info = NULL
  WHERE id = p_user_id;
  
  -- Opsional: Hapus sesi ujian jika perlu (Uncomment jika ingin reset ujian juga)
  -- DELETE FROM public.student_exam_sessions WHERE user_id = p_user_id;
END;
$$;

COMMIT;

-- Konfirmasi
SELECT 'Single Device Auth System Installed' as status;

-- END: 19_Single-Device Authentication System.sql

-- =====================================================================
-- START: 20_Restore Admin Role.sql
-- =====================================================================


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

-- END: 20_Restore Admin Role.sql

-- =====================================================================
-- START: 21_Admin Mass Delete Function.sql
-- =====================================================================


-- =================================================================
-- FIX_MASS_DELETE_SAFE.sql
-- PERBAIKAN ERROR "DELETE requires a WHERE clause"
-- Jalankan script ini di SQL Editor Supabase
-- =================================================================

CREATE OR REPLACE FUNCTION public.admin_mass_delete(selected_modules json)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER -- Berjalan dengan hak akses superuser (diperlukan untuk akses auth.users)
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_users boolean := COALESCE((selected_modules->>'users')::boolean, false);
  v_tests boolean := COALESCE((selected_modules->>'tests')::boolean, false);
  v_master boolean := COALESCE((selected_modules->>'masterData')::boolean, false);
  v_announcements boolean := COALESCE((selected_modules->>'announcements')::boolean, false);
  v_schedules boolean := COALESCE((selected_modules->>'schedules')::boolean, false);
  
  deleted_info text := 'Penghapusan berhasil: ';
BEGIN
  -- 1. Validasi Otoritas Admin
  IF NOT (SELECT auth.email() = 'admin@cbtschool.com') THEN
    RAISE EXCEPTION '403: Unauthorized - Hanya Administrator Utama yang dapat melakukan ini.';
  END IF;

  -- 2. Proses Penghapusan (Urutan Berdasarkan Constraint)
  
  -- A. Hapus Jadwal (Jika dipilih secara spesifik)
  IF v_schedules AND NOT v_tests THEN
    -- FIX: Tambahkan WHERE id IS NOT NULL untuk bypass error safe update
    DELETE FROM public.schedules WHERE id IS NOT NULL;
    deleted_info := deleted_info || 'Jadwal, ';
  END IF;

  -- B. Hapus Bank Soal & Ujian (Menghapus Questions, Sessions, Answers via CASCADE)
  IF v_tests THEN
    TRUNCATE TABLE public.tests RESTART IDENTITY CASCADE;
    deleted_info := deleted_info || 'Bank Soal (Semua Soal & Sesi Ujian), ';
  END IF;

  -- C. Hapus Pengguna (Menghapus profil publik & akun auth)
  IF v_users THEN
    -- Hapus dari auth.users kecuali akun admin
    -- Query ini sudah aman karena ada WHERE clause
    DELETE FROM auth.users WHERE email <> 'admin@cbtschool.com'; 
    deleted_info := deleted_info || 'Semua Pengguna Siswa, ';
  END IF;

  -- D. Hapus Data Master (Kelas & Jurusan)
  IF v_master THEN
    TRUNCATE TABLE public.master_classes RESTART IDENTITY CASCADE;
    TRUNCATE TABLE public.master_majors RESTART IDENTITY CASCADE;
    deleted_info := deleted_info || 'Data Master (Kelas & Jurusan), ';
  END IF;

  -- E. Hapus Pengumuman
  IF v_announcements THEN
    -- FIX: Tambahkan WHERE id IS NOT NULL
    DELETE FROM public.announcements WHERE id IS NOT NULL;
    deleted_info := deleted_info || 'Semua Pengumuman, ';
  END IF;

  -- Bersihkan teks output jika tidak ada yang dipilih
  IF deleted_info = 'Penghapusan berhasil: ' THEN
    RETURN 'Tidak ada modul yang dipilih untuk dihapus.';
  END IF;

  RETURN rtrim(deleted_info, ', ') || '.';
END;
$$;

SELECT 'Fungsi Hapus Data Massal Berhasil Diperbaiki (Safe Update Bypass).' as status;

-- END: 21_Admin Mass Delete Function.sql

-- =====================================================================
-- START: 22_Add school metadata to app_config.sql
-- =====================================================================


-- =================================================================
-- MODUL: PENDUKUNG FITUR CETAK DOKUMEN ADMINISTRASI
-- Menambahkan metadata sekolah untuk KOP Surat (Berita Acara)
-- =================================================================

BEGIN;

-- 1. Tambahkan kolom detail sekolah ke tabel app_config
ALTER TABLE public.app_config
ADD COLUMN IF NOT EXISTS school_address TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS school_district TEXT DEFAULT 'KABUPATEN',
ADD COLUMN IF NOT EXISTS school_code TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS region_code TEXT DEFAULT '';

-- 2. Berikan komentar untuk dokumentasi
COMMENT ON COLUMN public.app_config.school_address IS 'Alamat lengkap sekolah untuk KOP surat';
COMMENT ON COLUMN public.app_config.school_district IS 'Nama Kabupaten/Kota (misal: KAB. DEMAK)';
COMMENT ON COLUMN public.app_config.school_code IS 'Kode Sekolah/Madrasah (misal: 0114)';
COMMENT ON COLUMN public.app_config.region_code IS 'Kode Wilayah/Rayon (misal: 06)';

COMMIT;

-- 3. Refresh schema cache agar API Supabase mendeteksi kolom baru
NOTIFY pgrst, 'reload config';

-- Konfirmasi
SELECT 'Tabel konfigurasi berhasil diperbarui dengan kolom detail sekolah.' as status;

-- END: 22_Add school metadata to app_config.sql

-- =====================================================================
-- START: 23_Perbaikan Login Admin via QR.sql
-- =====================================================================


-- =================================================================
-- FIX_ADMIN_QR_LOGIN.sql
-- PERBAIKAN TOTAL: LOGIN ADMIN VIA SCAN QR
-- 1. Mengisi qr_login_password admin agar bisa login.
-- 2. Membuat RPC untuk lookup password berdasarkan UUID dari QR.
-- =================================================================

BEGIN;

-- 1. Pastikan ekstensi enkripsi aktif
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Pastikan kolom pendukung ada
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS qr_login_password TEXT;

-- 3. FUNGSI RPC: GET ADMIN PASSWORD BY UUID (Smart Lookup)
-- Fungsi ini dipanggil frontend saat QR discan. 
-- Input: UUID dari QR. Output: Password text (untuk dipakai login client-side).
CREATE OR REPLACE FUNCTION public.get_admin_password_by_uuid(p_uuid text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER -- Berjalan sebagai superuser untuk bypass RLS
SET search_path = public, extensions
AS $$
DECLARE
  v_password text;
  v_uuid uuid;
BEGIN
  -- Validasi format UUID
  BEGIN
    v_uuid := p_uuid::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN NULL;
  END;

  -- Cari user dengan ID tersebut dan pastikan dia ADMIN
  SELECT 
    COALESCE(qr_login_password, password_text, 'admin123') INTO v_password
  FROM public.users
  WHERE id = v_uuid 
    AND (role = 'admin' OR username = 'admin@cbtschool.com');
    
  RETURN v_password;
END;
$$;

-- 4. UPDATE DATA ADMIN (TARGET SPESIFIK UUID DARI PDF)
-- UUID dari Log: 452c8ad0-5823-4523-aa8e-53e5fe86a0bb
DO $$
DECLARE
  v_admin_uuid uuid := '452c8ad0-5823-4523-aa8e-53e5fe86a0bb';
  v_admin_email text := 'admin@cbtschool.com';
  v_password_fix text := 'admin123'; -- Password fallback yang pasti jalan
BEGIN
  
  -- A. Pastikan Admin dengan UUID ini ada di public.users
  -- Jika ID admin sekarang beda, kita update ID-nya agar sesuai QR PDF
  -- (Hati-hati: ini mengubah ID admin yang sedang aktif jika ada)
  
  -- Normalisasi konflik unik agar idempotent (username/email admin bisa sudah ada dari patch sebelumnya)
  DELETE FROM public.users
  WHERE username = v_admin_email
    AND id <> v_admin_uuid;

  DELETE FROM auth.identities ai
  USING auth.users au
  WHERE ai.user_id = au.id
    AND au.email = v_admin_email
    AND au.id <> v_admin_uuid;

  DELETE FROM auth.users
  WHERE email = v_admin_email
    AND id <> v_admin_uuid;

  -- B. UPDATE AUTH.USERS (SISTEM LOGIN)
  -- Kita harus memastikan akun auth untuk UUID ini ada dan passwordnya 'admin123'
  IF EXISTS (SELECT 1 FROM auth.users WHERE id = v_admin_uuid) THEN
      UPDATE auth.users 
      SET encrypted_password = crypt(v_password_fix, gen_salt('bf')),
          email = v_admin_email,
          email_confirmed_at = now(),
          raw_user_meta_data = jsonb_build_object('role', 'admin', 'full_name', 'Administrator'),
          updated_at = now()
      WHERE id = v_admin_uuid;
  ELSE
      -- Jika user auth dengan UUID ini belum ada, buat baru
      INSERT INTO auth.users (
        id, instance_id, email, encrypted_password, email_confirmed_at, 
        raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at
      ) VALUES (
        v_admin_uuid,
        '00000000-0000-0000-0000-000000000000',
        v_admin_email,
        crypt(v_password_fix, gen_salt('bf')),
        now(),
        '{"provider": "email", "providers": ["email"]}'::jsonb,
        '{"role": "admin", "full_name": "Administrator"}'::jsonb,
        'authenticated', 'authenticated', now(), now()
      );
  END IF;

  -- C. UPSERT public.users setelah auth.users siap (menghindari FK violation)
  INSERT INTO public.users (id, username, full_name, role, qr_login_password, gender)
  VALUES (v_admin_uuid, v_admin_email, 'Administrator Utama', 'admin', v_password_fix, 'Laki-laki')
  ON CONFLICT (id) DO UPDATE SET
    qr_login_password = v_password_fix,
    role = 'admin',
    username = v_admin_email,
    full_name = 'Administrator Utama';

END $$;

COMMIT;

-- 5. Berikan izin eksekusi RPC ke public (anon)
GRANT EXECUTE ON FUNCTION public.get_admin_password_by_uuid(text) TO anon, authenticated, service_role;

SELECT 'Sukses! Admin QR Fix Applied via RPC & Data Sync.' as status;

-- END: 23_Perbaikan Login Admin via QR.sql

-- =====================================================================
-- START: 24_Reset Admin Credentials.sql
-- =====================================================================


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

-- END: 24_Reset Admin Credentials.sql

-- =====================================================================
-- START: 25_Konfigurasi pengacakan soal dan jawaban.sql
-- =====================================================================


-- =================================================================
-- MODUL: PENAMBAHAN FITUR ACAK SOAL & JAWABAN
-- Jalankan script ini di SQL Editor Supabase
-- =================================================================

BEGIN;

-- 1. Tambahkan kolom untuk konfigurasi pengacakan
ALTER TABLE public.tests
ADD COLUMN IF NOT EXISTS randomize_questions BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS randomize_answers BOOLEAN DEFAULT FALSE;

-- 2. Berikan komentar untuk dokumentasi
COMMENT ON COLUMN public.tests.randomize_questions IS 'Apakah urutan soal diacak untuk siswa?';
COMMENT ON COLUMN public.tests.randomize_answers IS 'Apakah urutan opsi jawaban (A,B,C,D,E) diacak?';

COMMIT;

-- 3. Refresh schema cache
NOTIFY pgrst, 'reload config';

-- Konfirmasi
SELECT 'Kolom randomize_questions dan randomize_answers berhasil ditambahkan.' as status;

-- END: 25_Konfigurasi pengacakan soal dan jawaban.sql

-- =====================================================================
-- START: 26_Add School Contact Fields for Letterhead.sql
-- =====================================================================


-- =================================================================
-- MODUL: UPDATE KELENGKAPAN KOP SURAT
-- Jalankan script ini di SQL Editor Supabase
-- =================================================================

BEGIN;

-- 1. Tambahkan kolom kontak ke tabel app_config
ALTER TABLE public.app_config
ADD COLUMN IF NOT EXISTS school_phone TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS school_email TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS school_website TEXT DEFAULT '';

-- 2. Berikan komentar
COMMENT ON COLUMN public.app_config.school_phone IS 'Nomor Telepon Sekolah untuk KOP';
COMMENT ON COLUMN public.app_config.school_email IS 'Email Sekolah untuk KOP';
COMMENT ON COLUMN public.app_config.school_website IS 'Website Sekolah untuk KOP';

COMMIT;

-- 3. Refresh cache
NOTIFY pgrst, 'reload config';

SELECT 'Tabel app_config berhasil diperbarui dengan data kontak.' as status;

-- END: 26_Add School Contact Fields for Letterhead.sql

-- =====================================================================
-- START: 27_Add Letterhead Header Columns to app_config.sql
-- =====================================================================


-- =================================================================
-- MODUL: UPDATE KONFIGURASI KOP SURAT (HEADER GLOBAL)
-- Menambahkan kolom untuk Header 1 dan Header 2 KOP Surat
-- =================================================================

BEGIN;

-- 1. Tambahkan kolom header KOP ke tabel app_config
ALTER TABLE public.app_config
ADD COLUMN IF NOT EXISTS kop_header1 TEXT DEFAULT 'PEMERINTAH PROVINSI JAWA TIMUR',
ADD COLUMN IF NOT EXISTS kop_header2 TEXT DEFAULT 'DINAS PENDIDIKAN';

-- 2. Berikan komentar
COMMENT ON COLUMN public.app_config.kop_header1 IS 'Baris pertama KOP Surat (misal: PEMERINTAH KABUPATEN...)';
COMMENT ON COLUMN public.app_config.kop_header2 IS 'Baris kedua KOP Surat (misal: DINAS PENDIDIKAN DAN KEBUDAYAAN)';

COMMIT;

-- 3. Refresh cache
NOTIFY pgrst, 'reload config';

SELECT 'Tabel app_config berhasil diperbarui dengan kolom Header KOP.' as status;

-- END: 27_Add Letterhead Header Columns to app_config.sql

-- =====================================================================
-- START: 28_Perbaiki Nilai Default Kop Surat.sql
-- =====================================================================


-- =================================================================
-- FIX_DEFAULT_KOP.sql
-- Memastikan konfigurasi KOP Surat memiliki nilai default yang valid
-- Jalankan ini agar fitur cetak tidak menampilkan data kosong.
-- =================================================================

UPDATE public.app_config
SET 
    kop_header1 = COALESCE(NULLIF(kop_header1, ''), 'PEMERINTAH PROVINSI JAWA TENGAH'),
    kop_header2 = COALESCE(NULLIF(kop_header2, ''), 'DINAS PENDIDIKAN DAN KEBUDAYAAN'),
    school_name = COALESCE(NULLIF(school_name, ''), 'SEKOLAH MENENGAH PERTAMA NEGERI'),
    school_address = COALESCE(NULLIF(school_address, ''), 'Jl. Pendidikan No. 1'),
    school_district = COALESCE(NULLIF(school_district, ''), 'KABUPATEN DEMAK'),
    school_code = COALESCE(NULLIF(school_code, ''), '203xxxxx')
WHERE id = 1;

-- Konfirmasi
SELECT school_name, kop_header1, kop_header2 FROM public.app_config;

-- END: 28_Perbaiki Nilai Default Kop Surat.sql

-- =====================================================================
-- START: 29_Ensure School Letterhead Configuration.sql
-- =====================================================================


-- =================================================================
-- FIX_PRINT_CONFIG.sql
-- Memastikan kolom konfigurasi sekolah lengkap untuk fitur KOP Surat
-- =================================================================

-- 1. Tambahkan kolom jika belum ada
ALTER TABLE public.app_config 
ADD COLUMN IF NOT EXISTS school_address TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS school_district TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS school_phone TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS school_email TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS school_website TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS kop_header1 TEXT DEFAULT 'PEMERINTAH PROVINSI JAWA TENGAH',
ADD COLUMN IF NOT EXISTS kop_header2 TEXT DEFAULT 'DINAS PENDIDIKAN DAN KEBUDAYAAN';

-- 2. Pastikan ada data default minimal di row pertama
INSERT INTO public.app_config (id, school_name)
VALUES (1, 'SEKOLAH MENENGAH PERTAMA NEGERI')
ON CONFLICT (id) DO UPDATE SET 
    kop_header1 = COALESCE(NULLIF(public.app_config.kop_header1, ''), 'PEMERINTAH PROVINSI'),
    kop_header2 = COALESCE(NULLIF(public.app_config.kop_header2, ''), 'DINAS PENDIDIKAN');

-- Konfirmasi
SELECT school_name, kop_header1, kop_header2 FROM public.app_config WHERE id = 1;

-- END: 29_Ensure School Letterhead Configuration.sql

-- =====================================================================
-- START: 30_Ensure App Config Columns & Admin Access.sql
-- =====================================================================


-- =================================================================
-- FIX_CONFIG_PERSISTENCE.sql
-- TUJUAN: Memastikan tabel app_config memiliki semua kolom KOP Surat
--         agar data dari menu Konfigurasi bisa tersimpan permanen.
-- =================================================================

BEGIN;

-- 1. Tambahkan kolom jika belum ada (Safe Migration)
ALTER TABLE public.app_config 
ADD COLUMN IF NOT EXISTS school_address TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS school_district TEXT DEFAULT 'KABUPATEN',
ADD COLUMN IF NOT EXISTS school_code TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS region_code TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS school_phone TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS school_email TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS school_website TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS kop_header1 TEXT DEFAULT 'PEMERINTAH PROVINSI',
ADD COLUMN IF NOT EXISTS kop_header2 TEXT DEFAULT 'DINAS PENDIDIKAN',
ADD COLUMN IF NOT EXISTS default_paper_size TEXT DEFAULT 'A4';

-- 2. Pastikan Row ID=1 Ada (Untuk update)
INSERT INTO public.app_config (id, school_name)
VALUES (1, 'SEKOLAH MENENGAH KEJURUAN')
ON CONFLICT (id) DO NOTHING;

-- 3. Berikan Izin Akses (RLS) agar Admin bisa UPDATE
-- Pastikan Admin bisa mengubah konfigurasi
DROP POLICY IF EXISTS "Admin can update config" ON public.app_config;
CREATE POLICY "Admin can update config" ON public.app_config 
FOR UPDATE 
USING (auth.email() = 'admin@cbtschool.com'); -- Atau sesuaikan dengan fungsi is_admin()

-- 4. Refresh Cache Schema Supabase
NOTIFY pgrst, 'reload config';

COMMIT;

-- Verifikasi Struktur Tabel
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'app_config';

-- END: 30_Ensure App Config Columns & Admin Access.sql

-- =====================================================================
-- START: 31_Add default paper size to app_config.sql
-- =====================================================================


-- =================================================================
-- FITUR: OPSI UKURAN KERTAS CETAK KARTU
-- Jalankan script ini di SQL Editor Supabase
-- =================================================================

-- 1. Tambahkan kolom default_paper_size ke tabel app_config
ALTER TABLE public.app_config 
ADD COLUMN IF NOT EXISTS default_paper_size text DEFAULT 'A4';

COMMENT ON COLUMN public.app_config.default_paper_size IS 'Ukuran kertas default untuk cetak (A4, F4, Letter, Legal)';

-- Konfirmasi
SELECT 'Kolom default_paper_size berhasil ditambahkan.' as status;

-- END: 31_Add default paper size to app_config.sql

-- =====================================================================
-- START: 32_Add default paper size to app_config.sql
-- =====================================================================


-- =================================================================
-- SQL_FIX_PRINT_CONFIG_FINAL.sql
-- Menambahkan konfigurasi default ukuran kertas jika belum ada
-- =================================================================

BEGIN;

-- 1. Tambahkan kolom default_paper_size jika belum ada
ALTER TABLE public.app_config 
ADD COLUMN IF NOT EXISTS default_paper_size text DEFAULT 'A4';

-- 2. Pastikan ada constraint atau default value yang valid
UPDATE public.app_config 
SET default_paper_size = 'A4' 
WHERE default_paper_size IS NULL OR default_paper_size = '';

-- 3. Berikan komentar
COMMENT ON COLUMN public.app_config.default_paper_size IS 'Ukuran kertas default (A4/F4) untuk mencetak kartu ujian presisi.';

COMMIT;

SELECT 'Konfigurasi kertas berhasil diperbarui.' as status;

-- END: 32_Add default paper size to app_config.sql

-- =====================================================================
-- START: 33_Perbaikan Konfigurasi Kartu Ujian.sql
-- =====================================================================


-- =================================================================
-- SQL_FIX_CARD_DATA.sql
-- TUJUAN: Melengkapi data konfigurasi agar Kartu Ujian tampil sempurna
-- =================================================================

BEGIN;

-- Update data konfigurasi default jika masih kosong
UPDATE public.app_config
SET 
    headmaster_name = COALESCE(NULLIF(headmaster_name, ''), 'Dr. H. KEPALA SEKOLAH, M.Pd'),
    headmaster_nip = COALESCE(NULLIF(headmaster_nip, ''), '19800101 200501 1 001'),
    card_issue_date = COALESCE(NULLIF(card_issue_date, ''), 'Surabaya, 16 Februari 2026'),
    -- Gunakan logo default jika kosong untuk preview yang bagus
    logo_url = COALESCE(NULLIF(logo_url, ''), 'https://via.placeholder.com/150/0000FF/808080?text=LOGO')
WHERE id = 1;

COMMIT;

SELECT 'Data konfigurasi kartu ujian berhasil diperbarui.' as status;

-- END: 33_Perbaikan Konfigurasi Kartu Ujian.sql

-- =====================================================================
-- START: 34_Verifikasi Kelengkapan Data Siswa untuk Cetak Kartu Ujian.sql
-- =====================================================================


-- =================================================================
-- SQL_VERIFY_DATA.sql
-- TUJUAN: Memastikan data siswa lengkap untuk dicetak di Kartu Ujian
-- =================================================================

-- 1. Cek kelengkapan kolom password_text (Wajib untuk cetak kartu)
-- Jika null, isi dengan NISN sebagai fallback
UPDATE public.users
SET password_text = nisn
WHERE (password_text IS NULL OR password_text = '') 
  AND nisn IS NOT NULL 
  AND role = 'student';

-- 2. Pastikan konfigurasi sekolah terisi (Logo & Nama)
-- Jika nama sekolah masih default, ubah (Optional, sesuaikan)
-- UPDATE public.app_config SET school_name = 'SMK CONTOH' WHERE id = 1 AND school_name = 'NAMA SEKOLAH';

-- 3. Tampilkan Data Siswa yang SIAP CETAK (Preview)
SELECT 
    full_name as "Nama",
    nisn as "NISN (Username)",
    password_text as "Password Cetak",
    class as "Kelas"
FROM public.users
WHERE role = 'student'
ORDER BY class ASC, full_name ASC
LIMIT 20;

-- Pesan Konfirmasi
SELECT 'Data siswa telah diverifikasi. Password kosong diisi dengan NISN.' as status;

-- END: 34_Verifikasi Kelengkapan Data Siswa untuk Cetak Kartu Ujian.sql

-- =====================================================================
-- START: 35_Penambahan tipe soal TRUE_FALSE pada questions.sql
-- =====================================================================


-- =================================================================
-- MODUL: PENAMBAHAN TIPE SOAL BENAR/SALAH (TKA 2026)
-- Jalankan script ini di SQL Editor Supabase
-- =================================================================

BEGIN;

-- 1. Hapus constraint lama pada kolom type
ALTER TABLE public.questions 
DROP CONSTRAINT IF EXISTS questions_type_check;

-- 2. Tambahkan constraint baru yang mencakup 'true_false'
-- TKA 2026 Standards: SINGLE, MULTIPLE, MATCHING, ESSAY, TRUE_FALSE
ALTER TABLE public.questions 
ADD CONSTRAINT questions_type_check 
CHECK (type IN ('multiple_choice', 'complex_multiple_choice', 'matching', 'essay', 'true_false'));

-- 3. Refresh schema cache
NOTIFY pgrst, 'reload config';

COMMIT;

-- Konfirmasi
SELECT 'Tipe soal TRUE_FALSE berhasil ditambahkan.' as status;

-- END: 35_Penambahan tipe soal TRUE_FALSE pada questions.sql

-- =====================================================================
-- START: 36_Image Storage Limits & Upload Policy.sql
-- =====================================================================


-- =================================================================
-- OPTIMASI PENYIMPANAN GAMBAR (ENTERPRISE STANDARD)
-- Tujuan: Mencegah beban server dengan membatasi ukuran file fisik
-- =================================================================

BEGIN;

-- 1. Update Konfigurasi Bucket 'question_assets'
-- Batasi ukuran file maksimal 500KB (524288 bytes).
-- Soal ujian tidak membutuhkan resolusi 4K. 800px (approx 150-300KB) sudah sangat cukup.
UPDATE storage.buckets
SET file_size_limit = 512000, -- 500 KB
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
WHERE id = 'question_assets';

-- 2. Update Konfigurasi Bucket 'config_assets' (Logo/Tanda Tangan)
-- Logo biasanya kecil, batasi 1MB agar aman.
UPDATE storage.buckets
SET file_size_limit = 1048576, -- 1 MB
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
WHERE id = 'config_assets';

-- 3. (Opsional) Policy tambahan untuk mencegah overload (Rate Limiting sederhana via RLS)
-- Memastikan user hanya bisa upload jika file size valid (Double check di level row)
DROP POLICY IF EXISTS "Enforce File Size" ON storage.objects;
CREATE POLICY "Enforce File Size"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id IN ('question_assets', 'config_assets') AND
  (metadata->>'size')::int <= 512000 -- Max 500KB
);

COMMIT;

-- Konfirmasi
SELECT 'Storage limits applied: Max 500KB for Questions.' as status;

-- END: 36_Image Storage Limits & Upload Policy.sql

-- =====================================================================
-- START: 37_Import Soal Massal oleh Admin.sql
-- =====================================================================


-- =================================================================
-- MODUL: IMPORT SOAL MASSAL (TKA 2026 COMPLIANT)
-- Jalankan script ini di SQL Editor Supabase
-- =================================================================

CREATE OR REPLACE FUNCTION public.admin_import_questions(
  p_test_token text,
  p_questions_data json
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_test_id uuid;
  v_inserted_count int := 0;
BEGIN
  -- 1. Validasi Admin
  IF NOT (SELECT auth.email() = 'admin@cbtschool.com') THEN
    RAISE EXCEPTION '403: Forbidden';
  END IF;

  -- 2. Dapatkan ID Ujian dari Token
  SELECT id INTO v_test_id FROM public.tests WHERE token = p_test_token;
  
  IF v_test_id IS NULL THEN
    RAISE EXCEPTION 'Token ujian tidak ditemukan: %', p_test_token;
  END IF;

  -- 3. Insert Data
  -- Kita menggunakan json_populate_recordset untuk memetakan JSON ke struktur tabel sementara,
  -- lalu memasukkannya ke tabel questions.
  
  WITH inserted_rows AS (
    INSERT INTO public.questions (
      test_id,
      type,
      question,
      options,
      matching_right_options, -- Pastikan kolom ini ada di tabel (jika belum, script migrasi sebelumnya harus dijalankan)
      answer_key,
      correct_answer_index, -- FIX: Kolom wajib diisi (Legacy support & Constraint NOT NULL)
      cognitive_level,
      weight,
      difficulty,
      topic
    )
    SELECT
      v_test_id,
      x.type,
      x.question,
      x.options,
      x.matching_right_options,
      x.answer_key,
      -- FIX: Hitung correct_answer_index untuk memenuhi constraint NOT NULL
      -- Ambil dari answer_key jika tipe SINGLE, selain itu isi 0
      COALESCE(
        CASE 
          WHEN x.type = 'multiple_choice' THEN (x.answer_key #>> '{}')::integer
          ELSE 0 
        END, 
      0),
      x.cognitive_level,
      COALESCE(x.weight, 1),
      COALESCE(x.difficulty, 'Medium'),
      x.topic
    FROM json_to_recordset(p_questions_data) AS x(
      type text,
      question text,
      options text[],
      matching_right_options text[],
      answer_key jsonb,
      cognitive_level text,
      weight numeric,
      difficulty text,
      topic text
    )
    RETURNING id
  )
  SELECT count(*) INTO v_inserted_count FROM inserted_rows;

  RETURN json_build_object(
    'status', 'success',
    'inserted', v_inserted_count,
    'test_id', v_test_id
  );
END;
$$;

-- Pastikan kolom matching_right_options ada untuk soal menjodohkan (jika belum ada di migrasi sebelumnya)
ALTER TABLE public.questions 
ADD COLUMN IF NOT EXISTS matching_right_options text[];

COMMENT ON FUNCTION public.admin_import_questions IS 'Mengimpor soal massal dari JSON yang sudah diparsing klien, mendukung struktur data TKA 2026.';

-- END: 37_Import Soal Massal oleh Admin.sql

-- =====================================================================
-- START: 38_Bersihkan Opsi Jawaban Kosong.sql
-- =====================================================================


-- =================================================================
-- CLEANUP_EMPTY_OPTIONS.sql
-- Membersihkan data opsi jawaban yang kosong ("" atau "-") 
-- agar tampilan di siswa bersih (misal: hanya muncul A, B, C, D).
-- =================================================================

BEGIN;

-- 1. Bersihkan elemen array kosong di kolom 'options' pada tabel questions
-- Fungsi ini akan menghapus string kosong atau '-' dari array options
UPDATE public.questions
SET options = ARRAY(
    SELECT x 
    FROM unnest(options) AS x 
    WHERE x IS NOT NULL 
      AND trim(x) <> '' 
      AND trim(x) <> '-'
)
WHERE type IN ('multiple_choice', 'complex_multiple_choice');

-- 2. Pastikan tidak ada soal yang opsinya jadi kurang dari 2 setelah dibersihkan
-- (Optional: hanya untuk pengecekan)
-- SELECT id, question, cardinality(options) as jumlah_opsi FROM public.questions WHERE cardinality(options) < 2;

COMMIT;

SELECT 'Pembersihan opsi kosong selesai. Bank soal kini bersih.' as status;

-- END: 38_Bersihkan Opsi Jawaban Kosong.sql

-- =====================================================================
-- START: 39_Exam Event Configuration.sql
-- =====================================================================


-- =================================================================
-- MODUL: FITUR JENIS KEGIATAN UJIAN & TAHUN AJARAN GLOBAL
-- Jalankan script ini di SQL Editor Supabase
-- =================================================================

BEGIN;

-- 1. Tambahkan kolom untuk Nama Kegiatan Global
ALTER TABLE public.app_config
ADD COLUMN IF NOT EXISTS current_exam_event TEXT DEFAULT 'UJIAN SEKOLAH BERBASIS KOMPUTER';

COMMENT ON COLUMN public.app_config.current_exam_event IS 'Nama kegiatan ujian yang sedang berlangsung (untuk header cetak)';

-- 2. Tambahkan kolom Tahun Ajaran Global
ALTER TABLE public.app_config
ADD COLUMN IF NOT EXISTS academic_year TEXT DEFAULT '2023/2024';

COMMENT ON COLUMN public.app_config.academic_year IS 'Tahun ajaran yang aktif (misal: 2023/2024)';

-- 3. Tambahkan kolom kategori/tipe pada tabel ujian (Tests)
ALTER TABLE public.tests
ADD COLUMN IF NOT EXISTS exam_type TEXT DEFAULT 'Umum';

COMMENT ON COLUMN public.tests.exam_type IS 'Kategori ujian (misal: PTS, PAS, US, Placement Test)';

COMMIT;

-- 4. Refresh schema cache
NOTIFY pgrst, 'reload config';

-- Konfirmasi
SELECT 'Fitur Kegiatan Ujian & Tahun Ajaran berhasil ditambahkan.' as status;

-- END: 39_Exam Event Configuration.sql

-- =====================================================================
-- START: 40_App Config Column Comments.sql
-- =====================================================================


-- =================================================================
-- SQL_CONFIG_DOCUMENTATION.sql
-- TUJUAN: Mendokumentasikan kolom konfigurasi aset untuk kejelasan.
-- =================================================================

-- 1. Berikan komentar pada kolom signature_url
COMMENT ON COLUMN public.app_config.signature_url IS 'URL gambar tanda tangan kepala sekolah. Format wajib: PNG Transparan. Max 500KB.';

-- 2. Berikan komentar pada kolom stamp_url
COMMENT ON COLUMN public.app_config.stamp_url IS 'URL gambar stempel sekolah. Format wajib: PNG Transparan. Max 500KB.';

-- Konfirmasi
SELECT 'Dokumentasi kolom aset konfigurasi berhasil diperbarui.' as status;

-- END: 40_App Config Column Comments.sql

-- =====================================================================
-- START: 41_Dual-Logo Header Support.sql
-- =====================================================================


-- =================================================================
-- MODUL: DUKUNGAN DUAL LOGO (STANDAR KOP SURAT RESMI)
-- Menambahkan kolom untuk Logo Pemerintah (Kiri)
-- =================================================================

BEGIN;

-- 1. Tambahkan kolom left_logo_url ke tabel app_config
ALTER TABLE public.app_config 
ADD COLUMN IF NOT EXISTS left_logo_url TEXT;

-- 2. Berikan komentar
COMMENT ON COLUMN public.app_config.left_logo_url IS 'URL Logo Pemerintah/Kabupaten (Posisi Kiri di KOP)';
COMMENT ON COLUMN public.app_config.logo_url IS 'URL Logo Sekolah (Posisi Kanan di KOP)';

COMMIT;

-- 3. Refresh cache
NOTIFY pgrst, 'reload config';

-- Konfirmasi
SELECT 'Kolom left_logo_url berhasil ditambahkan.' as status;

-- END: 41_Dual-Logo Header Support.sql

-- =====================================================================
-- START: 42_Manajemen Role Guru dan Kebijakan Akses.sql
-- =====================================================================


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

-- END: 42_Manajemen Role Guru dan Kebijakan Akses.sql

-- =====================================================================
-- START: 43_Fungsi Upsert Pengguna dengan Dukungan Role.sql
-- =====================================================================


-- =================================================================
-- MODUL UPDATE: FUNGSI UPSERT USER DENGAN DUKUNGAN ROLE
-- Jalankan script ini di SQL Editor Supabase
-- =================================================================

DROP FUNCTION IF EXISTS public.admin_upsert_user(uuid, text, text, text, text, text, text, text, text, text, text);

CREATE OR REPLACE FUNCTION public.admin_upsert_user(
  p_id uuid,
  p_username text,
  p_password text,
  p_full_name text,
  p_nisn text,
  p_class text,
  p_major text,
  p_gender text,
  p_religion text,
  p_photo_url text,
  p_role text DEFAULT 'student' -- Parameter Baru
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER 
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id uuid;
  v_final_role text := p_role;
  v_final_class text := p_class;
BEGIN
  -- Validasi Admin
  IF NOT (SELECT auth.email() = 'admin@cbtschool.com') THEN
    RAISE EXCEPTION '403: Forbidden - Hanya admin yang boleh mengubah data.';
  END IF;

  -- Logika Default untuk Guru
  IF v_final_role = 'teacher' THEN
    v_final_class := 'STAFF'; -- Marker khusus untuk guru di kolom class
  END IF;

  -- Validasi Role
  IF v_final_role NOT IN ('student', 'teacher', 'admin') THEN
     v_final_role := 'student';
  END IF;

  IF p_id IS NOT NULL THEN
    -- === UPDATE ===
    v_user_id := p_id;

    -- Update Auth Meta
    UPDATE auth.users
    SET
      email = p_username,
      raw_user_meta_data = jsonb_build_object(
        'full_name', p_full_name,
        'nisn', p_nisn,
        'class', v_final_class,
        'major', p_major,
        'gender', p_gender,
        'religion', p_religion,
        'photo_url', p_photo_url,
        'role', v_final_role
      ),
      updated_at = now()
    WHERE id = v_user_id;

    -- Update Password jika ada
    IF p_password IS NOT NULL AND p_password <> '' THEN
      UPDATE auth.users
      SET encrypted_password = crypt(p_password, gen_salt('bf'))
      WHERE id = v_user_id;
    END IF;

    -- Update Public Table
    UPDATE public.users
    SET
      username = p_username,
      full_name = p_full_name,
      nisn = p_nisn,
      class = v_final_class,
      major = p_major,
      gender = p_gender,
      religion = p_religion,
      photo_url = p_photo_url,
      role = v_final_role,
      updated_at = now()
    WHERE id = v_user_id;

  ELSE
    -- === INSERT ===
    v_user_id := uuid_generate_v4();
    
    INSERT INTO auth.users (
      id, email, encrypted_password, email_confirmed_at, raw_user_meta_data, aud, role
    )
    VALUES (
      v_user_id,
      p_username,
      crypt(p_password, gen_salt('bf')),
      now(),
      jsonb_build_object(
        'full_name', p_full_name,
        'nisn', p_nisn,
        'class', v_final_class,
        'major', p_major,
        'gender', p_gender,
        'religion', p_religion,
        'photo_url', p_photo_url,
        'role', v_final_role
      ),
      'authenticated',
      'authenticated'
    );
    
    -- Trigger handle_new_user akan mengisi public.users, 
    -- TAPI trigger default mungkin belum handle 'role'. 
    -- Kita update manual public.users untuk memastikan role masuk benar.
    -- (Tunggu sebentar agar trigger selesai atau gunakan ON CONFLICT di trigger yg sudah diupdate sebelumnya)
    
    -- Force update role di public.users untuk memastikan konsistensi
    UPDATE public.users 
    SET role = v_final_role, class = v_final_class 
    WHERE id = v_user_id;
    
  END IF;

  RETURN v_user_id;
END;
$$;

SELECT 'Fungsi admin_upsert_user berhasil diperbarui dengan dukungan Role.' as status;

-- END: 43_Fungsi Upsert Pengguna dengan Dukungan Role.sql

-- =====================================================================
-- START: 44_Admin User Bulk Import.sql
-- =====================================================================


CREATE OR REPLACE FUNCTION public.admin_import_users(users_data json)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  updated_count int;
  inserted_count int;
  v_domain text := 'smpn2demak.sch.id'; -- Default domain
BEGIN
  IF NOT (SELECT auth.email() = 'admin@cbtschool.com') THEN
    RAISE EXCEPTION '403: Forbidden';
  END IF;

  CREATE TEMP TABLE incoming_users_import (
    "username" text,
    "password" text,
    "fullName" text,
    "nisn" text,
    "class" text,
    "major" text,
    "gender" text,
    "religion" text,
    "photoUrl" text,
    "role" text -- Added role
  ) ON COMMIT DROP;

  INSERT INTO incoming_users_import
  SELECT * FROM json_populate_recordset(null::incoming_users_import, users_data);
  
  -- Default role to 'student' if null
  UPDATE incoming_users_import SET role = 'student' WHERE role IS NULL OR role = '';
  
  -- Validate Role
  IF EXISTS (SELECT 1 FROM incoming_users_import WHERE role NOT IN ('student', 'teacher', 'admin')) THEN
     RAISE EXCEPTION 'Data tidak valid: Role harus student, teacher, atau admin.';
  END IF;

  -- 1. UPDATE EXISTING
  WITH updated_public_users AS (
      UPDATE public.users pu
      SET
        full_name = i."fullName",
        class = i.class,
        major = i.major,
        gender = i.gender,
        religion = i.religion,
        photo_url = COALESCE(i."photoUrl", pu.photo_url),
        username = i."username",
        password_text = i."password",
        qr_login_password = i."password",
        role = i."role", -- Update role
        updated_at = now()
      FROM incoming_users_import i
      WHERE pu.nisn = i.nisn
      RETURNING pu.id
  )
  SELECT count(*) INTO updated_count FROM updated_public_users;
  
  -- Update Auth Users
  UPDATE auth.users au
  SET 
    email = CASE 
        WHEN i."username" LIKE '%@%' THEN i."username" 
        ELSE i."username" || '@' || v_domain 
    END,
    encrypted_password = crypt(i."password", gen_salt('bf')),
    raw_user_meta_data = au.raw_user_meta_data || jsonb_build_object(
          'full_name', i."fullName",
          'nisn', i.nisn,
          'class', i.class,
          'major', i.major,
          'role', i."role" -- Update role in metadata
        ),
    updated_at = now()
  FROM incoming_users_import i
  JOIN public.users pu ON i.nisn = pu.nisn
  WHERE au.id = pu.id;

  -- 2. INSERT NEW
  WITH new_auth_users AS (
    INSERT INTO auth.users (
      id, email, encrypted_password, email_confirmed_at, raw_user_meta_data, aud, role
    )
    SELECT
      uuid_generate_v4(),
      CASE 
        WHEN i."username" LIKE '%@%' THEN i."username" 
        ELSE i."username" || '@' || v_domain 
      END,
      crypt(i."password", gen_salt('bf')),
      now(),
      jsonb_build_object(
          'full_name', i."fullName",
          'nisn', i.nisn,
          'class', i.class,
          'major', i.major,
          'gender', i.gender,
          'religion', i.religion,
          'photo_url', COALESCE(i."photoUrl", 'https://ui-avatars.com/api/?name=' || i."fullName"),
          'password_text', i."password",
          'username_excel', i."username",
          'role', i."role"
      ),
      'authenticated',
      'authenticated'
    FROM incoming_users_import i
    WHERE NOT EXISTS (SELECT 1 FROM public.users pu WHERE pu.nisn = i.nisn)
    RETURNING id, raw_user_meta_data
  )
  INSERT INTO public.users (id, username, full_name, nisn, class, major, gender, religion, photo_url, password_text, qr_login_password, role)
  SELECT 
    nau.id,
    (nau.raw_user_meta_data->>'username_excel'), 
    (nau.raw_user_meta_data->>'full_name'),
    (nau.raw_user_meta_data->>'nisn'),
    (nau.raw_user_meta_data->>'class'),
    (nau.raw_user_meta_data->>'major'),
    (nau.raw_user_meta_data->>'gender'),
    (nau.raw_user_meta_data->>'religion'),
    (nau.raw_user_meta_data->>'photo_url'),
    (nau.raw_user_meta_data->>'password_text'),
    (nau.raw_user_meta_data->>'password_text'),
    (nau.raw_user_meta_data->>'role')
  FROM new_auth_users nau;

  SELECT count(*) INTO inserted_count FROM incoming_users_import i WHERE NOT EXISTS (SELECT 1 FROM public.users pu WHERE pu.nisn = i.nisn); -- Approx count fix

  RETURN json_build_object(
    'updated', updated_count,
    'inserted', inserted_count,
    'total', updated_count + inserted_count
  );
END;
$$;

-- END: 44_Admin User Bulk Import.sql

-- =====================================================================
-- START: 45_Upsert Pengguna oleh Admin dengan Dukungan Role.sql
-- =====================================================================


-- =================================================================
-- MODUL UPDATE: FUNGSI UPSERT USER DENGAN DUKUNGAN ROLE
-- Jalankan script ini di SQL Editor Supabase
-- =================================================================

DROP FUNCTION IF EXISTS public.admin_upsert_user(uuid, text, text, text, text, text, text, text, text, text, text);

CREATE OR REPLACE FUNCTION public.admin_upsert_user(
  p_id uuid,
  p_username text,
  p_password text,
  p_full_name text,
  p_nisn text,
  p_class text,
  p_major text,
  p_gender text,
  p_religion text,
  p_photo_url text,
  p_role text DEFAULT 'student' -- Parameter Baru
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER 
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id uuid;
  v_final_role text := p_role;
  v_final_class text := p_class;
BEGIN
  -- Validasi Admin
  IF NOT (SELECT auth.email() = 'admin@cbtschool.com') THEN
    RAISE EXCEPTION '403: Forbidden - Hanya admin yang boleh mengubah data.';
  END IF;

  -- Logika Default untuk Guru
  IF v_final_role = 'teacher' THEN
    v_final_class := 'STAFF'; -- Marker khusus untuk guru di kolom class
  END IF;

  -- Validasi Role
  IF v_final_role NOT IN ('student', 'teacher', 'admin') THEN
     v_final_role := 'student';
  END IF;

  IF p_id IS NOT NULL THEN
    -- === UPDATE ===
    v_user_id := p_id;

    -- Update Auth Meta
    UPDATE auth.users
    SET
      email = p_username,
      raw_user_meta_data = jsonb_build_object(
        'full_name', p_full_name,
        'nisn', p_nisn,
        'class', v_final_class,
        'major', p_major,
        'gender', p_gender,
        'religion', p_religion,
        'photo_url', p_photo_url,
        'role', v_final_role
      ),
      updated_at = now()
    WHERE id = v_user_id;

    -- Update Password jika ada
    IF p_password IS NOT NULL AND p_password <> '' THEN
      UPDATE auth.users
      SET encrypted_password = crypt(p_password, gen_salt('bf'))
      WHERE id = v_user_id;
    END IF;

    -- Update Public Table
    UPDATE public.users
    SET
      username = p_username,
      full_name = p_full_name,
      nisn = p_nisn,
      class = v_final_class,
      major = p_major,
      gender = p_gender,
      religion = p_religion,
      photo_url = p_photo_url,
      role = v_final_role,
      updated_at = now()
    WHERE id = v_user_id;

  ELSE
    -- === INSERT ===
    v_user_id := uuid_generate_v4();
    
    INSERT INTO auth.users (
      id, email, encrypted_password, email_confirmed_at, raw_user_meta_data, aud, role
    )
    VALUES (
      v_user_id,
      p_username,
      crypt(p_password, gen_salt('bf')),
      now(),
      jsonb_build_object(
        'full_name', p_full_name,
        'nisn', p_nisn,
        'class', v_final_class,
        'major', p_major,
        'gender', p_gender,
        'religion', p_religion,
        'photo_url', p_photo_url,
        'role', v_final_role
      ),
      'authenticated',
      'authenticated'
    );
    
    -- Trigger handle_new_user akan mengisi public.users, 
    -- TAPI trigger default mungkin belum handle 'role'. 
    -- Kita update manual public.users untuk memastikan role masuk benar.
    -- (Tunggu sebentar agar trigger selesai atau gunakan ON CONFLICT di trigger yg sudah diupdate sebelumnya)
    
    -- Force update role di public.users untuk memastikan konsistensi
    UPDATE public.users 
    SET role = v_final_role, class = v_final_class 
    WHERE id = v_user_id;
    
  END IF;

  RETURN v_user_id;
END;
$$;

SELECT 'Fungsi admin_upsert_user berhasil diperbarui dengan dukungan Role.' as status;

-- END: 45_Upsert Pengguna oleh Admin dengan Dukungan Role.sql

-- =====================================================================
-- START: 46_Refresh Supabase Cache & Recreate admin_upsert_user Function.sql
-- =====================================================================


-- =================================================================
-- FIX TOTAL: UPDATE FUNGSI ADMIN UPSERT & RELOAD CACHE
-- Jalankan script ini di SQL Editor Supabase untuk mengatasi error:
-- "Could not find the function public.admin_upsert_user..."
-- =================================================================

BEGIN;

-- 1. Refresh Cache Schema Supabase (Langkah Kritis!)
-- Ini memaksa Supabase membaca ulang definisi fungsi terbaru.
NOTIFY pgrst, 'reload config';

-- 2. Hapus fungsi versi lama (jika ada) untuk menghindari konflik
DROP FUNCTION IF EXISTS public.admin_upsert_user(uuid, text, text, text, text, text, text, text, text, text);
DROP FUNCTION IF EXISTS public.admin_upsert_user(uuid, text, text, text, text, text, text, text, text, text, text);

-- 3. Buat ulang fungsi dengan definisi parameter yang benar (termasuk p_role)
CREATE OR REPLACE FUNCTION public.admin_upsert_user(
  p_id uuid,
  p_username text,
  p_password text,
  p_full_name text,
  p_nisn text,
  p_class text,
  p_major text,
  p_gender text,
  p_religion text,
  p_photo_url text,
  p_role text DEFAULT 'student' -- Parameter Baru
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER 
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id uuid;
  v_final_role text := p_role;
  v_final_class text := p_class;
BEGIN
  -- Validasi Admin
  IF NOT (SELECT auth.email() = 'admin@cbtschool.com') THEN
    RAISE EXCEPTION '403: Forbidden - Hanya admin yang boleh mengubah data.';
  END IF;

  -- Logika Default untuk Guru
  IF v_final_role = 'teacher' THEN
    v_final_class := 'STAFF'; -- Marker khusus untuk guru di kolom class
  END IF;

  -- Validasi Role
  IF v_final_role NOT IN ('student', 'teacher', 'admin') THEN
     v_final_role := 'student';
  END IF;

  IF p_id IS NOT NULL THEN
    -- === UPDATE ===
    v_user_id := p_id;

    -- Update Auth Meta
    UPDATE auth.users
    SET
      email = p_username,
      raw_user_meta_data = jsonb_build_object(
        'full_name', p_full_name,
        'nisn', p_nisn,
        'class', v_final_class,
        'major', p_major,
        'gender', p_gender,
        'religion', p_religion,
        'photo_url', p_photo_url,
        'role', v_final_role
      ),
      updated_at = now()
    WHERE id = v_user_id;

    -- Update Password jika ada
    IF p_password IS NOT NULL AND p_password <> '' THEN
      UPDATE auth.users
      SET encrypted_password = crypt(p_password, gen_salt('bf'))
      WHERE id = v_user_id;
    END IF;

    -- Update Public Table
    UPDATE public.users
    SET
      username = p_username,
      full_name = p_full_name,
      nisn = p_nisn,
      class = v_final_class,
      major = p_major,
      gender = p_gender,
      religion = p_religion,
      photo_url = p_photo_url,
      role = v_final_role,
      updated_at = now()
    WHERE id = v_user_id;

  ELSE
    -- === INSERT ===
    v_user_id := uuid_generate_v4();
    
    INSERT INTO auth.users (
      id, email, encrypted_password, email_confirmed_at, raw_user_meta_data, aud, role
    )
    VALUES (
      v_user_id,
      p_username,
      crypt(p_password, gen_salt('bf')),
      now(),
      jsonb_build_object(
        'full_name', p_full_name,
        'nisn', p_nisn,
        'class', v_final_class,
        'major', p_major,
        'gender', p_gender,
        'religion', p_religion,
        'photo_url', p_photo_url,
        'role', v_final_role
      ),
      'authenticated',
      'authenticated'
    );
    
    -- Force update role di public.users untuk memastikan konsistensi
    -- (Trigger handle_new_user mungkin belum mengcover role)
    UPDATE public.users 
    SET role = v_final_role, class = v_final_class 
    WHERE id = v_user_id;
    
  END IF;

  RETURN v_user_id;
END;
$$;

COMMIT;

SELECT 'Berhasil! Fungsi diperbarui dan Cache Schema telah di-refresh.' as status;

-- END: 46_Refresh Supabase Cache & Recreate admin_upsert_user Function.sql

-- =====================================================================
-- START: 47_Admin upsert_user function (default-null params).sql
-- =====================================================================


-- =================================================================
-- FIX RPC FINAL: admin_upsert_user
-- Menggunakan DEFAULT NULL untuk semua parameter agar fleksibel
-- dan mencegah error "Could not find function" jika parameter null/missing.
-- =================================================================

BEGIN;

-- 1. Refresh Cache Schema
NOTIFY pgrst, 'reload config';

-- 2. Hapus versi lama (Clean Slate)
DROP FUNCTION IF EXISTS public.admin_upsert_user(uuid, text, text, text, text, text, text, text, text, text);
DROP FUNCTION IF EXISTS public.admin_upsert_user(uuid, text, text, text, text, text, text, text, text, text, text);

-- 3. Buat Fungsi Baru dengan DEFAULT NULL untuk semua parameter
CREATE OR REPLACE FUNCTION public.admin_upsert_user(
  p_id uuid DEFAULT NULL,
  p_username text DEFAULT NULL,
  p_password text DEFAULT NULL,
  p_full_name text DEFAULT NULL,
  p_nisn text DEFAULT NULL,
  p_class text DEFAULT NULL,
  p_major text DEFAULT NULL,
  p_gender text DEFAULT NULL,
  p_religion text DEFAULT NULL,
  p_photo_url text DEFAULT NULL,
  p_role text DEFAULT 'student'
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER 
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id uuid;
  v_final_role text := COALESCE(p_role, 'student');
  v_final_class text := COALESCE(p_class, 'Belum diatur');
BEGIN
  -- Validasi Admin
  IF NOT (SELECT auth.email() = 'admin@cbtschool.com') THEN
    RAISE EXCEPTION '403: Forbidden - Hanya admin yang boleh mengubah data.';
  END IF;

  -- Logika Default untuk Guru
  IF v_final_role = 'teacher' THEN
    -- Jika guru, class biasanya STAFF, tapi jika admin input spesifik, biarkan.
    -- Jika kosong, set STAFF.
    IF p_class IS NULL OR p_class = '' THEN
        v_final_class := 'STAFF';
    END IF;
  END IF;

  -- Validasi Role
  IF v_final_role NOT IN ('student', 'teacher', 'admin') THEN
     v_final_role := 'student';
  END IF;

  IF p_id IS NOT NULL THEN
    -- === UPDATE ===
    v_user_id := p_id;

    -- Update Auth Meta
    UPDATE auth.users
    SET
      email = p_username,
      raw_user_meta_data = jsonb_build_object(
        'full_name', p_full_name,
        'nisn', p_nisn,
        'class', v_final_class,
        'major', p_major,
        'gender', p_gender,
        'religion', p_religion,
        'photo_url', p_photo_url,
        'role', v_final_role
      ),
      updated_at = now()
    WHERE id = v_user_id;

    -- Update Password HANYA JIKA DIISI
    IF p_password IS NOT NULL AND p_password <> '' THEN
      UPDATE auth.users
      SET encrypted_password = crypt(p_password, gen_salt('bf'))
      WHERE id = v_user_id;
    END IF;

    -- Update Public Table
    UPDATE public.users
    SET
      username = p_username,
      full_name = p_full_name,
      nisn = p_nisn,
      class = v_final_class,
      major = p_major,
      gender = p_gender,
      religion = p_religion,
      photo_url = p_photo_url,
      role = v_final_role,
      updated_at = now()
    WHERE id = v_user_id;

  ELSE
    -- === INSERT ===
    v_user_id := uuid_generate_v4();
    
    INSERT INTO auth.users (
      id, email, encrypted_password, email_confirmed_at, raw_user_meta_data, aud, role
    )
    VALUES (
      v_user_id,
      p_username,
      crypt(COALESCE(p_password, p_nisn, '123456'), gen_salt('bf')), -- Default pass jika kosong
      now(),
      jsonb_build_object(
        'full_name', p_full_name,
        'nisn', p_nisn,
        'class', v_final_class,
        'major', p_major,
        'gender', p_gender,
        'religion', p_religion,
        'photo_url', p_photo_url,
        'role', v_final_role
      ),
      'authenticated',
      'authenticated'
    );
    
    -- Force update role di public.users untuk memastikan konsistensi
    -- (Trigger handle_new_user mungkin belum mengcover role atau ada delay)
    -- Kita gunakan ON CONFLICT untuk safety jika trigger sudah duluan
    INSERT INTO public.users (id, username, full_name, role, class, major, gender, religion, nisn, photo_url)
    VALUES (
        v_user_id, p_username, p_full_name, v_final_role, v_final_class, p_major, p_gender, p_religion, p_nisn, p_photo_url
    )
    ON CONFLICT (id) DO UPDATE SET
        role = v_final_role,
        class = v_final_class,
        username = EXCLUDED.username,
        full_name = EXCLUDED.full_name;
    
  END IF;

  RETURN v_user_id;
END;
$$;

-- 4. Grant Permission (Just in case)
GRANT EXECUTE ON FUNCTION public.admin_upsert_user TO authenticated, service_role;

COMMIT;

SELECT 'Fungsi admin_upsert_user DIPERBAIKI (Default Params). Silakan coba simpan user lagi.' as status;

-- END: 47_Admin upsert_user function (default-null params).sql

-- =====================================================================
-- START: 48_Teacher Role Consistency Fix.sql
-- =====================================================================


-- =================================================================
-- FIX_TEACHER_ROLE.sql
-- PERBAIKAN: KONSISTENSI ROLE GURU (DB & AUTH)
-- =================================================================

BEGIN;

-- 1. UPDATE TRIGGER handle_new_user
-- Agar saat user dibuat, role dari metadata langsung masuk ke public.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role text;
  v_class text;
BEGIN
  -- Ambil role dan class dari metadata
  v_role := COALESCE(new.raw_user_meta_data ->> 'role', 'student');
  v_class := COALESCE(new.raw_user_meta_data ->> 'class', '');

  -- Logika fallback untuk Class
  IF v_role = 'teacher' AND (v_class = '' OR v_class IS NULL OR v_class = 'Belum diatur') THEN
    v_class := 'STAFF';
  ELSIF v_class = '' OR v_class IS NULL THEN
    v_class := 'Belum diatur';
  END IF;

  INSERT INTO public.users (
    id, username, full_name, nisn, class, major, gender, religion, photo_url, role, password_text, qr_login_password
  )
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data ->> 'full_name', 'Nama Belum Diatur'),
    COALESCE(new.raw_user_meta_data ->> 'nisn', split_part(new.email, '@', 1)),
    v_class, -- Gunakan v_class yang sudah diproses
    COALESCE(new.raw_user_meta_data ->> 'major', 'Belum diatur'),
    COALESCE(new.raw_user_meta_data ->> 'gender', 'Laki-laki'),
    COALESCE(new.raw_user_meta_data ->> 'religion', 'Islam'),
    COALESCE(new.raw_user_meta_data ->> 'photo_url', ''),
    v_role, -- Gunakan v_role
    new.raw_user_meta_data ->> 'password_text',
    new.raw_user_meta_data ->> 'password_text'
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role, -- Update role jika conflict
    class = EXCLUDED.class, -- Update class jika conflict
    major = EXCLUDED.major, -- Update mapel/jurusan
    username = EXCLUDED.username,
    updated_at = now();
  RETURN new;
END;
$$;

-- 2. UPDATE FUNGSI ADMIN UPSERT
-- Memastikan role ditulis ke Metadata (Auth) DAN Tabel Public
CREATE OR REPLACE FUNCTION public.admin_upsert_user(
  p_id uuid DEFAULT NULL,
  p_username text DEFAULT NULL,
  p_password text DEFAULT NULL,
  p_full_name text DEFAULT NULL,
  p_nisn text DEFAULT NULL,
  p_class text DEFAULT NULL,
  p_major text DEFAULT NULL,
  p_gender text DEFAULT NULL,
  p_religion text DEFAULT NULL,
  p_photo_url text DEFAULT NULL,
  p_role text DEFAULT 'student'
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER 
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id uuid;
  v_final_role text := COALESCE(p_role, 'student');
  -- FIX: Jangan langsung COALESCE p_class di sini agar kita bisa cek null-nya
  v_final_class text := p_class;
BEGIN
  IF NOT (SELECT auth.email() = 'admin@cbtschool.com') THEN
    RAISE EXCEPTION '403: Forbidden';
  END IF;

  -- Validasi Role
  IF v_final_role NOT IN ('student', 'teacher', 'admin') THEN
     v_final_role := 'student';
  END IF;

  -- Logika Class Berdasarkan Role
  IF v_final_role = 'teacher' THEN
    -- Jika guru, class default STAFF
    IF v_final_class IS NULL OR v_final_class = '' OR v_final_class = 'Belum diatur' THEN
        v_final_class := 'STAFF';
    END IF;
  ELSE
    -- Jika siswa, default Belum diatur
    IF v_final_class IS NULL OR v_final_class = '' THEN
        v_final_class := 'Belum diatur';
    END IF;
  END IF;

  IF p_id IS NOT NULL THEN
    v_user_id := p_id;

    -- UPDATE AUTH (PENTING: Tulis Role ke Metadata)
    UPDATE auth.users
    SET
      email = p_username,
      raw_user_meta_data = jsonb_build_object(
        'full_name', p_full_name,
        'nisn', p_nisn,
        'class', v_final_class,
        'major', p_major, -- Mapel Guru
        'gender', p_gender,
        'religion', p_religion,
        'photo_url', p_photo_url,
        'role', v_final_role, -- ROLE UTAMA
        'password_text', p_password
      ),
      updated_at = now()
    WHERE id = v_user_id;

    IF p_password IS NOT NULL AND p_password <> '' THEN
      UPDATE auth.users SET encrypted_password = crypt(p_password, gen_salt('bf')) WHERE id = v_user_id;
    END IF;

    -- UPDATE PUBLIC
    UPDATE public.users
    SET
      username = p_username,
      full_name = p_full_name,
      nisn = p_nisn,
      class = v_final_class,
      major = p_major,
      gender = p_gender,
      religion = p_religion,
      photo_url = p_photo_url,
      role = v_final_role,
      password_text = COALESCE(p_password, password_text),
      updated_at = now()
    WHERE id = v_user_id;

  ELSE
    v_user_id := uuid_generate_v4();
    
    INSERT INTO auth.users (
      id, email, encrypted_password, email_confirmed_at, raw_user_meta_data, aud, role
    )
    VALUES (
      v_user_id,
      p_username,
      crypt(COALESCE(p_password, p_nisn, '123456'), gen_salt('bf')),
      now(),
      jsonb_build_object(
        'full_name', p_full_name,
        'nisn', p_nisn,
        'class', v_final_class,
        'major', p_major,
        'gender', p_gender,
        'religion', p_religion,
        'photo_url', p_photo_url,
        'role', v_final_role, -- ROLE UTAMA
        'password_text', p_password
      ),
      'authenticated',
      'authenticated'
    );
    
    -- Force Insert Public (Double Check)
    INSERT INTO public.users (id, username, full_name, role, class, major, gender, religion, nisn, photo_url, password_text)
    VALUES (
        v_user_id, p_username, p_full_name, v_final_role, v_final_class, p_major, p_gender, p_religion, p_nisn, p_photo_url, p_password
    )
    ON CONFLICT (id) DO UPDATE SET
        role = v_final_role,
        class = v_final_class,
        major = p_major;
  END IF;

  RETURN v_user_id;
END;
$$;

-- 3. PERBAIKAN DATA (REPAIR EXISTING TEACHERS)
-- Memastikan semua user yang role-nya 'teacher' di public, juga 'teacher' di auth metadata
-- Dan class-nya adalah STAFF
DO $$
BEGIN
  -- Update metadata auth.users agar sesuai dengan public.users
  UPDATE auth.users au
  SET raw_user_meta_data = jsonb_set(
      COALESCE(raw_user_meta_data, '{}'::jsonb),
      '{role}',
      '"teacher"'
  )
  FROM public.users pu
  WHERE au.id = pu.id AND pu.role = 'teacher';

  -- Update class guru menjadi STAFF jika masih 'Belum diatur'
  UPDATE public.users
  SET class = 'STAFF'
  WHERE role = 'teacher' AND (class IS NULL OR class = '' OR class = 'Belum diatur');
  
  -- Sinkronkan class di metadata juga
  UPDATE auth.users au
  SET raw_user_meta_data = jsonb_set(
      COALESCE(raw_user_meta_data, '{}'::jsonb),
      '{class}',
      '"STAFF"'
  )
  FROM public.users pu
  WHERE au.id = pu.id AND pu.role = 'teacher';
  
END $$;

COMMIT;

SELECT 'Role Guru & Logika Class Berhasil Diperbaiki (Revisi v2)' as status;

-- END: 48_Teacher Role Consistency Fix.sql

-- =====================================================================
-- START: 49_Admin Upsert User with Teacher Role Fix.sql
-- =====================================================================


-- =================================================================
-- FIX_RPC_AND_LOGIN.sql
-- 1. Perbaikan Fungsi Simpan User (Mengatasi Error "Could not find function")
-- 2. Perbaikan Trigger agar Role Guru tersimpan otomatis
-- =================================================================

BEGIN;

-- 1. Refresh Cache Schema (PENTING)
NOTIFY pgrst, 'reload config';

-- 2. Hapus fungsi lama (Bersihkan semua variasi)
DROP FUNCTION IF EXISTS public.admin_upsert_user(uuid, text, text, text, text, text, text, text, text, text);
DROP FUNCTION IF EXISTS public.admin_upsert_user(uuid, text, text, text, text, text, text, text, text, text, text);

-- 3. Buat Ulang Fungsi admin_upsert_user (FINAL VERSION)
-- Menggunakan DEFAULT NULL agar fleksibel terhadap parameter yang dikirim frontend
CREATE OR REPLACE FUNCTION public.admin_upsert_user(
  p_id uuid DEFAULT NULL,
  p_username text DEFAULT NULL,
  p_password text DEFAULT NULL,
  p_full_name text DEFAULT NULL,
  p_nisn text DEFAULT NULL,
  p_class text DEFAULT NULL,
  p_major text DEFAULT NULL,
  p_gender text DEFAULT NULL,
  p_religion text DEFAULT NULL,
  p_photo_url text DEFAULT NULL,
  p_role text DEFAULT 'student'
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER 
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id uuid;
  v_final_role text := COALESCE(p_role, 'student');
  v_final_class text := COALESCE(p_class, 'Belum diatur');
BEGIN
  -- Validasi Admin
  IF NOT (SELECT auth.email() = 'admin@cbtschool.com') THEN
    RAISE EXCEPTION '403: Forbidden - Hanya admin yang boleh mengubah data.';
  END IF;

  -- Logika Khusus Guru
  IF v_final_role = 'teacher' THEN
    -- Guru defaultnya kelas STAFF jika tidak diisi
    IF v_final_class IS NULL OR v_final_class = '' OR v_final_class = 'Belum diatur' THEN
        v_final_class := 'STAFF';
    END IF;
  END IF;

  IF p_id IS NOT NULL THEN
    -- === UPDATE USER ===
    v_user_id := p_id;

    -- Update Auth (Metadata)
    UPDATE auth.users
    SET
      email = p_username,
      raw_user_meta_data = jsonb_build_object(
        'full_name', p_full_name,
        'nisn', p_nisn,
        'class', v_final_class,
        'major', p_major,
        'gender', p_gender,
        'religion', p_religion,
        'photo_url', p_photo_url,
        'role', v_final_role,
        'password_text', p_password 
      ),
      updated_at = now()
    WHERE id = v_user_id;

    -- Update Password jika diisi
    IF p_password IS NOT NULL AND p_password <> '' THEN
      UPDATE auth.users
      SET encrypted_password = crypt(p_password, gen_salt('bf'))
      WHERE id = v_user_id;
    END IF;

    -- Update Public Table
    UPDATE public.users
    SET
      username = p_username,
      full_name = p_full_name,
      nisn = p_nisn,
      class = v_final_class,
      major = p_major,
      gender = p_gender,
      religion = p_religion,
      photo_url = p_photo_url,
      role = v_final_role,
      password_text = COALESCE(p_password, password_text),
      updated_at = now()
    WHERE id = v_user_id;

  ELSE
    -- === INSERT USER BARU ===
    v_user_id := uuid_generate_v4();
    
    INSERT INTO auth.users (
      id, email, encrypted_password, email_confirmed_at, raw_user_meta_data, aud, role
    )
    VALUES (
      v_user_id,
      p_username,
      crypt(COALESCE(p_password, p_nisn, '123456'), gen_salt('bf')),
      now(),
      jsonb_build_object(
        'full_name', p_full_name,
        'nisn', p_nisn,
        'class', v_final_class,
        'major', p_major,
        'gender', p_gender,
        'religion', p_religion,
        'photo_url', p_photo_url,
        'role', v_final_role,
        'password_text', p_password
      ),
      'authenticated',
      'authenticated'
    );
    
    -- Insert ke Public Users (Memastikan Role masuk)
    INSERT INTO public.users (id, username, full_name, role, class, major, gender, religion, nisn, photo_url, password_text)
    VALUES (
        v_user_id, p_username, p_full_name, v_final_role, v_final_class, p_major, p_gender, p_religion, p_nisn, p_photo_url, p_password
    )
    ON CONFLICT (id) DO UPDATE SET
        role = v_final_role,
        class = v_final_class,
        major = p_major,
        username = EXCLUDED.username;
    
  END IF;

  RETURN v_user_id;
END;
$$;

-- 4. Grant Permission
GRANT EXECUTE ON FUNCTION public.admin_upsert_user TO authenticated, service_role;

COMMIT;

SELECT 'Fungsi Simpan User Berhasil Diperbaiki.' as status;

-- END: 49_Admin Upsert User with Teacher Role Fix.sql

-- =====================================================================
-- START: 50_Repair Login Credentials (Students & Teachers).sql
-- =====================================================================


-- =================================================================
-- MASTER FIX: REPAIR LOGIN CREDENTIALS (STUDENT & TEACHER)
-- Jalankan script ini untuk memperbaiki error "Invalid login credentials"
-- =================================================================

BEGIN;

-- 1. Pastikan Ekstensi Enkripsi Aktif
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. [FIX] Pastikan Kolom school_domain Ada sebelum di-update
ALTER TABLE public.app_config 
ADD COLUMN IF NOT EXISTS school_domain TEXT DEFAULT 'smpn2demak.sch.id';

-- 3. Pastikan Domain Sekolah Konsisten
UPDATE public.app_config 
SET school_domain = 'smpn2demak.sch.id' 
WHERE id = 1;

-- 4. JALANKAN LOGIKA PERBAIKAN MASSAL
DO $$
DECLARE
    r RECORD;
    final_email TEXT;
    final_pass TEXT;
    v_domain TEXT;
    count_student INT := 0;
    count_teacher INT := 0;
BEGIN
    -- Ambil domain sekolah
    SELECT COALESCE(NULLIF(school_domain, ''), 'smpn2demak.sch.id') INTO v_domain FROM public.app_config LIMIT 1;

    -- Loop semua user (Kecuali Admin Utama)
    FOR r IN SELECT * FROM public.users WHERE username <> 'admin@cbtschool.com' LOOP
        
        -- === LOGIKA 1: MENENTUKAN EMAIL LOGIN ===
        IF r.role = 'teacher' THEN
            -- Guru: Gunakan Email asli mereka
            -- Jika username tidak valid email, tambahkan fake domain agar Supabase tidak error
            IF position('@' in r.username) > 0 THEN
                final_email := r.username;
            ELSE
                final_email := r.username || '@teacher.smpn2demak.sch.id';
            END IF;
        ELSE
            -- Siswa: Gunakan Format NISN@domain
            -- Fallback jika NISN kosong, gunakan username
            IF r.nisn IS NOT NULL AND r.nisn <> '' THEN
                final_email := r.nisn || '@' || v_domain;
            ELSE
                final_email := r.username || '@' || v_domain; 
            END IF;
        END IF;

        -- === LOGIKA 2: MENENTUKAN PASSWORD ===
        -- Prioritas: Password Text (Excel) > QR Password > NISN (Siswa) / Default (Guru)
        IF r.password_text IS NOT NULL AND r.password_text <> '' THEN
            final_pass := r.password_text;
        ELSIF r.qr_login_password IS NOT NULL AND r.qr_login_password <> '' THEN
            final_pass := r.qr_login_password;
        ELSE
            IF r.role = 'teacher' THEN
                final_pass := '123456'; -- Default password Guru jika kosong
            ELSE
                final_pass := r.nisn;   -- Default password Siswa (NISN)
            END IF;
        END IF;

        -- === LOGIKA 3: EKSEKUSI PERBAIKAN DI AUTH.USERS ===
        
        -- Cek apakah user sudah ada di Auth?
        IF EXISTS (SELECT 1 FROM auth.users WHERE id = r.id) THEN
            -- UPDATE CREDENTIALS
            UPDATE auth.users 
            SET 
                email = final_email,
                encrypted_password = crypt(final_pass, gen_salt('bf')),
                email_confirmed_at = now(),
                raw_user_meta_data = jsonb_build_object(
                    'full_name', r.full_name,
                    'nisn', r.nisn,
                    'class', r.class,
                    'role', COALESCE(r.role, 'student'),
                    'password_text', final_pass
                )
            WHERE id = r.id;
        ELSE
            -- RE-CREATE CREDENTIALS (Jika hilang)
            INSERT INTO auth.users (
                id, instance_id, email, encrypted_password, email_confirmed_at, 
                raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at
            ) VALUES (
                r.id,
                '00000000-0000-0000-0000-000000000000',
                final_email,
                crypt(final_pass, gen_salt('bf')),
                now(),
                '{"provider": "email", "providers": ["email"]}'::jsonb,
                jsonb_build_object(
                    'full_name', r.full_name,
                    'nisn', r.nisn,
                    'class', r.class,
                    'role', COALESCE(r.role, 'student'),
                    'password_text', final_pass
                ),
                'authenticated', 'authenticated', now(), now()
            );
        END IF;

        -- === LOGIKA 4: SINKRONISASI KEMBALI KE PUBLIC (DATA TAMPILAN) ===
        -- Agar Guru bisa login pakai email, dan Siswa pakai NISN (di frontend)
        UPDATE public.users 
        SET 
            username = CASE WHEN r.role = 'teacher' THEN final_email ELSE r.nisn END, -- Guru=Email, Siswa=NISN
            password_text = final_pass,
            qr_login_password = final_pass
        WHERE id = r.id;

        -- Counter
        IF r.role = 'teacher' THEN
            count_teacher := count_teacher + 1;
        ELSE
            count_student := count_student + 1;
        END IF;

    END LOOP;

    RAISE NOTICE 'Perbaikan Selesai. Guru: %, Siswa: %', count_teacher, count_student;
END $$;

COMMIT;

-- Konfirmasi Hasil
SELECT role, count(*) as jumlah_akun_aktif FROM public.users GROUP BY role;

-- END: 50_Repair Login Credentials (Students & Teachers).sql

-- =====================================================================
-- START: 51_Perbaikan & Sinkronisasi Akun Guru.sql
-- =====================================================================

-- GANTI '12345678' DENGAN USERNAME/NIP GURU YANG MAU DITEST
DO $$
DECLARE
    v_target_username text := '123456'; -- CONTOH: Masukkan NIP Guru disini
    v_user_id uuid;
    v_email text;
    v_pass text := '123456';
    v_domain text := 'smpn2demak.sch.id';
BEGIN
    -- 1. Ambil ID dari Public Users
    SELECT id INTO v_user_id FROM public.users WHERE username = v_target_username OR nisn = v_target_username;
    
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'User dengan username/NIP % tidak ditemukan di public.users', v_target_username;
    END IF;

    -- 2. Tentukan Email Format Baru (Wajib konsisten)
    -- Kita paksa format emailnya agar kita TAHU PASTI apa yang harus diketik saat login
    v_email := v_target_username || '@teacher.' || v_domain;

    RAISE NOTICE 'Memperbaiki User ID: % | Email Baru: %', v_user_id, v_email;

    -- 3. HARD DELETE DARI AUTH (Bersihkan sisa-sisa error)
    -- Kita hapus identity dan user authnya.
    -- NOTE: Data di public.users AMAN karena tidak kita delete.
    DELETE FROM auth.identities WHERE user_id = v_user_id;
    DELETE FROM auth.users WHERE id = v_user_id;

    -- 4. INSERT ULANG KE AUTH.USERS (Clean Slate)
    INSERT INTO auth.users (
        id, 
        instance_id, 
        email, 
        encrypted_password, 
        email_confirmed_at, 
        aud, 
        role, 
        raw_app_meta_data, 
        raw_user_meta_data, 
        created_at, 
        updated_at,
        is_sso_user
    ) VALUES (
        v_user_id, 
        '00000000-0000-0000-0000-000000000000', 
        v_email, 
        crypt(v_pass, extensions.gen_salt('bf', 10)), -- Paksa Cost 10 (Standar Supabase)
        now(), 
        'authenticated', 
        'authenticated', 
        '{"provider": "email", "providers": ["email"]}', 
        jsonb_build_object('role', 'teacher', 'full_name', 'Guru Reset', 'iss', 'https://api.supabase.co/auth/v1'), 
        now(), 
        now(),
        false
    );

    -- 5. INSERT ULANG KE AUTH.IDENTITIES (KUNCI UTAMA LOGIN EMAIL)
    -- Penting: provider_id HARUS email, bukan ID.
    INSERT INTO auth.identities (
        id, 
        user_id, 
        identity_data, 
        provider, 
        provider_id, 
        last_sign_in_at, 
        created_at, 
        updated_at
    ) VALUES (
        gen_random_uuid(), 
        v_user_id, 
        jsonb_build_object('sub', v_user_id, 'email', v_email, 'email_verified', true), 
        'email', 
        v_email, -- << INI YANG SERING SALAH. HARUS EMAIL.
        now(), 
        now(), 
        now()
    );

    -- 6. UPDATE PUBLIC USER AGAR SINKRON
    UPDATE public.users 
    SET 
        username = v_email, -- Update username public jadi email agar tidak bingung
        password_text = v_pass,
        role = 'teacher'
    WHERE id = v_user_id;

    RAISE NOTICE 'SUKSES! Silahkan login dengan Email: % dan Password: %', v_email, v_pass;

END $$;

-- END: 51_Perbaikan & Sinkronisasi Akun Guru.sql

-- =====================================================================
-- START: 52_Supabase Auth Schema & Trigger Repair.sql
-- =====================================================================

BEGIN;

-- 1. PERBAIKI HAK AKSES SCHEMA (Seringkali ini penyebab utama "Error querying schema")
-- Memberikan akses penuh ke schema public & extensions untuk role internal Supabase
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA extensions TO postgres, anon, authenticated, service_role;

-- Pastikan role auth (supabase_auth_admin) bisa membaca schema public 
-- (Penting jika ada trigger auth yang memanggil fungsi di public)
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO supabase_auth_admin;
GRANT ALL ON ALL TABLES IN SCHEMA public TO supabase_auth_admin;

-- 2. SET DEFAULT SEARCH PATH
-- Agar fungsi-fungsi tidak bingung mencari 'uuid_generate_v4' atau 'extensions'
DO $$
BEGIN
    BEGIN
        EXECUTE 'ALTER ROLE postgres SET search_path = public, extensions, auth';
    EXCEPTION
        WHEN insufficient_privilege OR undefined_object THEN
            RAISE NOTICE 'Skip ALTER ROLE postgres (insufficient privilege / role not found).';
    END;

    BEGIN
        EXECUTE 'ALTER ROLE service_role SET search_path = public, extensions, auth';
    EXCEPTION
        WHEN insufficient_privilege OR undefined_object THEN
            RAISE NOTICE 'Skip ALTER ROLE service_role (insufficient privilege / role not found).';
    END;

    BEGIN
        EXECUTE 'ALTER ROLE authenticated SET search_path = public, extensions, auth';
    EXCEPTION
        WHEN insufficient_privilege OR undefined_object THEN
            RAISE NOTICE 'Skip ALTER ROLE authenticated (insufficient privilege / role not found).';
    END;
END $$;

-- 3. MATIKAN TRIGGER YANG BERPOTENSI MERUSAK LOGIN
-- Kita akan mencari trigger pada 'auth.users' yang seringkali menjadi penyebab error saat update 'last_sign_in_at'

-- Hapus Trigger Sync yang mungkin error (Ganti nama jika Anda punya nama trigger spesifik)
-- Trigger umum yang sering dibuat manual:
DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;
DROP TRIGGER IF EXISTS on_user_update ON auth.users;
DROP TRIGGER IF EXISTS sync_user_update ON auth.users;

-- Hapus Fungsi Trigger-nya jika ada (Opsional, dinonaktifkan dulu agar login jalan)
-- DROP FUNCTION IF EXISTS public.handle_user_update(); 

-- 4. VALIDASI ULANG EXTENSION
CREATE EXTENSION IF NOT EXISTS "pgcrypto" SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" SCHEMA extensions;

-- 5. RE-SYNC MANUAL KHUSUS USER YANG GAGAL TADI (Hard Refresh)
-- Ganti 'EMAIL_GURU_YANG_GAGAL' dengan email guru yang Anda coba login
-- Ini memastikan user tersebut bersih dari metadata corrupt
UPDATE auth.users 
SET 
  updated_at = now(),
  email_confirmed_at = now(),
  raw_app_meta_data = '{"provider": "email", "providers": ["email"]}'::jsonb
WHERE role = 'teacher';

COMMIT;

-- END: 52_Supabase Auth Schema & Trigger Repair.sql

-- =====================================================================
-- START: 53_Perbaiki Error Schema Saat Login.sql
-- =====================================================================

-- =================================================================
-- FIX_SYSTEM_SCHEMA_ERROR.sql
-- TUJUAN: Memperbaiki "Database error querying schema" saat Login
-- METODE: Reset Search Path & Grant Permissions
-- =================================================================

BEGIN;

-- 1. PAKSA SEMUA ROLE MELIHAT SCHEMA YANG BENAR
-- Seringkali login gagal karena role 'postgres' atau 'service_role' 
-- tidak bisa melihat schema 'extensions' atau 'auth' secara default.

DO $$
BEGIN
    BEGIN
        EXECUTE 'ALTER ROLE postgres SET search_path = public, extensions, auth';
    EXCEPTION
        WHEN insufficient_privilege OR undefined_object THEN
            RAISE NOTICE 'Skip ALTER ROLE postgres (insufficient privilege / role not found).';
    END;

    BEGIN
        EXECUTE 'ALTER ROLE service_role SET search_path = public, extensions, auth';
    EXCEPTION
        WHEN insufficient_privilege OR undefined_object THEN
            RAISE NOTICE 'Skip ALTER ROLE service_role (insufficient privilege / role not found).';
    END;

    BEGIN
        EXECUTE 'ALTER ROLE authenticated SET search_path = public, extensions, auth';
    EXCEPTION
        WHEN insufficient_privilege OR undefined_object THEN
            RAISE NOTICE 'Skip ALTER ROLE authenticated (insufficient privilege / role not found).';
    END;

    BEGIN
        EXECUTE 'ALTER ROLE anon SET search_path = public, extensions, auth';
    EXCEPTION
        WHEN insufficient_privilege OR undefined_object THEN
            RAISE NOTICE 'Skip ALTER ROLE anon (insufficient privilege / role not found).';
    END;
END $$;

-- Khusus role internal Supabase Auth (penting!)
DO $$
BEGIN
    BEGIN
        EXECUTE 'ALTER ROLE supabase_admin SET search_path = public, extensions, auth';
    EXCEPTION
        WHEN insufficient_privilege OR undefined_object THEN
            RAISE NOTICE 'Skip ALTER ROLE supabase_admin (reserved role / insufficient privilege).';
    END;

    BEGIN
        EXECUTE 'ALTER ROLE supabase_auth_admin SET search_path = public, extensions, auth';
    EXCEPTION
        WHEN insufficient_privilege OR undefined_object THEN
            RAISE NOTICE 'Skip ALTER ROLE supabase_auth_admin (reserved role / insufficient privilege).';
    END;
END $$;

-- 2. PASTIKAN PERMISSIONS DIBUKA
-- Memberi izin role Auth untuk membaca schema public (jika ada trigger profile)
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role, supabase_auth_admin;
GRANT USAGE ON SCHEMA extensions TO postgres, anon, authenticated, service_role, supabase_auth_admin;

-- Beri akses fungsi-fungsi dasar ke semua user (agar tidak error saat generate token)
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA extensions TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA extensions TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA extensions TO anon;

-- 3. VALIDASI ULANG LOKASI EKSTENSI
-- Pastikan pgcrypto ada di schema 'extensions', bukan 'public' (penyebab bentrok)
CREATE EXTENSION IF NOT EXISTS "pgcrypto" SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" SCHEMA extensions;

-- 4. REFRESH SCHEMA CACHE SUPABASE
-- Memberitahu PostgREST API untuk reload konfigurasi
NOTIFY pgrst, 'reload config';

COMMIT;

-- END: 53_Perbaiki Error Schema Saat Login.sql

-- =====================================================================
-- START: 54_Repair auth triggers, roles, and teacher passwords.sql
-- =====================================================================

BEGIN;

-- 1. BERSIHKAN TRIGGER PENYEBAB "DATABASE ERROR QUERYING SCHEMA"
-- Trigger ini biasanya sisa tutorial lama yang mencoba sync user tapi codingnya salah.
-- Kita hapus dulu agar LOGIN BERHASIL. Nanti bisa dibuat ulang jika perlu.

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;
DROP TRIGGER IF EXISTS on_user_signup ON auth.users;

-- Hapus fungsinya juga jika ada (karena fungsi ini yang biasanya error)
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.handle_user_update() CASCADE;

-- 2. PERBAIKI HAK AKSES "SUPABASE_AUTH_ADMIN"
-- User sistem 'supabase_auth_admin' adalah aktor yang bekerja saat proses login.
-- Dia WAJIB bisa baca schema public. Jika tidak, login akan crash.

GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT USAGE ON SCHEMA extensions TO supabase_auth_admin;

-- Beri akses penuh ke tabel & fungsi public agar tidak ada error "Permission denied"
GRANT ALL ON ALL TABLES IN SCHEMA public TO supabase_auth_admin;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO supabase_auth_admin;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO supabase_auth_admin;

-- 3. PERBAIKI ROLE POSTGRES & SERVICE_ROLE (Agar Dashboard Admin aman)
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO postgres, service_role;

-- 4. FORCE RE-HASH PASSWORD GURU (Sekali lagi untuk memastikan)
-- Kita pastikan user Guru memiliki password yang valid dan status confirmed.
UPDATE auth.users
SET 
    encrypted_password = extensions.crypt('123456', extensions.gen_salt('bf')),
    email_confirmed_at = now(),
    raw_app_meta_data = '{"provider": "email", "providers": ["email"]}'::jsonb,
    updated_at = now()
WHERE id IN (SELECT id FROM public.users WHERE role = 'teacher');

-- 5. REFRESH SCHEMA CACHE
-- Memberitahu API Supabase untuk membaca ulang permission di atas.
NOTIFY pgrst, 'reload config';

COMMIT;

-- END: 54_Repair auth triggers, roles, and teacher passwords.sql

-- =====================================================================
-- START: 55_Pemulihan Akses & Diagnosa RLS pada tabel users.sql
-- =====================================================================

BEGIN;

-- 1. DIAGNOSA: MATIKAN SEMENTARA RLS DI TABEL USER
-- Ini adalah cara tercepat untuk membuktikan apakah Policy yang bikin crash.
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;

-- 2. BERIKAN AKSES EKSPLISIT (SAFEGUARD)
-- Memastikan role 'authenticated' (user yang login) boleh SELECT tabel users
GRANT SELECT, INSERT, UPDATE ON TABLE public.users TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.users TO service_role;

-- 3. PERBAIKI SEQUENCE (OPSIONAL TAPI PENTING)
-- Kadang error schema muncul karena ID auto-increment tidak sinkron
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- 4. PAKSA REFRESH SCHEMA CACHE
NOTIFY pgrst, 'reload config';

COMMIT;

-- END: 55_Pemulihan Akses & Diagnosa RLS pada tabel users.sql

-- =====================================================================
-- START: 56_Teacher Login Recovery & Upsert.sql
-- =====================================================================


-- =================================================================
-- FIX_TEACHER_LOGIN_FINAL.sql
-- SOLUSI PERMANEN ERROR "Database error querying schema"
-- =================================================================

BEGIN;

-- 1. REFRESH SCHEMA CACHE (SOLUSI UTAMA ERROR)
-- Ini memberitahu Supabase API untuk memuat ulang struktur database yang macet
NOTIFY pgrst, 'reload config';

-- 2. HAPUS SEMUA TRIGGER YANG BERPOTENSI MERUSAK LOGIN
-- Login mengupdate kolom 'last_sign_in_at', jika ada trigger di sini yang gagal, login akan gagal.
-- Kita hapus semua variasi nama trigger yang mungkin pernah dibuat.
DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;
DROP TRIGGER IF EXISTS on_user_update ON auth.users;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users; -- Hapus dulu agar bersih

-- 3. BUAT ULANG TRIGGER HANYA UNTUK INSERT (User Baru)
-- Fungsi handler insert
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (
    id, username, full_name, nisn, class, major, gender, religion, photo_url, role
  )
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data ->> 'full_name', 'User Baru'),
    COALESCE(new.raw_user_meta_data ->> 'nisn', split_part(new.email, '@', 1)),
    COALESCE(new.raw_user_meta_data ->> 'class', 'Belum diatur'),
    COALESCE(new.raw_user_meta_data ->> 'major', 'Belum diatur'),
    COALESCE(new.raw_user_meta_data ->> 'gender', 'Laki-laki'),
    COALESCE(new.raw_user_meta_data ->> 'religion', 'Islam'),
    COALESCE(new.raw_user_meta_data ->> 'photo_url', ''),
    COALESCE(new.raw_user_meta_data ->> 'role', 'student')
  )
  ON CONFLICT (id) DO UPDATE SET
    username = EXCLUDED.username,
    full_name = EXCLUDED.full_name,
    updated_at = now();
  RETURN new;
END;
$$;

-- Pasang kembali trigger HANYA untuk INSERT (AFTER INSERT)
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- 4. RESET IZIN AKSES (PERMISSIONS)
-- Memastikan role 'anon' dan 'authenticated' memiliki akses baca ke tabel publik
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO postgres, anon, authenticated, service_role;

-- 5. PERBAIKI KEBIJAKAN RLS UNTUK TABEL PUBLIC.USERS
-- Pastikan tidak ada kebijakan yang memblokir trigger atau select
DROP POLICY IF EXISTS "Public Read Access" ON public.users;
DROP POLICY IF EXISTS "Admin Full Access" ON public.users;
DROP POLICY IF EXISTS "Teacher can read users" ON public.users;

-- Kebijakan Umum: Semua orang bisa membaca data user (diperlukan untuk validasi login frontend)
CREATE POLICY "Public Read Access" ON public.users FOR SELECT USING (true);

-- Kebijakan Admin: Full Access
CREATE POLICY "Admin Full Access" ON public.users FOR ALL USING (
  (SELECT auth.email()) = 'admin@cbtschool.com'
);

-- 6. PASTIKAN RLS AKTIF
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

COMMIT;

-- Konfirmasi
SELECT 'Schema Cache Reloaded, Bad Triggers Removed & Permissions Fixed' as status;

-- END: 56_Teacher Login Recovery & Upsert.sql

-- =====================================================================
-- START: 57_Monitoring & Admin Device Reset Fix.sql
-- =====================================================================


-- =================================================================
-- FIX_MONITORING_RESET.sql (REVISI V2)
-- TUJUAN: 
-- 1. Membuka akses Admin ke tabel monitoring (Sesi & Jadwal)
-- 2. Memastikan fungsi Reset Device berfungsi
-- 3. Menangani error jika Realtime sudah aktif sebelumnya
-- =================================================================

BEGIN;

-- 1. PERBAIKI RLS UNTUK SESI UJIAN (Agar Admin bisa lihat semua)
ALTER TABLE public.student_exam_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin view all sessions" ON public.student_exam_sessions;
CREATE POLICY "Admin view all sessions" 
ON public.student_exam_sessions 
FOR ALL 
USING (
  auth.email() = 'admin@cbtschool.com' OR 
  (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'teacher')
);

-- 2. PERBAIKI RLS UNTUK JADWAL (Penyebab Loading Terus jika gagal load)
ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin view all schedules" ON public.schedules;
CREATE POLICY "Admin view all schedules" 
ON public.schedules 
FOR ALL 
USING (true); -- Jadwal aman dibaca publik (siswa butuh validasi token)

-- 3. AKTIFKAN REALTIME MONITORING (Safe Mode)
-- Cek dulu apakah tabel sudah ada di publikasi untuk menghindari error 42710
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    AND schemaname = 'public'
    AND tablename = 'student_exam_sessions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.student_exam_sessions;
  END IF;
END $$;

-- 4. PERBAIKI FUNGSI RESET DEVICE (Admin Reset)
CREATE OR REPLACE FUNCTION public.admin_reset_device_login(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Reset status login user
  UPDATE public.users
  SET 
    active_device_id = NULL,
    is_login_active = FALSE,
    last_device_info = NULL
  WHERE id = p_user_id;
  
  -- Opsional: Reset juga sesi ujiannya agar waktu kembali (jika diperlukan)
  -- UPDATE public.student_exam_sessions 
  -- SET status = 'Mengerjakan' 
  -- WHERE user_id = p_user_id AND status = 'Mengerjakan';
END;
$$;

COMMIT;

SELECT 'Monitoring & Reset Device Fixed (Safe Mode)' as status;

-- END: 57_Monitoring & Admin Device Reset Fix.sql

-- =====================================================================
-- START: 58_Profile Photo Defaults & New-User Trigger.sql
-- =====================================================================


-- =================================================================
-- SQL_FIX_PROFILE_PHOTOS.sql
-- TUJUAN:
-- 1. Mengisi foto profil siswa/admin yang masih kosong atau default.
-- 2. Memperbarui Trigger agar user baru otomatis dapat foto yang benar.
-- =================================================================

BEGIN;

-- 1. UPDATE DATA LAMA (EXISTING USERS)
-- Mengganti foto kosong dengan URL default sesuai gender/role
UPDATE public.users
SET photo_url = CASE 
    -- Jika Admin (Prioritas Tertinggi)
    WHEN role = 'admin' OR username = 'admin@cbtschool.com' THEN 'https://res.cloudinary.com/dt1nrarpq/image/upload/v1763714368/software-engineer_xgdvou.png'
    -- Jika Laki-laki
    WHEN gender IN ('Laki-laki', 'L') THEN 'https://res.cloudinary.com/dt1nrarpq/image/upload/v1763714039/boy_cdad6k.png'
    -- Jika Perempuan
    WHEN gender IN ('Perempuan', 'P') THEN 'https://res.cloudinary.com/dt1nrarpq/image/upload/v1763714039/girl_cuddqe.png'
    -- Jika Netral/Tidak diketahui
    ELSE 'https://res.cloudinary.com/dt1nrarpq/image/upload/v1771345702/student_xvfqk5.png'
END
WHERE photo_url IS NULL 
   OR photo_url = '' 
   OR photo_url LIKE 'https://ui-avatars.com%'
   OR role = 'admin'; -- Force update untuk admin agar sesuai request

-- 2. UPDATE TRIGGER handle_new_user
-- Agar setiap user baru (via Import Excel, Manual, atau Auth) otomatis dapat foto yang benar
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role text;
  v_class text;
  v_gender text;
  v_photo_url text;
  v_default_photo text;
BEGIN
  -- Ambil data dari metadata
  v_role := COALESCE(new.raw_user_meta_data ->> 'role', 'student');
  v_class := COALESCE(new.raw_user_meta_data ->> 'class', '');
  v_gender := COALESCE(new.raw_user_meta_data ->> 'gender', 'Laki-laki');
  v_photo_url := new.raw_user_meta_data ->> 'photo_url';

  -- Logika fallback untuk Class
  IF v_role = 'teacher' AND (v_class = '' OR v_class IS NULL OR v_class = 'Belum diatur') THEN
    v_class := 'STAFF';
  ELSIF v_class = '' OR v_class IS NULL THEN
    v_class := 'Belum diatur';
  END IF;

  -- Logika Foto Default Berdasarkan Role & Gender
  IF v_role = 'admin' THEN
      v_default_photo := 'https://res.cloudinary.com/dt1nrarpq/image/upload/v1763714368/software-engineer_xgdvou.png';
  ELSIF v_gender IN ('Laki-laki', 'L') THEN
      v_default_photo := 'https://res.cloudinary.com/dt1nrarpq/image/upload/v1763714039/boy_cdad6k.png';
  ELSIF v_gender IN ('Perempuan', 'P') THEN
      v_default_photo := 'https://res.cloudinary.com/dt1nrarpq/image/upload/v1763714039/girl_cuddqe.png';
  ELSE
      v_default_photo := 'https://res.cloudinary.com/dt1nrarpq/image/upload/v1771345702/student_xvfqk5.png';
  END IF;

  -- Gunakan foto dari metadata jika ada, jika tidak gunakan default
  IF v_photo_url IS NULL OR v_photo_url = '' THEN
      v_photo_url := v_default_photo;
  END IF;

  INSERT INTO public.users (
    id, username, full_name, nisn, class, major, gender, religion, photo_url, role, password_text, qr_login_password
  )
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data ->> 'full_name', 'Nama Belum Diatur'),
    COALESCE(new.raw_user_meta_data ->> 'nisn', split_part(new.email, '@', 1)),
    v_class,
    COALESCE(new.raw_user_meta_data ->> 'major', 'Belum diatur'),
    v_gender,
    COALESCE(new.raw_user_meta_data ->> 'religion', 'Islam'),
    v_photo_url, -- Gunakan URL foto yang sudah diproses
    v_role,
    new.raw_user_meta_data ->> 'password_text',
    new.raw_user_meta_data ->> 'password_text'
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role,
    class = EXCLUDED.class,
    major = EXCLUDED.major,
    gender = EXCLUDED.gender, -- Update gender juga
    -- Update foto hanya jika kosong atau jika user adalah admin (agar admin selalu dapat foto terbaru)
    photo_url = CASE 
        WHEN public.users.photo_url IS NULL OR public.users.photo_url = '' OR public.users.role = 'admin' 
        THEN EXCLUDED.photo_url 
        ELSE public.users.photo_url 
    END,
    username = EXCLUDED.username,
    updated_at = now();
  RETURN new;
END;
$$;

COMMIT;

-- Konfirmasi
SELECT count(*) as foto_diperbarui FROM public.users 
WHERE photo_url IN (
    'https://res.cloudinary.com/dt1nrarpq/image/upload/v1763714039/boy_cdad6k.png',
    'https://res.cloudinary.com/dt1nrarpq/image/upload/v1763714039/girl_cuddqe.png',
    'https://res.cloudinary.com/dt1nrarpq/image/upload/v1771345702/student_xvfqk5.png',
    'https://res.cloudinary.com/dt1nrarpq/image/upload/v1763714368/software-engineer_xgdvou.png'
);

-- END: 58_Profile Photo Defaults & New-User Trigger.sql

-- =====================================================================
-- START: 59_Perbaikan Persistensi Logo Kiri.sql
-- =====================================================================


-- =================================================================
-- FIX_LEFT_LOGO_PERSISTENCE.sql
-- TUJUAN: Memperbaiki masalah logo kiri tidak tersimpan.
-- Masalah ini terjadi karena kolom 'left_logo_url' belum ada di database.
-- =================================================================

BEGIN;

-- 1. Tambahkan kolom left_logo_url jika belum ada
ALTER TABLE public.app_config 
ADD COLUMN IF NOT EXISTS left_logo_url TEXT;

-- 2. Berikan komentar
COMMENT ON COLUMN public.app_config.left_logo_url IS 'URL Logo Pemerintah/Kabupaten (Posisi Kiri)';

-- 3. Paksa Refresh Cache Schema Supabase
-- Agar API segera mengenali kolom baru ini
NOTIFY pgrst, 'reload config';

COMMIT;

-- Konfirmasi: Tampilkan data saat ini
SELECT school_name, logo_url, left_logo_url FROM public.app_config WHERE id = 1;

-- END: 59_Perbaikan Persistensi Logo Kiri.sql

-- =====================================================================
-- START: 60_Teacher Login Repair and Sync.sql
-- =====================================================================


-- =================================================================
-- SQL_REPAIR_TEACHER_LOGINS.sql
-- MODUL: PERBAIKAN & SINKRONISASI AKUN GURU (MANUAL SYNC)
-- Jalankan script ini di SQL Editor Supabase
-- =================================================================

BEGIN;

-- 1. Pastikan ekstensi enkripsi aktif
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. FUNGSI PERBAIKAN LOGIN GURU (ENTERPRISE GRADE)
CREATE OR REPLACE FUNCTION public.repair_teacher_logins()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    r RECORD;
    v_domain TEXT;
    v_email TEXT;
    v_pass TEXT;
    count_fixed INT := 0;
    count_created INT := 0;
BEGIN
    -- Validasi Admin
    IF NOT (SELECT auth.email() = 'admin@cbtschool.com') THEN
        RAISE EXCEPTION '403: Forbidden - Access Denied';
    END IF;

    -- Ambil domain sekolah dari konfigurasi
    SELECT COALESCE(NULLIF(school_domain, ''), 'smpn2demak.sch.id') INTO v_domain FROM public.app_config LIMIT 1;

    -- Loop semua user dengan role 'teacher'
    FOR r IN SELECT * FROM public.users WHERE role = 'teacher' LOOP
        
        -- A. TENTUKAN PASSWORD
        -- Prioritas: Password Text (Input Admin) > '123456' (Default)
        IF r.password_text IS NOT NULL AND r.password_text <> '' THEN
            v_pass := r.password_text;
        ELSE
            v_pass := '123456'; -- Default password guru jika tidak diatur
        END IF;

        -- B. TENTUKAN EMAIL (Username Login)
        -- Jika username sudah format email, gunakan. Jika tidak, format manual.
        IF position('@' in r.username) > 0 THEN
            v_email := r.username;
        ELSE
            -- Format standar: username@teacher.domain
            v_email := r.username || '@teacher.' || v_domain;
        END IF;

        -- C. EKSEKUSI PERBAIKAN (UPSERT KE AUTH.USERS)
        
        -- Cek apakah akun auth sudah ada
        IF EXISTS (SELECT 1 FROM auth.users WHERE id = r.id) THEN
            -- UPDATE (Reset Password & Email)
            UPDATE auth.users 
            SET 
                email = v_email,
                encrypted_password = crypt(v_pass, gen_salt('bf', 10)),
                email_confirmed_at = now(),
                raw_user_meta_data = jsonb_build_object(
                    'full_name', r.full_name,
                    'nisn', r.nisn, -- NIP/ID
                    'class', 'STAFF',
                    'major', r.major,
                    'role', 'teacher',
                    'password_text', v_pass
                ),
                updated_at = now()
            WHERE id = r.id;
            
            count_fixed := count_fixed + 1;
        ELSE
            -- CREATE (Jika hilang di sistem login)
            INSERT INTO auth.users (
                id, instance_id, email, encrypted_password, email_confirmed_at, 
                raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at
            ) VALUES (
                r.id, -- PENTING: ID harus sama dengan public.users
                '00000000-0000-0000-0000-000000000000',
                v_email,
                crypt(v_pass, gen_salt('bf', 10)),
                now(),
                '{"provider": "email", "providers": ["email"]}'::jsonb,
                jsonb_build_object(
                    'full_name', r.full_name,
                    'nisn', r.nisn,
                    'class', 'STAFF',
                    'major', r.major,
                    'role', 'teacher',
                    'password_text', v_pass
                ),
                'authenticated', 'authenticated', now(), now()
            );
            
            count_created := count_created + 1;
        END IF;
        
        -- D. PASTIKAN IDENTITY ADA (Penting untuk Supabase Auth v2)
        INSERT INTO auth.identities (
            id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
        ) VALUES (
            uuid_generate_v4(), -- Generate ID baru untuk identity
            r.id,
            jsonb_build_object('sub', r.id, 'email', v_email),
            'email',
            v_email, -- Provider ID adalah email
            now(), now(), now()
        ) ON CONFLICT (provider, provider_id) DO UPDATE 
        SET identity_data = EXCLUDED.identity_data, updated_at = now();

        -- E. UPDATE KEMBALI PUBLIC USER (Agar konsisten)
        UPDATE public.users 
        SET 
            password_text = v_pass, 
            qr_login_password = v_pass 
        WHERE id = r.id;

    END LOOP;

    RETURN json_build_object(
        'status', 'success',
        'fixed', count_fixed,
        'created', count_created,
        'message', 'Sukses! ' || (count_fixed + count_created) || ' akun guru telah diperbaiki dan disinkronkan.'
    );
END;
$$;

COMMIT;

SELECT 'Fungsi repair_teacher_logins berhasil diinstal.' as status;

-- END: 60_Teacher Login Repair and Sync.sql

-- =====================================================================
-- START: 61_Teacher & Student Import and Login Fix.sql
-- =====================================================================


-- =================================================================
-- SQL_FIX_TEACHER_IMPORT.sql
-- MODUL: PERBAIKAN LOGIC IMPORT & LOGIN GURU (ENTERPRISE)
-- Jalankan script ini di SQL Editor Supabase
-- =================================================================

BEGIN;

-- 1. Pastikan ekstensi enkripsi aktif
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. UPDATE FUNGSI IMPORT (AGAR CERDAS MENDETEKSI GURU)
CREATE OR REPLACE FUNCTION public.admin_import_users(users_data json)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  updated_count int;
  inserted_count int;
  v_domain text;
  v_teacher_domain text;
BEGIN
  -- Validasi Admin
  IF NOT (SELECT auth.email() = 'admin@cbtschool.com') THEN
    RAISE EXCEPTION '403: Forbidden';
  END IF;

  -- Ambil Domain Sekolah
  SELECT COALESCE(NULLIF(school_domain, ''), 'smpn2demak.sch.id') INTO v_domain FROM public.app_config LIMIT 1;
  v_teacher_domain := 'teacher.' || v_domain;

  -- Buat tabel sementara
  CREATE TEMP TABLE incoming_users_import (
    "username" text,
    "password" text,
    "fullName" text,
    "nisn" text,
    "class" text,
    "major" text,
    "gender" text,
    "religion" text,
    "photoUrl" text,
    "role" text
  ) ON COMMIT DROP;

  INSERT INTO incoming_users_import
  SELECT * FROM json_populate_recordset(null::incoming_users_import, users_data);
  
  -- NORMALISASI DATA
  -- 1. Jika Role kosong, default ke student
  UPDATE incoming_users_import SET role = 'student' WHERE role IS NULL OR role = '';
  
  -- 2. Jika Guru, pastikan Kelas = STAFF (jika kosong)
  UPDATE incoming_users_import SET class = 'STAFF' WHERE role = 'teacher' AND (class IS NULL OR class = '');

  -- 3. Jika Guru, Username tidak boleh kosong. Jika Siswa, NISN tidak boleh kosong.
  IF EXISTS (SELECT 1 FROM incoming_users_import WHERE role = 'student' AND (nisn IS NULL OR nisn = '')) THEN
    RAISE EXCEPTION 'Data Siswa Invalid: NISN wajib diisi.';
  END IF;
  
  IF EXISTS (SELECT 1 FROM incoming_users_import WHERE role = 'teacher' AND (username IS NULL OR username = '')) THEN
    RAISE EXCEPTION 'Data Guru Invalid: Username wajib diisi.';
  END IF;

  -- =========================================================
  -- LOGIKA UPDATE (UPSERT)
  -- =========================================================
  
  -- A. Update Auth Users (Login)
  UPDATE auth.users au
  SET 
    -- LOGIKA EMAIL PINTAR:
    -- Jika Guru: username@teacher.domain
    -- Jika Siswa: nisn@domain
    email = CASE 
        WHEN i.role = 'teacher' THEN i."username" || '@' || v_teacher_domain
        ELSE i."nisn" || '@' || v_domain 
    END,
    encrypted_password = crypt(i."password", gen_salt('bf')),
    email_confirmed_at = now(),
    raw_user_meta_data = jsonb_build_object(
          'full_name', i."fullName",
          'nisn', i."nisn",
          'class', i."class",
          'major', i."major",
          'role', i."role",
          'password_text', i."password"
    ),
    updated_at = now()
  FROM incoming_users_import i
  JOIN public.users pu ON (
      -- Kunci Unik: Jika siswa pakai NISN, Jika Guru pakai Username
      (i.role = 'student' AND pu.nisn = i.nisn) OR 
      (i.role = 'teacher' AND pu.username = i.username)
  )
  WHERE au.id = pu.id;

  -- B. Update Public Users (Profil)
  WITH updated_public_users AS (
      UPDATE public.users pu
      SET
        full_name = i."fullName",
        class = i."class",
        major = i."major",
        gender = i."gender",
        religion = i."religion",
        photo_url = COALESCE(i."photoUrl", pu.photo_url),
        password_text = i."password",
        qr_login_password = i."password",
        role = i."role",
        updated_at = now()
      FROM incoming_users_import i
      WHERE (i.role = 'student' AND pu.nisn = i.nisn) OR (i.role = 'teacher' AND pu.username = i.username)
      RETURNING pu.id
  )
  SELECT count(*) INTO updated_count FROM updated_public_users;

  -- =========================================================
  -- LOGIKA INSERT BARU
  -- =========================================================
  
  WITH new_auth_users AS (
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at, 
      raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at
    )
    SELECT
      uuid_generate_v4(),
      '00000000-0000-0000-0000-000000000000',
      -- Generate Email
      CASE 
        WHEN i.role = 'teacher' THEN i."username" || '@' || v_teacher_domain
        ELSE i."nisn" || '@' || v_domain 
      END,
      crypt(i."password", gen_salt('bf')),
      now(),
      '{"provider": "email", "providers": ["email"]}'::jsonb,
      jsonb_build_object(
          'full_name', i."fullName",
          'nisn', i."nisn",
          'class', i."class",
          'major', i."major",
          'gender', i."gender",
          'religion', i."religion",
          'photo_url', COALESCE(i."photoUrl", 'https://ui-avatars.com/api/?name=' || i."fullName"),
          'password_text', i."password",
          'role', i."role"
      ),
      'authenticated',
      'authenticated',
      now(),
      now()
    FROM incoming_users_import i
    WHERE NOT EXISTS (
        SELECT 1 FROM public.users pu 
        WHERE (i.role = 'student' AND pu.nisn = i.nisn) OR (i.role = 'teacher' AND pu.username = i.username)
    )
    RETURNING id, email, raw_user_meta_data
  )
  -- Insert ke Public Users
  INSERT INTO public.users (id, username, full_name, nisn, class, major, gender, religion, photo_url, password_text, qr_login_password, role)
  SELECT 
    nau.id,
    -- Untuk Public Users:
    -- Guru: Username biasa (misal: 'pakbudi') agar enak dilihat
    -- Siswa: NISN (misal: '12345')
    CASE 
        WHEN (nau.raw_user_meta_data->>'role') = 'teacher' THEN split_part(nau.email, '@', 1) 
        ELSE (nau.raw_user_meta_data->>'nisn')
    END,
    (nau.raw_user_meta_data->>'full_name'),
    (nau.raw_user_meta_data->>'nisn'),
    (nau.raw_user_meta_data->>'class'),
    (nau.raw_user_meta_data->>'major'),
    (nau.raw_user_meta_data->>'gender'),
    (nau.raw_user_meta_data->>'religion'),
    (nau.raw_user_meta_data->>'photo_url'),
    (nau.raw_user_meta_data->>'password_text'),
    (nau.raw_user_meta_data->>'password_text'),
    (nau.raw_user_meta_data->>'role')
  FROM new_auth_users nau;

  SELECT count(*) INTO inserted_count FROM incoming_users_import i 
  WHERE NOT EXISTS (
      SELECT 1 FROM public.users pu 
      WHERE (i.role = 'student' AND pu.nisn = i.nisn) OR (i.role = 'teacher' AND pu.username = i.username)
  ); 

  -- 3. INSERT IDENTITIES (CRITICAL FIX FOR LOGIN)
  INSERT INTO auth.identities (
    id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
  )
  SELECT
    uuid_generate_v4(),
    au.id,
    jsonb_build_object('sub', au.id, 'email', au.email),
    'email',
    au.email,
    now(), now(), now()
  FROM auth.users au
  WHERE NOT EXISTS (SELECT 1 FROM auth.identities WHERE user_id = au.id);

  RETURN json_build_object(
    'success', true,
    'updated', updated_count,
    'inserted', inserted_count,
    'total', updated_count + inserted_count
  );
END;
$$;

COMMIT;

SELECT 'Sistem Import Guru & Siswa Berhasil Diperbarui.' as status;

-- END: 61_Teacher & Student Import and Login Fix.sql

-- =====================================================================
-- START: 62_Perbaikan Fungsi Hapus User & Refresh Cache Supabase.sql
-- =====================================================================


-- =================================================================
-- SQL_FIX_DELETE_USER.sql
-- MODUL: PERBAIKAN FUNGSI HAPUS USER & REFRESH CACHE
-- Jalankan script ini untuk mengatasi error "function not found in schema cache"
-- =================================================================

BEGIN;

-- 1. Refresh Cache Schema Supabase (SOLUSI UTAMA)
-- Ini memberitahu API Supabase untuk memuat ulang daftar fungsi yang tersedia
NOTIFY pgrst, 'reload config';

-- 2. Hapus fungsi lama untuk menghindari konflik
DROP FUNCTION IF EXISTS public.admin_delete_user(uuid);

-- 3. Buat Ulang Fungsi Hapus User (Versi Aman)
CREATE OR REPLACE FUNCTION public.admin_delete_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER -- Berjalan sebagai superuser (wajib untuk hapus auth.users)
SET search_path = public, extensions
AS $$
BEGIN
  -- Validasi: Hanya Admin yang boleh menghapus
  IF NOT (SELECT auth.email() = 'admin@cbtschool.com') THEN
    RAISE EXCEPTION '403: Forbidden - Akses Ditolak.';
  END IF;

  -- Validasi: Jangan biarkan Admin menghapus dirinya sendiri
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION '400: Anda tidak dapat menghapus akun Anda sendiri.';
  END IF;

  -- Eksekusi Hapus dari Auth (Otomatis cascade ke public.users)
  DELETE FROM auth.users WHERE id = p_user_id;
  
  -- Jika foreign key cascade tidak aktif (jarang terjadi, tapi untuk jaga-jaga), hapus manual:
  DELETE FROM public.users WHERE id = p_user_id;

END;
$$;

COMMIT;

-- Konfirmasi
SELECT 'Fungsi Hapus User berhasil diperbarui & Cache di-refresh.' as status;

-- END: 62_Perbaikan Fungsi Hapus User & Refresh Cache Supabase.sql

-- =====================================================================
-- START: 63_Fix Teacher Role Assignments.sql
-- =====================================================================


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

-- END: 63_Fix Teacher Role Assignments.sql

-- =====================================================================
-- START: 64_Teacher Login Credentials Repair.sql
-- =====================================================================


-- =================================================================
-- SQL_FIX_TEACHER_LOGIN_CREDENTIALS.sql
-- TUJUAN: Memperbaiki login Guru yang gagal terus menerus.
-- 1. Memastikan email di sistem Auth sesuai format: username@teacher.domain
-- 2. Memaksa reset password di sistem Auth agar sama dengan 'Password Asli' (password_text)
-- =================================================================

BEGIN;

-- 1. Pastikan ekstensi enkripsi aktif
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Update konfigurasi domain sekolah (Hardcode untuk kepastian)
UPDATE public.app_config 
SET school_domain = 'smpn2demak.sch.id' 
WHERE id = 1;

-- 3. EKSEKUSI PERBAIKAN MASSAL KHUSUS GURU
DO $$
DECLARE
    r RECORD;
    v_domain TEXT := 'smpn2demak.sch.id';
    v_target_email TEXT;
    v_target_pass TEXT;
    v_clean_username TEXT;
    count_fixed INT := 0;
BEGIN
    -- Loop hanya untuk user dengan role 'teacher'
    FOR r IN SELECT * FROM public.users WHERE role = 'teacher' LOOP
        
        -- A. TENTUKAN USERNAME BERSIH
        -- Ambil bagian depan sebelum @ jika ada, atau ambil utuh
        v_clean_username := split_part(r.username, '@', 1);

        -- B. TENTUKAN PASSWORD YANG AKAN DIPAKAI
        -- Prioritas: password_text (dari Excel/Input) > qr_login_password > default '123456'
        IF r.password_text IS NOT NULL AND r.password_text <> '' THEN
            v_target_pass := r.password_text;
        ELSIF r.qr_login_password IS NOT NULL AND r.qr_login_password <> '' THEN
            v_target_pass := r.qr_login_password;
        ELSE
            v_target_pass := '123456'; -- Default password jika kosong
        END IF;

        -- C. TENTUKAN EMAIL LOGIN (Sesuai Logika Frontend LoginScreenGuru.tsx)
        -- Format: username@teacher.smpn2demak.sch.id
        v_target_email := v_clean_username || '@teacher.' || v_domain;

        -- D. UPDATE AUTH.USERS (Sistem Login Inti)
        -- Kita cari user berdasarkan ID yang sama di public.users
        IF EXISTS (SELECT 1 FROM auth.users WHERE id = r.id) THEN
            UPDATE auth.users 
            SET 
                email = v_target_email,
                encrypted_password = crypt(v_target_pass, gen_salt('bf')),
                email_confirmed_at = now(),
                updated_at = now(),
                raw_app_meta_data = '{"provider": "email", "providers": ["email"]}'::jsonb,
                raw_user_meta_data = jsonb_build_object(
                    'full_name', r.full_name,
                    'nisn', v_clean_username, -- Gunakan username sebagai ID
                    'class', 'STAFF',
                    'role', 'teacher',
                    'major', r.major,
                    'password_text', v_target_pass
                )
            WHERE id = r.id;
        ELSE
            -- Jika akun auth hilang, buat baru (Restore)
            INSERT INTO auth.users (
                id, instance_id, email, encrypted_password, email_confirmed_at, 
                raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at
            ) VALUES (
                r.id,
                '00000000-0000-0000-0000-000000000000',
                v_target_email,
                crypt(v_target_pass, gen_salt('bf')),
                now(),
                '{"provider": "email", "providers": ["email"]}'::jsonb,
                jsonb_build_object(
                    'full_name', r.full_name,
                    'nisn', v_clean_username,
                    'class', 'STAFF',
                    'role', 'teacher',
                    'password_text', v_target_pass
                ),
                'authenticated', 'authenticated', now(), now()
            );
        END IF;

        -- E. SINKRONISASI IDENTITIES (Penting untuk Supabase baru)
        -- Hapus identitas lama yang mungkin konflik
        DELETE FROM auth.identities WHERE user_id = r.id;
        
        -- Masukkan identitas baru yang sesuai email baru
        INSERT INTO auth.identities (
            id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
        ) VALUES (
            uuid_generate_v4(),
            r.id,
            jsonb_build_object('sub', r.id, 'email', v_target_email),
            'email',
            v_target_email,
            now(), now(), now()
        );

        -- F. UPDATE PUBLIC.USERS (Data Tampilan)
        -- Simpan username bersih (tanpa @teacher...) agar mudah dibaca di tabel admin
        -- Simpan password text agar admin bisa melihatnya
        UPDATE public.users 
        SET 
            username = v_clean_username, 
            password_text = v_target_pass,
            qr_login_password = v_target_pass,
            class = 'STAFF', -- Pastikan class STAFF
            role = 'teacher' -- Pastikan role teacher
        WHERE id = r.id;

        count_fixed := count_fixed + 1;
    END LOOP;

    RAISE NOTICE 'Selesai! % Akun Guru berhasil diperbaiki.', count_fixed;
END $$;

COMMIT;

-- 4. Tampilkan Hasil (Kredensial yang Valid)
SELECT full_name, username, password_text as "PASSWORD LOGIN" 
FROM public.users 
WHERE role = 'teacher';

-- END: 64_Teacher Login Credentials Repair.sql

-- =====================================================================
-- START: 65_Force Teacher Domain Sync.sql
-- =====================================================================


-- =================================================================
-- FIX_TEACHER_DOMAIN_SYNC.sql
-- TUJUAN: MEMAKSA SYSTEM MENGGUNAKAN DOMAIN DARI MENU KONFIGURASI
-- =================================================================

BEGIN;

-- 1. FUNGSI SINKRONISASI AKUN GURU (YANG DIKLIK ADMIN)
-- Fungsi ini sekarang akan membaca 'email_domain' dari tabel app_config
CREATE OR REPLACE FUNCTION public.repair_teacher_logins()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    r RECORD;
    v_config_domain TEXT;
    v_clean_domain TEXT;
    v_email TEXT;
    v_pass TEXT;
    count_fixed INT := 0;
    count_created INT := 0;
BEGIN
    -- Ambil domain AKTIF dari tabel konfigurasi
    SELECT email_domain INTO v_config_domain FROM public.app_config WHERE id = 1;
    
    -- Bersihkan karakter '@' di depan jika ada (misal: @sekolah.id -> sekolah.id)
    v_clean_domain := REGEXP_REPLACE(v_config_domain, '^@', '');
    
    -- Fallback jika konfigurasi kosong
    IF v_clean_domain IS NULL OR v_clean_domain = '' THEN
        v_clean_domain := 'smpn2demak.sch.id'; 
    END IF;

    -- Loop semua user dengan role 'teacher'
    FOR r IN SELECT * FROM public.users WHERE role = 'teacher' LOOP
        
        -- A. TENTUKAN PASSWORD (Prioritas: Password Text > Default)
        v_pass := COALESCE(NULLIF(r.password_text, ''), '123456');

        -- B. TENTUKAN EMAIL LOGIN (FORMAT: username@teacher.[DOMAIN_KONFIGURASI])
        -- Kita bersihkan username dari karakter @ dan spasi
        v_email := regexp_replace(r.username, '@.*', '') || '@teacher.' || v_clean_domain;

        -- C. UPDATE / INSERT KE AUTH (Sistem Login)
        IF EXISTS (SELECT 1 FROM auth.users WHERE id = r.id) THEN
            UPDATE auth.users 
            SET 
                email = v_email, -- Update email sesuai config terbaru
                encrypted_password = crypt(v_pass, gen_salt('bf', 10)),
                email_confirmed_at = now(),
                raw_user_meta_data = jsonb_build_object(
                    'full_name', r.full_name,
                    'nisn', r.username, -- Gunakan username sebagai ID referensi
                    'class', 'STAFF',
                    'major', r.major,
                    'role', 'teacher',
                    'password_text', v_pass
                ),
                updated_at = now()
            WHERE id = r.id;
            
            count_fixed := count_fixed + 1;
        ELSE
            -- Buat baru jika hilang
            INSERT INTO auth.users (
                id, instance_id, email, encrypted_password, email_confirmed_at, 
                raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at
            ) VALUES (
                r.id,
                '00000000-0000-0000-0000-000000000000',
                v_email,
                crypt(v_pass, gen_salt('bf', 10)),
                now(),
                '{"provider": "email", "providers": ["email"]}'::jsonb,
                jsonb_build_object(
                    'full_name', r.full_name,
                    'nisn', r.username,
                    'class', 'STAFF',
                    'major', r.major,
                    'role', 'teacher',
                    'password_text', v_pass
                ),
                'authenticated', 'authenticated', now(), now()
            );
            count_created := count_created + 1;
        END IF;
        
        -- D. PASTIKAN IDENTITY JUGA UPDATE (Agar login jalan)
        DELETE FROM auth.identities WHERE user_id = r.id; -- Hapus identitas lama yang mungkin salah domain
        
        INSERT INTO auth.identities (
            id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
        ) VALUES (
            uuid_generate_v4(),
            r.id,
            jsonb_build_object('sub', r.id, 'email', v_email),
            'email',
            v_email,
            now(), now(), now()
        );

        -- E. KEMBALIKAN PASSWORD TEXT KE PUBLIC (Agar admin bisa lihat)
        UPDATE public.users 
        SET password_text = v_pass, qr_login_password = v_pass 
        WHERE id = r.id;

    END LOOP;

    RETURN json_build_object(
        'status', 'success',
        'fixed', count_fixed,
        'created', count_created,
        'domain_used', v_clean_domain,
        'message', 'Sukses! Data guru disinkronkan menggunakan domain: ' || v_clean_domain
    );
END;
$$;

-- 2. UPDATE FUNGSI IMPORT (AGAR SAAT IMPORT CSV JUGA PAKAI DOMAIN CONFIG)
CREATE OR REPLACE FUNCTION public.admin_import_users(users_data json)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  updated_count int;
  inserted_count int;
  v_config_domain text;
  v_clean_domain text;
  v_teacher_domain text;
BEGIN
  IF NOT (SELECT auth.email() = 'admin@cbtschool.com') THEN
    RAISE EXCEPTION '403: Forbidden';
  END IF;

  -- AMBIL DOMAIN DINAMIS
  SELECT email_domain INTO v_config_domain FROM public.app_config WHERE id = 1;
  v_clean_domain := REGEXP_REPLACE(v_config_domain, '^@', '');
  IF v_clean_domain IS NULL OR v_clean_domain = '' THEN v_clean_domain := 'smpn2demak.sch.id'; END IF;
  
  v_teacher_domain := 'teacher.' || v_clean_domain;

  CREATE TEMP TABLE incoming_users_import (
    "username" text, "password" text, "fullName" text, "nisn" text, "class" text, "major" text, "gender" text, "religion" text, "photoUrl" text, "role" text
  ) ON COMMIT DROP;

  INSERT INTO incoming_users_import
  SELECT * FROM json_populate_recordset(null::incoming_users_import, users_data);
  
  UPDATE incoming_users_import SET role = 'student' WHERE role IS NULL OR role = '';
  UPDATE incoming_users_import SET class = 'STAFF' WHERE role = 'teacher' AND (class IS NULL OR class = '');

  -- Update Auth dengan Domain yang Benar
  UPDATE auth.users au
  SET 
    email = CASE 
        WHEN i.role = 'teacher' THEN i."username" || '@' || v_teacher_domain -- INI KUNCINYA
        ELSE i."nisn" || '@' || v_clean_domain 
    END,
    encrypted_password = crypt(i."password", gen_salt('bf')),
    raw_user_meta_data = jsonb_build_object(
          'full_name', i."fullName", 'nisn', i."nisn", 'class', i."class", 'major', i."major", 'role', i."role", 'password_text', i."password"
    ),
    updated_at = now()
  FROM incoming_users_import i
  JOIN public.users pu ON ((i.role = 'student' AND pu.nisn = i.nisn) OR (i.role = 'teacher' AND pu.username = i.username))
  WHERE au.id = pu.id;

  -- Update Public
  WITH updated_public_users AS (
      UPDATE public.users pu
      SET full_name = i."fullName", class = i."class", major = i."major", gender = i."gender", religion = i."religion", photoUrl = COALESCE(i."photoUrl", pu.photo_url), password_text = i."password", qr_login_password = i."password", role = i."role", updated_at = now()
      FROM incoming_users_import i
      WHERE (i.role = 'student' AND pu.nisn = i.nisn) OR (i.role = 'teacher' AND pu.username = i.username)
      RETURNING pu.id
  )
  SELECT count(*) INTO updated_count FROM updated_public_users;

  -- Insert Baru (Juga pakai domain dinamis)
  WITH new_auth_users AS (
    INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at)
    SELECT
      uuid_generate_v4(), '00000000-0000-0000-0000-000000000000',
      CASE 
        WHEN i.role = 'teacher' THEN i."username" || '@' || v_teacher_domain 
        ELSE i."nisn" || '@' || v_clean_domain 
      END,
      crypt(i."password", gen_salt('bf')), now(), '{"provider": "email", "providers": ["email"]}'::jsonb,
      jsonb_build_object('full_name', i."fullName", 'nisn', i."nisn", 'class', i."class", 'major', i."major", 'gender', i."gender", 'religion', i."religion", 'photo_url', COALESCE(i."photoUrl", ''), 'password_text', i."password", 'role', i."role"),
      'authenticated', 'authenticated', now(), now()
    FROM incoming_users_import i
    WHERE NOT EXISTS (SELECT 1 FROM public.users pu WHERE (i.role = 'student' AND pu.nisn = i.nisn) OR (i.role = 'teacher' AND pu.username = i.username))
    RETURNING id, email, raw_user_meta_data
  )
  INSERT INTO public.users (id, username, full_name, nisn, class, major, gender, religion, photo_url, password_text, qr_login_password, role)
  SELECT 
    nau.id,
    CASE WHEN (nau.raw_user_meta_data->>'role') = 'teacher' THEN split_part(nau.email, '@', 1) ELSE (nau.raw_user_meta_data->>'nisn') END,
    (nau.raw_user_meta_data->>'full_name'), (nau.raw_user_meta_data->>'nisn'), (nau.raw_user_meta_data->>'class'), (nau.raw_user_meta_data->>'major'), (nau.raw_user_meta_data->>'gender'), (nau.raw_user_meta_data->>'religion'), (nau.raw_user_meta_data->>'photo_url'), (nau.raw_user_meta_data->>'password_text'), (nau.raw_user_meta_data->>'password_text'), (nau.raw_user_meta_data->>'role')
  FROM new_auth_users nau;

  SELECT count(*) INTO inserted_count FROM incoming_users_import i WHERE NOT EXISTS (SELECT 1 FROM public.users pu WHERE (i.role = 'student' AND pu.nisn = i.nisn) OR (i.role = 'teacher' AND pu.username = i.username));

  -- Insert Identities (Login Fix)
  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  SELECT uuid_generate_v4(), au.id, jsonb_build_object('sub', au.id, 'email', au.email), 'email', au.email, now(), now(), now()
  FROM auth.users au WHERE NOT EXISTS (SELECT 1 FROM auth.identities WHERE user_id = au.id);

  RETURN json_build_object('success', true, 'updated', updated_count, 'inserted', inserted_count, 'domain_used', v_clean_domain);
END;
$$;

COMMIT;

-- EKSEKUSI PERBAIKAN SEKARANG JUGA
SELECT public.repair_teacher_logins();

-- END: 65_Force Teacher Domain Sync.sql

-- =====================================================================
-- START: 66_Fix Add User Button Function.sql
-- =====================================================================


-- =================================================================
-- FIX_ADD_USER_BUTTON.sql
-- TUJUAN: Memperbaiki tombol Simpan/Tambah User yang macet.
-- MASALAH: Frontend mengirim parameter 'p_role' tapi database belum siap.
-- =================================================================

BEGIN;

-- 1. Refresh Cache Schema (Penting agar API Supabase sadar ada perubahan)
NOTIFY pgrst, 'reload config';

-- 2. Hapus versi fungsi lama untuk menghindari konflik (Overloading)
DROP FUNCTION IF EXISTS public.admin_upsert_user(uuid, text, text, text, text, text, text, text, text, text);
DROP FUNCTION IF EXISTS public.admin_upsert_user(uuid, text, text, text, text, text, text, text, text, text, text);

-- 3. Buat Ulang Fungsi admin_upsert_user (Versi Kompatibel Penuh)
-- Menggunakan DEFAULT NULL untuk parameter agar tidak error jika ada yang kosong.
CREATE OR REPLACE FUNCTION public.admin_upsert_user(
  p_id uuid DEFAULT NULL,
  p_username text DEFAULT NULL,
  p_password text DEFAULT NULL,
  p_full_name text DEFAULT NULL,
  p_nisn text DEFAULT NULL,
  p_class text DEFAULT NULL,
  p_major text DEFAULT NULL,
  p_gender text DEFAULT NULL,
  p_religion text DEFAULT NULL,
  p_photo_url text DEFAULT NULL,
  p_role text DEFAULT 'student' -- Parameter ini yang sering menyebabkan error jika hilang
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER 
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id uuid;
  v_final_role text := COALESCE(p_role, 'student');
  v_final_class text := COALESCE(p_class, 'Belum diatur');
BEGIN
  -- Validasi Admin
  IF NOT (SELECT auth.email() = 'admin@cbtschool.com') THEN
    RAISE EXCEPTION '403: Forbidden - Hanya admin yang boleh mengubah data.';
  END IF;

  -- Logika Guru: Jika class kosong, set STAFF otomatis
  IF v_final_role = 'teacher' THEN
    IF p_class IS NULL OR p_class = '' OR p_class = 'Belum diatur' THEN
        v_final_class := 'STAFF';
    END IF;
  END IF;

  -- Validasi Role (Safety check)
  IF v_final_role NOT IN ('student', 'teacher', 'admin') THEN
     v_final_role := 'student';
  END IF;

  IF p_id IS NOT NULL THEN
    -- === UPDATE USER ===
    v_user_id := p_id;

    -- Update Auth Users (Metadata & Login)
    UPDATE auth.users
    SET
      email = p_username,
      raw_user_meta_data = jsonb_build_object(
        'full_name', p_full_name,
        'nisn', p_nisn,
        'class', v_final_class,
        'major', p_major,
        'gender', p_gender,
        'religion', p_religion,
        'photo_url', p_photo_url,
        'role', v_final_role,
        'password_text', p_password
      ),
      updated_at = now()
    WHERE id = v_user_id;

    -- Update Password HANYA JIKA DIISI
    IF p_password IS NOT NULL AND p_password <> '' THEN
      UPDATE auth.users SET encrypted_password = crypt(p_password, gen_salt('bf')) WHERE id = v_user_id;
    END IF;

    -- Update Public Users (Data Tampilan)
    UPDATE public.users
    SET
      username = p_username,
      full_name = p_full_name,
      nisn = p_nisn,
      class = v_final_class,
      major = p_major,
      gender = p_gender,
      religion = p_religion,
      photo_url = p_photo_url,
      role = v_final_role,
      password_text = COALESCE(p_password, password_text), -- Update password text jika ada baru
      updated_at = now()
    WHERE id = v_user_id;

  ELSE
    -- === INSERT USER BARU ===
    v_user_id := uuid_generate_v4();
    
    -- Insert ke Auth Users
    INSERT INTO auth.users (
      id, email, encrypted_password, email_confirmed_at, raw_user_meta_data, aud, role
    )
    VALUES (
      v_user_id,
      p_username,
      crypt(COALESCE(p_password, p_nisn, '123456'), gen_salt('bf')), -- Default password jika kosong
      now(),
      jsonb_build_object(
        'full_name', p_full_name,
        'nisn', p_nisn,
        'class', v_final_class,
        'major', p_major,
        'gender', p_gender,
        'religion', p_religion,
        'photo_url', p_photo_url,
        'role', v_final_role,
        'password_text', p_password
      ),
      'authenticated',
      'authenticated'
    );
    
    -- Insert ke Public Users (Menggunakan ON CONFLICT untuk keamanan ganda)
    INSERT INTO public.users (
        id, username, full_name, nisn, class, major, gender, religion, photo_url, role, password_text
    ) VALUES (
        v_user_id, p_username, p_full_name, p_nisn, v_final_class, p_major, p_gender, p_religion, p_photo_url, v_final_role, p_password
    )
    ON CONFLICT (id) DO UPDATE SET
        username = EXCLUDED.username,
        full_name = EXCLUDED.full_name,
        class = EXCLUDED.class,
        role = EXCLUDED.role;
        
  END IF;

  RETURN v_user_id;
END;
$$;

-- 4. Berikan Izin Eksekusi
GRANT EXECUTE ON FUNCTION public.admin_upsert_user TO authenticated, service_role;

COMMIT;

SELECT 'Sukses! Fungsi Simpan User telah diperbaiki.' as status;

-- END: 66_Fix Add User Button Function.sql

-- =====================================================================
-- START: 67_Perbaikan photo_url pada import pengguna.sql
-- =====================================================================


-- =================================================================
-- FIX_IMPORT_PHOTO_URL_ERROR.sql
-- TUJUAN: Memperbaiki error "column photourl does not exist" saat import.
-- MASALAH: Typo nama kolom pada fungsi import (photourl vs photo_url).
-- =================================================================

BEGIN;

-- 1. Refresh Cache Schema
NOTIFY pgrst, 'reload config';

-- 2. Update Fungsi Import dengan Nama Kolom yang Benar
CREATE OR REPLACE FUNCTION public.admin_import_users(users_data json)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  updated_count int;
  inserted_count int;
  v_config_domain text;
  v_clean_domain text;
  v_teacher_domain text;
BEGIN
  IF NOT (SELECT auth.email() = 'admin@cbtschool.com') THEN
    RAISE EXCEPTION '403: Forbidden';
  END IF;

  -- AMBIL DOMAIN DINAMIS
  SELECT email_domain INTO v_config_domain FROM public.app_config WHERE id = 1;
  v_clean_domain := REGEXP_REPLACE(v_config_domain, '^@', '');
  IF v_clean_domain IS NULL OR v_clean_domain = '' THEN v_clean_domain := 'smpn2demak.sch.id'; END IF;
  
  v_teacher_domain := 'teacher.' || v_clean_domain;

  -- Temp table sesuai format JSON dari frontend (CamelCase)
  CREATE TEMP TABLE incoming_users_import (
    "username" text,
    "password" text,
    "fullName" text,
    "nisn" text,
    "class" text,
    "major" text,
    "gender" text,
    "religion" text,
    "photoUrl" text, -- Nama di JSON/CSV
    "role" text
  ) ON COMMIT DROP;

  INSERT INTO incoming_users_import
  SELECT * FROM json_populate_recordset(null::incoming_users_import, users_data);
  
  -- Normalisasi Data
  UPDATE incoming_users_import SET role = 'student' WHERE role IS NULL OR role = '';
  UPDATE incoming_users_import SET class = 'STAFF' WHERE role = 'teacher' AND (class IS NULL OR class = '');

  -- Update Auth Users
  UPDATE auth.users au
  SET 
    email = CASE 
        WHEN i.role = 'teacher' THEN i."username" || '@' || v_teacher_domain
        ELSE i."nisn" || '@' || v_clean_domain 
    END,
    encrypted_password = crypt(i."password", gen_salt('bf')),
    raw_user_meta_data = jsonb_build_object(
          'full_name', i."fullName", 
          'nisn', i."nisn", 
          'class', i."class", 
          'major', i."major", 
          'role', i."role", 
          'password_text', i."password",
          'photo_url', i."photoUrl"
    ),
    updated_at = now()
  FROM incoming_users_import i
  JOIN public.users pu ON ((i.role = 'student' AND pu.nisn = i.nisn) OR (i.role = 'teacher' AND pu.username = i.username))
  WHERE au.id = pu.id;

  -- Update Public Users (PERBAIKAN UTAMA DI SINI)
  WITH updated_public_users AS (
      UPDATE public.users pu
      SET 
        full_name = i."fullName", 
        class = i."class", 
        major = i."major", 
        gender = i."gender", 
        religion = i."religion", 
        -- FIX: Gunakan kolom 'photo_url' (snake_case) yang benar
        photo_url = COALESCE(i."photoUrl", pu.photo_url), 
        password_text = i."password", 
        qr_login_password = i."password", 
        role = i."role", 
        updated_at = now()
      FROM incoming_users_import i
      WHERE (i.role = 'student' AND pu.nisn = i.nisn) OR (i.role = 'teacher' AND pu.username = i.username)
      RETURNING pu.id
  )
  SELECT count(*) INTO updated_count FROM updated_public_users;

  -- Insert Baru
  WITH new_auth_users AS (
    INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at)
    SELECT
      uuid_generate_v4(), '00000000-0000-0000-0000-000000000000',
      CASE 
        WHEN i.role = 'teacher' THEN i."username" || '@' || v_teacher_domain 
        ELSE i."nisn" || '@' || v_clean_domain 
      END,
      crypt(i."password", gen_salt('bf')), now(), '{"provider": "email", "providers": ["email"]}'::jsonb,
      jsonb_build_object(
          'full_name', i."fullName", 
          'nisn', i."nisn", 
          'class', i."class", 
          'major', i."major", 
          'gender', i."gender", 
          'religion', i."religion", 
          'photo_url', COALESCE(i."photoUrl", ''), 
          'password_text', i."password", 
          'role', i."role"
      ),
      'authenticated', 'authenticated', now(), now()
    FROM incoming_users_import i
    WHERE NOT EXISTS (SELECT 1 FROM public.users pu WHERE (i.role = 'student' AND pu.nisn = i.nisn) OR (i.role = 'teacher' AND pu.username = i.username))
    RETURNING id, email, raw_user_meta_data
  )
  INSERT INTO public.users (id, username, full_name, nisn, class, major, gender, religion, photo_url, password_text, qr_login_password, role)
  SELECT 
    nau.id,
    CASE WHEN (nau.raw_user_meta_data->>'role') = 'teacher' THEN split_part(nau.email, '@', 1) ELSE (nau.raw_user_meta_data->>'nisn') END,
    (nau.raw_user_meta_data->>'full_name'), 
    (nau.raw_user_meta_data->>'nisn'), 
    (nau.raw_user_meta_data->>'class'), 
    (nau.raw_user_meta_data->>'major'), 
    (nau.raw_user_meta_data->>'gender'), 
    (nau.raw_user_meta_data->>'religion'), 
    (nau.raw_user_meta_data->>'photo_url'), -- FIX: Mapping ke photo_url yang benar
    (nau.raw_user_meta_data->>'password_text'), 
    (nau.raw_user_meta_data->>'password_text'), 
    (nau.raw_user_meta_data->>'role')
  FROM new_auth_users nau;

  SELECT count(*) INTO inserted_count FROM incoming_users_import i WHERE NOT EXISTS (SELECT 1 FROM public.users pu WHERE (i.role = 'student' AND pu.nisn = i.nisn) OR (i.role = 'teacher' AND pu.username = i.username));

  -- Insert Identities
  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  SELECT uuid_generate_v4(), au.id, jsonb_build_object('sub', au.id, 'email', au.email), 'email', au.email, now(), now(), now()
  FROM auth.users au WHERE NOT EXISTS (SELECT 1 FROM auth.identities WHERE user_id = au.id);

  RETURN json_build_object('success', true, 'updated', updated_count, 'inserted', inserted_count, 'domain_used', v_clean_domain);
END;
$$;

COMMIT;

SELECT 'Sukses! Fungsi import telah diperbaiki (photo_url fix).' as status;

-- END: 67_Perbaikan photo_url pada import pengguna.sql

-- =====================================================================
-- START: 68_Fix Double-Domain Email Import.sql
-- =====================================================================


-- =================================================================
-- FIX_DOUBLE_DOMAIN_IMPORT.sql
-- TUJUAN: Mencegah & Memperbaiki email ganda (user@a.com@b.com)
-- =================================================================

BEGIN;

-- 1. Refresh Cache Schema
NOTIFY pgrst, 'reload config';

-- 2. Update Fungsi Import dengan Logika Email "Pintar"
CREATE OR REPLACE FUNCTION public.admin_import_users(users_data json)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  updated_count int;
  inserted_count int;
  v_config_domain text;
  v_clean_domain text;
  v_teacher_domain text;
BEGIN
  IF NOT (SELECT auth.email() = 'admin@cbtschool.com') THEN
    RAISE EXCEPTION '403: Forbidden';
  END IF;

  -- AMBIL DOMAIN DINAMIS
  SELECT email_domain INTO v_config_domain FROM public.app_config WHERE id = 1;
  v_clean_domain := REGEXP_REPLACE(v_config_domain, '^@', '');
  IF v_clean_domain IS NULL OR v_clean_domain = '' THEN v_clean_domain := 'smpn2demak.sch.id'; END IF;
  
  v_teacher_domain := 'teacher.' || v_clean_domain;

  -- Temp table
  CREATE TEMP TABLE incoming_users_import (
    "username" text,
    "password" text,
    "fullName" text,
    "nisn" text,
    "class" text,
    "major" text,
    "gender" text,
    "religion" text,
    "photoUrl" text,
    "role" text
  ) ON COMMIT DROP;

  INSERT INTO incoming_users_import
  SELECT * FROM json_populate_recordset(null::incoming_users_import, users_data);
  
  -- Normalisasi Data
  UPDATE incoming_users_import SET role = 'student' WHERE role IS NULL OR role = '';
  UPDATE incoming_users_import SET class = 'STAFF' WHERE role = 'teacher' AND (class IS NULL OR class = '');

  -- Update Auth Users
  UPDATE auth.users au
  SET 
    -- FIX LOGIC: Ambil username murni (split_part) sebelum tambah domain
    email = CASE 
        WHEN i.role = 'teacher' THEN split_part(i."username", '@', 1) || '@' || v_teacher_domain
        ELSE i."nisn" || '@' || v_clean_domain 
    END,
    encrypted_password = crypt(i."password", gen_salt('bf')),
    raw_user_meta_data = jsonb_build_object(
          'full_name', i."fullName", 
          'nisn', i."nisn", 
          'class', i."class", 
          'major', i."major", 
          'role', i."role", 
          'password_text', i."password",
          'photo_url', i."photoUrl"
    ),
    updated_at = now()
  FROM incoming_users_import i
  JOIN public.users pu ON ((i.role = 'student' AND pu.nisn = i.nisn) OR (i.role = 'teacher' AND split_part(pu.username, '@', 1) = split_part(i."username", '@', 1)))
  WHERE au.id = pu.id;

  -- Update Public Users
  WITH updated_public_users AS (
      UPDATE public.users pu
      SET 
        full_name = i."fullName", 
        class = i."class", 
        major = i."major", 
        gender = i."gender", 
        religion = i."religion", 
        photo_url = COALESCE(i."photoUrl", pu.photo_url), 
        password_text = i."password", 
        qr_login_password = i."password", 
        role = i."role", 
        -- Update username publik agar bersih juga
        username = CASE 
            WHEN i.role = 'teacher' THEN split_part(i."username", '@', 1) || '@' || v_teacher_domain
            ELSE i."nisn" || '@' || v_clean_domain 
        END,
        updated_at = now()
      FROM incoming_users_import i
      WHERE (i.role = 'student' AND pu.nisn = i.nisn) OR (i.role = 'teacher' AND split_part(pu.username, '@', 1) = split_part(i."username", '@', 1))
      RETURNING pu.id
  )
  SELECT count(*) INTO updated_count FROM updated_public_users;

  -- Insert Baru
  WITH new_auth_users AS (
    INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at)
    SELECT
      uuid_generate_v4(), '00000000-0000-0000-0000-000000000000',
      -- FIX LOGIC INSERT: Split part juga disini
      CASE 
        WHEN i.role = 'teacher' THEN split_part(i."username", '@', 1) || '@' || v_teacher_domain 
        ELSE i."nisn" || '@' || v_clean_domain 
      END,
      crypt(i."password", gen_salt('bf')), now(), '{"provider": "email", "providers": ["email"]}'::jsonb,
      jsonb_build_object(
          'full_name', i."fullName", 
          'nisn', i."nisn", 
          'class', i."class", 
          'major', i."major", 
          'gender', i."gender", 
          'religion', i."religion", 
          'photo_url', COALESCE(i."photoUrl", ''), 
          'password_text', i."password", 
          'role', i."role"
      ),
      'authenticated', 'authenticated', now(), now()
    FROM incoming_users_import i
    WHERE NOT EXISTS (
        SELECT 1 FROM public.users pu 
        WHERE (i.role = 'student' AND pu.nisn = i.nisn) 
           OR (i.role = 'teacher' AND split_part(pu.username, '@', 1) = split_part(i."username", '@', 1))
    )
    RETURNING id, email, raw_user_meta_data
  )
  INSERT INTO public.users (id, username, full_name, nisn, class, major, gender, religion, photo_url, password_text, qr_login_password, role)
  SELECT 
    nau.id,
    -- Simpan username lengkap yang benar di public.users
    nau.email,
    (nau.raw_user_meta_data->>'full_name'), 
    (nau.raw_user_meta_data->>'nisn'), 
    (nau.raw_user_meta_data->>'class'), 
    (nau.raw_user_meta_data->>'major'), 
    (nau.raw_user_meta_data->>'gender'), 
    (nau.raw_user_meta_data->>'religion'), 
    (nau.raw_user_meta_data->>'photo_url'), 
    (nau.raw_user_meta_data->>'password_text'), 
    (nau.raw_user_meta_data->>'password_text'), 
    (nau.raw_user_meta_data->>'role')
  FROM new_auth_users nau;

  SELECT count(*) INTO inserted_count FROM incoming_users_import i WHERE NOT EXISTS (SELECT 1 FROM public.users pu WHERE (i.role = 'student' AND pu.nisn = i.nisn) OR (i.role = 'teacher' AND split_part(pu.username, '@', 1) = split_part(i."username", '@', 1)));

  -- Insert Identities
  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  SELECT uuid_generate_v4(), au.id, jsonb_build_object('sub', au.id, 'email', au.email), 'email', au.email, now(), now(), now()
  FROM auth.users au WHERE NOT EXISTS (SELECT 1 FROM auth.identities WHERE user_id = au.id);

  RETURN json_build_object('success', true, 'updated', updated_count, 'inserted', inserted_count, 'domain_used', v_clean_domain);
END;
$$;

-- 3. JALANKAN PEMBERSIHAN DATA (AUTO-FIX DATA YANG SUDAH RUSAK)
DO $$
DECLARE
    r RECORD;
    clean_user text;
    v_config_domain text;
    v_clean_domain text;
    fixed_email text;
BEGIN
    -- Ambil domain
    SELECT email_domain INTO v_config_domain FROM public.app_config WHERE id = 1;
    v_clean_domain := REGEXP_REPLACE(v_config_domain, '^@', '');
    IF v_clean_domain IS NULL OR v_clean_domain = '' THEN v_clean_domain := 'smpn2demak.sch.id'; END IF;

    -- Cari user yang emailnya aneh (berisi 2 kali '@')
    FOR r IN SELECT id, email FROM auth.users WHERE email LIKE '%@%@%' LOOP
        -- Ambil username paling depan (sebelum @ pertama)
        clean_user := split_part(r.email, '@', 1);
        
        -- Bentuk email baru yang benar (asumsi guru karena format ini sering terjadi di guru)
        fixed_email := clean_user || '@teacher.' || v_clean_domain;
        
        -- Update Auth
        UPDATE auth.users SET email = fixed_email WHERE id = r.id;
        
        -- Update Public
        UPDATE public.users SET username = fixed_email WHERE id = r.id;
        
        -- Update Identity (Penting agar bisa login)
        UPDATE auth.identities SET 
            provider_id = fixed_email,
            identity_data = jsonb_build_object('sub', r.id, 'email', fixed_email)
        WHERE user_id = r.id;
        
        RAISE NOTICE 'Fixed double domain for user: % -> %', r.email, fixed_email;
    END LOOP;
END $$;

COMMIT;

SELECT 'Sukses! Logika Import Guru diperbaiki & Data rusak telah dibersihkan.' as status;

-- END: 68_Fix Double-Domain Email Import.sql

-- =====================================================================
-- START: 69_Admin QR Login Fix.sql
-- =====================================================================


-- =================================================================
-- FIX_ADMIN_QR_LOGIN.sql
-- PERBAIKAN TOTAL: LOGIN ADMIN VIA SCAN QR
-- 1. Mengisi qr_login_password admin agar bisa login.
-- 2. Membuat RPC untuk lookup password berdasarkan UUID dari QR.
-- =================================================================

BEGIN;

-- 1. Pastikan ekstensi enkripsi aktif
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Pastikan kolom pendukung ada
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS qr_login_password TEXT;

-- 3. FUNGSI RPC: GET ADMIN PASSWORD BY UUID (Smart Lookup)
-- Fungsi ini dipanggil frontend saat QR discan. 
-- Input: UUID dari QR. Output: Password text (untuk dipakai login client-side).
CREATE OR REPLACE FUNCTION public.get_admin_password_by_uuid(p_uuid text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER -- Berjalan sebagai superuser untuk bypass RLS
SET search_path = public, extensions
AS $$
DECLARE
  v_password text;
  v_uuid uuid;
BEGIN
  -- Validasi format UUID
  BEGIN
    v_uuid := p_uuid::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN NULL;
  END;

  -- Cari user dengan ID tersebut dan pastikan dia ADMIN
  SELECT 
    COALESCE(qr_login_password, password_text, 'admin123') INTO v_password
  FROM public.users
  WHERE id = v_uuid 
    AND (role = 'admin' OR username = 'admin@cbtschool.com');
    
  RETURN v_password;
END;
$$;

-- 4. UPDATE DATA ADMIN (TARGET SPESIFIK UUID DARI PDF)
-- UUID dari Log: 452c8ad0-5823-4523-aa8e-53e5fe86a0bb
DO $$
DECLARE
  v_admin_uuid uuid := '452c8ad0-5823-4523-aa8e-53e5fe86a0bb';
  v_admin_email text := 'admin@cbtschool.com';
  v_password_fix text := 'admin123'; -- Password fallback yang pasti jalan
BEGIN
  
  -- A. Pastikan Admin dengan UUID ini ada di public.users
  -- Jika ID admin sekarang beda, kita update ID-nya agar sesuai QR PDF
  -- (Hati-hati: ini mengubah ID admin yang sedang aktif jika ada)
  
  -- Normalisasi konflik unik agar idempotent (username/email admin bisa sudah ada dari patch sebelumnya)
  DELETE FROM public.users
  WHERE username = v_admin_email
    AND id <> v_admin_uuid;

  DELETE FROM auth.identities ai
  USING auth.users au
  WHERE ai.user_id = au.id
    AND au.email = v_admin_email
    AND au.id <> v_admin_uuid;

  DELETE FROM auth.users
  WHERE email = v_admin_email
    AND id <> v_admin_uuid;

  -- B. UPDATE AUTH.USERS (SISTEM LOGIN)
  -- Kita harus memastikan akun auth untuk UUID ini ada dan passwordnya 'admin123'
  IF EXISTS (SELECT 1 FROM auth.users WHERE id = v_admin_uuid) THEN
      UPDATE auth.users 
      SET encrypted_password = crypt(v_password_fix, gen_salt('bf')),
          email = v_admin_email,
          email_confirmed_at = now(),
          raw_user_meta_data = jsonb_build_object('role', 'admin', 'full_name', 'Administrator'),
          updated_at = now()
      WHERE id = v_admin_uuid;
  ELSE
      -- Jika user auth dengan UUID ini belum ada, buat baru
      INSERT INTO auth.users (
        id, instance_id, email, encrypted_password, email_confirmed_at, 
        raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at
      ) VALUES (
        v_admin_uuid,
        '00000000-0000-0000-0000-000000000000',
        v_admin_email,
        crypt(v_password_fix, gen_salt('bf')),
        now(),
        '{"provider": "email", "providers": ["email"]}'::jsonb,
        '{"role": "admin", "full_name": "Administrator"}'::jsonb,
        'authenticated', 'authenticated', now(), now()
      );
  END IF;

  -- C. UPSERT public.users setelah auth.users siap (menghindari FK violation)
  INSERT INTO public.users (id, username, full_name, role, qr_login_password, gender)
  VALUES (v_admin_uuid, v_admin_email, 'Administrator Utama', 'admin', v_password_fix, 'Laki-laki')
  ON CONFLICT (id) DO UPDATE SET
    qr_login_password = v_password_fix,
    role = 'admin',
    username = v_admin_email,
    full_name = 'Administrator Utama';

END $$;

COMMIT;

-- 5. Berikan izin eksekusi RPC ke public (anon)
GRANT EXECUTE ON FUNCTION public.get_admin_password_by_uuid(text) TO anon, authenticated, service_role;

SELECT 'Sukses! Admin QR Fix Applied via RPC & Data Sync.' as status;

-- END: 69_Admin QR Login Fix.sql

-- =====================================================================
-- START: 70_Perbaikan Darurat Reset Admin & Kompatibilitas QR.sql
-- =====================================================================


-- =================================================================
-- EMERGENCY_FIX_ADMIN.sql
-- TUJUAN:
-- 1. Mereset Password Admin ke '1234567890' (Sesuai Permintaan).
-- 2. Memastikan user admin@cbtschool.com ada dan aktif.
-- 3. Memperbaiki fungsi QR agar bisa membaca QR lama (UUID) maupun baru.
-- =================================================================

BEGIN;

-- 1. Pastikan Ekstensi Aktif
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. FUNGSI SMART LOOKUP PASSWORD (REVISI)
-- Fungsi ini dipanggil oleh Frontend saat scan QR Legacy (versi lama)
CREATE OR REPLACE FUNCTION public.get_admin_password_by_uuid(p_uuid text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_password text;
  v_real_admin_id uuid;
  -- UUID ini sering muncul di PDF lama, kita hardcode untuk handling khusus
  v_hardcoded_uuid text := '452c8ad0-5823-4523-aa8e-53e5fe86a0bb'; 
BEGIN
  -- Cari ID admin yang BENAR-BENAR ada di database (berdasarkan email)
  SELECT id INTO v_real_admin_id FROM auth.users WHERE email = 'admin@cbtschool.com' LIMIT 1;

  -- Jika QR berisi UUID hardcoded lama, kembalikan password admin saat ini
  IF p_uuid = v_hardcoded_uuid AND v_real_admin_id IS NOT NULL THEN
      SELECT COALESCE(qr_login_password, password_text, '1234567890') INTO v_password
      FROM public.users WHERE id = v_real_admin_id;
  ELSE
      -- Normal lookup berdasarkan UUID dinamis
      SELECT COALESCE(qr_login_password, password_text, '1234567890') INTO v_password
      FROM public.users WHERE id = p_uuid::uuid;
  END IF;
    
  RETURN v_password;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

-- 3. RESET PASSWORD ADMIN (LOGIKA AMAN)
DO $$
DECLARE
  v_email text := 'admin@cbtschool.com';
  v_pass text := '1234567890'; -- Password BARU sesuai request
  v_admin_id uuid;
BEGIN
  -- Cari ID Admin
  SELECT id INTO v_admin_id FROM auth.users WHERE email = v_email;

  IF v_admin_id IS NOT NULL THEN
    -- A. Admin Sudah Ada -> UPDATE Password
    UPDATE auth.users 
    SET encrypted_password = crypt(v_pass, gen_salt('bf')),
        email_confirmed_at = now(),
        updated_at = now(),
        raw_user_meta_data = jsonb_build_object('role', 'admin', 'full_name', 'Administrator', 'is_admin', true)
    WHERE id = v_admin_id;

    -- Update Public User juga agar sinkron untuk QR Code
    UPDATE public.users
    SET password_text = v_pass,
        qr_login_password = v_pass,
        role = 'admin',
        full_name = 'Administrator Utama'
    WHERE id = v_admin_id;
    
  ELSE
    -- B. Admin Belum Ada -> CREATE BARU
    v_admin_id := uuid_generate_v4();
    
    INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, role, raw_user_meta_data, aud)
    VALUES (
      v_admin_id, 
      v_email, 
      crypt(v_pass, gen_salt('bf')), 
      now(), 
      'authenticated',
      '{"full_name": "Administrator", "role": "admin", "is_admin": true}'::jsonb,
      'authenticated'
    );

    INSERT INTO public.users (id, username, full_name, role, password_text, qr_login_password, gender, religion)
    VALUES (v_admin_id, v_email, 'Administrator Utama', 'admin', v_pass, v_pass, 'Laki-laki', 'Islam')
    ON CONFLICT (username) DO UPDATE SET
      full_name = EXCLUDED.full_name,
      role = 'admin',
      password_text = EXCLUDED.password_text,
      qr_login_password = EXCLUDED.qr_login_password,
      updated_at = now();
  END IF;
  
  -- Berikan hak akses RPC ke publik agar bisa diakses saat login (sebelum auth)
  GRANT EXECUTE ON FUNCTION public.get_admin_password_by_uuid(text) TO anon, authenticated, service_role;

END $$;

COMMIT;

SELECT 'BERHASIL: Password Admin direset ke "1234567890". Silakan login manual atau scan QR.' as status;

-- END: 70_Perbaikan Darurat Reset Admin & Kompatibilitas QR.sql

-- =====================================================================
-- START: 71_Patch questions table for matching options and RLS.sql
-- =====================================================================


-- =================================================================
-- FIX_QUESTION_INSERT.sql
-- TUJUAN:
-- 1. Memastikan kolom `matching_right_options` ada dengan tipe data yang benar.
-- 2. Memastikan RLS memungkinkan INSERT/UPDATE oleh role authenticated (Admin/Teacher).
-- 3. Merefresh cache API Supabase.
-- =================================================================

BEGIN;

-- 1. Pastikan kolom ada (Idempotent)
ALTER TABLE public.questions 
ADD COLUMN IF NOT EXISTS matching_right_options text[];

COMMENT ON COLUMN public.questions.matching_right_options IS 'Array opsi sebelah kanan untuk soal tipe Menjodohkan';

-- 2. Pastikan RLS Policy mengizinkan Authenticated Users (Admin/Guru) untuk mengelola Questions
-- Hapus policy lama yang mungkin terlalu restriktif
DROP POLICY IF EXISTS "Admin can manage questions" ON public.questions;
DROP POLICY IF EXISTS "Authenticated can manage questions" ON public.questions;

-- Buat policy baru yang lebih eksplisit
CREATE POLICY "Authenticated can manage questions" 
ON public.questions 
FOR ALL 
TO authenticated 
USING (true) 
WITH CHECK (true);

-- 3. REFRESH SCHEMA CACHE (SOLUSI UTAMA JIKA KOLOM TIDAK TERBACA)
NOTIFY pgrst, 'reload config';

COMMIT;

SELECT 'Database Question Table Patched Successfully.' as status;

-- END: 71_Patch questions table for matching options and RLS.sql

-- =====================================================================
-- START: 72_Add and initialize tests.exam_type column.sql
-- =====================================================================


-- =================================================================
-- FIX_EXAM_TYPE_COLUMN.sql
-- TUJUAN: Memastikan kolom exam_type ada di database untuk menyimpan kategori ujian.
-- =================================================================

BEGIN;

-- 1. Tambahkan kolom exam_type jika belum ada
ALTER TABLE public.tests 
ADD COLUMN IF NOT EXISTS exam_type TEXT DEFAULT 'Umum';

-- 2. Berikan komentar untuk dokumentasi
COMMENT ON COLUMN public.tests.exam_type IS 'Kategori ujian (misal: PTS, PAS, US, Placement Test)';

-- 3. Update data lama yang mungkin NULL menjadi 'Umum'
UPDATE public.tests 
SET exam_type = 'Umum' 
WHERE exam_type IS NULL OR exam_type = '';

COMMIT;

-- 4. Refresh Cache Schema Supabase (PENTING AGAR API TERBARU)
NOTIFY pgrst, 'reload config';

-- Konfirmasi
SELECT token, subject, exam_type FROM public.tests LIMIT 5;

-- END: 72_Add and initialize tests.exam_type column.sql

-- =====================================================================
-- START: 73_Question delete policy and cascade.sql
-- =====================================================================


-- =================================================================
-- FIX_QUESTION_DELETE_POLICY.sql
-- TUJUAN:
-- 1. Memastikan pengguna (Admin/Guru) memiliki izin DELETE pada tabel questions.
-- 2. Memastikan Foreign Key ke 'student_answers' bersifat ON DELETE CASCADE
--    (agar saat soal dihapus, jawaban siswa terkait juga ikut terhapus otomatis, bukan error).
-- =================================================================

BEGIN;

-- 1. BERSIHKAN & PERBAIKI POLICY RLS (KEBIJAKAN AKSES)
-- Hapus policy lama yang mungkin berkonflik atau membatasi delete
DROP POLICY IF EXISTS "Authenticated can manage questions" ON public.questions;
DROP POLICY IF EXISTS "Admin Full Access" ON public.questions;
DROP POLICY IF EXISTS "Teacher can manage questions" ON public.questions;
DROP POLICY IF EXISTS "Public can read questions" ON public.questions; -- Hapus policy read sementara

-- Buat Policy READ Publik (Siswa butuh baca soal)
CREATE POLICY "Public can read questions" 
ON public.questions FOR SELECT USING (true);

-- Buat Policy MANAGE (Insert/Update/Delete) untuk Authenticated (Admin/Guru)
CREATE POLICY "Authenticated can manage questions" 
ON public.questions 
FOR ALL 
TO authenticated 
USING (true) 
WITH CHECK (true);

-- 2. PERBAIKI FOREIGN KEY CONSTRAINT (AGAR BISA HAPUS SOAL YANG SUDAH DIJAWAB)
-- Hapus constraint lama
ALTER TABLE public.student_answers
DROP CONSTRAINT IF EXISTS student_answers_question_id_fkey;

-- Buat ulang dengan ON DELETE CASCADE
ALTER TABLE public.student_answers
ADD CONSTRAINT student_answers_question_id_fkey
FOREIGN KEY (question_id)
REFERENCES public.questions(id)
ON DELETE CASCADE;

COMMIT;

-- 3. REFRESH CACHE SCHEMA SUPABASE
NOTIFY pgrst, 'reload config';

-- Konfirmasi
SELECT 'Berhasil! Kebijakan Hapus Soal telah diperbaiki (RLS & Cascade).' as status;

-- END: 73_Question delete policy and cascade.sql

-- =====================================================================
-- START: 74_Fix Teacher Access.sql
-- =====================================================================


-- =================================================================
-- FIX_TEACHER_LOGIN_V2.sql
-- SOLUSI FINAL LOGIN GURU & PEMISAHAN ADMIN
-- =================================================================

BEGIN;

-- 1. Pastikan Ekstensi Enkripsi Aktif
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Kunci Domain Sekolah agar konsisten
UPDATE public.app_config 
SET school_domain = 'smpn2demak.sch.id',
    email_domain = '@smpn2demak.sch.id'
WHERE id = 1;

-- 3. NORMALISASI & RESET AKUN GURU
-- Ubah semua username guru menjadi huruf kecil & tanpa spasi
DO $$
DECLARE
    r RECORD;
    v_domain TEXT := 'smpn2demak.sch.id';
    v_raw_username TEXT;
    v_clean_username TEXT; -- Username bersih (kecil, tanpa spasi)
    v_target_email TEXT;
    v_target_pass TEXT := '123456'; -- Password Default
    count_fixed INT := 0;
BEGIN
    -- Loop hanya user dengan role 'teacher'
    FOR r IN SELECT * FROM public.users WHERE role = 'teacher' LOOP
        
        -- A. AMBIL BASE USERNAME
        v_raw_username := split_part(r.username, '@', 1);
        
        -- B. BERSIHKAN USERNAME (Huruf Kecil, Hapus Spasi, Hapus Karakter Aneh)
        -- Contoh: "Pak Budi" -> "pakbudi"
        v_clean_username := lower(regexp_replace(v_raw_username, '\s+', '', 'g'));
        
        -- C. GENERATE EMAIL BARU
        v_target_email := v_clean_username || '@teacher.' || v_domain;

        -- D. UPDATE AUTH.USERS (Login System)
        IF EXISTS (SELECT 1 FROM auth.users WHERE id = r.id) THEN
            UPDATE auth.users 
            SET 
                email = v_target_email,
                encrypted_password = crypt(v_target_pass, gen_salt('bf')),
                email_confirmed_at = now(),
                updated_at = now(),
                raw_user_meta_data = jsonb_build_object(
                    'full_name', r.full_name,
                    'nisn', v_clean_username, -- Simpan username bersih sebagai ID
                    'class', 'STAFF',
                    'role', 'teacher',
                    'major', r.major,
                    'password_text', v_target_pass
                )
            WHERE id = r.id;
        ELSE
            -- Jika akun auth hilang, buat baru
            INSERT INTO auth.users (
                id, instance_id, email, encrypted_password, email_confirmed_at, 
                raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at
            ) VALUES (
                r.id,
                '00000000-0000-0000-0000-000000000000',
                v_target_email,
                crypt(v_target_pass, gen_salt('bf')),
                now(),
                '{"provider": "email", "providers": ["email"]}'::jsonb,
                jsonb_build_object(
                    'full_name', r.full_name,
                    'nisn', v_clean_username,
                    'class', 'STAFF',
                    'role', 'teacher',
                    'password_text', v_target_pass
                ),
                'authenticated', 'authenticated', now(), now()
            );
        END IF;

        -- E. FIX IDENTITIES (Penting untuk login)
        DELETE FROM auth.identities WHERE user_id = r.id;
        INSERT INTO auth.identities (
            id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
        ) VALUES (
            uuid_generate_v4(),
            r.id,
            jsonb_build_object('sub', r.id, 'email', v_target_email),
            'email',
            v_target_email,
            now(), now(), now()
        );

        -- F. UPDATE PUBLIC USERS (Tampilan)
        UPDATE public.users 
        SET 
            username = v_clean_username, -- Tampilkan username bersih
            password_text = v_target_pass,
            qr_login_password = v_target_pass
        WHERE id = r.id;

        count_fixed := count_fixed + 1;
    END LOOP;

    RAISE NOTICE 'Selesai! % Akun Guru berhasil dinormalisasi.', count_fixed;
END $$;

COMMIT;

-- Tampilkan daftar akun guru yang valid untuk dicoba login
SELECT 
    full_name as "Nama Guru", 
    username as "Username Login (Gunakan Ini)", 
    password_text as "Password (Default)"
FROM public.users 
WHERE role = 'teacher';

-- END: 74_Fix Teacher Access.sql

-- =====================================================================
-- START: 75_Import Batch Soal Berperforma Tinggi.sql
-- =====================================================================


-- =================================================================
-- OPTIMASI PERFORMA & FIX TYPE CASTING: BULK IMPORT SOAL
-- Mengganti metode looping dengan Set-Based Operation & Safe JSON Casting
-- =================================================================

CREATE OR REPLACE FUNCTION public.admin_import_questions(
  p_test_token text,
  p_questions_data json
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER 
SET search_path = public, extensions
AS $$
DECLARE
  v_test_id uuid;
  v_inserted_count int;
BEGIN
  -- 1. Validasi Admin (Security Layer)
  IF NOT (SELECT auth.email() = 'admin@cbtschool.com') THEN
    RAISE EXCEPTION '403: Forbidden - Akses Ditolak';
  END IF;

  -- 2. Lookup Test ID (Sekali jalan, di-cache oleh query planner)
  SELECT id INTO v_test_id FROM public.tests WHERE token = p_test_token;
  
  IF v_test_id IS NULL THEN
    RAISE EXCEPTION 'Token ujian tidak valid: %', p_test_token;
  END IF;

  -- 3. BULK INSERT (THE OPTIMIZATION)
  -- Menggunakan json_to_recordset untuk memparsing JSON array langsung ke format tabel virtual.
  
  WITH inserted_rows AS (
    INSERT INTO public.questions (
      test_id,
      type,
      question,
      options,
      matching_right_options,
      answer_key,
      correct_answer_index, -- Legacy column support
      cognitive_level,
      weight,
      difficulty,
      topic
    )
    SELECT
      v_test_id,
      -- Validasi tipe soal (Default ke multiple_choice jika null)
      COALESCE(x.type, 'multiple_choice'),
      x.question,
      -- Pastikan options tidak null (Array kosong jika null)
      COALESCE(x.options, ARRAY[]::text[]),
      COALESCE(x.matching_right_options, ARRAY[]::text[]),
      x.answer_key,
      -- FIX CRITICAL: Ekstraksi aman dari JSON '{"index": 0}' ke Integer 0
      CASE 
        WHEN x.type = 'multiple_choice' THEN 
            COALESCE((x.answer_key ->> 'index')::integer, 0)
        ELSE 0 
      END,
      COALESCE(x.cognitive_level, 'L1'),
      COALESCE(x.weight, 1),
      COALESCE(x.difficulty, 'Medium'),
      COALESCE(x.topic, 'Umum')
    FROM json_to_recordset(p_questions_data) AS x(
      type text,
      question text,
      options text[],
      matching_right_options text[],
      answer_key jsonb,
      cognitive_level text,
      weight numeric,
      difficulty text,
      topic text
    )
    RETURNING id
  )
  SELECT count(*) INTO v_inserted_count FROM inserted_rows;

  -- 4. Return Summary
  RETURN json_build_object(
    'status', 'success',
    'inserted', v_inserted_count,
    'test_id', v_test_id,
    'message', format('Berhasil mengimpor %s soal dalam satu batch.', v_inserted_count)
  );
END;
$$;

-- Refresh schema cache untuk memastikan Supabase API menggunakan versi terbaru
NOTIFY pgrst, 'reload config';

-- END: 75_Import Batch Soal Berperforma Tinggi.sql

-- =====================================================================
-- START: 76_Admin Question Import Function.sql
-- =====================================================================


-- =================================================================
-- FIX IMPORT SYNC: MEMASTIKAN FORMAT DATA KONSISTEN
-- Jalankan di SQL Editor Supabase
-- =================================================================

-- 1. Refresh Cache Schema
NOTIFY pgrst, 'reload config';

-- 2. Update Fungsi Import untuk menangani parameter JSON dengan nama kolom yang pasti
CREATE OR REPLACE FUNCTION public.admin_import_questions(
  p_test_token text,
  p_questions_data json
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_test_id uuid;
  v_inserted_count int := 0;
BEGIN
  -- Validasi Admin
  IF NOT (SELECT auth.email() = 'admin@cbtschool.com') THEN
    RAISE EXCEPTION '403: Forbidden';
  END IF;

  -- Dapatkan ID Ujian
  SELECT id INTO v_test_id FROM public.tests WHERE token = p_test_token;
  
  IF v_test_id IS NULL THEN
    RAISE EXCEPTION 'Token ujian tidak valid: %', p_test_token;
  END IF;

  -- Insert Data dengan pemetaan eksplisit dari JSON ke Tabel
  -- Menggunakan COALESCE untuk nilai default jika JSON null
  WITH inserted_rows AS (
    INSERT INTO public.questions (
      test_id,
      type,
      question,
      options,
      matching_right_options,
      answer_key,
      correct_answer_index,
      cognitive_level,
      weight,
      difficulty,
      topic
    )
    SELECT
      v_test_id,
      COALESCE(x.type, 'multiple_choice'),
      x.question,
      COALESCE(x.options, ARRAY[]::text[]),
      COALESCE(x.matching_right_options, ARRAY[]::text[]),
      x.answer_key,
      -- Logika Correct Answer Index untuk kompatibilitas
      COALESCE(
        CASE 
           WHEN x.type = 'multiple_choice' AND x.answer_key ? 'index' 
           THEN (x.answer_key->>'index')::smallint
           ELSE 0
        END, 
      0),
      COALESCE(x.cognitive_level, 'L1'),
      COALESCE(x.weight, 1),
      COALESCE(x.difficulty, 'Medium'),
      COALESCE(x.topic, 'Umum')
    FROM json_to_recordset(p_questions_data) AS x(
      type text,
      question text,
      options text[],
      matching_right_options text[],
      answer_key jsonb,
      cognitive_level text,
      weight numeric,
      difficulty text,
      topic text
    )
    RETURNING id
  )
  SELECT count(*) INTO v_inserted_count FROM inserted_rows;

  RETURN json_build_object(
    'status', 'success',
    'inserted', v_inserted_count,
    'test_id', v_test_id
  );
END;
$$;

SELECT 'Fungsi Import Soal Berhasil Diperbarui.' as status;

-- END: 76_Admin Question Import Function.sql

-- =====================================================================
-- START: 77_Enable Cascade Deletes for Tests and Related Records.sql
-- =====================================================================


-- =================================================================
-- FIX_DELETE_FEATURES.sql
-- TUJUAN: Mengaktifkan fitur Hapus Mapel & Hapus Soal secara tuntas.
-- METODE: Mengubah Foreign Key menjadi ON DELETE CASCADE.
-- =================================================================

BEGIN;

-- 1. PERBAIKI RELASI TABEL QUESTIONS (Soal)
-- Hapus constraint lama
ALTER TABLE public.questions
DROP CONSTRAINT IF EXISTS questions_test_id_fkey;

-- Buat ulang dengan CASCADE (Jika Mapel dihapus, Soal ikut terhapus)
ALTER TABLE public.questions
ADD CONSTRAINT questions_test_id_fkey
FOREIGN KEY (test_id)
REFERENCES public.tests(id)
ON DELETE CASCADE;

-- 2. PERBAIKI RELASI TABEL SCHEDULES (Jadwal)
ALTER TABLE public.schedules
DROP CONSTRAINT IF EXISTS schedules_test_id_fkey;

ALTER TABLE public.schedules
ADD CONSTRAINT schedules_test_id_fkey
FOREIGN KEY (test_id)
REFERENCES public.tests(id)
ON DELETE CASCADE;

-- 3. PERBAIKI RELASI TABEL STUDENT_EXAM_SESSIONS (Sesi Ujian Siswa)
-- Penting: Jika Jadwal dihapus (efek Mapel dihapus), Sesi juga harus hilang
ALTER TABLE public.student_exam_sessions
DROP CONSTRAINT IF EXISTS student_exam_sessions_schedule_id_fkey;

ALTER TABLE public.student_exam_sessions
ADD CONSTRAINT student_exam_sessions_schedule_id_fkey
FOREIGN KEY (schedule_id)
REFERENCES public.schedules(id)
ON DELETE CASCADE;

-- 4. PERBAIKI RELASI TABEL STUDENT_ANSWERS (Jawaban Siswa)
-- Jika Sesi dihapus, Jawaban detail harus hilang
ALTER TABLE public.student_answers
DROP CONSTRAINT IF EXISTS student_answers_session_id_fkey;

ALTER TABLE public.student_answers
ADD CONSTRAINT student_answers_session_id_fkey
FOREIGN KEY (session_id)
REFERENCES public.student_exam_sessions(id)
ON DELETE CASCADE;

-- Juga jika Soal dihapus manual, jawaban terkait harus hilang
ALTER TABLE public.student_answers
DROP CONSTRAINT IF EXISTS student_answers_question_id_fkey;

ALTER TABLE public.student_answers
ADD CONSTRAINT student_answers_question_id_fkey
FOREIGN KEY (question_id)
REFERENCES public.questions(id)
ON DELETE CASCADE;

-- 5. PASTIKAN RLS POLICY MENGIZINKAN DELETE UNTUK ADMIN
-- Policy untuk Tests
DROP POLICY IF EXISTS "Admin can manage tests" ON public.tests;
CREATE POLICY "Admin can manage tests" ON public.tests FOR ALL USING (is_admin());

-- Policy untuk Questions
DROP POLICY IF EXISTS "Admin can manage questions" ON public.questions;
CREATE POLICY "Admin can manage questions" ON public.questions FOR ALL USING (is_admin());

-- Policy untuk Schedules
DROP POLICY IF EXISTS "Admin can manage schedules" ON public.schedules;
CREATE POLICY "Admin can manage schedules" ON public.schedules FOR ALL USING (is_admin());

COMMIT;

-- Konfirmasi
SELECT 'Fitur DELETE (Cascade) berhasil diaktifkan. Anda sekarang bisa menghapus Mapel dan Soal.' as status;

-- END: 77_Enable Cascade Deletes for Tests and Related Records.sql

-- =====================================================================
-- START: 78_Tambah dan normalisasi kolom exam_type pada tests.sql
-- =====================================================================

-- FIX_EXAM_TYPE_CATEGORY.sql
-- Memastikan kolom exam_type ada dan memiliki default 'Umum'
-- Serta memperbaiki data yang kosong/null menjadi 'Umum'

-- 1. Tambah kolom jika belum ada (Supabase/PostgreSQL)
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tests' AND column_name='exam_type') THEN
        ALTER TABLE tests ADD COLUMN exam_type TEXT DEFAULT 'Umum';
    END IF;
END $$;

-- 2. Update data lama yang null atau kosong menjadi 'Umum'
UPDATE tests SET exam_type = 'Umum' WHERE exam_type IS NULL OR exam_type = '';

-- 3. Pastikan kolom memiliki default 'Umum' untuk kedepannya
ALTER TABLE tests ALTER COLUMN exam_type SET DEFAULT 'Umum';

-- 4. Berikan komentar pada kolom
COMMENT ON COLUMN tests.exam_type IS 'Kategori Ujian (Event) seperti Umum, Penilaian Sumatif, dll.';

-- END: 78_Tambah dan normalisasi kolom exam_type pada tests.sql

-- =====================================================================
-- START: 79_Normalize tests.questions_to_display column.sql
-- =====================================================================

-- Script untuk memperbaiki kolom questions_to_display agar tidak error saat insert
-- Menjadikan kolom nullable dan memberikan nilai default 0

-- 1. Set default value ke 0
ALTER TABLE tests ALTER COLUMN questions_to_display SET DEFAULT 0;

-- 2. Izinkan nilai NULL (opsional, untuk keamanan ekstra)
ALTER TABLE tests ALTER COLUMN questions_to_display DROP NOT NULL;

-- 3. Update data lama yang mungkin NULL menjadi 0 (opsional)
UPDATE tests SET questions_to_display = 0 WHERE questions_to_display IS NULL;

-- END: 79_Normalize tests.questions_to_display column.sql

