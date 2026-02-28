# Analisis Aplikasi CBT School

## Ringkasan Eksekutif
Aplikasi CBT School adalah sistem ujian online berbasis **React + Vite** di front-end dengan **Supabase** sebagai backend (Auth, PostgreSQL, RPC, dan Realtime). Secara fitur, aplikasi ini sudah sangat kaya: alur ujian siswa lengkap, panel admin/guru, bank soal, monitoring UBK, rekap nilai, backup/restore, dan konfigurasi branding sekolah.

Namun, dari sisi engineering, ada beberapa risiko utama yang perlu diprioritaskan: kompleksitas logika di komponen inti (`App.tsx` dan dashboard), kredensial fallback Supabase yang tersimpan di kode, ketergantungan ke banyak patch SQL manual, dan minimnya automation test.

## 1) Gambaran Teknologi
- Front-end: React 19 + TypeScript + Vite.
- Backend: Supabase (`@supabase/supabase-js`) dan query langsung dari client.
- Utilitas tambahan: generator UUID, ekspor dokumen, import soal, AI question generator via Gemini.
- Script project relatif sederhana: `dev`, `build`, `lint`, `preview`.

## 2) Arsitektur dan Alur Aplikasi
### A. Alur Siswa
1. Login manual / QR.
2. Konfirmasi biodata.
3. Input token ujian.
4. Konfirmasi ujian.
5. Pengerjaan soal + auto-save.
6. Submit/finish + scoring.

Implementasinya memakai state machine sederhana melalui enum `AppState` lalu switch render screen di `App.tsx`.

### B. Alur Admin/Guru
- Login via Supabase Auth, lalu role-based routing ke dashboard admin/guru.
- Dashboard admin mengelola pengguna, soal, jadwal, sesi ujian, monitoring, rekap, backup, konfigurasi.
- Dashboard guru merupakan subset fitur dari admin.

### C. Data layer
- `supabaseClient.ts` menjadi pintu utama: inisialisasi client, pembacaan konfigurasi, validasi token ujian, dan pemuatan soal.
- Komponen-komponen memanggil tabel Supabase secara langsung (contoh: `users`, `tests`, `questions`, `schedules`, `student_exam_sessions`, `student_answers`).
- Banyak fitur penting bergantung pada RPC dan policy/trigger SQL.

## 3) Kekuatan Aplikasi
1. **Fitur domain CBT matang**: anti-cheat, timer, randomisasi soal/jawaban, restore sesi, rekap nilai.
2. **Cakupan operasi sekolah lengkap**: dari manajemen user sampai cetak dokumen.
3. **Dukungan jenis soal modern**: pilihan ganda, complex multiple choice, matching, true/false, essay.
4. **Scoring berbobot dan parsial** (matching/true-false) sudah dipikirkan.
5. **Modularisasi UI relatif baik**: banyak komponen dipisah per fitur.

## 4) Risiko dan Temuan Penting
1. **Security risk: kredensial fallback Supabase hardcoded**
   - URL dan anon key fallback tersimpan di source code. Ini mempermudah salah konfigurasi lintas environment dan meningkatkan risiko kebocoran konfigurasi produksi.
2. **Kompleksitas tinggi di komponen inti**
   - `App.tsx` menangani terlalu banyak concern: bootstrap config, auth listener, role resolution, session restore, device lock, state routing, update config.
   - Dampak: sulit di-test, sulit dipelihara, rawan regresi saat menambah fitur.
3. **Arsitektur query client-heavy**
   - Banyak query langsung di client dashboard untuk data skala besar.
   - Potensi bottleneck performa dan tantangan menjaga konsistensi policy RLS.
4. **Manajemen database cenderung patch-driven**
   - Folder `sql/` berisi sangat banyak skrip perbaikan. Ini menandakan evolusi cepat namun berisiko drift antar environment jika tanpa migration pipeline yang ketat.
5. **Testing automation belum terlihat**
   - Belum ada unit/integration/e2e test suite yang jelas di struktur project.

## 5) Rekomendasi Prioritas (30-60 hari)
### Prioritas 1 (Kritis)
1. **Pindahkan seluruh credential ke environment variable wajib**
   - Hapus fallback value untuk Supabase URL/Anon key.
2. **Refactor `App.tsx` menjadi beberapa hook/service**
   - Misal: `useAppBootstrap`, `useAuthGatekeeper`, `useSingleDeviceLock`, `useAppRouterState`.
3. **Tetapkan migration workflow tunggal**
   - Gunakan skema migrasi berurutan (timestamped) dan hentikan patch ad-hoc untuk production changes.

### Prioritas 2 (Stabilitas)
1. **Tambahkan test coverage bertahap**
   - Mulai dari pure function: scoring, token normalization, mapper data Supabase.
2. **Buat API boundary untuk query besar**
   - Pindahkan query agregat dashboard ke RPC/view agar payload lebih kecil.
3. **Observability dasar**
   - Logging error terstruktur + dashboard error tracking.

### Prioritas 3 (Skalabilitas)
1. **Optimasi data fetching dashboard** (pagination, lazy loading, caching key).
2. **Pisahkan domain module** (auth, exam-session, question-bank, analytics).
3. **Hardening anti-cheat UX** agar tidak false-positive di perangkat low-end.

## 6) Kesimpulan
Aplikasi ini sudah layak operasional untuk skenario CBT sekolah dan terlihat dibangun berdasarkan kebutuhan nyata lapangan. Fokus perbaikan berikutnya sebaiknya bukan lagi pada penambahan fitur, melainkan **hardening arsitektur, security hygiene, dan automation testing** agar stabil untuk skala lebih besar dan pemeliharaan jangka panjang.
