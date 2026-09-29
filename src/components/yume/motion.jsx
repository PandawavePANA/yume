// 유메의 움직임 — "문서를 검토하는 손"을 한 벌의 언어로 만든다.
//
// 흔한 등장 효과(아래에서 떠오르기, 블러 걷히기)는 어느 서비스에나 있다. 유메가 하는 일은
// 종이 위의 문장을 읽고, 밑줄을 긋고, 틀린 곳에 빨간 줄을 긋고, 맞는 곳에 형광펜을 칠하고,
// 마지막에 도장을 찍는 일이다. 움직임도 거기서만 가져온다.
//
//   · 바탕은 괘선지다. 스크롤하면 괘선이 읽는 속도만큼 기울고, 색은 이야기(문제 → 대조 → 확인)를 따라 바뀐다
//   · 위쪽 가는 선은 "지금까지 읽은 만큼"이다. 끝까지 읽으면 체크가 그려진다
//   · 대표 장면(FactCheckScene)은 스크롤이 곧 재생 막대다. 내리면 검토가 진행되고, 올리면 되감긴다
//   · 판정은 도장으로 찍힌다(InkStamp). 아이콘은 펜으로 그려진다(DrawnMark)
//
// 전부 transform·opacity·배경 위치만 움직인다(레이아웃을 다시 계산하지 않는다). 앱(WebView)과
// 저사양 폰에서도 60fps를 지키기 위해서다. "움직임 줄이기"를 켠 사람에게는 완성된 정지 화면을 보여준다.
import React, { useEffect, useRef, useState } from "react";
import {
  motion,
  useMotionTemplate,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  useVelocity,
  useMotionValue,
} from "framer-motion";

export const EASE = [0.22, 1, 0.36, 1];
const INK = "#141118";
const PURPLE = "#5B3FA0";
const RED = "#B8321F";
const GREEN = "#1F8A57";

