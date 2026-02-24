import React, { useState, useEffect, useMemo, useRef } from 'react';
import Header from '../components/Header';
import { Answer, Question, AppConfig, User } from '../types';
import QuestionListModal from '../components/QuestionListModal';
import ConfirmationModal from '../components/ConfirmationModal';
import WarningModal from '../components/WarningModal';
import DisqualificationModal from '../components/DisqualificationModal';
import { supabase } from '../supabaseClient';
import { calculateScore } from '../utils/scoring';

interface TestScreenProps {
  onFinishTest: () => void;
  user: User;
  onLogout: () => void;
  questions: Question[];
  durationMinutes: number;
  config: AppConfig;
  testId: string;
  userId: string;
  randomizeAnswers?: boolean; // New Prop
}

// --- THEME CONFIGURATION ---
const THEMES = {
  light: {
    id: 'light',
    bgApp: 'bg-[#f3f4f6]',
    bgCard: 'bg-white',
    textMain: 'text-slate-800',
    textSub: 'text-slate-500',
    border: 'border-slate-200',
    optionBg: 'bg-white',
    optionBorder: 'border-slate-200',
    optionActiveBg: 'bg-blue-50',
    optionActiveBorder: 'border-blue-600',
    shadow: 'shadow-2xl shadow-slate-200/50',
    matchingItemBg: 'bg-white',
    label: 'Terang',
    iconColor: 'bg-white text-gray-800'
  },
  sepia: {
    id: 'sepia',
    bgApp: 'bg-[#f4ecd8]',
    bgCard: 'bg-[#fdf6e3]', // Solarized light / Warm paper
    textMain: 'text-[#433422]',
    textSub: 'text-[#887057]',
    border: 'border-[#ded0bf]',
    optionBg: 'bg-[#fdf6e3]',
    optionBorder: 'border-[#d0c0a0]',
    optionActiveBg: 'bg-[#ebdcb2]',
    optionActiveBorder: 'border-[#8f7a66]',
    shadow: 'shadow-xl shadow-[#dccbb1]/50',
    matchingItemBg: 'bg-[#fbf0da]',
    label: 'Krem (Mata Rileks)',
    iconColor: 'bg-[#fdf6e3] text-[#433422]'
  },
  dark: {
    id: 'dark',
    bgApp: 'bg-[#111827]',
    bgCard: 'bg-[#1f2937]',
    textMain: 'text-gray-100',
    textSub: 'text-gray-400',
    border: 'border-gray-700',
    optionBg: 'bg-[#1f2937]',
    optionBorder: 'border-gray-600',
    optionActiveBg: 'bg-gray-700',
    optionActiveBorder: 'border-blue-500',
    shadow: 'shadow-2xl shadow-black/50',
    matchingItemBg: 'bg-[#374151]',
    label: 'Gelap',
    iconColor: 'bg-gray-800 text-white'
  }
};

type ThemeType = 'light' | 'sepia' | 'dark';

// Helper untuk mengecek status fullscreen di berbagai browser
const checkIsFullScreen = () => {
  const doc = document as any;
  return !!(doc.fullscreenElement || 
            doc.webkitFullscreenElement || 
            doc.mozFullScreenElement || 
            doc.msFullscreenElement);
};

// Helper untuk meminta fullscreen (cross-browser)
const requestFullScreen = async () => {
  const docEl = document.documentElement as any;
  const requestMethod = docEl.requestFullscreen || 
                        docEl.webkitRequestFullscreen || 
                        docEl.mozRequestFullScreen || 
                        docEl.msRequestFullscreen;
  if (requestMethod) {
    try {
      await requestMethod.call(docEl);
    } catch (e) {
      console.warn("Manual fullscreen request failed", e);
    }
  }
};

