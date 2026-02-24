
import React, { useState, useMemo, useEffect } from 'react';
import { Test, User } from '../types';

interface QuestionAnalysisProps {
  tests: Map<string, Test>;
  users: User[];
}

const QuestionAnalysis: React.FC<QuestionAnalysisProps> = ({ tests, users }) => {
  const [selectedToken, setSelectedToken] = useState<string>('');
  const testsArray = Array.from(tests.entries());
  const selectedTest = selectedToken ? tests.get(selectedToken) : null;
  const studentUsers = users.filter(u => u.username !== 'admin');
  const totalStudents = studentUsers.length;

  // Memoize simulated answers to avoid recalculation on every render
  const simulatedAnswers = useMemo(() => {
    if (!selectedTest || totalStudents === 0) return null;

    const answers: Record<number, number[]> = {}; // questionId: [answerIndexForStudent1, answerIndexForStudent2, ...]
    
    selectedTest.questions.forEach(q => {
      answers[q.id] = [];
      const correctAnswerIndex = q.options.findIndex(opt => opt.toLowerCase().includes('soekarno') || opt.toLowerCase().includes('jakarta') || opt.includes('95') || opt.includes('48 cm') || opt.includes('x + 5y') || opt.includes('borobudur'));
      
      for (let i = 0; i < totalStudents; i++) {
        // Simulate that ~70% of students get it right, if we know the answer
        const isCorrect = correctAnswerIndex !== -1 ? (Math.random() < 0.7) : (Math.random() < 0.5);
        if (isCorrect && correctAnswerIndex !== -1) {
          answers[q.id].push(correctAnswerIndex);
        } else {
          // Choose a random wrong answer
          let randomAnswer;
          do {
            randomAnswer = Math.floor(Math.random() * q.options.length);
          } while (randomAnswer === correctAnswerIndex);
          answers[q.id].push(randomAnswer);
        }
      }
    });
    return answers;
  }, [selectedTest, totalStudents]);
  
  const analysisData = useMemo(() => {
      if (!selectedTest || !simulatedAnswers) return [];

      return selectedTest.questions.map(q => {
          const questionAnswers = simulatedAnswers[q.id] || [];
          const correctAnswerIndex = q.options.findIndex(opt => opt.toLowerCase().includes('soekarno') || opt.toLowerCase().includes('jakarta') || opt.includes('95') || opt.includes('48 cm') || opt.includes('x + 5y') || opt.includes('borobudur'));
          
          const correctCount = correctAnswerIndex !== -1 
              ? questionAnswers.filter(ans => ans === correctAnswerIndex).length
              : 0;
          
          const difficulty = totalStudents > 0 ? (correctCount / totalStudents) * 100 : 0;

          const optionCounts = q.options.map((_, index) => {
              return questionAnswers.filter(ans => ans === index).length;
          });

          return {
              id: q.id,
              question: q.question,
              image: q.image,
              optionImages: q.optionImages,
              difficulty,
              optionCounts,
              correctAnswerIndex
          };
      });
  }, [selectedTest, simulatedAnswers, totalStudents]);


  return (
    <div className="animate-fade-in">
      <h1 className="text-3xl font-bold text-gray-800 mb-6">Analisa Soal</h1>
      
      <div className="bg-white rounded-xl shadow-xl p-6">
        <label htmlFor="test-select-analysis" className="block text-sm font-medium text-gray-700 mb-2">Pilih Ujian untuk Dianalisis:</label>
        <select
          id="test-select-analysis"
          value={selectedToken}
          onChange={(e) => setSelectedToken(e.target.value)}
          className="w-full max-w-sm p-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="">-- Silakan Pilih Ujian --</option>
          {testsArray.map(([token, test]) => (
            <option key={token} value={token}>{test.details.subject} ({token})</option>
          ))}
        </select>
        {selectedTest && <p className="text-sm text-gray-500 mt-2">Menampilkan analisis untuk {totalStudents} siswa (data simulasi).</p>}
      </div>

      {selectedTest && (
        <div className="mt-8 bg-white rounded-xl shadow-xl p-6">
            {analysisData.map((data, index) => (
                <div key={data.id} className="mb-8 p-4 border rounded-lg bg-gray-50/30">
                    {data.image && (
                        <div className="mb-4">
                            <img 
                                src={data.image} 
                                alt={`Soal ${index + 1}`} 
                                className="max-h-64 max-w-full rounded-lg border border-gray-200 shadow-sm object-contain bg-white" 
                            />
                        </div>
                    )}
                    <p className="font-bold text-gray-800 mb-2">{index + 1}. {data.question}</p>
                    <div className="flex items-center space-x-4 mb-4 text-sm">
                        <span className="font-semibold">Tingkat Kesulitan:</span>
                        <span className={`px-2 py-1 rounded-full text-xs font-bold ${data.difficulty > 66 ? 'bg-green-100 text-green-800' : data.difficulty > 33 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}`}>
                            {data.difficulty.toFixed(1)}% Benar
                        </span>
                        <span>({data.difficulty > 66 ? 'Mudah' : data.difficulty > 33 ? 'Sedang' : 'Sulit'})</span>
                    </div>

                    <div className="space-y-3">
                        <p className="font-semibold text-sm text-gray-600">Distribusi Jawaban:</p>
                        {selectedTest.questions[index].options.map((opt, optIndex) => {
                            const count = data.optionCounts[optIndex];
                            const percentage = totalStudents > 0 ? (count / totalStudents) * 100 : 0;
                            const isCorrect = optIndex === data.correctAnswerIndex;
                            const optionImage = data.optionImages?.[optIndex];

                            return (
                                <div key={optIndex} className="flex items-start text-sm mb-2 last:mb-0">
                                    <span className={`font-mono mr-3 w-5 flex-shrink-0 pt-1 ${isCorrect ? 'text-green-600 font-bold' : 'text-gray-500'}`}>{String.fromCharCode(65 + optIndex)}.</span>
                                    
                                    <div className="flex-grow">
                                        {optionImage && (
                                            <img src={optionImage} alt={`Opsi ${String.fromCharCode(65 + optIndex)}`} className="h-16 w-auto mb-2 rounded border border-gray-200 object-contain bg-white" />
                                        )}
                                        <div className="w-full bg-gray-200 rounded-full h-5 overflow-hidden relative">
                                            <div 
                                                className={`h-full rounded-full transition-all duration-500 ${isCorrect ? 'bg-green-500' : 'bg-blue-500'}`}
                                                style={{ width: `${Math.max(percentage, 0)}%` }}
                                            ></div>
                                            <div className="absolute inset-0 flex items-center pl-2 text-[10px] font-bold text-gray-700">
                                                {count} Siswa ({percentage.toFixed(0)}%)
                                            </div>
                                        </div>
                                        <p className="text-xs text-gray-500 mt-1">{opt}</p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            ))}
        </div>
      )}
    </div>
  );
};

export default QuestionAnalysis;
