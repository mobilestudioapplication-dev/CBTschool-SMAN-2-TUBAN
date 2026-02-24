

import React, { useState, useMemo, useEffect } from 'react';
import { Test, User, AppConfig, Answer, Schedule } from '../types';
import { supabase } from '../supabaseClient';
import { calculateScore } from '../utils/scoring';

interface GradeRecapProps {
  tests: Map<string, Test>;
  users: User[];
  examSessions: any[];
  schedules: Schedule[];
  preselectedToken?: string;
  config: AppConfig;
  onRefresh?: () => void;
}

const SmallDonutChart: React.FC<{ percentage: number; color: string; }> = ({ percentage, color }) => {
    const size = 60;
    const strokeWidth = 8;
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (percentage / 100) * circumference;

    return (
        <div className="relative" style={{ width: size, height: size }}>
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
                <circle cx={size/2} cy={size/2} r={radius} fill="transparent" stroke="#e5e7eb" strokeWidth={strokeWidth} />
                <circle
                    cx={size / 2} cy={size / 2} r={radius} fill="transparent"
                    stroke={color} strokeWidth={strokeWidth} strokeDasharray={circumference}
                    strokeDashoffset={offset} strokeLinecap="round"
                    style={{ transition: 'stroke-dashoffset 0.5s ease-out' }}
                />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-xs font-bold text-gray-700">{percentage.toFixed(0)}%</span>
            </div>
        </div>
    );
};

