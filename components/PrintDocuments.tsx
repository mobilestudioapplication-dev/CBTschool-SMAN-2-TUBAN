
import React, { useState, useMemo, useEffect } from 'react';
import { User, Test, AppConfig, MasterData } from '../types';
import ExcelJS from 'exceljs';

declare const html2pdf: any;

interface PrintDocumentsProps {
  users: User[];
  tests: Map<string, Test>;
  examSessions: any[];
  config: AppConfig;
  masterData: MasterData;
}

interface PrintableProps {
  selectedTest: Test | null;
  filteredStudents: any[];
  config: AppConfig;
  documentType: 'attendance' | 'minutes';
  sessionName: string;
  selectedRoom: string;
  selectedClass: string;
  kopData: any;
  proctorInfo: { name: string; nip: string };
  supervisorInfo: { name: string; nip: string };
  responsibleName: string;
  notes: string;
  stats: any;
  formattedDate: any;
  paperSize: 'A4' | 'F4';
  showHeader: boolean;
  id?: string;
  presentStudentIds: Set<string>; // Add this prop
}

const PrintableDocument: React.FC<PrintableProps> = (props) => {
  const {
    selectedTest,
    filteredStudents,
    config,
    documentType,
    sessionName,
    selectedRoom,
    selectedClass,
    kopData,
    proctorInfo,
    supervisorInfo,
    notes,
    stats,
    formattedDate,
    paperSize,
    showHeader,
    id,
    presentStudentIds // Destructure
  } = props;

  const pageSizeStyle = {
    width: paperSize === 'A4' ? '210mm' : '215mm',
    minHeight: paperSize === 'A4' ? '296mm' : '329mm', 
    padding: '10mm 15mm 10mm 15mm', 
    backgroundColor: 'white',
    margin: '0 auto',
    boxSizing: 'border-box' as const,
    position: 'relative' as const,
  };

  if (!selectedTest) return (
    <div className="flex flex-col items-center justify-center h-full p-12 text-gray-400 bg-white rounded-lg shadow-sm border-2 border-dashed border-gray-300">
        <p className="text-xl font-bold text-gray-500">Pratinjau Dokumen Kosong</p>
        <p className="text-sm text-center mt-2">Silakan pilih <span className="font-bold text-blue-600">Mata Pelajaran</span> di menu pengaturan sebelah kiri.</p>
    </div>
  );

  return (
    <div id={id} className="print-content-area font-serif-print text-black leading-tight bg-white shadow-2xl relative" style={pageSizeStyle}>
      
      {showHeader && (
        <div className="mb-4 mt-0">
          {/* HEADER KOP SURAT DUAL LOGO - FLEXBOX LAYOUT */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginBottom: '2px', paddingBottom: '2px' }}>
              
              {/* LOGO KIRI (PEMERINTAH) */}
              <div style={{ width: '15%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                  {config.leftLogoUrl && (
                      <img src={config.leftLogoUrl} alt="Logo Pemda" style={{ width: '75px', height: '75px', objectFit: 'contain' }} />
                  )}
              </div>

              {/* TEKS TENGAH */}
              <div style={{ flex: 1, textAlign: 'center', padding: '0 5px' }}>
                  <h3 style={{ fontSize: '14pt', fontWeight: 'bold', textTransform: 'uppercase', margin: 0, lineHeight: 1.1 }}>
                      {kopData.header1}
                  </h3>
                  <h2 style={{ fontSize: '16pt', fontWeight: 'bold', textTransform: 'uppercase', margin: 0, lineHeight: 1.1 }}>
                      {kopData.header2}
                  </h2>
                  <h1 style={{ fontSize: '18pt', fontWeight: '900', textTransform: 'uppercase', margin: '4px 0 0 0', lineHeight: 1.1 }}>
                      {kopData.schoolName}
                  </h1>
                  <p style={{ fontSize: '10pt', margin: '2px 0 0 0', lineHeight: 1.2, textTransform: 'capitalize' }}>
                      {kopData.address}, {kopData.district}
                  </p>
                  <p style={{ fontSize: '9pt', margin: 0, fontStyle: 'italic' }}>
                      {kopData.details}
                  </p>
              </div>

              {/* LOGO KANAN (SEKOLAH) */}
              <div style={{ width: '15%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                  {config.logoUrl ? (
                      <img src={config.logoUrl} alt="Logo Sekolah" style={{ width: '75px', height: '75px', objectFit: 'contain' }} />
                  ) : (
                      <div style={{ width: '70px', height: '70px', border: '1px dashed #ccc', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px' }}>Logo</div>
                  )}
              </div>
          </div>

          {/* GARIS PEMBATAS GANDA (DOUBLE BORDER) */}
          <div style={{ borderTop: '4px solid black', borderBottom: '1px solid black', height: '3px', width: '100%', marginBottom: '2px' }}></div>
        </div>
      )}

      {/* JUDUL DOKUMEN */}
      <div className="text-center mb-6 mt-4">
        <h2 className="text-[16px] font-bold uppercase underline decoration-1 underline-offset-4 tracking-wide m-0">
          {documentType === 'attendance' ? 'DAFTAR HADIR PESERTA UJIAN' : 'BERITA ACARA PELAKSANAAN UJIAN'}
        </h2>
        <p className="text-[14px] font-bold uppercase mt-1 text-gray-800">{config.currentExamEvent || 'UJIAN SEKOLAH'}</p>
        <p className="text-[12px] font-bold uppercase mt-1">TAHUN PELAJARAN {config.academicYear || `${new Date().getFullYear()}/${new Date().getFullYear() + 1}`}</p>
      </div>

      {documentType === 'attendance' && (
        <>
          <div className="mb-4 text-[12px]">
            <table className="w-full">
              <tbody>
                <tr><td className="w-32 font-bold py-0.5">KOTA/KABUPATEN</td><td className="w-3">:</td><td className="uppercase w-1/3">{config.schoolDistrict || '-'}</td><td className="w-32 font-bold pl-4">KODE SEKOLAH</td><td className="w-3">:</td><td className="uppercase">{config.schoolCode || '-'}</td></tr>
                <tr><td className="font-bold py-0.5">SEKOLAH</td><td>:</td><td className="uppercase">{config.schoolName}</td><td className="font-bold pl-4">KELAS</td><td>:</td><td className="uppercase font-bold">{selectedClass === 'Semua Kelas' ? 'CAMPURAN' : selectedClass}</td></tr>
                <tr><td className="font-bold py-0.5">MATA PELAJARAN</td><td>:</td><td className="uppercase font-bold">{selectedTest.details.subject}</td><td className="font-bold pl-4">SESI / RUANG</td><td>:</td><td className="uppercase">{sessionName} / {selectedRoom}</td></tr>
                <tr><td className="font-bold py-0.5">HARI/TANGGAL</td><td>:</td><td className="uppercase">{formattedDate.dateFull}</td><td className="font-bold pl-4">WAKTU</td><td>:</td><td className="uppercase">{selectedTest.details.duration}</td></tr>
              </tbody>
            </table>
          </div>

          <table className="w-full border border-black border-collapse text-[11px] mb-4">
            <thead className="bg-gray-200" style={{printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact'}}>
              <tr><th className="border border-black px-1 py-2 w-10 text-center font-bold">NO</th><th className="border border-black px-1 py-2 w-28 text-center font-bold">NOMOR PESERTA</th><th className="border border-black px-2 py-2 text-left font-bold">NAMA PESERTA</th><th className="border border-black px-1 py-2 w-48 text-center font-bold" colSpan={2}>TANDA TANGAN</th><th className="border border-black px-1 py-2 w-20 text-center font-bold">KET</th></tr>
            </thead>
            <tbody>
              {filteredStudents.length === 0 && Array.from({ length: 15 }).map((_, i) => (
                <tr key={i} className="h-9"><td className="border border-black text-center">{i + 1}</td><td className="border border-black"></td><td className="border border-black"></td><td className="border border-black w-24 text-left align-top text-[9px] pl-1 pt-1">{i % 2 === 0 ? `${i + 1}.` : ''}</td><td className="border border-black w-24 text-left align-top text-[9px] pl-1 pt-1">{i % 2 !== 0 ? `${i + 1}.` : ''}</td><td className="border border-black"></td></tr>
              ))}
              {filteredStudents.map((student: any, index: number) => (
                <tr key={student.id} className="h-9"><td className="border border-black text-center font-bold">{index + 1}</td><td className="border border-black text-center font-mono font-bold tracking-wider">{student.nisn}</td><td className="border border-black px-2 uppercase font-semibold text-[10px] leading-tight">{student.fullName}</td><td className="border border-black align-top w-24 pl-1 pt-1 text-[10px]">{index % 2 === 0 && (<span>{index + 1}.</span>)}</td><td className="border border-black align-top w-24 pl-1 pt-1 text-[10px]">{index % 2 !== 0 && (<span>{index + 1}.</span>)}</td><td className="border border-black text-center text-[10px] font-bold">{presentStudentIds.has(student.id) ? 'HADIR' : '-'}</td></tr>
              ))}
            </tbody>
          </table>

          <table className="w-full text-[12px] mt-8 break-inside-avoid">
            <tbody>
                <tr>
                    <td className="w-[35%] align-top text-center"><p className="mb-1">Proktor,</p><br /><br /><br /><br /><p className="font-bold uppercase underline underline-offset-2">{proctorInfo.name || '....................................'}</p><p>NIP. {proctorInfo.nip || ' - '}</p></td>
                    <td className="w-[30%]"></td>
                    <td className="w-[35%] align-top text-center"><p className="mb-1">{config.schoolDistrict || '....................'}, {formattedDate.dateStr}</p><p className="mb-1">Pengawas Ruang,</p><br /><br /><br /><br /><p className="font-bold uppercase underline underline-offset-2">{supervisorInfo.name || '....................................'}</p><p>NIP. {supervisorInfo.nip || ' - '}</p></td>
                </tr>
            </tbody>
          </table>
        </>
      )}

      {documentType === 'minutes' && (
        <>
          <div className="text-[12px] leading-relaxed mb-4 text-justify">
            <p className="mb-4 indent-8">
              Pada hari ini <span className="font-bold uppercase">{formattedDate.dayName}</span> tanggal <span className="font-bold uppercase">{formattedDate.dateStr}</span>, 
              bertempat di <span className="font-bold uppercase">{config.schoolName}</span> telah diselenggarakan <span className="font-bold uppercase">{config.currentExamEvent || 'UJIAN SEKOLAH'}</span> 
              untuk Mata Pelajaran <span className="font-bold uppercase">{selectedTest.details.subject}</span> dari pukul <span className="font-bold">..............</span> sampai dengan pukul <span className="font-bold">..............</span>
            </p>
            
            <div className="mb-4 border border-black p-4">
                <table className="w-full text-[12px]">
                    <tbody>
                        <tr><td className="w-48 font-bold py-1.5">1. Kode Sekolah</td><td>: {config.schoolCode || '....................'}</td></tr>
                        <tr><td className="font-bold py-1.5">2. Sekolah/Madrasah</td><td className="uppercase">: {config.schoolName}</td></tr>
                        <tr><td className="font-bold py-1.5">3. Sesi / Ruang</td><td className="uppercase">: {sessionName} / {selectedRoom}</td></tr>
                        <tr><td className="font-bold py-1.5">4. Jumlah Peserta Seharusnya</td><td>: <span className="font-bold">{stats.total}</span> Orang</td></tr>
                        <tr><td className="font-bold py-1.5">5. Jumlah Hadir</td><td>: <span className="font-bold">{stats.present}</span> Orang</td></tr>
                        <tr><td className="font-bold py-1.5">6. Jumlah Tidak Hadir</td><td>: <span className="font-bold">{stats.absent}</span> Orang</td></tr>
                        <tr><td className="font-bold align-top py-1.5">7. Catatan Kehadiran</td><td className="italic py-1.5">: {stats.absentUsernames ? `Peserta tidak hadir: ${stats.absentUsernames}` : 'Nihil (Semua Hadir)'}</td></tr>
                    </tbody>
                </table>
            </div>

            <div className="mb-6"><p className="font-bold mb-2">Catatan selama pelaksanaan ujian :</p><div className="border border-black p-3 h-32 whitespace-pre-wrap font-handwriting text-sm bg-gray-50/30" style={{minHeight: '120px'}}>{notes || '-'}</div></div>
            <p className="mb-4">Demikian Berita Acara ini dibuat dengan sesungguhnya.</p>

            <table className="w-full text-[12px] break-inside-avoid mb-8"><tbody><tr><td className="w-[40%] text-center align-top"><p className="mb-1">Yang Membuat Berita Acara,</p><p className="mb-1">Pengawas Ruang,</p><br /><br /><br /><br /><p className="font-bold uppercase underline underline-offset-2">{supervisorInfo.name || '....................................'}</p><p>NIP. {supervisorInfo.nip || ' - '}</p></td><td className="w-[20%]"></td><td className="w-[40%] text-center align-top"><p className="mb-1">{config.schoolDistrict || '....................'}, {formattedDate.dateStr}</p><p className="mb-1">Proktor,</p><br /><br /><br /><br /><p className="font-bold uppercase underline underline-offset-2">{proctorInfo.name || '....................................'}</p><p>NIP. {proctorInfo.nip || ' - '}</p></td></tr></tbody></table>
            <table className="w-full text-[12px] break-inside-avoid"><tbody><tr><td className="text-center align-top"><p className="mb-1">Mengetahui,</p><p className="mb-1">Kepala Sekolah,</p><br /><br /><br /><br /><p className="font-bold uppercase underline underline-offset-2">{config.headmasterName || '....................................'}</p><p>NIP. {config.headmasterNip || '...................'}</p></td></tr></tbody></table>
          </div>
        </>
      )}
      
      <div className="absolute bottom-0 left-0 w-full border-t border-black p-1 text-center font-bold uppercase text-[8px] text-gray-500 italic bg-white">Dicetak oleh Sistem CBT School - {new Date().toLocaleString('id-ID')}</div>
    </div>
  );
};

const PrintDocuments: React.FC<PrintDocumentsProps> = ({ users, tests, examSessions, config, masterData }) => {
  const [selectedToken, setSelectedToken] = useState<string>('');
  const [selectedRoom, setSelectedRoom] = useState<string>('Ruang 01');
  const [selectedClass, setSelectedClass] = useState<string>('Semua Kelas');
  const [sessionName, setSessionName] = useState<string>('1');
  const [proctorName, setProctorName] = useState<string>('');
  const [supervisorName, setSupervisorName] = useState<string>('');
  const [responsibleName, setResponsibleName] = useState<string>('');
  const [supervisorNip, setSupervisorNip] = useState<string>('');
  const [proctorNip, setProctorNip] = useState<string>('');
  const [notes, setNotes] = useState<string>('Ujian berjalan dengan tertib dan lancar.');
  const [documentType, setDocumentType] = useState<'attendance' | 'minutes'>('attendance');
  const [paperSize, setPaperSize] = useState<'A4' | 'F4'>(config.defaultPaperSize as 'A4' | 'F4' || 'A4');
  const [showHeader, setShowHeader] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeMobileTab, setActiveMobileTab] = useState<'settings' | 'preview'>('settings');
  
  // NEW STATE: Filter Kehadiran Manual
  const [presentStudentIds, setPresentStudentIds] = useState<Set<string>>(new Set());

  const [kopData, setKopData] = useState({
    header1: config.kopHeader1 || 'PEMERINTAH PROVINSI',
    header2: config.kopHeader2 || 'DINAS PENDIDIKAN',
    schoolName: config.schoolName,
    address: config.schoolAddress || 'Alamat Sekolah Belum Diatur',
    district: config.schoolDistrict || 'KABUPATEN',
    details: ''
  });

  const [printDate, setPrintDate] = useState<string>(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    const contactParts = [];
    if (config.schoolPhone) contactParts.push(`Telp: ${config.schoolPhone}`);
    if (config.schoolEmail) contactParts.push(`Email: ${config.schoolEmail}`);
    if (config.schoolWebsite) contactParts.push(`Web: ${config.schoolWebsite}`);

    setKopData(prev => ({
      ...prev,
      header1: config.kopHeader1 || prev.header1,
      header2: config.kopHeader2 || prev.header2,
      schoolName: config.schoolName,
      address: config.schoolAddress || prev.address,
      district: config.schoolDistrict || prev.district,
      details: contactParts.length > 0 ? contactParts.join(' | ') : 'Website: www.sekolah.sch.id'
    }));
  }, [config]);

  const testsArray = Array.from(tests.entries());
  const selectedTest = selectedToken ? tests.get(selectedToken) : null;

  const filteredStudents = useMemo(() => {
    if (!selectedTest) return [];
    const testId = selectedTest.details.id;
    let targetStudents = users.filter(u => u.role === 'student' || (!u.role && u.username !== 'admin@cbtschool.com'));
    if (selectedClass !== 'Semua Kelas') targetStudents = targetStudents.filter(s => s.class === selectedClass);
    return targetStudents.map(student => {
      const session = examSessions.find(s => s.schedules?.test_id === testId && s.user_id === student.id);
      return { ...student, sessionStatus: session ? session.status : 'Belum Login' };
    }).sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [selectedTest, selectedClass, users, examSessions]);

  // RESET ATTENDANCE CHECKLIST WHEN STUDENTS CHANGE
  useEffect(() => {
      const initialPresentSet = new Set<string>();
      filteredStudents.forEach(s => {
          // Default: Jika sudah pernah login (status bukan 'Belum Login'), anggap hadir
          if (s.sessionStatus === 'Mengerjakan' || s.sessionStatus === 'Selesai' || s.sessionStatus === 'Diskualifikasi') {
              initialPresentSet.add(s.id);
          }
      });
      setPresentStudentIds(initialPresentSet);
  }, [filteredStudents.map(s => s.id).join(',')]); // Depend on student list changes

  const toggleAttendance = (studentId: string) => {
      setPresentStudentIds(prev => {
          const newSet = new Set(prev);
          if (newSet.has(studentId)) {
              newSet.delete(studentId);
          } else {
              newSet.add(studentId);
          }
          return newSet;
      });
  };

  const handleSelectAllAttendance = (selectAll: boolean) => {
      if (selectAll) {
          const allIds = new Set(filteredStudents.map(s => s.id));
          setPresentStudentIds(allIds);
      } else {
          setPresentStudentIds(new Set());
      }
  };

  const availableClasses = useMemo(() => {
    const classes = (masterData?.classes || []).map(c => c.name);
    return classes.sort();
  }, [masterData]);

  const stats = useMemo(() => {
    const total = filteredStudents.length;
    // Calculate present based on MANUAL CHECKLIST (presentStudentIds) instead of sessionStatus
    const present = filteredStudents.filter(s => presentStudentIds.has(s.id)).length;
    const absent = total - present;
    
    // Calculate absent names based on MANUAL CHECKLIST
    const absentUsernames = filteredStudents
        .filter(s => !presentStudentIds.has(s.id))
        .map(s => s.fullName)
        .join(', ');
        
    return { total, present, absent, absentUsernames };
  }, [filteredStudents, presentStudentIds]);

  const formattedDate = useMemo(() => {
    const d = new Date(printDate);
    const dayName = d.toLocaleDateString('id-ID', { weekday: 'long' });
    const dateStr = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
    return { dayName, dateStr, dateFull: `${dayName}, ${dateStr}` };
  }, [printDate]);

  const handleDownloadPDF = async () => {
    if (!selectedTest) return;
    setIsProcessing(true);
    const originalElement = document.getElementById('document-preview-area');
    if (!originalElement) { alert("Gagal menemukan dokumen preview."); setIsProcessing(false); return; }
    const element = originalElement.cloneNode(true) as HTMLElement;
    const container = document.createElement('div');
    container.style.position = 'fixed'; container.style.top = '-10000px'; container.style.left = '0'; container.style.zIndex = '10000'; container.style.backgroundColor = 'white'; 
    const paperWidthPx = paperSize === 'A4' ? '794px' : '816px'; 
    container.style.width = paperWidthPx; 
    element.style.transform = 'none'; element.style.margin = '0'; element.style.boxShadow = 'none'; element.style.border = 'none'; element.style.width = '100%'; element.removeAttribute('id'); 
    container.appendChild(element);
    document.body.appendChild(container);
    const filename = `${documentType === 'attendance' ? 'Daftar_Hadir' : 'Berita_Acara'}_${selectedTest.details.subject.replace(/[^a-z0-9]/gi, '_')}_${selectedClass.replace(/[^a-z0-9]/gi, '_')}.pdf`;
    const opt = { margin: 0, filename: filename, image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2, useCORS: true, logging: false, scrollY: 0, x: 0, y: 0, width: paperSize === 'A4' ? 794 : 816, windowWidth: paperSize === 'A4' ? 794 : 816 }, jsPDF: { unit: 'mm', format: paperSize === 'A4' ? 'a4' : [215, 330], orientation: 'portrait' } };
    try { await html2pdf().set(opt).from(element).save(); } catch (err: any) { console.error("PDF Error:", err); alert("Gagal membuat PDF."); } finally { if(document.body.contains(container)) { document.body.removeChild(container); } setIsProcessing(false); }
  };

  const handleDownloadExcel = async () => {
    if (!selectedTest) return;
    setIsProcessing(true);
    const workbook = new ExcelJS.Workbook();
    const sheetName = documentType === 'attendance' ? 'Daftar Hadir' : 'Berita Acara';
    const sheet = workbook.addWorksheet(sheetName);
    const boldCenter = { font: { bold: true }, alignment: { horizontal: 'center' as const } };
    const borderAll = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
    sheet.mergeCells('A1:E1'); sheet.getCell('A1').value = kopData.header1; sheet.getCell('A1').style = boldCenter;
    sheet.mergeCells('A2:E2'); sheet.getCell('A2').value = kopData.header2; sheet.getCell('A2').style = boldCenter;
    sheet.mergeCells('A3:E3'); sheet.getCell('A3').value = kopData.schoolName; sheet.getCell('A3').font = { bold: true, size: 14 }; sheet.getCell('A3').alignment = { horizontal: 'center' };
    sheet.mergeCells('A4:E4'); sheet.getCell('A4').value = `${kopData.address}, ${kopData.district}`; sheet.getCell('A4').alignment = { horizontal: 'center' };
    sheet.addRow([]);
    sheet.mergeCells('A6:E6'); sheet.getCell('A6').value = documentType === 'attendance' ? 'DAFTAR HADIR PESERTA UJIAN' : 'BERITA ACARA PELAKSANAAN UJIAN'; sheet.getCell('A6').style = { font: { bold: true, underline: true }, alignment: { horizontal: 'center' } };
    sheet.addRow([]);
    const metaRows = [ ['Mata Pelajaran', selectedTest.details.subject], ['Kelas', selectedClass], ['Ruang', selectedRoom], ['Sesi', sessionName], ['Hari/Tanggal', formattedDate.dateFull], ['Waktu', selectedTest.details.duration], ['Jumlah Peserta', `${filteredStudents.length} Orang`] ];
    metaRows.forEach(row => { sheet.addRow([row[0], ':', row[1]]); });
    sheet.addRow([]);
    if (documentType === 'attendance') {
        const headerRow = sheet.addRow(['No', 'Nomor Peserta', 'Nama Peserta', 'Tanda Tangan', 'Ket']); headerRow.font = { bold: true }; headerRow.eachCell(cell => { cell.border = borderAll as any; cell.alignment = { horizontal: 'center' }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } }; });
        // Use presentStudentIds for Excel export too
        filteredStudents.forEach((student: any, index: number) => { const row = sheet.addRow([ index + 1, student.nisn, student.fullName, '', presentStudentIds.has(student.id) ? 'HADIR' : '' ]); row.eachCell(cell => { cell.border = borderAll as any; }); });
        sheet.getColumn(1).width = 5; sheet.getColumn(2).width = 15; sheet.getColumn(3).width = 35; sheet.getColumn(4).width = 20; sheet.getColumn(5).width = 10;
    } else {
        sheet.addRow(['ISI BERITA ACARA:']); sheet.addRow([`Pada hari ini ${formattedDate.dateFull}, telah diselenggarakan ujian ${selectedTest.details.subject} (${config.currentExamEvent || 'Ujian Sekolah'}).`]); sheet.addRow([]); sheet.addRow(['1. Hadir / Tidak Hadir:']); sheet.addRow(['   Jumlah Seharusnya:', stats.total]); sheet.addRow(['   Jumlah Hadir:', stats.present]); sheet.addRow(['   Jumlah Tidak Hadir:', stats.absent]); sheet.addRow(['   Siswa Tidak Hadir:', stats.absentUsernames || '-']); sheet.addRow([]); sheet.addRow(['2. Catatan Kejadian:']); sheet.addRow([notes]);
    }
    sheet.addRow([]); sheet.addRow([]); sheet.addRow(['', '', '', `...................., ${formattedDate.dateStr}`]); sheet.addRow(['Proktor', '', '', 'Pengawas']); sheet.addRow([]); sheet.addRow([]); sheet.addRow([proctorName, '', '', supervisorName]); sheet.addRow([`NIP. ${proctorNip}`, '', '', `NIP. ${supervisorNip}`]);
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = `${sheetName.replace(/\s/g, '_')}_${selectedTest.details.subject.replace(/[^a-z0-9]/gi, '')}.xlsx`; link.click(); setIsProcessing(false);
  };

  return (
    <div className="flex flex-col lg:flex-row h-full bg-slate-100 overflow-hidden font-sans text-slate-800 relative">
      <div className="lg:hidden flex bg-white border-b border-slate-200 z-30 shrink-0">
        <button onClick={() => setActiveMobileTab('settings')} className={`flex-1 py-3 text-sm font-bold border-b-2 transition-colors ${activeMobileTab === 'settings' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500'}`}>Pengaturan</button>
        <button onClick={() => setActiveMobileTab('preview')} className={`flex-1 py-3 text-sm font-bold border-b-2 transition-colors ${activeMobileTab === 'preview' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500'}`}>Pratinjau Dokumen</button>
      </div>
      <div className={`${activeMobileTab === 'settings' ? 'flex' : 'hidden'} lg:flex w-full lg:w-96 bg-white border-r border-slate-200 flex-col h-full z-20 shadow-xl overflow-y-auto no-print transition-all duration-300`}>
        <div className="p-5 border-b border-slate-100 bg-slate-50 sticky top-0 z-10"><h2 className="text-xl font-bold text-slate-800 flex items-center gap-2"><svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>Cetak Dokumen</h2><p className="text-xs text-slate-500 mt-1">Administrasi Ujian Sekolah</p></div>
        <div className="p-5 space-y-6 pb-24 lg:pb-5"> 
            <div className="bg-slate-50 p-1 rounded-lg flex border border-slate-200 shadow-inner"><button onClick={() => setDocumentType('attendance')} className={`flex-1 py-2 text-sm font-bold rounded-md transition-all ${documentType === 'attendance' ? 'bg-white text-blue-600 shadow-sm border border-gray-100' : 'text-slate-500 hover:bg-slate-200'}`}>Daftar Hadir</button><button onClick={() => setDocumentType('minutes')} className={`flex-1 py-2 text-sm font-bold rounded-md transition-all ${documentType === 'minutes' ? 'bg-white text-blue-600 shadow-sm border border-gray-100' : 'text-slate-500 hover:bg-slate-200'}`}>Berita Acara</button></div>
            <div className="space-y-3"><h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b pb-1">Filter Data</h3><div><label className="block text-sm font-medium text-slate-700 mb-1">Mata Pelajaran (Wajib)</label><select value={selectedToken} onChange={e => setSelectedToken(e.target.value)} className="w-full p-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"><option value="">-- Pilih Mapel --</option>{testsArray.map(([token, test]) => <option key={token} value={token}>{test.details.subject} ({token})</option>)}</select></div><div><label className="block text-sm font-medium text-slate-700 mb-1">Kelas</label><select value={selectedClass} onChange={e => setSelectedClass(e.target.value)} className="w-full p-2.5 border border-slate-300 rounded-lg text-sm bg-white disabled:bg-slate-100" disabled={!selectedToken}><option value="Semua Kelas">Semua Kelas</option>{availableClasses.map(cls => <option key={cls} value={cls}>{cls}</option>)}</select></div><div className="grid grid-cols-2 gap-3"><div><label className="block text-xs font-medium text-slate-700 mb-1">Ruang</label><input type="text" value={selectedRoom} onChange={e => setSelectedRoom(e.target.value)} className="w-full p-2 border border-slate-300 rounded-lg text-sm" placeholder="R.01" /></div><div><label className="block text-xs font-medium text-slate-700 mb-1">Sesi</label><input type="text" value={sessionName} onChange={e => setSessionName(e.target.value)} className="w-full p-2 border border-slate-300 rounded-lg text-sm" placeholder="1" /></div></div></div>
            
            {/* NEW: ATTENDANCE CHECKLIST */}
            {documentType === 'minutes' && filteredStudents.length > 0 && (
                <div className="space-y-3 pt-4 border-t border-slate-100">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b pb-1">Verifikasi Kehadiran Peserta ({stats.present}/{stats.total})</h3>
                    <div className="flex justify-between items-center text-xs mb-2">
                        <button onClick={() => handleSelectAllAttendance(true)} className="text-blue-600 hover:underline">Pilih Semua</button>
                        <button onClick={() => handleSelectAllAttendance(false)} className="text-red-500 hover:underline">Kosongkan</button>
                    </div>
                    <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-lg bg-slate-50 p-2 space-y-1">
                        {filteredStudents.map((s) => (
                            <div key={s.id} className="flex items-center space-x-2 p-1 hover:bg-white rounded cursor-pointer" onClick={() => toggleAttendance(s.id)}>
                                <input 
                                    type="checkbox" 
                                    checked={presentStudentIds.has(s.id)} 
                                    onChange={() => {}} // Handled by div click
                                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-4 w-4" 
                                />
                                <span className={`text-xs truncate flex-1 ${presentStudentIds.has(s.id) ? 'text-gray-900 font-medium' : 'text-gray-400'}`}>
                                    {s.fullName}
                                </span>
                                {s.sessionStatus === 'Mengerjakan' || s.sessionStatus === 'Selesai' ? (
                                    <span className="w-2 h-2 rounded-full bg-green-500" title="Online/Selesai"></span>
                                ) : (
                                    <span className="w-2 h-2 rounded-full bg-gray-300" title="Offline"></span>
                                )}
                            </div>
                        ))}
                    </div>
                    <p className="text-[10px] text-gray-500 italic">*Centang siswa yang hadir. Siswa yang tidak dicentang akan otomatis masuk ke daftar "Tidak Hadir" di Berita Acara.</p>
                </div>
            )}

            <div className="space-y-3 pt-4 border-t border-slate-100"><h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b pb-1">Identitas Petugas</h3><div className="grid grid-cols-2 gap-2"><input type="text" placeholder="Nama Proktor" value={proctorName} onChange={e => setProctorName(e.target.value)} className="w-full p-2 border border-slate-300 rounded-lg text-xs" /><input type="text" placeholder="NIP Proktor" value={proctorNip} onChange={e => setProctorNip(e.target.value)} className="w-full p-2 border border-slate-300 rounded-lg text-xs" /></div><div className="grid grid-cols-2 gap-2"><input type="text" placeholder="Nama Pengawas" value={supervisorName} onChange={e => setSupervisorName(e.target.value)} className="w-full p-2 border border-slate-300 rounded-lg text-xs" /><input type="text" placeholder="NIP Pengawas" value={supervisorNip} onChange={e => setSupervisorNip(e.target.value)} className="w-full p-2 border border-slate-300 rounded-lg text-xs" /></div></div>
            {documentType === 'minutes' && (<div className="space-y-3 pt-4 border-t border-slate-100"><h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b pb-1">Isi Berita Acara</h3><input type="text" placeholder="Nama Penanggung Jawab" value={responsibleName} onChange={e => setResponsibleName(e.target.value)} className="w-full p-2 border border-slate-300 rounded-lg text-sm" /><textarea rows={3} placeholder="Catatan Kejadian..." value={notes} onChange={e => setNotes(e.target.value)} className="w-full p-2 border border-slate-300 rounded-lg text-sm" /></div>)}
            <div className="space-y-3 pt-4 border-t border-slate-100"><details className="group"><summary className="flex justify-between items-center font-medium cursor-pointer list-none text-sm text-slate-600 hover:text-blue-600"><span>Edit KOP Manual</span><span className="transition group-open:rotate-180"><svg fill="none" height="24" shapeRendering="geometricPrecision" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" viewBox="0 0 24 24" width="24"><path d="M6 9l6 6 6-6"></path></svg></span></summary><div className="text-slate-500 mt-3 group-open:animate-fadeIn space-y-2"><input type="text" value={kopData.header1} onChange={e => setKopData({...kopData, header1: e.target.value})} className="w-full p-2 border text-xs rounded" placeholder="Header 1" /><input type="text" value={kopData.header2} onChange={e => setKopData({...kopData, header2: e.target.value})} className="w-full p-2 border text-xs rounded" placeholder="Header 2" /><input type="text" value={kopData.address} onChange={e => setKopData({...kopData, address: e.target.value})} className="w-full p-2 border text-xs rounded" placeholder="Alamat" /></div></details></div>
        </div>
        <div className="p-5 border-t border-slate-200 bg-white sticky bottom-0 z-10">
             <div className="flex gap-2 mb-3"><div className="flex-1"><label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Ukuran Kertas</label><select value={paperSize} onChange={e => setPaperSize(e.target.value as any)} className="w-full p-1.5 border rounded text-sm bg-slate-50"><option value="A4">A4 (21 x 29.7 cm)</option><option value="F4">F4 (21.5 x 33 cm)</option></select></div><div className="flex-1"><label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Tanggal Cetak</label><input type="date" value={printDate} onChange={e => setPrintDate(e.target.value)} className="w-full p-1 border rounded text-sm bg-slate-50" /></div></div>
             <div className="grid grid-cols-2 gap-3"><button onClick={handleDownloadPDF} disabled={!selectedTest || isProcessing} className="flex flex-col items-center justify-center p-2 bg-red-600 hover:bg-red-700 text-white rounded-lg shadow-md transition-all group disabled:bg-gray-300 disabled:cursor-not-allowed"><svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mb-1 group-hover:scale-110 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg><span className="text-xs font-bold">Download PDF</span></button><button onClick={handleDownloadExcel} disabled={!selectedTest || isProcessing} className="flex flex-col items-center justify-center p-2 bg-green-600 hover:bg-green-700 text-white rounded-lg shadow-md transition-all group disabled:bg-gray-300 disabled:cursor-not-allowed"><svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mb-1 group-hover:scale-110 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V7a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg><span className="text-xs font-bold">Download Excel</span></button></div>{isProcessing && <p className="text-center text-xs text-blue-500 mt-2 font-semibold animate-pulse">Sedang memproses dokumen...</p>}
        </div>
      </div>
      <div className={`${activeMobileTab === 'preview' ? 'flex' : 'hidden'} lg:flex flex-grow bg-slate-200 p-4 sm:p-8 overflow-auto justify-center items-start no-print`}>
         <div className="transform origin-top transition-transform duration-300 scale-[0.6] md:scale-[0.7] lg:scale-[0.8] xl:scale-[0.9] shadow-2xl">
             <PrintableDocument 
                id="document-preview-area" 
                selectedTest={selectedTest} 
                filteredStudents={filteredStudents} 
                config={config} 
                documentType={documentType} 
                sessionName={sessionName} 
                selectedRoom={selectedRoom} 
                selectedClass={selectedClass} 
                kopData={kopData} 
                proctorInfo={{ name: proctorName, nip: proctorNip }} 
                supervisorInfo={{ name: supervisorName, nip: supervisorNip }} 
                responsibleName={responsibleName} 
                notes={notes} 
                stats={stats} 
                formattedDate={formattedDate} 
                paperSize={paperSize} 
                showHeader={showHeader}
                presentStudentIds={presentStudentIds} // Pass manual checklist
             />
         </div>
      </div>
    </div>
  );
};

export default PrintDocuments;