/** 마우스처럼 정밀한 포인터가 있는 기기인지. 폰에서는 기울이기·자석 효과를 끈다(손가락은 떠 있지 않다). */
export function useFinePointer() {
  const [fine, setFine] = useState(() =>
    typeof window !== "undefined" && window.matchMedia?.("(hover: hover) and (pointer: fine)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia?.("(hover: hover) and (pointer: fine)");
    if (!mq) return undefined;
    const on = () => setFine(mq.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return fine;
}

// ── 바탕: 괘선지 ─────────────────────────────────────────────────────────
//
// 괘선은 스크롤의 0.35배로 흐르고(시차), 빨리 내리면 그 속도만큼 살짝 기운다 — 종이를 넘기는
// 손의 속도가 화면에 남는다. 물빛은 페이지 위치에 따라 보라(질문) → 주홍(문제 제기) → 보라(대조)
// → 초록(확인)으로 옮겨 간다. 색이 이야기의 어느 대목인지 말해 준다.
export function ScrollAtmosphere() {
  const reduce = useReducedMotion();
  const { scrollY, scrollYProgress } = useScroll();
  const lineY = useTransform(scrollY, (v) => -(v * 0.35) % 34);
  const velocity = useVelocity(scrollY);
  const skewRaw = useTransform(velocity, [-3000, 0, 3000], [2.2, 0, -2.2]);
  const skew = useSpring(skewRaw, { stiffness: 220, damping: 30, mass: 0.4 });
  const tint = useTransform(
    scrollYProgress,
    [0, 0.18, 0.34, 0.62, 0.86, 1],
    [
      "rgba(91,63,160,0.13)",
      "rgba(196,84,52,0.11)",
      "rgba(196,84,52,0.10)",
      "rgba(91,63,160,0.12)",
      "rgba(31,138,87,0.11)",
      "rgba(31,138,87,0.13)",
    ],
  );
  const glowX = useTransform(scrollYProgress, [0, 0.5, 1], ["50%", "18%", "78%"]);
  const glowY = useTransform(scrollYProgress, [0, 0.5, 1], ["-10%", "30%", "85%"]);
  const glow = useMotionTemplate`radial-gradient(ellipse 60% 55% at ${glowX} ${glowY}, ${tint}, transparent 72%)`;

  return (
    <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: -1, pointerEvents: "none", overflow: "hidden" }}>
      <motion.div style={{ position: "absolute", inset: 0, background: glow }} />
      {/* 괘선 — 34px 간격. 위아래로 넉넉히 두고 한 칸만큼만 굴려 끝없이 이어지게 한다. */}
      <motion.div
        style={{
          position: "absolute", inset: "-68px -40px",
          y: reduce ? 0 : lineY, skewY: reduce ? 0 : skew,
          backgroundImage: "repeating-linear-gradient(to bottom, transparent 0 33px, rgba(20,17,24,0.045) 33px 34px)",
          maskImage: "linear-gradient(to bottom, transparent, #000 18%, #000 82%, transparent)",
          WebkitMaskImage: "linear-gradient(to bottom, transparent, #000 18%, #000 82%, transparent)",
        }}
      />
      {/* 여백선 — 검토자가 메모를 적는 왼쪽 세로줄. 넓은 화면에서만. */}
      <div className="yume-margin-rule" style={{
        position: "absolute", top: 0, bottom: 0, left: "max(24px, calc(50% - 600px))", width: 1,
        background: "linear-gradient(to bottom, transparent, rgba(184,50,31,0.14) 20%, rgba(184,50,31,0.14) 80%, transparent)",
      }} />
    </div>
  );
}

// ── 읽은 만큼: 위쪽 레일 ─────────────────────────────────────────────────
export function ScrollRail({ top = 0 }) {
  const { scrollYProgress } = useScroll();
  const x = useSpring(scrollYProgress, { stiffness: 140, damping: 26, mass: 0.3 });
  const [done, setDone] = useState(false);
  useMotionValueEvent(scrollYProgress, "change", (v) => setDone(v > 0.985));
  return (
    <div aria-hidden style={{ position: "fixed", left: 0, right: 0, top, height: 2, zIndex: 46, pointerEvents: "none" }}>
      <motion.div style={{
        height: "100%", transformOrigin: "0 50%", scaleX: x,
        background: `linear-gradient(90deg, ${PURPLE}, #8A6BD4 60%, ${GREEN})`,
      }} />
      <motion.svg width="18" height="18" viewBox="0 0 18 18" initial={false}
        animate={done ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.6 }}
        transition={{ duration: 0.35, ease: EASE }}
        style={{ position: "absolute", right: 10, top: 6, background: "#fff", borderRadius: 99, boxShadow: "0 2px 8px rgba(20,17,24,0.12)" }}>
        <motion.path d="M4.5 9.4 7.6 12.3 13.6 5.8" fill="none" stroke={GREEN} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          initial={false} animate={{ pathLength: done ? 1 : 0 }} transition={{ duration: 0.45, ease: EASE, delay: 0.1 }} />
      </motion.svg>
    </div>
  );
}

// ── 펜으로 그리는 판정 표시 ───────────────────────────────────────────────
const MARK_PATHS = {
  confirmed: ["M7 13.4 11.2 17.4 19.4 8.8"],
  false: ["M8.5 8.5 17.5 17.5", "M17.5 8.5 8.5 17.5"],
  uncertain: ["M10 10.2c0-1.8 1.4-3 3.1-3 1.8 0 3.1 1.2 3.1 2.8 0 2.4-3.1 2.4-3.1 4.6", "M13.1 18.2v.1"],
};
const MARK_TONE = {
  confirmed: { fg: GREEN, bg: "#E4F4EA" },
  false: { fg: RED, bg: "#FBE7E2" },
  uncertain: { fg: "#9A4318", bg: "#FBEEE3" },
};
export function DrawnMark({ verdict, size = 26, delay = 0, play = true }) {
  const key = MARK_PATHS[verdict] ? verdict : "uncertain";
  const tone = MARK_TONE[key];
  return (
    <motion.svg width={size} height={size} viewBox="0 0 26 26" aria-hidden
      initial={{ scale: 0.6, opacity: 0 }} animate={play ? { scale: 1, opacity: 1 } : { scale: 0.6, opacity: 0 }}
      transition={{ type: "spring", stiffness: 420, damping: 22, delay }}
      style={{ flexShrink: 0, marginTop: 1, borderRadius: 999, background: tone.bg }}>
      <motion.circle cx="13" cy="13" r="11.5" fill="none" stroke={tone.fg} strokeOpacity="0.35" strokeWidth="1"
        initial={{ pathLength: 0 }} animate={{ pathLength: play ? 1 : 0 }} transition={{ duration: 0.5, ease: EASE, delay: delay + 0.05 }} />
      {MARK_PATHS[key].map((d, i) => (
        <motion.path key={i} d={d} fill="none" stroke={tone.fg} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
          initial={{ pathLength: 0 }} animate={{ pathLength: play ? 1 : 0 }}
          transition={{ duration: 0.38, ease: EASE, delay: delay + 0.18 + i * 0.14 }} />
      ))}
    </motion.svg>
  );
}

