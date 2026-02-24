-- PERBAIKAN KRUSIAL UNTUK PENYIMPANAN JAWABAN REALTIME

-- 1. Pastikan tabel student_answers memiliki struktur yang benar
CREATE TABLE IF NOT EXISTS public.student_answers (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    session_id UUID NOT NULL REFERENCES public.student_exam_sessions(id) ON DELETE CASCADE,
    question_id INTEGER NOT NULL, -- ID soal (bukan UUID)
    student_answer JSONB, -- Menyimpan jawaban lengkap dengan tipe data asli (array, object, dll)
    answer_value TEXT, -- Menyimpan representasi string untuk query cepat
    is_unsure BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Pastikan Constraint UNIQUE untuk (session_id, question_id) ada
-- Ini PENTING agar UPSERT bekerja dan tidak error "duplicate key"
DO $$
BEGIN
    -- Cek apakah constraint sudah ada dengan nama yang mungkin berbeda
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conrelid = 'public.student_answers'::regclass
        AND (conname = 'student_answers_session_id_question_id_key' OR conname = 'unique_session_question')
    ) THEN
        -- Jika belum ada, tambahkan
        ALTER TABLE public.student_answers
        ADD CONSTRAINT student_answers_session_id_question_id_key UNIQUE (session_id, question_id);
    END IF;
END $$;

-- 3. Aktifkan RLS
ALTER TABLE public.student_answers ENABLE ROW LEVEL SECURITY;

-- 4. Perbaiki Policy RLS (Hapus yang lama agar bersih)
DROP POLICY IF EXISTS "Siswa bisa insert jawaban mereka sendiri" ON public.student_answers;
DROP POLICY IF EXISTS "Siswa bisa update jawaban mereka sendiri" ON public.student_answers;
DROP POLICY IF EXISTS "Siswa bisa lihat jawaban mereka sendiri" ON public.student_answers;
DROP POLICY IF EXISTS "Enable insert for authenticated users based on session ownership" ON public.student_answers;
DROP POLICY IF EXISTS "Enable update for authenticated users based on session ownership" ON public.student_answers;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.student_answers;

-- Buat Policy BARU yang lebih permisif namun aman
-- Izinkan INSERT/UPDATE jika session_id milik user yang sedang login
CREATE POLICY "Siswa manage jawaban sendiri" ON public.student_answers
FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM public.student_exam_sessions s
        WHERE s.id = student_answers.session_id
        AND s.user_id = auth.uid()
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.student_exam_sessions s
        WHERE s.id = student_answers.session_id
        AND s.user_id = auth.uid()
    )
);

-- Izinkan Admin melihat semua jawaban (opsional, jika admin pakai role authenticated biasa)
-- CREATE POLICY "Admin view all answers" ON public.student_answers FOR SELECT USING (true);

-- 5. Indexing untuk performa realtime
CREATE INDEX IF NOT EXISTS idx_student_answers_session_id ON public.student_answers(session_id);

-- 6. Trigger untuk update timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_student_answers_modtime ON public.student_answers;
CREATE TRIGGER update_student_answers_modtime
    BEFORE UPDATE ON public.student_answers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
