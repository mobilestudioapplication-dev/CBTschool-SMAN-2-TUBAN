
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
    VALUES (v_admin_id, v_email, 'Administrator Utama', 'admin', v_pass, v_pass, 'Laki-laki', 'Islam');
  END IF;
  
  -- Berikan hak akses RPC ke publik agar bisa diakses saat login (sebelum auth)
  GRANT EXECUTE ON FUNCTION public.get_admin_password_by_uuid(text) TO anon, authenticated, service_role;

END $$;

COMMIT;

SELECT 'BERHASIL: Password Admin direset ke "1234567890". Silakan login manual atau scan QR.' as status;
