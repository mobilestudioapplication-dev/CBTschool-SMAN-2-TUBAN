
import React, { useState, useEffect } from 'react';
import { User, MasterData, AppConfig } from '../types';
import { DEFAULT_PROFILE_IMAGES } from '../constants';

interface UserModalProps {
  userToEdit: User | null;
  masterData: MasterData;
  onSave: (user: User | Omit<User, 'id'>) => void;
  onClose: () => void;
  config: AppConfig;
}

const UserModal: React.FC<UserModalProps> = ({ userToEdit, masterData, onSave, onClose, config }) => {
  const [formData, setFormData] = useState<Omit<User, 'id'>>({
    username: userToEdit?.username || '',
    password: '',
    fullName: userToEdit?.fullName || '',
    nisn: userToEdit?.nisn || '',
    class: userToEdit?.class || '',
    major: userToEdit?.major || '',
    religion: userToEdit?.religion || 'Islam',
    gender: userToEdit?.gender || 'Laki-laki',
    photoUrl: userToEdit?.photoUrl || '',
    role: userToEdit?.role || 'student', // Default role
  });

  // Efek: Sinkronisasi username dengan NISN/NIP
  useEffect(() => {
    if (formData.nisn) {
        let expectedUsername = '';
        if (formData.role === 'teacher') {
            // Jika guru, gunakan NIP/Username murni atau tambah domain guru jika perlu
            // Disini kita gunakan format email agar konsisten dengan Auth Supabase
            if (formData.nisn.includes('@')) {
                expectedUsername = formData.nisn;
            } else {
                expectedUsername = `${formData.nisn}@teacher.${config.emailDomain.replace('@', '')}`;
            }
        } else {
            // Jika siswa
            expectedUsername = `${formData.nisn}${config.emailDomain}`;
        }

        if (formData.username !== expectedUsername) {
            setFormData(prev => ({ ...prev, username: expectedUsername }));
        }
    }
  }, [formData.nisn, formData.role, config.emailDomain]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleRoleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      const newRole = e.target.value;
      setFormData(prev => ({
          ...prev,
          role: newRole,
          // Jika guru, class jadi STAFF, major dikosongkan (agar diisi mapel)
          class: newRole === 'teacher' ? 'STAFF' : '',
          major: newRole === 'teacher' ? '' : '', 
      }));
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Logic Password: 
    // - Edit User: null (biarkan lama)
    // - New User: Default NISN/NIP
    const finalPassword = userToEdit ? null : formData.nisn;
    
    // Foto Default
    let finalPhotoUrl = formData.photoUrl;
    if (!finalPhotoUrl) {
        if (formData.gender === 'Perempuan') {
            finalPhotoUrl = DEFAULT_PROFILE_IMAGES.STUDENT_FEMALE;
        } else if (formData.gender === 'Laki-laki') {
            finalPhotoUrl = DEFAULT_PROFILE_IMAGES.STUDENT_MALE;
        } else {
            finalPhotoUrl = DEFAULT_PROFILE_IMAGES.STUDENT_NEUTRAL;
        }
    }
    
    // Default Major untuk Guru jika kosong
    let finalMajor = formData.major;
    if (formData.role === 'teacher' && !finalMajor) {
        finalMajor = 'Guru Mapel';
    }
    
    const dataToSave = {
      ...formData,
      major: finalMajor,
      password: finalPassword,
      photoUrl: finalPhotoUrl
    };

    if (userToEdit) {
      onSave({ ...dataToSave, id: userToEdit.id });
    } else {
      onSave(dataToSave);
    }
  };

  const title = userToEdit ? 'Edit Pengguna' : 'Tambah Pengguna Baru';
  const religions = ['Islam', 'Kristen Protestan', 'Katolik', 'Hindu', 'Buddha', 'Khonghucu'];
  const isTeacher = formData.role === 'teacher';

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col transform animate-scale-up">
        <div className="p-5 border-b flex justify-between items-center bg-gray-50 rounded-t-2xl">
          <h3 className="text-xl font-bold text-gray-800">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-800"><svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          
          {/* Role Selection */}
          <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
            <label className="block text-xs font-bold text-blue-800 uppercase tracking-wider mb-1">Peran Pengguna (Role)</label>
            <select name="role" value={formData.role} onChange={handleRoleChange} className="w-full p-2 border border-blue-300 rounded-md bg-white font-medium text-gray-700 focus:ring-2 focus:ring-blue-500" disabled={!!userToEdit}>
                <option value="student">Siswa / Peserta Ujian</option>
                <option value="teacher">Guru / Pengawas</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Nama Lengkap</label>
            <input type="text" name="fullName" value={formData.fullName} onChange={handleChange} className="mt-1 w-full p-2 border rounded-md" required placeholder={isTeacher ? "Contoh: Budi Santoso, S.Pd" : "Nama Siswa"} />
          </div>

          <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">{isTeacher ? 'NIP / Username' : 'NISN'}</label>
                <input type="text" name="nisn" value={formData.nisn} onChange={handleChange} className="mt-1 w-full p-2 border rounded-md font-mono" required placeholder={isTeacher ? "198001..." : "1234567890"} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Jenis Kelamin</label>
                <select name="gender" value={formData.gender} onChange={handleChange} className="mt-1 w-full p-2 border rounded-md bg-white" required>
                    <option value="Laki-laki">Laki-laki</option>
                    <option value="Perempuan">Perempuan</option>
                </select>
              </div>
          </div>

          {/* Kolom Khusus Siswa */}
          {!isTeacher && (
              <div className="grid grid-cols-2 gap-4 animate-fade-in">
                <div>
                    <label className="block text-sm font-medium text-gray-700">Kelas</label>
                    <select name="class" value={formData.class} onChange={handleChange} className="mt-1 w-full p-2 border rounded-md bg-white" required>
                        <option value="" disabled>Pilih Kelas</option>
                        {masterData.classes.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700">Jurusan</label>
                    <select name="major" value={formData.major} onChange={handleChange} className="mt-1 w-full p-2 border rounded-md bg-white" required>
                        <option value="" disabled>Pilih Jurusan</option>
                        {masterData.majors.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                    </select>
                </div>
              </div>
          )}

          {/* Kolom Khusus Guru */}
          {isTeacher && (
              <div className="grid grid-cols-2 gap-4 animate-fade-in bg-purple-50 p-2 rounded border border-purple-100">
                  <div>
                      <label className="block text-xs font-bold text-purple-700 mb-1">Status</label>
                      <input type="text" name="class" value={formData.class || 'STAFF'} onChange={handleChange} className="w-full p-2 border rounded text-sm font-bold text-gray-600 bg-white" placeholder="STAFF" />
                  </div>
                  <div>
                      <label className="block text-xs font-bold text-purple-700 mb-1">Mata Pelajaran / Jabatan</label>
                      <input type="text" name="major" value={formData.major} onChange={handleChange} className="w-full p-2 border rounded text-sm text-gray-800 focus:ring-purple-500" placeholder="Contoh: Matematika" />
                  </div>
              </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700">Login Email (Auto)</label>
            <input type="text" name="username" value={formData.username} className="mt-1 w-full p-2 border rounded-md bg-gray-100 text-gray-500 text-sm font-mono cursor-not-allowed" readOnly />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700">Agama</label>
            <select name="religion" value={formData.religion} onChange={handleChange} className="mt-1 w-full p-2 border rounded-md bg-white">
                {religions.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">URL Foto (Opsional)</label>
            <input type="text" name="photoUrl" value={formData.photoUrl} onChange={handleChange} className="mt-1 w-full p-2 border rounded-md text-sm" placeholder="https://..." />
          </div>
          
          {!userToEdit && (
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md text-xs text-yellow-800">
                Password awal akan diatur otomatis sama dengan <strong>{isTeacher ? 'NIP/Username' : 'NISN'}</strong>. Pengguna dapat menggantinya nanti.
            </div>
          )}

          <div className="p-5 border-t flex justify-end space-x-4">
            <button type="button" onClick={onClose} className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-4 rounded-lg">Batal</button>
            <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg">Simpan Data</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default UserModal;
