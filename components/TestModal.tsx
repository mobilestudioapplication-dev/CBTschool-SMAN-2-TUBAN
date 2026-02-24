
import React, { useState, useRef, useEffect } from 'react';
import { Test, TestDetails, Question } from '../types';
import { EXAM_EVENT_TYPES } from '../constants';

type QuestionDataSource = 'manual' | 'import';

interface TestModalProps {
  testToEdit: { token: string; test: Test } | null;
  onSave: (details: Omit<TestDetails, 'id' | 'time'>, token: string, questions: Omit<Question, 'id'>[]) => void;
  onClose: () => void;
}

const TestModal: React.FC<TestModalProps> = ({ testToEdit, onSave, onClose }) => {
  const [token, setToken] = useState(testToEdit?.token || '');
  const [formData, setFormData] = useState<Omit<TestDetails, 'id' | 'time'>>({
    name: testToEdit?.test.details.name || '',
    subject: testToEdit?.test.details.subject || '',
    duration: testToEdit?.test.details.duration || '',
    durationMinutes: testToEdit?.test.details.durationMinutes || 0,
    questionsToDisplay: testToEdit?.test.details.questionsToDisplay,
    randomizeQuestions: testToEdit?.test.details.randomizeQuestions ?? true,
    randomizeAnswers: testToEdit?.test.details.randomizeAnswers ?? false,
    examType: testToEdit?.test.details.examType || 'Umum', // Pastikan default value ada
  });

  const [source, setSource] = useState<QuestionDataSource>('manual');
  const [parsedQuestions, setParsedQuestions] = useState<Omit<Question, 'id'>[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset form jika testToEdit berubah (untuk kasus modal tidak unmount)
  useEffect(() => {
      if(testToEdit) {
          setToken(testToEdit.token);
          setFormData({
            name: testToEdit.test.details.name,
            subject: testToEdit.test.details.subject,
            duration: testToEdit.test.details.duration,
            durationMinutes: testToEdit.test.details.durationMinutes,
            questionsToDisplay: testToEdit.test.details.questionsToDisplay,
            randomizeQuestions: testToEdit.test.details.randomizeQuestions ?? true,
            randomizeAnswers: testToEdit.test.details.randomizeAnswers ?? false,
            examType: testToEdit.test.details.examType || 'Umum'
          });
      }
  }, [testToEdit]);


  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    // Cast to check 'checked' only if input element
    const checked = (e.target as HTMLInputElement).checked;

    if (type === 'checkbox') {
        setFormData(prev => ({ ...prev, [name]: checked }));
    } else if (name === 'durationMinutes') {
        setFormData(prev => ({ ...prev, durationMinutes: parseInt(value, 10) || 0 }));
    } else if (name === 'questionsToDisplay') {
        setFormData(prev => ({ ...prev, questionsToDisplay: value === '' ? undefined : parseInt(value, 10) }));
    } else {
        setFormData(prev => ({ ...prev, [name]: value }));
    }
  };
  
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setFileError(null);
    setParsedQuestions([]);
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (!content) {
        setFileError("File kosong atau tidak dapat dibaca.");
        return;
      }
      
      const importedQuestions: Omit<Question, 'id'>[] = [];
      const errors: string[] = [];
      const questionBlocks = content.split(/\n\s*\n/).filter(block => block.trim() !== '' && !block.trim().startsWith('#'));

      questionBlocks.forEach((block, index) => {
        const lines = block.split('\n').map(line => line.trim()).filter(line => line.length > 0 && !line.startsWith('#'));
        if (lines.length < 3) return;

        const answerLineIndex = lines.findIndex(line => line.toLowerCase().startsWith('kunci jawaban') || line.toLowerCase().startsWith('jawaban'));
        const firstOptionIndex = lines.findIndex(line => /^[A-Z]\.\s/.test(line));
        
        if (answerLineIndex === -1 || firstOptionIndex === -1) {
            errors.push(`Format salah di soal blok #${index + 1}.`);
            return;
        }

        const questionText = lines.slice(0, firstOptionIndex).filter(line => !/^No\.\s*\d+/.test(line)).join('\n');
        const options = lines.slice(firstOptionIndex, answerLineIndex).map(opt => opt.replace(/^[A-Z]\.\s*/, '').trim());
        const answerLetter = lines[answerLineIndex].split(/:(.*)/s)[1]?.trim().toUpperCase();
        
        if (!questionText || options.length < 2 || !answerLetter) {
            errors.push(`Data tidak lengkap di soal blok #${index + 1}.`);
            return;
        }

        const correctAnswerIndex = answerLetter.charCodeAt(0) - 'A'.charCodeAt(0);

        if (correctAnswerIndex < 0 || correctAnswerIndex >= options.length) {
          errors.push(`Kunci jawaban "${answerLetter}" tidak valid untuk soal blok #${index + 1}.`);
          return;
        }

        importedQuestions.push({
          question: questionText,
          options,
          correctAnswerIndex,
          difficulty: 'Medium',
          topic: 'Imported',
          type: 'multiple_choice',
          answerKey: { index: correctAnswerIndex },
          weight: 1
        });
      });
      
      if (errors.length > 0) {
        setFileError(errors[0]);
      }
      setParsedQuestions(importedQuestions);
    };
    reader.readAsText(file);
    if (event.target) event.target.value = '';
  };
  
  const handleDownloadTemplate = () => {
    const templateContent = `# Format Soal Pilihan Ganda (.txt)
No. 1
Pertanyaan...
A. Opsi 1
B. Opsi 2
C. Opsi 3
D. Opsi 4
E. Opsi 5
KUNCI JAWABAN: A
`;
    const blob = new Blob([templateContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'template_soal.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };


  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Manual Validation
    if (!token.trim()) { alert("Token Ujian wajib diisi!"); return; }
    if (!formData.name.trim()) { alert("Nama Paket Tes wajib diisi!"); return; }
    if (!formData.subject.trim()) { alert("Mata Pelajaran wajib diisi!"); return; }
    if (!formData.duration.trim()) { alert("Durasi Teks wajib diisi!"); return; }
    if (formData.durationMinutes <= 0) { alert("Durasi (Angka) harus lebih dari 0!"); return; }

    if (source === 'import' && parsedQuestions.length === 0) {
        alert("Tidak ada soal yang berhasil dibaca dari file.");
        return;
    }
    
    // Pastikan examType terkirim
    onSave(formData, token.toUpperCase(), source === 'import' ? parsedQuestions : []);
  };

  const title = testToEdit ? 'Edit Ujian' : 'Tambah Ujian Baru';

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col transform animate-scale-up">
        <div className="p-5 border-b flex justify-between items-center bg-gray-50 rounded-t-2xl">
          <h3 className="text-xl font-bold text-gray-800">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-800"><svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          {/* Form fields */}
          <div><label className="block text-sm font-medium text-gray-700">Token Ujian</label><input type="text" name="token" value={token} onChange={(e) => setToken(e.target.value.toUpperCase())} className="mt-1 w-full p-2 border rounded-md font-mono font-bold tracking-wider" placeholder="CONTOH: MTK01" /></div>
          
          <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
            <label className="block text-sm font-bold text-blue-800 mb-1">Kategori Ujian (Event)</label>
            <select name="examType" value={formData.examType} onChange={handleChange} className="w-full p-2 border border-blue-300 rounded-md bg-white focus:ring-2 focus:ring-blue-500">
                <option value="Umum">Umum</option>
                {EXAM_EVENT_TYPES.map(type => (
                    <option key={type} value={type}>{type}</option>
                ))}
            </select>
            <p className="text-[10px] text-blue-600 mt-1 italic">*Digunakan untuk judul pada KOP Surat & Laporan Nilai.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Nama Paket Tes</label>
            <input type="text" name="name" value={formData.name} onChange={handleChange} className="mt-1 w-full p-2 border rounded-md" placeholder="Contoh: Matematika Wajib - Paket A" />
            <p className="text-xs text-gray-500 mt-1">Identitas spesifik untuk paket soal ini.</p>
          </div>
          
          <div><label className="block text-sm font-medium text-gray-700">Mata Pelajaran</label><input type="text" name="subject" value={formData.subject} onChange={handleChange} className="mt-1 w-full p-2 border rounded-md" placeholder="Contoh: Matematika" /></div>
          
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-gray-700">Durasi Teks</label><input type="text" name="duration" value={formData.duration} onChange={handleChange} className="mt-1 w-full p-2 border rounded-md" placeholder="90 Menit" /></div>
            <div><label className="block text-sm font-medium text-gray-700">Durasi (Angka)</label><input type="number" name="durationMinutes" value={formData.durationMinutes} onChange={handleChange} className="mt-1 w-full p-2 border rounded-md" placeholder="90" /></div>
          </div>
          
          <div>
            <label htmlFor="questionsToDisplay" className="block text-sm font-medium text-gray-700">Jumlah Soal Ditampilkan</label>
            <input 
              type="number" 
              name="questionsToDisplay" 
              id="questionsToDisplay"
              value={formData.questionsToDisplay ?? ''} 
              onChange={handleChange} 
              className="mt-1 w-full p-2 border rounded-md" 
              placeholder={`Total soal: ${parsedQuestions.length > 0 ? parsedQuestions.length : (testToEdit?.test.questions.length || 0)}`}
              min="1"
            />
            <p className="text-xs text-gray-500 mt-1">Kosongkan jika ingin menampilkan semua soal yang tersedia.</p>
          </div>

          <div className="flex gap-6 mt-4 p-4 bg-gray-50 border rounded-lg">
             <div className="flex items-center">
                <input 
                    id="randomizeQuestions" 
                    name="randomizeQuestions" 
                    type="checkbox" 
                    checked={formData.randomizeQuestions} 
                    onChange={handleChange}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <label htmlFor="randomizeQuestions" className="ml-2 block text-sm font-bold text-gray-700 cursor-pointer">
                    Acak Urutan Soal
                </label>
             </div>
             <div className="flex items-center">
                <input 
                    id="randomizeAnswers" 
                    name="randomizeAnswers" 
                    type="checkbox" 
                    checked={formData.randomizeAnswers} 
                    onChange={handleChange}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <label htmlFor="randomizeAnswers" className="ml-2 block text-sm font-bold text-gray-700 cursor-pointer">
                    Acak Opsi Jawaban
                </label>
             </div>
          </div>

          {!testToEdit && (
            <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Sumber Soal</label>
                <div className="flex gap-4">
                    <label className="flex items-center"><input type="radio" name="source" value="manual" checked={source === 'manual'} onChange={() => setSource('manual')} className="mr-2" /> Tambah Manual Nanti</label>
                    <label className="flex items-center"><input type="radio" name="source" value="import" checked={source === 'import'} onChange={() => setSource('import')} className="mr-2" /> Import dari File (.txt)</label>
                </div>
            </div>
          )}

          {source === 'import' && !testToEdit && (
              <div className="p-4 border-2 border-dashed rounded-lg bg-gray-50/50 space-y-2">
                  <label htmlFor="file-upload" className="block text-sm font-medium text-gray-700">File Soal (.txt)</label>
                  <input type="file" ref={fileInputRef} onChange={handleFileChange} className="text-sm" accept=".txt" />
                  <a href="#" onClick={handleDownloadTemplate} className="text-sm text-blue-600 hover:underline">Download Template Format</a>
                  {fileError && <p className="text-sm text-red-600 mt-1">{fileError}</p>}
                  {parsedQuestions.length > 0 && <p className="text-sm text-green-600 mt-1">✔ Berhasil membaca {parsedQuestions.length} soal.</p>}
              </div>
          )}
          
          <div className="p-5 border-t flex justify-end space-x-4 bg-gray-50 rounded-b-2xl">
            <button type="button" onClick={onClose} className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-4 rounded-lg">Batal</button>
            <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg">Simpan</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default TestModal;
