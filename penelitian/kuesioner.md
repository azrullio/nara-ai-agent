# Kuesioner Evaluasi Pengguna (salin ke Google Form)

> Penting agar skrip `hitung_sus.py` bisa membaca hasilnya: **awali judul pertanyaan persis dengan kode** di kolom pertama
> (contoh judul pertanyaan: `SUS1. Saya rasa saya akan sering menggunakan layanan chat ini.`).

## Bagian A — Profil responden

| Kode | Pertanyaan | Jenis jawaban |
|---|---|---|
| P1 | Usia | Pilihan: < 18, 18–24, 25–34, 35–44, ≥ 45 |
| P2 | Jenis kelamin | Pilihan: Laki-laki, Perempuan |
| P3 | Pekerjaan/status | Pilihan: Pelajar/Mahasiswa, Karyawan, Wiraswasta, Mitra driver ojol, Lainnya |
| P4 | Seberapa sering Anda memakai aplikasi ojek online? | Pilihan: Setiap hari, 2–6 kali/minggu, 1 kali/minggu, Jarang |
| P5 | Pernahkah Anda menghubungi layanan bantuan (CS) di aplikasi ojek online? | Ya / Tidak |
| P6 | Jika pernah, seberapa puas Anda dengan CS tersebut? | Skala 1 (sangat tidak puas) – 5 (sangat puas) |

## Bagian B — Tugas uji coba (tulis sebagai instruksi di Form, bukan pertanyaan)

Responden membuka simulator, lalu mencoba **3 skenario** berikut (pilih pengguna di kiri atas):
1. *Rina Amelia* – keluhkan saldo top up yang belum masuk dengan kalimat sendiri.
2. *Rina Amelia* – keluhkan pesanan GoFood yang lama, lalu pilih salah satu opsi yang ditawarkan.
3. Bebas pilih – laporkan satu masalah lain (driver, paket, akun, dll.) dengan bahasa sehari-hari.

## Bagian C — System Usability Scale (wajib persis 10 butir, skala 1–5)

Skala: 1 = Sangat tidak setuju, 2 = Tidak setuju, 3 = Netral, 4 = Setuju, 5 = Sangat setuju

| Kode | Pernyataan |
|---|---|
| SUS1 | Saya rasa saya akan sering menggunakan layanan chat ini. |
| SUS2 | Saya merasa layanan chat ini terlalu rumit untuk digunakan. |
| SUS3 | Saya merasa layanan chat ini mudah digunakan. |
| SUS4 | Saya rasa saya membutuhkan bantuan orang lain untuk dapat menggunakan layanan chat ini. |
| SUS5 | Saya merasa fitur-fitur pada layanan chat ini berjalan dengan baik dan saling terhubung. |
| SUS6 | Saya merasa ada terlalu banyak hal yang tidak konsisten pada layanan chat ini. |
| SUS7 | Saya rasa kebanyakan orang akan cepat memahami cara menggunakan layanan chat ini. |
| SUS8 | Saya merasa layanan chat ini merepotkan untuk digunakan. |
| SUS9 | Saya merasa percaya diri saat menggunakan layanan chat ini. |
| SUS10 | Saya perlu mempelajari banyak hal sebelum dapat menggunakan layanan chat ini. |

> Butir ganjil bernada positif dan butir genap bernada negatif. Itu memang disengaja dalam SUS, jangan diubah.

## Bagian D — Kepuasan & kesan "seperti manusia" (skala 1–5)

| Kode | Pernyataan |
|---|---|
| CSAT | Secara keseluruhan, seberapa puas Anda dengan penyelesaian masalah oleh layanan chat ini? (1 = sangat tidak puas, 5 = sangat puas) |
| H1 | Balasan layanan chat ini terasa seperti berbicara dengan manusia. |
| H2 | Layanan chat ini memahami perasaan/emosi saya. |
| H3 | Masalah saya diselesaikan langsung di dalam chat tanpa dialihkan ke halaman lain. |
| H4 | Informasi yang diberikan jelas dan spesifik (nominal, nomor pesanan, estimasi waktu). |

## Bagian E — Saran (opsional, isian bebas)

| Kode | Pertanyaan |
|---|---|
| S1 | Apa yang paling Anda sukai dan apa yang perlu diperbaiki? |

---

## Setelah responden terkumpul
1. Di Google Form: tab **Responses → Link to Sheets** → di Google Sheets **File → Download → CSV**.
2. Simpan sebagai `penelitian/hasil/jawaban_kuesioner.csv`.
3. Jalankan `python penelitian/hitung_sus.py` → hasil di `penelitian/hasil/ringkasan_sus.md`.
