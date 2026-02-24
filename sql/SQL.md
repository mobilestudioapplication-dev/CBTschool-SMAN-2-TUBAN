# PANDUAN LENGKAP MANAJEMEN DATABASE SUPABASE (V.2)

Dokumen ini berisi semua skrip SQL yang dibutuhkan untuk instalasi, pengelolaan, dan perbaikan database aplikasi CBTschool.

---

### **DAFTAR ISI**

1.  **MODUL A: INSTALASI LENGKAP / RESET TOTAL (BERBAHAYA)**
    -   *Gunakan untuk proyek baru atau menghapus semua data.*
2.  **MODUL B: FUNGSI INTI & KEBIJAKAN KEAMANAN (RLS)**
    -   *Mendefinisikan semua fungsi CRUD untuk admin dan aturan keamanan untuk setiap tabel.*
3.  **MODUL C: PERBAIKAN LOGIN SISWA (DARURAT)**
    -   *Jalankan jika siswa tidak bisa login. Skrip ini aman untuk data yang sudah ada.*
4.  **MODUL D: MANAJEMEN DATA SPESIFIK**
    -   *Skrip untuk tugas-tugas seperti menghapus sesi ujian atau pengguna secara massal.*
5.  **MODUL E: PERBAIKAN IZIN AKSES (FINAL RESORT)**
    -   *Jalankan jika terjadi error "permission denied" atau "querying schema".*
6.  **MODUL F: PERBAIKAN DATABASE (PATCH)**
    -   *Kumpulan skrip untuk memperbaiki masalah pada instalasi yang sudah ada.*
7.  **MODUL G: OPTIMASI DATABASE**
    -   *Skrip opsional untuk meningkatkan responsivitas database.*
8.  **MODUL H: DIAGNOSTIK & PEMERIKSAAN**
    -   *Gunakan untuk memeriksa masalah umum seperti data duplikat.*
9.  **MODUL I: PERBAIKAN UPLOAD GAMBAR (STORAGE RLS)**
    -   *Jalankan jika admin gagal mengunggah gambar soal atau gambar konfigurasi.*

---

---

## 🏗️ MODUL A: INSTALASI LENGKAP / RESET TOTAL (BERBAHAYA)

**PERINGATAN:** Menjalankan skrip di bawah ini akan **MENGHAPUS SEMUA DATA** yang ada di `schema public`. Gunakan ini hanya untuk instalasi baru atau jika Anda benar-benar ingin memulai dari nol.

```sql
-- =================================================================
-- MODUL A: INSTALASI LENGKAP / RESET TOTAL
-- =================================================================

-- Langkah 1: Hapus skema lama dan buat yang baru untuk kebersihan
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON SCHEMA public TO postgres, service_role;

-- Langkah 2: Aktifkan ekstensi yang diperlukan
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Langkah 3: Buat semua tabel aplikasi
-- Tabel konfigurasi utama
CREATE TABLE public.app_config (
  id smallint PRIMARY KEY DEFAULT 1,
  school_name text NOT NULL,
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

-- Tabel profil publik yang terhubung ke auth.users
CREATE TABLE public.users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text NOT NULL UNIQUE,
  qr_login_password text, -- Kolom untuk menyimpan password login QR admin
  full_name text NOT NULL,
  nisn text UNIQUE,
  class text,
  major text,
  religion text DEFAULT 'Islam',
  gender text NOT NULL CHECK (gender IN ('Laki-laki', 'Perempuan')),
  photo_url text,
  updated_at timestamptz DEFAULT now()
);

-- Tabel data master
CREATE TABLE public.master_classes (id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), name text NOT NULL UNIQUE, created_at timestamptz DEFAULT now());
CREATE TABLE public.master_majors (id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), name text NOT NULL UNIQUE, created_at timestamptz DEFAULT now());

-- Tabel Ujian dan Soal
CREATE TABLE public.tests (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  token text NOT NULL UNIQUE,
  name text NOT NULL,
  subject text NOT NULL,
  duration_minutes int NOT NULL,
  questions_to_display int,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.questions (
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

-- Tabel Jadwal dan Pengumuman
CREATE TABLE public.schedules (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  test_id uuid NOT NULL REFERENCES public.tests(id) ON DELETE CASCADE,
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  assigned_to text[] -- Array berisi nama kelas/jurusan
);
CREATE TABLE public.announcements (id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), title text NOT NULL UNIQUE, content text NOT NULL, created_at timestamptz DEFAULT now());

-- Tabel Sesi Ujian Siswa
CREATE TABLE public.student_exam_sessions (
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
  UNIQUE(user_id, schedule_id) -- Siswa hanya bisa mengambil satu sesi per jadwal
);
CREATE TABLE public.student_answers (
  id bigserial PRIMARY KEY,
  session_id bigint NOT NULL REFERENCES public.student_exam_sessions(id) ON DELETE CASCADE,
  question_id bigint NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  selected_answer_index smallint,
  is_unsure boolean DEFAULT false,
  answered_at timestamptz DEFAULT now(),
  UNIQUE(session_id, question_id) -- Hanya satu jawaban per soal per sesi
);

-- Langkah 4: Buat Storage Buckets
-- Bucket untuk aset gambar soal
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('question_assets', 'question_assets', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/gif'])
ON CONFLICT (id) DO NOTHING;

-- Bucket untuk aset konfigurasi (logo, ttd, stempel)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('config_assets', 'config_assets', true, 5242880, ARRAY['image/jpeg', 'image/png'])
ON CONFLICT (id) DO NOTHING;

-- Langkah 5: Isi data awal (seeding)
INSERT INTO public.app_config (id, school_name, logo_url) VALUES (1, 'SMK Negeri 8 Surabaya', 'https://imersa.co.id/toko/logo/images/logo-smk-8-surabaya.png') ON CONFLICT (id) DO UPDATE SET school_name = EXCLUDED.school_name, logo_url = EXCLUDED.logo_url;
INSERT INTO public.master_classes (name) VALUES ('XII TKJ 1'), ('XII TKJ 2'), ('XII RPL 1'), ('XII RPL 2') ON CONFLICT (name) DO NOTHING;
INSERT INTO public.master_majors (name) VALUES ('Teknik Komputer & Jaringan'), ('Rekayasa Perangkat Lunak') ON CONFLICT (name) DO NOTHING;

-- Langkah 6: Jalankan Modul B untuk membuat fungsi dan kebijakan keamanan.
-- (Salin-tempel isi MODUL B di bawah ke sini, atau jalankan sebagai skrip terpisah setelah ini)

-- AKHIR DARI MODUL A
```

