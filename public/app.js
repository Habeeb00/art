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
    style: $("style"), mood: $("mood"), time: $("time"), meta: $("meta"),
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
  function drawBackground() {
    if (state.painting) {
      ctx.drawImage(state.painting, 0, 0);
      return;
    }
    ctx.fillStyle = STYLES[state.style].bg;
    ctx.fillRect(0, 0, W, H);
    ctx.drawImage(grain(), 0, 0, W, H);
  }

  // ── drawing: bubbles ───────────────────────────────────────────────────────
  function drawItems(lay) {
    const S = STYLES[state.style];
    const onPaint = !!state.painting;
    for (const it of lay.items) {
      if (it.type === "bubble") drawBubble(it, lay, S);
      else drawCaption(it, lay, onPaint);
    }
  }

  function drawCaption(it, lay, onPaint) {
    ctx.save();
    ctx.font = `${it.type === "header" ? "500 " : ""}${lay.metaFs}px ${FF}`;
    ctx.textBaseline = "middle";
    ctx.fillStyle = onPaint ? "rgba(255,255,255,0.94)" : "#8E8E93";
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
    bubblePath(b.x, b.y, b.w, b.h, lay.radius, b.tail, lay.scale);
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
  function bubblePath(x, y, w, h, r, tail, s) {
    r = Math.min(r, h / 2, w / 2);
    const t = 16 * s;
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

  // ── paint-over strokes ─────────────────────────────────────────────────────
  // Strokes are generated from the seed and the layout, so typing keeps them
  // steady and "Repaint strokes" (a new seed) reshuffles them instantly.
  function generateStrokes(lay) {
    const a = state.amount / 100;
    const strokes = [];
    if (!state.paintData || a <= 0) return strokes;

    lay.items.forEach((b, j) => {
      if (b.type !== "bubble") return;
      const rnd = mulberry32(state.strokeSeed + j * 7919);
      const palette = samplePalette(b, rnd);
      const perim = 2 * (b.w + b.h);
      const count = Math.round(a * perim / 85) + 1;

      for (let k = 0; k < count; k++) {
        const e = edgePoint(b, rnd() * perim);
        const over = rnd() < 0.1 + 0.3 * a;
        const width = (14 + rnd() * 36) * (0.8 + 0.4 * a);
        const len = (70 + rnd() * 200) * (0.7 + 0.6 * a);
        // Over-strokes hug the edge; only at high amounts do they cut across it.
        const diagonal = over ? a > 0.75 && rnd() < 0.15 : rnd() < 0.2;
        const angle = Math.atan2(e.ty, e.tx) + (diagonal ? (rnd() < 0.5 ? -1 : 1) * (0.5 + rnd() * 0.6) : (rnd() - 0.5) * (over ? 0.16 : 0.5));

        let offset;
        if (over) {
          // How far the stroke bites into the bubble: a nibble at low amounts, into the words at high.
          const edgeScale = e.horizontal ? 0.6 : 1;
          const intrusion = (3 + rnd() * (5 + 34 * a * a)) * edgeScale;
          offset = width / 2 - intrusion;
        } else {
          offset = -width * 0.3 + rnd() * width * 1.3;
        }

        strokes.push(makeStroke(rnd, palette, {
          x: e.x + e.nx * offset,
          y: e.y + e.ny * offset,
          angle, len, width, over,
          bend: over ? 0.06 : 0.25,
        }));
      }

      // At high paint amounts a stroke occasionally crosses a word.
      if (a > 0.6 && rnd() < (a - 0.6) * 1.6 && b.lines.length) {
        const line = Math.floor(rnd() * b.lines.length);
        strokes.push(makeStroke(rnd, palette, {
          x: b.x + lay.padX + rnd() * (b.w - lay.padX * 2),
          y: b.y + lay.padY + lay.lh * (line + 0.5),
          angle: (rnd() - 0.5) * 1.4,
          len: 50 + rnd() * 90,
          width: 8 + rnd() * 12,
          over: true,
          dry: 0.45 + rnd() * 0.3,
        }));
      }
    });
    return strokes;
  }

  function makeStroke(rnd, palette, s) {
    const c1 = palette[Math.floor(rnd() * palette.length)];
    const c2 = palette[Math.floor(rnd() * palette.length)];
    return {
      ...s,
      color: c1,
      color2: c2,
      dry: s.dry ?? 0.12 + rnd() * 0.45,
      seed: Math.floor(rnd() * 2 ** 31),
      image: strokeImages.length && rnd() < 0.3 ? strokeImages[Math.floor(rnd() * strokeImages.length)] : null,
    };
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
    const lay = layout();
    const strokes = generateStrokes(lay);
    drawBackground();
    for (const s of strokes) if (!s.over) drawStroke(ctx, s);
    drawItems(lay);
    for (const s of strokes) if (s.over) drawStroke(ctx, s);
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
      scene: { emotional_core: "Demo painting: no AI was used.", mood: "demo", negative_space: spaces[Math.floor(rnd() * 3)] },
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
  if (DEMO) setStatus("Demo mode: paintings are generated locally, no AI.");
  loadStrokeImages();
  // Canvas text needs the web fonts (Malayalam especially) before it looks right.
  Promise.all([
    document.fonts.load(`${FONT_SIZE}px "Noto Sans"`),
    document.fonts.load(`${FONT_SIZE}px "Noto Sans Malayalam"`, "മ"),
  ]).catch(() => {}).then(() => document.fonts.ready).then(render);
})();
