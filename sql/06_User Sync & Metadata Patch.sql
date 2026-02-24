
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