---

## ⚙️ MODUL B: FUNGSI INTI & KEBIJAKAN KEAMANAN (RLS)

Skrip ini adalah "otak" dari backend aplikasi. Ini membuat semua fungsi yang diperlukan panel admin untuk mengelola data (CRUD) dan menerapkan kebijakan keamanan (Row Level Security) untuk melindungi data. **Wajib dijalankan setelah Modul A.**

```sql
-- =================================================================
-- MODUL B: FUNGSI INTI, TRIGGER, DAN KEBIJAKAN KEAMANAN (RLS)
-- =================================================================

BEGIN;

-- Bagian 1: Trigger untuk sinkronisasi data dari auth.users ke public.users
--------------------------------------------------------------------------
-- Fungsi ini akan otomatis berjalan setiap kali user baru dibuat di Supabase Auth.
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
    COALESCE(new.raw_user_meta_data ->> 'full_name', 'Nama Belum Diatur'),
    COALESCE(new.raw_user_meta_data ->> 'nisn', split_part(new.email, '@', 1)),
    COALESCE(new.raw_user_meta_data ->> 'class', 'Belum diatur'),
    COALESCE(new.raw_user_meta_data ->> 'major', 'Belum diatur'),
    COALESCE(new.raw_user_meta_data ->> 'gender', 'Laki-laki'),
    COALESCE(new.raw_user_meta_data ->> 'religion', 'Islam'),
    COALESCE(new.raw_user_meta_data ->> 'photo_url', 'https://ui-avatars.com/api/?name=' || COALESCE(new.raw_user_meta_data ->> 'full_name', 'User'))
  );
  RETURN new;
END;
$$;

-- Pasang trigger ke tabel auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- Bagian 2: Fungsi CRUD untuk Admin (dipanggil via RPC)
--------------------------------------------------------------------------
-- Fungsi helper untuk mengecek apakah user adalah admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
AS $$
  SELECT auth.email() = 'admin@cbtschool.com';
$$;

-- Fungsi untuk membuat atau mengupdate user (siswa) oleh admin
CREATE OR REPLACE FUNCTION public.admin_upsert_user(
  p_id uuid, -- null untuk user baru
  p_username text,
  p_password text,
  p_full_name text,
  p_nisn text,
  p_class text,
  p_major text,
  p_gender text,
  p_religion text,
  p_photo_url text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  new_user_id uuid;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION '403: Forbidden';
  END IF;

  IF p_id IS NOT NULL THEN
    -- UPDATE existing user
    UPDATE auth.users
    SET
      raw_user_meta_data = jsonb_build_object(
        'full_name', p_full_name,
        'nisn', p_nisn,
        'class', p_class,
        'major', p_major,
        'gender', p_gender,
        'religion', p_religion,
        'photo_url', p_photo_url
      )
    WHERE id = p_id;

    UPDATE public.users
    SET
      full_name = p_full_name,
      nisn = p_nisn,
      class = p_class,
      major = p_major,
      gender = p_gender,
      religion = p_religion,
      photo_url = p_photo_url,
      updated_at = now()
    WHERE id = p_id;
    
    RETURN p_id;
  ELSE
    -- INSERT new user
    new_user_id := uuid_generate_v4();
    INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_user_meta_data, aud, role)
    VALUES (
      new_user_id,
      p_username,
      crypt(p_password, gen_salt('bf')),
      now(),
      jsonb_build_object(
        'full_name', p_full_name,
        'nisn', p_nisn,
        'class', p_class,
        'major', p_major,
        'gender', p_gender,
        'religion', p_religion,
        'photo_url', p_photo_url
      ),
      'authenticated',
      'authenticated'
    );
    -- Trigger akan otomatis mengisi tabel public.users
    RETURN new_user_id;
  END IF;
END;
$$;

-- Fungsi untuk menghapus user oleh admin
CREATE OR REPLACE FUNCTION public.admin_delete_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION '403: Forbidden';
  END IF;

  DELETE FROM auth.users WHERE id = p_user_id;
END;
$$;

-- Fungsi untuk mereset password siswa oleh admin
CREATE OR REPLACE FUNCTION public.admin_reset_student_password(p_user_id uuid, p_new_password text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, extensions
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION '403: Forbidden';
  END IF;

  UPDATE auth.users
  SET encrypted_password = crypt(p_new_password, gen_salt('bf'))
  WHERE id = p_user_id;
END;
$$;

-- [BARU] Fungsi aman untuk membuat sesi ujian
CREATE OR REPLACE FUNCTION public.create_exam_session(
  p_user_uuid uuid,
  p_schedule_uuid uuid,
  p_duration_seconds integer
)
RETURNS bigint -- Mengembalikan ID sesi ujian
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  existing_session_id bigint;
  new_session_id bigint;
BEGIN
  -- Cek apakah sesi sudah ada untuk kombinasi user dan jadwal ini
  SELECT id INTO existing_session_id
  FROM public.student_exam_sessions
  WHERE user_id = p_user_uuid AND schedule_id = p_schedule_uuid;

  IF existing_session_id IS NOT NULL THEN
    -- Jika sudah ada, kembalikan ID yang ada (idempotent)
    RETURN existing_session_id;
  ELSE
    -- Jika belum ada, buat sesi baru dan kembalikan ID barunya
    INSERT INTO public.student_exam_sessions(user_id, schedule_id, status, time_left_seconds)
    VALUES (p_user_uuid, p_schedule_uuid, 'Mengerjakan', p_duration_seconds)
    RETURNING id INTO new_session_id;
    RETURN new_session_id;
  END IF;
END;
$$;

-- Bagian 3: Kebijakan Keamanan (Row Level Security - RLS)
--------------------------------------------------------------------------
-- Aktifkan RLS untuk semua tabel
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

-- Hapus kebijakan lama (jika ada) untuk pembersihan
DROP POLICY IF EXISTS "Public can read config" ON public.app_config;
DROP POLICY IF EXISTS "Admin can manage config" ON public.app_config;
DROP POLICY IF EXISTS "Admin can insert config" ON public.app_config;
DROP POLICY IF EXISTS "Admin can update config" ON public.app_config;
DROP POLICY IF EXISTS "Admin can delete config" ON public.app_config;
DROP POLICY IF EXISTS "Admin can manage users" ON public.users;
DROP POLICY IF EXISTS "Users can view own profile" ON public.users;
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
DROP POLICY IF EXISTS "Public can read user data" ON public.users;
DROP POLICY IF EXISTS "Authenticated users can update their own profile" ON public.users;
DROP POLICY IF EXISTS "Public can read master data" ON public.master_classes;
DROP POLICY IF EXISTS "Admin can manage master data" ON public.master_classes;
DROP POLICY IF EXISTS "Public can read master data" ON public.master_majors;
DROP POLICY IF EXISTS "Admin can manage master data" ON public.master_majors;
DROP POLICY IF EXISTS "Public can read tests" ON public.tests;
DROP POLICY IF EXISTS "Admin can manage tests" ON public.tests;
DROP POLICY IF EXISTS "Public can read questions" ON public.questions;
DROP POLICY IF EXISTS "Admin can manage questions" ON public.questions;
DROP POLICY IF EXISTS "Public can read schedules" ON public.schedules;
DROP POLICY IF EXISTS "Admin can manage schedules" ON public.schedules;
DROP POLICY IF EXISTS "Public can read announcements" ON public.announcements;
DROP POLICY IF EXISTS "Admin can manage announcements" ON public.announcements;

-- Aturan untuk app_config
CREATE POLICY "Public can read config" ON public.app_config FOR SELECT USING (true);
CREATE POLICY "Admin can insert config" ON public.app_config FOR INSERT WITH CHECK (is_admin());
CREATE POLICY "Admin can update config" ON public.app_config FOR UPDATE USING (is_admin());
CREATE POLICY "Admin can delete config" ON public.app_config FOR DELETE USING (is_admin());

-- Aturan untuk users (REVISED FOR STUDENT LOGIN)
CREATE POLICY "Admin can manage users" ON public.users FOR ALL USING (is_admin());
CREATE POLICY "Authenticated users can update their own profile" ON public.users FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Public can read user data" ON public.users FOR SELECT USING (true);

-- Aturan untuk data master (classes & majors)
CREATE POLICY "Public can read master data" ON public.master_classes FOR SELECT USING (true);
CREATE POLICY "Admin can manage master data" ON public.master_classes FOR ALL USING (is_admin());
CREATE POLICY "Public can read master data" ON public.master_majors FOR SELECT USING (true);
CREATE POLICY "Admin can manage master data" ON public.master_majors FOR ALL USING (is_admin());

-- Aturan untuk tests & questions (FIX: Public read access for students)
CREATE POLICY "Public can read tests" ON public.tests FOR SELECT USING (true);
CREATE POLICY "Admin can manage tests" ON public.tests FOR ALL USING (is_admin());
CREATE POLICY "Public can read questions" ON public.questions FOR SELECT USING (true);
CREATE POLICY "Admin can manage questions" ON public.questions FOR ALL USING (is_admin());

-- Aturan untuk schedules & announcements (FIX: Public read access for students)
CREATE POLICY "Public can read schedules" ON public.schedules FOR SELECT USING (true);
CREATE POLICY "Admin can manage schedules" ON public.schedules FOR ALL USING (is_admin());
CREATE POLICY "Public can read announcements" ON public.announcements FOR SELECT USING (true);
CREATE POLICY "Admin can manage announcements" ON public.announcements FOR ALL USING (is_admin());

-- Aturan untuk sesi ujian & jawaban (paling penting)
-- Hapus kebijakan lama yang mungkin salah untuk memastikan kebersihan
DROP POLICY IF EXISTS "Students can manage own sessions" ON public.student_exam_sessions;
DROP POLICY IF EXISTS "Students can create sessions" ON public.student_exam_sessions;
DROP POLICY IF EXISTS "Students can update sessions" ON public.student_exam_sessions;
DROP POLICY IF EXISTS "Admin can manage all sessions" ON public.student_exam_sessions;
DROP POLICY IF EXISTS "Authenticated users can view sessions" ON public.student_exam_sessions;

DROP POLICY IF EXISTS "Students can manage own answers" ON public.student_answers;
DROP POLICY IF EXISTS "Students can create answers" ON public.student_answers;
DROP POLICY IF EXISTS "Students can update answers" ON public.student_answers;
DROP POLICY IF EXISTS "Admin can manage all answers" ON public.student_answers;
DROP POLICY IF EXISTS "Authenticated users can view answers" ON public.student_answers;

-- Kebijakan BARU & BENAR
-- Karena pembuatan sesi sekarang ditangani oleh RPC, kita tidak perlu kebijakan INSERT untuk siswa.
-- Siswa (anon) hanya perlu bisa UPDATE sesi mereka (untuk sisa waktu) dan SELECT (untuk memuat ulang).
CREATE POLICY "Students can update own sessions" ON public.student_exam_sessions FOR UPDATE USING (true);
CREATE POLICY "Students can view own sessions" ON public.student_exam_sessions FOR SELECT USING (true);
  
CREATE POLICY "Students can create answers" ON public.student_answers FOR INSERT WITH CHECK (true);
CREATE POLICY "Students can update answers" ON public.student_answers FOR UPDATE USING (true);
  
-- Admin (pengguna yang terautentikasi) dapat mengelola semua sesi dan jawaban.
CREATE POLICY "Admin can manage all sessions" ON public.student_exam_sessions
  FOR ALL
  USING (auth.role() = 'authenticated');
  
CREATE POLICY "Admin can manage all answers" ON public.student_answers
  FOR ALL
  USING (auth.role() = 'authenticated');

COMMIT;
-- AKHIR DARI MODUL B
```

