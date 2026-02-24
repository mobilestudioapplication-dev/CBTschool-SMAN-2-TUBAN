# 🏁 PANDUAN INSTALASI DATABASE CBT SCHOOL (SUPABASE)

Ikuti langkah-langkah ini secara berurutan untuk menyiapkan backend aplikasi Anda di dashboard Supabase.

---

### 1️⃣ Jalankan Skrip SQL Utama
1. Masuk ke [Dashboard Supabase](https://app.supabase.com/).
2. Pilih project Anda: `ytlizvulzbnubvdlhtpz`.
3. Buka menu **SQL Editor** di sidebar kiri.
4. Klik **"+ New Query"**.
5. Salin dan tempel seluruh isi dari file `SETUP_DATABASE.sql` (ada di bawah panduan ini).
6. Klik tombol **RUN**.

### 2️⃣ Siapkan Akun Administrator
Aplikasi membutuhkan satu akun pusat dengan email khusus agar sistem mengenalnya sebagai Admin.
1. Pergi ke menu **Authentication** > **Users**.
2. Klik **"Add user"** > **"Create new user"**.
3. Masukkan:
   - **Email:** `admin@cbtschool.com`
   - **Password:** (Buat password aman Anda sendiri)
4. Pastikan centang **"Auto Confirm User"** dalam posisi aktif.
5. Klik **"Create user"**.

### 3️⃣ Verifikasi Hak Akses Admin
Kembali ke **SQL Editor**, jalankan perintah singkat ini untuk memastikan akun tersebut memiliki label Admin:
```sql
UPDATE auth.users 
SET raw_user_meta_data = '{"is_admin": true, "full_name": "Administrator Utama"}' 
WHERE email = 'admin@cbtschool.com';
```

### 4️⃣ Konfigurasi Storage (PENTING)
Aplikasi perlu menyimpan gambar soal dan logo. Skrip SQL seharusnya sudah membuatkan bucket, namun pastikan hal berikut:
1. Pergi ke menu **Storage**.
2. Pastikan ada dua bucket bernama: `question_assets` dan `config_assets`.
3. Pastikan keduanya diatur sebagai **Public**.

---

**🎉 SELESAI!**
Sekarang Anda bisa login ke aplikasi menggunakan email `admin@cbtschool.com` dan mulai membuat bank soal atau menyinkronkan data siswa dari Google Sheets.