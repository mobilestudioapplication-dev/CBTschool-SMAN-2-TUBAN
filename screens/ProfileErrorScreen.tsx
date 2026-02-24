
import React from 'react';
import Header from '../components/Header';
import { AppConfig } from '../types';

interface ProfileErrorScreenProps {
  onLogout: () => void;
  config: AppConfig;
}

const ProfileErrorScreen: React.FC<ProfileErrorScreenProps> = ({ onLogout, config }) => {
  return (
    <div className="h-full flex flex-col bg-gray-50">
      <Header onLogout={onLogout} config={config} />
      <main className="flex-grow flex items-center justify-center p-4">
         <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl p-8 text-center relative overflow-hidden border-t-8 border-red-500">
            <div className="relative z-10 flex flex-col items-center">
                <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mb-6">
                    <svg className="w-10 h-10 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                </div>

                <h2 className="text-2xl font-bold text-gray-800 mb-2">Data Siswa Tidak Ditemukan</h2>
                <p className="text-gray-600 mb-6">
                    Akun Anda berhasil login, namun data profil tidak muncul.
                </p>
                
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 text-left">
                    <p className="font-bold text-blue-800 text-sm mb-1">Apa yang harus saya lakukan?</p>
                    <p className="text-blue-700 text-sm">
                        Segera lapor kepada <strong>Pengawas Ujian</strong> atau <strong>Proktor</strong> di ruangan Anda. Tunjukkan layar ini kepada petugas.
                    </p>
                </div>
                
                <button
                    onClick={onLogout}
                    className="w-full bg-gray-800 text-white font-bold py-3 px-4 rounded-lg hover:bg-gray-900 transition-colors"
                >
                    Keluar / Logout
                </button>
            </div>
        </div>
      </main>
    </div>
  );
};

export default ProfileErrorScreen;
