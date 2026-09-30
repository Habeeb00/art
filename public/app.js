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
  const PARAMS = new URLSearchParams(location.search);
  const DEMO = PARAMS.has("demo");
  // ?preview paints with Pollinations' free, keyless image model straight from
  // the browser, from the same idea prompts as the worker. For trying real
  // paintings before a Cloudflare account exists.
  const PREVIEW = PARAMS.has("preview");
  const ideasModule = import("./ideas.js");

  // Each chat style has a dark and a light theme; the theme follows whatever is
  // behind the bubbles, like a phone in dark or light mode.
  const STYLES = {
    whatsapp: {
      dark: {
        bg: "#0B141A",
        me: "#005C4B", them: "#202C33",
        meText: "#E9EDEF", themText: "#E9EDEF",
        meMeta: "rgba(233,237,239,0.62)", themMeta: "rgba(233,237,239,0.62)",
        deleted: "rgba(233,237,239,0.62)", dots: "#8696A0",
        tick: "#53BDEB",
      },
      light: {
        bg: "#EFEAE2",
        me: "#D9FDD3", them: "#FFFFFF",
        meText: "#111B21", themText: "#111B21",
        meMeta: "rgba(17,27,33,0.5)", themMeta: "rgba(17,27,33,0.5)",
        deleted: "rgba(17,27,33,0.55)", dots: "#8696A0",
        tick: "#53BDEB",
      },
    },
    imessage: {
      dark: {
        bg: "#000000",
        me: "#0A84FF", them: "#26252A",
        meText: "#FFFFFF", themText: "#FFFFFF",
        deleted: "#8E8E93", dots: "#8E8E93",
      },
      light: {
        bg: "#FFFFFF",
        me: "#0A84FF", them: "#E9E9EB",
        meText: "#FFFFFF", themText: "#000000",
        deleted: "#8E8E93", dots: "#8E8E93",
      },
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
    ideaChoice: "auto",
    showMeta: true,
    startTime: "23:41",
    amount: 30,
    composition: "auto",
    autoComposition: "full", // the chosen idea's placement, set when a painting arrives
    raw: null,              // the square painting as generated
    paintGround: [8, 8, 8], // flat background colour of a cut-out painting
    paintedCutout: null,    // the cut-out subject, repainted, on transparent
    paintingId: 0,
    painting: null,     // HTMLCanvasElement, painting cropped to 1080×1350
    paintData: null,    // Uint8ClampedArray of the painting's pixels
    shot: null,             // an uploaded screenshot, analysed (see readScreenshot)
    reading: null,          // { idea, matched, detail } for the current painting
    strokeSeed: randSeed(),
    busy: false,
  };


  // ── dom ────────────────────────────────────────────────────────────────────
  const $ = (id) => document.getElementById(id);
  const canvas = $("canvas");
  const ctx = canvas.getContext("2d");
  const els = {
    list: $("messages"), add: $("add"), examples: $("examples"),
    style: $("style"), composition: $("composition"), idea: $("idea"), shot: $("shot"), mal: $("mal"), clearShot: $("clear-shot"), time: $("time"), meta: $("meta"),
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
      input.disabled = m.kind !== "text";
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

      const kind = document.createElement("select");
      kind.className = "kind";
      kind.setAttribute("aria-label", "Message type");
      for (const [value, label] of [["text", "text"], ["deleted", "deleted"], ["typing", "typing…"]]) {
        const o = document.createElement("option");
        o.value = value;
        o.textContent = label;
        o.selected = m.kind === value;
        kind.append(o);
      }
      kind.addEventListener("change", () => {
        m.kind = kind.value;
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

  function formatTime24(mins) {
    return `${pad(Math.floor(mins / 60) % 24)}:${pad(mins % 60)}`;
  }

  // "Mon, 14 Aug at 23:41", the way iMessage stamps a conversation.
  function formatStamp(mins) {
    const d = new Date();
    const day = d.toLocaleDateString("en-GB", { weekday: "short" });
    const month = d.toLocaleDateString("en-GB", { month: "short" });
    return `${day}, ${d.getDate()} ${month} at ${formatTime24(mins)}`;
  }

  // ── layout ─────────────────────────────────────────────────────────────────
  function visibleMessages() {
    return state.messages
      .filter((m) => m.kind !== "text" || m.text.trim())
      .map((m) => ({ ...m, text: m.text.trim() }));
  }

  function layoutAt(scale, bleed) {
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
      items.push({ type: "header", y, h: metaFs * 1.4, text: formatStamp(times[0]) });
      y += metaFs * 1.4 + 18 * scale;
    }

    // iMessage shows deletions as a centred note rather than a bubble.
    const isNote = (m) => style === "imessage" && m?.kind === "deleted";
    const sideOf = (m) => (m && !isNote(m) ? m.side : null);
    const lastMe = visible.reduce((acc, m, i) => (sideOf(m) === "me" && m.kind !== "typing" ? i : acc), -1);

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

      const shift = m.side === "me" ? bleed : 0;
      const tail = style === "whatsapp"
        ? (first ? (m.side === "me" ? "tr" : "tl") : null)
        : (last ? (m.side === "me" ? "br" : "bl") : null);

      if (m.kind === "typing") {
        const w = 118 * scale;
        const h = lh + padY * 2;
        const x = m.side === "me" ? W - SIDE_MARGIN - w + shift : SIDE_MARGIN;
        items.push({ type: "bubble", typing: true, x, y, w, h, side: m.side, lines: [], meta: null, tail: style === "imessage" ? tail : null, index: i });
        y += h;
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
      const x = m.side === "me" ? W - SIDE_MARGIN - w + shift : SIDE_MARGIN;

      items.push({ type: "bubble", x, y, w, h, side: m.side, deleted, lines, meta, tail, index: i });
      y += h;

      if (style === "imessage" && state.showMeta && i === lastMe) {
        const read = i < visible.length - 1 ? `Read ${formatTime24(times[i] + 1 + (i % 3))}` : "Delivered";
        items.push({ type: "receipt", y: y + 6 * scale, h: metaFs * 1.3, x: Math.min(x + w, W - 20), text: read });
        y += metaFs * 1.3 + 6 * scale;
      }
    });

    return { items, height: y, scale, fs, lh, padX, padY, metaFs, radius: RADIUS * scale };
  }

  // A few messages get big, confident type; long conversations shrink to fit.
  function layout(look) {
    const margin = 96;
    const compact = look && (look.composition === "cutout" || look.composition === "torn");
    const target = H * (compact ? 0.4 : 0.52);
    const bleed = look?.bleed || 0;
    let s = 1.4;
    let lay = layoutAt(s, bleed);
    while (s > 1 && lay.height > target) lay = layoutAt((s -= 0.05), bleed);
    while (lay.height > H - margin * 2 && s > 0.5) lay = layoutAt((s -= 0.05), bleed);

    // The words sit in the painting's calm space; a cut-out's subject sits below them.
    // The words sit at the top; the painting's subject lives below them.
    const space = "top";
    let top;
    if (space === "top") top = margin * 1.1;
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
    ctx.fillStyle = STYLES[state.style][state.style === "whatsapp" ? "dark" : "light"].bg;
    ctx.fillRect(0, 0, W, H);
    ctx.drawImage(grain(), 0, 0, W, H);
  }

  // ── drawing: bubbles ───────────────────────────────────────────────────────
  function drawItems(lay) {
    const S = STYLES[state.style][bubbleTheme(lay)];
    for (const it of lay.items) {
      if (it.type === "bubble") drawBubble(it, lay, S);
      else drawCaption(it, lay);
    }
  }

  // Dark bubbles on dark paintings and bare black, light bubbles on light ones.
  function bubbleTheme(lay) {
    if (!state.painting) return state.style === "whatsapp" ? "dark" : "light";
    let sum = 0;
    let n = 0;
    for (const it of lay.items) {
      if (it.type !== "bubble") continue;
      for (let k = 0; k < 6; k++) {
        const x = k % 2 ? it.x - 20 : it.x + it.w + 20;
        sum += bgLuminance(x, it.y + (it.h * (Math.floor(k / 2) + 0.5)) / 3);
        n++;
      }
    }
    return n && sum / n > 125 ? "light" : "dark";
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
    ctx.restore();
    if (state.painting) paintBubble(b, lay, me ? S.me : S.them);
    ctx.save();

    if (b.typing) {
      const cy = b.y + b.h / 2;
      for (let k = 0; k < 3; k++) {
        ctx.fillStyle = S.dots;
        ctx.globalAlpha = 0.55 + k * 0.2;
        ctx.beginPath();
        ctx.arc(b.x + b.w / 2 + (k - 1) * 26 * lay.scale, cy, 9 * lay.scale, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      return;
    }

    ctx.font = `${b.deleted ? "italic " : ""}${lay.fs}px ${FF}`;
    ctx.fillStyle = b.deleted ? S.deleted : me ? S.meText : S.themText;
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
  // The composition comes with the painting (each idea has a placement, which
  // you can override); each Remix re-rolls the hand: its mix of oil tools,
  // whether a bubble runs off the edge, whether the subject steps in front.
  function pickLook() {
    const rnd = mulberry32(state.strokeSeed ^ 0x5bd1e995);
    const composition = state.composition === "auto" ? state.autoComposition : state.composition;
    return {
      composition,
      ground: composition === "cutout" ? state.paintGround
        : rnd() < 0.6 ? [8, 8, 8] : [246, 244, 239],
      bleed: rnd() < 0.25 ? 20 + rnd() * 60 : 0,
      occlude: composition === "cutout" && rnd() < 0.8,
      hand: {
        bristle: 0.25 + rnd() * 0.75,
        knife: rnd() * 0.8,
        dab: rnd() * 0.7,
      },
    };
  }

  // ── paint-over strokes ─────────────────────────────────────────────────────
  // Strokes are generated from the seed and the layout, so typing keeps them
  // steady and Remix (a new seed) reshuffles them instantly. Every bubble gets
  // its own treatment: left clean, worked along one stretch of edge, a cluster
  // at a corner, a halo underneath, or partly swallowed by paint.
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
      // Most bubbles stay clean: the painting meets the words through the
      // composition. Paint on a bubble is the exception.
      const comp = look.composition;
      const treatment = b.typing ? "clean" : weighted(rnd, {
        clean: (comp === "cutout" ? 1.8 : 0.95) - 0.55 * a,
        edge: 0.3,
        corner: 0.15,
        halo: 0.08,
        swallow: b.w > 220 && swallowed < maxSwallow && comp !== "cutout" ? 0.02 + 0.4 * a * a : 0,
      });
      const add = (s) => strokes.push(makeStroke(rnd, palette, look, s));
      const perim = 2 * (b.w + b.h);

      if (treatment === "clean") return;

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
            width: 10 + rnd() * 22, over: true, dry: 0.3 + rnd() * 0.4, tool: "impasto",
          });
        }
        if (rnd() < 0.5) add(edgeStroke(b, rnd() * perim, rnd, a, false));
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
    const tool = s.tool || weighted(rnd, { impasto: look.hand.bristle, knife: look.hand.knife, dab: look.hand.dab });
    const c1 = palette[Math.floor(rnd() * palette.length)];
    const c2 = palette[Math.floor(rnd() * palette.length)];
    const stroke = {
      bend: 0.25,
      ...s,
      type: tool === "dab" ? "impasto" : tool,
      color: c1,
      color2: c2,
      dry: s.dry ?? 0.1 + rnd() * 0.5,
      seed: Math.floor(rnd() * 2 ** 31),
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
    if (s.type === "impasto") return paintMark(c, "flat", s);
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
  // full:   the painting fills the frame, bubbles laid simply on top.
  // torn:   bare ground where the words sit, painting beyond a torn, brushy edge.
  // cutout: the subject alone on flat black or white; it can step in front of bubbles.
  function buildMask(look, lay) {
    const m = document.createElement("canvas");
    m.width = W;
    m.height = H;
    const g = m.getContext("2d");
    const rnd = mulberry32(state.strokeSeed ^ 0x27d4eb2f);
    g.fillStyle = "#fff";
    const blockTop = lay.top;
    const blockBottom = lay.top + lay.height;

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
    } else if (look.composition === "cutout") {
      g.fillStyle = rgba(look.ground, 1);
      g.fillRect(0, 0, W, H);
      g.drawImage(cutoutLayer(), 0, 0);
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

  // The square painting sits at the bottom of the frame with its flat
  // background keyed out, so only the subject remains.
  // Only ground that touches the edge of the image is removed (a flood fill
  // from the border), so white faces or dark coats inside the subject stay.
  function keyedCutout(img, ground) {
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const g = c.getContext("2d");
    g.drawImage(img, 0, H - W, W, W);
    const data = g.getImageData(0, 0, W, H);
    const d = data.data;
    const [gr, gg, gb] = ground;
    const diff = (i) => Math.max(Math.abs(d[i] - gr), Math.abs(d[i + 1] - gg), Math.abs(d[i + 2] - gb));

    // Flood fill on a quarter-size grid for speed.
    const q = 4;
    const mw = Math.ceil(W / q);
    const mh = Math.ceil(H / q);
    const isGround = new Uint8Array(mw * mh);
    const seen = new Uint8Array(mw * mh);
    const stack = [];
    const groundAt = (mx, my) => {
      const x = Math.min(W - 1, mx * q + 1);
      const y = Math.min(H - 1, my * q + 1);
      const i = (y * W + x) * 4;
      return !d[i + 3] || diff(i) < 24;
    };
    for (let mx = 0; mx < mw; mx++) { stack.push(mx, 0, mx, mh - 1); }
    for (let my = 0; my < mh; my++) { stack.push(0, my, mw - 1, my); }
    while (stack.length) {
      const my = stack.pop();
      const mx = stack.pop();
      if (mx < 0 || my < 0 || mx >= mw || my >= mh) continue;
      const k = my * mw + mx;
      if (seen[k]) continue;
      seen[k] = 1;
      if (!groundAt(mx, my)) continue;
      isGround[k] = 1;
      stack.push(mx + 1, my, mx - 1, my, mx, my + 1, mx, my - 1);
    }
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        if (!d[i + 3]) continue;
        if (!isGround[Math.floor(y / q) * mw + Math.floor(x / q)]) continue;
        // Soft edge where ground meets subject.
        d[i + 3] = clampN(((diff(i) - 14) / 30) * 255, 0, 255);
      }
    }
    g.putImageData(data, 0, 0);
    return c;
  }

  function cutoutLayer() {
    return state.paintedCutout;
  }

  // The subject steps in front of the bubbles, but never over the words.
  const occluder = document.createElement("canvas");
  function drawOccluder(lay) {
    occluder.width = W;
    occluder.height = H;
    const g = occluder.getContext("2d");
    g.drawImage(cutoutLayer(), 0, 0);
    for (const it of lay.items) {
      if (it.type === "bubble") {
        g.clearRect(it.x + lay.padX * 0.6, it.y + lay.padY * 0.5, it.w - lay.padX * 1.2, it.h - lay.padY);
      }
    }
    ctx.drawImage(occluder, 0, 0);
  }

  let bgLumData = null;
  function bgLuminance(x, y) {
    if (!bgLumData) return 0;
    const i = (clampN(Math.round(y), 0, H - 1) * W + clampN(Math.round(x), 0, W - 1)) * 4;
    return 0.299 * bgLumData[i] + 0.587 * bgLumData[i + 1] + 0.114 * bgLumData[i + 2];
  }

  // ── the eleven strokes ─────────────────────────────────────────────────────
  // Every painting is built from these eleven brush marks, in the painting's
  // own colours. A scanned PNG in /strokes can stand in for any of them (see
  // strokes/README.md).
  const STROKE_TYPES = ["flat", "round", "filbert", "dry", "knife", "scumble", "dab", "fan", "rigger", "sweep", "stipple"];
  const strokeStamps = {}; // type → [HTMLImageElement]

  function paintMark(c, type, s) {
    const stamps = strokeStamps[type];
    if (stamps && stamps.length && (s.seed % 10) < 7) {
      return drawImageStroke(c, { ...s, image: stamps[s.seed % stamps.length] });
    }
    switch (type) {
      case "round": return drawRound(c, s);
      case "filbert": return drawFilbert(c, s);
      case "dry": return drawStroke(c, { ...s, color2: s.color2 || s.color, dry: 0.45 + (s.seed % 30) / 100, bend: 0.2 });
      case "knife": return drawKnife(c, { ...s, color2: s.color2 || shadeRgb(s.color, 25) });
      case "scumble": return drawScumble(c, s);
      case "dab": return drawImpasto(c, { ...s, len: Math.min(s.len, s.width * 1.3), width: s.width * 1.2, ridge: 1.4 });
      case "fan": return drawFan(c, s);
      case "rigger": return drawRigger(c, s);
      case "sweep": return drawSweep(c, s);
      case "stipple": return drawStipple(c, s);
      default: return drawImpasto(c, s); // flat
    }
  }

  // Round brush: soft rounded ends, tapering off, a gentle ridge.
  function drawRound(c, s) {
    const rnd = mulberry32(s.seed);
    const bend = (rnd() - 0.5) * s.len * 0.3;
    c.save();
    c.translate(s.x, s.y);
    c.rotate(s.angle);
    c.lineCap = "round";
    const pass = (w, col, a) => {
      c.strokeStyle = rgba(col, a);
      c.lineWidth = w;
      c.beginPath();
      c.moveTo(-s.len / 2, 0);
      c.quadraticCurveTo(0, bend, s.len / 2, bend * 0.3);
      c.stroke();
    };
    pass(s.width, s.color, s.alpha ?? 0.95);
    pass(s.width * 0.45, shadeRgb(s.color, 18 + rnd() * 14), 0.35);
    c.translate(0, -s.width * 0.28);
    pass(Math.max(1, s.width * 0.12), [255, 255, 255], 0.3 * (s.ridge ?? 1));
    c.restore();
  }

  // Filbert: an oval, leaf-shaped dab, full in the middle.
  function drawFilbert(c, s) {
    const rnd = mulberry32(s.seed);
    c.save();
    c.translate(s.x, s.y);
    c.rotate(s.angle);
    const L = s.len / 2;
    const w = s.width / 2;
    c.beginPath();
    c.moveTo(-L, 0);
    c.bezierCurveTo(-L * 0.6, -w * 1.2, L * 0.5, -w, L, 0);
    c.bezierCurveTo(L * 0.5, w, -L * 0.6, w * 1.2, -L, 0);
    c.fillStyle = rgba(s.color, s.alpha ?? 0.95);
    c.fill();
    c.strokeStyle = rgba(shadeRgb(s.color, (rnd() - 0.5) * 50), 0.35);
    c.lineWidth = w * 0.4;
    c.beginPath();
    c.moveTo(-L * 0.7, (rnd() - 0.5) * w);
    c.quadraticCurveTo(0, (rnd() - 0.5) * w, L * 0.6, 0);
    c.stroke();
    c.strokeStyle = `rgba(255,255,255,${0.38 * (s.ridge ?? 1)})`;
    c.lineWidth = Math.max(1, w * 0.18);
    c.beginPath();
    c.moveTo(-L * 0.55, -w * 0.62);
    c.quadraticCurveTo(0, -w * 0.9, L * 0.5, -w * 0.45);
    c.stroke();
    c.restore();
  }

  // Scumble: thin paint scrubbed in loose loops, letting what's under show.
  function drawScumble(c, s) {
    const rnd = mulberry32(s.seed);
    c.save();
    c.translate(s.x, s.y);
    c.rotate(s.angle);
    c.lineCap = "round";
    const r = Math.max(s.width, s.len * 0.5);
    for (let k = 0; k < 7; k++) {
      c.strokeStyle = rgba(shadeRgb(s.color, (rnd() - 0.5) * 30), 0.28);
      c.lineWidth = s.width * (0.35 + rnd() * 0.3);
      c.beginPath();
      c.ellipse((rnd() - 0.5) * r * 0.6, (rnd() - 0.5) * r * 0.4, r * (0.3 + rnd() * 0.4), r * (0.15 + rnd() * 0.25), rnd() * 3, 0, Math.PI * (1.2 + rnd()));
      c.stroke();
    }
    c.restore();
  }

  // Fan brush: a feathered splay of fine hairs.
  function drawFan(c, s) {
    const rnd = mulberry32(s.seed);
    c.save();
    c.translate(s.x, s.y);
    c.rotate(s.angle);
    const n = 14 + Math.floor(rnd() * 10);
    for (let k = 0; k < n; k++) {
      const spread = (k / (n - 1) - 0.5) * s.width * 1.6;
      c.strokeStyle = rgba(shadeRgb(s.color, (rnd() - 0.5) * 40), 0.55 + rnd() * 0.3);
      c.lineWidth = 1 + rnd() * 2;
      c.beginPath();
      c.moveTo(-s.len / 2, spread * 0.25);
      c.quadraticCurveTo(0, spread * 0.7, s.len / 2 - rnd() * s.len * 0.3, spread);
      c.stroke();
    }
    c.restore();
  }

  // Rigger: a long, thin, wavering line for contours and cracks.
  function drawRigger(c, s) {
    const rnd = mulberry32(s.seed);
    c.save();
    c.translate(s.x, s.y);
    c.rotate(s.angle);
    c.lineCap = "round";
    c.strokeStyle = rgba(s.color, 0.9);
    c.lineWidth = Math.max(1.5, Math.min(5, s.width * 0.25));
    c.beginPath();
    const L = s.len * 1.3;
    c.moveTo(-L / 2, 0);
    for (let t = 1; t <= 6; t++) c.lineTo(-L / 2 + (t / 6) * L, (rnd() - 0.5) * s.width * 0.35);
    c.stroke();
    c.restore();
  }

  // Sweep: one long, loaded stroke that runs dry towards its end.
  function drawSweep(c, s) {
    const rnd = mulberry32(s.seed);
    const L = s.len * 1.8;
    const hw = s.width / 2;
    const bend = (rnd() - 0.5) * s.width * 2.5;
    c.save();
    c.translate(s.x, s.y);
    c.rotate(s.angle);
    const grad = c.createLinearGradient(-L / 2, 0, L / 2, 0);
    grad.addColorStop(0, rgba(s.color, 0.97));
    grad.addColorStop(0.7, rgba(s.color, 0.85));
    grad.addColorStop(1, rgba(s.color, 0.15));
    c.fillStyle = grad;
    c.beginPath();
    c.moveTo(-L / 2, -hw);
    c.quadraticCurveTo(0, -hw + bend, L / 2, -hw * 0.4 + bend * 0.3);
    c.lineTo(L / 2, hw * 0.2 + bend * 0.3);
    c.quadraticCurveTo(0, hw + bend, -L / 2, hw);
    c.closePath();
    c.fill();
    for (let k = 0; k < 4; k++) {
      const y = (rnd() - 0.5) * hw * 1.4;
      c.strokeStyle = rgba(shadeRgb(s.color, (rnd() - 0.5) * 50), 0.3);
      c.lineWidth = Math.max(1, hw * 0.18);
      c.beginPath();
      c.moveTo(-L / 2, y);
      c.quadraticCurveTo(0, y + bend, L / 2 - rnd() * L * 0.4, y * 0.4 + bend * 0.3);
      c.stroke();
    }
    c.strokeStyle = `rgba(255,255,255,${0.3 * (s.ridge ?? 1)})`;
    c.lineWidth = Math.max(1, hw * 0.15);
    c.beginPath();
    c.moveTo(-L / 2 + 4, -hw * 0.75);
    c.quadraticCurveTo(0, -hw * 0.75 + bend, L * 0.3, -hw * 0.55 + bend * 0.5);
    c.stroke();
    c.restore();
  }

  // Stipple: a cluster of small tapped dots.
  function drawStipple(c, s) {
    const rnd = mulberry32(s.seed);
    const r = Math.max(s.width, s.len * 0.4);
    const n = 8 + Math.floor(rnd() * 12);
    for (let k = 0; k < n; k++) {
      const x = s.x + (rnd() - 0.5) * r * 1.6;
      const y = s.y + (rnd() - 0.5) * r * 1.6;
      const d = 2 + rnd() * s.width * 0.22;
      c.fillStyle = rgba(shadeRgb(s.color, (rnd() - 0.5) * 40), 0.9);
      c.beginPath();
      c.ellipse(x, y, d, d * (0.6 + rnd() * 0.4), rnd() * 3, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = "rgba(255,255,255,0.35)";
      c.beginPath();
      c.arc(x - d * 0.3, y - d * 0.3, d * 0.35, 0, Math.PI * 2);
      c.fill();
    }
  }

  // Which of the eleven marks a painter would reach for here.
  function chooseMark(rnd, layerR, busy, edge) {
    if (layerR >= 34) return weighted(rnd, busy ? { flat: 5, filbert: 3, knife: 2 } : { sweep: 4, flat: 4, scumble: 2 });
    if (layerR >= 18) return weighted(rnd, busy
      ? { flat: 3, filbert: 2.5, round: 2, dab: 1.5, knife: 1 }
      : { flat: 4, sweep: 3, scumble: 1.5, dry: 1.5 });
    if (layerR >= 9) return weighted(rnd, { round: 3.5, dab: 3, filbert: 2, fan: 1, stipple: 0.5 });
    return weighted(rnd, edge ? { rigger: 5, round: 3, stipple: 2 } : { round: 5, stipple: 3, dab: 2 });
  }

  // ── painterly repaint ──────────────────────────────────────────────────────
  // The model decides what is painted; this decides how it looks. Every
  // generated image is repainted by hand, stroke by stroke: thick impasto dabs
  // that follow the forms, in a reduced palette, coarse to fine. The same brush
  // paints the bubbles, so words and picture share one surface.
  async function paintify(src, masked) {
    const rnd = mulberry32(state.paintingId * 7919 + 17);
    const q = 4;
    const sw = Math.round(W / q);
    const sh = Math.round(H / q);
    const small = document.createElement("canvas");
    small.width = sw;
    small.height = sh;
    const sg = small.getContext("2d");
    sg.imageSmoothingQuality = "high";
    sg.drawImage(src, 0, 0, sw, sh);
    const sd = sg.getImageData(0, 0, sw, sh).data;
    const full = src.getContext("2d").getImageData(0, 0, W, H).data;

    // Flow field: smoothed structure tensor of the luminance gradient.
    const n = sw * sh;
    const lum = new Float32Array(n);
    for (let i = 0; i < n; i++) lum[i] = 0.299 * sd[i * 4] + 0.587 * sd[i * 4 + 1] + 0.114 * sd[i * 4 + 2];
    let exx = new Float32Array(n);
    let eyy = new Float32Array(n);
    let exy = new Float32Array(n);
    for (let y = 1; y < sh - 1; y++) {
      for (let x = 1; x < sw - 1; x++) {
        const i = y * sw + x;
        const gx = lum[i - sw + 1] + 2 * lum[i + 1] + lum[i + sw + 1] - lum[i - sw - 1] - 2 * lum[i - 1] - lum[i + sw - 1];
        const gy = lum[i + sw - 1] + 2 * lum[i + sw] + lum[i + sw + 1] - lum[i - sw - 1] - 2 * lum[i - sw] - lum[i - sw + 1];
        exx[i] = gx * gx;
        eyy[i] = gy * gy;
        exy[i] = gx * gy;
      }
    }
    exx = boxBlur(exx, sw, sh, 3);
    eyy = boxBlur(eyy, sw, sh, 3);
    exy = boxBlur(exy, sw, sh, 3);
    const energy = new Float32Array(n);
    for (let i = 0; i < n; i++) energy[i] = Math.sqrt(exx[i] + eyy[i]);
    const sorted = Array.from(energy.filter((_, i) => i % 7 === 0)).sort((a, b) => a - b);
    const eMid = sorted[Math.floor(sorted.length * 0.55)] || 1;
    const eHigh = sorted[Math.floor(sorted.length * 0.8)] || 1;
    const eTop = sorted[Math.floor(sorted.length * 0.93)] || 1;

    const palette = kmeansPalette(sd, 12, rnd);
    const hand = rnd() * Math.PI; // stroke direction where the forms don't say otherwise

    const out = document.createElement("canvas");
    out.width = W;
    out.height = H;
    const g = out.getContext("2d");
    // Underpainting: a soft, blurred version so no bare gaps show between strokes.
    const tiny = document.createElement("canvas");
    tiny.width = Math.round(W / 18);
    tiny.height = Math.round(H / 18);
    tiny.getContext("2d").drawImage(src, 0, 0, tiny.width, tiny.height);
    g.imageSmoothingQuality = "high";
    g.drawImage(tiny, 0, 0, W, H);
    if (masked) {
      g.globalCompositeOperation = "destination-in";
      g.drawImage(src, 0, 0);
      g.globalCompositeOperation = "source-over";
    }

    const layers = [
      { r: 40, keep: () => true },
      { r: 22, keep: (e) => e > eMid || rnd() < 0.35 },
      { r: 11, keep: (e) => e > eHigh || rnd() < 0.08 },
      { r: 5, keep: (e) => e > eTop }, // small details (faces, hands, a boat) survive
    ];
    let count = 0;
    for (const layer of layers) {
      const step = layer.r * 0.9;
      const pts = [];
      for (let y = step / 2; y < H; y += step) {
        for (let x = step / 2; x < W; x += step) pts.push([x + (rnd() - 0.5) * step, y + (rnd() - 0.5) * step]);
      }
      shuffle(pts, rnd);
      for (const [x, y] of pts) {
        const sx = clampN(Math.floor(x / q), 0, sw - 1);
        const sy = clampN(Math.floor(y / q), 0, sh - 1);
        const i = sy * sw + sx;
        if (masked && sd[i * 4 + 3] < 110) continue;
        const e = energy[i];
        if (!layer.keep(e)) continue;
        let col;
        if (layer.r > 10) col = [sd[i * 4], sd[i * 4 + 1], sd[i * 4 + 2]];
        else {
          const k = (clampN(Math.round(y), 0, H - 1) * W + clampN(Math.round(x), 0, W - 1)) * 4;
          col = [full[k], full[k + 1], full[k + 2]];
        }
        // Pull towards the palette, then vary it: painters never lay one flat colour.
        col = mix(col, nearest(palette, col), 0.5);
        if (rnd() < 0.18) col = mix(col, secondNearest(palette, col), 0.6);
        // Busy forms get lively colour; flat areas stay calm, like a flat ground.
        const calm = e < eMid * 0.6;
        col = saturate(shadeRgb(col, (rnd() - 0.5) * (calm ? 12 : 36)), 1.15);
        const flow = 0.5 * Math.atan2(2 * exy[i], exx[i] - eyy[i]) + Math.PI / 2;
        const angle = (e > eMid * 0.6 ? flow : hand + (rnd() - 0.5) * 0.8) + (rnd() - 0.5) * 0.35;
        const edge = e > eTop;
        const mark = chooseMark(rnd, layer.r, !calm, edge);
        paintMark(g, mark, {
          x, y, angle,
          color: mark === "rigger" ? shadeRgb(col, -45) : col,
          len: layer.r * (1.2 + rnd() * rnd() * 3.6) * (calm ? 1.6 : 1),
          width: layer.r * (0.9 + rnd() * 0.6),
          seed: Math.floor(rnd() * 2 ** 31),
          ridge: calm ? 0.5 : 1,
        });
        if (++count % 1500 === 0) await new Promise((r) => requestAnimationFrame(r));
      }
    }
    return out;
  }

  // One thick stroke of oil paint: a loaded body, a few streaks where the
  // bristles dragged other colours through it, and a ridge of light along one
  // side and shadow along the other (light from the top left), like impasto.
  function drawImpasto(c, s) {
    const rnd = mulberry32(s.seed);
    const L = s.len;
    const hw = s.width / 2;
    const bend = (rnd() - 0.5) * s.width * 0.9;
    const alpha = s.alpha ?? 0.96;
    const ridge = s.ridge ?? 1;
    c.save();
    c.translate(s.x, s.y);
    c.rotate(s.angle);
    const N = 7;
    const top = [];
    const bot = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const x = -L / 2 + t * L;
      const mid = bend * 4 * t * (1 - t);
      // A flat brush: square-ish start, even body, a short dry taper at the end.
      const w = hw * (t < 0.1 ? 0.9 : t > 0.8 ? Math.max(0.5, 1 - (t - 0.8) * 2.5) : 1) * (0.9 + rnd() * 0.14);
      top.push([x, mid - w]);
      bot.push([x, mid + w]);
    }
    const trace = (pts) => {
      for (let i = 1; i < pts.length - 1; i++) {
        c.quadraticCurveTo(pts[i][0], pts[i][1], (pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2);
      }
      c.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
    };
    c.beginPath();
    c.moveTo(top[0][0], top[0][1]);
    trace(top);
    const back = bot.slice().reverse();
    c.lineTo(back[0][0], back[0][1]);
    trace(back);
    c.closePath();
    c.fillStyle = rgba(s.color, alpha);
    c.fill();

    // Bands of lighter and darker paint dragged along the stroke.
    const streaks = 1 + Math.floor(rnd() * 2);
    for (let k = 0; k < streaks; k++) {
      const y = (rnd() - 0.5) * hw * 1.2;
      const shade = (rnd() - 0.5) * 60;
      c.strokeStyle = rgba([s.color[0] + shade, s.color[1] + shade, s.color[2] + shade], (0.25 + rnd() * 0.2) * alpha);
      c.lineWidth = Math.max(1, hw * (0.2 + rnd() * 0.3));
      const x0 = -L / 2 + rnd() * L * 0.25;
      const x1 = L / 2 - rnd() * L * 0.35;
      c.beginPath();
      c.moveTo(x0, y + bend * 0.3);
      c.quadraticCurveTo(0, y + bend, x1, y + bend * 0.2);
      c.stroke();
    }

    if (ridge > 0) {
      const litTop = Math.cos(s.angle) - Math.sin(s.angle) > 0;
      const lw = Math.max(1.2, hw * 0.2);
      // Light catches the ridge in broken runs; the shadow side is only a hint.
      const edge = (pts, inset, style) => {
        c.strokeStyle = style;
        c.lineWidth = lw;
        c.beginPath();
        let pen = false;
        for (let i = 0; i < pts.length - 1; i++) {
          if (rnd() < 0.3) { pen = false; continue; }
          if (pen) c.lineTo(pts[i][0], pts[i][1] + inset);
          else { c.moveTo(pts[i][0], pts[i][1] + inset); pen = true; }
        }
        c.stroke();
      };
      const light = `rgba(255,255,255,${0.42 * ridge})`;
      const dark = `rgba(0,0,0,${0.12 * ridge})`;
      edge(top, lw * 0.8, litTop ? light : dark);
      edge(bot, -lw * 0.8, litTop ? dark : light);
    }
    c.restore();
  }

  function boxBlur(a, w, h, r) {
    const tmp = new Float32Array(a.length);
    const out = new Float32Array(a.length);
    for (let y = 0; y < h; y++) {
      let acc = 0;
      for (let x = -r; x <= r; x++) acc += a[y * w + clampN(x, 0, w - 1)];
      for (let x = 0; x < w; x++) {
        tmp[y * w + x] = acc / (2 * r + 1);
        acc += a[y * w + Math.min(w - 1, x + r + 1)] - a[y * w + Math.max(0, x - r)];
      }
    }
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let y = -r; y <= r; y++) acc += tmp[clampN(y, 0, h - 1) * w + x];
      for (let y = 0; y < h; y++) {
        out[y * w + x] = acc / (2 * r + 1);
        acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
      }
    }
    return out;
  }

  // A reduced palette pulls neighbouring strokes to the same few paints, so
  // colours sit side by side unblended instead of in smooth gradients.
  function kmeansPalette(d, k, rnd) {
    const px = [];
    for (let t = 0; t < 1800; t++) {
      const i = Math.floor(rnd() * (d.length / 4)) * 4;
      if (d[i + 3] > 128) px.push([d[i], d[i + 1], d[i + 2]]);
    }
    if (!px.length) return [[128, 128, 128]];
    let centres = Array.from({ length: k }, () => px[Math.floor(rnd() * px.length)].slice());
    for (let it = 0; it < 8; it++) {
      const sums = centres.map(() => [0, 0, 0, 0]);
      for (const p of px) {
        const j = nearestIndex(centres, p);
        sums[j][0] += p[0]; sums[j][1] += p[1]; sums[j][2] += p[2]; sums[j][3]++;
      }
      centres = sums.map((s2, j) => (s2[3] ? [s2[0] / s2[3], s2[1] / s2[3], s2[2] / s2[3]] : centres[j]));
    }
    return centres;
  }
  function nearestIndex(list, p) {
    let best = 0;
    let bd = Infinity;
    list.forEach((c, j) => {
      const d = (c[0] - p[0]) ** 2 + (c[1] - p[1]) ** 2 + (c[2] - p[2]) ** 2;
      if (d < bd) { bd = d; best = j; }
    });
    return best;
  }
  function nearest(list, p) { return list[nearestIndex(list, p)]; }
  function secondNearest(list, p) {
    const first = nearestIndex(list, p);
    const rest = list.filter((_, j) => j !== first);
    return rest.length ? rest[nearestIndex(rest, p)] : list[first];
  }
  function shuffle(a, rnd) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
  }

  // The bubble in paint: a brushed fill in its own colour and a brushy outline
  // along the straight stretches (corners stay round), then crisp words on top.
  function paintBubble(b, lay, fillHex) {
    const col = hexRgb(fillHex);
    const rnd = mulberry32((state.strokeSeed ^ Math.imul(b.index + 1, 2654435761)) >>> 0);
    ctx.save();
    bubblePath(ctx, b.x, b.y, b.w, b.h, lay.radius, b.tail, lay.scale);
    ctx.clip();
    const n = Math.round((b.w * b.h) / 1600);
    for (let k = 0; k < n; k++) {
      drawImpasto(ctx, {
        x: b.x + rnd() * b.w, y: b.y + rnd() * b.h,
        angle: (rnd() - 0.5) * 0.25, len: 50 + rnd() * 110, width: 12 + rnd() * 18,
        color: shadeRgb(col, (rnd() - 0.5) * 16), alpha: 0.55, ridge: 0.45,
        seed: Math.floor(rnd() * 2 ** 31),
      });
    }
    ctx.restore();
    const r = Math.min(lay.radius, b.h / 2, b.w / 2);
    const edges = [
      [b.x + r, b.y, b.x + b.w - r, b.y],
      [b.x + r, b.y + b.h, b.x + b.w - r, b.y + b.h],
      [b.x, b.y + r, b.x, b.y + b.h - r],
      [b.x + b.w, b.y + r, b.x + b.w, b.y + b.h - r],
    ];
    for (const [x0, y0, x1, y1] of edges) {
      const len = Math.hypot(x1 - x0, y1 - y0);
      if (len < 10) continue;
      const tx = (x1 - x0) / len;
      const ty = (y1 - y0) / len;
      const cx = b.x + b.w / 2;
      const cy = b.y + b.h / 2;
      const mx = (x0 + x1) / 2 - cx;
      const my = (y0 + y1) / 2 - cy;
      const nl = Math.hypot(mx, my) || 1;
      const nx = Math.abs(tx) > 0.5 ? 0 : Math.sign(mx);
      const ny = Math.abs(tx) > 0.5 ? Math.sign(my) : 0;
      for (let d = rnd() * 10; d < len; d += 20 + rnd() * 16) {
        const seg = Math.min(26 + rnd() * 34, (len - d) * 2 + 10);
        const out = -1 + rnd() * 5;
        drawImpasto(ctx, {
          x: x0 + tx * d + nx * out, y: y0 + ty * d + ny * out,
          angle: Math.atan2(ty, tx) + (rnd() - 0.5) * 0.12, len: seg, width: 8 + rnd() * 8,
          color: shadeRgb(col, (rnd() - 0.5) * 12), alpha: 0.96, ridge: 0.4,
          seed: Math.floor(rnd() * 2 ** 31),
        });
      }
      void nl;
    }
  }

  function hexRgb(hex) {
    const v = parseInt(hex.slice(1), 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }
  function shadeRgb(c, d) { return [c[0] + d, c[1] + d, c[2] + d]; }

  // A canvas weave over everything, bubbles included: one surface.
  let weaveCanvas = null;
  function weave() {
    if (weaveCanvas) return weaveCanvas;
    weaveCanvas = document.createElement("canvas");
    weaveCanvas.width = weaveCanvas.height = 96;
    const g = weaveCanvas.getContext("2d");
    const img = g.createImageData(96, 96);
    const rnd = mulberry32(23);
    for (let y = 0; y < 96; y++) {
      for (let x = 0; x < 96; x++) {
        const threadX = Math.sin((x / 96) * Math.PI * 2 * 24) * 0.5 + 0.5;
        const threadY = Math.sin((y / 96) * Math.PI * 2 * 24) * 0.5 + 0.5;
        const v = 128 + ((x + y) % 2 ? threadX : threadY) * 40 - 20 + (rnd() - 0.5) * 30;
        const i = (y * 96 + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return weaveCanvas;
  }

  // ── screenshots ────────────────────────────────────────────────────────────
  // Upload a chat screenshot: the text is read on the device (Tesseract OCR),
  // lines are grouped into messages (right side = me, left = them), each
  // bubble's shape is found by growing out from its text in the bubble's own
  // colour, and the painting is laid behind, beside or through the bubbles,
  // never over the words.
  const TESSERACT_URL = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const el = document.createElement("script");
      el.src = src;
      el.onload = resolve;
      el.onerror = () => reject(new Error("Couldn't load the text reader. Check your connection."));
      document.head.append(el);
    });
  }

  async function readScreenshot(file) {
    if (state.busy) return;
    setBusy(true, "Reading the chat…");
    try {
      const url = URL.createObjectURL(file);
      const img = await loadImage(url);
      if (!window.Tesseract) await loadScript(TESSERACT_URL);
      // Read at up to 1400px wide: plenty for chat text, quicker on phones.
      const k = Math.min(1, 1400 / img.naturalWidth);
      const c = document.createElement("canvas");
      c.width = Math.round(img.naturalWidth * k);
      c.height = Math.round(img.naturalHeight * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      const worker = await window.Tesseract.createWorker(els.mal.checked ? "eng+mal" : "eng", 1);
      const { data } = await worker.recognize(textOnly(c));
      await worker.terminate();
      const bubbles = parseShot(data.lines || [], c.width, c.height);
      if (!bubbles.length) throw new Error("Couldn't find any messages in that screenshot. Try a clearer one, or type the chat below.");
      state.messages = bubbles.map((b) => ({ side: b.side, text: b.text, kind: "text" }));
      renderList();
      state.shot = analyseShot(c, bubbles);
      state.shotId = (state.shotId || 0) + 1;
      els.clearShot.hidden = false;
      render();
      setStatus(`Read ${bubbles.length} message${bubbles.length > 1 ? "s" : ""}. Check them below (they decide the idea), then tap Paint it.`);
    } catch (err) {
      setStatus(err.message || "Couldn't read that screenshot.", true);
    } finally {
      setBusy(false);
      els.shot.value = "";
    }
  }

  // Chats mix light-on-dark and dark-on-light text (white on a blue bubble,
  // black on grey, anything in dark mode). OCR wants dark text on white, so
  // each pixel becomes "how much it stands out from its surroundings": text of
  // any colour turns dark, flat bubbles and backgrounds turn white.
  function textOnly(src) {
    const w = src.width;
    const h = src.height;
    const lumOf = (d) => {
      const out = new Float32Array(w * h);
      for (let i = 0; i < w * h; i++) out[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
      return out;
    };
    const lum = lumOf(src.getContext("2d").getImageData(0, 0, w, h).data);
    // Local background: a heavily blurred copy (downscale, then upscale smoothly).
    const small = document.createElement("canvas");
    small.width = Math.max(1, Math.round(w / 24));
    small.height = Math.max(1, Math.round(h / 24));
    small.getContext("2d").drawImage(src, 0, 0, small.width, small.height);
    const up = document.createElement("canvas");
    up.width = w;
    up.height = h;
    const ug = up.getContext("2d");
    ug.imageSmoothingQuality = "high";
    ug.drawImage(small, 0, 0, w, h);
    const bg = lumOf(ug.getImageData(0, 0, w, h).data);
    const out = ug.createImageData(w, h);
    for (let i = 0; i < w * h; i++) {
      const v = 255 - Math.min(255, Math.abs(lum[i] - bg[i]) * 3.2);
      out.data[i * 4] = out.data[i * 4 + 1] = out.data[i * 4 + 2] = v;
      out.data[i * 4 + 3] = 255;
    }
    ug.putImageData(out, 0, 0);
    return up;
  }

  // OCR lines → messages. Drops the status bar, header and input bar, bare
  // times, receipts and dates; strips a trailing time from a message line.
  function parseShot(lines, w, h) {
    const kept = [];
    for (const l of lines) {
      let text = String(l.text || "").replace(/\s+/g, " ").trim();
      if (!text || (l.confidence ?? 100) < 45) continue;
      const { x0, y0, x1, y1 } = l.bbox;
      if (y1 < h * 0.09 || y0 > h * 0.92) continue;
      if (/^\d{1,2}[:.]\d{2}\s?([ap]\.?m\.?)?\s*[✓√v/]*$/i.test(text)) continue;
      if (/^(today|yesterday|delivered|read( \d.*)?|seen|typing…?|online|last seen.*|\w{3},? \d{1,2} \w{3}.*|\d+ reply)$/i.test(text)) continue;
      // Trailing time and ticks ("11:42pm ✓✓", which OCR may read as "4)"), and
      // bubble-edge debris at the start.
      text = text
        .replace(/\s+\d{1,2}\s?[:.]\s?\d{2}\s?([ap]\.?\s?m\.?)?[^\p{L}]*$/iu, "")
        .replace(/^[|\[\]{}()\\/]+\s*/, "")
        .trim();
      if (!text || !/[\p{L}\p{N}]/u.test(text)) continue;
      kept.push({ text, x0, y0, x1, y1, lh: y1 - y0, side: w - x1 < x0 ? "me" : "them" });
    }
    kept.sort((a, b) => a.y0 - b.y0);
    const bubbles = [];
    for (const l of kept) {
      const prev = bubbles[bubbles.length - 1];
      if (prev && prev.side === l.side && l.y0 - prev.y1 < Math.max(prev.lh, l.lh) * 0.9) {
        prev.text += ` ${l.text}`;
        prev.x0 = Math.min(prev.x0, l.x0);
        prev.x1 = Math.max(prev.x1, l.x1);
        prev.y1 = l.y1;
        prev.lines.push([l.x0, l.y0, l.x1, l.y1]);
      } else {
        bubbles.push({ ...l, lines: [[l.x0, l.y0, l.x1, l.y1]] });
      }
    }
    return bubbles.slice(0, MAX_MESSAGES);
  }

  // Grow each bubble out from its text in its own colour (on a half-size grid),
  // find the chat's background colour, and keep the text boxes.
  function analyseShot(src, bubbles) {
    const q = 2;
    const w = Math.ceil(src.width / q);
    const h = Math.ceil(src.height / q);
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const g = c.getContext("2d");
    g.drawImage(src, 0, 0, w, h);
    const d = g.getImageData(0, 0, w, h).data;
    const keep = new Uint8Array(w * h);
    const px = (x, y) => (y * w + x) * 4;
    const diff = (i, col) => Math.max(Math.abs(d[i] - col[0]), Math.abs(d[i + 1] - col[1]), Math.abs(d[i + 2] - col[2]));

    // Background first: the commonest colour outside the text boxes.
    const inText = new Uint8Array(w * h);
    for (const b of bubbles) {
      for (let y = Math.floor(b.y0 / q); y <= Math.min(h - 1, Math.ceil(b.y1 / q)); y++) {
        for (let x = Math.floor(b.x0 / q); x <= Math.min(w - 1, Math.ceil(b.x1 / q)); x++) inText[y * w + x] = 1;
      }
    }
    const counts = new Map();
    for (let i = 0; i < w * h; i += 3) {
      if (inText[i]) continue;
      const key = ((d[i * 4] >> 4) << 8) | ((d[i * 4 + 1] >> 4) << 4) | (d[i * 4 + 2] >> 4);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    let bgKey = 0;
    let bgN = -1;
    for (const [key, n] of counts) if (n > bgN) { bgN = n; bgKey = key; }
    const bg = [((bgKey >> 8) & 15) * 16 + 8, ((bgKey >> 4) & 15) * 16 + 8, (bgKey & 15) * 16 + 8];
    const far = (a, z) => Math.max(Math.abs(a[0] - z[0]), Math.abs(a[1] - z[1]), Math.abs(a[2] - z[2]));

    for (const b of bubbles) {
      const bx0 = Math.max(0, Math.floor(b.x0 / q) - 5);
      const by0 = Math.max(0, Math.floor(b.y0 / q) - 5);
      const bx1 = Math.min(w - 1, Math.ceil(b.x1 / q) + 5);
      const by1 = Math.min(h - 1, Math.ceil(b.y1 / q) + 5);
      // The bubble's colour: the commonest colour inside the text box (the gaps
      // between letters are bubble), and the flood starts from those pixels.
      const tally = new Map();
      const seeds = [];
      for (let y = by0 + 5; y <= by1 - 5; y++) {
        for (let x = bx0 + 5; x <= bx1 - 5; x++) {
          const i = px(x, y);
          const key = ((d[i] >> 3) << 10) | ((d[i + 1] >> 3) << 5) | (d[i + 2] >> 3);
          tally.set(key, (tally.get(key) || 0) + 1);
        }
      }
      let topKey = 0;
      let topN = -1;
      for (const [key, n] of tally) if (n > topN) { topN = n; topKey = key; }
      const col = [((topKey >> 10) & 31) * 8 + 4, ((topKey >> 5) & 31) * 8 + 4, (topKey & 31) * 8 + 4];
      b.colour = col;
      const ring = [];
      for (let y = by0 + 5; y <= by1 - 5; y += 2) for (let x = bx0 + 5; x <= bx1 - 5; x += 2) ring.push([x, y]);
      const lim = [Math.max(0, bx0 - 45), Math.max(0, by0 - 45), Math.min(w - 1, bx1 + 45), Math.min(h - 1, by1 + 45)];
      // Tight tolerance when the bubble is close to the background (dark mode).
      const tol = clampN(far(col, bg) * 0.45, 5, 28);
      const stack = [];
      // A bubble the same colour as the background can't be traced: keep its text only.
      if (far(col, bg) >= 12) for (const [x, y] of ring) if (diff(px(x, y), col) < tol) stack.push(x, y);
      let rx0 = bx0, ry0 = by0, rx1 = bx1, ry1 = by1;
      while (stack.length) {
        const y = stack.pop();
        const x = stack.pop();
        if (x < lim[0] || y < lim[1] || x > lim[2] || y > lim[3]) continue;
        const k = y * w + x;
        if (keep[k] === 2) continue;
        if (keep[k] !== 1 && diff(px(x, y), col) >= tol) continue;
        keep[k] = 2;
        rx0 = Math.min(rx0, x); ry0 = Math.min(ry0, y); rx1 = Math.max(rx1, x); ry1 = Math.max(ry1, y);
        stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
      }
      // The text itself always stays.
      for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) keep[y * w + x] = 2;
      b.region = [rx0 * q, ry0 * q, (rx1 + 1) * q, (ry1 + 1) * q];
    }

    // Keep-mask canvas (1 cell dilation) and the bubble edge, for painting.
    const mask = document.createElement("canvas");
    mask.width = w;
    mask.height = h;
    const mg = mask.getContext("2d");
    const md = mg.createImageData(w, h);
    const edge = [];
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const k = y * w + x;
        const on = keep[k] || keep[k - 1] || keep[k + 1] || keep[k - w] || keep[k + w];
        if (on) md.data[k * 4 + 3] = 255;
        if (keep[k] && (!keep[k - 1] || !keep[k + 1] || !keep[k - w] || !keep[k + w])) {
          edge.push([x * q, y * q, Math.atan2(keep[k + w] - keep[k - w], keep[k + 1] - keep[k - 1]) + Math.PI / 2]);
        }
      }
    }
    mg.putImageData(md, 0, 0);
    return { img: src, w: src.width, h: src.height, bubbles, bg, mask, edge };
  }

  // Place the screenshot in the 4:5 frame: words at the top for a character or
  // torn edge, centred for a painting behind. The chat's clutter (status bar,
  // header, input bar, wallpaper) goes; only the bubbles stay, on a flat ground.
  let shotCache = { key: "", L: null };
  function shotLayout(comp) {
    const key = `${state.shotId}|${comp}`;
    if (shotCache.key === key) return shotCache.L;
    const A = state.shot;
    const by0 = Math.min(...A.bubbles.map((b) => b.region[1]));
    const by1 = Math.max(...A.bubbles.map((b) => b.region[3]));
    const bx0 = Math.min(...A.bubbles.map((b) => b.region[0]));
    const bx1 = Math.max(...A.bubbles.map((b) => b.region[2]));
    // Zoom in so the text is big (about 60px lines), as far as the frame allows;
    // a long bubble may run off the right edge, like a cropped screenshot.
    const lineH = A.bubbles.flatMap((b) => b.lines.map((l) => l[3] - l[1])).sort((a, z) => a - z);
    const medLine = lineH[lineH.length >> 1] || 40;
    const fit = Math.min(W / A.w, (H - 180) / Math.max(1, by1 - by0));
    const s = Math.min(Math.max(fit, 60 / medLine), (H - 180) / Math.max(1, by1 - by0), (W * 1.03) / Math.max(1, bx1 - bx0));
    const dw = A.w * s;
    const dh = A.h * s;
    const ox = (bx1 - bx0) * s <= W - 60 ? W / 2 - ((bx0 + bx1) / 2) * s : 36 - bx0 * s;
    const oy = comp === "full" ? H / 2 - ((by0 + by1) / 2) * s : 110 - by0 * s;

    const base = document.createElement("canvas");
    base.width = W;
    base.height = H;
    const g = base.getContext("2d");
    g.fillStyle = rgba(A.bg, 1);
    g.fillRect(0, 0, W, H);
    const t = document.createElement("canvas");
    t.width = W;
    t.height = H;
    const tg = t.getContext("2d");
    tg.drawImage(A.img, ox, oy, dw, dh);
    tg.globalCompositeOperation = "destination-in";
    tg.drawImage(A.mask, ox, oy, dw, dh);
    g.drawImage(t, 0, 0);

    const keep = document.createElement("canvas");
    keep.width = W;
    keep.height = H;
    keep.getContext("2d").drawImage(A.mask, ox, oy, dw, dh);

    const map = ([x, y]) => [x * s + ox, y * s + oy];
    const L = {
      base, keep, s,
      top: by0 * s + oy,
      height: (by1 - by0) * s,
      texts: A.bubbles.flatMap((b) => b.lines.map(([x0, y0, x1, y1]) => [...map([x0, y0]), ...map([x1, y1])])),
      bubbles: A.bubbles.map((b) => ({ colour: b.colour, box: [...map(b.region.slice(0, 2)), ...map(b.region.slice(2))] })),
      edge: A.edge.map(([x, y, a]) => [...map([x, y]), a]),
    };
    shotCache = { key, L };
    return L;
  }

  function renderShot(look) {
    const L = shotLayout(look.composition);
    ctx.drawImage(L.base, 0, 0);
    bgLumData = null;
    if (!state.painting) return;
    const comp = look.composition;
    const t = document.createElement("canvas");
    t.width = W;
    t.height = H;
    const tg = t.getContext("2d");
    if (comp === "cutout") {
      // The character steps in front of the chat, but never over the words.
      tg.drawImage(cutoutLayer(), 0, 0);
      for (const [x0, y0, x1, y1] of L.texts) tg.clearRect(x0 - 8, y0 - 6, x1 - x0 + 16, y1 - y0 + 12);
      ctx.drawImage(t, 0, 0);
    } else {
      tg.drawImage(state.painting, 0, 0);
      if (comp === "torn") {
        tg.globalCompositeOperation = "destination-in";
        tg.drawImage(buildMask(look, { top: L.top, height: L.height, space: "top", items: [] }), 0, 0);
      }
      tg.globalCompositeOperation = "destination-out";
      tg.drawImage(L.keep, 0, 0);
      ctx.drawImage(t, 0, 0);
      // Paint the bubbles' edges in their own colour where the painting meets
      // them, so they sit in the paint (never on bare ground).
      const paint = tg.getImageData(0, 0, W, H).data;
      const painted = (x, y) => {
        const xi = Math.round(x);
        const yi = Math.round(y);
        return xi >= 0 && yi >= 0 && xi < W && yi < H && paint[(yi * W + xi) * 4 + 3] > 128;
      };
      const rnd = mulberry32(state.strokeSeed ^ 0x3c6ef372);
      const every = Math.max(2, Math.round(9 - state.amount / 14));
      L.edge.forEach(([ex, ey, a], i) => {
        if (i % every || rnd() < 0.35) return;
        const nx = Math.cos(a - Math.PI / 2);
        const ny = Math.sin(a - Math.PI / 2); // points into the bubble
        if (!painted(ex - nx * 8, ey - ny * 8) && !painted(ex + nx * 8, ey + ny * 8)) return;
        const x = ex + nx * 3;
        const y = ey + ny * 3;
        const b = L.bubbles.find(({ box }) => x >= box[0] - 4 && x <= box[2] + 4 && y >= box[1] - 4 && y <= box[3] + 4);
        if (!b) return;
        paintMark(ctx, rnd() < 0.7 ? "flat" : "round", {
          x, y, angle: a + (rnd() - 0.5) * 0.2, len: 16 + rnd() * 22, width: 6 + rnd() * 6,
          color: shadeRgb(b.colour, (rnd() - 0.5) * 14), alpha: 0.95, ridge: 0.5,
          seed: Math.floor(rnd() * 2 ** 31),
        });
      });
    }
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
    if (state.shot) {
      renderShot(look);
      surface();
      return;
    }
    const lay = layout(look);
    const strokes = generateStrokes(lay, look);
    if (state.painting) ctx.drawImage(background(look, lay), 0, 0);
    else drawPlain();
    for (const s of strokes) if (!s.over) paintStroke(ctx, s);
    drawItems(lay);
    if (state.painting && look.occlude) drawOccluder(lay);
    for (const s of strokes) if (s.over) paintStroke(ctx, s);
    surface();
  }

  function surface() {
    if (state.painting) {
      // Canvas weave and grain over everything, bubbles included, so the whole
      // piece reads as one painted surface rather than a picture with stickers.
      ctx.save();
      ctx.globalCompositeOperation = "overlay";
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = ctx.createPattern(weave(), "repeat");
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 0.5;
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
      .filter((m) => m.kind !== "text" || m.text.trim())
      .map((m) => ({ side: m.side, text: m.text.trim(), kind: m.kind }));
    if (!messages.some((m) => m.kind !== "typing")) return setStatus("Write at least one message first.", true);

    setBusy(true);
    try {
      const { readConversation, ideaById, ideaPrompt } = await ideasModule;
      const reading = readConversation(messages);
      if (reading.blocked) throw new Error("We can't paint this one. Try a different conversation.");
      const idea = (state.ideaChoice !== "auto" && ideaById(state.ideaChoice)) || reading.idea;
      const placement = state.composition === "auto" ? idea.placement : state.composition;

      let image;
      if (DEMO) image = (await demoPainting(placement)).image;
      else if (PREVIEW) {
        image = `https://image.pollinations.ai/prompt/${encodeURIComponent(ideaPrompt(idea, placement, reading.detail))}` +
          `?width=1024&height=1024&model=flux&nologo=true&enhance=false&private=true&seed=${randSeed()}`;
      } else {
        let res;
        try {
          res = await fetch("/api/paint", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ messages, idea: idea.id, placement }),
          });
        } catch {
          throw new Error("Couldn't reach the painter. Check your connection and try again.");
        }
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.image) throw new Error(data.error || `Something went wrong (${res.status}). Try again.`);
        image = data.image;
      }
      await setPainting(image);
      state.reading = { idea, matched: reading.matched, detail: reading.detail };
      state.autoComposition = placement;
      state.strokeSeed = randSeed();
      render();
      const why = reading.matched.length && idea === reading.idea
        ? `Picked from: ${reading.matched.slice(0, 4).map((m) => `“${m}”`).join(", ")}`
        : idea === reading.idea ? "Nothing specific to read, so: waiting." : "Your choice.";
      setStatus(`“${idea.caption}”\n${idea.name}: ${idea.feeling}\n${why}`, false, true);
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
    const ground = borderColour(img);
    state.paintingId++;
    clearInterval(waitTimer);
    els.overlayText.textContent = "Laying on the paint…";
    await new Promise((r) => requestAnimationFrame(r));
    const painted = await paintify(c, false);
    const cutout = await paintify(keyedCutout(img, ground), true);
    state.raw = img;
    state.paintGround = ground;
    state.painting = painted;
    state.paintedCutout = cutout;
    state.paintData = painted.getContext("2d").getImageData(0, 0, W, H).data;
  }

  // Median colour around the painting's edge: the flat ground of a cut-out.
  function borderColour(img) {
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 64;
    const g = c.getContext("2d");
    g.drawImage(img, 0, 0, 64, 64);
    const d = g.getImageData(0, 0, 64, 64).data;
    const px = [];
    for (let i = 0; i < 64; i++) {
      for (const [x, y] of [[i, 0], [i, 1], [0, i], [63, i]]) {
        const k = (y * 64 + x) * 4;
        px.push([d[k], d[k + 1], d[k + 2]]);
      }
    }
    const mid = (ch) => px.map((p) => p[ch]).sort((a, b) => a - b)[px.length >> 1];
    return [mid(0), mid(1), mid(2)];
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous"; // keeps the canvas exportable for preview images
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("The painting didn't load. Try again."));
      img.src = src;
    });
  }

  let waitTimer = 0;
  function setBusy(busy, message) {
    state.busy = busy;
    els.paint.disabled = busy;
    els.again.disabled = busy || !state.painting;
    els.repaint.disabled = busy || !state.painting;
    els.paint.textContent = busy ? "Painting…" : state.painting ? "Paint it again" : "Paint it";
    els.overlay.classList.toggle("show", busy);
    clearInterval(waitTimer);
    if (busy) {
      let i = 0;
      els.overlayText.textContent = message || WAITING_LINES[0];
      if (!message) waitTimer = setInterval(() => {
        i = Math.min(i + 1, WAITING_LINES.length - 1);
        els.overlayText.textContent = WAITING_LINES[i];
      }, 2800);
      setStatus("");
    }
  }

  function setStatus(text, error = false, scene = false) {
    els.status.textContent = text;
    els.status.style.whiteSpace = "pre-line";
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

  // ── demo painting (?demo): no network, exercises the compositions ────────
  async function demoPainting(composition) {
    await new Promise((r) => setTimeout(r, 600));
    const size = 1024;
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    const g = c.getContext("2d");
    const rnd = mulberry32(randSeed());
    const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
    const treatment = composition === "cutout" ? "cutout" : "scene";
    const stroke = (x, y, angle, len, width, colors, dry = 0.1 + rnd() * 0.4) => drawStroke(g, {
      x, y, angle, len, width, color: pick(colors), color2: pick(colors), dry, seed: Math.floor(rnd() * 2 ** 31),
    });

    if (treatment === "cutout") {
      // One lumpy subject on flat black or white.
      const dark = rnd() < 0.6;
      g.fillStyle = dark ? "#080808" : "#f7f6f2";
      g.fillRect(0, 0, size, size);
      const colors = pick([[[90, 170, 230], [235, 240, 245], [40, 80, 160]], [[230, 70, 60], [250, 200, 80], [120, 30, 40]]]);
      for (let i = 0; i < 260; i++) {
        const t = rnd();
        const cx = size * 0.5 + (rnd() - 0.5) * size * (0.25 + 0.35 * t);
        const cy = size * (0.3 + 0.7 * t);
        stroke(cx, cy, rnd() * Math.PI, 40 + rnd() * 120, 18 + rnd() * 30, colors);
      }
    } else {
      const palettes = [
        { sky: [[128, 206, 222], [236, 150, 170], [250, 240, 230]], ground: [[222, 178, 48], [196, 140, 36], [240, 206, 90]], accent: [[196, 40, 60], [240, 236, 228], [110, 60, 50]] },
        { sky: [[40, 120, 210], [90, 180, 230], [240, 240, 250]], ground: [[40, 140, 70], [120, 180, 60], [30, 90, 60]], accent: [[240, 90, 140], [250, 210, 60], [230, 60, 40]] },
      ];
      const p = pick(palettes);
      const horizon = size * (0.35 + rnd() * 0.2);
      g.fillStyle = rgba(p.sky[0], 1);
      g.fillRect(0, 0, size, horizon);
      g.fillStyle = rgba(p.ground[0], 1);
      g.fillRect(0, horizon, size, size - horizon);
      const n = 520;
      for (let i = 0; i < n; i++) {
        const sky = i < n * 0.42;
        const y = sky ? rnd() * horizon : horizon + rnd() * (size - horizon);
        stroke(rnd() * size, y, sky ? (rnd() - 0.5) * 0.6 : -0.9 + (rnd() - 0.5) * 0.8, 60 + rnd() * 180, 14 + rnd() * 34, sky ? p.sky : p.ground);
      }
      const fx = size * (0.3 + rnd() * 0.4);
      const fy = horizon + (size - horizon) * 0.45;
      for (let i = 0; i < 60; i++) {
        stroke(fx + (rnd() - 0.5) * 220, fy + (rnd() - 0.5) * 160, rnd() * 6.28, 40 + rnd() * 90, 16 + rnd() * 26, p.accent, 0.2 + rnd() * 0.3);
      }
    }
    return {
      image: c.toDataURL("image/jpeg", 0.92),
      scene: {
        emotional_core: "Demo painting: random paint, not AI.", mood: "demo", treatment,
        negative_space: pick(["top", "centre", "bottom"]),
      },
    };
  }

  // ── optional scanned strokes ───────────────────────────────────────────────
  // strokes/manifest.json is either a list of files (used for any mark) or a
  // map from mark type to file(s), e.g. { "flat": ["flat-1.png"], "fan": "fan.png" }.
  async function loadStrokeImages() {
    try {
      const res = await fetch("strokes/manifest.json", { cache: "no-cache" });
      if (!res.ok) return;
      const manifest = await res.json();
      const entries = Array.isArray(manifest)
        ? manifest.map((f) => ["flat", f])
        : Object.entries(manifest).flatMap(([type, files]) => [].concat(files).map((f) => [type, f]));
      for (const [type, file] of entries.slice(0, 60)) {
        if (!STROKE_TYPES.includes(type)) continue;
        const img = await loadImage(`strokes/${file}`).catch(() => null);
        if (img) (strokeStamps[type] ||= []).push(img);
      }
    } catch {
      // No manifest: the eleven drawn marks only.
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
  els.idea.addEventListener("change", () => { state.ideaChoice = els.idea.value; });
  els.time.addEventListener("input", () => { state.startTime = els.time.value; scheduleRender(); });
  els.meta.addEventListener("change", () => { state.showMeta = els.meta.checked; scheduleRender(); });
  els.amount.addEventListener("input", () => { state.amount = Number(els.amount.value); scheduleRender(); });
  els.shot.addEventListener("change", () => { if (els.shot.files[0]) readScreenshot(els.shot.files[0]); });
  els.clearShot.addEventListener("click", () => {
    state.shot = null;
    els.clearShot.hidden = true;
    render();
    setStatus("Screenshot removed. Type the chat, or upload another.");
  });
  els.paint.addEventListener("click", paintIt);
  els.again.addEventListener("click", paintIt);
  els.repaint.addEventListener("click", () => { state.strokeSeed = randSeed(); render(); });
  els.download.addEventListener("click", download);

  // The idea book (public/ideas.js): fills the Idea picker.
  ideasModule.then(({ IDEAS }) => {
    for (const idea of IDEAS) {
      const o = document.createElement("option");
      o.value = idea.id;
      o.textContent = `${idea.name} (${idea.feeling})`;
      els.idea.append(o);
    }
  }).catch(() => {});

  renderExamples();
  renderList();
  render();
  if (DEMO) setStatus("Demo mode: random local paint, not AI, so it won't match your words.");
  if (PREVIEW) setStatus("Preview mode: real paintings from Pollinations' free image model, painted from your browser.");
  loadStrokeImages();
  // Canvas text needs the web fonts (Malayalam especially) before it looks right.
  Promise.all([
    document.fonts.load(`${FONT_SIZE}px "Noto Sans"`),
    document.fonts.load(`${FONT_SIZE}px "Noto Sans Malayalam"`, "മ"),
  ]).catch(() => {}).then(() => document.fonts.ready).then(render);
})();
