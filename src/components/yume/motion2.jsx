// 유메의 움직임 2 — 같은 언어(문서를 검토하는 손)로 화면 곳곳을 채운다. motion.jsx의 짝.
//
//   · EvidenceField   히어로 뒤로 조문·사건번호·DOI 꼬리표가 깊이를 두고 떠 있다. 스크롤하면 깊이마다
//                     다른 속도로 흘러가고, 떠오를 때 하나씩 ✓ ✕ ? 가 찍힌다 — 유메가 대조하는 재료다
//   · VerdictMarquee  판정들이 흘러가는 띠. 스크롤을 빨리 하면 그만큼 빨라지고 기운다
//   · WordReveal      제목이 검은 가림 막대(기밀문서의 먹칠) 뒤에서 벗겨지며 나온다
//   · SealRing        "법제처 공식 대조" 인장이 스크롤에 맞춰 돈다
//   · InkWordmark     맨 아래 큰 YUME가 스크롤만큼 잉크로 차오른다
//   · CursorLoupe     (마우스일 때) 돋보기 테두리가 손을 따라오고, 누를 수 있는 것 위에서 커진다
//
// transform·opacity·배경 위치만 움직인다. "움직임 줄이기"를 켜면 완성된 정지 화면을 보여준다.
import React, { useEffect, useRef, useState } from "react";
import {
  motion,
  useAnimationFrame,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  useVelocity,
  wrap,
} from "framer-motion";
import { useFinePointer, EASE } from "./motion.jsx";

const INK = "#141118";
const PURPLE = "#5B3FA0";
const RED = "#B8321F";
const GREEN = "#1F8A57";
const AMBER = "#9A4318";
const MONO = 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, "Roboto Mono", monospace';
const TONE = { ok: GREEN, bad: RED, gone: AMBER };
const GLYPH = { ok: "✓", bad: "✕", gone: "?" };

// ── 히어로 뒤의 증거 조각들 ─────────────────────────────────────────────────
// x/y는 화면 가장자리 쪽에만 둔다 — 가운데는 제목과 입력칸의 자리다. depth가 클수록 가깝다
// (크고, 선명하고, 빨리 움직인다). narrow는 폰에서도 남길 것.
// 가운데(제목·입력칸)를 피해 양옆 띠에만 둔다. 넓은 화면(1100px 이상)에서만 그린다 — 좁으면
// 제목과 겹친다.
const EVIDENCE = [
  { text: "민법 제750조", mark: "ok", x: 6, y: 16, depth: 1 },
  { text: "2019다999999", mark: "gone", x: 82, y: 12, depth: 0.8 },
  { text: "평균 당첨금 20억", mark: "bad", x: 2, y: 34, depth: 0.35 },
  { text: "소멸시효 1년", mark: "bad", x: 85, y: 38, depth: 1.1 },
  { text: "DOI 10.1056/NEJMoa", mark: "ok", x: 4, y: 55, depth: 0.45 },
  { text: "arXiv 2310.06825", mark: "ok", x: 83, y: 62, depth: 0.3 },
  { text: "PMID 31415926", mark: "gone", x: 5, y: 80, depth: 0.6 },
  { text: "제766조 3년 · 10년", mark: "ok", x: 81, y: 84, depth: 0.7 },
];

export function EvidenceField() {
  const reduce = useReducedMotion();
  const fine = useFinePointer();
  const { scrollY } = useScroll();
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const spx = useSpring(px, { stiffness: 60, damping: 18 });
  const spy = useSpring(py, { stiffness: 60, damping: 18 });
  const fade = useTransform(scrollY, [0, 520], [1, 0]);

  useEffect(() => {
    if (!fine || reduce) return undefined;
    const move = (e) => {
      px.set((e.clientX / window.innerWidth - 0.5) * 2);
      py.set((e.clientY / window.innerHeight - 0.5) * 2);
    };
    window.addEventListener("pointermove", move, { passive: true });
    return () => window.removeEventListener("pointermove", move);
  }, [fine, reduce, px, py]);

  return (
    <motion.div aria-hidden className="yume-evidence" style={{ position: "absolute", inset: "0 0 auto 0", height: 640, pointerEvents: "none", opacity: reduce ? 1 : fade, overflow: "hidden" }}>
      {EVIDENCE.map((e, i) => (
        <EvidenceChip key={e.text} e={e} i={i} scrollY={scrollY} spx={spx} spy={spy} reduce={reduce} />
      ))}
    </motion.div>
  );
}

