
-- =================================================================
-- FIX_TEACHER_LOGIN_FINAL.sql
-- SOLUSI PERMANEN ERROR "Database error querying schema"
-- =================================================================

BEGIN;

-- 1. REFRESH SCHEMA CACHE (SOLUSI UTAMA ERROR)
-- Ini memberitahu Supabase API untuk memuat ulang struktur database yang macet
NOTIFY pgrst, 'reload config';

-- 2. HAPUS SEMUA TRIGGER YANG BERPOTENSI MERUSAK LOGIN
-- Login mengupdate kolom 'last_sign_in_at', jika ada trigger di sini yang gagal, login akan gagal.
-- Kita hapus semua variasi nama trigger yang mungkin pernah dibuat.
DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;
DROP TRIGGER IF EXISTS on_user_update ON auth.users;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users; -- Hapus dulu agar bersih

-- 3. BUAT ULANG TRIGGER HANYA UNTUK INSERT (User Baru)
-- Fungsi handler insert
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (
    id, username, full_name, nisn, class, major, gender, religion, photo_url, role
  )
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data ->> 'full_name', 'User Baru'),
    COALESCE(new.raw_user_meta_data ->> 'nisn', split_part(new.email, '@', 1)),
    COALESCE(new.raw_user_meta_data ->> 'class', 'Belum diatur'),
    COALESCE(new.raw_user_meta_data ->> 'major', 'Belum diatur'),
    COALESCE(new.raw_user_meta_data ->> 'gender', 'Laki-laki'),
    COALESCE(new.raw_user_meta_data ->> 'religion', 'Islam'),
    COALESCE(new.raw_user_meta_data ->> 'photo_url', ''),
    COALESCE(new.raw_user_meta_data ->> 'role', 'student')
  )
  ON CONFLICT (id) DO UPDATE SET
    username = EXCLUDED.username,
    full_name = EXCLUDED.full_name,
    updated_at = now();
  RETURN new;
END;
$$;

-- Pasang kembali trigger HANYA untuk INSERT (AFTER INSERT)
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- 4. RESET IZIN AKSES (PERMISSIONS)
-- Memastikan role 'anon' dan 'authenticated' memiliki akses baca ke tabel publik
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO postgres, anon, authenticated, service_role;

-- 5. PERBAIKI KEBIJAKAN RLS UNTUK TABEL PUBLIC.USERS
-- Pastikan tidak ada kebijakan yang memblokir trigger atau select
DROP POLICY IF EXISTS "Public Read Access" ON public.users;
DROP POLICY IF EXISTS "Admin Full Access" ON public.users;
DROP POLICY IF EXISTS "Teacher can read users" ON public.users;

-- Kebijakan Umum: Semua orang bisa membaca data user (diperlukan untuk validasi login frontend)
CREATE POLICY "Public Read Access" ON public.users FOR SELECT USING (true);

-- Kebijakan Admin: Full Access
CREATE POLICY "Admin Full Access" ON public.users FOR ALL USING (
  (SELECT auth.email()) = 'admin@cbtschool.com'
);

-- 6. PASTIKAN RLS AKTIF
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

COMMIT;

-- Konfirmasi
SELECT 'Schema Cache Reloaded, Bad Triggers Removed & Permissions Fixed' as status;
