
import React from 'react';
import { X, Shield, AlertTriangle, Cpu, Mail, MessageCircle, Youtube } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AppConfig } from '../types';

interface CopyrightModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: AppConfig;
}

const CopyrightModal: React.FC<CopyrightModalProps> = ({ isOpen, onClose, config }) => {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
        />

        {/* Modal Content */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-slate-50 p-1.5 border border-slate-100 flex items-center justify-center">
                <img src={config.logoUrl} alt="Logo" className="w-full h-full object-contain" />
              </div>
              <h2 className="text-lg font-bold text-slate-800">Pemberitahuan Hak Cipta</h2>
            </div>
            <button 
              onClick={onClose}
              className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400 hover:text-slate-600"
            >
              <X size={20} />
            </button>
          </div>

          {/* Body */}
          <div className="p-6 overflow-y-auto space-y-6 custom-scrollbar">
            {/* Certificate ID */}
            <div className="bg-blue-50/50 border border-blue-100 border-dashed rounded-xl p-4 text-center">
              <p className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold mb-1">ID Sertifikat Hak Cipta Digital</p>
              <p className="text-blue-600 font-mono font-bold text-sm sm:text-base tracking-wider">
                CBT-200226-110789-KMP01-KKQC
              </p>
            </div>

            {/* Legal Protection */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-slate-700 font-bold text-sm">
                <Shield size={16} className="text-slate-400" />
                <span>Perlindungan Hukum</span>
              </div>
              <p className="text-slate-600 text-sm leading-relaxed">
                Aplikasi <span className="font-bold text-slate-800">CBT School</span> ini secara penuh dilindungi oleh <span className="font-semibold">Undang-Undang No. 28 Tahun 2014 tentang Hak Cipta</span>.
              </p>
            </div>

            {/* Sanctions Box */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-amber-700 font-bold text-sm">
                <AlertTriangle size={16} />
                <span>Sanksi Pelanggaran (Pasal 113 ayat 3)</span>
              </div>
              <p className="text-amber-800/80 text-xs sm:text-sm leading-relaxed">
                Setiap orang yang tanpa hak dan/atau tanpa izin Pencipta atau pemegang Hak Cipta melakukan pelanggaran hak ekonomi Pencipta [...] untuk Penggunaan Secara Komersial dipidana dengan pidana penjara paling lama <span className="font-bold">4 (empat) tahun</span> dan/atau pidana denda paling banyak <span className="font-bold text-amber-900">Rp1.000.000.000,00 (satu miliar rupiah)</span>.
              </p>
            </div>

            {/* AI Monitoring */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-slate-700 font-bold text-sm">
                <Cpu size={16} className="text-slate-400" />
                <span>Monitoring AI 24/7</span>
              </div>
              <p className="text-slate-600 text-sm leading-relaxed">
                Aplikasi ini dimonitor oleh kecerdasan buatan (AI) 24/7 untuk mendeteksi segala bentuk penyalahgunaan, duplikasi, atau pelanggaran hak cipta lainnya.
              </p>
            </div>

            <div className="h-px bg-slate-100 w-full" />

            {/* Developer Info */}
            <div className="space-y-4">
              <p className="text-sm font-bold text-slate-700">
                Informasi Pengembang: <span className="text-blue-600">Ari Wijaya</span>
              </p>
              
              <div className="grid grid-cols-3 gap-3">
                <a href="mailto:kita.bisa.berkarya2018@gmail.com" className="flex flex-col items-center justify-center p-3 bg-slate-50 hover:bg-blue-50 rounded-xl border border-slate-100 hover:border-blue-200 transition-all group">
                  <Mail size={20} className="text-blue-500 mb-2 group-hover:scale-110 transition-transform" />
                  <span className="text-[10px] font-bold text-slate-500 uppercase">Email</span>
                </a>
                <a href="https://wa.me/6282134894442" target="_blank" rel="noreferrer" className="flex flex-col items-center justify-center p-3 bg-slate-50 hover:bg-emerald-50 rounded-xl border border-slate-100 hover:border-emerald-200 transition-all group">
                  <MessageCircle size={20} className="text-emerald-500 mb-2 group-hover:scale-110 transition-transform" />
                  <span className="text-[10px] font-bold text-slate-500 uppercase">WhatsApp</span>
                </a>
                <a href="https://www.youtube.com/@kitabisaberkarya" target="_blank" rel="noreferrer" className="flex flex-col items-center justify-center p-3 bg-slate-50 hover:bg-red-50 rounded-xl border border-slate-100 hover:border-red-200 transition-all group">
                  <Youtube size={20} className="text-red-500 mb-2 group-hover:scale-110 transition-transform" />
                  <span className="text-[10px] font-bold text-slate-500 uppercase">YouTube</span>
                </a>
              </div>
            </div>
          </div>

          {/* Footer Button */}
          <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
            <button
              onClick={onClose}
              className="px-8 py-2.5 bg-[#0088cc] hover:bg-[#0077bb] text-white font-bold rounded-lg transition-all shadow-lg shadow-blue-200 active:scale-95"
            >
              Mengerti
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default CopyrightModal;
