// ====================== Simulator UI ======================
const $ = (s) => document.querySelector(s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const now = () => new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });

// ---------- Definisi diagram flow (koordinat logis 1200 x 740) ----------
const SECTIONS = [
  { t: "Input", cls: "s-input", x: 10, y: 10, w: 530, h: 165 },
  { t: "Parsing", cls: "s-parse", x: 555, y: 10, w: 330, h: 165 },
  { t: "Otak AI", cls: "s-brain", x: 10, y: 190, w: 530, h: 175 },
  { t: "Database", cls: "s-db", x: 555, y: 190, w: 635, h: 175 },
  { t: "Aksi Keuangan", cls: "s-fin", x: 10, y: 380, w: 375, h: 175 },
  { t: "Keamanan", cls: "s-sec", x: 400, y: 380, w: 370, h: 175 },
  { t: "Operasional", cls: "s-ops", x: 785, y: 380, w: 405, h: 175 },
  { t: "Output", cls: "s-out", x: 10, y: 570, w: 1180, h: 160 },
];
const NODES = {
  wa_in: { x: 90, y: 100, i: "💬", l: "Pesan Masuk", s: "Webhook WA" },
  send_seen: { x: 260, y: 100, i: "👁️", l: "Send Seen", s: "tandai dibaca" },
  typing: { x: 430, y: 100, i: "⌨️", l: "Start Typing", s: "sedang mengetik" },
  normalize: { x: 640, y: 100, i: "{ }", l: "Normalisasi", s: "bahasa gaul" },
  intent: { x: 800, y: 100, i: "🎭", l: "Emosi & Intent", s: "deteksi kasus" },
  agent: { x: 115, y: 285, i: "🤖 Agent Nara", l: "", big: true },
  llm: { x: 320, y: 285, i: "🧠", l: "Model Bahasa", s: "Claude / aturan", circle: true },
  memory: { x: 460, y: 285, i: "🗂️", l: "Memori Sesi", s: "riwayat chat", circle: true },
  db_users: { x: 625, y: 285, i: "👤", l: "Pengguna", s: "read/write", circle: true },
  db_trx: { x: 725, y: 285, i: "💳", l: "Transaksi", circle: true },
  db_orders: { x: 825, y: 285, i: "📦", l: "Pesanan", circle: true },
  db_drivers: { x: 925, y: 285, i: "🛵", l: "Mitra Driver", circle: true },
  db_merchants: { x: 1025, y: 285, i: "🍜", l: "Merchant", circle: true },
  db_kb: { x: 1125, y: 285, i: "📚", l: "SOP / KB", circle: true },
  t_rekon: { x: 80, y: 470, i: "🔄", l: "Rekonsiliasi Top Up" },
  t_refund: { x: 200, y: 470, i: "💸", l: "Refund / Batal" },
  t_komp: { x: 315, y: 470, i: "🎟️", l: "Voucher Maaf" },
  t_amankan: { x: 470, y: 470, i: "🔒", l: "Amankan Akun" },
  t_lapor: { x: 585, y: 470, i: "🚩", l: "Laporkan Mitra" },
  t_darurat: { x: 700, y: 470, i: "🚨", l: "Protokol Darurat" },
  t_merchant: { x: 840, y: 470, i: "🏪", l: "Hubungi Resto" },
  t_driver: { x: 935, y: 470, i: "📞", l: "Hubungi Driver" },
  t_tiket: { x: 1030, y: 470, i: "🎫", l: "Buat Tiket" },
  t_eskalasi: { x: 1125, y: 470, i: "🙋", l: "Eskalasi Manusia" },
  humanize: { x: 300, y: 660, i: "✂️", l: "Humanizer", s: "pecah jadi bubble" },
  delay: { x: 600, y: 660, i: "⏱️", l: "Jeda Mengetik", s: "natural typing" },
  wa_out: { x: 900, y: 660, i: "📤", l: "Kirim Balasan", s: "WhatsApp" },
};
const MAIN_EDGES = [["wa_in", "send_seen"], ["send_seen", "typing"], ["typing", "normalize"], ["normalize", "intent"], ["intent", "agent"], ["agent", "llm"], ["agent", "memory"], ["agent", "humanize"], ["humanize", "delay"], ["delay", "wa_out"]];
const FAINT_EDGES = [
  ...["t_rekon", "t_refund", "t_komp", "t_amankan", "t_lapor", "t_darurat", "t_merchant", "t_driver", "t_tiket", "t_eskalasi"].map((t) => ["agent", t]),
  ...["db_users", "db_trx", "db_orders", "db_drivers", "db_merchants", "db_kb"].map((d) => ["memory", d]),
];

