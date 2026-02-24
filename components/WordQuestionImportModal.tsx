
import React, { useState, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { QuestionType, QuestionDifficulty, CognitiveLevel } from '../types';
import * as mammoth from 'mammoth'; // Import aman untuk kompatibilitas
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';

interface WordQuestionImportModalProps {
  testToken: string;
  onClose: () => void;
  onSuccess: () => void;
}

const WordQuestionImportModal: React.FC<WordQuestionImportModalProps> = ({ testToken, onClose, onSuccess }) => {
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorLog, setErrorLog] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- GENERATE TEMPLATE WORD ---
  const handleDownloadTemplate = async () => {
    try {
        const doc = new Document({
          sections: [{
            properties: {},
            children: [
              new Paragraph({
                text: "TEMPLATE BANK SOAL CBT (FORMAT WORD)",
                heading: HeadingLevel.HEADING_1,
                spacing: { after: 200 }
              }),
              new Paragraph({
                children: [
                    new TextRun({ text: "ATURAN PENGISIAN:", bold: true, break: 1 }),
                    new TextRun({ text: "1. Jangan hapus tanda pemisah '=====' antar soal.", break: 1 }),
                    new TextRun({ text: "2. Ikuti format TIPE, SOAL, OPSI, dan JAWABAN persis seperti contoh.", break: 1 }),
                    new TextRun({ text: "3. File ini mendukung semua tipe soal (PG, PG Kompleks, Menjodohkan, Essay, Benar/Salah).", break: 1 }),
                ],
                spacing: { after: 400 }
              }),
              
              // CONTOH 1: PG BIASA
              new Paragraph({ text: "=====", heading: HeadingLevel.HEADING_2 }),
              new Paragraph({ text: "TIPE: SINGLE" }),
              new Paragraph({ text: "SOAL: Siapakah penemu bola lampu?" }),
              new Paragraph({ text: "OPSI_A: Thomas Alva Edison" }),
              new Paragraph({ text: "OPSI_B: Nikola Tesla" }),
              new Paragraph({ text: "OPSI_C: Alexander Graham Bell" }),
              new Paragraph({ text: "OPSI_D: Isaac Newton" }),
              new Paragraph({ text: "OPSI_E: Albert Einstein" }),
              new Paragraph({ text: "JAWABAN: A" }),
              new Paragraph({ text: "KESULITAN: Easy" }),

              // CONTOH 2: PG KOMPLEKS
              new Paragraph({ text: "=====", heading: HeadingLevel.HEADING_2 }),
              new Paragraph({ text: "TIPE: MULTIPLE" }),
              new Paragraph({ text: "SOAL: Pilih dua buah yang berwarna merah:" }),
              new Paragraph({ text: "OPSI_A: Apel" }),
              new Paragraph({ text: "OPSI_B: Pisang" }),
              new Paragraph({ text: "OPSI_C: Stroberi" }),
              new Paragraph({ text: "OPSI_D: Jeruk" }),
              new Paragraph({ text: "JAWABAN: A, C" }),
              new Paragraph({ text: "KESULITAN: Medium" }),

              // CONTOH 3: MENJODOHKAN
              new Paragraph({ text: "=====", heading: HeadingLevel.HEADING_2 }),
              new Paragraph({ text: "TIPE: MATCHING" }),
              new Paragraph({ text: "SOAL: Pasangkan hewan dengan makanannya." }),
              new Paragraph({ text: "KIRI_1: Kucing" }),
              new Paragraph({ text: "KIRI_2: Kelinci" }),
              new Paragraph({ text: "KIRI_3: Sapi" }),
              new Paragraph({ text: "KANAN: Ikan, Wortel, Rumput" }),
              new Paragraph({ text: "JAWABAN: 1-A, 2-B, 3-C" }),
              new Paragraph({ text: "KESULITAN: Medium" }),

              // CONTOH 4: BENAR SALAH
              new Paragraph({ text: "=====", heading: HeadingLevel.HEADING_2 }),
              new Paragraph({ text: "TIPE: TRUE_FALSE" }),
              new Paragraph({ text: "SOAL: Tentukan kebenaran pernyataan berikut." }),
              new Paragraph({ text: "PERNYATAAN_1: Air mendidih pada 100 derajat celcius." }),
              new Paragraph({ text: "PERNYATAAN_2: Es adalah benda gas." }),
              new Paragraph({ text: "JAWABAN: 1-B, 2-S" }),
              
              // CONTOH 5: ESSAY
              new Paragraph({ text: "=====", heading: HeadingLevel.HEADING_2 }),
              new Paragraph({ text: "TIPE: ESSAY" }),
              new Paragraph({ text: "SOAL: Jelaskan secara singkat apa itu fotosintesis." }),
              new Paragraph({ text: "JAWABAN: Proses pembuatan makanan pada tumbuhan" }),
              new Paragraph({ text: "BOBOT: 5" }),
            ],
          }],
        });

        const blob = await Packer.toBlob(doc);
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'TEMPLATE_SOAL_WORD.docx';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } catch (e) {
        console.error("Gagal generate template:", e);
        alert("Gagal membuat template Word.");
    }
  };

  // --- PARSING LOGIC ---
  const parseRawText = (content: string) => {
    // Normalisasi line breaks
    const cleanContent = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    // Split berdasarkan separator =====
    const blocks = cleanContent.split(/={5,}/).map(b => b.trim()).filter(b => b.length > 0);
    
    const parsedQuestions: any[] = [];
    const errors: string[] = [];

    blocks.forEach((block, index) => {
      // Hapus baris kosong dan baris instruksi template
      const lines = block.split('\n').map(l => l.trim()).filter(l => l.length > 0 && !l.startsWith('TEMPLATE') && !l.startsWith('ATURAN'));
      
      const getValue = (key: string) => {
        const line = lines.find(l => l.toUpperCase().startsWith(key.toUpperCase() + ':'));
        return line ? line.split(/:(.*)/s)[1].trim() : '';
      };

      const typeRaw = getValue('TIPE');
      const questionText = getValue('SOAL');
      const answerRaw = getValue('JAWABAN');
      
      if (!typeRaw || !questionText) {
        // Abaikan blok jika tidak lengkap (mungkin sisa header template)
        if (lines.length > 2) {
             errors.push(`Soal #${index + 1}: TIPE atau SOAL tidak ditemukan.`);
        }
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

      // --- PARSING PER TYPE ---
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
           qObj.answer_key = { index: idx };
        } else {
           const parts = answerRaw.split(',').map(p => p.trim().toUpperCase());
           const indices = parts.map(p => p.charCodeAt(0) - 65).filter(i => i >= 0 && i < opts.length);
           qObj.answer_key = { indices: indices };
        }
      } 
      else if (systemType === 'matching') {
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

         const pairParts = answerRaw.split(',');
         const pairObj: Record<string, string> = {};
         pairParts.forEach(p => {
            const [l, r] = p.trim().split('-');
            if (l && r) {
               // Assuming user inputs 1-C
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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setIsProcessing(true);
    setErrorLog([]);
    setPreviewData([]);

    try {
        const arrayBuffer = await file.arrayBuffer();
        // Gunakan mammoth untuk extract raw text
        const result = await mammoth.extractRawText({ arrayBuffer });
        parseRawText(result.value);
    } catch (err: any) {
        console.error("Word Parse Error:", err);
        setErrorLog([`Gagal membaca file Word: ${err.message}`]);
    } finally {
        setIsProcessing(false);
    }
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
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col transform animate-scale-up border border-blue-900">
        
        {/* Header */}
        <div className="p-5 border-b flex justify-between items-center bg-blue-50 rounded-t-2xl">
          <div>
            <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-700" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M7.5 3.375c0-1.036.84-1.875 1.875-1.875h.375a3.75 3.75 0 013.75 3.75v1.875C13.5 8.161 14.34 9 15.375 9h1.875A3.75 3.75 0 0121 12.75v3.375C21 17.16 20.16 18 19.125 18h-9.75A1.875 1.875 0 017.5 16.125V3.375z" />
                    <path d="M15 5.25a5.23 5.23 0 00-1.279-3.434 9.768 9.768 0 016.963 6.963A5.23 5.23 0 0017.25 7.5h-1.875A.375.375 0 0115 7.125V5.25zM4.875 6H6v10.125A3.375 3.375 0 009.375 19.5H16.5v1.125c0 1.035-.84 1.875-1.875 1.875h-9.75A1.875 1.875 0 013 20.625V7.875C3 6.839 3.84 6 4.875 6z" />
                </svg>
                Import Soal Word (.docx)
            </h3>
            <p className="text-sm text-gray-500">Target: <span className="font-mono font-bold text-blue-700">{testToken}</span></p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-red-500"><svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
        </div>

        {/* Content */}
        <div className="flex-grow overflow-y-auto p-6">
            
            {/* Step 1 */}
            <div className="flex flex-col md:flex-row gap-4 mb-6 items-center bg-blue-50 p-4 rounded-xl border border-blue-100">
                <div className="flex-grow">
                    <h4 className="font-bold text-blue-800 mb-1">1. Download Template Word</h4>
                    <p className="text-xs text-blue-600">Gunakan template ini untuk mengisi soal. Formatnya mirip dengan Notepad tapi lebih rapi di Word.</p>
                </div>
                <button onClick={handleDownloadTemplate} className="flex items-center px-4 py-2 bg-white border border-blue-300 text-blue-700 font-bold rounded-lg hover:bg-blue-50 shadow-sm text-xs whitespace-nowrap">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                    Download Template .docx
                </button>
            </div>

            {/* Step 2 */}
            <div className="flex flex-col md:flex-row gap-4 mb-6 items-center bg-gray-50 p-4 rounded-xl border border-gray-200">
                <div className="flex-grow">
                    <h4 className="font-bold text-gray-800 mb-1">2. Upload File Word</h4>
                    <p className="text-xs text-gray-500">Sistem akan membaca teks dari file Word Anda.</p>
                </div>
                <input 
                    type="file" 
                    accept=".docx" 
                    ref={fileInputRef} 
                    className="hidden" 
                    onChange={handleFileUpload}
                />
                <button onClick={() => fileInputRef.current?.click()} disabled={isProcessing} className="flex items-center px-4 py-2 bg-blue-800 text-white font-bold rounded-lg hover:bg-blue-900 shadow-lg text-xs disabled:opacity-50 whitespace-nowrap">
                    {isProcessing ? 'Membaca Docx...' : 'Pilih File .docx'}
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
                                        <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded uppercase">{row.type}</span>
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
                className="px-5 py-2.5 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 shadow-md disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center text-sm"
            >
                {isProcessing ? 'Menyimpan...' : `Simpan ${previewData.length} Soal`}
            </button>
        </div>

      </div>
    </div>
  );
};

export default WordQuestionImportModal;
