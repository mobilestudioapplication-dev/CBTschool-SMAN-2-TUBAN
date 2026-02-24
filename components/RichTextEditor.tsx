
import React, { useRef, useState, useEffect } from 'react';
import { compressImage } from '../utils/imageCompression'; // Import fungsi kompresi

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  onImageUpload: (file: File) => Promise<string | null>;
  height?: string;
  simple?: boolean; // Jika true, toolbar lebih sederhana (untuk opsi jawaban)
}

const RichTextEditor: React.FC<RichTextEditorProps> = ({ 
  value, 
  onChange, 
  placeholder, 
  onImageUpload,
  height = "h-48",
  simple = false
}) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Sync value prop to innerHTML only if different (to prevent cursor jumping)
  useEffect(() => {
    if (contentRef.current && contentRef.current.innerHTML !== value) {
      // Hanya update jika konten benar-benar berbeda drastis atau kosong
      if (value === '' && contentRef.current.innerHTML === '<br>') return;
      contentRef.current.innerHTML = value;
    }
  }, [value]);

  const handleInput = () => {
    if (contentRef.current) {
      onChange(contentRef.current.innerHTML);
    }
  };

  const execCmd = (command: string, value: string | undefined = undefined) => {
    document.execCommand(command, false, value);
    handleInput(); // Sync changes
    // contentRef.current?.focus(); // Removed focus to prevent color picker closing issues on some browsers
  };

  const handleImageClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setIsUploading(true);
      try {
        // STEP 1: Kompresi Gambar di Sisi Klien sebelum Upload
        const processedFile = await compressImage(file);
        
        // STEP 2: Upload file yang sudah dikompres
        const url = await onImageUpload(processedFile);
        
        if (url) {
          // Insert image at cursor
          execCmd('insertImage', url);
        }
      } catch (err: any) {
        console.error("Failed to insert image", err);
        // Pesan error yang lebih user-friendly
        if (err.message && err.message.includes("Entity Too Large")) {
             alert("Ukuran gambar terlalu besar meskipun sudah dikompres. Mohon gunakan gambar di bawah 5MB.");
        } else {
             alert("Gagal mengupload gambar. Pastikan format didukung (JPG/PNG).");
        }
      } finally {
        setIsUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    }
  };

  const ToolbarButton = ({ cmd, arg, icon, title }: { cmd: string, arg?: string, icon: React.ReactNode, title: string }) => (
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); execCmd(cmd, arg); }}
      className="p-1.5 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
      title={title}
    >
      {icon}
    </button>
  );

  return (
    <div className="border border-gray-300 rounded-lg overflow-hidden bg-white shadow-sm focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent transition-all">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1 p-2 bg-gray-50 border-b border-gray-200">
        <ToolbarButton title="Bold" cmd="bold" icon={<svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"></path><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"></path></svg>} />
        <ToolbarButton title="Italic" cmd="italic" icon={<svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="4" x2="10" y2="4"></line><line x1="14" y1="20" x2="5" y2="20"></line><line x1="15" y1="4" x2="9" y2="20"></line></svg>} />
        <ToolbarButton title="Underline" cmd="underline" icon={<svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3v7a6 6 0 0 0 6 6 6 6 0 0 0 6-6V3"></path><line x1="4" y1="21" x2="20" y2="21"></line></svg>} />
        
        {/* Color Picker */}
        <div className="relative group p-1.5 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors" title="Warna Teks">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20h16"></path><path d="m6 16 6-12 6 12"></path><path d="M8 12h8"></path></svg>
            <input 
              type="color" 
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              onChange={(e) => execCmd('foreColor', e.target.value)}
            />
        </div>

        <div className="w-px h-5 bg-gray-300 mx-1"></div>

        {!simple && (
          <>
            <ToolbarButton title="Align Left" cmd="justifyLeft" icon={<svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="17" y1="10" x2="3" y2="10"></line><line x1="21" y1="6" x2="3" y2="6"></line><line x1="21" y1="14" x2="3" y2="14"></line><line x1="17" y1="18" x2="3" y2="18"></line></svg>} />
            <ToolbarButton title="Align Center" cmd="justifyCenter" icon={<svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="10" x2="6" y2="10"></line><line x1="21" y1="6" x2="3" y2="6"></line><line x1="21" y1="14" x2="3" y2="14"></line><line x1="18" y1="18" x2="6" y2="18"></line></svg>} />
            <ToolbarButton title="Align Right" cmd="justifyRight" icon={<svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="21" y1="10" x2="7" y2="10"></line><line x1="21" y1="6" x2="3" y2="6"></line><line x1="21" y1="14" x2="3" y2="14"></line><line x1="21" y1="18" x2="7" y2="18"></line></svg>} />
            
            <div className="w-px h-5 bg-gray-300 mx-1"></div>

            <ToolbarButton title="Ordered List" cmd="insertOrderedList" icon={<svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="10" y1="6" x2="21" y2="6"></line><line x1="10" y1="12" x2="21" y2="12"></line><line x1="10" y1="18" x2="21" y2="18"></line><path d="M4 6h1v4"></path><path d="M4 10h2"></path><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"></path></svg>} />
            <ToolbarButton title="Unordered List" cmd="insertUnorderedList" icon={<svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>} />
            
            <div className="w-px h-5 bg-gray-300 mx-1"></div>
          </>
        )}

        <button
          type="button"
          onClick={handleImageClick}
          disabled={isUploading}
          className="p-1.5 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors disabled:opacity-50"
          title="Insert Image (Auto Compressed)"
        >
          {isUploading ? (
             <svg className="animate-spin w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
          ) : (
             <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
          )}
        </button>
        <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileChange} 
            className="hidden" 
            accept="image/png, image/jpeg, image/webp"
        />
      </div>

      {/* Editor Area */}
      <div
        ref={contentRef}
        contentEditable
        onInput={handleInput}
        className={`w-full p-4 overflow-y-auto outline-none prose max-w-none text-sm text-gray-800 ${height}`}
        style={{ minHeight: height === 'h-auto' ? '100px' : undefined }}
        data-placeholder={placeholder}
      />
      <style>{`
        [contenteditable]:empty:before {
          content: attr(data-placeholder);
          color: #9ca3af;
          pointer-events: none;
          display: block; /* For Firefox */
        }
        .prose img {
            max-width: 100%;
            height: auto;
            border-radius: 4px;
            margin: 0.5rem 0;
            border: 1px solid #e5e7eb;
        }
        .prose ul { list-style-type: disc; padding-left: 1.5rem; }
        .prose ol { list-style-type: decimal; padding-left: 1.5rem; }
      `}</style>
    </div>
  );
};

export default RichTextEditor;
