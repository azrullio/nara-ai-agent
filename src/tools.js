// =====================================================================
//  TOOLS = "tangan" si AI Agent.
//  Inilah yang membedakan agent dengan chatbot template: agent bisa
//  MENGECEK data asli dan MENGAMBIL TINDAKAN (rekonsiliasi saldo, refund,
//  amankan akun, laporkan driver, dsb.), bukan cuma membalas kalimat baku.
//
//  Setiap tool punya:
//   - definisi (nama, deskripsi, input_schema) -> dikirim ke LLM / n8n
//   - nodes   -> node mana di diagram flow yang menyala saat tool jalan
//   - run()   -> implementasi nyata terhadap database
// =====================================================================
import { getDb, save, audit, rupiah, minutesAgo, jam, nextId } from "./db.js";

const POL = () => getDb().policies;

function findUser(id) {
  const u = getDb().users.find((x) => x.id === id);
  if (!u) throw new Error(`Pengguna ${id} tidak ditemukan`);
  return u;
}
const findOrder = (id) => getDb().orders.find((o) => o.id === id);
const findDriver = (id) => getDb().drivers.find((d) => d.id === id);
const findMerchant = (id) => getDb().merchants.find((m) => m.id === id);

function orderView(o) {
  const driver = o.driver_id ? findDriver(o.driver_id) : null;
  const merchant = o.merchant_id ? findMerchant(o.merchant_id) : null;
  const view = {
    ...o,
    dibuat_jam: jam(o.dibuat_pada),
    dibuat_menit_lalu: minutesAgo(o.dibuat_pada),
    driver: driver && { id: driver.id, nama: driver.nama, kendaraan: driver.kendaraan, plat: driver.plat, rating: driver.rating, status: driver.status },
    merchant: merchant && { id: merchant.id, nama: merchant.nama, status_operasional: merchant.status_operasional, antrean_sekarang: merchant.antrean_sekarang },
  };
  if (o.status === "MENUNGGU_RESTO" || o.status === "DIANTAR") {
    const elapsed = minutesAgo(o.dibuat_pada);
    view.analisis_keterlambatan = {
      sudah_menunggu_menit: elapsed,
      estimasi_awal_menit: o.estimasi_siap_menit,
      telat_menit: Math.max(0, elapsed - (o.estimasi_siap_menit || 0)),
      driver_menunggu_di_resto_menit: o.driver_tiba_di_resto_pada ? minutesAgo(o.driver_tiba_di_resto_pada) : null,
      penyebab_utama: o.status === "MENUNGGU_RESTO" ? "Resto belum selesai menyiapkan pesanan (bukan driver)" : "Dalam perjalanan",
    };
  }
  return view;
}

function makeTicket({ user_id, kategori, prioritas, ringkasan, order_id, status = "TERBUKA", tim }) {
  const db = getDb();
  const kb = db.knowledge_base.find((k) => k.id === kategori);
  const t = {
    id: nextId("TKT", db.tickets),
    user_id, kategori, prioritas: prioritas || kb?.prioritas || "P3",
    tim: tim || kb?.tim || "Tim Customer Care",
    sla: kb?.sla || "2x24 jam",
    ringkasan, order_id: order_id || null, status,
    dibuat_pada: new Date().toISOString(),
  };
  db.tickets.push(t);
  save();
  return t;
}

