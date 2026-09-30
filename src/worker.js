// Unsaid — /api/paint
// conversation → an idea from the idea book (public/ideas.js, clear rules, no
// model) → painting (FLUX.1 schnell). The page then repaints it with its own
// eleven strokes. Nothing is stored: messages pass through and are gone.

import { IDEAS, PLACEMENTS, readConversation, ideaById, ideaPrompt } from "../public/ideas.js";

const IMAGE_MODEL = "@cf/black-forest-labs/flux-1-schnell";

const MAX_MESSAGES = 20;
const MAX_CHARS = 300;
const MAX_BODY_BYTES = 20_000;

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
  // 2. The idea: read from the messages, or picked on the page.
  const reading = readConversation(clean);
  if (reading.blocked) {
    return json({ error: "We can't paint this one. Try a different conversation.", refused: true }, 422);
  }
  const idea = ideaById(body?.idea) || reading.idea;
  const placement = PLACEMENTS.includes(body?.placement) && body.placement !== "auto" ? body.placement : idea.placement;

  // 3. Per-IP daily limit (only when KV is bound)
  const limitKey = await checkLimit(request, env);
  if (limitKey instanceof Response) return limitKey;

  // 4. Painting
  const result = await env.AI.run(IMAGE_MODEL, {
    prompt: ideaPrompt(idea, placement, reading.detail),
    steps: 8,
    seed: Math.floor(Math.random() * 2_147_483_647),
  });
  if (!result?.image) throw new Error("no image returned");

  if (limitKey) await bumpLimit(env, limitKey);

  // 5. Respond (1024×1024 JPEG; the page crops, repaints and composes it)
  return json({
    image: `data:image/jpeg;base64,${result.image}`,
    idea: { id: idea.id, name: idea.name, caption: idea.caption, feeling: idea.feeling },
    placement,
    matched: reading.matched,
    ideas: IDEAS.length,
  });
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
