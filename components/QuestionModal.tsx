
import React, { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '../supabaseClient';
import { Question, QuestionType, MatchingItem } from '../types';
import RichTextEditor from './RichTextEditor';
import { compressImage } from '../utils/imageCompression'; // Import fungsi kompresi

interface QuestionModalProps {
  questionToEdit: Question | null;
  onSave: (question: Omit<Question, 'id'> | Question, closeAfterSave?: boolean) => void;
  onClose: () => void;
}

const QuestionModal: React.FC<QuestionModalProps> = ({ questionToEdit, onSave, onClose }) => {
  const [activeType, setActiveType] = useState<QuestionType>(questionToEdit?.type || 'multiple_choice');
  
  // Define initial state for reuse
  const initialFormData = {
    question: '',
    topic: '',
    difficulty: 'Medium',
    weight: 1,
    options: ['', '', '', '', ''],
    mcKey: 0,
    complexMcKeys: [] as number[],
    matchingLeft: [{ id: 'L1', content: '' }],
    matchingRight: [{ id: 'R1', content: '' }],
    matchingPairs: {} as Record<string, string>,
    essayKey: '',
    trueFalseStatements: ['', '', ''], 
    trueFalseKey: {} as Record<number, boolean>,
  };

  const [formData, setFormData] = useState(questionToEdit ? {
    question: questionToEdit.question,
    topic: questionToEdit.topic || '',
    difficulty: questionToEdit.difficulty || 'Medium',
    weight: questionToEdit.weight || 1,
    options: questionToEdit.options?.length ? [...questionToEdit.options, ...Array(5 - questionToEdit.options.length).fill('')].slice(0, 5) : initialFormData.options,
    mcKey: typeof questionToEdit.answerKey?.index === 'number' ? questionToEdit.answerKey.index : 0,
    complexMcKeys: Array.isArray(questionToEdit.answerKey?.indices) ? questionToEdit.answerKey.indices : [],
    matchingLeft: questionToEdit.metadata?.matchingLeft || initialFormData.matchingLeft,
    matchingRight: questionToEdit.metadata?.matchingRight || initialFormData.matchingRight,
    matchingPairs: questionToEdit.answerKey?.pairs || {},
    essayKey: questionToEdit.answerKey?.text || '',
    trueFalseStatements: questionToEdit.type === 'true_false' && questionToEdit.options ? questionToEdit.options : initialFormData.trueFalseStatements,
    trueFalseKey: questionToEdit.type === 'true_false' && questionToEdit.answerKey ? questionToEdit.answerKey : {},
  } : initialFormData);

  // FUNGSI UPLOAD YANG DIPERBARUI DENGAN KOMPRESI
  const uploadImageAndGetUrl = async (file: File): Promise<string | null> => {
    try {
        // STEP 1: Kompresi
        const processedFile = await compressImage(file);

        // STEP 2: Upload
        const fileName = `public/${uuidv4()}-${processedFile.name}`;
        const { error } = await supabase.storage.from('question_assets').upload(fileName, processedFile);
        if (error) throw error;
        const { data: { publicUrl } } = supabase.storage.from('question_assets').getPublicUrl(fileName);
        return publicUrl;
    } catch (error: any) {
        if (error.message && error.message.includes("Entity Too Large")) {
             alert("Ukuran gambar terlalu besar (Maks 500KB). Silakan gunakan gambar yang lebih kecil.");
        } else {
             alert('Gagal mengunggah gambar: ' + error.message);
        }
        return null;
    }
  };

  const handleMetadataChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: name === 'weight' ? parseInt(value) || 1 : value }));
  };

  // --- MATCHING LOGIC ---
  const addMatchingItem = (side: 'left' | 'right') => {
    setFormData(prev => {
        const sideKey = side === 'left' ? 'matchingLeft' : 'matchingRight';
        const prefix = side === 'left' ? 'L' : 'R';
        // @ts-ignore - dynamic key access
        const newList = [...prev[sideKey]];
        newList.push({ id: `${prefix}${newList.length + 1}`, content: '' });
        return { ...prev, [sideKey]: newList };
    });
  };

  const updateMatchingContent = (side: 'left' | 'right', index: number, content: string) => {
    setFormData(prev => {
        const sideKey = side === 'left' ? 'matchingLeft' : 'matchingRight';
        // @ts-ignore - dynamic key access
        const newList = [...prev[sideKey]];
        newList[index] = { ...newList[index], content };
        return { ...prev, [sideKey]: newList };
    });
  };

  const removeMatchingItem = (side: 'left' | 'right', index: number) => {
    setFormData(prev => {
        const sideKey = side === 'left' ? 'matchingLeft' : 'matchingRight';
        // @ts-ignore - dynamic key access
        if (prev[sideKey].length <= 1) return prev;
        // @ts-ignore - dynamic key access
        const newList = prev[sideKey].filter((_, i) => i !== index);
        return { ...prev, [sideKey]: newList };
    });
  };

  const handlePairChange = (leftId: string, rightId: string) => {
    setFormData(prev => ({
        ...prev,
        matchingPairs: { ...prev.matchingPairs, [leftId]: rightId }
    }));
  };

  // --- TRUE/FALSE LOGIC ---
  const addTrueFalseStatement = () => {
      setFormData(prev => ({
          ...prev,
          trueFalseStatements: [...prev.trueFalseStatements, '']
      }));
  };

  const removeTrueFalseStatement = (index: number) => {
      setFormData(prev => {
          const newStmts = prev.trueFalseStatements.filter((_, i) => i !== index);
          const newKey = { ...prev.trueFalseKey };
          delete newKey[index];
          return { ...prev, trueFalseStatements: newStmts };
      });
  };

  const updateTrueFalseStatement = (index: number, val: string) => {
      const newStmts = [...formData.trueFalseStatements];
      newStmts[index] = val;
      setFormData(prev => ({ ...prev, trueFalseStatements: newStmts }));
  };

  const updateTrueFalseKey = (index: number, isTrue: boolean) => {
      setFormData(prev => ({
          ...prev,
          trueFalseKey: { ...prev.trueFalseKey, [index]: isTrue }
      }));
  };

  // --- SUBMIT ---
  const handleSubmit = (closeAfterSave: boolean) => {
    let answerKey: any = {};
    let metadata: any = null;
    let options: string[] = [];
    let matchingRightOptions: string[] = []; // FIX: Prepare matching options

    if (activeType === 'multiple_choice') {
      options = formData.options.filter(o => o.trim() !== '');
      answerKey = { index: formData.mcKey };
    } else if (activeType === 'complex_multiple_choice') {
      options = formData.options.filter(o => o.trim() !== '');
      answerKey = { indices: formData.complexMcKeys };
    } else if (activeType === 'matching') {
      answerKey = { pairs: formData.matchingPairs };
      metadata = { matchingLeft: formData.matchingLeft, matchingRight: formData.matchingRight };
      // FIX: Extract right options string array for database column
      matchingRightOptions = formData.matchingRight.map(item => item.content);
      // For matching, 'options' usually stores the left items' content
      options = formData.matchingLeft.map(item => item.content);
    } else if (activeType === 'essay') {
      answerKey = { text: formData.essayKey };
    } else if (activeType === 'true_false') {
        options = formData.trueFalseStatements.filter(s => s.trim() !== '');
        answerKey = formData.trueFalseKey; 
    }

    const payload = {
      type: activeType,
      question: formData.question,
      topic: formData.topic,
      difficulty: formData.difficulty as any,
      weight: formData.weight,
      options,
      matchingRightOptions, // FIX: Include this in payload
      answerKey,
      metadata,
      correctAnswerIndex: activeType === 'multiple_choice' ? formData.mcKey : 0 
    };

    onSave(questionToEdit ? { ...payload, id: questionToEdit.id } : payload, closeAfterSave);

    if (!closeAfterSave && !questionToEdit) {
        setFormData({ ...initialFormData, topic: formData.topic, difficulty: formData.difficulty }); 
        alert("Soal berhasil disimpan. Silakan masukkan soal berikutnya.");
    }
  };

  const renderTypeEditor = () => {
    switch (activeType) {
      case 'multiple_choice':
      case 'complex_multiple_choice':
        return (
          <div className="space-y-4">
            <label className="block text-sm font-bold text-gray-800 mb-4 flex items-center">
              <span className="bg-green-100 text-green-800 px-2 py-0.5 rounded text-xs mr-2">OPSI JAWABAN</span>
              {activeType === 'multiple_choice' ? 'Pilih satu kunci jawaban' : 'Pilih satu atau lebih kunci jawaban'}
            </label>
            {formData.options.map((opt, idx) => (
              <div key={idx} className="flex items-start gap-3 p-3 rounded-lg border border-gray-100">
                <div className="pt-3">
                  <input 
                    type={activeType === 'multiple_choice' ? 'radio' : 'checkbox'}
                    name="ans-key"
                    checked={activeType === 'multiple_choice' ? formData.mcKey === idx : formData.complexMcKeys.includes(idx)}
                    onChange={() => {
                        if (activeType === 'multiple_choice') {
                            setFormData(p => ({ ...p, mcKey: idx }));
                        } else {
                            const newKeys = formData.complexMcKeys.includes(idx) 
                                ? formData.complexMcKeys.filter(k => k !== idx)
                                : [...formData.complexMcKeys, idx];
                            setFormData(p => ({ ...p, complexMcKeys: newKeys }));
                        }
                    }}
                    className="w-5 h-5 text-blue-600 rounded"
                  />
                  <div className="text-center font-bold text-gray-400 mt-1">{String.fromCharCode(65 + idx)}</div>
                </div>
                <div className="flex-grow">
                  <RichTextEditor 
                    value={opt}
                    onChange={(html) => {
                        const newOpts = [...formData.options];
                        newOpts[idx] = html;
                        setFormData(p => ({ ...p, options: newOpts }));
                    }}
                    onImageUpload={uploadImageAndGetUrl}
                    placeholder={`Isi opsi ${String.fromCharCode(65 + idx)}...`}
                    height="h-auto"
                    simple
                  />
                </div>
              </div>
            ))}
          </div>
        );

      case 'matching':
        return (
          <div className="space-y-6">
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Kolom Kiri */}
                <div className="p-4 bg-blue-50/50 border border-blue-100 rounded-xl">
                    <div className="flex justify-between items-center mb-4">
                        <h4 className="font-bold text-blue-800">Bagian Kiri (Pernyataan)</h4>
                        <button type="button" onClick={() => addMatchingItem('left')} className="text-xs bg-blue-600 text-white px-2 py-1 rounded">+ Tambah</button>
                    </div>
                    <div className="space-y-3">
                        {formData.matchingLeft.map((item, idx) => (
                            <div key={item.id} className="flex items-center gap-2">
                                <span className="text-xs font-bold text-blue-400 w-6">{item.id}</span>
                                <input 
                                    type="text" 
                                    value={item.content} 
                                    onChange={(e) => updateMatchingContent('left', idx, e.target.value)}
                                    className="flex-grow p-2 text-sm border rounded"
                                    placeholder="Teks pernyataan..."
                                />
                                <button type="button" onClick={() => removeMatchingItem('left', idx)} className="text-red-400 hover:text-red-600">×</button>
                            </div>
                        ))}
                    </div>
                </div>
                {/* Kolom Kanan */}
                <div className="p-4 bg-purple-50/50 border border-purple-100 rounded-xl">
                    <div className="flex justify-between items-center mb-4">
                        <h4 className="font-bold text-purple-800">Bagian Kanan (Target)</h4>
                        <button type="button" onClick={() => addMatchingItem('right')} className="text-xs bg-purple-600 text-white px-2 py-1 rounded">+ Tambah</button>
                    </div>
                    <div className="space-y-3">
                        {formData.matchingRight.map((item, idx) => (
                            <div key={item.id} className="flex items-center gap-2">
                                <span className="text-xs font-bold text-purple-400 w-6">{item.id}</span>
                                <input 
                                    type="text" 
                                    value={item.content} 
                                    onChange={(e) => updateMatchingContent('right', idx, e.target.value)}
                                    className="flex-grow p-2 text-sm border rounded"
                                    placeholder="Teks atau Keterangan..."
                                />
                                <button type="button" onClick={() => removeMatchingItem('right', idx)} className="text-red-400 hover:text-red-600">×</button>
                            </div>
                        ))}
                    </div>
                </div>
             </div>

             <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-xl">
                <h4 className="font-bold text-yellow-800 mb-4 flex items-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" /></svg>
                    Kunci Jawaban (Pasangkan Item)
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {formData.matchingLeft.map(left => (
                        <div key={left.id} className="flex items-center justify-between p-2 bg-white border rounded shadow-sm">
                            <span className="text-sm font-bold text-blue-600">{left.id}. {left.content || '(kosong)'}</span>
                            <span className="mx-2 text-gray-400">→</span>
                            <select 
                                value={formData.matchingPairs[left.id] || ''} 
                                onChange={(e) => handlePairChange(left.id, e.target.value)}
                                className="text-sm border-none focus:ring-0 p-1 font-bold text-purple-600"
                            >
                                <option value="">-- Pilih --</option>
                                {formData.matchingRight.map(right => (
                                    <option key={right.id} value={right.id}>{right.id}</option>
                                ))}
                            </select>
                        </div>
                    ))}
                </div>
             </div>
          </div>
        );

      case 'true_false':
        return (
            <div className="space-y-6">
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <div className="flex justify-between items-center mb-4">
                        <label className="block text-sm font-bold text-gray-800">
                            Pernyataan & Kunci Jawaban
                        </label>
                        <button type="button" onClick={addTrueFalseStatement} className="text-xs bg-slate-600 text-white px-3 py-1.5 rounded hover:bg-slate-700 transition">+ Tambah Pernyataan</button>
                    </div>
                    
                    <div className="space-y-3">
                        <div className="grid grid-cols-12 gap-2 text-xs font-bold text-gray-500 uppercase tracking-wider px-2">
                            <div className="col-span-8">Pernyataan</div>
                            <div className="col-span-2 text-center">Jawaban</div>
                            <div className="col-span-2 text-center">Hapus</div>
                        </div>
                        {formData.trueFalseStatements.map((stmt, idx) => (
                            <div key={idx} className="grid grid-cols-12 gap-2 items-start bg-white p-2 rounded-lg border border-gray-200 shadow-sm">
                                <div className="col-span-8">
                                    <textarea 
                                        rows={2}
                                        className="w-full p-2 text-sm border rounded resize-none focus:ring-1 focus:ring-blue-500 outline-none"
                                        placeholder={`Pernyataan ke-${idx+1}`}
                                        value={stmt}
                                        onChange={(e) => updateTrueFalseStatement(idx, e.target.value)}
                                    />
                                </div>
                                <div className="col-span-2 flex flex-col items-center justify-center gap-2 pt-1">
                                    <label className={`cursor-pointer px-2 py-1 rounded text-xs font-bold border transition ${formData.trueFalseKey[idx] === true ? 'bg-green-100 text-green-700 border-green-300' : 'bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100'}`}>
                                        <input 
                                            type="radio" 
                                            name={`tf_key_${idx}`} 
                                            className="sr-only"
                                            checked={formData.trueFalseKey[idx] === true}
                                            onChange={() => updateTrueFalseKey(idx, true)}
                                        />
                                        BENAR
                                    </label>
                                    <label className={`cursor-pointer px-2 py-1 rounded text-xs font-bold border transition ${formData.trueFalseKey[idx] === false ? 'bg-red-100 text-red-700 border-red-300' : 'bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100'}`}>
                                        <input 
                                            type="radio" 
                                            name={`tf_key_${idx}`} 
                                            className="sr-only"
                                            checked={formData.trueFalseKey[idx] === false}
                                            onChange={() => updateTrueFalseKey(idx, false)}
                                        />
                                        SALAH
                                    </label>
                                </div>
                                <div className="col-span-2 flex items-center justify-center">
                                    <button type="button" onClick={() => removeTrueFalseStatement(idx)} className="text-red-400 hover:text-red-600 hover:bg-red-50 p-2 rounded-full transition">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );

      case 'essay':
        return (
          <div className="p-6 bg-orange-50 border border-orange-200 rounded-xl">
            <h4 className="font-bold text-orange-800 mb-2">Kunci Jawaban Singkat</h4>
            <p className="text-xs text-orange-600 mb-4">Siswa akan mengetik jawaban. Penilaian akan dilakukan secara case-insensitive (tidak membedakan huruf besar/kecil).</p>
            <input 
              type="text" 
              value={formData.essayKey}
              onChange={(e) => setFormData(p => ({ ...p, essayKey: e.target.value }))}
              className="w-full p-4 text-lg border-2 border-orange-300 rounded-lg focus:ring-orange-500 focus:border-orange-500"
              placeholder="Contoh: Soekarno"
            />
          </div>
        );
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[70] p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[95vh] flex flex-col transform animate-scale-up border border-gray-300">
        <div className="p-4 border-b flex justify-between items-center bg-white sticky top-0 z-10 rounded-t-2xl">
          <h3 className="text-xl font-bold text-blue-800 flex items-center">
            <span className="w-1.5 h-6 bg-blue-600 rounded-full mr-3"></span>
            {questionToEdit ? 'Edit Soal' : 'Tambah Soal Baru'}
          </h3>
          <button onClick={onClose} className="text-gray-300 hover:text-gray-500 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="overflow-y-auto p-6 space-y-8">
            {/* 1. Tipe Soal Selection */}
            <section>
                <label className="block text-[10px] font-extrabold text-gray-400 uppercase tracking-widest mb-3">Pilih Tipe Soal</label>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    {[
                        { id: 'multiple_choice', label: 'PG Biasa', sub: 'SINGLE CHOICE' },
                        { id: 'complex_multiple_choice', label: 'PG Kompleks', sub: 'MULTI SELECT' },
                        { id: 'true_false', label: 'Benar/Salah', sub: 'PERNYATAAN' },
                        { id: 'matching', label: 'Jodohkan', sub: 'MATCHING' },
                        { id: 'essay', label: 'Essay', sub: 'ISIAN SINGKAT' }
                    ].map(type => (
                        <button
                            key={type.id}
                            type="button"
                            onClick={() => setActiveType(type.id as QuestionType)}
                            className={`p-4 rounded-xl border-2 transition-all text-center flex flex-col items-center justify-center group ${activeType === type.id ? 'border-blue-500 bg-blue-50 ring-4 ring-blue-100' : 'border-gray-200 hover:border-blue-300 bg-white'}`}
                        >
                            <span className={`font-bold text-sm sm:text-base ${activeType === type.id ? 'text-blue-600' : 'text-gray-700'}`}>{type.label}</span>
                            <span className={`text-[9px] font-bold tracking-tighter ${activeType === type.id ? 'text-blue-400' : 'text-gray-400'}`}>{type.sub}</span>
                            {activeType === type.id && <div className="absolute top-2 right-2 w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>}
                        </button>
                    ))}
                </div>
            </section>

            {/* 2. Metadata Bar */}
            <section className="grid grid-cols-1 md:grid-cols-3 gap-6 p-5 bg-gray-50 border rounded-2xl">
                <div>
                    <label className="block text-[10px] font-extrabold text-gray-500 uppercase tracking-widest mb-1">Topik / Kompetensi</label>
                    <input type="text" name="topic" value={formData.topic} onChange={handleMetadataChange} className="w-full p-2.5 border border-gray-300 rounded-lg text-sm bg-white" placeholder="Contoh: Aljabar Linear" />
                </div>
                <div>
                    <label className="block text-[10px] font-extrabold text-gray-500 uppercase tracking-widest mb-1">Tingkat Kesulitan</label>
                    <select name="difficulty" value={formData.difficulty} onChange={handleMetadataChange} className="w-full p-2.5 border border-gray-300 rounded-lg text-sm bg-white">
                        <option value="Easy">Mudah</option>
                        <option value="Medium">Sedang</option>
                        <option value="Hard">Sulit</option>
                    </select>
                </div>
                <div>
                    <label className="block text-[10px] font-extrabold text-gray-500 uppercase tracking-widest mb-1">Bobot Soal</label>
                    <input type="number" name="weight" value={formData.weight} onChange={handleMetadataChange} className="w-full p-2.5 border border-gray-300 rounded-lg text-sm bg-white" min="1" />
                </div>
            </section>

            {/* 3. Question Editor */}
            <section>
                <div className="flex justify-between items-end mb-3">
                    <div className="flex space-x-2">
                        <span className="bg-blue-600 text-white px-3 py-1 rounded text-[10px] font-bold">PERTANYAAN UTAMA</span>
                        <span className="text-gray-400 text-xs font-bold py-1">Isi Soal / Instruksi / Stimulus</span>
                    </div>
                    {/* Media buttons (Audio/Video) would go here */}
                </div>
                <RichTextEditor 
                  value={formData.question} 
                  onChange={(h) => setFormData(p => ({ ...p, question: h }))} 
                  onImageUpload={uploadImageAndGetUrl}
                  placeholder="Ketik instruksi soal di sini..."
                  height="h-64"
                />
            </section>

            {/* 4. Type Specific Editor */}
            <section className="animate-fade-in">
                {renderTypeEditor()}
            </section>
        </div>

        <div className="p-5 border-t flex justify-end space-x-3 bg-gray-50 rounded-b-2xl sticky bottom-0">
          <button type="button" onClick={onClose} className="px-6 py-2.5 bg-white border border-gray-300 hover:bg-gray-100 text-gray-700 font-bold rounded-lg transition-colors">
            Batal
          </button>
          
          {!questionToEdit ? (
            <>
                <button onClick={() => handleSubmit(false)} className="px-6 py-2.5 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg shadow-md flex items-center transition-all transform hover:-translate-y-0.5">
                    <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m8-8H4" /></svg>
                    Simpan & Tambah Lagi
                </button>
                <button onClick={() => handleSubmit(true)} className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-md flex items-center transition-all transform hover:-translate-y-0.5">
                    Simpan & Tutup
                </button>
            </>
          ) : (
            <button onClick={() => handleSubmit(true)} className="px-8 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-lg flex items-center transition-all transform hover:-translate-y-0.5">
                <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                Simpan Perubahan
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default QuestionModal;
