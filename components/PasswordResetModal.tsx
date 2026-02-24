import React, { useState } from 'react';
import { User } from '../types';

interface PasswordResetModalProps {
  user: User;
  onClose: () => void;
  onConfirm: (userId: string, newPassword: string) => Promise<boolean>;
}

const PasswordResetModal: React.FC<PasswordResetModalProps> = ({ user, onClose, onConfirm }) => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (newPassword.length < 6) {
      setError('Password baru harus minimal 6 karakter.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Konfirmasi password tidak cocok.');
      return;
    }
    setIsSaving(true);
    const success = await onConfirm(user.id, newPassword);
    setIsSaving(false);
    if (success) {
      onClose();
    } else {
      setError('Gagal mengubah password. Silakan coba lagi.');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md transform animate-scale-up">
        <form onSubmit={handleSubmit}>
          <div className="p-6">
            <h3 className="text-xl font-bold text-gray-800">Reset Password</h3>
            <p className="text-sm text-gray-500 mt-1">
              Anda akan mengatur ulang password untuk: <span className="font-semibold">{user.fullName}</span>
            </p>
            <div className="space-y-4 mt-6">
              <div>
                <label className="block text-sm font-medium text-gray-700">Password Baru</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="mt-1 w-full p-2 border rounded-md"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Konfirmasi Password Baru</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="mt-1 w-full p-2 border rounded-md"
                  required
                />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>
          </div>
          <div className="p-4 bg-gray-50 border-t flex justify-end space-x-2 rounded-b-2xl">
            <button type="button" onClick={onClose} className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-4 rounded-lg">
              Batal
            </button>
            <button type="submit" disabled={isSaving} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg disabled:bg-blue-400">
              {isSaving ? 'Menyimpan...' : 'Simpan Perubahan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PasswordResetModal;
