
import React from 'react';
import { Question } from '../types';

// Helper untuk mendapatkan Label Tipe Soal yang user-friendly dengan deteksi cerdas
export const getQuestionTypeLabel = (q: Question): string => {
  // Normalisasi tipe ke uppercase untuk menghindari masalah case-sensitivity
  const typeUpper = q.type?.toUpperCase();

  // 1. Cek tipe eksplisit dari Database (Prioritas Tertinggi)
  if (typeUpper === 'MULTIPLE_CHOICE' || typeUpper === 'SINGLE') return 'PG BIASA';
  if (typeUpper === 'COMPLEX_MULTIPLE_CHOICE' || typeUpper === 'MULTIPLE') return 'PG KOMPLEKS';
  if (typeUpper === 'MATCHING') return 'MENJODOHKAN';
  if (typeUpper === 'ESSAY') return 'ESSAY / URAIAN';
  if (typeUpper === 'TRUE_FALSE') return 'BENAR / SALAH';

  // 2. Deteksi Struktur Data (Fallback untuk data legacy/import)
  
  // FIX CRITICAL: Cek PG BIASA dulu sebelum Menjodohkan
  // PG Biasa biasanya punya answerKey.index (number)
  if (q.answerKey && typeof q.answerKey === 'object' && typeof q.answerKey.index === 'number') {
      return 'PG BIASA';
  }

  // Deteksi Menjodohkan
  if ((q.matchingRightOptions && q.matchingRightOptions.length > 0) || 
      (q.answerKey && typeof q.answerKey === 'object' && q.answerKey.pairs)) { 
      return 'MENJODOHKAN';
  }

  // Deteksi PG Kompleks (Array indices)
  if (Array.isArray(q.answerKey) || (q.answerKey && Array.isArray(q.answerKey.indices))) {
      return 'PG KOMPLEKS';
  }

  // Deteksi True/False 
  if (q.answerKey && typeof q.answerKey === 'object' && typeof q.answerKey['0'] === 'boolean') {
      return 'BENAR / SALAH';
  }

  // Deteksi Essay
  if (typeof q.answerKey === 'string' || (q.answerKey && typeof q.answerKey.text === 'string')) {
      // Pastikan bukan angka string murni (legacy index)
      const textVal = typeof q.answerKey === 'string' ? q.answerKey : q.answerKey.text;
      const isNumeric = /^\d+$/.test(textVal.trim());
      if (!isNumeric && textVal.trim().length > 0) {
          return 'ESSAY / URAIAN';
      }
  }

  // Default terakhir
  return 'PG BIASA';
};

// Helper untuk warna badge
export const getQuestionTypeColor = (label: string): string => {
  switch (label) {
    case 'PG BIASA': return 'bg-blue-100 text-blue-700 border-blue-200';
    case 'PG KOMPLEKS': return 'bg-orange-100 text-orange-700 border-orange-200';
    case 'MENJODOHKAN': return 'bg-purple-100 text-purple-700 border-purple-200';
    case 'ESSAY / URAIAN': return 'bg-teal-100 text-teal-700 border-teal-200';
    case 'BENAR / SALAH': return 'bg-pink-100 text-pink-700 border-pink-200';
    default: return 'bg-gray-100 text-gray-700 border-gray-200';
  }
};

interface SoalRowProps {
  index: number;
  question: Question;
  onEdit: (q: Question) => void;
  onDelete: (q: Question) => void;
}

/**
 * Komponen Baris Tabel Soal (SoalRow)
 * Digunakan di QuestionBank untuk merender baris soal secara konsisten.
 */
export const SoalRow: React.FC<SoalRowProps> = ({ index, question, onEdit, onDelete }) => {
  const typeLabel = getQuestionTypeLabel(question);
  const badgeClass = getQuestionTypeColor(typeLabel);
  
  // Tampilkan jumlah opsi untuk PG Biasa
  const optionCount = question.options ? question.options.length : 0;

  return (
    <tr className="hover:bg-gray-50 transition-colors border-b last:border-b-0 border-gray-100">
      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 w-16 text-center">
        {index + 1}
      </td>
      <td className="px-6 py-4 whitespace-normal text-sm text-gray-700 max-w-2xl">
        <div className="flex flex-col gap-2">
          {/* Konten Soal */}
          <div 
            className="prose prose-sm max-w-none text-gray-800 line-clamp-3" 
            dangerouslySetInnerHTML={{ __html: question.question }} 
          />
          
          {/* Badge Tipe Soal & Info Tambahan */}
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className={`px-2.5 py-0.5 rounded text-[10px] font-bold uppercase border tracking-wide ${badgeClass}`}>
              {typeLabel}
            </span>

            {/* Info Opsi (Permintaan User: Munculkan 5 opsi) */}
            {typeLabel === 'PG BIASA' && (
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-gray-100 text-gray-600 border border-gray-200">
                    {optionCount} Opsi
                </span>
            )}
            
            {/* Indikator Media */}
            {(question.image || question.audio || question.video) && (
               <div className="flex space-x-1">
                  {question.image && <span className="text-[10px] bg-indigo-50 text-indigo-600 px-1.5 rounded border border-indigo-100">IMG</span>}
                  {question.audio && <span className="text-[10px] bg-purple-50 text-purple-600 px-1.5 rounded border border-purple-100">AUDIO</span>}
                  {question.video && <span className="text-[10px] bg-pink-50 text-pink-600 px-1.5 rounded border border-pink-100">VIDEO</span>}
               </div>
            )}
          </div>
        </div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm">
        <div className="flex flex-col space-y-1.5">
          {/* Difficulty Badge */}
          <span className={`px-2 py-0.5 text-xs font-semibold rounded-full w-fit ${
            question.difficulty === 'Easy' ? 'bg-green-100 text-green-800' :
            question.difficulty === 'Medium' ? 'bg-yellow-100 text-yellow-800' :
            'bg-red-100 text-red-800'
          }`}>
            {question.difficulty}
          </span>
          <span className="text-xs text-gray-500 font-mono">Bobot: {question.weight}</span>
          <span className="text-xs text-gray-500 font-mono">Level: {question.cognitiveLevel || '-'}</span>
        </div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
        <div className="flex justify-end gap-2">
            <button 
                onClick={() => onEdit(question)} 
                className="text-blue-600 hover:text-blue-900 hover:bg-blue-50 p-2 rounded-lg transition-colors"
                title="Edit Soal"
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
            </button>
            <button 
                onClick={() => onDelete(question)} 
                className="text-red-600 hover:text-red-900 hover:bg-red-50 p-2 rounded-lg transition-colors"
                title="Hapus Soal"
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
            </button>
        </div>
      </td>
    </tr>
  );
};

export default SoalRow;
