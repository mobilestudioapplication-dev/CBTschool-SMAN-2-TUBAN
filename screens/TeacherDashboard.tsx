
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { v4 as uuidv4 } from 'uuid';
import { AppConfig, User, Test, TeacherView, Question, MasterData, Schedule, TestDetails, QuestionType, AdminView, CognitiveLevel, QuestionDifficulty } from '../types';
import QuestionBank from '../components/QuestionBank';
import ExamSchedule from '../components/TestManagement';
import GradeRecap from '../components/GradeRecap';
import QuestionAnalysis from '../components/QuestionAnalysis';
import ToastNotification from '../components/ToastNotification';
import BulkImportProgress from '../components/BulkImportProgress';

interface TeacherDashboardProps {
  user: User;
  onLogout: () => void;
  config: AppConfig;
  setIsBatchProcessing: (isProcessing: boolean) => void;
}

interface NavItem {
  id: TeacherView;
  label: string;
  icon: React.ReactNode;
}

// Helper to map DB string types to frontend QuestionType
const mapDBTypeToFrontend = (dbType: string): QuestionType => {
    switch(dbType) {
        case 'SINGLE': return 'multiple_choice';
        case 'MULTIPLE': return 'complex_multiple_choice';
        case 'MATCHING': return 'matching';
        case 'ESSAY': return 'essay';
        default: return dbType as QuestionType; // Fallback if it matches existing types
    }
}

