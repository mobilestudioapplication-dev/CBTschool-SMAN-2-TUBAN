
-- =================================================================
-- OPTIMASI PENYIMPANAN GAMBAR (ENTERPRISE STANDARD)
-- Tujuan: Mencegah beban server dengan membatasi ukuran file fisik
-- =================================================================

BEGIN;

-- 1. Update Konfigurasi Bucket 'question_assets'
-- Batasi ukuran file maksimal 500KB (524288 bytes).
-- Soal ujian tidak membutuhkan resolusi 4K. 800px (approx 150-300KB) sudah sangat cukup.
UPDATE storage.buckets
SET file_size_limit = 512000, -- 500 KB
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
WHERE id = 'question_assets';

-- 2. Update Konfigurasi Bucket 'config_assets' (Logo/Tanda Tangan)
-- Logo biasanya kecil, batasi 1MB agar aman.
UPDATE storage.buckets
SET file_size_limit = 1048576, -- 1 MB
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
WHERE id = 'config_assets';

-- 3. (Opsional) Policy tambahan untuk mencegah overload (Rate Limiting sederhana via RLS)
-- Memastikan user hanya bisa upload jika file size valid (Double check di level row)
DROP POLICY IF EXISTS "Enforce File Size" ON storage.objects;
CREATE POLICY "Enforce File Size"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id IN ('question_assets', 'config_assets') AND
  (metadata->>'size')::int <= 512000 -- Max 500KB
);

COMMIT;

-- Konfirmasi
SELECT 'Storage limits applied: Max 500KB for Questions.' as status;
