-- Script untuk memperbaiki kolom questions_to_display agar tidak error saat insert
-- Menjadikan kolom nullable dan memberikan nilai default 0

-- 1. Set default value ke 0
ALTER TABLE tests ALTER COLUMN questions_to_display SET DEFAULT 0;

-- 2. Izinkan nilai NULL (opsional, untuk keamanan ekstra)
ALTER TABLE tests ALTER COLUMN questions_to_display DROP NOT NULL;

-- 3. Update data lama yang mungkin NULL menjadi 0 (opsional)
UPDATE tests SET questions_to_display = 0 WHERE questions_to_display IS NULL;