// ── 도장 ─────────────────────────────────────────────────────────────────
//
// 판정은 "표시"가 아니라 "날인"이다. 크게 들어와 종이에 눌리며 멈추고, 잉크가 한 번 번진다.
// 앱에서는 찍히는 순간 짧게 진동한다(안드로이드 WebView가 지원할 때만).
export function InkStamp({ children, color = RED, rotate = -6, delay = 0.15, style }) {
  const reduce = useReducedMotion();
  useEffect(() => {
    if (reduce) return undefined;
    const id = setTimeout(() => { try { navigator.vibrate?.(12); } catch { /* 지원하지 않으면 조용히 넘어간다 */ } }, (delay + 0.32) * 1000);
    return () => clearTimeout(id);
  }, [reduce, delay]);
  return (
    <span style={{ position: "relative", display: "inline-block", ...style }}>
      <motion.span
        initial={reduce ? false : { scale: 2.1, opacity: 0, rotate: rotate - 14, filter: "blur(3px)" }}
        animate={{ scale: 1, opacity: 1, rotate, filter: "blur(0px)" }}
        transition={{ type: "spring", stiffness: 520, damping: 26, mass: 0.9, delay }}
        style={{
          display: "inline-block", padding: "5px 13px", borderRadius: 8, fontWeight: 800, letterSpacing: "0.02em",
          color, border: `2.5px solid ${color}`, boxShadow: `inset 0 0 0 1.5px ${color}22`,
          background: "rgba(255,255,255,0.55)", mixBlendMode: "multiply",
        }}
      >{children}</motion.span>
      {/* 잉크 번짐 — 찍히는 순간 한 번 퍼지고 사라진다. */}
      {!reduce && (
        <motion.span aria-hidden
          initial={{ scale: 0.7, opacity: 0.45 }} animate={{ scale: 1.9, opacity: 0 }}
          transition={{ duration: 0.7, ease: "easeOut", delay: delay + 0.22 }}
          style={{ position: "absolute", inset: 0, borderRadius: 10, border: `2px solid ${color}`, pointerEvents: "none" }} />
      )}
    </span>
  );
}

// ── 형광펜 ───────────────────────────────────────────────────────────────
// 화면에 들어오면 왼쪽부터 칠해진다. 여러 줄이어도 한 번에 이어서 칠해진다(배경 한 장).
export function Marker({ children, color = "rgba(138,107,212,0.28)", delay = 0.2 }) {
  const reduce = useReducedMotion();
  return (
    <motion.span
      initial={reduce ? false : { backgroundSize: "0% 42%" }}
      whileInView={{ backgroundSize: "100% 42%" }}
      viewport={{ once: true, amount: 0.8 }}
      transition={{ duration: 0.9, ease: EASE, delay }}
      style={{
        backgroundImage: `linear-gradient(${color}, ${color})`, backgroundRepeat: "no-repeat",
        backgroundPosition: "0 88%", backgroundSize: "100% 42%", padding: "0 0.06em",
      }}
    >{children}</motion.span>
  );
}

