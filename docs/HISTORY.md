# How Unsaid got here

The first build session (a cloud Claude Code session, 30 Sept 2026), round by
round: what Habeeb asked for, what changed, and why. Current state and next
steps are in `CLAUDE.md`.

## 0. The plan

Habeeb shared a build plan ("Unsaid, free build plan") and two screenshots of
Amaan Jahangir's *Mixed Messages*: a chat bubble over an expressive oil
painting. The plan's main points:

- One Cloudflare project at ₹0: Workers, static assets, Workers AI (Llama 3.1
  8B for the scene, FLUX.1 schnell for the painting), optional KV rate limit.
- A composer with me/them messages, a WhatsApp or iMessage look and a mood.
- Canvas bubbles with paint-over strokes; Repaint strokes / New painting /
  Download.
- A 1080×1350 PNG. Credit Amaan; build our own visual language; local voice
  (Manglish, Malayalam, family, friends, grief, unsent messages).
- Privacy: nothing stored.

## 1. First build (`f2cc6f8`)

Built the plan as written: a worker with the Llama scene writer and FLUX, the
page, bubbles, a bristle-stroke engine, and a `?demo` mode (procedural paint,
no AI).

## 2. "Strokes all look the same; paint always covers the text the same way; the image doesn't convey the emotion" (`b467fa5`)

- Added compositions (full, torn edge, island), a different mix of tools per
  painting (bristle, knife, dab, scribble), and a treatment per bubble (clean,
  edge, corner, halo, swallow, scribble).
- Rewrote the scene prompt: one readable human moment, one symbolic detail,
  colour by mood. Moved to Llama 3.3 70B.
- Found that Habeeb had likely only seen `?demo` (random paint).

## 3. Reference samples, two batches (`6a20b87`)

Habeeb shared ~15 more *Mixed Messages* pieces. What we learned (described in
`CLAUDE.md`):

- Bubbles are mostly clean.
- Cut-outs on black or white.
- Phrases are painted literally, as one big subject.
- Big type, typing dots, cropped bubbles.

Changes:

- A cut-out composition, with the subject stepping in front of bubbles.
- A paper-doodle composition.
- Light/dark bubble themes, typing dots, iMessage date and "Read" receipts.
- Clean bubbles by default.
- A "phrase taken literally" prompt.
- Replaced a prompt example that echoed one of his paintings with original
  ones.

## 4. "Remove the paper doodles, I only want the strokes; the images don't convey the message" (`c45f25b`)

- Removed paper doodles, ink and pastel scribbles.
- Added `?preview`: Pollinations from the browser, so Habeeb could see real
  paintings without Cloudflare. The cloud environment blocked every AI host,
  so no real output could be checked from there.

## 5. "Styling/overlap issues; it isn't oil painting" (`2fe7a83`)

- The preview panel was sticky on phones and covered the composer. Fixed.
- Put the oil medium first and last in the prompt; stripped "photo" and
  "realistic"; turned off Pollinations' prompt rewriting.

## 6. Clown reference: "strokes like this, not generic; chat and painting shouldn't look like separate layers" (`1595f47`)

- **Hand repaint** (`paintify`): every generated image is rebuilt from thick
  impasto strokes along a flow field, in a reduced palette.
- The bubbles are painted with the same brush, and a canvas weave covers
  everything.
- Cut-out keying now floods from the border, so white faces aren't lost.

## 7. A painting of stock "paper boats" with no meaning (`90381a7`)

The Pollinations text model had failed, and the app silently painted a
fallback scene. Now it never paints a stock scene: preview tries three routes
and shows an error; the worker retries once and returns an error.

## 8. "Explain the logic. I want: upload a screenshot → read it → understand → paint on top of it; full, or just one character like a joker; 11 kinds of strokes; large oil strokes; people, not only scenery; you create clear ideas, don't just use Pollinations" (`de71a43`, `bc33e91`)

- **Idea book** (`public/ideas.js`): 21 authored ideas picked by rules. The
  LLM scene writer is gone from both the page and the worker.
- **Eleven brush marks** in the repaint.
- **Screenshot upload**:
  - Tesseract on the device, with a local-contrast pass so dark mode reads;
  - parsing into messages;
  - bubble tracing by flood fill with an adaptive tolerance;
  - zoom and crop;
  - three layouts that never cover words.

## 9. "Make the UI much simpler. I have a laptop now." (`3e54bc2`)

- One column. The frame is the drop zone (upload, drag, or paste), and one
  upload reads and paints.
- Under the painting: Remix, New painting and Download, plus Idea and Layout
  pickers.
- The messages and the options fold away.

## 10. Handoff

Habeeb left the cloud environment. Added `CLAUDE.md`, this file, and the tests
(`npm test`, `npm run test:e2e`) with fixtures, so work continues locally.