const edgeEls = {};
function edgePath(a, b) {
  const A = NODES[a], B = NODES[b];
  const ax = A.x + (A.big ? 65 : 30), ay = A.y, bx = B.x - (B.big ? 65 : 30), by = B.y;
  if (Math.abs(ay - by) > 60 && bx < ax) {
    // turun ke baris berikutnya (melengkung)
    const sx = A.x, sy = A.y + 30, ex = B.x, ey = B.y - 30;
    return `M${sx},${sy} C${sx},${sy + 80} ${ex},${ey - 80} ${ex},${ey}`;
  }
  const dx = Math.max(40, (bx - ax) / 2);
  return `M${ax},${ay} C${ax + dx},${ay} ${bx - dx},${by} ${bx},${by}`;
}

function drawFlow() {
  const canvas = $("#canvas"), svg = $("#edges");
  for (const s of SECTIONS) {
    const d = document.createElement("div");
    d.className = `section ${s.cls}`;
    Object.assign(d.style, { left: s.x + "px", top: s.y + "px", width: s.w + "px", height: s.h + "px" });
    d.innerHTML = `<h3>${s.t}</h3>`;
    canvas.insertBefore(d, svg);
  }
  const mk = (pair, cls) => {
    const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
    p.setAttribute("d", edgePath(...pair));
    if (cls) p.setAttribute("class", cls);
    p.dataset.base = cls || "";
    svg.appendChild(p);
    edgeEls[pair.join(">")] = p;
  };
  FAINT_EDGES.forEach((e) => mk(e, "faint"));
  MAIN_EDGES.forEach((e) => mk(e));
  for (const [id, n] of Object.entries(NODES)) {
    const el = document.createElement("div");
    el.className = `node${n.big ? " big" : ""}${n.circle ? " circle" : ""}`;
    el.id = "n-" + id;
    el.style.left = n.x + "px";
    el.style.top = n.y + "px";
    el.innerHTML = `<div class="box">${n.i}<span class="badge"></span></div>${n.l ? `<div class="lbl">${n.l}</div>` : ""}${n.s ? `<div class="sub">${n.s}</div>` : ""}`;
    canvas.appendChild(el);
  }
  fitCanvas();
}
function fitCanvas() {
  const w = $("#canvasWrap").clientWidth - 20;
  $("#canvas").style.zoom = Math.max(0.35, Math.min(1.1, w / 1200));
}
window.addEventListener("resize", fitCanvas);

function clearFlow() {
  document.querySelectorAll(".node").forEach((n) => { n.classList.remove("active", "done"); n.querySelector(".badge").textContent = ""; });
  Object.values(edgeEls).forEach((p) => p.setAttribute("class", p.dataset.base));
}

function lightEdge(a, b) {
  const p = edgeEls[`${a}>${b}`] || edgeEls[`${b}>${a}`];
  if (p) p.setAttribute("class", "flow");
}

// ---------- animasi eksekusi ----------
function describe(step) {
  switch (step.type) {
    case "input": return typeof step.detail === "string" ? step.detail : step.detail ? `Pesan dari ${step.detail.dari}` : "Input";
    case "parse": return step.detail?.kasus !== undefined ? `kasus=<b>${step.detail.kasus || "?"}</b> · emosi=<b>${step.detail.emosi}</b>` : `"${esc(step.detail?.normal || "")}"`;
    case "memory": return `memori: ${step.detail?.pesan_sebelumnya ?? 0} pesan sebelumnya${step.detail?.langkah_aktif ? " · lanjut " + step.detail.langkah_aktif : ""}`;
    case "route": return `rute → <b>${step.kasus}</b>${step.melanjutkan_langkah ? " (langkah " + step.melanjutkan_langkah + ")" : ""}`;
    case "llm": return step.model ? `LLM ${step.model} · stop=${step.stop_reason}${step.tool_dipanggil?.length ? " · panggil " + step.tool_dipanggil.join(", ") : ""}` : esc(step.detail || "LLM");
    case "tool": return `🔧 <b>${step.tool}</b>${step.output?.ok === false ? " ⚠️" : ""}`;
    case "output": return step.nodes[0] === "humanize" ? `${step.detail?.jumlah_bubble} bubble` : step.nodes[0] === "delay" ? "jeda mengetik" : "terkirim ✓✓";
    case "error": return `❌ ${esc(step.detail)}`;
    default: return step.type;
  }
}

