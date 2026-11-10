// Aile takviye takibi: ortak veri deposu (Netlify Functions + Netlify Blobs)
// GET  /api/takviye  -> güncel veri
// POST /api/takviye  -> {ops:[...]} değişikliklerini uygular, güncel veriyi döner
// Her istekte "x-takviye-ad" başlığında ad-soyad gelir (encodeURIComponent ile).
// Adın kendisi burada da sayfada da yazmaz; yalnızca normalize edilmiş halinin özeti (hash) karşılaştırılır.
import { getStore } from "@netlify/blobs";
import { createHash } from "node:crypto";

export const config = { path: "/api/takviye" };

const NAME_HASH = "11b6abf6507879f142d35c7be4ab713c51c52f7e2470e2b15ad8f3f1eb6591aa";
const ITEMS = {
  aygul: ["sinfer", "biotin", "elenatal", "d3k2", "telavium", "osteo", "mag4ca"],
  arda: ["dvit", "microfer", "kaleidon"],
};

const TR = { "ç": "c", "ğ": "g", "ı": "i", "ö": "o", "ş": "s", "ü": "u", "â": "a", "î": "i", "û": "u" };
const norm = (s) => String(s).normalize("NFC").toLocaleLowerCase("tr").replace(/\u0307/g, "")
  .replace(/[çğıöşüâîû]/g, (c) => TR[c]).replace(/\s+/g, " ").trim();
const nameOk = (raw) => {
  let s = "";
  try { s = decodeURIComponent(raw || ""); } catch { return false; }
  if (!s || s.length > 100) return false;
  return createHash("sha256").update("takviye:" + norm(s)).digest("hex") === NAME_HASH;
};

const empty = () => ({ v: 1, rev: 0, checks: { aygul: {}, arda: {} }, microfer: [] });
const validDate = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});

function normalize(state) {
  if (!state || typeof state !== "object") return empty();
  if (!state.checks || typeof state.checks !== "object") state.checks = {};
  for (const w of Object.keys(ITEMS)) if (!state.checks[w] || typeof state.checks[w] !== "object") state.checks[w] = {};
  if (!Array.isArray(state.microfer)) state.microfer = [];
  return state;
}

// İstemcideki applyOp ile aynı mantık
function applyOp(state, op) {
  if (!op || typeof op !== "object") return;
  if (op.t === "check") {
    if (!ITEMS[op.who] || !ITEMS[op.who].includes(op.id) || !validDate(op.date)) return;
    const box = state.checks[op.who];
    if (op.val) (box[op.date] || (box[op.date] = {}))[op.id] = true;
    else if (box[op.date]) { delete box[op.date][op.id]; if (!Object.keys(box[op.date]).length) delete box[op.date]; }
  } else if (op.t === "dose") {
    if (!validDate(op.from)) return;
    state.microfer = state.microfer.filter((s) => s.from !== op.from);
    if (Number.isInteger(op.drops) && op.drops >= 1 && op.drops <= 60) state.microfer.push({ from: op.from, drops: op.drops });
    state.microfer.sort((a, b) => (a.from < b.from ? -1 : 1));
  }
}

export default async (req) => {
  if (!nameOk(req.headers.get("x-takviye-ad"))) return json({ error: "Bu isimle giriş yapılamıyor." }, 403);
  const store = getStore({ name: "takviye", consistency: "strong" });
  const KEY = "aile";

  if (req.method === "GET") return json(normalize(await store.get(KEY, { type: "json" })));

  if (req.method === "POST") {
    const text = await req.text();
    if (text.length > 200000) return json({ error: "İstek çok büyük." }, 413);
    let body;
    try { body = JSON.parse(text); } catch { return json({ error: "Geçersiz istek." }, 400); }
    if (!body || !Array.isArray(body.ops) || body.ops.length > 500) return json({ error: "Geçersiz istek." }, 400);
    const state = normalize(await store.get(KEY, { type: "json" }));
    for (const op of body.ops) applyOp(state, op);
    state.rev = (state.rev || 0) + 1;
    state.updated = new Date().toISOString();
    await store.setJSON(KEY, state);
    return json(state);
  }
  return json({ error: "Desteklenmeyen istek." }, 405);
};
