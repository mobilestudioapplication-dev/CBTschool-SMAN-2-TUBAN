
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { AppConfig, User, Test, MasterData, Announcement, Schedule } from '../types';
import DestructiveConfirmationModal from './DestructiveConfirmationModal';

interface BackupScreenProps {
  config: AppConfig;
  users: User[];
  tests: Map<string, Test>;
  masterData: MasterData;
  announcements: Announcement[];
  schedules: Schedule[];
  onRestoreData: (data: any) => Promise<void>;
  onDeleteData: (modules: { [key: string]: boolean }) => Promise<void>;
  isProcessing: boolean;
}

const BackupScreen: React.FC<BackupScreenProps> = (props) => {
  const { isProcessing } = props;
  const [selectedModules, setSelectedModules] = useState({
    config: true,
    users: true,
    tests: true,
    masterData: true,
    announcements: true,
    schedules: true,
  });
  const [modulesToDelete, setModulesToDelete] = useState({
    users: false,
    tests: false,
    masterData: false,
    announcements: false,
    schedules: false,
  });

  const [lastBackup, setLastBackup] = useState<string | null>(null);
  
  // Restore state
  const [isRestoreModalOpen, setIsRestoreModalOpen] = useState(false);
  const [restoreFileContent, setRestoreFileContent] = useState<any | null>(null);
  const [restoreError, setRestoreError] = useState('');
  const restoreFileInputRef = useRef<HTMLInputElement>(null);
  
  // Delete state
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  

  useEffect(() => {
    const savedDate = localStorage.getItem('cbt_last_backup');
    if (savedDate) {
      setLastBackup(new Date(savedDate).toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' }));
    }
  }, []);

  const handleBackupCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = e.target;
    setSelectedModules(prev => ({ ...prev, [name]: checked }));
  };

  const handleDeleteCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = e.target;
    setModulesToDelete(prev => ({ ...prev, [name]: checked }));
  };

  const performBackup = (isFull: boolean) => {
    try {
      const backupData: any = {};

      if (isFull || selectedModules.config) backupData.config = props.config;
      if (isFull || selectedModules.users) backupData.users = props.users;
      if (isFull || selectedModules.tests) {
        backupData.tests = Array.from(props.tests.entries());
      }
      if (isFull || selectedModules.masterData) backupData.masterData = props.masterData;
      if (isFull || selectedModules.announcements) backupData.announcements = props.announcements;
      if (isFull || selectedModules.schedules) backupData.schedules = props.schedules;
      
      const jsonString = JSON.stringify(backupData, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      link.download = `CBTschool_Backup_${timestamp}.json`;
      link.href = url;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      const now = new Date();
      localStorage.setItem('cbt_last_backup', now.toISOString());
      setLastBackup(now.toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' }));
    } catch (error) {
      console.error("Backup failed:", error);
      alert("Terjadi kesalahan saat membuat file backup.");
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setRestoreError('');
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const data = JSON.parse(text);
        
        // Relaxed validation: check if at least ONE known key exists to support partial backups
        const knownKeys = ['config', 'users', 'tests', 'masterData', 'announcements', 'schedules'];
        const hasKnownData = knownKeys.some(key => Object.prototype.hasOwnProperty.call(data, key));
        
        if (!hasKnownData) {
          throw new Error('File backup tidak valid. Tidak ditemukan data aplikasi yang dikenali (users, config, dll).');
        }
        
        setRestoreFileContent(data);
        setIsRestoreModalOpen(true);
      } catch (err: any) {
        setRestoreError(`Gagal memproses file: ${err.message}`);
      }
    };
    reader.onerror = () => setRestoreError('Gagal membaca file.');
    reader.readAsText(file);
    event.target.value = ''; // Reset input to allow re-selection
  };
  
  const handleConfirmRestore = () => {
    setIsRestoreModalOpen(false);
    if (restoreFileContent) {
      props.onRestoreData(restoreFileContent);
    }
  };

  const handleConfirmDeletion = async () => {
    await props.onDeleteData(modulesToDelete);
    setIsDeleteModalOpen(false);
    setModulesToDelete({
        users: false, tests: false, masterData: false, announcements: false, schedules: false,
    });
  };

  const modulesForDeletion = [
    { key: 'users', label: 'Semua Pengguna & Siswa (kecuali admin)' },
    { key: 'tests', label: 'Semua Bank Soal & Ujian' },
    { key: 'masterData', label: 'Data Master (Kelas & Jurusan)' },
    { key: 'announcements', label: 'Semua Pengumuman' },
    { key: 'schedules', label: 'Semua Jadwal Ujian' },
  ];

  const selectedForDeletionText = useMemo(() => 
    modulesForDeletion
      .filter(module => modulesToDelete[module.key as keyof typeof modulesToDelete])
      .map(module => module.label),
    [modulesToDelete]
  );
  
  const isDeleteButtonDisabled = Object.values(modulesToDelete).every(v => !v) || isProcessing;

  return (
    <div className="animate-fade-in">
      <h1 className="text-3xl font-bold text-gray-800 mb-2">Pusat Data</h1>
      <p className="text-gray-500 mb-8">
        Kelola pencadangan, pemulihan, dan penghapusan data sistem.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Backup & Restore Column */}
        <div className="space-y-8">
            <div className="bg-white rounded-xl shadow-xl p-6 flex flex-col">
              <h2 className="text-xl font-bold text-gray-800">Backup Penuh</h2>
              <p className="text-sm text-gray-500 mb-4">Backup terakhir: {lastBackup || 'Belum pernah'}</p>
              <p className="text-gray-600 mb-6 flex-grow">
                Buat cadangan lengkap dari semua data aplikasi. Opsi yang paling aman dan direkomendasikan.
              </p>
              <button onClick={() => performBackup(true)} disabled={isProcessing} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg shadow-md transition-all flex items-center justify-center disabled:bg-blue-400">
                {isProcessing ? 'Memproses...' : 'Mulai Backup Penuh'}
              </button>
            </div>

            <div className="bg-white rounded-xl shadow-xl p-6 flex flex-col">
              <h2 className="text-xl font-bold text-gray-800">Restore dari Backup</h2>
               <p className="text-sm text-gray-500 mb-4">Ganti data saat ini dengan data dari file.</p>
              <p className="text-gray-600 mb-6 flex-grow">
                Pilih file backup (.json) untuk memulihkan data. <strong className="text-orange-600">Perhatian:</strong> Tindakan ini akan menimpa data yang sesuai dengan isi file.
              </p>
              {restoreError && <p className="text-red-600 text-sm mb-4">{restoreError}</p>}
              <button onClick={() => restoreFileInputRef.current?.click()} disabled={isProcessing} className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 px-4 rounded-lg shadow-md transition-all flex items-center justify-center disabled:bg-orange-300">
                Pilih File Backup (.json)
              </button>
              <input type="file" ref={restoreFileInputRef} onChange={handleFileSelect} className="hidden" accept=".json" />
            </div>
        </div>

        {/* Delete Data Card */}
        <div className="bg-slate-800 rounded-xl shadow-2xl p-6 flex flex-col text-white relative overflow-hidden">
            <div className="absolute -top-12 -right-12 w-48 h-48 border-4 border-red-500/20 rounded-full"></div>
            <div className="relative z-10 flex flex-col h-full">
                <div className="flex items-start space-x-4 mb-4">
                    <div className="w-12 h-12 bg-red-500/20 rounded-lg flex items-center justify-center border border-red-500/30 flex-shrink-0">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-white">Hapus Data Permanen</h2>
                        <p className="text-sm text-slate-400">Area Berbahaya</p>
                    </div>
                </div>
                <p className="text-slate-300 mb-6 text-sm">
                    Pilih modul data yang ingin Anda hapus secara permanen dari sistem. Tindakan ini tidak dapat diurungkan.
                </p>
                
                <div className="space-y-3 flex-grow">
                    {modulesForDeletion.map(module => (
                        <label key={module.key} className="flex items-center p-3 bg-slate-700/50 rounded-lg cursor-pointer hover:bg-slate-700 transition-colors">
                            <input
                                type="checkbox"
                                name={module.key}
                                checked={modulesToDelete[module.key as keyof typeof modulesToDelete]}
                                onChange={handleDeleteCheckboxChange}
                                className="h-4 w-4 rounded bg-slate-900 border-slate-600 text-red-500 focus:ring-red-500 focus:ring-offset-slate-800"
                            />
                            <span className="ml-3 text-sm font-medium text-slate-200">{module.label}</span>
                        </label>
                    ))}
                </div>

                <button
                    onClick={() => setIsDeleteModalOpen(true)}
                    disabled={isDeleteButtonDisabled}
                    className="w-full mt-6 bg-slate-700 hover:bg-slate-600 text-slate-300 font-bold py-3 px-4 rounded-lg shadow-lg transition-all flex items-center justify-center disabled:bg-slate-900 disabled:cursor-not-allowed disabled:text-slate-500"
                >
                    Hapus Data Terpilih
                </button>
            </div>
        </div>
      </div>
      
       {isRestoreModalOpen && (
        <DestructiveConfirmationModal
            isOpen={isRestoreModalOpen}
            onClose={() => setIsRestoreModalOpen(false)}
            onConfirm={handleConfirmRestore}
            title="Konfirmasi Restore Data"
            confirmText="SAYA YAKIN"
            confirmButtonText="Ya, Restore Sekarang"
            confirmButtonColor="orange"
            isProcessing={isProcessing}
        >
             <p className="text-gray-600 mt-2">
                Anda akan menimpa data yang ada saat ini dengan data dari file backup. 
                Pastikan file backup valid. Tindakan ini <strong className="font-bold text-orange-600">tidak dapat diurungkan</strong>.
            </p>
        </DestructiveConfirmationModal>
      )}

      {isDeleteModalOpen && (
        <DestructiveConfirmationModal
            isOpen={isDeleteModalOpen}
            onClose={() => setIsDeleteModalOpen(false)}
            onConfirm={handleConfirmDeletion}
            title="Konfirmasi Hapus Data Permanen"
            confirmText="HAPUS DATA"
            confirmButtonText="Ya, Hapus Data Ini"
            isProcessing={isProcessing}
        >
             <p className="text-gray-600 mt-2">
                Anda akan menghapus data berikut secara <strong className="font-bold text-red-600">PERMANEN</strong>. 
                Tindakan ini <strong className="font-bold text-red-600">tidak dapat diurungkan</strong>.
            </p>
            <ul className="list-disc list-inside bg-red-50 p-3 rounded-md mt-4 text-sm text-red-800">
                {selectedForDeletionText.map(label => <li key={label}>{label}</li>)}
            </ul>
        </DestructiveConfirmationModal>
      )}
    </div>
  );
};

export default BackupScreen;
