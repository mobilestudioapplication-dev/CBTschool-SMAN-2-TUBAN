
-- =================================================================
-- CBT SCHOOL PATCH: ADMIN MASS DELETE FUNCTION (ENTERPRISE GRADE)
-- Menghapus data secara aman dengan urutan integritas referensial
-- REVISI: Menambahkan WHERE clause untuk bypass safe update check
-- =================================================================

CREATE OR REPLACE FUNCTION public.admin_mass_delete(selected_modules json)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER -- Berjalan dengan hak akses superuser (diperlukan untuk akses auth.users)
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_users boolean := COALESCE((selected_modules->>'users')::boolean, false);
  v_tests boolean := COALESCE((selected_modules->>'tests')::boolean, false);
  v_master boolean := COALESCE((selected_modules->>'masterData')::boolean, false);
  v_announcements boolean := COALESCE((selected_modules->>'announcements')::boolean, false);
  v_schedules boolean := COALESCE((selected_modules->>'schedules')::boolean, false);
  
  deleted_info text := 'Penghapusan berhasil: ';
BEGIN
  -- 1. Validasi Otoritas Admin
  IF NOT (SELECT auth.email() = 'admin@cbtschool.com') THEN
    RAISE EXCEPTION '403: Unauthorized - Hanya Administrator Utama yang dapat melakukan ini.';
  END IF;

  -- 2. Proses Penghapusan (Urutan Berdasarkan Constraint)
  
  -- A. Hapus Jadwal (Jika dipilih secara spesifik)
  IF v_schedules AND NOT v_tests THEN
    -- FIX: Tambahkan WHERE id IS NOT NULL untuk bypass error "DELETE requires a WHERE clause"
    DELETE FROM public.schedules WHERE id IS NOT NULL;
    deleted_info := deleted_info || 'Jadwal, ';
  END IF;

  -- B. Hapus Bank Soal & Ujian (Menghapus Questions, Sessions, Answers via CASCADE)
  IF v_tests THEN
    TRUNCATE TABLE public.tests RESTART IDENTITY CASCADE;
    deleted_info := deleted_info || 'Bank Soal (Semua Soal & Sesi Ujian), ';
  END IF;

  -- C. Hapus Pengguna (Menghapus profil publik & akun auth)
  IF v_users THEN
    -- Hapus dari auth.users kecuali akun admin
    DELETE FROM auth.users WHERE email <> 'admin@cbtschool.com'; 
    deleted_info := deleted_info || 'Semua Pengguna Siswa, ';
  END IF;

  -- D. Hapus Data Master (Kelas & Jurusan)
  IF v_master THEN
    TRUNCATE TABLE public.master_classes RESTART IDENTITY CASCADE;
    TRUNCATE TABLE public.master_majors RESTART IDENTITY CASCADE;
    deleted_info := deleted_info || 'Data Master (Kelas & Jurusan), ';
  END IF;

  -- E. Hapus Pengumuman
  IF v_announcements THEN
    -- FIX: Tambahkan WHERE id IS NOT NULL
    DELETE FROM public.announcements WHERE id IS NOT NULL;
    deleted_info := deleted_info || 'Semua Pengumuman, ';
  END IF;

  -- Bersihkan teks output jika tidak ada yang dipilih
  IF deleted_info = 'Penghapusan berhasil: ' THEN
    RETURN 'Tidak ada modul yang dipilih untuk dihapus.';
  END IF;

  RETURN rtrim(deleted_info, ', ') || '.';
END;
$$;
