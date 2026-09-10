// Character-tile cursor trail, hoisted to a single viewport-fixed canvas so
// it works over every section rather than only the one that owned it.
// Any text can join in by rendering its characters as `.trail-ch` spans —
// those flip to dark while a tile passes under them so they stay readable.

const GLYPHS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+{}[]|:;<>,.?/~";

const CELL = 18;
const RADIUS = 54;
const DENSITY = 20;
const HOLD = 12;

export function createTrailLayer(canvas, { coarse = false } = {}) {
  const ctx = canvas.getContext("2d");
  // A finger is a blunter instrument than a cursor, and a phone GPU has
  // less headroom — a slightly bigger, sparser radius reads just as well
  // for less fill-rate.
  const radius = coarse ? RADIUS * 1.15 : RADIUS;
  const density = coarse ? DENSITY * 0.75 : DENSITY;

  let W = 0;
  let H = 0;
  let dpr = 1;
  let cols = 0;
  let rows = 0;

  const live = new Map();

  let trailX = -9999;
  let trailY = -9999;
  let seeded = false;

  let boxes = [];
  let boxesDirty = true;
  let lastMeasureAt = -Infinity;

  function resize(vw, vh, nextDpr) {
    dpr = Math.min(nextDpr, 2);
    W = vw;
    H = vh;
    canvas.width = Math.round(vw * dpr);
    canvas.height = Math.round(vh * dpr);
    canvas.style.width = `${vw}px`;
    canvas.style.height = `${vh}px`;
    cols = Math.ceil(vw / CELL);
    rows = Math.ceil(vh / CELL);
    live.clear();
    boxesDirty = true;
  }

  function markDirty() {
    boxesDirty = true;
  }

  // querySelectorAll + getBoundingClientRect over every .trail-ch is a
  // real layout read — cheap once, but running it on every animation
  // frame during a scroll (as "scrollY changed since last frame" would)
  // was enough to drop frames on a phone. Dropped frames meant trailX/Y
  // jumped in bigger steps than the tile radius could bridge, which is
  // what showed up as "only part of the swipe leaves a trail". Now it's
  // just time-throttled instead of tied to the scroll position.
  function measure(now) {
    const els = document.querySelectorAll(".trail-ch");
    const next = [];
    for (let i = 0; i < els.length; i++) {
      const el = els[i];
      const r = el.getBoundingClientRect();
      if (r.bottom < -80 || r.top > H + 80) {
        if (el.classList.contains("is-trail")) el.classList.remove("is-trail");
        continue;
      }
      const lh = parseFloat(getComputedStyle(el).lineHeight) || r.height;
      const midY = r.top + r.height / 2;
      next.push({
        el,
        left: r.left,
        right: r.right,
        top: midY - lh / 2,
        bottom: midY + lh / 2,
      });
    }
    boxes = next;
    boxesDirty = false;
    lastMeasureAt = now;
  }

  // Spawns lit tiles within `radius` of one point. Called once per sampled
  // point along the swept path each frame (see draw()) rather than once
  // for the frame's endpoint only, so a fast swipe doesn't leave gaps.
  function spawnNear(x, y) {
    const c0 = Math.max(0, Math.floor((x - radius) / CELL));
    const c1 = Math.min(cols, Math.ceil((x + radius) / CELL));
    const r0 = Math.max(0, Math.floor((y - radius) / CELL));
    const r1 = Math.min(rows, Math.ceil((y + radius) / CELL));

    for (let cy = r0; cy < r1; cy++) {
      for (let cx = c0; cx < c1; cx++) {
        const key = cy * cols + cx;
        if (live.has(key)) continue;
        const cellX = cx * CELL + CELL / 2;
        const cellY = cy * CELL + CELL / 2;
        const dist = Math.hypot(cellX - x, cellY - y);
        if (dist > radius) continue;
        const falloff = Math.pow(1 - dist / radius, 1.5);
        if (Math.random() < falloff * (density / 8)) {
          live.set(key, {
            x: cellX,
            y: cellY,
            glyph: GLYPHS[(Math.random() * GLYPHS.length) | 0],
            elapsed: 0,
            delay: (0.03 + Math.random() * 0.05) * (HOLD / 10),
            duration: (0.1 + Math.random() * 0.16) * (HOLD / 10),
            ghost: Math.random() < 0.05,
          });
        }
      }
    }
  }

  function draw(m, dt, now) {
    if (!W || !H) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const px = m.pointerPx;
    const py = m.pointerPy;

    if (m.pointerInside) {
      if (!seeded) {
        trailX = px;
        trailY = py;
        seeded = true;
      }
      const prevX = trailX;
      const prevY = trailY;
      const ease = 1 - Math.exp(-dt / 0.045);
      const dx = px - trailX;
      const dy = py - trailY;
      const moving = Math.hypot(dx, dy) > 0.6;
      trailX += dx * ease;
      trailY += dy * ease;

      if (moving) {
        // Walk the segment from last frame's point to this one — a quick
        // swipe (or a scroll-drag, which is the same gesture) can easily
        // cover more than one tile radius between two animation frames.
        const segLen = Math.hypot(trailX - prevX, trailY - prevY);
        const steps = Math.min(24, Math.max(1, Math.ceil(segLen / (CELL * 0.6))));
        for (let s = 1; s <= steps; s++) {
          const t = s / steps;
          spawnNear(prevX + (trailX - prevX) * t, prevY + (trailY - prevY) * t);
        }
      }
    } else {
      seeded = false;
    }

    ctx.font = "600 12px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (const [key, cell] of live) {
      cell.elapsed += dt;
      if (cell.elapsed >= cell.delay + cell.duration) {
        live.delete(key);
        continue;
      }
      if (cell.elapsed < cell.delay || cell.ghost) continue;
      if (Math.random() < 1 - Math.exp(-7.2 * dt)) {
        cell.glyph = GLYPHS[(Math.random() * GLYPHS.length) | 0];
      }
      ctx.fillStyle = "#F2F0EB";
      ctx.fillRect(cell.x - CELL / 2, cell.y - CELL / 2, CELL, CELL);
      ctx.fillStyle = "#0a0a0a";
      ctx.fillText(cell.glyph, cell.x, cell.y + 1);
    }

    if (boxesDirty || now - lastMeasureAt > 150) measure(now);

    const active = m.pointerInside;
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      const nx = Math.min(Math.max(trailX, b.left), b.right);
      const ny = Math.min(Math.max(trailY, b.top), b.bottom);
      const hit = active && Math.hypot(trailX - nx, trailY - ny) <= radius;
      if (b.el.classList.contains("is-trail") !== hit) {
        b.el.classList.toggle("is-trail", hit);
      }
    }
  }

  function dispose() {
    live.clear();
    for (let i = 0; i < boxes.length; i++) boxes[i].el.classList.remove("is-trail");
    boxes = [];
  }

  return { resize, draw, dispose, markDirty };
}