async function animate(trace) {
  clearFlow();
  const list = $("#logList");
  list.innerHTML = "";
  let prev = null;
  const counts = {};
  for (const step of trace) {
    const nodes = step.nodes || [];
    const primary = nodes[0];
    if (prev && primary) lightEdge(step.type === "tool" ? "agent" : prev, primary);
    if (step.type === "tool") nodes.slice(1).forEach((n) => lightEdge("memory", n));
    for (const id of nodes) {
      const el = $("#n-" + id);
      if (!el) continue;
      el.classList.add("active");
      counts[id] = (counts[id] || 0) + 1;
      if (counts[id] > 1) el.querySelector(".badge").textContent = counts[id] + "×";
    }
    const li = document.createElement("li");
    const payload = step.type === "tool" ? { input: step.input, output: step.output } : step.detail ?? step;
    li.innerHTML = `<details><summary>${describe(step)}</summary><pre>${esc(JSON.stringify(payload, null, 2))}</pre></details>`;
    list.appendChild(li);
    list.scrollTop = list.scrollHeight;
    $("#n-" + primary)?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    await sleep(step.type === "tool" || step.type === "llm" ? 420 : 240);
    for (const id of nodes) { const el = $("#n-" + id); el?.classList.remove("active"); el?.classList.add("done"); }
    if (step.type !== "tool") prev = primary === "agent" || step.type === "llm" ? "agent" : primary;
  }
}

// ---------- chat ----------
const CHIPS = {
  U001: ["Top up 100rb aku dari tadi belum masuk 😭", "GoFood aku lama bgt udah sejam belum dateng, laper", "Kemarin drivernya ga sopan", "dia ngebut terus, pas aku tegur malah bentak aku", "wkwk makasih ya Nara"],
  U002: ["Topup aku gagal tapi rekening kepotong 50rb", "Masukin ke saldo gopay aja", "Top up di alfamart kok kepotong 2x?", "Mau ngomong sama CS manusia aja"],
  U003: ["TOLONG SALDO SAYA HILANG, ADA TRANSFER YANG BUKAN SAYA!!!", "Ada yang nelpon ngaku CS minta kode OTP", "Paket gosend isi HP ga sampai ke adik aku, kayaknya dicuri"],
  U004: ["Pesanan gofood aku kurang, es teh nya gak ada", "Kok tarif gocar aku lebih mahal dari estimasi?", "Dompet aku ketinggalan di gocar tadi", "iya tolong antar"],
  U005: ["Aku tadi dilecehkan sama driver gocar", "udah aman di rumah", "Lagi capek banget hari ini"],
  M001: ["Halo min", "Min saya kena order fiktif, udah nalangin martabak 245rb, customernya ga bisa dihubungi"],
};
const FOLLOW = ["iya boleh", "batalin aja", "tetap tunggu aja", "kamu bot ya?"];

const histories = {};
let users = [];
let busy = false;
const userId = () => $("#userSel").value;

function addMsg(text, dir, save = true) {
  const box = $("#messages");
  const d = document.createElement("div");
  d.className = "msg " + dir;
  d.innerHTML = `${esc(text)}<span class="t">${now()}</span>`;
  box.appendChild(d);
  box.scrollTop = box.scrollHeight;
  if (save) (histories[userId()] ||= []).push({ text, dir });
}
function showTyping(on) {
  $("#status").textContent = on ? "sedang mengetik…" : "online";
  $("#status").classList.toggle("typing", on);
  document.querySelector(".typing-dots")?.remove();
  if (on) {
    const t = document.createElement("div");
    t.className = "typing-dots";
    t.innerHTML = "<i></i><i></i><i></i>";
    $("#messages").appendChild(t);
    $("#messages").scrollTop = 1e9;
  }
}
function renderChips() {
  const c = $("#chips");
  c.innerHTML = "";
  [...(CHIPS[userId()] || []), ...FOLLOW].forEach((t) => {
    const b = document.createElement("button");
    b.className = "chip";
    b.textContent = t;
    b.onclick = () => sendMessage(t);
    c.appendChild(b);
  });
}
function switchUser() {
  const u = users.find((x) => x.id === userId());
  $("#scenario").textContent = `📱 ${u.telepon} · ${u.peran === "mitra_driver" ? "Mitra driver" : "Pelanggan"} — ${u.catatan_skenario}`;
  $("#messages").innerHTML = "";
  addMsg(`Kamu sedang chat sebagai ${u.nama}. Pesan dienkripsi end-to-end (simulasi).`, "sys", false);
  (histories[u.id] || []).forEach((m) => addMsg(m.text, m.dir, false));
  renderChips();
}

