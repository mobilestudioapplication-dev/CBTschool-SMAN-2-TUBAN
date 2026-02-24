-- 1. Drop the ambiguous functions explicitly by signature
-- Drop the version with 30 arguments (previous version)
DROP FUNCTION IF EXISTS public.update_app_config_v2(
    INT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, INT, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, 
    TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, 
    TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
);

-- Drop the version with 31 arguments (current target version, just in case)
DROP FUNCTION IF EXISTS public.update_app_config_v2(
    INT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, INT, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, 
    TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, 
    TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
);

-- 2. Ensure columns exist
ALTER TABLE public.app_config ADD COLUMN IF NOT EXISTS student_data_sheet_url TEXT DEFAULT '';
ALTER TABLE public.app_config ADD COLUMN IF NOT EXISTS school_domain TEXT DEFAULT '';
ALTER TABLE public.app_config ADD COLUMN IF NOT EXISTS email_domain TEXT DEFAULT '@sekolah.sch.id';

-- 3. Re-create the function with 31 arguments
CREATE OR REPLACE FUNCTION public.update_app_config_v2(
    p_id INT,
    p_school_name TEXT,
    p_logo_url TEXT,
    p_left_logo_url TEXT,
    p_primary_color TEXT,
    p_enable_anti_cheat BOOLEAN,
    p_anti_cheat_violation_limit INT,
    p_allow_student_manual_login BOOLEAN,
    p_allow_student_qr_login BOOLEAN,
    p_allow_admin_manual_login BOOLEAN,
    p_allow_admin_qr_login BOOLEAN,
    p_headmaster_name TEXT,
    p_headmaster_nip TEXT,
    p_card_issue_date TEXT,
    p_signature_url TEXT,
    p_stamp_url TEXT,
    p_email_domain TEXT,
    p_school_address TEXT,
    p_school_district TEXT,
    p_school_code TEXT,
    p_region_code TEXT,
    p_school_phone TEXT,
    p_school_email TEXT,
    p_school_website TEXT,
    p_kop_header1 TEXT,
    p_kop_header2 TEXT,
    p_default_paper_size TEXT,
    p_current_exam_event TEXT,
    p_academic_year TEXT,
    p_school_domain TEXT,
    p_student_data_sheet_url TEXT
) RETURNS VOID AS $$
BEGIN
    UPDATE public.app_config
    SET
        school_name = p_school_name,
        logo_url = p_logo_url,
        left_logo_url = p_left_logo_url,
        primary_color = p_primary_color,
        enable_anti_cheat = p_enable_anti_cheat,
        anti_cheat_violation_limit = p_anti_cheat_violation_limit,
        allow_student_manual_login = p_allow_student_manual_login,
        allow_student_qr_login = p_allow_student_qr_login,
        allow_admin_manual_login = p_allow_admin_manual_login,
        allow_admin_qr_login = p_allow_admin_qr_login,
        headmaster_name = p_headmaster_name,
        headmaster_nip = p_headmaster_nip,
        card_issue_date = p_card_issue_date,
        signature_url = p_signature_url,
        stamp_url = p_stamp_url,
        email_domain = p_email_domain,
        school_address = p_school_address,
        school_district = p_school_district,
        school_code = p_school_code,
        region_code = p_region_code,
        school_phone = p_school_phone,
        school_email = p_school_email,
        school_website = p_school_website,
        kop_header1 = p_kop_header1,
        kop_header2 = p_kop_header2,
        default_paper_size = p_default_paper_size,
        current_exam_event = p_current_exam_event,
        academic_year = p_academic_year,
        school_domain = p_school_domain,
        student_data_sheet_url = p_student_data_sheet_url
    WHERE id = p_id;
    
    IF NOT FOUND THEN
        INSERT INTO public.app_config (
            id, school_name, logo_url, left_logo_url, primary_color, enable_anti_cheat, anti_cheat_violation_limit,
            allow_student_manual_login, allow_student_qr_login, allow_admin_manual_login, allow_admin_qr_login,
            headmaster_name, headmaster_nip, card_issue_date, signature_url, stamp_url, email_domain,
            school_address, school_district, school_code, region_code, school_phone, school_email, school_website,
            kop_header1, kop_header2, default_paper_size, current_exam_event, academic_year, school_domain,
            student_data_sheet_url
        ) VALUES (
            p_id, p_school_name, p_logo_url, p_left_logo_url, p_primary_color, p_enable_anti_cheat, p_anti_cheat_violation_limit,
            p_allow_student_manual_login, p_allow_student_qr_login, p_allow_admin_manual_login, p_allow_admin_qr_login,
            p_headmaster_name, p_headmaster_nip, p_card_issue_date, p_signature_url, p_stamp_url, p_email_domain,
            p_school_address, p_school_district, p_school_code, p_region_code, p_school_phone, p_school_email, p_school_website,
            p_kop_header1, p_kop_header2, p_default_paper_size, p_current_exam_event, p_academic_year, p_school_domain,
            p_student_data_sheet_url
        );
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Grant permissions explicitly to the new function signature
GRANT EXECUTE ON FUNCTION public.update_app_config_v2(
    INT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, INT, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, 
    TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, 
    TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.update_app_config_v2(
    INT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, INT, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, 
    TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, 
    TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO service_role;

GRANT EXECUTE ON FUNCTION public.update_app_config_v2(
    INT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, INT, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, 
    TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, 
    TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO postgres;