// ── 기울이는 카드(마우스일 때만) ───────────────────────────────────────────
export function TiltCard({ children, style, max = 7 }) {
  const fine = useFinePointer();
  const reduce = useReducedMotion();
  const rx = useMotionValue(0);
  const ry = useMotionValue(0);
  const gx = useMotionValue(50);
  const gy = useMotionValue(50);
  const srx = useSpring(rx, { stiffness: 260, damping: 22 });
  const sry = useSpring(ry, { stiffness: 260, damping: 22 });
  const sheen = useMotionTemplate`radial-gradient(420px circle at ${gx}% ${gy}%, rgba(255,255,255,0.55), transparent 45%)`;
  const on = fine && !reduce;
  const move = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    ry.set((px - 0.5) * max * 2);
    rx.set(-(py - 0.5) * max * 2);
    gx.set(px * 100);
    gy.set(py * 100);
  };
  const leave = () => { rx.set(0); ry.set(0); };
  return (
    <div style={{ perspective: 900, height: "100%" }}>
      <motion.div onPointerMove={on ? move : undefined} onPointerLeave={on ? leave : undefined}
        style={{ ...style, rotateX: on ? srx : 0, rotateY: on ? sry : 0, transformStyle: "preserve-3d", position: "relative" }}>
        {children}
        {on && <motion.div aria-hidden style={{ position: "absolute", inset: 0, borderRadius: "inherit", background: sheen, pointerEvents: "none", mixBlendMode: "soft-light" }} />}
      </motion.div>
    </div>
  );
}

// ── 자석 버튼(마우스일 때만) ───────────────────────────────────────────────
export function Magnetic({ children, strength = 0.28 }) {
  const fine = useFinePointer();
  const reduce = useReducedMotion();
  const x = useSpring(0, { stiffness: 300, damping: 18, mass: 0.5 });
  const y = useSpring(0, { stiffness: 300, damping: 18, mass: 0.5 });
  if (!fine || reduce) return children;
  return (
    <motion.span style={{ display: "inline-block", x, y }}
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        x.set((e.clientX - (r.left + r.width / 2)) * strength);
        y.set((e.clientY - (r.top + r.height / 2)) * strength);
      }}
      onPointerLeave={() => { x.set(0); y.set(0); }}>
      {children}
    </motion.span>
  );
}

// ── 검토 중: 문서를 훑는 빛 ────────────────────────────────────────────────
// 기다리는 동안 보는 것. 괘선 위에 문장 자리가 깔리고, 빛줄기가 위아래로 훑으며 지나간 줄을
// 잠깐 밝힌다. 주장이 하나 찾아질 때마다(found) 여백에 표시가 하나씩 붙는다.
export function DocumentScan({ found = 0, width = 320 }) {
  const reduce = useReducedMotion();
  const rows = [0.92, 0.78, 0.86, 0.6, 0.9, 0.7];
  return (
    <div aria-hidden style={{
      position: "relative", width, maxWidth: "82vw", padding: "16px 18px 16px 30px", borderRadius: 14,
      background: "#fff", border: "1px solid rgba(20,17,24,0.10)", overflow: "hidden",
      boxShadow: "0 1px 2px rgba(20,17,24,0.05), 0 12px 30px rgba(91,63,160,0.08)",
    }}>
      <div style={{ position: "absolute", top: 0, bottom: 0, left: 18, width: 1, background: "rgba(184,50,31,0.25)" }} />
      {rows.map((w, i) => (
        <div key={i} style={{ position: "relative", height: 8, margin: i ? "11px 0 0" : 0, width: `${w * 100}%`, borderRadius: 4, background: "rgba(20,17,24,0.07)" }}>
          <motion.span
            initial={{ scale: 0, opacity: 0 }}
            animate={i < found ? { scale: 1, opacity: 1 } : { scale: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 500, damping: 20 }}
            style={{ position: "absolute", left: -19, top: -1, width: 10, height: 10, borderRadius: 99, background: PURPLE }} />
        </div>
      ))}
      {!reduce && (
        <motion.div
          initial={{ top: "-30%" }} animate={{ top: ["-30%", "105%"] }}
          transition={{ duration: 1.8, ease: "easeInOut", repeat: Infinity, repeatType: "mirror" }}
          style={{
            position: "absolute", left: 0, right: 0, height: 44, pointerEvents: "none",
            background: "linear-gradient(to bottom, transparent, rgba(138,107,212,0.20) 45%, rgba(138,107,212,0.55) 50%, rgba(138,107,212,0.20) 55%, transparent)",
          }} />
      )}
    </div>
  );
}