---

## 🚑 MODUL C: PERBAIKAN LOGIN SISWA (DARURAT)

Jalankan skrip ini jika siswa mengalami **"Login Gagal"** atau **"Data Siswa Tidak Ditemukan"** meskipun NISN dan password sudah benar. Skrip ini aman dijalankan kapan saja dan tidak akan menghapus data ujian.

```sql
-- =================================================================
-- MODUL C: PERBAIKAN LOGIN SISWA SECARA MASSAL
-- =================================================================

-- Fungsi ini akan memeriksa semua siswa di tabel 'users',
-- memastikan mereka memiliki akun login yang aktif di 'auth.users',
-- dan mereset password mereka ke NISN.
CREATE OR REPLACE FUNCTION public.repair_student_logins()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
    r RECORD;
    auth_id UUID;
    target_email TEXT;
    processed_count INT := 0;
    created_count INT := 0;
    updated_count INT := 0;
    skipped_count INT := 0;
BEGIN
    IF NOT is_admin() THEN
      RAISE EXCEPTION '403: Forbidden';
    END IF;

    -- Pastikan semua email dikonfirmasi untuk menghindari masalah login
    UPDATE auth.users SET email_confirmed_at = now() WHERE email_confirmed_at IS NULL;

    -- Loop melalui semua user di tabel profil publik (kecuali admin)
    FOR r IN SELECT * FROM public.users WHERE username <> 'admin@cbtschool.com' AND nisn IS NOT NULL LOOP
        processed_count := processed_count + 1;
        target_email := r.nisn || '@smkn8sby.sch.id';

        -- Cek apakah user sudah ada di tabel auth
        SELECT id INTO auth_id FROM auth.users WHERE id = r.id;

        IF auth_id IS NULL THEN
            -- User tidak ada di auth, buat baru
            INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_user_meta_data, aud, role)
            VALUES (r.id, target_email, crypt(r.nisn, gen_salt('bf')), now(),
                    jsonb_build_object('full_name', r.full_name),
                    'authenticated', 'authenticated');
            created_count := created_count + 1;
        ELSE
            -- User sudah ada, update email (jika berbeda) dan reset password
            IF EXISTS (SELECT 1 FROM auth.users WHERE id = r.id AND (email <> target_email OR encrypted_password <> crypt(r.nisn, gen_salt('bf')))) THEN
                UPDATE auth.users
                SET
                  email = target_email,
                  encrypted_password = crypt(r.nisn, gen_salt('bf')),
                  email_confirmed_at = now() -- pastikan terkonfirmasi
                WHERE id = r.id;
                updated_count := updated_count + 1;
            ELSE
                skipped_count := skipped_count + 1;
            END IF;
        END IF;

        -- Sinkronkan juga username di public.users
        UPDATE public.users SET username = target_email WHERE id = r.id AND username <> target_email;
    END LOOP;

    RETURN json_build_object(
        'message', 'Perbaikan selesai.',
        'processed', processed_count,
        'created', created_count,
        'updated_or_reset', updated_count,
        'skipped_ok', skipped_count
    );
END;
$$;
-- AKHIR DARI MODUL C
```