function EvidenceChip({ e, i, scrollY, spx, spy, reduce }) {
  const y = useTransform(scrollY, (v) => -v * e.depth * 0.55);
  const mx = useTransform(spx, (v) => v * e.depth * 14);
  const my = useTransform(spy, (v) => v * e.depth * 10);
  const ty = useTransform([y, my], ([a, b]) => a + b);
  const size = 11 + e.depth * 3;
  const c = TONE[e.mark];
  return (
    <motion.div
      style={{
        position: "absolute", left: `${e.x}%`, top: `${e.y}%`,
        x: reduce ? 0 : mx, y: reduce ? 0 : ty,
        filter: e.depth < 0.5 ? "blur(1.2px)" : "none",
        opacity: 0.35 + e.depth * 0.45,
      }}
    >
      <span className="yume-float" style={{ display: "inline-block", animationDelay: `${-i * 0.9}s`, animationDuration: `${6 + (i % 3)}s` }}>
      <motion.span
        initial={reduce ? false : { opacity: 0, y: 14, rotate: (i % 2 ? 1 : -1) * 6 }}
        animate={{ opacity: 1, y: 0, rotate: (i % 2 ? 1 : -1) * 2.5 }}
        transition={{ duration: 0.9, ease: EASE, delay: 0.5 + i * 0.09 }}
        style={{
          display: "inline-flex", alignItems: "center", gap: 7, padding: "5px 10px 5px 9px", borderRadius: 7,
          background: "rgba(255,255,255,0.78)", border: "1px solid rgba(20,17,24,0.10)",
          boxShadow: "0 1px 2px rgba(20,17,24,0.04), 0 8px 22px rgba(40,24,90,0.07)",
          fontFamily: MONO, fontSize: size, color: INK, whiteSpace: "nowrap",
        }}
      >
        <motion.span
          initial={reduce ? false : { scale: 0, rotate: -40 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 520, damping: 18, delay: 1.1 + i * 0.16 }}
          style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center", width: size + 5, height: size + 5,
            borderRadius: 99, border: `1.5px solid ${c}`, color: c, fontSize: size - 2, fontWeight: 800, fontFamily: "inherit",
          }}
        >{GLYPH[e.mark]}</motion.span>
        <span style={e.mark === "bad" ? { textDecoration: `line-through ${RED} 1.5px` } : undefined}>{e.text}</span>
      </motion.span>
      </span>
    </motion.div>
  );
}

// ── 판정이 흘러가는 띠 ──────────────────────────────────────────────────────
// 기본은 천천히 흐르고, 스크롤 속도만큼 빨라지며 방향도 스크롤을 따라 바뀐다. 두 줄이 서로
// 반대로 흐른다 — 위는 크고 굵은 판정, 아래는 작은 근거.
function useVelocityX(baseVelocity) {
  const reduce = useReducedMotion();
  const baseX = useMotionValue(0);
  const { scrollY } = useScroll();
  const v = useVelocity(scrollY);
  const smooth = useSpring(v, { damping: 50, stiffness: 400 });
  const factor = useTransform(smooth, [0, 1000], [0, 4], { clamp: false });
  const skew = useTransform(smooth, [-2000, 0, 2000], [7, 0, -7]);
  const dir = useRef(1);
  useAnimationFrame((_, delta) => {
    if (reduce) return;
    let move = dir.current * baseVelocity * (delta / 1000);
    const f = factor.get();
    if (f < 0) dir.current = -1;
    else if (f > 0) dir.current = 1;
    move += dir.current * move * f;
    baseX.set(baseX.get() + move);
  });
  const x = useTransform(baseX, (val) => `${wrap(-25, -50, val)}%`);
  return { x, skew, reduce };
}

function MarqueeRow({ children, baseVelocity }) {
  const { x, skew, reduce } = useVelocityX(baseVelocity);
  return (
    <div style={{ overflow: "hidden", whiteSpace: "nowrap", display: "flex" }}>
      <motion.div style={{ display: "flex", flexWrap: "nowrap", x: reduce ? "-25%" : x, skewX: reduce ? 0 : skew }}>
        {[0, 1, 2, 3].map((k) => (
          <span key={k} style={{ display: "inline-flex", alignItems: "center", flex: "none" }}>{children}</span>
        ))}
      </motion.div>
    </div>
  );
}

