
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