const GradeRecap: React.FC<GradeRecapProps> = ({ tests, users, examSessions, schedules, preselectedToken, config, onRefresh }) => {
  const [view, setView] = useState<'main' | 'detail'>(preselectedToken ? 'detail' : 'main');
  const [selectedToken, setSelectedToken] = useState<string>(preselectedToken || '');
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [isRecalculating, setIsRecalculating] = useState<string | null>(null);
  
  // Map Schedule ID -> Test Token
  const scheduleMap = useMemo(() => {
    const map = new Map<string, string>();
    schedules.forEach(s => map.set(s.id, s.testToken));
    return map;
  }, [schedules]);

  useEffect(() => {
    if (preselectedToken) {
      setSelectedToken(preselectedToken);
      setView('detail');
    }
  }, [preselectedToken]);

  const testsArray = Array.from(tests.entries());
  const studentUsers = users.filter(u => u.username !== 'admin');
  const selectedTest = selectedToken ? tests.get(selectedToken) : null;
  
  const classList = useMemo(() => {
    const uniqueClasses = Array.from(new Set(studentUsers.map(u => u.class)));
    
    // FIX: Explicitly type `a` and `b` as strings to resolve 'unknown' type error.
    uniqueClasses.sort((a: string, b: string) => {
        const gradeOrder: { [key: string]: number } = { 'X': 1, 'XI': 2, 'XII': 3 };

        const partsA = a.split(' ');
        const partsB = b.split(' ');
        
        // 1. Sort by Grade
        const gradeAVal = gradeOrder[partsA[0]];
        const gradeBVal = gradeOrder[partsB[0]];
        if (gradeAVal && gradeBVal && gradeAVal !== gradeBVal) {
            return gradeAVal - gradeBVal;
        }
        
        // 2. Extract major and number
        const extractParts = (parts: string[]) => {
            if (parts.length < 2) return { major: parts.join(' '), num: null };
            const lastPart = parts[parts.length - 1];
            const num = parseInt(lastPart, 10);
            if (!isNaN(num) && parts.length > 1) { // has a number at the end
                return { major: parts.slice(1, -1).join(' '), num: num };
            } else { // no number at the end
                return { major: parts.slice(1).join(' '), num: null };
            }
        };
        
        const { major: majorA, num: numA } = extractParts(partsA);
        const { major: majorB, num: numB } = extractParts(partsB);

        // 3. Sort by Major
        const majorCompare = majorA.localeCompare(majorB);
        if (majorCompare !== 0) {
            return majorCompare;
        }

        // 4. Sort by Number
        if (numA !== null && numB !== null) {
            return numA - numB;
        }
        if (numA !== null) return -1; // Has number vs no number
        if (numB !== null) return 1;

        return a.localeCompare(b); // Fallback
    });
    
    return ['all', ...uniqueClasses];
  }, [studentUsers]);

  const recapStats = useMemo(() => {
      const stats = new Map<string, any>();
      tests.forEach((test, token) => {
          // Use scheduleMap to find sessions for this test token
          const relevantSessions = examSessions.filter(s => {
              const sessionToken = scheduleMap.get(s.schedule_id);
              
              // Robust Fallback: Check joined data if available
              // AdminDashboard now fetches `schedule:schedules(test_id)`
              const joinedSchedule = s.schedule || s.schedules; // Handle both naming conventions
              const joinedTestId = joinedSchedule?.test_id;
              
              const isMatch = sessionToken === token || (joinedTestId === test.details.id);
              
              // Include sessions that are finished OR have a score (even if status is weird)
              return isMatch && (s.score != null || s.status === 'Selesai');
          });

          // Calculate Total Assigned Students for Completion Rate
          const testSchedules = schedules.filter(s => s.testToken === token);
          let assignedClasses = new Set<string>();
          let isAllClasses = false;
          
          testSchedules.forEach(s => {
              if (s.assignedTo && (s.assignedTo.includes('Semua Kelas') || s.assignedTo.includes('all'))) {
                  isAllClasses = true;
              } else if (s.assignedTo && Array.isArray(s.assignedTo)) {
                  s.assignedTo.forEach(c => assignedClasses.add(c));
              }
          });

          // Fallback: If no classes assigned (or no schedule), infer from participants
          if (!isAllClasses && assignedClasses.size === 0 && relevantSessions.length > 0) {
              relevantSessions.forEach(s => {
                  const participant = studentUsers.find(u => u.id === s.user_id);
                  if (participant && participant.class) {
                      assignedClasses.add(participant.class);
                  }
              });
          }
          
          const totalAssigned = studentUsers.filter(u => {
              if (isAllClasses) return true;
              return assignedClasses.has(u.class);
          }).length;
          
          if (relevantSessions.length > 0) {
              const scores = relevantSessions.map(s => s.score || 0); // Treat null as 0 for stats
              const sum = scores.reduce((a, b) => a + b, 0);
              const passingCount = scores.filter(s => s >= 75).length;
              
              // Completion Rate: Finished / Total Assigned
              // Cap at 100% in case of data anomalies
              const completionRate = totalAssigned > 0 ? Math.min(100, (scores.length / totalAssigned) * 100) : 0;

              stats.set(token, {
                  participants: scores.length,
                  avg: (sum / scores.length).toFixed(2),
                  max: Math.max(...scores),
                  min: Math.min(...scores),
                  passingRate: (passingCount / scores.length) * 100,
                  completionRate: completionRate
              });
          } else {
              stats.set(token, { participants: 0, avg: 0, max: 0, min: 0, passingRate: 0, completionRate: 0 });
          }
      });
      return stats;
  }, [tests, examSessions, scheduleMap, schedules, studentUsers]);

  const detailedStudentScores = useMemo(() => {
    if (!selectedToken || !selectedTest) return [];
    
    // Use scheduleMap to filter sessions for selected token
    const sessionMap = new Map<string, any>();
    examSessions.forEach(session => {
        const sessionToken = scheduleMap.get(session.schedule_id);
        const joinedSchedule = session.schedule || session.schedules;
        const joinedTestId = joinedSchedule?.test_id;
        
        if (sessionToken === selectedToken || joinedTestId === selectedTest.details.id) {
            sessionMap.set(session.user_id, session);
        }
    });

    return studentUsers.map(user => {
        const session = sessionMap.get(user.id);
        const hasTaken = !!session;
        const score = session?.score;
        const status = session?.status;
        
        let displayStatus = 'Belum Mengerjakan';
        if (hasTaken) {
            if (score !== null && score !== undefined) {
                displayStatus = score >= 75 ? 'Lulus' : 'Tidak Lulus';
            } else if (status === 'Selesai') {
                displayStatus = 'Belum Dinilai';
            } else {
                displayStatus = status || 'Mengerjakan';
            }
        }

        return {
            ...user,
            score: score,
            examStatus: status,
            sessionId: session?.id,
            status: displayStatus
        };
    });
  }, [selectedToken, selectedTest, studentUsers, examSessions, scheduleMap]);

  const filteredScores = useMemo(() => {
      if (selectedClass === 'all') return detailedStudentScores;
      return detailedStudentScores.filter(s => s.class === selectedClass);
  }, [detailedStudentScores, selectedClass]);

  const filteredStats = useMemo(() => {
    const scoresWithValues = filteredScores.map(s => s.score).filter(s => s !== null && s !== undefined) as number[];
    if (scoresWithValues.length === 0) return { avg: 0, max: 0, min: 0, passingRate: 0 };
    
    const sum = scoresWithValues.reduce((a, b) => a + b, 0);
    const passingCount = scoresWithValues.filter(s => s >= 75).length;
    return {
      avg: (sum / scoresWithValues.length).toFixed(2),
      max: Math.max(...scoresWithValues),
      min: Math.min(...scoresWithValues),
      passingRate: (passingCount / scoresWithValues.length) * 100
    };
  }, [filteredScores]);

  const handleRecalculate = async (sessionId: string) => {
      if (!selectedTest) return;
      setIsRecalculating(sessionId);
      try {
          // 1. Fetch Answers
          const { data: dbAnswers, error: ansError } = await supabase
              .from('student_answers')
              .select('*')
              .eq('session_id', sessionId);
          
          if (ansError) throw ansError;

          // 2. Convert to Record<number, Answer>
          const answers: Record<number, Answer> = {};
          dbAnswers?.forEach(a => {
              // Prefer JSONB column (student_answer) for type safety
              // Fallback to answer_value (TEXT) only if JSONB is missing
              let val = a.student_answer?.value;
              
              if (val === undefined || val === null) {
                  val = a.answer_value;
                  // Try to parse if it looks like JSON array/object
                  if (typeof val === 'string' && (val.startsWith('[') || val.startsWith('{'))) {
                      try { val = JSON.parse(val); } catch (e) {}
                  }
              }
              
              answers[a.question_id] = { value: val, unsure: a.is_unsure };
          });

          // 3. Calculate Score
          const finalScore = calculateScore(selectedTest.questions, answers);

          // 4. Update Session
          const { error: updateError } = await supabase
              .from('student_exam_sessions')
              .update({ score: finalScore, status: 'Selesai' }) // Ensure status is Selesai
              .eq('id', sessionId);

          if (updateError) throw updateError;

          // 5. Refresh Data
          if (onRefresh) onRefresh();
          alert(`Nilai berhasil dihitung ulang: ${finalScore}`);

      } catch (err: any) {
          console.error("Recalculate error:", err);
          alert("Gagal menghitung nilai: " + err.message);
      } finally {
          setIsRecalculating(null);
      }
  };

  const downloadExcel = () => {
    if (!selectedTest) return;

    // --- STYLES ---
    const styles = {
        table: `border-collapse: collapse; width: 100%; font-family: Arial, sans-serif;`,
        th: `background-color: #1e3a8a; color: #ffffff; border: 1px solid #000000; padding: 10px; text-align: center; font-weight: bold; vertical-align: middle;`,
        td: `border: 1px solid #000000; padding: 8px; text-align: left; vertical-align: middle;`,
        tdCenter: `border: 1px solid #000000; padding: 8px; text-align: center; vertical-align: middle;`,
        title: `font-size: 18px; font-weight: bold; text-align: center; padding: 10px; background-color: #f3f4f6; border: 1px solid #000000;`,
        meta: `font-size: 12px; text-align: left; padding: 5px; border: 1px solid #000000; background-color: #ffffff;`,
        statusPass: `background-color: #d1fae5; color: #065f46; font-weight: bold; text-align: center; border: 1px solid #000000;`,
        statusFail: `background-color: #fee2e2; color: #991b1b; font-weight: bold; text-align: center; border: 1px solid #000000;`,
        statusWarning: `background-color: #fef3c7; color: #92400e; font-weight: bold; text-align: center; border: 1px solid #000000;`,
        statusNeutral: `background-color: #e0f2fe; color: #075985; font-weight: bold; text-align: center; border: 1px solid #000000;`
    };

    // --- HEADER INFO ---
    const dateStr = new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const titleRow = `<tr><td colspan="6" style="${styles.title}">LAPORAN HASIL UJIAN BERBASIS KOMPUTER (CBT)</td></tr>`;
    const metaRows = `
        <tr><td colspan="2" style="${styles.meta}"><strong>Mata Pelajaran:</strong> ${selectedTest.details.subject}</td><td colspan="4" style="${styles.meta}"><strong>Tanggal Cetak:</strong> ${dateStr}</td></tr>
        <tr><td colspan="2" style="${styles.meta}"><strong>Kelas Filter:</strong> ${selectedClass === 'all' ? 'Semua Kelas' : selectedClass}</td><td colspan="4" style="${styles.meta}"><strong>Kode Ujian:</strong> ${selectedToken}</td></tr>
        <tr><td colspan="6" style="height: 10px; border-left: 1px solid #000000; border-right: 1px solid #000000;"></td></tr>
    `;

    // --- TABLE HEADER ---
    const headers = ['NISN', 'Nama Lengkap', 'Kelas', 'Jurusan', 'Nilai Akhir', 'Status Kelulusan'];
    const headerRow = `<tr>${headers.map(h => `<th style="${styles.th}">${h}</th>`).join('')}</tr>`;

    // --- DATA ROWS ---
    const dataRows = filteredScores.map((row, index) => {
        const isEven = index % 2 === 0;
        const bgStyle = isEven ? 'background-color: #ffffff;' : 'background-color: #f9fafb;';
        const baseTd = styles.td + bgStyle;
        const centerTd = styles.tdCenter + bgStyle;

        // Status Logic
        let statusStyle = styles.statusNeutral;
        let statusText = row.status;
        
        if (row.status === 'Selesai') {
            if ((row.score ?? 0) >= 75) {
                statusStyle = styles.statusPass;
                statusText = 'LULUS';
            } else {
                statusStyle = styles.statusFail; // Or Warning
                statusText = 'TIDAK LULUS';
            }
        } else if (row.status === 'Diskualifikasi') {
            statusStyle = styles.statusFail;
            statusText = 'DISKUALIFIKASI';
        } else if (row.status === 'Mengerjakan') {
            statusStyle = styles.statusWarning;
            statusText = 'SEDANG MENGERJAKAN';
        }

        return `
            <tr>
                <td style="${baseTd} mso-number-format:'@'">${row.nisn}</td>
                <td style="${baseTd}">${row.fullName}</td>
                <td style="${centerTd}">${row.class}</td>
                <td style="${centerTd}">${row.major}</td>
                <td style="${centerTd} font-weight: bold;">${row.score ?? '-'}</td>
                <td style="${statusStyle}">${statusText}</td>
            </tr>
        `;
    }).join('');

    // --- FOOTER (Signature Placeholder) ---
    const footerRows = `
        <tr><td colspan="6" style="height: 20px; border-top: 1px solid #000000;"></td></tr>
        <tr>
            <td colspan="4"></td>
            <td colspan="2" style="text-align: center; font-family: Arial, sans-serif;">
                <br/>
                Mengetahui,<br/>
                Guru Mata Pelajaran<br/>
                <br/><br/><br/><br/>
                __________________________
            </td>
        </tr>
    `;

    const table = `<table style="${styles.table}">${titleRow}${metaRows}${headerRow}<tbody>${dataRows}</tbody>${footerRows}</table>`;
    
    // Add meta charset to ensure special characters render correctly
    const excelFile = `
        <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
        <head>
            <meta http-equiv="content-type" content="application/vnd.ms-excel; charset=UTF-8">
            <!--[if gte mso 9]>
            <xml>
            <x:ExcelWorkbook>
                <x:ExcelWorksheets>
                    <x:ExcelWorksheet>
                        <x:Name>Rekap Nilai ${selectedToken}</x:Name>
                        <x:WorksheetOptions>
                            <x:DisplayGridlines/>
                        </x:WorksheetOptions>
                    </x:ExcelWorksheet>
                </x:ExcelWorksheets>
            </x:ExcelWorkbook>
            </xml>
            <![endif]-->
        </head>
        <body>
            ${table}
        </body>
        </html>
    `;
    
    const blob = new Blob([excelFile], { type: 'application/vnd.ms-excel' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Laporan_Nilai_${selectedTest.details.subject.replace(/\s+/g, '_')}_${selectedClass}.xls`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadPDF = () => setTimeout(() => window.print(), 50);
  
  const handleSelectTest = (token: string) => {
      setSelectedToken(token);
      setView('detail');
  }

  const MainView = () => (
    <div className="animate-fade-in">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
            <div>
                <h1 className="text-3xl font-black text-slate-800 tracking-tight">Rekapitulasi Nilai</h1>
                <p className="text-slate-500 font-medium">Ringkasan hasil ujian seluruh mata pelajaran.</p>
            </div>
            <div className="flex items-center space-x-2 bg-blue-50 px-4 py-2 rounded-full border border-blue-100 shadow-sm self-start md:self-center">
                <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
                </span>
                <span className="text-xs font-black text-blue-700 uppercase tracking-wider">Live Updates Active</span>
                {onRefresh && (
                    <button 
                        onClick={onRefresh} 
                        className="ml-2 p-1 hover:bg-blue-200 rounded-full transition-colors"
                        title="Refresh Data"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-blue-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                    </button>
                )}
            </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
            {testsArray.map(([token, test]) => {
                const stats = recapStats.get(token);
                if (!stats) return null;
                return (
                    <div key={token} className="group bg-white rounded-2xl shadow-lg border border-slate-100 p-6 flex flex-col transform hover:-translate-y-2 transition-all duration-300 hover:shadow-2xl">
                        <div className="flex items-start justify-between mb-6">
                            <div className="min-w-0">
                                <div className="flex items-center space-x-2 mb-1">
                                    <span className="bg-slate-100 text-slate-600 text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest">{token}</span>
                                    <span className="bg-blue-100 text-blue-700 text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest">{test.details.examType}</span>
                                </div>
                                <h2 className="text-xl font-black text-slate-800 truncate leading-tight group-hover:text-blue-600 transition-colors" title={test.details.subject}>{test.details.subject}</h2>
                                <p className="text-sm text-slate-400 font-bold mt-1">{stats.participants} Peserta Selesai</p>
                            </div>
                            <div className="flex-shrink-0 ml-4 flex flex-col items-center">
                                <SmallDonutChart percentage={stats.completionRate} color={stats.completionRate >= 100 ? '#10B981' : '#3B82F6'} />
                                <span className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-wider">Selesai</span>
                            </div>
                        </div>
                        
                        <div className="grid grid-cols-3 gap-2 text-center mb-8 bg-slate-50/50 rounded-xl p-4 border border-slate-100">
                            <div className="border-r border-slate-200">
                                <p className="text-[10px] text-slate-400 font-black uppercase tracking-wider mb-1">Rata-rata</p>
                                <p className="text-lg font-black text-slate-700">{stats.avg}</p>
                            </div>
                            <div className="border-r border-slate-200">
                                <p className="text-[10px] text-slate-400 font-black uppercase tracking-wider mb-1">Tertinggi</p>
                                <p className="text-lg font-black text-emerald-600">{stats.max}</p>
                            </div>
                            <div>
                                <p className="text-[10px] text-slate-400 font-black uppercase tracking-wider mb-1">Terendah</p>
                                <p className="text-lg font-black text-rose-500">{stats.min}</p>
                            </div>
                        </div>

                        <button 
                            onClick={() => handleSelectTest(token)} 
                            className="mt-auto w-full bg-slate-900 hover:bg-blue-600 text-white font-black py-3 px-4 rounded-xl transition-all duration-300 flex items-center justify-center space-x-2 group/btn shadow-md hover:shadow-blue-200"
                        >
                            <span className="text-sm uppercase tracking-widest">Detail Rinci</span>
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 transform group-hover/btn:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                        </button>
                    </div>
                )
            })}
            {testsArray.length === 0 && (
                <div className="md:col-span-2 xl:col-span-3 text-center py-20 bg-white rounded-2xl border-2 border-dashed border-slate-200">
                    <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                    </div>
                    <p className="text-slate-500 font-bold text-lg">Belum ada paket soal yang tersedia.</p>
                </div>
            )}
        </div>
    </div>
  );

  const DetailView = () => (
    <div id="print-area">
      <div className="print-only mb-8">
        <div className="flex items-center space-x-4 mb-4"><img src={config.logoUrl} alt="Logo" className="h-16 w-16 object-contain" /><div><h1 className="text-2xl font-bold">{config.schoolName}</h1><p className="text-lg">Laporan Hasil Ujian</p></div></div><hr className="my-2 border-gray-400" />
      </div>
      <div className="flex items-center mb-6 no-print">
        <button onClick={() => setView('main')} className="text-blue-600 hover:bg-blue-50 rounded-full p-2 mr-2"><svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg></button>
        <h1 className="text-3xl font-bold text-gray-800">Rekapitulasi Nilai</h1>
      </div>
      <div className="bg-white rounded-xl shadow-xl p-6 mb-8 no-print">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-1"><label className="block text-sm font-medium text-gray-700 mb-1">Filter Kelas:</label><select value={selectedClass} onChange={e => setSelectedClass(e.target.value)} className="w-full p-2 border border-gray-300 rounded-md" disabled={!selectedTest}>{classList.map(c => <option key={c} value={c}>{c === 'all' ? 'Semua Kelas' : c}</option>)}</select></div>
            <div className="md:col-span-2 flex items-end space-x-2"><button onClick={downloadPDF} disabled={!selectedTest || filteredScores.length === 0} className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg shadow-md disabled:bg-gray-400 flex items-center justify-center space-x-2"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" /></svg><span>Download PDF</span></button><button onClick={downloadExcel} disabled={!selectedTest || filteredScores.length === 0} className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg shadow-md disabled:bg-gray-400 flex items-center justify-center space-x-2"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M2 5a2 2 0 012-2h12a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V5zm2 1v2h12V6H4zm0 4v2h12v-2H4zm0 4v2h12v-2H4z" /></svg><span>Download Excel</span></button></div>
        </div>
      </div>
      {selectedTest && (
          <>
            <div className="mb-4"><h2 className="text-2xl font-bold text-gray-800">Laporan Hasil: {selectedTest.details.subject}</h2><p className="text-gray-500">Kelas: {selectedClass === 'all' ? 'Semua Kelas' : selectedClass}</p></div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 text-center">
                    <p className="text-xs text-slate-400 font-black uppercase tracking-widest mb-2">Rata-rata</p>
                    <p className="text-3xl font-black text-slate-800">{filteredStats.avg}</p>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 text-center">
                    <p className="text-xs text-slate-400 font-black uppercase tracking-widest mb-2">Tertinggi</p>
                    <p className="text-3xl font-black text-emerald-600">{filteredStats.max}</p>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 text-center">
                    <p className="text-xs text-slate-400 font-black uppercase tracking-widest mb-2">Terendah</p>
                    <p className="text-3xl font-black text-rose-500">{filteredStats.min}</p>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 text-center">
                    <p className="text-xs text-slate-400 font-black uppercase tracking-widest mb-2">Tingkat Lulus</p>
                    <p className="text-3xl font-black text-blue-600">{filteredStats.passingRate.toFixed(1)}%</p>
                </div>
            </div>
            <div className="bg-white rounded-xl shadow-xl overflow-hidden"><div className="p-4 bg-gray-50/50 border-b"><h3 className="font-bold text-lg text-gray-700">Pratinjau Laporan Siswa</h3></div><div className="overflow-x-auto"><table className="min-w-full divide-y divide-gray-200"><thead className="bg-slate-800"><tr><th className="px-6 py-4 text-left text-xs font-bold text-white uppercase tracking-wider">Nama</th><th className="px-6 py-4 text-left text-xs font-bold text-white uppercase tracking-wider">NISN</th><th className="px-6 py-4 text-left text-xs font-bold text-white uppercase tracking-wider">Kelas</th><th className="px-6 py-4 text-center text-xs font-bold text-white uppercase tracking-wider">Nilai</th><th className="px-6 py-4 text-center text-xs font-bold text-white uppercase tracking-wider">Status</th></tr></thead><tbody className="bg-white divide-y divide-gray-200">{filteredScores.map(user => (
                <tr key={user.id} className="even:bg-gray-50/50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{user.fullName}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{user.nisn}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{user.class}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-center font-bold text-gray-800">
                        {user.score ?? (
                            user.status === 'Belum Dinilai' && user.sessionId ? (
                                <button 
                                    onClick={() => handleRecalculate(user.sessionId)} 
                                    disabled={isRecalculating === user.sessionId}
                                    className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded hover:bg-blue-200 disabled:opacity-50"
                                >
                                    {isRecalculating === user.sessionId ? '...' : 'Hitung'}
                                </button>
                            ) : '-'
                        )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                        <span className={`px-2.5 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${user.status === 'Lulus' ? 'bg-green-100 text-green-800' : user.status === 'Tidak Lulus' ? 'bg-red-100 text-red-800' : user.status === 'Belum Dinilai' ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-800'}`}>
                            {user.status}
                        </span>
                    </td>
                </tr>
            ))}{filteredScores.length === 0 && (<tr><td colSpan={5} className="text-center py-10 text-gray-500">Tidak ada data untuk kelas yang dipilih.</td></tr>)}</tbody></table></div></div>
          </>
      )}
    </div>
  );

  return <div className="animate-fade-in">{view === 'main' ? <MainView /> : <DetailView />}</div>;
};

export default GradeRecap;