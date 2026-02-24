
import React, { useState } from 'react';
import Header from '../components/Header';
import { AppConfig, User } from '../types';

interface TokenScreenProps {
  onTokenSubmit: (token: string) => Promise<boolean>;
  user: User;
  onLogout: () => void;
  config: AppConfig;
}

const TokenScreen: React.FC<TokenScreenProps> = ({ onTokenSubmit, user, onLogout, config }) => {
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      setError('Token tidak boleh kosong.');
      setTimeout(() => setError(''), 3000);
      return;
    }
    setIsLoading(true);
    const isValid = await onTokenSubmit(token);
    if (!isValid) {
      setError('Token ujian tidak valid atau sudah kedaluwarsa.');
      setTimeout(() => setError(''), 3000);
    }
    // If valid, the app navigates away, so we only need to handle the invalid case
    setIsLoading(false);
  };

  return (
    <div className="h-full flex flex-col bg-gray-50">
      <Header user={user} onLogout={onLogout} config={config} />
      <main className="flex-grow flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-xl shadow-xl p-8 animate-scale-up">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-gray-800">Masukkan Token Ujian</h2>
              <p className="text-gray-500 mt-2">Silakan masukkan token untuk memulai ujian yang sesuai.</p>
            </div>
            
            <form className="space-y-6" onSubmit={handleSubmit} noValidate>
              <div className="relative">
                 <input
                  type="text"
                  value={token}
                  onChange={(e) => setToken(e.target.value.replace(/\s/g, '').toUpperCase())}
                  className="w-full text-center tracking-[8px] font-bold text-lg p-4 bg-gray-50 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  placeholder="TOKEN"
                  required
                  autoCapitalize="characters"
                />
              </div>
              
              {error && <p className="text-red-500 text-sm text-center animate-pulse">{error}</p>}
              
              <button
                type="submit"
                style={{ backgroundColor: config.primaryColor }}
                disabled={isLoading}
                className="w-full py-3 px-4 text-white font-bold rounded-lg shadow-lg hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all duration-300 transform hover:-translate-y-1 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Memverifikasi...' : 'Lanjutkan'}
              </button>
            </form>
        </div>
      </main>
    </div>
  );
};

export default TokenScreen;
