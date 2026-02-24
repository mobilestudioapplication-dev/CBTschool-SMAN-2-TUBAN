
import React, { useMemo, useState } from 'react';
import { User, Test, AdminView, AppConfig } from '../types';
import BarChart from './BarChart';
import PerformanceDonutChart from './PerformanceDonutChart';
import OverallCompletionChart from './OverallCompletionChart';

// StatCard Component
const StatCard: React.FC<{ title: string; value: string | number; icon: React.ReactNode; gradient: string }> = ({ title, value, icon, gradient }) => (
    <div className={`relative ${gradient} rounded-2xl shadow-lg p-6 text-white overflow-hidden transform hover:-translate-y-1.5 transition-transform duration-300 ease-in-out`}>
        <div className="absolute -top-4 -right-4 w-24 h-24 bg-white/10 rounded-full opacity-50"></div>
        <div className="absolute -bottom-8 -left-2 w-32 h-32 bg-white/10 rounded-full opacity-50"></div>
        <div className="relative z-10">
            <div className="bg-white/20 rounded-full w-14 h-14 flex items-center justify-center mb-4 backdrop-blur-sm border border-white/20">
                {icon}
            </div>
            <p className="text-3xl font-bold">{value}</p>
            <p className="text-sm font-medium opacity-90">{title}</p>
        </div>
    </div>
);

