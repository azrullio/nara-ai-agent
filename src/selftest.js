// Uji cepat semua skenario di mode offline:  npm test
import { resetDb } from "./db.js";
import { handleMessage, resetSessions } from "./agent.js";

const SKENARIO = [
  ["U001", ["halo kak", "top up 100rb aku dari tadi ga masuk2 nih, gimana sih"]],
  ["U001", ["min gofood aku lama bgt udah sejam belum dateng, laper nih", "batalin aja deh"]],
  ["U001", ["kemarin drivernya ga sopan", "dia ngebut terus pas aku tegur malah marah-marah dan bentak aku"]],
  ["U002", ["topup aku gagal tapi saldo rekening kepotong 50rb", "masukin ke saldo gopay aja"]],
  ["U002", ["saldo top up alfamart kok kepotong dua kali ya, belum masuk", "iya boleh"]],
  ["U003", ["TOLONG SALDO SAYA HILANG, ADA TRANSFER YANG BUKAN SAYA!!!"]],
  ["U003", ["paket gosend aku isinya hp ga sampai ke adik aku, kayaknya dicuri"]],
  ["U004", ["pesanan gofood aku kurang, es teh nya gak ada"]],
  ["U004", ["kok tarif gocar aku jadi lebih mahal dari estimasi"]],
  ["U004", ["dompet aku ketinggalan di gocar tadi", "iya tolong"]],
  ["U005", ["aku tadi dilecehkan sama driver gocar", "udah aman di rumah"]],
  ["M001", ["min saya kena order fiktif, udah nalangin martabak 245rb customernya ga bisa dihubungi"]],
  ["U001", ["wkwk makasih ya nara"]],
  ["U001", ["lagi capek banget hari ini"]],
  ["U002", ["mau bicara sama cs manusia aja"]],
];

resetDb();
resetSessions();
let gagal = 0;
for (const [userId, pesan] of SKENARIO) {
  console.log(`\n================ ${userId}`);
  for (const text of pesan) {
    const r = await handleMessage({ userId, text, engine: "offline" });
    const tools = r.trace.filter((t) => t.type === "tool").map((t) => t.tool);
    console.log(`👤 ${text}\n   [kasus=${r.kasus} emosi=${r.emosi} tools=${tools.join(",") || "-"}]`);
    for (const b of r.bubbles) console.log("   🤖 " + b.text.replace(/\n/g, "\n      "));
    if (r.trace.some((t) => t.type === "error" || t.output?.error)) { gagal++; console.log("   ❌ ERROR", JSON.stringify(r.trace.filter((t) => t.type === "error" || t.output?.error))); }
  }
}
resetDb();
console.log(gagal ? `\n❌ ${gagal} error` : "\n✅ Semua skenario jalan tanpa error");
process.exit(gagal ? 1 : 0);