---

## 🗑️ MODUL D: MANAJEMEN DATA SPESIFIK

Kumpulan skrip untuk tugas pembersihan atau manajemen data yang lebih spesifik. **Gunakan dengan hati-hati.**

```sql
-- =================================================================
-- MODUL D: MANAJEMEN DATA SPESIFIK
-- =================================================================

-- 1. FUNGSI SINKRONISASI PENGGUNA DARI GOOGLE SHEET (PENTING)
-- Fungsi ini dipanggil oleh aplikasi untuk menambah, memperbarui, dan menghapus pengguna
-- agar sesuai dengan data master di Google Sheet.
CREATE OR REPLACE FUNCTION public.sync_all_users(users_data json)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  deleted_count int;
  updated_count int;
  inserted_count int;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION '403: Forbidden';
  END IF;

  -- Buat tabel sementara untuk menampung data yang masuk
  CREATE TEMP TABLE incoming_users (
    "username" text,
    "password" text,
    "fullName" text,
    "nisn" text,
    "class" text,
    "major" text,
    "gender" text,
    "religion" text,
    "photoUrl" text
  ) ON COMMIT DROP;

  INSERT INTO incoming_users
  SELECT * FROM json_populate_recordset(null::incoming_users, users_data);
  
  -- Pastikan NISN tidak kosong untuk operasi kunci
  IF EXISTS (SELECT 1 FROM incoming_users WHERE nisn IS NULL OR nisn = '') THEN
    RAISE EXCEPTION 'Data tidak valid: Ditemukan baris dengan NISN kosong.';
  END IF;
  
  -- Langkah 1: Hapus pengguna yang ada di DB tetapi tidak ada di daftar baru
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

  -- Langkah 2: Perbarui pengguna yang sudah ada
  WITH updated_public_users AS (
      UPDATE public.users pu
      SET
        full_name = i."fullName",
        class = i.class,
        major = i.major,
        gender = i.gender,
        religion = i.religion,
        photo_url = COALESCE(i."photoUrl", 'https://ui-avatars.com/api/?name=' || i."fullName"),
        username = i.nisn || '@smkn8sby.sch.id',
        updated_at = now()
      FROM incoming_users i
      WHERE pu.nisn = i.nisn
        AND (
          pu.full_name <> i."fullName" OR
          pu.class <> i.class OR
          pu.major <> i.major OR
          pu.gender <> i.gender OR
          pu.religion <> i.religion
        )
      RETURNING pu.id
  )
  SELECT count(*) INTO updated_count FROM updated_public_users;
  
  -- Juga perbarui metadata auth.users untuk konsistensi
  UPDATE auth.users au
  SET 
    email = i.nisn || '@smkn8sby.sch.id',
    raw_user_meta_data = au.raw_user_meta_data || jsonb_build_object(
          'full_name', i."fullName",
          'class', i.class,
          'major', i.major
        )
  FROM incoming_users i
  JOIN public.users pu ON i.nisn = pu.nisn
  WHERE au.id = pu.id;


  -- Langkah 3: Masukkan pengguna baru
  WITH new_auth_users AS (
    INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_user_meta_data, aud, role)
    SELECT
      uuid_generate_v4(), -- <-- FIX: Generate a new UUID for the 'id' column
      i.nisn || '@smkn8sby.sch.id',
      crypt(COALESCE(i.password, i.nisn), gen_salt('bf')),
      now(),
      jsonb_build_object(
          'full_name', i."fullName",
          'nisn', i.nisn,
          'class', i.class,
          'major', i.major,
          'gender', i.gender,
          'religion', i.religion,
          'photo_url', COALESCE(i."photoUrl", 'https://ui-avatars.com/api/?name=' || i."fullName")
      ),
      'authenticated',
      'authenticated'
    FROM incoming_users i
    WHERE NOT EXISTS (SELECT 1 FROM public.users pu WHERE pu.nisn = i.nisn)
    RETURNING *
  )
  SELECT count(*) INTO inserted_count FROM new_auth_users;

  RETURN json_build_object(
    'deleted', deleted_count,
    'updated', updated_count,
    'inserted', inserted_count
  );
END;
$$;


-- 2. Hapus SEMUA sesi ujian dan jawaban siswa (Reset progres ujian)
-- Berguna sebelum memulai sesi ujian baru untuk membersihkan data lama.
-- JANGAN JALANKAN SAAT UJIAN BERLANGSUNG.
CREATE OR REPLACE FUNCTION delete_all_exam_progress()
RETURNS void AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION '403: Forbidden';
  END IF;
  
  TRUNCATE TABLE public.student_answers RESTART IDENTITY;
  TRUNCATE TABLE public.student_exam_sessions RESTART IDENTITY CASCADE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3. Hapus SEMUA pengguna siswa (dari auth dan public)
-- Ini akan menghapus semua data siswa, sesi, dan jawaban mereka.
-- JANGAN JALANKAN KECUALI ANDA INGIN MENGHAPUS SEMUA DATA SISWA.
/*
DELETE FROM auth.users WHERE email <> 'admin@cbtschool.com';
*/

-- 4. Set Password Admin
-- Ganti 'password_baru_anda' dengan password yang Anda inginkan.
/*
UPDATE auth.users
SET encrypted_password = crypt('password_baru_anda', gen_salt('bf'))
WHERE email = 'admin@cbtschool.com';
*/

-- 5. Set Metadata Admin (Nama, dll)
/*
UPDATE auth.users 
SET raw_user_meta_data = '{"is_admin": true, "full_name": "Administrator"}' 
WHERE email = 'admin@cbtschool.com';
*/
```

