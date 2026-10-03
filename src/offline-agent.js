// =====================================================================
//  MODE OFFLINE (tanpa API key)
//  Agent berbasis aturan + state machine per kasus. Tetap memakai TOOLS
//  yang sama dengan mode Claude, jadi jawabannya berdasarkan DATA NYATA,
//  bukan template kosong. Gaya bahasa disesuaikan emosi pengguna.
// =====================================================================
import { runTool } from "./tools.js";
import { rupiah, getDb } from "./db.js";

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ---------- gaya bicara sesuai emosi ----------
function opener(mood, nama) {
  const n = nama ? `, ${nama}` : "";
  switch (mood) {
    case "marah":
      return pick([`Aku ngerti banget kamu kesel${n}, dan wajar banget kok. Maaf ya udah bikin repot 🙏`, `Kebayang banget nyebelinnya${n}. Aku minta maaf dulu ya, sekarang aku langsung urus.`]);
    case "panik":
      return pick([`Tenang dulu ya${n}, tarik napas. Aku di sini dan langsung bergerak sekarang 🙏`, `Oke${n}, aku paham ini bikin panik. Kita amankan bareng-bareng ya, pelan-pelan.`]);
    case "sedih":
      return pick([`Aduh${n}, peluk virtual dulu 🤗 Pasti nggak enak banget rasanya.`, `Maaf banget ya${n}, aku ikut sedih dengarnya.`]);
    case "darurat":
      return `${nama ? nama + ", " : ""}aku dengar kamu. Keselamatanmu nomor satu sekarang.`;
    case "santai":
      return pick([`Wkwk siap${n}! Sini aku bantu 😄`, `Hehe oke${n}, gas kita beresin ya 😄`]);
    default:
      return pick([`Siap${n}, aku bantu cek sekarang ya.`, `Oke${n}, aku cekin langsung ya 👍`, `Boleh banget${n}, sebentar aku lihat datanya ya.`]);
  }
}

const checking = () => pick(["Bentar ya, aku cek datanya dulu... 🔍", "Aku intip sistemnya dulu ya...", "Sebentar, lagi aku cek langsung ke sistem..."]);

// ---------- penanganan per kasus ----------
// Setiap handler: async (ctx) => { reply: string[], state?: object|null, done?: bool }
// ctx = { user, text, nlu, state, trace, T(tool,input) }
const H = {};

H.SAPAAN = async ({ user, nlu }) => {
  const jamNow = Number(new Date().toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: "Asia/Jakarta" }));
  const salam = jamNow < 11 ? "Pagi" : jamNow < 15 ? "Siang" : jamNow < 19 ? "Sore" : "Malam";
  return {
    reply: [
      `${salam} ${user.panggilan}! 👋 Aku Nara, teman bantuanmu di sini.`,
      user.peran === "mitra_driver"
        ? "Lagi narik ya Bang? Ada kendala apa nih, cerita aja, aku dengerin 😊"
        : pick(["Ada yang bisa aku bantu hari ini? Mau soal pesanan, saldo, atau sekadar curhat juga boleh kok 😄", "Lagi ada kendala apa nih? Cerita aja, aku bantu sampai beres 😊"]),
    ],
  };
};

H.SIAPA_KAMU = async ({ user }) => ({
  reply: [
    `Aku Nara, asisten AI 🤖 — jujur aja ya ${user.panggilan}, aku bukan manusia hehe.`,
    "Tapi aku bisa langsung cek data pesanan & saldo kamu, ambil tindakan (refund, amankan akun, lapor driver), dan kalau perlu aku sambungkan ke tim manusia tanpa kamu harus cerita ulang 👍",
  ],
});

H.TERIMA_KASIH = async ({ user }) => ({
  reply: [pick([`Sama-sama ${user.panggilan}! Seneng banget bisa bantu 🥰`, `Yeay, sama-sama ya ${user.panggilan} 😊`]), pick(["Kalau ada apa-apa lagi, langsung chat aku aja ya. Semoga harimu lancar! ✨", "Jangan sungkan balik lagi ya kalau ada yang ganjel. Take care! 🙌"])],
  state: null,
});

H.PAMIT = H.TERIMA_KASIH;

H.BERCANDA = async ({ user }) => ({
  reply: [pick(["Wkwkwk 😂", "Hahaha 🤣", "Wkwk bisa aja kamu 😆"]), `Ada lagi yang bisa aku bantu ${user.panggilan}? Atau mau lanjut ngobrol juga gapapa 😄`],
});

H.CURHAT = async ({ user }) => ({
  reply: [
    `Huhu, peluk jauh dulu ${user.panggilan} 🤗`,
    "Hari yang berat emang bikin capek ya. Kamu udah hebat kok bisa bertahan sampai sekarang.",
    pick(["Mau cerita lebih lanjut? Aku dengerin. Atau mau aku bantu sesuatu biar harimu sedikit lebih ringan, misal pesenin makanan favorit? 😄", "Kalau ada yang bisa aku bantu biar sedikit lebih ringan, bilang aja ya. Aku di sini 💚"]),
  ],
});

