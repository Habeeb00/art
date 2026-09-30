# Unsaid: context for Claude Code

Read this first. It holds everything decided so far, so a new session can carry
on without the original conversation. The story of how we got here, round by
round, is in `docs/HISTORY.md`.

## What it is

Upload a chat screenshot (or type a chat). The app reads it, decides what it is
*really* saying, and turns it into an expressive oil painting laid behind,
beside or through the chat bubbles. "The chat records what was said; the
painting holds everything that wasn't."

- Owner: Habeeb (habeeb00 on GitHub). Kerala-based; audience includes Manglish
  and Malayalam chats, campus communities.
- Inspired by Amaan Jahangir's *Mixed Messages* (@amaanjahangir). **Hard rule:
  never copy his paintings or use his work as reference or training data.**
  Learn principles only; credit him on the page and in launch posts. The
  reference screenshots Habeeb shared are his work, so they are described in
  words below, never committed to the repo.
- **Budget: ₹0.** One Cloudflare project on the free tier (Workers + static
  assets + Workers AI, optional KV). No framework, no logins, no database, no
  API keys. Nothing is stored; the user downloads the PNG (1080×1350, 4:5 for
  Instagram).

## How it works

```
screenshot ─► OCR on the device ─► messages (editable) ◄─ or a typed chat
                                        │
                     idea book: clear rules pick 1 of 21 ideas   (public/ideas.js)
                                        │
                     image model paints only the idea's subject
                       live:     POST /api/paint → Workers AI FLUX.1 schnell (src/worker.js)
                       ?preview: Pollinations FLUX, straight from the browser
                                        │
                     paintify: repainted by hand from 11 brush marks   (public/app.js)
                                        │
                     composed with the chat: behind / torn edge / one character,
                     never over the words
```

1. **Read** (`readScreenshot`, `textOnly`, `parseShot` in `app.js`). Tesseract.js
   5.1.1 loads from jsDelivr and runs on the device. Before OCR, `textOnly`
   maps each pixel to "how much it stands out from a blurred copy", so text of
   any colour (dark mode, white on blue) becomes dark on white. Without this,
   Tesseract read almost nothing from a dark-mode WhatsApp shot. Lines are
   grouped into messages: right side = "me", left = "them". The status bar,
   header, input bar, bare times, receipts and dates are dropped, and trailing
   "11:42 pm ✓✓" is stripped (OCR reads the ticks as `4)` or `~)`).