// TestSubjectCard Component (Flip Version)
const TestSubjectCard: React.FC<{ test: Test, token: string, index: number, onNavigate: (view: AdminView, token: string) => void }> = ({ test, token, index, onNavigate }) => {
    const [isFlipped, setIsFlipped] = useState(false);

    // Array warna gradien yang berbeda-beda
    const gradients = [
        'from-blue-600 to-cyan-500',
        'from-emerald-500 to-teal-600',
        'from-violet-600 to-purple-500',
        'from-orange-500 to-amber-500',
        'from-rose-500 to-pink-600',
        'from-indigo-600 to-blue-600',
    ];

    const currentGradient = gradients[index % gradients.length];

    // Hitung kesulitan untuk deskripsi
    const difficulties = test.questions.reduce((acc, q) => {
        acc[q.difficulty] = (acc[q.difficulty] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);

    return (
        <div 
            className="group h-64 w-full cursor-pointer perspective-1000"
            onClick={() => setIsFlipped(!isFlipped)}
        >
            <div className={`relative w-full h-full transition-all duration-700 transform-style-3d ${isFlipped ? 'rotate-y-180' : ''}`} style={{ transformStyle: 'preserve-3d', transition: 'transform 0.6s' }}>
                
                {/* --- SISI DEPAN (FRONT) --- */}
                <div 
                    className={`absolute w-full h-full rounded-2xl shadow-xl p-6 text-white bg-gradient-to-br ${currentGradient} backface-hidden flex flex-col justify-between`}
                    style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}
                >
                    <div className="absolute top-0 right-0 p-4 opacity-20">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-24 w-24" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M10.394 2.08a1 1 0 00-.788 0l-7 3a1 1 0 000 1.84L5.25 8.051a.999.999 0 01.356-.257l4-1.714a1 1 0 11.788 1.838L7.667 9.088l1.94.831a1 1 0 00.787 0l7-3a1 1 0 000-1.838l-7-3zM3.31 9.397L5 10.12v4.102a8.969 8.969 0 00-1.05-.174 1 1 0 01-.89-.89 11.115 11.115 0 01.25-3.762zM9.3 16.573A9.026 9.026 0 007 14.935v-3.957l1.818.78a3 3 0 002.364 0l5.508-2.361a11.026 11.026 0 01.25 3.762 1 1 0 01-.89.89 8.968 8.968 0 00-5.35 2.524 1 1 0 01-1.4 0zM6 18a1 1 0 001-1v-2.065a8.935 8.935 0 00-2-.712V17a1 1 0 001 1z" />
                        </svg>
                    </div>
                    
                    <div className="relative z-10">
                        <div className="bg-white/20 w-fit px-3 py-1 rounded-full mb-4 backdrop-blur-md">
                            <p className="text-xs font-mono font-bold tracking-widest uppercase">{token}</p>
                        </div>
                        <h3 className="text-2xl font-extrabold leading-tight mb-1 line-clamp-2">{test.details.subject}</h3>
                        <p className="text-white/80 text-sm">{test.details.name}</p>
                    </div>

                    <div className="relative z-10 flex items-center space-x-2 mt-4">
                        <span className="text-xs font-semibold bg-black/20 px-2 py-1 rounded flex items-center">
                            <svg className="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            {test.details.duration}
                        </span>
                        <span className="text-xs font-semibold bg-black/20 px-2 py-1 rounded flex items-center">
                            <svg className="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                            {test.questions.length} Soal
                        </span>
                    </div>
                    
                    <div className="absolute bottom-4 right-4 animate-pulse">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white/70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                        </svg>
                    </div>
                </div>

                {/* --- SISI BELAKANG (BACK) --- */}
                <div 
                    className="absolute w-full h-full rounded-2xl shadow-xl p-6 bg-white border border-gray-200 backface-hidden rotate-y-180 flex flex-col justify-between"
                    style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
                >
                    <div>
                        <h4 className="text-gray-800 font-bold text-lg mb-2 border-b pb-2">Deskripsi Soal</h4>
                        <div className="space-y-2 text-sm text-gray-600">
                            <div className="flex justify-between">
                                <span>Mudah:</span>
                                <span className="font-bold text-green-600">{difficulties['Easy'] || 0}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>Sedang:</span>
                                <span className="font-bold text-yellow-600">{difficulties['Medium'] || 0}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>Sulit:</span>
                                <span className="font-bold text-red-600">{difficulties['Hard'] || 0}</span>
                            </div>
                            <div className="pt-2 mt-2 border-t border-dashed">
                                <p className="text-xs text-gray-500">
                                    Ditampilkan ke siswa: <strong>{test.details.questionsToDisplay || 'Semua'}</strong> soal (Acak).
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="flex space-x-2 mt-4">
                        <button 
                            onClick={(e) => { e.stopPropagation(); onNavigate(AdminView.QUESTION_BANK, token); }} 
                            className="flex-1 text-sm bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-3 rounded-lg transition shadow-md"
                        >
                            Lihat Soal
                        </button>
                        <button 
                            onClick={(e) => { e.stopPropagation(); onNavigate(AdminView.REKAPITULASI_NILAI, token); }} 
                            className="flex-1 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-2 px-3 rounded-lg transition border border-gray-300"
                        >
                            Nilai
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

interface DashboardHomeProps {
    adminUser: User;
    config: AppConfig;
    studentUsers: User[];
    tests: Map<string, Test>;
    questionCount: number;
    onNavigate: (view: AdminView, token?: string) => void;
    activeSessionCount: number;
    examSessions: any[];
    onSyncUsers: () => Promise<void>;
    isSyncing: boolean;
    totalDatabaseRecords: number; // New Prop for Raw Count
}

const DashboardHome: React.FC<DashboardHomeProps> = ({ adminUser, config, studentUsers, tests, questionCount, onNavigate, activeSessionCount, examSessions, onSyncUsers, isSyncing, totalDatabaseRecords }) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [isRepairing, setIsRepairing] = useState(false);
    
    // Pagination State for Test Cards
    const [testPage, setTestPage] = useState(1);
    const ITEMS_PER_PAGE = 3; // Menampilkan 3 kartu (1 baris) agar compact dan grafik di bawah terlihat

    const testsList = useMemo(() => Array.from(tests.entries()), [tests]);
    const totalPages = Math.ceil(testsList.length / ITEMS_PER_PAGE);
    
    const displayedTests = useMemo(() => {
        const startIndex = (testPage - 1) * ITEMS_PER_PAGE;
        return testsList.slice(startIndex, startIndex + ITEMS_PER_PAGE);
    }, [testsList, testPage]);

    const handlePrevPage = () => setTestPage(p => Math.max(1, p - 1));
    const handleNextPage = () => setTestPage(p => Math.min(totalPages, p + 1));

    const studentDistribution = useMemo(() => {
        const distribution = new Map<string, number>();
        studentUsers.forEach(user => {
            const major = user.major || 'Lainnya';
            distribution.set(major, (distribution.get(major) || 0) + 1);
        });
        return Array.from(distribution.entries()).map(([label, value]) => ({ label, value }));
    }, [studentUsers]);

    const hasExamData = useMemo(() => examSessions && examSessions.length > 0, [examSessions]);

    // REAL DATA: Calculate performance based on actual completed sessions
    const performanceData = useMemo(() => {
        const completedSessions = examSessions?.filter(s => s.status === 'Selesai' && s.score != null) || [];
        if (completedSessions.length === 0) return [];
        
        let passedCount = 0;
        completedSessions.forEach(session => {
            if (session.score >= 75) { // Assuming 75 is the passing grade
                passedCount++;
            }
        });
        
        const failedCount = completedSessions.length - passedCount;
        return [
            { name: 'Lulus', value: passedCount, color: '#10B981' },
            { name: 'Tidak Lulus', value: failedCount, color: '#EF4444' },
        ];
    }, [examSessions]);

    // REAL DATA: Calculate exam completion stats
    const completionData = useMemo(() => {
        if (!examSessions || examSessions.length === 0) {
            return { completed: 0, total: 0 };
        }
        const completedCount = examSessions.filter(s => s.status === 'Selesai' || s.status === 'Diskualifikasi').length;
        const participantIds = new Set(examSessions.map(s => s.user_id));
        return { completed: completedCount, total: participantIds.size };
    }, [examSessions]);

    
    return (
        <div className="space-y-8 animate-fade-in">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-white rounded-2xl shadow-lg p-6 flex items-center space-x-6">
                    <img src={adminUser.photoUrl} alt="Admin" className="w-20 h-20 rounded-full object-cover border-4 border-slate-200" />
                    <div>
                        <h2 className="text-2xl font-bold text-gray-800">Selamat Datang, {adminUser.fullName}!</h2>
                        <p className="text-gray-500 mt-1">Ini adalah ringkasan aktivitas sekolah Anda hari ini.</p>
                    </div>
                </div>
                <div 
                    onClick={() => onNavigate(AdminView.CETAK_ADMIN_CARD)}
                    className="lg:col-span-1 bg-slate-800 rounded-2xl shadow-xl p-6 text-white flex items-center space-x-6 transform hover:scale-105 transition-transform duration-300 cursor-pointer group"
                >
                    <div className="bg-white/10 p-4 rounded-xl border border-white/20 group-hover:bg-white/20 transition-colors">
                         <img 
                            src={`https://api.qrserver.com/v1/create-qr-code/?size=40x40&data=${encodeURIComponent(`cbtauth::admin::${adminUser.username}::${adminUser.id}`)}&bgcolor=FFFFFF`}
                            alt="QR Code Admin Login" 
                            className="w-10 h-10 rounded-md"
                        />
                    </div>
                    <div>
                        <h4 className="font-bold text-lg">Cetak Kartu ID Admin</h4>
                        <p className="text-sm text-slate-300">Gunakan untuk login cepat via QR.</p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {/* Updated to use totalDatabaseRecords (raw users + admin) */}
                <StatCard title="Total Data User" value={totalDatabaseRecords || studentUsers.length} gradient="bg-gradient-to-br from-blue-500 to-cyan-400" icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M15 21a6 6 0 00-9-5.197M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>} />
                <StatCard title="Total Ujian" value={tests.size} gradient="bg-gradient-to-br from-green-500 to-emerald-400" icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>} />
                <StatCard title="Total Soal" value={questionCount} gradient="bg-gradient-to-br from-orange-500 to-amber-400" icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7l8 5 8-5M12 22V12" /></svg>} />
                <StatCard title="Sesi Aktif" value={activeSessionCount} gradient="bg-gradient-to-br from-pink-500 to-rose-400" icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.636 18.364a9 9 0 010-12.728m12.728 0a9 9 0 010 12.728m-9.9-2.829a1.5 1.5 0 100-2.122 1.5 1.5 0 000 2.122z" /></svg>} />
            </div>

             <div className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-yellow-500">
                <div className="flex items-start space-x-4">
                    <div className="flex-shrink-0 text-yellow-500 mt-1">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-gray-800">Sinkronisasi Data Siswa</h3>
                        <p className="text-sm text-gray-600 mt-1 mb-4">
                           Gunakan tombol ini setelah Anda memperbarui data di Google Sheet. Ini akan menyamakan data siswa (menambah, memperbarui, & menghapus) di aplikasi agar sesuai dengan sheet terbaru.
                        </p>
                        <div className="flex flex-wrap gap-2">
                            <button onClick={onSyncUsers} disabled={isSyncing} className="bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-2 px-4 rounded-lg flex items-center justify-center space-x-2 disabled:bg-yellow-300">
                                {isSyncing ? (
                                <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                ) : (
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.898 2.186A1 1 0 0116 8.39V7a1 1 0 012 0v2a1 1 0 01-1 1h-2a1 1 0 010-2h1.101A5.002 5.002 0 005.101 7H4a1 1 0 01-2 0V3a1 1 0 011-1zm14 14a1 1 0 01-1-1v-2.101a7.002 7.002 0 00-11.898-2.186A1 1 0 004 11.61V13a1 1 0 00-2 0v-2a1 1 0 001-1h2a1 1 0 000 2h-1.101A5.002 5.002 0 0114.899 13H16a1 1 0 002 0v2a1 1 0 00-1 1z" clipRule="evenodd" /></svg>
                                )}
                                <span>{isSyncing ? 'Menyinkronkan...' : 'Sinkronkan Ulang Data'}</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Test Subjects Section with Pagination */}
            <div>
                <div className="flex justify-between items-center mb-4">
                    <div className="flex items-center space-x-4">
                        <h2 className="text-2xl font-bold text-gray-800">Mata Pelajaran Ujian</h2>
                        <button 
                            onClick={() => onNavigate(AdminView.QUESTION_BANK)}
                            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-1.5 px-4 rounded-lg shadow-sm text-sm flex items-center space-x-1"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                            <span>Tambah Mapel</span>
                        </button>
                    </div>
                    
                    {totalPages > 1 && (
                        <div className="flex items-center space-x-2 bg-white rounded-lg p-1 border border-slate-200">
                            <button 
                                onClick={handlePrevPage} 
                                disabled={testPage === 1}
                                className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                            </button>
                            <span className="text-xs font-bold text-gray-600 px-2">
                                {testPage} / {totalPages}
                            </span>
                            <button 
                                onClick={handleNextPage} 
                                disabled={testPage === totalPages}
                                className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                            </button>
                        </div>
                    )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {displayedTests.map(([token, test], index) => (
                        <TestSubjectCard key={token} test={test} token={token} index={index} onNavigate={onNavigate} />
                    ))}
                    
                    {testsList.length === 0 && (
                        <div 
                            onClick={() => onNavigate(AdminView.QUESTION_BANK)}
                            className="relative bg-white border-2 border-dashed border-gray-300 rounded-2xl p-6 text-gray-500 hover:text-blue-600 hover:border-blue-500 flex flex-col items-center justify-center cursor-pointer transition-all duration-300 ease-in-out h-64 group"
                        >
                            <div className="w-16 h-16 bg-gray-100 group-hover:bg-blue-50 rounded-full flex items-center justify-center mb-4 transition-colors">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                            </div>
                            <h2 className="text-lg font-bold">Belum Ada Mapel</h2>
                            <p className="text-sm text-center">Klik untuk membuat bank soal baru</p>
                        </div>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
                <div className="lg:col-span-3 bg-white p-6 rounded-xl shadow-md">
                    <h2 className="text-xl font-bold text-gray-800 mb-4">Distribusi Siswa per Jurusan</h2>
                    <BarChart data={studentDistribution} />
                </div>
                
                <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-8">
                    {hasExamData ? (
                        <>
                            <div className="bg-white p-6 rounded-xl shadow-md">
                                <h2 className="text-xl font-bold text-gray-800 mb-4">Kinerja Kelulusan</h2>
                                <PerformanceDonutChart data={performanceData} total={completionData.completed} />
                            </div>
                            <div className="bg-white p-6 rounded-xl shadow-md">
                                <h2 className="text-xl font-bold text-gray-800 mb-4">Penyelesaian Ujian</h2>
                                <OverallCompletionChart completed={completionData.completed} total={completionData.total} />
                            </div>
                        </>
                    ) : (
                        <div className="sm:col-span-2 lg:col-span-1 bg-white p-6 rounded-xl shadow-md flex flex-col items-center justify-center text-center">
                            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V7a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                            </div>
                            <h3 className="font-bold text-gray-700">Data Ujian Belum Tersedia</h3>
                            <p className="text-sm text-gray-500 mt-1">Grafik akan muncul di sini setelah siswa mulai mengerjakan ujian.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default DashboardHome;
