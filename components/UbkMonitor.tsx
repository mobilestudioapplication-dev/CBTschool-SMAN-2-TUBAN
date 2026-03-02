
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Test, User } from '../types';
import ConfirmationModal from './ConfirmationModal';
import { supabase } from '../supabaseClient';

type Status = 'Mengerjakan' | 'Selesai' | 'Diskualifikasi';

interface StudentSession {
  id: string;
  user: User;
  test: Test;
  status: Status;
  progress: number;
  timeLeft: number; // in seconds
  violations: number;
  startedAt: string;
}

interface LockedUser {
    id: string;
    fullName: string;
    nisn: string;
    class: string;
    activeDeviceId: string | null; // Allow null for anomaly
    lastLogin: string;
    isAnomaly?: boolean; // New optional field
    sessionStatus?: Status; // To show status if anomaly
}

interface UbkMonitorProps {
  users: User[];
  tests: Map<string, Test>;
}

const formatTime = (seconds: number) => {
    if (seconds < 0) return "00:00";
    const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
    const secs = (seconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
};

const formatStartDate = (isoString: string) => {
    if (!isoString) return '-';
    try {
        const date = new Date(isoString);
        return new Intl.DateTimeFormat('id-ID', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        }).format(date);
    } catch (e) {
        return '-';
    }
};