const VERDICTS = [
  { t: "확인됨", s: "민법 제750조", m: "ok" },
  { t: "사실과 다름", s: "소멸시효 1년", m: "bad" },
  { t: "존재하지 않음", s: "2019다999999", m: "gone" },
  { t: "확인됨", s: "PubMed 원문 대조", m: "ok" },
  { t: "사실과 다름", s: "지어낸 통계", m: "bad" },
  { t: "확인됨", s: "시행일 기준 현행 조문", m: "ok" },
];

export function VerdictMarquee({ t = (s) => s }) {
  return (
    // 띠를 살짝 기울이면 모서리가 화면 밖으로 나가 가로 스크롤이 생긴다. 바깥 틀이 잘라 준다.
    <div aria-hidden style={{ overflow: "hidden", padding: "34px 0", margin: "clamp(28px, 6vw, 80px) 0 0" }}>
    <section style={{ width: "108%", marginLeft: "-4%", padding: "18px 0", display: "grid", gap: 10, transform: "rotate(-2deg)", borderBlock: "1px solid rgba(20,17,24,0.08)", background: "rgba(255,255,255,0.45)" }}>
      <MarqueeRow baseVelocity={-2.2}>
        {VERDICTS.map((v, i) => (
          <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 18, padding: "0 22px" }}>
            <span style={{
              fontSize: "clamp(30px, 5.2vw, 64px)", fontWeight: 850, letterSpacing: "-0.04em", lineHeight: 1.1,
              ...(i % 2
                ? { color: "transparent", WebkitTextStroke: `1.4px ${TONE[v.m]}` }
                : { color: TONE[v.m] }),
            }}>{t(v.t)}</span>
            <span style={{ width: 12, height: 12, borderRadius: 99, background: INK, opacity: 0.8 }} />
          </span>
        ))}
      </MarqueeRow>
      <MarqueeRow baseVelocity={1.6}>
        {VERDICTS.map((v, i) => (
          <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "0 16px", fontFamily: MONO, fontSize: 13, color: "#54505E" }}>
            <span style={{ color: TONE[v.m], fontWeight: 800 }}>{GLYPH[v.m]}</span>
            {t(v.s)}
            <span style={{ opacity: 0.35 }}>·</span>
          </span>
        ))}
      </MarqueeRow>
    </section>
    </div>
  );
}

// ── 먹칠이 벗겨지며 나오는 제목 ──────────────────────────────────────────────
// 기밀문서의 검은 가림 막대가 왼쪽에서 덮고, 오른쪽으로 빠지며 글을 드러낸다. 줄마다 조금씩 늦게.
// 예전 이름(WordReveal)과 쓰는 법을 그대로 둔다 — 부르는 쪽을 고치지 않아도 되게.
export function WordReveal({ lines, delay = 0, style, bar = INK }) {
  const reduce = useReducedMotion();
  if (reduce) return <>{lines.map((l, i) => <span key={i} style={{ display: "block", ...style }}>{l}</span>)}</>;
  return (
    <>
      {lines.map((line, i) => (
        <span key={i} style={{ display: "block" }}>
          <span style={{ position: "relative", display: "inline-block", overflow: "hidden", verticalAlign: "top", padding: "0 0.06em 0.08em" }}>
            <motion.span
              initial={{ opacity: 0 }} whileInView={{ opacity: [0, 0, 1] }} viewport={{ once: true, amount: 0.7 }}
              transition={{ duration: 0.9, times: [0, 0.45, 0.46], delay: delay + i * 0.14 }}
              style={{ display: "inline-block", ...style }}
            >{line}</motion.span>
            <motion.span aria-hidden
              initial={{ x: "-101%" }} whileInView={{ x: ["-101%", "0%", "0%", "101%"] }} viewport={{ once: true, amount: 0.7 }}
              transition={{ duration: 0.95, times: [0, 0.42, 0.5, 1], ease: [0.76, 0, 0.24, 1], delay: delay + i * 0.14 }}
              style={{ position: "absolute", inset: "4% 0 6%", background: bar, borderRadius: 3 }} />
          </span>
        </span>
      ))}
    </>
  );
}

