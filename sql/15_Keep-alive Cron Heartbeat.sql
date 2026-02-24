
-- =================================================================
-- MODUL: DATABASE KEEP-ALIVE (CRON JOB)
-- Jalankan script ini di SQL Editor Supabase
-- Tujuan: Mencegah database 'pausing' dan menjaga performa tetap cepat
-- =================================================================

-- 1. Pastikan ekstensi pg_cron aktif
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 2. Berikan izin akses ke schema cron (diperlukan agar job bisa jalan)
GRANT USAGE ON SCHEMA cron TO postgres;

-- 3. Hapus jadwal lama dengan nama yang sama (Clean up sebelum install)
-- Menggunakan DO block untuk menangani error jika job belum ada
DO $$
BEGIN
    PERFORM cron.unschedule('keep-alive-heartbeat');
EXCEPTION WHEN OTHERS THEN
    -- Abaikan error jika job tidak ditemukan
END $$;

-- 4. Jadwalkan Job Baru (Setiap 3 Menit)
-- Syntax: cron.schedule(job_name, cron_expression, sql_command)
-- '*/3 * * * *' artinya: Every 3 minutes
SELECT cron.schedule(
  'keep-alive-heartbeat', -- Nama Job unik
  '*/3 * * * *',          -- Jadwal Cron
  $$
    DO BEGIN
      -- A. Query ringan ke tabel config (Menjaga koneksi disk tetap aktif)
      PERFORM id FROM public.app_config LIMIT 1;
      
      -- B. Query hitung user (Menjaga index user tetap di RAM/Cache)
      PERFORM count(*) FROM public.users;
      
      -- C. Query ping sederhana
      PERFORM 1;
    END $$
);

-- 5. Konfirmasi: Tampilkan daftar job yang aktif
SELECT jobid, jobname, schedule, command, active FROM cron.job;
