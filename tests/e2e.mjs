// End-to-end: the real page in a real browser, offline.
// - serves public/ itself
// - the OCR engine (normally from jsDelivr) is served from node_modules
// - the image model (Pollinations in ?preview) is replaced by a fixture image
// Checks: typed chat → painting; screenshot → OCR → idea → painting in every
// layout; phone layout. Saves pictures to tests/out/ for a look.
//
// One-time setup:  npm install && npx playwright install chromium
// Run:             npm run test:e2e
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { chromium, devices } from "playwright";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = path.join(ROOT, "public");
const NM = path.join(ROOT, "node_modules");
const FIX = path.join(ROOT, "tests", "fixtures");
const OUT = path.join(ROOT, "tests", "out");
fs.mkdirSync(OUT, { recursive: true });

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".md": "text/plain" };
const server = http.createServer((req, res) => {
  const p = path.join(PUBLIC, decodeURIComponent(new URL(req.url, "http://x").pathname).replace(/\/$/, "/index.html"));
  if (!p.startsWith(PUBLIC) || !fs.existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": TYPES[path.extname(p)] || "application/octet-stream" });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const BASE = `http://localhost:${server.address().port}/?preview`;

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});

async function context(opts) {
  const ctx = await browser.newContext(opts);
  await ctx.route("https://cdn.jsdelivr.net/npm/**", async (route) => {
    const u = new URL(route.request().url()).pathname.replace(/^\/npm\//, "");
    const m = u.match(/^(@[^/]+\/[^@/]+|[^@/]+)(?:@[^/]+)?\/(.*)$/);
    const file = path.join(NM, m[1], m[2]);
    if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: "" });
    const type = file.endsWith(".wasm") ? "application/wasm" : "application/javascript";
    await route.fulfill({ status: 200, headers: { "access-control-allow-origin": "*", "content-type": type }, body: fs.readFileSync(file) });
  });
  await ctx.route("https://image.pollinations.ai/**", (route) => route.fulfill({
    status: 200,
    headers: { "access-control-allow-origin": "*", "content-type": "image/png" },
    body: fs.readFileSync(path.join(FIX, "smooth-subject.png")),
  }));
  await ctx.route("https://fonts.googleapis.com/**", (route) => route.fulfill({ status: 200, body: "" }));
  return ctx;
}
const save = async (page, name) => {
  const url = await page.evaluate(() => document.getElementById("canvas").toDataURL("image/png"));
  fs.writeFileSync(path.join(OUT, `${name}.png`), Buffer.from(url.split(",")[1], "base64"));
};
const idle = (page, ms = 120000) => page.waitForFunction(() => !document.getElementById("paint").disabled && !document.getElementById("overlay").classList.contains("show"), null, { timeout: ms });

let passed = 0;
const test = async (name, fn) => { await fn(); passed++; console.log(`ok  ${name}`); };

await test("typed chat → idea → repainted painting", async () => {
  const ctx = await context({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(BASE);
  await page.click("#type-instead");
  await page.click(".chip >> text=Amma");
  await page.click("#paint");
  await idle(page);
  assert.match(await page.textContent("#status"), /“/);
  assert.match(await page.textContent("#why"), /Amma's kitchen/);
  await save(page, "typed-amma");
  assert.deepEqual(errors, []);
  await ctx.close();
});

await test("screenshot → OCR → joker, in every layout", async () => {
  const ctx = await context({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(BASE);
  await page.setInputFiles("#shot", path.join(FIX, "chat-dark-whatsapp.png"));
  await page.waitForFunction(() => /“/.test(document.getElementById("status").textContent) || document.getElementById("status").classList.contains("error"), null, { timeout: 180000 });
  const read = await page.$$eval("#messages .msg", (rows) => rows.map((r) => [r.dataset.side, r.querySelector("input").value]));
  assert.deepEqual(read, [
    ["them", "hey, have you been okay?"],
    ["me", "yes"],
    ["them", "you sure? you went quiet"],
    ["me", "i'm fine, don't worry about me"],
  ]);
  assert.match(await page.textContent("#why"), /joker/i);
  await save(page, "shot-auto");
  for (const layout of ["full", "torn", "cutout"]) {
    await page.selectOption("#composition", layout);
    await page.click("#again");
    await idle(page);
    await save(page, `shot-${layout}`);
  }
  assert.deepEqual(errors, []);
  await ctx.close();
});

await test("phone layout: nothing floats over anything", async () => {
  const ctx = await context(devices["iPhone 13"]);
  const page = await ctx.newPage();
  await page.goto(BASE);
  await page.screenshot({ path: path.join(OUT, "phone-start.png"), fullPage: true });
  const frame = await page.$eval("#frame", (el) => getComputedStyle(el).position);
  assert.notEqual(frame, "sticky");
  const noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  assert.ok(noOverflow, "page scrolls sideways on a phone");
  await ctx.close();
});

await browser.close();
server.close();
console.log(`\n${passed} end-to-end tests passed. Pictures in tests/out/`);
