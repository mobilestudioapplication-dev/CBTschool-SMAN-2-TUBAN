-- FIX_EXAM_TYPE_CATEGORY.sql
-- Memastikan kolom exam_type ada dan memiliki default 'Umum'
-- Serta memperbaiki data yang kosong/null menjadi 'Umum'

-- 1. Tambah kolom jika belum ada (Supabase/PostgreSQL)
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tests' AND column_name='exam_type') THEN
        ALTER TABLE tests ADD COLUMN exam_type TEXT DEFAULT 'Umum';
    END IF;
END $$;

-- 2. Update data lama yang null atau kosong menjadi 'Umum'
UPDATE tests SET exam_type = 'Umum' WHERE exam_type IS NULL OR exam_type = '';

-- 3. Pastikan kolom memiliki default 'Umum' untuk kedepannya
ALTER TABLE tests ALTER COLUMN exam_type SET DEFAULT 'Umum';

-- 4. Berikan komentar pada kolom
COMMENT ON COLUMN tests.exam_type IS 'Kategori Ujian (Event) seperti Umum, Penilaian Sumatif, dll.';
