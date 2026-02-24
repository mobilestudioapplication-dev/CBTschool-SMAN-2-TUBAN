
-- =================================================================
-- FIX_LOGIN_SISWA_DEMAK.sql
-- EMERGENCY FIX: FORCE RESET USER & PASSWORD (HARD RESET)
-- Jalankan script ini untuk memperbaiki error "Invalid login credentials"
-- =================================================================

BEGIN;

-- 1. Pastikan Ekstensi Enkripsi Aktif
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Pastikan Konfigurasi Sekolah Benar
UPDATE public.app_config 
SET school_domain = 'smpn2demak.sch.id' 
WHERE id = 1;

-- 3. HARD RESET USER "ARI WIJAYA" (123456)
-- Kita menggunakan blok DO untuk logika prosedural yang aman
DO $$
DECLARE
  v_nisn text := '123456';
  v_email text := '123456@smpn2demak.sch.id';
  v_pass text := '123456'; -- Password disamakan dengan NISN
  v_user_id uuid;
BEGIN
  -- A. Cari User ID di auth.users berdasarkan email
  SELECT id INTO v_user_id FROM auth.users WHERE email = v_email;

  IF v_user_id IS NOT NULL THEN
    -- KASUS 1: User sudah ada di Auth, tapi password mungkin salah
    -- Kita paksa update passwordnya
    UPDATE auth.users
    SET 
      encrypted_password = crypt(v_pass, gen_salt('bf')), -- Re-hash password
      email_confirmed_at = now(), -- Pastikan email terkonfirmasi
      updated_at = now(),
      raw_app_meta_data = '{"provider": "email", "providers": ["email"]}'::jsonb,
      raw_user_meta_data = jsonb_build_object(
        'full_name', 'ARI WIJAYA',
        'nisn', v_nisn,
        'class', 'X PSPT 1'
      )
    WHERE id = v_user_id;
    
    -- Pastikan sinkron dengan public.users
    INSERT INTO public.users (id, username, full_name, nisn, class, gender, religion)
    VALUES (v_user_id, v_email, 'ARI WIJAYA', v_nisn, 'X PSPT 1', 'Laki-laki', 'Islam')
    ON CONFLICT (id) DO UPDATE 
    SET username = EXCLUDED.username, full_name = EXCLUDED.full_name;

  ELSE
    -- KASUS 2: User belum ada di Auth (Mungkin terhapus atau email lama beda)
    -- Cek apakah ada di public.users dengan NISN ini tapi ID beda/orphan
    SELECT id INTO v_user_id FROM public.users WHERE nisn = v_nisn LIMIT 1;
    
    IF v_user_id IS NOT NULL THEN
        -- Hapus data orphan di public agar bisa insert ulang dengan bersih (atau biarkan foreign key handle)
        DELETE FROM public.users WHERE id = v_user_id; 
    END IF;

    v_user_id := uuid_generate_v4();

    -- Insert Baru ke Auth
    INSERT INTO auth.users (
      id,
      instance_id,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      aud,
      role,
      created_at,
      updated_at
    ) VALUES (
      v_user_id,
      '00000000-0000-0000-0000-000000000000',
      v_email,
      crypt(v_pass, gen_salt('bf')), -- Hash Password
      now(),
      '{"provider": "email", "providers": ["email"]}'::jsonb,
      jsonb_build_object('full_name', 'ARI WIJAYA', 'nisn', v_nisn, 'class', 'X PSPT 1'),
      'authenticated',
      'authenticated',
      now(),
      now()
    );

    -- Insert Baru ke Public
    INSERT INTO public.users (id, username, full_name, nisn, class, gender, religion)
    VALUES (v_user_id, v_email, 'ARI WIJAYA', v_nisn, 'X PSPT 1', 'Laki-laki', 'Islam');
  END IF;

END $$;

COMMIT;

-- 4. Verifikasi Hasil
SELECT id, email, encrypted_password, created_at 
FROM auth.users 
WHERE email = '123456@smpn2demak.sch.id';
