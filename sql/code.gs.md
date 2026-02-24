# Panduan & Skrip Bantuan Google Sheets untuk Admin CBT

Skrip ini menambahkan menu khusus **`CBT Admin Tools`** di Google Sheets Anda untuk mempermudah persiapan data siswa sebelum diimpor ke aplikasi CBTschool.

## Fitur

1.  **Validasi Data**: Cek cepat untuk menemukan baris dengan kolom wajib yang kosong atau NISN yang duplikat.
2.  **Isi Login Kosong**: Otomatis mengisi kolom `username` dan `password` yang kosong berdasarkan NISN, tanpa mengubah data yang sudah ada.
3.  **Otomatisasi (Trigger)**: Jalankan validasi secara otomatis pada waktu yang ditentukan (misalnya, setiap malam).

---

## Langkah-Langkah Instalasi

1.  **Buka Spreadsheet Anda**: Buka file Google Sheets yang berisi data siswa Anda.
2.  **Buka Editor Skrip**: Klik menu `Extensions` > `Apps Script`.
3.  **Hapus Kode Default**: Hapus semua kode yang ada di file `Code.gs`.
4.  **Salin & Tempel Skrip**: Salin seluruh kode di bawah ini dan tempelkan ke editor Apps Script.
5.  **Simpan Proyek**: Klik ikon simpan (disk) dan beri nama proyek, misalnya "CBT Helper".
6.  **Refresh Spreadsheet**: Kembali ke tab spreadsheet Anda dan segarkan (refresh) halamannya.
7.  **Selesai**: Menu baru bernama **`CBT Admin Tools`** akan muncul di sebelah menu `Help`. Anda mungkin perlu memberikan izin saat pertama kali menjalankan salah satu fungsinya.

---

## Langkah-Langkah Pengaturan Trigger (Cron Job)

Trigger memungkinkan Anda menjalankan fungsi secara otomatis pada interval waktu tertentu (misalnya, setiap hari). Ini sangat berguna untuk melakukan validasi data secara proaktif tanpa perlu menjalankannya manual, sehingga data selalu siap saat dibutuhkan dan tidak memperlambat Anda.

1.  **Buka Editor Skrip**: Dari spreadsheet Anda, klik `Extensions` > `Apps Script`.
2.  **Masuk ke Menu Triggers**: Di sebelah kiri, klik ikon jam (`Triggers`).
3.  **Tambah Trigger Baru**: Klik tombol `+ Add Trigger` di pojok kanan bawah.
4.  **Konfigurasi Trigger**: Isi formulir yang muncul sebagai berikut:
    *   **Choose which function to run**: Pilih `validateData`.
    *   **Choose which deployment should run**: Biarkan `Head`.
    *   **Select event source**: Pilih `Time-driven`.
    *   **Select type of time-based trigger**: Pilih `Day timer` (untuk berjalan setiap hari).
    *   **Select time of day**: Pilih waktu saat spreadsheet jarang digunakan, misalnya `Midnight to 1am`.
    *   **Failure notification settings**: Pilih `Notify me immediately` agar Anda mendapat email jika ada masalah.
5.  **Simpan**: Klik tombol `Save`.

Sekarang, fungsi `validateData` akan berjalan otomatis setiap malam. Jika ada data siswa yang bermasalah, Anda akan mendapatkan notifikasi email.

---

## Kode Skrip (`Code.gs`)

