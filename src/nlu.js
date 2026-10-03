// =====================================================================
//  NLU (Natural Language Understanding) ringan = node "PARSING" di flow.
//  1. normalisasi bahasa gaul  2. deteksi emosi  3. deteksi intent/kasus
//  4. ambil entitas (no. pesanan, nominal, nama item)
//  Dipakai oleh mode offline, dan hasilnya juga dikirim sebagai "petunjuk"
//  ke LLM di mode Claude.
// =====================================================================
import { getDb } from "./db.js";

const SLANG = {
  gk: "gak", ga: "gak", g: "gak", ngga: "nggak", tdk: "tidak", gmn: "gimana", gmna: "gimana", knp: "kenapa", kpn: "kapan",
  udh: "udah", udah: "udah", sdh: "sudah", blm: "belum", blum: "belum", bgt: "banget", bngt: "banget", yg: "yang", dgn: "dengan",
  sy: "saya", aq: "aku", ak: "aku", gw: "gue", gue: "gue", lu: "lu", tp: "tapi", tpi: "tapi", krn: "karena", karna: "karena",
  org: "orang", jg: "juga", aja: "aja", aj: "aja", sm: "sama", trs: "terus", trus: "terus", lg: "lagi", dr: "dari", utk: "untuk",
  bs: "bisa", bsa: "bisa", tlg: "tolong", tolongin: "tolong", mksh: "makasih", makasi: "makasih", thx: "makasih", thanks: "makasih",
  duit: "uang", topap: "top up", "top-up": "top up", tf: "transfer", trf: "transfer", ojol: "driver", abang: "driver", bang: "bang",
  rb: "ribu", k: "ribu", jt: "juta", cs: "cs", mas: "mas", dpt: "dapat", dapet: "dapat", ilang: "hilang", nyampe: "sampai", nyampe2: "sampai",
  sampe: "sampai", lom: "belum", dateng: "datang", makan: "makan", laper: "lapar", pesenan: "pesanan", pesen: "pesan", order: "order",
};

export function normalize(text) {
  const lower = String(text || "").toLowerCase().replace(/\s+/g, " ").trim();
  const words = lower.split(" ").map((w) => {
    const m = w.match(/^([a-z0-9-]+)([^a-z0-9-]*)$/);
    if (!m) return w;
    return (SLANG[m[1]] ?? m[1]) + m[2];
  });
  // gabungkan kata berulang "lama2" -> "lama lama"
  return words.join(" ").replace(/([a-z]+)2\b/g, "$1 $1");
}