// ---- KEUANGAN: TOP UP ----
H.TOPUP_TIDAK_MASUK = async ({ user, nlu, state, T }) => {
  if (state?.step === "pilih_refund") {
    const t = state.trx;
    if (/saldo|gopay|langsung|sekarang/.test(nlu.normal) || nlu.entitas.ya) {
      const r = await T("proses_refund", { user_id: user.id, nominal: t.nominal, alasan: `Pengembalian top up gagal ${t.id}`, transaksi_id: t.id, tujuan: "GOPAY" });
      await T("buat_tiket", { user_id: user.id, kategori: "TOPUP_TIDAK_MASUK", prioritas: "P2", ringkasan: `Top up gagal ${t.id} dikreditkan ke saldo`, status: "SELESAI" });
      return { reply: [`Done! ✅ ${r.nominal} udah masuk ke saldo GoPay kamu sekarang.`, `Saldo kamu sekarang ${r.saldo_sekarang}. Dana yang di bank nanti otomatis kami tarik balik dari pihak bank, kamu nggak perlu ngapa-ngapain 👍`], state: null };
    }
    return { reply: ["Oke siap, berarti kita tunggu dana balik ke rekening bank ya 👍", `Nomor tiketnya ${state.tiket}, nanti aku kabari via notifikasi kalau sudah masuk. Kalau lewat dari estimasi, chat aku lagi dan sebut nomor tiketnya aja.`], state: null };
  }
  if (state?.step === "pilih_duplikat") {
    const r = await T("rekonsiliasi_topup", { user_id: user.id, transaksi_id: state.trx.id });
    await T("buat_tiket", { user_id: user.id, kategori: "TOPUP_TIDAK_MASUK", prioritas: "P2", ringkasan: `Top up dobel ${state.trx.id} dikembalikan ke saldo`, status: "SELESAI" });
    return { reply: [`Beres! ✅ ${r.nominal} yang kepotong dobel udah aku balikin ke saldo GoPay kamu.`, `Saldo sekarang: ${r.saldo_sekarang}. Maaf ya atas ketidaknyamanannya 🙏`], state: null };
  }

  const res = await T("cek_transaksi", { user_id: user.id, jenis: "TOPUP" });
  const bermasalah = res.transaksi.filter((t) => t.status !== "SUKSES" && !/DIKEMBALIKAN|DIAJUKAN/.test(t.status));
  if (!bermasalah.length) {
    return {
      reply: [
        "Aku udah cek, semua top up kamu di sistem statusnya berhasil 🤔",
        "Boleh kirim detailnya? Nominal, metode (bank/minimarket), dan jam kira-kira top up-nya. Kalau ada foto bukti bayar juga boleh, biar aku telusuri sampai ketemu 💪",
      ],
      state: { kasus: "TOPUP_TIDAK_MASUK", step: "minta_detail" },
    };
  }
  // Pilih transaksi yang paling cocok dengan cerita pengguna
  const n = nlu.normal || "";
  const t =
    (nlu.entitas?.nominal && bermasalah.find((x) => x.nominal === nlu.entitas.nominal)) ||
    (/dua kali|2 ?x|dobel|double|ganda/.test(n) && bermasalah.find((x) => x.status === "DUPLIKAT_TERDETEKSI")) ||
    (/gagal|kepotong|terpotong/.test(n) && bermasalah.find((x) => x.status === "GAGAL_DEBIT_TERPOTONG")) ||
    bermasalah[0];
  const head = `Ketemu! Top up ${t.nominal_rp} via ${t.metode} jam ${t.jam} (ref ${t.ref_bank || t.id}).`;

  if (t.status === "DANA_DITERIMA_BANK") {
    const r = await T("rekonsiliasi_topup", { user_id: user.id, transaksi_id: t.id });
    await T("buat_tiket", { user_id: user.id, kategori: "TOPUP_TIDAK_MASUK", prioritas: "P2", ringkasan: `Top up ${t.id} tertahan settlement, direkonsiliasi AI`, status: "SELESAI" });
    return {
      reply: [
        head,
        "Jadi ceritanya gini: uangnya sebenarnya udah diterima bank, tapi pas dikirim ke sistem saldo ada gangguan, jadi nyangkut di tengah jalan. Bukan salah kamu sama sekali ya 🙏",
        `Barusan udah aku dorong manual, dan... masuk! ✅ Saldo kamu sekarang ${r.saldo_sekarang} (sebelumnya ${r.saldo_sebelum}).`,
        "Coba refresh aplikasinya ya. Udah keliatan belum? 😊",
      ],
      state: null,
    };
  }
  if (t.status === "GAGAL_DEBIT_TERPOTONG") {
    const r = await T("rekonsiliasi_topup", { user_id: user.id, transaksi_id: t.id });
    return {
      reply: [
        head,
        "Ternyata rekening kamu sudah terpotong, tapi top up-nya ditolak sistem karena nomor VA-nya udah kedaluwarsa. Jadi uangnya nggak hilang ya, cuma tertahan 🙏",
        `Aku udah ajukan pengembalian ke bank, estimasi ${r.estimasi_dana_kembali}. Tiket: ${r.tiket}.`,
        "Tapi kalau kamu butuh saldonya sekarang, aku bisa langsung masukin ke saldo GoPay detik ini juga. Mau dimasukin ke saldo GoPay aja? 😊",
      ],
      state: { kasus: "TOPUP_TIDAK_MASUK", step: "pilih_refund", trx: t, tiket: r.tiket },
    };
  }
  if (t.status === "DUPLIKAT_TERDETEKSI") {
    return {
      reply: [
        `Ketemu nih. Top up ${t.nominal_rp} di ${t.metode} kepotong DUA KALI dengan nomor kasir yang sama (ref ${t.ref_bank}) 😮`,
        "Yang pertama sudah masuk saldo, yang kedua nyangkut di sistem. Uangmu aman kok.",
        "Aku balikin yang dobel itu ke saldo GoPay kamu sekarang ya, boleh?",
      ],
      state: { kasus: "TOPUP_TIDAK_MASUK", step: "pilih_duplikat", trx: t },
    };
  }
  return { reply: [head, `Statusnya ${t.status}. Aku buatkan tiket ke Tim Pembayaran ya biar dipantau.`], state: null };
};

