# -*- coding: utf-8 -*-
"""
Hitung skor System Usability Scale (SUS), CSAT, dan profil responden dari CSV ekspor Google Form.

Pemakaian:
    python penelitian/hitung_sus.py                       # baca penelitian/hasil/jawaban_kuesioner.csv
    python penelitian/hitung_sus.py path/ke/file.csv

Kolom dikenali dari awalan judul pertanyaan: P1..P6, SUS1..SUS10, CSAT, H1..H4 (lihat kuesioner.md).
Rumus SUS per responden: 2,5 x [ sum(skor butir ganjil - 1) + sum(5 - skor butir genap) ]
"""
import csv, os, re, sys, statistics
from collections import Counter

DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "hasil")
path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(DIR, "jawaban_kuesioner.csv")
rows = list(csv.DictReader(open(path, encoding="utf-8-sig")))
if not rows:
    sys.exit("File kosong: " + path)

def kolom(kode):
    for c in rows[0].keys():
        if re.match(r"^\s*%s\b[.:)\s]" % re.escape(kode), c + " ", re.I):
            return c
    return None

def angka(v):
    m = re.search(r"[1-5]", str(v))
    return int(m.group(0)) if m else None

sus_cols = [kolom("SUS%d" % i) for i in range(1, 11)]
if None in sus_cols:
    sys.exit("Kolom SUS tidak lengkap. Pastikan judul pertanyaan diawali SUS1. sampai SUS10. Ditemukan: %s" % sus_cols)

skor, dibuang = [], 0
for r in rows:
    v = [angka(r[c]) for c in sus_cols]
    if None in v:
        dibuang += 1
        continue
    skor.append(2.5 * (sum(v[i] - 1 for i in range(0, 10, 2)) + sum(5 - v[i] for i in range(1, 10, 2))))

def grade(s):  # skala grade & penerimaan yang umum dipakai pada penelitian SUS
    g = "A" if s >= 80.3 else "B" if s >= 74 else "C" if s >= 68 else "D" if s >= 51 else "F"
    terima = "Acceptable" if s > 70 else "Marginal" if s >= 50 else "Not acceptable"
    adj = "Excellent" if s >= 80.3 else "Good" if s >= 68 else "OK" if s >= 51 else "Poor"
    return g, terima, adj

def rata(kode):
    c = kolom(kode)
    if not c: return None
    v = [angka(r[c]) for r in rows if angka(r[c])]
    return (statistics.mean(v), len(v)) if v else None

n = len(skor)
mean = statistics.mean(skor)
sd = statistics.stdev(skor) if n > 1 else 0
g, terima, adj = grade(mean)
out = [f"# Hasil Evaluasi Pengguna", "", f"- File: `{os.path.basename(path)}`",
       f"- Responden valid: **{n}**" + (f" ({dibuang} jawaban tidak lengkap dibuang)" if dibuang else ""),
       f"- Rata-rata skor SUS: **{mean:.1f}** (SD {sd:.1f}, min {min(skor):.1f}, maks {max(skor):.1f})",
       f"- Grade: **{g}** | adjective rating: **{adj}** | tingkat penerimaan: **{terima}**", ""]

out += ["## Skor tambahan (skala 1–5)", "", "| Kode | Rata-rata | n |", "|---|---|---|"]
for k in ["CSAT", "H1", "H2", "H3", "H4", "P6"]:
    r = rata(k)
    if r: out.append(f"| {k} | {r[0]:.2f} | {r[1]} |")

out += ["", "## Profil responden", ""]
for k in ["P1", "P2", "P3", "P4", "P5"]:
    c = kolom(k)
    if not c: continue
    cnt = Counter(r[c].strip() or "(kosong)" for r in rows)
    out.append(f"**{c.strip()}**: " + ", ".join(f"{a} {b} ({100*b/len(rows):.0f}%)" for a, b in cnt.most_common()))
    out.append("")

csat = rata("CSAT"); p6 = rata("P6")
out += ["## Isian untuk Tabel 6 artikel", "", "| Keterangan | Nilai |", "|---|---|",
        f"| Jumlah responden | {n} |", f"| Rata-rata skor SUS | {mean:.1f} |", f"| Kategori / grade | {adj} / {g} ({terima}) |",
        f"| Rata-rata CSAT (1–5) | {csat[0]:.2f} |" if csat else "| Rata-rata CSAT (1–5) | - |", "",
        "## Kalimat siap pakai", "",
        f"> Evaluasi kegunaan melibatkan {n} responden. Skor SUS rata-rata sebesar {mean:.1f} (SD {sd:.1f}) yang termasuk kategori "
        f"*{adj}* dengan grade {g} dan tingkat penerimaan *{terima}*."
        + (f" Rata-rata kepuasan (CSAT) terhadap penyelesaian masalah sebesar {csat[0]:.2f} dari 5" if csat else "")
        + (f", dibandingkan {p6[0]:.2f} dari 5 untuk pengalaman responden dengan layanan CS yang pernah mereka gunakan." if csat and p6 else "." if csat else "")]
os.makedirs(DIR, exist_ok=True)
open(os.path.join(DIR, "ringkasan_sus.md"), "w", encoding="utf-8").write("\n".join(out) + "\n")
print("\n".join(out))
