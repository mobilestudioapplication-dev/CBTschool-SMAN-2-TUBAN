
import React from 'react';

interface DisqualificationModalProps {
  onLogout: () => void;
}

const DisqualificationModal: React.FC<DisqualificationModalProps> = ({ onLogout }) => {
  return (
    <div className="fixed inset-0 bg-red-900/90 backdrop-blur-lg flex items-center justify-center z-[100] p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-[0_0_60px_rgba(239,68,68,0.5)] w-full max-w-md text-center p-8 transform animate-scale-up border-t-8 border-red-600">
        <div className="w-24 h-24 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner animate-pulse">
           <svg className="w-12 h-12 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
           </svg>
        </div>
        <h2 className="text-3xl font-black text-red-600 mb-4 tracking-tighter">ANDA DIDISKUALIFIKASI</h2>
        <p className="text-gray-600 mb-8 font-medium leading-relaxed">
          Sesi ujian Anda telah dihentikan secara paksa oleh sistem karena terdeteksi melakukan pelanggaran batas toleransi.
        </p>
        <button
          onClick={onLogout}
          className="w-full bg-gradient-to-r from-red-600 to-red-700 text-white font-bold py-4 px-6 rounded-xl shadow-lg hover:shadow-red-500/50 transition-all duration-300 transform hover:-translate-y-1 focus:outline-none focus:ring-4 focus:ring-red-300"
        >
          KELUAR DARI APLIKASI
        </button>
      </div>
    </div>
  );
};

export default DisqualificationModal;