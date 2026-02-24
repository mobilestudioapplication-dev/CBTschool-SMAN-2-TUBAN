
import React from 'react';
import { Answer, Question } from '../types';

interface QuestionListModalProps {
  questions: Question[];
  answers: Record<number, Answer>;
  currentIndex: number;
  onClose: () => void;
  onSelectQuestion: (index: number) => void;
}

const QuestionListModal: React.FC<QuestionListModalProps> = ({
  questions,
  answers,
  currentIndex,
  onClose,
  onSelectQuestion,
}) => {
  
  const isQuestionAnswered = (question: Question) => {
    const answer = answers[question.id];
    if (!answer || answer.value === null || answer.value === undefined) return false;
    
    const val = answer.value;
    
    // Logic based on question type
    if (question.type === 'multiple_choice') {
        return typeof val === 'number';
    }
    if (question.type === 'complex_multiple_choice') {
        return Array.isArray(val) && val.length > 0;
    }
    if (question.type === 'matching') {
        const leftItems = question.metadata?.matchingLeft || [];
        if (typeof val !== 'object') return false;
        // Selesai jika semua item kiri sudah ada pasangannya
        return leftItems.every(item => val[item.id] !== undefined && val[item.id] !== '');
    }
    if (question.type === 'true_false') {
        if (typeof val !== 'object') return false;
        // Selesai jika setiap pernyataan (index) memiliki jawaban boolean
        // Kita asumsikan options.length adalah jumlah pernyataan
        return question.options.every((_, idx) => val[idx] === true || val[idx] === false);
    }
    if (question.type === 'essay') {
        return typeof val === 'string' && val.trim().length > 0;
    }
    
    return false;
  };

  return (
    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col transform animate-scale-up border border-slate-200">
        <div className="p-8 border-b border-slate-100 flex justify-between items-center">
          <div>
            <h3 className="text-2xl font-black text-slate-800 tracking-tight">NAVIGASI SOAL</h3>
            <p className="text-sm text-slate-500 font-bold uppercase tracking-widest mt-1">Pilih nomor soal untuk melompat</p>
          </div>
          <button onClick={onClose} className="bg-slate-100 text-slate-400 hover:text-slate-800 hover:bg-slate-200 rounded-2xl p-3 transition-all">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div className="p-8 overflow-y-auto">
          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-4">
            {questions.map((question, index) => {
              const answer = answers[question.id];
              const hasAnswer = isQuestionAnswered(question);
              const isUnsure = answer?.unsure;
              const isActive = index === currentIndex;

              let btnClass = 'bg-white border-slate-200 text-slate-400 hover:border-blue-400 hover:text-blue-600';
              
              if (hasAnswer) {
                btnClass = 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-200';
              }
              
              if (isUnsure) {
                btnClass = 'bg-yellow-400 border-yellow-400 text-white shadow-lg shadow-yellow-100';
              }
              
              if (isActive) {
                btnClass = 'bg-slate-800 border-slate-800 text-white ring-4 ring-slate-100 shadow-xl';
              }

              return (
                <button
                  key={question.id}
                  onClick={() => onSelectQuestion(index)}
                  className={`aspect-square flex items-center justify-center font-black text-lg rounded-2xl border-2 transition-all duration-300 transform hover:scale-110 active:scale-95 ${btnClass}`}
                >
                  {index + 1}
                </button>
              );
            })}
          </div>
        </div>

        <div className="p-8 border-t border-slate-100 bg-slate-50/50 rounded-b-[2.5rem] flex flex-wrap items-center justify-center gap-x-8 gap-y-4 text-[10px] font-black uppercase tracking-widest text-slate-400">
            <div className="flex items-center"><div className="w-4 h-4 rounded-lg bg-blue-600 mr-2 shadow-sm"></div><span>Sudah Terjawab</span></div>
            <div className="flex items-center"><div className="w-4 h-4 rounded-lg bg-yellow-400 mr-2 shadow-sm"></div><span>Ragu-ragu</span></div>
            <div className="flex items-center"><div className="w-4 h-4 rounded-lg bg-white border-2 border-slate-200 mr-2"></div><span>Belum Terjawab</span></div>
            <div className="flex items-center"><div className="w-4 h-4 rounded-lg bg-slate-800 mr-2 shadow-sm"></div><span>Posisi Saat Ini</span></div>
        </div>
      </div>
    </div>
  );
};

export default QuestionListModal;
