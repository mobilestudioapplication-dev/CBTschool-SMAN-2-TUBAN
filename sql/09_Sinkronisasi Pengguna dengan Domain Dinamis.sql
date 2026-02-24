
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
