
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Test, Question, QuestionDifficulty, TestDetails } from '../types';
import QuestionModal from './QuestionModal';
import ConfirmationModal from './ConfirmationModal';
import TestModal from './TestModal';
import TestPreviewModal from './TestPreviewModal'; 
import { SoalRow } from './Soal';
import BulkQuestionImportModal from './BulkQuestionImportModal'; 
import TxtQuestionImportModal from './TxtQuestionImportModal'; 
import WordQuestionImportModal from './WordQuestionImportModal'; 
import { EXAM_EVENT_TYPES } from '../constants';

interface QuestionBankProps {
  tests: Map<string, Test>;
  onAddQuestion: (token: string, question: Omit<Question, 'id'>) => Promise<boolean>;
  onUpdateQuestion: (token: string, question: Question) => void;
  onDeleteQuestion: (token: string, questionId: number) => void;
  onAddTest: (details: Omit<TestDetails, 'id' | 'time'>, token: string, questions: Omit<Question, 'id'>[]) => Promise<boolean>;
  onUpdateTest: (updatedTest: Test, originalToken: string) => Promise<void>;
  onDeleteTest: (token: string) => void;
  onBulkAddQuestions: (token: string, questions: Omit<Question, 'id'>[]) => void;
  onImportError: (message: string) => void;
  preselectedToken?: string;
  onRefresh: () => void; 
  onFetchQuestions?: (token: string) => Promise<void>; // New prop
  isFetchingQuestions?: boolean; // New prop
}

const DifficultyBadge: React.FC<{ difficulty: QuestionDifficulty }> = ({ difficulty }) => {
  const styles = { Easy: 'bg-green-100 text-green-800', Medium: 'bg-yellow-100 text-yellow-800', Hard: 'bg-red-100 text-red-800' };
  return <span className={`px-2 py-1 text-xs font-semibold rounded-full ${styles[difficulty]}`}>{difficulty}</span>;
};

