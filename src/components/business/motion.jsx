// 메인(기업용) 홈의 움직임 부품 — 2026-10-25 새 사이트.
// 원칙(바탕화면 veriline/brand/베리라인_톤앤매너): 의미 있는 움직임만. 모든 흐름은 히어로 컨베이어처럼 오른쪽 → 왼쪽.
// 움직임 줄이기 설정이면 고정 화면으로 보인다(useReducedMotion).
import { useEffect, useRef, useState } from "react";
import { motion, useMotionValueEvent, useReducedMotion, useScroll, useTransform } from "framer-motion";

const EASE = [0.2, 0.7, 0.2, 1];

/** 화면에 들어오면 아래에서 떠오른다. */
export function Reveal({ children, delay = 0, y = 24, as = "div", className, style }) {
  const reduce = useReducedMotion();
  const M = motion[as] || motion.div;
  if (reduce) return <M className={className} style={style}>{children}</M>;
  return (
    <M className={className} style={style} initial={{ opacity: 0, y }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "0px 0px -10% 0px" }} transition={{ duration: 0.8, ease: EASE, delay }}>
      {children}
    </M>
  );
}

/** 글자 단위로 차례로 나타나는 제목(한글은 어절 단위). */
export function SplitWords({ text, className, delay = 0, as = "h1", accent = [] }) {
  const reduce = useReducedMotion();
  const words = text.split(" ");
  const Tag = as;
  return (
    <Tag className={className} aria-label={text}>
      {words.map((w, i) => (
        <motion.span
          key={i}
          aria-hidden="true"
          style={{ display: "inline-block", whiteSpace: "pre", color: accent.includes(i) ? "var(--key-on-dark)" : undefined }}
          initial={reduce ? false : { opacity: 0, y: "0.4em", filter: "blur(6px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.7, ease: EASE, delay: delay + i * 0.07 }}
        >
          {w}{i < words.length - 1 ? " " : ""}
        </motion.span>
      ))}
    </Tag>
  );
}

/** 0부터 올라가는 숫자(보이는 순간 한 번). */
export function CountUp({ to, suffix = "", duration = 1100 }) {
  const ref = useRef(null);
  const reduce = useReducedMotion();
  const [n, setN] = useState(reduce ? to : 0);
  useEffect(() => {
    if (reduce || !ref.current || !("IntersectionObserver" in window)) { setN(to); return undefined; }
    let raf = 0;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      const t0 = performance.now();
      const step = (t) => {
        const p = Math.min(1, (t - t0) / duration);
        setN(Math.round(to * (1 - Math.pow(1 - p, 3))));
        if (p < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    }, { threshold: 0.4 });
    io.observe(ref.current);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, [to, duration, reduce]);
  return <span ref={ref}>{n.toLocaleString("ko-KR")}{suffix}</span>;
}

/** 검증선 — 화면에 들어오면 오른쪽에서 왼쪽으로 그어지는 가로선. */
export function LineRule({ dark = false }) {
  const reduce = useReducedMotion();
  return (
    <div className="vl-rule" aria-hidden="true">
      <motion.span
        style={{ background: dark ? "var(--key-on-dark)" : "var(--key)", transformOrigin: "right center" }}
        initial={reduce ? false : { scaleX: 0 }}
        whileInView={{ scaleX: 1 }}
        viewport={{ once: true, margin: "0px 0px -15% 0px" }}
        transition={{ duration: 1.1, ease: EASE }}
      />
    </div>
  );
}

/** 오른쪽 → 왼쪽으로 끝없이 흐르는 조문 띠. */
export function Marquee({ items }) {
  const doubled = [...items, ...items];
  return (
    <div className="vl-marquee" aria-hidden="true">
      <div className="vl-marquee-track">
        {doubled.map((t, i) => <span key={i}>§ {t}</span>)}
      </div>
    </div>
  );
}

/**
 * 세로로 스크롤하면 카드가 오른쪽에서 왼쪽으로 지나가는 고정 구간(히어로 컨베이어와 같은 방향).
 * 휴대폰 · 움직임 줄이기에서는 손가락으로 넘기는 가로 목록이 된다.
 */
export function HorizontalRail({ children, title }) {
  const outer = useRef(null);
  const track = useRef(null);
  const reduce = useReducedMotion();
  const [dist, setDist] = useState(0);
  const [wide, setWide] = useState(true);
  useEffect(() => {
    const measure = () => {
      setWide(window.innerWidth >= 900);
      if (track.current) setDist(Math.max(0, track.current.scrollWidth - window.innerWidth + 80));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  const { scrollYProgress } = useScroll({ target: outer, offset: ["start start", "end end"] });
  const x = useTransform(scrollYProgress, [0, 1], [0, -dist]);
  const pinned = wide && !reduce;
  if (!pinned) {
    return (
      <div className="vl-rail-static">
        {title}
        <div className="vl-rail-scroll" ref={track}>{children}</div>
      </div>
    );
  }
  return (
    <div ref={outer} style={{ height: `calc(100vh + ${dist}px)` }} className="vl-rail-outer">
      <div className="vl-rail-sticky">
        {title}
        <motion.div className="vl-rail-track" ref={track} style={{ x }}>{children}</motion.div>
      </div>
    </div>
  );
}

/**
 * 검증 과정 이야기 — 스크롤하면 AI 답변의 문장이 하나씩 원문과 대조되고(스캔선), 틀린 문장은 고쳐진다.
 * 왼쪽 단계 목록은 진행에 맞춰 켜진다. 휴대폰 · 움직임 줄이기에서는 결과가 다 보인 한 장면.
 */
export function VerifyStory({ steps, question, sentences }) {
  const outer = useRef(null);
  const reduce = useReducedMotion();
  const [wide, setWide] = useState(true);
  const [p, setP] = useState(reduce ? 1 : 0);
  useEffect(() => {
    const m = () => setWide(window.innerWidth >= 900);
    m();
    window.addEventListener("resize", m);
    return () => window.removeEventListener("resize", m);
  }, []);
  const pinned = wide && !reduce;
  const { scrollYProgress } = useScroll({ target: outer, offset: ["start start", "end end"] });
  useMotionValueEvent(scrollYProgress, "change", (v) => { if (pinned) setP(v); });
  const progress = pinned ? p : 1;
  const step = Math.min(steps.length - 1, Math.floor(progress * steps.length * 0.999));
  // 문장마다 검사 구간: 전체의 15% ~ 85%를 문장 수로 나눈다
  const stateOf = (i) => {
    const a = 0.15 + (i * 0.7) / sentences.length;
    const b = a + 0.7 / sentences.length;
    if (progress < a) return "wait";
    if (progress < b) return "check";
    return "done";
  };
  const scanTop = Math.min(100, Math.max(0, ((progress - 0.15) / 0.7) * 100));
  const panel = (
    <div className="vl-story-grid">
      <ol className="vl-story-steps">
        {steps.map(([k, v], i) => (
          <li key={k} className={i === step ? "on" : i < step ? "past" : ""}>
            <span className="n">{String(i + 1).padStart(2, "0")}</span>
            <div><b>{k}</b><p>{v}</p></div>
          </li>
        ))}
      </ol>
      <div className="vl-story-doc">
        <div className="vl-story-q"><span>질문</span>{question}</div>
        <div className="vl-story-a">
          <div className="vl-story-scan" style={{ top: `${scanTop}%`, opacity: pinned && progress > 0.12 && progress < 0.88 ? 1 : 0 }} aria-hidden="true" />
          <span className="who">AI 상담 답변</span>
          {sentences.map((s, i) => {
            const st = stateOf(i);
            return (
              <div key={i} className={`vl-sent ${st} ${s.ok ? "ok" : "bad"}`}>
                <p>
                  {st === "done" && !s.ok ? <><s>{s.text}</s> <span className="fix">{s.fix}</span></> : s.text}
                </p>
                <div className="meta">
                  {st === "wait" && <span className="wait">대기</span>}
                  {st === "check" && <span className="checking">원문 대조 중…</span>}
                  {st === "done" && <span className={s.ok ? "pass" : "fail"}>{s.ok ? "✓ 원문과 일치" : "✕ 사실과 다름 → 바로잡음"}</span>}
                  {st === "done" && <code>§ {s.law}</code>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
  if (!pinned) return <div className="vl-story-static">{panel}</div>;
  return (
    <div ref={outer} className="vl-story-outer">
      <div className="vl-story-sticky">{panel}</div>
    </div>
  );
}

/** 감사 보고서 미리보기 — 화면에 들어오면 비스듬히 누웠던 종이가 바로 선다. */
export function ReportPreview({ children }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className="vl-report"
      initial={reduce ? false : { opacity: 0, rotateX: 18, rotateZ: -3, y: 60 }}
      whileInView={{ opacity: 1, rotateX: 0, rotateZ: 0, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -12% 0px" }}
      transition={{ duration: 1.1, ease: EASE }}
      style={{ transformPerspective: 1200 }}
    >
      {children}
    </motion.div>
  );
}

/** 스크롤 진행에 맞춰 차오르는 세로 타임라인 선(제품 3단계). */
export function TimelineFill({ children }) {
  const outer = useRef(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: outer, offset: ["start 75%", "end 55%"] });
  const scaleY = useTransform(scrollYProgress, [0, 1], [0, 1]);
  return (
    <div ref={outer} className="vl-timeline">
      <div className="vl-timeline-line" aria-hidden="true"><motion.span style={{ scaleY: reduce ? 1 : scaleY }} /></div>
      {children}
    </div>
  );
}