```javascript
/**
 * @OnlyCurrentDoc
 *
 * Skrip Bantuan untuk Aplikasi CBTschool v2 (Supabase)
 * Menambahkan menu 'CBT Admin Tools' untuk memvalidasi dan generate data siswa.
 */

// Fungsi yang dijalankan saat spreadsheet dibuka
function onOpen() {
  SpreadsheetApp.getUi()
      .createMenu('CBT Admin Tools')
      .addItem('1. Validasi Data Wajib & Duplikat', 'validateData')
      .addSeparator()
      .addItem('2. Isi Username & Password Kosong', 'generateLogins')
      .addToUi();
}

/**
 * Validasi data siswa.
 * - Memeriksa kolom wajib yang kosong.
 * - Memeriksa duplikasi NISN.
 */
function validateData() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('master_siswa');
  if (!sheet) {
    SpreadsheetApp.getUi().alert('Error: Sheet "master_siswa" tidak ditemukan.');
    return;
  }
  
  const ui = SpreadsheetApp.getUi();
  const range = sheet.getDataRange();
  const values = range.getValues();
  const header = values[0].map(h => h.toString().toLowerCase().trim());
  
  // Temukan indeks kolom yang diperlukan
  const colIdx = {
    nisn: header.indexOf('nisn'),
    fullName: header.indexOf('fullname'),
    class: header.indexOf('class'),
    major: header.indexOf('major'),
    gender: header.indexOf('gender')
  };

  const missingCols = Object.keys(colIdx).filter(key => colIdx[key] === -1);
  if (missingCols.length > 0) {
    ui.alert(`Kolom header berikut tidak ditemukan: ${missingCols.join(', ')}`);
    return;
  }
  
  const nisns = new Set();
  let errors = [];
  
  // Hapus highlight sebelumnya
  range.setBackground(null);

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const rowNum = i + 1;
    let rowHasError = false;

    // Cek kolom wajib yang kosong
    for (const key in colIdx) {
      if (row[colIdx[key]] === '') {
        errors.push(`Baris ${rowNum}: Kolom "${key}" kosong.`);
        sheet.getRange(rowNum, colIdx[key] + 1).setBackground('#fce8b2'); // Kuning
        rowHasError = true;
      }
    }

    // Cek duplikasi NISN
    const nisn = row[colIdx.nisn].toString().trim();
    if (nisn !== '') {
      if (nisns.has(nisn)) {
        errors.push(`Baris ${rowNum}: NISN "${nisn}" duplikat.`);
        sheet.getRange(rowNum, colIdx.nisn + 1).setBackground('#f4c7c3'); // Merah muda
        rowHasError = true;
      } else {
        nisns.add(nisn);
      }
    }
  }
  
  if (errors.length > 0) {
    ui.alert(`Ditemukan ${errors.length} masalah:\n- ${errors.slice(0, 10).join('\n- ')}\n\nLihat sel yang ditandai warna untuk detail.`);
  } else {
    ui.alert('Validasi Selesai. Tidak ada masalah ditemukan.');
  }
}

/**
 * Mengisi kolom username dan password yang kosong berdasarkan NISN.
 * Skrip ini TIDAK AKAN menimpa/merusak data username atau password yang sudah diisi manual oleh Admin.
 */
function generateLogins() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('master_siswa');
  if (!sheet) {
    SpreadsheetApp.getUi().alert('Error: Sheet "master_siswa" tidak ditemukan.');
    return;
  }
  
  const ui = SpreadsheetApp.getUi();
  const range = sheet.getDataRange();
  const values = range.getValues();
  const header = values[0].map(h => h.toString().toLowerCase().trim());

  const colIdx = {
    nisn: header.indexOf('nisn'),
    username: header.indexOf('username'),
    password: header.indexOf('password')
  };

  if (colIdx.nisn === -1) {
    ui.alert('Kolom "nisn" tidak ditemukan.');
    return;
  }
  if (colIdx.username === -1 || colIdx.password === -1) {
    ui.alert('Kolom "username" dan/atau "password" tidak ditemukan. Fungsi ini hanya bekerja jika kolom tersebut ada.');
    return;
  }
  
  let generatedCount = 0;
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const nisn = row[colIdx.nisn].toString().trim();
    const username = row[colIdx.username].toString().trim();
    const password = row[colIdx.password].toString().trim();
    
    if (nisn !== '') {
      let changed = false;
      // Generate username jika kosong
      if (username === '') {
        sheet.getRange(i + 1, colIdx.username + 1).setValue(`${nisn}@smkn8sby.sch.id`);
        changed = true;
      }
      // Generate password jika kosong
      if (password === '') {
        sheet.getRange(i + 1, colIdx.password + 1).setValue(nisn);
        changed = true;
      }
      if (changed) {
        generatedCount++;
      }
    }
  }
  
  if (generatedCount > 0) {
    ui.alert(`Selesai! Berhasil mengisi login untuk ${generatedCount} siswa.`);
  } else {
    ui.alert('Tidak ada data login yang perlu diisi. Semua siswa sudah memiliki username dan password.');
  }
}
```