export const TOOLS = [
  // ------------------------------------------------------------ BACA DATA
  {
    name: "cek_profil",
    nodes: ["db_users"],
    description: "Ambil profil pengguna yang sedang chat: nama panggilan, peran (pelanggan/mitra), saldo & status GoPay, perangkat terdaftar.",
    input_schema: { type: "object", properties: { user_id: { type: "string" } }, required: ["user_id"] },
    run: ({ user_id }) => {
      const u = findUser(user_id);
      return { id: u.id, nama: u.nama, panggilan: u.panggilan, peran: u.peran, kota: u.kota, gopay: u.gopay, perangkat_terdaftar: u.perangkat_terdaftar, member_sejak: u.member_sejak };
    },
  },
  {
    name: "cek_transaksi",
    nodes: ["db_trx"],
    description: "Lihat riwayat transaksi GoPay pengguna (top up, pembayaran, transfer) lengkap dengan status sistem & keterangan internal. Gunakan SEBELUM menjawab keluhan saldo/top up/transaksi.",
    input_schema: {
      type: "object",
      properties: {
        user_id: { type: "string" },
        jenis: { type: "string", enum: ["TOPUP", "PEMBAYARAN", "TRANSFER_KELUAR", "SEMUA"], description: "Filter jenis transaksi" },
        transaksi_id: { type: "string", description: "Opsional, ID transaksi spesifik" },
      },
      required: ["user_id"],
    },
    run: ({ user_id, jenis = "SEMUA", transaksi_id }) => {
      let list = getDb().transactions.filter((t) => t.user_id === user_id);
      if (transaksi_id) list = list.filter((t) => t.id === transaksi_id);
      if (jenis && jenis !== "SEMUA") list = list.filter((t) => t.jenis === jenis);
      list = [...list].sort((a, b) => new Date(b.waktu) - new Date(a.waktu));
      return { jumlah: list.length, transaksi: list.map((t) => ({ ...t, jam: jam(t.waktu), menit_lalu: minutesAgo(t.waktu), nominal_rp: rupiah(t.nominal) })) };
    },
  },
  {
    name: "cek_pesanan",
    nodes: ["db_orders", "db_drivers", "db_merchants"],
    description: "Lihat pesanan pengguna (GoRide/GoCar/GoFood/GoSend) beserta driver, merchant, rincian tarif, log & flag sistem, dan analisis keterlambatan otomatis. Tanpa order_id = semua pesanan terbaru.",
    input_schema: {
      type: "object",
      properties: {
        user_id: { type: "string" },
        order_id: { type: "string" },
        layanan: { type: "string", enum: ["GoRide", "GoCar", "GoFood", "GoSend", "SEMUA"] },
      },
      required: ["user_id"],
    },
    run: ({ user_id, order_id, layanan = "SEMUA" }) => {
      const u = findUser(user_id);
      let list = getDb().orders.filter((o) => o.user_id === user_id || (u.driver_id && o.driver_id === u.driver_id));
      if (order_id) list = list.filter((o) => o.id.toUpperCase() === order_id.toUpperCase());
      if (layanan && layanan !== "SEMUA") list = list.filter((o) => o.layanan === layanan);
      list = [...list].sort((a, b) => new Date(b.dibuat_pada) - new Date(a.dibuat_pada));
      return { jumlah: list.length, pesanan: list.map(orderView) };
    },
  },
  {
    name: "cari_sop",
    nodes: ["db_kb"],
    description: "Cari SOP/panduan penanganan kasus di knowledge base (prioritas, SLA, langkah, kompensasi, larangan). Pakai untuk memastikan penanganan sesuai kebijakan.",
    input_schema: { type: "object", properties: { kata_kunci: { type: "string" } }, required: ["kata_kunci"] },
    run: ({ kata_kunci }) => {
      const q = kata_kunci.toLowerCase();
      const kb = getDb().knowledge_base;
      const hits = kb.filter((k) => k.id.toLowerCase().includes(q.replace(/ /g, "_")) || k.nama.toLowerCase().includes(q) || k.kata_kunci.some((w) => q.includes(w) || w.includes(q)));
      return { hasil: (hits.length ? hits : kb.slice(0, 0)).slice(0, 3), kebijakan_batas_ai: getDb().policies.batas_otomatis_ai };
    },
  },

  // ------------------------------------------------------------ AKSI KEUANGAN
  {
    name: "rekonsiliasi_topup",
    nodes: ["t_rekon", "db_trx", "db_users"],
    description: "Paksa sinkronisasi top up yang dananya SUDAH diterima bank tapi belum masuk saldo (status DANA_DITERIMA_BANK). Saldo langsung dikreditkan. Untuk status GAGAL_DEBIT_TERPOTONG akan mengajukan pengembalian dana ke bank. Untuk DUPLIKAT_TERDETEKSI akan mengembalikan dana duplikat ke saldo GoPay.",
    input_schema: { type: "object", properties: { user_id: { type: "string" }, transaksi_id: { type: "string" } }, required: ["user_id", "transaksi_id"] },
    run: ({ user_id, transaksi_id }) => {
      const u = findUser(user_id);
      const t = getDb().transactions.find((x) => x.id === transaksi_id && x.user_id === user_id);
      if (!t) return { ok: false, pesan: "Transaksi tidak ditemukan untuk pengguna ini" };
      const before = u.gopay.saldo;
      if (t.status === "DANA_DITERIMA_BANK" || t.status === "DUPLIKAT_TERDETEKSI") {
        u.gopay.saldo += t.nominal;
        const old = t.status;
        t.status = old === "DUPLIKAT_TERDETEKSI" ? "DUPLIKAT_DIKEMBALIKAN_KE_SALDO" : "SUKSES";
        t.keterangan_sistem += ` | Direkonsiliasi oleh AI Agent ${new Date().toISOString()}`;
        save();
        audit("rekonsiliasi_topup", { user_id, transaksi_id, nominal: t.nominal });
        return { ok: true, aksi: old === "DUPLIKAT_TERDETEKSI" ? "Dana duplikat dikembalikan ke saldo GoPay" : "Saldo dikreditkan", nominal: rupiah(t.nominal), saldo_sebelum: rupiah(before), saldo_sekarang: rupiah(u.gopay.saldo) };
      }
      if (t.status === "GAGAL_DEBIT_TERPOTONG") {
        t.status = "REFUND_KE_BANK_DIAJUKAN";
        const tk = makeTicket({ user_id, kategori: "TOPUP_TIDAK_MASUK", prioritas: "P2", ringkasan: `Top up ${rupiah(t.nominal)} (${t.metode}) gagal tapi rekening terpotong. Pengembalian dana ke bank diajukan.` });
        save();
        audit("refund_bank_diajukan", { user_id, transaksi_id });
        const eta = new Date(Date.now() + 24 * 3600e3).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Jakarta" });
        return { ok: true, aksi: "Pengembalian dana ke rekening bank diajukan", nominal: rupiah(t.nominal), estimasi_dana_kembali: `paling lambat ${eta} (1x24 jam kerja)`, tiket: tk.id, opsi_lain: "Bisa juga dikreditkan langsung ke saldo GoPay sekarang via proses_refund tujuan GOPAY jika pengguna mau." };
      }
      return { ok: false, pesan: `Status transaksi ${t.status}, tidak perlu rekonsiliasi` };
    },
  },
  {
    name: "proses_refund",
    nodes: ["t_refund", "db_users", "db_trx"],
    description: `Kembalikan dana ke saldo GoPay (instan) atau ke sumber dana. Otomatis jika nominal <= batas AI (Rp100.000); di atas itu status MENUNGGU_PERSETUJUAN dan wajib eskalasi.`,
    input_schema: {
      type: "object",
      properties: {
        user_id: { type: "string" },
        nominal: { type: "number" },
        alasan: { type: "string" },
        order_id: { type: "string" },
        transaksi_id: { type: "string" },
        tujuan: { type: "string", enum: ["GOPAY", "SUMBER_DANA"] },
      },
      required: ["user_id", "nominal", "alasan"],
    },
    run: ({ user_id, nominal, alasan, order_id, transaksi_id, tujuan = "GOPAY" }) => {
      const u = findUser(user_id);
      const db = getDb();
      const batas = POL().batas_otomatis_ai.refund_maks;
      if (transaksi_id) {
        const t = db.transactions.find((x) => x.id === transaksi_id);
        if (t && /REFUND_KE_BANK_DIAJUKAN|GAGAL/.test(t.status) && tujuan === "GOPAY") t.status = "DIKEMBALIKAN_KE_SALDO";
      }
      if (nominal > batas) {
        const tk = makeTicket({ user_id, kategori: "REFUND_BELUM_MASUK", prioritas: "P2", ringkasan: `Refund ${rupiah(nominal)} (${alasan}) menunggu persetujuan supervisor`, order_id, status: "MENUNGGU_PERSETUJUAN" });
        return { ok: false, status: "MENUNGGU_PERSETUJUAN", pesan: `Nominal melebihi batas otomatis AI (${rupiah(batas)}), perlu persetujuan agen manusia`, tiket: tk.id };
      }
      const before = u.gopay.saldo;
      if (tujuan === "GOPAY") u.gopay.saldo += nominal;
      db.transactions.push({ id: nextId("RF", db.transactions), user_id, jenis: "REFUND", nominal, metode: tujuan === "GOPAY" ? "Saldo GoPay" : "Sumber dana awal", ref_order: order_id || null, waktu: new Date().toISOString(), status: tujuan === "GOPAY" ? "SUKSES" : "DIPROSES", keterangan_sistem: alasan });
      save();
      audit("refund", { user_id, nominal, alasan, order_id });
      return { ok: true, nominal: rupiah(nominal), tujuan, saldo_sebelum: rupiah(before), saldo_sekarang: rupiah(u.gopay.saldo), estimasi: tujuan === "GOPAY" ? "Instan (sudah masuk)" : "1-3 hari kerja" };
    },
  },
  {
    name: "beri_voucher",
    nodes: ["t_komp", "db_users"],
    description: "Berikan voucher kompensasi/permintaan maaf (maks Rp25.000) sesuai kebijakan kompensasi.",
    input_schema: { type: "object", properties: { user_id: { type: "string" }, nominal: { type: "number" }, alasan: { type: "string" }, layanan: { type: "string", description: "GoFood/GoRide/GoCar/Semua" } }, required: ["user_id", "nominal", "alasan"] },
    run: ({ user_id, nominal, alasan, layanan = "GoFood & GoRide" }) => {
      findUser(user_id);
      const maks = POL().batas_otomatis_ai.voucher_maks;
      const n = Math.min(nominal, maks);
      const v = { kode: "MAAF" + Math.random().toString(36).slice(2, 7).toUpperCase(), user_id, nominal: n, layanan, alasan, berlaku_sampai: new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10) };
      getDb().vouchers.push(v);
      save();
      audit("voucher", v);
      return { ok: true, ...v, nominal_rp: rupiah(n), catatan: nominal > maks ? `Dibatasi ke maks ${rupiah(maks)}` : undefined };
    },
  },
  {
    name: "batalkan_pesanan",
    nodes: ["t_refund", "db_orders", "db_users"],
    description: "Batalkan pesanan yang belum selesai dan refund penuh ke saldo GoPay secara instan. Gunakan hanya setelah pengguna setuju membatalkan.",
    input_schema: { type: "object", properties: { user_id: { type: "string" }, order_id: { type: "string" }, alasan: { type: "string" } }, required: ["user_id", "order_id", "alasan"] },
    run: ({ user_id, order_id, alasan }) => {
      const o = findOrder(order_id);
      const u = findUser(user_id);
      if (!o || o.user_id !== user_id) return { ok: false, pesan: "Pesanan tidak ditemukan" };
      if (/SELESAI|DIBATALKAN/.test(o.status)) return { ok: false, pesan: `Pesanan sudah ${o.status}` };
      o.status = "DIBATALKAN_PELANGGAN_KARENA_" + (o.merchant_id ? "RESTO_TERLAMBAT" : "LAINNYA");
      const before = u.gopay.saldo;
      u.gopay.saldo += o.total;
      getDb().transactions.push({ id: nextId("RF", getDb().transactions), user_id, jenis: "REFUND", nominal: o.total, metode: "Saldo GoPay", ref_order: o.id, waktu: new Date().toISOString(), status: "SUKSES", keterangan_sistem: alasan });
      const m = o.merchant_id && findMerchant(o.merchant_id);
      if (m) m.keluhan_terlambat_30hari = (m.keluhan_terlambat_30hari || 0) + 1;
      save();
      audit("batalkan_pesanan", { user_id, order_id, alasan });
      return { ok: true, order_id, refund: rupiah(o.total), saldo_sebelum: rupiah(before), saldo_sekarang: rupiah(u.gopay.saldo), catatan_driver: "Driver tetap mendapat kompensasi waktu tunggu dari perusahaan (bukan dari pelanggan)." };
    },
  },
  {
    name: "ganti_dana_mitra",
    nodes: ["t_refund", "db_orders", "db_users"],
    description: "Ganti dana talangan mitra driver akibat order fiktif. Otomatis jika indikasi fraud >= 2 dan nominal <= Rp300.000. Akun pemesan fiktif ikut diblokir dan performa mitra dipulihkan.",
    input_schema: { type: "object", properties: { user_id: { type: "string", description: "ID mitra" }, order_id: { type: "string" } }, required: ["user_id", "order_id"] },
    run: ({ user_id, order_id }) => {
      const u = findUser(user_id);
      const o = findOrder(order_id);
      if (!o || o.driver_id !== u.driver_id) return { ok: false, pesan: "Order tidak terkait dengan mitra ini" };
      if (o.talangan_diganti) return { ok: false, pesan: "Dana talangan untuk order ini sudah pernah diganti" };
      const flags = o.flag_sistem || [];
      const maks = POL().batas_otomatis_ai.penggantian_order_fiktif_maks;
      if (flags.length < 2 || o.driver_talangan > maks) {
        const tk = makeTicket({ user_id, kategori: "ORDER_FIKTIF", prioritas: "P2", ringkasan: `Order ${order_id} dugaan fiktif, talangan ${rupiah(o.driver_talangan)} perlu verifikasi manual`, order_id });
        return { ok: false, status: "INVESTIGASI", tiket: tk.id };
      }
      const before = u.gopay.saldo;
      u.gopay.saldo += o.driver_talangan;
      o.talangan_diganti = true;
      o.status = "FIKTIF_TERKONFIRMASI";
      save();
      audit("ganti_dana_mitra", { user_id, order_id, nominal: o.driver_talangan });
      return { ok: true, indikasi_fraud: flags, nominal_diganti: rupiah(o.driver_talangan), saldo_dompet_sebelum: rupiah(before), saldo_dompet_sekarang: rupiah(u.gopay.saldo), akun_pemesan: "DIBLOKIR PERMANEN", dampak_ke_mitra: "Order tidak dihitung pembatalan, rating & performa aman" };
    },
  },

  // ------------------------------------------------------------ AKSI KEAMANAN
  {
    name: "amankan_akun",
    nodes: ["t_amankan", "db_users", "db_trx"],
    description: "DARURAT keamanan: bekukan transaksi keluar GoPay, keluarkan semua perangkat asing, dan tahan transaksi yang masih DIPROSES. Gunakan segera jika ada indikasi akun diretas / OTP bocor.",
    input_schema: { type: "object", properties: { user_id: { type: "string" }, alasan: { type: "string" } }, required: ["user_id"] },
    run: ({ user_id, alasan = "Dugaan akun diretas" }) => {
      const u = findUser(user_id);
      const db = getDb();
      u.gopay.status = "DIBEKUKAN_SEMENTARA (PENGAMANAN)";
      const asing = u.perangkat_terdaftar.filter((p) => /BARU/i.test(p));
      u.perangkat_terdaftar = u.perangkat_terdaftar.filter((p) => !/BARU/i.test(p));
      const ditahan = [];
      let dikembalikan = 0;
      for (const t of db.transactions) {
        if (t.user_id === user_id && t.status === "DIPROSES" && t.jenis === "TRANSFER_KELUAR") {
          t.status = "DIBATALKAN_PENGAMANAN";
          u.gopay.saldo += t.nominal;
          dikembalikan += t.nominal;
          ditahan.push({ id: t.id, nominal: rupiah(t.nominal), tujuan: t.metode });
        }
      }
      const lolos = db.transactions.filter((t) => t.user_id === user_id && t.jenis === "TRANSFER_KELUAR" && t.status === "SUKSES" && /BARU|Medan/.test(t.perangkat || "")).map((t) => ({ id: t.id, nominal: rupiah(t.nominal), tujuan: t.metode, jam: jam(t.waktu) }));
      save();
      audit("amankan_akun", { user_id, alasan });
      return { ok: true, status_gopay: u.gopay.status, perangkat_asing_dikeluarkan: asing, transaksi_berhasil_ditahan: ditahan, dana_diselamatkan: rupiah(dikembalikan), saldo_sekarang: rupiah(u.gopay.saldo), transaksi_sudah_keluar_perlu_investigasi: lolos, langkah_pengguna: ["Buka aplikasi > Keamanan > ganti PIN", "Verifikasi wajah untuk membuka pembekuan", "Jangan berikan OTP ke siapa pun"] };
    },
  },
  {
    name: "laporkan_mitra",
    nodes: ["t_lapor", "db_drivers"],
    description: "Laporkan pelanggaran mitra driver. RINGAN=catatan, SEDANG=peringatan + pengguna tidak dipertemukan lagi, BERAT=akun mitra dinonaktifkan sementara selama investigasi (pelecehan, kekerasan, pencurian).",
    input_schema: {
      type: "object",
      properties: {
        driver_id: { type: "string" }, order_id: { type: "string" }, user_id: { type: "string" },
        kategori: { type: "string" }, tingkat: { type: "string", enum: ["RINGAN", "SEDANG", "BERAT"] }, kronologi: { type: "string" },
      },
      required: ["driver_id", "kategori", "tingkat", "kronologi"],
    },
    run: ({ driver_id, order_id, user_id, kategori, tingkat, kronologi }) => {
      const d = findDriver(driver_id);
      if (!d) return { ok: false, pesan: "Driver tidak ditemukan" };
      d.jumlah_keluhan_90hari += 1;
      d.laporan = d.laporan || [];
      d.laporan.push({ waktu: new Date().toISOString(), order_id, user_id, kategori, tingkat, kronologi });
      let tindakan = "Dicatat di riwayat mitra";
      if (tingkat === "SEDANG") tindakan = "Peringatan tertulis + pembinaan; pelapor TIDAK akan dipertemukan lagi dengan mitra ini";
      if (tingkat === "BERAT") {
        d.status = "DINONAKTIFKAN_SEMENTARA (INVESTIGASI)";
        tindakan = "Akun mitra dinonaktifkan sementara & pencairan dana ditahan selama investigasi; pelapor tidak akan dipertemukan lagi";
      }
      save();
      audit("laporkan_mitra", { driver_id, order_id, tingkat, kategori });
      return { ok: true, driver: `${d.nama} (${d.plat})`, tingkat, tindakan, status_mitra: d.status, total_keluhan_90hari: d.jumlah_keluhan_90hari };
    },
  },
  {
    name: "info_darurat",
    nodes: ["t_darurat"],
    description: "Aktifkan protokol keselamatan: kirim notifikasi ke Unit Safety 24 jam dan berikan nomor darurat. Gunakan untuk pelecehan, ancaman, kecelakaan.",
    input_schema: { type: "object", properties: { user_id: { type: "string" }, jenis: { type: "string" }, masih_dalam_bahaya: { type: "boolean" } }, required: ["user_id", "jenis"] },
    run: ({ user_id, jenis, masih_dalam_bahaya = false }) => {
      audit("protokol_darurat", { user_id, jenis, masih_dalam_bahaya });
      return { ok: true, unit_safety: "Sudah dinotifikasi, akan menelepon pengguna maks 5 menit", nomor: POL().nomor_darurat, prioritas: "P1", saran: masih_dalam_bahaya ? "Segera ke keramaian / hubungi 112, bagikan lokasi ke keluarga" : "Tetap di tempat aman, Unit Safety akan menghubungi" };
    },
  },

  // ------------------------------------------------------------ AKSI OPERASIONAL
  {
    name: "hubungi_merchant",
    nodes: ["t_merchant", "db_merchants", "db_orders"],
    description: "Kirim ping ke merchant/resto untuk pesanan tertentu dan minta estimasi siap terbaru. Mengembalikan jawaban resto.",
    input_schema: { type: "object", properties: { order_id: { type: "string" }, pesan: { type: "string" } }, required: ["order_id"] },
    run: ({ order_id }) => {
      const o = findOrder(order_id);
      if (!o || !o.merchant_id) return { ok: false, pesan: "Pesanan tidak punya merchant" };
      const m = findMerchant(o.merchant_id);
      const ramai = /RAMAI/.test(m.status_operasional);
      const est = ramai ? 8 : 3;
      o.estimasi_baru_menit = est;
      save();
      return { ok: true, merchant: m.nama, balasan_resto: ramai ? `Mohon maaf banget, hari ini kami kekurangan juru masak dan antrean ${m.antrean_sekarang} pesanan. Pesanan ${order_id} sedang dimasak, siap kira-kira ${est} menit lagi.` : `Pesanan sedang dikemas, siap ${est} menit lagi.`, estimasi_siap_menit: est, estimasi_sampai_menit: est + 12 };
    },
  },
  {
    name: "hubungi_driver",
    nodes: ["t_driver", "db_drivers", "db_orders"],
    description: "Kirim pesan ke driver lewat saluran internal (nomor asli disamarkan) dan dapatkan balasannya. Untuk cek barang tertinggal, posisi, dll.",
    input_schema: { type: "object", properties: { order_id: { type: "string" }, pesan: { type: "string" } }, required: ["order_id", "pesan"] },
    run: ({ order_id, pesan }) => {
      const o = findOrder(order_id);
      if (!o) return { ok: false, pesan: "Pesanan tidak ditemukan" };
      const d = findDriver(o.driver_id);
      let balasan = "Siap, pesan sudah saya terima.";
      if (o.barang_tertinggal_laporan_driver && /tinggal|barang|dompet|hp|payung/i.test(pesan)) {
        balasan = `Iya betul, saya temukan ${o.barang_tertinggal_laporan_driver.replace(/^Ditemukan /, "")}. Aman sama saya, siap diantar balik.`;
        o.pengembalian_barang = "DRIVER_SIAP_ANTAR";
        save();
      } else if (o.status === "MENUNGGU_RESTO") {
        balasan = `Saya sudah di resto dari ${minutesAgo(o.driver_tiba_di_resto_pada)} menit lalu kak, masih nunggu pesanannya dimasak. Begitu jadi langsung saya antar ngebut-aman 🙏`;
      }
      return { ok: true, driver: `${d.nama} (${d.plat})`, balasan_driver: balasan };
    },
  },
  {
    name: "buat_tiket",
    nodes: ["t_tiket"],
    description: "Buat tiket kasus agar tercatat & bisa dilacak. Selalu buat tiket untuk kasus yang ditangani (status SELESAI jika sudah tuntas di chat).",
    input_schema: {
      type: "object",
      properties: {
        user_id: { type: "string" }, kategori: { type: "string", description: "ID kasus dari knowledge base, mis. FOOD_TERLAMBAT" },
        prioritas: { type: "string", enum: ["P1", "P2", "P3", "P4"] }, ringkasan: { type: "string" }, order_id: { type: "string" },
        status: { type: "string", enum: ["TERBUKA", "SELESAI", "MENUNGGU_PERSETUJUAN"] },
      },
      required: ["user_id", "kategori", "ringkasan"],
    },
    run: (args) => {
      const t = makeTicket(args);
      audit("buat_tiket", { tiket: t.id, user_id: t.user_id });
      return { ok: true, tiket: t };
    },
  },
  {
    name: "eskalasi_manusia",
    nodes: ["t_eskalasi"],
    description: "Teruskan kasus ke agen manusia/tim spesialis dengan ringkasan lengkap supaya pengguna TIDAK perlu mengulang cerita. Wajib untuk P1, nominal di atas batas AI, atau jika pengguna minta.",
    input_schema: { type: "object", properties: { user_id: { type: "string" }, tiket_id: { type: "string" }, tim: { type: "string" }, ringkasan: { type: "string" } }, required: ["user_id", "tim", "ringkasan"] },
    run: ({ user_id, tiket_id, tim, ringkasan }) => {
      const db = getDb();
      let t = tiket_id && db.tickets.find((x) => x.id === tiket_id);
      if (!t) t = makeTicket({ user_id, kategori: "MINTA_MANUSIA", ringkasan, tim });
      t.eskalasi = { tim, ringkasan, waktu: new Date().toISOString() };
      t.status = "DIESKALASI";
      save();
      audit("eskalasi", { user_id, tiket: t.id, tim });
      const antrean = /Safety|Fraud/.test(tim) ? 0 : 3;
      return { ok: true, tiket: t.id, tim, posisi_antrean: antrean, estimasi_dihubungi: antrean === 0 ? "< 5 menit (prioritas)" : "± 10 menit", kanal: "Chat ini juga (agen manusia akan masuk ke percakapan) + telepon jika perlu" };
    },
  },
];

const BY_NAME = Object.fromEntries(TOOLS.map((t) => [t.name, t]));

// Definisi yang dikirim ke Claude (tanpa field internal)
export const toolDefinitions = () => TOOLS.map(({ name, description, input_schema }) => ({ name, description, input_schema }));

/** Jalankan tool + catat jejaknya untuk visualisasi flow. */
export async function runTool(name, input, trace) {
  const tool = BY_NAME[name];
  if (!tool) throw new Error(`Tool ${name} tidak dikenal`);
  const started = Date.now();
  // n8n mengirim "" untuk parameter opsional yang tidak diisi AI -> anggap tidak ada
  const clean = Object.fromEntries(Object.entries(input || {}).filter(([, v]) => v !== "" && v !== null));
  let output;
  try {
    output = await tool.run(clean);
  } catch (e) {
    output = { ok: false, error: e.message };
  }
  trace?.push({ type: "tool", tool: name, nodes: tool.nodes, input, output, ms: Date.now() - started });
  return output;
}

export function toolNodes(name) {
  return BY_NAME[name]?.nodes || [];
}
