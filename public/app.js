// Unsaid — composer, bubbles, paint-over strokes, download.
// Everything here runs in the browser. Only /api/paint touches the network.
(() => {
  "use strict";

  // ── constants ──────────────────────────────────────────────────────────────
  const W = 1080;
  const H = 1350;
  const FF = '"Noto Sans", "Noto Sans Malayalam", system-ui, -apple-system, "Segoe UI", sans-serif';
  const FONT_SIZE = 36;
  const LINE_H = 48;
  const PAD_X = 30;
  const PAD_Y = 20;
  const RADIUS = 34;
  const MAX_W = W * 0.7;
  const SIDE_MARGIN = 58;
  const META_SIZE = 24;
  const MAX_MESSAGES = 20;
  const MAX_CHARS = 300;
  const DEMO = new URLSearchParams(location.search).has("demo");

  const STYLES = {
    whatsapp: {
      bg: "#0B141A",
      me: "#005C4B", them: "#202C33",
      meText: "#E9EDEF", themText: "#E9EDEF",
      meMeta: "rgba(233,237,239,0.62)", themMeta: "rgba(233,237,239,0.62)",
      deleted: "rgba(233,237,239,0.62)",
      tick: "#53BDEB",
    },
    imessage: {
      bg: "#FFFFFF",
      me: "#0A84FF", them: "#E9E9EB",
      meText: "#FFFFFF", themText: "#000000",
      deleted: "#8E8E93",
    },
  };

  const EXAMPLES = {
    "Unsent": [
      ["me", "I made your chai today"],
      ["me", "it didn't taste right"],
      ["me", "I think the recipe was you"],
    ],
    "Amma": [
      ["them", "kazhicho?"],
      ["me", "kazhichu amma"],
      ["them", "sathyam para"],
      ["me", "sathyam 😅"],
      ["them", "എപ്പോ വരും? വീട് ഒഴിഞ്ഞ പോലെ"],
    ],
    "Almost": [
      ["me", "are you coming tonight"],
      ["them", "I don't think I can"],
      ["me", "okay"],
      ["me", "is it me", "deleted"],
      ["them", "it was never you"],
    ],
    "Da": [
      ["them", "bro you just disappeared"],
      ["me", "yeah sorry, things got a lot"],
      ["them", "we're still here da"],
      ["them", "always"],
      ["me", "I know"],
    ],
  };

  const WAITING_LINES = [
    "Reading between the lines…",
    "Finding what wasn't said…",
    "Mixing the paint…",
    "Laying down the first strokes…",
    "Letting it dry a little…",
  ];

  // ── state ──────────────────────────────────────────────────────────────────
  const state = {
    messages: [
      { side: "them", text: "you up?", kind: "text" },
      { side: "me", text: "yeah", kind: "text" },
      { side: "them", text: "I keep writing things and deleting them", kind: "text" },
      { side: "me", text: "me too", kind: "text" },
    ],
    style: "whatsapp",
    mood: "auto",
    showMeta: true,
    startTime: "23:41",
    amount: 55,
    composition: "auto",
    paintingId: 0,
    painting: null,     // HTMLCanvasElement, painting cropped to 1080×1350
    paintData: null,    // Uint8ClampedArray of the painting's pixels
    scene: null,
    strokeSeed: randSeed(),
    busy: false,
  };

  const strokeImages = []; // optional scanned brush strokes from /strokes/manifest.json

  // ── dom ────────────────────────────────────────────────────────────────────
  const $ = (id) => document.getElementById(id);
  const canvas = $("canvas");
  const ctx = canvas.getContext("2d");
  const els = {
    list: $("messages"), add: $("add"), examples: $("examples"),
    style: $("style"), composition: $("composition"), mood: $("mood"), time: $("time"), meta: $("meta"),
    paint: $("paint"), overlay: $("overlay"), overlayText: $("overlay-text"),
    status: $("status"), amount: $("amount"),
    repaint: $("repaint"), again: $("again"), download: $("download"),
  };

  // ── composer ───────────────────────────────────────────────────────────────
  function renderList() {
    els.list.innerHTML = "";
    state.messages.forEach((m, i) => {
      const row = document.createElement("div");
      row.className = "msg";
      row.dataset.side = m.side;

      const side = button("side", m.side === "me" ? "me" : "them", "Switch sender");
      side.addEventListener("click", () => {
        m.side = m.side === "me" ? "them" : "me";
        renderList();
        scheduleRender();
      });

      const input = document.createElement("input");
      input.type = "text";
      input.maxLength = MAX_CHARS;
      input.value = m.text;
      input.placeholder = m.side === "me" ? "What you said…" : "What they said…";
      input.disabled = m.kind === "deleted";
      input.setAttribute("aria-label", `Message ${i + 1}`);
      input.addEventListener("input", () => {
        m.text = input.value;
        scheduleRender();
      });
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.isComposing) {
          e.preventDefault();
          addMessage(i + 1, m.side === "me" ? "them" : "me");
        }
      });

      const kind = button("kind", "deleted", "Show as a deleted message");
      kind.setAttribute("aria-pressed", String(m.kind === "deleted"));
      kind.addEventListener("click", () => {
        m.kind = m.kind === "deleted" ? "text" : "deleted";
        renderList();
        scheduleRender();
      });

      const remove = button("remove", "✕", "Remove message");
      remove.addEventListener("click", () => {
        state.messages.splice(i, 1);
        if (!state.messages.length) state.messages.push({ side: "them", text: "", kind: "text" });
        renderList();
        scheduleRender();
      });

      row.append(side, input, kind, remove);
      els.list.append(row);
    });
    els.add.disabled = state.messages.length >= MAX_MESSAGES;
    els.add.textContent = els.add.disabled ? `That's ${MAX_MESSAGES}, the most we can paint` : "+ Add message";
  }

  function button(cls, text, label) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = cls;
    b.textContent = text;
    b.title = label;
    b.setAttribute("aria-label", label);
    return b;
  }

  function addMessage(at, side) {
    if (state.messages.length >= MAX_MESSAGES) return;
    state.messages.splice(at, 0, { side, text: "", kind: "text" });
    renderList();
    const inputs = els.list.querySelectorAll('input[type="text"]');
    inputs[at]?.focus();
    scheduleRender();
  }

  function renderExamples() {
    for (const name of Object.keys(EXAMPLES)) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip";
      chip.textContent = name;
      chip.addEventListener("click", () => {
        state.messages = EXAMPLES[name].map(([side, text, kind]) => ({ side, text, kind: kind || "text" }));
        renderList();
        scheduleRender();
      });
      els.examples.append(chip);
    }
  }

  // ── times ──────────────────────────────────────────────────────────────────
  function messageTimes(visible) {
    const [h, m] = (state.startTime || "23:41").split(":").map(Number);
    let mins = (h || 0) * 60 + (m || 0);
    const steps = [0, 1, 0, 2, 1, 0, 3, 1];
    return visible.map((msg, i) => {
      if (i > 0) mins += msg.side === visible[i - 1].side ? steps[i % steps.length] % 2 : steps[i % steps.length] + 1;
      return mins;
    });
  }

  function formatTime(mins, upper) {
    const h24 = Math.floor(mins / 60) % 24;
    const m = mins % 60;
    const h12 = h24 % 12 || 12;
    const ampm = h24 < 12 ? "am" : "pm";
    return `${h12}:${String(m).padStart(2, "0")} ${upper ? ampm.toUpperCase() : ampm}`;
  }

  // ── layout ─────────────────────────────────────────────────────────────────
  function visibleMessages() {
    return state.messages
      .filter((m) => m.kind === "deleted" || m.text.trim())
      .map((m) => ({ ...m, text: m.text.trim() }));
  }

  function layoutAt(scale) {
    const style = state.style;
    const fs = FONT_SIZE * scale;
    const lh = LINE_H * scale;
    const padX = PAD_X * scale;
    const padY = PAD_Y * scale;
    const metaFs = META_SIZE * scale;
    const textMax = MAX_W - PAD_X * 2;

    const visible = visibleMessages();
    const times = messageTimes(visible);
    const items = [];
    let y = 0;

    if (style === "imessage" && state.showMeta && visible.length) {
      items.push({ type: "header", y, h: metaFs * 1.4, text: `Today ${formatTime(times[0], true)}` });
      y += metaFs * 1.4 + 18 * scale;
    }

    // iMessage shows deletions as a centred note rather than a bubble.
    const isNote = (m) => style === "imessage" && m?.kind === "deleted";
    const sideOf = (m) => (m && !isNote(m) ? m.side : null);
    const lastMe = visible.reduce((acc, m, i) => (sideOf(m) === "me" ? i : acc), -1);

    visible.forEach((m, i) => {
      const side = sideOf(m);
      const first = side !== sideOf(visible[i - 1]);
      const last = side !== sideOf(visible[i + 1]);
      if (items.length && items[items.length - 1].type !== "header") y += (first ? 26 : 8) * scale;

      if (isNote(m)) {
        items.push({ type: "note", y, h: metaFs * 1.5, text: m.side === "me" ? "You unsent a message" : "They unsent a message" });
        y += metaFs * 1.5;
        return;
      }

      const deleted = m.kind === "deleted";
      const text = deleted ? (m.side === "me" ? "🚫 You deleted this message" : "🚫 This message was deleted") : m.text;
      ctx.font = `${deleted ? "italic " : ""}${fs}px ${FF}`;
      const lines = wrap(text, textMax);
      const widths = lines.map((l) => ctx.measureText(l).width);
      let contentW = Math.max(...widths);
      let extraH = 0;
      let meta = null;

      if (style === "whatsapp" && state.showMeta) {
        ctx.font = `${metaFs}px ${FF}`;
        const time = formatTime(times[i], false);
        const ticks = m.side === "me" && !deleted;
        const metaW = ctx.measureText(time).width + (ticks ? 34 * scale : 0);
        const lastW = widths[widths.length - 1];
        const inline = lastW + 14 * scale + metaW <= textMax;
        if (inline) contentW = Math.max(contentW, lastW + 14 * scale + metaW);
        else {
          contentW = Math.max(contentW, metaW);
          extraH = metaFs * 1.25;
        }
        meta = { time, ticks };
      }

      const h = lines.length * lh + padY * 2 + extraH;
      const w = Math.max(contentW + padX * 2, RADIUS * scale * 2 + 12);
      const x = m.side === "me" ? W - SIDE_MARGIN - w : SIDE_MARGIN;
      const tail = style === "whatsapp"
        ? (first ? (m.side === "me" ? "tr" : "tl") : null)
        : (last ? (m.side === "me" ? "br" : "bl") : null);

      items.push({ type: "bubble", x, y, w, h, side: m.side, deleted, lines, meta, tail, index: i });
      y += h;

      if (style === "imessage" && state.showMeta && i === lastMe) {
        items.push({ type: "receipt", y: y + 6 * scale, h: metaFs * 1.3, x: x + w, text: i === visible.length - 1 ? "Delivered" : "Read" });
        y += metaFs * 1.3 + 6 * scale;
      }
    });

    return { items, height: y, scale, fs, lh, padX, padY, metaFs, radius: RADIUS * scale };
  }

  function layout() {
    const margin = 96;
    let lay = layoutAt(1);
    for (let s = 0.95; lay.height > H - margin * 2 && s >= 0.5; s -= 0.05) lay = layoutAt(s);

    const space = state.scene?.negative_space || "centre";
    let top;
    if (space === "top") top = margin;
    else if (space === "bottom") top = H - margin - lay.height;
    else top = (H - lay.height) / 2;
    top = Math.max(margin * 0.6, top);
    for (const it of lay.items) it.y += top;
    lay.top = top;
    lay.space = space;
    return lay;
  }

  function wrap(text, max) {
    const out = [];
    for (const para of text.split("\n")) {
      const words = para.split(/\s+/).filter(Boolean);
      let line = "";
      for (let word of words) {
        const test = line ? `${line} ${word}` : word;
        if (ctx.measureText(test).width <= max) {
          line = test;
          continue;
        }
        if (line) out.push(line);
        // Break words that are wider than a whole line.
        let chars = Array.from(word);
        while (chars.length > 1 && ctx.measureText(chars.join("")).width > max) {
          let n = chars.length;
          while (n > 1 && ctx.measureText(chars.slice(0, n).join("")).width > max) n--;
          out.push(chars.slice(0, n).join(""));
          chars = chars.slice(n);
        }
        line = chars.join("");
      }
      if (line) out.push(line);
    }
    return out.length ? out : [""];
  }

  // ── drawing: background ────────────────────────────────────────────────────
  function drawPlain() {
    ctx.fillStyle = STYLES[state.style].bg;
    ctx.fillRect(0, 0, W, H);
    ctx.drawImage(grain(), 0, 0, W, H);
  }

  // ── drawing: bubbles ───────────────────────────────────────────────────────
  function drawItems(lay) {
    const S = STYLES[state.style];
    for (const it of lay.items) {
      if (it.type === "bubble") drawBubble(it, lay, S);
      else drawCaption(it, lay);
    }
  }

  function drawCaption(it, lay) {
    const cx = it.type === "receipt" ? it.x - 60 : W / 2;
    const bright = state.painting ? bgLuminance(cx, it.y + it.h / 2) > 150 : state.style === "imessage";
    const onPaint = state.painting && !bright;
    ctx.save();
    ctx.font = `${it.type === "header" ? "500 " : ""}${lay.metaFs}px ${FF}`;
    ctx.textBaseline = "middle";
    ctx.fillStyle = onPaint ? "rgba(255,255,255,0.94)" : bright && state.painting ? "rgba(40,36,32,0.85)" : "#8E8E93";
    if (onPaint) {
      ctx.shadowColor = "rgba(0,0,0,0.55)";
      ctx.shadowBlur = 8;
    }
    if (it.type === "receipt") {
      ctx.textAlign = "right";
      ctx.fillText(it.text, it.x - 6, it.y + it.h / 2);
    } else {
      ctx.textAlign = "center";
      ctx.fillText(it.text, W / 2, it.y + it.h / 2);
    }
    ctx.restore();
  }

  function drawBubble(b, lay, S) {
    const me = b.side === "me";
    ctx.save();
    bubblePath(ctx, b.x, b.y, b.w, b.h, lay.radius, b.tail, lay.scale);
    ctx.fillStyle = me ? S.me : S.them;
    ctx.fill();

    ctx.font = `${b.deleted ? "italic " : ""}${lay.fs}px ${FF}`;
    ctx.fillStyle = b.deleted ? (state.style === "whatsapp" ? S.deleted : me ? S.meText : S.themText) : me ? S.meText : S.themText;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    b.lines.forEach((line, i) => {
      ctx.fillText(line, b.x + lay.padX, b.y + lay.padY + lay.lh * (i + 0.5));
    });

    if (b.meta) {
      const baseY = b.y + b.h - lay.padY * 0.75;
      let right = b.x + b.w - lay.padX * 0.7;
      if (b.meta.ticks) {
        drawTicks(right - 28 * lay.scale, baseY - 14 * lay.scale, lay.scale, S.tick);
        right -= 34 * lay.scale;
      }
      ctx.font = `${lay.metaFs}px ${FF}`;
      ctx.fillStyle = me ? S.meMeta : S.themMeta;
      ctx.textAlign = "right";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(b.meta.time, right, baseY);
    }
    ctx.restore();
  }

  function drawTicks(x, y, s, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s * 1.45, s * 1.45);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.6;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(0, 5); ctx.lineTo(3.5, 8.5); ctx.lineTo(10, 1);
    ctx.moveTo(6.5, 7); ctx.lineTo(8, 8.5); ctx.lineTo(14.5, 1);
    ctx.stroke();
    ctx.restore();
  }

  // Rounded rectangle with an optional tail: tr/tl (WhatsApp, top) or br/bl (iMessage, bottom).
  function bubblePath(c, x, y, w, h, r, tail, s) {
    r = Math.min(r, h / 2, w / 2);
    const t = 16 * s;
    const ctx = c;
    ctx.beginPath();
    if (tail === "tr") {
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w + t, y);
      ctx.arcTo(x + w + t + 2 * s, y, x + w, y + 22 * s, 4 * s);
      ctx.lineTo(x + w, y + 22 * s);
    } else {
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + r, r);
    }
    if (tail === "br") {
      ctx.lineTo(x + w, y + h - 16 * s);
      ctx.quadraticCurveTo(x + w + 1 * s, y + h - 2 * s, x + w + 13 * s, y + h);
      ctx.quadraticCurveTo(x + w - 3 * s, y + h + 2 * s, x + w - 14 * s, y + h - 5 * s);
      ctx.quadraticCurveTo(x + w - 22 * s, y + h, x + w - 34 * s, y + h);
    } else {
      ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    }
    if (tail === "bl") {
      ctx.lineTo(x + 34 * s, y + h);
      ctx.quadraticCurveTo(x + 22 * s, y + h, x + 14 * s, y + h - 5 * s);
      ctx.quadraticCurveTo(x + 3 * s, y + h + 2 * s, x - 13 * s, y + h);
      ctx.quadraticCurveTo(x - 1 * s, y + h - 2 * s, x, y + h - 16 * s);
    } else {
      ctx.arcTo(x, y + h, x, y + h - r, r);
    }
    if (tail === "tl") {
      ctx.lineTo(x, y + 22 * s);
      ctx.lineTo(x - 2 * s, y + 2 * s);
      ctx.arcTo(x - t - 2 * s, y, x + r, y, 4 * s);
      ctx.lineTo(x + r, y);
    } else {
      ctx.arcTo(x, y, x + r, y, r);
    }
    ctx.closePath();
  }

  // ── look: composition + the painter's hand ─────────────────────────────────
  // Each painting (and each Remix) gets its own composition and its own mix of
  // tools, so no two pieces are worked the same way.
  function pickLook() {
    const rnd = mulberry32(state.strokeSeed ^ 0x5bd1e995);
    const auto = weighted(rnd, { full: 0.4, torn: 0.35, island: 0.25 });
    return {
      composition: state.composition === "auto" ? auto : state.composition,
      ground: rnd() < 0.55 ? [13, 11, 10] : [236, 228, 212],
      hand: {
        bristle: 0.25 + rnd() * 0.75,
        knife: rnd() * 0.8,
        dab: rnd() * 0.7,
        scribble: rnd() < 0.65 ? 0.2 + rnd() * 0.8 : 0,
      },
    };
  }

  // ── paint-over strokes ─────────────────────────────────────────────────────
  // Strokes are generated from the seed and the layout, so typing keeps them
  // steady and Remix (a new seed) reshuffles them instantly. Every bubble gets
  // its own treatment: left clean, worked along one stretch of edge, a cluster
  // at a corner, a halo underneath, scribbled on, or partly swallowed by paint.
  function generateStrokes(lay, look) {
    const a = state.amount / 100;
    const strokes = [];
    if (!state.paintData || a <= 0) return strokes;

    const bubbles = lay.items.filter((it) => it.type === "bubble");
    let swallowed = 0;
    const maxSwallow = Math.max(1, Math.round(bubbles.length / 3));

    bubbles.forEach((b, j) => {
      const rnd = mulberry32(state.strokeSeed + j * 7919);
      const palette = samplePalette(b, rnd);
      const quiet = look.composition === "full" ? 1 : 0.7; // torn edges already do some of the work
      let treatment = weighted(rnd, {
        clean: 0.45 - 0.35 * a,
        edge: 0.35 * quiet,
        corner: 0.22,
        halo: 0.14,
        swallow: b.w > 220 && swallowed < maxSwallow ? 0.04 + 0.4 * a * a : 0,
        scribble: look.hand.scribble * 0.35,
      });
      const add = (s) => strokes.push(makeStroke(rnd, palette, look, s));
      const perim = 2 * (b.w + b.h);

      if (treatment === "clean") {
        if (rnd() < 0.4) add(edgeStroke(b, rnd() * perim, rnd, a, false));
        return;
      }

      if (treatment === "edge") {
        const u0 = rnd() * perim;
        const arc = perim * (0.18 + rnd() * 0.45);
        const n = Math.round(1 + a * 7 * (arc / perim) * 2.2 + rnd() * 2);
        for (let k = 0; k < n; k++) add(edgeStroke(b, (u0 + rnd() * arc) % perim, rnd, a, rnd() < 0.1 + 0.35 * a));
      }

      if (treatment === "corner") {
        const cx = rnd() < 0.5 ? b.x : b.x + b.w;
        const cy = rnd() < 0.5 ? b.y : b.y + b.h;
        const n = 3 + Math.round(rnd() * 3 + a * 3);
        for (let k = 0; k < n; k++) {
          const w = 12 + rnd() * 30;
          add({
            x: cx + (rnd() - 0.5) * 90, y: cy + (rnd() - 0.5) * 70,
            angle: rnd() * Math.PI * 2, len: 40 + rnd() * 110, width: w,
            over: rnd() < 0.2 + 0.3 * a, dry: 0.15 + rnd() * 0.5,
          });
        }
      }

      if (treatment === "halo") {
        const n = 3 + Math.round(rnd() * 3 + a * 4);
        for (let k = 0; k < n; k++) {
          const s = edgeStroke(b, rnd() * perim, rnd, a, false);
          s.width *= 1.5;
          s.len *= 1.3;
          add(s);
        }
      }

      if (treatment === "swallow") {
        swallowed++;
        // Mostly the tail end of the line goes under ("and you just igno…"), so it still reads.
        const side = rnd() < 0.85 ? "right" : "left";
        const f = side === "right" ? 0.1 + rnd() * 0.22 * (0.5 + a) : 0.06 + rnd() * 0.08;
        strokes.push({ type: "reveal", over: true, bubble: b, side, f, radius: lay.radius, scale: lay.scale, padX: lay.padX, seed: Math.floor(rnd() * 2 ** 31) });
        // Texture on the new edge of the paint.
        const edgeX = side === "right" ? b.x + b.w * (1 - f) : b.x + Math.min(b.w * f, lay.padX * 1.1);
        for (let k = 0; k < 2 + rnd() * 3; k++) {
          add({
            x: edgeX + (rnd() - 0.5) * 30, y: b.y + rnd() * b.h,
            angle: Math.PI / 2 + (rnd() - 0.5) * 0.7, len: b.h * (0.6 + rnd() * 0.8),
            width: 10 + rnd() * 22, over: true, dry: 0.3 + rnd() * 0.4, tool: "bristle",
          });
        }
        if (rnd() < 0.5) add(edgeStroke(b, rnd() * perim, rnd, a, false));
      }

      if (treatment === "scribble" || (look.hand.scribble && rnd() < look.hand.scribble * 0.25)) {
        const n = 1 + Math.round(rnd() * 2);
        for (let k = 0; k < n; k++) {
          const e = edgePoint(b, rnd() * perim);
          const out = -10 + rnd() * 50;
          add({
            tool: "scribble",
            x: e.x + e.nx * out, y: e.y + e.ny * out,
            angle: Math.atan2(e.ty, e.tx) + (rnd() - 0.5) * 0.8,
            size: 70 + rnd() * 170, width: 4 + rnd() * 7,
            kind: weighted(rnd, { zigzag: 1, loop: 0.8, wave: 0.7 }),
            over: rnd() < 0.35 + 0.3 * a,
          });
        }
      }

      // At high paint amounts a stroke occasionally crosses a word.
      if (a > 0.6 && rnd() < (a - 0.6) * 1.2 && b.lines.length && treatment !== "clean") {
        const line = Math.floor(rnd() * b.lines.length);
        add({
          x: b.x + lay.padX + rnd() * (b.w - lay.padX * 2),
          y: b.y + lay.padY + lay.lh * (line + 0.5),
          angle: (rnd() - 0.5) * 1.4, len: 50 + rnd() * 90, width: 8 + rnd() * 12,
          over: true, dry: 0.45 + rnd() * 0.3,
        });
      }
    });
    return strokes;
  }

  // A stroke sitting on the bubble's edge. Over-strokes hug the edge and bite
  // in a little (more at high paint amounts); under-strokes can sit further out.
  function edgeStroke(b, u, rnd, a, over) {
    const e = edgePoint(b, u);
    const width = (12 + rnd() * 38) * (0.8 + 0.4 * a);
    const len = (60 + rnd() * 210) * (0.7 + 0.6 * a);
    const diagonal = over ? a > 0.75 && rnd() < 0.15 : rnd() < 0.25;
    const angle = Math.atan2(e.ty, e.tx) + (diagonal ? (rnd() < 0.5 ? -1 : 1) * (0.5 + rnd() * 0.7) : (rnd() - 0.5) * (over ? 0.16 : 0.6));
    const offset = over
      ? width / 2 - (3 + rnd() * (5 + 34 * a * a)) * (e.horizontal ? 0.6 : 1)
      : -width * 0.3 + rnd() * width * 1.4;
    return { x: e.x + e.nx * offset, y: e.y + e.ny * offset, angle, len, width, over, bend: over ? 0.06 : 0.3 };
  }

  function makeStroke(rnd, palette, look, s) {
    const tool = s.tool || weighted(rnd, look.hand.knife || look.hand.dab
      ? { bristle: look.hand.bristle, knife: look.hand.knife, dab: look.hand.dab }
      : { bristle: 1 });
    const c1 = palette[Math.floor(rnd() * palette.length)];
    const c2 = palette[Math.floor(rnd() * palette.length)];
    const stroke = {
      bend: 0.25,
      ...s,
      type: tool === "dab" ? "bristle" : tool,
      color: tool === "scribble" ? saturate(c1, 1.5) : c1,
      color2: c2,
      dry: s.dry ?? 0.1 + rnd() * 0.5,
      seed: Math.floor(rnd() * 2 ** 31),
      image: tool === "bristle" && strokeImages.length && rnd() < 0.3 ? strokeImages[Math.floor(rnd() * strokeImages.length)] : null,
    };
    if (tool === "dab") {
      // Short, loaded, fat: impasto dabs.
      stroke.len = Math.min(stroke.len, stroke.width * (1.2 + rnd()));
      stroke.width *= 1.3;
      stroke.dry = 0.05 + rnd() * 0.15;
      stroke.bend = 0.5;
    }
    if (tool === "knife") {
      stroke.len *= 0.8;
    }
    return stroke;
  }

  // A point on the bubble's edge, with the outward normal and the edge tangent.
  function edgePoint(b, u) {
    const { x, y, w, h } = b;
    if (u < w) return { x: x + u, y, nx: 0, ny: -1, tx: 1, ty: 0, horizontal: true };
    u -= w;
    if (u < h) return { x: x + w, y: y + u, nx: 1, ny: 0, tx: 0, ty: 1, horizontal: false };
    u -= h;
    if (u < w) return { x: x + w - u, y: y + h, nx: 0, ny: 1, tx: -1, ty: 0, horizontal: true };
    u -= w;
    return { x, y: y + h - u, nx: -1, ny: 0, tx: 0, ty: -1, horizontal: false };
  }

  // Colours from the painting just outside the bubble, plus a few from anywhere.
  function samplePalette(b, rnd) {
    const out = [];
    const perim = 2 * (b.w + b.h);
    for (let i = 0; i < 36; i++) {
      const e = edgePoint(b, rnd() * perim);
      const d = 14 + rnd() * 80;
      out.push(pixel(e.x + e.nx * d + (rnd() - 0.5) * 30, e.y + e.ny * d + (rnd() - 0.5) * 30));
    }
    for (let i = 0; i < 6; i++) out.push(pixel(rnd() * W, rnd() * H));
    return out;
  }

  function pixel(x, y) {
    const px = Math.max(0, Math.min(W - 1, Math.round(x)));
    const py = Math.max(0, Math.min(H - 1, Math.round(y)));
    const i = (py * W + px) * 4;
    const d = state.paintData;
    return saturate([d[i], d[i + 1], d[i + 2]], 1.15);
  }

  function saturate([r, g, b], k) {
    const l = 0.299 * r + 0.587 * g + 0.114 * b;
    return [clamp(l + (r - l) * k), clamp(l + (g - l) * k), clamp(l + (b - l) * k)];
  }

  // One brush stroke: an underpaint body, many thin bristles with dry-brush
  // breaks, then a light impasto ridge (highlight on top, shadow below).
  function drawStroke(c, s) {
    if (s.image) return drawImageStroke(c, s);
    const rnd = mulberry32(s.seed);
    const cos = Math.cos(s.angle);
    const sin = Math.sin(s.angle);
    const half = s.len / 2;
    const bend = (rnd() - 0.5) * s.len * (s.bend ?? 0.25);
    const p0 = [s.x - cos * half, s.y - sin * half];
    const p2 = [s.x + cos * half, s.y + sin * half];
    const p1 = [s.x - sin * bend, s.y + cos * bend];

    const segs = Math.max(10, Math.round(s.len / 7));
    const pts = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const mt = 1 - t;
      const x = mt * mt * p0[0] + 2 * mt * t * p1[0] + t * t * p2[0];
      const y = mt * mt * p0[1] + 2 * mt * t * p1[1] + t * t * p2[1];
      const dx = 2 * mt * (p1[0] - p0[0]) + 2 * t * (p2[0] - p1[0]);
      const dy = 2 * mt * (p1[1] - p0[1]) + 2 * t * (p2[1] - p1[1]);
      const n = Math.hypot(dx, dy) || 1;
      pts.push({ x, y, nx: -dy / n, ny: dx / n, t });
    }
    const taper = (t) => 0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, t * 1.15));
    const hw = s.width / 2;

    c.save();
    c.lineCap = "round";
    c.lineJoin = "round";

    // Underpaint body: loaded at the start, thinning out as the brush runs dry.
    const bodyEnd = Math.round(segs * (0.75 + rnd() * 0.25 - s.dry * 0.2));
    const left = [];
    const right = [];
    for (let i = 0; i <= bodyEnd; i++) {
      const p = pts[i];
      const wv = hw * taper(p.t) * (0.8 + rnd() * 0.15);
      left.push([p.x + p.nx * wv, p.y + p.ny * wv]);
      right.push([p.x - p.nx * wv, p.y - p.ny * wv]);
    }
    const grad = c.createLinearGradient(p0[0], p0[1], pts[bodyEnd].x, pts[bodyEnd].y);
    grad.addColorStop(0, rgba(s.color, 0.85));
    grad.addColorStop(1, rgba(s.color, 0.2));
    c.fillStyle = grad;
    c.beginPath();
    left.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    for (let i = right.length - 1; i >= 0; i--) c.lineTo(right[i][0], right[i][1]);
    c.closePath();
    c.fill();

    // Bristles.
    const n = Math.max(6, Math.min(42, Math.round(s.width / 2)));
    for (let b = 0; b < n; b++) {
      const off = (b / (n - 1) - 0.5) * s.width + (rnd() - 0.5) * 1.6;
      const edgeness = Math.abs(off) / hw;
      const base = rnd() < 0.28 ? s.color2 : s.color;
      const shade = (rnd() - 0.5) * 50;
      c.strokeStyle = rgba([base[0] + shade, base[1] + shade, base[2] + shade], 0.5 + rnd() * 0.45);
      c.lineWidth = 1.1 + rnd() * 2.8;
      const start = rnd() * 0.08;
      const end = 1 - rnd() * (0.04 + s.dry * 0.35);
      const wobble = rnd() * 1.2;
      const phase = rnd() * 6.28;
      c.beginPath();
      let pen = false;
      for (const p of pts) {
        if (p.t < start || p.t > end) { pen = false; continue; }
        if (rnd() < s.dry * (0.2 + 0.9 * p.t * p.t) * (0.5 + edgeness)) { pen = false; continue; }
        const o = off * taper(p.t) + Math.sin(p.t * 9 + phase) * wobble;
        const x = p.x + p.nx * o;
        const y = p.y + p.ny * o;
        if (pen) c.lineTo(x, y);
        else { c.moveTo(x, y); pen = true; }
      }
      c.stroke();
    }

    // Impasto ridge: highlight on the side facing up, shadow on the other.
    const upSide = pts[Math.floor(segs / 2)].ny < 0 ? 1 : -1;
    ridge(c, pts, taper, hw * 0.55 * upSide, "rgba(255,255,255,0.32)", 1.4, rnd, s.dry);
    ridge(c, pts, taper, -hw * 0.8 * upSide, "rgba(0,0,0,0.22)", 2, rnd, s.dry);
    c.restore();
  }

  function ridge(c, pts, taper, off, color, lw, rnd, dry) {
    c.strokeStyle = color;
    c.lineWidth = lw;
    c.beginPath();
    let pen = false;
    for (const p of pts) {
      if (p.t > 0.85 - dry * 0.3 || rnd() < 0.15 + dry * 0.4) { pen = false; continue; }
      const x = p.x + p.nx * off * taper(p.t);
      const y = p.y + p.ny * off * taper(p.t);
      if (pen) c.lineTo(x, y);
      else { c.moveTo(x, y); pen = true; }
    }
    c.stroke();
  }

  // Scanned stroke PNGs (transparent background): tinted with the sampled colour,
  // keeping the scan's own light and dark as texture.
  const tintCanvas = document.createElement("canvas");
  function drawImageStroke(c, s) {
    const img = s.image;
    tintCanvas.width = img.naturalWidth;
    tintCanvas.height = img.naturalHeight;
    const t = tintCanvas.getContext("2d");
    t.fillStyle = rgba(s.color, 1);
    t.fillRect(0, 0, tintCanvas.width, tintCanvas.height);
    t.globalCompositeOperation = "destination-in";
    t.drawImage(img, 0, 0);
    t.globalCompositeOperation = "soft-light";
    t.globalAlpha = 0.7;
    t.drawImage(img, 0, 0);
    c.save();
    c.translate(s.x, s.y);
    c.rotate(s.angle);
    c.globalAlpha = 0.92;
    c.drawImage(tintCanvas, -s.len / 2, -s.width / 2, s.len, s.width * 1.4);
    c.restore();
  }

  function paintStroke(c, s) {
    if (s.type === "knife") return drawKnife(c, s);
    if (s.type === "scribble") return drawScribble(c, s);
    if (s.type === "reveal") return drawReveal(c, s);
    return drawStroke(c, s);
  }

  // Palette knife: a flat slab with one hard straight edge, a ragged trailing
  // edge, drag streaks through it and a lip of paint where the knife lifted.
  function drawKnife(c, s) {
    const rnd = mulberry32(s.seed);
    const L = s.len;
    const Wd = s.width;
    const skew = (rnd() - 0.5) * Wd * 0.3;
    c.save();
    c.translate(s.x, s.y);
    c.rotate(s.angle);
    // Straight leading edge, rounded lifted end, ragged trailing edge, soft start.
    c.beginPath();
    c.moveTo(-L / 2, -Wd / 2);
    c.lineTo(L / 2 + skew, -Wd / 2);
    c.quadraticCurveTo(L / 2 + skew + Wd * 0.35, 0, L / 2 - Wd * 0.1, Wd / 2);
    const steps = 14;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      c.lineTo(L / 2 - Wd * 0.1 - t * (L - Wd * 0.4), Wd / 2 + (rnd() - 0.5) * Wd * 0.2);
    }
    c.quadraticCurveTo(-L / 2 - Wd * 0.25, Wd * 0.1, -L / 2, -Wd / 2);
    c.closePath();
    const grad = c.createLinearGradient(-L / 2, 0, L / 2, 0);
    grad.addColorStop(0, rgba(s.color, 0.96));
    grad.addColorStop(0.7, rgba(mix(s.color, s.color2, 0.35), 0.9));
    grad.addColorStop(1, rgba(s.color2, 0.7));
    c.fillStyle = grad;
    c.fill();
    c.clip();

    // Drag streaks: the other colour pulled through the slab.
    const n = Math.round(Wd / 2.5);
    for (let k = 0; k < n; k++) {
      const y = -Wd / 2 + rnd() * Wd;
      const shade = (rnd() - 0.5) * 70;
      const base = rnd() < 0.5 ? s.color2 : s.color;
      c.strokeStyle = rgba([base[0] + shade, base[1] + shade, base[2] + shade], 0.2 + rnd() * 0.45);
      c.lineWidth = 0.7 + rnd() * 2.2;
      c.beginPath();
      let x = -L / 2 + rnd() * L * 0.3;
      const end = L / 2 - rnd() * L * 0.3;
      c.moveTo(x, y);
      while (x < end) {
        x += 10 + rnd() * 30;
        const yy = y + (rnd() - 0.5) * 1.5;
        if (rnd() < 0.2) c.moveTo(x, yy);
        else c.lineTo(x, yy);
      }
      c.stroke();
    }
    // Bare patches where the knife skipped.
    for (let k = 0; k < 3 + rnd() * 6; k++) {
      c.fillStyle = rgba(mix(s.color, [255, 255, 255], 0.25), 0.25 + rnd() * 0.3);
      c.beginPath();
      c.ellipse(-L / 2 + rnd() * L, -Wd / 2 + rnd() * Wd, 3 + rnd() * 10, 1 + rnd() * 3, 0, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();

    // Sharp highlight on the hard edge, dark lip at the lifted end.
    c.save();
    c.translate(s.x, s.y);
    c.rotate(s.angle);
    c.strokeStyle = "rgba(255,255,255,0.45)";
    c.lineWidth = 1.6;
    c.beginPath();
    c.moveTo(-L / 2 + 4, -Wd / 2 + 1);
    c.lineTo(L / 2 + skew - 4, -Wd / 2 + 1);
    c.stroke();
    c.strokeStyle = rgba(mix(s.color2, [0, 0, 0], 0.4), 0.5);
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(L / 2 + skew, -Wd / 2);
    c.quadraticCurveTo(L / 2 + skew * 0.5 + 4, 0, L / 2 - L * 0.04, Wd / 2);
    c.stroke();
    c.restore();
  }

  // Oil-pastel scribble: a waxy line (zigzag, loop or wave) broken up by the canvas grain.
  const scribbleCanvas = document.createElement("canvas");
  function drawScribble(c, s) {
    const rnd = mulberry32(s.seed);
    const size = s.size;
    const pts = [];
    if (s.kind === "zigzag") {
      const n = 5 + Math.floor(rnd() * 8);
      for (let i = 0; i <= n; i++) {
        pts.push([-size / 2 + (i / n) * size + (rnd() - 0.5) * 12, (i % 2 ? -1 : 1) * size * (0.15 + rnd() * 0.2)]);
      }
    } else if (s.kind === "loop") {
      const turns = 2 + rnd() * 3;
      const r = size * (0.12 + rnd() * 0.1);
      for (let t = 0; t <= turns * Math.PI * 2; t += 0.35) {
        pts.push([-size / 2 + (t / (turns * Math.PI * 2)) * size + Math.cos(t) * r, Math.sin(t) * r * (0.6 + rnd() * 0.3)]);
      }
    } else {
      const k = 1 + rnd() * 2.5;
      for (let x = -size / 2; x <= size / 2; x += 10) {
        pts.push([x, Math.sin((x / size) * Math.PI * 2 * k) * size * 0.14 + (rnd() - 0.5) * 4]);
      }
    }

    const dim = Math.ceil(size * 1.1 + s.width * 4);
    scribbleCanvas.width = dim;
    scribbleCanvas.height = dim;
    const g = scribbleCanvas.getContext("2d");
    g.translate(dim / 2, dim / 2);
    g.lineCap = "round";
    g.lineJoin = "round";
    g.strokeStyle = rgba(s.color, 0.95);
    g.lineWidth = s.width;
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i][0] + pts[i + 1][0]) / 2;
      const my = (pts[i][1] + pts[i + 1][1]) / 2;
      g.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
    }
    g.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
    g.stroke();
    // Wax skipping over the weave.
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = "destination-out";
    g.fillStyle = g.createPattern(speckle(), "repeat");
    g.translate(-rnd() * 256, -rnd() * 256);
    g.fillRect(0, 0, dim + 256, dim + 256);

    c.save();
    c.translate(s.x, s.y);
    c.rotate(s.angle);
    c.drawImage(scribbleCanvas, -dim / 2, -dim / 2);
    c.restore();
  }

  // The painting grows over one end of a bubble: the painting itself is drawn
  // back on top through a ragged brush-shaped mask, hiding part of the words.
  const revealCanvas = document.createElement("canvas");
  function drawReveal(c, s) {
    const b = s.bubble;
    const rnd = mulberry32(s.seed);
    const pad = 80;
    const bx = Math.floor(b.x - pad);
    const by = Math.floor(b.y - pad);
    revealCanvas.width = Math.ceil(b.w + pad * 2);
    revealCanvas.height = Math.ceil(b.h + pad * 2);
    const g = revealCanvas.getContext("2d");
    g.translate(-bx, -by);
    // On the left only the bubble's edge goes under, never the first word.
    const depth = s.side === "right" ? s.f * b.w : Math.min(s.f * b.w, s.padX * 1.1);
    const edgeX = s.side === "right" ? b.x + b.w - depth : b.x + depth;
    const dir = s.side === "right" ? 1 : -1;

    // Solid body inside the bubble, from the ragged edge to its end.
    g.fillStyle = "#fff";
    g.save();
    bubblePath(g, b.x, b.y, b.w, b.h, s.radius, b.tail, s.scale);
    g.clip();
    const x0 = edgeX + dir * 18;
    const x1 = (s.side === "right" ? b.x + b.w : b.x) + dir * 30;
    g.fillRect(Math.min(x0, x1), b.y - 30, Math.abs(x1 - x0), b.h + 60);
    g.restore();
    // Ragged, brushy edge.
    const white = [255, 255, 255];
    for (let k = 0; k < 6 + rnd() * 5; k++) {
      drawStroke(g, {
        x: edgeX + dir * (rnd() * 30 - 5), y: b.y - 20 + rnd() * (b.h + 40),
        angle: Math.PI / 2 + (rnd() - 0.5) * 0.9, len: b.h * (0.5 + rnd() * 0.9),
        width: 24 + rnd() * 36, color: white, color2: white, dry: 0.15 + rnd() * 0.4,
        seed: Math.floor(rnd() * 2 ** 31), bend: 0.3,
      });
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = "source-in";
    g.drawImage(state.painting, -bx, -by);
    c.drawImage(revealCanvas, bx, by);
  }

  // ── compositions ───────────────────────────────────────────────────────────
  // full:   the painting fills the frame.
  // torn:   bare ground where the words sit, painting beyond a torn, brushy edge.
  // island: the painting is a ragged patch on bare ground, bubbles overhanging it.
  function buildMask(look, lay) {
    const m = document.createElement("canvas");
    m.width = W;
    m.height = H;
    const g = m.getContext("2d");
    const rnd = mulberry32(state.strokeSeed ^ 0x27d4eb2f);
    g.fillStyle = "#fff";
    const blockTop = lay.top;
    const blockBottom = lay.top + lay.height;

    if (look.composition === "island") {
      const x0 = 40 + rnd() * 90;
      const x1 = W - 40 - rnd() * 90;
      const y0 = Math.min(blockTop + 40, 80 + rnd() * 140);
      const y1 = Math.max(blockBottom - 40, H - 80 - rnd() * 140);
      g.fillRect(x0 + 70, y0 + 70, x1 - x0 - 140, y1 - y0 - 140);
      raggedEdge(g, x0, y0, x1, y0, 0, 1, rnd, 200);
      raggedEdge(g, x1, y0, x1, y1, -1, 0, rnd, 200);
      raggedEdge(g, x1, y1, x0, y1, 0, -1, rnd, 200);
      raggedEdge(g, x0, y1, x0, y0, 1, 0, rnd, 200);
      return m;
    }

    // torn
    if (lay.space === "top") {
      const y = clampN(blockBottom - 40 - rnd() * 110, H * 0.3, H * 0.72);
      raggedEdge(g, -40, y, W + 40, y, 0, 1, rnd);
    } else if (lay.space === "bottom") {
      const y = clampN(blockTop + 40 + rnd() * 110, H * 0.28, H * 0.7);
      raggedEdge(g, -40, y, W + 40, y, 0, -1, rnd);
    } else {
      // A bare band torn through the middle of the painting.
      const yA = Math.max(60, blockTop + 30 + rnd() * 60);
      const yB = Math.min(H - 60, blockBottom - 30 - rnd() * 60);
      raggedEdge(g, -40, yA, W + 40, yA, 0, -1, rnd);
      raggedEdge(g, -40, yB, W + 40, yB, 0, 1, rnd);
    }
    return m;
  }

  // Brushy edge along a→b; (nx, ny) points into the paint.
  function raggedEdge(g, ax, ay, bx, by, nx, ny, rnd, depth = 2000) {
    const white = [255, 255, 255];
    const len = Math.hypot(bx - ax, by - ay);
    const tx = (bx - ax) / len;
    const ty = (by - ay) / len;
    const along = Math.atan2(ty, tx);
    const outward = Math.atan2(-ny, -nx);
    // Solid body behind the brushwork, with a jagged front so no straight line shows.
    g.beginPath();
    let off = 60;
    for (let d = -40; d <= len + 40; d += 12) {
      off = clampN(off + (rnd() - 0.5) * 22, 35, 110);
      const x = ax + tx * d + nx * off;
      const y = ay + ty * d + ny * off;
      if (d === -40) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.lineTo(bx + tx * 40 + nx * depth, by + ty * 40 + ny * depth);
    g.lineTo(ax - tx * 40 + nx * depth, ay - ty * 40 + ny * depth);
    g.closePath();
    g.fill();
    for (let d = -30; d < len + 30; d += 16 + rnd() * 30) {
      const flick = rnd() < 0.16;
      const off = flick ? -(10 + rnd() * 40) : -10 + rnd() * 70;
      const len2 = flick ? 60 + rnd() * 130 : 70 + rnd() * 200;
      const s = {
        x: ax + tx * d + nx * off, y: ay + ty * d + ny * off,
        angle: flick ? outward + (rnd() - 0.5) * 1.3 : along + (rnd() - 0.5) * 0.6,
        len: len2, width: flick ? 10 + rnd() * 18 : 26 + rnd() * 46,
        color: white, color2: white, dry: 0.15 + rnd() * 0.5,
        seed: Math.floor(rnd() * 2 ** 31), bend: 0.3,
      };
      if (rnd() < 0.25) drawKnife(g, s);
      else drawStroke(g, s);
      // Loose flecks out on the bare ground.
      if (rnd() < 0.22) {
        const dist = 30 + rnd() * 170;
        drawStroke(g, {
          x: ax + tx * d - nx * dist, y: ay + ty * d - ny * dist,
          angle: rnd() * Math.PI, len: 14 + rnd() * 40, width: 8 + rnd() * 16,
          color: white, color2: white, dry: 0.1, seed: Math.floor(rnd() * 2 ** 31), bend: 0.5,
        });
      }
      // Occasional bite back into the paint.
      if (rnd() < 0.05) {
        g.save();
        g.globalCompositeOperation = "destination-out";
        drawStroke(g, {
          x: ax + tx * d + nx * (40 + rnd() * 40), y: ay + ty * d + ny * (40 + rnd() * 40),
          angle: along + (rnd() - 0.5), len: 40 + rnd() * 80, width: 14 + rnd() * 20,
          color: white, color2: white, dry: 0.3, seed: Math.floor(rnd() * 2 ** 31), bend: 0.3,
        });
        g.restore();
      }
    }
  }

  let bgCache = { key: "", canvas: null };
  function background(look, lay) {
    const key = `${state.paintingId}|${state.strokeSeed}|${look.composition}|${Math.round(lay.top)}|${Math.round(lay.height)}|${lay.space}`;
    if (bgCache.key === key) return bgCache.canvas;
    const c = bgCache.canvas || document.createElement("canvas");
    c.width = W;
    c.height = H;
    const g = c.getContext("2d");
    if (look.composition === "full") {
      g.drawImage(state.painting, 0, 0);
    } else {
      g.fillStyle = rgba(look.ground, 1);
      g.fillRect(0, 0, W, H);
      g.drawImage(grain(), 0, 0, W, H);
      const t = document.createElement("canvas");
      t.width = W;
      t.height = H;
      const tg = t.getContext("2d");
      tg.drawImage(buildMask(look, lay), 0, 0);
      tg.globalCompositeOperation = "source-in";
      tg.drawImage(state.painting, 0, 0);
      g.drawImage(t, 0, 0);
    }
    bgCache = { key, canvas: c };
    bgLumData = g.getImageData(0, 0, W, H).data;
    return c;
  }

  let bgLumData = null;
  function bgLuminance(x, y) {
    if (!bgLumData) return 0;
    const i = (clampN(Math.round(y), 0, H - 1) * W + clampN(Math.round(x), 0, W - 1)) * 4;
    return 0.299 * bgLumData[i] + 0.587 * bgLumData[i + 1] + 0.114 * bgLumData[i + 2];
  }

  let speckleCanvas = null;
  function speckle() {
    if (speckleCanvas) return speckleCanvas;
    speckleCanvas = document.createElement("canvas");
    speckleCanvas.width = speckleCanvas.height = 256;
    const g = speckleCanvas.getContext("2d");
    const img = g.createImageData(256, 256);
    const rnd = mulberry32(11);
    for (let i = 0; i < img.data.length; i += 4) {
      img.data[i + 3] = rnd() < 0.3 ? 120 + rnd() * 135 : 0;
    }
    g.putImageData(img, 0, 0);
    return speckleCanvas;
  }

  // ── render ─────────────────────────────────────────────────────────────────
  let frame = 0;
  function scheduleRender() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      render();
    });
  }

  function render() {
    const look = pickLook();
    const lay = layout();
    const strokes = generateStrokes(lay, look);
    if (state.painting) ctx.drawImage(background(look, lay), 0, 0);
    else drawPlain();
    for (const s of strokes) if (!s.over) paintStroke(ctx, s);
    drawItems(lay);
    for (const s of strokes) if (s.over) paintStroke(ctx, s);
    if (state.painting) {
      // A whisper of canvas grain over everything, so the bubbles sit in the paint.
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.globalCompositeOperation = "overlay";
      ctx.drawImage(grain(), 0, 0, W, H);
      ctx.restore();
    }
  }

  let grainCanvas = null;
  function grain() {
    if (grainCanvas) return grainCanvas;
    grainCanvas = document.createElement("canvas");
    grainCanvas.width = W / 2;
    grainCanvas.height = H / 2;
    const g = grainCanvas.getContext("2d");
    const img = g.createImageData(grainCanvas.width, grainCanvas.height);
    const rnd = mulberry32(7);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 128 + (rnd() - 0.5) * 60;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 22;
    }
    g.putImageData(img, 0, 0);
    return grainCanvas;
  }

  // ── painting ───────────────────────────────────────────────────────────────
  async function paintIt() {
    if (state.busy) return;
    const messages = state.messages
      .filter((m) => m.kind === "deleted" || m.text.trim())
      .map((m) => ({ side: m.side, text: m.text.trim(), kind: m.kind }));
    if (!messages.length) return setStatus("Write at least one message first.", true);

    setBusy(true);
    try {
      let data;
      if (DEMO) data = await demoPainting();
      else {
        let res;
        try {
          res = await fetch("/api/paint", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ messages, mood: state.mood }),
          });
        } catch {
          throw new Error("Couldn't reach the painter. Check your connection and try again.");
        }
        data = await res.json().catch(() => ({}));
        if (!res.ok || !data.image) throw new Error(data.error || `Something went wrong (${res.status}). Try again.`);
      }
      await setPainting(data.image);
      state.scene = data.scene || null;
      state.strokeSeed = randSeed();
      render();
      setStatus(state.scene?.emotional_core ? `“${state.scene.emotional_core}”` : "Painted.", false, true);
    } catch (err) {
      setStatus(err.message || "Something went wrong. Try again.", true);
    } finally {
      setBusy(false);
    }
  }

  async function setPainting(src) {
    const img = await loadImage(src);
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const g = c.getContext("2d");
    // Cover-crop the square painting to 4:5.
    const s = Math.max(W / img.naturalWidth, H / img.naturalHeight);
    const dw = img.naturalWidth * s;
    const dh = img.naturalHeight * s;
    g.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
    state.painting = c;
    state.paintingId++;
    state.paintData = g.getImageData(0, 0, W, H).data;
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("The painting didn't load. Try again."));
      img.src = src;
    });
  }

  let waitTimer = 0;
  function setBusy(busy) {
    state.busy = busy;
    els.paint.disabled = busy;
    els.again.disabled = busy || !state.painting;
    els.repaint.disabled = busy || !state.painting;
    els.paint.textContent = busy ? "Painting…" : state.painting ? "Paint it again" : "Paint it";
    els.overlay.classList.toggle("show", busy);
    clearInterval(waitTimer);
    if (busy) {
      let i = 0;
      els.overlayText.textContent = WAITING_LINES[0];
      waitTimer = setInterval(() => {
        i = Math.min(i + 1, WAITING_LINES.length - 1);
        els.overlayText.textContent = WAITING_LINES[i];
      }, 2800);
      setStatus("");
    }
  }

  function setStatus(text, error = false, scene = false) {
    els.status.textContent = text;
    els.status.classList.toggle("error", error);
    els.status.classList.toggle("scene-core", scene);
  }

  function download() {
    render();
    canvas.toBlob((blob) => {
      if (!blob) return setStatus("Couldn't make the image. Try again.", true);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const d = new Date();
      const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
      a.href = url;
      a.download = `unsaid-${stamp}.png`;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    }, "image/png");
  }

  // ── demo painting (?demo): no network, exercises the stroke engine ─────────
  async function demoPainting() {
    await new Promise((r) => setTimeout(r, 600));
    const size = 1024;
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    const g = c.getContext("2d");
    const rnd = mulberry32(randSeed());
    const palettes = [
      { sky: [[128, 206, 222], [236, 150, 170], [250, 240, 230]], ground: [[222, 178, 48], [196, 140, 36], [240, 206, 90]], accent: [[196, 40, 60], [240, 236, 228], [110, 60, 50]] },
      { sky: [[40, 120, 210], [90, 180, 230], [240, 240, 250]], ground: [[40, 140, 70], [120, 180, 60], [30, 90, 60]], accent: [[240, 90, 140], [250, 210, 60], [230, 60, 40]] },
    ];
    const p = palettes[Math.floor(rnd() * palettes.length)];
    const horizon = size * (0.35 + rnd() * 0.2);
    g.fillStyle = rgba(p.sky[0], 1);
    g.fillRect(0, 0, size, horizon);
    g.fillStyle = rgba(p.ground[0], 1);
    g.fillRect(0, horizon, size, size - horizon);
    const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
    for (let i = 0; i < 520; i++) {
      const sky = i < 220;
      const y = sky ? rnd() * horizon : horizon + rnd() * (size - horizon);
      drawStroke(g, {
        x: rnd() * size, y,
        angle: sky ? (rnd() - 0.5) * 0.6 : -0.9 + (rnd() - 0.5) * 0.8,
        len: 60 + rnd() * 180, width: 14 + rnd() * 34,
        color: pick(sky ? p.sky : p.ground), color2: pick(sky ? p.sky : p.ground),
        dry: 0.1 + rnd() * 0.4, seed: Math.floor(rnd() * 2 ** 31),
      });
    }
    const fx = size * (0.3 + rnd() * 0.4);
    const fy = horizon + (size - horizon) * 0.45;
    for (let i = 0; i < 60; i++) {
      drawStroke(g, {
        x: fx + (rnd() - 0.5) * 220, y: fy + (rnd() - 0.5) * 160,
        angle: rnd() * 6.28, len: 40 + rnd() * 90, width: 16 + rnd() * 26,
        color: pick(p.accent), color2: pick(p.accent),
        dry: 0.2 + rnd() * 0.3, seed: Math.floor(rnd() * 2 ** 31),
      });
    }
    const spaces = ["top", "centre", "bottom"];
    return {
      image: c.toDataURL("image/jpeg", 0.92),
      scene: { emotional_core: "Demo painting: random paint, not AI.", mood: "demo", negative_space: spaces[Math.floor(rnd() * 3)] },
    };
  }

  // ── optional scanned strokes ───────────────────────────────────────────────
  async function loadStrokeImages() {
    try {
      const res = await fetch("strokes/manifest.json", { cache: "no-cache" });
      if (!res.ok) return;
      const files = await res.json();
      if (!Array.isArray(files)) return;
      const imgs = await Promise.all(files.slice(0, 40).map((f) => loadImage(`strokes/${f}`).catch(() => null)));
      strokeImages.push(...imgs.filter(Boolean));
      if (strokeImages.length && state.painting) scheduleRender();
    } catch {
      // No manifest: drawn strokes only.
    }
  }

  // ── utils ──────────────────────────────────────────────────────────────────
  function mulberry32(a) {
    a >>>= 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function weighted(rnd, table) {
    const keys = Object.keys(table);
    const total = keys.reduce((sum, k) => sum + Math.max(0, table[k]), 0);
    let r = rnd() * total;
    for (const k of keys) {
      r -= Math.max(0, table[k]);
      if (r <= 0 && table[k] > 0) return k;
    }
    return keys.find((k) => table[k] > 0) || keys[0];
  }
  function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function clampN(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function randSeed() { return Math.floor(Math.random() * 2 ** 31); }
  function clamp(v) { return Math.max(0, Math.min(255, v)); }
  function rgba(c, a) { return `rgba(${clamp(c[0]) | 0},${clamp(c[1]) | 0},${clamp(c[2]) | 0},${a})`; }
  function pad(n) { return String(n).padStart(2, "0"); }

  // ── wire up ────────────────────────────────────────────────────────────────
  els.add.addEventListener("click", () => {
    const last = state.messages[state.messages.length - 1];
    addMessage(state.messages.length, last?.side === "me" ? "them" : "me");
  });
  els.style.addEventListener("change", () => { state.style = els.style.value; scheduleRender(); });
  els.composition.addEventListener("change", () => { state.composition = els.composition.value; scheduleRender(); });
  els.mood.addEventListener("change", () => { state.mood = els.mood.value; });
  els.time.addEventListener("input", () => { state.startTime = els.time.value; scheduleRender(); });
  els.meta.addEventListener("change", () => { state.showMeta = els.meta.checked; scheduleRender(); });
  els.amount.addEventListener("input", () => { state.amount = Number(els.amount.value); scheduleRender(); });
  els.paint.addEventListener("click", paintIt);
  els.again.addEventListener("click", paintIt);
  els.repaint.addEventListener("click", () => { state.strokeSeed = randSeed(); render(); });
  els.download.addEventListener("click", download);

  renderExamples();
  renderList();
  render();
  if (DEMO) setStatus("Demo mode: random local paint, not AI, so it won't match your words.");
  loadStrokeImages();
  // Canvas text needs the web fonts (Malayalam especially) before it looks right.
  Promise.all([
    document.fonts.load(`${FONT_SIZE}px "Noto Sans"`),
    document.fonts.load(`${FONT_SIZE}px "Noto Sans Malayalam"`, "മ"),
  ]).catch(() => {}).then(() => document.fonts.ready).then(render);
})();