---

## 🔑 MODUL E: PERBAIKAN IZIN AKSES (FINAL RESORT)

Jalankan skrip ini jika aplikasi mengalami error `permission denied` atau `Database error querying schema` bahkan setelah menjalankan Modul B. Ini akan memberikan izin yang lebih luas ke peran `anon` dan `authenticated`.

```sql
-- =================================================================
-- MODUL E: PERBAIKAN IZIN AKSES
-- =================================================================

BEGIN;
  -- Berikan izin penggunaan skema
  GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;

  -- Berikan izin penuh pada SEMUA tabel, sequence, dan fungsi di skema public
  GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role;
  GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;
  GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO postgres, anon, authenticated, service_role;

  -- Atur agar tabel/sequence/fungsi baru juga otomatis mendapatkan izin
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres, anon, authenticated, service_role;
COMMIT;

-- AKHIR DARI MODUL E
```

---

## 🩹 MODUL F: PERBAIKAN DATABASE (PATCH)

Gunakan skrip di modul ini untuk memperbaiki masalah spesifik pada instalasi yang sudah ada tanpa menghapus data.

---

### **F.1: Perbaikan Fitur Sinkronisasi Password QR Admin**

Jalankan jika Anda mendapatkan error `column "qr_login_password" does not exist`.

```sql
-- Menambahkan kolom yang hilang ke tabel `users` untuk menyimpan password yang akan digunakan untuk login QR Admin.
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS qr_login_password TEXT;

-- Memberikan komentar pada kolom untuk kejelasan
COMMENT ON COLUMN public.users.qr_login_password IS 'Stores the admin password for the QR auto-login feature.';
```

