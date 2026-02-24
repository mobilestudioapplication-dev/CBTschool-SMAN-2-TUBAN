# PANDUAN LENGKAP INSTALASI DATABASE BARU (DARI NOL)

Ikuti 3 langkah di bawah ini secara berurutan pada proyek Supabase baru Anda untuk menjamin sistem berjalan dengan sempurna.

---

### ✅ LANGKAH 1: Jalankan Skrip Instalasi Utama

Skrip ini akan membuat semua tabel, fungsi, kebijakan keamanan, dan data awal yang dibutuhkan oleh aplikasi.

1.  Buka **SQL Editor** di dashboard Supabase Anda.
2.  Buka file `SQL.md` di proyek ini.
3.  Salin **SELURUH** isi dari **`MODUL A: INSTALASI LENGKAP / RESET TOTAL`**.
4.  Tempelkan ke SQL Editor, lalu klik **RUN**.

Tunggu beberapa saat hingga skrip selesai dieksekusi.

---

### ✅ LANGKAH 2: Buat Akun Administrator Utama

Sistem membutuhkan satu akun admin sebagai pusat kontrol.

1.  Di dashboard Supabase, pergi ke menu **Authentication**.
2.  Klik tombol **"Add user"**.
3.  Isi form sebagai berikut:
    -   **Email:** `admin@cbtschool.com`
    -   **Password:** *Buat password yang kuat dan aman untuk Anda.*
    -   **Auto Confirm User?** Pastikan toggle ini **AKTIF (ON)**.
4.  Klik **"Create user"**.

---

### ✅ LANGKAH 3: Berikan Hak Akses Admin Penuh

Akun yang baru dibuat perlu diberi "label" sebagai admin di database.

1.  Kembali ke **SQL Editor**.
2.  Salin perintah di bawah ini, tempelkan ke editor, lalu klik **RUN**.

```sql
UPDATE auth.users
SET raw_user_meta_data = '{"is_admin": true, "full_name": "Administrator"}'
WHERE email = 'admin@cbtschool.com';
```

---

**🎉 SELESAI! 🎉**

Instalasi Anda telah selesai. Sekarang Anda bisa login ke aplikasi menggunakan email `admin@cbtschool.com` dan password yang baru saja Anda buat. Semua fitur, termasuk login untuk siswa, sudah siap digunakan.
