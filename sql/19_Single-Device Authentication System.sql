
-- =================================================================
-- MODUL: SINGLE DEVICE AUTHENTICATION SYSTEM
-- Jalankan script ini di SQL Editor Supabase
-- =================================================================

BEGIN;

-- 1. Tambahkan kolom pelacakan perangkat di tabel users
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS active_device_id TEXT,
ADD COLUMN IF NOT EXISTS last_device_info JSONB,
ADD COLUMN IF NOT EXISTS is_login_active BOOLEAN DEFAULT FALSE;

-- 2. Fungsi: Verifikasi dan Kunci Perangkat (Dipanggil saat Siswa Login)
CREATE OR REPLACE FUNCTION public.verify_and_lock_device(
  p_nisn text,
  p_device_id text,
  p_device_info jsonb
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_user_id uuid;
  v_stored_device_id text;
  v_is_active boolean;
BEGIN
  -- Ambil data user
  SELECT id, active_device_id, is_login_active 
  INTO v_user_id, v_stored_device_id, v_is_active
  FROM public.users 
  WHERE nisn = p_nisn;

  IF v_user_id IS NULL THEN
    RETURN json_build_object('status', 'error', 'message', 'User tidak ditemukan');
  END IF;

  -- Logika Kunci Perangkat
  IF v_stored_device_id IS NULL OR v_stored_device_id = '' THEN
    -- Kasus 1: Login Pertama (Belum ada device terikat) -> Bind Device
    UPDATE public.users 
    SET active_device_id = p_device_id,
        last_device_info = p_device_info,
        is_login_active = true,
        updated_at = now()
    WHERE id = v_user_id;
    
    RETURN json_build_object('status', 'success', 'message', 'Device Bound');

  ELSIF v_stored_device_id = p_device_id THEN
    -- Kasus 2: Device Cocok -> Izinkan & Update timestamp
    UPDATE public.users 
    SET is_login_active = true,
        updated_at = now()
    WHERE id = v_user_id;
    
    RETURN json_build_object('status', 'success', 'message', 'Device Match');

  ELSE
    -- Kasus 3: Device Tidak Cocok -> Blokir
    RETURN json_build_object(
        'status', 'locked', 
        'message', 'Akun sedang aktif di perangkat lain. Minta Reset Login ke Pengawas.'
    );
  END IF;
END;
$$;

-- 3. Fungsi: Admin Reset Login (Melepas Kunci Perangkat)
CREATE OR REPLACE FUNCTION public.admin_reset_device_login(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Validasi Admin (Opsional, lebih aman dicek di RLS/App level juga)
  IF NOT (SELECT auth.email() = 'admin@cbtschool.com') THEN
    RAISE EXCEPTION '403: Forbidden';
  END IF;

  -- Reset Device ID dan Status Login
  UPDATE public.users
  SET active_device_id = NULL,
      is_login_active = FALSE,
      last_device_info = NULL
  WHERE id = p_user_id;
  
  -- Opsional: Hapus sesi ujian jika perlu (Uncomment jika ingin reset ujian juga)
  -- DELETE FROM public.student_exam_sessions WHERE user_id = p_user_id;
END;
$$;

COMMIT;

-- Konfirmasi
SELECT 'Single Device Auth System Installed' as status;
