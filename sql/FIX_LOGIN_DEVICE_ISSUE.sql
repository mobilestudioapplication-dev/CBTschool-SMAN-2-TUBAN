-- =================================================================
-- FIX: Login Siswa Banyak Gagal (Device Lock Terlalu Ketat)
-- Jalankan di SQL Editor Supabase
-- =================================================================

BEGIN;

-- 1. Pastikan anon (siswa belum auth) bisa memanggil verify_and_lock_device
GRANT EXECUTE ON FUNCTION public.verify_and_lock_device(text, text, jsonb) TO anon;
GRANT EXECUTE ON FUNCTION public.verify_and_lock_device(text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_and_lock_device(text, text, jsonb) TO service_role;

-- 2. Pastikan claim_session bisa dipanggil oleh anon
GRANT EXECUTE ON FUNCTION public.claim_session(uuid, text) TO anon;
GRANT EXECUTE ON FUNCTION public.claim_session(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_session(uuid, text) TO service_role;

-- 3. Buat fungsi global reset semua device lock sekaligus
--    (Tidak perlu daftar user ID, langsung reset semua)
CREATE OR REPLACE FUNCTION public.admin_reset_all_device_logins_global()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.users
  SET
    active_device_id = NULL,
    is_login_active = FALSE,
    last_device_info = NULL
  WHERE active_device_id IS NOT NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count; -- Returns number of users reset
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_reset_all_device_logins_global() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reset_all_device_logins_global() TO service_role;

-- 4. OPSIONAL: Reset semua device lock sekarang juga agar ujian bisa berjalan
--    Hapus tanda komentar (--) di bawah jika ingin langsung reset SEMUA device:
-- SELECT public.admin_reset_all_device_logins_global();

COMMIT;

SELECT 'Fix applied: grants OK, global reset function created.' as status;
