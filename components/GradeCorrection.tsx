import React, { useState, useMemo, useEffect } from 'react';
import { Test, User } from '../types';

interface StudentScoreEditable {
    id: string;
    fullName: string;
    nisn: string;
    class: string;
    originalScore: number;
    newScore: string; // Use string for input field
    reason: string;
    isSaved: boolean;
}

interface GradeCorrectionProps {
  tests: Map<string, Test>;
  users: User[];
}

const GradeCorrection: React.FC<GradeCorrectionProps> = ({ tests, users }) => {
  const [selectedToken, setSelectedToken] = useState<string>('');
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [studentScores, setStudentScores] = useState<StudentScoreEditable[]>([]);

  const testsArray = Array.from(tests.entries());
  const studentUsers = users.filter(u => u.username !== 'admin');
  const classList = useMemo(() => ['all', ...Array.from(new Set(studentUsers.map(u => u.class)))], [studentUsers]);

  // Effect to populate scores when filters change
  useEffect(() => {
    if (!selectedToken) {
      setStudentScores([]);
      return;
    }

    let filteredUsers = studentUsers;
    if (selectedClass !== 'all') {
        filteredUsers = studentUsers.filter(u => u.class === selectedClass);
    }
    
    // Simulate scores for the filtered users
    const scores = filteredUsers.map(user => {
        const score = Math.floor(Math.random() * 61) + 40; // Simulate a score between 40 and 100
        return {
            id: user.id,
            fullName: user.fullName,
            nisn: user.nisn,
            class: user.class,
            originalScore: score,
            newScore: score.toString(),
            reason: '',
            isSaved: true,
        };
    });
    setStudentScores(scores);

  }, [selectedToken, selectedClass, studentUsers]);

  const handleInputChange = (userId: string, field: 'newScore' | 'reason', value: string) => {
    setStudentScores(prev => prev.map(s => {
      if (s.id === userId) {
        // For score, only allow numbers and ensure it's within 0-100
        if (field === 'newScore') {
            const numericValue = parseInt(value, 10);
            if (value === '' || (!isNaN(numericValue) && numericValue >= 0 && numericValue <= 100)) {
                return { ...s, [field]: value, isSaved: false };
            }
            return s; // Ignore invalid input
        }
        return { ...s, [field]: value, isSaved: false };
      }
      return s;
    }));
  };

  const handleSave = (userId: string) => {
    // In a real app, this would be an API call.
    // Here we just update the UI state to reflect 'saved'.
    setStudentScores(prev => prev.map(s => {
      if (s.id === userId) {
        return { ...s, isSaved: true };
      }
      return s;
    }));
  };

  return (
    <div className="animate-fade-in">
      <h1 className="text-3xl font-bold text-gray-800 mb-6">Perbaikan & Input Nilai</h1>
      
      <div className="bg-white rounded-xl shadow-xl p-6 mb-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Pilih Ujian:</label>
                <select value={selectedToken} onChange={e => setSelectedToken(e.target.value)} className="w-full p-2 border rounded-md">
                    <option value="">-- Pilih Ujian --</option>
                    {testsArray.map(([token, test]) => <option key={token} value={token}>{test.details.subject}</option>)}
                </select>
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Filter Kelas:</label>
                <select value={selectedClass} onChange={e => setSelectedClass(e.target.value)} className="w-full p-2 border rounded-md" disabled={!selectedToken}>
                    {classList.map(c => <option key={c} value={c}>{c === 'all' ? 'Semua Kelas' : c}</option>)}
                </select>
            </div>
        </div>
      </div>

      {selectedToken ? (
        <div className="bg-white rounded-xl shadow-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nama</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">NISN</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Nilai Asli</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase w-28">Nilai Baru</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Keterangan</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Aksi</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {studentScores.map(user => (
                  <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{user.fullName}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{user.nisn}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-center text-gray-500">{user.originalScore}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <input 
                            type="number"
                            min="0"
                            max="100"
                            value={user.newScore}
                            onChange={e => handleInputChange(user.id, 'newScore', e.target.value)}
                            className="w-24 text-center p-1 border rounded-md focus:ring-blue-500 focus:border-blue-500"
                        />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                         <input 
                            type="text"
                            value={user.reason}
                            onChange={e => handleInputChange(user.id, 'reason', e.target.value)}
                            placeholder="Alasan perubahan..."
                            className="w-full p-1 border rounded-md focus:ring-blue-500 focus:border-blue-500"
                        />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm">
                        <button
                            onClick={() => handleSave(user.id)}
                            disabled={user.isSaved}
                            className={`font-bold py-1 px-3 rounded-lg text-xs transition ${
                                user.isSaved 
                                ? 'bg-green-100 text-green-700 cursor-default' 
                                : 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm'
                            }`}
                        >
                           {user.isSaved ? 'Tersimpan' : 'Simpan'}
                        </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="text-center py-12 bg-white rounded-xl shadow-md">
            <p className="text-gray-500">Silakan pilih ujian untuk melihat dan mengubah nilai siswa.</p>
        </div>
      )}
    </div>
  );
};

export default GradeCorrection;
