-- Enable RLS just in case
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Enable read access for all users" ON public.app_config;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.app_config;
DROP POLICY IF EXISTS "Enable update for authenticated users only" ON public.app_config;
DROP POLICY IF EXISTS "Public Read" ON public.app_config;
DROP POLICY IF EXISTS "Admin Update" ON public.app_config;
DROP POLICY IF EXISTS "Authenticated Update" ON public.app_config;
DROP POLICY IF EXISTS "Authenticated Insert" ON public.app_config;

-- Create Read Policy (Public)
CREATE POLICY "Public Read" ON public.app_config
FOR SELECT USING (true);

-- Create Update Policy (Authenticated Users)
CREATE POLICY "Authenticated Update" ON public.app_config
FOR UPDATE USING (auth.role() = 'authenticated');

-- Create Insert Policy
CREATE POLICY "Authenticated Insert" ON public.app_config
FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Grant permissions explicitly
GRANT ALL ON public.app_config TO postgres;
GRANT SELECT ON public.app_config TO anon;
GRANT ALL ON public.app_config TO authenticated;
GRANT ALL ON public.app_config TO service_role;

-- Create RPC function to update config securely
CREATE OR REPLACE FUNCTION update_app_config_v2(
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
    p_school_domain TEXT
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
        school_domain = p_school_domain
    WHERE id = p_id;
    
    IF NOT FOUND THEN
        INSERT INTO public.app_config (
            id, school_name, logo_url, left_logo_url, primary_color, enable_anti_cheat, anti_cheat_violation_limit,
            allow_student_manual_login, allow_student_qr_login, allow_admin_manual_login, allow_admin_qr_login,
            headmaster_name, headmaster_nip, card_issue_date, signature_url, stamp_url, email_domain,
            school_address, school_district, school_code, region_code, school_phone, school_email, school_website,
            kop_header1, kop_header2, default_paper_size, current_exam_event, academic_year, school_domain
        ) VALUES (
            p_id, p_school_name, p_logo_url, p_left_logo_url, p_primary_color, p_enable_anti_cheat, p_anti_cheat_violation_limit,
            p_allow_student_manual_login, p_allow_student_qr_login, p_allow_admin_manual_login, p_allow_admin_qr_login,
            p_headmaster_name, p_headmaster_nip, p_card_issue_date, p_signature_url, p_stamp_url, p_email_domain,
            p_school_address, p_school_district, p_school_code, p_region_code, p_school_phone, p_school_email, p_school_website,
            p_kop_header1, p_kop_header2, p_default_paper_size, p_current_exam_event, p_academic_year, p_school_domain
        );
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION update_app_config_v2 TO authenticated;
