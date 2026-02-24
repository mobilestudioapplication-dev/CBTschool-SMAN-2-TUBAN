









import React from 'react';

interface ErrorItem {
  user: string;
  message: string;
}

interface BulkImportProgressProps {
  processed: number;
  total: number;
  errors: ErrorItem[];
  onClose: () => void;
}

const BulkImportProgress: React.FC<BulkImportProgressProps> = ({ processed, total, errors, onClose }) => {
  const isFinished = processed === total;
  const percentage = total > 0 ? Math.round((processed / total) * 100) : 0;

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl transform animate-scale-up overflow-hidden">
        <div className="p-6">
          <h3 className="text-xl font-bold text-gray-800">{isFinished ? 'Proses Impor Selesai' : 'Sedang Memproses Impor...'}</h3>
          <p className="text-sm text-gray-500 mt-1">
            {isFinished
              ? `Selesai memproses ${total} data pengguna.`
              : 'Harap jangan menutup jendela ini. Proses massal sedang berjalan...'}
          </p>

          <div className="mt-6">
            <div className="flex justify-between items-center mb-1">
              <span className="text-sm font-medium text-gray-700">Progres</span>
              <span className="text-sm font-bold text-blue-600">{percentage}%</span>
            </div>
            {/* The progress bar */}
            <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
              <div
                className="h-4 bg-blue-600 rounded-full transition-all duration-300 ease-out"
                style={{ width: `${percentage}%` }}
              ></div>
            </div>
             <div className="text-right text-xs text-gray-500 mt-1">
              {processed} / {total} pengguna diproses
            </div>
          </div>

          {isFinished && errors.length > 0 && (
            <div className="mt-6">
                <div>
                  <h4 className="font-semibold text-red-600">Terjadi {errors.length} Error:</h4>
                  <div className="mt-2 bg-red-50 border border-red-200 rounded-md max-h-40 overflow-y-auto p-3 text-sm space-y-2">
                    {errors.map((err, index) => (
                      <div key={index}>
                        <p className="font-semibold text-red-800">Pengguna: <span className="font-mono">{err.user}</span></p>
                        <p className="text-red-700 pl-2">- {err.message}</p>
                      </div>
                    ))}
                  </div>
                </div>
            </div>
          )}
        </div>
        
        {isFinished && (
          <div className="p-4 bg-gray-50 border-t flex justify-end">
            <button
              onClick={onClose}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-lg"
            >
              Tutup
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default BulkImportProgress;