// 유메 첫 화면 아래, 일반 방문자를 위한 장면들.
//
// 이 자리에 법 이야기를 먼저 두면 "변호사용 서비스"로 읽힌다. 실제로 유메가 확인하는 것은
// 건강·약 용량·통계·역사·임금·사업자 정보처럼 사람들이 매일 AI에게 묻는 것들이고,
// 법률은 그중 가장 엄격하게 대조하는 한 분야다. 그래서 위에는 일상을, 아래에 기술을 둔다.
//
//   Scatter      흩어진 조각이 스크롤에 맞춰 "사실" 한 덩어리로 모인다
//   CaseDeck     AI가 자신 있게 틀린 실제 사례. 훑는 빛이 지나가면 판정이 찍힌다
//   DomainCloud  유메가 확인하는 분야가 흩어진 자리에서 제자리로 날아와 앉는다
//
// 문구는 전부 실제로 회귀 테스트(server/tests/accuracy.js)에 들어 있는 사례에서 가져왔다.
// 없는 기능을 그림으로 만들지 않는다.
import { useEffect, useRef, useState } from "react";

const PURPLE = [91, 63, 160];
const SOFT = [125, 95, 196];
const INK = [20, 17, 24];

const reduced = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

/** 화면에 걸쳐 있는 동안의 진행도 0→1. 밖이면 null(그리지 않는다). */
function useSectionProgress(ref) {
  const state = useRef({ p: 0, inView: false });
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    let raf = 0;
    const read = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight || 1;
      // 윗변이 화면 아래에 닿을 때 0, 아랫변이 화면 위를 지날 때 1.
      const total = r.height + vh;
      const seen = vh - r.top;
      state.current.p = Math.max(0, Math.min(1, seen / total));
      state.current.inView = r.bottom > -200 && r.top < vh + 200;
    };
    const on = () => { if (!raf) raf = requestAnimationFrame(read); };
    read();
    window.addEventListener("scroll", on, { passive: true });
    window.addEventListener("resize", on, { passive: true });
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("scroll", on);
      window.removeEventListener("resize", on);
    };
  }, [ref]);
  return state;
}