### **F.2: Perbaikan Penyimpanan URL Google Sheet**

Jalankan jika URL Google Sheet tidak tersimpan setelah Anda menyimpannya di menu Konfigurasi.

```sql
-- Menambahkan kolom yang hilang ke tabel `app_config` untuk menyimpan URL Google Sheet data siswa.
ALTER TABLE public.app_config
ADD COLUMN IF NOT EXISTS student_data_sheet_url TEXT;

-- Memberikan komentar pada kolom untuk kejelasan
COMMENT ON COLUMN public.app_config.student_data_sheet_url IS 'Stores the public CSV URL for the student data Google Sheet.';
```

### **F.3: Perbaikan Fitur Restore Data (SOLUSI FINAL)**

Jalankan jika Anda mendapatkan error saat restore. Fungsi ini hanya merestore data ujian, bukan data siswa, untuk mencegah inkonsistensi.

```sql
-- =================================================================
-- MODUL F.3: PERBAIKAN TOTAL FITUR RESTORE
-- =================================================================

-- Langkah 1: Buat/Perbarui fungsi helper `is_admin()`.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
AS $$
  SELECT auth.email() = 'admin@cbtschool.com';
$$;

-- Langkah 2: Buat atau Ganti fungsi `admin_restore_data` dengan versi final yang aman.
CREATE OR REPLACE FUNCTION public.admin_restore_data(backup_data jsonb)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  test_record RECORD;
  new_test_id uuid;
  token_to_new_id_map jsonb := '{}'::jsonb;
BEGIN
  -- Verifikasi bahwa hanya admin yang bisa menjalankan fungsi ini
  IF NOT is_admin() THEN
    RAISE EXCEPTION '403: Forbidden - Only admins can perform restore operations.';
  END IF;

  -- Langkah 1: HAPUS DATA LAMA SECARA TUNTAS (KECUALI PENGGUNA)
  TRUNCATE TABLE 
    public.tests, 
    public.master_classes, 
    public.master_majors, 
    public.announcements
  RESTART IDENTITY CASCADE;

  -- Langkah 2: RESTORE DATA DARI FILE BACKUP (KECUALI PENGGUNA)
  -- Restore Konfigurasi
  IF backup_data ? 'config' THEN
    UPDATE public.app_config
    SET
      school_name = backup_data->'config'->>'schoolName',
      logo_url = backup_data->'config'->>'logoUrl',
      primary_color = backup_data->'config'->>'primaryColor',
      enable_anti_cheat = (backup_data->'config'->>'enableAntiCheat')::boolean,
      anti_cheat_violation_limit = (backup_data->'config'->>'antiCheatViolationLimit')::smallint,
      allow_student_manual_login = (backup_data->'config'->>'allowStudentManualLogin')::boolean,
      allow_student_qr_login = (backup_data->'config'->>'allowStudentQrLogin')::boolean,
      allow_admin_manual_login = (backup_data->'config'->>'allowAdminManualLogin')::boolean,
      allow_admin_qr_login = (backup_data->'config'->>'allowAdminQrLogin')::boolean,
      headmaster_name = backup_data->'config'->>'headmasterName',
      headmaster_nip = backup_data->'config'->>'headmasterNip',
      card_issue_date = backup_data->'config'->>'cardIssueDate',
      signature_url = backup_data->'config'->>'signatureUrl',
      stamp_url = backup_data->'config'->>'stampUrl',
      student_data_sheet_url = backup_data->'config'->>'studentDataSheetUrl'
    WHERE id = 1;
  END IF;

  -- Restore Data Master
  IF backup_data ? 'masterData' THEN
    IF jsonb_typeof(backup_data->'masterData'->'classes') = 'array' AND jsonb_array_length(backup_data->'masterData'->'classes') > 0 THEN
      INSERT INTO public.master_classes (name)
      SELECT value->>'name' FROM jsonb_array_elements(backup_data->'masterData'->'classes');
    END IF;
    IF jsonb_typeof(backup_data->'masterData'->'majors') = 'array' AND jsonb_array_length(backup_data->'masterData'->'majors') > 0 THEN
      INSERT INTO public.master_majors (name)
      SELECT value->>'name' FROM jsonb_array_elements(backup_data->'masterData'->'majors');
    END IF;
  END IF;

  -- Restore Pengumuman
  IF backup_data ? 'announcements' AND jsonb_typeof(backup_data->'announcements') = 'array' AND jsonb_array_length(backup_data->'announcements') > 0 THEN
    INSERT INTO public.announcements (title, content, created_at)
    SELECT value->>'title', value->>'content', (value->>'date')::timestamptz
    FROM jsonb_array_elements(backup_data->'announcements');
  END IF;

  -- Restore Ujian & Soal
  IF backup_data ? 'tests' AND jsonb_typeof(backup_data->'tests') = 'array' AND jsonb_array_length(backup_data->'tests') > 0 THEN
    FOR test_record IN SELECT value->1 AS test_data FROM jsonb_array_elements(backup_data->'tests') LOOP
      INSERT INTO public.tests (token, name, subject, duration_minutes, questions_to_display)
      VALUES (
        test_record.test_data->'details'->>'token',
        test_record.test_data->'details'->>'name',
        test_record.test_data->'details'->>'subject',
        (test_record.test_data->'details'->>'durationMinutes')::int,
        (test_record.test_data->'details'->>'questionsToDisplay')::int
      ) RETURNING id INTO new_test_id;

      token_to_new_id_map := jsonb_set(token_to_new_id_map, ARRAY[test_record.test_data->'details'->>'token'], to_jsonb(new_test_id));

      IF jsonb_typeof(test_record.test_data->'questions') = 'array' AND jsonb_array_length(test_record.test_data->'questions') > 0 THEN
        INSERT INTO public.questions (test_id, question, image_url, options, option_images, correct_answer_index, difficulty, topic)
        SELECT
          new_test_id,
          value->>'question',
          value->>'image',
          (SELECT array_agg(elem::text) FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(value->'options') = 'array' THEN value->'options' ELSE '[]'::jsonb END) AS elem),
          (SELECT array_agg(elem::text) FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(value->'optionImages') = 'array' THEN value->'optionImages' ELSE '[]'::jsonb END) AS elem),
          (value->>'correctAnswerIndex')::smallint,
          value->>'difficulty',
          value->>'topic'
        FROM jsonb_array_elements(test_record.test_data->'questions') AS value;
      END IF;
    END LOOP;
  END IF;

  -- Restore Jadwal Ujian
  IF backup_data ? 'schedules' AND jsonb_typeof(backup_data->'schedules') = 'array' AND jsonb_array_length(backup_data->'schedules') > 0 THEN
    INSERT INTO public.schedules (test_id, start_time, end_time, assigned_to)
    SELECT
      (token_to_new_id_map->>(value->>'testToken'))::uuid,
      (value->>'startTime')::timestamptz,
      (value->>'endTime')::timestamptz,
      (SELECT array_agg(elem::text) FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(value->'assignedTo') = 'array' THEN value->'assignedTo' ELSE '[]'::jsonb END) AS elem)
    FROM jsonb_array_elements(backup_data->'schedules') AS value
    WHERE token_to_new_id_map ? (value->>'testToken');
  END IF;

  RETURN 'Restore berhasil: Semua data (kecuali data siswa) telah dipulihkan. Database kini dalam kondisi konsisten.';
END;
$$;
```

