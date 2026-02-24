
import React, { useState } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import { Question, QuestionDifficulty } from '../types';

interface AIQuestionGeneratorProps {
  onClose: () => void;
  onSaveQuestion: (question: Omit<Question, 'id'>) => void;
  subject: string;
}

type GeneratedQuestion = Omit<Question, 'id'> & { saved?: boolean };

const AIQuestionGenerator: React.FC<AIQuestionGeneratorProps> = ({ onClose, onSaveQuestion, subject }) => {
  const [material, setMaterial] = useState('');
  const [numQuestions, setNumQuestions] = useState(3);
  const [difficulty, setDifficulty] = useState<QuestionDifficulty | 'Mix'>('Medium');
  const [isLoading, setIsLoading] = useState(false);
  const [generatedQuestions, setGeneratedQuestions] = useState<GeneratedQuestion[]>([]);
  const [error, setError] = useState('');

  const handleGenerate = async () => {
    if (!material.trim()) {
      setError('Materi tidak boleh kosong.');
      return;
    }
    setIsLoading(true);
    setError('');
    setGeneratedQuestions([]);

    try {
      // FIX: Initialize GoogleGenAI without non-null assertion as per coding guidelines
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const schema = {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            question: { type: Type.STRING, description: "Teks pertanyaan." },
            options: { type: Type.ARRAY, description: "Array berisi 4 string opsi jawaban.", items: { type: Type.STRING } },
            correctAnswerIndex: { type: Type.INTEGER, description: "Index (0-3) dari jawaban yang benar pada array opsi." },
            difficulty: { type: Type.STRING, description: "Tingkat kesulitan: 'Easy', 'Medium', atau 'Hard'." },
            topic: { type: Type.STRING, description: "Topik singkat dari pertanyaan berdasarkan materi." }
          },
          required: ["question", "options", "correctAnswerIndex", "difficulty", "topic"]
        }
      };

      const prompt = `Anda adalah seorang ahli pembuat soal ujian pilihan ganda untuk mata pelajaran "${subject}". Berdasarkan materi berikut, buatlah ${numQuestions} soal pilihan ganda dengan tingkat kesulitan '${difficulty}'. Jika tingkat kesulitan adalah 'Mix', buat campuran soal Mudah, Sedang, dan Sulit. Setiap soal harus memiliki tepat 4 opsi jawaban. Pastikan jawaban yang benar bervariasi dan tidak selalu di posisi yang sama.

      Materi:
      """
      ${material}
      """`;

      // FIX: Updated to 'gemini-3-flash-preview' for better reasoning and adherence to guidelines
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: schema,
          temperature: 0.7,
        }
      });
      
      // FIX: Using .text property directly and handling potential undefined
      const responseText = response.text || '';
      const parsedResponse = JSON.parse(responseText.trim()) as GeneratedQuestion[];

      if (Array.isArray(parsedResponse)) {
        setGeneratedQuestions(parsedResponse.map(q => ({...q, saved: false})));
      } else {
        throw new Error("Format respons dari AI tidak valid.");
      }

    } catch (e: any) {
      console.error("Error generating questions:", e);
      setError(`Gagal membuat soal. Error: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = (questionToSave: GeneratedQuestion, index: number) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { saved, ...questionData } = questionToSave;
    onSaveQuestion(questionData);
    setGeneratedQuestions(prev => {
      const newQuestions = [...prev];
      newQuestions[index].saved = true;
      return newQuestions;
    });
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col transform animate-scale-up">
        <div className="p-5 border-b flex justify-between items-center">
          <h3 className="text-xl font-bold text-gray-800 flex items-center space-x-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
            <span>Buat Soal dengan AI</span>
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-800"><svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
        </div>
        
        <div className="flex-grow flex flex-col md:flex-row overflow-hidden">
          {/* Controls */}
          <div className="w-full md:w-1/3 p-6 border-b md:border-b-0 md:border-r bg-gray-50 flex flex-col">
            <h4 className="font-bold text-gray-700 mb-4">1. Konfigurasi</h4>
            <div className="space-y-4 flex-grow">
              <div>
                <label className="block text-sm font-medium text-gray-700">Materi Teks</label>
                <textarea
                  value={material}
                  onChange={e => setMaterial(e.target.value)}
                  placeholder={`Tempelkan materi pelajaran ${subject} di sini...`}
                  className="mt-1 w-full p-2 border rounded-md h-48 md:flex-grow"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Jumlah Soal</label>
                  <input
                    type="number"
                    value={numQuestions}
                    onChange={e => setNumQuestions(Math.max(1, parseInt(e.target.value, 10)))}
                    min="1"
                    max="10"
                    className="mt-1 w-full p-2 border rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Kesulitan</label>
                  <select
                    value={difficulty}
                    onChange={e => setDifficulty(e.target.value as any)}
                    className="mt-1 w-full p-2 border rounded-md bg-white"
                  >
                    <option value="Easy">Mudah</option>
                    <option value="Medium">Sedang</option>
                    <option value="Hard">Sulit</option>
                    <option value="Mix">Campuran</option>
                  </select>
                </div>
              </div>
            </div>
            <button
              onClick={handleGenerate}
              disabled={isLoading}
              className="w-full mt-4 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg shadow-md transition-all flex items-center justify-center disabled:bg-blue-400 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                  Membuat Soal...
                </>
              ) : "✨ Generate Soal"}
            </button>
          </div>
          {/* Results */}
          <div className="w-full md:w-2/3 p-6 overflow-y-auto">
             <h4 className="font-bold text-gray-700 mb-4">2. Hasil & Simpan</h4>
             {error && <div className="text-red-600 bg-red-50 p-3 rounded-md">{error}</div>}
             
             {isLoading && (
                 <div className="text-center py-10">
                    <p className="text-gray-500">AI sedang berpikir...</p>
                    <p className="text-sm text-gray-400 mt-1">Proses ini mungkin memakan waktu beberapa saat.</p>
                 </div>
             )}

             {generatedQuestions.length > 0 && (
                 <div className="space-y-4">
                     {generatedQuestions.map((q, index) => (
                         <div key={index} className="bg-white border rounded-lg p-4">
                            <p className="font-bold text-gray-800 mb-2">{q.question}</p>
                            <div className="space-y-1 mb-4">
                                {q.options.map((opt, optIndex) => (
                                    <div key={optIndex} className={`text-sm p-2 rounded ${optIndex === q.correctAnswerIndex ? 'bg-green-50 text-green-800 font-semibold' : 'bg-gray-50 text-gray-700'}`}>
                                        {String.fromCharCode(65 + optIndex)}. {opt}
                                    </div>
                                ))}
                            </div>
                            <div className="flex justify-between items-center">
                                <div className="text-xs space-x-2">
                                    <span className="font-semibold bg-gray-100 text-gray-700 px-2 py-1 rounded-full">{q.difficulty}</span>
                                    <span className="font-semibold bg-gray-100 text-gray-700 px-2 py-1 rounded-full">{q.topic}</span>
                                </div>
                                <button
                                    onClick={() => handleSave(q, index)}
                                    disabled={q.saved}
                                    className={`text-sm font-semibold py-1.5 px-4 rounded-lg transition ${q.saved ? 'bg-green-100 text-green-700 cursor-default' : 'bg-blue-100 text-blue-700 hover:bg-blue-200'}`}
                                >
                                    {q.saved ? "✔ Tersimpan" : "Simpan ke Bank Soal"}
                                </button>
                            </div>
                         </div>
                     ))}
                 </div>
             )}
             
             {!isLoading && generatedQuestions.length === 0 && (
                <div className="text-center py-10 border-2 border-dashed rounded-lg">
                    <p className="text-gray-500">Hasil soal akan muncul di sini.</p>
                </div>
             )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AIQuestionGenerator;
