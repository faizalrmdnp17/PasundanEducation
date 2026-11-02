"use strict";
/* API admin (khusus akun berperan Admin). Menggantikan admin.php; antarmukanya ada di /admin. */
const c = require("../lib/core");
const seed = require("../lib/seed.json");
const STATUS = ["baru", "diproses", "siap", "selesai", "batal"];
const parse = s => { try { return JSON.parse(s); } catch { return null; } };
const slug = (s, d) => (/^[a-z0-9_-]{1,30}$/i.test(String(s || "")) ? String(s).toLowerCase() : d);
const ytId = s => { s = String(s || "").trim(); const m = /(?:v=|youtu\.be\/|embed\/)([\w-]{11})/.exec(s); return m ? m[1] : /^[\w-]{11}$/.test(s) ? s : ""; };

function cleanBooks(rows) {
  return rows.slice(0, 500).map((x, n) => ({ id: c.txt(x.id, 20) || "b" + String(n + 1).padStart(2, "0"), judul: c.txt(x.judul, 200), penulis: c.txt(x.penulis, 150), kat: slug(x.kat, "umum"),
    pinjam: !!x.pinjam, beli: !!x.beli, harga: c.int(x.harga), sp: c.int(x.sp), sb: c.int(x.sb), aktif: x.aktif !== false })).filter(x => x.judul);
}
function cleanVideos(rows) {
  return rows.slice(0, 500).map((x, n) => ({ id: c.txt(x.id, 20) || "v" + String(n + 1).padStart(2, "0"), judul: c.txt(x.judul, 200), kat: slug(x.kat, "skripsi"), youtube: ytId(x.youtube),
    mp4: /^[\w./-]{1,200}$/.test(String(x.mp4 || "")) ? String(x.mp4) : "", terkait: c.txt(x.terkait, 150),
    ai: x.ai && slug(x.ai.jenis, "") && slug(x.ai.task, "") ? { jenis: slug(x.ai.jenis), task: slug(x.ai.task) } : null, aktif: x.aktif !== false })).filter(x => x.judul && (x.youtube || x.mp4));
}

module.exports = async (req, res) => {
  const u = c.session(req);
  if (!u) return c.fail(res, 401, "Belum masuk.");
  if (u.peran !== "Admin") return c.fail(res, 403, "Khusus admin.");
  if (!c.hasDb()) return c.fail(res, 503, "Database belum tersambung (lihat PANDUAN-PASANG.md).");
  try {
    if (req.method === "GET") {
      const w = req.query.what;
      if (w === "submissions") {
        const codes = (await c.redis("LRANGE", "subs", 0, 499)) || [];
        const rows = codes.length ? (await c.redis("MGET", ...codes.map(k => "sub:" + k))).map(parse).filter(Boolean) : [];
        return c.send(res, 200, { ok: true, rows });
      }
      if (w === "books" || w === "videos") { const r = parse(await c.redis("GET", w)); return c.send(res, 200, { ok: true, rows: r || seed[w], seed: !r }); }
      return c.fail(res, 400, "Permintaan tidak dikenal.");
    }
    if (req.method !== "POST" || !c.xhr(req)) return c.fail(res, 403, "Permintaan ditolak.");
    const b = req.body || {};
    if (b.action === "status") {
      const k = "sub:" + String(b.kode), r = parse(await c.redis("GET", k));
      if (!r) return c.fail(res, 404, "Pengajuan tidak ditemukan.");
      if (!STATUS.includes(b.status)) return c.fail(res, 400, "Status tidak sah.");
      r.status = b.status; r.catatan = c.txt(b.catatan, 500, true); r.diubah = Math.floor(Date.now() / 1000);
      await c.redis("SET", k, JSON.stringify(r));
      return c.send(res, 200, { ok: true });
    }
    if (b.action === "delete") { await c.redis("DEL", "sub:" + String(b.kode)); await c.redis("LREM", "subs", 0, String(b.kode)); return c.send(res, 200, { ok: true }); }
    if (b.action === "save" && (b.what === "books" || b.what === "videos") && Array.isArray(b.rows)) {
      const rows = (b.what === "books" ? cleanBooks : cleanVideos)(b.rows);
      await c.redis("SET", b.what, JSON.stringify(rows));
      return c.send(res, 200, { ok: true, count: rows.length, rows });
    }
    c.fail(res, 400, "Format permintaan tidak sah.");
  } catch (e) { console.error("[admin]", e.message); c.fail(res, 500, "Terjadi galat di server."); }
};
