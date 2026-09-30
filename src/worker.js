// Unsaid — /api/paint
// conversation → scene JSON (Llama) → painting (FLUX.1 schnell).
// Nothing is stored: messages pass through and are gone.

import { COMPOSITIONS, sceneMessages, readScene, imagePrompt, isSceneReply } from "../public/scene.js";

// The scene writer decides whether the painting reads emotionally, so it defaults
// to Llama 3.3 70B. It costs more of the free daily allowance than 8B; set
// SCENE_MODEL = "@cf/meta/llama-3.1-8b-instruct" in wrangler.toml for more paintings a day.
const DEFAULT_SCENE_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const IMAGE_MODEL = "@cf/black-forest-labs/flux-1-schnell";

const MAX_MESSAGES = 20;
const MAX_CHARS = 300;
const MAX_BODY_BYTES = 20_000;
const MOODS = ["auto", "tender", "angry", "distant", "nostalgic"];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/paint") {
      if (request.method !== "POST") return json({ error: "Use POST." }, 405);
      try {
        return await paint(request, env);
      } catch (err) {
        console.error("paint failed", err);
        if (isQuotaError(err)) return quotaResponse();
        return json({ error: "The painter dropped the brush. Try again in a moment." }, 502);
      }
    }
    if (url.pathname.startsWith("/api/")) return json({ error: "Not found." }, 404);
    return env.ASSETS.fetch(request);
  },
};

async function paint(request, env) {
  // 1. Validate
  const length = Number(request.headers.get("content-length") || 0);
  if (length > MAX_BODY_BYTES) return json({ error: "That's too much to paint at once." }, 413);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Couldn't read that request." }, 400);
  }

  const messages = Array.isArray(body?.messages) ? body.messages : null;
  if (!messages || messages.length < 1 || messages.length > MAX_MESSAGES) {
    return json({ error: `Add between 1 and ${MAX_MESSAGES} messages.` }, 400);
  }
  const clean = [];
  for (const m of messages) {
    const side = m?.side === "me" ? "me" : "them";
    const kind = m?.kind === "deleted" || m?.kind === "typing" ? m.kind : "text";
    const text = typeof m?.text === "string" ? m.text.trim() : "";
    if (text.length > MAX_CHARS) return json({ error: `Keep each message under ${MAX_CHARS} characters.` }, 400);
    if (kind === "text" && !text) continue;
    clean.push({ side, text, kind });
  }
  if (!clean.some((m) => m.kind !== "typing")) return json({ error: "Write at least one message." }, 400);
  const mood = MOODS.includes(body?.mood) ? body.mood : "auto";
  const composition = COMPOSITIONS.includes(body?.composition) ? body.composition : "auto";

  // 2. Per-IP daily limit (only when KV is bound)
  const limitKey = await checkLimit(request, env);
  if (limitKey instanceof Response) return limitKey;

  // 3. Scene
  const scene = await writeScene(env, clean, mood, composition);

  // 4. No scene, or a refusal
  if (!scene) {
    return json({ error: "The scene writer didn't answer properly, so nothing was painted. Try again in a moment." }, 502);
  }
  if (scene.refused) {
    return json({ error: "We can't paint this one. Try a different conversation.", refused: true }, 422);
  }

  // 5. Painting
  const result = await env.AI.run(IMAGE_MODEL, {
    prompt: imagePrompt(scene),
    steps: 8,
    seed: Math.floor(Math.random() * 2_147_483_647),
  });
  if (!result?.image) throw new Error("no image returned");

  if (limitKey) await bumpLimit(env, limitKey);

  // 6. Respond (1024×1024 JPEG; the browser crops to 4:5)
  return json({ image: `data:image/jpeg;base64,${result.image}`, scene });
}

// Returns null when the writer doesn't produce a usable scene after a retry:
// better no painting than a stock one that has nothing to do with the words.
async function writeScene(env, messages, mood, composition) {
  for (let attempt = 0; attempt < 2; attempt++) {
    let raw = "";
    try {
      const out = await env.AI.run(env.SCENE_MODEL || DEFAULT_SCENE_MODEL, {
        messages: sceneMessages(messages, mood),
        max_tokens: 500,
        temperature: 0.8,
      });
      raw = out?.response ?? "";
    } catch (err) {
      if (isQuotaError(err)) throw err;
      console.error("scene model failed", err);
    }
    if (isSceneReply(raw)) return readScene(raw, mood, composition);
    // The model's own safety refusal comes back as prose, not JSON.
    const scene = readScene(raw, mood, composition);
    if (scene.refused) return scene;
  }
  return null;
}

// ── rate limit ──────────────────────────────────────────────────────────────

async function checkLimit(request, env) {
  if (!env.LIMITS) return null;
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const day = new Date().toISOString().slice(0, 10); // UTC day, matches the AI allowance reset
  const key = `paint:${day}:${ip}`;
  const limit = Number(env.DAILY_LIMIT) || 3;
  const used = Number(await env.LIMITS.get(key)) || 0;
  if (used >= limit) {
    return json(
      { error: `You've used your ${limit} paintings for today. Remix is still free. New ones open at 5:30 AM.`, limited: true },
      429,
    );
  }
  return key;
}

async function bumpLimit(env, key) {
  const used = Number(await env.LIMITS.get(key)) || 0;
  await env.LIMITS.put(key, String(used + 1), { expirationTtl: 60 * 60 * 36 });
}

// ── helpers ─────────────────────────────────────────────────────────────────

function isQuotaError(err) {
  const msg = String(err?.message || err);
  return /4006|neurons|daily free allocation|quota|rate limit/i.test(msg);
}

function quotaResponse() {
  return json({ error: "Today's paintings are used up. New ones open at 5:30 AM.", quota: true }, 429);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
