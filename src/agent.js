// =====================================================================
//  ORKESTRATOR — urutan persis seperti diagram flow:
//  INPUT (pesan masuk, tanda dibaca, mengetik) -> PARSING (normalisasi,
//  emosi & intent) -> OTAK AI (memori + LLM/aturan + tools/database/aksi)
//  -> OUTPUT (humanizer: pecah bubble, jeda mengetik, kirim)
// =====================================================================
import { analyze } from "./nlu.js";
import { runOffline } from "./offline-agent.js";
import { claudeAvailable, runClaude } from "./claude-agent.js";
import { getDb } from "./db.js";

const sessions = new Map(); // memori per pengguna (node "Memori Sesi")

export function resetSessions() {
  sessions.clear();
}

// Pecah teks jadi bubble chat & hitung jeda "mengetik" yang natural
export function humanize(replies) {
  const bubbles = replies
    .flatMap((r) => String(r).split(/\n\s*\n/))
    .map((s) => s.replace(/\*\*(.+?)\*\*/g, "$1").trim())
    .filter(Boolean)
    .slice(0, 6);
  return bubbles.map((text) => ({ text, typing_ms: Math.min(2600, 500 + text.length * 18) }));
}

export async function handleMessage({ userId, text, engine = "auto" }) {
  const user = getDb().users.find((u) => u.id === userId);
  if (!user) throw new Error("User tidak ditemukan: " + userId);

  const trace = [];
  const t0 = Date.now();
  trace.push({ type: "input", nodes: ["wa_in"], detail: { dari: user.telepon, pesan: text } });
  trace.push({ type: "input", nodes: ["send_seen"], detail: "Centang biru ✓✓" });
  trace.push({ type: "input", nodes: ["typing"], detail: "Nara sedang mengetik..." });

  const session = sessions.get(userId) || { history: [] };
  sessions.set(userId, session);
  session.history.push({ role: "user", text, at: Date.now() });

  const nlu = analyze(text, session);
  trace.push({ type: "parse", nodes: ["normalize"], detail: { normal: nlu.normal } });
  trace.push({ type: "parse", nodes: ["intent"], detail: { kasus: nlu.kasus, skor: nlu.skor, emosi: nlu.emosi, entitas: nlu.entitas, kata_kunci: nlu.kata_kunci } });
  trace.push({ type: "memory", nodes: ["memory", "agent"], detail: { pesan_sebelumnya: session.history.length - 1, langkah_aktif: session.state ? `${session.state.kasus}/${session.state.step}` : null } });

  const useClaude = engine === "claude" || (engine === "auto" && (await claudeAvailable()));
  if (engine === "claude" && !(await claudeAvailable())) throw new Error("Mode Claude butuh ANTHROPIC_API_KEY di .env dan `npm install`");

  let result;
  try {
    result = useClaude ? await runClaude({ user, text, session, nlu, trace }) : await runOffline({ user, text, session, nlu, trace });
  } catch (e) {
    console.error(e);
    trace.push({ type: "error", nodes: ["agent"], detail: e.message });
    result = { reply: ["Aduh, sistemku lagi tersendat sebentar 🙏 Coba kirim ulang pesannya ya, atau aku sambungkan ke tim manusia kalau mendesak."], kasus: nlu.kasus };
  }

  const bubbles = humanize(result.reply);
  session.history.push({ role: "assistant", text: bubbles.map((b) => b.text).join("\n"), at: Date.now() });
  trace.push({ type: "output", nodes: ["humanize"], detail: { jumlah_bubble: bubbles.length } });
  trace.push({ type: "output", nodes: ["delay"], detail: { total_jeda_ms: bubbles.reduce((a, b) => a + b.typing_ms, 0) } });
  trace.push({ type: "output", nodes: ["wa_out"], detail: { terkirim: bubbles.length } });

  return { engine: useClaude ? "claude" : "offline", kasus: result.kasus, emosi: nlu.emosi, bubbles, trace, ms: Date.now() - t0 };
}
