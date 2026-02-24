
# PANDUAN PERBAIKAN MASALAH LOGIN SISWA (DARURAT)

Jika siswa Anda mengalami masalah login (misalnya muncul pesan error "Login Gagal" atau "Autentikasi tidak berhasil"), ikuti panduan ini.

---

### ✅ Langkah 1: Perbaiki Database (Sekali Jalan)

Langkah ini akan memastikan semua akun siswa yang terdaftar benar-benar aktif dan passwordnya direset ke NISN.

1.  Login ke **Supabase Dashboard** (app.supabase.com).
2.  Masuk ke menu **SQL Editor**.
3.  Buka file `SQL.md` yang ada di proyek kode Anda.
4.  Salin **SELURUH** isi dari bagian **`MODUL C: PERBAIKAN LOGIN SISWA (DARURAT)`**.
5.  Tempel kode tersebut ke SQL Editor di Supabase.
6.  Klik tombol **Run** (di pojok kanan bawah).

**Hasil yang diharapkan:**
Anda akan melihat pesan sukses seperti: *"Perbaikan selesai. Email dikonfirmasi & [jumlah] akun login siswa dipulihkan."*

---

### ✅ Langkah 2: Gunakan Fitur Perbaikan Otomatis di Dashboard

Setelah Langkah 1 dilakukan (install script), Anda bisa memperbaiki masalah login di masa depan langsung dari aplikasi Admin tanpa membuka Supabase lagi.

1.  Login ke Aplikasi CBT sebagai **Admin**.
2.  Di halaman utama Dashboard (Dashboard Home), lihat kotak kuning di bagian bawah bertuliskan **"Integritas Data & Troubleshooting"**.
3.  Klik tombol merah bertuliskan **"Perbaiki Masalah Login"**.
4.  Tunggu hingga muncul pesan sukses.

---

### ✅ Langkah 3: Instruksikan Siswa (Cara Login Baru)

Aplikasi telah diperbarui untuk memudahkan siswa. Beritahukan hal ini kepada mereka:

*   **Username:** Cukup masukkan **NISN** saja (contoh: `1234567890`). Tidak perlu mengetik `@smkn8sby.sch.id`.
*   **Password:** Password default adalah **NISN** mereka.
*   **Jika Gagal:** Minta siswa menyegarkan halaman (Refresh/F5) untuk mendapatkan versi aplikasi terbaru.

---

**Catatan:**
Jika siswa masih belum bisa login setelah langkah di atas, kemungkinan NISN mereka belum terdaftar di menu "Manajemen User". Silakan tambah atau import data siswa tersebut terlebih dahulu.
