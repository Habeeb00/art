// Unsaid — the scene writer's brief and the painter's style.
// Shared by the worker (src/worker.js) and the page's ?preview mode, so both
// paint from exactly the same prompt.

export const COMPOSITIONS = ["auto", "full", "torn", "cutout"];
const TREATMENTS = ["cutout", "scene"];
const SPACES = ["top", "centre", "bottom"];

// The house style. The medium leads the prompt (image models weigh the start
// most) and closes it again, so the subject can't pull it towards digital art.
// Tune until 8 out of 10 results feel like the same painter.
const MEDIUM =
  "A thick impasto oil painting on canvas: chunky directional brushstrokes, every stroke a separate dab of unblended paint, " +
  "loose naive drawing, a limited palette";
const FINISH =
  "real oil paint texture, hand-painted by a naive expressionist painter, bold saturated colour, loose broken edges, " +
  "traditional oil on canvas, not a photograph, not digital art, not 3D, no text, no letters";
const STYLES = {
  scene: "painted edge to edge with unfinished raw areas",
  cutout: (ground) =>
    `a single subject alone on a flat ${ground} painted background, nothing else in the frame, ` +
    `the subject large and filling the lower two thirds, empty ${ground} space above it, raw brushy edges`,
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

Return ONLY valid JSON, no preamble, no markdown:
{
  "subtext": "one plain sentence: what is really going on",
  "emotional_core": "a short poetic line, max 12 words, naming the unsaid feeling",
  "mood": "one or two words",
  "treatment": "cutout | scene",
  "ground": "black | white",
  "negative_space": "top | centre | bottom",
  "image_prompt": "40-70 words. Name the subject first and exactly what it is doing, then its colours and light. For a scene, then the setting."
}

Rules:
- No text, letters, phones, screens or speech bubbles in the painting, and
  never mention a conversation, chat or message in image_prompt.
- Describe only what is painted. Never name another medium or style (no
  "photo", "realistic", "illustration", "cartoon", "3D", "digital").
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

// messages: [{ side: "me" | "them", kind: "text" | "deleted" | "typing", text }]
export function sceneMessages(messages, mood) {
  const transcript = messages
    .map((m) => `${m.side === "me" ? "Me" : "Them"}: ${
      m.kind === "deleted" ? "[deleted a message]" : m.kind === "typing" ? "[starts typing… then nothing]" : m.text
    }`)
    .join("\n");
  const moodLine = mood && mood !== "auto" ? `The mood should lean ${mood}.` : "Decide the mood yourself.";
  return [
    { role: "system", content: SCENE_PROMPT },
    { role: "user", content: EXAMPLE_IN },
    { role: "assistant", content: EXAMPLE_OUT },
    { role: "user", content: `Conversation:\n${transcript}\n\n${moodLine}\nReturn the JSON now.` },
  ];
}

// The scene writer's reply → { refused: true } or a clean scene. A composition
// picked on the page overrides the writer's treatment.
export function readScene(raw, mood, composition = "auto") {
  const parsed = typeof raw === "object" && raw ? raw : parseJson(String(raw ?? ""));
  if (parsed?.refused === true) return { refused: true };
  // The model's own safety refusal comes back as prose, not JSON.
  if (!parsed && /\b(I can(?:'|no)t|I won't|I'm unable|cannot (?:help|assist|create))\b/i.test(String(raw))) {
    return { refused: true };
  }
  const scene = normaliseScene(parsed, mood);
  if (composition !== "auto" && COMPOSITIONS.includes(composition)) {
    scene.treatment = composition === "cutout" ? "cutout" : "scene";
  }
  return scene;
}

export function imagePrompt(scene) {
  const layout = scene.treatment === "cutout"
    ? STYLES.cutout(scene.ground)
    : `${STYLES.scene}, ${SPACE_HINT[scene.negative_space]}`;
  const subject = scene.image_prompt.replace(/\.\s*$/, "");
  return `${MEDIUM}: ${subject}. ${layout}. ${FINISH}.`.slice(0, 2000);
}

function normaliseScene(s, mood) {
  const fallbackMood = mood && mood !== "auto" ? mood : "distant";
  const prompt = typeof s?.image_prompt === "string" ? s.image_prompt.trim() : "";
  const scene = {
    subtext: str(s?.subtext, 300),
    emotional_core: str(s?.emotional_core, 120) || "Something is being said around, not through.",
    mood: str(s?.mood, 30) || fallbackMood,
    treatment: TREATMENTS.includes(s?.treatment) ? s.treatment : "scene",
    ground: s?.ground === "white" ? "white" : "black",
    negative_space: SPACES.includes(s?.negative_space) ? s.negative_space : s?.negative_space === "center" ? "centre" : "top",
    image_prompt: prompt.length >= 20 ? prompt.slice(0, 900) : DEFAULT_SCENES[fallbackMood] || DEFAULT_SCENES.distant,
  };
  // Belt and braces: strip anything that invites lettering.
  scene.image_prompt = scene.image_prompt
    .replace(/\b(text|letters?|words?|phones?|screens?|speech bubbles?|captions?|signs?)\b/gi, "")
    .replace(/\b(photo(graph)?(ic|ically)?|photorealistic|hyper-?realistic|realistic|cinematic|render(ed)?|3d|cgi|digital( art)?|illustration|cartoon|anime|vector)\b/gi, "")
    .replace(/\s{2,}/g, " ");
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