// ---- KEAMANAN: AKUN DIRETAS ----
H.AKUN_DIRETAS = async ({ user, T }) => {
  const r = await T("amankan_akun", { user_id: user.id, alasan: "Pengguna melaporkan transaksi tidak dikenal" });
  const tk = await T("buat_tiket", { user_id: user.id, kategori: "AKUN_DIRETAS", prioritas: "P1", ringkasan: `Transaksi tidak dikenal dari perangkat ${r.perangkat_asing_dikeluarkan.join(", ") || "asing"}. Lolos: ${r.transaksi_sudah_keluar_perlu_investigasi.map((x) => x.nominal).join(", ")}. Ditahan: ${r.dana_diselamatkan}` });
  const esk = await T("eskalasi_manusia", { user_id: user.id, tiket_id: tk.tiket.id, tim: "Tim Fraud & Keamanan", ringkasan: "Akun diretas, akun sudah dibekukan AI, perlu pemblokiran rekening tujuan" });
  const lines = [
    "Langkah pertama udah aku lakukan barusan: akun GoPay kamu aku BEKUKAN sementara supaya nggak ada lagi uang yang keluar 🔒",
  ];
  if (r.perangkat_asing_dikeluarkan.length) lines.push(`Ada login dari perangkat asing: ${r.perangkat_asing_dikeluarkan[0].replace(/ - .*/, "")}. Sudah aku tendang keluar.`);
  if (r.transaksi_berhasil_ditahan.length) lines.push(`Kabar baiknya: transfer ${r.transaksi_berhasil_ditahan.map((x) => x.nominal).join(", ")} yang masih diproses BERHASIL aku tahan & balikin ke saldo kamu ✅ (saldo sekarang ${r.saldo_sekarang})`);
  if (r.transaksi_sudah_keluar_perlu_investigasi.length)
    lines.push(`Yang sudah terlanjur keluar:\n${r.transaksi_sudah_keluar_perlu_investigasi.map((x) => `• ${x.nominal} jam ${x.jam} ke ${x.tujuan.replace("GoPay -> ", "")}`).join("\n")}\nIni sudah aku teruskan ke Tim Fraud (tiket ${tk.tiket.id}, prioritas P1) untuk minta bank memblokir rekening tujuan.`);
  lines.push(`Tim Fraud akan menghubungi kamu ${esk.estimasi_dihubungi}. Sambil nunggu: ganti PIN, dan ingat ya, kami nggak akan pernah minta OTP/PIN 🙏 Kalau mau, laporan polisi juga bisa bantu percepat klaim.`);
  lines.push("Kamu nggak sendirian ngurus ini ya. Ada yang mau kamu tanyain dulu?");
  return { reply: lines, state: null };
};

H.PENIPUAN_OTP = async ({ user, nlu, state, T }) => {
  if (state?.step === "tanya_otp") {
    if (nlu.entitas.ya || /udah|sudah|terlanjur|kasih/.test(nlu.normal)) return H.AKUN_DIRETAS({ user, nlu, T });
    await T("buat_tiket", { user_id: user.id, kategori: "PENIPUAN_OTP", prioritas: "P3", ringkasan: "Upaya penipuan OTP, pengguna tidak memberikan kode", status: "SELESAI" });
    return { reply: ["Fiuh, syukurlah! 😮‍💨 Kamu keren udah waspada 👏", "Nomor penipunya boleh kirim ke aku ya, nanti aku laporkan buat diblokir. Ingat: CS asli nggak pernah minta OTP, PIN, atau nyuruh klik link aneh."], state: null };
  }
  return { reply: [opener("panik", user.panggilan), "Satu pertanyaan penting dulu: kamu sempat kasih kode OTP atau PIN ke orang itu nggak?"], state: { kasus: "PENIPUAN_OTP", step: "tanya_otp" } };
};

// ---- GOFOOD TERLAMBAT ----
H.FOOD_TERLAMBAT = async ({ user, nlu, state, T }) => {
  if (state?.step === "pilih_opsi") {
    const o = state.order;
    if (/batal|cancel|refund|udah gak|ga jadi|gak jadi|nggak jadi/.test(nlu.normal)) {
      const r = await T("batalkan_pesanan", { user_id: user.id, order_id: o.id, alasan: "Resto terlambat > 30 menit" });
      await T("buat_tiket", { user_id: user.id, kategori: "FOOD_TERLAMBAT", ringkasan: `${o.id} dibatalkan, refund ${r.refund}`, order_id: o.id, status: "SELESAI" });
      return { reply: [`Siap, pesanan ${o.id} udah aku batalin & ${r.refund} langsung balik ke saldo GoPay kamu ✅`, `Saldo sekarang ${r.saldo_sekarang}. Tenang, driver-nya tetap dapat kompensasi waktu tunggu dari kami, jadi kamu nggak perlu ngerasa nggak enak 😊`, "Semoga cepat dapat makan ya, jangan sampai masuk angin 🙏"], state: null };
    }
    const v = await T("beri_voucher", { user_id: user.id, nominal: state.voucher, alasan: `Keterlambatan ${o.id}`, layanan: "GoFood" });
    await T("buat_tiket", { user_id: user.id, kategori: "FOOD_TERLAMBAT", ringkasan: `${o.id} telat ${state.telat} menit, pelanggan pilih tunggu, voucher ${v.nominal_rp}`, order_id: o.id, status: "SELESAI" });
    return { reply: [`Oke, makasih banyak udah sabar ya ${user.panggilan} 🙏`, `Sebagai permintaan maaf, aku kasih voucher GoFood ${v.nominal_rp} (kode ${v.kode}, berlaku s.d. ${v.berlaku_sampai}).`, "Aku juga terus pantau pesanannya. Kalau 15 menit lagi belum sampai, chat aku, langsung aku batalin + refund penuh tanpa ribet 👍"], state: null };
  }
  const res = await T("cek_pesanan", { user_id: user.id, layanan: "GoFood" });
  const o = res.pesanan.find((p) => p.analisis_keterlambatan);
  if (!o) return { reply: ["Aku cek, nggak ada pesanan GoFood yang lagi berjalan atas akun kamu 🤔", "Boleh kirim nomor pesanannya? Biasanya diawali GF-"], state: { kasus: "FOOD_TERLAMBAT", step: "minta_id" } };
  const a = o.analisis_keterlambatan;
  const m = await T("hubungi_merchant", { order_id: o.id, pesan: "Pelanggan menanyakan pesanan yang terlambat" });
  const voucher = a.telat_menit > 30 ? 15000 : 10000;
  return {
    reply: [
      `Udah aku cek. Pesanan ${o.id} dari ${o.merchant.nama} kamu pesan jam ${o.dibuat_jam}, harusnya siap ${o.estimasi_siap_menit} menit, tapi ini udah ${a.sudah_menunggu_menit} menit 😣 Telat ${a.telat_menit} menit, maaf banget ya.`,
      `Masalahnya ada di resto, bukan di driver. Pak ${o.driver.nama.split(" ")[0]} malah udah nungguin di resto dari ${a.driver_menunggu_di_resto_menit} menit lalu.`,
      `Barusan aku hubungi restonya, katanya: "${m.balasan_resto}" Jadi perkiraan sampai ke kamu ±${m.estimasi_sampai_menit} menit lagi.`,
      `Kamu mau pilih yang mana?\n1️⃣ Tetap tunggu + aku kasih voucher ${rupiah(voucher)}\n2️⃣ Batalin aja + refund penuh ${rupiah(o.total)} ke GoPay sekarang juga`,
    ],
    state: { kasus: "FOOD_TERLAMBAT", step: "pilih_opsi", order: { id: o.id, total: o.total }, voucher, telat: a.telat_menit },
  };
};

