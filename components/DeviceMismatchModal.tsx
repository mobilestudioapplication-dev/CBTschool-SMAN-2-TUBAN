
import React from 'react';

interface DeviceMismatchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const DeviceMismatchModal: React.FC<DeviceMismatchModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-sm flex items-center justify-center z-[100] p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden transform animate-scale-up border-t-8 border-amber-500">
        <div className="p-8 text-center">
          <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Login Terkunci</h2>
          <p className="text-gray-600 mb-6 font-medium">
            Akun Anda terdeteksi masih aktif di perangkat lain. Sistem keamanan hanya mengizinkan satu perangkat.
          </p>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-8 text-left">
            <p className="text-amber-800 text-sm font-bold flex items-center mb-1">
              <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd"/></svg>
              Solusi:
            </p>
            <p className="text-amber-700 text-sm leading-relaxed">
              Hubungi <strong>Pengawas Ujian / Proktor</strong> di ruangan Anda untuk melakukan <strong>Reset Login</strong> pada akun Anda agar bisa pindah perangkat.
            </p>
          </div>

          <button
            onClick={onClose}
            className="w-full bg-slate-800 hover:bg-slate-900 text-white font-bold py-3.5 px-6 rounded-xl shadow-lg transition-all duration-300"
          >
            Kembali ke Beranda
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeviceMismatchModal;
