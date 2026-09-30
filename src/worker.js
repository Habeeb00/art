// Unsaid — /api/paint
// conversation → scene JSON (Llama 3.1 8B) → painting (FLUX.1 schnell).
// Nothing is stored: messages pass through and are gone.

// The scene writer decides whether the painting reads emotionally, so it defaults
// to Llama 3.3 70B. It costs more of the free daily allowance than 8B; set
// SCENE_MODEL = "@cf/meta/llama-3.1-8b-instruct" in wrangler.toml for more paintings a day.
const DEFAULT_SCENE_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const IMAGE_MODEL = "@cf/black-forest-labs/flux-1-schnell";

const MAX_MESSAGES = 20;
const MAX_CHARS = 300;
const MAX_BODY_BYTES = 20_000;
const MOODS = ["auto", "tender", "angry", "distant", "nostalgic"];
const SPACES = ["top", "centre", "bottom"];

// The house style. Tune this until 8 out of 10 results feel like the same painter.
const STYLE =
  "expressive oil painting on canvas, thick impasto, visible bristle and palette knife marks, " +
  "naive expressionist figures with simple faces and readable body language, bold saturated colour, " +
  "loose broken edges, unfinished raw areas, hand-painted, emotional storytelling, no text, no letters";

const SPACE_HINT = {
  top: "the upper third is calm open sky or loose empty brushwork with no figures",
  centre: "the middle of the canvas is calm and open, figures and detail pushed to the edges",
  bottom: "the lower third is calm open ground or loose empty brushwork with no figures",
};

const SCENE_PROMPT = `You are the art director for a painter who turns text conversations into
expressive oil paintings. A stranger scrolling past must FEEL what is going on
between these people in one second, without reading a single message.

How to find the painting:
1. Work out what is really happening: who wants what, who is pulling away,
   who is holding back, what nobody is saying.
2. Show it as ONE clear human moment: one or two simple, naive figures whose
   bodies carry the feeling. Use gesture and distance: backs turned, a hand
   reaching and not arriving, a wide gap between them, one lying in the grass,
   a hug that doesn't hold, one figure walking away small in the distance,
   someone sitting alone beside an empty space.
3. Add ONE symbolic detail that makes it land: an arrow through a heart, a door
   left open, a kite caught in a tree, a bridge that doesn't meet in the middle,
   a wilting flower, a second empty chair, rain falling on only one of them.
4. Let colour, light and weather carry the mood: warm golds and pinks for
   tenderness, clashing reds and oranges for anger, cold blues and big empty
   space for distance, faded yellows and turquoise for nostalgia, deep violets
   and night for grief.
5. Use ordinary places people know: a rooftop, a bus stop, a playground, a
   kitchen, a beach at dusk, a train window, a hospital corridor. If the
   conversation uses Malayalam or Manglish, paint Kerala: paddy fields,
   coconut palms, a veranda, monsoon rain, a KSRTC bus.

Return ONLY valid JSON, no preamble, no markdown:
{
  "subtext": "one plain sentence: what is really going on",
  "emotional_core": "a short poetic line, max 12 words, naming the unsaid feeling",
  "mood": "one or two words",
  "negative_space": "top | centre | bottom",
  "image_prompt": "50-80 words. Start with the figures and exactly what their bodies are doing, then the symbolic detail, then the setting, light and colour palette."
}

Rules:
- No text, letters, phones, screens or speech bubbles in the painting, and
  never mention a conversation, chat or message in image_prompt.
- Leave a calmer area at the negative_space position.
- If the conversation is sexual, hateful, or romantic/sexual involving a
  minor, return {"refused": true}.`;

// One worked example anchors the model on concrete, readable scenes.
const EXAMPLE_IN = `Conversation:
Them: I love you but we shouldn't speak
Me: okay
Me: if that's what you want

The mood should lean tender.
Return the JSON now.`;
const EXAMPLE_OUT = JSON.stringify({
  subtext: "They still love each other, but one has decided it has to end, and the other is pretending to accept it.",
  emotional_core: "Loved, and still asked to go quiet.",
  mood: "tender grief",
  negative_space: "top",
  image_prompt: "A small figure in a white shirt lies curled on their side in a golden wheat field, one arm stretched toward nothing, a thin red arrow standing upright from their chest. Far off at the horizon, a second tiny figure walks away. Wind flattens the tall yellow grass. Pale turquoise sky with pink streaks, late afternoon light, warm ochres against cold blue.",
});

