# Unsaid

Turn a conversation into an expressive painting. The chat records what was
said; the painting holds everything that wasn't.

Inspired by Amaan Jahangir's *Mixed Messages*
([@amaanjahangir](https://www.instagram.com/amaanjahangir/)). This project
builds its own visual language and never uses his work as a reference.

One Cloudflare project on the free tier. No framework, logins, database or
API keys. Nothing is stored: the user downloads their painting.

```
browser (index.html + app.js)
   │  POST /api/paint { messages, mood }
   ▼
Cloudflare Worker (src/worker.js)
   ├─ env.AI → Llama 3.1 8B   : conversation → scene JSON
   └─ env.AI → FLUX.1 schnell : scene prompt → painting (base64)
   ▼  { image, scene }
browser canvas: painting → strokes under → bubbles → strokes over → PNG
```

## Run it

```sh
npm install
npx wrangler login      # free Cloudflare account
npm run dev             # http://localhost:8787 (Workers AI runs remotely, uses your allowance)
npm run deploy
```

**No account yet?** Open `public/index.html` through any static server with
`?demo` (e.g. `python3 -m http.server -d public` → `http://localhost:8000/?demo`).
Demo mode paints a procedural canvas locally, so you can work on bubbles and
strokes without spending AI allowance.

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
| `src/worker.js` | `/api/paint`: validate → rate limit → scene → painting. The house **style phrase** and **scene prompt** live at the top; tune them. |
| `public/index.html` | Page, composer, preview |
| `public/app.js` | Bubble layout (WhatsApp / iMessage), bristle paint-over strokes, download |
| `public/strokes/` | Optional scanned brush-stroke PNGs, see its README |

## Tuning

- **Style phrase** (`STYLE` in `src/worker.js`): tune until 8 of 10 results feel like the same painter.
- **Paint amount** slider: stroke count and how far strokes bite into bubbles. Above ~60%, strokes occasionally cross a word.
- **Repaint strokes** is instant and free (new seed). **New painting** spends allowance.

## Privacy

Conversations pass through the worker to Workers AI and are not stored or logged by this app.