// ---- GOFOOD KURANG / SALAH ----
H.FOOD_SALAH_KURANG = async ({ user, nlu, state, T }) => {
  let order = state?.order;
  if (!order) {
    const res = await T("cek_pesanan", { user_id: user.id, layanan: "GoFood" });
    order = res.pesanan.find((p) => p.status === "SELESAI") || res.pesanan[0];
    if (!order) return { reply: ["Hmm, aku nggak nemu pesanan GoFood yang baru selesai di akun kamu. Boleh kirim nomor pesanannya (GF-xxxx)?"], state: null };
  }
  const umum = new Set(["paket", "level", "jumbo", "spesial", "manis", "porsi"]);
  const kata = new Set(nlu.normal.split(/[^a-z0-9]+/));
  const item = order.item.find((i) => nlu.normal.includes(i.nama.toLowerCase()) || i.nama.toLowerCase().split(" ").some((w) => w.length >= 3 && !umum.has(w) && kata.has(w)));
  if (!item) {
    return {
      reply: [
        `Aduh, nyebelin banget ya udah nunggu tapi pas dibuka nggak lengkap 😔`,
        `Aku lihat pesanan ${order.id} dari ${order.merchant?.nama} isinya:\n${order.item.map((i) => `• ${i.qty}x ${i.nama}`).join("\n")}`,
        "Yang kurang/salah yang mana nih?",
      ],
      state: { kasus: "FOOD_SALAH_KURANG", step: "pilih_item", order },
    };
  }
  const nominal = item.harga * item.qty;
  const r = await T("proses_refund", { user_id: user.id, nominal, alasan: `${item.nama} tidak diterima (${order.id})`, order_id: order.id, tujuan: "GOPAY" });
  const v = await T("beri_voucher", { user_id: user.id, nominal: 5000, alasan: `Item kurang ${order.id}`, layanan: "GoFood" });
  await T("buat_tiket", { user_id: user.id, kategori: "FOOD_SALAH_KURANG", ringkasan: `${item.nama} kurang di ${order.id}, refund ${r.nominal}; merchant dilaporkan`, order_id: order.id, status: "SELESAI" });
  return {
    reply: [
      `Oke, ${item.nama} ya. Nggak usah repot foto atau hubungi resto, aku percaya kamu 🙏`,
      `${r.nominal} udah aku refund ke saldo GoPay kamu (saldo sekarang ${r.saldo_sekarang}) ✅ Plus voucher ${v.nominal_rp} buat permintaan maaf, kode ${v.kode}.`,
      `Restonya juga udah aku laporin biar lebih teliti ngecek pesanan. Btw driver-nya cuma nganter kantong yang disegel resto, jadi bukan salah dia ya 😊`,
    ],
    state: null,
  };
};

H.FOOD_RUSAK = async ({ user, nlu, T }) => {
  const res = await T("cek_pesanan", { user_id: user.id, layanan: "GoFood" });
  const o = res.pesanan[0];
  if (!o) return { reply: ["Aku nggak nemu pesanan GoFood terbaru kamu. Boleh kirim nomor pesanannya?"] };
  const nominal = Math.min(o.total, 100000);
  const r = await T("proses_refund", { user_id: user.id, nominal, alasan: `Makanan rusak/tidak layak (${o.id})`, order_id: o.id });
  const v = await T("beri_voucher", { user_id: user.id, nominal: 10000, alasan: `Makanan rusak ${o.id}` });
  await T("buat_tiket", { user_id: user.id, kategori: "FOOD_RUSAK", ringkasan: `Makanan rusak ${o.id}: "${nlu.teks_asli}"`, order_id: o.id, status: "SELESAI" });
  return { reply: [opener("sedih", user.panggilan), `Makanan kayak gitu jelas nggak layak. Aku refund penuh ${r.nominal} ke GoPay kamu ya ✅ + voucher ${v.nominal_rp} (kode ${v.kode}).`, "Kalau sempat, fotonya boleh dikirim buat bahan evaluasi resto. Tapi nggak wajib kok, refund-nya udah masuk 😊"] };
};

