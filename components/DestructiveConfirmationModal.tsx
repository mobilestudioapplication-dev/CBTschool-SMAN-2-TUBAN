
import React, { useState } from 'react';

interface DestructiveConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  confirmText: string;
  confirmButtonText: string;
  confirmButtonColor?: 'red' | 'orange';
  isProcessing?: boolean;
  children: React.ReactNode;
}

const DestructiveConfirmationModal: React.FC<DestructiveConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  confirmText,
  confirmButtonText,
  confirmButtonColor = 'red',
  isProcessing = false,
  children
}) => {
  const [inputText, setInputText] = useState('');

  if (!isOpen) return null;

  const isConfirmed = inputText === confirmText;

  const colorStyles = {
    red: {
      bg: 'bg-red-600',
      hoverBg: 'hover:bg-red-700',
      disabledBg: 'disabled:bg-red-300',
      iconBg: 'bg-red-100',
      iconText: 'text-red-600',
      strongText: 'text-red-600',
      focusBorder: 'focus:border-red-500',
      focusRing: 'focus:ring-red-500',
    },
    orange: {
      bg: 'bg-orange-500',
      hoverBg: 'hover:bg-orange-600',
      disabledBg: 'disabled:bg-orange-300',
      iconBg: 'bg-orange-100',
      iconText: 'text-orange-600',
      strongText: 'text-orange-600',
      focusBorder: 'focus:border-orange-500',
      focusRing: 'focus:ring-orange-500',
    }
  };
  
  const styles = colorStyles[confirmButtonColor];

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg transform animate-scale-up">
        <div className="p-6 text-center">
            <div className={`w-16 h-16 ${styles.iconBg} rounded-full flex items-center justify-center mx-auto mb-4`}>
                <svg className={`w-8 h-8 ${styles.iconText}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            </div>
            <h3 className="text-2xl font-bold text-gray-800">{title}</h3>
            {children}
            <p className="mt-4 text-sm">
                Untuk melanjutkan, ketik <strong className={`${styles.strongText} font-mono`}>{confirmText}</strong> di kolom bawah ini.
            </p>
            <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                className={`w-full mt-2 p-2 text-center border-2 border-gray-300 rounded-md ${styles.focusBorder} ${styles.focusRing}`}
            />
        </div>
        <div className="p-4 bg-gray-50 flex justify-end space-x-2 rounded-b-2xl">
            <button onClick={onClose} className="bg-gray-200 text-gray-800 font-bold py-2 px-4 rounded-lg">Batal</button>
            <button 
                onClick={onConfirm} 
                disabled={!isConfirmed || isProcessing}
                className={`${styles.bg} ${styles.hoverBg} ${styles.disabledBg} text-white font-bold py-2 px-4 rounded-lg`}
            >
                {isProcessing ? 'Memproses...' : confirmButtonText}
            </button>
        </div>
      </div>
    </div>
  );
};

export default DestructiveConfirmationModal;
