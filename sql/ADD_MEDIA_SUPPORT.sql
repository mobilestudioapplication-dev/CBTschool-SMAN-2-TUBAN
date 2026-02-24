
-- =================================================================
-- MIGRATION: DUKUNGAN MEDIA (AUDIO & VIDEO) UNTUK SOAL TKA 2026
-- Jalankan script ini di SQL Editor Supabase
-- =================================================================

BEGIN;

-- 1. Tambahkan kolom URL media ke tabel questions
ALTER TABLE public.questions
ADD COLUMN IF NOT EXISTS audio_url text,
ADD COLUMN IF NOT EXISTS video_url text;

-- 2. Update Konfigurasi Storage Bucket 'question_assets'
-- Menambahkan MIME types untuk MP3 dan MP4
-- Meningkatkan batas ukuran file menjadi 50MB (untuk mengakomodasi video)
UPDATE storage.buckets
SET 
    allowed_mime_types = array_cat(allowed_mime_types, ARRAY['audio/mpeg', 'audio/mp3', 'video/mp4']),
    file_size_limit = 52428800 -- 50MB (Bytes)
WHERE id = 'question_assets';

COMMIT;

-- Konfirmasi
SELECT 'Media support added (Audio/Video columns & Storage config updated)' as status;