// ── 대표 장면: 스크롤로 재생하는 팩트체크 ─────────────────────────────────────
//
// 이 섹션은 화면에 붙어 있고(sticky), 그 사이 스크롤한 거리가 곧 재생 위치다. 내리면 검토가
// 진행되고 올리면 되감긴다 — 설명을 읽는 대신 유메가 일하는 걸 손으로 돌려 본다.
//
// 예시 답변은 실제 판정 방식을 그대로 재현한다. 맞는 조문(민법 제750조)은 초록 형광펜, 틀린
// 기한은 빨간 줄과 고친 내용(민법 제766조), 실재하지 않는 사건번호는 글자가 흩어진다.
const SCENE_BEATS = [
  { at: 0.0, label: "찾기", desc: "답변에서 사실 주장을 하나씩 골라냅니다" },
  { at: 0.34, label: "대조", desc: "법제처 조문과 법원 기록에 직접 맞춰 봅니다" },
  { at: 0.8, label: "판정", desc: "근거와 함께 결론을 찍습니다" },
];

function Claim({ p, range, kind, children, t }) {
  const [a, b] = range;
  const w = useTransform(p, [a, b], [0, 100]);
  // 찾기 단계에서 주장마다 차례로 보라 밑줄이 그어진다(첫째 → 둘째 → 셋째).
  const lag = kind === "ok" ? 0 : kind === "bad" ? 0.05 : 0.1;
  const detect = useTransform(p, [0.1 + lag, 0.2 + lag], [0, 100]);
  // 세 모양을 늘 만들어 두고 하나를 고른다(훅은 매번 같은 순서로 불려야 한다).
  const okLayers = useMotionTemplate`linear-gradient(rgba(31,138,87,0.20), rgba(31,138,87,0.20)) 0 88% / ${w}% 46% no-repeat, linear-gradient(${PURPLE}, ${PURPLE}) 0 100% / ${detect}% 1.5px no-repeat`;
  const badLayers = useMotionTemplate`linear-gradient(${RED}, ${RED}) 0 58% / ${w}% 2px no-repeat, linear-gradient(${PURPLE}, ${PURPLE}) 0 100% / ${detect}% 1.5px no-repeat`;
  const plainLayers = useMotionTemplate`linear-gradient(${PURPLE}, ${PURPLE}) 0 100% / ${detect}% 1.5px no-repeat`;
  const layers = kind === "ok" ? okLayers : kind === "bad" ? badLayers : plainLayers;
  const color = useTransform(p, [a, b], [INK, kind === "bad" ? "rgba(20,17,24,0.45)" : INK]);
  const blur = useTransform(p, [a, b], [0, kind === "gone" ? 2.2 : 0]);
  const spacing = useTransform(p, [a, b], [0, kind === "gone" ? 0.14 : 0]);
  const opacity = useTransform(p, [a, b], [1, kind === "gone" ? 0.38 : 1]);
  const filter = useMotionTemplate`blur(${blur}px)`;
  const letterSpacing = useMotionTemplate`${spacing}em`;
  return (
    <motion.span style={{ background: layers, color, filter, letterSpacing, opacity, paddingBottom: 2 }}>
      {t(children)}
    </motion.span>
  );
}