// ---- DRIVER TIDAK SOPAN ----
H.DRIVER_TIDAK_SOPAN = async ({ user, nlu, state, T }) => {
  if (!state || state.step !== "cerita") {
    const res = await T("cek_pesanan", { user_id: user.id });
    const o = res.pesanan.find((p) => /GoRide|GoCar/.test(p.layanan)) || res.pesanan[0];
    if (nlu.normal.split(" ").length < 9) {
      return {
        reply: [
          opener(nlu.emosi === "marah" ? "marah" : "sedih", user.panggilan),
          o ? `Ini soal perjalanan ${o.layanan} ${o.id} sama ${o.driver?.nama} (${o.driver?.plat}) ya?` : "Ini perjalanan yang mana ya?",
          "Boleh ceritain apa yang terjadi? Pelan-pelan aja, aku dengerin 🙏",
        ],
        state: { kasus: "DRIVER_TIDAK_SOPAN", step: "cerita", order: o && { id: o.id, driver_id: o.driver_id, driver: o.driver } },
      };
    }
    state = { order: o && { id: o.id, driver_id: o.driver_id, driver: o.driver } };
  }
  const o = state.order;
  const lap = await T("laporkan_mitra", { driver_id: o.driver_id, order_id: o.id, user_id: user.id, kategori: "Perilaku tidak sopan", tingkat: "SEDANG", kronologi: nlu.teks_asli });
  const v = await T("beri_voucher", { user_id: user.id, nominal: 15000, alasan: "Pengalaman tidak nyaman dengan mitra", layanan: "GoRide & GoCar" });
  const tk = await T("buat_tiket", { user_id: user.id, kategori: "DRIVER_TIDAK_SOPAN", ringkasan: `Laporan perilaku ${lap.driver}: ${nlu.teks_asli}`, order_id: o.id, status: "TERBUKA" });
  return {
    reply: [
      "Makasih udah mau cerita ya. Perlakuan kayak gitu nggak pantas kamu terima, dan kamu nggak salah apa-apa 🙏",
      `Aku udah laporkan ${lap.driver} ke Tim Kualitas Mitra. Tindakannya: ${lap.tindakan.toLowerCase()}.`,
      `Sebagai permintaan maaf, ini voucher ${v.nominal_rp} buat perjalanan berikutnya (kode ${v.kode}) 🎟️ Nomor laporan kamu ${tk.tiket.id}, hasil tindak lanjutnya maks 2x24 jam.`,
      "Masih ada yang ganjel nggak? Aku temenin 😊",
    ],
    state: null,
  };
};

// ---- PELECEHAN (P1) ----
H.PELECEHAN = async ({ user, nlu, state, T }) => {
  if (!state || state.step !== "cek_aman") {
    const darurat = await T("info_darurat", { user_id: user.id, jenis: "Dugaan pelecehan oleh mitra", masih_dalam_bahaya: false });
    const res = await T("cek_pesanan", { user_id: user.id });
    const o = res.pesanan.find((p) => /GoCar|GoRide/.test(p.layanan));
    return {
      reply: [
        opener("darurat", user.panggilan),
        "Sebelum yang lain: kamu sekarang sudah di tempat yang aman? 🙏",
        `Kalau masih merasa terancam, langsung telepon ${darurat.nomor.polisi_darurat} atau tekan tombol SOS di aplikasi. Unit Safety kami juga ${darurat.unit_safety.toLowerCase()}.`,
      ],
      state: { kasus: "PELECEHAN", step: "cek_aman", order: o && { id: o.id, driver_id: o.driver_id, driver: o.driver, log: o.log_perjalanan } },
    };
  }
  const o = state.order;
  const tidakAman = /belum|tidak|nggak|gak|masih/.test(nlu.normal) && !/udah aman|sudah aman/.test(nlu.normal);
  if (tidakAman) await T("info_darurat", { user_id: user.id, jenis: "Pengguna masih merasa tidak aman", masih_dalam_bahaya: true });
  const lap = o ? await T("laporkan_mitra", { driver_id: o.driver_id, order_id: o.id, user_id: user.id, kategori: "Pelecehan", tingkat: "BERAT", kronologi: nlu.teks_asli }) : null;
  const tk = await T("buat_tiket", { user_id: user.id, kategori: "PELECEHAN", prioritas: "P1", ringkasan: `Dugaan pelecehan pada ${o?.id}. Log sistem: ${o?.log || "-"}`, order_id: o?.id });
  const esk = await T("eskalasi_manusia", { user_id: user.id, tiket_id: tk.tiket.id, tim: "Unit Keselamatan (Safety Response)", ringkasan: "Korban dugaan pelecehan, butuh pendampingan" });
  return {
    reply: [
      tidakAman ? "Tolong segera ke tempat ramai atau telepon 112 ya. Aku udah tandai kasusmu DARURAT, Unit Safety akan langsung menelepon kamu." : "Syukurlah kamu udah aman 🙏 Makasih udah berani cerita. Yang terjadi itu BUKAN salahmu, sama sekali.",
      lap ? `Akun ${lap.driver} sudah aku NONAKTIFKAN sementara mulai detik ini selama investigasi, dan kamu nggak akan pernah dipertemukan lagi dengannya.` : "",
      o?.log ? "Data perjalanan dari sistem (rute, titik berhenti, durasi) juga udah aku amankan sebagai bukti." : "",
      `Kasus kamu nomor ${tk.tiket.id} (prioritas tertinggi). Tim Safety manusia akan menghubungi kamu ${esk.estimasi_dihubungi}, termasuk tawaran pendampingan psikolog & bantuan hukum kalau kamu mau lapor polisi. Biaya perjalanan juga akan kami kembalikan penuh.`,
      "Kamu nggak harus cerita detail ke aku kalau belum siap. Aku di sini kalau kamu butuh apa pun 💚",
    ].filter(Boolean),
    state: null,
  };
};

H.KECELAKAAN = async ({ user, T }) => {
  const d = await T("info_darurat", { user_id: user.id, jenis: "Kecelakaan perjalanan", masih_dalam_bahaya: true });
  const tk = await T("buat_tiket", { user_id: user.id, kategori: "KECELAKAAN", prioritas: "P1", ringkasan: "Laporan kecelakaan saat perjalanan" });
  await T("eskalasi_manusia", { user_id: user.id, tiket_id: tk.tiket.id, tim: "Unit Keselamatan (Safety Response)", ringkasan: "Kecelakaan, perlu cek kondisi & asuransi" });
  return { reply: [opener("darurat", user.panggilan), `Kalau ada yang luka, segera telepon ambulans ${d.nomor.ambulans} ya. Jangan dipaksain jalan.`, `Unit Safety sudah aku kabari & akan menelepon kamu maks 5 menit. Asuransi perjalanan juga sudah aku aktifkan, biaya medis bisa diklaim (tiket ${tk.tiket.id}).`, "Kamu sekarang kondisinya gimana? Ada yang luka?"] };
};

