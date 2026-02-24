
-- =================================================================
-- FITUR: HAPUS DATA MASSAL (BULK DELETE)
-- Jalankan script ini di SQL Editor Supabase
-- =================================================================

CREATE OR REPLACE FUNCTION public.admin_bulk_delete_data(modules jsonb)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER -- Berjalan dengan hak akses superuser (diperlukan untuk akses auth.users)
SET search_path = public, auth, extensions
AS $$
DECLARE
  result_msg text := 'Berhasil menghapus: ';
BEGIN
  -- 1. Validasi Keamanan: Pastikan pemanggil adalah Admin
  IF auth.uid() IS NULL OR (SELECT auth.email() FROM auth.users WHERE id = auth.uid()) <> 'admin@cbtschool.com' THEN
    RAISE EXCEPTION '403: Akses Ditolak. Hanya Administrator utama yang dapat melakukan tindakan ini.';
  END IF;

  -- 2. Hapus Jadwal (Schedules)
  -- Ini harus dilakukan sebelum Tests jika tidak CASCADE, tapi dengan CASCADE aman.
  IF (modules->>'schedules')::boolean THEN
    DELETE FROM public.schedules;
    result_msg := result_msg || 'Semua Jadwal, ';
  END IF;

  -- 3. Hapus Bank Soal & Ujian (Tests)
  -- Menghapus Tests akan otomatis menghapus Questions & Schedules (jika relasi ON DELETE CASCADE)
  IF (modules->>'tests')::boolean THEN
    DELETE FROM public.tests; 
    result_msg := result_msg || 'Bank Soal & Ujian, ';
  END IF;

  -- 4. Hapus Pengumuman
  IF (modules->>'announcements')::boolean THEN
    DELETE FROM public.announcements;
    result_msg := result_msg || 'Pengumuman, ';
  END IF;

  -- 5. Hapus Data Master (Kelas & Jurusan)
  IF (modules->>'masterData')::boolean THEN
    DELETE FROM public.master_classes;
    DELETE FROM public.master_majors;
    result_msg := result_msg || 'Data Master, ';
  END IF;

  -- 6. Hapus Siswa (Users)
  -- PENTING: Menghapus dari auth.users akan otomatis menghapus public.users via CASCADE
  -- Kita FILTER agar akun admin tidak ikut terhapus.
  IF (modules->>'users')::boolean THEN
    DELETE FROM auth.users 
    WHERE email <> 'admin@cbtschool.com'; 
    result_msg := result_msg || 'Semua Siswa.';
  END IF;

  RETURN result_msg;
END;
$$;

-- Konfirmasi pembuatan fungsi
SELECT 'Fungsi Hapus Data Massal Berhasil Dibuat.' as status;
