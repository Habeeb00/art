// Unsaid — the idea book.
// The painting's idea is chosen here, by clear rules, not invented by a model.
// Each idea is one feeling turned into one big, readable subject. The rules
// read the conversation (phrases score more than single words, the last
// message counts most) and pick the idea with the highest score.
// Shared by the worker (src/worker.js) and the page.
//
// These are original ideas. They take a feeling at its word, the way
// Mixed Messages does, but they are not copies of its paintings.

export const PLACEMENTS = ["auto", "full", "torn", "cutout"];

// placement: "cutout" = the subject alone, painted over part of the chat;
//            "full"   = a painting behind the bubbles, filling the frame;
//            "torn"   = a painting beyond a torn edge, the chat's own
//                       background kept where the words sit.
export const IDEAS = [
  {
    id: "joker",
    name: "The smiling joker",
    feeling: "pretending to be fine",
    caption: "Smiling for you. Breaking for me.",
    placement: "cutout", ground: "black",
    subject: "a heartbroken joker sitting alone on a kerb, white face paint smeared, a wide red painted smile over a trembling mouth, tears cutting clean lines through the makeup, hands hanging between the knees",
    palette: "chalk white, blood red, bruised blue",
    phrases: ["i'm fine", "im fine", "i am fine", "i'm good", "im good", "i'm okay", "im okay", "it's fine", "its fine", "all good", "no worries", "don't worry", "dont worry", "never mind", "nevermind", "it's okay", "its okay", "kuzhappamilla", "kuzhappam illa", "sheri sheri", "haha ok", "have you been okay", "are you okay", "you okay", "how are you", "how have you been", "you been good", "have you been good", "sugamano"],
    words: ["fine", "perfect", "whatever", "nothing", "sure", "lol", "haha", "sheri", "smile"],
  },
  {
    id: "pinned-heart",
    name: "The pinned heart",
    feeling: "loving someone you have to let go",
    caption: "Loved, and asked to stay quiet.",
    placement: "cutout", ground: "black",
    subject: "a big swollen red heart pinned to a wall by a single long arrow, thick paint dripping from the wound, the arrow's feathers still trembling",
    palette: "crimson, deep maroon, bone white",
    phrases: ["love you but", "i love you but", "we shouldn't", "we cant", "we can't", "can't be together", "not meant to be", "let you go", "let go", "have to stop", "shouldn't talk", "shouldn't speak"],
    words: ["shouldn't", "snehikkunnu"],
  },
  {
    id: "empty-chair",
    name: "The empty chair",
    feeling: "missing someone",
    caption: "Your cup is still here. You aren't.",
    placement: "full",
    subject: "an empty wooden chair pulled up to a small table, two glasses of chai on it, one steaming, one gone cold with a skin on top, a jacket still hanging on the chair, late light through a window",
    palette: "warm amber, faded teal, cold grey",
    phrases: ["miss you", "i miss", "missing you", "wish you were here", "come back", "remember when", "used to", "those days", "orma undo", "ninne miss"],
    words: ["miss", "missing", "remember", "memories", "orma", "gone"],
  },
  {
    id: "cut-rope",
    name: "The cut rope",
    feeling: "growing apart",
    caption: "We didn't let go. We just stopped holding.",
    placement: "full",
    subject: "two small wooden boats on a wide dark sea, a snapped rope trailing in the water between them, the gap between them growing, one boat in the foreground large and close",
    palette: "ink blue, slate grey, a thin line of pale gold",
    phrases: ["we don't talk", "we dont talk", "you changed", "we changed", "used to talk", "strangers now", "drifted apart", "so busy", "no time for me", "long time"],
    words: ["distant", "far", "changed", "drift", "apart", "stranger", "strangers", "busy", "anymore"],
  },
  {
    id: "one-umbrella",
    name: "One umbrella",
    feeling: "caring more than you're cared for",
    caption: "I kept you dry. I got soaked.",
    placement: "full",
    subject: "in heavy monsoon rain, one figure stretches out an umbrella over a second figure who is already walking away without looking back, the one holding it drenched and dripping",
    palette: "rain blue, wet black, one red umbrella",
    phrases: ["always me", "only me", "i always", "you never", "i tried", "i try so hard", "one sided", "one-sided", "do you even care", "you don't care", "you dont care", "i care"],
    words: ["never", "always", "effort", "care", "try", "trying", "tried", "ignore", "ignored"],
  },
  {
    id: "kite-wires",
    name: "The caught kite",
    feeling: "feeling stuck",
    caption: "Made to fly. Stuck here.",
    placement: "torn",
    subject: "a bright torn kite tangled in a knot of black electric wires above a crowded street, its tail twisting in the wind, straining to get free",
    palette: "kite yellow and red against smoky grey sky",
    phrases: ["feeling stuck", "i'm stuck", "im stuck", "feel trapped", "can't breathe", "cant breathe", "no way out", "same every day", "same thing every day", "can't escape", "suffocating"],
    words: ["stuck", "trapped", "suffocating", "pressure", "cage", "escape", "caged"],
  },
  {
    id: "burning-letter",
    name: "The burning letter",
    feeling: "anger and hurt",
    caption: "I wrote it all. Then I lit it.",
    placement: "cutout", ground: "black",
    subject: "a clenched hand holding a crumpled letter that has caught fire at one corner, bright orange flame, sparks and black smoke curling up",
    palette: "fire orange, charcoal, ash white",
    phrases: ["sick of it", "i'm done", "im done", "how dare", "why did you", "you lied", "stop texting", "i hate", "hate you", "enough", "so tired of you", "get lost"],
    words: ["hate", "angry", "sick", "done", "lied", "liar", "lies", "stop", "enough", "worst", "pissed"],
  },
  {
    id: "inward-lighthouse",
    name: "The inward lighthouse",
    feeling: "wanting to be left alone",
    caption: "All my light, turned inward.",
    placement: "full",
    subject: "a tall lighthouse on a black rock in a rough sea, its beam bent down and shining back onto its own walls, the ships around it left in the dark",
    palette: "night blue, foam white, one warm yellow beam",
    phrases: ["leave me alone", "need space", "need some space", "don't text me", "dont text me", "go away", "let me be", "don't call", "dont call", "i want to be alone"],
    words: ["alone", "space", "block", "blocked", "leave", "away"],
  },
  {
    id: "stitched-heart",
    name: "The stitched heart",
    feeling: "slowly healing",
    caption: "Still mending. Still beating.",
    placement: "cutout", ground: "white",
    subject: "a big red heart roughly sewn back together with thick white thread, crooked stitches, the needle still hanging from the last stitch",
    palette: "warm red, cream, a touch of pink",
    phrases: ["getting better", "moving on", "i'm healing", "im healing", "better now", "getting there", "one day at a time", "i'll be okay", "ill be okay"],
    words: ["healing", "heal", "better", "recover", "mend"],
  },
  {
    id: "wilting-bouquet",
    name: "The wilting bouquet",
    feeling: "love that wasn't returned",
    caption: "I brought you flowers. You brought me reasons.",
    placement: "cutout", ground: "white",
    subject: "a hand holding out a big bouquet of flowers that is wilting, heads drooping, petals dropping one by one to the floor",
    palette: "faded pinks and violets, dry green, soft grey",
    phrases: ["just friends", "not interested", "don't feel the same", "dont feel the same", "i'm sorry but", "im sorry but", "not like that", "see you as a friend", "it's not you", "trying to love", "sorry for trying", "okay with a no", "ok with a no", "deserve this", "some dignity", "wasn't enough", "not enough for you"],
    words: ["rejected", "dignity", "deserve", "enough"],
  },
  {
    id: "almost-hands",
    name: "Almost",
    feeling: "what could have been",
    caption: "Close enough to feel it. Never touching.",
    placement: "cutout", ground: "black",
    subject: "two hands reaching toward each other from opposite sides, fingertips a few centimetres apart, never touching, warm light caught between them",
    palette: "warm skin tones, gold light, deep shadow",
    phrases: ["what if", "if only", "could have", "should have", "maybe someday", "wrong time", "in another life", "almost"],
    words: ["maybe", "someday", "almost", "timing"],
  },
  {
    id: "held",
    name: "Held",
    feeling: "love and comfort",
    caption: "Home is a person.",
    placement: "full",
    subject: "two people holding each other tightly, seen from behind, one resting their head on the other's shoulder, under a huge warm evening sky over green hills",
    palette: "sunset orange, soft lilac, deep green",
    phrases: ["love you", "i'm here", "im here", "here for you", "proud of you", "always here", "with you", "kooode undu", "hug you"],
    words: ["love", "hug", "together", "proud", "always", "koode", "safe", "home"],
    unless: ["sorry", "hurt", "deserve", "but", "can't", "cant", "shouldn't", "never", "why", "trying", "no"],
  },
  {
    id: "rain-window",
    name: "The rain window",
    feeling: "quiet sadness",
    caption: "The rain says it for me.",
    placement: "full",
    subject: "a figure sitting on a windowsill hugging their knees, face hidden, heavy monsoon rain streaming down the glass, one small lamp lit in the dark room",
    palette: "rain grey-blue, lamp yellow, deep indigo",
    phrases: ["can't sleep", "cant sleep", "so tired", "feel empty", "feeling low", "not okay", "i cried", "crying", "3am", "3 am", "vishamam"],
    words: ["sad", "cry", "cried", "crying", "tired", "empty", "lonely", "down", "hurts", "pain"],
  },
  {
    id: "amma-kitchen",
    name: "Amma's kitchen",
    feeling: "a family's love",
    caption: "Love, asked as a question about food.",
    placement: "full",
    subject: "a mother's hands serving hot rice and curry onto a banana leaf, steam rising, a steel tumbler of water beside it, warm yellow kitchen light",
    palette: "turmeric yellow, banana-leaf green, warm brown",
    phrases: ["kazhicho", "did you eat", "have you eaten", "come home", "veetil vaa", "eppo varum", "when are you coming"],
    words: ["amma", "mom", "mum", "mother", "achan", "dad", "food", "eat", "home", "veedu", "chechi", "chetta"],
  },
  {
    id: "rooftop",
    name: "The rooftop",
    feeling: "friendship that stays",
    caption: "Still here. Always.",
    placement: "full",
    subject: "three friends sitting side by side on the edge of a rooftop at dusk, shoulders touching, legs dangling, the city lights coming on below",
    palette: "dusk violet, streetlight orange, deep blue",
    phrases: ["still here", "miss you guys", "we're here", "were here", "got your back", "always here da"],
    words: ["bro", "da", "machane", "macha", "dude", "friends", "guys", "brother"],
  },
  {
    id: "jar-of-planes",
    name: "The jar of paper planes",
    feeling: "words never sent",
    caption: "Everything I almost said.",
    placement: "cutout", ground: "white",
    subject: "a glass jar crammed full of folded paper planes that were never thrown, one crumpled plane pressed against the glass",
    palette: "paper white, ink blue, soft shadow",
    phrases: ["wanted to say", "never told you", "should have told", "i never said", "unsent", "i deleted"],
    words: ["deleted", "unsent", "typing"],
  },
  {
    id: "platform-clock",
    name: "The platform clock",
    feeling: "waiting for a reply",
    caption: "Seen. Still waiting.",
    placement: "full",
    subject: "a lone figure sitting on a bench at an empty railway platform at night, a huge station clock glowing above, the last train's lights disappearing in the distance",
    palette: "sodium orange, night blue, cold steel grey",
    phrases: ["are you there", "hello?", "why aren't you replying", "why arent you replying", "reply please", "left me on seen", "still waiting", "you there"],
    words: ["waiting", "wait", "reply", "seen", "hello"],
  },
  {
    id: "storm-boxer",
    name: "The storm boxer",
    feeling: "fighting to keep going",
    caption: "Knocked down. Getting up anyway.",
    placement: "full",
    subject: "a small boxer with taped hands standing firm in the middle of a violent storm, rain and wind lashing, refusing to fall",
    palette: "storm grey, electric blue, red gloves",
    phrases: ["keep going", "trying my best", "it's hard", "its hard", "so hard", "i'll survive", "ill survive", "fighting it"],
    words: ["fight", "fighting", "hard", "struggle", "struggling", "survive", "strong"],
  },
  {
    id: "shared-umbrella",
    name: "Crossing together",
    feeling: "hope, together",
    caption: "Knee-deep, and still laughing.",
    placement: "full",
    subject: "two small figures sharing one umbrella, wading hand in hand across a flooded monsoon road, water up to their knees, headlights glowing in the rain behind them",
    palette: "monsoon teal, warm headlight yellow, a red umbrella",
    phrases: ["figure it out", "we'll get through", "well get through", "we got this", "it'll be okay", "itll be okay", "together we", "we'll manage", "well manage", "we will make it", "nammal sheriyakkum"],
    words: ["together", "hope", "manage", "through"],
  },
  {
    id: "slipping-balloon",
    name: "The slipping balloon",
    feeling: "the \"but\" that's coming",
    caption: "Happiest right before the but.",
    placement: "cutout", ground: "white",
    subject: "a hand letting go of the string of a single big red balloon, the balloon just starting to drift upward out of reach, fingers still half open",
    palette: "balloon red, pale blue, soft grey",
    phrases: ["best thing", "we need to talk", "can we talk", "i have to tell you", "there's something", "theres something", "listen", "but..."],
    words: [],
    last: ["but", "but...", "but…", "however", "although"],
  },
  {
    id: "moon-ladder",
    name: "The ladder to the moon",
    feeling: "trying the impossible for someone",
    caption: "We went to the moon. You can come to me.",
    placement: "full",
    subject: "a small figure at the top of an impossibly tall, wobbling wooden ladder, stretching one hand up toward a huge glowing moon, the ground far below",
    palette: "night violet, moon cream, deep blue",
    phrases: ["why not", "went to the moon", "impossible", "anything for you", "i can't", "i cant", "not possible", "too far"],
    words: ["moon", "impossible", "stars", "reach"],
  },
];

