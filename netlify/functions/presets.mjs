import { getStore } from "@netlify/blobs";

// Shared cocktail presets for the whole lab, stored in Netlify Blobs.
// Optional: set a PRESET_PIN environment variable in Netlify to require a PIN for saving/deleting.
const MAX_PRESETS = 100;
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
const slug = (n) =>
  n.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "preset";

export default async (req) => {
  const store = getStore("lab-presets");
  const pin = Netlify.env.get("PRESET_PIN");
  const authed = !pin || req.headers.get("x-pin") === pin;

  if (req.method === "GET") {
    const { blobs } = await store.list();
    const presets = (await Promise.all(blobs.map((b) => store.get(b.key, { type: "json" })))).filter(Boolean);
    presets.sort((a, b) => a.name.localeCompare(b.name));
    return json({ pinRequired: Boolean(pin), presets });
  }
  if (!authed) return json({ error: "PIN required" }, 401);

  if (req.method === "POST") {
    let body;
    try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const data = body?.data;
    if (!name || name.length > 60 || !data || typeof data !== "object" || Array.isArray(data)) {
      return json({ error: "Invalid preset" }, 400);
    }
    const entries = Object.entries(data);
    if (entries.length > 30 || entries.some(([k, v]) => k.length > 40 || !["string", "number"].includes(typeof v) || String(v).length > 40)) {
      return json({ error: "Invalid preset data" }, 400);
    }
    const id = slug(name);
    const { blobs } = await store.list();
    if (blobs.length >= MAX_PRESETS && !blobs.some((b) => b.key === id)) {
      return json({ error: "Preset limit reached" }, 400);
    }
    const preset = { id, name, data: Object.fromEntries(entries), updatedAt: Date.now() };
    await store.setJSON(id, preset);
    return json(preset);
  }

  if (req.method === "DELETE") {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return json({ error: "Missing id" }, 400);
    await store.delete(id);
    return json({ ok: true });
  }
  return json({ error: "Method not allowed" }, 405);
};

export const config = { path: "/api/presets" };
