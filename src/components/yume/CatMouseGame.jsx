import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

// 검증을 기다리는 동안 하는 미니게임. 점프 한 번으로 생쥐를 덮치고 물웅덩이를
// 피한다 — 크롬 공룡 게임과 같은 조작(스페이스/탭 하나)이지만, 점프가 "피하기"와
// "잡기" 두 가지 의미를 동시에 가져서 아무 때나 뛰면 안 되는 게 규칙의 전부다.

const BEST_KEY = "yume.catgame.best";
const VIEW_H = 156;
const GROUND_PAD = 30;
const GRAVITY = 1500;
const JUMP_V = 430;
const BASE_SPEED = 215;
const MAX_SPEED = 430;
const CAT_X = 64;

const C = {
  ink: "#4A3F63",
  fur: "#FFFCFA",
  furShade: "#F1E9FC",
  stripe: "#D9C9F5",
  pink: "#F7B9CE",
  pinkDeep: "#F2809F",
  eye: "#3A3350",
  mouse: "#CFC8DE",
  water: "#CBE2F7",
  waterDeep: "#8FBBE8",
  ground: "#D4C4EF",
  cloud: "#FFFFFF",
  hill: "#F0E7FD",
  text: "#6B4FA8",
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const rand = (lo, hi) => lo + Math.random() * (hi - lo);

function readBest() {
  try {
    return parseInt(window.localStorage.getItem(BEST_KEY), 10) || 0;
  } catch {
    return 0;
  }
}

function writeBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    /* 시크릿 모드 등에서 막혀도 게임 자체는 그대로 돌아가야 한다 */
  }
}

// 굵은 어두운 선 위에 얇은 밝은 선을 겹쳐 그려 "테두리 있는 몸통"을 만든다.
function outlined(ctx, path, fill, outer = 8, inner = 5) {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = outer;
  path();
  ctx.stroke();
  ctx.strokeStyle = fill;
  ctx.lineWidth = inner;
  path();
  ctx.stroke();
}

function limb(ctx, x1, y1, x2, y2, w = 7) {
  outlined(
    ctx,
    () => {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
    },
    C.fur,
    w,
    w - 3,
  );
}

function ellipse(ctx, x, y, rx, ry, fill, stroke = true, rot = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

function triangle(ctx, a, b, c, fill, stroke = true) {
  ctx.beginPath();
  ctx.moveTo(a[0], a[1]);
  ctx.lineTo(b[0], b[1]);
  ctx.lineTo(c[0], c[1]);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.stroke();
  }
}

