
-- =================================================================
-- FIX_DEFAULT_KOP.sql
-- Memastikan konfigurasi KOP Surat memiliki nilai default yang valid
-- Jalankan ini agar fitur cetak tidak menampilkan data kosong.
-- =================================================================

UPDATE public.app_config
SET 
    kop_header1 = COALESCE(NULLIF(kop_header1, ''), 'PEMERINTAH PROVINSI JAWA TENGAH'),
    kop_header2 = COALESCE(NULLIF(kop_header2, ''), 'DINAS PENDIDIKAN DAN KEBUDAYAAN'),
    school_name = COALESCE(NULLIF(school_name, ''), 'SEKOLAH MENENGAH PERTAMA NEGERI'),
    school_address = COALESCE(NULLIF(school_address, ''), 'Jl. Pendidikan No. 1'),
    school_district = COALESCE(NULLIF(school_district, ''), 'KABUPATEN DEMAK'),
    school_code = COALESCE(NULLIF(school_code, ''), '203xxxxx')
WHERE id = 1;

-- Konfirmasi
SELECT school_name, kop_header1, kop_header2 FROM public.app_config;
