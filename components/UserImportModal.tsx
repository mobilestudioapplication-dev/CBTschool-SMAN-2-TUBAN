
import React, { useMemo, useState, useEffect } from 'react';
import { User, ValidatedUserRow, ImportStatus, AppConfig } from '../types';
import { DEFAULT_PROFILE_IMAGES } from '../constants';

interface UserImportModalProps {
  csvData: string[][];
  existingUsers: User[];
  onConfirmImport: (validatedUsers: ValidatedUserRow[]) => void;
  onClose: () => void;
  config: AppConfig; // Added config to props
}

const UserImportModal: React.FC<UserImportModalProps> = ({ csvData, existingUsers, onConfirmImport, onClose, config }) => {
  const [error, setError] = useState('');

  const { validatedData, headerError } = useMemo<{ validatedData: ValidatedUserRow[], headerError: string | null }>(() => {
    if (csvData.length === 0) {
      return { validatedData: [], headerError: "File CSV kosong." };
    }
    
    // Filter out comment lines before processing
    const contentRows = csvData.filter(row => row.length > 0 && !row[0].trim().startsWith('#'));

    if (contentRows.length < 2) {
      return { validatedData: [], headerError: "File tidak berisi data atau format salah." };
    }

    const headerRow = contentRows[0];
    if (!headerRow) {
      return { validatedData: [], headerError: "File CSV tidak memiliki baris header." };
    }

    const cleanedHeader = headerRow.map((h, index) => {
        let clean = h.trim();
        if (index === 0) clean = clean.replace(/^\uFEFF/, ''); // Remove BOM
        return clean.toLowerCase();
    });

    const requiredColumns = ['fullname', 'nisn', 'class', 'major', 'gender'];
    
    const columnMap: { [key: string]: number } = {};
    
    cleanedHeader.forEach((col, index) => {
        if (col === 'username' || col === 'email') columnMap['username'] = index;
        else if (col === 'password') columnMap['password'] = index;
        else if (col === 'fullname' || col === 'nama lengkap' || col === 'full_name') columnMap['fullname'] = index;
        else if (col === 'nisn') columnMap['nisn'] = index;
        else if (col === 'class' || col === 'kelas') columnMap['class'] = index;
        else if (col === 'major' || col === 'jurusan') columnMap['major'] = index;
        else if (col === 'gender' || col === 'jenis kelamin') columnMap['gender'] = index;
        else if (col === 'religion' || col === 'agama') columnMap['religion'] = index;
        else if (col === 'photourl' || col === 'photo_url' || col === 'url_foto') columnMap['photoUrl'] = index;
    });

    const missingColumns = requiredColumns.filter(col => columnMap[col] === undefined);

    if (missingColumns.length > 0) {
      const displayMissing = missingColumns.map(c => c === 'fullname' ? 'fullName' : c);
      return { validatedData: [], headerError: `Header tidak valid. Kolom berikut tidak ditemukan: ${displayMissing.join(', ')}. Pastikan file Anda memiliki header yang benar.` };
    }

    const dataRows = contentRows.slice(1);

    const existingUsernamesClean = new Set(existingUsers.map(u => u.username.toLowerCase()));
    const usernamesInFileClean = new Set<string>();
    
    const validatedRows = dataRows.map((row, index): ValidatedUserRow => {
      const rowNumber = index + 2;

      let username = row[columnMap['username']]?.trim();
      const password = columnMap['password'] !== undefined ? row[columnMap['password']]?.trim() : undefined;
      const fullName = row[columnMap['fullname']]?.trim();
      const nisn = row[columnMap['nisn']]?.trim();
      const className = row[columnMap['class']]?.trim();
      const major = row[columnMap['major']]?.trim();
      const genderRaw = row[columnMap['gender']]?.trim();
      const religion = columnMap['religion'] !== undefined ? row[columnMap['religion']]?.trim() : 'Islam';
      
      let photoUrl = columnMap['photoUrl'] !== undefined ? row[columnMap['photoUrl']]?.trim() : undefined;

      // --- LOGIKA PERBAIKAN OTOMATIS BERDASARKAN CONFIG ---
      
      // 1. Fallback: Jika username kosong, gunakan NISN
      if (!username && nisn) {
          username = nisn;
      }

      // 2. Format Fix: Jika username hanya berisi angka (NISN), tambahkan domain email dari config
      if (username && /^\d+$/.test(username)) {
          username = `${username}${config.emailDomain}`;
      }

      // ----------------------------------

      if (!username || !fullName || !nisn || !className || !major || !genderRaw) {
        return { rowNumber, status: ImportStatus.INVALID_MISSING_FIELDS, message: 'Kolom wajib (username/nisn, fullName, nisn, class, major, gender) tidak boleh kosong.' };
      }
      
      let gender: 'Laki-laki' | 'Perempuan';
      const genderLower = genderRaw.toLowerCase();
      if (genderLower === 'l' || genderLower === 'laki-laki') {
        gender = 'Laki-laki';
      } else if (genderLower === 'p' || genderLower === 'perempuan') {
        gender = 'Perempuan';
      } else {
        return { rowNumber, username, status: ImportStatus.INVALID_MISSING_FIELDS, message: "Kolom gender harus diisi 'L'/'P' atau 'Laki-laki'/'Perempuan'." };
      }
      
      // 3. Apply Default Photo if missing (UPDATED LOGIC)
      if (!photoUrl) {
          if (gender === 'Laki-laki') {
              photoUrl = DEFAULT_PROFILE_IMAGES.STUDENT_MALE;
          } else if (gender === 'Perempuan') {
              photoUrl = DEFAULT_PROFILE_IMAGES.STUDENT_FEMALE;
          } else {
              photoUrl = DEFAULT_PROFILE_IMAGES.STUDENT_NEUTRAL;
          }
      }
      
      const cleanUsername = username.toLowerCase();
      
      if (usernamesInFileClean.has(cleanUsername)) {
        return { username, rowNumber, status: ImportStatus.INVALID_DUPLICATE_IN_FILE, message: 'Username duplikat di dalam file.' };
      }
      usernamesInFileClean.add(cleanUsername);
      
      const userObject = { username, password, fullName, nisn, class: className, major, gender, religion, photoUrl };
      const isUpdating = existingUsernamesClean.has(cleanUsername);

      if (isUpdating) {
        return { ...userObject, rowNumber, status: ImportStatus.VALID_UPDATE, message: 'Data pengguna akan diperbarui.' };
      }
      
      if (!password) {
        // Password default selalu NISN
        userObject.password = nisn;
      }

      return { ...userObject, rowNumber, status: ImportStatus.VALID_NEW, message: 'Pengguna baru akan ditambahkan.' };
    });

    return { validatedData: validatedRows, headerError: null };
  }, [csvData, existingUsers, config.emailDomain]);

  useEffect(() => {
    setError(headerError || '');
  }, [headerError]);


  const summary = useMemo(() => {
    return validatedData.reduce((acc, row) => {
        if (row.status === ImportStatus.VALID_NEW) acc.new++;
        else if (row.status === ImportStatus.VALID_UPDATE) acc.update++;
        else acc.error++;
        return acc;
    }, { new: 0, update: 0, error: 0 });
  }, [validatedData]);
  
  const errorRows = useMemo(() => {
    return validatedData.filter(row => row.status >= ImportStatus.INVALID_DUPLICATE_IN_FILE);
  }, [validatedData]);


  const handleConfirm = () => {
    const validRows = validatedData
      .filter(row => row.status === ImportStatus.VALID_NEW || row.status === ImportStatus.VALID_UPDATE);
    onConfirmImport(validRows);
  };
  
  const getStatusChip = (status: ImportStatus) => {
      switch(status) {
          case ImportStatus.VALID_NEW: return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">Baru</span>;
          case ImportStatus.VALID_UPDATE: return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">Update</span>;
          default: return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">Error</span>;
      }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col transform animate-scale-up">
        <div className="p-5 border-b flex justify-between items-center">
          <h3 className="text-xl font-bold text-gray-800">Pratinjau Impor Pengguna</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-800"><svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
        </div>
        
        <div className="p-6 flex-grow overflow-y-auto">
          {error ? (
             <div className="text-center py-10 text-red-600 bg-red-50 p-4 rounded-md">{error}</div>
          ) : (
            <>
                <div className="grid grid-cols-3 gap-4 mb-4 text-center">
                    <div className="bg-blue-50 p-3 rounded-lg"><span className="font-bold text-blue-700">{summary.new}</span> Data Baru</div>
                    <div className="bg-yellow-50 p-3 rounded-lg"><span className="font-bold text-yellow-700">{summary.update}</span> Data Update</div>
                    <div className="bg-red-50 p-3 rounded-lg"><span className="font-bold text-red-700">{summary.error}</span> Data Error</div>
                </div>

                {summary.error > 0 && (
                  <div className="mt-4 mb-6">
                      <h4 className="font-semibold text-red-700">Detail Error ({summary.error} baris):</h4>
                      <p className="text-sm text-gray-600 mb-2">Harap perbaiki baris-baris ini di file Anda dan unggah ulang. Impor tidak dapat dilanjutkan jika ada error.</p>
                      <div className="border border-red-200 rounded-lg max-h-40 overflow-y-auto bg-red-50">
                          <table className="min-w-full divide-y divide-red-200 text-sm">
                              <thead className="bg-red-100">
                                  <tr>
                                      <th className="px-4 py-2 text-left font-medium text-red-800">Baris #</th>
                                      <th className="px-4 py-2 text-left font-medium text-red-800">Username</th>
                                      <th className="px-4 py-2 text-left font-medium text-red-800">Pesan Error</th>
                                  </tr>
                              </thead>
                              <tbody className="bg-white divide-y divide-gray-200">
                                  {errorRows.map((row, index) => (
                                      <tr key={index}>
                                          <td className="px-4 py-2 font-mono">{row.rowNumber}</td>
                                          <td className="px-4 py-2 font-mono">{row.username || '(kosong)'}</td>
                                          <td className="px-4 py-2 text-red-700 font-medium">{row.message}</td>
                                      </tr>
                                  ))}
                              </tbody>
                          </table>
                      </div>
                  </div>
                )}

                {summary.error === 0 && (
                  <div className="overflow-x-auto border rounded-lg">
                      <table className="min-w-full divide-y divide-gray-200 text-sm">
                          <thead className="bg-gray-50">
                          <tr>
                              <th className="px-4 py-2 text-left font-medium text-gray-500">Status</th>
                              <th className="px-4 py-2 text-left font-medium text-gray-500">Username</th>
                              <th className="px-4 py-2 text-left font-medium text-gray-500">Nama Lengkap</th>
                              <th className="px-4 py-2 text-left font-medium text-gray-500">Agama</th>
                              <th className="px-4 py-2 text-left font-medium text-gray-500">Keterangan</th>
                          </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                          {validatedData.map((row, index) => (
                              <tr key={index}>
                                  <td className="px-4 py-2">{getStatusChip(row.status)}</td>
                                  <td className="px-4 py-2 font-mono">{row.username || '-'}</td>
                                  <td className="px-4 py-2">{row.fullName || '-'}</td>
                                  <td className="px-4 py-2">{row.religion || '-'}</td>
                                  <td className={`px-4 py-2 ${row.status >= ImportStatus.INVALID_DUPLICATE_IN_FILE ? 'text-red-600' : 'text-gray-500'}`}>{row.message}</td>
                              </tr>
                          ))}
                          </tbody>
                      </table>
                  </div>
                )}
            </>
          )}
        </div>
        
        <div className="p-5 border-t flex justify-end space-x-4 bg-gray-50 rounded-b-2xl">
          <button type="button" onClick={onClose} className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-4 rounded-lg">Batal</button>
          <button 
            type="button" 
            onClick={handleConfirm}
            disabled={!!error || summary.error > 0 || (summary.new + summary.update === 0)}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            Konfirmasi & Impor {summary.new + summary.update} Pengguna
          </button>
        </div>
      </div>
    </div>
  );
};

export default UserImportModal;