function heart(ctx, x, y, s, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = C.pinkDeep;
  ctx.beginPath();
  ctx.arc(x - s * 0.45, y - s * 0.3, s * 0.5, Math.PI, Math.PI * 2);
  ctx.arc(x + s * 0.45, y - s * 0.3, s * 0.5, Math.PI, Math.PI * 2);
  ctx.lineTo(x, y + s * 0.85);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function sparkle(ctx, x, y, s, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "#EBD9FF";
  ctx.beginPath();
  ctx.moveTo(x, y - s);
  ctx.quadraticCurveTo(x, y, x + s, y);
  ctx.quadraticCurveTo(x, y, x, y + s);
  ctx.quadraticCurveTo(x, y, x - s, y);
  ctx.quadraticCurveTo(x, y, x, y - s);
  ctx.fill();
  ctx.restore();
}

function drawCat(ctx, g) {
  const { cat, t, phase } = g;
  const air = cat.y > 3;
  const running = phase === "playing";
  const cycle = t * 13;
  const bob = running && !air ? Math.abs(Math.sin(cycle)) * 2 : 0;
  const idleBreath = !running && !air ? Math.sin(t * 2.2) * 0.8 : 0;
  const drowned = phase === "over";
  const stretch = air ? clamp(1 + cat.vy / 2600, 0.93, 1.07) : cat.squash;

  // 발밑 그림자는 몸과 같이 늘어나면 안 되니까 스케일 밖에서 먼저 그린다.
  const lift = clamp(cat.y / 70, 0, 1);
  ctx.save();
  ctx.globalAlpha = 0.16 * (1 - lift * 0.6);
  ellipse(ctx, CAT_X, g.groundY + 2, 20 - lift * 7, 4 - lift * 1.4, C.ink, false);
  ctx.restore();

  ctx.save();
  ctx.translate(CAT_X, g.groundY - cat.y - bob + idleBreath);
  ctx.scale(1 / stretch, stretch);

  const happy = drowned ? false : air || cat.pounce > 0 || cat.blink > 0;

  // 꼬리 — 뛸 때는 위로 서고, 앉아 있을 때는 좌우로 살랑거린다.
  const wag = Math.sin(t * (running ? 9 : 3.4));
  outlined(
    ctx,
    () => {
      ctx.beginPath();
      ctx.moveTo(-14, -20);
      if (drowned) ctx.quadraticCurveTo(-30, -16, -34, -6);
      else if (air) ctx.quadraticCurveTo(-30, -34, -17, -48);
      else ctx.quadraticCurveTo(-30 + wag * 3, -26, -20 + wag * 9, -42 - wag * 3);
    },
    C.fur,
    8,
    5,
  );

  // 뒷다리 → 몸통 → 앞다리 순서로 그려야 다리가 몸통 뒤/앞에 자연스럽게 걸린다.
  const swing = running && !air ? Math.sin(cycle) * 5 : 0;
  if (air) {
    limb(ctx, -8, -15, -15, -9);
    limb(ctx, -4, -14, -11, -6);
  } else {
    limb(ctx, -9, -14, -9 - swing, -1);
    limb(ctx, -4, -14, -4 + swing, -1);
  }

  ellipse(ctx, 0, -22, 17, 13, C.fur, true, -0.06);
  ctx.save();
  ctx.globalAlpha = 0.75;
  ellipse(ctx, 2, -17, 11, 7, C.furShade, false, -0.06);
  ctx.restore();
  ctx.strokeStyle = C.stripe;
  ctx.lineWidth = 2.6;
  ctx.lineCap = "round";
  for (let i = 0; i < 3; i += 1) {
    ctx.beginPath();
    ctx.arc(-6 + i * 7, -29, 4.5, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
  }

  if (air) {
    limb(ctx, 9, -14, 18, -11);
    limb(ctx, 13, -13, 21, -8);
  } else {
    limb(ctx, 9, -13, 9 + swing, -1);
    limb(ctx, 13, -13, 13 - swing, -1);
  }

  // 귀 — 뛰는 중엔 뒤로 젖혀지고, 평소엔 발걸음에 맞춰 까딱거린다.
  const earTilt = air ? -0.3 : Math.sin(cycle) * 0.07;
  ctx.save();
  ctx.translate(13, -38);
  ctx.rotate(earTilt);
  triangle(ctx, [-12, -8], [-13, -22], [-3, -13.8], C.fur);
  triangle(ctx, [5, -13.5], [14, -21], [13.5, -5], C.fur);
  ctx.restore();

  ellipse(ctx, 13, -38, 14.5, 13.5, C.fur);

  ctx.save();
  ctx.translate(13, -38);
  ctx.rotate(earTilt);
  triangle(ctx, [-9.75, -9.45], [-10.9, -17.8], [-5.25, -12.35], C.pink, false);
  triangle(ctx, [7.1, -11.4], [12.2, -16.5], [11.4, -7.1], C.pink, false);
  ctx.restore();

  ctx.strokeStyle = C.stripe;
  ctx.lineWidth = 2.4;
  for (let i = 0; i < 2; i += 1) {
    ctx.beginPath();
    ctx.arc(9 + i * 7, -47, 3.6, Math.PI * 1.2, Math.PI * 1.8);
    ctx.stroke();
  }

  // 볼터치
  ctx.save();
  ctx.globalAlpha = 0.55;
  ellipse(ctx, 4, -34, 3.6, 2.3, C.pink, false);
  ellipse(ctx, 22, -35, 3.6, 2.3, C.pink, false);
  ctx.restore();

  // 수염
  ctx.strokeStyle = "#CFC3E6";
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(2, -36); ctx.lineTo(-8, -38.5);
  ctx.moveTo(2, -34); ctx.lineTo(-8, -32.5);
  ctx.moveTo(24, -36); ctx.lineTo(34, -38.5);
  ctx.moveTo(24, -34); ctx.lineTo(34, -32.5);
  ctx.stroke();

  const eyes = [
    [8, -41],
    [19, -41.5],
  ];
  if (drowned) {
    // 물에 빠진 직후 — 눈은 > < 모양, 귀는 축 처진 표정
    ctx.strokeStyle = C.eye;
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    eyes.forEach(([ex, ey], i) => {
      const dir = i === 0 ? 1 : -1;
      ctx.beginPath();
      ctx.moveTo(ex - 3 * dir, ey - 3);
      ctx.lineTo(ex + 2 * dir, ey);
      ctx.lineTo(ex - 3 * dir, ey + 3);
      ctx.stroke();
    });
  } else if (happy) {
    ctx.strokeStyle = C.eye;
    ctx.lineWidth = 2.6;
    ctx.lineCap = "round";
    eyes.forEach(([ex, ey]) => {
      ctx.beginPath();
      ctx.arc(ex, ey + 1.5, 3.4, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
    });
  } else {
    eyes.forEach(([ex, ey]) => {
      ellipse(ctx, ex, ey, 3.2, 3.9, C.eye, false);
      ctx.globalAlpha = 0.95;
      ellipse(ctx, ex - 1.1, ey - 1.5, 1.3, 1.5, "#FFFFFF", false);
      ellipse(ctx, ex + 1.3, ey + 1.6, 0.7, 0.8, "#FFFFFF", false);
      ctx.globalAlpha = 1;
    });
  }

  triangle(ctx, [11.8, -33.4], [16.2, -33.4], [14, -30.9], C.pinkDeep, false);
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = 1.5;
  ctx.lineCap = "round";
  if (happy || drowned) {
    ctx.beginPath();
    ctx.arc(14, -29.4, 3, Math.PI * 0.12, Math.PI * 0.88);
    ctx.stroke();
  } else {
    // 고양이 특유의 ω 입 — 코에서 인중이 내려와 좌우로 갈라진다.
    ctx.beginPath();
    ctx.moveTo(14, -30.8);
    ctx.lineTo(14, -29.2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(12.2, -29.2, 1.9, 0, Math.PI);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(15.8, -29.2, 1.9, 0, Math.PI);
    ctx.stroke();
  }

  ctx.restore();
}

function drawMouse(ctx, m, g) {
  const hop = Math.abs(Math.sin(g.t * 17 + m.seed)) * 2.4;
  ctx.save();
  ctx.translate(m.x, g.groundY - hop);
  if (m.escaped) ctx.globalAlpha = 0.85;

  outlined(
    ctx,
    () => {
      ctx.beginPath();
      ctx.moveTo(8, -7);
      ctx.quadraticCurveTo(17, -6, 15, -15);
    },
    C.pink,
    5,
    2.6,
  );

  const step = Math.sin(g.t * 20 + m.seed) * 2;
  limb(ctx, -3, -4, -3 + step, 0, 4);
  limb(ctx, 4, -4, 4 - step, 0, 4);

  ellipse(ctx, 0, -7, 9, 6.4, C.mouse, true, -0.1);
  ellipse(ctx, -10, -13, 4.2, 4.2, C.mouse);
  ellipse(ctx, -4, -13.6, 4.2, 4.2, C.mouse);
  ellipse(ctx, -10, -13, 2.2, 2.2, C.pink, false);
  ellipse(ctx, -4, -13.6, 2.2, 2.2, C.pink, false);
  ellipse(ctx, -8, -8, 5.4, 5.2, C.mouse);
  ellipse(ctx, -9.4, -8.6, 1.4, 1.6, C.eye, false);
  ellipse(ctx, -9.9, -9.1, 0.6, 0.6, "#FFFFFF", false);
  ellipse(ctx, -12.8, -6.6, 1.3, 1.1, C.pinkDeep, false);

  ctx.strokeStyle = "#B7AECB";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-12, -6); ctx.lineTo(-19, -8);
  ctx.moveTo(-12, -5); ctx.lineTo(-19, -3);
  ctx.stroke();
  ctx.restore();
}

function drawPuddle(ctx, p, g) {
  const wob = Math.sin(g.t * 3 + p.seed) * 0.5;
  ctx.save();
  ctx.translate(p.x, g.groundY);
  const grad = ctx.createLinearGradient(0, -8, 0, 4);
  grad.addColorStop(0, C.water);
  grad.addColorStop(1, C.waterDeep);
  ctx.beginPath();
  ctx.ellipse(0, -1, p.w / 2, 6 + wob, 0, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = "#7FAEDE";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.strokeStyle = "#FFFFFF";
  ctx.globalAlpha = 0.75;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.ellipse(-p.w * 0.14, -2.6, p.w * 0.18, 1.7, 0, Math.PI * 0.9, Math.PI * 1.9);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(p.w * 0.2, 0.4, p.w * 0.1, 1.2, 0, Math.PI * 0.9, Math.PI * 1.9);
  ctx.stroke();
  ctx.restore();
}

function drawScene(ctx, g) {
  ctx.clearRect(0, 0, g.w, VIEW_H);

  const sky = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  sky.addColorStop(0, "#FDFAFF");
  sky.addColorStop(1, "#F5EEFF");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, g.w, VIEW_H);

  ctx.fillStyle = C.hill;
  g.hills.forEach((h) => {
    const x = ((h.x - g.dist * 0.18) % (g.w + 220)) - 110;
    ctx.beginPath();
    ctx.ellipse(x, g.groundY + 12, h.r, h.r * 0.58, 0, Math.PI, Math.PI * 2);
    ctx.fill();
  });

  ctx.fillStyle = C.cloud;
  g.clouds.forEach((c) => {
    const x = ((c.x - g.dist * 0.32) % (g.w + 160)) - 80;
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.arc(x, c.y, c.r, 0, Math.PI * 2);
    ctx.arc(x + c.r * 0.9, c.y + 2, c.r * 0.75, 0, Math.PI * 2);
    ctx.arc(x - c.r * 0.85, c.y + 3, c.r * 0.62, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  });

  g.puddles.forEach((p) => drawPuddle(ctx, p, g));

  ctx.strokeStyle = C.ground;
  ctx.lineWidth = 2.4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(0, g.groundY + 1);
  ctx.lineTo(g.w, g.groundY + 1);
  ctx.stroke();

  ctx.fillStyle = "#E2D6F6";
  g.pebbles.forEach((p) => {
    const x = ((p.x - g.dist) % (g.w + 60)) - 30;
    ctx.beginPath();
    ctx.ellipse(x, g.groundY + p.y, p.r, p.r * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
  });

  g.mice.forEach((m) => drawMouse(ctx, m, g));
  drawCat(ctx, g);

  g.particles.forEach((p) => {
    const life = p.life / p.max;
    if (p.kind === "heart") heart(ctx, p.x, p.y, p.s, life);
    else if (p.kind === "sparkle") sparkle(ctx, p.x, p.y, p.s, life);
    else if (p.kind === "text") {
      ctx.save();
      ctx.globalAlpha = life;
      ctx.fillStyle = C.text;
      ctx.font = "700 14px -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(p.text, p.x, p.y);
      ctx.restore();
    } else {
      ctx.save();
      ctx.globalAlpha = life * 0.5;
      ctx.fillStyle = "#CFC3E6";
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.s, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  });
}

function createGame(width) {
  return {
    w: width,
    groundY: VIEW_H - GROUND_PAD,
    t: 0,
    dist: 0,
    speed: BASE_SPEED,
    phase: "ready",
    overAt: 0,
    score: 0,
    nextSpawn: 0.8,
    lastKind: null,
    cat: { y: 0, vy: 0, squash: 1, pounce: 0, blink: 0, nextBlink: 2.5 },
    mice: [],
    puddles: [],
    particles: [],
    clouds: [
      { x: 60, y: 32, r: 13 },
      { x: 210, y: 22, r: 10 },
      { x: 360, y: 42, r: 15 },
    ],
    hills: [
      { x: 90, r: 70 },
      { x: 320, r: 95 },
    ],
    pebbles: Array.from({ length: 12 }, () => ({
      x: rand(0, 520),
      y: rand(5, 14),
      r: rand(1.2, 2.6),
    })),
  };
}

function burst(g, x, y) {
  for (let i = 0; i < 5; i += 1) {
    g.particles.push({
      kind: i % 2 === 0 ? "heart" : "sparkle",
      x: x + rand(-10, 10),
      y: y + rand(-8, 4),
      vx: rand(-26, 26),
      vy: rand(-70, -34),
      s: rand(3.5, 6),
      life: 0.75,
      max: 0.75,
    });
  }
  g.particles.push({
    kind: "text",
    text: "냥!",
    x,
    y: y - 16,
    vx: 6,
    vy: -40,
    s: 0,
    life: 0.9,
    max: 0.9,
  });
}

export default function CatMouseGame() {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const gameRef = useRef(null);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [phase, setPhase] = useState("ready");

  useEffect(() => {
    setBest(readBest());
  }, []);

  const input = useCallback(() => {
    const g = gameRef.current;
    if (!g) return;
    if (g.phase === "ready") {
      g.phase = "playing";
      setPhase("playing");
      g.cat.vy = JUMP_V;
      return;
    }
    if (g.phase === "over") {
      // 물에 빠뜨린 그 입력이 곧바로 재시작으로 이어지지 않도록 잠깐 잠근다.
      if (g.t - g.overAt < 0.45) return;
      const fresh = createGame(g.w);
      fresh.phase = "playing";
      fresh.clouds = g.clouds;
      fresh.hills = g.hills;
      fresh.pebbles = g.pebbles;
      gameRef.current = fresh;
      setScore(0);
      setPhase("playing");
      return;
    }
    if (g.cat.y <= 0.5) g.cat.vy = JUMP_V;
  }, []);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return undefined;

    const ctx = canvas.getContext("2d");
    gameRef.current = createGame(wrap.clientWidth || 400);

    // 캔버스는 CSS로 늘리지 않고 항상 기기 해상도 그대로 다시 그린다.
    const resize = () => {
      const cssW = wrap.clientWidth || 400;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(VIEW_H * dpr);
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${VIEW_H}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      gameRef.current.w = cssW;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    let raf = 0;
    let last = performance.now();
    const frame = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const g = gameRef.current;
      g.t += dt;

      const cat = g.cat;
      cat.blink = Math.max(0, cat.blink - dt);
      cat.nextBlink -= dt;
      if (cat.nextBlink <= 0) {
        cat.blink = 0.13;
        cat.nextBlink = rand(2.2, 5);
      }
      cat.pounce = Math.max(0, cat.pounce - dt);

      if (cat.y > 0 || cat.vy > 0) {
        cat.vy -= GRAVITY * dt;
        cat.y += cat.vy * dt;
        if (cat.y <= 0) {
          cat.y = 0;
          cat.vy = 0;
          cat.squash = 0.86;
        }
      }
      cat.squash += (1 - cat.squash) * Math.min(1, dt * 14);

      if (g.phase === "playing") {
        g.speed = Math.min(MAX_SPEED, g.speed + 7 * dt);
        g.dist += g.speed * dt;

        g.nextSpawn -= dt;
        if (g.nextSpawn <= 0) {
          // 물웅덩이가 연달아 나오면 점프만 하다 끝나므로 한 번씩 걸러낸다.
          const kind = g.lastKind === "puddle" || Math.random() < 0.62 ? "mouse" : "puddle";
          const x = g.w + 40;
          if (kind === "mouse") g.mice.push({ x, seed: rand(0, 6.3), escaped: false });
          else g.puddles.push({ x, w: rand(34, 58), seed: rand(0, 6.3) });
          g.lastKind = kind;
          g.nextSpawn = rand(0.78, 1.6) * (260 / g.speed);
        }

        const catLeft = CAT_X - 15;
        const catRight = CAT_X + 19;
        const airborne = cat.y > 8;

        g.mice = g.mice.filter((m) => {
          m.x -= (g.speed + 55) * dt;
          const hit = m.x + 10 > catLeft && m.x - 16 < catRight;
          if (hit && !m.escaped) {
            if (airborne && cat.vy < 120) {
              burst(g, m.x, g.groundY - 18);
              g.score += 1;
              setScore(g.score);
              cat.pounce = 0.45;
              cat.vy = Math.max(cat.vy, 170);
              return false;
            }
            m.escaped = true;
            for (let i = 0; i < 3; i += 1) {
              g.particles.push({
                kind: "dust",
                x: m.x + 8,
                y: g.groundY - 4,
                vx: rand(10, 40),
                vy: rand(-20, -4),
                s: rand(2, 4),
                life: 0.5,
                max: 0.5,
              });
            }
          }
          return m.x > -40;
        });

        g.puddles = g.puddles.filter((p) => {
          p.x -= g.speed * dt;
          const overlap = p.x + p.w / 2 > catLeft + 3 && p.x - p.w / 2 < catRight - 3;
          if (overlap && cat.y < 9) {
            g.phase = "over";
            g.overAt = g.t;
            setPhase("over");
            setBest((prev) => {
              const next = Math.max(prev, g.score);
              if (next > prev) writeBest(next);
              return next;
            });
            for (let i = 0; i < 7; i += 1) {
              g.particles.push({
                kind: "dust",
                x: CAT_X + rand(-12, 12),
                y: g.groundY - 6,
                vx: rand(-50, 50),
                vy: rand(-90, -30),
                s: rand(2, 4.5),
                life: 0.7,
                max: 0.7,
              });
            }
          }
          return p.x > -70;
        });
      }

      g.particles = g.particles.filter((p) => {
        p.life -= dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 60 * dt;
        return p.life > 0;
      });

      drawScene(ctx, g);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    const onKey = (e) => {
      if (e.code !== "Space" && e.code !== "ArrowUp" && e.code !== "KeyW") return;
      if (e.repeat) return;
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      e.preventDefault();
      input();
    };
    window.addEventListener("keydown", onKey);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("keydown", onKey);
      const g = gameRef.current;
      if (g && g.score > readBest()) writeBest(g.score);
    };
  }, [input]);

  return (
    <div style={{ width: "100%", maxWidth: 440, padding: "0 16px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 7,
          fontSize: 11.5,
          fontWeight: 600,
          color: "#B6A9D6",
        }}
      >
        <span>기다리는 동안 한 판</span>
        <span style={{ fontVariantNumeric: "tabular-nums", color: score > 0 ? "#8B7FD8" : "#B6A9D6" }}>
          잡은 생쥐 {score}
          {best > 0 ? ` · 최고 ${best}` : ""}
        </span>
      </div>

      <div
        ref={wrapRef}
        role="application"
        aria-label="고양이가 생쥐를 잡는 미니게임. 스페이스바로 점프하세요."
        onPointerDown={(e) => {
          e.preventDefault();
          input();
        }}
        style={{
          position: "relative",
          width: "100%",
          height: VIEW_H,
          borderRadius: 16,
          overflow: "hidden",
          border: "1px solid #EADFFA",
          background: "#FDFAFF",
          cursor: "pointer",
          touchAction: "manipulation",
          userSelect: "none",
        }}
      >
        <canvas ref={canvasRef} style={{ display: "block" }} />

        <AnimatePresence>
          {phase !== "playing" && (
            <motion.div
              key={phase}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.22 }}
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 5,
                background: "rgba(253,250,255,0.72)",
                pointerEvents: "none",
                textAlign: "center",
                padding: "0 20px",
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 700, color: "#6B4FA8" }}>
                {phase === "ready" ? "스페이스바 또는 화면을 눌러 시작" : "앗, 물웅덩이에 빠졌어요"}
              </div>
              <div style={{ fontSize: 12, color: "#9C8FC2", lineHeight: 1.6 }}>
                {phase === "ready"
                  ? "점프해서 생쥐를 덮치고, 물웅덩이는 뛰어넘으세요"
                  : `생쥐 ${score}마리를 잡았어요 · 한 번 더 누르면 다시 시작`}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
