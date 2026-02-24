
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { User, AppConfig } from '../types';

declare const html2pdf: any;

interface ExamCardsProps {
  users: User[];
  config: AppConfig;
}

const ExamCards: React.FC<ExamCardsProps> = ({ users, config }) => {
  const safeConfig = useMemo(() => ({
    defaultPaperSize: config?.defaultPaperSize || 'A4',
    primaryColor: config?.primaryColor || '#2563eb', 
    schoolName: config?.schoolName || 'NAMA SEKOLAH',
    logoUrl: config?.logoUrl || '',
    leftLogoUrl: config?.leftLogoUrl || '', // New
    headmasterName: config?.headmasterName || 'Kepala Sekolah',
    headmasterNip: config?.headmasterNip || '-',
    cardIssueDate: config?.cardIssueDate || 'Tempat, Tanggal',
    signatureUrl: config?.signatureUrl,
    stampUrl: config?.stampUrl,
    currentExamEvent: config?.currentExamEvent || 'KARTU PESERTA UJIAN',
    academicYear: config?.academicYear,
    kopHeader1: config?.kopHeader1 || 'PEMERINTAH PROVINSI',
    kopHeader2: config?.kopHeader2 || 'DINAS PENDIDIKAN'
  }), [config]);

  const [searchTerm, setSearchTerm] = useState('');
  const [classFilter, setClassFilter] = useState('all');
  const [isProcessing, setIsProcessing] = useState(false);
  const [paperSize, setPaperSize] = useState<'A4' | 'F4'>(safeConfig.defaultPaperSize as 'A4' | 'F4' || 'A4');
  
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(12); 

  const printRef = useRef<HTMLDivElement>(null);

  const studentUsers = useMemo(() => {
    if (!users) return [];
    return users.filter(u => u.username !== 'admin@cbtschool.com' && (!u.role || u.role === 'student'));
  }, [users]);
  
  const classList = useMemo(() => ['all', ...Array.from(new Set(studentUsers.map(u => u.class))).sort()], [studentUsers]);

  const filteredUsers = useMemo(() => {
    return studentUsers.filter(user => {
      const searchLower = searchTerm.toLowerCase();
      const matchesSearch = searchLower === '' ||
                            (user.fullName || '').toLowerCase().includes(searchLower) ||
                            (user.nisn || '').includes(searchLower);
      const matchesClass = classFilter === 'all' || user.class === classFilter;
      return matchesSearch && matchesClass;
    }).sort((a, b) => (a.class || '').localeCompare(b.class || '') || (a.fullName || '').localeCompare(b.fullName || ''));
  }, [studentUsers, searchTerm, classFilter]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, classFilter, rowsPerPage]);

  const totalItems = filteredUsers.length;
  const totalPages = rowsPerPage === 0 ? 1 : Math.ceil(totalItems / rowsPerPage);
  
  const displayedUsers = useMemo(() => {
      if (rowsPerPage === 0) return filteredUsers;
      const startIndex = (currentPage - 1) * rowsPerPage;
      const endIndex = startIndex + rowsPerPage;
      return filteredUsers.slice(startIndex, endIndex);
  }, [filteredUsers, currentPage, rowsPerPage]);

  const handlePageChange = (newPage: number) => {
      if (newPage >= 1 && newPage <= totalPages) {
          setCurrentPage(newPage);
      }
  };

  const academicYear = useMemo(() => {
      // Use config first, fallback to calculation
      if (safeConfig.academicYear) return safeConfig.academicYear;
      
      const year = new Date().getFullYear();
      const month = new Date().getMonth();
      if (month > 5) return `${year}/${year + 1}`;
      return `${year - 1}/${year}`;
  }, [safeConfig.academicYear]);

  const handleDownloadPDF = async () => {
    if (!printRef.current) return;
    
    const scrollPos = window.scrollY;
    window.scrollTo(0, 0); 
    setIsProcessing(true);

    try {
        const A4_WIDTH_PX = 794; 
        const F4_WIDTH_PX = 816; 
        const targetWidthPx = paperSize === 'A4' ? A4_WIDTH_PX : F4_WIDTH_PX;
        
        const content = printRef.current.cloneNode(true) as HTMLElement;

        content.style.transform = 'none'; 
        content.style.width = '100%'; 
        content.style.margin = '0 auto'; 
        content.style.padding = '10mm 5mm 5mm 15mm'; 
        content.style.boxSizing = 'border-box';
        content.removeAttribute('id'); 

        const gridContainer = content.querySelector('.grid-layout-target') as HTMLElement;
        if (gridContainer) {
            gridContainer.style.display = 'grid';
            gridContainer.style.gridTemplateColumns = 'repeat(3, 1fr)'; 
            gridContainer.style.gap = '4mm'; 
            gridContainer.style.width = '100%';
        }

        const sandbox = document.createElement('div');
        sandbox.style.position = 'absolute';
        sandbox.style.top = '-10000px';
        sandbox.style.left = '0';
        sandbox.style.width = `${targetWidthPx}px`;
        sandbox.style.backgroundColor = '#ffffff';
        sandbox.appendChild(content);
        document.body.appendChild(sandbox);

        const images = Array.from(sandbox.querySelectorAll('img'));
        await Promise.all(images.map(img => {
            if (img.complete && img.naturalHeight !== 0) return Promise.resolve();
            return new Promise((resolve) => {
                img.onload = resolve;
                img.onerror = resolve;
                if (!img.complete) img.src = img.src; 
            });
        }));

        await new Promise(resolve => setTimeout(resolve, 800));

        const filename = `Kartu_Ujian_${classFilter === 'all' ? 'Semua' : classFilter.replace(/\s+/g, '_')}_Page${currentPage}_${new Date().toISOString().slice(0,10)}.pdf`;

        const opt = {
            margin: [5, 5, 5, 5], 
            filename: filename,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { 
                scale: 2, 
                useCORS: true, 
                width: targetWidthPx,
                windowWidth: targetWidthPx,
                scrollX: 0,
                scrollY: 0,
            },
            jsPDF: { 
                unit: 'mm', 
                format: paperSize === 'A4' ? 'a4' : [215, 330], 
                orientation: 'portrait' 
            },
            pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
        };

        await html2pdf().set(opt).from(content).save();
        document.body.removeChild(sandbox);
    
    } catch (err) {
        console.error("PDF Fail:", err);
        alert("Gagal membuat PDF. Gunakan fitur Print Browser sebagai alternatif.");
    } finally {
        window.scrollTo(0, scrollPos);
        setIsProcessing(false);
    }
  };

  const handlePrint = () => {
      document.body.classList.add('printing-exam-cards');
      if (!printRef.current) return;
      
      const printContents = printRef.current.innerHTML;
      const printContainer = document.createElement('div');
      printContainer.className = 'print-container-root'; 
      printContainer.innerHTML = printContents;
      
      const root = document.getElementById('root');
      if(root) root.style.display = 'none';
      document.body.appendChild(printContainer);
      
      window.print();
      
      document.body.removeChild(printContainer);
      if(root) root.style.display = 'block';
      document.body.classList.remove('printing-exam-cards');
  }

  return (
    <div className="animate-fade-in flex flex-col h-full bg-slate-100 relative">
      
      {isProcessing && (
        <div className="fixed inset-0 z-[9999] bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
            <h3 className="text-lg font-bold text-slate-700">Menyusun Kartu Ujian...</h3>
        </div>
      )}

      {/* Control Bar */}
      <div className="bg-white border-b border-slate-200 p-4 sticky top-0 z-30 shadow-sm no-print">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div>
                <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2" /></svg>
                    Cetak Kartu Ujian (12/Page)
                </h1>
                <p className="text-sm text-slate-500 mt-1">Total Siswa Terfilter: <span className="font-bold text-blue-600">{totalItems}</span></p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center bg-slate-100 rounded-lg p-1 border border-slate-200">
                    <label className="text-xs font-bold text-slate-500 uppercase px-3">Kertas:</label>
                    <select value={paperSize} onChange={(e) => setPaperSize(e.target.value as 'A4' | 'F4')} className="bg-white text-sm font-semibold text-slate-700 py-1.5 px-3 rounded-md border-0 focus:ring-2 focus:ring-blue-500 cursor-pointer shadow-sm">
                        <option value="A4">A4</option>
                        <option value="F4">F4</option>
                    </select>
                </div>
                <button onClick={handleDownloadPDF} disabled={displayedUsers.length === 0 || isProcessing} className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-5 rounded-lg shadow-md transition-all disabled:opacity-50"><span>PDF</span></button>
                <button onClick={handlePrint} disabled={displayedUsers.length === 0} className="flex items-center gap-2 bg-white border border-slate-300 text-slate-700 font-bold py-2 px-4 rounded-lg hover:bg-slate-50 transition-all shadow-sm"><span>Print</span></button>
            </div>
        </div>

        <div className="mt-4 flex flex-col md:flex-row gap-4">
            <div className="w-full md:w-auto flex-grow relative">
                <input type="text" placeholder="Cari Nama / NISN..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full pl-4 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <div className="w-full md:w-64">
                 <select value={classFilter} onChange={e => setClassFilter(e.target.value)} className="w-full p-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none">
                    <option value="all">Semua Kelas</option>
                    {classList.slice(1).map(c => <option key={c} value={c}>{c}</option>)}
                </select>
            </div>
        </div>

        <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-4 p-2 bg-slate-50 border border-slate-200 rounded-lg">
            <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-600 font-medium">Tampilkan:</span>
                <select value={rowsPerPage} onChange={(e) => setRowsPerPage(Number(e.target.value))} className="p-1.5 border border-gray-300 rounded-md text-sm font-bold text-gray-700 bg-white">
                    <option value={12}>12 Kartu</option>
                    <option value={6}>6 Kartu</option>
                    <option value={0}>Semua</option>
                </select>
            </div>
            <div className="flex items-center space-x-2">
                <button onClick={() => handlePageChange(currentPage - 1)} disabled={currentPage === 1} className="p-2 rounded-md border border-gray-300 bg-white hover:bg-gray-100 disabled:opacity-50">&lt;</button>
                <span className="text-sm text-gray-600">Page <input type="number" min={1} max={totalPages} value={currentPage} onChange={(e) => { const val = parseInt(e.target.value); if (!isNaN(val)) handlePageChange(val); }} className="w-12 p-1.5 text-center font-bold border border-gray-300 rounded-md" /> of <b>{totalPages}</b></span>
                <button onClick={() => handlePageChange(currentPage + 1)} disabled={currentPage === totalPages} className="p-2 rounded-md border border-gray-300 bg-white hover:bg-gray-100 disabled:opacity-50">&gt;</button>
            </div>
        </div>
      </div>

      <div className="flex-grow overflow-auto bg-slate-200 p-4 md:p-8 flex justify-center">
        <div className="bg-white shadow-2xl transition-all duration-300 origin-top transform scale-[0.6] md:scale-[0.8] lg:scale-[0.9]" style={{ width: paperSize === 'A4' ? '210mm' : '215mm', minHeight: paperSize === 'A4' ? '297mm' : '330mm', padding: '5mm', boxSizing: 'border-box' }}>
            <div id="print-content" ref={printRef} className="print-container" style={{ width: '100%' }}>
                {displayedUsers.length > 0 ? (
                    <div className="grid-layout-target" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4mm', width: '100%', boxSizing: 'border-box' }}>
                        {displayedUsers.map((user) => (
                            <div key={user.id} className="page-break-inside-avoid card-item" style={{ width: '100%', height: '70mm', border: '1px solid #000', position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', fontFamily: 'sans-serif', backgroundColor: '#fff', margin: '0 auto' }}>
                                {/* Decorative Headers */}
                                <div style={{ position: 'absolute', top: '0', right: '0', width: '40%', height: '8px', backgroundColor: '#1e3a8a' }}></div>
                                <div style={{ position: 'absolute', top: '0', right: '0', width: '8px', height: '40%', backgroundColor: '#1e3a8a' }}></div>
                                <div style={{ position: 'absolute', bottom: '0', left: '0', width: '40%', height: '8px', backgroundColor: '#dc2626' }}></div>
                                <div style={{ position: 'absolute', bottom: '0', left: '0', width: '8px', height: '40%', backgroundColor: '#dc2626' }}></div>
                                <div style={{ position: 'absolute', left: '0', top: '15%', bottom: '15%', width: '2px', backgroundColor: '#dc2626' }}></div>
                                <div style={{ position: 'absolute', right: '0', top: '15%', bottom: '15%', width: '2px', backgroundColor: '#1e3a8a' }}></div>

                                {/* HEADER KOP MINI DUAL LOGO */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 8px 2px 8px', borderBottom: '1px solid #000' }}>
                                    {/* Logo Kiri (Kabupaten) */}
                                    <div style={{ width: '35px', height: '35px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                         {safeConfig.leftLogoUrl && (<img src={safeConfig.leftLogoUrl} alt="Kab" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />)}
                                    </div>
                                    
                                    {/* Teks Tengah */}
                                    <div style={{ textAlign: 'center', flex: 1, padding: '0 2px' }}>
                                        <div style={{ fontSize: '6px', fontWeight: 'bold', textTransform: 'uppercase', lineHeight: '1.1' }}>{safeConfig.kopHeader1}</div>
                                        <div style={{ fontSize: '6px', fontWeight: 'bold', textTransform: 'uppercase', lineHeight: '1.1' }}>{safeConfig.kopHeader2}</div>
                                        <div style={{ fontSize: '7px', fontWeight: '900', textTransform: 'uppercase', color: '#000', marginTop: '1px' }}>{safeConfig.schoolName}</div>
                                        <div style={{ fontSize: '5px', fontWeight: 'bold', marginTop: '1px' }}>{safeConfig.currentExamEvent}</div>
                                    </div>

                                    {/* Logo Kanan (Sekolah) */}
                                    <div style={{ width: '35px', height: '35px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                         {safeConfig.logoUrl ? (<img src={safeConfig.logoUrl} alt="Sekolah" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />) : (<div style={{fontSize:'6px', fontWeight:'bold'}}>LOGO</div>)}
                                    </div>
                                </div>

                                {/* QR Code & Info */}
                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', marginTop: '2px', marginBottom: '2px' }}>
                                    <div style={{ border: '2px solid black', padding: '2px', backgroundColor: 'white', width: '55px', height: '55px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <img src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=cbtauth::student::${user.nisn}::${user.password_text || user.nisn}&qzone=0`} alt="QR" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                                    </div>
                                    <div style={{ color: '#1e3a8a', fontWeight: '900', fontSize: '9px', marginTop: '3px', textTransform: 'uppercase', maxWidth: '90%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'center' }}>{user.fullName}</div>
                                    <div style={{ backgroundColor: '#dc2626', color: 'white', padding: '1px 6px', fontWeight: 'bold', fontSize: '7px', borderRadius: '2px', marginTop: '2px' }}>{user.class} | {user.nisn}</div>
                                </div>

                                {/* Footer Info */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', padding: '0 12px 6px 12px', position: 'relative', zIndex: 2 }}>
                                    <div style={{ fontSize: '7px', fontWeight: '700', color: '#000', lineHeight: '1.2' }}>
                                        <div>User : <span style={{fontFamily:'monospace'}}>{user.nisn}</span></div>
                                        <div>Pass : <span style={{fontFamily:'monospace'}}>{user.password_text || user.nisn}</span></div>
                                    </div>
                                    
                                    {/* SIGNATURE BLOCK */}
                                    <div style={{ textAlign: 'center', fontSize: '6px', width: '45%', position: 'relative' }}>
                                        <div style={{marginBottom: '2px'}}>{safeConfig.cardIssueDate}</div>
                                        <div style={{ fontWeight: 'bold', marginBottom: '2px' }}>Kepala Sekolah,</div>
                                        
                                        {/* Signature & Stamp Overlay Container */}
                                        <div style={{height: '30px', position: 'relative', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                                             {/* Stamp (Stempel) - Overlay Left */}
                                             {safeConfig.stampUrl && (
                                                <img 
                                                    src={safeConfig.stampUrl} 
                                                    alt="Stamp"
                                                    style={{ 
                                                        position: 'absolute', 
                                                        left: '2px', 
                                                        top: '50%', 
                                                        transform: 'translateY(-50%)', 
                                                        height: '25px', 
                                                        width: 'auto',
                                                        opacity: 0.85,
                                                        zIndex: 1
                                                    }} 
                                                />
                                             )}
                                             {/* Signature (Tanda Tangan) - Center */}
                                             {safeConfig.signatureUrl && (
                                                <img 
                                                    src={safeConfig.signatureUrl} 
                                                    alt="Sig"
                                                    style={{ 
                                                        height: '28px', 
                                                        maxWidth: '100%', 
                                                        objectFit: 'contain', 
                                                        position: 'relative',
                                                        zIndex: 2 
                                                    }} 
                                                />
                                             )}
                                        </div>
                                        
                                        <div style={{ fontWeight: 'bold', fontSize: '6px', textDecoration: 'underline', marginTop: '1px' }}>{safeConfig.headmasterName}</div>
                                        <div style={{ fontSize: '5px' }}>{safeConfig.headmasterNip}</div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400">
                        <p className="font-medium">Tidak ada data siswa ditemukan.</p>
                    </div>
                )}
            </div>
        </div>
      </div>
      <style>{`@media print { .grid-layout-target { display: grid !important; grid-template-columns: repeat(3, 1fr) !important; gap: 4mm !important; page-break-inside: auto; } .card-item { break-inside: avoid; page-break-inside: avoid; margin-bottom: 0 !important; border: 1px solid black !important; } }`}</style>
    </div>
  );
};

export default ExamCards;