const BY_ID = Object.fromEntries(IDEAS.map((i) => [i.id, i]));
export const ideaById = (id) => BY_ID[id] || null;

// Concrete things people mention that can be painted into the idea.
const DETAILS = ["moon", "rain", "sea", "beach", "chai", "coffee", "tea", "bus", "train", "flower", "flowers", "stars", "star", "sky", "night", "sunset", "river", "mountain", "car", "bike", "dog", "cat", "cake", "ring", "letter", "song", "guitar", "candle", "balloon"];

// Messages the page won't paint at all. Everything painted comes from the
// ideas above, so the image itself stays safe; this keeps hateful or sexual
// conversations from being turned into art at all.
const BLOCKED = /\b(nude|nudes|sex|sexy|porn|horny|naked|rape|kill yourself|kys)\b/i;

// messages: [{ side: "me" | "them", kind: "text" | "deleted" | "typing", text }]
// → { idea, score, matched: [..], detail, blocked }
export function readConversation(messages) {
  const texts = messages.map((m) =>
    m.kind === "deleted" ? "i deleted" : m.kind === "typing" ? "typing" : String(m.text || ""));
  const all = texts.join(" \n ").toLowerCase().replace(/[’‘]/g, "'");
  if (BLOCKED.test(all)) return { blocked: true };

  const last = (texts[texts.length - 1] || "").toLowerCase().replace(/[’‘]/g, "'");
  const tokens = all.split(/[^a-z0-9'ഀ-ൿ]+/).filter(Boolean);
  const lastTokens = new Set(last.split(/[^a-z0-9'ഀ-ൿ]+/).filter(Boolean));

  let best = null;
  for (const idea of IDEAS) {
    let score = 0;
    const matched = [];
    for (const p of idea.phrases) {
      if (all.includes(p)) {
        score += last.includes(p) ? 5 : 3;
        matched.push(p);
      }
    }
    for (const w of idea.words) {
      const hits = tokens.filter((t) => t === w).length;
      if (hits) {
        score += Math.min(hits, 2) * (lastTokens.has(w) ? 1.5 : 1);
        matched.push(w);
      }
    }
    if (idea.last && idea.last.includes(last.trim())) {
      score += 6;
      matched.push(`ends on "${last.trim()}"`);
    }
    if (score && idea.unless && idea.unless.some((w) => tokens.includes(w))) score -= 4;
    if (!best || score > best.score) best = { idea, score, matched };
  }
  // Nothing recognisable: short, unanswered or dry conversations read as waiting.
  if (!best || best.score < 1) best = { idea: BY_ID["platform-clock"], score: 0, matched: [] };
  const detail = DETAILS.find((d) => tokens.includes(d)) || null;
  return { ...best, detail, blocked: false };
}

// The image model's brief. Medium first and last (image models weigh the
// start most), the idea's subject and palette in the middle.
const MEDIUM =
  "A thick impasto oil painting on canvas: big chunky directional brushstrokes, every stroke a separate dab of unblended paint, loose naive expressive drawing";
const FINISH =
  "real oil paint texture, visible bristle and palette-knife marks, raw unfinished edges, traditional oil on canvas, not a photograph, not digital art, not 3D, no text, no letters";

export function ideaPrompt(idea, placement, detail) {
  const where = placement === "cutout"
    ? `the subject alone on a flat plain ${idea.ground || "black"} painted background, nothing else in the frame, large and filling the lower two thirds, empty ${idea.ground || "black"} space above`
    : placement === "torn"
      ? "the subject large in the lower half of the canvas, painted edge to edge"
      : "painted edge to edge, the upper third calm and open";
  const extra = detail ? `, with a ${detail} somewhere in the picture` : "";
  return `${MEDIUM}: ${idea.subject}${extra}. Palette: ${idea.palette}. ${where}. ${FINISH}.`.slice(0, 1900);
}
