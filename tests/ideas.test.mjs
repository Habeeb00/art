// The idea rules against conversations like the reference set and a few
// Manglish ones. Run: npm test
// When you add or change an idea, add a case here.
import assert from "node:assert/strict";
import { readConversation, IDEAS, ideaPrompt } from "../public/ideas.js";

const T = (...pairs) => pairs.map(([side, text, kind]) => ({ side, text, kind: kind || "text" }));
const cases = [
  ["have you been okay? / yes", T(["them", "have you been okay?"], ["me", "yes"]), "joker"],
  ["you been good? / perfect", T(["them", "you been good?"], ["me", "perfect"]), "joker"],
  ["im fine da, kuzhappamilla", T(["them", "entha pattiye?"], ["me", "onnumilla, im fine da"], ["me", "kuzhappamilla"]), "joker"],
  ["I love you but we shouldn't speak", T(["them", "I love you but we shouldn’t speak"]), "pinned-heart"],
  ["I miss you so much / typing", T(["them", "I miss you so much"], ["them", "", "typing"]), "empty-chair"],
  ["feeling trapped", T(["me", "I’ve been feeling trapped lately"]), "kite-wires"],
  ["fighting the dragon", T(["me", "what have you been up to?"], ["them", "fighting the dragon"]), "storm-boxer"],
  ["sorry for trying to love you", T(["me", "I don’t know what I did to deserve this"], ["me", "I would be okay with a no, it would hurt"], ["me", "I am sorry for trying to love you"]), "wilting-bouquet"],
  ["we'll figure it out", T(["me", "we’ll figure it out"]), "shared-umbrella"],
  ["amma kazhicho", T(["them", "kazhicho?"], ["me", "kazhichu amma"], ["them", "eppo varum?"]), "amma-kitchen"],
  ["bro still here da", T(["them", "bro you just disappeared"], ["me", "yeah sorry"], ["them", "we are still here da"]), "rooftop"],
  ["best thing ... but", T(["them", "I can honestly say you are the best thing that has ever happened to me"], ["them", "but"]), "slipping-balloon"],
  ["we went to the moon", T(["them", "I can’t"], ["me", "why not?"], ["me", "we went to the moon"]), "moon-ladder"],
  ["i love you (happy)", T(["me", "i love you"], ["them", "love you more"]), "held"],
  ["nothing to read", T(["them", "you up?"], ["me", "yeah"]), "platform-clock"],
];

let failed = 0;
for (const [name, messages, want] of cases) {
  const r = readConversation(messages);
  const ok = r.idea.id === want;
  if (!ok) failed++;
  console.log(`${ok ? "ok " : "FAIL"} ${name.padEnd(36)} → ${r.idea.id}${ok ? "" : ` (wanted ${want})`}  ${JSON.stringify(r.matched)}`);
}

assert.equal(readConversation(T(["me", "send nudes"])).blocked, true);
assert.equal(readConversation(T(["me", "the moon was out"])).detail, "moon");
for (const idea of IDEAS) {
  for (const key of ["id", "name", "feeling", "caption", "placement", "subject", "palette", "phrases", "words"]) {
    assert.ok(idea[key] !== undefined, `${idea.id} is missing ${key}`);
  }
  const p = ideaPrompt(idea, idea.placement, null);
  assert.match(p, /^A thick impasto oil painting/);
  assert.match(p, /no text, no letters\.$/);
}
assert.equal(new Set(IDEAS.map((i) => i.id)).size, IDEAS.length, "idea ids must be unique");

if (failed) {
  console.error(`\n${failed} idea case(s) failed`);
  process.exit(1);
}
console.log(`\n${cases.length} idea cases passed, ${IDEAS.length} ideas checked`);