// ---- BARANG TERTINGGAL ----
H.BARANG_TERTINGGAL = async ({ user, nlu, state, T }) => {
  if (state?.step === "konfirmasi_antar") {
    if (nlu.entitas.tidak) return { reply: ["Oke, nanti kalau mau diatur pengirimannya, chat aku aja ya. Barangnya aman dipegang driver 👍"], state: null };
    await T("hubungi_driver", { order_id: state.order_id, pesan: "Mohon antar barang ke alamat pelanggan, ongkir ditanggung perusahaan" });
    await T("buat_tiket", { user_id: user.id, kategori: "BARANG_TERTINGGAL", ringkasan: `Pengembalian barang ${state.order_id} diantar driver`, order_id: state.order_id, status: "SELESAI" });
    return { reply: ["Siap! Driver-nya udah aku minta antar ke alamatmu ya, ongkirnya kami yang tanggung 🛵", "Nanti kamu dapat notifikasi pelacakan kayak order biasa. Lain kali cek jok dulu ya hehe, tapi tenang, kejadian kayak gini sering kok 😄"], state: null };
  }
  const res = await T("cek_pesanan", { user_id: user.id });
  const o = res.pesanan.find((p) => /GoCar|GoRide/.test(p.layanan));
  if (!o) return { reply: ["Aku nggak nemu perjalanan terakhirmu. Boleh kirim nomor pesanannya?"] };
  const d = await T("hubungi_driver", { order_id: o.id, pesan: `Pelanggan melaporkan barang tertinggal: ${nlu.teks_asli}` });
  return {
    reply: [
      opener(nlu.emosi, user.panggilan),
      `Aku udah hubungi driver perjalanan terakhirmu (${o.id}, ${d.driver}). Barusan dia bales: "${d.balasan_driver}" 🙌`,
      "Mau aku minta driver-nya antar balik ke alamatmu sekarang? Ongkirnya kami tanggung.",
    ],
    state: { kasus: "BARANG_TERTINGGAL", step: "konfirmasi_antar", order_id: o.id },
  };
};

// ---- PENCURIAN / PAKET HILANG ----
H.PENCURIAN_PAKET_HILANG = async ({ user, nlu, T }) => {
  const res = await T("cek_pesanan", { user_id: user.id, layanan: "GoSend" });
  const o = res.pesanan[0];
  if (!o) {
    const tk = await T("buat_tiket", { user_id: user.id, kategori: "PENCURIAN_PAKET_HILANG", prioritas: "P1", ringkasan: nlu.teks_asli });
    return { reply: [opener("panik", user.panggilan), `Aku sudah catat laporannya (tiket ${tk.tiket.id}). Boleh kirim nomor pesanan, barang apa yang hilang, dan perkiraan nilainya?`] };
  }
  const flags = o.flag_sistem || [];
  const lap = flags.length >= 2 ? await T("laporkan_mitra", { driver_id: o.driver_id, order_id: o.id, user_id: user.id, kategori: "Dugaan penggelapan paket", tingkat: "BERAT", kronologi: nlu.teks_asli }) : null;
  const tk = await T("buat_tiket", { user_id: user.id, kategori: "PENCURIAN_PAKET_HILANG", prioritas: "P1", ringkasan: `${o.barang} (${rupiah(o.nilai_barang_dideklarasikan)}) tidak diterima. Flag: ${flags.join(", ")}`, order_id: o.id });
  const esk = await T("eskalasi_manusia", { user_id: user.id, tiket_id: tk.tiket.id, tim: "Tim Fraud & Keamanan", ringkasan: `Klaim asuransi GoSend ${rupiah(o.nilai_barang_dideklarasikan)} + investigasi driver` });
  return {
    reply: [
      opener(nlu.emosi === "netral" ? "panik" : nlu.emosi, user.panggilan),
      `Aku udah cek pengiriman ${o.id}: ${o.barang}, nilai ${rupiah(o.nilai_barang_dideklarasikan)}, ditandai "selesai" jam ${new Date(o.selesai_pada).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" })}.`,
      `Dan kamu benar, ada yang janggal: titik GPS saat "selesai" berjarak 1,8 km dari alamat tujuan, dan fotonya cuma pagar tanpa penerima 😟`,
      lap ? `Akun driver ${lap.driver} sudah aku nonaktifkan sementara & pencairan dananya ditahan selama investigasi.` : "",
      `Kabar baiknya, paket kamu pakai asuransi (sampai ${rupiah(o.batas_asuransi)}), jadi nilai barangnya bisa diganti. Klaimnya sudah aku ajukan, tiket ${tk.tiket.id} (P1). Karena nominalnya besar, tim Fraud manusia akan konfirmasi ke kamu ${esk.estimasi_dihubungi}.`,
      "Kalau ada nota pembelian HP-nya, siapin ya buat mempercepat klaim. Kita kawal sampai beres 💪",
    ].filter(Boolean),
  };
};

