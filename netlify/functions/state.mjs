// Arda ek gıda planı: ortak veri deposu (Netlify Functions + Netlify Blobs)
// GET  /api/state  -> o aile kodunun güncel verisi
// POST /api/state  -> {ops:[...]} değişikliklerini uygular, güncel veriyi döner
// Aile kodu "x-family-code" başlığında gelir; depoda kodun kendisi değil, özeti (hash) anahtar olarak tutulur.
import { getStore } from "@netlify/blobs";
import { createHash } from "node:crypto";

export const config = { path: "/api/state" };

const SLOTS = ["kahvalti", "oglen", "ikindi"];
const RX = [null, "ok", "mild", "severe"];
const empty = () => ({ v: 1, rev: 0, start: null, seq: null, days: {} });

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

const validDay = (d) => Number.isInteger(d) && d >= 1 && d <= 400;
const validDate = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const validSeq = (q) =>
  Array.isArray(q) && q.length > 0 && q.length <= 120 &&
  q.every((s) => s && Array.isArray(s.f) && s.f.length > 0 && s.f.length <= 10 &&
    s.f.every((k) => typeof k === "string" && /^[a-z]{1,30}$/.test(k)) &&
    Number.isInteger(s.len) && s.len >= 1 && s.len <= 7);

function cleanDays(days) {
  const out = {};
  if (!days || typeof days !== "object") return out;
  for (const [k, r] of Object.entries(days)) {
    const d = Number(k);
    if (!validDay(d) || !r || typeof r !== "object") continue;
    const m = {};
    for (const s of SLOTS) if (r.m && r.m[s]) m[s] = true;
    out[d] = { m, r: RX.includes(r.r) ? r.r : null, note: typeof r.note === "string" ? r.note.slice(0, 2000) : "" };
  }
  return out;
}

function rec(state, d) {
  return state.days[d] || (state.days[d] = { m: {}, r: null, note: "" });
}

// İstemcideki applyOp ile aynı mantık
function applyOp(state, op) {
  if (!op || typeof op !== "object") return;
  switch (op.t) {
    case "meal":
      if (validDay(op.d) && SLOTS.includes(op.slot)) rec(state, op.d).m[op.slot] = !!op.val;
      break;
    case "rx":
      if (validDay(op.d) && RX.includes(op.val)) rec(state, op.d).r = op.val;
      break;
    case "note":
      if (validDay(op.d) && typeof op.val === "string") rec(state, op.d).note = op.val.slice(0, 2000);
      break;
    case "meta":
      if (validDate(op.start)) state.start = op.start;
      if (validSeq(op.seq)) state.seq = op.seq;
      break;
    case "clear":
      state.days = {};
      break;
    case "replace":
      if (op.state && typeof op.state === "object") {
        if (validDate(op.state.start)) state.start = op.state.start;
        if (validSeq(op.state.seq)) state.seq = op.state.seq;
        state.days = cleanDays(op.state.days);
      }
      break;
  }
}

export default async (req) => {
  const code = (req.headers.get("x-family-code") || "").trim();
  if (code.length < 4 || code.length > 64) return json({ error: "Aile kodu en az 4 karakter olmalı." }, 400);

  const key = "aile-" + createHash("sha256").update("ek-gida:" + code).digest("hex").slice(0, 32);
  const store = getStore({ name: "ek-gida", consistency: "strong" });

  if (req.method === "GET") {
    const data = (await store.get(key, { type: "json" })) || empty();
    return json(data);
  }

  if (req.method === "POST") {
    const text = await req.text();
    if (text.length > 300000) return json({ error: "İstek çok büyük." }, 413);
    let body;
    try { body = JSON.parse(text); } catch { return json({ error: "Geçersiz istek." }, 400); }
    if (!body || !Array.isArray(body.ops) || body.ops.length > 500) return json({ error: "Geçersiz istek." }, 400);

    const state = (await store.get(key, { type: "json" })) || empty();
    if (!state.days || typeof state.days !== "object") state.days = {};
    for (const op of body.ops) applyOp(state, op);
    state.rev = (state.rev || 0) + 1;
    state.updated = new Date().toISOString();
    await store.setJSON(key, state);
    return json(state);
  }

  return json({ error: "Desteklenmeyen istek." }, 405);
};
