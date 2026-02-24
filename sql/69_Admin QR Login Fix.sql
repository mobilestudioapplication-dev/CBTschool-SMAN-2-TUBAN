
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
  
  -- Cek apakah admin sudah ada dengan email ini tapi ID beda?
  IF EXISTS (SELECT 1 FROM public.users WHERE username = v_admin_email AND id <> v_admin_uuid) THEN
      -- Jika ya, update ID-nya (CASCADE di auth akan menolak biasanya, jadi kita update data kolom lain saja)
      -- TAPI, QR berisi UUID spesifik. Jika ID di DB beda, QR GAK AKAN JALAN.
      -- Kita asumsikan PDF sudah dicetak, jadi DB harus menyesuaikan.
      
      -- Update public.users untuk UUID ini
      INSERT INTO public.users (id, username, full_name, role, qr_login_password, gender)
      VALUES (v_admin_uuid, v_admin_email, 'Administrator Utama', 'admin', v_password_fix, 'Laki-laki')
      ON CONFLICT (id) DO UPDATE SET 
        qr_login_password = v_password_fix,
        role = 'admin',
        username = v_admin_email;
        
  ELSE
      -- Insert baru atau update existing
      INSERT INTO public.users (id, username, full_name, role, qr_login_password, gender)
      VALUES (v_admin_uuid, v_admin_email, 'Administrator Utama', 'admin', v_password_fix, 'Laki-laki')
      ON CONFLICT (id) DO UPDATE SET 
        qr_login_password = v_password_fix,
        role = 'admin';
  END IF;

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

END $$;

COMMIT;

-- 5. Berikan izin eksekusi RPC ke public (anon)
GRANT EXECUTE ON FUNCTION public.get_admin_password_by_uuid(text) TO anon, authenticated, service_role;

SELECT 'Sukses! Admin QR Fix Applied via RPC & Data Sync.' as status;