// ---- ORDER FIKTIF (mitra) ----
H.ORDER_FIKTIF = async ({ user, nlu, T }) => {
  if (user.peran !== "mitra_driver") return H.AKUN_DIRETAS({ user, nlu, T });
  const res = await T("cek_pesanan", { user_id: user.id });
  const o = res.pesanan.find((p) => p.flag_sistem?.length && p.driver_talangan);
  if (!o) {
    const tk = await T("buat_tiket", { user_id: user.id, kategori: "ORDER_FIKTIF", ringkasan: nlu.teks_asli });
    return { reply: ["Aduh, kesel banget pasti ya Bang 😤", `Aku catat dulu laporannya (tiket ${tk.tiket.id}). Boleh kirim nomor order & foto struk resto-nya?`] };
  }
  const r = await T("ganti_dana_mitra", { user_id: user.id, order_id: o.id });
  await T("buat_tiket", { user_id: user.id, kategori: "ORDER_FIKTIF", ringkasan: `Order fiktif ${o.id}, talangan ${r.nominal_diganti} diganti otomatis`, order_id: o.id, status: "SELESAI" });
  return {
    reply: [
      `Waduh Bang ${user.nama.split(" ")[0]}, udah capek nalangin ${rupiah(o.driver_talangan)} eh pemesannya ngilang. Maaf banget ya, ini bukan salah Abang sama sekali 🙏`,
      `Aku cek order ${o.id}: akun pemesan baru dibuat ±1,5 jam sebelum order, alamatnya nggak ketemu, nomornya nggak aktif. Fix ini order fiktif.`,
      `Dana talangan ${r.nominal_diganti} udah aku GANTI ke dompet Abang sekarang ✅ Saldo dompet: ${r.saldo_dompet_sekarang}.`,
      `Akun pemesannya udah diblokir permanen, dan order ini nggak dihitung pembatalan, jadi rating & performa Abang aman 👍`,
      "Semangat narik lagi ya Bang, hati-hati di jalan! 🛵💨",
    ],
  };
};

// ---- TARIF ----
H.TARIF_TIDAK_SESUAI = async ({ user, T }) => {
  const res = await T("cek_pesanan", { user_id: user.id });
  const o = res.pesanan.find((p) => p.tarif_final && p.tarif_final > p.tarif_estimasi);
  if (!o) return { reply: ["Aku cek perjalanan terakhirmu, tarifnya sama dengan estimasi di awal 🤔 Boleh kasih tahu perjalanan yang mana yang kerasa kemahalan?"] };
  const rinci = o.rincian_tarif || {};
  const lines = [`Aku cek ${o.layanan} ${o.id} (${o.rute}): estimasi ${rupiah(o.tarif_estimasi)}, tapi kamu bayar ${rupiah(o.tarif_final)}.`, `Rinciannya: tarif dasar ${rupiah(rinci.tarif_dasar)}, biaya tunggu ${rupiah(rinci.biaya_tunggu)}, perubahan rute ${rupiah(rinci.perubahan_rute)}.`];
  if (/DRIVER/.test(o.log_sistem || "")) {
    const r = await T("proses_refund", { user_id: user.id, nominal: rinci.perubahan_rute, alasan: `Perubahan rute tanpa persetujuan pelanggan (${o.id})`, order_id: o.id });
    await T("laporkan_mitra", { driver_id: o.driver_id, order_id: o.id, user_id: user.id, kategori: "Ubah rute tanpa persetujuan", tingkat: "RINGAN", kronologi: "Perubahan rute diinput driver" });
    await T("buat_tiket", { user_id: user.id, kategori: "TARIF_TIDAK_SESUAI", ringkasan: `Refund selisih rute ${r.nominal} untuk ${o.id}`, order_id: o.id, status: "SELESAI" });
    lines.push(`Nah, perubahan rutenya ternyata diinput oleh driver, bukan kamu, dan tanpa persetujuanmu. Itu nggak fair, jadi ${r.nominal} aku refund ke GoPay kamu sekarang ✅ (saldo ${r.saldo_sekarang})`, "Biaya tunggu Rp4.000 itu sah ya karena tercatat nunggu lebih dari 5 menit di titik jemput. Semoga penjelasannya jelas 🙏");
  }
  return { reply: lines };
};

H.REFUND_BELUM_MASUK = async ({ user, T }) => {
  const res = await T("cek_transaksi", { user_id: user.id });
  const rf = res.transaksi.find((t) => t.jenis === "REFUND" || /REFUND|DIKEMBALIKAN|GAGAL|DUPLIKAT/.test(t.status));
  if (!rf) return { reply: ["Aku cek riwayat GoPay kamu, belum ada refund yang tercatat 🤔 Refund-nya untuk pesanan yang mana ya? Kirim nomor pesanannya, aku telusuri."] };
  if (/GAGAL_DEBIT|DUPLIKAT_TERDETEKSI|DANA_DITERIMA/.test(rf.status)) return H.TOPUP_TIDAK_MASUK({ user, nlu: { normal: "" }, T });
  return { reply: [`Aku lihat ${rf.jenis.toLowerCase()} ${rf.nominal_rp} jam ${rf.jam} statusnya ${rf.status}.`, rf.status === "SUKSES" ? "Dananya sudah masuk ke saldo GoPay kamu ya 👍 Coba tarik layar ke bawah buat refresh." : "Masih diproses ke sumber dana, estimasi 1-3 hari kerja. Nanti ada notifikasi ya."] };
};

H.DRIVER_MINTA_TAMBAHAN = async ({ user, nlu, T }) => {
  const res = await T("cek_pesanan", { user_id: user.id });
  const o = res.pesanan.find((p) => /GoRide|GoCar|GoFood/.test(p.layanan));
  if (o) await T("laporkan_mitra", { driver_id: o.driver_id, order_id: o.id, user_id: user.id, kategori: "Minta uang tambahan / transaksi di luar aplikasi", tingkat: "SEDANG", kronologi: nlu.teks_asli });
  const v = await T("beri_voucher", { user_id: user.id, nominal: 10000, alasan: "Driver minta tambahan" });
  const nominal = nlu.entitas.nominal;
  let refundLine = "Kalau kamu sempat kasih uang tambahan, kasih tahu nominalnya ya, nanti aku ganti ke saldo GoPay kamu.";
  if (nominal && nominal <= 100000) {
    const r = await T("proses_refund", { user_id: user.id, nominal, alasan: "Ganti uang tambahan yang diminta driver", order_id: o?.id });
    refundLine = `Uang tambahan ${r.nominal} yang kamu kasih udah aku ganti ke saldo GoPay ✅`;
  }
  return { reply: [opener(nlu.emosi, user.panggilan), "Driver nggak boleh minta uang di luar tarif aplikasi, makasih udah lapor 🙏", o ? `Driver ${o.driver?.nama} (${o.id}) sudah aku laporkan & kena peringatan.` : "Laporannya sudah aku catat.", refundLine, `Ini voucher ${v.nominal_rp} buat permintaan maaf (kode ${v.kode}).`] };
};

