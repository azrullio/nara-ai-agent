// Generator workflow n8n dari definisi tools & system prompt yang sama dengan simulator.
// Jalankan: node n8n/build-workflow.js   -> menghasilkan n8n/gocare-workflow.json
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { TOOLS } from "../src/tools.js";
import { SYSTEM_PROMPT } from "../src/prompt.js";

const DIR = path.dirname(fileURLToPath(import.meta.url));
// Alamat server simulator (database + tools). Setelah hosting, jalankan:
//   PUBLIC_URL=https://nama-app.onrender.com APP_PASSWORD=rahasia node n8n/build-workflow.js
const API = (process.env.PUBLIC_URL || "http://localhost:3000").replace(/\/$/, "");
const APP_PASSWORD = process.env.APP_PASSWORD || "";
const WA_GATEWAY = "http://localhost:3001"; // ganti dengan gateway WhatsApp kamu (mis. WAHA)

const nodes = [];
const connections = {};
const node = (name, type, typeVersion, position, parameters, extra = {}) => {
  nodes.push({ id: randomUUID(), name, type, typeVersion, position, parameters, ...extra });
  return name;
};
const link = (from, to, kind = "main", fromIndex = 0) => {
  connections[from] ??= {};
  connections[from][kind] ??= [];
  connections[from][kind][fromIndex] ??= [];
  connections[from][kind][fromIndex].push({ node: to, type: kind, index: 0 });
};
const sticky = (title, color, position, width, height, body = "") =>
  node(`Catatan ${title}`, "n8n-nodes-base.stickyNote", 1, position, { content: `# ${title}\n${body}`, height, width, color });

// ---------------- Sticky notes (blok berwarna seperti di contoh) ----------------
sticky("INPUT", 3, [-60, -140], 720, 330, "Pesan WhatsApp masuk → tandai dibaca → tampilkan 'mengetik...'");
sticky("PARSING", 6, [680, -140], 480, 330, "Rapikan bahasa gaul, deteksi emosi & kasus");
sticky("OTAK AI", 7, [1180, -140], 420, 640, "Agent + model Claude + memori per pengguna");
sticky("TOOLS & DATABASE", 4, [-60, 520], 1660, 520, "Setiap tool memanggil API simulator (http://localhost:3000/api/tools/...) yang membaca/menulis database");
sticky("OUTPUT", 2, [1620, -140], 980, 640, "Pecah jadi beberapa bubble, jeda mengetik natural, kirim");

// ---------------- INPUT ----------------
const webhook = node("Pesan WA Masuk", "n8n-nodes-base.webhook", 2, [0, 40], { httpMethod: "POST", path: "gocare-wa", responseMode: "responseNode", options: {} }, { webhookId: randomUUID() });
const waCall = (name, pos, endpoint, body) =>
  node(name, "n8n-nodes-base.httpRequest", 4.2, pos, {
    method: "POST",
    url: `${WA_GATEWAY}${endpoint}`,
    sendBody: true,
    specifyBody: "json",
    jsonBody: body,
    options: { timeout: 3000 },
  }, { onError: "continueRegularOutput", notes: "Opsional: butuh gateway WhatsApp (mis. WAHA). Kalau belum ada, node ini dilewati otomatis." });
const seen = waCall("Send Seen", [220, 40], "/api/sendSeen", `={{ JSON.stringify({ chatId: ($json.body.phone || '') + '@c.us', session: 'default' }) }}`);
const typing = waCall("Start Typing", [440, 40], "/api/startTyping", `={{ JSON.stringify({ chatId: ($('Pesan WA Masuk').item.json.body.phone || '') + '@c.us', session: 'default' }) }}`);

