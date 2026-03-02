
import React, { useState, useEffect } from 'react';
import { supabase, getConfig, getTestByToken } from './supabaseClient';
import LoginScreen from './screens/LoginScreen';
import ConfirmationScreen from './screens/ConfirmationScreen';
import TestScreen from './screens/TestScreen';
import FinishScreen from './screens/FinishScreen';
import TokenScreen from './screens/TokenScreen';
import BiodataScreen from './screens/BiodataScreen';
import AdminDashboard from './screens/AdminDashboard';
import TeacherDashboard from './screens/TeacherDashboard'; // Import Dashboard Guru
import ProfileErrorScreen from './screens/ProfileErrorScreen';
import DeviceMismatchModal from './components/DeviceMismatchModal'; 
import CopyrightModal from './components/CopyrightModal';
import { AppState, Test, User, AppConfig } from './types';
import { DEFAULT_PROFILE_IMAGES } from './constants';
import { getDeviceId, getDeviceInfo } from './utils/device'; 

const DEFAULT_CONFIG: AppConfig = {
  schoolName: 'SMAN 2 TUBAN', 
  logoUrl: 'https://res.cloudinary.com/dt1nrarpq/image/upload/v1771398439/logo_jpg-removebg-preview_ttel5m.png', 
  primaryColor: '#2563eb', 
  enableAntiCheat: true,
  antiCheatViolationLimit: 3,
  allowStudentManualLogin: true,
  allowStudentQrLogin: true,
  allowAdminManualLogin: true,
  allowAdminQrLogin: true,
  headmasterName: 'Nama Kepala Sekolah',
  headmasterNip: 'NIP. 123456789012345678',
  cardIssueDate: 'Demak, 25 Juli 2024',
  signatureUrl: '',
  stampUrl: '',
  studentDataSheetUrl: '',
  emailDomain: '@smkn8sby.sch.id', // Reverted to original to match Auth accounts
  academicYear: '2023/2024',
};

// Helper for UUID generation
const generateSessionId = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
};

