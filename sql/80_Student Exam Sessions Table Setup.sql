-- Script untuk memperbaiki/memastikan struktur tabel student_exam_sessions
-- Jalankan script ini di SQL Editor Supabase

-- 1. Pastikan tabel student_exam_sessions ada dan memiliki kolom yang benar
CREATE TABLE IF NOT EXISTS public.student_exam_sessions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE, -- Atau public.users jika menggunakan tabel users terpisah
    schedule_id UUID REFERENCES public.schedules(id) ON DELETE CASCADE,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    finished_at TIMESTAMP WITH TIME ZONE,
    status TEXT DEFAULT 'Mengerjakan', -- 'Mengerjakan', 'Selesai', 'Diskualifikasi'
    score NUMERIC DEFAULT 0,
    answers JSONB DEFAULT '{}'::jsonb, -- Opsional: menyimpan jawaban full di sini jika perlu
    violations INTEGER DEFAULT 0,
    time_left_seconds INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Tambahkan index untuk performa query rekapitulasi
CREATE INDEX IF NOT EXISTS idx_exam_sessions_schedule_id ON public.student_exam_sessions(schedule_id);
CREATE INDEX IF NOT EXISTS idx_exam_sessions_user_id ON public.student_exam_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_exam_sessions_status ON public.student_exam_sessions(status);

-- 3. Pastikan Foreign Key ke Schedules valid (jika belum ada)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'student_exam_sessions_schedule_id_fkey'
    ) THEN
        ALTER TABLE public.student_exam_sessions 
        ADD CONSTRAINT student_exam_sessions_schedule_id_fkey 
        FOREIGN KEY (schedule_id) REFERENCES public.schedules(id) ON DELETE CASCADE;
    END IF;
END $$;

-- 4. Fix Data: Update status 'Selesai' jika score ada tapi status masih null atau salah
UPDATE public.student_exam_sessions
SET status = 'Selesai'
WHERE score IS NOT NULL AND (status IS NULL OR status = 'Mengerjakan');

-- 5. Fix Data: Pastikan score 0 jika null tapi status Selesai (Opsional, tergantung kebijakan)
-- UPDATE public.student_exam_sessions
-- SET score = 0
-- WHERE status = 'Selesai' AND score IS NULL;