2. **Decide** (`public/ideas.js`, shared by page and worker). 21 original
   ideas. Each has: id, name, feeling, caption, placement, ground, subject,
   palette, phrases, words, and optionally `unless` and `last`. Scoring:
   - a phrase is worth 3, or 5 if it's in the last message;
   - a word is worth 1 per hit (max 2), ×1.5 if it's in the last message;
   - a `last` exact match (e.g. a final "but") is worth 6;
   - any `unless` word takes 4 off (so "love you" + "sorry" isn't comfort);
   - if nothing scores, the chat reads as "waiting" (platform clock).
   A small blocklist refuses sexual/hateful chats. The page shows which words
   picked the idea, and the Idea picker overrides it. **No language model is
   used**: an earlier LLM scene writer (Llama, then Pollinations text) was
   vague and unreliable, and Habeeb asked for clear, authored ideas.
3. **Paint.** The image model only paints the subject. `ideaPrompt` puts the
   oil medium first and last, because FLUX weighs the start of a prompt most.
   Cut-outs ask for a flat black/white ground.
4. **Repaint** (`paintify`, `chooseMark`, `paintMark` + the `draw*` marks).
   FLUX output looked like generic smooth "digital oil", so every image is
   repainted in the browser:
   - a flow field from a structure tensor on a quarter-size copy;
   - a 12-colour k-means palette;
   - layers of radius 40 / 22 / 11 / 5: big strokes everywhere, then smaller
     ones only where there's detail (energy percentiles);
   - calm areas get less colour jitter and longer strokes.
   The **11 marks** are flat, round, filbert, dry, knife, scumble, dab, fan,
   rigger, sweep and stipple. Scanned PNGs in `public/strokes/` can replace any
   of them (see `strokes/README.md`).
5. **Compose.**
   - *Screenshots* (`analyseShot`, `shotLayout`, `renderShot`): the background
     is the commonest colour outside the text boxes. Each bubble's colour is
     the commonest colour inside its text box, and the bubble is flood-filled
     from there. The tolerance is `0.45 × distance(bubble, background)`,
     clamped 5–28, because dark-mode bubbles sit close to the background.
     The shot is zoomed so lines are about 60px, capped so the block fits
     (3% overflow allowed), then cropped to 4:5 with the chat clutter removed.
     The layouts:
     - `full`: painting everywhere but the bubbles; bubble edges get dabs in
       their own colour, only where paint touches them;
     - `torn`: a torn brushy edge below the words;
     - `cutout`: the subject keyed from its ground (flood fill from the image
       border, so white faces inside the subject survive), drawn in front of
       the chat with text boxes cleared.
   - *Typed chats*: bubbles are drawn (WhatsApp/iMessage, light/dark theme
     picked from what's behind them, typing dots, iMessage date stamp and
     "Read 23:47"). Most bubbles are left clean; "Paint on the bubbles"
     (amount) controls occasional edge, corner, halo or swallow treatments.
   - Finally, a canvas weave and grain cover everything, so words and paint
     read as one surface.

## Files

| Path | What |
| --- | --- |
| `public/index.html` | The page: one column, frame = drop zone, Remix / New painting / Download, Idea + Layout pickers, folded "The messages" and "More options" |
| `public/app.js` | Everything in the browser. Sections are marked `// ── name ──`: composer, layout, bubbles, look, paint-over strokes, the eleven strokes, painterly repaint, compositions, screenshots, render, painting, demo |
| `public/ideas.js` | The idea book and rules. Edit this to change what gets painted |
| `src/worker.js` | `POST /api/paint`: validate → idea → per-IP KV limit → FLUX → `{ image, idea, placement, matched }` |
| `wrangler.toml` | AI binding, assets, `DAILY_LIMIT`, commented KV block |
| `tests/` | `ideas.test.mjs` + `worker.test.mjs` (`npm test`); `e2e.mjs` (`npm run test:e2e`); `serve.mjs` (`npm run preview`); `fixtures/` (a fake dark WhatsApp screenshot we generated, and a smooth stand-in subject) |

## Commands

```sh
npm install                        # wrangler, playwright, tesseract (for tests)
npm test                           # idea rules + worker, no network
npx playwright install chromium    # once, for e2e
npm run test:e2e                   # real page + real OCR, offline; pictures in tests/out/
npm run preview                    # http://localhost:8000/?preview (Pollinations) or ?demo (no AI)
npx wrangler login && npm run deploy   # go live on Cloudflare (free)
```

Page modes: no flag = the live worker at `/api/paint`; `?preview` = Pollinations
image from the browser (no Cloudflare needed); `?demo` = random local paint, no
AI (it never matches the words, which confused an early test).

Anyone can try any commit, no setup:
`https://raw.githack.com/Habeeb00/art/<commit-sha>/public/index.html?preview`

## What Habeeb wants (feedback so far)

- Painting **must convey the message**; one big, clear subject, often a phrase
  taken literally. People and characters are welcome, not only scenery (a
  joker for pretending to be fine or heartbreak).
- **Oil painting vibe, large chunky strokes**, like his clown reference: thick
  impasto dabs, whites mixed with blues, pinks and greys, light catching ridges.
  Not smooth, not generic.
- Chat and painting must **not look like separate layers**.
- **Not always full-bleed**: sometimes behind everything, sometimes just one
  character, sometimes a torn edge. Bubbles mostly clean; paint on words is
  rare.
- Only oil strokes. **No paper doodles, ink scribbles or pastel scribbles**
  (removed on request).
- A **simple UI**. He tests on an iPhone; now also has a laptop.
- Ideas authored by us, not invented by a model.

### The reference set, in words (his Mixed Messages, not to be copied)

- One big subject per painting, often cut out on pure black or white.
- The subject sometimes overlaps a bubble's edge or receipt.
- Bubbles are real iMessage bubbles: big text, sometimes cropped by the frame
  edge, typing dots used for tension.
- Phrases painted literally, e.g. "trapped" → a race car wedged in a room;
  "fighting the dragon" → a dragon.
- Paintings are chunky impasto with a tight 2–3 colour palette. One busy piece
  had children's-drawing scribbles.

## Known gaps / next steps

1. **Not yet seen with real model output.** This environment blocked
   Pollinations, Cloudflare and jsDelivr, so every visual check used stand-in
   images. First job: deploy (or use `?preview`), paint the idea test chats,
   then tune `paintify` stroke sizes, jitter and ridges, and the cut-out
   keying against real FLUX images.
2. **Deploy to Cloudflare.** `npx wrangler login && npm run deploy`. Optional
   KV limit: `npx wrangler kv namespace create LIMITS`, paste the id into
   `wrangler.toml`, deploy again. The free allowance (10k neurons/day, resets
   00:00 UTC = 5:30 AM IST) is shared by all users.
3. **Malayalam OCR untested** ("Malayalam in the screenshot" loads `eng+mal`).
   Real iPhone/Android screenshots are untested too (only our generated fake).
4. **Screenshot text size**: bubbles stay about phone-size. Zooming further
   would crop the right-hand bubbles.
5. **Idea coverage**: add ideas and phrases as real chats come in. Add a case
   to `tests/ideas.test.mjs` for each fix.
6. Performance: the repaint takes ~1.5–3s on a laptop and more on phones.
   OCR takes ~2–5s.
7. From the original plan, later: Turnstile if bots appear; Pollinations as a
   fallback when the allowance runs out; our own SDXL LoRA trained on
   Habeeb's paintings (Colab); reels with bubbles appearing one by one;
   prints; small UPI payment for extra paintings. Launch plan: post 10–15
   pieces as a series first, then reveal the tool. Hook: "Type a message you
   never sent. We'll paint it."

## Conventions

- Plain JS, no build step, no framework. Match the existing comment style:
  short comments on *why*, sections marked `// ── name ──`.
- Keep the page working at phone width (16px gutters, no sideways scroll).
- Anything the page and worker both need goes in `public/ideas.js`.
- Before pushing: `npm test`, and `npm run test:e2e` for UI or painting changes.