const TestScreen: React.FC<TestScreenProps> = ({ onFinishTest, user, onLogout, questions, durationMinutes, config, testId, userId, randomizeAnswers }) => {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, Answer>>({});
  const [timeLeft, setTimeLeft] = useState(durationMinutes * 60);
  const [isQuestionListOpen, setQuestionListOpen] = useState(false);
  const [isFinishConfirmOpen, setFinishConfirmOpen] = useState(false);
  const [sessionId, setSessionId] = useState<any>(null);
  const [isSessionLoading, setIsSessionLoading] = useState(true);
  
  // Theme State
  const [currentThemeMode, setCurrentThemeMode] = useState<ThemeType>('light');
  
  // Anti-Cheat & Fullscreen State
  const [violationCount, setViolationCount] = useState(0);
  const [isWarningOpen, setIsWarningOpen] = useState(false);
  const [isDisqualified, setIsDisqualified] = useState(false);
  // Default true agar tidak flicker saat load pertama, nanti useEffect akan memvalidasi
  const [isFullscreenMode, setIsFullscreenMode] = useState(true); 

  // Auto-Save State
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const saveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Matching Interaction State
  const [activeLeftPoint, setActiveLeftPoint] = useState<string | null>(null);
  const matchingContainerRef = useRef<HTMLDivElement>(null);
  const [dotPositions, setDotPositions] = useState<Record<string, { x: number, y: number }>>({});

  // --- OPTION RANDOMIZATION MAPPING ---
  // Kita perlu menyimpan mapping urutan opsi yang diacak agar konsisten selama sesi ujian
  // Structure: { questionId: [originalIndex0, originalIndex1, ...] }
  // Contoh: { 101: [2, 0, 1, 3] } -> Opsi ke-0 di UI adalah opsi ke-2 di data asli
  const [shuffledOptionsMap, setShuffledOptionsMap] = useState<Record<number, number[]>>({});

  useEffect(() => {
      // Inisialisasi mapping acak jika fitur diaktifkan
      if (randomizeAnswers) {
          const mapping: Record<number, number[]> = {};
          questions.forEach(q => {
              if (q.type === 'multiple_choice' || q.type === 'complex_multiple_choice') {
                  // Buat array index [0, 1, 2, 3, ...]
                  const indices = q.options.map((_, i) => i);
                  // Fisher-Yates Shuffle
                  for (let i = indices.length - 1; i > 0; i--) {
                      const j = Math.floor(Math.random() * (i + 1));
                      [indices[i], indices[j]] = [indices[j], indices[i]];
                  }
                  mapping[q.id] = indices;
              }
          });
          setShuffledOptionsMap(mapping);
      }
  }, [questions, randomizeAnswers]);


  const storageKey = `cbt_exam_state_${userId}_${testId}`;
  const themeStorageKey = `cbt_theme_pref`;

  // --- Load Theme Preference ---
  useEffect(() => {
      const savedTheme = localStorage.getItem(themeStorageKey) as ThemeType;
      if (savedTheme && THEMES[savedTheme]) {
          setCurrentThemeMode(savedTheme);
      }
  }, []);

  const handleThemeChange = (mode: ThemeType) => {
      setCurrentThemeMode(mode);
      localStorage.setItem(themeStorageKey, mode);
  };

  const currentTheme = THEMES[currentThemeMode];

  const answeredCount = useMemo(() => {
    const list = (Object.values(answers) as Answer[]);
    return list.filter(a => {
        if (a.value === null || a.value === undefined) return false;
        if (Array.isArray(a.value)) return a.value.length > 0;
        if (typeof a.value === 'object') return Object.keys(a.value).length > 0;
        if (typeof a.value === 'string') return a.value.trim().length > 0;
        return true;
    }).length;
  }, [answers]);

  const progressPercent = Math.round((answeredCount / questions.length) * 100);

  // --- Session Init ---
  useEffect(() => {
    const initSession = async () => {
        setIsSessionLoading(true);
        try {
            const { data: userData } = await supabase.from('users').select('id').eq('nisn', userId).single();
            const { data: scheduleData } = await supabase.from('schedules').select('id').eq('test_id', testId).limit(1).single();

            // Panggil RPC untuk create atau get sesi yang ada (Atomic operation)
            const { data: rpcId } = await supabase.rpc('create_exam_session', {
                p_user_uuid: userData?.id,
                p_schedule_uuid: scheduleData?.id,
                p_duration_seconds: durationMinutes * 60
            });

            if (rpcId) {
                const { data: session } = await supabase.from('student_exam_sessions').select('*').eq('id', rpcId).single();
                setSessionId(session.id);
                setTimeLeft(session.time_left_seconds);
                
                // Load Violation Count dari DB (Penting untuk persistence)
                setViolationCount(session.violations || 0);
                
                // Cek jika status sudah Diskualifikasi
                if (session.status === 'Diskualifikasi') {
                    setIsDisqualified(true);
                }

                // Restore jawaban - PRIORITAS DARI DATABASE SUPABASE
                const { data: dbAnswers } = await supabase.from('student_answers').select('*').eq('session_id', session.id);
                const restoredAnswers: Record<number, Answer> = {};
                
                if (dbAnswers && dbAnswers.length > 0) {
                    dbAnswers.forEach(a => {
                        // Support backward compatibility for 'answer_value' JSONB column vs legacy structure
                        const val = a.answer_value || a.student_answer?.value;
                        restoredAnswers[a.question_id] = { value: val, unsure: a.is_unsure };
                    });
                    setAnswers(restoredAnswers);
                    // Update local storage to match DB (Single Source of Truth is DB)
                    localStorage.setItem(storageKey, JSON.stringify(restoredAnswers));
                } else {
                    // Fallback to local only if DB is empty (rare case, maybe first load offline)
                    const local = localStorage.getItem(storageKey);
                    if (local) setAnswers(JSON.parse(local));
                }
            }
        } catch (e) {
            console.error("Init error", e);
        } finally {
            setIsSessionLoading(false);
        }
    };
    initSession();
  }, [testId, userId]);

  // --- SCORING LOGIC ---
  const handleFinishExam = async () => {
      if (!sessionId) return;
      setIsSessionLoading(true);
      setFinishConfirmOpen(false); // Close modal immediately

      try {
          // 1. Flush any pending saves (e.g. essay debounce)
          if (saveDebounceRef.current) {
              clearTimeout(saveDebounceRef.current);
              saveDebounceRef.current = null;
              // Force save current question immediately
              const currentQ = questions[currentQuestionIndex];
              const currentAns = answers[currentQ.id];
              if (currentAns) {
                  await saveToSupabase(currentQ.id, currentAns.value, currentAns.unsure);
              }
          }

          // 2. Calculate Final Score
          const finalScore = calculateScore(questions, answers);
          console.log("Exam Finished. Session ID:", sessionId, "Final Score:", finalScore);

          // 3. Submit Exam via RPC (Secure & Atomic)
          const { error: rpcError } = await supabase.rpc('submit_exam', {
              p_session_id: sessionId,
              p_score: finalScore
          });

          if (rpcError) {
              console.warn("RPC submit_exam failed, trying direct update fallback...", rpcError);
              
              // Fallback: Direct Update (If RLS permits)
              const { error: updateError } = await supabase
                  .from('student_exam_sessions')
                  .update({ 
                      score: finalScore, 
                      status: 'Selesai',
                      end_time: new Date().toISOString() 
                  })
                  .eq('id', sessionId);

              if (updateError) {
                  throw new Error(`Submission failed: ${rpcError.message} | Fallback failed: ${updateError.message}`);
              }
          }

          // Clear local storage
          localStorage.removeItem(storageKey);
          
          onFinishTest();
      } catch (err: any) {
          console.error("Failed to finish exam:", err);
          alert("Gagal mengumpulkan jawaban. Silakan coba lagi atau hubungi pengawas. Error: " + err.message);
          setIsSessionLoading(false);
      }
  };

  // --- Timer ---
  useEffect(() => {
    if (isSessionLoading || !sessionId || isDisqualified) return;
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 0) { 
            clearInterval(timer); 
            handleFinishExam(); // Use handleFinishExam instead of onFinishTest
            return 0; 
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [isSessionLoading, sessionId, isDisqualified]);

  // --- ANTI-CHEAT & FULLSCREEN LOGIC ---
  useEffect(() => {
    // Debugging Anti-Cheat Status
    console.log("Anti-Cheat Active:", config.enableAntiCheat);
    
    if (!config.enableAntiCheat || isDisqualified || !sessionId || isSessionLoading) return;

    // Fungsi pencatat pelanggaran
    const handleViolation = async () => {
        if (isDisqualified) return; // Jangan catat jika sudah didiskualifikasi

        // Update Local State optimistically
        const newCount = violationCount + 1;
        setViolationCount(newCount);

        // Update DB
        try {
            const updates: any = { violations: newCount };
            
            // Check threshold
            if (newCount >= config.antiCheatViolationLimit) {
                updates.status = 'Diskualifikasi';
                setIsDisqualified(true);
            }
            
            await supabase.from('student_exam_sessions').update(updates).eq('id', sessionId);
        } catch (e) {
            console.error("Failed to update violation", e);
        }

        // Show warning modal if not disqualified yet
        if (newCount < config.antiCheatViolationLimit) {
            setIsWarningOpen(true);
        }
    };

    // Listener untuk perubahan fullscreen (NATIVE API)
    const handleFullscreenChange = () => {
        const isFull = checkIsFullScreen();
        setIsFullscreenMode(isFull);
        
        // Jika keluar fullscreen, catat pelanggaran
        if (!isFull && !isWarningOpen && !isDisqualified) {
            handleViolation();
        }
    };

    // 1. Visibility Change (Tab Switching / Minimize)
    const onVisibilityChange = () => {
        if (document.hidden && !isWarningOpen && !isDisqualified) {
            handleViolation();
        }
    };

    // 2. Blur (Clicking outside / Overlay / Alt+Tab)
    const onBlur = () => {
       if (!isWarningOpen && !isDisqualified) {
           handleViolation();
       }
    };

    // PENTING: Initial Check saat komponen mount
    setIsFullscreenMode(checkIsFullScreen());

    // Event Listeners
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);
    
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('blur', onBlur);

    // Disable Right Click & Copy
    const preventContextMenu = (e: Event) => e.preventDefault();
    document.addEventListener('contextmenu', preventContextMenu);
    document.addEventListener('copy', preventContextMenu);
    document.addEventListener('cut', preventContextMenu);
    document.addEventListener('paste', preventContextMenu);

    return () => {
        document.removeEventListener('fullscreenchange', handleFullscreenChange);
        document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
        document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
        document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
        document.removeEventListener('visibilitychange', onVisibilityChange);
        window.removeEventListener('blur', onBlur);
        document.removeEventListener('contextmenu', preventContextMenu);
        document.removeEventListener('copy', preventContextMenu);
        document.removeEventListener('cut', preventContextMenu);
        document.removeEventListener('paste', preventContextMenu);
    };
  }, [config.enableAntiCheat, violationCount, isWarningOpen, isDisqualified, sessionId, config.antiCheatViolationLimit, isSessionLoading]);

  const resumeFromWarning = () => {
      setIsWarningOpen(false);
      requestFullScreen(); // Coba paksa fullscreen lagi
  };

  // --- Answer Update Logic (Robust Auto-Save) ---
  
  const saveToSupabase = async (qId: number, val: any, isUnsure: boolean) => {
      if (!sessionId) {
          console.error("No session ID found, cannot save answer.");
          setSaveStatus('error');
          return;
      }
      
      setSaveStatus('saving');
      
      // Construct payload
      const payload: any = {
          session_id: Number(sessionId),
          question_id: Number(qId),
          student_answer: { value: val }, // JSONB: Preserves type (array, object, etc.)
          is_unsure: isUnsure
      };

      // Handle answer_value (TEXT column) for quick viewing/debugging
      if (val === null || val === undefined) {
          payload.answer_value = null;
      } else if (typeof val === 'object') {
          payload.answer_value = JSON.stringify(val);
      } else {
          payload.answer_value = String(val);
      }

      // Retry Logic with Exponential Backoff
      const maxRetries = 3;
      let attempt = 0;
      let success = false;

      while (attempt < maxRetries && !success) {
          try {
              // PENTING: Gunakan RPC save_answer untuk bypass RLS (jika login manual) dan atomic upsert
              const { error } = await supabase.rpc('save_answer', {
                  p_session_id: payload.session_id,
                  p_question_id: payload.question_id,
                  p_answer_value: payload.answer_value,
                  p_student_answer: payload.student_answer,
                  p_is_unsure: payload.is_unsure
              });

              if (error) {
                  // Fallback ke direct upsert jika RPC gagal (misal belum di-apply)
                  console.warn("[SAVE-RPC-FAIL] RPC failed, trying direct upsert...", error.message);
                  const { error: upsertError } = await supabase.from('student_answers').upsert(payload, { 
                      onConflict: 'session_id,question_id' 
                  });
                  
                  if (upsertError) throw upsertError;
              }
              
              success = true;
              setSaveStatus('saved');
              console.log(`[SAVE-SUCCESS] Question ${qId} saved.`);
          } catch (err: any) {
              attempt++;
              if (attempt >= maxRetries) {
                  console.error("[SAVE-FATAL] All save attempts failed:", err);
                  setSaveStatus('error');
              } else {
                  const delay = 500 * Math.pow(2, attempt - 1);
                  await new Promise(resolve => setTimeout(resolve, delay));
              }
          }
      }
  };

  const handleUpdateAnswer = async (qId: number, val: any, isUnsure?: boolean) => {
    if (isDisqualified) return;
    
    // 1. Optimistic Local Update (Instant UI Feedback)
    let newUnsure = false;
    setAnswers(prev => {
        const current = prev[qId] || { value: null, unsure: false };
        newUnsure = isUnsure !== undefined ? isUnsure : current.unsure;
        const newState = { 
            ...prev, 
            [qId]: { value: val, unsure: newUnsure } 
        };
        localStorage.setItem(storageKey, JSON.stringify(newState));
        return newState;
    });

    // 2. Intelligent Auto-Save (Debounce for Essays, Instant for others)
    const qType = questions.find(q => q.id === qId)?.type;
    
    if (qType === 'essay') {
        if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current);
        setSaveStatus('saving'); // Indicate pending
        saveDebounceRef.current = setTimeout(() => {
            saveToSupabase(qId, val, newUnsure);
        }, 1500); // 1.5s delay for text input
    } else {
        // Immediate save for multiple choice / matching
        saveToSupabase(qId, val, newUnsure);
    }
  };

  // --- Matching Coordinate Logic ---
  const updateDotPositions = () => {
    if (!matchingContainerRef.current) return;
    const containerRect = matchingContainerRef.current.getBoundingClientRect();
    const dots = matchingContainerRef.current.querySelectorAll('[data-dot-id]');
    const positions: Record<string, { x: number, y: number }> = {};

    dots.forEach((dot: any) => {
      const rect = dot.getBoundingClientRect();
      const dotId = dot.getAttribute('data-dot-id');
      positions[dotId] = {
        x: (rect.left + rect.width / 2) - containerRect.left,
        y: (rect.top + rect.height / 2) - containerRect.top
      };
    });
    setDotPositions(positions);
  };

  useEffect(() => {
    if (questions[currentQuestionIndex]?.type === 'matching') {
      const timer = setTimeout(updateDotPositions, 200);
      window.addEventListener('resize', updateDotPositions);
      return () => {
        clearTimeout(timer);
        window.removeEventListener('resize', updateDotPositions);
      };
    }
  }, [currentQuestionIndex, questions, currentThemeMode, isFullscreenMode]); // Update saat mode layar berubah

  const handlePointClick = (id: string, side: 'left' | 'right') => {
    const qId = questions[currentQuestionIndex].id;
    const currentPairs = { ...(answers[qId]?.value || {}) };

    if (side === 'left') {
      if (activeLeftPoint === id) {
        setActiveLeftPoint(null);
      } else {
        delete currentPairs[id];
        setActiveLeftPoint(id);
        handleUpdateAnswer(qId, currentPairs);
      }
    } else {
      if (activeLeftPoint) {
        Object.keys(currentPairs).forEach(key => {
          if (currentPairs[key] === id) delete currentPairs[key];
        });
        const newPairs = { ...currentPairs, [activeLeftPoint]: id };
        handleUpdateAnswer(qId, newPairs);
        setActiveLeftPoint(null);
      }
    }
  };

  const currentQuestion = questions[currentQuestionIndex];
  const currentAnswer = answers[currentQuestion?.id] || { value: null, unsure: false };

  // --- Render Helpers ---
  const renderQuestionInput = () => {
    if (!currentQuestion) return null;

    // Determine option order
    // Jika randomizeAnswers aktif, gunakan mapping acak. Jika tidak, gunakan index asli.
    const displayIndices = (randomizeAnswers && shuffledOptionsMap[currentQuestion.id]) 
        ? shuffledOptionsMap[currentQuestion.id] 
        : currentQuestion.options.map((_, i) => i);

    switch (currentQuestion.type) {
        case 'complex_multiple_choice':
            const selections = Array.isArray(currentAnswer.value) ? currentAnswer.value : [] as number[];
            return (
                <div className="space-y-3 sm:space-y-4">
                    {displayIndices.map((originalIndex) => {
                        const opt = currentQuestion.options[originalIndex];
                        const isSelected = selections.includes(originalIndex);
                        
                        return (
                            <label key={originalIndex} className={`flex items-start p-4 sm:p-6 border-2 rounded-2xl sm:rounded-3xl cursor-pointer transition-all duration-300 ${isSelected ? currentTheme.optionActiveBg + ' ' + currentTheme.optionActiveBorder + ' shadow-lg' : currentTheme.optionBg + ' ' + currentTheme.optionBorder} touch-manipulation`}>
                                <div className="pt-0.5">
                                    <input type="checkbox" checked={isSelected} onChange={() => {
                                        const next = isSelected ? selections.filter(v => v !== originalIndex) : [...selections, originalIndex];
                                        handleUpdateAnswer(currentQuestion.id, next);
                                    }} className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600 rounded-lg border-slate-300" />
                                </div>
                                <div className={`ml-4 sm:ml-5 ${currentTheme.textMain} font-medium sm:font-bold leading-relaxed text-base sm:text-lg`} dangerouslySetInnerHTML={{ __html: opt }} />
                            </label>
                        );
                    })}
                </div>
            );

        case 'matching':
            const leftItems = currentQuestion.metadata?.matchingLeft || [];
            const rightItems = currentQuestion.metadata?.matchingRight || [];
            const pairs = (currentAnswer.value && typeof currentAnswer.value === 'object') ? (currentAnswer.value as Record<string, string>) : {} as Record<string, string>;
            const colors = ['#ef4444', '#f97316', '#0d9488', '#3b82f6', '#8b5cf6', '#ec4899'];

            return (
                <div className="relative w-full max-w-5xl mx-auto py-6 sm:py-10" ref={matchingContainerRef}>
                    <svg className="absolute inset-0 w-full h-full pointer-events-none z-0">
                        {Object.entries(pairs).map(([lId, rId], idx) => {
                            const start = dotPositions[lId];
                            const end = dotPositions[rId];
                            if (!start || !end) return null;
                            const midX = (start.x + end.x) / 2;
                            const path = `M ${start.x} ${start.y} C ${midX} ${start.y}, ${midX} ${end.y}, ${end.x} ${end.y}`;
                            return (
                                <path 
                                    key={`${lId}-${rId}`} 
                                    d={path} 
                                    stroke={colors[idx % colors.length]} 
                                    strokeWidth="3" 
                                    fill="none" 
                                    strokeLinecap="round"
                                    className="animate-fade-in opacity-80"
                                />
                            );
                        })}
                    </svg>
                    <div className="grid grid-cols-2 gap-x-8 sm:gap-x-20 md:gap-x-48 relative z-10">
                        <div className="space-y-4">
                            {leftItems.map((item, idx) => {
                                const isConnected = !!pairs[item.id];
                                const isActive = activeLeftPoint === item.id;
                                const pairIdx = Object.keys(pairs).indexOf(item.id);
                                const dotColor = isConnected ? colors[pairIdx % colors.length] : (isActive ? '#6366f1' : '#cbd5e1');
                                return (
                                    <div key={item.id} className={`flex items-center justify-between p-3 sm:p-5 border-2 rounded-xl sm:rounded-2xl shadow-sm transition-all duration-300 ${currentTheme.matchingItemBg} ${isActive ? 'border-blue-400 ring-2 sm:ring-4 ring-blue-50' : currentTheme.border}`}>
                                        <div className={`${currentTheme.textMain} font-bold text-xs sm:text-base mr-2 sm:mr-4`}>{item.content}</div>
                                        <button 
                                            data-dot-id={item.id}
                                            onClick={() => handlePointClick(item.id, 'left')}
                                            className={`w-4 h-4 rounded-full border-2 transition-all transform active:scale-125 sm:hover:scale-125 flex-shrink-0`}
                                            style={{ backgroundColor: dotColor, borderColor: isConnected || isActive ? 'white' : '#94a3b8' }}
                                        />
                                    </div>
                                );
                            })}
                        </div>
                        <div className="space-y-4">
                            {rightItems.map((item) => {
                                const connectedLeftId = Object.keys(pairs).find(k => pairs[k] === item.id);
                                const isConnected = !!connectedLeftId;
                                const pairIdx = connectedLeftId ? Object.keys(pairs).indexOf(connectedLeftId) : -1;
                                const dotColor = isConnected ? colors[pairIdx % colors.length] : (activeLeftPoint ? '#3b82f6' : '#cbd5e1');
                                return (
                                    <div key={item.id} className={`flex items-center gap-2 sm:gap-4 p-3 sm:p-5 border-2 rounded-xl sm:rounded-2xl shadow-sm transition-all duration-300 ${currentTheme.matchingItemBg} ${isConnected ? 'border-emerald-100' : currentTheme.border}`}>
                                        <button 
                                            data-dot-id={item.id}
                                            onClick={() => handlePointClick(item.id, 'right')}
                                            className={`w-4 h-4 rounded-full border-2 transition-all transform active:scale-125 sm:hover:scale-125 flex-shrink-0 ${!isConnected && activeLeftPoint ? 'animate-pulse' : ''}`}
                                            style={{ backgroundColor: dotColor, borderColor: isConnected ? 'white' : '#94a3b8' }}
                                        />
                                        <div className={`${currentTheme.textMain} font-bold text-xs sm:text-base`}>{item.content}</div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            );

        case 'true_false':
            const tfAnswers = (currentAnswer.value && typeof currentAnswer.value === 'object') 
                ? (currentAnswer.value as Record<number, boolean>) 
                : {};
            
            return (
                <div className="mt-4 border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                    {/* Header Table */}
                    <div className="flex bg-gray-100 border-b border-gray-200 text-xs sm:text-sm font-bold text-gray-700">
                        <div className="flex-1 p-3 sm:p-4">Pernyataan</div>
                        <div className="w-16 sm:w-24 p-3 sm:p-4 text-center border-l border-gray-200">Benar</div>
                        <div className="w-16 sm:w-24 p-3 sm:p-4 text-center border-l border-gray-200">Salah</div>
                    </div>
                    {/* Rows */}
                    <div className="divide-y divide-gray-100">
                        {currentQuestion.options.map((stmt, idx) => {
                            const isTrue = tfAnswers[idx] === true;
                            const isFalse = tfAnswers[idx] === false;
                            
                            return (
                                <div key={idx} className={`flex items-center transition-colors ${currentTheme.bgCard} hover:bg-gray-50`}>
                                    <div className={`flex-1 p-3 sm:p-4 text-xs sm:text-sm font-medium ${currentTheme.textMain}`}>{stmt}</div>
                                    
                                    {/* Benar Radio */}
                                    <div className="w-16 sm:w-24 p-3 sm:p-4 flex justify-center border-l border-gray-100">
                                        <label className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full border-2 cursor-pointer flex items-center justify-center transition-all ${isTrue ? 'border-green-500 bg-green-500' : 'border-gray-300 hover:border-green-400'}`}>
                                            <input 
                                                type="radio" 
                                                name={`tf_row_${idx}`} 
                                                className="sr-only" 
                                                checked={isTrue}
                                                onChange={() => {
                                                    const newState = { ...tfAnswers, [idx]: true };
                                                    handleUpdateAnswer(currentQuestion.id, newState);
                                                }}
                                            />
                                            {isTrue && <svg className="w-3 h-3 sm:w-4 sm:h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                                        </label>
                                    </div>

                                    {/* Salah Radio */}
                                    <div className="w-16 sm:w-24 p-3 sm:p-4 flex justify-center border-l border-gray-100">
                                        <label className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full border-2 cursor-pointer flex items-center justify-center transition-all ${isFalse ? 'border-red-500 bg-red-500' : 'border-gray-300 hover:border-green-400'}`}>
                                            <input 
                                                type="radio" 
                                                name={`tf_row_${idx}`} 
                                                className="sr-only" 
                                                checked={isFalse}
                                                onChange={() => {
                                                    const newState = { ...tfAnswers, [idx]: false };
                                                    handleUpdateAnswer(currentQuestion.id, newState);
                                                }}
                                            />
                                            {isFalse && <svg className="w-3 h-3 sm:w-4 sm:h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>}
                                        </label>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            );

        case 'essay':
            return (
                <div className="space-y-4">
                    <textarea 
                      value={currentAnswer.value || ''} 
                      onChange={(e) => handleUpdateAnswer(currentQuestion.id, e.target.value)} 
                      className={`w-full p-4 sm:p-8 border-2 rounded-2xl sm:rounded-[3rem] h-60 sm:h-80 focus:ring-4 focus:ring-blue-100 focus:border-blue-400 outline-none text-base sm:text-xl leading-relaxed shadow-inner font-medium ${currentTheme.bgApp} ${currentTheme.textMain} ${currentTheme.border}`}
                      placeholder="Ketik jawaban Anda di sini..." 
                    />
                </div>
            );

        default: // Multiple Choice (Single)
            return (
                <div className="space-y-3 sm:space-y-4">
                    {displayIndices.map((originalIndex) => {
                        const opt = currentQuestion.options[originalIndex];
                        const isSelected = currentAnswer.value === originalIndex;

                        return (
                            <label key={originalIndex} className={`flex items-start p-4 sm:p-6 border-2 rounded-2xl sm:rounded-3xl cursor-pointer transition-all duration-300 ${isSelected ? currentTheme.optionActiveBg + ' ' + currentTheme.optionActiveBorder + ' shadow-lg' : currentTheme.optionBg + ' ' + currentTheme.optionBorder} touch-manipulation`}>
                                <div className="pt-0.5">
                                    <input type="radio" checked={isSelected} onChange={() => handleUpdateAnswer(currentQuestion.id, originalIndex)} className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600 border-slate-300" />
                                </div>
                                <div className={`ml-4 sm:ml-5 ${currentTheme.textMain} font-medium sm:font-black leading-relaxed text-base sm:text-lg`} dangerouslySetInnerHTML={{ __html: opt }} />
                            </label>
                        );
                    })}
                </div>
            );
    }
  };

  const formatTime = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${h > 0 ? h + ':' : ''}${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  if (isSessionLoading) {
      return (
          <div className={`h-screen flex flex-col items-center justify-center ${currentTheme.bgApp}`}>
              <div className="w-16 h-16 sm:w-20 sm:h-20 border-[6px] border-blue-600 border-t-transparent rounded-full animate-spin mb-6"></div>
              <p className={`${currentTheme.textMain} font-black tracking-widest animate-pulse text-sm sm:text-lg`}>MENGHUBUNGKAN KE SERVER UJIAN...</p>
          </div>
      );
  }

  return (
    <div 
        className={`h-screen flex flex-col ${currentTheme.bgApp} overflow-hidden select-none transition-colors duration-300 relative`} 
        onContextMenu={(e) => {
            e.preventDefault();
            return false;
        }}
    >
      {/* Custom Style for Progress Animation */}
      <style>{`
        @keyframes progress-stripes {
            0% { background-position: 1rem 0; }
            100% { background-position: 0 0; }
        }
        .animate-stripes {
            background-image: linear-gradient(
                45deg,
                rgba(255, 255, 255, 0.25) 25%,
                transparent 25%,
                transparent 50%,
                rgba(255, 255, 255, 0.25) 50%,
                rgba(255, 255, 255, 0.25) 75%,
                transparent 75%,
                transparent
            );
            background-size: 1rem 1rem;
            animation: progress-stripes 0.5s linear infinite;
        }
        @keyframes shimmer {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(100%); }
        }
        .animate-shimmer {
            animation: shimmer 2s infinite;
        }
      `}</style>

      {/* --- SCREEN BLOCKER FOR ANTI-CHEAT --- */}
      {config.enableAntiCheat && !isFullscreenMode && !isDisqualified && (
          <div className="fixed inset-0 z-[9999] bg-white/95 backdrop-blur-3xl flex flex-col items-center justify-center p-4 sm:p-8 text-center animate-fade-in">
              <div className="w-16 h-16 sm:w-24 sm:h-24 bg-red-100 rounded-full flex items-center justify-center mb-4 sm:mb-6 shadow-xl animate-bounce">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 sm:h-12 sm:w-12 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
              </div>
              <h1 className="text-xl sm:text-3xl font-black text-gray-800 mb-2 uppercase tracking-tight">Mode Ujian Terkunci</h1>
              <p className="text-gray-500 font-medium mb-6 sm:mb-8 max-w-md text-sm sm:text-base">
                  Aplikasi mendeteksi Anda keluar dari mode layar penuh. Untuk melanjutkan ujian, wajib kembali ke mode layar penuh.
              </p>
              <button 
                  onClick={requestFullScreen}
                  className="px-6 py-3 sm:px-10 sm:py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl shadow-xl shadow-blue-200 hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 flex items-center gap-2 sm:gap-3 text-sm sm:text-base"
              >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 sm:h-6 sm:w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                  </svg>
                  KEMBALI KE UJIAN
              </button>
          </div>
      )}

      {/* --- SECURE MODE BANNER --- */}
      {config.enableAntiCheat && (
        <div className="bg-[#ef4444] text-white text-center py-2 px-4 text-[10px] sm:text-xs font-black tracking-widest uppercase shadow-md z-[60] sticky top-0 w-full">
            SECURE EXAM MODE AKTIF
        </div>
      )}

      <Header user={user} onLogout={onLogout} config={config} />
      
      {/* Test Header */}
      <div className={`${currentTheme.bgCard} shadow-sm border-b ${currentTheme.border} px-4 py-3 sm:px-12 sm:py-4 flex justify-between items-center z-20 transition-colors duration-300`}>
          <div className="flex items-center space-x-3 sm:space-x-5">
              <div className="bg-blue-600 text-white w-10 h-10 sm:w-14 sm:h-14 rounded-xl sm:rounded-3xl flex items-center justify-center font-black text-lg sm:text-2xl shadow-lg sm:shadow-xl shadow-blue-200">{currentQuestionIndex + 1}</div>
              <div className="hidden sm:block">
                  <p className={`text-[10px] font-black ${currentTheme.textSub} uppercase tracking-widest leading-none mb-1`}>Nomor Soal</p>
                  <p className={`text-base font-black ${currentTheme.textMain}`}>dari {questions.length} Soal</p>
              </div>
          </div>

          <div className="flex items-center space-x-3 sm:space-x-8">
              
              {/* Theme Toggle Buttons */}
              <div className="hidden md:flex items-center bg-gray-100/50 p-1 rounded-xl gap-1">
                  {(['light', 'sepia', 'dark'] as ThemeType[]).map((themeKey) => (
                      <button
                          key={themeKey}
                          onClick={() => handleThemeChange(themeKey)}
                          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${currentThemeMode === themeKey ? 'ring-2 ring-blue-500 shadow-md scale-110' : 'hover:scale-105 opacity-70 hover:opacity-100'}`}
                          title={`Mode ${THEMES[themeKey].label}`}
                          style={{ backgroundColor: themeKey === 'light' ? '#fff' : themeKey === 'sepia' ? '#fdf6e3' : '#1f2937' }}
                      >
                          <div className={`w-3 h-3 rounded-full ${themeKey === 'light' ? 'bg-gray-300' : themeKey === 'sepia' ? 'bg-[#887057]' : 'bg-gray-500'}`}></div>
                      </button>
                  ))}
              </div>

              {/* Save Indicator (Subtle Dot Only) */}
              <div className="flex items-center" title={saveStatus === 'saved' ? 'Tersimpan' : saveStatus === 'saving' ? 'Menyimpan...' : 'Gagal Simpan'}>
                  <div className={`w-3 h-3 rounded-full shadow-sm transition-all duration-500 ${
                      saveStatus === 'saved' ? 'bg-emerald-500' : 
                      saveStatus === 'saving' ? 'bg-blue-500 animate-pulse scale-110' : 
                      'bg-red-500 animate-bounce'
                  }`}></div>
              </div>

              <div className="hidden md:flex flex-col items-end">
                  <div className="flex items-center space-x-3 mb-1.5">
                      <span className={`text-[10px] font-black ${currentTheme.textSub} uppercase tracking-widest`}>Penyelesaian</span>
                      <span className="text-sm font-black text-blue-600">{progressPercent}%</span>
                  </div>
                  <div className={`w-56 h-4 rounded-full overflow-hidden relative shadow-[inset_0_2px_4px_rgba(0,0,0,0.2)] border-2 ${currentThemeMode === 'dark' ? 'bg-gray-900 border-gray-700' : 'bg-gray-200 border-slate-300'}`}>
                      <div 
                        className="h-full bg-gradient-to-r from-blue-400 via-blue-600 to-blue-500 transition-all duration-1000 ease-out animate-stripes relative shadow-[0_0_20px_rgba(59,130,246,0.6)]" 
                        style={{ width: `${progressPercent}%` }}
                      >
                          {/* Shine Effect */}
                          <div className="absolute top-0 left-0 bottom-0 right-0 bg-gradient-to-r from-transparent via-white/50 to-transparent w-full -translate-x-full animate-shimmer"></div>
                          
                          {/* Glow tip */}
                          <div className="absolute right-0 top-0 bottom-0 w-3 bg-white/70 blur-[3px] shadow-[0_0_10px_white]"></div>
                      </div>
                  </div>
              </div>

              <div className={`flex items-center space-x-4 px-3 py-2 sm:px-6 sm:py-2.5 rounded-xl sm:rounded-2xl border-2 transition-all duration-500 ${timeLeft < 300 ? 'bg-red-50 border-red-200 text-red-600 animate-pulse' : `${currentTheme.bgApp} ${currentTheme.border} ${currentTheme.textMain}`}`}>
                  <span className="font-mono font-black text-lg sm:text-2xl tabular-nums tracking-tighter">{formatTime(timeLeft)}</span>
              </div>
              
              <button onClick={() => setQuestionListOpen(true)} className={`p-2 sm:p-3 hover:opacity-80 rounded-xl sm:rounded-2xl transition-all ${currentTheme.bgApp} ${currentTheme.border} border`}>
                <svg xmlns="http://www.w3.org/2000/svg" className={`h-6 w-6 sm:h-8 sm:w-8 ${currentTheme.textSub}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M4 6h16M4 12h16m-7 6h7" /></svg>
              </button>
          </div>
      </div>

      <main className="flex-grow overflow-y-auto p-3 sm:p-10 pb-36">
        <div className="max-w-6xl mx-auto w-full">
            <div className={`${currentTheme.bgCard} p-5 sm:p-16 rounded-[2rem] sm:rounded-[4rem] ${currentTheme.shadow} ${currentTheme.border} border transition-all duration-300 relative overflow-hidden`}>
                
                {/* Visualizer for Question Type */}
                <div className="mb-6 sm:mb-12 flex items-center justify-between">
                    <div className="flex gap-2 sm:gap-3">
                        <span className="bg-blue-600 text-white text-[9px] sm:text-[10px] font-black px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl sm:rounded-2xl uppercase tracking-widest shadow-lg shadow-blue-100">{currentQuestion.type.replace(/_/g, ' ')}</span>
                        <span className={`${currentTheme.bgApp} ${currentTheme.textSub} text-[9px] sm:text-[10px] font-black px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl sm:rounded-2xl uppercase tracking-widest`}>BOBOT: {currentQuestion.weight}</span>
                    </div>
                </div>

                <div className={`prose max-w-none mb-6 sm:mb-8 text-lg sm:text-3xl leading-relaxed font-medium sm:font-bold tracking-tight ${currentTheme.textMain}`} dangerouslySetInnerHTML={{ __html: currentQuestion.question }} />
                
                {/* Media Support */}
                {(currentQuestion.image || currentQuestion.audio || currentQuestion.video) && (
                    <div className="mb-6 sm:mb-8 space-y-4 sm:space-y-6">
                        {currentQuestion.image && <img src={currentQuestion.image} alt="Soal" className={`max-w-full h-auto rounded-2xl sm:rounded-3xl ${currentTheme.border} border shadow-sm mx-auto`} />}
                        {currentQuestion.audio && (
                            <audio controls className="w-full">
                                <source src={currentQuestion.audio} type="audio/mpeg" />
                                Browser Anda tidak mendukung pemutar audio.
                            </audio>
                        )}
                        {currentQuestion.video && (
                            <video controls className="w-full rounded-2xl sm:rounded-3xl shadow-lg">
                                <source src={currentQuestion.video} type="video/mp4" />
                                Browser Anda tidak mendukung pemutar video.
                            </video>
                        )}
                    </div>
                )}

                <div className={`pt-6 sm:pt-8 border-t ${currentTheme.border}`}>
                    {renderQuestionInput()}
                </div>
            </div>
        </div>
      </main>

      {/* Persistence Footer */}
      <footer className={`fixed bottom-0 left-0 right-0 z-40 backdrop-blur-2xl border-t p-4 sm:p-8 ${currentThemeMode === 'dark' ? 'bg-black/80 border-gray-800' : 'bg-white/90 border-slate-100'}`}>
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-3 sm:gap-6">
          <button onClick={() => setCurrentQuestionIndex(Math.max(0, currentQuestionIndex - 1))} disabled={currentQuestionIndex === 0} className="flex-1 max-w-[220px] bg-[#f472b6] hover:bg-pink-500 text-white font-black py-4 sm:py-5 rounded-2xl sm:rounded-[1.5rem] disabled:opacity-20 transition-all flex items-center justify-center space-x-2 sm:space-x-3 active:scale-95 shadow-lg shadow-pink-100">
            <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3.5} d="M15 19l-7-7 7-7" /></svg>
            <span className="hidden sm:inline tracking-widest uppercase text-xs">Sebelumnya</span>
          </button>

          <button onClick={() => handleUpdateAnswer(currentQuestion.id, currentAnswer.value, !currentAnswer.unsure)} className={`flex-1 max-w-[220px] font-black py-4 sm:py-5 rounded-2xl sm:rounded-[1.5rem] transition-all shadow-xl flex items-center justify-center space-x-2 sm:space-x-3 active:scale-95 ${currentAnswer.unsure ? 'bg-yellow-500 text-white ring-4 sm:ring-8 ring-yellow-50' : 'bg-[#fbbf24] text-white hover:bg-yellow-500 shadow-yellow-100'}`}>
            <span className="tracking-widest uppercase text-[10px] sm:text-xs">Ragu-ragu</span>
          </button>

          {currentQuestionIndex === questions.length - 1 ? (
            <button onClick={() => setFinishConfirmOpen(true)} className="flex-1 max-w-[220px] bg-[#10b981] hover:bg-emerald-600 text-white font-black py-4 sm:py-5 rounded-2xl sm:rounded-[1.5rem] shadow-2xl shadow-emerald-200 transition-all flex items-center justify-center space-x-2 sm:space-x-3 active:scale-95">
                <span className="tracking-widest uppercase text-[10px] sm:text-xs">SELESAI</span>
                <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M5 13l4 4L19 7" /></svg>
            </button>
          ) : (
            <button onClick={() => setCurrentQuestionIndex(currentQuestionIndex + 1)} className="flex-1 max-w-[220px] bg-[#3b82f6] hover:bg-blue-600 text-white font-black py-4 sm:py-5 rounded-2xl sm:rounded-[1.5rem] shadow-2xl shadow-blue-200 transition-all flex items-center justify-center space-x-2 sm:space-x-3 group active:scale-95">
                <span className="hidden sm:inline tracking-widest uppercase text-xs">Berikutnya</span>
                <svg className="w-5 h-5 sm:w-6 sm:h-6 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3.5} d="M9 5l7 7-7 7" /></svg>
            </button>
          )}
        </div>
      </footer>

      {/* Modals */}
      {isQuestionListOpen && <QuestionListModal questions={questions} answers={answers} currentIndex={currentQuestionIndex} onClose={() => setQuestionListOpen(false)} onSelectQuestion={(index) => { setCurrentQuestionIndex(index); setQuestionListOpen(false); }} />}
      
      {isFinishConfirmOpen && <ConfirmationModal title="Kumpulkan Jawaban?" message="Pastikan semua soal telah terisi dengan benar. Tindakan ini akan mengakhiri sesi ujian Anda." confirmText="YA, KUMPULKAN" cancelText="BATAL" onConfirm={handleFinishExam} onCancel={() => setFinishConfirmOpen(false)} confirmColor="green" cancelColor="red" />}
      
      {isWarningOpen && (
        <WarningModal 
            onClose={resumeFromWarning} 
            violationCount={violationCount} 
            antiCheatViolationLimit={config.antiCheatViolationLimit} 
        />
      )}
      
      {isDisqualified && <DisqualificationModal onLogout={onLogout} />}
    </div>
  );
};

export default TestScreen;