const MOOD_RULES = [
  { mood: "darurat", re: /(tolong+ (aku|saya)|takut banget|diikuti|diancam|dilecehkan|pelecehan|kecelakaan|berdarah|dipukul|diculik|dikunci)/ },
  { mood: "panik", re: /(saldo (aku|saya)? ?(hilang|habis|berkurang)|diretas|dibobol|kebobolan|dicuri|bukan (aku|saya)|panik|gimana ini|mati aku|duh gimana)/ },
  { mood: "marah", re: /(anjir|anjing|bangsat|goblok|bodoh|tolol|parah|kecewa|kesel|kesal|muak|payah|ngeselin|nyebelin|sialan|brengsek|gila ya|zonk|lapor polisi|viral|jelek banget|gak becus|ga becus|nggak becus|!!{2,}|\?\?{2,})/ },
  { mood: "sedih", re: /(sedih|nangis|capek banget|cape banget|lelah|stres|stress|sakit hati|kecewa banget|huhu|hiks|:\(|😢|😭)/ },
  { mood: "santai", re: /(wkwk|haha|hehe|xixi|awokawok|lol|😂|🤣|😆|santai|gpp|gapapa)/ },
];

export function detectMood(raw) {
  const t = normalize(raw);
  const capsRatio = (raw.match(/[A-Z]/g) || []).length / Math.max(1, (raw.match(/[a-zA-Z]/g) || []).length);
  for (const r of MOOD_RULES) if (r.re.test(t)) return r.mood;
  if (capsRatio > 0.6 && raw.length > 8) return "marah";
  return "netral";
}

// Intent tambahan non-kasus (obrolan)
const SMALLTALK = [
  { id: "SAPAAN", re: /^(halo+|hai+|hallo+|hi+|hey|p+|pagi|siang|sore|malam|assalamualaikum|permisi|min|kak)\b[\s!.,?]*([a-z]+)?[\s!.,?]*$/ },
  { id: "TERIMA_KASIH", re: /(makasih|terima kasih|terimakasih|thank|mantap|keren|membantu banget|sip)/ },
  { id: "PAMIT", re: /^((udah|sudah|cukup|dah)( (ya|dulu|itu aja|segitu|aja|kok|min|kak))+|itu aja|itu saja|bye|dadah)[ !.]*$/ },
  { id: "CURHAT", re: /(capek|cape|lelah|stres|stress|sedih|bete|galau|kesepian|hari ini berat|lagi down|pusing)/ },
  { id: "BERCANDA", re: /^(wkwk+|haha+|hehe+|xixi+|awok)/ },
  { id: "SIAPA_KAMU", re: /(kamu siapa|siapa kamu|kamu (robot|bot|ai|manusia)|ini bot|ini robot)/ },
];

export function detectIntent(raw, session = {}) {
  const t = normalize(raw);
  const kb = getDb().knowledge_base;
  let best = null;
  for (const c of kb) {
    let score = 0;
    const hits = [];
    for (const k of c.kata_kunci) {
      if (t.includes(k)) {
        score += k.split(" ").length + (k.length > 8 ? 1 : 0);
        hits.push(k);
      }
    }
    // Penguat konteks
    if (c.id === "TOPUP_TIDAK_MASUK" && /top ?up|isi saldo|va\b/.test(t)) score += 3;
    if (c.id === "FOOD_TERLAMBAT" && /(gofood|makanan|pesanan|resto|bakso|order)/.test(t) && /(lama|belum|telat|nunggu)/.test(t)) score += 3;
    if (c.id === "FOOD_SALAH_KURANG" && /(gofood|pesanan|makanan|es teh|minuman|item|menu)/.test(t) && /(kurang|gak ada|nggak ada|tidak ada|salah)/.test(t)) score += 3;
    if (c.id === "PENCURIAN_PAKET_HILANG" && /(paket|gosend|kiriman|barang)/.test(t) && /(hilang|dicuri|gak sampai|belum diterima|tidak sampai|nggak sampai)/.test(t)) score += 4;
    if (c.id === "AKUN_DIRETAS" && /saldo/.test(t) && /(hilang|berkurang|habis|kesedot|kesedot)/.test(t)) score += 3;
    if (c.id === "BARANG_TERTINGGAL" && /(ketinggalan|tertinggal)/.test(t) && /(mobil|motor|gocar|goride|jok|driver)/.test(t)) score += 4;
    if (c.id === "TARIF_TIDAK_SESUAI" && /(gocar|goride|perjalanan)/.test(t) && /(mahal|beda|lebih)/.test(t)) score += 2;
    if (c.id === "DRIVER_TIDAK_SOPAN" && /(driver|abang|bapak|mas)/.test(t)) score += hits.length ? 2 : 0;
    if (c.id === "PELECEHAN" && hits.length) score += 4; // keselamatan selalu menang
    if (c.id === "ORDER_FIKTIF" && /mitra|customer|pelanggan|nalangin|talangan|nombok/.test(t)) score += 2;
    if (score > 0 && (!best || score > best.score)) best = { id: c.id, score, hits };
  }
  // Mitra driver yang bilang "order bukan aku" bukan kasus akun diretas
  if (best && best.score >= 2) return { kasus: best.id, skor: best.score, kata_kunci: best.hits, normal: t };
  for (const s of SMALLTALK) if (s.re.test(t)) return { kasus: s.id, skor: 1, kata_kunci: [], normal: t };
  if (best) return { kasus: best.id, skor: best.score, kata_kunci: best.hits, normal: t };
  return { kasus: null, skor: 0, kata_kunci: [], normal: t };
}

export function extractEntities(raw) {
  const t = normalize(raw);
  const orderId = (raw.match(/\b(G[FRCS]|TP|TRF|PAY)-?\d{4,6}\b/i) || [])[0];
  let nominal = null;
  const m = t.match(/(\d+(?:[.,]\d+)?)\s*(ribu|juta|rb|k|jt)?\b/);
  if (m) {
    const n = parseFloat(m[1].replace(/\.(?=\d{3})/g, "").replace(",", "."));
    nominal = m[2] === "juta" || m[2] === "jt" ? n * 1e6 : m[2] ? n * 1000 : n >= 1000 ? n : null;
  }
  const ya = /^(ya+|iya+|yes|boleh|oke+|ok+|okay|sip|gas|lanjut|setuju|mau|bener|betul|benar|y)\b/.test(t);
  const tidak = /^(tidak|nggak|gak|enggak|jangan|no|ga usah|gak usah|nggak usah|engga)\b/.test(t);
  return { order_id: orderId ? orderId.toUpperCase().replace(/^([A-Z]+)(\d)/, "$1-$2") : null, nominal, ya, tidak };
}

export function analyze(raw, session) {
  return { teks_asli: raw, ...detectIntent(raw, session), emosi: detectMood(raw), entitas: extractEntities(raw) };
}