const UbkMonitor: React.FC<UbkMonitorProps> = ({ users, tests }) => {
  // Tabs: 'exam' (Sesi Ujian) | 'login' (Status Device)
  const [activeTab, setActiveTab] = useState<'exam' | 'login'>('exam');
  
  const [activeSessions, setActiveSessions] = useState<StudentSession[]>([]);
  const [lockedUsers, setLockedUsers] = useState<LockedUser[]>([]);
  
  const [modalState, setModalState] = useState<{ type: 'reset' | 'finish' | 'resume' | 'unlock_device' | 'reset_all' | 'unlock_all_device'; session: StudentSession | null; user?: LockedUser | null }>({ type: 'reset', session: null, user: null });
  
  // Loading States
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  const [schedules, setSchedules] = useState<any[]>([]);
  const refreshIntervalRef = useRef<number | null>(null);
  const isFetchingSessionsRef = useRef(false);
  const isFetchingLockedRef = useRef(false);
  const debounceSessionsRef = useRef<number | null>(null);
  const debounceLockedRef = useRef<number | null>(null);

  // Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [classFilter, setClassFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState(''); // Default empty to show all history 

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(12);

  const testMapById = useMemo(() => {
      const map = new Map<string, Test>();
      tests.forEach(t => map.set(t.details.id, t));
      return map;
  }, [tests]);

  const classList = useMemo(() => ['all', ...Array.from(new Set(users.map(u => u.class))).sort()], [users]);

  // Load Schedules First
  useEffect(() => {
      const fetchSchedules = async () => {
          const { data, error } = await supabase.from('schedules').select('*');
          if (data) {
              setSchedules(data);
          } else {
              console.error("Failed to load schedules:", error);
          }
      };
      fetchSchedules();
  }, []);

  // --- DATA FETCHERS ---

  // 1. Fetch Exam Sessions
  const fetchSessions = async (silent = false) => {
        if (isFetchingSessionsRef.current) return; // Skip jika sedang fetch
        isFetchingSessionsRef.current = true;

        if (!silent) setIsInitialLoading(true);
        else setIsRefreshing(true);

        const { data, error } = await supabase
            .from('student_exam_sessions')
            .select('id, user_id, schedule_id, status, progress, time_left_seconds, violations, started_at');
        
        if (data) {
             const mapped = data.map(d => {
                 const user = users.find(u => u.id === d.user_id);
                 const schedule = schedules.find(s => s.id === d.schedule_id);
                 const test = schedule ? testMapById.get(schedule.test_id) : null;
                 
                 if(!user || !test) return null;
                 
                 return { 
                     id: d.id, 
                     user, 
                     test, 
                     status: d.status, 
                     progress: d.progress, 
                     timeLeft: d.time_left_seconds, 
                     violations: d.violations,
                     startedAt: d.started_at
                 };
             }).filter(Boolean) as StudentSession[];
             
             setActiveSessions(mapped);
        } else if (error) {
            console.error("Error fetching sessions:", error);
        }
        
        if (!silent) setIsInitialLoading(false);
        else setIsRefreshing(false);
        isFetchingSessionsRef.current = false;
  };

  // 2. Fetch Locked Users (NEW FEATURE)
  const fetchLockedUsers = async (silent = false) => {
      if (isFetchingLockedRef.current) return; // Skip jika sedang fetch
      isFetchingLockedRef.current = true;

      if (!silent) setIsInitialLoading(true);

      // Ambil hanya kolom yang diperlukan — BUKAN select('*') untuk efisiensi
      const { data, error } = await supabase
        .from('users')
        .select('id, full_name, nisn, class, active_device_id, updated_at')
        .not('active_device_id', 'is', null);

      if (data) {
          const mapped: LockedUser[] = data.map((u: any) => ({
              id: u.id,
              fullName: u.full_name,
              nisn: u.nisn,
              class: u.class,
              activeDeviceId: u.active_device_id,
              lastLogin: u.updated_at
          }));
          setLockedUsers(mapped);
      }
      
      if (!silent) setIsInitialLoading(false);
      isFetchingLockedRef.current = false;
  };

  // Wrapper untuk refresh semua
  const refreshAll = (silent = true) => {
      fetchSessions(silent);
      fetchLockedUsers(silent);
  };

  // Debounced versions untuk realtime subscription (mencegah ratusan panggilan bersamaan)
  const debouncedFetchSessions = () => {
      if (debounceSessionsRef.current) clearTimeout(debounceSessionsRef.current);
      debounceSessionsRef.current = window.setTimeout(() => fetchSessions(true), 400);
  };
  const debouncedFetchLockedUsers = () => {
      if (debounceLockedRef.current) clearTimeout(debounceLockedRef.current);
      debounceLockedRef.current = window.setTimeout(() => fetchLockedUsers(true), 400);
  };

  // --- REALTIME & INTERVAL SETUP ---
  useEffect(() => {
    // Initial Load
    refreshAll(false);

    // Interval Polling (Silent Refresh) - Solusi Kedap Kedip
    // Kita set interval, tapi function fetchSessions TIDAK BOLEH set loading=true jika silent=true
    refreshIntervalRef.current = window.setInterval(() => {
        refreshAll(true);
    }, 15000); // Polling setiap 15 detik (realtime handle update instan)

    // Realtime Subscription — pakai debounce agar tidak flood saat banyak siswa update bersamaan
    const channel = supabase
        .channel('monitor_changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'student_exam_sessions' }, debouncedFetchSessions)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, debouncedFetchLockedUsers)
        .subscribe();

    return () => {
        supabase.removeChannel(channel);
        if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current);
    };
  }, [users, testMapById, schedules]); 

  // --- Filtering Logic ---
  const filteredSessions = useMemo(() => {
    return [...activeSessions]
      .filter(session => {
        const user = session.user;
        const searchLower = searchTerm.toLowerCase();
        
        const matchesSearch = searchLower === '' ||
                              user.fullName.toLowerCase().includes(searchLower) ||
                              user.nisn.includes(searchLower);
        
        const matchesClass = classFilter === 'all' || user.class === classFilter;

        let matchesStatus = true;
        if (statusFilter === 'Melanggar') {
            matchesStatus = session.violations > 0;
        } else if (statusFilter !== 'all') {
            matchesStatus = session.status === statusFilter;
        }

        let matchesDate = true;
        if (dateFilter && session.startedAt) {
            const sessionDate = new Date(session.startedAt);
            const localSessionDate = sessionDate.toLocaleDateString('en-CA'); 
            matchesDate = localSessionDate === dateFilter;
        }

        return matchesSearch && matchesClass && matchesStatus && matchesDate;
      })
      .sort((a, b) => {
          // Sort order: Melanggar > Mengerjakan > Selesai
          const score = (s: StudentSession) => {
              if (s.status === 'Diskualifikasi') return 4;
              if (s.violations > 0 && s.status === 'Mengerjakan') return 3;
              if (s.status === 'Mengerjakan') return 2;
              return 1;
          };
          return score(b) - score(a);
      });
  }, [activeSessions, searchTerm, classFilter, statusFilter, dateFilter]);

  const filteredLockedUsers = useMemo(() => {
      // 1. Get real locked users
      const realLocked = lockedUsers.filter(u => {
          const searchLower = searchTerm.toLowerCase();
          const matchesSearch = searchLower === '' || u.fullName.toLowerCase().includes(searchLower) || u.nisn.includes(searchLower);
          const matchesClass = classFilter === 'all' || u.class === classFilter;
          return matchesSearch && matchesClass;
      });

      // 2. Find users who are WORKING but NOT locked (Anomalies)
      const lockedUserIds = new Set(lockedUsers.map(u => u.id));
      
      const anomalies = activeSessions
          .filter(s => s.status === 'Mengerjakan' && !lockedUserIds.has(s.user.id))
          .filter(s => {
              // Apply same filters
              const user = s.user;
              const searchLower = searchTerm.toLowerCase();
              const matchesSearch = searchLower === '' || user.fullName.toLowerCase().includes(searchLower) || user.nisn.includes(searchLower);
              const matchesClass = classFilter === 'all' || user.class === classFilter;
              return matchesSearch && matchesClass;
          })
          .map(s => ({
              id: s.user.id,
              fullName: s.user.fullName,
              nisn: s.user.nisn,
              class: s.user.class,
              activeDeviceId: null,
              lastLogin: s.startedAt, // Use session start time as proxy
              isAnomaly: true,
              sessionStatus: s.status
          } as LockedUser));

      return [...anomalies, ...realLocked];
  }, [lockedUsers, activeSessions, searchTerm, classFilter]);

  // --- Pagination ---
  const currentDataList = activeTab === 'exam' ? filteredSessions : filteredLockedUsers;
  const totalRecords = currentDataList.length;
  const totalPages = rowsPerPage === 0 ? 1 : Math.ceil(totalRecords / rowsPerPage);
  
  useEffect(() => { setCurrentPage(1); }, [searchTerm, classFilter, statusFilter, dateFilter, rowsPerPage, activeTab]);

  const paginatedData = useMemo(() => {
    if (rowsPerPage === 0) return currentDataList;
    const startIndex = (currentPage - 1) * rowsPerPage;
    return currentDataList.slice(startIndex, startIndex + rowsPerPage);
  }, [currentDataList, currentPage, rowsPerPage]);

  // --- Stats ---
  const stats = useMemo(() => {
      const working = activeSessions.filter(s => s.status === 'Mengerjakan').length;
      const finished = activeSessions.filter(s => s.status === 'Selesai').length;
      const violations = activeSessions.reduce((acc, s) => acc + s.violations, 0);
      const locked = lockedUsers.length;
      return { working, finished, violations, locked };
  }, [activeSessions, lockedUsers]);

  // --- Actions ---
  const handleActionConfirm = async () => {
    try {
        if (modalState.type === 'finish' && modalState.session) {
            const { error: finishError } = await supabase.from('student_exam_sessions').update({ status: 'Selesai', time_left_seconds: 0 }).eq('id', modalState.session.id);
            if (finishError) throw finishError;
        } else if (modalState.type === 'resume' && modalState.session) {
            const { error: resumeError } = await supabase.from('student_exam_sessions').update({ status: 'Mengerjakan', violations: 0 }).eq('id', modalState.session.id);
            if (resumeError) throw resumeError;
        } else if (modalState.type === 'reset' && modalState.session) {
            // Reset dari Sesi Ujian (Full Reset)
            const userId = modalState.session.user.id;
            const { error: resetError } = await supabase.rpc('admin_reset_device_login', { p_user_id: userId });
            if (resetError) throw resetError;
            alert("Device berhasil di-reset. Siswa dapat login kembali.");
        } else if (modalState.type === 'unlock_device' && modalState.user) {
            // Reset dari Tab Locked Users (Hanya Device Lock)
            const userId = modalState.user.id;
            const { error } = await supabase.rpc('admin_reset_device_login', { p_user_id: userId });
            if (error) throw error;
            alert(`Kunci perangkat untuk ${modalState.user.fullName} berhasil dibuka.`);
        } else if (modalState.type === 'reset_all') {
            // Reset Semua Login (Device Lock)
            const userIds = activeTab === 'exam'
                ? filteredSessions.map(s => s.user.id)
                : filteredLockedUsers.map(u => u.id);

            if (userIds.length === 0) {
                alert("Tidak ada data untuk di-reset.");
                setModalState({ type: 'reset', session: null, user: null });
                return;
            }

            const { error } = await supabase.rpc('admin_reset_all_device_logins', { p_user_ids: userIds });
            if (error) throw error;
            alert(`Berhasil mereset login untuk ${userIds.length} siswa.`);
        } else if (modalState.type === 'unlock_all_device') {
            // Buka Semua Kunci Perangkat (hanya yang real locked, bukan anomaly)
            const realLockedUsers = filteredLockedUsers.filter(u => !u.isAnomaly);
            const userIds = realLockedUsers.map(u => u.id);

            if (userIds.length === 0) {
                alert("Tidak ada perangkat terkunci yang perlu dibuka saat ini.");
                setModalState({ type: 'reset', session: null, user: null });
                return;
            }

            const { error } = await supabase.rpc('admin_reset_all_device_logins', { p_user_ids: userIds });
            if (error) throw error;
            alert(`Berhasil membuka kunci perangkat untuk ${userIds.length} siswa.`);
        }
        
        refreshAll(true);
    } catch (err: any) {
        alert("Gagal melakukan aksi: " + err.message);
    }
    setModalState({ type: 'reset', session: null, user: null });
  };

  const getModalTitle = () => {
      switch(modalState.type) {
          case 'finish': return 'Hentikan Paksa Ujian?';
          case 'resume': return 'Lanjutkan Ujian Siswa?';
          case 'reset': return 'Reset Device & Sesi?';
          case 'unlock_device': return 'Buka Kunci Perangkat?';
          case 'reset_all': return 'Reset Semua Login?';
          case 'unlock_all_device': return 'Buka Semua Kunci Perangkat?';
          default: return '';
      }
  };

  const getModalMessage = () => {
      if (modalState.type === 'unlock_device' && modalState.user) {
          return `Anda akan mereset status login untuk siswa "${modalState.user.fullName}". Ini memungkinkan siswa login kembali di perangkat baru/lain.`;
      }
      if (modalState.type === 'reset_all') {
          const count = activeTab === 'exam' ? filteredSessions.length : filteredLockedUsers.length;
          return `PERHATIAN: Anda akan mereset status login untuk ${count} siswa yang tampil di daftar ini. Siswa harus login ulang.`;
      }
      if (modalState.type === 'unlock_all_device') {
          const realLockedCount = filteredLockedUsers.filter(u => !u.isAnomaly).length;
          return `Anda akan membuka kunci perangkat untuk ${realLockedCount} siswa yang saat ini terkunci. Siswa dapat login ulang dari perangkat manapun.`;
      }
      if (!modalState.session) return '';
      const name = modalState.session.user.fullName;
      switch(modalState.type) {
          case 'finish': return `Anda yakin ingin menghentikan paksa ujian untuk ${name}? Status akan diubah menjadi 'Selesai'.`;
          case 'resume': return `Siswa ${name} akan diizinkan melanjutkan ujian. Jumlah pelanggaran akan di-reset menjadi 0.`;
          case 'reset': return `PERHATIAN: Ini akan membuka kunci perangkat siswa ${name}.`;
          default: return '';
      }
  };

  const getModalColor = () => {
      switch(modalState.type) {
          case 'finish': return 'red';
          case 'resume': return 'green';
          case 'reset': return 'red';
          case 'unlock_device': return 'blue';
          case 'reset_all': return 'red';
          case 'unlock_all_device': return 'green';
          default: return 'blue';
      }
  };

  if (isInitialLoading) {
      return (
        <div className="flex flex-col items-center justify-center p-12 h-96">
            <svg className="animate-spin h-10 w-10 text-blue-500 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <p className="text-gray-500 font-medium">Menghubungkan ke server ujian...</p>
        </div>
      );
  }

  return (
    <div className="animate-fade-in pb-10">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-800">Pemantauan Ujian</h1>
            <p className="text-gray-500 mt-1">Pantau progres dan reset login siswa yang terkendala.</p>
          </div>
          <div className="flex items-center space-x-3">
              {/* Buka All Device — hanya aktif di tab login */}
              <button
                onClick={() => setModalState({ type: 'unlock_all_device', session: null, user: null })}
                className="hidden md:flex items-center px-3 py-2 bg-green-100 border border-green-200 rounded-full hover:bg-green-200 text-green-700 text-xs font-bold transition-all shadow-sm gap-2"
                title="Buka Semua Kunci Perangkat"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                </svg>
                Buka All Device
              </button>
              <button
                onClick={() => setModalState({ type: 'reset_all', session: null, user: null })}
                className="hidden md:flex items-center px-3 py-2 bg-red-100 border border-red-200 rounded-full hover:bg-red-200 text-red-700 text-xs font-bold transition-all shadow-sm gap-2"
                title="Reset Login Semua Siswa"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                Reset All
              </button>
              <button 
                onClick={() => refreshAll(false)} 
                className="p-2 bg-white border border-gray-200 rounded-full hover:bg-blue-50 text-gray-500 hover:text-blue-600 transition-all shadow-sm group"
                title="Refresh Manual"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 ${isRefreshing ? 'animate-spin text-blue-600' : 'group-hover:rotate-180 transition-transform duration-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
              <div className="flex items-center space-x-2 bg-green-50 px-4 py-2 rounded-full border border-green-200 shadow-sm">
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                  </span>
                  <span className="text-sm text-green-700 font-bold">Live</span>
              </div>
          </div>
      </div>

      {/* STATS SUMMARY */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col items-center">
            <span className="text-2xl font-bold text-blue-600">{stats.working}</span>
            <span className="text-xs text-gray-500 uppercase font-bold tracking-wider">Sedang Ujian</span>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col items-center">
            <span className="text-2xl font-bold text-green-600">{stats.finished}</span>
            <span className="text-xs text-gray-500 uppercase font-bold tracking-wider">Selesai</span>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col items-center">
            <span className="text-2xl font-bold text-red-600">{stats.violations}</span>
            <span className="text-xs text-gray-500 uppercase font-bold tracking-wider">Pelanggaran</span>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col items-center cursor-pointer hover:bg-yellow-50 transition" onClick={() => setActiveTab('login')}>
            <span className="text-2xl font-bold text-yellow-600">{stats.locked}</span>
            <span className="text-xs text-gray-500 uppercase font-bold tracking-wider">Device Terkunci</span>
        </div>
      </div>

      {/* TABS NAVIGATION */}
      <div className="flex space-x-1 bg-gray-200 p-1 rounded-xl mb-6 w-full md:w-fit">
          <button 
            onClick={() => setActiveTab('exam')} 
            className={`flex-1 md:flex-none px-6 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'exam' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Pantau Progres Ujian
          </button>
          <button 
            onClick={() => setActiveTab('login')} 
            className={`flex-1 md:flex-none px-6 py-2 rounded-lg text-sm font-bold transition-all flex items-center justify-center space-x-2 ${activeTab === 'login' ? 'bg-white text-yellow-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
            <span>Status Login / Device</span>
          </button>
      </div>

      {/* FILTERS */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-8 flex flex-col md:flex-row gap-4 items-center">
            <div className="w-full md:w-auto flex-grow relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" /></svg>
                </span>
                <input
                    type="text"
                    placeholder="Cari Nama / NISN..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="w-full md:w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                />
            </div>
            <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2 w-full md:w-auto">
                 {activeTab === 'exam' && (
                     <>
                        <input 
                            type="date" 
                            value={dateFilter}
                            onChange={e => setDateFilter(e.target.value)}
                            className="w-full sm:w-auto px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-gray-700"
                            placeholder="Filter Tanggal"
                        />
                        <select 
                            value={statusFilter} 
                            onChange={e => setStatusFilter(e.target.value)} 
                            className="w-full sm:w-auto px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                        >
                            <option value="all">Semua Status</option>
                            <option value="Mengerjakan">Sedang Mengerjakan</option>
                            <option value="Selesai">Selesai</option>
                            <option value="Diskualifikasi">Diskualifikasi</option>
                            <option value="Melanggar">Melanggar</option>
                        </select>
                        {(searchTerm || classFilter !== 'all' || statusFilter !== 'all' || dateFilter) && (
                            <button 
                                onClick={() => { setSearchTerm(''); setClassFilter('all'); setStatusFilter('all'); setDateFilter(''); }}
                                className="text-sm text-red-500 hover:text-red-700 font-medium whitespace-nowrap px-2"
                            >
                                Reset Filter
                            </button>
                        )}
                     </>
                 )}
                 <select 
                    value={classFilter} 
                    onChange={e => setClassFilter(e.target.value)} 
                    className="w-full sm:w-auto px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                 >
                    <option value="all">Semua Kelas</option>
                    {classList.slice(1).map(c => <option key={c} value={c}>{c}</option>)}
                </select>
            </div>
      </div>

      {/* VIEW CONTENT */}
      {activeTab === 'exam' ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {paginatedData.map(item => ( 
                    <SessionCard 
                        key={(item as StudentSession).id} 
                        session={item as StudentSession} 
                        onForceFinish={() => setModalState({ type: 'finish', session: item as StudentSession })} 
                        onReset={() => setModalState({ type: 'reset', session: item as StudentSession })} 
                        onResume={() => setModalState({ type: 'resume', session: item as StudentSession })}
                    /> 
                ))}
            </div>
            {(paginatedData as StudentSession[]).length === 0 && (
                <div className="w-full bg-white border-2 border-dashed border-gray-300 rounded-2xl p-12 text-center">
                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    </div>
                    <h3 className="text-lg font-bold text-gray-800">Tidak ada sesi ujian aktif.</h3>
                    <p className="text-gray-500 text-sm mt-2">Pastikan siswa sudah mulai login dan mengerjakan.</p>
                </div>
            )}
          </>
      ) : (
          /* TAB LOCKED USERS VIEW */
          <div className="bg-white rounded-xl shadow-md overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-yellow-50">
                      <tr>
                          <th className="px-6 py-3 text-left text-xs font-bold text-yellow-800 uppercase tracking-wider">Nama Siswa</th>
                          <th className="px-6 py-3 text-left text-xs font-bold text-yellow-800 uppercase tracking-wider">Kelas / NISN</th>
                          <th className="px-6 py-3 text-left text-xs font-bold text-yellow-800 uppercase tracking-wider">Device ID</th>
                          <th className="px-6 py-3 text-left text-xs font-bold text-yellow-800 uppercase tracking-wider">Login Terakhir</th>
                          <th className="px-6 py-3 text-right text-xs font-bold text-yellow-800 uppercase tracking-wider">Aksi</th>
                      </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                      {(paginatedData as LockedUser[]).length === 0 && (
                          <tr><td colSpan={5} className="px-6 py-10 text-center text-gray-500">Tidak ada siswa yang terkunci saat ini.</td></tr>
                      )}
                      {(paginatedData as LockedUser[]).map(user => (
                          <tr key={user.id} className="hover:bg-gray-50">
                              <td className="px-6 py-4 whitespace-nowrap">
                                  <div className="text-sm font-bold text-gray-900">{user.fullName}</div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                  <div className="text-sm text-gray-900">{user.class}</div>
                                  <div className="text-xs text-gray-500">{user.nisn}</div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                  {user.isAnomaly ? (
                                      <div className="flex flex-col">
                                          <span className="text-xs font-bold text-orange-600 bg-orange-50 px-2 py-1 rounded w-fit">
                                              ⏳ Menunggu Login Ulang
                                          </span>
                                          <span className="text-[10px] text-gray-500 mt-1">Belum terkunci ke perangkat manapun.</span>
                                      </div>
                                  ) : (
                                      <div className="flex flex-col gap-0.5">
                                          <div className="text-xs font-mono bg-gray-100 px-2 py-1 rounded border border-gray-200 text-gray-700 max-w-[200px] truncate" title={user.activeDeviceId || ''}>{user.activeDeviceId}</div>
                                          <span className="text-[10px] text-gray-400">ID Perangkat Aktif</span>
                                      </div>
                                  )}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                  {new Date(user.lastLogin).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                  <button
                                      onClick={() => setModalState({ type: 'unlock_device', user, session: null })}
                                      className="text-white bg-green-500 hover:bg-green-600 px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm transition-colors flex items-center gap-1 ml-auto"
                                      title="Buka kunci perangkat siswa ini"
                                  >
                                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                                      </svg>
                                      Buka Device
                                  </button>
                              </td>
                          </tr>
                      ))}
                  </tbody>
              </table>
          </div>
      )}

      {/* Pagination Controls */}
      {totalRecords > 0 && (
        <div className="mt-8 flex flex-col md:flex-row items-center justify-center md:justify-end text-sm text-gray-600 space-y-2 md:space-y-0 md:space-x-4">
            <div className="flex items-center space-x-2 bg-white px-3 py-1 rounded-lg border border-gray-200 shadow-sm">
                <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-2 py-1 rounded hover:bg-gray-100 disabled:opacity-50 transition">&larr;</button>
                <span className="mx-2">Halaman <span className="font-bold text-gray-900">{currentPage}</span> dari <span className="font-bold text-gray-900">{totalPages}</span></span>
                <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="px-2 py-1 rounded hover:bg-gray-100 disabled:opacity-50 transition">&rarr;</button>
            </div>
            <div className="flex items-center space-x-2">
                <span>Tampilkan:</span>
                <select value={rowsPerPage} onChange={e => setRowsPerPage(Number(e.target.value))} className="p-1.5 border border-gray-300 rounded-lg bg-white shadow-sm focus:ring-blue-500 outline-none text-sm">
                    <option value={12}>12 baris</option>
                    <option value={24}>24 baris</option>
                    <option value={48}>48 baris</option>
                    <option value={0}>Semua</option>
                </select>
                <span className="text-gray-400">|</span>
                <span className="font-semibold">{totalRecords} Total Data</span>
            </div>
        </div>
      )}

      {modalState.type && (modalState.session || modalState.user || modalState.type === 'reset_all' || modalState.type === 'unlock_all_device') && (
          <ConfirmationModal 
            title={getModalTitle()} 
            message={getModalMessage()}
            confirmText="YA, PROSES" 
            cancelText="Batal" 
            onConfirm={handleActionConfirm} 
            onCancel={() => setModalState({ type: 'reset', session: null, user: null })} 
            confirmColor={getModalColor() as any} 
            cancelColor="gray"
          />
      )}
    </div>
  );
};

const CountUp = ({ value }: { value: number }) => {
    const [displayValue, setDisplayValue] = useState(0);
    const requestRef = useRef<number>();
    const startTimeRef = useRef<number>();
    const startValueRef = useRef<number>(0);

    useEffect(() => {
        startValueRef.current = displayValue;
        startTimeRef.current = performance.now();
        
        const animate = (time: number) => {
            const elapsed = time - (startTimeRef.current || time);
            const duration = 1500; // 1.5s animation
            const progress = Math.min(elapsed / duration, 1);
            const ease = 1 - Math.pow(1 - progress, 4); // Ease out quart
            
            const current = Math.floor(startValueRef.current + (value - startValueRef.current) * ease);
            setDisplayValue(current);

            if (progress < 1) {
                requestRef.current = requestAnimationFrame(animate);
            } else {
                setDisplayValue(value);
            }
        };

        requestRef.current = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(requestRef.current!);
    }, [value]);

    return <>{displayValue}</>;
};

const SessionCard: React.FC<{session: StudentSession; onForceFinish: () => void; onReset: () => void; onResume: () => void;}> = ({ session, onForceFinish, onReset, onResume }) => {
    const { user, test, status, progress, timeLeft, violations } = session;
    // Fix 0/0 Issue: Use questionCount from details if questions array is empty (lazy loaded)
    const totalQuestions = test.questions.length > 0 ? test.questions.length : (test.details.questionCount || 0);
    const progressPercentage = totalQuestions > 0 ? (progress / totalQuestions) * 100 : 0;
    
    const [mounted, setMounted] = useState(false);
    useEffect(() => {
        const timer = setTimeout(() => setMounted(true), 100);
        return () => clearTimeout(timer);
    }, []);

    const displayedPercentage = mounted ? progressPercentage : 0;
    
    const isWorking = status === 'Mengerjakan';
    const isFinished = status === 'Selesai';
    const isDisqualified = status === 'Diskualifikasi';

    return (
        <div className={`group relative bg-white rounded-2xl shadow-sm hover:shadow-xl transition-all duration-300 overflow-hidden border border-slate-100 ${isWorking ? 'ring-2 ring-blue-400/30' : ''}`}>
            {/* Add styles for progress animation */}
            <style>{`
                @keyframes progress-stripes {
                    0% { background-position: 1rem 0; }
                    100% { background-position: 0 0; }
                }
                @keyframes shimmer {
                    0% { transform: translateX(-100%); }
                    100% { transform: translateX(100%); }
                }
                .animate-blue-stripes {
                    background-image: linear-gradient(
                        45deg,
                        rgba(255, 255, 255, 0.15) 25%,
                        transparent 25%,
                        transparent 50%,
                        rgba(255, 255, 255, 0.15) 50%,
                        rgba(255, 255, 255, 0.15) 75%,
                        transparent 75%,
                        transparent
                    );
                    background-size: 1rem 1rem;
                    animation: progress-stripes 1s linear infinite;
                }
                @keyframes pulse-border {
                    0% { border-color: rgba(59, 130, 246, 0.5); box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.2); }
                    70% { border-color: rgba(59, 130, 246, 0.2); box-shadow: 0 0 0 6px rgba(59, 130, 246, 0); }
                    100% { border-color: rgba(59, 130, 246, 0.5); box-shadow: 0 0 0 0 rgba(59, 130, 246, 0); }
                }
                .animate-pulse-border {
                    animation: pulse-border 2s infinite;
                }
            `}</style>
            
            {/* Top Border Indicator */}
            <div className={`h-1.5 w-full ${
                isWorking ? 'bg-blue-500 animate-pulse' : 
                isFinished ? 'bg-emerald-500' : 
                'bg-rose-500'
            }`}></div>

            <div className="p-5">
                {/* Header: User Info */}
                <div className="flex items-center space-x-4 mb-5">
                    <div className="relative">
                        <img 
                            src={user.photoUrl} 
                            alt={user.fullName} 
                            className={`w-14 h-14 rounded-full object-cover border-2 ${
                                isWorking ? 'border-blue-400 shadow-lg shadow-blue-100' : 
                                isFinished ? 'border-emerald-400' : 
                                'border-rose-400'
                            }`}
                        />
                        {isWorking && (
                            <span className="absolute bottom-0 right-0 block h-3.5 w-3.5 rounded-full bg-green-500 ring-2 ring-white animate-pulse"></span>
                        )}
                    </div>
                    <div className="min-w-0 flex-1">
                        <h3 className="font-bold text-slate-800 truncate text-base leading-tight mb-0.5" title={user.fullName}>{user.fullName}</h3>
                        <p className="text-xs font-medium text-slate-500 truncate uppercase tracking-wide" title={test.details.subject}>{test.details.subject}</p>
                    </div>
                </div>

                {/* Status & Progress Section */}
                <div className="space-y-4 mb-5">
                    <div className="flex justify-between items-center">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Status</span>
                        {isWorking ? (
                            <span className="px-3 py-1 rounded-full text-[10px] font-black bg-blue-50 text-blue-600 border border-blue-100 uppercase tracking-wide flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-ping"></span>
                                Mengerjakan
                            </span>
                        ) : isFinished ? (
                            <span className="px-3 py-1 rounded-full text-[10px] font-black bg-emerald-50 text-emerald-600 border border-emerald-100 uppercase tracking-wide">
                                Selesai
                            </span>
                        ) : (
                            <span className="px-3 py-1 rounded-full text-[10px] font-black bg-rose-50 text-rose-600 border border-rose-100 uppercase tracking-wide">
                                Diskualifikasi
                            </span>
                        )}
                    </div>

                    <div>
                        <div className="flex justify-between items-end mb-2">
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Progres</span>
                            <span className="font-mono text-xs font-bold text-slate-700"><CountUp value={progress} /> <span className="text-slate-400 font-normal">/ {totalQuestions} Soal</span></span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden shadow-inner ring-1 ring-slate-200/50">
                            <div 
                                className={`h-full transition-all duration-[1500ms] ease-out relative ${
                                    isWorking ? 'bg-blue-500 animate-blue-stripes' : 
                                    isFinished ? 'bg-emerald-500' : 
                                    'bg-rose-500'
                                }`} 
                                style={{ width: `${displayedPercentage}%` }}
                            >
                                {isWorking && <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent w-full -translate-x-full animate-[shimmer_1.5s_infinite]"></div>}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 gap-3 mb-5">
                    <div className={`p-3 rounded-xl border ${timeLeft < 300 && isWorking ? 'bg-orange-50 border-orange-200 animate-pulse' : 'bg-slate-50 border-slate-100'}`}>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Sisa Waktu</p>
                        <p className={`font-mono font-black text-lg leading-none ${timeLeft < 300 && isWorking ? 'text-orange-600' : 'text-slate-700'}`}>
                            {formatTime(timeLeft)}
                        </p>
                    </div>
                    <div className={`p-3 rounded-xl border ${violations > 0 ? 'bg-rose-50 border-rose-200' : 'bg-slate-50 border-slate-100'}`}>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Pelanggaran</p>
                        <p className={`font-mono font-black text-lg leading-none ${violations > 0 ? 'text-rose-600' : 'text-slate-700'}`}>
                            {violations}
                        </p>
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2 pt-4 border-t border-slate-100">
                    {isDisqualified || (isWorking && violations > 0) ? (
                        <button 
                            onClick={onResume} 
                            className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold py-2.5 rounded-lg shadow-sm hover:shadow-md transition-all active:scale-95 flex items-center justify-center gap-1.5"
                            title="Hapus pelanggaran dan izinkan lanjut"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                            Lanjutkan
                        </button>
                    ) : null}
                    
                    <button 
                        onClick={onReset} 
                        className="flex-1 bg-amber-100 hover:bg-amber-200 text-amber-700 text-xs font-bold py-2.5 rounded-lg transition-colors active:scale-95"
                    >
                        Reset
                    </button>
                    
                    <button 
                        onClick={onForceFinish} 
                        disabled={!isWorking} 
                        className="flex-1 bg-rose-100 hover:bg-rose-200 text-rose-700 text-xs font-bold py-2.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
                    >
                        Stop Ujian
                    </button>
                </div>
            </div>
        </div>
    );
};

export default UbkMonitor;
