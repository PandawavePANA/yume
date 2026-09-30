// 커서 잔상 — 지나간 자리에 파랑 → 보라 빛줄기가 남았다가 사라진다.
//
// 예전에는 글자 타일(흰 칸에 기호)이 커서를 따라 깔렸다. 기술적인 맛은 있었지만 화면이
// 번쩍거려 글을 읽는 데 방해가 됐다. 이제는 사이트의 유일한 색인 빛줄기 하나만 남긴다:
//
//   · 커서가 지나간 길을 점으로 기록하고, 점마다 나이를 먹인다(LIFE초 뒤 사라짐)
//   · 머리는 굵고 밝은 파랑, 꼬리로 갈수록 가늘어지며 보라로 식는다
//   · 같은 길을 넓고 옅게 한 번 더 그려 번지는 빛(glow)을 만든다('lighter' 합성)
//   · 빨리 휘두르면 머리에서 작은 불티가 튄다
//   · 빛이 지나간 글자(.trail-ch)는 그 자리의 색으로 물들었다가 천천히 원래 색으로 돌아온다
//
// 한 캔버스, 한 rAF(SiteBackdrop와 공유). 움직임이 없으면 그릴 것도 없다.

const LIFE = 0.62; // 초
const SPACING = 5; // 점 사이 최대 간격(px) — 빠른 휘두름에도 끊기지 않게 보간한다
const MAX_POINTS = 220;
const MAX_SPARKS = 70;
const TEXT_RADIUS = 46;