const App: React.FC = () => {
  const [isConfigLoading, setIsConfigLoading] = useState(true);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [config, setConfig] = useState<AppConfig | null>(null);
  
  const [appState, setAppState] = useState<AppState>(AppState.LOGIN);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [selectedTest, setSelectedTest] = useState<Test | null>(null);
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);
  
  // State for Device Lock Modal
  const [isDeviceLocked, setIsDeviceLocked] = useState(false);
  const [isCopyrightOpen, setIsCopyrightOpen] = useState(false);

  useEffect(() => {
    const fetchAppConfig = async () => {
      // Set a timeout for config loading to prevent infinite spinner
      const timeoutId = setTimeout(() => {
        if (isConfigLoading) {
          console.warn("Config load timed out. Using default.");
          setConfig(DEFAULT_CONFIG);
          setIsConfigLoading(false);
        }
      }, 5000);

      try {
        const appConfig = await getConfig(DEFAULT_CONFIG);
        if (appConfig.enableAntiCheat === undefined) {
            appConfig.enableAntiCheat = DEFAULT_CONFIG.enableAntiCheat;
        }
        setConfig(appConfig);
      } catch (error) {
        console.warn("Config load failed. Using default.", error);
        setConfig(DEFAULT_CONFIG);
      } finally {
        clearTimeout(timeoutId);
        setIsConfigLoading(false);
      }
    };
    fetchAppConfig();
  }, []);

  // --- BrandingManager Sync ---
  useEffect(() => {
    if (!config) return;
    const { schoolName, logoUrl } = config;
    document.title = `${schoolName} | CBT Online`;
    const favicon = document.getElementById('dynamic-favicon') as HTMLLinkElement | null;
    if (favicon && logoUrl) favicon.href = logoUrl;
  }, [config?.schoolName, config?.logoUrl]);

  useEffect(() => {
    if (isConfigLoading) return;

    // Cek session storage siswa manual (Non-Supabase Auth)
    try {
        const studentSession = sessionStorage.getItem('cbt_student_session');
        if (studentSession) {
            const studentUser: User = JSON.parse(studentSession);
            setCurrentUser(studentUser);
            const lastState = sessionStorage.getItem('cbt_app_state');
            if (lastState && lastState !== AppState.LOGIN.toString()) {
                setAppState(parseInt(lastState) as AppState);
            } else {
                setAppState(AppState.BIODATA);
            }
            setIsAuthLoading(false);
            return;
        }
    } catch(e) {
        console.error("Failed to parse student session", e);
        sessionStorage.removeItem('cbt_student_session');
    }

    // Listener Supabase Auth (Untuk Admin & Guru)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (isBatchProcessing) return;

      if (event === 'SIGNED_IN' && session?.user) {
        const user = session.user;
        const email = user.email || '';
        
        // --- DETEKSI ROLE (CRITICAL UPDATE - FIXED) ---
        let dbRole = 'student';
        let dbData = null;

        try {
            // Ambil data detail dari public.users
            const { data: profile } = await supabase.from('users').select('*').eq('id', user.id).single();
            if (profile) {
                // PRIORITAS 1: Role dari database public
                dbRole = profile.role || 'student';
                dbData = profile;
            } else {
                // PRIORITAS 2: Role dari metadata auth (fallback jika public belum sync)
                dbRole = user.user_metadata?.role || 'student';
            }
        } catch (e) {
            console.error("Profile fetch error", e);
            // Fallback ke metadata jika fetch DB gagal
            dbRole = user.user_metadata?.role || 'student';
        }

        // --- GATEKEEPER LOGIC (PINTU MASUK) ---
        
        // 1. ADMIN
        if (dbRole === 'admin' || email === 'admin@cbtschool.com') {
          const adminUser: User = {
            id: user.id,
            username: email,
            fullName: dbData?.full_name || user.user_metadata?.full_name || 'Administrator',
            nisn: 'N/A', class: 'Admin', major: 'System', religion: 'Islam', gender: 'Laki-laki', role: 'admin',
            photoUrl: dbData?.photo_url || user.user_metadata?.avatar_url || DEFAULT_PROFILE_IMAGES.ADMIN
          };
          setCurrentUser(adminUser);
          setAppState(AppState.ADMIN_DASHBOARD);

        } 
        // 2. GURU (TEACHER) - LOGIC DIPERBAIKI
        // Kita percayai role 'teacher' dari DB sepenuhnya, tanpa peduli format email.
        else if (dbRole === 'teacher') {
           const teacherUser: User = {
            id: user.id,
            username: email,
            fullName: dbData?.full_name || user.user_metadata?.full_name || 'Guru',
            nisn: dbData?.nisn || 'N/A', 
            class: dbData?.class || 'STAFF', 
            major: dbData?.major || 'Guru Mapel', 
            religion: dbData?.religion || 'Islam', 
            gender: dbData?.gender || 'Laki-laki', 
            role: 'teacher',
            photoUrl: dbData?.photo_url || DEFAULT_PROFILE_IMAGES.ADMIN
          };
          setCurrentUser(teacherUser);
          setAppState(AppState.TEACHER_DASHBOARD);

        } 
        // 3. SISWA / UNDEFINED
        else {
            // Cek apakah ini sebenarnya Guru yang role-nya belum terset di DB tapi emailnya mengandung ciri guru
            if (email.includes('@teacher.') || email.startsWith('guru')) {
                 console.warn("[AUTH] Terdeteksi email guru dengan role student. Mencoba akses Teacher Dashboard...");
                 // Paksa update state sementara menunggu DB sync
                 const tempTeacher: User = {
                    id: user.id, username: email, fullName: 'Guru (Loading...)', nisn: '-', class: 'STAFF', major: 'Guru', gender: 'Laki-laki', religion: 'Islam', role: 'teacher', photoUrl: ''
                 };
                 setCurrentUser(tempTeacher);
                 setAppState(AppState.TEACHER_DASHBOARD);
                 return;
            }

            // SISWA: Izinkan login via Auth agar RLS bekerja
            const studentUser: User = {
                id: user.id,
                username: email,
                fullName: dbData?.full_name || user.user_metadata?.full_name || 'Siswa',
                nisn: dbData?.nisn || user.user_metadata?.nisn || email.split('@')[0],
                class: dbData?.class || user.user_metadata?.class || '-',
                major: dbData?.major || user.user_metadata?.major || '-',
                gender: dbData?.gender || user.user_metadata?.gender || 'Laki-laki',
                religion: dbData?.religion || user.user_metadata?.religion || 'Islam',
                role: 'student',
                photoUrl: dbData?.photo_url || user.user_metadata?.photo_url || DEFAULT_PROFILE_IMAGES.STUDENT_NEUTRAL
            };
            setCurrentUser(studentUser);
            
            // Restore state jika ada
            const lastState = sessionStorage.getItem('cbt_app_state');
            if (lastState && lastState !== AppState.LOGIN.toString()) {
                setAppState(parseInt(lastState) as AppState);
            } else {
                setAppState(AppState.BIODATA);
            }
        }
      } else if (event === 'SIGNED_OUT') {
        setCurrentUser(null);
        setSelectedTest(null);
        setAppState(AppState.LOGIN);
        sessionStorage.clear();
      }
      setIsAuthLoading(false);
    });
    
    const checkInitialSession = async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
            setIsAuthLoading(false);
        }
    };
    checkInitialSession();

    return () => subscription.unsubscribe();
  }, [isConfigLoading, isBatchProcessing]);
  
  useEffect(() => {
      if(currentUser && !currentUser.username.includes('admin') && !currentUser.role?.includes('teacher')) {
          sessionStorage.setItem('cbt_app_state', appState.toString());
      }
  }, [appState, currentUser]);

  const handleUpdateConfig = async (newConfig: AppConfig): Promise<boolean> => {
    const oldConfig = config;
    setConfig(newConfig);

    // Use existing ID or fallback to check DB
    const configId = newConfig.id || oldConfig?.id;

    const dbPayload = {
      school_name: newConfig.schoolName,
      logo_url: newConfig.logoUrl,
      left_logo_url: newConfig.leftLogoUrl || null,
      primary_color: newConfig.primaryColor,
      enable_anti_cheat: newConfig.enableAntiCheat,
      anti_cheat_violation_limit: newConfig.antiCheatViolationLimit,
      allow_student_manual_login: newConfig.allowStudentManualLogin,
      allow_student_qr_login: newConfig.allowStudentQrLogin,
      allow_admin_manual_login: newConfig.allowAdminManualLogin,
      allow_admin_qr_login: newConfig.allowAdminQrLogin,
      headmaster_name: newConfig.headmasterName,
      headmaster_nip: newConfig.headmasterNip,
      card_issue_date: newConfig.cardIssueDate,
      signature_url: newConfig.signatureUrl,
      stamp_url: newConfig.stampUrl,
      email_domain: newConfig.emailDomain,
      school_address: newConfig.schoolAddress,
      school_district: newConfig.schoolDistrict,
      school_code: newConfig.schoolCode,
      region_code: newConfig.regionCode,
      school_phone: newConfig.schoolPhone,
      school_email: newConfig.schoolEmail,
      school_website: newConfig.schoolWebsite,
      kop_header1: newConfig.kopHeader1,
      kop_header2: newConfig.kopHeader2,
      default_paper_size: newConfig.defaultPaperSize,
      current_exam_event: newConfig.currentExamEvent,
      academic_year: newConfig.academicYear,
      school_domain: newConfig.schoolDomain, // Added
      student_data_sheet_url: newConfig.studentDataSheetUrl // Added
    };

    try {
      if (oldConfig && oldConfig.emailDomain !== newConfig.emailDomain) {
        try {
            const { error: rpcError } = await supabase.rpc('admin_update_email_domain', { new_domain: newConfig.emailDomain });
            if (rpcError) throw rpcError;
        } catch (e) {
            console.warn("Failed to update email domain via RPC (users might not be updated):", e);
        }
      }

      // 1. Try RPC Update (Most Robust, bypasses RLS if configured)
      const { error: rpcUpdateError } = await supabase.rpc('update_app_config_v2', {
          p_id: configId || 1,
          p_school_name: newConfig.schoolName,
          p_logo_url: newConfig.logoUrl,
          p_left_logo_url: newConfig.leftLogoUrl || null,
          p_primary_color: newConfig.primaryColor,
          p_enable_anti_cheat: newConfig.enableAntiCheat,
          p_anti_cheat_violation_limit: newConfig.antiCheatViolationLimit,
          p_allow_student_manual_login: newConfig.allowStudentManualLogin,
          p_allow_student_qr_login: newConfig.allowStudentQrLogin,
          p_allow_admin_manual_login: newConfig.allowAdminManualLogin,
          p_allow_admin_qr_login: newConfig.allowAdminQrLogin,
          p_headmaster_name: newConfig.headmasterName,
          p_headmaster_nip: newConfig.headmasterNip,
          p_card_issue_date: newConfig.cardIssueDate,
          p_signature_url: newConfig.signatureUrl,
          p_stamp_url: newConfig.stampUrl,
          p_email_domain: newConfig.emailDomain,
          p_school_address: newConfig.schoolAddress,
          p_school_district: newConfig.schoolDistrict,
          p_school_code: newConfig.schoolCode,
          p_region_code: newConfig.regionCode,
          p_school_phone: newConfig.schoolPhone,
          p_school_email: newConfig.schoolEmail,
          p_school_website: newConfig.schoolWebsite,
          p_kop_header1: newConfig.kopHeader1,
          p_kop_header2: newConfig.kopHeader2,
          p_default_paper_size: newConfig.defaultPaperSize,
          p_current_exam_event: newConfig.currentExamEvent,
          p_academic_year: newConfig.academicYear,
          p_school_domain: newConfig.schoolDomain || '',
          p_student_data_sheet_url: newConfig.studentDataSheetUrl || ''
      });

      if (!rpcUpdateError) {
          // Success via RPC
          const updatedConfig = await getConfig(DEFAULT_CONFIG);
          setConfig(updatedConfig);
          return true;
      }

      console.warn("RPC Update failed, falling back to direct update:", rpcUpdateError);

      // 2. Fallback: Direct Update (Subject to RLS)
      let error;
      if (configId) {
          const { error: updateError } = await supabase.from('app_config').update(dbPayload).eq('id', configId);
          error = updateError;
      } else {
          // Fallback: Check if any row exists
          const { data: existing } = await supabase.from('app_config').select('id').limit(1).maybeSingle();
          if (existing) {
              const { error: updateError } = await supabase.from('app_config').update(dbPayload).eq('id', existing.id);
              error = updateError;
          } else {
              const { error: insertError } = await supabase.from('app_config').insert(dbPayload);
              error = insertError;
          }
      }
      
      if (error) {
        alert("Gagal menyimpan konfigurasi ke database: " + error.message);
        setConfig(oldConfig); 
        return false;
      }
      
      // Reload config to ensure we have the latest ID and data
      const updatedConfig = await getConfig(DEFAULT_CONFIG);
      setConfig(updatedConfig);
      
      return true;
    } catch (error: any) {
      alert(`Gagal menyimpan konfigurasi: ${error.message}`);
      setConfig(oldConfig);
      return false;
    }
  };

  // --- SINGLE DEVICE LOCK LOGIC ---
  useEffect(() => {
      if (!currentUser || currentUser.role !== 'student') return;

      const checkSession = async () => {
          const localToken = localStorage.getItem('cbt_session_token');
          if (!localToken) return;

          // RPC Check (Bypasses RLS)
          const { data: isValid, error } = await supabase.rpc('validate_session', {
              p_user_id: currentUser.id,
              p_session_token: localToken
          });

          if (error) {
              console.error("Session validation error:", error);
              return;
          }

          if (isValid === false) {
              // Prevent alert loop
              if (appState !== AppState.LOGIN) {
                  alert("Sesi Anda telah berakhir karena akun ini login di perangkat lain.");
                  handleLogout();
              }
          }
      };

      // 1. Initial Check
      checkSession();

      // 2. Polling Interval (Robust Fallback for Realtime)
      // Check every 30 seconds to ensure single device enforcement (Reduced from 5s for performance)
      const intervalId = setInterval(checkSession, 30000);

      // 3. Realtime Subscription (Fast Reaction)
      const channel = supabase
          .channel(`user_session_${currentUser.id}`)
          .on(
              'postgres_changes',
              {
                  event: 'UPDATE',
                  schema: 'public',
                  table: 'users',
                  filter: `id=eq.${currentUser.id}`
              },
              (payload) => {
                  const newSessionToken = payload.new.active_session_token;
                  const localToken = localStorage.getItem('cbt_session_token');
                  
                  // If token changed in DB and doesn't match local token -> KICK
                  if (newSessionToken && newSessionToken !== localToken) {
                      if (appState !== AppState.LOGIN) {
                          alert("Akun Anda telah login di perangkat lain. Sesi ini akan diakhiri.");
                          handleLogout();
                      }
                  }
              }
          )
          .subscribe();

      return () => {
          clearInterval(intervalId);
          supabase.removeChannel(channel);
      };
  }, [currentUser, appState]); // Added appState to dependency to allow logout trigger

  const handleStudentLogin = async (nisn: string, password: string): Promise<string> => {
    setIsAuthLoading(true);
    try {
        // 1. Cari user di database untuk mendapatkan data profil
        const { data: dbUser, error: dbError } = await supabase
            .from('users')
            .select('*')
            .or(`nisn.eq.${nisn.trim()},username.eq.${nisn.trim()}`)
            .maybeSingle();

        if (dbError || !dbUser) return "Data tidak ditemukan di database sekolah.";

        // 2. Cek password manual (Validasi utama terhadap tabel users)
        const storedPass = dbUser.password_text || dbUser.qr_login_password || dbUser.nisn;
        if (password.trim() !== storedPass) return "Password salah.";

        // --- NEW: SINGLE DEVICE AUTHENTICATION CHECK ---
        try {
            const deviceId = getDeviceId();
            const deviceInfo = getDeviceInfo();
            
            const { data: lockResult, error: lockError } = await supabase.rpc('verify_and_lock_device', {
                p_nisn: nisn.trim(),
                p_device_id: deviceId,
                p_device_info: deviceInfo
            });

            if (lockError) {
                console.error("Device Lock Error:", lockError);
                // Optional: Allow login if system fails? Or block?
                // For security, we might want to block or just log.
                // Let's block to be safe if it's a critical feature.
                return "Gagal memverifikasi perangkat: " + lockError.message;
            }

            if (lockResult && lockResult.status === 'locked') {
                return lockResult.message || "Akun terkunci di perangkat lain.";
            }

            if (lockResult && lockResult.status === 'error') {
                return lockResult.message || "Terjadi kesalahan verifikasi perangkat.";
            }
            
            // If status is 'success', proceed.
        } catch (e: any) {
            console.error("Device Verification Exception:", e);
            return "Gagal memproses verifikasi perangkat.";
        }
        // -----------------------------------------------

        // 3. Login ke Supabase Auth (Opsional/Best Effort)
        try {
            const { error: authError } = await supabase.auth.signInWithPassword({
                email: dbUser.username,
                password: password.trim()
            });

            if (authError) {
                console.warn("[AUTH] Supabase Auth failed, using Manual Session fallback:", authError.message);
            }
        } catch (e) {
            console.warn("[AUTH] Auth attempt error, falling back to manual session.");
        }

        // 4. SINGLE DEVICE LOCK: Claim Session
        const sessionToken = generateSessionId();
        const { error: claimError } = await supabase.rpc('claim_session', {
            p_user_id: dbUser.id,
            p_session_token: sessionToken
        });

        if (claimError) {
            console.error("Session Claim Error:", claimError);
            return "Gagal mengunci sesi perangkat. Silakan coba lagi."; // Strict enforcement
        }
        
        localStorage.setItem('cbt_session_token', sessionToken);

        // 5. SET MANUAL SESSION (Penyelamat jika Auth bermasalah)
        const studentUser: User = {
            id: dbUser.id,
            username: dbUser.username,
            fullName: dbUser.full_name,
            nisn: dbUser.nisn,
            class: dbUser.class,
            major: dbUser.major,
            gender: dbUser.gender,
            religion: dbUser.religion,
            role: 'student',
            photoUrl: dbUser.photo_url || DEFAULT_PROFILE_IMAGES.STUDENT_NEUTRAL
        };

        sessionStorage.setItem('cbt_student_session', JSON.stringify(studentUser));
        setCurrentUser(studentUser);
        setAppState(AppState.BIODATA);
        
        return "";
    } catch (err: any) {
        return "Terjadi kesalahan tak terduga saat login: " + err.message;
    } finally {
        setIsAuthLoading(false);
    }
  };
  
  const handleAdminLogin = async (email: string, password: string): Promise<string> => {
      setIsAuthLoading(true);
      // Direct pass to Supabase Auth - LoginScreenGuru already handles the formatting logic
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setIsAuthLoading(false);
      if (error) return error.message;
      return "";
  };

  const handleConfirmBiodata = () => setAppState(AppState.TOKEN_ENTRY);
  const handleStartTest = () => setAppState(AppState.TESTING);
  const handleFinishTest = () => setAppState(AppState.FINISHED);
  
  const handleTokenSubmit = async (token: string): Promise<boolean> => {
    if (!currentUser) return false;
    const cleanedToken = token.replace(/\s/g, '').toUpperCase();
    const test = await getTestByToken(cleanedToken, currentUser);
    if (test) {
        setSelectedTest(test);
        setAppState(AppState.CONFIRMATION);
        return true;
    }
    return false;
  };

  const handleLogout = async () => {
    sessionStorage.clear();
    localStorage.removeItem('supabase.auth.token'); 
    localStorage.removeItem('cbt_session_token'); // Clear Single Device Token

    // Update UI immediately
    setCurrentUser(null);
    setSelectedTest(null);
    setAppState(AppState.LOGIN);

    // Run cleanup in background
    try {
        await supabase.auth.signOut();
    } catch (error) {
        console.error("Logout cleanup error:", error);
    }
  };



  if (isConfigLoading || isAuthLoading) {
    return (
        <div className="h-screen w-full flex flex-col items-center justify-center text-gray-600 bg-gray-50 p-4 text-center">
            <svg className="animate-spin h-10 w-10 text-blue-600 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <p className="animate-pulse text-lg mb-4">Sedang memuat aplikasi ujian...</p>
        </div>
    );
  }
  
  const safeConfig = config || DEFAULT_CONFIG;

  return (
    <div className="min-h-screen w-full antialiased flex flex-col">
      <main className="flex-grow flex flex-col">
        {(() => {
          // Safety fallback: Jika config belum siap (sangat jarang karena ada spinner), jangan render
          if (!safeConfig) return null;

          switch (appState) {
            case AppState.LOGIN:
              return <LoginScreen config={safeConfig} onStudentLogin={handleStudentLogin} onAdminLogin={handleAdminLogin} />;
            
            case AppState.PROFILE_ERROR:
              return <ProfileErrorScreen onLogout={handleLogout} config={safeConfig} />;
            
            case AppState.BIODATA:
              if (!currentUser) {
                  // Recovery: Jika data user hilang di state ini, paksa balik ke Login
                  setTimeout(() => setAppState(AppState.LOGIN), 0);
                  return null;
              }
              return <BiodataScreen student={currentUser} onConfirm={handleConfirmBiodata} onLogout={handleLogout} config={safeConfig} />;
            
            case AppState.TOKEN_ENTRY:
              if (!currentUser) {
                  setTimeout(() => setAppState(AppState.LOGIN), 0);
                  return null;
              }
              return <TokenScreen onTokenSubmit={handleTokenSubmit} user={currentUser} onLogout={handleLogout} config={safeConfig} />;
            
            case AppState.CONFIRMATION:
              if (!selectedTest || !currentUser) {
                  setTimeout(() => setAppState(AppState.TOKEN_ENTRY), 0);
                  return null;
              }
              return <ConfirmationScreen onStartTest={handleStartTest} user={currentUser} onLogout={handleLogout} testDetails={selectedTest.details} config={safeConfig} />;
            
            case AppState.TESTING:
              if (!selectedTest || !currentUser) {
                  setTimeout(() => setAppState(AppState.LOGIN), 0);
                  return null;
              }
              const { questions, details } = selectedTest;
              let questionsForTest = [...questions];
              if (details.randomizeQuestions) {
                  questionsForTest.sort(() => 0.5 - Math.random());
              }
              if (details.questionsToDisplay && details.questionsToDisplay > 0 && details.questionsToDisplay < questions.length) {
                questionsForTest = questionsForTest.slice(0, details.questionsToDisplay);
              }
              return (
                  <TestScreen 
                      onFinishTest={handleFinishTest} user={currentUser} onLogout={handleLogout} 
                      questions={questionsForTest} durationMinutes={details.durationMinutes} 
                      config={safeConfig} testId={details.id} userId={currentUser.nisn}
                      randomizeAnswers={details.randomizeAnswers} 
                  />
              );
            
            case AppState.FINISHED:
              if (!currentUser) {
                  setTimeout(() => setAppState(AppState.LOGIN), 0);
                  return null;
              }
              return <FinishScreen onLogout={handleLogout} user={currentUser} config={safeConfig} />;
            
            case AppState.ADMIN_DASHBOARD:
              if (!currentUser) {
                  setTimeout(() => setAppState(AppState.LOGIN), 0);
                  return null;
              }
              return <AdminDashboard 
                user={currentUser} onLogout={handleLogout} config={safeConfig} onUpdateConfig={handleUpdateConfig}
                setIsBatchProcessing={setIsBatchProcessing}
              />;
            
            case AppState.TEACHER_DASHBOARD:
              if (!currentUser) {
                  setTimeout(() => setAppState(AppState.LOGIN), 0);
                  return null;
              }
              return <TeacherDashboard
                user={currentUser} onLogout={handleLogout} config={safeConfig}
                setIsBatchProcessing={setIsBatchProcessing}
              />;
            
            default:
              return <LoginScreen config={safeConfig} onStudentLogin={handleStudentLogin} onAdminLogin={handleAdminLogin} />;
          }
        })()}
      </main>
      <footer className="text-center p-4 text-sm text-gray-500 bg-gray-50 no-print flex flex-col sm:flex-row items-center justify-center gap-2">
        <span>Copyright &copy; {new Date().getFullYear()} {safeConfig.schoolName}. All rights reserved.</span>
        <span className="hidden sm:inline text-gray-300">|</span>
        <button 
          onClick={() => setIsCopyrightOpen(true)}
          className="flex items-center gap-1.5 text-blue-500 hover:text-blue-600 font-medium transition-colors group"
        >
          <div className="w-5 h-5 rounded-full bg-slate-400 text-white flex items-center justify-center text-[10px] font-bold group-hover:bg-slate-500 transition-colors">
            C
          </div>
          <span className="underline underline-offset-2">Hak Cipta</span>
        </button>
      </footer>
      <DeviceMismatchModal isOpen={isDeviceLocked} onClose={() => setIsDeviceLocked(false)} />
      <CopyrightModal isOpen={isCopyrightOpen} onClose={() => setIsCopyrightOpen(false)} config={safeConfig} />
    </div>
  );
};

export default App;
