
import React, { useRef } from 'react';
import { User, AppConfig } from '../types';

interface AdminCardProps {
  adminUser: User;
  config: AppConfig;
}

const AdminCard: React.FC<AdminCardProps> = ({ adminUser, config }) => {
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    if (!printRef.current) return;

    // 1. Ambil konten kartu
    const content = printRef.current.innerHTML;
    
    // 2. Buat iframe tersembunyi untuk proses cetak yang terisolasi
    const iframe = document.createElement('iframe');
    iframe.style.position = 'absolute';
    iframe.style.width = '0px';
    iframe.style.height = '0px';
    iframe.style.border = 'none';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (doc) {
        doc.open();
        doc.write(`
            <html>
                <head>
                    <title>Cetak Kartu Admin - ${config.schoolName}</title>
                    <style>
                        body {
                            font-family: 'Inter', sans-serif;
                            display: flex;
                            justify-content: center;
                            align-items: center;
                            height: 100vh;
                            margin: 0;
                            background-color: white;
                            -webkit-print-color-adjust: exact !important;
                            print-color-adjust: exact !important;
                        }
                        /* Tailwind Utilities Replacement for Print */
                        .relative { position: relative; }
                        .rounded-3xl { border-radius: 1.5rem; }
                        .shadow-2xl { box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25); }
                        .overflow-hidden { overflow: hidden; }
                        .flex { display: flex; }
                        .items-center { align-items: center; }
                        .justify-center { justify-content: center; }
                        .justify-between { justify-content: space-between; }
                        .flex-col { flex-direction: column; }
                        .text-center { text-align: center; }
                        .text-white { color: white; }
                        .p-8 { padding: 2rem; }
                        .mt-5 { margin-top: 1.25rem; }
                        .mt-3 { margin-top: 0.75rem; }
                        .mb-8 { margin-bottom: 2rem; }
                        .border { border-width: 1px; }
                        .border-white\\/10 { border-color: rgba(255, 255, 255, 0.1); }
                        .bg-black\\/20 { background-color: rgba(0, 0, 0, 0.2); }
                        .backdrop-blur-2xl { backdrop-filter: blur(40px); }
                        .w-full { width: 100%; }
                        .h-full { height: 100%; }
                        .absolute { position: absolute; }
                        .inset-0 { top: 0; right: 0; bottom: 0; left: 0; }
                        .object-contain { object-fit: contain; }
                        .object-cover { object-fit: cover; }
                        .rounded-full { border-radius: 9999px; }
                        .font-bold { font-weight: 700; }
                        .font-extrabold { font-weight: 800; }
                        .text-sm { font-size: 0.875rem; line-height: 1.25rem; }
                        .text-xs { font-size: 0.75rem; line-height: 1rem; }
                        .text-3xl { font-size: 1.875rem; line-height: 2.25rem; }
                        .tracking-widest { letter-spacing: 0.1em; }
                        .bg-white { background-color: white; }
                        .text-slate-400 { color: #94a3b8; }
                        .text-cyan-300 { color: #67e8f9; }
                        .bg-black\\/30 { background-color: rgba(0, 0, 0, 0.3); }
                        .px-4 { padding-left: 1rem; padding-right: 1rem; }
                        .py-1\\.5 { padding-top: 0.375rem; padding-bottom: 0.375rem; }
                        .w-10 { width: 2.5rem; }
                        .h-10 { height: 2.5rem; }
                        .w-32 { width: 8rem; }
                        .h-32 { height: 8rem; }
                        .w-40 { width: 10rem; }
                        .h-40 { height: 10rem; }
                        .p-1 { padding: 0.25rem; }
                        .p-3 { padding: 0.75rem; }
                        .rounded-xl { border-radius: 0.75rem; }
                        .rounded-md { border-radius: 0.375rem; }
                        .shadow-lg { box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1); }
                        
                        /* Background Gradient Enforcement */
                        .futuristic-card {
                            background: linear-gradient(135deg, #0f172a 0%, #1e3a8a 50%, #312e81 100%) !important;
                            -webkit-print-color-adjust: exact;
                            print-color-adjust: exact;
                        }
                    </style>
                </head>
                <body>
                    <div style="transform: scale(0.9);">
                        ${content}
                    </div>
                </body>
            </html>
        `);
        doc.close();
        
        // Tunggu gambar load sebelum print
        setTimeout(() => {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
            // Hapus iframe setelah print (diberi delay agar print dialog tidak putus)
            setTimeout(() => {
                document.body.removeChild(iframe);
            }, 1000);
        }, 500);
    }
  };

  const qrData = adminUser.qr_login_password
    ? `cbtauth::admin_pw::${adminUser.username}::${adminUser.qr_login_password}`
    : `cbtauth::admin::${adminUser.username}::${adminUser.id}`;

  const displayUsername = adminUser.username.split('@')[0];

  return (
    <div className="animate-fade-in w-full h-full flex flex-col items-center">
      <div className="w-full flex justify-between items-center mb-8 px-8 mt-4 no-print">
        <h1 className="text-3xl font-bold text-gray-800">Cetak Kartu Admin</h1>
        <button
          onClick={handlePrint}
          className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg shadow-md hover:shadow-lg transition-transform transform hover:-translate-y-0.5 flex items-center space-x-2"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5 4v3H4a2 2 0 00-2 2v3a2 2 0 002 2h1v3a2 2 0 002 2h8a2 2 0 002-2v-3h1a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a2 2 0 00-2-2H7a2 2 0 00-2 2zm8 0H7v3h6V4zm0 8H7v4h6v-4z" clipRule="evenodd" /></svg>
          <span>Cetak Kartu</span>
        </button>
      </div>

      <div className="flex-grow flex justify-center items-start pt-10">
        {/* WRAPPER REF UNTUK ISI KARTU SAJA */}
        <div ref={printRef}>
            <div 
            className="futuristic-card relative rounded-3xl shadow-2xl overflow-hidden flex items-center justify-center" 
            style={{ 
                width: '400px', 
                height: '600px',
                background: 'linear-gradient(135deg, #0f172a 0%, #1e3a8a 50%, #312e81 100%)', // Fallback inline style
                border: '1px solid #334155'
            }}
            >
            {/* Pattern Overlay */}
            <div 
                className="absolute inset-0 w-full h-full opacity-20" 
                style={{ 
                    backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(255,255,255,0.15) 1px, transparent 0)', 
                    backgroundSize: '20px 20px' 
                }}
            ></div>
            
            <div className="relative w-[90%] h-[95%] bg-black/20 backdrop-blur-md border border-white/10 rounded-2xl p-8 flex flex-col justify-between items-center text-center text-white">
                
                <div className="flex items-center space-x-3 self-start w-full border-b border-white/10 pb-4">
                <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center p-1 shadow-lg">
                    <img src={config.logoUrl} alt="Logo" className="w-full h-full object-contain" />
                </div>
                <div className="text-left flex-1">
                    <p className="font-bold text-sm leading-tight uppercase tracking-wider">{config.schoolName}</p>
                    <p className="text-[10px] text-cyan-300 font-mono mt-0.5">SECURE ACCESS PASS</p>
                </div>
                </div>

                <div className="flex flex-col items-center mt-2">
                <div className="relative group">
                    <div className="absolute -inset-1 bg-gradient-to-r from-cyan-400 to-blue-500 rounded-full blur opacity-25 group-hover:opacity-75 transition duration-1000 group-hover:duration-200"></div>
                    <img 
                    src={adminUser.photoUrl} 
                    alt="Foto Admin" 
                    className="relative w-36 h-36 rounded-full object-cover border-4 border-slate-700/50 shadow-2xl"
                    />
                </div>
                
                <h2 className="font-extrabold text-2xl tracking-widest mt-6 mb-1 text-white drop-shadow-md">{adminUser.fullName.toUpperCase()}</h2>
                <span className="bg-blue-600/80 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider text-blue-100 shadow-sm">Administrator</span>
                </div>

                <div className="mt-6 bg-white p-3 rounded-xl shadow-xl">
                <img 
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(qrData)}&qzone=1&ecc=M`}
                    alt="QR Code Admin Login" 
                    className="w-40 h-40 object-contain"
                />
                </div>
                <p className="text-[10px] text-slate-400 mt-2 font-mono">@{displayUsername}</p>

            </div>
            </div>
        </div>
      </div>
    </div>
  );
};

export default AdminCard;