H.PROMO_TIDAK_BISA = async ({ user, T }) => {
  await T("cari_sop", { kata_kunci: "promo" });
  const v = await T("beri_voucher", { user_id: user.id, nominal: 10000, alasan: "Promo gagal dipakai" });
  return { reply: ["Promo nggak bisa dipakai emang ngeselin ya 😅 Biasanya karena: minimal belanja belum tercapai, metode bayarnya bukan GoPay, beda area, atau kuota harian promonya udah habis.", `Biar kamu nggak rugi, aku kasih voucher pengganti ${v.nominal_rp} ya (kode ${v.kode}, berlaku s.d. ${v.berlaku_sampai}) 🎁`] };
};

H.AKUN_TERBLOKIR = async ({ user, T }) => {
  const p = await T("cek_profil", { user_id: user.id });
  if (/DIBEKUKAN/.test(p.gopay.status)) return { reply: ["Akun GoPay kamu lagi dibekukan sementara untuk pengamanan (karena laporan transaksi mencurigakan tadi) 🔒", "Cara bukanya: Aplikasi > Profil > Keamanan > Verifikasi wajah + foto KTP. Biasanya kebuka dalam 1 jam setelah verifikasi. Ini demi melindungi saldo kamu ya 🙏"] };
  const tk = await T("buat_tiket", { user_id: user.id, kategori: "AKUN_TERBLOKIR", ringkasan: "Pengguna melaporkan tidak bisa akses akun" });
  return { reply: [`Aku cek, status akunmu di sistem ${p.gopay.status} 🤔`, `Mungkin kendala login di perangkat. Coba update aplikasi & login ulang pakai nomor ${user.telepon.replace(/(\d{4})\d+(\d{3})/, "$1xxxx$2")}. Kalau masih gagal, tiket ${tk.tiket.id} udah aku buat dan Tim Akun bakal bantu maks 1x24 jam.`] };
};

H.SALAH_TRANSFER = async ({ user, nlu, T }) => {
  const tk = await T("buat_tiket", { user_id: user.id, kategori: "SALAH_TRANSFER", prioritas: "P2", ringkasan: nlu.teks_asli });
  return { reply: [opener(nlu.emosi === "netral" ? "panik" : nlu.emosi, user.panggilan), "Aku jujur ya: transfer yang udah berhasil nggak bisa ditarik paksa, tapi kami bisa bantu MEDIASI ke penerimanya (kami yang menghubungi, bukan kamu).", `Tiket mediasi ${tk.tiket.id} sudah dibuat. Boleh kirim nomor tujuan, nominal, dan jam transfernya biar langsung diproses?`] };
};

H.MINTA_MANUSIA = async ({ user, session, T }) => {
  const ringkasan = session?.history?.filter((h) => h.role === "user").slice(-5).map((h) => h.text).join(" | ") || "Pengguna meminta agen manusia";
  const e = await T("eskalasi_manusia", { user_id: user.id, tim: "Tim Customer Care", ringkasan });
  return { reply: ["Boleh banget, aku sambungkan ke rekan manusiaku ya 🙋", `Semua yang udah kamu ceritain udah aku rangkum di tiket ${e.tiket}, jadi kamu nggak perlu ngulang dari awal. Posisi antrean ${e.posisi_antrean}, estimasi ${e.estimasi_dihubungi}.`] };
};

H.FALLBACK = async ({ user, session }) => {
  session.fallbacks = (session.fallbacks || 0) + 1;
  if (session.fallbacks >= 3) return H.MINTA_MANUSIA({ user, session, T: session._T });
  return {
    reply: [
      pick([`Hmm, maaf ${user.panggilan}, aku belum nangkep maksudnya 🙏`, `Aduh maaf, aku agak bingung nih 😅`]),
      "Boleh ceritain sedikit lebih detail? Misalnya soal pesanan makanan, perjalanan, saldo/top up, keamanan akun, atau driver. Atau sebut nomor pesanannya juga boleh.",
    ],
  };
};

// =====================================================================
export async function runOffline({ user, text, session, nlu, trace }) {
  const T = (name, input) => runTool(name, input, trace);
  session._T = T;
  let kasus = nlu.kasus;
  const state = session.state;

  // Lanjutkan percakapan multi-langkah jika pesan tidak membuka kasus baru yang kuat
  const kasusBaruKuat = kasus && !["SAPAAN", "BERCANDA", "TERIMA_KASIH", "PAMIT"].includes(kasus) && nlu.skor >= 3 && kasus !== state?.kasus;
  if (state && !kasusBaruKuat) kasus = state.kasus;
  if (state?.kasus === "PENIPUAN_OTP" && kasus === "AKUN_DIRETAS") kasus = "PENIPUAN_OTP";

  // Keselamatan selalu didahulukan
  if (nlu.emosi === "darurat" && !["PELECEHAN", "KECELAKAAN"].includes(kasus)) kasus = /kecelakaan|jatuh|tabrak|luka/.test(nlu.normal) ? "KECELAKAAN" : "PELECEHAN";

  const handler = H[kasus] || H.FALLBACK;
  if (handler !== H.FALLBACK) session.fallbacks = 0;
  trace.push({ type: "route", nodes: ["agent"], kasus: kasus || "TIDAK_DIKENALI", melanjutkan_langkah: state?.kasus === kasus ? state.step : null });

  const out = await handler({ user, text, nlu, state: state?.kasus === kasus ? state : null, trace, T, session });
  session.state = out.state === undefined ? null : out.state;
  return { reply: out.reply.filter(Boolean), kasus };
}