// ── 공식 대조 인장 ─────────────────────────────────────────────────────────
export function SealRing({ size = 118, label = "법제처 공식 대조 · OFFICIAL SOURCE · 짐작이 아니라 확인 · " }) {
  const reduce = useReducedMotion();
  const { scrollY } = useScroll();
  const rotate = useTransform(scrollY, (v) => v * 0.12);
  const id = useRef(`seal-${Math.random().toString(36).slice(2, 8)}`).current;
  return (
    <motion.div aria-hidden
      initial={reduce ? false : { scale: 0.4, opacity: 0, rotate: -30 }}
      whileInView={{ scale: 1, opacity: 1, rotate: 0 }} viewport={{ once: true, amount: 0.6 }}
      transition={{ type: "spring", stiffness: 260, damping: 18 }}
      style={{ width: size, height: size, position: "relative" }}>
      <motion.svg viewBox="0 0 120 120" width={size} height={size} style={{ rotate: reduce ? 0 : rotate }}>
        <defs><path id={id} d="M60,60 m-44,0 a44,44 0 1,1 88,0 a44,44 0 1,1 -88,0" /></defs>
        <circle cx="60" cy="60" r="57" fill="rgba(255,255,255,0.92)" stroke={PURPLE} strokeWidth="1.5" />
        <circle cx="60" cy="60" r="33" fill="none" stroke={PURPLE} strokeWidth="1" strokeDasharray="2 3" />
        <text fill={PURPLE} style={{ fontSize: 9.4, fontWeight: 700, letterSpacing: "0.12em", fontFamily: "inherit" }}>
          <textPath href={`#${id}`}>{label}</textPath>
        </text>
      </motion.svg>
      <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: GREEN, fontSize: 28, fontWeight: 900 }}>✓</span>
    </motion.div>
  );
}

// ── 잉크로 차오르는 워드마크 ──────────────────────────────────────────────────
export function InkWordmark({ text = "YUME" }) {
  const reduce = useReducedMotion();
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end end"] });
  const fill = useTransform(scrollYProgress, [0.1, 0.95], [0, 100]);
  const bg = useMotionTemplate`linear-gradient(90deg, ${PURPLE} 0%, #8A6BD4 ${fill}%, transparent ${fill}%)`;
  const y = useTransform(scrollYProgress, [0, 1], [60, 0]);
  return (
    <div ref={ref} aria-hidden style={{ overflow: "hidden", lineHeight: 0.82, userSelect: "none", pointerEvents: "none" }}>
      <motion.div style={{
        y: reduce ? 0 : y,
        fontSize: "clamp(92px, 24vw, 300px)", fontWeight: 900, letterSpacing: "-0.06em", textAlign: "center",
        color: "transparent", WebkitTextStroke: "1.5px rgba(91,63,160,0.32)",
        backgroundImage: reduce ? `linear-gradient(90deg, ${PURPLE}, #8A6BD4)` : bg,
        WebkitBackgroundClip: "text", backgroundClip: "text",
      }}>{text}</motion.div>
    </div>
  );
}

// ── 돋보기 테두리(마우스일 때만) ─────────────────────────────────────────────
export function CursorLoupe() {
  const fine = useFinePointer();
  const reduce = useReducedMotion();
  const x = useMotionValue(-100);
  const y = useMotionValue(-100);
  const sx = useSpring(x, { stiffness: 520, damping: 38, mass: 0.5 });
  const sy = useSpring(y, { stiffness: 520, damping: 38, mass: 0.5 });
  const [over, setOver] = useState(false);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!fine || reduce) return undefined;
    const move = (e) => {
      x.set(e.clientX);
      y.set(e.clientY);
      setShown(true);
      const el = e.target instanceof Element ? e.target.closest("a, button, [role=button], input, textarea, select, label") : null;
      setOver(!!el);
    };
    const leave = () => setShown(false);
    window.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("pointerleave", leave);
    return () => {
      window.removeEventListener("pointermove", move);
      document.removeEventListener("pointerleave", leave);
    };
  }, [fine, reduce, x, y]);
  if (!fine || reduce) return null;
  return (
    <motion.div aria-hidden
      animate={{ scale: over ? 1.9 : 1, opacity: shown ? 1 : 0, backgroundColor: over ? "rgba(91,63,160,0.08)" : "rgba(91,63,160,0)" }}
      transition={{ type: "spring", stiffness: 400, damping: 28 }}
      style={{
        position: "fixed", left: 0, top: 0, x: sx, y: sy, translateX: "-50%", translateY: "-50%",
        width: 26, height: 26, borderRadius: 99, border: `1.5px solid ${PURPLE}`, pointerEvents: "none", zIndex: 90,
        mixBlendMode: "multiply",
      }} />
  );
}

