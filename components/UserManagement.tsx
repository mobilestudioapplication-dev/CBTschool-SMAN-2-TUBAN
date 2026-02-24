
import React, { useState, useMemo, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { User, ValidatedUserRow, MasterData, AppConfig } from '../types';
import UserModal from './UserModal';
import ConfirmationModal from './ConfirmationModal';
import PasswordResetModal from './PasswordResetModal';
import UserImportModal from './UserImportModal';
import { DEFAULT_PROFILE_IMAGES } from '../constants';

interface UserManagementProps {
    users?: User[]; // Optional karena kita akan fetch sendiri atau terima dari parent
    masterData?: MasterData;
}

const UserManagement: React.FC<UserManagementProps> = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'student' | 'teacher' | 'admin'>('student');
  const [searchTerm, setSearchTerm] = useState('');
  const [isSyncingTeacher, setIsSyncingTeacher] = useState(false);
  
  // Master Data Dummy jika tidak ada (untuk dropdown)
  const [masterData, setMasterData] = useState<MasterData>({ classes: [], majors: [] });
  const [config, setConfig] = useState<AppConfig>({ schoolName: '', logoUrl: '', primaryColor: '', enableAntiCheat: true, antiCheatViolationLimit: 3, allowStudentManualLogin: true, allowStudentQrLogin: true, allowAdminManualLogin: true, allowAdminQrLogin: true, emailDomain: '@sekolah.sch.id' });

  // Modals
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [deletingUser, setDeletingUser] = useState<User | null>(null);
  const [resetPasswordUser, setResetPasswordUser] = useState<User | null>(null);
  
  // Import
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [csvData, setCsvData] = useState<string[][]>([]);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // --- FETCH DATA ---
  const fetchData = async () => {
      setIsLoading(true);
      const [usersRes, classesRes, majorsRes, configRes] = await Promise.all([
          supabase.from('users').select('*'),
          supabase.from('master_classes').select('*'),
          supabase.from('master_majors').select('*'),
          supabase.from('app_config').select('*').single()
      ]);

      if (usersRes.data) {
          const mappedUsers = usersRes.data.map((u: any) => {
              let photoUrl = u.photo_url;
              if (!photoUrl) {
                  const g = u.gender;
                  if (g === 'Laki-laki' || g === 'L') photoUrl = DEFAULT_PROFILE_IMAGES.STUDENT_MALE;
                  else if (g === 'Perempuan' || g === 'P') photoUrl = DEFAULT_PROFILE_IMAGES.STUDENT_FEMALE;
                  else photoUrl = DEFAULT_PROFILE_IMAGES.STUDENT_NEUTRAL;
              }

              return {
                  ...u,
                  // Map DB columns (snake_case) to App types (camelCase)
                  fullName: u.full_name,
                  // Pastikan role ada, default student
                  role: u.role || 'student',
                  photoUrl: photoUrl
              };
          });
          setUsers(mappedUsers);
      }
      
      if (classesRes.data) setMasterData(prev => ({ ...prev, classes: classesRes.data }));
      if (majorsRes.data) setMasterData(prev => ({ ...prev, majors: majorsRes.data }));
      if (configRes.data) setConfig(prev => ({ ...prev, ...configRes.data, emailDomain: configRes.data.email_domain || '@sekolah.sch.id' }));
      
      setIsLoading(false);
  };

  useEffect(() => {
      fetchData();
  }, []);

  // --- FILTERED DATA ---
  const filteredUsers = useMemo(() => {
      return users.filter(user => {
          // 1. Filter by Role
          let roleMatch = false;
          if (activeTab === 'student') roleMatch = user.role === 'student' || !user.role;
          else if (activeTab === 'teacher') roleMatch = user.role === 'teacher';
          else if (activeTab === 'admin') roleMatch = user.role === 'admin';

          // 2. Filter by Search (Safe check with || '')
          const searchLower = searchTerm.toLowerCase();
          const nameMatch = (user.fullName || '').toLowerCase().includes(searchLower);
          const nisnMatch = (user.nisn || '').toLowerCase().includes(searchLower);
          const usernameMatch = (user.username || '').toLowerCase().includes(searchLower);

          return roleMatch && (nameMatch || nisnMatch || usernameMatch);
      });
  }, [users, activeTab, searchTerm]);

  // --- HANDLERS ---

  const handleAddUser = () => {
      setEditingUser({ role: activeTab } as any); // Pre-set role based on tab
      setIsUserModalOpen(true);
  };

  const handleEditUser = (user: User) => {
      setEditingUser(user);
      setIsUserModalOpen(true);
  };

  const handleSaveUser = async (userData: User | Omit<User, 'id'>) => {
      // Panggil RPC admin_upsert_user
      const { data, error } = await supabase.rpc('admin_upsert_user', {
          p_id: 'id' in userData ? userData.id : null,
          p_username: userData.username,
          p_password: userData.password,
          p_full_name: userData.fullName,
          p_nisn: userData.nisn,
          p_class: userData.class,
          p_major: userData.major,
          p_gender: userData.gender,
          p_religion: userData.religion,
          p_photo_url: userData.photoUrl,
          p_role: userData.role
      });

      if (error) {
          alert('Gagal menyimpan user: ' + error.message);
      } else {
          setIsUserModalOpen(false);
          setEditingUser(null);
          fetchData(); // Refresh list
          
          // Auto repair if teacher to ensure login works immediately
          if (userData.role === 'teacher') {
             handleRepairTeachers(true); // Silent repair
          }
      }
  };

  const handleDeleteUser = async () => {
      if (!deletingUser) return;
      const { error } = await supabase.rpc('admin_delete_user', { p_user_id: deletingUser.id });
      if (error) {
          alert('Gagal menghapus: ' + error.message);
      } else {
          setDeletingUser(null);
          fetchData();
      }
  };

  const handleResetPassword = async (userId: string, newPass: string) => {
      const { error } = await supabase.rpc('admin_reset_student_password', { p_user_id: userId, p_new_password: newPass });
      if (error) {
          alert('Gagal reset password: ' + error.message);
          return false;
      }
      return true;
  };
  
  // Handler khusus untuk perbaikan login guru
  const handleRepairTeachers = async (silent: boolean = false) => {
      if (!silent) setIsSyncingTeacher(true);
      try {
          const { data, error } = await supabase.rpc('repair_teacher_logins');
          if (error) throw error;
          if (!silent) alert(`${data.message}`); // Tampilkan pesan dari DB
          await fetchData();
      } catch (err: any) {
          console.error("Teacher repair failed", err);
          if (!silent) alert(`Gagal memperbaiki data guru: ${err.message}`);
      } finally {
          if (!silent) setIsSyncingTeacher(false);
      }
  };

  // --- ADVANCED IMPORT HANDLERS ---
  const handleDownloadTemplate = () => {
      // Header CSV Default
      let headers = ['username', 'password', 'fullname', 'nisn', 'class', 'major', 'gender', 'religion', 'role'];
      let exampleRow = '';

      // Tentukan contoh data berdasarkan Tab Aktif
      if (activeTab === 'teacher') {
          // Template Guru: Username, Password, Nama, NIP/NUPTK (di kolom NISN), Mapel (di kolom Major)
          exampleRow = ['guru01', 'guru123', 'Budi Santoso S.Pd', '19800101', 'STAFF', 'Matematika', 'Laki-laki', 'Islam', 'teacher'].join(',');
      } else if (activeTab === 'admin') {
          exampleRow = ['admin02', 'admin123', 'Admin Tata Usaha', '99999999', 'STAFF', 'TU', 'Perempuan', 'Islam', 'admin'].join(',');
      } else {
          // Template Siswa: NISN wajib
          exampleRow = ['', '', 'Siswa Contoh 1', '1234567890', 'XII-RPL-1', 'Rekayasa Perangkat Lunak', 'Laki-laki', 'Islam', 'student'].join(',');
      }

      // Contoh Data
      const rows = [
          headers.join(','),
          exampleRow
      ];
      
      const csvContent = rows.join('\n');
      
      // TAMBAHKAN BOM (Byte Order Mark) agar Excel membaca UTF-8 dengan benar
      const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `TEMPLATE_${activeTab.toUpperCase()}_CBT.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      
      const reader = new FileReader();
      reader.onload = (evt) => {
          const text = evt.target?.result as string;
          
          // 1. Split baris (handle Windows \r\n dan Unix \n)
          const lines = text.split(/\r\n|\n/).filter(line => line.trim() !== '');
          
          if (lines.length === 0) return;

          // 2. DETEKSI DELIMITER CERDAS (Koma atau Titik Koma)
          // Excel Indonesia sering menggunakan titik koma (;)
          const firstLine = lines[0];
          const commaCount = (firstLine.match(/,/g) || []).length;
          const semicolonCount = (firstLine.match(/;/g) || []).length;
          
          const delimiter = semicolonCount > commaCount ? ';' : ',';

          // 3. Parsing Data
          const parsedRows = lines.map(line => {
              // Regex untuk split tapi mengabaikan delimiter di dalam tanda kutip "..."
              // Contoh: "Jakarta, Indonesia",Laki-laki -> tidak terpotong di koma Jakarta
              const regex = new RegExp(`(?:^|${delimiter})(\"(?:[^\"]+|\"\")*\"|[^${delimiter}]*)`, 'g');
              
              const row: string[] = [];
              let match;
              
              while (match = regex.exec(line)) {
                  let val = match[1];
                  // Bersihkan tanda kutip pembungkus jika ada
                  if (val.length > 0 && val.charAt(0) === '"') {
                      val = val.substring(1, val.length - 1).replace(/""/g, '"');
                  }
                  row.push(val.trim());
              }
              
              // Fallback simple split jika regex ribet (untuk stabilitas)
              if (row.length <= 1) {
                  return line.split(delimiter).map(s => s.trim().replace(/^"|"$/g, ''));
              }
              
              return row;
          });

          setCsvData(parsedRows);
          setIsImportModalOpen(true);
      };
      reader.readAsText(file);
      e.target.value = ''; // Reset input agar bisa upload file yang sama ulang
  };

  const handleConfirmImport = async (validatedRows: ValidatedUserRow[]) => {
      // Gunakan RPC import yang sudah ada
      const payload = validatedRows.map(r => {
          // --- LOGIKA CERDAS PENENTUAN ROLE ---
          let finalRole = r.role; // 1. Ambil dari CSV dulu

          // 2. Jika di CSV kosong ATAU user sedang di tab 'teacher', paksa jadi teacher
          // Ini mencegah Guru masuk sebagai Siswa hanya karena CSV-nya salah
          if (activeTab === 'teacher') {
              finalRole = 'teacher';
          } else if (activeTab === 'admin') {
              finalRole = 'admin';
          }

          // 3. Deteksi Kata Kunci di Kelas/Major (Safety Net)
          // Jika kelas berisi "STAFF" atau "GURU", otomatis jadi teacher meski di tab siswa
          if (r.class && (r.class.toUpperCase().includes('STAFF') || r.class.toUpperCase().includes('GURU'))) {
              finalRole = 'teacher';
          }

          // 4. Default ke student jika masih kosong
          if (!finalRole) {
              finalRole = 'student';
          }

          // 5. Khusus Guru: Pastikan Kelas adalah STAFF jika kosong
          let finalClass = r.class;
          if (finalRole === 'teacher' && (!finalClass || finalClass === '')) {
              finalClass = 'STAFF';
          }

          return {
            username: r.username,
            password: r.password, 
            fullName: r.fullName,
            nisn: r.nisn,
            class: finalClass,
            major: r.major,
            gender: r.gender,
            religion: r.religion,
            photoUrl: r.photoUrl,
            role: finalRole // Gunakan role yang sudah divalidasi
          };
      });

      const { error } = await supabase.rpc('admin_import_users', { users_data: payload });
      
      if (error) {
          alert('Gagal import: ' + error.message);
      } else {
          setIsImportModalOpen(false);
          fetchData();
          alert(`Berhasil mengimpor ${payload.length} pengguna!`);
          
          // Auto sync teachers if importing to teacher tab
          if (activeTab === 'teacher') {
              // Trigger repair untuk memastikan auth terbuat sempurna
              handleRepairTeachers(true);
          }
      }
  };

  return (
    <div className="animate-fade-in space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
                <h1 className="text-3xl font-bold text-gray-800">Manajemen Pengguna</h1>
                <p className="text-gray-500">Kelola data Siswa, Guru, dan Administrator.</p>
            </div>
            <div className="flex gap-2 flex-wrap">
                {activeTab === 'teacher' && (
                    <button 
                        onClick={() => handleRepairTeachers(false)}
                        disabled={isSyncingTeacher}
                        className="bg-yellow-100 border border-yellow-300 text-yellow-800 font-bold py-2 px-4 rounded-lg hover:bg-yellow-200 flex items-center gap-2 shadow-sm transition-colors"
                        title="Klik jika guru tidak bisa login"
                    >
                        {isSyncingTeacher ? (
                            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                        ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                        )}
                        <span className="hidden sm:inline">Perbaiki Login Guru</span>
                    </button>
                )}

                <button 
                    onClick={handleDownloadTemplate} 
                    className="bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold py-2 px-4 rounded-lg hover:bg-emerald-100 flex items-center gap-2 shadow-sm transition-colors"
                    title={`Download Template CSV untuk ${activeTab === 'teacher' ? 'GURU' : 'SISWA'}`}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span className="hidden sm:inline">Template {activeTab === 'teacher' ? 'Guru' : 'Siswa'}</span>
                </button>

                <button 
                    onClick={() => fileInputRef.current?.click()} 
                    className="bg-white border border-gray-300 text-gray-700 font-bold py-2 px-4 rounded-lg hover:bg-gray-50 flex items-center gap-2 shadow-sm"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" /></svg>
                    Import CSV
                </button>
                <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".csv" className="hidden" />
                
                <button 
                    onClick={handleAddUser}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg shadow-md flex items-center gap-2"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" /></svg>
                    Tambah {activeTab === 'teacher' ? 'Guru' : activeTab === 'admin' ? 'Admin' : 'Siswa'}
                </button>
            </div>
        </div>

        {/* TABS */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="flex border-b border-gray-200">
                <button 
                    onClick={() => setActiveTab('student')}
                    className={`flex-1 py-4 text-sm font-bold text-center border-b-2 transition-colors ${activeTab === 'student' ? 'border-blue-500 text-blue-600 bg-blue-50/50' : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
                >
                    SISWA ({users.filter(u => u.role === 'student' || !u.role).length})
                </button>
                <button 
                    onClick={() => setActiveTab('teacher')}
                    className={`flex-1 py-4 text-sm font-bold text-center border-b-2 transition-colors ${activeTab === 'teacher' ? 'border-purple-500 text-purple-600 bg-purple-50/50' : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
                >
                    GURU ({users.filter(u => u.role === 'teacher').length})
                </button>
                <button 
                    onClick={() => setActiveTab('admin')}
                    className={`flex-1 py-4 text-sm font-bold text-center border-b-2 transition-colors ${activeTab === 'admin' ? 'border-gray-500 text-gray-800 bg-gray-50/50' : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
                >
                    ADMIN ({users.filter(u => u.role === 'admin').length})
                </button>
            </div>

            {/* TOOLBAR */}
            <div className="p-4 bg-gray-50 flex items-center justify-between gap-4">
                <div className="relative flex-grow max-w-md">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" /></svg>
                    </span>
                    <input 
                        type="text" 
                        placeholder={`Cari ${activeTab === 'teacher' ? 'Guru' : 'Siswa'}...`}
                        value={searchTerm} 
                        onChange={e => setSearchTerm(e.target.value)} 
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    />
                </div>
            </div>

            {/* TABLE */}
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-100">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Profil</th>
                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">{activeTab === 'teacher' ? 'NIP / ID' : 'NISN'}</th>
                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">{activeTab === 'teacher' ? 'Jabatan' : 'Kelas'}</th>
                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Username Login</th>
                            <th className="px-6 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Aksi</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {isLoading ? (
                            <tr><td colSpan={5} className="px-6 py-10 text-center text-gray-500">Memuat data...</td></tr>
                        ) : filteredUsers.length === 0 ? (
                            <tr><td colSpan={5} className="px-6 py-10 text-center text-gray-500">Tidak ada data ditemukan.</td></tr>
                        ) : (
                            filteredUsers.map(user => (
                                <tr key={user.id} className="hover:bg-gray-50 transition">
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex items-center">
                                            <img className="h-10 w-10 rounded-full object-cover border border-gray-200" src={user.photoUrl} alt="" />
                                            <div className="ml-4">
                                                <div className="text-sm font-bold text-gray-900">{user.fullName}</div>
                                                <div className="text-xs text-gray-500">{user.gender}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-600">
                                        {user.nisn}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                                        {activeTab === 'teacher' ? user.major : user.class}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 italic">
                                        {user.username}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                                        <button onClick={() => setResetPasswordUser(user)} className="text-yellow-600 hover:text-yellow-900 bg-yellow-50 p-2 rounded hover:bg-yellow-100" title="Reset Password">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" /></svg>
                                        </button>
                                        <button onClick={() => handleEditUser(user)} className="text-blue-600 hover:text-blue-900 bg-blue-50 p-2 rounded hover:bg-blue-100" title="Edit User">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" /></svg>
                                        </button>
                                        <button onClick={() => setDeletingUser(user)} className="text-red-600 hover:text-red-900 bg-red-50 p-2 rounded hover:bg-red-100" title="Hapus User">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>

        {/* MODALS */}
        {isUserModalOpen && (
            <UserModal 
                userToEdit={editingUser} 
                masterData={masterData} 
                onSave={handleSaveUser} 
                onClose={() => setIsUserModalOpen(false)} 
                config={config} 
            />
        )}

        {deletingUser && (
            <ConfirmationModal 
                title="Hapus Pengguna" 
                message={`Apakah Anda yakin ingin menghapus pengguna "${deletingUser.fullName}"? Tindakan ini tidak dapat diurungkan.`} 
                confirmText="Hapus" 
                cancelText="Batal" 
                onConfirm={handleDeleteUser} 
                onCancel={() => setDeletingUser(null)} 
                confirmColor="red" 
                cancelColor="gray" 
            />
        )}

        {resetPasswordUser && (
            <PasswordResetModal 
                user={resetPasswordUser} 
                onClose={() => setResetPasswordUser(null)} 
                onConfirm={handleResetPassword} 
            />
        )}

        {isImportModalOpen && (
            <UserImportModal 
                csvData={csvData} 
                existingUsers={users} 
                onConfirmImport={handleConfirmImport} 
                onClose={() => setIsImportModalOpen(false)} 
                config={config} 
            />
        )}
    </div>
  );
};

export default UserManagement;
