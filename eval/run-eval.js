// =====================================================================
//  EVALUASI PENELITIAN
//  node eval/run-eval.js [offline|claude]
//  1) Klasifikasi kasus & emosi pada dataset berlabel (dataset-intent.json)
//  2) Penyelesaian kasus end-to-end pada skenario (scenarios.json):
//     AI agent vs chatbot template (baseline)
//  Hasil: eval/hasil-evaluasi.json & eval/hasil-evaluasi.md
// =====================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyze } from "../src/nlu.js";
import { resetDb } from "../src/db.js";
import { handleMessage, resetSessions } from "../src/agent.js";
import { classifyBaseline, replyBaseline } from "./baseline-template.js";

try { process.loadEnvFile(); } catch {}
const DIR = path.dirname(fileURLToPath(import.meta.url));
const engine = process.argv[2] || "offline";
const intents = JSON.parse(fs.readFileSync(path.join(DIR, "dataset-intent.json"), "utf8"));
const scenarios = JSON.parse(fs.readFileSync(path.join(DIR, "scenarios.json"), "utf8"));
const pct = (x) => (x * 100).toFixed(1) + "%";

// ---------- metrik klasifikasi ----------
function classMetrics(gold, pred) {
  const labels = [...new Set(gold)];
  let correct = 0;
  gold.forEach((g, i) => { if (g === pred[i]) correct++; });
  const per = labels.map((l) => {
    const tp = gold.filter((g, i) => g === l && pred[i] === l).length;
    const fp = pred.filter((p, i) => p === l && gold[i] !== l).length;
    const fn = gold.filter((g, i) => g === l && pred[i] !== l).length;
    const p = tp + fp ? tp / (tp + fp) : 0, r = tp + fn ? tp / (tp + fn) : 0;
    return { label: l, precision: p, recall: r, f1: p + r ? (2 * p * r) / (p + r) : 0, support: tp + fn };
  });
  const avg = (k) => per.reduce((a, b) => a + b[k], 0) / per.length;
  return { n: gold.length, accuracy: correct / gold.length, macro_precision: avg("precision"), macro_recall: avg("recall"), macro_f1: avg("f1"), per };
}

const goldK = intents.map((d) => d.kasus);
const agentK = intents.map((d) => analyze(d.teks, {}).kasus);
const baseK = intents.map((d) => classifyBaseline(d.teks));
const goldE = intents.map((d) => d.emosi);
const agentE = intents.map((d) => analyze(d.teks, {}).emosi);

const klasifikasi = {
  kasus_agent: classMetrics(goldK, agentK),
  kasus_baseline: classMetrics(goldK, baseK),
  emosi_agent: classMetrics(goldE, agentE),
  salah_klasifikasi_agent: intents.map((d, i) => ({ ...d, prediksi: agentK[i], prediksi_emosi: agentE[i] })).filter((d) => d.prediksi !== d.kasus || d.prediksi_emosi !== d.emosi),
};

// ---------- metrik skenario end-to-end ----------
const RX_SPESIFIK = /\b(G[FRCS]-\d+|TP-\d+|TRF-\d+|TKT-\d+)|Rp\s?\d/;
const RX_LEMPAR = /Pusat Bantuan|halaman|3x24 jam|Riwayat Pesanan|silakan (laporkan|hubungi|cek|pilih)/i;

async function runAgent(s) {
  resetDb();
  resetSessions();
  const tools = [];
  const replies = [];
  let ms = 0;
  for (const text of s.pesan) {
    const r = await handleMessage({ userId: s.user, text, engine });
    ms += r.ms;
    r.trace.filter((t) => t.type === "tool").forEach((t) => tools.push({ name: t.tool, ok: t.output?.ok !== false || t.output?.status === "MENUNGGU_PERSETUJUAN" }));
    replies.push(r.bubbles.map((b) => b.text).join("\n"));
  }
  return { tools, replies, ms };
}
function runBaseline(s) {
  const replies = s.pesan.map((t) => replyBaseline(t).bubbles[0].text);
  return { tools: [], replies, ms: 0 };
}
function score(s, out) {
  const okTools = new Set(out.tools.filter((t) => t.ok).map((t) => t.name));
  const tuntas = s.aksi_penyelesaian.every((a) => okTools.has(a));
  const all = out.replies.join("\n");
  return {
    id: s.id, kasus: s.kasus, prioritas: s.prioritas, giliran: s.pesan.length,
    tuntas, aksi_terpenuhi: s.aksi_penyelesaian.filter((a) => okTools.has(a)).length, aksi_dibutuhkan: s.aksi_penyelesaian.length,
    tools: [...new Set(out.tools.map((t) => t.name))],
    info_spesifik: RX_SPESIFIK.test(all),
    dialihkan: RX_LEMPAR.test(all) && okTools.size === 0,
    eskalasi_p1: s.prioritas === "P1" ? okTools.has("eskalasi_manusia") : null,
    latensi_ms: out.ms,
  };
}