### **F.4: Perbaikan Validasi Token Ujian (USANG/OBSOLETE)**

**PENTING:** Fungsi SQL lama `get_test_by_valid_token` telah **dihapus** dari database. Logika validasi token sekarang sepenuhnya ditangani di dalam kode aplikasi (`supabaseClient.ts`) untuk mengatasi masalah ketidakcocokan data antara Google Sheet dan database (misalnya "XII RPL 1" vs "XII-RPL-1").

Jika Anda masih memiliki fungsi ini dari instalasi sebelumnya, Anda bisa menghapusnya dengan aman menggunakan skrip di bawah ini. Jika tidak, abaikan saja.

```sql
-- Skrip ini menghapus fungsi RPC lama yang sudah tidak digunakan lagi.
DROP FUNCTION IF EXISTS public.get_test_by_valid_token(text, text, text);
DROP FUNCTION IF EXISTS public.get_test_by_valid_token(text, uuid); -- Versi lama lainnya
```

---

## ⚡ MODUL G: OPTIMASI DATABASE

Skrip ini bersifat **opsional**. Jalankan jika Anda merasa aplikasi terkadang lambat atau ingin meningkatkan responsivitas database saat ujian berlangsung.

```sql
-- ===================================================================== --
-- ===   SKRIP OPTIMASI ULTIMATE: WARM-UP & RAM SAVER                === --
-- ===================================================================== --

-- Langkah 1: Aktifkan ekstensi pg_cron jika belum aktif.
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Langkah 2: Berikan izin penggunaan skema 'cron'.
GRANT USAGE ON SCHEMA cron TO postgres;

-- Langkah 3: Bersihkan jadwal lama agar tidak duplikat.
DO $$
BEGIN
  PERFORM cron.unschedule('database-warm-up');
  PERFORM cron.unschedule('kill-idle-connections');
EXCEPTION WHEN OTHERS THEN
  -- Abaikan error jika jadwal tidak ditemukan
END;
$$ LANGUAGE plpgsql;


-- Langkah 4: Jadwalkan WARM-UP (Setiap 2 menit).
-- Memaksa data penting tetap berada di RAM (Buffer Cache).
SELECT cron.schedule(
  'database-warm-up',   
  '*/2 * * * *',        -- Jadwal: SETIAP 2 MENIT (Agresif)
  $$
  DO BEGIN
    -- 1. Panaskan Config & User Index
    PERFORM id FROM public.app_config LIMIT 1;
    PERFORM count(*) FROM public.users; -- Memuat index user ke RAM
    
    -- 2. Panaskan Bank Soal & Ujian Aktif
    PERFORM count(*) FROM public.questions;
    PERFORM id FROM public.tests;
    
    -- 3. Panaskan Jadwal
    PERFORM id FROM public.schedules;
  END $$
);

-- Langkah 5: Jadwalkan RAM SAVER (Setiap 5 menit).
-- Memutus koneksi yang "bengong" (idle) agar RAM tidak penuh sampah.
SELECT cron.schedule(
  'kill-idle-connections',
  '*/5 * * * *',
  $$
  SELECT pg_terminate_backend(pid)
  FROM pg_stat_activity
  WHERE state = 'idle'
  AND state_change < now() - interval '5 minutes' -- Koneksi bengong > 5 menit
  AND usename != 'postgres' -- Jangan matikan koneksi sistem/admin
  AND pid <> pg_backend_pid(); -- Jangan bunuh diri sendiri
  $$
);
```

