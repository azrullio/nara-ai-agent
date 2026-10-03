// Server web simulator + API tools (dipakai juga oleh workflow n8n).
// Jalankan: npm start  ->  buka http://localhost:3000
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

try { process.loadEnvFile(); } catch { /* .env opsional */ }

const { handleMessage, resetSessions, humanize } = await import("./src/agent.js");
const { getDb, resetDb } = await import("./src/db.js");
const { runTool, toolDefinitions } = await import("./src/tools.js");
const { claudeAvailable } = await import("./src/claude-agent.js");

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, "public");
const PORT = Number(process.env.PORT || 3000);
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml" };

const send = (res, code, body) => {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*" });
  res.end(JSON.stringify(body));
};

async function readBody(req) {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

async function viaN8n({ userId, text }) {
  const url = process.env.N8N_WEBHOOK_URL;
  if (!url) throw new Error("Isi N8N_WEBHOOK_URL di file .env dulu");
  const user = getDb().users.find((u) => u.id === userId);
  const t0 = Date.now();
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, phone: user?.telepon, text }) });
  if (!r.ok) throw new Error(`n8n membalas HTTP ${r.status}`);
  const data = await r.json();
  const replies = data.bubbles?.map((b) => b.text ?? b) || [data.output || data.text || JSON.stringify(data)];
  return {
    engine: "n8n", kasus: data.kasus || null, emosi: data.emosi || null, bubbles: humanize(replies), ms: Date.now() - t0,
    trace: [{ type: "input", nodes: ["wa_in", "send_seen", "typing"] }, { type: "parse", nodes: ["normalize", "intent"] }, { type: "llm", nodes: ["memory", "llm", "agent"], detail: "Dieksekusi di n8n (lihat tab Executions di n8n)" }, { type: "output", nodes: ["humanize", "delay", "wa_out"] }],
  };
}

// ---- Pengaman saat di-hosting ----
// Isi APP_PASSWORD di environment hosting supaya hanya kamu yang bisa membuka simulator
// (browser akan minta username bebas + password). n8n bisa lewat header "x-app-token".
const APP_PASSWORD = process.env.APP_PASSWORD || "";
function authorized(req) {
  if (!APP_PASSWORD) return true;
  if (req.headers["x-app-token"] === APP_PASSWORD) return true;
  const [type, b64] = (req.headers.authorization || "").split(" ");
  if (type !== "Basic" || !b64) return false;
  const pass = Buffer.from(b64, "base64").toString().split(":").slice(1).join(":");
  return pass === APP_PASSWORD;
}

// Batasi jumlah pesan chat per IP (mencegah saldo API terkuras)
const RATE_LIMIT = Number(process.env.RATE_LIMIT_PER_HOUR || 60);
const hits = new Map();
function rateLimited(req) {
  const ip = req.headers["x-forwarded-for"]?.split(",")[0] || req.socket.remoteAddress;
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < 3600e3);
  list.push(now);
  hits.set(ip, list);
  return list.length > RATE_LIMIT;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (req.method === "OPTIONS") return send(res, 204, {});
    if (url.pathname === "/healthz") return send(res, 200, { ok: true });
    if (!authorized(req)) {
      res.writeHead(401, { "WWW-Authenticate": 'Basic realm="Nara AI Agent"', "Content-Type": "text/plain; charset=utf-8" });
      return res.end("Butuh password");
    }
    if (url.pathname === "/api/chat" && rateLimited(req)) return send(res, 429, { error: `Batas ${RATE_LIMIT} pesan per jam tercapai, coba lagi nanti` });

    if (url.pathname === "/api/status") {
      const db = getDb();
      return send(res, 200, {
        claude: await claudeAvailable(),
        model: process.env.CLAUDE_MODEL || "claude-opus-5-5",
        n8n: !!process.env.N8N_WEBHOOK_URL,
        users: db.users.map(({ id, nama, panggilan, peran, catatan_skenario, telepon }) => ({ id, nama, panggilan, peran, catatan_skenario, telepon })),
      });
    }

    if (url.pathname === "/api/chat" && req.method === "POST") {
      const { userId, text, engine } = await readBody(req);
      if (!text?.trim()) return send(res, 400, { error: "Pesan kosong" });
      const out = engine === "n8n" ? await viaN8n({ userId, text }) : await handleMessage({ userId, text, engine });
      return send(res, 200, out);
    }

    if (url.pathname === "/api/db") {
      const db = getDb();
      return send(res, 200, {
        users: db.users.map((u) => ({ id: u.id, nama: u.nama, peran: u.peran, saldo: u.gopay.saldo, status_gopay: u.gopay.status })),
        tickets: db.tickets, vouchers: db.vouchers, audit_log: db.audit_log.slice(-40).reverse(),
        orders: db.orders.map(({ id, user_id, layanan, status, total, tarif_final, driver_id }) => ({ id, user_id, layanan, status, total: total ?? tarif_final, driver_id })),
        transactions: db.transactions.map(({ id, user_id, jenis, nominal, status, metode }) => ({ id, user_id, jenis, nominal, status, metode })),
        drivers: db.drivers.map(({ id, nama, layanan, plat, rating, jumlah_keluhan_90hari, status }) => ({ id, nama, layanan, plat, rating, keluhan: jumlah_keluhan_90hari, status })),
        knowledge_base: db.knowledge_base.map(({ id, nama, kategori, prioritas, sla, tim }) => ({ id, nama, kategori, prioritas, sla, tim })),
      });
    }

    if (url.pathname === "/api/reset" && req.method === "POST") {
      resetDb();
      resetSessions();
      return send(res, 200, { ok: true });
    }

    // Endpoint untuk HTTP Request Tool di n8n: POST /api/tools/<nama_tool>
    if (url.pathname === "/api/tools" && req.method === "GET") return send(res, 200, toolDefinitions());
    const m = url.pathname.match(/^\/api\/tools\/([a-z_]+)$/);
    if (m && req.method === "POST") return send(res, 200, await runTool(m[1], await readBody(req)));

    // File statis
    const file = path.join(PUBLIC, url.pathname === "/" ? "index.html" : url.pathname);
    if (file.startsWith(PUBLIC) && fs.existsSync(file) && fs.statSync(file).isFile()) {
      res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
      return fs.createReadStream(file).pipe(res);
    }
    send(res, 404, { error: "Tidak ditemukan" });
  } catch (e) {
    console.error(e);
    send(res, 500, { error: e.message });
  }
});

server.listen(PORT, async () => {
  const mode = (await claudeAvailable()) ? `CLAUDE (${process.env.CLAUDE_MODEL || "claude-opus-5-5"})` : "OFFLINE (rule-based, tanpa API key)";
  console.log(`\n  🟢 Nara AI Agent siap!  http://localhost:${PORT}\n  Mode otak AI : ${mode}\n  API tools    : http://localhost:${PORT}/api/tools\n`);
});
