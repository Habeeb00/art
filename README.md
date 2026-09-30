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

**No account yet?** Serve `public/` with any static server
(`python3 -m http.server -d public`) and open:

- `http://localhost:8000/?preview` for **real paintings**. The browser calls
  Pollinations' free, keyless models (an OpenAI-compatible scene writer and
  FLUX) using the same scene prompt and style phrases as the worker
  (`public/scene.js`). It's slower and less predictable than Workers AI, but
  it's the quickest way to judge whether paintings read.
- `http://localhost:8000/?demo` for random local paint with no AI, for working
  on bubbles and strokes offline. It never matches the words.

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
| `src/worker.js` | `/api/paint`: validate → rate limit → scene → painting. Uses the prompt and style phrases in `public/scene.js`. |
| `public/scene.js` | Scene prompt, style phrases and scene parsing, shared by the worker and `?preview` |
| `public/index.html` | Page, composer, preview |
| `public/app.js` | Bubbles (WhatsApp / iMessage, light and dark), compositions, brush tools, download |
| `public/strokes/` | Optional scanned brush-stroke PNGs, see its README |

## How each piece looks

The scene writer picks a **treatment** with the painting, and the page lays it out:

- **Cut-out**: one subject alone on flat black or white. The words sit in the
  empty space above it, and the subject can step in front of the bubbles
  (never over the words).
- **Full painting**: edge to edge, bubbles laid simply on top.
- **Torn edge**: bare black or white where the words sit, the painting beyond a
  torn, brushy edge.

You can also pick one yourself. Bubbles follow what's behind them (dark
bubbles on dark paint, light on light), a few messages get big type, and
iMessage gets its date stamp, "Read 23:47" receipts and **typing…** dots.

Most bubbles stay clean. **Paint amount** decides how often one gets worked:
a stretch of edge, a corner, a halo, or the painting swallowing the tail end
of the line. It's all oil brushwork: bristle, palette knife and impasto dabs. **Remix** re-rolls those details, the brush mix, whether
a bubble runs off the edge and whether the subject steps in front. It's
instant and free.

## Painted by hand, not by the model

The image model only decides *what* is painted. Every generated image is then
repainted in the browser, stroke by stroke (`paintify` in `public/app.js`):
thousands of thick impasto dabs that follow the forms, coarse to fine, pulled
to a reduced palette, each with a light-catching ridge. Flat areas stay calm;
cut-out subjects keep raw, brushy edges. The same brush paints the bubbles (a
brushed fill and a brushy outline, with crisp words on top), and one canvas
weave covers everything, so words and picture read as one painted surface.
It takes a second or two on a laptop, a few on a phone.

## Scenes that read

The scene writer finds the phrase or feeling at the heart of the conversation
and paints it **literally**, as one big subject in a tight palette. For
example, "I'm fine" becomes a tower of teacups on one trembling hand. Its
examples are original, not taken from *Mixed Messages*. It defaults to Llama
3.3 70B (`SCENE_MODEL` in `wrangler.toml`), which reads subtext far better than
8B but uses more of the free daily allowance. `?demo` paintings are random
local paint and never match the words.

## Tuning

- **Style phrases** (`STYLES` in `public/scene.js`): tune until 8 of 10 results feel like the same painter.
- **Paint amount** slider: how many bubbles get paint and how far it bites in. Above ~60%, strokes occasionally cross a word.
- **Remix** is instant and free. **New painting** spends allowance.

## Privacy

Conversations pass through the worker to Workers AI and are not stored or logged by this app.
