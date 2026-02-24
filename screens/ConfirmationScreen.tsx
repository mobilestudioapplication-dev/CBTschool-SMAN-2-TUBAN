
import React, { useState } from 'react';
import Header from '../components/Header';
import { TestDetails, AppConfig, User } from '../types';
import SecureModeIntroModal from '../components/SecureModeIntroModal';

interface ConfirmationScreenProps {
  onStartTest: () => void;
  user: User;
  onLogout: () => void;
  testDetails: TestDetails;
  config: AppConfig;
}

const ConfirmationScreen: React.FC<ConfirmationScreenProps> = ({ onStartTest, user, onLogout, testDetails, config }) => {
  const [showSecureModal, setShowSecureModal] = useState(false);

  // Helper robust untuk request fullscreen di berbagai browser/device
  const triggerFullscreen = async () => {
    const docEl = document.documentElement as any;
    const requestMethod = docEl.requestFullscreen || 
                          docEl.webkitRequestFullscreen || 
                          docEl.mozRequestFullScreen || 
                          docEl.msRequestFullscreen;

    if (requestMethod) {
      try {
        await requestMethod.call(docEl);
      } catch (err) {
        console.warn("Fullscreen request failed or denied:", err);
      }
    }
  };

  const handleStartClick = () => {
    // Jika anti-cheat aktif, tampilkan modal peringatan dulu.
    if (config.enableAntiCheat) {
      setShowSecureModal(true);
    } else {
      // Jika tidak aktif, tetap coba fullscreen untuk UX yang lebih baik, lalu mulai
      triggerFullscreen();
      onStartTest();
    }
  };

  const handleSecureConfirm = async () => {
    // 1. Paksa Fullscreen
    await triggerFullscreen();
    
    // 2. Tutup modal & Masuk ke Ujian
    setShowSecureModal(false);
    onStartTest();
  };

  return (
    <div className="h-full flex flex-col bg-gray-50">
      <Header user={user} onLogout={onLogout} config={config} />
      <main className="flex-grow flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-xl shadow-xl p-8 animate-scale-up">
            <h2 className="text-2xl font-bold text-gray-800 mb-6">Konfirmasi Tes</h2>
            <div className="space-y-4">
                <div className="py-2 border-b border-gray-200">
                    <p className="text-sm text-gray-500">Nama Tes</p>
                    <p className="text-lg font-bold text-gray-900">{testDetails.name}</p>
                </div>
                <div className="py-2 border-b border-gray-200">
                    <p className="text-sm text-gray-500">Mata Pelajaran</p>
                    <p className="text-lg font-bold text-gray-900">{testDetails.subject}</p>
                </div>
                <div className="py-2 border-b border-gray-200">
                    <p className="text-sm text-gray-500">Waktu Tes</p>
                    <p className="text-lg font-bold text-gray-900">{testDetails.time}</p>
                </div>
                <div className="py-2">
                    <p className="text-sm text-gray-500">Alokasi Waktu Tes</p>
                    <p className="text-lg font-bold text-gray-900">{testDetails.duration}</p>
                </div>
            </div>

            <div className="mt-8">
                <button
                    onClick={handleStartClick}
                    style={{ backgroundColor: config.primaryColor }}
                    className="w-full text-white font-bold py-3 px-6 rounded-lg shadow-lg hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 focus:outline-none focus:ring-4 focus:ring-blue-300"
                >
                    MULAI MENGERJAKAN
                </button>
            </div>
        </div>
      </main>

      {showSecureModal && (
        <SecureModeIntroModal 
          onConfirm={handleSecureConfirm} 
          onCancel={() => setShowSecureModal(false)} 
        />
      )}
    </div>
  );
};

export default ConfirmationScreen;