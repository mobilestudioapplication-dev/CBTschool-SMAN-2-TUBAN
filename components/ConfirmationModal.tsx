import React from 'react';

interface ConfirmationModalProps {
  title: string;
  message: string;
  confirmText: string;
  cancelText: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmColor?: 'green' | 'red' | 'blue' | 'gray';
  cancelColor?: 'green' | 'red' | 'blue' | 'gray';
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  title,
  message,
  confirmText,
  cancelText,
  onConfirm,
  onCancel,
  confirmColor = 'green',
  cancelColor = 'red'
}) => {
  const colorSchemes = {
    green: 'from-green-500 to-green-600',
    red: 'from-red-500 to-red-600',
    blue: 'from-blue-500 to-blue-600',
    gray: 'from-gray-500 to-gray-600',
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md text-center p-8 transform animate-scale-up">
        <h2 className="text-2xl font-bold text-gray-800 mb-4">{title}</h2>
        <p className="text-gray-600 mb-8">{message}</p>
        <div className="flex justify-center space-x-4">
          <button
            onClick={onConfirm}
            className={`text-white font-bold py-3 px-8 rounded-lg shadow-md hover:shadow-lg transition-all duration-300 transform hover:-translate-y-0.5 bg-gradient-to-r ${colorSchemes[confirmColor]}`}
          >
            {confirmText}
          </button>
          <button
            onClick={onCancel}
            className={`text-white font-bold py-3 px-8 rounded-lg shadow-md hover:shadow-lg transition-all duration-300 transform hover:-translate-y-0.5 bg-gradient-to-r ${colorSchemes[cancelColor]}`}
          >
            {cancelText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmationModal;