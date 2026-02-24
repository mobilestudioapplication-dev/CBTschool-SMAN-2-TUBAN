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