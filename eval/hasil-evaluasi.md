# Hasil Evaluasi (offline) — 2026-10-06T12:54:44.430Z

## Klasifikasi kasus (n=70)
| Sistem | Akurasi | Macro precision | Macro recall | Macro F1 |
|---|---|---|---|---|
| AI agent (NLU) | 88.6% | 93.1% | 89.7% | 90.3% |
| Chatbot template | 38.6% | 76.0% | 40.8% | 49.6% |

## Klasifikasi emosi (agent)
Akurasi 91.4%, macro F1 83.7%

## Skenario end-to-end (n=22)
| Metrik | AI agent | Chatbot template |
|---|---|---|
| Tingkat penyelesaian di dalam chat | 95.5% | 0.0% |
| Pemenuhan aksi sesuai SOP | 93.3% | 0.0% |
| Balasan memuat informasi spesifik (ID/nominal) | 95.5% | 0.0% |
| Tingkat pengalihan ke halaman lain | 0.0% | 100.0% |
| Eskalasi tepat kasus P1 | 100.0% | 0.0% |
| Rata-rata waktu proses (ms) | 21.5 | - |

## Detail per skenario (agent)
| ID | Kasus | Tuntas | Aksi | Tools |
|---|---|---|---|---|
| S01 | TOPUP_TIDAK_MASUK | Ya | 1/1 | cek_transaksi, rekonsiliasi_topup, buat_tiket |
| S02 | TOPUP_TIDAK_MASUK | Ya | 1/1 | cek_transaksi, rekonsiliasi_topup, proses_refund, buat_tiket |
| S03 | TOPUP_TIDAK_MASUK | Ya | 1/1 | cek_transaksi, rekonsiliasi_topup, buat_tiket |
| S04 | AKUN_DIRETAS | Ya | 2/2 | amankan_akun, buat_tiket, eskalasi_manusia |
| S05 | PENIPUAN_OTP | Ya | 1/1 | amankan_akun, buat_tiket, eskalasi_manusia |
| S06 | FOOD_TERLAMBAT | Ya | 2/2 | cek_pesanan, hubungi_merchant, batalkan_pesanan, buat_tiket |
| S07 | FOOD_TERLAMBAT | Ya | 2/2 | cek_pesanan, hubungi_merchant, beri_voucher, buat_tiket |
| S08 | FOOD_SALAH_KURANG | Ya | 1/1 | cek_pesanan, proses_refund, beri_voucher, buat_tiket |
| S09 | FOOD_SALAH_KURANG | Ya | 1/1 | cek_pesanan, proses_refund, beri_voucher, buat_tiket |
| S10 | FOOD_RUSAK | Ya | 1/1 | cek_pesanan, proses_refund, beri_voucher, buat_tiket |
| S11 | DRIVER_TIDAK_SOPAN | Ya | 1/1 | cek_pesanan, laporkan_mitra, beri_voucher, buat_tiket |
| S12 | PELECEHAN | Ya | 3/3 | info_darurat, cek_pesanan, laporkan_mitra, buat_tiket, eskalasi_manusia |
| S13 | KECELAKAAN | Ya | 2/2 | info_darurat, buat_tiket, eskalasi_manusia |
| S14 | BARANG_TERTINGGAL | Ya | 1/1 | cek_pesanan, hubungi_driver, buat_tiket |
| S15 | PENCURIAN_PAKET_HILANG | Ya | 2/2 | cek_pesanan, laporkan_mitra, buat_tiket, eskalasi_manusia |
| S16 | ORDER_FIKTIF | Ya | 1/1 | cek_pesanan, ganti_dana_mitra, buat_tiket |
| S17 | TARIF_TIDAK_SESUAI | Ya | 1/1 | cek_pesanan, proses_refund, laporkan_mitra, buat_tiket |
| S18 | DRIVER_MINTA_TAMBAHAN | Tidak | 0/2 |  |
| S19 | PROMO_TIDAK_BISA | Ya | 1/1 | cari_sop, beri_voucher |
| S20 | MINTA_MANUSIA | Ya | 1/1 | eskalasi_manusia |
| S21 | SALAH_TRANSFER | Ya | 1/1 | buat_tiket |
| S22 | AKUN_TERBLOKIR | Ya | 1/1 | cek_profil, buat_tiket |

## Kesalahan klasifikasi agent
- "rekening kepotong tapi saldo gopay nggak masuk, gimana ini" → kasus TOPUP_TIDAK_MASUK (benar: TOPUP_TIDAK_MASUK), emosi panik (benar: netral)
- "refund pesanan yang kemarin dibatalin belum aku terima" → kasus FOOD_TERLAMBAT (benar: REFUND_BELUM_MASUK), emosi netral (benar: netral)
- "pengembalian dana order batal kok lama banget ya" → kasus FOOD_TERLAMBAT (benar: REFUND_BELUM_MASUK), emosi netral (benar: netral)
- "uang aku belum balik padahal pesanannya dibatalkan resto" → kasus FOOD_TERLAMBAT (benar: REFUND_BELUM_MASUK), emosi netral (benar: netral)
- "kak tolong aku salah kirim gopay 100rb ke nomor yang salah" → kasus SALAH_TRANSFER (benar: SALAH_TRANSFER), emosi darurat (benar: netral)
- "abangnya ngerokok sambil bawa motor, asapnya kena aku" → kasus null (benar: DRIVER_TIDAK_SOPAN), emosi netral (benar: netral)
- "bapaknya ugal-ugalan bikin aku takut jatuh" → kasus PELECEHAN (benar: DRIVER_TIDAK_SOPAN), emosi netral (benar: netral)
- "drivernya pegang-pegang paha aku di mobil" → kasus PELECEHAN (benar: PELECEHAN), emosi netral (benar: darurat)
- "aku jatuh dari motor goride, kaki aku luka" → kasus KECELAKAAN (benar: KECELAKAAN), emosi netral (benar: darurat)
- "mobil gocar yang aku naikin tabrakan" → kasus KECELAKAAN (benar: KECELAKAAN), emosi netral (benar: darurat)
- "min saya kena orderan fiktif, alamatnya palsu" → kasus FOOD_TERLAMBAT (benar: ORDER_FIKTIF), emosi netral (benar: netral)
- "order bodong lagi min, capek saya" → kasus ORDER_FIKTIF (benar: ORDER_FIKTIF), emosi netral (benar: sedih)
- "drivernya minta uang tambahan 10rb" → kasus null (benar: DRIVER_MINTA_TAMBAHAN), emosi netral (benar: netral)
- "selamat pagi min" → kasus null (benar: SAPAAN), emosi netral (benar: netral)