// ---------------- PARSING ----------------
const normal = node("Normalisasi Pesan", "n8n-nodes-base.code", 2, [760, 40], {
  jsCode: `// Ambil data dari webhook (format simulator ATAU format gateway WhatsApp seperti WAHA)
const b = $('Pesan WA Masuk').first().json.body || {};
const text = b.text ?? b.payload?.body ?? '';
const phone = b.phone ?? (b.payload?.from || '').replace('@c.us', '');
// Pemetaan nomor HP -> user_id (di produksi: ambil dari database pengguna)
const PETA = { '081234567001':'U001','081234567002':'U002','081234567003':'U003','081234567004':'U004','081234567005':'U005','081298765001':'M001' };
const userId = b.userId || PETA[phone] || PETA['0' + phone.replace(/^62/, '')] || 'U001';
const SLANG = { gk:'gak', ga:'gak', tdk:'tidak', blm:'belum', udh:'udah', bgt:'banget', yg:'yang', tlg:'tolong', rb:'ribu', tf:'transfer' };
const normal = text.toLowerCase().split(/\\s+/).map(w => SLANG[w] ?? w).join(' ');
return [{ json: { userId, phone, text, normal } }];`,
});
const intent = node("Deteksi Emosi & Intent", "n8n-nodes-base.code", 2, [980, 40], {
  jsCode: `const { userId, text, normal } = $json;
const EMOSI = [
  ['darurat', /(dilecehkan|pelecehan|diancam|kecelakaan|dipukul|takut banget)/],
  ['panik', /(saldo .*(hilang|habis)|diretas|dibobol|dicuri|bukan (aku|saya))/],
  ['marah', /(parah|kecewa|kesel|kesal|anjir|payah|!!!)/],
  ['sedih', /(sedih|capek|lelah|nangis|huhu)/],
  ['santai', /(wkwk|haha|hehe)/],
];
const KASUS = [
  ['AKUN_DIRETAS', /(diretas|dibobol|bukan (aku|saya)|transaksi aneh|saldo .*hilang)/],
  ['PELECEHAN', /(dilecehkan|pelecehan|cabul|diancam)/],
  ['TOPUP_TIDAK_MASUK', /(top ?up|isi saldo)/],
  ['FOOD_TERLAMBAT', /(lama|belum (datang|dateng|sampai)|telat).*(gofood|makanan|pesanan)|(gofood|makanan|pesanan).*(lama|belum|telat)/],
  ['FOOD_SALAH_KURANG', /(kurang|gak ada|salah).*(pesanan|item|menu)|(pesanan|gofood).*(kurang|gak ada|salah)/],
  ['DRIVER_TIDAK_SOPAN', /(tidak sopan|gak sopan|kasar|bentak|ugal|ngebut)/],
  ['PENCURIAN_PAKET_HILANG', /(dicuri|paket .*(hilang|gak sampai))/],
  ['ORDER_FIKTIF', /(fiktif|nalangin|talangan|order palsu)/],
  ['TARIF_TIDAK_SESUAI', /(tarif|mahal|ditagih lebih)/],
  ['BARANG_TERTINGGAL', /(ketinggalan|tertinggal)/],
];
const emosi = (EMOSI.find(([, re]) => re.test(normal)) || ['netral'])[0];
const kasus = (KASUS.find(([, re]) => re.test(normal)) || ['-'])[0];
const waktu = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
const prompt = \`[Konteks sistem, tidak terlihat pengguna]
user_id: \${userId}
waktu_sekarang: \${waktu} WIB
petunjuk_parsing: kasus=\${kasus}, emosi=\${emosi}

Pesan pengguna:
\${text}\`;
return [{ json: { userId, text, emosi, kasus, prompt } }];`,
});

// ---------------- OTAK AI ----------------
const agent = node("Agent Nara", "@n8n/n8n-nodes-langchain.agent", 1.7, [1300, 40], {
  promptType: "define",
  text: "={{ $json.prompt }}",
  options: { systemMessage: SYSTEM_PROMPT + "\n\nCatatan: user_id selalu otomatis diisi oleh sistem pada setiap tool, kamu tidak perlu mengisinya.", maxIterations: 10 },
});
const model = node("Claude Chat Model", "@n8n/n8n-nodes-langchain.lmChatAnthropic", 1.3, [1240, 300], {
  model: { __rl: true, mode: "id", value: "claude-opus-5-5" },
  options: { maxTokensToSample: 4096 },
}, { notes: "Pilih credential Anthropic API kamu. Bisa diganti node OpenAI Chat Model kalau mau." });
const memory = node("Memori Sesi", "@n8n/n8n-nodes-langchain.memoryBufferWindow", 1.3, [1420, 300], {
  sessionIdType: "customKey",
  sessionKey: "={{ $('Normalisasi Pesan').item.json.userId }}",
  contextWindowLength: 20,
});
link(model, agent, "ai_languageModel");
link(memory, agent, "ai_memory");

