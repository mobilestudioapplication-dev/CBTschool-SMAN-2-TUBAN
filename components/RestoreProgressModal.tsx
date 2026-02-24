import React from 'react';

interface RestoreProgressModalProps {
  progress: number;
  message: string;
}

const RestoreProgressModal: React.FC<RestoreProgressModalProps> = ({ progress, message }) => {
  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-md flex items-center justify-center z-[200] p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-8 transform animate-scale-up">
        <h3 className="text-xl font-bold text-gray-800 text-center">Memulihkan Data...</h3>
        <p className="text-sm text-gray-500 mt-2 text-center">
          Harap jangan menutup jendela ini. Proses pemulihan sedang berjalan.
        </p>
        <div className="mt-6">
          <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
            <div
              className="h-4 bg-gradient-to-r from-cyan-400 to-blue-500 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
          <p className="text-center text-blue-600 font-semibold mt-3 animate-pulse">{message}</p>
        </div>
      </div>
    </div>
  );
};

export default RestoreProgressModal;
