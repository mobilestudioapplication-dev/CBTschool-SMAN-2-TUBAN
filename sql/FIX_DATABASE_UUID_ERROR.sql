-- =================================================================
-- FIX DATABASE: MENGUBAH TIPE DATA UUID KE BIGINT (ID SERIAL)
-- Jalankan script ini di SQL Editor Supabase Anda
-- =================================================================

-- 1. Hapus constraint yang menghalangi perubahan tipe data
ALTER TABLE public.student_answers DROP CONSTRAINT IF EXISTS student_answers_session_id_fkey;
ALTER TABLE public.student_answers DROP CONSTRAINT IF EXISTS student_answers_question_id_fkey;
ALTER TABLE public.student_answers DROP CONSTRAINT IF EXISTS student_answers_session_id_question_id_key;

-- 2. Ubah tipe data kolom session_id dan question_id menjadi BIGINT
-- Kita gunakan USING untuk mengkonversi data yang ada (jika ada)
ALTER TABLE public.student_answers 
  ALTER COLUMN session_id TYPE bigint USING (session_id::text::bigint),
  ALTER COLUMN question_id TYPE bigint USING (question_id::text::bigint);

-- 3. Tambahkan kembali Foreign Key dengan tipe yang benar
ALTER TABLE public.student_answers
  ADD CONSTRAINT student_answers_session_id_fkey 
  FOREIGN KEY (session_id) REFERENCES public.student_exam_sessions(id) ON DELETE CASCADE;

ALTER TABLE public.student_answers
  ADD CONSTRAINT student_answers_question_id_fkey 
  FOREIGN KEY (question_id) REFERENCES public.questions(id) ON DELETE CASCADE;

-- 4. Tambahkan kembali UNIQUE constraint untuk mendukung UPSERT (Auto-save)
ALTER TABLE public.student_answers 
  ADD CONSTRAINT student_answers_session_id_question_id_key UNIQUE (session_id, question_id);

-- 5. Pastikan RLS tetap aktif dan memberikan izin
ALTER TABLE public.student_answers ENABLE ROW LEVEL SECURITY;

-- 6. Berikan izin akses untuk semua role (untuk testing)
GRANT ALL ON public.student_answers TO anon, authenticated, service_role;
