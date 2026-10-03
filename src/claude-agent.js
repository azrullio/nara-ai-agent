// =====================================================================
//  MODE CLAUDE (pakai ANTHROPIC_API_KEY)
//  Loop agent: Claude membaca pesan -> memutuskan tool apa yang dipanggil
//  -> kita jalankan tool ke database -> hasil dikirim balik -> ulang
//  sampai Claude selesai menulis balasan.
// =====================================================================
import { SYSTEM_PROMPT, contextNote } from "./prompt.js";
import { toolDefinitions, runTool } from "./tools.js";

let client = null;

export async function claudeAvailable() {
  if (!process.env.ANTHROPIC_API_KEY) return false;
  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    client ??= new Anthropic();
    return true;
  } catch {
    return false; // SDK belum di-install (npm install)
  }
}

const MODEL = () => process.env.CLAUDE_MODEL || "claude-opus-5-5";
const MAX_LANGKAH = 8;

export async function runClaude({ user, text, session, nlu, trace }) {
  // Memori percakapan: riwayat pesan disimpan per pengguna (append-only).
  session.messages ??= [];
  session.messages.push({
    role: "user",
    content: [
      { type: "text", text: contextNote({ user, nlu }) },
      { type: "text", text },
    ],
  });

  for (let langkah = 0; langkah < MAX_LANGKAH; langkah++) {
    const t0 = Date.now();
    // Haiku tidak mendukung parameter effort & fallbacks, jadi hanya dikirim untuk Opus/Sonnet.
    const modern = !MODEL().startsWith("claude-haiku");
    const response = await client.beta.messages.create({
      model: MODEL(),
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      tools: toolDefinitions(),
      messages: session.messages,
      cache_control: { type: "ephemeral" },
      ...(modern && {
        output_config: { effort: process.env.CLAUDE_EFFORT || "medium" },
        // Jika permintaan ditolak safety classifier, API otomatis mencoba model cadangan.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      }),
    });

    const toolUses = response.content.filter((b) => b.type === "tool_use");
    trace.push({
      type: "llm",
      nodes: ["llm", "agent"],
      model: response.model,
      stop_reason: response.stop_reason,
      tool_dipanggil: toolUses.map((t) => t.name),
      token: { input: response.usage.input_tokens, output: response.usage.output_tokens, cache_read: response.usage.cache_read_input_tokens },
      ms: Date.now() - t0,
    });

    // Simpan balasan apa adanya (termasuk blok thinking) agar riwayat tetap valid.
    session.messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason === "refusal") {
      return { reply: ["Maaf, untuk hal ini aku sambungkan ke rekan manusiaku ya supaya ditangani dengan tepat 🙏"], kasus: nlu.kasus };
    }
    if (response.stop_reason === "pause_turn") continue;
    if (response.stop_reason !== "tool_use") {
      const out = response.content.filter((b) => b.type === "text").map((b) => b.text).join("\n\n").trim();
      return { reply: [out || "Maaf, aku belum bisa menjawab itu. Boleh diulang?"], kasus: nlu.kasus };
    }

    // Jalankan semua tool, kembalikan semua hasil dalam SATU pesan user.
    const results = [];
    for (const tu of toolUses) {
      const output = await runTool(tu.name, tu.input, trace);
      results.push({ type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(output), is_error: output?.ok === false && !!output?.error });
    }
    session.messages.push({ role: "user", content: results });
  }
  return { reply: ["Maaf ya, ini butuh pengecekan lebih lanjut. Aku teruskan ke tim manusia supaya cepat beres 🙏"], kasus: nlu.kasus };
}