const hasilAgent = [];
const hasilBase = [];
for (const s of scenarios) {
  hasilAgent.push(score(s, await runAgent(s)));
  hasilBase.push(score(s, runBaseline(s)));
}
resetDb();
resetSessions();

function ringkas(rows) {
  const n = rows.length;
  const p1 = rows.filter((r) => r.prioritas === "P1");
  return {
    skenario: n,
    tingkat_penyelesaian: rows.filter((r) => r.tuntas).length / n,
    pemenuhan_aksi_sop: rows.reduce((a, r) => a + r.aksi_terpenuhi, 0) / rows.reduce((a, r) => a + r.aksi_dibutuhkan, 0),
    info_spesifik: rows.filter((r) => r.info_spesifik).length / n,
    tingkat_pengalihan: rows.filter((r) => r.dialihkan).length / n,
    eskalasi_p1_tepat: p1.length ? p1.filter((r) => r.eskalasi_p1).length / p1.length : null,
    rata_latensi_ms: rows.reduce((a, r) => a + r.latensi_ms, 0) / n,
  };
}

const hasil = {
  dijalankan: new Date().toISOString(), engine,
  klasifikasi,
  skenario: { agent: ringkas(hasilAgent), baseline: ringkas(hasilBase), detail_agent: hasilAgent, detail_baseline: hasilBase },
};
fs.writeFileSync(path.join(DIR, "hasil-evaluasi.json"), JSON.stringify(hasil, null, 2));

// ---------- laporan markdown ----------
const A = hasil.skenario.agent, B = hasil.skenario.baseline;
const md = `# Hasil Evaluasi (${engine}) — ${hasil.dijalankan}

## Klasifikasi kasus (n=${klasifikasi.kasus_agent.n})
| Sistem | Akurasi | Macro precision | Macro recall | Macro F1 |
|---|---|---|---|---|
| AI agent (NLU) | ${pct(klasifikasi.kasus_agent.accuracy)} | ${pct(klasifikasi.kasus_agent.macro_precision)} | ${pct(klasifikasi.kasus_agent.macro_recall)} | ${pct(klasifikasi.kasus_agent.macro_f1)} |
| Chatbot template | ${pct(klasifikasi.kasus_baseline.accuracy)} | ${pct(klasifikasi.kasus_baseline.macro_precision)} | ${pct(klasifikasi.kasus_baseline.macro_recall)} | ${pct(klasifikasi.kasus_baseline.macro_f1)} |

## Klasifikasi emosi (agent)
Akurasi ${pct(klasifikasi.emosi_agent.accuracy)}, macro F1 ${pct(klasifikasi.emosi_agent.macro_f1)}

## Skenario end-to-end (n=${A.skenario})
| Metrik | AI agent | Chatbot template |
|---|---|---|
| Tingkat penyelesaian di dalam chat | ${pct(A.tingkat_penyelesaian)} | ${pct(B.tingkat_penyelesaian)} |
| Pemenuhan aksi sesuai SOP | ${pct(A.pemenuhan_aksi_sop)} | ${pct(B.pemenuhan_aksi_sop)} |
| Balasan memuat informasi spesifik (ID/nominal) | ${pct(A.info_spesifik)} | ${pct(B.info_spesifik)} |
| Tingkat pengalihan ke halaman lain | ${pct(A.tingkat_pengalihan)} | ${pct(B.tingkat_pengalihan)} |
| Eskalasi tepat kasus P1 | ${pct(A.eskalasi_p1_tepat)} | ${pct(B.eskalasi_p1_tepat)} |
| Rata-rata waktu proses (ms) | ${A.rata_latensi_ms.toFixed(1)} | - |

## Detail per skenario (agent)
| ID | Kasus | Tuntas | Aksi | Tools |
|---|---|---|---|---|
${hasilAgent.map((r) => `| ${r.id} | ${r.kasus} | ${r.tuntas ? "Ya" : "Tidak"} | ${r.aksi_terpenuhi}/${r.aksi_dibutuhkan} | ${r.tools.join(", ")} |`).join("\n")}

## Kesalahan klasifikasi agent
${klasifikasi.salah_klasifikasi_agent.map((d) => `- "${d.teks}" → kasus ${d.prediksi} (benar: ${d.kasus}), emosi ${d.prediksi_emosi} (benar: ${d.emosi})`).join("\n") || "-"}
`;
fs.writeFileSync(path.join(DIR, "hasil-evaluasi.md"), md);
console.log(md);
