# -*- coding: utf-8 -*-
"""
STUDI PENDAHULUAN: ambil ulasan aplikasi dari Google Play Store, saring ulasan yang membahas
layanan bantuan / customer service, lalu beri label awal otomatis.

Pemakaian:
    python -m pip install google-play-scraper
    python penelitian/scrape_ulasan.py --jumlah 5000
    python penelitian/scrape_ulasan.py --pakai-label-manual --folder "D:/folder/studi_pendahuluan"

Hasil (folder penelitian/hasil/):
    ulasan_semua.csv        semua ulasan yang diambil
    ulasan_cs.csv           ulasan yang membahas CS + label otomatis + kolom label_manual (untuk dicek)
    ringkasan.md            statistik siap dikutip di artikel

PENTING: label otomatis hanya berbasis kata kunci. Untuk artikel, cek ulang ulasan_cs.csv secara manual
(isi kolom label_manual) lalu jalankan lagi dengan --pakai-label-manual.
"""
import argparse, csv, os, re, sys
from collections import Counter
from datetime import datetime

DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "hasil")

# Ulasan dianggap membahas customer service jika memuat salah satu pola ini
POLA_CS = r"\b(cs|customer service|customer care|layanan pelanggan|pusat bantuan|bantuan|help ?center|chat ?bot|chatbot|bot|komplain|komplen|lapor(an)?|pengaduan|admin)\b"

# Jenis masalah pada layanan CS (satu ulasan bisa lebih dari satu)
MASALAH_CS = {
    "jawaban_template": r"(template|templet|jawaban (yang )?sama|copas|copy paste|bot|robot|otomatis|balasan otomatis|jawabannya itu itu)",
    "dialihkan_dilempar": r"(dilempar|lempar|diarahkan|dialihkan|muter|mutar|disuruh (ke|buka|cek|isi)|ga nyambung|gak nyambung|nggak nyambung|tidak nyambung|pusat bantuan)",
    "tidak_ada_solusi": r"(tidak ada solusi|ga ada solusi|gak ada solusi|nggak ada solusi|tanpa solusi|tidak (di)?selesaikan|ga (di)?selesaiin|belum selesai|tidak terselesaikan|ga beres|gak beres|tidak membantu|ga membantu|gak membantu|nggak membantu|percuma)",
    "lambat_tidak_direspon": r"(lama|lambat|tidak (di)?respon|ga (di)?respon|gak (di)?respon|tidak dibalas|ga dibales|gak dibales|nunggu|3x24|3 x 24|berhari)",
    "sulit_dihubungi": r"(susah (dihubungi|menghubungi|cari)|sulit (dihubungi|menghubungi)|ga bisa (hubungi|chat|telp|telepon)|gak bisa (hubungi|chat)|tidak ada (nomor|kontak|telepon)|ga ada (nomor|kontak|cs))",
}
# Topik kasus yang dikeluhkan
TOPIK = {
    "saldo_topup": r"(top ?up|saldo|isi ulang|gopay)",
    "refund": r"(refund|pengembalian dana|uang (ga|gak|tidak|belum) (balik|kembali))",
    "akun_keamanan": r"(akun|diretas|hack|dibobol|otp|penipu|terblokir|diblokir)",
    "driver": r"(driver|abang|ojol|mitra|pengemudi)",
    "makanan_merchant": r"(gofood|makanan|resto|merchant|pesanan)",
    "paket": r"(gosend|paket|kiriman)",
    "tarif_promo": r"(tarif|mahal|promo|voucher|diskon)",
}

def label(text, pola):
    t = text.lower()
    return [k for k, r in pola.items() if re.search(r, t)]

def ambil(app_id, jumlah, lang, country):
    from google_play_scraper import reviews, Sort
    hasil, token = [], None
    while len(hasil) < jumlah:
        batch, token = reviews(app_id, lang=lang, country=country, sort=Sort.NEWEST,
                               count=min(200, jumlah - len(hasil)), continuation_token=token)
        if not batch: break
        hasil.extend(batch)
        print(f"  diambil {len(hasil)} ulasan...", file=sys.stderr)
        if token is None: break
    return hasil

def tulis_csv(path, rows, kolom):
    with open(path, "w", newline="", encoding="utf-8-sig") as f:  # utf-8-sig agar rapi dibuka di Excel
        w = csv.DictWriter(f, fieldnames=kolom, extrasaction="ignore")
        w.writeheader(); w.writerows(rows)