// 파랑(#7fb0ff에 가까운 밝은 머리) → 가운데(#6d5ae0) → 보라(#8b5cf6)
const STOPS = [
  [150, 190, 255],
  [59, 130, 246],
  [109, 90, 224],
  [139, 92, 246],
];
function spectrum(t) {
  // t: 0(머리) → 1(꼬리)
  const x = Math.min(0.999, Math.max(0, t)) * (STOPS.length - 1);
  const i = Math.floor(x);
  const k = x - i;
  const a = STOPS[i];
  const b = STOPS[i + 1];
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}
const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a.toFixed(3)})`;

export function createTrailLayer(canvas, { coarse = false, reduced = false } = {}) {
  const ctx = canvas.getContext("2d");
  // 손가락은 커서보다 뭉툭하다 — 조금 굵고 짧게.
  const width = coarse ? 26 : 20;
  const life = coarse ? LIFE * 0.85 : LIFE;

  let W = 0;
  let H = 0;
  let dpr = 1;
  let pts = [];
  let sparks = [];
  let headX = -9999;
  let headY = -9999;
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
    pts = [];
    sparks = [];
    boxesDirty = true;
  }

  function markDirty() {
    boxesDirty = true;
  }

  // .trail-ch의 위치를 잰다. 레이아웃을 읽는 일이라 매 프레임이 아니라 150ms마다만.
  // 재는 김에 글자마다 화면 가로 위치에 맞는 색(--tc)을 적어 둔다 — 왼쪽은 파랑, 오른쪽은 보라.
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
      const hx = Math.round((Math.min(1, Math.max(0, (r.left + r.width / 2) / Math.max(W, 1)))) * 12);
      if (el.__hx !== hx) {
        el.__hx = hx;
        const c = spectrum(0.15 + (hx / 12) * 0.85);
        el.style.setProperty("--tc", `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`);
      }
      next.push({ el, left: r.left, right: r.right, top: r.top, bottom: r.bottom });
    }
    boxes = next;
    boxesDirty = false;
    lastMeasureAt = now;
  }

  function draw(m, dt, now) {
    if (!W || !H) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (reduced) return;

    // 머리는 커서를 살짝 늦게 따라간다 — 그 늦음이 빛줄기에 무게를 준다.
    if (m.pointerInside) {
      if (!seeded) {
        headX = m.pointerPx;
        headY = m.pointerPy;
        seeded = true;
      }
      const ease = 1 - Math.exp(-dt / 0.03);
      const nx = headX + (m.pointerPx - headX) * ease;
      const ny = headY + (m.pointerPy - headY) * ease;
      const seg = Math.hypot(nx - headX, ny - headY);
      if (seg > 0.4) {
        const steps = Math.min(40, Math.max(1, Math.ceil(seg / SPACING)));
        for (let s = 1; s <= steps; s++) {
          const t = s / steps;
          // 한 프레임 안에서 보간한 점들도 나이를 조금씩 달리 줘서 꼬리가 계단지지 않게 한다.
          pts.push({ x: headX + (nx - headX) * t, y: headY + (ny - headY) * t, age: (1 - t) * dt });
        }
        // 빠를수록 불티가 더 튄다.
        const speed = seg / Math.max(dt, 0.001);
        if (speed > 900 && sparks.length < MAX_SPARKS) {
          const n = Math.min(3, Math.floor(speed / 900));
          for (let i = 0; i < n; i++) {
            const a = Math.random() * Math.PI * 2;
            const v = 40 + Math.random() * 120;
            sparks.push({ x: nx, y: ny, vx: Math.cos(a) * v, vy: Math.sin(a) * v, age: 0, life: 0.35 + Math.random() * 0.35 });
          }
        }
      }
      headX = nx;
      headY = ny;
    } else {
      seeded = false;
    }

    for (const p of pts) p.age += dt;
    let cut = 0;
    while (cut < pts.length && pts[cut].age > life) cut++;
    if (cut) pts.splice(0, cut);
    if (pts.length > MAX_POINTS) pts.splice(0, pts.length - MAX_POINTS);

    // 이음매에서 둥근 끝이 두 번 겹치지 않게 끝은 자르고, 꺾이는 곳만 둥글게 잇는다.
    ctx.lineCap = "butt";
    ctx.lineJoin = "round";
    if (pts.length > 1) {
      // 길을 18토막으로 나눠 토막마다 한 번에 긋는다. 점마다 따로 그으면 겹치는 이음매마다
      // 빛이 두 번 더해져 구슬을 꿴 것처럼 보인다. 토막 안에서는 한 획이라 겹침이 없다.
      // 두 번 그린다 — 넓고 옅은 번짐, 그 위에 가늘고 선명한 심.
      const chunk = Math.max(2, Math.ceil(pts.length / 18));
      for (let pass = 0; pass < 2; pass++) {
        for (let s = 0; s < pts.length - 1; s += chunk) {
          const e = Math.min(pts.length - 1, s + chunk);
          const t = pts[(s + e) >> 1].age / life; // 0 머리 → 1 꼬리
          const k = 1 - t;
          const c = spectrum(t);
          if (pass === 0) {
            ctx.lineWidth = width * 2.2 * Math.pow(k, 0.9) + 2;
            ctx.strokeStyle = rgba(c, 0.06 * k);
          } else {
            ctx.lineWidth = width * 0.62 * Math.pow(k, 1.3) + 0.5;
            ctx.strokeStyle = rgba(c, 0.34 * Math.pow(k, 1.5));
          }
          ctx.beginPath();
          ctx.moveTo(pts[s].x, pts[s].y);
          for (let i = s + 1; i <= e; i++) ctx.lineTo(pts[i].x, pts[i].y);
          ctx.stroke();
        }
      }
    }
    ctx.globalCompositeOperation = "lighter";

    // 불티 — 작은 점이 튀어 나가며 느려지고 꺼진다.
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.age += dt;
      if (s.age > s.life) { sparks.splice(i, 1); continue; }
      s.vx *= Math.exp(-4 * dt);
      s.vy *= Math.exp(-4 * dt);
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      const t = s.age / s.life;
      ctx.fillStyle = rgba(spectrum(0.2 + t * 0.8), 0.9 * (1 - t));
      const r = 1.6 * (1 - t) + 0.4;
      ctx.fillRect(s.x - r, s.y - r, r * 2, r * 2);
    }
    ctx.globalCompositeOperation = "source-over";

    // 빛이 지나가는 글자에 불을 켠다. 꺼지는 쪽은 CSS가 천천히 식힌다(잔상).
    if (boxesDirty || now - lastMeasureAt > 150) measure(now);
    const active = m.pointerInside;
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      const nx = Math.min(Math.max(headX, b.left), b.right);
      const ny = Math.min(Math.max(headY, b.top), b.bottom);
      const hit = active && Math.hypot(headX - nx, headY - ny) <= TEXT_RADIUS;
      if (b.el.classList.contains("is-trail") !== hit) b.el.classList.toggle("is-trail", hit);
    }
  }

  function dispose() {
    pts = [];
    sparks = [];
    for (let i = 0; i < boxes.length; i++) boxes[i].el.classList.remove("is-trail");
    boxes = [];
  }

  return { resize, draw, dispose, markDirty };
}
