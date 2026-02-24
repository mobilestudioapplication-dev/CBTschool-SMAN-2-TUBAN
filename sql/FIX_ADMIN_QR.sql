
-- =================================================================
-- FIX FINAL: LOGIN QR ADMIN
-- Jalankan script ini di SQL Editor Supabase
-- =================================================================

-- 1. Pastikan kolom qr_login_password ada
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS qr_login_password TEXT;

-- 2. Hapus policy lama yang mungkin membatasi akses
DROP POLICY IF EXISTS "Admin can manage users" ON public.users;
DROP POLICY IF EXISTS "Admin full access" ON public.users;

-- 3. Buat Policy baru yang SANGAT PERMISIF untuk Admin
-- Mengizinkan akses jika user adalah pemilik data (id cocok) ATAU emailnya admin
CREATE POLICY "Admin full access" 
ON public.users 
FOR ALL 
USING (
  auth.uid() = id 
  OR 
  auth.email() = 'admin@cbtschool.com'
);

-- 4. PAKSA Insert data Admin ke public.users jika belum ada
-- Ini langkah krusial: jika baris ini tidak ada, UPDATE di aplikasi akan gagal diam-diam
INSERT INTO public.users (id, username, full_name, gender, religion)
SELECT 
  id, 
  email, 
  COALESCE(raw_user_meta_data->>'full_name', 'Administrator'),
  'Laki-laki', -- Default wajib
  'Islam'      -- Default wajib
FROM auth.users 
WHERE email = 'admin@cbtschool.com'
ON CONFLICT (id) DO UPDATE 
SET 
  username = EXCLUDED.username,
  full_name = EXCLUDED.full_name;

-- Konfirmasi status
SELECT count(*) as total_admin_in_public_users FROM public.users WHERE username = 'admin@cbtschool.com';
