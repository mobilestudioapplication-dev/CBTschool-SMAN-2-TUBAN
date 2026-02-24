
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { AppConfig, User } from '../types';
import ConfirmationModal from './ConfirmationModal';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '../supabaseClient';
import { compressImage } from '../utils/imageCompression'; 
import { EXAM_EVENT_TYPES } from '../constants'; // Import daftar event

interface PasswordSyncModalProps {
  onConfirm: (password: string) => Promise<boolean>;
  onClose: () => void;
  isSyncing: boolean;
}

const PasswordSyncModal: React.FC<PasswordSyncModalProps> = ({ onConfirm, onClose, isSyncing }) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) {
      setError('Password harus minimal 6 karakter.');
      return;
    }
    const success = await onConfirm(password);
    if (!success) {
      setError('Sinkronisasi gagal. Silakan periksa koneksi atau coba lagi.');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md transform animate-scale-up">
        <form onSubmit={handleSubmit}>
          <div className="p-6">
            <h3 className="text-xl font-bold text-gray-800">Sinkronkan Password untuk QR</h3>
            <p className="text-sm text-gray-500 mt-2">
              Masukkan password admin Anda saat ini. Password ini akan di-enkode ke dalam Kartu ID Admin Anda untuk fitur login cepat.
            </p>
            <div className="mt-6">
              <label className="block text-sm font-medium text-gray-700">Password Admin Saat Ini</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full p-2 border rounded-md"
                required
                autoFocus
              />
            </div>
            {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
          </div>
          <div className="p-4 bg-gray-50 border-t flex justify-end space-x-2 rounded-b-2xl">
            <button type="button" onClick={onClose} disabled={isSyncing} className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-4 rounded-lg">
              Batal
            </button>
            <button type="submit" disabled={isSyncing} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg disabled:bg-blue-400 flex items-center">
              {isSyncing && <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>}
              {isSyncing ? 'Memproses...' : 'Aktifkan & Sinkronkan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};


interface ConfigurationScreenProps {
  config: AppConfig;
  onUpdateConfig: (newConfig: AppConfig) => Promise<boolean>;
  user: User;
  onLogout: () => void;
  onAdminPasswordChange: (newPassword: string) => Promise<boolean>;
  onSyncAdminPasswordForQR: (password: string) => Promise<boolean>;
  isProcessing: boolean;
}

const ToggleSwitch: React.FC<{id: string, label: string, checked: boolean, onChange: (e: React.ChangeEvent<HTMLInputElement>) => void}> = ({ id, label, checked, onChange }) => (
    <label htmlFor={id} className="flex items-center justify-between cursor-pointer p-4 border rounded-lg hover:bg-gray-50/50">
        <span className="font-medium text-gray-700">{label}</span>
        <div className="relative">
            <input type="checkbox" id={id} name={id} className="sr-only" checked={checked} onChange={onChange} />
            <div className={`block w-14 h-8 rounded-full ${checked ? 'bg-blue-600' : 'bg-gray-200'}`}></div>
            <div className={`dot absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition-transform ${checked ? 'translate-x-6' : ''}`}></div>
        </div>
    </label>
);

const ImageUploader: React.FC<{
  label: string;
  currentUrl?: string;
  onUploadSuccess: (url: string) => void;
  helperText?: string;
}> = ({ label, currentUrl, onUploadSuccess, helperText }) => {
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (file: File) => {
    if (!file) return;
    setIsUploading(true);
    try {
        const processedFile = await compressImage(file);
        const fileName = `public/${uuidv4()}-${processedFile.name}`;
        const { data, error } = await supabase.storage
            .from('config_assets')
            .upload(fileName, processedFile);
        
        if (error) throw error;

        const { data: { publicUrl } } = supabase.storage
            .from('config_assets')
            .getPublicUrl(fileName);
            
        onUploadSuccess(publicUrl);
    } catch (error: any) {
        alert('Gagal mengunggah gambar: ' + error.message);
    } finally {
        setIsUploading(false);
    }
  };
  
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
  };

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      {helperText && <p className="text-xs text-gray-500 mb-2">{helperText}</p>}
      
      <div className="mt-1 flex items-center space-x-4 p-2 border-2 border-dashed rounded-lg bg-gray-50">
        {currentUrl ? (
          <img src={currentUrl} alt={label} className="h-20 w-auto object-contain bg-white border p-1 rounded" />
        ) : (
          <div className="h-16 w-24 bg-white border rounded flex items-center justify-center text-xs text-gray-400">Preview</div>
        )}
        <div className="flex-grow">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="bg-white hover:bg-gray-100 border border-gray-300 text-gray-700 font-semibold py-2 px-4 rounded-lg text-sm disabled:opacity-50 shadow-sm"
          >
            {isUploading ? 'Mengompres & Upload...' : 'Pilih Gambar'}
          </button>
          <input type="file" ref={fileInputRef} onChange={handleFileSelect} className="hidden" accept="image/png, image/jpeg" />
        </div>
      </div>
    </div>
  );
};


const ConfigurationScreen: React.FC<ConfigurationScreenProps> = (props) => {
  const { config, onUpdateConfig, user, onLogout, onAdminPasswordChange, onSyncAdminPasswordForQR, isProcessing } = props;
  const [activeTab, setActiveTab] = useState<'tampilan' | 'keamanan' | 'akun' | 'login' | 'kartu'>('tampilan');
  const [formData, setFormData] = useState<AppConfig>(config);
  const [isSaved, setIsSaved] = useState(false);
  
  const [adminPassword, setAdminPassword] = useState('');
  const [adminPasswordConfirm, setAdminPasswordConfirm] = useState('');
  const [adminPassError, setAdminPassError] = useState('');
  const [isSavingAdminPass, setIsSavingAdminPass] = useState(false);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [useCustomExamEvent, setUseCustomExamEvent] = useState(false);

  useEffect(() => {
    setFormData(config);
    // Check if current event is in the predefined list
    if (config.currentExamEvent && !EXAM_EVENT_TYPES.includes(config.currentExamEvent)) {
      setUseCustomExamEvent(true);
    }
  }, [config]);

  const hasChanges = useMemo(() => JSON.stringify(config) !== JSON.stringify(formData), [config, formData]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { id, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    
    setFormData(prev => ({
      ...prev,
      [id]: type === 'checkbox' ? checked : type === 'number' ? parseInt(value, 10) || 0 : value,
    }));
  };
  
  const handleExamEventChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === 'CUSTOM') {
      setUseCustomExamEvent(true);
      setFormData(prev => ({ ...prev, currentExamEvent: '' }));
    } else {
      setUseCustomExamEvent(false);
      setFormData(prev => ({ ...prev, currentExamEvent: val }));
    }
  };

  const handleCancel = () => {
    setFormData(config);
    setUseCustomExamEvent(config.currentExamEvent && !EXAM_EVENT_TYPES.includes(config.currentExamEvent) ? true : false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Ensure we map snake_case correctly in parent or explicitly here (logic moved to App.tsx usually but checking)
    // The App.tsx handles the mapping to snake_case for DB. Here we just pass formData.
    const success = await onUpdateConfig(formData);
    if (success) {
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 3000);
    }
  };

  const handleAdminPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminPassError('');
    if (adminPassword.length < 6) {
        setAdminPassError('Password baru harus minimal 6 karakter.');
        return;
    }
    if (adminPassword !== adminPasswordConfirm) {
        setAdminPassError('Konfirmasi password tidak cocok.');
        return;
    }
    setIsSavingAdminPass(true);
    const success = await onAdminPasswordChange(adminPassword);
    if (success) {
        setAdminPassword('');
        setAdminPasswordConfirm('');
    }
    setIsSavingAdminPass(false);
  };

  const handleSyncPassword = async (password: string): Promise<boolean> => {
    const success = await onSyncAdminPasswordForQR(password);
    if (success) {
        setIsSyncModalOpen(false);
    }
    return success;
  };

  const renderContent = () => {
      switch(activeTab) {
          case 'tampilan':
          case 'keamanan':
          case 'login':
          case 'kartu':
              return (
                <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
                  <div className="lg:col-span-2 bg-white rounded-xl shadow-xl">
                    <div className="p-6">
                      {activeTab === 'tampilan' && (
                        <div className="space-y-6">
                          <div>
                            <label className="block text-sm font-medium text-gray-700">Jenis Kegiatan Ujian (Global)</label>
                            <p className="text-xs text-gray-500 mb-2">Nama kegiatan ini akan muncul di KOP Surat, Kartu Peserta, dan Berita Acara.</p>
                            <div className="flex flex-col sm:flex-row gap-2">
                                <select 
                                    className="p-2 border rounded-md w-full sm:w-1/2"
                                    value={useCustomExamEvent ? 'CUSTOM' : formData.currentExamEvent}
                                    onChange={handleExamEventChange}
                                >
                                    {EXAM_EVENT_TYPES.map(type => (
                                        <option key={type} value={type}>{type}</option>
                                    ))}
                                    <option value="CUSTOM">-- Lainnya (Custom) --</option>
                                </select>
                                {useCustomExamEvent && (
                                    <input 
                                        type="text" 
                                        id="currentExamEvent"
                                        className="p-2 border rounded-md w-full sm:w-1/2" 
                                        placeholder="Ketik nama kegiatan..." 
                                        value={formData.currentExamEvent}
                                        onChange={handleChange}
                                        autoFocus
                                    />
                                )}
                            </div>
                          </div>
                          
                          <div>
                            <label htmlFor="academicYear" className="block text-sm font-medium text-gray-700">Tahun Ajaran Global</label>
                            <input type="text" id="academicYear" value={formData.academicYear || ''} onChange={handleChange} className="mt-1 w-full p-2 border rounded-md" placeholder="Contoh: 2023/2024" />
                          </div>

                          <hr className="border-gray-200" />

                          <div><label htmlFor="schoolName" className="block text-sm font-medium text-gray-700">Nama Sekolah</label><input type="text" name="schoolName" id="schoolName" value={formData.schoolName} onChange={handleChange} className="mt-1 w-full p-2 border rounded-md"/></div>
                          
                          <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                              <h4 className="text-sm font-bold text-gray-800 mb-3 uppercase tracking-wider">Pengaturan KOP Surat</h4>
                              <div className="grid grid-cols-1 gap-4">
                                  <div>
                                      <label htmlFor="kopHeader1" className="block text-xs font-medium text-gray-500 uppercase">Header Baris 1 (Pemerintah)</label>
                                      <input type="text" name="kopHeader1" id="kopHeader1" value={formData.kopHeader1 || ''} onChange={handleChange} className="mt-1 w-full p-2 border rounded-md" placeholder="PEMERINTAH PROVINSI JAWA TIMUR" />
                                  </div>
                                  <div>
                                      <label htmlFor="kopHeader2" className="block text-xs font-medium text-gray-500 uppercase">Header Baris 2 (Dinas)</label>
                                      <input type="text" name="kopHeader2" id="kopHeader2" value={formData.kopHeader2 || ''} onChange={handleChange} className="mt-1 w-full p-2 border rounded-md" placeholder="DINAS PENDIDIKAN" />
                                  </div>
                                  <div><label htmlFor="schoolAddress" className="block text-xs font-medium text-gray-500 uppercase">Alamat Lengkap</label><input type="text" name="schoolAddress" id="schoolAddress" value={formData.schoolAddress || ''} onChange={handleChange} className="mt-1 w-full p-2 border rounded-md"/></div>
                              </div>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-4">
                             <div>
                                <label htmlFor="schoolDistrict" className="block text-sm font-medium text-gray-700">Kabupaten/Kota</label>
                                <input type="text" name="schoolDistrict" id="schoolDistrict" value={formData.schoolDistrict || ''} onChange={handleChange} className="mt-1 w-full p-2 border rounded-md" placeholder="KAB. DEMAK"/>
                             </div>
                             <div>
                                <label htmlFor="regionCode" className="block text-sm font-medium text-gray-700">Kode Wilayah</label>
                                <input type="text" name="regionCode" id="regionCode" value={formData.regionCode || ''} onChange={handleChange} className="mt-1 w-full p-2 border rounded-md" placeholder="06"/>
                             </div>
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                             <div>
                                <label htmlFor="schoolCode" className="block text-sm font-medium text-gray-700">Kode Sekolah</label>
                                <input type="text" name="schoolCode" id="schoolCode" value={formData.schoolCode || ''} onChange={handleChange} className="mt-1 w-full p-2 border rounded-md" placeholder="0114"/>
                             </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <ImageUploader 
                                label="Logo Kiri (Pemerintah)"
                                currentUrl={formData.leftLogoUrl}
                                onUploadSuccess={(url) => setFormData(prev => ({...prev, leftLogoUrl: url}))}
                                helperText="Logo Kabupaten/Provinsi. PNG Transparan."
                            />
                            <ImageUploader 
                                label="Logo Kanan (Sekolah)"
                                currentUrl={formData.logoUrl}
                                onUploadSuccess={(url) => setFormData(prev => ({...prev, logoUrl: url}))}
                                helperText="Logo Sekolah Utama. PNG Transparan."
                            />
                          </div>

                          <div><label htmlFor="primaryColor" className="block text-sm font-medium text-gray-700">Warna Tema Utama</label><div className="mt-1 flex items-center space-x-3"><input type="color" name="primaryColor" id="primaryColor" value={formData.primaryColor} onChange={handleChange} className="h-10 w-10 p-1 border rounded-md cursor-pointer"/><input type="text" value={formData.primaryColor} onChange={handleChange} id="primaryColor" name="primaryColor" className="w-full p-2 border rounded-md font-mono" /></div></div>
                          
                          <div className="pt-4 border-t border-gray-100">
                            <h3 className="text-md font-bold text-gray-800 mb-2">Konfigurasi Domain & Data</h3>
                            <div className="mb-4">
                              <label htmlFor="emailDomain" className="block text-sm font-medium text-gray-700">Domain Email Sekolah</label>
                              <input type="text" name="emailDomain" id="emailDomain" value={formData.emailDomain} onChange={handleChange} className="mt-1 w-full p-2 border rounded-md font-mono" placeholder="@sekolah.sch.id"/>
                              <p className="text-xs text-orange-600 mt-1">Perhatian: Mengubah domain akan mengupdate semua username siswa yang sudah ada di sistem.</p>
                            </div>
                            <div>
                              <label htmlFor="studentDataSheetUrl" className="block text-sm font-medium text-gray-700">URL Google Sheet Data Siswa (CSV)</label>
                              <p className="text-xs text-gray-500 mb-2">Publikasikan sheet sebagai CSV ('File' &gt; 'Share' &gt; 'Publish to web' &gt; 'Comma-separated values (.csv)') dan tempelkan link di sini.</p>
                              <input type="url" name="studentDataSheetUrl" id="studentDataSheetUrl" value={formData.studentDataSheetUrl || ''} onChange={handleChange} className="mt-1 w-full p-2 border rounded-md" placeholder="https://docs.google.com/spreadsheets/d/.../pub?output=csv" />
                            </div>
                          </div>
                        </div>
                      )}
                       {activeTab === 'keamanan' && (
                        <div className="space-y-6">
                           <ToggleSwitch id="enableAntiCheat" label="Sistem Anti-Curang" checked={formData.enableAntiCheat} onChange={handleChange} />
                          <div>
                            <label htmlFor="antiCheatViolationLimit" className="block text-sm font-medium text-gray-700">Batas Pelanggaran</label>
                            <p className="text-xs text-gray-500 mb-2">Jumlah maksimal pelanggaran sebelum siswa didiskualifikasi.</p>
                            <input type="number" name="antiCheatViolationLimit" id="antiCheatViolationLimit" value={formData.antiCheatViolationLimit} onChange={handleChange} min="1" className="mt-1 w-full p-2 border rounded-md max-w-xs" disabled={!formData.enableAntiCheat}/>
                          </div>
                        </div>
                      )}
                      {activeTab === 'login' && (
                          <div className="space-y-8">
                            <div className="border rounded-xl p-4">
                                <h3 className="text-lg font-bold text-gray-800 mb-4">Pengaturan Login Siswa</h3>
                                <div className="space-y-4">
                                    <ToggleSwitch id="allowStudentManualLogin" label="Izinkan Login Manual (Username/Password)" checked={formData.allowStudentManualLogin} onChange={handleChange} />
                                    <ToggleSwitch id="allowStudentQrLogin" label="Izinkan Login via QR Code" checked={formData.allowStudentQrLogin} onChange={handleChange} />
                                </div>
                            </div>
                             <div className="border rounded-xl p-4">
                                <h3 className="text-lg font-bold text-gray-800 mb-4">Pengaturan Login Admin</h3>
                                <div className="space-y-4">
                                    <ToggleSwitch id="allowAdminManualLogin" label="Izinkan Login Manual (Username/Password)" checked={formData.allowAdminManualLogin} onChange={handleChange} />
                                    <ToggleSwitch id="allowAdminQrLogin" label="Izinkan Login via QR Code" checked={formData.allowAdminQrLogin} onChange={handleChange} />
                                </div>
                                <div className="border-t pt-6 mt-6">
                                    <h3 className="text-lg font-bold text-gray-800 mb-2">Aktivasi Login QR Admin</h3>
                                    <p className="text-sm text-gray-600">
                                        Sinkronkan password Anda dengan kunci keamanan unik (UID) pada Kartu ID Anda untuk mengaktifkan login otomatis via QR code.
                                    </p>
                                    <p className="mt-2 text-sm font-bold text-yellow-600 bg-yellow-50 p-3 rounded-md border border-yellow-200">
                                        PENTING: Anda akan logout setelah aktivasi.
                                    </p>
                                    <button
                                        type="button"
                                        onClick={() => setIsSyncModalOpen(true)}
                                        className="mt-4 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg flex items-center space-x-2 shadow-md hover:shadow-lg transition"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 2a2 2 0 00-2 2v1.333a2 2 0 00-1 1.732V15a2 2 0 002 2h2a2 2 0 002-2V7.065a2 2 0 00-1-1.732V4a2 2 0 00-2-2zm-2 6v5a1 1 0 001 1h2a1 1 0 001-1V8h-4z" clipRule="evenodd" /></svg>
                                        <span>Aktifkan & Sinkronkan Password</span>
                                    </button>
                                </div>
                            </div>
                          </div>
                      )}
                      {activeTab === 'kartu' && (
                        <div className="space-y-6">
                            <h3 className="text-lg font-bold text-gray-800">Detail Kartu Ujian & Dokumen</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div><label htmlFor="cardIssueDate" className="block text-sm font-medium text-gray-700">Tempat & Tanggal Terbit Kartu</label><input type="text" name="cardIssueDate" id="cardIssueDate" value={formData.cardIssueDate || ''} onChange={handleChange} placeholder="Contoh: Surabaya, 25 Juli 2024" className="mt-1 w-full p-2 border rounded-md"/></div>
                                <div><label htmlFor="headmasterName" className="block text-sm font-medium text-gray-700">Nama Kepala Sekolah</label><input type="text" name="headmasterName" id="headmasterName" value={formData.headmasterName || ''} onChange={handleChange} className="mt-1 w-full p-2 border rounded-md"/></div>
                                <div><label htmlFor="headmasterNip" className="block text-sm font-medium text-gray-700">NIP Kepala Sekolah</label><input type="text" name="headmasterNip" id="headmasterNip" value={formData.headmasterNip || ''} onChange={handleChange} placeholder="Contoh: NIP. 123456789012345678" className="mt-1 w-full p-2 border rounded-md"/></div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-gray-100">
                                <ImageUploader 
                                    label="Tanda Tangan Digital (PNG)"
                                    currentUrl={formData.signatureUrl}
                                    onUploadSuccess={(url) => setFormData(prev => ({ ...prev, signatureUrl: url }))}
                                    helperText="Wajib format .PNG (Background Transparan). Ukuran maks 500KB. Rasio ideal 3:2 (Lebar:Tinggi)."
                                />
                                <ImageUploader 
                                    label="Stempel Sekolah (PNG)"
                                    currentUrl={formData.stampUrl}
                                    onUploadSuccess={(url) => setFormData(prev => ({ ...prev, stampUrl: url }))}
                                    helperText="Wajib format .PNG (Background Transparan). Ukuran maks 500KB. Rasio ideal 1:1 (Kotak/Bulat)."
                                />
                            </div>
                        </div>
                      )}
                    </div>
                    <div className="p-4 bg-gray-50 border-t flex items-center justify-end space-x-4 sticky bottom-0">
                      <span className={`text-sm font-semibold transition-opacity duration-300 ${isSaved ? 'opacity-100 text-green-600' : 'opacity-0'}`}>Perubahan disimpan!</span>
                      <button type="button" onClick={handleCancel} disabled={!hasChanges} className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-4 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed">Batal</button>
                      <button type="submit" disabled={!hasChanges} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg shadow-md disabled:bg-gray-400 disabled:cursor-not-allowed">Simpan Perubahan</button>
                    </div>
                  </div>
                  <div className="lg:col-span-1 hidden lg:block"></div>
                </form>
              );
           case 'akun':
                return (
                     <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        <div className="bg-white rounded-xl shadow-xl p-6">
                            <h3 className="text-xl font-bold text-gray-800 mb-4">Ubah Password Admin</h3>
                            <form onSubmit={handleAdminPasswordSubmit} className="space-y-4">
                                <div><label className="block text-sm font-medium text-gray-700">Password Baru</label><input type="password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} className="mt-1 w-full p-2 border rounded-md" required /></div>
                                <div><label className="block text-sm font-medium text-gray-700">Konfirmasi Password Baru</label><input type="password" value={adminPasswordConfirm} onChange={(e) => setAdminPasswordConfirm(e.target.value)} className="mt-1 w-full p-2 border rounded-md" required /></div>
                                {adminPassError && <p className="text-sm text-red-600">{adminPassError}</p>}
                                <div><button type="submit" disabled={isSavingAdminPass} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg disabled:bg-blue-400">{isSavingAdminPass ? 'Menyimpan...' : 'Simpan Password Admin'}</button></div>
                            </form>
                        </div>
                        <div className="bg-gray-50 rounded-xl p-6 border border-dashed">
                             <h3 className="text-xl font-bold text-gray-800 mb-2">Reset Password Siswa</h3>
                             <p className="text-sm text-gray-500 mb-4">Manajemen password siswa kini dilakukan langsung di <strong className="text-gray-700">Google Sheet</strong> data siswa.</p>
                        </div>
                    </div>
                );
          default:
              return null;
      }
  };

  return (
    <div className="animate-fade-in">
      <h1 className="text-3xl font-bold text-gray-800 mb-6">Konfigurasi Aplikasi</h1>
      
      <div className="bg-white rounded-xl shadow-xl mb-8">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-6 px-6 overflow-x-auto">
            <button type="button" onClick={() => setActiveTab('tampilan')} className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'tampilan' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>Tampilan & Umum</button>
            <button type="button" onClick={() => setActiveTab('kartu')} className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'kartu' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>Pengaturan Kartu</button>
            <button type="button" onClick={() => setActiveTab('login')} className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'login' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>Metode Login</button>
            <button type="button" onClick={() => setActiveTab('keamanan')} className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'keamanan' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>Keamanan Ujian</button>
            <button type="button" onClick={() => setActiveTab('akun')} className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'akun' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>Akun & Password</button>
          </nav>
        </div>
      </div>

      {renderContent()}
      
      {isSyncModalOpen && <PasswordSyncModal onConfirm={handleSyncPassword} onClose={() => setIsSyncModalOpen(false)} isSyncing={isProcessing} />}
    </div>
  );
};

export default ConfigurationScreen;
