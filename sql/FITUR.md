
# DOKUMENTASI FITUR LENGKAP APLIKASI CBT SCHOOL
**Versi: 2.0 (Supabase Edition)**

Dokumen ini menjelaskan secara rinci seluruh fitur, fungsi, dan alur penggunaan aplikasi CBT SCHOOL, baik dari sisi peserta ujian (Siswa) maupun pengelola (Admin/Proktor).

---

## A. MODUL SISWA (FRONT-END)
Dirancang dengan antarmuka yang bersih, responsif, dan fokus pada pengalaman ujian yang lancar.

### 1. Sistem Login Fleksibel
Aplikasi mendukung dua metode login untuk memudahkan siswa:
*   **Login Manual:** Siswa memasukkan NISN sebagai username dan password (default password adalah NISN untuk kemudahan awal).
*   **Login QR Code:** Fitur unggulan! Siswa cukup memindai kartu peserta mereka menggunakan kamera HP/Laptop untuk login instan tanpa mengetik.
*   **Validasi Data Real-time:** Sistem otomatis memvalidasi data login dengan database pusat (Google Sheets/Database) untuk memastikan hanya siswa terdaftar yang bisa masuk.

### 2. Verifikasi Data Diri (Biodata)
Sebelum ujian dimulai, siswa akan diarahkan ke halaman konfirmasi biodata yang menampilkan:
*   Foto Profil Siswa.
*   Nama Lengkap, NISN, Kelas, Jurusan, dan Agama.
*   Tombol konfirmasi untuk memastikan akun yang digunakan benar.

### 3. Token Ujian
*   Siswa wajib memasukkan **Token Ujian** (kode unik 5-6 karakter) yang diberikan oleh proktor.
*   Token berfungsi untuk memfilter soal agar siswa hanya mengerjakan mata pelajaran yang dijadwalkan pada jam tersebut.

### 4. Halaman Konfirmasi Tes
Menampilkan detail ujian secara spesifik sebelum dimulai:
*   Nama Tes / Mata Pelajaran.
*   Alokasi Waktu (Durasi).
*   Jumlah Soal.
*   Waktu Mulai & Selesai.

### 5. Antarmuka Ujian (Exam Interface)
Halaman pengerjaan soal didesain user-friendly dengan fitur:
*   **Navigasi Soal:** Tombol *Sebelumnya*, *Selanjutnya*, dan *Daftar Soal* (nomor 1 sampai selesai).
*   **Indikator Warna:** 
    *   Hijau: Soal sedang aktif.
    *   Biru: Soal sudah dijawab.
    *   Kuning: Soal ditandai "Ragu-ragu".
    *   Putih: Soal belum dijawab.
*   **Pengaturan Font:** Siswa dapat membesarkan atau mengecilkan ukuran teks soal sesuai kenyamanan mata.
*   **Timer Mundur:** Penunjuk sisa waktu yang berjalan *real-time* dan tersinkronisasi dengan server (tidak akan reset meski halaman di-refresh).
*   **Responsive Layout:** Tampilan otomatis menyesuaikan layar HP (potrait) atau Laptop (landscape).

### 6. Sistem Keamanan Anti-Curang (Security)
*   **Fullscreen Mode:** Aplikasi memaksa tampilan layar penuh.
*   **Deteksi Fokus Jendela:** Jika siswa membuka tab baru, aplikasi lain, atau meminimize browser, sistem akan mencatat sebagai **Pelanggaran**.
*   **Peringatan Bertingkat:** Siswa diberi peringatan pop-up saat melakukan pelanggaran.
*   **Diskualifikasi Otomatis:** Jika pelanggaran mencapai batas maksimal (misal: 3 kali), akun siswa otomatis terkunci dan status berubah menjadi "Diskualifikasi".

### 7. Penyimpanan Jawaban Otomatis
*   Setiap klik jawaban langsung disimpan ke cloud server (Supabase).
*   Jika listrik mati atau internet putus, jawaban **tidak akan hilang**. Saat login kembali, siswa melanjutkan dari soal terakhir dengan sisa waktu yang tersimpan.

---

## B. MODUL ADMINISTRATOR (BACK-END)
Panel kontrol pusat untuk mengelola seluruh ekosistem ujian.

### 1. Dashboard Utama
Ringkasan eksekutif yang menampilkan:
*   **Statistik Real-time:** Jumlah total siswa, total bank soal, dan sesi ujian yang sedang aktif.
*   **Grafik Analitik:** Distribusi siswa per jurusan, tingkat kelulusan, dan persentase penyelesaian ujian.
*   **Pintasan Cepat:** Tombol untuk sinkronisasi data siswa dan cetak kartu admin.

