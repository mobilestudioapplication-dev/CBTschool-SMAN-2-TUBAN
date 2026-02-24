
import React, { useState, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { Question, QuestionType, QuestionDifficulty, CognitiveLevel } from '../types';

interface TxtQuestionImportModalProps {
  testToken: string;
  onClose: () => void;
  onSuccess: () => void;
}

const TxtQuestionImportModal: React.FC<TxtQuestionImportModalProps> = ({ testToken, onClose, onSuccess }) => {
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorLog, setErrorLog] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDownloadTemplate = () => {
    const content = `PANDUAN FORMAT IMPORT NOTEPAD (.TXT)
-------------------------------------------------------
ATURAN:
1. Pisahkan setiap soal dengan tanda "=====" (5 sama dengan).
2. TIPE SOAL yang didukung: 
   - SINGLE (Pilihan Ganda Biasa)
   - MULTIPLE (Pilihan Ganda Kompleks)
   - TRUE_FALSE (Benar/Salah)
   - MATCHING (Menjodohkan)
   - ESSAY (Uraian)
3. Jangan lupa "JAWABAN" untuk kunci.

=======================================================

TIPE: SINGLE
SOAL: Siapakah presiden pertama Indonesia?
OPSI_A: Soeharto
OPSI_B: B.J. Habibie
OPSI_C: Soekarno
OPSI_D: Megawati
OPSI_E: Gus Dur
JAWABAN: C
KESULITAN: Easy
BOBOT: 1

=====

TIPE: MULTIPLE
SOAL: Pilihlah dua warna primer di bawah ini:
OPSI_A: Merah
OPSI_B: Hijau
OPSI_C: Biru
OPSI_D: Ungu
JAWABAN: A, C
KESULITAN: Medium

=====

TIPE: TRUE_FALSE
SOAL: Tentukan kebenaran pernyataan berikut tentang Tata Surya.
PERNYATAAN_1: Matahari adalah planet.
PERNYATAAN_2: Bumi mengelilingi matahari.
PERNYATAAN_3: Bulan adalah satelit bumi.
JAWABAN: 1-S, 2-B, 3-B
KESULITAN: Medium
# Ket: B = Benar, S = Salah

=====

TIPE: MATCHING
SOAL: Pasangkan ibukota dengan negaranya.
KIRI_1: Indonesia
KIRI_2: Jepang
KIRI_3: Inggris
KANAN: London, Tokyo, Jakarta
JAWABAN: 1-C, 2-B, 3-A
# Ket: Kanan otomatis jadi A, B, C urut. 1-C artinya Indonesia-Jakarta.

=====

TIPE: ESSAY
SOAL: Jelaskan pengertian fotosintesis secara singkat.
JAWABAN: Proses pembuatan makanan pada tumbuhan
KESULITAN: Hard
BOBOT: 5
`;

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'TEMPLATE_SOAL_LENGKAP.txt';
    link.click();
  };

  const parseTxtContent = (content: string) => {
    const blocks = content.split(/={5,}/).map(b => b.trim()).filter(b => b.length > 0);
    const parsedQuestions: any[] = [];
    const errors: string[] = [];

    blocks.forEach((block, index) => {
      const lines = block.split('\n').map(l => l.trim()).filter(l => l.length > 0 && !l.startsWith('#') && !l.startsWith('-'));
      
      const getValue = (key: string) => {
        const line = lines.find(l => l.toUpperCase().startsWith(key.toUpperCase() + ':'));
        return line ? line.split(/:(.*)/s)[1].trim() : '';
      };

      const typeRaw = getValue('TIPE');
      const questionText = getValue('SOAL');
      const answerRaw = getValue('JAWABAN');
      
      if (!typeRaw || !questionText) {
        if (lines.length < 3) return;
        errors.push(`Soal #${index + 1}: TIPE atau SOAL tidak ditemukan.`);
        return;
      }

      let systemType: QuestionType = 'multiple_choice';
      if (typeRaw.toUpperCase() === 'MULTIPLE') systemType = 'complex_multiple_choice';
      else if (typeRaw.toUpperCase() === 'MATCHING') systemType = 'matching';
      else if (typeRaw.toUpperCase() === 'ESSAY') systemType = 'essay';
      else if (typeRaw.toUpperCase() === 'TRUE_FALSE') systemType = 'true_false';

      const qObj: any = {
        type: systemType,
        question: questionText,
        options: [],
        matching_right_options: [],
        answer_key: null,
        cognitive_level: (getValue('LEVEL') || 'L1') as CognitiveLevel,
        difficulty: (getValue('KESULITAN') || 'Medium') as QuestionDifficulty,
        weight: parseFloat(getValue('BOBOT')) || 1,
        topic: getValue('TOPIK') || 'Umum'
      };

      // --- PARSING LOGIC PER TYPE ---

      if (systemType === 'multiple_choice' || systemType === 'complex_multiple_choice') {
        const opts: string[] = [];
        ['A', 'B', 'C', 'D', 'E'].forEach(char => {
           const val = getValue(`OPSI_${char}`);
           if (val) opts.push(val);
        });
        qObj.options = opts;

        if (opts.length < 2) {
           errors.push(`Soal #${index + 1}: Minimal 2 Opsi (A & B) diperlukan.`);
           return;
        }

        if (systemType === 'multiple_choice') {
           const charCode = answerRaw.toUpperCase().trim().charCodeAt(0);
           const idx = charCode - 65;
           if (idx < 0 || idx >= opts.length) {
             errors.push(`Soal #${index + 1}: Jawaban '${answerRaw}' tidak valid.`);
             return;
           }
           qObj.answer_key = { index: idx }; // DB expects Object for flexibility
        } else {
           // Multiple: A, C
           const parts = answerRaw.split(',').map(p => p.trim().toUpperCase());
           const indices = parts.map(p => p.charCodeAt(0) - 65).filter(i => i >= 0 && i < opts.length);
           qObj.answer_key = { indices: indices };
        }
      } 
      else if (systemType === 'matching') {
         // KIRI_1, KIRI_2...
         const leftOpts: string[] = [];
         lines.forEach(l => {
            if (l.toUpperCase().startsWith('KIRI_')) {
                const val = l.split(/:(.*)/s)[1].trim();
                leftOpts.push(val);
            }
         });
         qObj.options = leftOpts;

         const rightRaw = getValue('KANAN');
         qObj.matching_right_options = rightRaw.split(',').map(s => s.trim()).filter(s => s !== '');

         // Answer: 1-C, 2-B
         const pairParts = answerRaw.split(',');
         // DB uses UI-Friendly ID pairing (L1->R3)
         const pairObj: Record<string, string> = {}; 
         
         pairParts.forEach(p => {
            const [l, r] = p.trim().split('-');
            if (l && r) {
               // Assuming user inputs 1-C (1 is index 0 of left, C is index 2 of right)
               // Frontend usually needs specific ID mapping, but for raw import we can simplify
               // Let's store L{idx}: R{char}
               const rightChar = r.trim().toUpperCase();
               pairObj[`L${l}`] = `R${rightChar.charCodeAt(0) - 64}`;
            }
         });
         qObj.answer_key = { pairs: pairObj };
      }
      else if (systemType === 'true_false') {
         const stmts: string[] = [];
         lines.forEach(l => {
            if (l.toUpperCase().startsWith('PERNYATAAN_')) {
                const val = l.split(/:(.*)/s)[1].trim();
                stmts.push(val);
            }
         });
         qObj.options = stmts;

         // Answer: 1-B, 2-S
         const tfKey: Record<string, boolean> = {};
         const parts = answerRaw.split(',');
         parts.forEach(p => {
            const [idxStr, valStr] = p.trim().split('-');
            if (idxStr && valStr) {
               const idx = parseInt(idxStr) - 1;
               const boolVal = valStr.toUpperCase() === 'B' || valStr.toUpperCase() === 'BENAR';
               if (!isNaN(idx)) tfKey[idx.toString()] = boolVal;
            }
         });
         qObj.answer_key = tfKey;
      }
      else if (systemType === 'essay') {
         qObj.options = [];
         qObj.answer_key = { text: answerRaw };
      }

      parsedQuestions.push(qObj);
    });

    if (errors.length > 0) {
      setErrorLog(errors);
    } else {
      setPreviewData(parsedQuestions);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setIsProcessing(true);
    setErrorLog([]);
    setPreviewData([]);

    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      parseTxtContent(text);
      setIsProcessing(false);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleUploadToDB = async () => {
      setIsProcessing(true);
      try {
          const { data, error } = await supabase.rpc('admin_import_questions', {
              p_test_token: testToken,
              p_questions_data: previewData
          });

          if (error) throw error;

          alert(`Berhasil mengimpor ${data.inserted} soal!`);
          onSuccess();
          onClose();

      } catch (err: any) {
          setErrorLog([`Database Error: ${err.message}`]);
      } finally {
          setIsProcessing(false);
      }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-[100] p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col transform animate-scale-up border border-slate-700">
        
        {/* Header */}
        <div className="p-5 border-b flex justify-between items-center bg-slate-50 rounded-t-2xl">
          <div>
            <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Import Soal Notepad (.txt)
            </h3>
            <p className="text-sm text-gray-500">Target: <span className="font-mono font-bold text-purple-700">{testToken}</span></p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-red-500"><svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
        </div>

        {/* Content */}
        <div className="flex-grow overflow-y-auto p-6">
            
            {/* Step 1 */}
            <div className="flex flex-col md:flex-row gap-4 mb-6 items-center bg-purple-50 p-4 rounded-xl border border-purple-100">
                <div className="flex-grow">
                    <h4 className="font-bold text-purple-800 mb-1">1. Download Template & Panduan</h4>
                    <p className="text-xs text-purple-600">Template .txt ini mencakup format untuk PG, PG Kompleks, Menjodohkan, Benar/Salah, dan Essay.</p>
                </div>
                <button onClick={handleDownloadTemplate} className="flex items-center px-4 py-2 bg-white border border-purple-300 text-purple-700 font-bold rounded-lg hover:bg-purple-50 shadow-sm text-xs">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                    Download Template .txt
                </button>
            </div>

            {/* Step 2 */}
            <div className="flex flex-col md:flex-row gap-4 mb-6 items-center bg-gray-50 p-4 rounded-xl border border-gray-200">
                <div className="flex-grow">
                    <h4 className="font-bold text-gray-800 mb-1">2. Upload File Notepad</h4>
                    <p className="text-xs text-gray-500">Pastikan setiap soal dipisah dengan tanda "=====".</p>
                </div>
                <input 
                    type="file" 
                    accept=".txt" 
                    ref={fileInputRef} 
                    className="hidden" 
                    onChange={handleFileUpload}
                />
                <button onClick={() => fileInputRef.current?.click()} disabled={isProcessing} className="flex items-center px-4 py-2 bg-gray-800 text-white font-bold rounded-lg hover:bg-gray-900 shadow-lg text-xs disabled:opacity-50">
                    {isProcessing ? 'Memproses...' : 'Pilih File .txt'}
                </button>
            </div>

            {/* Error Log */}
            {errorLog.length > 0 && (
                <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-4">
                    <h4 className="font-bold text-red-700 mb-2 text-sm">Terjadi Kesalahan ({errorLog.length})</h4>
                    <ul className="list-disc list-inside text-xs text-red-600 max-h-32 overflow-y-auto">
                        {errorLog.map((err, i) => <li key={i}>{err}</li>)}
                    </ul>
                </div>
            )}

            {/* Preview Data */}
            {previewData.length > 0 && errorLog.length === 0 && (
                <div>
                    <h4 className="font-bold text-gray-800 mb-3 flex items-center justify-between text-sm">
                        <span>3. Pratinjau Soal ({previewData.length})</span>
                        <span className="text-[10px] font-bold bg-green-100 text-green-700 px-2 py-1 rounded">SIAP IMPORT</span>
                    </h4>
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                        {previewData.map((row, idx) => (
                            <div key={idx} className="bg-white border border-gray-200 p-3 rounded-lg flex items-start gap-3">
                                <span className="bg-gray-100 text-gray-600 font-mono text-xs px-2 py-1 rounded">{idx+1}</span>
                                <div className="flex-grow">
                                    <div className="flex gap-2 mb-1">
                                        <span className="text-[10px] font-bold bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded uppercase">{row.type}</span>
                                        <span className="text-[10px] font-bold bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded uppercase">{row.difficulty}</span>
                                    </div>
                                    <p className="text-xs text-gray-800 line-clamp-2 font-medium">{row.question}</p>
                                    <p className="text-[10px] text-gray-500 mt-1">
                                        Kunci: <span className="font-mono bg-gray-100 px-1 rounded">{JSON.stringify(row.answer_key)}</span> | 
                                        Opsi: {row.options.length}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t bg-gray-50 flex justify-end space-x-3 rounded-b-2xl">
            <button onClick={onClose} className="px-5 py-2.5 bg-white border border-gray-300 text-gray-700 font-bold rounded-lg hover:bg-gray-50 text-sm">Batal</button>
            <button 
                onClick={handleUploadToDB} 
                disabled={previewData.length === 0 || isProcessing} 
                className="px-5 py-2.5 bg-purple-600 text-white font-bold rounded-lg hover:bg-purple-700 shadow-md disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center text-sm"
            >
                {isProcessing ? 'Menyimpan...' : `Simpan ${previewData.length} Soal`}
            </button>
        </div>

      </div>
    </div>
  );
};

export default TxtQuestionImportModal;
