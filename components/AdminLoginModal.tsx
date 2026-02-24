import React, { useState, useRef, useEffect } from 'react';

interface AdminLoginModalProps {
  onClose: () => void;
  onAdminLogin: (username: string, password: string) => Promise<boolean>;
  onTriggerQRScan: () => void;
  initialUsername?: string;
}

const AdminLoginModal: React.FC<AdminLoginModalProps> = ({ onClose, onAdminLogin, onTriggerQRScan, initialUsername }) => {
  const [username, setUsername] = useState(initialUsername || '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const modalRef = useRef<HTMLDivElement>(null);
  const usernameInputRef = useRef<HTMLInputElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    const success = await onAdminLogin(username, password);
    if (!success) {
      setError('Username atau password salah.');
      if (modalRef.current) {
        modalRef.current.classList.add('animate-shake');
        setTimeout(() => {
          modalRef.current?.classList.remove('animate-shake');
        }, 500);
      }
      setTimeout(() => setError(''), 3000);
    }
  };
  
  useEffect(() => {
    if (initialUsername) {
      passwordInputRef.current?.focus();
    } else {
      usernameInputRef.current?.focus();
    }
    
    const style = document.createElement('style');
    style.innerHTML = `
      @keyframes shake {
        0%, 100% { transform: translateX(0); }
        10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
        20%, 40%, 60%, 80% { transform: translateX(5px); }
      }
      .animate-shake {
        animation: shake 0.5s ease-in-out;
      }
    `;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };

  }, [initialUsername]);

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-fade-in">
      <div 
        ref={modalRef}
        className="relative bg-slate-800/80 border border-cyan-500/30 rounded-2xl shadow-2xl w-full max-w-sm text-center p-8 transform animate-scale-up"
      >
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-500 hover:text-cyan-400 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>

        <div className="w-16 h-16 bg-cyan-500/10 rounded-full flex items-center justify-center mx-auto mb-6 border-2 border-cyan-500/30">
             <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-cyan-400" viewBox="0 0 20 20" fill="currentColor">
                <path d="M10 2a5 5 0 00-5 5v2a2 2 0 00-2 2v5a2 2 0 002 2h10a2 2 0 002-2v-5a2 2 0 00-2-2V7a5 5 0 00-5-5zm0 2a3 3 0 013 3v2H7V7a3 3 0 013-3z" />
            </svg>
        </div>

        <h2 className="text-2xl font-bold text-cyan-300 mb-2 tracking-wider uppercase">ADMIN ACCESS</h2>
        <p className="text-slate-400 mb-6 text-sm">Masukkan username & password otentikasi.</p>
        
        <form onSubmit={handleAuth} noValidate className="space-y-4">
            <div className="relative">
                 <input
                    ref={usernameInputRef}
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className={`w-full text-center tracking-wider p-3 bg-slate-900/50 border-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 transition-all text-white ${error ? 'border-red-500/50' : 'border-cyan-500/30'}`}
                    placeholder="Username Admin"
                    required
                    autoComplete="username"
                />
            </div>
            <div className="relative">
                <input
                    ref={passwordInputRef}
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={`w-full text-center tracking-widest font-mono text-lg p-3 bg-slate-900/50 border-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 transition-all text-white ${error ? 'border-red-500/50' : 'border-cyan-500/30'}`}
                    placeholder="••••••••"
                    required
                    autoComplete="current-password"
                />
            </div>

            {error && <p className="text-red-400 text-sm text-center mt-3 animate-pulse">{error}</p>}
              
            <button
                type="submit"
                className="w-full mt-2 py-3 px-4 bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-bold rounded-lg shadow-lg shadow-cyan-500/20 hover:shadow-xl hover:shadow-cyan-500/30 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 focus:ring-cyan-500 transition-all duration-300 transform hover:-translate-y-1"
            >
                Authenticate
            </button>
        </form>

        <div className="relative flex py-4 items-center">
            <div className="flex-grow border-t border-slate-600"></div>
            <span className="flex-shrink mx-4 text-slate-500 text-xs uppercase">atau</span>
            <div className="flex-grow border-t border-slate-600"></div>
        </div>

        <button
            type="button"
            onClick={onTriggerQRScan}
            className="w-full py-3 px-4 bg-slate-700/50 border-2 border-cyan-500/30 text-cyan-300 font-bold rounded-lg hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 focus:ring-cyan-500 transition-all duration-300 flex items-center justify-center space-x-2"
        >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 15.375a1.125 1.125 0 011.125-1.125h4.5a1.125 1.125 0 011.125 1.125v4.5a1.125 1.125 0 01-1.125-1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5z" />
            </svg>
            <span>Scan Kode QR</span>
        </button>
      </div>
    </div>
  );
};

export default AdminLoginModal;