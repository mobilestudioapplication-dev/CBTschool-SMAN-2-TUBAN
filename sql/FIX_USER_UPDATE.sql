
-- =================================================================
-- FITUR: UPDATE DATA SISWA (ADMIN)
-- Jalankan script ini di SQL Editor Supabase
-- =================================================================

-- 1. Buat Fungsi RPC untuk Insert/Update User
-- Fungsi ini menangani logika kompleks: update auth.users DAN public.users sekaligus
CREATE OR REPLACE FUNCTION public.admin_upsert_user(
  p_id uuid,              -- NULL jika user baru, UUID jika edit
  p_username text,
  p_password text,        -- NULL jika tidak ingin ubah password saat edit
  p_full_name text,
  p_nisn text,
  p_class text,
  p_major text,
  p_gender text,
  p_religion text,
  p_photo_url text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER -- Berjalan dengan hak akses superuser (perlu untuk ubah auth.users)
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  -- Cek apakah pemanggil adalah Admin
  IF NOT (SELECT auth.email() = 'admin@cbtschool.com') THEN
    RAISE EXCEPTION '403: Forbidden - Hanya admin yang boleh mengubah data.';
  END IF;

  IF p_id IS NOT NULL THEN
    -- === LOGIKA UPDATE (EDIT USER) ===
    v_user_id := p_id;

    -- 1. Update Metadata di auth.users
    UPDATE auth.users
    SET
      email = p_username,
      raw_user_meta_data = jsonb_build_object(
        'full_name', p_full_name,
        'nisn', p_nisn,
        'class', p_class,
        'major', p_major,
        'gender', p_gender,
        'religion', p_religion,
        'photo_url', p_photo_url
      ),
      updated_at = now()
    WHERE id = v_user_id;

    -- 2. Update Password HANYA JIKA diberikan (tidak null/kosong)
    IF p_password IS NOT NULL AND p_password <> '' THEN
      UPDATE auth.users
      SET encrypted_password = crypt(p_password, gen_salt('bf'))
      WHERE id = v_user_id;
    END IF;

    -- 3. Update tabel public.users
    UPDATE public.users
    SET
      username = p_username,
      full_name = p_full_name,
      nisn = p_nisn,
      class = p_class,
      major = p_major,
      gender = p_gender,
      religion = p_religion,
      photo_url = p_photo_url,
      updated_at = now()
    WHERE id = v_user_id;

  ELSE
    -- === LOGIKA INSERT (TAMBAH USER BARU) ===
    v_user_id := uuid_generate_v4();
    
    -- Insert ke auth.users (Trigger otomatis akan mengisi public.users)
    INSERT INTO auth.users (
      id, 
      email, 
      encrypted_password, 
      email_confirmed_at, 
      raw_user_meta_data, 
      aud, 
      role
    )
    VALUES (
      v_user_id,
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
  END IF;

  RETURN v_user_id;
END;
$$;

-- Konfirmasi keberhasilan
SELECT 'Fungsi admin_upsert_user berhasil dibuat/diperbarui.' as status;
