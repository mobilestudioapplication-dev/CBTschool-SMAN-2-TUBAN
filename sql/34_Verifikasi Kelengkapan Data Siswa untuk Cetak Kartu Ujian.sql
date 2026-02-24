
-- =================================================================
-- SQL_VERIFY_DATA.sql
-- TUJUAN: Memastikan data siswa lengkap untuk dicetak di Kartu Ujian
-- =================================================================

-- 1. Cek kelengkapan kolom password_text (Wajib untuk cetak kartu)
-- Jika null, isi dengan NISN sebagai fallback
UPDATE public.users
SET password_text = nisn
WHERE (password_text IS NULL OR password_text = '') 
  AND nisn IS NOT NULL 
  AND role = 'student';

-- 2. Pastikan konfigurasi sekolah terisi (Logo & Nama)
-- Jika nama sekolah masih default, ubah (Optional, sesuaikan)
-- UPDATE public.app_config SET school_name = 'SMK CONTOH' WHERE id = 1 AND school_name = 'NAMA SEKOLAH';

-- 3. Tampilkan Data Siswa yang SIAP CETAK (Preview)
SELECT 
    full_name as "Nama",
    nisn as "NISN (Username)",
    password_text as "Password Cetak",
    class as "Kelas"
FROM public.users
WHERE role = 'student'
ORDER BY class ASC, full_name ASC
LIMIT 20;

-- Pesan Konfirmasi
SELECT 'Data siswa telah diverifikasi. Password kosong diisi dengan NISN.' as status;
