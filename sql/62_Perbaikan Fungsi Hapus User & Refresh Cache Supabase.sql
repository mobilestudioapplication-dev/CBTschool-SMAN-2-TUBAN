
-- =================================================================
-- SQL_FIX_DELETE_USER.sql
-- MODUL: PERBAIKAN FUNGSI HAPUS USER & REFRESH CACHE
-- Jalankan script ini untuk mengatasi error "function not found in schema cache"
-- =================================================================

BEGIN;

-- 1. Refresh Cache Schema Supabase (SOLUSI UTAMA)
-- Ini memberitahu API Supabase untuk memuat ulang daftar fungsi yang tersedia
NOTIFY pgrst, 'reload config';

-- 2. Hapus fungsi lama untuk menghindari konflik
DROP FUNCTION IF EXISTS public.admin_delete_user(uuid);

-- 3. Buat Ulang Fungsi Hapus User (Versi Aman)
CREATE OR REPLACE FUNCTION public.admin_delete_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER -- Berjalan sebagai superuser (wajib untuk hapus auth.users)
SET search_path = public, extensions
AS $$
BEGIN
  -- Validasi: Hanya Admin yang boleh menghapus
  IF NOT (SELECT auth.email() = 'admin@cbtschool.com') THEN
    RAISE EXCEPTION '403: Forbidden - Akses Ditolak.';
  END IF;

  -- Validasi: Jangan biarkan Admin menghapus dirinya sendiri
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION '400: Anda tidak dapat menghapus akun Anda sendiri.';
  END IF;

  -- Eksekusi Hapus dari Auth (Otomatis cascade ke public.users)
  DELETE FROM auth.users WHERE id = p_user_id;
  
  -- Jika foreign key cascade tidak aktif (jarang terjadi, tapi untuk jaga-jaga), hapus manual:
  DELETE FROM public.users WHERE id = p_user_id;

END;
$$;

COMMIT;

-- Konfirmasi
SELECT 'Fungsi Hapus User berhasil diperbarui & Cache di-refresh.' as status;
