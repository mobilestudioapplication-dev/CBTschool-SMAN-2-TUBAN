
import React, { useState } from 'react';
import Header from '../components/Header';
import AdminLoginModal from '../components/AdminLoginModal';
import { AppConfig } from '../types';
import QRScannerModal from '../components/QRScannerModal';
import LoginScreenSiswa from '../components/LoginScreenSiswa';
import LoginScreenGuru from '../components/LoginScreenGuru';

interface LoginScreenProps {
  config: AppConfig;
  onStudentLogin: (nisn: string, password: string) => Promise<string>;
  onAdminLogin: (email: string, password: string) => Promise<string>;
}

type TabType = 'student' | 'teacher';

const LoginScreen: React.FC<LoginScreenProps> = ({ config, onStudentLogin, onAdminLogin }) => {
  const [activeTab, setActiveTab] = useState<TabType>('student');
  const [isLoading, setIsLoading] = useState(false);
  
  // Modals state
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [error, setError] = useState('');

  const handleStudentSubmit = async (nisn: string, password: string) => {
      setIsLoading(true);
      const errorMsg = await onStudentLogin(nisn, password);
      setIsLoading(false);
      return errorMsg;
  };

  const handleTeacherSubmit = async (email: string, password: string) => {
      setIsLoading(true);
      // GURU LOGIN: Gunakan Direct Auth (onAdminLogin) karena Guru punya akun Auth
      // onStudentLogin menggunakan lookup manual yang sering gagal untuk email guru
      const errorMsg = await onAdminLogin(email, password);
      setIsLoading(false);
      return errorMsg;
  };

  const handleQRScanSuccess = async (scannedData: string) => {
    setIsScannerOpen(false);
    setIsLoading(true);

    try {
        const data = scannedData.trim().replace(/^"|"$/g, '');
        
        if (data.startsWith('cbtauth::student::')) {
            if (!config.allowStudentQrLogin) throw new Error("Login QR siswa dinonaktifkan.");
            const parts = data.split('::');
            if (parts.length < 4) throw new Error("Format QR tidak valid.");
            const [, , nisn, password] = parts;
            const err = await onStudentLogin(nisn, password);
            if(err) throw new Error(err);

        } else if (data.includes('cbtauth::admin')) {
             setIsAdminModalOpen(true);
        } else {
            throw new Error("Format QR tidak dikenali.");
        }
    } catch (err: any) {
        setError(err.message);
        setTimeout(() => setError(''), 5000);
    } finally {
        setIsLoading(false);
    }
  };

  // Helper untuk Admin Modal (Hidden Feature via Logo Click)
  const handleAdminModalLogin = async (u: string, p: string) => {
      const email = u.toLowerCase() === 'admin' ? 'admin@cbtschool.com' : u;
      const err = await onAdminLogin(email, p);
      return !err;
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 relative overflow-hidden font-sans">
      <Header pageType="login" onTriggerAdminLogin={() => setIsAdminModalOpen(true)} config={config} />
      
      <main className="relative z-10 w-full max-w-md px-4 mt-48 sm:mt-64 mb-10">
        
        {/* Error Toast */}
        {error && (
            <div className="mb-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative animate-fade-in" role="alert">
                <span className="block sm:inline">{error}</span>
            </div>
        )}

        <div className="bg-white rounded-3xl shadow-2xl overflow-hidden transform transition-all duration-300">
            
            {/* TABS HEADER */}
            <div className="flex border-b border-gray-100">
                <button
                    onClick={() => setActiveTab('student')}
                    className={`flex-1 py-4 text-sm font-bold uppercase tracking-wider transition-colors ${
                        activeTab === 'student' 
                        ? 'bg-white text-blue-600 border-b-4 border-blue-600' 
                        : 'bg-gray-50 text-gray-400 hover:bg-gray-100 hover:text-gray-600'
                    }`}
                >
                    Siswa
                </button>
                <button
                    onClick={() => setActiveTab('teacher')}
                    className={`flex-1 py-4 text-sm font-bold uppercase tracking-wider transition-colors ${
                        activeTab === 'teacher' 
                        ? 'bg-white text-purple-600 border-b-4 border-purple-600' 
                        : 'bg-gray-50 text-gray-400 hover:bg-gray-100 hover:text-gray-600'
                    }`}
                >
                    Guru / Staf
                </button>
            </div>

            {/* CONTENT */}
            <div className="p-8">
                {activeTab === 'student' ? (
                    <LoginScreenSiswa 
                        onLogin={handleStudentSubmit} 
                        isLoading={isLoading} 
                        config={config}
                        onOpenQR={() => setIsScannerOpen(true)}
                    />
                ) : (
                    <LoginScreenGuru 
                        onLogin={handleTeacherSubmit} 
                        isLoading={isLoading} 
                        config={config}
                        onOpenQR={() => setIsScannerOpen(true)} // Admin QR check
                    />
                )}
            </div>
        </div>
        
      </main>

      {/* Modals */}
      {isAdminModalOpen && (
        <AdminLoginModal 
          onClose={() => setIsAdminModalOpen(false)}
          onAdminLogin={handleAdminModalLogin}
          onTriggerQRScan={() => {
            setIsAdminModalOpen(false);
            setIsScannerOpen(true);
          }}
          initialUsername="admin"
        />
      )}
      
      {isScannerOpen && (
        <QRScannerModal 
          onClose={() => setIsScannerOpen(false)}
          onScanSuccess={handleQRScanSuccess}
          onError={(msg) => { setError(msg); setTimeout(() => setError(''), 4000); }}
        />
      )}
    </div>
  );
};

export default LoginScreen;
