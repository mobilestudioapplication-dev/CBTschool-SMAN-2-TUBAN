
import React from 'react';

interface WarningModalProps {
  onClose: () => void;
  violationCount: number;
  antiCheatViolationLimit: number;
}

const WarningModal: React.FC<WarningModalProps> = ({ onClose, violationCount, antiCheatViolationLimit }) => {
  const chancesLeft = antiCheatViolationLimit - violationCount;

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-[100] p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-[0_0_50px_rgba(251,191,36,0.3)] w-full max-w-md text-center p-8 transform animate-scale-up border-t-8 border-yellow-400">
        <div className="w-20 h-20 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner animate-pulse">
          <svg className="w-10 h-10 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h2 className="text-2xl font-black text-gray-800 mb-2 uppercase tracking-wide">PERINGATAN PELANGGARAN</h2>
        <p className="text-gray-600 mb-6 font-medium">
          Aktivitas mencurigakan terdeteksi (keluar dari mode layar penuh atau beralih aplikasi).
        </p>
        
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-8">
            <p className="text-red-700 font-bold text-lg">
            Sisa kesempatan Anda: {chancesLeft} kali.
            </p>
            <p className="text-xs text-red-500 mt-1">
                Jika Anda melakukan pelanggaran sebanyak {antiCheatViolationLimit} kali, ujian akan dihentikan secara otomatis.
            </p>
        </div>

        <button
          onClick={onClose}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 px-6 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 focus:outline-none focus:ring-4 focus:ring-blue-300"
        >
          Kunci Layar & Lanjutkan Ujian
        </button>
      </div>
    </div>
  );
};

export default WarningModal;