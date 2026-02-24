
import React from 'react';

interface SecureModeIntroModalProps {
  onConfirm: () => void;
  onCancel: () => void;
}

const SecureModeIntroModal: React.FC<SecureModeIntroModalProps> = ({ onConfirm, onCancel }) => {
  return (
    <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-sm flex items-center justify-center z-[100] p-4 animate-fade-in overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden transform animate-scale-up border border-slate-700 my-auto">
        {/* Header */}
        <div className="bg-[#1e293b] p-5 sm:p-6 text-center border-b border-slate-700">
          <div className="w-12 h-12 sm:w-16 sm:h-16 bg-blue-600/20 rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4 border border-blue-500/50">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 sm:h-8 sm:w-8 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-white tracking-wide">SECURE EXAM MODE</h2>
          <p className="text-blue-200/80 text-xs sm:text-sm mt-1">Sistem Proteksi Ujian Aktif</p>
        </div>

        {/* Content */}
        <div className="p-5 sm:p-8">
          <p className="text-gray-600 text-center mb-6 sm:mb-8 font-medium text-sm sm:text-base">
            Anda akan memasuki mode ujian terkunci. Sistem akan memantau aktivitas layar Anda secara penuh.
          </p>

          <div className="space-y-3 sm:space-y-4">
            <div className="flex items-start p-3 sm:p-4 bg-red-50 border border-red-100 rounded-xl">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 sm:h-6 sm:w-6 text-red-500 mr-3 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <h4 className="font-bold text-red-800 text-sm">DILARANG Pindah Tab / Aplikasi</h4>
                <p className="text-xs text-red-600 mt-1">Aktivitas keluar dari layar ujian akan tercatat sebagai pelanggaran.</p>
              </div>
            </div>

            <div className="flex items-start p-3 sm:p-4 bg-blue-50 border border-blue-100 rounded-xl">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 sm:h-6 sm:w-6 text-blue-500 mr-3 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              </svg>
              <div>
                <h4 className="font-bold text-blue-800 text-sm">Layar Penuh Otomatis</h4>
                <p className="text-xs text-blue-600 mt-1">Layar akan terkunci penuh. Jangan mencoba mengecilkan atau menutup browser.</p>
              </div>
            </div>

            <div className="flex items-start p-3 sm:p-4 bg-yellow-50 border border-yellow-100 rounded-xl">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 sm:h-6 sm:w-6 text-yellow-600 mr-3 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <h4 className="font-bold text-yellow-800 text-sm">Diskualifikasi Otomatis</h4>
                <p className="text-xs text-yellow-700 mt-1">Sistem akan menghentikan ujian jika batas pelanggaran terlampaui.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-6 border-t bg-gray-50 flex flex-col-reverse sm:flex-row gap-3 sm:gap-4">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-3 bg-gray-200 text-gray-700 font-bold rounded-xl hover:bg-gray-300 transition-colors text-sm"
          >
            Batalkan
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 text-sm flex items-center justify-center gap-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
            </svg>
            KUNCI LAYAR & MULAI
          </button>
        </div>
      </div>
    </div>
  );
};

export default SecureModeIntroModal;