
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