// 계기(計器) 층 — 원반 위에 겹쳐 그리는 측정 표시.
//
// 원반과 같은 면(같은 기울기·같은 원근)에 눈금 고리를 얹어, 원반이 궤도 계기판 위에
// 놓인 것처럼 읽히게 한다. 반짝이지 않는다: 머리카락 굵기의 선, 낮은 밝기, 느린 회전.
// 히어로에서만 보이고 한 화면쯤 내려가면 완전히 사라진다.
//
// 원반의 중심·반지름·자세는 disc.draw()가 돌려주는 값을 그대로 받는다 — 따로 계산하면
// 포인터·스크롤에 따라 둘이 어긋난다. 매 프레임 지우고 새로 그리므로 잔상이 없다.

const PERSPECTIVE = 1300;
const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

// 사이트 스펙트럼의 밝은 쪽. 선은 거의 흰 파랑, 강조만 보라.
const LINE = "178,190,255";
const ACCENT = "183,156,255";
const MONO = '"JetBrains Mono", ui-monospace, SFMono-Regular, monospace';

export function createHudLayer(canvas, { reduced = false } = {}) {
  const ctx = canvas.getContext("2d", { alpha: true });

  let W = 0;
  let H = 0;
  let dpr = 1;
  let shown = 0; // 스크롤로 정해지는 보임 정도(부드럽게 따라감)
  let cleared = true;
  let rot = 0; // 눈금 고리의 느린 회전
  let sweep = -0.6; // 훑는 선의 각도
  let readoutAt = -1;
  let readout = ["", ""];

  // 히어로를 지나면 캔버스를 1×1로 줄여 메모리를 돌려준다(휴대폰 기준 화면 한 장 분량).
  // 다시 올라오면 그때 새로 잡는다.
  let held = false;
  function hold() {
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    held = true;
  }
  function release() {
    canvas.width = 1;
    canvas.height = 1;
    held = false;
  }

  function resize(vw, vh, nextDpr) {
    dpr = nextDpr;
    W = vw;
    H = vh;
    canvas.style.width = `${vw}px`;
    canvas.style.height = `${vh}px`;
    if (held) hold();
    cleared = false;
  }

  function draw(m, dt, g) {
    if (!W || !H || !g) return;

    // 한 화면의 70%를 내려가면 다 사라진다.
    const target = 1 - clamp01(m.scrollY / (H * 0.7));
    shown += (target - shown) * (reduced ? 1 : 1 - Math.exp(-7 * dt));

    if (shown < 0.004) {
      if (!cleared) {
        release();
        cleared = true;
      }
      return;
    }
    if (!held) hold();
    cleared = false;
    ctx.clearRect(0, 0, W, H);

    const narrow = W < 900;
    // 처음 1.8초 동안 고리가 한 바퀴 그려지며 자리를 잡는다(0.35초 뒤 시작).
    const intro = reduced ? 1 : easeOut(clamp01((m.time - 0.35) / 1.8));
    const A = shown * (narrow ? 0.55 : 1);

    if (!reduced) {
      rot += dt * 0.9 * DEG; // 초당 0.9° — 거의 멈춘 것처럼 무겁게
      sweep += dt * 0.48; // 한 바퀴 13초
    }

    const { cx, cy, outerR, voidR, cosT, sinT, cosS, sinS } = g;

    // 원반 면 위의 한 점(반지름 r, 각 a)을 화면으로. 깊이(z1)도 돌려준다.
    const P = { x: 0, y: 0, z: 0, s: 1 };
    const proj = (r, a) => {
      const x = r * Math.cos(a);
      const z = r * Math.sin(a);
      const y1 = z * sinT;
      const z1 = z * cosT;
      const s = PERSPECTIVE / (PERSPECTIVE + z1);
      P.x = cx + (x * cosS - y1 * sinS) * s;
      P.y = cy + (x * sinS + y1 * cosS) * s;
      P.z = z1;
      P.s = s;
      return P;
    };
    // 가까운 쪽(z1 < 0)이 더 밝다. 0.35 ~ 1.
    const near = (z, r) => 0.35 + 0.65 * clamp01(0.5 - z / (2 * r));

    const R1 = outerR * 1.1; // 눈금 고리
    const R2 = outerR * 1.24; // 바깥 가는 고리
    const R0 = voidR * 1.42; // 안쪽 점선 고리
    const span = TAU * intro;

    ctx.lineCap = "butt";

    // ── 고리 셋 ─────────────────────────────────────────────────────────
    const ring = (r, alpha, dash) => {
      ctx.setLineDash(dash || []);
      ctx.beginPath();
      const steps = 160;
      for (let i = 0; i <= steps; i++) {
        const a = rot + (i / steps) * span;
        proj(r, a);
        if (i === 0) ctx.moveTo(P.x, P.y);
        else ctx.lineTo(P.x, P.y);
      }
      ctx.strokeStyle = `rgba(${LINE},${alpha * A})`;
      ctx.stroke();
      ctx.setLineDash([]);
    };
    ctx.lineWidth = 1;
    ring(R1, 0.38);
    ctx.lineWidth = 0.75;
    ring(R2, 0.12, [2, 7]);
    ring(R0, 0.22, [1, 4]);

    // ── 눈금: 2°마다 짧게, 10°마다 길게, 30°마다 숫자 ────────────────────
    ctx.lineWidth = 1;
    for (let d = 0; d < 360; d += 2) {
      const a = rot + d * DEG;
      if (a - rot > span) break;
      const major = d % 10 === 0;
      const len = outerR * (d % 30 === 0 ? 0.05 : major ? 0.032 : 0.016);
      proj(R1, a);
      const x0 = P.x;
      const y0 = P.y;
      const k = near(P.z, R1);
      proj(R1 - len, a);
      ctx.strokeStyle = `rgba(${LINE},${(major ? 0.62 : 0.3) * k * A})`;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(P.x, P.y);
      ctx.stroke();
    }

    if (!narrow || W > 560) {
      ctx.font = `500 ${narrow ? 9 : 10}px ${MONO}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (let d = 0; d < 360; d += 30) {
        const a = rot + d * DEG;
        if (a - rot > span) break;
        proj(R1 + outerR * 0.07, a);
        const k = near(P.z, R1);
        // 멀리 있는(납작하게 겹치는) 쪽 숫자는 거의 지운다 — 겹쳐 읽히지 않게.
        const alpha = 0.62 * Math.pow(k, 2.2) * A;
        if (alpha < 0.03) continue;
        ctx.fillStyle = `rgba(${LINE},${alpha})`;
        ctx.fillText(String(d).padStart(3, "0"), P.x, P.y);
      }
    }

    // ── 훑는 선: 고리 면을 따라 천천히 도는 레이더 빛 ───────────────────
    if (intro > 0.98) {
      const TAIL = 34;
      ctx.lineWidth = 1;
      for (let i = TAIL; i >= 0; i--) {
        const a = sweep - i * 1.1 * DEG;
        const t = 1 - i / TAIL;
        proj(voidR * 1.08, a);
        const x0 = P.x;
        const y0 = P.y;
        proj(R1, a);
        const alpha = (i === 0 ? 0.6 : 0.18 * t * t) * A;
        ctx.strokeStyle = i === 0 ? `rgba(${ACCENT},${alpha})` : `rgba(${LINE},${alpha})`;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(P.x, P.y);
        ctx.stroke();
      }
      // 훑는 선 끝이 고리에 닿는 자리에 작은 표적.
      proj(R1, sweep);
      ctx.strokeStyle = `rgba(${ACCENT},${0.55 * A})`;
      ctx.strokeRect(P.x - 3.5, P.y - 3.5, 7, 7);
    }

    // ── 중심 조준선: 원반의 빈 가운데에 화면 기준으로 ─────────────────────
    {
      const gap = Math.max(6, voidR * 0.28);
      const len = Math.max(8, voidR * 0.34) * intro;
      ctx.lineWidth = 1;
      ctx.strokeStyle = `rgba(${LINE},${0.42 * A})`;
      ctx.beginPath();
      ctx.moveTo(cx - gap - len, cy);
      ctx.lineTo(cx - gap, cy);
      ctx.moveTo(cx + gap, cy);
      ctx.lineTo(cx + gap + len, cy);
      ctx.moveTo(cx, cy - gap - len);
      ctx.lineTo(cx, cy - gap);
      ctx.moveTo(cx, cy + gap);
      ctx.lineTo(cx, cy + gap + len);
      ctx.stroke();
      // 네 모서리 꺾쇠 — 조준선과 반대로 아주 느리게 돈다.
      const b = gap + len * 0.55;
      const arm = Math.max(5, voidR * 0.16);
      const q = -rot * 3;
      const c = Math.cos(q);
      const s = Math.sin(q);
      const pt = (x, y) => [cx + x * c - y * s, cy + x * s + y * c];
      ctx.strokeStyle = `rgba(${ACCENT},${0.34 * A})`;
      ctx.beginPath();
      for (const [sx, sy] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) {
        const [ax, ay] = pt(sx * b, sy * (b - arm));
        const [mx, my] = pt(sx * b, sy * b);
        const [bx, by] = pt(sx * (b - arm), sy * b);
        ctx.moveTo(ax, ay);
        ctx.lineTo(mx, my);
        ctx.lineTo(bx, by);
      }
      ctx.stroke();
      ctx.fillStyle = `rgba(${LINE},${0.6 * A})`;
      ctx.fillRect(cx - 1, cy - 1, 2, 2);
    }

    // ── 설명선: 고리 꼭대기에서 오른쪽 위로 빼낸 측정값 ─────────────────
    if (!narrow && intro > 0.6) {
      const fade = clamp01((intro - 0.6) / 0.4);
      // 화면에서 가장 위에 오는 고리 위 점을 찾는다(면이 기울어 있어 각이 매번 다르다).
      let best = Infinity;
      let ax = 0;
      let ay = 0;
      for (let d = 0; d < 360; d += 4) {
        proj(R1, d * DEG);
        if (P.y < best) {
          best = P.y;
          ax = P.x;
          ay = P.y;
        }
      }
      const up = 34;
      const run = 150;
      let dir = 1;
      if (ax + up + run + 20 > W) dir = -1;
      const ex = ax + dir * up;
      const ey = ay - up;
      const fx = ex + dir * run;

      ctx.lineWidth = 1;
      ctx.strokeStyle = `rgba(${LINE},${0.4 * A * fade})`;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(ex, ey);
      ctx.lineTo(fx, ey);
      ctx.stroke();
      ctx.fillStyle = `rgba(${ACCENT},${0.7 * A * fade})`;
      ctx.fillRect(ax - 2, ay - 2, 4, 4);

      // 숫자는 0.25초마다만 바꾼다 — 매 프레임 바뀌면 깜빡임처럼 보인다.
      if (m.time - readoutAt > 0.25 || readoutAt < 0) {
        readoutAt = m.time;
        const theta = (((Math.atan2(sinS, cosS) / DEG) % 360) + 360) % 360;
        readout = [
          "ORBIT · REAMER BUILD",
          `R ${outerR.toFixed(1)}  θ ${theta.toFixed(1)}°  φ ${(((rot / DEG) % 360)).toFixed(1)}°`,
        ];
      }
      ctx.textAlign = dir > 0 ? "left" : "right";
      ctx.textBaseline = "alphabetic";
      const tx = ex + dir * 2;
      ctx.font = `600 10px ${MONO}`;
      ctx.fillStyle = `rgba(${LINE},${0.72 * A * fade})`;
      ctx.fillText(readout[0], tx, ey - 7);
      ctx.font = `500 10px ${MONO}`;
      ctx.fillStyle = `rgba(${LINE},${0.45 * A * fade})`;
      ctx.fillText(readout[1], tx, ey + 14);
    }
  }

  function dispose() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  return { resize, draw, dispose };
}