async function sendMessage(text) {
  text = text.trim();
  if (!text || busy) return;
  busy = true;
  $("#composer button").disabled = true;
  $("#input").value = "";
  addMsg(text, "out");
  await sleep(350);
  showTyping(true);
  try {
    const r = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: userId(), text, engine: $("#engineSel").value }) });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error);
    $("#execInfo").textContent = `· ${data.engine.toUpperCase()} · kasus ${data.kasus || "-"} · ${data.ms} ms`;
    await animate(data.trace);
    for (const [i, b] of data.bubbles.entries()) {
      showTyping(true);
      await sleep(i === 0 ? 300 : Math.min(1600, b.typing_ms * 0.7));
      showTyping(false);
      addMsg(b.text, "in");
    }
    refreshDb();
  } catch (e) {
    showTyping(false);
    addMsg("⚠️ " + e.message, "sys", false);
  } finally {
    showTyping(false);
    busy = false;
    $("#composer button").disabled = false;
    $("#input").focus();
  }
}

// ---------- tab database ----------
let lastSaldo = {};
function table(title, rows, cols, changed = () => false) {
  if (!rows.length) return `<div><h4>${title}</h4><p class="muted">Belum ada data.</p></div>`;
  cols ||= Object.keys(rows[0]);
  return `<div class="wrap"><h4>${title} (${rows.length})</h4><table><tr>${cols.map((c) => `<th>${c}</th>`).join("")}</tr>${rows
    .map((r) => `<tr class="${changed(r) ? "changed" : ""}">${cols.map((c) => `<td>${esc(typeof r[c] === "object" && r[c] !== null ? JSON.stringify(r[c]) : r[c] ?? "")}</td>`).join("")}</tr>`)
    .join("")}</table></div>`;
}
async function refreshDb() {
  const d = await (await fetch("/api/db")).json();
  const rp = (n) => "Rp" + Number(n).toLocaleString("id-ID");
  const users = d.users.map((u) => ({ ...u, saldo_rp: rp(u.saldo) }));
  $("#pane-db").innerHTML = [
    table("Pengguna & saldo GoPay", users, ["id", "nama", "peran", "saldo_rp", "status_gopay"], (u) => lastSaldo[u.id] !== undefined && lastSaldo[u.id] !== u.saldo),
    table("Tiket", [...d.tickets].reverse(), ["id", "user_id", "kategori", "prioritas", "status", "tim", "ringkasan"]),
    table("Voucher", [...d.vouchers].reverse(), ["kode", "user_id", "nominal", "layanan", "alasan", "berlaku_sampai"]),
    table("Audit log aksi agent", d.audit_log, ["waktu", "action", "user_id"]),
    table("Mitra driver", d.drivers),
    table("Pesanan", d.orders),
    table("Transaksi", d.transactions),
    table("Knowledge base (SOP kasus)", d.knowledge_base),
  ].join("");
  lastSaldo = Object.fromEntries(d.users.map((u) => [u.id, u.saldo]));
}

// ---------- init ----------
document.querySelectorAll(".tab").forEach((t) =>
  t.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("active", x === t));
    $("#pane-flow").classList.toggle("hidden", t.dataset.tab !== "flow");
    $("#pane-db").classList.toggle("hidden", t.dataset.tab !== "db");
    if (t.dataset.tab === "flow") fitCanvas();
  }),
);
$("#composer").addEventListener("submit", (e) => { e.preventDefault(); sendMessage($("#input").value); });
$("#userSel").addEventListener("change", switchUser);
$("#resetBtn").addEventListener("click", async () => {
  await fetch("/api/reset", { method: "POST" });
  for (const k in histories) delete histories[k];
  lastSaldo = {};
  clearFlow();
  switchUser();
  refreshDb();
});

(async function init() {
  drawFlow();
  const s = await (await fetch("/api/status")).json();
  users = s.users;
  $("#userSel").innerHTML = users.map((u) => `<option value="${u.id}">${u.nama}${u.peran === "mitra_driver" ? " (mitra)" : ""}</option>`).join("");
  const badge = $("#modeBadge");
  badge.textContent = s.claude ? `🧠 Claude · ${s.model}` : "⚙️ Mode offline";
  badge.className = "mode " + (s.claude ? "claude" : "offline");
  if (!s.claude) $("#engineSel option[value=claude]").textContent = "Claude (butuh API key)";
  if (!s.n8n) $("#engineSel option[value=n8n]").textContent = "n8n (isi N8N_WEBHOOK_URL)";
  switchUser();
  refreshDb();
})();