// ── 흩어진 조각이 모인다 ─────────────────────────────────────────────────────
// 글자를 화면 밖 캔버스에 한 번 그려 픽셀 자리를 읽고, 그 자리마다 조각을 하나 둔다.
// 조각은 스크롤 진행도만큼 제자리로 당겨진다 — 0이면 흩어진 채, 1이면 완전히 모인 상태.
// 다 모이면 둘레에 고리가 그려진다.
export function Scatter({ text = "사실", caption }) {
  const wrap = useRef(null);
  const canvas = useRef(null);
  const prog = useSectionProgress(wrap);

  useEffect(() => {
    const cv = canvas.current;
    const box = wrap.current;
    if (!cv || !box) return undefined;
    const ctx = cv.getContext("2d");
    if (!ctx) return undefined;

    const still = reduced();
    let parts = [];
    let W = 0;
    let H = 0;
    let dpr = 1;
    let dead = false;

    const build = () => {
      // 폭이 0이면 getImageData가 던진다. 예전에 이 한 줄이 없어 사이트가 백지가 됐다.
      const w = Math.floor(box.clientWidth);
      if (!w) return false;
      W = w;
      H = Math.round(Math.max(200, Math.min(420, W * 0.42)));
      dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = Math.max(1, Math.round(W * dpr));
      cv.height = Math.max(1, Math.round(H * dpr));
      cv.style.width = `${W}px`;
      cv.style.height = `${H}px`;

      const off = document.createElement("canvas");
      off.width = W;
      off.height = H;
      const o = off.getContext("2d");
      if (!o) return false;
      o.fillStyle = "#000";
      o.textAlign = "center";
      o.textBaseline = "middle";
      let size = Math.round(H * 0.66);
      const font = (px) => `800 ${px}px "Pretendard Variable", Pretendard, -apple-system, sans-serif`;
      o.font = font(size);
      const wide = o.measureText(text).width;
      if (wide > W * 0.78) {
        size = Math.max(24, Math.floor((size * W * 0.78) / wide));
        o.font = font(size);
      }
      o.fillText(text, W / 2, H / 2);

      let data;
      try {
        data = o.getImageData(0, 0, W, H).data;
      } catch {
        return false;
      }
      const step = W < 560 ? 4 : 5;
      const next = [];
      for (let y = 0; y < H; y += step) {
        for (let x = 0; x < W; x += step) {
          if (data[(y * W + x) * 4 + 3] > 130) {
            const ang = Math.random() * Math.PI * 2;
            const far = 220 + Math.random() * 520;
            next.push({
              hx: x,
              hy: y,
              // 흩어진 자리 — 제자리에서 사방으로 밀어낸 곳.
              sx: x + Math.cos(ang) * far,
              sy: y + Math.sin(ang) * far * 0.6,
              rot: (Math.random() - 0.5) * 3.2,
              // 다 모였을 때 글자가 성기지 않게, 조각은 표본 간격에 가깝게 잡는다.
              len: step * (0.62 + Math.random() * 0.38),
              // 조각마다 도착 시점을 달리 둔다. 한꺼번에 모이면 덩어리가 툭 나타난다.
              lag: Math.random() * 0.34,
              tone: Math.random(),
            });
          }
        }
      }
      parts = next;
      return true;
    };

    if (!build()) return undefined;
    document.fonts?.ready?.then(() => { if (!dead) build(); });

    const mix = (a, b, k) => [
      a[0] + (b[0] - a[0]) * k,
      a[1] + (b[1] - a[1]) * k,
      a[2] + (b[2] - a[2]) * k,
    ];

    const draw = () => {
      const p = still ? 1 : prog.current.p;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      // 구역이 화면 한가운데 올 때(p≈0.5) 이미 다 모여 있어야 한다. 늦게 잡으면
      // 글자가 완성될 즈음 캔버스가 화면 위로 빠져나가 아무도 못 본다.
      const t = Math.max(0, Math.min(1, (p - 0.10) / 0.34));
      for (const q of parts) {
        const k = Math.max(0, Math.min(1, (t - q.lag) / (1 - q.lag || 1)));
        // 끝에서 천천히 멎는다.
        const e = 1 - Math.pow(1 - k, 3);
        const x = q.sx + (q.hx - q.sx) * e;
        const y = q.sy + (q.hy - q.sy) * e;
        const c = mix(mix(SOFT, PURPLE, q.tone), INK, e * 0.55);
        ctx.globalAlpha = 0.18 + e * 0.72;
        ctx.fillStyle = `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
        if (e > 0.985) {
          ctx.fillRect(x, y, q.len, q.len);
        } else {
          // 아직 날아오는 조각은 진행 방향으로 늘어난다.
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(q.rot * (1 - e));
          ctx.fillRect(0, 0, q.len + (1 - e) * 14, q.len * 0.8);
          ctx.restore();
        }
      }
      ctx.globalAlpha = 1;
    };

    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (!prog.current.inView) return;
      draw();
    };
    if (still) draw();
    else raf = requestAnimationFrame(loop);

    let lastW = W;
    const onResize = () => {
      if (Math.abs(box.clientWidth - lastW) < 2) return;
      lastW = box.clientWidth;
      if (build() && still) draw();
    };
    window.addEventListener("resize", onResize);
    return () => {
      dead = true;
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, [text, prog]);

  return (
    <div ref={wrap} style={{ width: "100%" }}>
      <canvas ref={canvas} style={{ display: "block", width: "100%" }} aria-hidden />
      {caption && (
        <p style={{
          margin: "18px auto 0", maxWidth: 520, textAlign: "center",
          fontSize: "clamp(15px, 1.4vw, 18px)", lineHeight: 1.7, color: "#54505E", letterSpacing: "-0.01em",
        }}>{caption}</p>
      )}
    </div>
  );
}

// ── AI가 자신 있게 틀린 것들 ─────────────────────────────────────────────────
// 전부 server/tests/accuracy.js의 실제 회귀 사례다. 유메가 매번 통과시키는 것들.
export const CASES = [
  {
    domain: "노동 · 임금",
    claim: "2024년 최저임금은 시간당 10,030원입니다.",
    verdict: "사실 아님",
    tone: "bad",
    fact: "10,030원은 2025년 금액입니다. 2024년은 9,860원이었습니다. 다른 해의 숫자를 올해 것처럼 말하는 실수가 가장 잦습니다.",
  },
  {
    domain: "통계 · 수치",
    claim: "2024년 대구 중구 안경 공방의 평균 객단가는 18만 7천원으로 집계되었습니다.",
    verdict: "사실 아님",
    tone: "bad",
    fact: "그런 집계 자체가 없습니다. 출처가 없는 수치는 그럴듯할수록 걸러내기 어렵습니다.",
  },
  {
    domain: "건강 · 영양",
    claim: "비타민C를 하루 1000mg씩 먹으면 감기에 거의 걸리지 않습니다.",
    verdict: "근거 부족",
    tone: "warn",
    fact: "코크런 체계적 문헌고찰에서 일반인의 감기 발생률은 낮추지 못했습니다. 앓는 기간만 조금 줄었습니다.",
  },
  {
    domain: "역사 · 상식",
    claim: "훈민정음은 1446년에 반포되었습니다.",
    verdict: "확인됨",
    tone: "ok",
    fact: "맞는 것을 틀렸다고 말하지 않는 것도 똑같이 중요하게 봅니다.",
  },
];

const TONES = {
  ok: { bg: "rgba(46,125,86,0.10)", fg: "#2E7D56", ring: "rgba(46,125,86,0.30)" },
  warn: { bg: "rgba(176,120,18,0.10)", fg: "#9A6B10", ring: "rgba(176,120,18,0.30)" },
  bad: { bg: "rgba(190,54,54,0.10)", fg: "#B3312F", ring: "rgba(190,54,54,0.28)" },
};

function CaseCard({ c, index, t }) {
  const ref = useRef(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || !("IntersectionObserver" in window)) { setShown(true); return undefined; }
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setShown(true); io.disconnect(); }
    }, { rootMargin: "-10% 0px -10% 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const tone = TONES[c.tone];
  const delay = index * 0.12;
  return (
    <article
      ref={ref}
      className={`yc-case${shown ? " is-in" : ""}`}
      style={{ "--d": `${delay}s` }}
    >
      <div className="yc-case__domain">{t(c.domain)}</div>
      {/* AI가 한 말 — 훑는 빛이 지나간다 */}
      <div className="yc-case__claim">
        <span className="yc-case__scan" aria-hidden />
        {t(c.claim)}
      </div>
      <div className="yc-case__verdict" style={{ background: tone.bg, color: tone.fg, boxShadow: `inset 0 0 0 1px ${tone.ring}` }}>
        {t(c.verdict)}
      </div>
      <p className="yc-case__fact">{t(c.fact)}</p>
    </article>
  );
}

export function CaseDeck({ t = (x) => x }) {
  return (
    <div className="yc-cases">
      {CASES.map((c, i) => <CaseCard key={c.claim} c={c} index={i} t={t} />)}
    </div>
  );
}

// ── 확인하는 분야 ────────────────────────────────────────────────────────────
// 흩어진 자리에서 제자리로 날아와 앉는다.
export const DOMAINS = [
  "건강 · 영양", "약 용량", "통계 · 수치", "역사 · 상식",
  "노동 · 임금", "제품 · 사양", "사업자 정보", "뉴스 인용", "법률 · 판례",
];

export function DomainCloud({ t = (x) => x }) {
  const ref = useRef(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || !("IntersectionObserver" in window)) { setShown(true); return undefined; }
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setShown(true); io.disconnect(); }
    }, { rootMargin: "-15% 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div className={`yc-cloud${shown ? " is-in" : ""}`} ref={ref}>
      {DOMAINS.map((d, i) => {
        const ang = (i / DOMAINS.length) * Math.PI * 2;
        return (
          <span
            key={d}
            className={`yc-chip${d.startsWith("법률") ? " yc-chip--law" : ""}`}
            style={{
              "--dx": `${Math.cos(ang) * 260}px`,
              "--dy": `${Math.sin(ang) * 150}px`,
              "--d": `${i * 0.055}s`,
            }}
          >
            {t(d)}
          </span>
        );
      })}
    </div>
  );
}