function Note({ p, range, tone, children, t }) {
  const [a, b] = range;
  const opacity = useTransform(p, [a, b], [0, 1]);
  const y = useTransform(p, [a, b], [10, 0]);
  const c = tone === "ok" ? GREEN : tone === "bad" ? RED : "#9A4318";
  return (
    <motion.div style={{ opacity, y, display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13, lineHeight: 1.55, color: c, fontWeight: 600 }}>
      <span aria-hidden style={{ flexShrink: 0, width: 16, height: 16, marginTop: 2, borderRadius: 99, border: `1.5px solid ${c}`, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10 }}>
        {tone === "ok" ? "✓" : tone === "bad" ? "✕" : "?"}
      </span>
      <span>{t(children)}</span>
    </motion.div>
  );
}

export function FactCheckScene({ t = (s) => s, compact = false }) {
  const reduce = useReducedMotion();
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  // 손으로 돌리는 느낌이 나도록 아주 살짝만 늦게 따라온다.
  const p = useSpring(scrollYProgress, { stiffness: 180, damping: 32, mass: 0.35 });
  const still = useMotionValue(1);
  const pp = reduce ? still : p;

  const beamTop = useTransform(pp, [0.08, 0.32], ["-12%", "104%"]);
  const beamOpacity = useTransform(pp, [0.06, 0.1, 0.3, 0.34], [0, 1, 1, 0]);
  const cardY = useTransform(pp, [0, 0.1], [40, 0]);
  const cardOpacity = useTransform(pp, [0, 0.06], [0, 1]);
  // 답변이 왼쪽부터 쓰여 나온다(잘라 두었던 오른쪽을 걷어 낸다).
  const hiddenRight = useTransform(pp, [0.0, 0.08], [100, 0]);
  const clip = useMotionTemplate`inset(0 ${hiddenRight}% 0 0)`;
  const stampScale = useTransform(pp, [0.8, 0.87], [2.3, 1]);
  const stampOpacity = useTransform(pp, [0.8, 0.84], [0, 1]);
  const stampRotate = useTransform(pp, [0.8, 0.87], [-24, -8]);
  const ringScale = useTransform(pp, [0.86, 0.95], [0.8, 1.9]);
  const ringOpacity = useTransform(pp, [0.86, 0.87, 0.95], [0, 0.5, 0]);
  const warm = useTransform(pp, [0.84, 0.95], ["rgba(184,50,31,0)", "rgba(184,50,31,0.06)"]);
  const found = useTransform(pp, (v) => (v < 0.14 ? 0 : v < 0.19 ? 1 : v < 0.24 ? 2 : 3));
  const [foundN, setFoundN] = useState(reduce ? 3 : 0);
  useMotionValueEvent(found, "change", (v) => setFoundN(v));
  const [beat, setBeat] = useState(reduce ? 2 : 0);
  useMotionValueEvent(pp, "change", (v) => setBeat(v >= 0.8 ? 2 : v >= 0.34 ? 1 : 0));

  const scene = (
    <div style={{
      display: "grid", gridTemplateColumns: compact ? "1fr" : "repeat(auto-fit, minmax(min(100%, 300px), 1fr))",
      gap: compact ? 18 : "clamp(20px, 5vw, 64px)", alignItems: "center", width: "min(1040px, 100%)", margin: "0 auto",
      padding: "0 clamp(16px, 4vw, 24px)", boxSizing: "border-box",
    }}>
      {/* 왼쪽: 지금 어느 단계인지 */}
      <div style={{ display: "grid", gap: compact ? 10 : 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.12em", color: "#7D5FC4" }}>{t("스크롤로 돌려 보는 검증")}</div>
        <h2 style={{ fontSize: compact ? "clamp(24px, 6.4vw, 30px)" : "clamp(28px, 3.6vw, 42px)", fontWeight: 750, letterSpacing: "-0.035em", lineHeight: 1.18, margin: 0, color: INK, textWrap: "balance" }}>
          {t("그럴듯한 답변 한 단락,")}<br />{t("유메가 읽으면 이렇게 됩니다.")}
        </h2>
        <ol style={{ listStyle: "none", margin: compact ? "4px 0 0" : "10px 0 0", padding: 0, display: "grid", gap: compact ? 6 : 10 }}>
          {SCENE_BEATS.map((b, i) => (
            <li key={b.label} style={{ display: "flex", gap: 12, alignItems: "baseline" }}>
              <motion.span animate={{ color: beat >= i ? PURPLE : "rgba(20,17,24,0.28)", scale: beat === i ? 1.08 : 1 }} transition={{ duration: 0.3, ease: EASE }}
                style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 13, fontWeight: 700, minWidth: 22, display: "inline-block" }}>
                {String(i + 1).padStart(2, "0")}
              </motion.span>
              <motion.span animate={{ opacity: beat >= i ? 1 : 0.4 }} transition={{ duration: 0.3 }} style={{ fontSize: compact ? 14 : 15.5, color: INK, lineHeight: 1.5 }}>
                <b style={{ fontWeight: 700 }}>{t(b.label)}</b> <span style={{ color: "#54505E" }}>{t(b.desc)}</span>
              </motion.span>
            </li>
          ))}
        </ol>
      </div>

      {/* 오른쪽: 검토받는 답변 */}
      <motion.div style={{ y: cardY, opacity: cardOpacity, position: "relative" }}>
        <motion.div style={{
          position: "relative", background: "#fff", borderRadius: 18, overflow: "hidden",
          border: "1px solid rgba(20,17,24,0.10)", boxShadow: "0 1px 2px rgba(20,17,24,0.05), 0 24px 60px rgba(40,24,90,0.10)",
          padding: compact ? "18px 18px 40px 30px" : "24px 26px 26px 40px",
        }}>
          <motion.div aria-hidden style={{ position: "absolute", inset: 0, background: warm, pointerEvents: "none" }} />
          {/* 괘선 + 여백선 — 검토 용지 */}
          <div aria-hidden style={{
            position: "absolute", inset: 0, pointerEvents: "none",
            backgroundImage: "repeating-linear-gradient(to bottom, transparent 0 29px, rgba(20,17,24,0.05) 29px 30px)",
          }} />
          <div aria-hidden style={{ position: "absolute", top: 0, bottom: 0, left: compact ? 18 : 24, width: 1, background: "rgba(184,50,31,0.28)" }} />

          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, position: "relative" }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: "#fff", background: INK, borderRadius: 6, padding: "2px 8px" }}>AI</span>
            <span style={{ fontSize: 12.5, color: "#8B8694" }}>{t("예시 답변")}</span>
            <span style={{ marginLeft: "auto", fontFamily: "ui-monospace, Menlo, monospace", fontSize: 12, color: PURPLE }}>
              {t("주장 {n}개", { n: foundN })}
            </span>
          </div>

          <motion.p style={{ clipPath: clip, margin: 0, fontSize: compact ? 15 : 16.5, lineHeight: 1.85, color: INK, position: "relative" }}>
            {t("교통사고 손해배상은 ")}
            <Claim p={pp} range={[0.36, 0.46]} kind="ok" t={t}>민법 제750조 불법행위 책임에 근거합니다</Claim>
            {t(". 다만 ")}
            <Claim p={pp} range={[0.48, 0.6]} kind="bad" t={t}>사고가 난 날부터 1년이 지나면 청구할 수 없습니다</Claim>
            {t(". 실제로 ")}
            <Claim p={pp} range={[0.62, 0.76]} kind="gone" t={t}>대법원 2019다999999 판결</Claim>
            {t("도 같은 취지로 판단했습니다.")}
          </motion.p>

          <div style={{ display: "grid", gap: 8, marginTop: 16, position: "relative" }}>
            <Note p={pp} range={[0.42, 0.48]} tone="ok" t={t}>법제처 조문과 일치 · 민법 제750조</Note>
            <Note p={pp} range={[0.56, 0.62]} tone="bad" t={t}>기한이 틀렸습니다 — 손해와 가해자를 안 날부터 3년, 사고일부터 10년 (민법 제766조)</Note>
            <Note p={pp} range={[0.72, 0.78]} tone="gone" t={t}>법원 기록에서 찾을 수 없는 사건번호입니다</Note>
          </div>

          {/* 훑는 빛 */}
          <motion.div aria-hidden style={{
            position: "absolute", left: 0, right: 0, height: 64, top: beamTop, opacity: beamOpacity, pointerEvents: "none",
            background: "linear-gradient(to bottom, transparent, rgba(138,107,212,0.16) 40%, rgba(138,107,212,0.5) 50%, rgba(138,107,212,0.16) 60%, transparent)",
          }} />
        </motion.div>

        {/* 도장 */}
        <div style={{ position: "absolute", right: compact ? 10 : 4, bottom: compact ? -22 : -26, pointerEvents: "none" }}>
          <motion.div aria-hidden style={{
            position: "absolute", inset: -6, borderRadius: 12, border: `2px solid ${RED}`, scale: ringScale, opacity: ringOpacity,
          }} />
          <motion.div style={{
            scale: stampScale, opacity: stampOpacity, rotate: stampRotate,
            padding: "8px 16px", borderRadius: 10, border: `3px solid ${RED}`, color: RED, background: "rgba(255,255,255,0.86)",
            fontWeight: 850, fontSize: compact ? 17 : 20, letterSpacing: "0.04em", boxShadow: `inset 0 0 0 2px ${RED}22`,
            mixBlendMode: "multiply", whiteSpace: "nowrap",
          }}>
            {t("대부분 부정확")}
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.12em", textAlign: "center", marginTop: 1 }}>{t("3개 중 1개 확인")}</div>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );

  if (reduce) return <section style={{ padding: "80px 0" }}>{scene}</section>;
  return (
    <section ref={ref} style={{ position: "relative", height: compact ? "260vh" : "340vh" }}>
      <div style={{ position: "sticky", top: 0, height: "100vh", display: "flex", alignItems: "center", overflow: "hidden" }}>
        {scene}
      </div>
    </section>
  );
}

