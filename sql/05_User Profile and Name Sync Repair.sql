
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
