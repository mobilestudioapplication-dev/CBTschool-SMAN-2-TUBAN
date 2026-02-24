
-- =================================================================
-- MEMBERSIHKAN DATA DUMMY BAWAAN INSTALLER
-- Jalankan script ini di SQL Editor Supabase
-- =================================================================

BEGIN;

-- 1. Hapus Kelas Dummy
DELETE FROM public.master_classes 
WHERE name IN ('XII TKJ 1', 'XII TKJ 2', 'XII RPL 1', 'XII RPL 2');

-- 2. Hapus Jurusan Dummy
DELETE FROM public.master_majors 
WHERE name IN ('Teknik Komputer & Jaringan', 'Rekayasa Perangkat Lunak');

COMMIT;

-- Konfirmasi
SELECT 'Data dummy berhasil dihapus. Silakan refresh aplikasi.' as status;
