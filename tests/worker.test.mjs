// Worker tests: no Cloudflare account needed. The AI binding and KV are faked.
// Run: npm test
import assert from "node:assert/strict";
import worker from "../src/worker.js";

const kv = new Map();
let lastPrompt = "";
const env = (imageError) => ({
  ASSETS: { fetch: () => new Response("asset") },
  DAILY_LIMIT: "3",
  LIMITS: { get: async (k) => kv.get(k) ?? null, put: async (k, v) => kv.set(k, v) },
  AI: {
    run: async (_model, input) => {
      lastPrompt = input.prompt;
      if (imageError) throw new Error(imageError);
      return { image: "QUJD" };
    },
  },
});
const post = (body, ip = "1.1.1.1") =>
  new Request("https://x/api/paint", { method: "POST", body: JSON.stringify(body), headers: { "CF-Connecting-IP": ip } });
const call = async (req, e = env()) => {
  const res = await worker.fetch(req, e);
  return { status: res.status, body: await res.json().catch(() => null) };
};
const msgs = (...pairs) => pairs.map(([side, text, kind]) => ({ side, text, kind: kind || "text" }));

let passed = 0;
const test = async (name, fn) => {
  await fn();
  passed++;
  console.log(`ok  ${name}`);
};

await test("reads the chat and picks the joker for pretending to be fine", async () => {
  const r = await call(post({ messages: msgs(["them", "have you been okay?"], ["me", "yes"]) }));
  assert.equal(r.status, 200);
  assert.equal(r.body.idea.id, "joker");
  assert.equal(r.body.placement, "cutout");
  assert.match(r.body.image, /^data:image\/jpeg;base64,/);
  assert.match(lastPrompt, /^A thick impasto oil painting/);
  assert.match(lastPrompt, /joker/);
});

await test("an idea and layout picked on the page override the rules", async () => {
  const r = await call(post({ messages: msgs(["me", "hi"]), idea: "kite-wires", placement: "full" }, "2.2.2.2"));
  assert.equal(r.body.idea.id, "kite-wires");
  assert.equal(r.body.placement, "full");
});

await test("per-IP daily limit (KV)", async () => {
  kv.clear();
  for (let i = 0; i < 3; i++) assert.equal((await call(post({ messages: msgs(["me", "hi"]) }, "3.3.3.3"))).status, 200);
  const r = await call(post({ messages: msgs(["me", "hi"]) }, "3.3.3.3"));
  assert.equal(r.status, 429);
  assert.equal(r.body.limited, true);
});

await test("blocked conversations are refused", async () => {
  const r = await call(post({ messages: msgs(["me", "send nudes"]) }, "4.4.4.4"));
  assert.equal(r.status, 422);
});

await test("used-up daily allowance gives the 5:30 AM message", async () => {
  const r = await call(post({ messages: msgs(["me", "hi"]) }, "5.5.5.5"), env("4006: daily free allocation of 10,000 neurons"));
  assert.equal(r.status, 429);
  assert.equal(r.body.quota, true);
});

await test("validation, method and routing", async () => {
  assert.equal((await call(post({ messages: [] }))).status, 400);
  assert.equal((await call(post({ messages: msgs(["me", "x".repeat(301)]) }))).status, 400);
  assert.equal((await worker.fetch(new Request("https://x/api/paint"), env())).status, 405);
  assert.equal((await worker.fetch(new Request("https://x/api/nope"), env())).status, 404);
  assert.equal(await (await worker.fetch(new Request("https://x/"), env())).text(), "asset");
});

console.log(`\n${passed} worker tests passed`);
