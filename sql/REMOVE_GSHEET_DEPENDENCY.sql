
-- =================================================================
-- MIGRATION: MENGHAPUS KETERGANTUNGAN GOOGLE SHEETS
-- Jalankan script ini di SQL Editor Supabase
-- =================================================================

-- 1. Hapus kolom URL Google Sheet dari tabel konfigurasi
ALTER TABLE public.app_config 
DROP COLUMN IF EXISTS student_data_sheet_url;

-- 2. (Opsional) Bersihkan fungsi sync lama jika ada
DROP FUNCTION IF EXISTS public.sync_all_users(json);

-- Konfirmasi
SELECT 'Google Sheet Dependency Removed' as status;
