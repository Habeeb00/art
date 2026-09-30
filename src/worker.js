// Unsaid — /api/paint
// conversation → scene JSON (Llama) → painting (FLUX.1 schnell).
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

const COMPOSITIONS = ["auto", "full", "torn", "cutout", "paper"];
const TREATMENTS = ["cutout", "scene", "doodle"];

// The house style, one phrase per treatment. Tune these until 8 out of 10
// results feel like the same painter.
const BRUSH =
  "expressive oil painting, thick impasto, visible bristle and palette knife marks, bold saturated colour, " +
  "loose broken edges, naive expressionist, hand-painted, no text, no letters";
const STYLES = {
  scene: `${BRUSH}, the whole canvas painted edge to edge, unfinished raw areas`,
  cutout: (ground) =>
    `a single subject isolated on a plain flat pure ${ground} background, nothing else in the frame, ` +
    `the subject large and filling the lower two thirds, empty ${ground} space above it, ${BRUSH}, raw brushy edges`,
  doodle:
    "naive childlike painting on white paper, thick oil pastel and gouache, scribbled black ink pen lines and doodles, " +
    "bright saturated blues reds yellows and greens, white paper showing through, playful and messy, no text, no letters",
};

const SPACE_HINT = {
  top: "the upper third is calm and empty",
  centre: "the middle of the canvas is calm and open, detail pushed to the edges",
  bottom: "the lower third is calm and empty",
};

const SCENE_PROMPT = `You are the art director for a painter who turns text conversations into
expressive oil paintings. A stranger scrolling past must FEEL what is going on
in one second, without reading a single message.

How to find the painting:
1. Work out what is really happening underneath the words: who wants what,
   who is pulling away, what nobody is saying.
2. Find the phrase or feeling at the heart of it and paint it LITERALLY, as
   one big, clear subject. The best paintings take a figure of speech at its
   word: "I'm fine" becomes a tower of teacups balanced on one trembling hand;
   "I miss you" becomes a cup of chai going cold opposite an empty chair;
   "I feel stuck" becomes a kite knotted in electric wires above a busy road;
   "we'll figure it out" becomes two small figures sharing one umbrella,
   wading across a flooded monsoon road; "leave me alone" becomes a
   lighthouse turning its beam inward. If a message already contains an
   image (a dragon, the moon, bones, a dream), paint that image.
3. One subject, big in the frame, in a tight palette of two or three colours
   that carry the mood.
4. If the conversation uses Malayalam or Manglish, set it in Kerala: paddy
   fields, coconut palms, a veranda, monsoon rain, a KSRTC bus.

Choose a treatment:
- "cutout": a single object or figure is the whole idea. It is painted alone
  on a flat black or white ground. Choose "ground": "black" for heavy, lonely
  or night feelings, "white" for brittle, bright or ironic ones.
- "scene": the feeling needs a place around the subject.
- "doodle": playful, hopeful, chaotic or arguing conversations, painted like a
  child's drawing on paper with ink scribbles.

Return ONLY valid JSON, no preamble, no markdown:
{
  "subtext": "one plain sentence: what is really going on",
  "emotional_core": "a short poetic line, max 12 words, naming the unsaid feeling",
  "mood": "one or two words",
  "treatment": "cutout | scene | doodle",
  "ground": "black | white",
  "negative_space": "top | centre | bottom",
  "image_prompt": "40-70 words. Name the subject first and exactly what it is doing, then its colours and light. For a scene, then the setting."
}

Rules:
- No text, letters, phones, screens or speech bubbles in the painting, and
  never mention a conversation, chat or message in image_prompt.
- Leave a calmer area at the negative_space position.
- If the conversation is sexual, hateful, or romantic/sexual involving a
  minor, return {"refused": true}.`;

// One worked example anchors the model on concrete, literal subjects.
const EXAMPLE_IN = `Conversation:
Them: how are you holding up?
Me: honestly I'm fine
Me: busy is good

Decide the mood yourself.
Return the JSON now.`;
const EXAMPLE_OUT = JSON.stringify({
  subtext: "They are not fine; they are staying busy so they don't have to feel it.",
  emotional_core: "Busy enough not to feel it.",
  mood: "brittle",
  treatment: "cutout",
  ground: "black",
  negative_space: "top",
  image_prompt: "A tall wobbling tower of mismatched teacups balanced on one small open palm, the stack leaning, the top cup cracked and spilling a thin line of amber tea down the wrist. Chipped white porcelain with blue patterns, warm light from one side, deep shadow.",
});

const DEFAULT_SCENES = {
  tender: "two small figures sitting close on a hillside at dusk, one leaning into the other, warm ochre grass, soft pink and violet sky",
  angry: "a kettle boiling over on a red-hot stove, steam tearing upward, clashing reds and oranges",
  distant: "two paper boats drifting apart on a wide still blue lake, cold pale light",
  nostalgic: "a child's bicycle lying in long golden grass beside an old house, faded turquoise sky, late afternoon light",
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
  const scene = await writeScene(env, clean, mood);
  // A composition picked on the page overrides the scene writer's treatment.
  if (!scene.refused && composition !== "auto") {
    scene.treatment = composition === "cutout" ? "cutout" : composition === "paper" ? "doodle" : "scene";
  }

  // 4. Refusal
  if (scene.refused) {
    return json({ error: "We can't paint this one. Try a different conversation.", refused: true }, 422);
  }

  // 5. Painting
  const style = scene.treatment === "cutout" ? STYLES.cutout(scene.ground) : STYLES[scene.treatment];
  const hint = scene.treatment === "cutout" ? "" : ` Composition: ${SPACE_HINT[scene.negative_space]}.`;
  const prompt = `${scene.image_prompt}.${hint} ${style}`;
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
    .map((m) => `${m.side === "me" ? "Me" : "Them"}: ${
      m.kind === "deleted" ? "[deleted a message]" : m.kind === "typing" ? "[starts typing… then nothing]" : m.text
    }`)
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
    treatment: TREATMENTS.includes(s?.treatment) ? s.treatment : "scene",
    ground: s?.ground === "white" ? "white" : "black",
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
