# PANDUAN PERBAIKAN DATABASE LENGKAP

Dokumen ini berisi kumpulan skrip SQL untuk memperbaiki masalah umum pada aplikasi CBTschool. Jalankan skrip yang sesuai dengan masalah yang Anda hadapi.

---

### **BAGIAN 1: Perbaikan Masalah "Token ujian tidak valid atau sudah kedaluwarsa"**

**Kapan digunakan:** Jalankan ini jika siswa tidak dapat memvalidasi token ujian meskipun token dan jadwal sudah benar. Ini biasanya terjadi pada instalasi baru.

**Langkah-langkah:**
1. Buka **SQL Editor** di dashboard Supabase Anda.
2. Salin seluruh blok kode SQL di bawah ini, tempelkan ke editor, lalu klik **RUN**.

```sql
-- =================================================================
-- SKRIP PERBAIKAN 1 (REVISI): KEBIJAKAN KEAMANAN UNTUK VALIDASI TOKEN
-- =================================================================

-- Tujuan: Mengizinkan aplikasi untuk membaca data jadwal dan ujian,
--         yang diperlukan untuk validasi token oleh siswa.

-- Hapus kebijakan lama yang mungkin membatasi akses baca (baik nama lama maupun nama baru).
DROP POLICY IF EXISTS "Authenticated can read" ON public.tests;
DROP POLICY IF EXISTS "Public can read tests" ON public.tests;

DROP POLICY IF EXISTS "Authenticated can read" ON public.questions;
DROP POLICY IF EXISTS "Public can read questions" ON public.questions;

DROP POLICY IF EXISTS "Authenticated can read" ON public.schedules;
DROP POLICY IF EXISTS "Public can read schedules" ON public.schedules;

-- Buat kebijakan baru yang mengizinkan akses baca publik (SELECT).
-- Ini AMAN karena otorisasi siswa vs jadwal ditangani di kode aplikasi.
CREATE POLICY "Public can read tests" ON public.tests
  FOR SELECT USING (true);

CREATE POLICY "Public can read questions" ON public.questions
  FOR SELECT USING (true);

CREATE POLICY "Public can read schedules" ON public.schedules
  FOR SELECT USING (true);

-- Pesan: Selesai! Kebijakan untuk validasi token telah diperbarui.
```
---

### **BAGIAN 2: Perbaikan Sesi Ujian, Jawaban, dan Monitoring Admin**

**Kapan digunakan:** Jalankan ini jika:
1. Siswa mendapat error **"Gagal memulai sesi ujian"** saat akan memulai tes.
2. Hasil ujian siswa **TIDAK MUNCUL** di menu "Pemantauan Ujian" atau "Rekapitulasi Nilai" admin.

**Langkah-langkah:**
1. Buka **SQL Editor** di dashboard Supabase Anda.
2. Salin seluruh blok kode SQL di bawah ini, tempelkan ke editor, lalu klik **RUN**.

```sql
-- =================================================================
-- SKRIP PERBAIKAN 2 (REVISI): PERBAIKAN LENGKAP SESI UJIAN & MONITORING
-- =================================================================
    
-- === BAGIAN A: PERBAIKI IZIN TULIS UNTUK SISWA ===
-- Tujuan: Mengizinkan siswa untuk memulai ujian dan menyimpan jawaban.

-- Hapus kebijakan lama yang salah dan juga kebijakan baru untuk memastikan skrip ini aman dijalankan ulang.
DROP POLICY IF EXISTS "Students can manage own sessions" ON public.student_exam_sessions;
DROP POLICY IF EXISTS "Students can create sessions" ON public.student_exam_sessions;
DROP POLICY IF EXISTS "Students can update sessions" ON public.student_exam_sessions;

DROP POLICY IF EXISTS "Students can manage own answers" ON public.student_answers;
DROP POLICY IF EXISTS "Students can create answers" ON public.student_answers;
DROP POLICY IF EXISTS "Students can update answers" ON public.student_answers;

-- Beri izin INSERT dan UPDATE untuk siswa (yang dianggap 'anon' oleh database)
CREATE POLICY "Students can create sessions" ON public.student_exam_sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "Students can update sessions" ON public.student_exam_sessions FOR UPDATE USING (true);
  
CREATE POLICY "Students can create answers" ON public.student_answers FOR INSERT WITH CHECK (true);
CREATE POLICY "Students can update answers" ON public.student_answers FOR UPDATE USING (true);
  
-- === BAGIAN B: PERBAIKI IZIN BACA & KELOLA UNTUK ADMIN ===
-- Tujuan: Memastikan admin bisa melihat dan mengelola semua data ujian siswa.

-- Hapus semua kebijakan admin yang mungkin ada & konflik untuk pembersihan
DROP POLICY IF EXISTS "Admin can manage all sessions" ON public.student_exam_sessions;
DROP POLICY IF EXISTS "Admin can manage all answers" ON public.student_answers;
DROP POLICY IF EXISTS "Authenticated users can view sessions" ON public.student_exam_sessions;
DROP POLICY IF EXISTS "Authenticated users can view answers" ON public.student_answers;

-- Beri izin penuh (SELECT, INSERT, UPDATE, DELETE) kepada admin
-- Admin diidentifikasi sebagai pengguna yang memiliki role 'authenticated'
CREATE POLICY "Admin can manage all sessions" ON public.student_exam_sessions
  FOR ALL
  USING (auth.role() = 'authenticated');
  
CREATE POLICY "Admin can manage all answers" ON public.student_answers
  FOR ALL
  USING (auth.role() = 'authenticated');

-- Pesan: Selesai! Izin untuk sesi ujian dan monitoring telah diperbaiki.
```

---
**Selesai!** Setelah menjalankan skrip yang relevan, segarkan (refresh) halaman aplikasi Anda untuk melihat perubahannya.