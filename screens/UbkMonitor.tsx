
import React, { useState, useEffect, useMemo } from 'react';
import { Test, User } from '../types';
import ConfirmationModal from '../components/ConfirmationModal';
import { supabase } from '../supabaseClient';

type Status = 'Mengerjakan' | 'Selesai' | 'Diskualifikasi';

interface StudentSession {
  id: string; // Database ID can be number or string (uuid)
  user: User;
  test: Test;
  status: Status;
  progress: number;
  timeLeft: number; // in seconds
  violations: number;
}

interface UbkMonitorProps {
  users: User[];
  tests: Map<string, Test>;
}

const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
    const secs = (seconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
};

const UbkMonitor: React.FC<UbkMonitorProps> = ({ users, tests }) => {
  const [activeSessions, setActiveSessions] = useState<StudentSession[]>([]);
  const [modalState, setModalState] = useState<{ type: 'reset' | 'finish'; session: StudentSession | null }>({ type: 'reset', session: null });
  const [loading, setLoading] = useState(true);
  const [schedules, setSchedules] = useState<any[]>([]);

  const testMapById = useMemo(() => {
      const map = new Map<string, Test>();
      tests.forEach(t => map.set(t.details.id, t));
      return map;
  }, [tests]);

  useEffect(() => {
      const fetchSchedules = async () => {
          const { data } = await supabase.from('schedules').select('*');
          if (data) setSchedules(data);
      };
      fetchSchedules();
  }, []);

  useEffect(() => {
    if (schedules.length === 0) return; // Wait for schedules to load
    
    setLoading(true);
    const channel = supabase
        .channel('student_exam_sessions_realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'student_exam_sessions' }, (payload) => {
            const changedRecord = payload.new as any;
            if (!changedRecord) return;

            setActiveSessions(prevSessions => {
                const user = users.find(u => u.id === changedRecord.user_id);
                const schedule = schedules.find(s => s.id === changedRecord.schedule_id);
                const test = testMapById.get(schedule?.test_id);

                if (!user || !test) return prevSessions;

                const newSession: StudentSession = {
                    id: changedRecord.id,
                    user, test,
                    status: changedRecord.status,
                    progress: changedRecord.progress || 0,
                    timeLeft: changedRecord.time_left_seconds,
                    violations: changedRecord.violations || 0
                };
                
                const existingIndex = prevSessions.findIndex(s => s.id === newSession.id);
                if (existingIndex !== -1) {
                    const updatedSessions = [...prevSessions];
                    updatedSessions[existingIndex] = newSession;
                    return updatedSessions;
                } else {
                    return [...prevSessions, newSession];
                }
            });
        })
        .subscribe();
        
    // Initial fetch with Deep Select to ensure we get all data regardless of local state
    const initialFetch = async () => {
        const { data, error } = await supabase
            .from('student_exam_sessions')
            .select(`
                *,
                user:users(*),
                schedule:schedules(
                    *,
                    test:tests(*)
                )
            `);
            
        if (error) {
            console.error("Error fetching sessions:", error);
        }

        if (data) {
             const mapped = data.map((d: any) => {
                 // Use joined data first, fallback to props lookup
                 const user = d.user || users.find(u => u.id === d.user_id);
                 
                 // Handle schedule and test mapping
                 const scheduleData = d.schedule; // Joined schedule
                 const testData = scheduleData?.test; // Joined test
                 
                 // Fallback to props if joined data is missing (e.g. RLS or deleted)
                 const schedule = scheduleData || schedules.find(s => s.id === d.schedule_id);
                 const test = testData ? { details: testData, questions: [] } : testMapById.get(schedule?.test_id);

                 if(!user || !test) {
                     console.warn("Session missing user or test:", d.id, { user, test });
                     return null;
                 }

                 // Construct Test object from joined data if needed
                 const testObj: Test = test.details ? test : {
                     details: {
                         ...test,
                         questionsToDisplay: test.questions_to_display || 0,
                         durationMinutes: test.duration_minutes || 0,
                         questionCount: test.questions?.[0]?.count || 0
                     },
                     questions: []
                 };

                 return { 
                     id: d.id, 
                     user, 
                     test: testObj, 
                     status: d.status, 
                     progress: d.progress || 0, 
                     timeLeft: d.time_left_seconds, 
                     violations: d.violations || 0 
                 };
             }).filter(Boolean) as StudentSession[];
             
             setActiveSessions(mapped);
        }
        setLoading(false);
    };
    initialFetch();

    return () => {
        supabase.removeChannel(channel);
    };
  }, [users, testMapById, schedules]);
  
  const stats = useMemo(() => {
      const working = activeSessions.filter(s => s.status === 'Mengerjakan').length;
      const totalViolations = activeSessions.reduce((acc, s) => acc + s.violations, 0);
      return { working, totalViolations };
  }, [activeSessions]);

  const handleActionConfirm = async () => {
    if (!modalState.session) return;
    const sessionId = modalState.session.id;

    try {
        if (modalState.type === 'finish') {
            await supabase.from('student_exam_sessions').update({ status: 'Selesai', time_left_seconds: 0 }).eq('id', sessionId);
        } else if (modalState.type === 'reset') {
            const defaultTime = modalState.session.test.details.durationMinutes * 60;
            await supabase.from('student_exam_sessions').update({ status: 'Mengerjakan', progress: 0, time_left_seconds: defaultTime, violations: 0, score: null }).eq('id', sessionId);
            await supabase.from('student_answers').delete().eq('session_id', sessionId);
        }
    } catch (err) {
        alert("Gagal melakukan aksi.");
    }
    setModalState({ type: 'reset', session: null });
  };

  if (loading && activeSessions.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center p-12">
            <svg className="animate-spin h-8 w-8 text-blue-500 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <p className="text-gray-500">Memuat data sesi ujian...</p>
        </div>
      );
  }

  return (
    <div className="animate-fade-in">
      <div className="flex justify-between items-center mb-4">
          <h1 className="text-3xl font-bold text-gray-800">Pemantauan Ujian Real-time</h1>
          <div className="flex items-center space-x-2 bg-green-50 px-3 py-1 rounded-full border border-green-200">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
              </span>
              <span className="text-sm text-green-700 font-semibold">Live Supabase</span>
          </div>
      </div>
      <p className="text-gray-500 mb-6">Data diperbarui secara otomatis dari server.</p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-white p-4 rounded-xl shadow-md border-l-4 border-blue-500"><p className="text-sm text-gray-500">Sesi Aktif</p><p className="text-2xl font-bold text-blue-600">{stats.working}</p></div>
        <div className="bg-white p-4 rounded-xl shadow-md border-l-4 border-green-500"><p className="text-sm text-gray-500">Selesai</p><p className="text-2xl font-bold text-green-600">{activeSessions.length - stats.working}</p></div>
        <div className="bg-white p-4 rounded-xl shadow-md border-l-4 border-red-500"><p className="text-sm text-gray-500">Total Pelanggaran</p><p className="text-2xl font-bold text-red-600">{stats.totalViolations}</p></div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {activeSessions.map(session => ( <SessionCard key={session.id} session={session} onForceFinish={() => setModalState({ type: 'finish', session })} onReset={() => setModalState({ type: 'reset', session })} /> ))}
         {activeSessions.length === 0 && (
            <div className="md:col-span-2 lg:col-span-3 xl:col-span-4 text-center py-12 bg-white rounded-xl shadow-md border border-dashed border-gray-300">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                </div>
                <p className="text-gray-500 font-medium">Tidak ada siswa yang sedang aktif mengerjakan ujian.</p>
                <p className="text-sm text-gray-400">Pastikan jadwal ujian sudah dimulai.</p>
            </div>
        )}
      </div>
      {modalState.session && (
          <ConfirmationModal title={modalState.type === 'finish' ? "Paksa Selesaikan?" : "Reset Sesi?"} message={`Yakin ingin ${modalState.type === 'finish' ? 'menghentikan' : 'mereset'} sesi untuk "${modalState.session.user.fullName}"?`} confirmText={modalState.type === 'finish' ? "Ya, Hentikan" : "Ya, Reset"} cancelText="Batal" onConfirm={handleActionConfirm} onCancel={() => setModalState({ type: 'reset', session: null })} confirmColor="red" cancelColor="green"/>
      )}
    </div>
  );
};

