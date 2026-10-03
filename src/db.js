// Database sederhana berbasis file JSON.
// - data/*.json   = data awal (seed), tidak pernah diubah oleh program
// - runtime/db.json = salinan yang bisa berubah (saldo, tiket, status pesanan, dst.)
// Tombol "Reset Database" di simulator mengembalikan runtime ke kondisi seed.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SEED_DIR = path.join(ROOT, "data");
const RUNTIME_DIR = path.join(ROOT, "runtime");
const RUNTIME_FILE = path.join(RUNTIME_DIR, "db.json");

const TABLES = ["users", "drivers", "merchants", "orders", "transactions", "knowledge_base", "policies"];

let db = null;

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

// Data seed menyimpan waktu sebagai "menit_lalu" supaya simulasi selalu terasa "baru saja terjadi".
// Saat seed dimuat, kolom *_menit_lalu diubah menjadi timestamp ISO nyata.
function hydrateTimes(obj, now) {
  if (Array.isArray(obj)) return obj.forEach((o) => hydrateTimes(o, now));
  if (!obj || typeof obj !== "object") return;
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (key.endsWith("menit_lalu") && typeof val === "number" && !key.startsWith("akun_dibuat")) {
      const base = key === "menit_lalu" ? "waktu" : key.replace(/_?menit_lalu$/, "") + "_pada";
      obj[base] = new Date(now - val * 60000).toISOString();
    } else if (typeof val === "object") {
      hydrateTimes(val, now);
    }
  }
}

export function resetDb() {
  const now = Date.now();
  db = { tickets: [], vouchers: [], audit_log: [], seeded_at: new Date(now).toISOString() };
  for (const t of TABLES) db[t] = readJson(path.join(SEED_DIR, `${t}.json`));
  for (const t of ["orders", "transactions"]) hydrateTimes(db[t], now);
  save();
  return db;
}

export function loadDb() {
  if (db) return db;
  try {
    db = readJson(RUNTIME_FILE);
  } catch {
    resetDb();
  }
  return db;
}

export function save() {
  fs.mkdirSync(RUNTIME_DIR, { recursive: true });
  fs.writeFileSync(RUNTIME_FILE, JSON.stringify(db, null, 2));
}

export function getDb() {
  return loadDb();
}

export function audit(action, detail) {
  loadDb().audit_log.push({ waktu: new Date().toISOString(), action, ...detail });
  save();
}

// Helper format
export const rupiah = (n) => "Rp" + Number(n || 0).toLocaleString("id-ID");

export function minutesAgo(iso) {
  if (!iso) return null;
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
}

export function jam(iso) {
  if (!iso) return "-";
  return new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });
}

export function nextId(prefix, list) {
  return `${prefix}-${String(list.length + 1).padStart(4, "0")}${Math.floor(Math.random() * 90 + 10)}`;
}
