// 리머 사이트의 두 번째 움직임 묶음 — 눌렀을 때 튀는 빛, 도면 위에서 도는 입체.
//
//   ClickSparks     어디를 누르든 그 자리에서 빛줄기 색(파랑 → 보라)의 불꽃이 튄다.
//                   화면 전체를 덮는 캔버스 한 장이지만 불꽃이 남아 있을 때만 그린다.
//   BlueprintSolid  청사진 선으로 그린 정이십면체와 그 안에서 거꾸로 도는 정팔면체.
//                   스크롤하면 그만큼 돌고, 커서 쪽으로 기운다. 앞쪽 모서리는 밝고 뒤쪽은 흐리다.
//
// 둘 다 레이아웃에 손대지 않는다 — 캔버스는 절대 위치로 떠 있고, 움직이는 건 그 안의
// 픽셀뿐이다. 화면 밖에서는 멈추고, "움직임 줄이기"에서는 불꽃을 끄고 입체는 한 장만 그린다.
import { useEffect, useRef } from "react";

const reduced = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

// 빛줄기의 세 색. site.css의 --beam-blue / --beam-mid / --beam-violet과 같은 값이다.
const BEAM = [
  [59, 130, 246],
  [109, 90, 224],
  [139, 92, 246],
];
const beamAt = (t) => {
  const k = Math.max(0, Math.min(1, t)) * (BEAM.length - 1);
  const i = Math.min(BEAM.length - 2, Math.floor(k));
  const f = k - i;
  return BEAM[i].map((c, j) => Math.round(c + (BEAM[i + 1][j] - c) * f));
};