const SessionCard: React.FC<{session: StudentSession; onForceFinish: () => void; onReset: () => void;}> = ({ session, onForceFinish, onReset }) => {
    const { user, test, status, progress, timeLeft, violations } = session;
    // Use questionCount from details if questions array is empty (which happens in AdminDashboard)
    const totalQuestions = test.questions.length > 0 ? test.questions.length : (test.details.questionCount || 0);
    const progressPercentage = totalQuestions > 0 ? (progress / totalQuestions) * 100 : 0;
    
    const statusStyles = {
        'Mengerjakan': { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-500', barColor: 'from-blue-500 to-cyan-400' },
        'Selesai': { bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-500', barColor: 'from-green-500 to-emerald-400' },
        'Diskualifikasi': { bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-500', barColor: 'from-red-500 to-pink-500' },
    };

    const currentStyle = statusStyles[status];

    return (
        <div className={`bg-white rounded-xl shadow-lg border-t-4 ${currentStyle.border} flex flex-col transform transition-all hover:scale-105 duration-300 relative overflow-hidden group`}>
            {/* Custom Style for Striped Animation */}
            <style>{`
                @keyframes progress-stripes {
                    0% { background-position: 1rem 0; }
                    100% { background-position: 0 0; }
                }
                .animate-stripes {
                    background-image: linear-gradient(45deg,rgba(255,255,255,.15) 25%,transparent 25%,transparent 50%,rgba(255,255,255,.15) 50%,rgba(255,255,255,.15) 75%,transparent 75%,transparent);
                    background-size: 1rem 1rem;
                    animation: progress-stripes 1s linear infinite;
                }
            `}</style>

            <div className="p-4 flex items-center space-x-3 border-b relative z-10">
                <img src={user.photoUrl} alt={user.fullName} className="w-12 h-12 rounded-full object-cover border-2 border-white shadow-sm"/>
                <div className="overflow-hidden">
                    <p className="font-bold text-gray-800 truncate text-sm" title={user.fullName}>{user.fullName}</p>
                    <p className="text-xs text-gray-500 truncate" title={test.details.subject}>{test.details.subject}</p>
                </div>
                {status === 'Mengerjakan' && (
                    <span className="absolute top-4 right-4 flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                    </span>
                )}
            </div>
            
            <div className="p-4 flex-grow space-y-5 relative z-10">
                 <div className="flex justify-between items-center text-sm">
                    <span className="font-semibold text-gray-600">Status</span>
                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${currentStyle.bg} ${currentStyle.text}`}>{status}</span>
                 </div>
                 
                 {/* Modern Progress Bar */}
                 <div>
                    <div className="flex justify-between items-end mb-2">
                        <span className="font-semibold text-gray-600 text-[10px] uppercase tracking-wider">Progres Pengerjaan</span>
                        <div className="text-right">
                            <span className="text-lg font-black text-slate-800">{progress}</span>
                            <span className="text-xs text-slate-400 font-medium">/{totalQuestions} Soal</span>
                        </div>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-4 shadow-inner overflow-hidden relative border border-slate-200/50">
                        <div 
                            className={`h-full rounded-full bg-gradient-to-r ${currentStyle.barColor} transition-all duration-1000 ease-out relative shadow-[0_0_15px_rgba(59,130,246,0.3)] ${status === 'Mengerjakan' ? 'animate-stripes' : ''}`} 
                            style={{ width: `${progressPercentage}%` }}
                        >
                            {/* Shine Effect */}
                            <div className="absolute top-0 left-0 bottom-0 right-0 bg-gradient-to-r from-transparent via-white/30 to-transparent w-full -translate-x-full animate-[shimmer_2s_infinite]"></div>
                        </div>
                    </div>
                    <div className="flex justify-between mt-1.5">
                        <span className="text-[10px] text-slate-400 font-bold">{progressPercentage.toFixed(0)}% SELESAI</span>
                        {status === 'Mengerjakan' && (
                            <div className="flex items-center space-x-1">
                                <span className="flex h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse"></span>
                                <span className="text-[10px] text-blue-600 font-black tracking-tighter animate-pulse">LIVE MONITORING</span>
                            </div>
                        )}
                    </div>
                 </div>

                <div className="grid grid-cols-2 gap-3 text-center">
                    <div className="bg-gray-50 p-2 rounded-lg border border-gray-100">
                        <p className="font-semibold text-gray-400 text-[10px] uppercase tracking-wide">Sisa Waktu</p>
                        <p className={`font-mono font-bold text-lg ${timeLeft < 300 && status === 'Mengerjakan' ? 'text-orange-500 animate-pulse' : 'text-gray-700'}`}>{formatTime(timeLeft)}</p>
                    </div>
                    <div className="bg-gray-50 p-2 rounded-lg border border-gray-100">
                        <p className="font-semibold text-gray-400 text-[10px] uppercase tracking-wide">Pelanggaran</p>
                        <p className={`font-mono font-bold text-lg ${violations > 0 ? 'text-red-500' : 'text-gray-700'}`}>{violations}</p>
                    </div>
                </div>
            </div>
            
            <div className="p-3 border-t bg-gray-50/50 rounded-b-xl flex justify-between space-x-2 relative z-10">
                <button onClick={onReset} className="flex-1 text-xs font-semibold text-yellow-700 bg-yellow-50 hover:bg-yellow-100 border border-yellow-200 rounded-lg px-3 py-2 transition shadow-sm hover:shadow">Reset</button>
                <button onClick={onForceFinish} disabled={status !== 'Mengerjakan'} className="flex-1 text-xs font-semibold text-white bg-red-500 hover:bg-red-600 border border-red-600 rounded-lg px-3 py-2 transition shadow-sm hover:shadow disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none">Stop Ujian</button>
            </div>
        </div>
    );
};

export default UbkMonitor;
