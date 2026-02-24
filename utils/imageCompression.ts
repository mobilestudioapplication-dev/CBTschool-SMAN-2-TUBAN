
/**
 * Utility untuk mengompres gambar di sisi klien sebelum diupload.
 * Mengubah gambar besar menjadi format efisien (JPEG/WebP) dengan ukuran wajar.
 */

export const compressImage = async (file: File): Promise<File> => {
  // Jika file sudah kecil (< 200KB), kembalikan langsung
  if (file.size < 200 * 1024) return file;

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      
      img.onload = () => {
        const canvas = document.createElement('canvas');
        
        // Aturan Resize: Maksimal lebar 1024px (Standar HD layar laptop/HP)
        const MAX_WIDTH = 1024;
        const scaleSize = MAX_WIDTH / img.width;
        
        // Hanya resize jika gambar lebih lebar dari batas
        if (scaleSize < 1) {
            canvas.width = MAX_WIDTH;
            canvas.height = img.height * scaleSize;
        } else {
            canvas.width = img.width;
            canvas.height = img.height;
        }

        const ctx = canvas.getContext('2d');
        if (!ctx) {
            resolve(file); // Fallback jika canvas gagal
            return;
        }

        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        // Kompresi ke JPEG dengan kualitas 70% (Sangat cukup untuk soal)
        canvas.toBlob(
          (blob) => {
            if (blob) {
              // Buat file baru dari blob yang sudah dikompres
              const compressedFile = new File([blob], file.name.replace(/\.[^/.]+$/, ".jpg"), {
                type: 'image/jpeg',
                lastModified: Date.now(),
              });
              
              console.log(`Kompresi Gambar: ${(file.size/1024).toFixed(2)}KB -> ${(compressedFile.size/1024).toFixed(2)}KB`);
              resolve(compressedFile);
            } else {
              resolve(file); // Fallback
            }
          },
          'image/jpeg', 
          0.7 // Kualitas 70%
        );
      };
      
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
};