def main():
    global DIR
    ap = argparse.ArgumentParser()
    ap.add_argument("--app", default="com.gojek.app", help="ID aplikasi di Play Store")
    ap.add_argument("--jumlah", type=int, default=5000)
    ap.add_argument("--lang", default="id"); ap.add_argument("--country", default="id")
    ap.add_argument("--pakai-label-manual", action="store_true", help="hitung ulang ringkasan dari kolom label_manual di ulasan_cs.csv")
    ap.add_argument("--folder", default=DIR, help="folder tempat file CSV hasil disimpan/dibaca")
    a = ap.parse_args()
    DIR = a.folder
    os.makedirs(DIR, exist_ok=True)
    p_semua, p_cs = os.path.join(DIR, "ulasan_semua.csv"), os.path.join(DIR, "ulasan_cs.csv")

    if a.pakai_label_manual:
        semua = list(csv.DictReader(open(p_semua, encoding="utf-8-sig")))
        cs = list(csv.DictReader(open(p_cs, encoding="utf-8-sig")))
        terverifikasi = sum(1 for r in cs if r.get("label_manual", "").strip() or r.get("relevan_manual", "").strip())
        if terverifikasi == 0:
            print("PERINGATAN: kolom relevan_manual/label_manual di ulasan_cs.csv masih kosong semua. "
                  "Isi dulu di Excel, simpan, lalu jalankan lagi.", file=sys.stderr)
        for r in cs:
            if r.get("label_manual", "").strip():
                r["masalah_cs"] = r["label_manual"].strip()
        cs = [r for r in cs if r.get("relevan_manual", "ya").strip().lower() != "tidak"]
    else:
        print(f"Mengambil {a.jumlah} ulasan terbaru {a.app} ...", file=sys.stderr)
        raw = ambil(a.app, a.jumlah, a.lang, a.country)
        semua = [{
            "tanggal": r["at"].strftime("%Y-%m-%d"), "bintang": r["score"], "ulasan": (r["content"] or "").replace("\n", " "),
            "jumlah_suka": r.get("thumbsUpCount", 0), "versi_aplikasi": r.get("reviewCreatedVersion") or "",
        } for r in raw]  # nama pengulas sengaja TIDAK disimpan (privasi)
        tulis_csv(p_semua, semua, ["tanggal", "bintang", "jumlah_suka", "versi_aplikasi", "ulasan"])
        cs = []
        for r in semua:
            if re.search(POLA_CS, r["ulasan"].lower()):
                cs.append({**r, "masalah_cs": ";".join(label(r["ulasan"], MASALAH_CS)) or "lainnya",
                           "topik": ";".join(label(r["ulasan"], TOPIK)) or "lainnya", "relevan_manual": "", "label_manual": ""})
        tulis_csv(p_cs, cs, ["tanggal", "bintang", "jumlah_suka", "topik", "masalah_cs", "relevan_manual", "label_manual", "ulasan"])

    n, ncs = len(semua), len(cs)
    tgl = sorted(r["tanggal"] for r in semua)
    bintang_cs = Counter(int(r["bintang"]) for r in cs)
    negatif = sum(v for k, v in bintang_cs.items() if k <= 2)
    masalah = Counter(m for r in cs for m in r["masalah_cs"].split(";") if m)
    topik = Counter(t for r in cs for t in r["topik"].split(";") if t)
    pct = lambda x, d: f"{(100 * x / d if d else 0):.1f}%"

    md = [f"# Ringkasan Studi Pendahuluan ({datetime.now():%Y-%m-%d})", "",
          f"- Aplikasi: `{a.app}`, sumber: Google Play Store, bahasa/negara: {a.lang}/{a.country}",
          f"- Rentang tanggal ulasan: {tgl[0] if tgl else '-'} s.d. {tgl[-1] if tgl else '-'}",
          f"- Total ulasan dianalisis: **{n}**",
          f"- Ulasan yang membahas layanan bantuan/CS: **{ncs}** ({pct(ncs, n)})",
          f"- Dari ulasan CS tersebut, bintang 1-2 (negatif): **{negatif}** ({pct(negatif, ncs)})",
          f"- Label: " + (f"diverifikasi manual pada {terverifikasi} baris, sisanya label otomatis" if a.pakai_label_manual else "OTOMATIS berbasis kata kunci (BELUM diverifikasi manual)"),
          "", "## Jenis masalah layanan CS (satu ulasan bisa >1 label)", "", "| Masalah | Jumlah | % dari ulasan CS |", "|---|---|---|"]
    md += [f"| {k} | {v} | {pct(v, ncs)} |" for k, v in masalah.most_common()]
    md += ["", "## Topik kasus yang dikeluhkan", "", "| Topik | Jumlah | % dari ulasan CS |", "|---|---|---|"]
    md += [f"| {k} | {v} | {pct(v, ncs)} |" for k, v in topik.most_common()]
    tak_tuntas = sum(1 for r in cs if any(m in r["masalah_cs"] for m in ["jawaban_template", "dialihkan_dilempar", "tidak_ada_solusi"]))
    md += ["", "## Kalimat siap pakai untuk Pendahuluan", "",
           f"> Studi pendahuluan terhadap {n} ulasan terbaru aplikasi pada Google Play Store (periode {tgl[0] if tgl else '-'} hingga "
           f"{tgl[-1] if tgl else '-'}) menemukan {ncs} ulasan ({pct(ncs, n)}) yang membahas layanan bantuan. Sebanyak {negatif} di antaranya "
           f"({pct(negatif, ncs)}) memberikan bintang 1-2, dan {tak_tuntas} ulasan ({pct(tak_tuntas, ncs)}) secara spesifik mengeluhkan "
           f"jawaban templat, pengalihan ke halaman lain, atau masalah yang tidak terselesaikan."]
    open(os.path.join(DIR, "ringkasan.md"), "w", encoding="utf-8").write("\n".join(md) + "\n")
    print("\n".join(md))

if __name__ == "__main__":
    main()
