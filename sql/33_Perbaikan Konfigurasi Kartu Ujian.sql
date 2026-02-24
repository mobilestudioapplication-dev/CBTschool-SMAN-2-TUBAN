
-- =================================================================
-- SQL_FIX_CARD_DATA.sql
-- TUJUAN: Melengkapi data konfigurasi agar Kartu Ujian tampil sempurna
-- =================================================================

BEGIN;

-- Update data konfigurasi default jika masih kosong
UPDATE public.app_config
SET 
    headmaster_name = COALESCE(NULLIF(headmaster_name, ''), 'Dr. H. KEPALA SEKOLAH, M.Pd'),
    headmaster_nip = COALESCE(NULLIF(headmaster_nip, ''), '19800101 200501 1 001'),
    card_issue_date = COALESCE(NULLIF(card_issue_date, ''), 'Surabaya, 16 Februari 2026'),
    -- Gunakan logo default jika kosong untuk preview yang bagus
    logo_url = COALESCE(NULLIF(logo_url, ''), 'https://via.placeholder.com/150/0000FF/808080?text=LOGO')
WHERE id = 1;

COMMIT;

SELECT 'Data konfigurasi kartu ujian berhasil diperbarui.' as status;
