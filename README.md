# Nara — AI Agent Customer Care (ojol & e-wallet)

AI agent customer service yang **tidak menjawab pakai template**. Nara mengecek data asli, mencari tahu
penyebab masalahnya, **mengambil tindakan** (memasukkan saldo, refund, mengamankan akun, melaporkan driver,
menghubungi resto), lalu menjelaskannya dengan bahasa manusia yang hangat: bisa ikut tertawa, menenangkan,
dan serius saat menyangkut keselamatan.

> Proyek ini adalah **prototipe/simulasi** dengan data dummy. Nama layanan (GoRide, GoFood, GoPay, dst.) dipakai
> sebagai konteks. Untuk dipakai di aplikasi asli, tools perlu disambungkan ke API resmi internal perusahaan.

---

## 1. Chatbot template vs AI agent

| Chatbot template | AI Agent (proyek ini) |
|---|---|
| "Mohon tunggu 3x24 jam" | Cek transaksi → tahu dananya nyangkut di settlement → dorong saldo masuk saat itu juga |
| Jawaban sama untuk semua orang | Menyesuaikan emosi: marah, panik, sedih, santai, darurat |
| Tidak bisa berbuat apa-apa | Punya **tools**: refund, voucher, bekukan akun, laporkan mitra, hubungi resto/driver, eskalasi |
| Pengguna harus cerita ulang ke CS manusia | Kasus dirangkum ke tiket sebelum dieskalasi |

Rumusnya: **AI Agent = Otak (LLM / aturan) + Memori + Tools (aksi) + Data (database) + SOP**.

## 2. Alur (flow)

```
INPUT            PARSING                 OTAK AI                     OUTPUT
Pesan WA ─► Send Seen ─► Typing ─► Normalisasi ─► Emosi & Intent ─► Agent Nara ─► Humanizer ─► Jeda ─► Kirim
                                                        │  ▲
                                         Model bahasa ──┤  ├── Memori sesi
                                                        ▼  │
                              TOOLS:  Keuangan (rekonsiliasi, refund, voucher)
                                      Keamanan (amankan akun, laporkan mitra, darurat)
                                      Operasional (hubungi resto/driver, tiket, eskalasi)
                                                        │
                              DATABASE: pengguna · transaksi · pesanan · driver · merchant · SOP
```

Flow yang sama tersedia dalam 2 bentuk:
1. **Simulator web** (`npm start`) — chat ala WhatsApp + diagram flow yang menyala langkah demi langkah + tab database.
2. **Workflow n8n** (`n8n/gocare-workflow.json`) — tinggal import ke n8n, mirip contoh screenshot.

## 3. Cara menjalankan (± 2 menit)