const DEFAULT_SCENES = {
  tender: "two small figures sitting close on a hillside at dusk, one leaning into the other, warm ochre grass, soft pink and violet sky, a single tree bending over them",
  angry: "a lone figure standing in a field under a burning red and orange sky, wind tearing through tall yellow grass, a dark house far away with one lit window",
  distant: "two figures on opposite banks of a wide blue river, a broken bridge between them, cold green hills, pale sky streaked with white and lilac",
  nostalgic: "a child's bicycle lying in long golden grass beside an old house, faded turquoise sky, washing on a line, late afternoon light in thick yellow strokes",
};

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
    const deleted = m?.kind === "deleted";
    const text = typeof m?.text === "string" ? m.text.trim() : "";
    if (text.length > MAX_CHARS) return json({ error: `Keep each message under ${MAX_CHARS} characters.` }, 400);
    if (!deleted && !text) continue;
    clean.push({ side, text, deleted });
  }
  if (!clean.length) return json({ error: "Write at least one message." }, 400);
  const mood = MOODS.includes(body?.mood) ? body.mood : "auto";

  // 2. Per-IP daily limit (only when KV is bound)
  const limitKey = await checkLimit(request, env);
  if (limitKey instanceof Response) return limitKey;

  // 3. Scene
  const scene = await writeScene(env, clean, mood);

  // 4. Refusal
  if (scene.refused) {
    return json({ error: "We can't paint this one. Try a different conversation.", refused: true }, 422);
  }

  // 5. Painting
  const prompt = `${scene.image_prompt}. Composition: ${SPACE_HINT[scene.negative_space]}. ${STYLE}`;
  const result = await env.AI.run(IMAGE_MODEL, {
    prompt: prompt.slice(0, 2000),
    steps: 8,
    seed: Math.floor(Math.random() * 2_147_483_647),
  });
  if (!result?.image) throw new Error("no image returned");

  if (limitKey) await bumpLimit(env, limitKey);

  // 6. Respond (1024×1024 JPEG; the browser crops to 4:5)
  return json({ image: `data:image/jpeg;base64,${result.image}`, scene });
}

async function writeScene(env, messages, mood) {
  const transcript = messages
    .map((m) => `${m.side === "me" ? "Me" : "Them"}: ${m.deleted ? "[deleted a message]" : m.text}`)
    .join("\n");
  const moodLine = mood === "auto" ? "Decide the mood yourself." : `The mood should lean ${mood}.`;

  let raw = "";
  try {
    const out = await env.AI.run(env.SCENE_MODEL || DEFAULT_SCENE_MODEL, {
      messages: [
        { role: "system", content: SCENE_PROMPT },
        { role: "user", content: EXAMPLE_IN },
        { role: "assistant", content: EXAMPLE_OUT },
        { role: "user", content: `Conversation:\n${transcript}\n\n${moodLine}\nReturn the JSON now.` },
      ],
      max_tokens: 500,
      temperature: 0.8,
    });
    raw = out?.response ?? "";
  } catch (err) {
    if (isQuotaError(err)) throw err;
    console.error("scene model failed", err);
  }

  const parsed = typeof raw === "object" && raw ? raw : parseJson(String(raw));
  if (parsed?.refused === true) return { refused: true };
  // The model's own safety refusal comes back as prose, not JSON.
  if (!parsed && /\b(I can(?:'|no)t|I won't|I'm unable|cannot (?:help|assist|create))\b/i.test(String(raw))) {
    return { refused: true };
  }
  return normaliseScene(parsed, mood);
}

function normaliseScene(s, mood) {
  const fallbackMood = mood === "auto" ? "distant" : mood;
  const prompt = typeof s?.image_prompt === "string" ? s.image_prompt.trim() : "";
  const scene = {
    subtext: str(s?.subtext, 300),
    emotional_core: str(s?.emotional_core, 120) || "Something is being said around, not through.",
    mood: str(s?.mood, 30) || fallbackMood,
    negative_space: SPACES.includes(s?.negative_space) ? s.negative_space : s?.negative_space === "center" ? "centre" : "top",
    image_prompt: prompt.length >= 20 ? prompt.slice(0, 900) : DEFAULT_SCENES[fallbackMood],
  };
  // Belt and braces: strip anything that invites lettering.
  scene.image_prompt = scene.image_prompt.replace(/\b(text|letters?|words?|phones?|screens?|speech bubbles?|captions?|signs?)\b/gi, "").replace(/\s{2,}/g, " ");
  return scene;
}

function parseJson(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

function str(v, max) {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
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
