

import React from 'react';
import Header from '../components/Header';
import { AppConfig, User } from '../types';

interface FinishScreenProps {
  onLogout: () => void;
  user: User;
  config: AppConfig;
}

const FinishScreen: React.FC<FinishScreenProps> = ({ onLogout, user, config }) => {
  return (
    <div className="h-full flex flex-col bg-gray-50">
      <Header user={user} onLogout={onLogout} config={config} />
      <main className="flex-grow flex items-center justify-center p-4">
         <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl p-12 text-center relative overflow-hidden">
            <div className="absolute -top-16 -right-16 w-48 h-48 bg-green-500/5 rounded-full"></div>
            <div className="absolute -bottom-24 -left-24 w-60 h-60 bg-green-500/5 rounded-full"></div>
            
            <div className="relative z-10 flex flex-col items-center">
                <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-6">
                    <svg className="w-12 h-12 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                </div>

                <h2 className="text-3xl font-extrabold text-gray-800 mb-4">Tes Selesai!</h2>
                <p className="text-gray-600 max-w-md mx-auto mb-8">
                    Terima kasih telah berpartisipasi. Jawaban Anda telah disimpan. Silakan klik tombol di bawah untuk keluar.
                </p>
                <button
                    onClick={onLogout}
                    className="bg-gradient-to-r from-green-500 to-green-600 text-white font-bold py-3 px-16 rounded-lg shadow-lg hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 focus:outline-none focus:ring-4 focus:ring-green-300"
                >
                    SIMPAN & KELUAR
                </button>
            </div>
        </div>
      </main>
    </div>
  );
};

export default FinishScreen;