const TeacherDashboard: React.FC<TeacherDashboardProps> = (props) => {
  const { user, onLogout, config, setIsBatchProcessing } = props;
  
  const [isDataLoading, setIsDataLoading] = useState(true);
  const [users, setUsers] = useState<User[]>([]); // Masih perlu load users untuk laporan nilai
  const [tests, setTests] = useState<Map<string, Test>>(new Map());
  const [masterData, setMasterData] = useState<MasterData>({ classes: [], majors: [] });
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [examSessions, setExamSessions] = useState<any[]>([]);
  
  const [activeView, setActiveView] = useState<TeacherView>(TeacherView.HOME);
  const [isProfileOpen, setProfileOpen] = useState(false);
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [preselectedTestToken, setPreselectedTestToken] = useState<string | undefined>(undefined);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error'; key: number } | null>(null);
  const [isFetchingQuestions, setIsFetchingQuestions] = useState(false);
  
  // State dummy untuk kompabilitas komponen Admin (QuestionBank butuh prop ini meski Guru tidak pakai)
  const [isImporting, setIsImporting] = useState(false); 
  const [importProgress, setImportProgress] = useState({ processed: 0, total: 0, errors: [] as { user: string; message: string }[] });

  const showToast = (message: string, type: 'success' | 'error') => {
    setNotification({ message, type, key: Date.now() });
  };

  // OPTIMISASI: Fungsi fetch parsial
  const fetchTestsData = useCallback(async () => {
    try {
      const { data: testsData, error: testsError } = await supabase
        .from('tests')
        .select('*, questions(count)');

      if (testsError) throw new Error('Gagal mengambil data ujian.');

      setTests((prevTests: Map<string, Test>) => {
        const newTestsMap = new Map<string, Test>(prevTests);
        (testsData || []).forEach((t: any) => {
          const existingTest = prevTests.get(t.token);
          const questionCount = t.questions?.[0]?.count || 0;

          newTestsMap.set(t.token, {
            details: { 
              ...t, 
              duration: `${t.duration_minutes} Menit`, 
              durationMinutes: t.duration_minutes, 
              questionsToDisplay: t.questions_to_display, 
              randomizeQuestions: t.randomize_questions,
              randomizeAnswers: t.randomize_answers,
              examType: t.exam_type || 'Umum',
              time: '',
              questionCount: questionCount
            },
            questions: existingTest?.questions || [],
          });
        });
        return newTestsMap;
      });
    } catch (error: any) {
      showToast(error.message, 'error');
    }
  }, []);

  const fetchQuestionsForTest = useCallback(async (token: string, testId?: string) => {
    let targetTestId = testId;
    
    if (!targetTestId) {
      const test = tests.get(token);
      if (!test) return;
      targetTestId = test.details.id;
    }
    
    setIsFetchingQuestions(true);
    try {
      const { data: questionsData, error } = await supabase
        .from('questions')
        .select('*')
        .eq('test_id', targetTestId)
        .order('id', { ascending: true });

      if (error) throw error;

      const formattedQuestions: Question[] = (questionsData || []).map((q: any) => ({
        id: q.id,
        question: q.question, 
        image: q.image_url, 
        audio: q.audio_url,
        video: q.video_url,
        options: q.options, 
        matchingRightOptions: q.matching_right_options,
        optionImages: q.option_images, 
        correctAnswerIndex: q.correct_answer_index, 
        answerKey: q.answer_key,
        metadata: q.metadata,
        type: mapDBTypeToFrontend(q.type),
        cognitiveLevel: q.cognitive_level as CognitiveLevel,
        weight: q.weight,
        difficulty: q.difficulty as QuestionDifficulty, 
        topic: q.topic 
      }));

      setTests((prev: Map<string, Test>) => {
        const next = new Map<string, Test>(prev);
        const t = next.get(token);
        if (t) {
          next.set(token, { details: t.details, questions: formattedQuestions });
        }
        return next;
      });
    } catch (error: any) {
      showToast(`Gagal memuat soal: ${error.message}`, 'error');
    } finally {
      setIsFetchingQuestions(false);
    }
  }, [tests]);

  const fetchData = useCallback(async (isBackgroundRefresh = false) => {
    if (!isBackgroundRefresh) setIsDataLoading(true);
    try {
      // Guru tetap butuh data users (siswa), tests, questions, masterData, schedules, sessions
      // RLS di database akan memfilter jika perlu, tapi untuk sekarang Guru bisa baca semua data terkait akademik
      const [
        { data: usersData, error: usersError },
        { data: testsData, error: testsError },
        { data: classesData, error: classesError },
        { data: majorsData, error: majorsError },
        { data: schedulesData, error: schedulesError },
        { data: sessionsData, error: sessionsError },
      ] = await Promise.all([
        supabase.from('users').select('*'),
        supabase.from('tests').select('*, questions:questions(count)'),
        supabase.from('master_classes').select('*'),
        supabase.from('master_majors').select('*'),
        supabase.from('schedules').select('*'),
        supabase.from('student_exam_sessions').select('*, schedules(test_id)'),
      ]);

      if (usersError || testsError || classesError || majorsError || schedulesError || sessionsError) {
        throw new Error('Gagal mengambil data. Pastikan Anda memiliki akses.');
      }
      
      const mappedUsers = (usersData || []).map((u: any): User => ({
        id: u.id,
        username: u.username,
        fullName: u.full_name,
        nisn: u.nisn,
        class: u.class,
        major: u.major,
        gender: u.gender,
        religion: u.religion,
        photoUrl: u.photo_url,
        role: u.role // Penting
      }));

      setUsers(mappedUsers);
      setMasterData({ classes: classesData as any[], majors: majorsData as any[] });
      setExamSessions(sessionsData);

      const testIdToTokenMap = new Map<string, string>();
      (testsData || []).forEach(t => testIdToTokenMap.set(t.id, t.token));

      const mappedSchedules: Schedule[] = (schedulesData || []).map((s: any): Schedule => ({
        id: s.id,
        testToken: testIdToTokenMap.get(s.test_id) || '',
        startTime: s.start_time,
        endTime: s.end_time,
        assignedTo: s.assigned_to || [],
      })).filter(s => s.testToken);
      setSchedules(mappedSchedules);

      const newTestsMap = new Map<string, Test>();
      testsData.forEach(t => {
        const questionCount = t.questions?.[0]?.count || 0;
        newTestsMap.set(t.token, {
          details: { 
            ...t, 
            duration: `${t.duration_minutes} Menit`, 
            durationMinutes: t.duration_minutes, 
            questionsToDisplay: t.questions_to_display, 
            randomizeQuestions: t.randomize_questions,
            randomizeAnswers: t.randomize_answers,
            examType: t.exam_type || 'Umum',           // Map snake_case to camelCase
            time: '',
            questionCount: questionCount
          },
          questions: [],
        });
      });
      setTests(newTestsMap);

    } catch (error: any) {
      showToast(error.message, 'error');
    } finally {
      if (!isBackgroundRefresh) setIsDataLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(false);

    // Realtime subscription for student_exam_sessions
    const channel = supabase
      .channel('teacher_exam_sessions_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'student_exam_sessions' }, (payload) => {
        const changedRecord = payload.new as any;
        if (!changedRecord) return;

        setExamSessions((prevSessions) => {
          const index = prevSessions.findIndex((s) => s.id === changedRecord.id);
          if (index !== -1) {
            const updated = [...prevSessions];
            updated[index] = { ...updated[index], ...changedRecord };
            return updated;
          } else {
            return [...prevSessions, changedRecord];
          }
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchData]);

  // --- CRUD Handlers (Mirip Admin tapi terbatas pada modul yang diizinkan RLS) ---

  const handleAddTest = async (details: Omit<TestDetails, 'id' | 'time' | 'token'>, token: string, questions: Omit<Question, 'id'>[]): Promise<boolean> => {
    const { data: testData, error: testError } = await supabase.from('tests').insert({
        token: token.toUpperCase(), name: details.name, subject: details.subject,
        duration_minutes: details.durationMinutes, questions_to_display: details.questionsToDisplay ?? 0,
        randomize_questions: details.randomizeQuestions,
        randomize_answers: details.randomizeAnswers,
        exam_type: details.examType || 'Umum'           // Save exam type
    }).select().single();
    
    if(testError) { 
      if (testError.code === '23505' || testError.message.includes('duplicate key')) {
        showToast('Gagal: Token Ujian sudah digunakan. Silakan gunakan token lain.', 'error');
      } else {
        showToast(`Gagal membuat ujian: ${testError.message}`, 'error'); 
      }
      return false; 
    }
    
    if(questions.length > 0) {
      const questionsToInsert = questions.map(q => ({
        test_id: testData.id, 
        type: q.type, // PENTING
        question: q.question, 
        image_url: q.image, audio_url: q.audio, video_url: q.video,
        options: q.options, matching_right_options: q.matchingRightOptions,
        option_images: q.optionImages,
        correct_answer_index: q.correctAnswerIndex || 0, 
        answer_key: q.answerKey, // PENTING
        metadata: q.metadata,    // PENTING
        weight: q.weight,        // PENTING
        cognitive_level: q.cognitiveLevel, 
        difficulty: q.difficulty, topic: q.topic
      }));
      const { error: qError } = await supabase.from('questions').insert(questionsToInsert);
      if(qError) { showToast(`Ujian dibuat, tapi gagal impor soal: ${qError.message}`, 'error'); }
    }
    await fetchTestsData(); return true;
  };

  const handleUpdateTest = async (updatedTest: Test, originalToken: string) => {
    const { error } = await supabase.from('tests').update({
        token: updatedTest.details.token || originalToken, name: updatedTest.details.name, subject: updatedTest.details.subject,
        duration_minutes: updatedTest.details.durationMinutes, questions_to_display: updatedTest.details.questionsToDisplay ?? 0,
        randomize_questions: updatedTest.details.randomizeQuestions, randomize_answers: updatedTest.details.randomizeAnswers,
        exam_type: updatedTest.details.examType || 'Umum' // Update exam type
    }).eq('id', updatedTest.details.id);
    if(error) { showToast(`Gagal update ujian: ${error.message}`, 'error'); } else { await fetchTestsData(); }
  };

  const handleDeleteTest = async (token: string) => { 
    const testId = tests.get(token)?.details.id;
    if(!testId) return;
    const { error } = await supabase.from('tests').delete().eq('id', testId); 
    if(error) { showToast(`Gagal hapus ujian: ${error.message}`, 'error'); } else { await fetchTestsData(); }
  };

  const handleAddQuestion = async (token: string, q: Omit<Question, 'id'>): Promise<boolean> => {
    const testId = tests.get(token)?.details.id;
    if(!testId) return false;
    const { error } = await supabase.from('questions').insert({
      test_id: testId, 
      type: q.type, // PENTING
      question: q.question, 
      image_url: q.image, audio_url: q.audio, video_url: q.video,
      options: q.options, matching_right_options: q.matchingRightOptions, option_images: q.optionImages,
      correct_answer_index: q.correctAnswerIndex || 0, 
      answer_key: q.answerKey, // PENTING
      metadata: q.metadata,    // PENTING
      weight: q.weight,        // PENTING
      cognitive_level: q.cognitiveLevel, difficulty: q.difficulty, topic: q.topic
    });
    if(error) { showToast(`Gagal tambah soal: ${error.message}`, 'error'); return false; }
    await fetchTestsData(); 
    await fetchQuestionsForTest(token, testId);
    return true;
  };

  const handleUpdateQuestion = async (token: string, q: Question) => {
    const { error } = await supabase.from('questions').update({
      type: q.type, // PENTING
      question: q.question, image_url: q.image, audio_url: q.audio, video_url: q.video,
      options: q.options, matching_right_options: q.matchingRightOptions, option_images: q.optionImages,
      correct_answer_index: q.correctAnswerIndex || 0, 
      answer_key: q.answerKey, // PENTING
      metadata: q.metadata,    // PENTING
      weight: q.weight,        // PENTING
      cognitive_level: q.cognitiveLevel, difficulty: q.difficulty, topic: q.topic
    }).eq('id', q.id);
    if(error) showToast(`Gagal update soal: ${error.message}`, 'error'); 
    else {
        await fetchTestsData();
        await fetchQuestionsForTest(token, q.test_id);
    }
  };

  const handleDeleteQuestion = async (token: string, qId: number) => {
    const { error } = await supabase.from('questions').delete().eq('id', qId);
    if(error) {
        showToast(`Gagal menghapus soal: ${error.message}`, 'error');
    } else {
        showToast('Soal berhasil dihapus.', 'success');
        await fetchTestsData();
        const testId = tests.get(token)?.details.id;
        await fetchQuestionsForTest(token, testId);
    }
  };

  const handleBulkAddQuestions = async (token: string, questions: Omit<Question, 'id'>[]) => {
      const testId = tests.get(token)?.details.id;
      if(!testId) return;
      const questionsToInsert = questions.map(q => ({
        test_id: testId, 
        type: q.type, // PENTING
        question: q.question, image_url: q.image, audio_url: q.audio, video_url: q.video,
        options: q.options, matching_right_options: q.matchingRightOptions, option_images: q.optionImages,
        correct_answer_index: q.correctAnswerIndex || 0, 
        answer_key: q.answerKey, // PENTING
        metadata: q.metadata,    // PENTING
        weight: q.weight,        // PENTING
        cognitive_level: q.cognitiveLevel, difficulty: q.difficulty, topic: q.topic
      }));
      const { error } = await supabase.from('questions').insert(questionsToInsert);
      if(error) showToast(`Gagal impor massal: ${error.message}`, 'error');
      else { 
          showToast(`${questions.length} soal berhasil diimpor!`, 'success'); 
          await fetchTestsData(); 
          await fetchQuestionsForTest(token);
      }
  };

  const handleAddSchedule = async (s: Omit<Schedule, 'id'>) => { 
      setIsBatchProcessing(true); 
      const testId = tests.get(s.testToken)?.details.id; 
      if(!testId) { showToast('Ujian invalid', 'error'); setIsBatchProcessing(false); return; } 
      const { error } = await supabase.from('schedules').insert({ test_id: testId, start_time: s.startTime, end_time: s.endTime, assigned_to: s.assignedTo }); 
      setIsBatchProcessing(false); 
      if(error) showToast(`Gagal: ${error.message}`, 'error'); else { showToast('Sukses', 'success'); await fetchData(true); } 
  };
  const handleUpdateSchedule = async (s: Schedule) => { 
      setIsBatchProcessing(true); 
      const testId = tests.get(s.testToken)?.details.id; 
      if(!testId) { showToast('Ujian invalid', 'error'); setIsBatchProcessing(false); return; } 
      const { error } = await supabase.from('schedules').update({ test_id: testId, start_time: s.startTime, end_time: s.endTime, assigned_to: s.assignedTo }).eq('id', s.id); 
      setIsBatchProcessing(false); 
      if(error) showToast(`Gagal update: ${error.message}`, 'error'); else { showToast('Sukses', 'success'); await fetchData(true); } 
  };
  const handleDeleteSchedule = async (id: string) => { 
      setIsBatchProcessing(true); 
      const { error } = await supabase.from('schedules').delete().eq('id', id); 
      setIsBatchProcessing(false); 
      if(error) showToast(`Gagal hapus: ${error.message}`, 'error'); else { showToast('Dihapus', 'success'); await fetchData(true); } 
  };

  const studentUsers = useMemo(() => users.filter(u => u.role !== 'admin' && u.role !== 'teacher' && u.username !== 'admin@cbtschool.com'), [users]);
  const questionCount = useMemo(() => Array.from(tests.values()).reduce((acc: number, test: Test) => acc + test.questions.length, 0), [tests]);

  const navItems: NavItem[] = useMemo(() => [
    { id: TeacherView.HOME, label: 'Beranda Guru', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" /></svg> },
    { id: TeacherView.QUESTION_BANK, label: 'Bank Soal', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5 3a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2V5a2 2 0 00-2-2H5zm0 2h10v7h-2V7a1 1 0 00-1-1H6V5z" clipRule="evenodd" /></svg> },
    { id: TeacherView.JADWAL_UJIAN, label: 'Jadwal Ujian', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" /></svg> },
    { id: TeacherView.REKAPITULASI_NILAI, label: 'Laporan Nilai', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg> },
    { id: TeacherView.ANALISA_SOAL, label: 'Analisa Soal', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M2 10a8 8 0 018-8v8h8a8 8 0 11-16 0z" /><path d="M12 2.252A8.014 8.014 0 0117.748 8H12V2.252z" /></svg> },
  ], []);

  const handleNavigate = (view: TeacherView, token?: string) => { setPreselectedTestToken(token); setActiveView(view); if(window.innerWidth < 1024) setSidebarOpen(false); };

  const renderContent = () => {
    switch (activeView) {
      case TeacherView.HOME: 
        return (
            <div className="space-y-6">
                <div className="bg-gradient-to-r from-teal-500 to-emerald-600 rounded-2xl shadow-lg p-8 text-white flex items-center justify-between">
                    <div>
                        <h2 className="text-3xl font-bold mb-2">Halo, {user.fullName}!</h2>
                        <p className="opacity-90">Selamat datang di Ruang Guru. Anda dapat membuat soal dan melihat nilai siswa di sini.</p>
                    </div>
                    <div className="hidden md:block opacity-80">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-24 w-24" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 6.253v11.494m-9-5.747h18" /></svg>
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-teal-500">
                        <p className="text-gray-500 text-sm">Total Paket Soal</p>
                        <p className="text-3xl font-bold text-gray-800">{tests.size}</p>
                    </div>
                    <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-blue-500">
                        <p className="text-gray-500 text-sm">Total Butir Soal</p>
                        <p className="text-3xl font-bold text-gray-800">{questionCount}</p>
                    </div>
                    <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-purple-500">
                        <p className="text-gray-500 text-sm">Jadwal Aktif</p>
                        <p className="text-3xl font-bold text-gray-800">{schedules.length}</p>
                    </div>
                </div>
            </div>
        );
      case TeacherView.QUESTION_BANK: return <QuestionBank tests={tests} onAddQuestion={handleAddQuestion} onUpdateQuestion={handleUpdateQuestion} onDeleteQuestion={handleDeleteQuestion} onAddTest={handleAddTest} onUpdateTest={handleUpdateTest} onDeleteTest={handleDeleteTest} onBulkAddQuestions={handleBulkAddQuestions} onImportError={(msg) => showToast(msg, 'error')} preselectedToken={preselectedTestToken} onRefresh={() => fetchTestsData()} onFetchQuestions={fetchQuestionsForTest} isFetchingQuestions={isFetchingQuestions} />;
      case TeacherView.JADWAL_UJIAN: return <ExamSchedule schedules={schedules} tests={tests} masterData={masterData} onAddSchedule={handleAddSchedule} onUpdateSchedule={handleUpdateSchedule} onDeleteSchedule={handleDeleteSchedule} />;
      case TeacherView.REKAPITULASI_NILAI: return <GradeRecap tests={tests} users={studentUsers} examSessions={examSessions} schedules={schedules} preselectedToken={preselectedTestToken} config={config} onRefresh={() => fetchData(true)} />;
      case TeacherView.ANALISA_SOAL: return <QuestionAnalysis tests={tests} users={studentUsers} />;
      default: return <div>Not Implemented</div>;
    }
  };

  if (isDataLoading) {
    return (
        <div className="h-screen w-full flex flex-col items-center justify-center text-gray-600 bg-slate-50">
            <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-b-4 border-teal-600 mb-4"></div>
            <p className="animate-pulse text-lg font-medium text-teal-800">Memuat Ruang Guru...</p>
        </div>
    );
  }

  return (
    <div className="h-screen flex bg-slate-50 overflow-hidden">
      {notification && <ToastNotification key={notification.key} message={notification.message} type={notification.type} onClose={() => setNotification(null)} />}
      
      {/* Sidebar Overlay for Mobile */}
      {isSidebarOpen && <div onClick={() => setSidebarOpen(false)} className="fixed inset-0 bg-black/50 z-30 lg:hidden" aria-hidden="true"></div>}

      <aside className={`fixed inset-y-0 left-0 z-40 w-64 bg-teal-900 text-teal-100 flex-col flex-shrink-0 transform transition-transform duration-300 ease-in-out lg:relative lg:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          <div className="h-20 flex items-center justify-center px-4 border-b border-teal-800 bg-teal-950">
             <div className="flex items-center space-x-3">
                 <img src={config.logoUrl} alt="Logo" className="h-8 w-8 object-contain bg-white rounded-full p-0.5" />
                 <span className="font-bold text-white text-lg tracking-wide">RUANG GURU</span>
             </div>
          </div>
          <nav className="flex-grow p-4 overflow-y-auto">
            <ul className="space-y-1">
              {navItems.map(item => (
                <li key={item.id}>
                  <button onClick={() => handleNavigate(item.id)} className={`w-full flex items-center space-x-3 p-3 rounded-lg text-left transition-all duration-200 group ${ activeView === item.id ? 'bg-teal-700 text-white shadow-lg' : 'hover:bg-teal-800 hover:text-white'}`}>
                    <div className="relative">{item.icon}</div>
                    <span className="font-medium text-sm flex-grow">{item.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>
          <div className="p-4 border-t border-teal-800">
              <button onClick={onLogout} className="w-full flex items-center space-x-3 p-3 rounded-lg text-left hover:bg-red-600/20 text-red-200 hover:text-red-100 transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                  <span>Logout</span>
              </button>
          </div>
      </aside>

      <div className="flex-grow flex flex-col w-full min-w-0 h-full">
          <header className="h-20 bg-white flex items-center justify-between px-4 sm:px-8 border-b border-gray-200 flex-shrink-0 shadow-sm z-10">
            <div className="flex items-center min-w-0">
                <button onClick={() => setSidebarOpen(true)} className="lg:hidden text-gray-500 mr-4 p-2 hover:bg-gray-100 rounded-full"><svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg></button>
                <div className="min-w-0">
                    <h1 className="text-lg font-bold text-gray-800 truncate">{config.schoolName}</h1>
                    <p className="text-xs text-teal-600 font-semibold uppercase tracking-wider">Teacher Panel</p>
                </div>
            </div>
             <div className="flex items-center space-x-3">
                <div className="text-right hidden sm:block">
                    <p className="text-sm font-bold text-gray-700">{user.fullName}</p>
                    <p className="text-xs text-gray-500">NIP/ID: {user.username.split('@')[0]}</p>
                </div>
                <div className="h-10 w-10 rounded-full bg-teal-100 flex items-center justify-center text-teal-700 font-bold border-2 border-teal-200">
                    {user.fullName.charAt(0)}
                </div>
            </div>
          </header>
          
          <main className="flex-grow p-4 sm:p-8 overflow-y-auto bg-gray-50">
            <div className="max-w-7xl mx-auto h-full">
                {renderContent()}
            </div>
          </main>
      </div>
    </div>
  );
};

export default TeacherDashboard;
