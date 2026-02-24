import React from 'react';
import { User, AppConfig } from '../types';

interface BiodataScreenProps {
  student: User;
  onConfirm: () => void;
  onLogout: () => void;
  config: AppConfig;
}

const BiodataScreen: React.FC<BiodataScreenProps> = ({ student, onConfirm, onLogout, config }) => {
  return (
    <div className="w-full flex-grow flex flex-col items-center justify-center relative py-16 px-4 overflow-y-auto">
        {/* Background Container - Absolute to fill parent */}
        <div className="absolute inset-0 overflow-hidden" style={{ backgroundColor: config.primaryColor }}>
            <div className="absolute -top-1/4 -left-1/4 w-1/2 h-full bg-white/10 rounded-full blur-3xl"></div>
            <div className="absolute -bottom-1/4 -right-1/4 w-1/2 h-full bg-white/10 rounded-full blur-3xl"></div>
        </div>
      
      <main className="relative z-10 w-full max-w-md my-auto">
        <div className="bg-white rounded-3xl shadow-2xl p-8 transform transition-all animate-scale-up border border-white/20">
            <div className="flex flex-col items-center text-center">
                <div className="relative -mt-24 mb-4 group">
                    <div className="absolute inset-0 rounded-full bg-black/20 blur-md transform translate-y-4 group-hover:translate-y-5 transition-transform"></div>
                    <img 
                        src={student.photoUrl} 
                        alt="Foto Profil Siswa" 
                        className="relative w-32 h-32 rounded-full object-cover border-4 border-white shadow-xl bg-gray-100"
                    />
                </div>
                
                <h2 className="text-2xl font-extrabold text-gray-800 tracking-tight">{student.fullName}</h2>
                <p className="text-gray-500 text-sm font-medium mt-1">Selamat datang di Ujian CBT!</p>
            </div>
            
            <div className="mt-8 space-y-3 bg-gray-50 rounded-xl p-5 border border-gray-100">
                <div className="flex justify-between items-center py-2 border-b border-gray-200 border-dashed">
                    <span className="text-gray-500 text-sm font-medium">NISN</span>
                    <span className="font-bold text-gray-800 font-mono">{student.nisn}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-gray-200 border-dashed">
                    <span className="text-gray-500 text-sm font-medium">Agama</span>
                    <span className="font-bold text-gray-800">{student.religion || '-'}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-gray-200 border-dashed">
                    <span className="text-gray-500 text-sm font-medium">Kelas</span>
                    <span className="font-bold text-gray-800">{student.class}</span>
                </div>
                <div className="flex justify-between items-center py-2">
                    <span className="text-gray-500 text-sm font-medium">Jurusan</span>
                    <span className="font-bold text-gray-800 text-right text-sm max-w-[50%] leading-tight">{student.major}</span>
                </div>
            </div>

            <div className="mt-8 space-y-3">
                <button
                    onClick={onConfirm}
                    style={{ backgroundColor: config.primaryColor }}
                    className="w-full py-3.5 px-4 text-white font-bold rounded-xl shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 hover:brightness-110 focus:outline-none focus:ring-4 focus:ring-blue-500/30 transition-all duration-300 transform hover:-translate-y-1"
                >
                    Lanjutkan ke Ujian
                </button>
                 <button
                    onClick={onLogout}
                    className="w-full py-3 px-4 bg-white border-2 border-gray-200 text-gray-600 font-bold rounded-xl hover:bg-gray-50 hover:border-gray-300 hover:text-red-500 transition-all duration-300"
                >
                    Logout
                </button>
            </div>
        </div>
      </main>
    </div>
  );
};

export default BiodataScreen;