// ---------------- TOOLS (dibuat otomatis dari src/tools.js) ----------------
const esc = (s) => String(s).replace(/'/g, "\\'").replace(/\n/g, " ");
TOOLS.forEach((t, i) => {
  const props = t.input_schema.properties;
  const req = new Set(t.input_schema.required || []);
  const lines = Object.entries(props).map(([key, p]) => {
    if (key === "user_id") return `  "user_id": "{{ $('Normalisasi Pesan').item.json.userId }}"`;
    const desc = esc((p.description || key) + (p.enum ? ` (pilihan: ${p.enum.join("/")})` : "") + (req.has(key) ? "" : " - opsional"));
    if (p.type === "number") return `  "${key}": {{ $fromAI('${key}', '${desc}', 'number'${req.has(key) ? "" : ", 0"}) }}`;
    if (p.type === "boolean") return `  "${key}": {{ $fromAI('${key}', '${desc}', 'boolean', false) }}`;
    return `  "${key}": {{ JSON.stringify($fromAI('${key}', '${desc}', 'string'${req.has(key) ? "" : ", ''"})) }}`;
  });
  const name = t.name;
  node(name, "n8n-nodes-base.httpRequestTool", 4.2, [-20 + (i % 8) * 200, 640 + Math.floor(i / 8) * 200], {
    toolDescription: t.description,
    method: "POST",
    url: `${API}/api/tools/${t.name}`,
    ...(APP_PASSWORD && { sendHeaders: true, headerParameters: { parameters: [{ name: "x-app-token", value: APP_PASSWORD }] } }),
    sendBody: true,
    specifyBody: "json",
    jsonBody: `={\n${lines.join(",\n")}\n}`,
    options: {},
  });
  link(name, agent, "ai_tool");
});

// ---------------- OUTPUT ----------------
const human = node("Humanizer", "n8n-nodes-base.code", 2, [1700, 40], {
  jsCode: `// Pecah jawaban jadi beberapa bubble chat + hitung jeda mengetik yang natural
const out = String($json.output || '').replace(/\\*\\*(.+?)\\*\\*/g, '$1');
const bubbles = out.split(/\\n\\s*\\n/).map(s => s.trim()).filter(Boolean).slice(0, 6)
  .map(text => ({ text, typing_ms: Math.min(2600, 500 + text.length * 18) }));
const ctx = $('Deteksi Emosi & Intent').first().json;
return [{ json: { bubbles, kasus: ctx.kasus, emosi: ctx.emosi, phone: $('Normalisasi Pesan').first().json.phone } }];`,
});
const respond = node("Balas ke Simulator", "n8n-nodes-base.respondToWebhook", 1.1, [1940, -60], {
  respondWith: "json",
  responseBody: "={{ JSON.stringify({ bubbles: $json.bubbles, kasus: $json.kasus, emosi: $json.emosi }) }}",
  options: {},
});
const split = node("Pecah Bubble", "n8n-nodes-base.splitOut", 1, [1940, 160], { fieldToSplitOut: "bubbles", include: "selectedOtherFields", fieldsToInclude: "phone", options: {} });
const wait = node("Jeda Mengetik", "n8n-nodes-base.wait", 1.1, [2160, 160], { amount: "={{ $json.typing_ms / 1000 }}", unit: "seconds" }, { webhookId: randomUUID() });
const kirim = waCall("Kirim WA", [2380, 160], "/api/sendText", `={{ JSON.stringify({ chatId: $json.phone + '@c.us', text: $json.text, session: 'default' }) }}`);

// ---------------- Alur utama ----------------
link(webhook, seen);
link(seen, typing);
link(typing, normal);
link(normal, intent);
link(intent, agent);
link(agent, human);
link(human, respond);
link(human, split);
link(split, wait);
link(wait, kirim);

const workflow = {
  name: "AI Agent Customer Care - Nara",
  nodes,
  connections,
  active: false,
  settings: { executionOrder: "v1" },
  pinData: {},
  meta: { templateCredsSetupCompleted: false },
};
fs.writeFileSync(path.join(DIR, "gocare-workflow.json"), JSON.stringify(workflow, null, 2));
console.log(`✅ n8n/gocare-workflow.json dibuat (${nodes.length} node, ${TOOLS.length} tools)`);