---

## 🔎 MODUL H: DIAGNOSTIK & PEMERIKSAAN

Jalankan skrip di modul ini untuk mendiagnosis masalah umum pada data Anda.

---

### **H.1: Cek Token Ujian Duplikat**

Penyebab umum error saat validasi token adalah adanya token yang sama untuk lebih dari satu ujian.

**Instruksi:** Jalankan query di bawah ini.
-   Jika **tidak ada hasil** yang muncul, berarti data token Anda aman.
-   Jika **muncul hasil**, berarti Anda memiliki token duplikat. Anda harus mengubah atau menghapus salah satu ujian yang memiliki token yang sama melalui menu "Bank Soal".

```sql
-- =================================================================
-- MODUL H.1: CEK TOKEN DUPLIKAT
-- =================================================================

SELECT token, COUNT(*)
FROM public.tests
GROUP BY token
HAVING COUNT(*) > 1;

-- AKHIR DARI MODUL H.1
```

---

## 🖼️ MODUL I: PERBAIKAN UPLOAD GAMBAR (STORAGE RLS)

Jalankan skrip ini jika admin mendapatkan error **"new row violates row-level security policy"** saat mencoba mengunggah gambar soal, gambar opsi jawaban, atau gambar konfigurasi (logo, stempel, dll).

```sql
-- =================================================================
-- MODUL I: PERBAIKAN KEBIJAKAN UPLOAD GAMBAR UNTUK ADMIN
-- =================================================================

-- Kebijakan ini mengizinkan pengguna yang terautentikasi (admin)
-- untuk melakukan semua aksi (upload, view, update, delete)
-- pada file di dalam bucket 'question_assets' dan 'config_assets'.

-- === Kebijakan untuk Bucket Aset Soal ===

-- Hapus kebijakan lama untuk kebersihan
DROP POLICY IF EXISTS "Admin can manage question assets" ON storage.objects;
DROP POLICY IF EXISTS "Admin can upload to question_assets" ON storage.objects;
DROP POLICY IF EXISTS "Admin can view question_assets" ON storage.objects;
DROP POLICY IF EXISTS "Admin can update question_assets" ON storage.objects;
DROP POLICY IF EXISTS "Admin can delete question_assets" ON storage.objects;

-- Buat kebijakan baru yang lengkap
CREATE POLICY "Admin can view question_assets"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'question_assets');

CREATE POLICY "Admin can upload to question_assets"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'question_assets');

CREATE POLICY "Admin can update question_assets"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'question_assets');

CREATE POLICY "Admin can delete question_assets"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'question_assets');


-- === Kebijakan untuk Bucket Aset Konfigurasi ===

-- Hapus kebijakan lama untuk kebersihan
DROP POLICY IF EXISTS "Admin can manage config assets" ON storage.objects;
DROP POLICY IF EXISTS "Admin can upload to config_assets" ON storage.objects;
DROP POLICY IF EXISTS "Admin can view config_assets" ON storage.objects;
DROP POLICY IF EXISTS "Admin can update config_assets" ON storage.objects;
DROP POLICY IF EXISTS "Admin can delete config_assets" ON storage.objects;

-- Buat kebijakan baru yang lengkap
CREATE POLICY "Admin can view config_assets"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'config_assets');

CREATE POLICY "Admin can upload to config_assets"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'config_assets');

CREATE POLICY "Admin can update config_assets"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'config_assets');

CREATE POLICY "Admin can delete config_assets"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'config_assets');


-- AKHIR DARI MODUL I
```