// ── 누르면 튀는 빛 ──────────────────────────────────────────────────────────
export function ClickSparks() {
  const ref = useRef(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv || reduced()) return undefined;
    const ctx = cv.getContext("2d");
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let W = 0;
    let H = 0;
    // 툴바가 숨고 나타나며 높이만 바뀔 때는 캔버스를 다시 잡지 않는다(SiteBackdrop과 같은 이유).
    const size = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      if (w === W && h <= H) return;
      H = w === W ? Math.max(H, h) : h;
      W = w;
      // 실제 픽셀은 처음 누를 때 잡는다. 한 번도 안 누르면 화면 한 장 분량의 메모리를 아낀다.
      if (held) { cv.width = W * dpr; cv.height = H * dpr; }
      cv.style.width = `${W}px`;
      cv.style.height = `${H}px`;
    };
    let held = false;
    cv.width = 1;
    cv.height = 1;
    size();

    let sparks = [];
    let rings = [];
    let raf = 0;
    const tick = () => {
      raf = 0;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = "lighter";
      const now = performance.now();
      sparks = sparks.filter((s) => now - s.t0 < s.life);
      for (const s of sparks) {
        const age = (now - s.t0) / s.life; // 0 → 1
        const ease = 1 - (1 - age) ** 3;
        const d = s.dist * ease;
        const x = s.x + Math.cos(s.a) * d;
        const y = s.y + Math.sin(s.a) * d;
        // 불꽃은 점이 아니라 짧은 선이다 — 날아가는 방향으로 꼬리가 달린다.
        const tail = s.len * (1 - age);
        const [r, g, b] = s.c;
        ctx.strokeStyle = `rgba(${r},${g},${b},${(1 - age) * 0.95})`;
        ctx.lineWidth = s.w * (1 - age * 0.6);
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(x - Math.cos(s.a) * tail, y - Math.sin(s.a) * tail);
        ctx.lineTo(x, y);
        ctx.stroke();
      }
      // 한가운데는 짧게 번쩍이는 고리 하나.
      for (const ring of rings) {
        const age = (now - ring.t0) / 520;
        if (age >= 1) continue;
        ctx.strokeStyle = `rgba(255,255,255,${(1 - age) * 0.5})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(ring.x, ring.y, 6 + age * 34, 0, Math.PI * 2);
        ctx.stroke();
      }
      rings = rings.filter((r) => now - r.t0 < 520);
      ctx.globalCompositeOperation = "source-over";
      if (sparks.length || rings.length) raf = requestAnimationFrame(tick);
    };

    const burst = (e) => {
      // 입력칸 안에서 누르는 건 글을 쓰려는 것이다. 거기서 불꽃이 튀면 방해만 된다.
      if (e.target instanceof Element && e.target.closest("input, textarea, select, [contenteditable]")) return;
      if (!held) { held = true; cv.width = W * dpr; cv.height = H * dpr; }
      const x = e.clientX;
      const y = e.clientY;
      const n = 16;
      const t0 = performance.now();
      for (let i = 0; i < n; i += 1) {
        sparks.push({
          x, y, t0,
          a: (i / n) * Math.PI * 2 + Math.random() * 0.35,
          dist: 36 + Math.random() * 46,
          len: 10 + Math.random() * 12,
          w: 1.2 + Math.random() * 1.3,
          life: 520 + Math.random() * 260,
          c: beamAt(Math.random()),
        });
      }
      rings.push({ x, y, t0 });
      if (!raf) raf = requestAnimationFrame(tick);
    };

    window.addEventListener("pointerdown", burst, { passive: true });
    window.addEventListener("resize", size);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("pointerdown", burst);
      window.removeEventListener("resize", size);
    };
  }, []);
  return <canvas ref={ref} className="sparks" aria-hidden />;
}

// ── 도면 위에서 도는 입체 ───────────────────────────────────────────────────
// 정이십면체: 황금비 φ로 만든 세 직사각형의 꼭짓점 12개. 모서리 길이가 2인 것 30개를 잇는다.
const PHI = (1 + Math.sqrt(5)) / 2;
const ICO_V = [
  [-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0],
  [0, -1, PHI], [0, 1, PHI], [0, -1, -PHI], [0, 1, -PHI],
  [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1],
].map((v) => v.map((c) => c / Math.sqrt(1 + PHI * PHI)));
const edgesOf = (verts, len) => {
  const out = [];
  for (let i = 0; i < verts.length; i += 1) {
    for (let j = i + 1; j < verts.length; j += 1) {
      const d = Math.hypot(verts[i][0] - verts[j][0], verts[i][1] - verts[j][1], verts[i][2] - verts[j][2]);
      if (Math.abs(d - len) < 1e-3) out.push([i, j]);
    }
  }
  return out;
};
const ICO_E = edgesOf(ICO_V, 2 / Math.sqrt(1 + PHI * PHI));
const OCT_V = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const OCT_E = edgesOf(OCT_V, Math.SQRT2);

// 화면에 보이는지. 렌더마다 새 객체를 돌려주면 그걸 의존하는 효과가 매번 다시 돌므로,
// 한 번 만든 객체를 계속 돌려준다(값은 그 안에서 바뀐다).
function useVisible(ref) {
  const state = useRef(null);
  if (!state.current) state.current = { on: false, listeners: new Set() };
  useEffect(() => {
    const st = state.current;
    const el = ref.current;
    if (!el || !("IntersectionObserver" in window)) { st.on = true; return undefined; }
    const io = new IntersectionObserver(([e]) => {
      st.on = e.isIntersecting;
      for (const fn of st.listeners) fn(st.on);
    }, { rootMargin: "80px" });
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  return state.current;
}

export function BlueprintSolid({ className = "" }) {
  const wrap = useRef(null);
  const cvRef = useRef(null);
  const vis = useVisible(wrap);

  useEffect(() => {
    const cv = cvRef.current;
    const box = wrap.current;
    if (!cv || !box) return undefined;
    const ctx = cv.getContext("2d");
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const still = reduced();
    let S = 0;

    const size = () => {
      S = Math.round(Math.min(box.clientWidth, box.clientHeight));
      if (S < 2) return false;
      cv.width = S * dpr;
      cv.height = S * dpr;
      cv.style.width = `${S}px`;
      cv.style.height = `${S}px`;
      return true;
    };

    // 커서 쪽으로 살짝 기운다. 급하게 따라가지 않도록 목표값을 향해 천천히 다가간다.
    const tilt = { x: 0, y: 0, tx: 0, ty: 0 };
    const onMove = (e) => {
      const r = box.getBoundingClientRect();
      tilt.tx = ((e.clientY - (r.top + r.height / 2)) / window.innerHeight) * 0.9;
      tilt.ty = ((e.clientX - (r.left + r.width / 2)) / window.innerWidth) * 0.9;
    };

    const rot = (v, ax, ay, az) => {
      let [x, y, z] = v;
      // x축
      let c = Math.cos(ax), s = Math.sin(ax);
      [y, z] = [y * c - z * s, y * s + z * c];
      // y축
      c = Math.cos(ay); s = Math.sin(ay);
      [x, z] = [x * c + z * s, -x * s + z * c];
      // z축
      c = Math.cos(az); s = Math.sin(az);
      [x, y] = [x * c - y * s, x * s + y * c];
      return [x, y, z];
    };

    const drawSolid = (verts, edges, R, ax, ay, az, bright) => {
      const cam = 3.4;
      const pts = verts.map((v) => {
        const [x, y, z] = rot(v, ax, ay, az);
        const k = cam / (cam - z);
        return { x: S / 2 + x * R * k, y: S / 2 + y * R * k, z };
      });
      // 뒤쪽 모서리부터 그려서 앞쪽이 위에 오게 한다.
      const order = edges
        .map(([i, j]) => ({ i, j, z: (pts[i].z + pts[j].z) / 2 }))
        .sort((a, b) => a.z - b.z);
      for (const { i, j, z } of order) {
        const depth = (z + 1) / 2; // 0(뒤) → 1(앞)
        const [r, g, b] = beamAt((pts[i].x + pts[j].x) / 2 / S);
        ctx.strokeStyle = `rgba(${r},${g},${b},${(0.08 + depth * 0.72) * bright})`;
        ctx.lineWidth = 0.6 + depth * 1.1;
        ctx.beginPath();
        ctx.moveTo(pts[i].x, pts[i].y);
        ctx.lineTo(pts[j].x, pts[j].y);
        ctx.stroke();
      }
      return pts;
    };

    let raf = 0;
    const t0 = performance.now();
    const frame = () => {
      raf = 0;
      if (!S && !size()) return;
      const time = (performance.now() - t0) / 1000;
      tilt.x += (tilt.tx - tilt.x) * 0.06;
      tilt.y += (tilt.ty - tilt.y) * 0.06;
      const scroll = window.scrollY * 0.0022;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, S, S);

      // 뒤에 깔리는 도면 원 — 치수선처럼 눈금이 돈다.
      ctx.strokeStyle = "rgba(160,150,230,0.10)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(S / 2, S / 2, S * 0.46, 0, Math.PI * 2);
      ctx.stroke();
      const ticks = 72;
      for (let i = 0; i < ticks; i += 1) {
        const a = (i / ticks) * Math.PI * 2 + time * 0.08 + scroll * 0.4;
        const long = i % 6 === 0;
        const r1 = S * 0.46;
        const r2 = S * (long ? 0.43 : 0.445);
        ctx.strokeStyle = `rgba(160,150,230,${long ? 0.28 : 0.12})`;
        ctx.beginPath();
        ctx.moveTo(S / 2 + Math.cos(a) * r1, S / 2 + Math.sin(a) * r1);
        ctx.lineTo(S / 2 + Math.cos(a) * r2, S / 2 + Math.sin(a) * r2);
        ctx.stroke();
      }

      const ax = 0.35 + tilt.x + scroll * 0.6;
      const ay = time * 0.22 + tilt.y + scroll;
      const outer = drawSolid(ICO_V, ICO_E, S * 0.3, ax, ay, 0.12, 1);
      // 안쪽은 반대로 돈다. 두 입체가 엇갈려 도는 게 이 그림의 움직임이다.
      drawSolid(OCT_V, OCT_E, S * 0.13, -ax * 1.4, -ay * 1.6, time * 0.3, 0.9);

      // 꼭짓점 — 앞쪽에 있는 것만 작게 빛난다.
      for (const p of outer) {
        if (p.z < 0.1) continue;
        const pulse = 0.55 + 0.45 * Math.sin(time * 2.4 + p.x * 0.05);
        ctx.fillStyle = `rgba(255,255,255,${(p.z * 0.8) * pulse})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.1 + p.z * 1.2, 0, Math.PI * 2);
        ctx.fill();
      }

      if (!still && vis.on) raf = requestAnimationFrame(frame);
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(frame); };

    const ro = "ResizeObserver" in window ? new ResizeObserver(() => { size(); kick(); }) : null;
    if (ro) ro.observe(box);
    size();
    const onVis = (on) => { if (on) kick(); };
    vis.listeners.add(onVis);
    if (!still) window.addEventListener("pointermove", onMove, { passive: true });
    // 움직임 줄이기면 한 장만 그린다. 아니면 보일 때 돌린다.
    kick();

    return () => {
      if (raf) cancelAnimationFrame(raf);
      if (ro) ro.disconnect();
      vis.listeners.delete(onVis);
      window.removeEventListener("pointermove", onMove);
    };
  }, [vis]);

  return (
    <div className={`solid ${className}`} ref={wrap} aria-hidden>
      <canvas ref={cvRef} />
    </div>
  );
}
