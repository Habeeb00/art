# Unsaid

Turn a conversation into an expressive painting. The chat records what was
said; the painting holds everything that wasn't.

Inspired by Amaan Jahangir's *Mixed Messages*
([@amaanjahangir](https://www.instagram.com/amaanjahangir/)). This project
builds its own visual language and never uses his work as a reference.

One Cloudflare project on the free tier. No framework, logins, database or
API keys. Nothing is stored: the user downloads their painting.

```
screenshot ──► OCR on the device (Tesseract) ──► messages (editable)
typed chat ───────────────────────────────────┘        │
                                                        ▼
                              idea book (public/ideas.js): clear rules pick
                              one of 21 ideas (joker, empty chair, caught kite…)
                                                        │
                              image model paints the idea's subject
                              (Workers AI FLUX via /api/paint, or Pollinations in ?preview)
                                                        │
                              the page repaints it with eleven brush marks,
                              then lays it behind / beside / through the chat,
                              never over the words
```

## How it works

1. **Read.** Upload a chat screenshot and the text is read on the device
   (Tesseract OCR, loaded from jsDelivr). Lines are grouped into messages
   (right side = me, left = them); timestamps, ticks, headers and the input bar
   are dropped. You can correct the messages, or type a chat instead.
2. **Decide.** `public/ideas.js` is an idea book of 21 original ideas, each a
   feeling turned into one big subject, with a palette, a placement and a
   caption. Clear rules pick one: phrases outweigh words, the last message
   counts most, and "unless" words cancel an idea ("love you" plus "sorry"
   isn't comfort). The page shows which words picked it; the **Idea** picker
   overrides it. No language model is involved.
3. **Paint.** The image model paints only the idea's subject. The page then
   repaints it by hand from **eleven brush marks** (flat, round, filbert, dry,
   knife, scumble, dab, fan, rigger, sweep, stipple), big to small, following
   the forms, in a reduced palette (`paintify` in `public/app.js`).
4. **Compose.** On a screenshot, each bubble's shape is traced from its text
   in its own colour, and the painting goes:
   - **Painting behind**: everywhere except the bubbles, with the bubble edges
     brushed into the paint;
   - **Torn edge**: below a torn, brushy edge, the chat's own ground kept
     around the words;
   - **One character**: the subject alone, stepping in front of the chat but
     never over a word.

## Run it

```sh
npm install
npm test                  # idea rules + worker, offline
npm run preview           # http://localhost:8000/?preview — real paintings via Pollinations, no account
npx wrangler login        # free Cloudflare account
npm run deploy            # live, with Workers AI
```

`?demo` paints random local paint (no AI, never matches the words), for working
on layout offline. `npm run test:e2e` runs the real page and real OCR in a
browser (once: `npx playwright install chromium`); pictures land in `tests/out/`.

Working on it with Claude Code? `CLAUDE.md` has the full context and decisions,
and `docs/HISTORY.md` the story so far.

## Rate limit (optional)

```sh
npx wrangler kv namespace create LIMITS
```

Paste the id into the commented `[[kv_namespaces]]` block in `wrangler.toml`.
`DAILY_LIMIT` (default 3) is paintings per IP per UTC day. Without KV, only
Cloudflare's shared daily allowance applies (about 150 paintings/day; resets
at 00:00 UTC / 5:30 AM IST).

## Files

| File | What |
| --- | --- |
| `wrangler.toml` | AI binding, static assets, optional KV |
| `src/worker.js` | `/api/paint`: validate → pick the idea → rate limit → FLUX painting |
| `public/ideas.js` | The idea book: 21 ideas, the rules that pick one, and the image prompt. Shared by the worker and the page |
| `public/index.html` | Page, composer, preview |
| `public/app.js` | Screenshot reading and bubble tracing, the eleven brush marks and repaint, compositions, drawn bubbles for typed chats, download |
| `public/strokes/` | Optional scanned brush-stroke PNGs, see its README |

## Painted by hand, not by the model

The image model only decides *what* is painted. Every generated image is then
repainted in the browser, stroke by stroke (`paintify` in `public/app.js`):
thousands of thick impasto dabs that follow the forms, coarse to fine, pulled
to a reduced palette, each with a light-catching ridge. Flat areas stay calm;
cut-out subjects keep raw, brushy edges. The same brush paints the bubbles (a
brushed fill and a brushy outline, with crisp words on top), and one canvas
weave covers everything, so words and picture read as one painted surface.
It takes a second or two on a laptop, a few on a phone.

## Tuning

- **Ideas** (`public/ideas.js`): add ideas, or add phrases and words to an idea's triggers. Every idea is one big subject.
- **Brush** (`chooseMark` and `paintify` in `public/app.js`): which marks are used where, stroke sizes, colour variation.
- **Paint amount** slider: how many bubbles get paint and how far it bites in. Above ~60%, strokes occasionally cross a word.
- **Remix** is instant and free. **New painting** spends allowance.

## Privacy

Conversations pass through the worker to Workers AI and are not stored or logged by this app.
