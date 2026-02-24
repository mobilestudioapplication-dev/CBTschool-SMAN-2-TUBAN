
import React, { useState, useEffect } from 'react';
import { AppConfig } from '../types';

interface LoginScreenGuruProps {
  onLogin: (email: string, password: string) => Promise<string>;
  isLoading: boolean;
  config: AppConfig;
  onOpenQR: () => void;
}

const LoginScreenGuru: React.FC<LoginScreenGuruProps> = ({ onLogin, isLoading, config, onOpenQR }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState<React.ReactNode>('');
  const [previewEmail, setPreviewEmail] = useState('');

  // TARGET DOMAIN
  const cleanSchoolDomain = (config.emailDomain && config.emailDomain.includes('.')) 
        ? config.emailDomain.replace('@', '') 
        : 'smpn2demak.sch.id';

  // Helper: Bersihkan input user agar cocok dengan database (huruf kecil, tanpa spasi)
  const sanitizeInput = (input: string) => {
      return input.toLowerCase().replace(/\s+/g, '');
  };

  // Effect untuk menampilkan preview email secara real-time ke user
  useEffect(() => {
    const rawUser = username;
    if (!rawUser) {
        setPreviewEmail('');
        return;
    }
    
    const cleanUser = sanitizeInput(rawUser);

    if (cleanUser.includes('@')) {
        setPreviewEmail(cleanUser);
    } else {
        // FORMAT STANDAR GURU: username@teacher.[domain]
        setPreviewEmail(`${cleanUser}@teacher.${cleanSchoolDomain}`);
    }
  }, [username, cleanSchoolDomain]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError('');

    const rawUser = username;
    const cleanPass = password.trim();

    if (!rawUser) {
      setLocalError('Username atau Email wajib diisi.');
      return;
    }
    if (!cleanPass) {
        setLocalError('Password wajib diisi.');
        return;
    }

    const cleanUser = sanitizeInput(rawUser);

    // BLOKIR LOGIN ADMIN DI PINTU GURU (Sesuai permintaan)
    if (cleanUser === 'admin' || cleanUser.startsWith('admin@')) {
        setLocalError(
            <span>
                <strong>Akses Ditolak!</strong><br/>
                Akun Admin harus login melalui Pintu Admin (Klik Logo Sekolah 5x).
            </span>
        );
        return;
    }

    // KONSTRUKSI FINAL PAYLOAD
    let emailPayload = cleanUser;
    if (!cleanUser.includes('@')) {
        emailPayload = `${cleanUser}@teacher.${cleanSchoolDomain}`;
    }

    console.log("[LOGIN GURU] Attempting login:", emailPayload);

    const errorMsg = await onLogin(emailPayload, cleanPass);
    
    if (errorMsg) {
      const lowerErr = errorMsg.toLowerCase();
      if (lowerErr.includes("invalid login") || lowerErr.includes("invalid credential")) {
          setLocalError(
            <span>
              <strong>Login Gagal!</strong><br/>
              Username atau Password salah.<br/>
              <div className="mt-2 text-xs bg-red-100 p-2 rounded text-red-800 border border-red-200">
                Sistem mencoba login sebagai:<br/>
                <strong className="font-mono">{emailPayload}</strong>
              </div>
            </span>
          );
      } else {
          setLocalError(errorMsg);
      }
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Login Guru</h2>
        <p className="text-gray-500 text-sm mt-1">Masukkan Username dan Password</p>
      </div>

      {localError && (
        <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg mb-4 border border-red-200 flex items-start">
           <svg className="w-5 h-5 mr-2 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
           <span className="break-words w-full">{localError}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700 ml-1">Username / NIP</label>
          <div className="relative">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" /></svg>
            </span>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
              placeholder="Contoh: pakbudi"
              required
              autoComplete="username"
            />
          </div>
          {previewEmail && (
              <p className="text-xs text-gray-500 ml-1 mt-1">
                  Sistem membaca: <span className="font-mono font-semibold text-purple-600 bg-purple-50 px-1 rounded">{previewEmail}</span>
              </p>
          )}
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700 ml-1">Password</label>
          <div className="relative">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
               <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" /></svg>
            </span>
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full pl-10 pr-10 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
              placeholder="Password Akun"
              required
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-purple-600 focus:outline-none"
            >
              {showPassword ? (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
              ) : (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
              )}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="w-full py-3.5 px-4 text-white font-bold rounded-xl shadow-lg hover:shadow-xl focus:outline-none focus:ring-4 focus:ring-purple-500/30 transition-all duration-300 transform hover:-translate-y-0.5 disabled:bg-gray-400 disabled:cursor-not-allowed bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700"
        >
          {isLoading ? 'Memproses...' : 'Masuk Dashboard Guru'}
        </button>
      </form>
      
      {config.allowAdminQrLogin && (
        <div className="mt-8">
            <div 
                onClick={onOpenQR}
                role="button"
                className="group cursor-pointer w-full bg-purple-600 rounded-2xl p-4 flex items-center gap-4 shadow-lg shadow-purple-200 hover:shadow-xl hover:bg-purple-700 transition-all duration-300 transform hover:-translate-y-1 relative overflow-hidden"
            >
                <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-white/10 rounded-full blur-xl group-hover:bg-white/20 transition-all"></div>
                <div className="w-14 h-14 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm border border-white/30 flex-shrink-0 group-hover:scale-110 transition-transform duration-300">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1H-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                    </svg>
                </div>
                <div className="flex-1 relative z-10">
                    <h3 className="text-lg font-bold text-white leading-tight">Scan Kode QR</h3>
                    <p className="text-purple-100 text-xs mt-0.5">Login cepat menggunakan kartu ID Admin/Guru.</p>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default LoginScreenGuru;
