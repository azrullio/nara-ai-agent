// =====================================================================
//  BASELINE: chatbot customer service berbasis template/menu.
//  Mewakili pendekatan konvensional: kata kunci sederhana -> kategori ->
//  balasan baku + arahan ke halaman bantuan. Tidak punya akses data
//  maupun kewenangan mengambil tindakan. Dipakai sebagai pembanding
//  dalam evaluasi penelitian.
// =====================================================================

const MENU = [
  ["TOPUP_TIDAK_MASUK", ["top up", "topup"]],
  ["REFUND_BELUM_MASUK", ["refund"]],
  ["AKUN_DIRETAS", ["diretas", "hack", "dibobol"]],
  ["PENIPUAN_OTP", ["otp", "penipu"]],
  ["SALAH_TRANSFER", ["salah transfer"]],
  ["FOOD_TERLAMBAT", ["terlambat", "telat"]],
  ["FOOD_SALAH_KURANG", ["kurang", "salah menu"]],
  ["FOOD_RUSAK", ["rusak", "tumpah", "basi"]],
  ["DRIVER_TIDAK_SOPAN", ["tidak sopan", "kasar"]],
  ["PELECEHAN", ["pelecehan", "dilecehkan"]],
  ["KECELAKAAN", ["kecelakaan"]],
  ["BARANG_TERTINGGAL", ["tertinggal", "ketinggalan"]],
  ["PENCURIAN_PAKET_HILANG", ["paket hilang", "dicuri"]],
  ["ORDER_FIKTIF", ["fiktif"]],
  ["TARIF_TIDAK_SESUAI", ["tarif"]],
  ["DRIVER_MINTA_TAMBAHAN", ["minta uang", "minta tambahan"]],
  ["PROMO_TIDAK_BISA", ["promo", "voucher"]],
  ["AKUN_TERBLOKIR", ["blokir", "terblokir"]],
  ["MINTA_MANUSIA", ["cs manusia", "agen"]],
  ["SAPAAN", ["halo", "pagi", "siang", "malam"]],
  ["TERIMA_KASIH", ["makasih", "terima kasih"]],
];

const BALASAN = {
  TOPUP_TIDAK_MASUK: "Mohon maaf atas ketidaknyamanannya. Proses top up membutuhkan waktu maksimal 3x24 jam. Jika saldo belum masuk, silakan cek panduan di Pusat Bantuan > GoPay > Top Up.",
  REFUND_BELUM_MASUK: "Pengembalian dana diproses sesuai ketentuan yang berlaku. Silakan cek status di halaman Riwayat Transaksi atau Pusat Bantuan > Refund.",
  AKUN_DIRETAS: "Demi keamanan, jangan berikan OTP kepada siapa pun. Silakan laporkan melalui Pusat Bantuan > Keamanan Akun.",
  PENIPUAN_OTP: "Kami tidak pernah meminta kode OTP. Silakan laporkan melalui Pusat Bantuan > Keamanan Akun.",
  SALAH_TRANSFER: "Transaksi yang sudah berhasil tidak dapat dibatalkan. Silakan hubungi penerima atau buka Pusat Bantuan > GoPay.",
  FOOD_TERLAMBAT: "Mohon maaf atas keterlambatan pesanan Anda. Pesanan sedang diproses oleh merchant. Silakan pantau status pesanan pada aplikasi.",
  FOOD_SALAH_KURANG: "Mohon maaf atas ketidaksesuaian pesanan. Silakan ajukan laporan melalui Pusat Bantuan > GoFood > Pesanan Tidak Lengkap.",
  FOOD_RUSAK: "Mohon maaf atas ketidaknyamanannya. Silakan laporkan melalui Pusat Bantuan > GoFood beserta foto pesanan.",
  DRIVER_TIDAK_SOPAN: "Terima kasih atas masukannya. Silakan berikan rating dan ulasan pada perjalanan Anda, atau laporkan melalui Pusat Bantuan.",
  PELECEHAN: "Kami sangat menyesal atas kejadian ini. Silakan laporkan melalui Pusat Bantuan > Keselamatan.",
  KECELAKAAN: "Silakan laporkan kejadian melalui Pusat Bantuan > Keselamatan.",
  BARANG_TERTINGGAL: "Silakan hubungi driver melalui menu Riwayat Pesanan, atau laporkan melalui Pusat Bantuan > Barang Tertinggal.",
  PENCURIAN_PAKET_HILANG: "Silakan laporkan melalui Pusat Bantuan > GoSend. Laporan akan diproses maksimal 3x24 jam.",
  ORDER_FIKTIF: "Silakan laporkan melalui aplikasi mitra pada menu Bantuan.",
  TARIF_TIDAK_SESUAI: "Tarif dihitung otomatis oleh sistem. Rincian dapat dilihat pada Riwayat Pesanan.",
  DRIVER_MINTA_TAMBAHAN: "Silakan laporkan melalui Pusat Bantuan.",
  PROMO_TIDAK_BISA: "Silakan cek syarat & ketentuan promo pada halaman promo.",
  AKUN_TERBLOKIR: "Silakan ikuti proses verifikasi pada Pusat Bantuan > Akun.",
  MINTA_MANUSIA: "Silakan pilih topik bantuan terlebih dahulu pada Pusat Bantuan.",
  SAPAAN: "Halo! Silakan pilih topik bantuan: 1. Pesanan 2. GoPay 3. Akun 4. Lainnya",
  TERIMA_KASIH: "Terima kasih telah menghubungi kami.",
  DEFAULT: "Maaf, kami belum memahami pertanyaan Anda. Silakan pilih topik pada Pusat Bantuan.",
};

export function classifyBaseline(text) {
  const t = String(text).toLowerCase();
  for (const [kasus, kws] of MENU) if (kws.some((k) => t.includes(k))) return kasus;
  return null;
}

export function replyBaseline(text) {
  const kasus = classifyBaseline(text);
  return { kasus, bubbles: [{ text: BALASAN[kasus] || BALASAN.DEFAULT }], tools: [] };
}