### 2. Manajemen Data Master
*   **Manajemen Kelas & Jurusan:** Tambah, edit, hapus, atau gabungkan (merge) nama kelas/jurusan untuk merapikan data yang tidak konsisten.
*   **Sinkronisasi Google Sheets:** Fitur canggih untuk mengimpor ribuan data siswa langsung dari Google Sheets tanpa input manual satu per satu.

### 3. Bank Soal (Question Bank)
Fitur pengelolaan soal yang sangat lengkap:
*   **Input Manual:** Editor soal visual (WYSIWYG) mendukung teks, gambar pada soal, dan gambar pada opsi jawaban.
*   **Import File (.txt):** Upload ratusan soal sekaligus menggunakan format teks sederhana.
*   **AI Question Generator (Gemini):** **FITUR PREMIUM!** Admin cukup memasukkan materi/topik pelajaran, dan AI akan membuatkan soal pilihan ganda lengkap dengan kunci jawaban secara otomatis.
*   **Manajemen Paket Soal:** Mengatur nama tes, durasi, dan mata pelajaran.

### 4. Penjadwalan Ujian
*   Mengatur kapan ujian dimulai dan berakhir.
*   **Target Peserta:** Jadwal bisa diatur spesifik untuk Kelas tertentu atau Jurusan tertentu saja (misal: Ujian Produktif TKJ hanya untuk kelas TKJ).
*   **Tampilan Kalender:** Visualisasi jadwal dalam bentuk kalender bulanan.

### 5. Pemantauan Ujian (UBK Real-time)
Layar kontrol untuk Proktor di ruang ujian:
*   **Live Status:** Melihat siapa yang sedang mengerjakan, selesai, atau offline.
*   **Progress Bar:** Melihat progres pengerjaan setiap siswa (misal: 15/40 soal).
*   **Sisa Waktu:** Memantau sisa waktu setiap siswa.
*   **Kontrol Sesi:**
    *   *Reset Login:* Mengizinkan siswa login ulang jika ada kendala perangkat.
    *   *Paksa Selesai:* Menghentikan paksa ujian siswa jika waktu habis atau melakukan kecurangan.
    *   *Lanjutkan (Safe Resume):* Melanjutkan sesi siswa yang terkendala tanpa menghapus jawaban.

### 6. Rekapitulasi Nilai
*   Menghitung skor otomatis segera setelah siswa selesai (Auto-grading).
*   Menampilkan nilai Tertinggi, Terendah, dan Rata-rata.
*   **Export Data:** Unduh hasil nilai ke format **Excel** (untuk olah nilai rapor) atau **PDF** (untuk arsip fisik).

### 7. Analisa Butir Soal
Fitur akademik untuk mengevaluasi kualitas soal:
*   Menghitung tingkat kesulitan soal (Mudah/Sedang/Sulit) berdasarkan statistik jawaban benar siswa.
*   Melihat distribusi jawaban siswa pada setiap opsi (A, B, C, D, E) untuk mengecoh (distractor) analysis.

### 8. Cetak Kartu Peserta
*   Generate kartu ujian otomatis untuk seluruh siswa.
*   Dilengkapi **QR Code** unik untuk login cepat.
*   Mendukung tanda tangan digital kepala sekolah dan stempel sekolah otomatis.
*   Fitur filter cetak per kelas.

### 9. Pengaturan & Kustomisasi (White Label)
Admin dapat mengubah identitas aplikasi sepenuhnya:
*   Nama Sekolah.
*   Logo Sekolah.
*   Warna Tema Aplikasi (Primary Color).
*   Data Kepala Sekolah (Nama & NIP).
*   Upload Tanda Tangan & Stempel.
*   Pengaturan Batas Toleransi Anti-Curang.

### 10. Backup & Restore
*   **Full Backup:** Mengunduh seluruh database (soal, siswa, nilai, config) menjadi file JSON.
*   **Restore:** Mengembalikan data dari file backup jika terjadi kesalahan atau pindah server.
*   **Data Wipe:** Menghapus data spesifik (misal: hapus siswa kelas 12 yang sudah lulus) secara massal.

---

## C. SPESIFIKASI TEKNIS

*   **Front-end:** ReactJS + Vite + Tailwind CSS (Sangat cepat & ringan).
*   **Back-end / Database:** Supabase (PostgreSQL) - Realtime, Scalable, Secure.
*   **Artificial Intelligence:** Google Gemini API (Untuk generator soal).
*   **Kompatibilitas:** Chrome, Firefox, Safari, Edge (Desktop & Mobile Android/iOS).
*   **Koneksi:** Membutuhkan koneksi internet (Online System).

