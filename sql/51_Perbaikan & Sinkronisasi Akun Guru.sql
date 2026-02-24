-- GANTI '12345678' DENGAN USERNAME/NIP GURU YANG MAU DITEST
DO $$
DECLARE
    v_target_username text := '123456'; -- CONTOH: Masukkan NIP Guru disini
    v_user_id uuid;
    v_email text;
    v_pass text := '123456';
    v_domain text := 'smpn2demak.sch.id';
BEGIN
    -- 1. Ambil ID dari Public Users
    SELECT id INTO v_user_id FROM public.users WHERE username = v_target_username OR nisn = v_target_username;
    
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'User dengan username/NIP % tidak ditemukan di public.users', v_target_username;
    END IF;

    -- 2. Tentukan Email Format Baru (Wajib konsisten)
    -- Kita paksa format emailnya agar kita TAHU PASTI apa yang harus diketik saat login
    v_email := v_target_username || '@teacher.' || v_domain;

    RAISE NOTICE 'Memperbaiki User ID: % | Email Baru: %', v_user_id, v_email;

    -- 3. HARD DELETE DARI AUTH (Bersihkan sisa-sisa error)
    -- Kita hapus identity dan user authnya.
    -- NOTE: Data di public.users AMAN karena tidak kita delete.
    DELETE FROM auth.identities WHERE user_id = v_user_id;
    DELETE FROM auth.users WHERE id = v_user_id;

    -- 4. INSERT ULANG KE AUTH.USERS (Clean Slate)
    INSERT INTO auth.users (
        id, 
        instance_id, 
        email, 
        encrypted_password, 
        email_confirmed_at, 
        aud, 
        role, 
        raw_app_meta_data, 
        raw_user_meta_data, 
        created_at, 
        updated_at,
        is_sso_user
    ) VALUES (
        v_user_id, 
        '00000000-0000-0000-0000-000000000000', 
        v_email, 
        crypt(v_pass, extensions.gen_salt('bf', 10)), -- Paksa Cost 10 (Standar Supabase)
        now(), 
        'authenticated', 
        'authenticated', 
        '{"provider": "email", "providers": ["email"]}', 
        jsonb_build_object('role', 'teacher', 'full_name', 'Guru Reset', 'iss', 'https://api.supabase.co/auth/v1'), 
        now(), 
        now(),
        false
    );

    -- 5. INSERT ULANG KE AUTH.IDENTITIES (KUNCI UTAMA LOGIN EMAIL)
    -- Penting: provider_id HARUS email, bukan ID.
    INSERT INTO auth.identities (
        id, 
        user_id, 
        identity_data, 
        provider, 
        provider_id, 
        last_sign_in_at, 
        created_at, 
        updated_at
    ) VALUES (
        gen_random_uuid(), 
        v_user_id, 
        jsonb_build_object('sub', v_user_id, 'email', v_email, 'email_verified', true), 
        'email', 
        v_email, -- << INI YANG SERING SALAH. HARUS EMAIL.
        now(), 
        now(), 
        now()
    );

    -- 6. UPDATE PUBLIC USER AGAR SINKRON
    UPDATE public.users 
    SET 
        username = v_email, -- Update username public jadi email agar tidak bingung
        password_text = v_pass,
        role = 'teacher'
    WHERE id = v_user_id;

    RAISE NOTICE 'SUKSES! Silahkan login dengan Email: % dan Password: %', v_email, v_pass;

END $$;