const getSubjectVisuals = (subject: string) => {
  const lowerSubject = subject.toLowerCase();
  if (lowerSubject.includes('matematika')) return { icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-white/80" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>, gradient: 'from-fuchsia-500 to-purple-600' };
  if (lowerSubject.includes('bahasa')) return { icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-white/80" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v11.494m-9-5.747h18" /></svg>, gradient: 'from-sky-500 to-indigo-500' };
  return { icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-white/80" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>, gradient: 'from-emerald-500 to-teal-600' };
};

const ActionCard: React.FC<{title: string, description: string, icon: React.ReactNode, onClick: () => void, gradient?: string, footer?: React.ReactNode, textColor?: string}> = ({ title, description, icon, onClick, gradient, footer, textColor }) => (
    <div onClick={onClick} className={`relative p-5 rounded-xl shadow-lg cursor-pointer transform hover:-translate-y-1 transition-transform duration-300 group flex flex-col h-full ${gradient ? `${textColor || 'text-white'} ${gradient}` : 'bg-white text-gray-800 hover:bg-gray-50'}`}>
        <div className="flex-grow">
            <div className="flex items-start justify-between">
                <div className={`p-3 rounded-lg ${gradient ? 'bg-white/20' : 'bg-blue-100'}`}>{icon}</div>
                <svg xmlns="http://www.w3.org/2000/svg" className={`h-6 w-6 transition-transform duration-300 group-hover:translate-x-1 ${gradient && !textColor ? 'text-white/70' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4-4m4-4H3" /></svg>
            </div>
            <h3 className="text-lg font-bold mt-4">{title}</h3>
            <p className={`text-sm mt-1 ${gradient && !textColor ? 'opacity-90' : (textColor ? 'opacity-90' : 'text-gray-500')}`}>{description}</p>
        </div>
        {footer && <div className="mt-4 pt-3 border-t border-gray-200/20 text-sm">{footer}</div>}
    </div>
);


const QuestionBank: React.FC<QuestionBankProps> = ({ tests, onAddQuestion, onUpdateQuestion, onDeleteQuestion, onAddTest, onUpdateTest, onDeleteTest, onBulkAddQuestions, onImportError, preselectedToken, onRefresh, onFetchQuestions, isFetchingQuestions }) => {
  const [view, setView] = useState<'main' | 'detail'>('main');
  const [selectedToken, setSelectedToken] = useState<string>(preselectedToken || '');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isTxtImportModalOpen, setIsTxtImportModalOpen] = useState(false); 
  const [isWordImportModalOpen, setIsWordImportModalOpen] = useState(false);

  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [deletingQuestion, setDeletingQuestion] = useState<Question | null>(null);
  const [testToDelete, setTestToDelete] = useState<{ token: string; name: string } | null>(null);
  const [testToEdit, setTestToEdit] = useState<{ token: string; test: Test } | null>(null);
  const [previewTest, setPreviewTest] = useState<Test | null>(null);

  // Filters for detail view (Questions)
  const [searchTerm, setSearchTerm] = useState('');
  const [difficultyFilter, setDifficultyFilter] = useState<QuestionDifficulty | 'all'>('all');

  // Filters for Main View (Tests)
  const [testSearchTerm, setTestSearchTerm] = useState('');
  const [testSortOrder, setTestSortOrder] = useState<'default' | 'az' | 'za'>('default');
  const [filterExamType, setFilterExamType] = useState<string>('all'); 

  useEffect(() => {
    if (preselectedToken) {
      setSelectedToken(preselectedToken);
      setView('detail');
    }
  }, [preselectedToken]);

  const testsArray = Array.from(tests.entries());
  const selectedTest = selectedToken ? tests.get(selectedToken) : null;
  
  // Filter Logic for Tests (Main View)
  const filteredTests = useMemo(() => {
    let result = testsArray.filter(([token, test]) => {
      const term = testSearchTerm.toLowerCase();
      const matchesSearch = 
        test.details.name.toLowerCase().includes(term) ||
        test.details.subject.toLowerCase().includes(term) ||
        token.toLowerCase().includes(term);
      
      const testExamType = test.details.examType || 'Umum';
      const matchesType = filterExamType === 'all' || testExamType === filterExamType;

      return matchesSearch && matchesType;
    });

    if (testSortOrder === 'az') {
      result.sort((a, b) => a[1].details.subject.localeCompare(b[1].details.subject));
    } else if (testSortOrder === 'za') {
      result.sort((a, b) => b[1].details.subject.localeCompare(a[1].details.subject));
    }

    return result;
  }, [testsArray, testSearchTerm, testSortOrder, filterExamType]);

  const filteredQuestions = useMemo(() => {
    if (!selectedTest) return [];
    return selectedTest.questions.filter(q => {
      const matchesSearch = q.question.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesDifficulty = difficultyFilter === 'all' || q.difficulty === difficultyFilter;
      return matchesSearch && matchesDifficulty;
    });
  }, [selectedTest, searchTerm, difficultyFilter]);


  const handleOpenModalForAdd = () => { setEditingQuestion(null); setIsModalOpen(true); };
  const handleOpenModalForEdit = (question: Question) => { setEditingQuestion(question); setIsModalOpen(true); };
  
  const handleSaveQuestion = async (questionData: Omit<Question, 'id'> | Question, closeAfterSave: boolean = true) => {
    let success = false;
    if ('id' in questionData) {
        await onUpdateQuestion(selectedToken, questionData);
        success = true;
    } else {
        success = await onAddQuestion(selectedToken, questionData);
    }
    
    if (success && closeAfterSave) setIsModalOpen(false);
  };

  const handleSelectTest = async (token: string) => { 
    setSelectedToken(token); 
    setView('detail'); 
    if (onFetchQuestions) await onFetchQuestions(token);
  };
  const handleOpenEditTestModal = () => { if (selectedTest) { setTestToEdit({ token: selectedToken, test: selectedTest }); setIsTestModalOpen(true); } };
  const handlePreviewTest = async (test: Test, e: React.MouseEvent) => { 
    e.stopPropagation(); 
    setPreviewTest(test); 
    if (test.questions.length === 0 && onFetchQuestions) {
      await onFetchQuestions(test.details.token || '');
    }
  };
  
  const handleSaveTest = async (details: Omit<TestDetails, 'id' | 'time'>, token: string, questions: Omit<Question, 'id'>[]) => {
    if (testToEdit) {
        await onUpdateTest({ details: { ...testToEdit.test.details, ...details, token }, questions: testToEdit.test.questions }, testToEdit.token);
        if (token !== testToEdit.token) setSelectedToken(token);
    } else {
        const success = await onAddTest({ ...details, token }, token, questions);
        if (success) handleSelectTest(token.toUpperCase());
    }
    setIsTestModalOpen(false);
    setTestToEdit(null);
  };
  const handleOpenImportModal = () => { if(!selectedToken) { onImportError("Silakan pilih ujian terlebih dahulu."); return; } setIsImportModalOpen(true); }
  const handleOpenTxtImportModal = () => { if(!selectedToken) { onImportError("Silakan pilih ujian terlebih dahulu."); return; } setIsTxtImportModalOpen(true); }
  const handleOpenWordImportModal = () => { if(!selectedToken) { onImportError("Silakan pilih ujian terlebih dahulu."); return; } setIsWordImportModalOpen(true); }

  return (
    <div className="animate-fade-in">
      {view === 'main' ? (
        <div>
           <h1 className="text-3xl font-bold text-gray-800 mb-6">Bank Soal</h1>
           {/* ... Toolbar ... */}
           <div className="flex flex-col sm:flex-row gap-4 mb-8">
              <div className="relative flex-grow">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" /></svg>
                  </span>
                  <input type="text" placeholder="Cari Mata Pelajaran / Token..." value={testSearchTerm} onChange={(e) => setTestSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white shadow-sm transition-all" />
              </div>
              <div className="min-w-[200px] flex gap-2">
                  <select value={filterExamType} onChange={(e) => setFilterExamType(e.target.value)} className="w-full pl-3 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white shadow-sm">
                      <option value="all">Semua Kategori</option>
                      <option value="Umum">Umum</option>
                      {EXAM_EVENT_TYPES.map(type => (<option key={type} value={type}>{type}</option>))}
                  </select>
                  <select value={testSortOrder} onChange={(e) => setTestSortOrder(e.target.value as any)} className="w-full pl-3 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white shadow-sm"><option value="default">Terbaru</option><option value="az">A-Z</option><option value="za">Z-A</option></select>
              </div>
           </div>

           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
             {filteredTests.map(([token, test]) => {
               const { icon, gradient } = getSubjectVisuals(test.details.subject);
               return (
                <div key={token} className={`relative bg-gradient-to-br ${gradient} rounded-2xl shadow-xl p-6 text-white overflow-hidden flex flex-col justify-between transform hover:-translate-y-1.5 transition-transform duration-300 ease-in-out group`}>
                  <div className="absolute -top-8 -right-8 w-32 h-32 bg-white/10 rounded-full opacity-80"></div>
                  <div className="absolute top-4 right-4 z-20"><button onClick={(e) => { e.stopPropagation(); setTestToDelete({ token, name: test.details.subject }); }} className="p-2 bg-black/20 hover:bg-red-600 rounded-full text-white transition-all backdrop-blur-sm"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button></div>
                  <div className="relative z-10 flex-grow flex flex-col">
                    <div className="mb-4">{icon}</div>
                    <div className="flex items-center gap-2 mb-1"><span className="text-[10px] bg-white/20 px-2 py-0.5 rounded font-mono">TOKEN: {token}</span><span className="text-[10px] bg-black/30 px-2 py-0.5 rounded font-bold uppercase truncate max-w-[150px]">{test.details.examType || 'Umum'}</span></div>
                    <h2 className="text-2xl font-bold tracking-tight pr-8 line-clamp-2">{test.details.subject}</h2>
                    <div className="space-y-2 text-sm backdrop-blur-sm bg-black/10 p-3 rounded-lg border border-white/20 mt-auto"><div className="flex justify-between items-center"><span className="opacity-80">Total Soal:</span><span className="font-bold text-lg">{test.details.questionCount ?? test.questions.length}</span></div></div>
                  </div>
                  <div className="relative z-10 mt-6 flex gap-2"><button onClick={() => handleSelectTest(token)} className="flex-1 bg-white/20 hover:bg-white/30 backdrop-blur-md text-white font-bold py-2.5 px-4 rounded-lg border border-white/30 transition-all">Kelola Soal</button><button onClick={(e) => handlePreviewTest(test, e)} className="bg-white/20 hover:bg-white/30 backdrop-blur-md text-white p-2.5 rounded-lg border border-white/30 transition-all"><svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg></button></div>
                </div>
               )
             })}
            <div onClick={() => { setTestToEdit(null); setIsTestModalOpen(true); }} className="relative bg-white border-2 border-dashed border-gray-300 rounded-2xl p-6 text-gray-500 hover:text-blue-600 hover:border-blue-500 flex flex-col items-center justify-center cursor-pointer transition-all duration-300 ease-in-out transform hover:-translate-y-1.5 group min-h-[300px]"><div className="w-16 h-16 bg-gray-100 group-hover:bg-blue-50 rounded-full flex items-center justify-center mb-4 transition-colors"><svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg></div><h2 className="text-lg font-bold">Tambah Mapel Baru</h2></div>
           </div>
        </div>
      ) : (
        <div>
            <div className="flex items-center mb-6 justify-between">
                <div className="flex items-center">
                    <button onClick={() => setView('main')} className="text-blue-600 hover:bg-blue-50 rounded-full p-2 mr-2"><svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg></button>
                    <div>
                        <h1 className="text-3xl font-bold text-gray-800">{selectedTest?.details.subject}</h1>
                        <span className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-600 uppercase font-bold">{selectedTest?.details.examType || 'Umum'}</span>
                    </div>
                </div>
                <div className="flex gap-2">
                    {selectedTest && (<button onClick={(e) => handlePreviewTest(selectedTest, e)} className="flex items-center space-x-2 bg-purple-500 hover:bg-purple-600 text-white font-semibold py-2 px-4 rounded-lg shadow"><span>Preview</span></button>)}
                    <button onClick={handleOpenEditTestModal} className="flex items-center space-x-2 bg-yellow-500 hover:bg-yellow-600 text-white font-semibold py-2 px-4 rounded-lg shadow"><span>Edit Info</span></button>
                </div>
            </div>

            <div className="mb-8">
                {/* UPDATE: GRID 4 KOLOM (Tambah Word) */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <ActionCard 
                        title="Tambah Soal Manual" 
                        description="Isi formulir soal secara manual." 
                        icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>} 
                        onClick={handleOpenModalForAdd} 
                    />
                    <ActionCard 
                        title="Import dari Excel (.xlsx)" 
                        description="Upload soal massal dari Excel." 
                        icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>} 
                        onClick={handleOpenImportModal} 
                        gradient="bg-emerald-5 hover:bg-emerald-100" 
                        textColor="text-emerald-800" 
                    />
                    <ActionCard 
                        title="Import dari Notepad (.txt)" 
                        description="Upload semua tipe soal dari text." 
                        icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>} 
                        onClick={handleOpenTxtImportModal} 
                        gradient="bg-indigo-50 hover:bg-indigo-100" 
                        textColor="text-indigo-800" 
                    />
                    <ActionCard 
                        title="Import dari Word (.docx)" 
                        description="Upload soal dari Microsoft Word." 
                        icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-800" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>} 
                        onClick={handleOpenWordImportModal} 
                        gradient="bg-blue-50 hover:bg-blue-100" 
                        textColor="text-blue-900" 
                    />
                </div>
            </div>
            
            <div className="bg-white rounded-xl shadow-xl overflow-hidden">
                <div className="p-4 flex flex-col sm:flex-row justify-between items-center space-y-2 sm:space-y-0 bg-gray-50/50">
                    <div className="flex items-center gap-4">
                        <input type="text" placeholder="Cari soal..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-4 pr-4 py-2 w-full sm:w-64 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        {isFetchingQuestions && (
                            <div className="flex items-center gap-2 text-blue-600 text-sm font-medium animate-pulse">
                                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                <span>Memperbarui...</span>
                            </div>
                        )}
                    </div>
                    <select value={difficultyFilter} onChange={(e) => setDifficultyFilter(e.target.value as any)} className="w-full sm:w-auto p-2 border border-gray-300 rounded-full bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="all">Semua Kesulitan</option>
                        <option value="Easy">Mudah</option>
                        <option value="Medium">Sedang</option>
                        <option value="Hard">Sulit</option>
                    </select>
                </div>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50"><tr><th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-16 text-center">#</th><th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pertanyaan</th><th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Info</th><th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Aksi</th></tr></thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                        {filteredQuestions.map((q, index) => ( <SoalRow key={q.id} index={index} question={q} onEdit={handleOpenModalForEdit} onDelete={setDeletingQuestion} /> ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
      )}

      {isModalOpen && selectedToken && <QuestionModal questionToEdit={editingQuestion} onSave={handleSaveQuestion} onClose={() => setIsModalOpen(false)} />}
      {isTestModalOpen && <TestModal testToEdit={testToEdit} onSave={handleSaveTest} onClose={() => { setIsTestModalOpen(false); setTestToEdit(null); }} />}
      {isImportModalOpen && selectedToken && <BulkQuestionImportModal testToken={selectedToken} onClose={() => setIsImportModalOpen(false)} onSuccess={onRefresh} />}
      
      {/* Modal Import TXT */}
      {isTxtImportModalOpen && selectedToken && <TxtQuestionImportModal testToken={selectedToken} onClose={() => setIsTxtImportModalOpen(false)} onSuccess={onRefresh} />}
      
      {/* Modal Import Word */}
      {isWordImportModalOpen && selectedToken && <WordQuestionImportModal testToken={selectedToken} onClose={() => setIsWordImportModalOpen(false)} onSuccess={onRefresh} />}
      
      {previewTest && (
        <TestPreviewModal 
          testName={previewTest.details.subject} 
          questions={tests.get(previewTest.details.token || '')?.questions || []} 
          onClose={() => setPreviewTest(null)} 
          isLoading={isFetchingQuestions}
        />
      )}
      
      {deletingQuestion && selectedToken && ( 
        <ConfirmationModal 
            title="Hapus Soal" 
            message="Apakah Anda yakin ingin menghapus soal ini? Tindakan ini tidak dapat dibatalkan." 
            confirmText="Ya, Hapus" 
            cancelText="Batal" 
            onConfirm={() => { onDeleteQuestion(selectedToken, deletingQuestion.id); setDeletingQuestion(null); }} 
            onCancel={() => setDeletingQuestion(null)} 
            confirmColor="red" 
            cancelColor="gray" 
        /> 
      )}
      
      {testToDelete && ( <ConfirmationModal title="Hapus Bank Soal" message={`Yakin hapus bank soal "${testToDelete.name}"?`} confirmText="Hapus" cancelText="Batal" onConfirm={() => { onDeleteTest(testToDelete.token); setTestToDelete(null); }} onCancel={() => setTestToDelete(null)} confirmColor="red" cancelColor="green" /> )}
    </div>
  );
};

export default QuestionBank;