Butuh **Node.js 20+** ([nodejs.org](https://nodejs.org)).

```bash
cd gocare-ai-agent
```

```bash
npm start
```

Buka **http://localhost:3000**. Tanpa API key apa pun, agent sudah jalan di **mode offline** (berbasis aturan,
gratis). Pilih pengguna di kiri atas, klik chip contoh pesan atau ketik sendiri.

### Mode Claude (lebih pintar & natural)

Dengan Claude, agent bisa memahami kalimat bebas apa pun, memilih tools sendiri, dan menyusun jawaban yang jauh
lebih luwes. Pemanggilan API sudah mengaktifkan *fallback* otomatis: kalau permintaan ditolak filter keamanan
model, API mencoba model cadangan.

#### Langkah 1 — Dapatkan ANTHROPIC_API_KEY

1. Buka **https://console.anthropic.com**, lalu daftar atau login (bisa pakai akun Google).
2. Isi saldo dulu di menu **Settings → Billing → Buy credits**. API Claude itu **prabayar** dan terpisah dari
   langganan Claude.ai. Untuk coba-coba, $5 sudah cukup untuk ratusan percakapan.
3. Buka **Settings → API Keys → Create Key**, beri nama (misalnya `nara-agent`), lalu klik **Create**.
4. **Salin key-nya saat itu juga** (diawali `sk-ant-...`), karena hanya ditampilkan sekali.

> ⚠️ API key itu seperti password yang terhubung ke saldomu. Jangan dikirim ke chat, jangan di-screenshot,
> dan jangan di-upload ke GitHub. File `.env` sudah masuk `.gitignore`, jadi aman dari ikut ter-upload.

#### Langkah 2 — Install library Claude

```bash
npm install
```

#### Langkah 3 — Pasang key di proyek

Di folder `gocare-ai-agent`, buat file `.env` dari contohnya:

```bash
copy .env.example .env
```

(Di Mac/Linux pakai `cp .env.example .env`.) Buka `.env` dengan Notepad/VS Code, isi baris ini, lalu simpan:

```
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxx
```

#### Langkah 4 — Jalankan ulang server

Tutup server yang sedang jalan (Ctrl+C di terminal), lalu:

```bash
npm start
```

#### Langkah 5 — Cek apakah berhasil

- Di terminal muncul `Mode otak AI : CLAUDE (claude-opus-5-5)`.
- Di simulator, badge kanan atas berubah dari **⚙️ Mode offline** menjadi **🧠 Claude**.
- Coba kalimat bebas yang tidak ada di chip, misalnya *"bang driver gofood ku nyasar terus nih, udah 3x
  muter2 kompleks"*. Di panel Logs akan terlihat Claude memilih sendiri tools mana yang dipanggil.

#### Mengatur biaya (opsional, di `.env`)

| Pengaturan | Efek |
|---|---|
| `CLAUDE_MODEL=claude-opus-5-5` | Default, paling pintar ($4 per 1 juta token input, $20 per 1 juta token output) |
| `CLAUDE_MODEL=claude-sonnet-5-5` | Setengah harga Opus ($2/$10), tetap pintar untuk customer service |
| `CLAUDE_MODEL=claude-haiku-4-5` | Paling murah & cepat ($1/$5), cocok untuk uji coba |
| `CLAUDE_EFFORT=low` | Mikirnya lebih singkat, jadi lebih cepat & hemat (`medium` = seimbang, `high` = paling teliti) |

Satu percakapan biasanya hanya menghabiskan sebagian kecil dari 1 juta token. Pemakaian dan biayanya bisa
dipantau di console.anthropic.com → **Usage**. Model Haiku tidak mendukung `CLAUDE_EFFORT` dan fitur model
cadangan otomatis; kode sudah menyesuaikan sehingga Haiku tetap jalan tanpa error.

#### Kalau gagal

- Badge masih "Mode offline": pastikan nama filenya persis `.env` (bukan `.env.txt`), key tidak diberi tanda
  kutip/spasi, dan `npm install` sudah dijalankan. Lalu restart server.
- Muncul pesan *"sistemku lagi tersendat"* di chat: lihat pesan error di terminal. Penyebab umum: saldo
  credits habis, key salah/sudah dihapus, atau nama model salah ketik.

### Uji semua skenario sekaligus

```bash
npm test
```

## 4. Skenario yang bisa dicoba

| Pengguna | Kasus | Yang dilakukan agent |
|---|---|---|
| Rina | Top up 100rb belum masuk | Cek transaksi → dana sudah di bank tapi gagal settlement → **rekonsiliasi, saldo langsung masuk** |
| Rina | GoFood telat | Hitung keterlambatan, **hubungi resto**, jelaskan bukan salah driver, tawarkan tunggu+voucher / batal+refund |
| Rina | Driver tidak sopan | Dengarkan cerita → laporkan mitra → tidak dipertemukan lagi → voucher |
| Budi | Top up gagal tapi rekening terpotong | Ajukan pengembalian ke bank + tawarkan langsung masuk saldo |
| Budi | Top up Alfamart terpotong 2x | Deteksi duplikat → kembalikan ke saldo |
| Sari | Akun diretas | **Langsung bekukan akun**, tendang perangkat asing, tahan transfer yang masih diproses, tiket P1 ke Tim Fraud |
| Sari | Paket GoSend (HP) dicuri | Cocokkan GPS & foto bukti → nonaktifkan driver → klaim asuransi → eskalasi |
| Dimas | Item GoFood kurang | Refund harga item tanpa minta foto + voucher |
| Dimas | Tarif GoCar membengkak | Rincian tarif → perubahan rute oleh driver → refund selisih |
| Dimas | Dompet ketinggalan | Hubungi driver → barang ditemukan → atur antar balik |
| Ayu | Pelecehan oleh driver | Tanya "sudah aman?", protokol darurat, nonaktifkan driver, Unit Safety manusia, pendampingan |
| Agus (mitra) | Order fiktif, sudah nalangin 245rb | Validasi indikasi fraud → **ganti dana talangan** → blokir pemesan → rating aman |
| Siapa saja | Curhat, bercanda, minta CS manusia | Jadi teman ngobrol / ikut tertawa / eskalasi dengan ringkasan |

Tombol **↺ Reset** mengembalikan database & percakapan ke kondisi awal.

## 5. Struktur folder

```
gocare-ai-agent/
├── server.js               Server web + API (juga dipakai n8n)
├── src/
│   ├── agent.js            Orkestrator alur INPUT → PARSING → OTAK AI → OUTPUT
│   ├── nlu.js              Normalisasi bahasa gaul, deteksi emosi, intent, entitas
│   ├── tools.js            16 tools (aksi nyata ke database) ← jantung AI agent
│   ├── offline-agent.js    Otak mode offline: penanganan tiap kasus + gaya bicara
│   ├── claude-agent.js     Otak mode Claude: loop tool-use
│   ├── prompt.js           Persona & aturan Nara (system prompt)
│   ├── db.js               Database JSON + reset
│   └── selftest.js         Tes semua skenario
├── data/                   DATABASE awal (seed)
│   ├── users.json          Pelanggan & mitra + saldo GoPay
│   ├── transactions.json   Top up, pembayaran, transfer (dengan status sistem)
│   ├── orders.json         Pesanan GoRide/GoCar/GoFood/GoSend + log & flag sistem
│   ├── drivers.json        Mitra driver
│   ├── merchants.json      Resto/merchant
│   ├── knowledge_base.json 19 SOP kasus (prioritas, SLA, langkah, kompensasi, larangan)
│   └── policies.json       Batas wewenang AI & aturan kompensasi
├── public/                 UI simulator (chat + flow + database)
├── n8n/
│   ├── gocare-workflow.json  Workflow siap import
│   └── build-workflow.js     Generator workflow dari tools & prompt
└── runtime/db.json         Database yang sedang berjalan (otomatis dibuat)
```

## 6. Pakai di n8n

1. Jalankan simulator dulu (`npm start`) — n8n akan memanggil `http://localhost:3000/api/tools/...` sebagai database.
2. Di n8n: **Workflows → Import from File** → pilih `n8n/gocare-workflow.json`.
3. Buka node **Claude Chat Model** → pilih/buat credential **Anthropic API**. (Mau pakai OpenAI seperti contoh
   screenshot? Hapus node itu, tambahkan **OpenAI Chat Model**, sambungkan ke port *Chat Model* di Agent Nara.)
4. Klik **Execute workflow** / aktifkan, lalu salin URL webhook *Pesan WA Masuk*
   (mis. `http://localhost:5678/webhook-test/gocare-wa`).
5. Tes dari simulator: isi `N8N_WEBHOOK_URL=` di `.env`, restart, pilih **Otak AI → n8n webhook**.
6. Untuk WhatsApp sungguhan, pasang gateway seperti WAHA, arahkan webhook-nya ke n8n, dan ganti URL di node
   *Send Seen*, *Start Typing*, *Kirim WA* (default `http://localhost:3001`). Node-node itu otomatis dilewati
   kalau gateway belum ada.

> Jika n8n berjalan di Docker, ganti `localhost:3000` di node-node tool menjadi `host.docker.internal:3000`.
> Kalau mengubah tools atau prompt, jalankan `node n8n/build-workflow.js` untuk membuat ulang file workflow.

## 7. Hosting online + API Claude

### Hosting di mana?

| Pilihan | Cocok untuk | Catatan |
|---|---|---|
| **Render.com** (disarankan) | Proyek pertama | Gratis, tanpa kartu kredit, deploy langsung dari GitHub. Paket gratis "tidur" setelah ±15 menit tidak dipakai, jadi chat pertama sesudahnya lambat ±30 detik |
| Railway | Sedikit lebih serius | Ada kredit awal, setelah itu berbayar kecil; tidak tidur |
| Fly.io | Butuh server dekat Asia | Perlu install CLI `flyctl` |
| VPS (DigitalOcean, IDCloudHost, dll.) | Kontrol penuh | Jalankan `npm start` dengan `pm2` supaya tetap hidup |

### Apakah API Claude tetap bisa dipakai setelah hosting?

Bisa, dan caranya sama seperti di komputer. Bedanya, API key **tidak ditulis di file**. Key disimpan di menu
**Environment Variables** milik hosting, jadi hanya server yang tahu, bukan pengunjung web.

### Langkah hosting di Render

**1. Upload kode ke GitHub**
1. Buat akun di github.com, lalu klik **New repository** (boleh *Private*).
2. Klik **uploading an existing file** / **Add file → Upload files**, lalu seret semua isi folder
   `gocare-ai-agent` (tanpa `node_modules` dan tanpa `.env`).
3. Klik **Commit changes**.

**2. Buat Web Service di Render**
1. Daftar di render.com dengan akun GitHub.
2. Klik **New → Web Service**, lalu pilih repo tadi.
3. Isi:
   - Runtime: **Node**
   - Build command: `npm install`
   - Start command: `npm start`
   - Instance type: **Free**
   - Health check path (di *Advanced*): `/healthz`

**3. Isi Environment Variables** (tab **Environment**)

| Key | Isi | Wajib? |
|---|---|---|
| `ANTHROPIC_API_KEY` | key dari console.anthropic.com (lihat bagian 3) | Ya, untuk mode Claude |
| `APP_PASSWORD` | password buatanmu sendiri | **Ya** |
| `CLAUDE_MODEL` | mis. `claude-sonnet-5-5` supaya lebih hemat | Opsional |
| `CLAUDE_EFFORT` | `low` / `medium` / `high` | Opsional |
| `RATE_LIMIT_PER_HOUR` | batas chat per pengunjung per jam (default 60) | Opsional |

> Tidak perlu mengisi `PORT`; Render mengaturnya sendiri dan server sudah membacanya otomatis.

**4. Deploy & buka**
1. Klik **Create Web Service / Deploy**, tunggu sampai status **Live**.
2. Buka `https://nama-app.onrender.com`.
3. Browser akan minta login: username isi bebas, password isi `APP_PASSWORD`.
4. Badge kanan atas harus menunjukkan **🧠 Claude**.

Setiap kali kamu mengubah kode dan meng-upload ulang ke GitHub, Render otomatis deploy ulang.

### Pengaman yang sudah terpasang

Kalau web online tanpa pengaman, siapa pun yang tahu link-nya bisa chat dan **menghabiskan saldo API
Claude-mu**. Karena itu server sudah dilengkapi:
- **Password (`APP_PASSWORD`).** Kalau diisi, web hanya bisa dibuka dengan password itu. Di komputer sendiri
  biarkan kosong, jadi tidak ada password.
- **Batas pesan:** maksimal 60 chat per jam per pengunjung (atur lewat `RATE_LIMIT_PER_HOUR`).
- **Alamat `/healthz`** untuk health check hosting.
- **API key hanya di server**, tidak pernah dikirim ke browser.

### Catatan

- Di hosting gratis, database dummy (`runtime/db.json`) kembali ke data awal setiap server restart. Untuk demo
  ini tidak masalah. Untuk data permanen, pindahkan database ke PostgreSQL/Supabase.
- Kalau deploy gagal, buka tab **Logs** di Render dan baca pesan error-nya.

### n8n setelah hosting

Buat ulang file workflow supaya tools memanggil server online (bukan localhost). Di PowerShell (Windows):

```powershell
$env:PUBLIC_URL="https://nama-app.onrender.com"; $env:APP_PASSWORD="passwordmu"; node n8n/build-workflow.js
```

Di Mac/Linux:

```bash
PUBLIC_URL=https://nama-app.onrender.com APP_PASSWORD=passwordmu node n8n/build-workflow.js
```

Lalu import ulang `n8n/gocare-workflow.json` ke n8n. File ini kini berisi password, jadi **jangan dibagikan**
atau di-upload ke GitHub publik.

## 8. Menambah kasus baru (contoh: "GoPayLater tagihan salah")

1. Tambah entri di `data/knowledge_base.json` (id, kata_kunci, prioritas, SOP, kompensasi).
2. Kalau butuh aksi baru, tambah tool di `src/tools.js` (definisi + `nodes` + `run`).
3. Mode offline: tambah handler `H.NAMA_KASUS` di `src/offline-agent.js`. Mode Claude: **tidak perlu kode**,
   Claude membaca SOP lewat `cari_sop` dan memakai tools yang ada.
4. `npm test` lalu `node n8n/build-workflow.js`.

## 9. Menuju produksi (catatan penting)

- **Wewenang AI dibatasi** di `data/policies.json` (refund otomatis maks Rp100.000, voucher maks Rp25.000).
  Di atas itu wajib persetujuan manusia — sudah diterapkan di tools, bukan hanya di prompt.
- **Keselamatan & keamanan dana (P1) selalu dieskalasi** ke manusia, AI hanya melakukan langkah pertama
  (bekukan akun, protokol darurat).
- Ganti database JSON dengan database sungguhan (PostgreSQL/Supabase/Google Sheets) dan API internal resmi.
- Verifikasi identitas pengguna dari nomor WhatsApp/akun login sebelum mengizinkan aksi keuangan.
- Simpan audit log setiap aksi (sudah ada contohnya di tab Database → Audit log).
- Uji dengan percakapan nyata yang beragam, ukur: % kasus tuntas tanpa manusia, waktu penyelesaian, CSAT.
