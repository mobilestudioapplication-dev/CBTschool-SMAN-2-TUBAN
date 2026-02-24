
import React, { useEffect, useRef, useState } from 'react';

// html5-qrcode is loaded via script tag in index.html
// We declare it here to inform TypeScript about the global variable.
declare const Html5Qrcode: any;

interface QRScannerModalProps {
  onClose: () => void;
  onScanSuccess: (data: string) => void;
  onError: (error: string) => void;
}

const QRScannerModal: React.FC<QRScannerModalProps> = ({ onClose, onScanSuccess, onError }) => {
  const scannerRef = useRef<any>(null);
  const [status, setStatus] = useState('Menginisialisasi sistem optik...');

  useEffect(() => {
    if (typeof Html5Qrcode === 'undefined') {
        onError("Library Scanner belum siap. Periksa koneksi internet Anda.");
        onClose();
        return;
    }

    // Create a new scanner instance.
    const scanner = new Html5Qrcode('qr-reader');
    scannerRef.current = scanner;

    const startScanner = async () => {
      try {
        await scanner.start(
          { facingMode: 'environment' },
          {
            fps: 15, // Increased FPS for smoother feed
            qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
              const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
              const qrboxSize = Math.floor(minEdge * 0.75);
              return { width: qrboxSize, height: qrboxSize };
            },
            aspectRatio: 1.0,
          },
          (decodedText: string) => {
            // Successfully scanned. Stop the scanner and call the success handler.
            if (scannerRef.current && scannerRef.current.isScanning) {
                scannerRef.current.stop();
            }
            onScanSuccess(decodedText);
          },
          (errorMessage: string) => {
            // This callback is called for frames that don't contain a QR code.
            // We can ignore it for a cleaner user experience.
          }
        );
        setStatus('Sistem Siap. Arahkan ke QR Code.');
      } catch (err) {
        console.error('QR Scanner Start Error:', err);
        onError('Gagal memulai kamera. Pastikan izin telah diberikan.');
        onClose();
      }
    };

    startScanner();

    // Cleanup function to stop the scanner when the modal is closed.
    return () => {
      if (scannerRef.current && scannerRef.current.isScanning) {
        scannerRef.current.stop().catch((err: any) => {
            console.warn("Gagal menghentikan pemindai QR.", err);
        });
      }
    };
  }, [onClose, onScanSuccess, onError]);

  return (
    <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="relative bg-slate-800/50 border border-cyan-500/50 rounded-2xl shadow-[0_0_50px_rgba(6,182,212,0.15)] w-full max-w-md text-center p-6 transform animate-scale-up overflow-hidden">
        
        {/* Decorative background elements */}
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-cyan-900/20 via-slate-900/0 to-slate-900/0 -z-10"></div>

        <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-cyan-400 transition-colors z-30 group" aria-label="Tutup pemindai">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 transition-transform group-hover:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>

        <h2 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 to-blue-400 mb-2 tracking-widest uppercase" style={{ textShadow: '0 0 20px rgba(34, 211, 238, 0.5)' }}>
            SCAN QR CODE
        </h2>
        <p className="text-cyan-100/60 mb-6 text-sm font-mono">Posisikan Kode QR di dalam area target.</p>
        
        <div className="relative w-full aspect-square rounded-xl overflow-hidden bg-black shadow-2xl border border-cyan-900/50 group">
          
          {/* CAMERA FEED CONTAINER - Removed opacity and ensuring full size */}
          <div id="qr-reader" className="w-full h-full relative z-0" />
          
          {/* Hologram Overlay Elements - Sitting on top with z-10 */}
          <div className="absolute inset-0 pointer-events-none z-10">
            
            {/* Tech Grid Background - Reduced opacity slightly to ensure camera is visible */}
            <div className="absolute inset-0 bg-[linear-gradient(rgba(6,182,212,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(6,182,212,0.05)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_at_center,black_40%,transparent_100%)]"></div>

            {/* Futuristic Corners */}
            <div className="absolute top-4 left-4 w-12 h-12 border-t-[3px] border-l-[3px] border-cyan-400 rounded-tl-lg shadow-[0_0_15px_rgba(34,211,238,0.6)] transition-all duration-300 group-hover:top-3 group-hover:left-3 group-hover:shadow-[0_0_25px_rgba(34,211,238,0.9)]"></div>
            <div className="absolute top-4 right-4 w-12 h-12 border-t-[3px] border-r-[3px] border-cyan-400 rounded-tr-lg shadow-[0_0_15px_rgba(34,211,238,0.6)] transition-all duration-300 group-hover:top-3 group-hover:right-3 group-hover:shadow-[0_0_25px_rgba(34,211,238,0.9)]"></div>
            <div className="absolute bottom-4 left-4 w-12 h-12 border-b-[3px] border-l-[3px] border-cyan-400 rounded-bl-lg shadow-[0_0_15px_rgba(34,211,238,0.6)] transition-all duration-300 group-hover:bottom-3 group-hover:left-3 group-hover:shadow-[0_0_25px_rgba(34,211,238,0.9)]"></div>
            <div className="absolute bottom-4 right-4 w-12 h-12 border-b-[3px] border-r-[3px] border-cyan-400 rounded-br-lg shadow-[0_0_15px_rgba(34,211,238,0.6)] transition-all duration-300 group-hover:bottom-3 group-hover:right-3 group-hover:shadow-[0_0_25px_rgba(34,211,238,0.9)]"></div>

            {/* Scanning Laser Beam */}
            <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_20px_rgba(34,211,238,1),0_0_40px_rgba(34,211,238,0.5)] animate-hologram-scan opacity-80"></div>
            
            {/* Center Target Recticle */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 opacity-50">
               <div className="absolute top-0 left-1/2 -translate-x-1/2 w-0.5 h-3 bg-cyan-400"></div>
               <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-0.5 h-3 bg-cyan-400"></div>
               <div className="absolute left-0 top-1/2 -translate-y-1/2 w-3 h-0.5 bg-cyan-400"></div>
               <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-0.5 bg-cyan-400"></div>
               <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-1 bg-cyan-300 rounded-full shadow-[0_0_10px_rgba(34,211,238,1)] animate-ping"></div>
            </div>

            {/* Status Badge */}
             <div className="absolute bottom-8 left-0 w-full text-center">
                <span className="inline-flex items-center px-3 py-1 bg-black/40 backdrop-blur-md border border-cyan-500/30 rounded-full text-cyan-300 text-[10px] font-mono tracking-[0.2em] animate-pulse">
                    <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full mr-2 shadow-[0_0_5px_cyan]"></span>
                    LIVE SCANNING
                </span>
            </div>
          </div>
        </div>
        
        <div className="mt-6 flex items-center justify-center space-x-3 text-cyan-400/80 text-xs font-mono">
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
            <p className="uppercase tracking-widest">{status}</p>
        </div>
      </div>
      <style>{`
        /* Force the inner library containers to take full height */
        #qr-reader {
            border: none !important;
        }
        #qr-reader > div {
            width: 100% !important;
            height: 100% !important;
        }
        #qr-reader video {
            width: 100% !important;
            height: 100% !important;
            object-fit: cover;
            border-radius: 0.75rem;
            display: block !important;
        }
        /* Hide default ugly region selection box */
        #qr-reader__scan_region {
            display: none !important;
        }
        #qr-reader__dashboard_section_csr button {
            display: none !important;
        }
        
        @keyframes hologram-scan {
          0% { top: 5%; opacity: 0; scale: 0.95; }
          10% { opacity: 1; scale: 1; }
          90% { opacity: 1; scale: 1; }
          100% { top: 95%; opacity: 0; scale: 0.95; }
        }
        .animate-hologram-scan {
          animation: hologram-scan 2.5s cubic-bezier(0.4, 0, 0.2, 1) infinite;
        }
      `}</style>
    </div>
  );
};

export default QRScannerModal;
