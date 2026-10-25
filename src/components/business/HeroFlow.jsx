// 히어로 배경 흐름 + 검증 기록 한 줄 — 2026-10-26 대표 "벨트 이외에도 그런 느낌의 애니메이션, 너무 난잡하지 않게".
// ① HeroFlow: 배경 격자 위를 짧은 신호선이 오른쪽 → 왼쪽으로 흐르고(컨베이어와 같은 방향), 가운데 검증선을 지나는 순간
//    코발트로 바뀌어 작은 눈금을 남긴다. 투명도를 낮게, 개수를 적게 — 글을 읽는 데 방해가 되지 않게.
//    화면 밖이면 멈추고, 움직임 줄이기면 그리지 않는다.
// ② VerifyTicker: "§ 조문 · 무엇을 · 결과"를 2.8초마다 바꿔 보여 주는 한 줄. 모두 실제 법령 사실이다
//    (남녀고용평등법 제19조의4는 2026-10-25 법제처 연혁으로 확인: 2025.2.23 시행 개정으로 분할 2회 → 3회).
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

export function HeroFlow({ gateAt = 0.62 }) {
  const ref = useRef(null);
  const reduce = useReducedMotion();
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || reduce) return undefined;
    const ctx = canvas.getContext("2d");
    let w = 0;
    let h = 0;
    let dpr = 1;
    let raf = 0;
    let visible = true;
    const LANE = 56; // 히어로 격자 간격과 같게
    const marks = [];
    let lines = [];
    const spawn = (initial = false) => {
      const lanes = Math.max(4, Math.floor(h / LANE));
      return {
        y: (1 + Math.floor(Math.random() * (lanes - 1))) * LANE,
        x: initial ? Math.random() * w : w + Math.random() * 200,
        len: 24 + Math.random() * 46,
        v: 0.35 + Math.random() * 0.55,
        passed: false,
      };
    };
    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.round(Math.min(18, Math.max(8, w / 90)));
      lines = Array.from({ length: n }, () => spawn(true));
    };
    resize();
    const gx = () => w * gateAt;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (!visible) return;
      ctx.clearRect(0, 0, w, h);
      // 검증선 — 아주 옅은 세로 띠
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "rgba(123,149,255,0)");
      g.addColorStop(0.5, "rgba(123,149,255,0.10)");
      g.addColorStop(1, "rgba(123,149,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(gx() - 1, 0, 2, h);
      for (const m of marks) {
        ctx.fillStyle = `rgba(123,149,255,${m.a})`;
        ctx.fillRect(gx() - 5, m.y - 1, 10, 2);
        m.a -= 0.008;
      }
      while (marks.length && marks[0].a <= 0) marks.shift();
      for (const l of lines) {
        l.x -= l.v;
        const after = l.x + l.len < gx();
        if (!l.passed && l.x < gx()) { l.passed = true; marks.push({ y: l.y, a: 0.55 }); }
        const grad = ctx.createLinearGradient(l.x, 0, l.x + l.len, 0);
        if (after || l.passed) {
          grad.addColorStop(0, "rgba(123,149,255,0.55)");
          grad.addColorStop(1, "rgba(123,149,255,0)");
        } else {
          grad.addColorStop(0, "rgba(255,255,255,0.28)");
          grad.addColorStop(1, "rgba(255,255,255,0)");
        }
        ctx.fillStyle = grad;
        ctx.fillRect(l.x, l.y - 0.5, l.len, 1);
        if (l.x + l.len < -10) Object.assign(l, spawn());
      }
    };
    raf = requestAnimationFrame(tick);
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { threshold: 0 });
    io.observe(canvas);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); };
  }, [reduce, gateAt]);
  if (reduce) return null;
  return <canvas ref={ref} className="vl-flow" aria-hidden="true" />;
}

const LOG = [
  { law: "근로기준법 제60조 ①", what: "1년 80% 이상 출근 → 연차 15일", res: "일치", ok: true },
  { law: "고용보험법 제40조 ②", what: "2주 → 1주 소정근로일수", res: "바로잡음", ok: false },
  { law: "최저임금법 제31조", what: "벌금 → 과태료", res: "바로잡음", ok: false },
  { law: "남녀고용평등법 제19조의4", what: "육아휴직 분할 2회 → 3회", res: "개정 전 내용 · 2025.2.23", ok: false },
  { law: "주택임대차보호법 제3조 ①", what: "인도 + 주민등록 → 다음 날 대항력", res: "일치", ok: true },
];

export function VerifyTicker() {
  const reduce = useReducedMotion();
  const [i, setI] = useState(0);
  useEffect(() => {
    if (reduce) return undefined;
    const t = setInterval(() => setI((x) => (x + 1) % LOG.length), 2800);
    return () => clearInterval(t);
  }, [reduce]);
  const row = LOG[i];
  return (
    <div className="vl-ticker" aria-live="off">
      <span className="dot" aria-hidden="true" />
      <span className="label">실시간 검증 예시</span>
      <span className="win">
        <AnimatePresence mode="wait" initial={false}>
          <motion.span key={i} className="row" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.35 }}>
            <code>§ {row.law}</code> <span className="what">{row.what}</span> <b className={row.ok ? "ok" : "fix"}>{row.res}</b>
          </motion.span>
        </AnimatePresence>
      </span>
    </div>
  );
}
