
import { createClient } from '@supabase/supabase-js';
import { AppConfig, User, Test, Question } from './types';

const supabaseUrl = process.env.SUPABASE_URL || 'https://vcnogrsdyplvgajworlp.supabase.co';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZjbm9ncnNkeXBsdmdhandvcmxwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4OTk5MjIsImV4cCI6MjA4NzQ3NTkyMn0.OwqmdL9Nex6q1ZGpcHKoVcyIdYNd-MfWIbLAPEjMjY8';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    // Workaround for Navigator LockManager timeout in iframe/preview environments
    // We provide a no-op lock function that just executes the callback immediately
    // @ts-ignore
    lock: async (name: string, acquireTimeout: number, fn: () => Promise<any>) => {
      return await fn();
    }
  }
});

export const getConfig = async (defaultConfig: AppConfig): Promise<AppConfig> => {
    const { data, error } = await supabase
        .from('app_config')
        .select('*')
        .limit(1)
        .single();
        
    if (error || !data) return defaultConfig;

    return {
        id: data.id,
        schoolName: data.school_name ?? defaultConfig.schoolName,
        logoUrl: data.logo_url ?? defaultConfig.logoUrl,
        leftLogoUrl: data.left_logo_url || '', // New Mapping
        primaryColor: data.primary_color ?? defaultConfig.primaryColor,
        enableAntiCheat: data.enable_anti_cheat ?? defaultConfig.enableAntiCheat,
        antiCheatViolationLimit: data.anti_cheat_violation_limit ?? defaultConfig.antiCheatViolationLimit,
        allowStudentManualLogin: data.allow_student_manual_login ?? defaultConfig.allowStudentManualLogin,
        allowStudentQrLogin: data.allow_student_qr_login ?? defaultConfig.allowStudentQrLogin,
        allowAdminManualLogin: data.allow_admin_manual_login ?? defaultConfig.allowAdminManualLogin,
        allowAdminQrLogin: data.allow_admin_qr_login ?? defaultConfig.allowAdminQrLogin,
        headmasterName: data.headmaster_name || '',
        headmasterNip: data.headmaster_nip || '',
        cardIssueDate: data.card_issue_date || '',
        signatureUrl: data.signature_url || '',
        stampUrl: data.stamp_url || '',
        emailDomain: data.email_domain || defaultConfig.emailDomain,
        defaultPaperSize: data.default_paper_size || 'A4',
        // New Fields Mapping
        schoolAddress: data.school_address || '',
        schoolDistrict: data.school_district || 'KABUPATEN',
        schoolCode: data.school_code || '',
        regionCode: data.region_code || '',
        schoolPhone: data.school_phone || '',
        schoolEmail: data.school_email || '',
        schoolWebsite: data.school_website || '',
        kopHeader1: data.kop_header1 || 'PEMERINTAH PROVINSI',
        kopHeader2: data.kop_header2 || 'DINAS PENDIDIKAN',
        currentExamEvent: data.current_exam_event || 'UJIAN SEKOLAH BERBASIS KOMPUTER',
        academicYear: data.academic_year || '2023/2024',
        studentDataSheetUrl: data.student_data_sheet_url || '',
    };
};

const normalizeStr = (str: string | undefined | null): string => {
    if (!str) return '';
    return str.toUpperCase().replace(/[^A-Z0-9]/g, '');
};

export const getTestByToken = async (token: string, user: User): Promise<Test | null> => {
    const cleanToken = token.trim().toUpperCase();

    try {
        const { data: testData, error: testError } = await supabase
            .from('tests')
            .select(`
                *,
                schedules (
                    id,
                    start_time,
                    end_time,
                    assigned_to
                )
            `)
            .eq('token', cleanToken)
            .maybeSingle();

        if (testError || !testData) return null;

        const now = new Date().getTime();
        const CLOCK_SKEW_MS = 15 * 60 * 1000; 

        const activeSchedules = testData.schedules.filter((s: any) => {
            const start = new Date(s.start_time).getTime();
            const end = new Date(s.end_time).getTime();
            return now >= (start - CLOCK_SKEW_MS) && now <= (end + CLOCK_SKEW_MS);
        });

        if (activeSchedules.length === 0) return null;

        const userClassNorm = normalizeStr(user.class);
        const userMajorNorm = normalizeStr(user.major);

        const isAuthorized = activeSchedules.some((s: any) => {
            if (!s.assigned_to) return false;
            const normalizedTargets = s.assigned_to.map(normalizeStr);
            return normalizedTargets.includes(userClassNorm) || normalizedTargets.includes(userMajorNorm);
        });

        if (!isAuthorized) return null;

        const { data: questionsData, error: qError } = await supabase
            .from('questions')
            .select('*')
            .eq('test_id', testData.id)
            .order('id', { ascending: true });

        if (qError) throw qError;
        
        return {
            details: {
                id: testData.id,
                token: cleanToken,
                name: testData.name,
                subject: testData.subject,
                duration: `${testData.duration_minutes} Menit`,
                durationMinutes: testData.duration_minutes,
                questionsToDisplay: testData.questions_to_display,
                randomizeQuestions: testData.randomize_questions,
                randomizeAnswers: testData.randomize_answers,
                examType: testData.exam_type || 'Umum', // Mapped from DB
                time: new Date().toLocaleString('id-ID')
            },
            questions: (questionsData || []).map((q: any) => ({
                id: q.id,
                type: q.type as any, // Penting: Mengambil tipe langsung dari database
                question: q.question,
                image: q.image_url,
                audio: q.audio_url,
                video: q.video_url,
                options: q.options || [],
                optionImages: q.option_images || [],
                correctAnswerIndex: q.correct_answer_index || 0,
                answerKey: q.answer_key, // Memuat JSONB kunci jawaban
                metadata: q.metadata,   // Memuat JSONB metadata (item menjodohkan)
                difficulty: q.difficulty || 'Medium',
                weight: q.weight || 1,
                topic: q.topic,
            }))
        };

    } catch (error: any) {
        console.error("[CBT-AUTH-FATAL]", error.message);
        return null;
    }
};