// ── 스크롤에 맞춰 갈라지는 히어로 ─────────────────────────────────────────
// 첫 줄은 왼쪽으로, 둘째 줄은 오른쪽으로 비켜나며 옅어진다. 질문(첫 줄)과 확인(둘째 줄)이
// 서로 다른 일이라는 걸 움직임이 말한다.
export function useHeroSplit(scrollY) {
  const x1 = useTransform(scrollY, [0, 480], [0, -60]);
  const x2 = useTransform(scrollY, [0, 480], [0, 60]);
  return { x1, x2 };
}

// ── 스크롤로 긋는 연결선(세 단계 카드) ─────────────────────────────────────
export function ScrollLine({ progress, vertical = false, color = PURPLE }) {
  const scale = useTransform(progress, [0.05, 0.85], [0, 1]);
  return (
    <div aria-hidden style={{
      position: "absolute", pointerEvents: "none",
      ...(vertical ? { left: 22, top: 30, bottom: 30, width: 2 } : { left: "8%", right: "8%", top: 44, height: 2 }),
      background: "rgba(20,17,24,0.06)", borderRadius: 2,
    }}>
      <motion.div style={{
        position: "absolute", inset: 0, borderRadius: 2, background: `linear-gradient(${vertical ? "180deg" : "90deg"}, ${color}, #8A6BD4)`,
        transformOrigin: vertical ? "50% 0" : "0 50%", ...(vertical ? { scaleY: scale } : { scaleX: scale }),
      }} />
    </div>
  );
}

// ── 숫자가 굴러 올라가는 카운터(주장 수 · 확인 수) ─────────────────────────
export function RollingNumber({ value, style }) {
  const reduce = useReducedMotion();
  const mv = useSpring(reduce ? value : 0, { stiffness: 120, damping: 20 });
  const [shown, setShown] = useState(reduce ? value : 0);
  useEffect(() => { mv.set(value); }, [value, mv]);
  useMotionValueEvent(mv, "change", (v) => setShown(Math.round(v)));
  return <span style={{ fontVariantNumeric: "tabular-nums", ...style }}>{shown}</span>;
}


