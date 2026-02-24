
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Question, Answer } from '../types';

interface TestPreviewModalProps {
  testName: string;
  questions: Question[];
  onClose: () => void;
  isLoading?: boolean;
}

// Reuse Themes from TestScreen for consistency
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
  }
};

const TestPreviewModal: React.FC<TestPreviewModalProps> = ({ testName, questions, onClose, isLoading }) => {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, Answer>>({});
  const [currentThemeMode, setCurrentThemeMode] = useState<'light' | 'dark'>('light');
  
  // Matching State
  const [activeLeftPoint, setActiveLeftPoint] = useState<string | null>(null);
  const matchingContainerRef = useRef<HTMLDivElement>(null);
  const [dotPositions, setDotPositions] = useState<Record<string, { x: number, y: number }>>({});

  const currentTheme = THEMES[currentThemeMode];
  const currentQuestion = questions[currentQuestionIndex];
  const currentAnswer = answers[currentQuestion?.id] || { value: null, unsure: false };

  // --- Matching Logic (Replicated from TestScreen) ---
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
    if (currentQuestion?.type === 'matching') {
      setTimeout(updateDotPositions, 200);
      window.addEventListener('resize', updateDotPositions);
      return () => window.removeEventListener('resize', updateDotPositions);
    }
  }, [currentQuestionIndex, currentThemeMode]);

  const handleUpdateAnswer = (qId: number, val: any) => {
    setAnswers(prev => ({ ...prev, [qId]: { value: val, unsure: false } }));
  };

  const handlePointClick = (id: string, side: 'left' | 'right') => {
    const qId = currentQuestion.id;
    const currentPairs = { ...(answers[qId]?.value || {}) };

    if (side === 'left') {
      if (activeLeftPoint === id) setActiveLeftPoint(null);
      else {
        delete currentPairs[id];
        setActiveLeftPoint(id);
        handleUpdateAnswer(qId, currentPairs);
      }
    } else {
      if (activeLeftPoint) {
        Object.keys(currentPairs).forEach(key => { if (currentPairs[key] === id) delete currentPairs[key]; });
        const newPairs = { ...currentPairs, [activeLeftPoint]: id };
        handleUpdateAnswer(qId, newPairs);
        setActiveLeftPoint(null);
      }
    }
  };

  // --- Render Question Input ---
  const renderQuestionInput = () => {
    if (!currentQuestion) return null;

    switch (currentQuestion.type) {
        case 'complex_multiple_choice':
            const selections = Array.isArray(currentAnswer.value) ? currentAnswer.value : [] as number[];
            return (
                <div className="space-y-3">
                    {currentQuestion.options.map((opt, i) => {
                        const isSelected = selections.includes(i);
                        return (
                            <label key={i} className={`flex items-start p-4 border-2 rounded-2xl cursor-pointer transition-all ${isSelected ? currentTheme.optionActiveBg + ' ' + currentTheme.optionActiveBorder : currentTheme.optionBg + ' ' + currentTheme.optionBorder}`}>
                                <input type="checkbox" checked={isSelected} onChange={() => {
                                    const next = isSelected ? selections.filter(v => v !== i) : [...selections, i];
                                    handleUpdateAnswer(currentQuestion.id, next);
                                }} className="w-5 h-5 mt-1 mr-3" />
                                <div className={currentTheme.textMain} dangerouslySetInnerHTML={{ __html: opt }} />
                            </label>
                        );
                    })}
                </div>
            );

        case 'matching':
            const leftItems = currentQuestion.metadata?.matchingLeft || [];
            const rightItems = currentQuestion.metadata?.matchingRight || [];
            const pairs = (currentAnswer.value && typeof currentAnswer.value === 'object') ? (currentAnswer.value as Record<string, string>) : {};
            const colors = ['#ef4444', '#f97316', '#0d9488', '#3b82f6', '#8b5cf6'];

            return (
                <div className="relative w-full py-6" ref={matchingContainerRef}>
                    <svg className="absolute inset-0 w-full h-full pointer-events-none z-0">
                        {Object.entries(pairs).map(([lId, rId], idx) => {
                            const start = dotPositions[lId];
                            const end = dotPositions[rId];
                            if (!start || !end) return null;
                            const midX = (start.x + end.x) / 2;
                            return <path key={`${lId}-${rId}`} d={`M ${start.x} ${start.y} C ${midX} ${start.y}, ${midX} ${end.y}, ${end.x} ${end.y}`} stroke={colors[idx % colors.length]} strokeWidth="3" fill="none" />;
                        })}
                    </svg>
                    <div className="grid grid-cols-2 gap-12 relative z-10">
                        <div className="space-y-4">
                            {leftItems.map((item, idx) => {
                                const isConnected = !!pairs[item.id];
                                const isActive = activeLeftPoint === item.id;
                                const color = isConnected ? colors[Object.keys(pairs).indexOf(item.id) % colors.length] : (isActive ? '#6366f1' : '#cbd5e1');
                                return (
                                    <div key={item.id} className={`flex items-center justify-between p-3 border-2 rounded-xl ${currentTheme.matchingItemBg} ${isActive ? 'border-blue-400' : currentTheme.border}`}>
                                        <div className={`text-sm ${currentTheme.textMain}`}>{item.content}</div>
                                        <button data-dot-id={item.id} onClick={() => handlePointClick(item.id, 'left')} className="w-4 h-4 rounded-full border-2" style={{ backgroundColor: color }} />
                                    </div>
                                );
                            })}
                        </div>
                        <div className="space-y-4">
                            {rightItems.map((item) => {
                                const connectedLeft = Object.keys(pairs).find(k => pairs[k] === item.id);
                                const isConnected = !!connectedLeft;
                                const color = isConnected ? colors[Object.keys(pairs).indexOf(connectedLeft) % colors.length] : '#cbd5e1';
                                return (
                                    <div key={item.id} className={`flex items-center gap-3 p-3 border-2 rounded-xl ${currentTheme.matchingItemBg} ${currentTheme.border}`}>
                                        <button data-dot-id={item.id} onClick={() => handlePointClick(item.id, 'right')} className="w-4 h-4 rounded-full border-2" style={{ backgroundColor: color }} />
                                        <div className={`text-sm ${currentTheme.textMain}`}>{item.content}</div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            );

        case 'true_false':
            const tfAnswers = (currentAnswer.value as Record<number, boolean>) || {};
            return (
                <div className="border rounded-xl overflow-hidden mt-4">
                    <div className="flex bg-gray-100 p-3 text-sm font-bold text-gray-700">
                        <div className="flex-1">Pernyataan</div>
                        <div className="w-16 text-center">Benar</div>
                        <div className="w-16 text-center">Salah</div>
                    </div>
                    {currentQuestion.options.map((stmt, idx) => (
                        <div key={idx} className={`flex items-center p-3 border-t ${currentTheme.bgCard}`}>
                            <div className={`flex-1 text-sm ${currentTheme.textMain}`}>{stmt}</div>
                            <div className="w-16 flex justify-center"><input type="radio" checked={tfAnswers[idx] === true} onChange={() => handleUpdateAnswer(currentQuestion.id, { ...tfAnswers, [idx]: true })} className="w-5 h-5 text-green-600" /></div>
                            <div className="w-16 flex justify-center"><input type="radio" checked={tfAnswers[idx] === false} onChange={() => handleUpdateAnswer(currentQuestion.id, { ...tfAnswers, [idx]: false })} className="w-5 h-5 text-red-600" /></div>
                        </div>
                    ))}
                </div>
            );

        case 'essay':
            return (
                <textarea 
                    value={currentAnswer.value || ''} 
                    onChange={(e) => handleUpdateAnswer(currentQuestion.id, e.target.value)}
                    className={`w-full p-4 border-2 rounded-2xl h-40 focus:ring-2 focus:ring-blue-400 outline-none ${currentTheme.bgApp} ${currentTheme.textMain} ${currentTheme.border}`}
                    placeholder="Ketik jawaban..."
                />
            );

        default: // Multiple Choice
            return (
                <div className="space-y-3">
                    {currentQuestion.options.map((opt, i) => {
                        const isSelected = currentAnswer.value === i;
                        return (
                            <label key={i} className={`flex items-start p-4 border-2 rounded-2xl cursor-pointer transition-all ${isSelected ? currentTheme.optionActiveBg + ' ' + currentTheme.optionActiveBorder : currentTheme.optionBg + ' ' + currentTheme.optionBorder}`}>
                                <input type="radio" checked={isSelected} onChange={() => handleUpdateAnswer(currentQuestion.id, i)} className="w-5 h-5 mt-1 mr-3 text-blue-600" />
                                <div className={currentTheme.textMain} dangerouslySetInnerHTML={{ __html: opt }} />
                            </label>
                        );
                    })}
                </div>
            );
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
        
        {/* Mock Device Frame */}
        <div className={`w-full max-w-5xl h-[90vh] ${currentTheme.bgApp} rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col relative border-8 border-gray-800`}>
            
            {/* Top Bar (Header) */}
            <div className={`flex items-center justify-between px-6 py-4 ${currentTheme.bgCard} border-b ${currentTheme.border}`}>
                <div className="flex items-center space-x-4">
                    <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white font-bold text-lg shadow-lg">
                        {currentQuestionIndex + 1}
                    </div>
                    <div>
                        <p className={`text-xs font-bold uppercase tracking-wider ${currentTheme.textSub}`}>Preview Mode</p>
                        <h2 className={`text-sm sm:text-base font-bold truncate max-w-[200px] ${currentTheme.textMain}`}>{testName}</h2>
                    </div>
                </div>

                <div className="flex items-center space-x-3">
                    {/* Theme Toggle */}
                    <button onClick={() => setCurrentThemeMode(currentThemeMode === 'light' ? 'dark' : 'light')} className="p-2 rounded-full bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:text-white transition">
                        {currentThemeMode === 'light' ? '🌙' : '☀️'}
                    </button>
                    
                    {/* Close Button */}
                    <button onClick={onClose} className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-xs font-bold shadow-md transition-transform active:scale-95">
                        TUTUP PREVIEW
                    </button>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-grow overflow-y-auto p-4 sm:p-8">
                {isLoading ? (
                    <div className="flex flex-col items-center justify-center h-full text-blue-600">
                        <svg className="animate-spin h-12 w-12 mb-4" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <p className="animate-pulse font-bold">Memuat butir soal...</p>
                    </div>
                ) : questions.length > 0 ? (
                    <div className={`max-w-4xl mx-auto ${currentTheme.bgCard} p-6 sm:p-10 rounded-[2rem] shadow-sm ${currentTheme.border} border`}>
                        {/* Question Type Badge */}
                        <div className="mb-6 flex gap-2">
                            <span className="bg-blue-100 text-blue-800 text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wide">
                                {currentQuestion.type?.replace(/_/g, ' ')}
                            </span>
                            <span className="bg-gray-100 text-gray-600 text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wide">
                                Bobot: {currentQuestion.weight}
                            </span>
                        </div>

                        {/* Question Text */}
                        <div className={`prose max-w-none mb-8 text-lg font-medium ${currentTheme.textMain}`} dangerouslySetInnerHTML={{ __html: currentQuestion.question }} />

                        {/* Media */}
                        {(currentQuestion.image || currentQuestion.audio || currentQuestion.video) && (
                            <div className="mb-8 space-y-4">
                                {currentQuestion.image && <img src={currentQuestion.image} alt="Soal" className="max-h-64 rounded-xl border border-gray-200 shadow-sm" />}
                                {currentQuestion.audio && <audio controls src={currentQuestion.audio} className="w-full" />}
                                {currentQuestion.video && <video controls src={currentQuestion.video} className="w-full rounded-xl" />}
                            </div>
                        )}

                        {/* Inputs */}
                        <div className={`pt-6 border-t ${currentTheme.border}`}>
                            {renderQuestionInput()}
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center h-full text-gray-400">
                        <p>Belum ada soal untuk ditampilkan.</p>
                    </div>
                )}
            </div>

            {/* Bottom Navigation */}
            <div className={`p-4 border-t ${currentTheme.border} ${currentTheme.bgCard} flex justify-between items-center`}>
                <button 
                    onClick={() => setCurrentQuestionIndex(Math.max(0, currentQuestionIndex - 1))}
                    disabled={currentQuestionIndex === 0}
                    className="px-6 py-3 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-xl font-bold disabled:opacity-50 text-xs sm:text-sm transition"
                >
                    SEBELUMNYA
                </button>

                <div className={`text-xs font-bold uppercase tracking-widest ${currentTheme.textSub}`}>
                    {currentQuestionIndex + 1} dari {questions.length}
                </div>

                <button 
                    onClick={() => setCurrentQuestionIndex(Math.min(questions.length - 1, currentQuestionIndex + 1))}
                    disabled={currentQuestionIndex === questions.length - 1}
                    className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold disabled:opacity-50 text-xs sm:text-sm shadow-lg shadow-blue-200 transition"
                >
                    SELANJUTNYA
                </button>
            </div>

        </div>
    </div>
  );
};

export default TestPreviewModal;
