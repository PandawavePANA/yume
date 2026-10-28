// 메인(기업용) 홈의 움직임 부품 — 2026-10-25 새 사이트.
// 원칙(바탕화면 veriline/brand/베리라인_톤앤매너): 의미 있는 움직임만. 모든 흐름은 히어로 컨베이어처럼 오른쪽 → 왼쪽.
// 움직임 줄이기 설정이면 고정 화면으로 보인다(useReducedMotion).
import { useEffect, useRef, useState } from "react";
import { motion, useInView, useMotionValueEvent, useReducedMotion, useScroll, useTransform } from "framer-motion";

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
export function SplitWords({ text, className, delay = 0, as = "h1", accent = [], accentClass = "" }) {
  const reduce = useReducedMotion();
  const words = text.split(" ");
  const Tag = as;
  return (
    <Tag className={className} aria-label={text.replace(/\s*\n\s*/g, " ")}>
      {/* "\n" 낱말은 줄바꿈 자리 — 휴대폰에서 제목이 엉뚱한 곳에서 끊기지 않게 */}
      {words.map((w, i) => w === "\n" ? <br key={i} /> : (
        <motion.span
          key={i}
          aria-hidden="true"
          className={accent.includes(i) && accentClass ? accentClass : undefined}
          style={{ display: "inline-block", whiteSpace: "pre", color: accent.includes(i) && !accentClass ? "var(--key-on-dark)" : undefined }}
          initial={reduce ? false : { opacity: 0, y: "0.4em", filter: "blur(6px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.7, ease: EASE, delay: delay + i * 0.07 }}
        >
          {w}{i < words.length - 1 && words[i + 1] !== "\n" ? " " : ""}
        </motion.span>
      ))}
    </Tag>
  );
}

/**
 * 어절 가림막 등장 — 화면에 들어오면 어절마다 보이지 않는 선 아래에서 차례로 올라온다(2026-10-28).
 * 예전 글자 해독(무작위 글자가 돌다 맞춰지는 효과)은 대표가 "별로"라 바꿨다. 글자 모양이 처음부터 끝까지 그대로라 읽기 편하다.
 */
export function MaskWords({ text, as = "span", className }) {
  const ref = useRef(null);
  const reduce = useReducedMotion();
  // 감싼 Reveal(whileInView)과 겹치면 안쪽 whileInView가 신호를 못 받는 경우가 있어, 보이는지는 직접 잰다.
  const inView = useInView(ref, { once: true, margin: "0px 0px -12% 0px" });
  const Tag = as;
  if (reduce) return <Tag className={className}>{text}</Tag>;
  const words = String(text).split(" ");
  return (
    <Tag ref={ref} className={className} aria-label={text}>
      {words.map((w, i) => (
        <span key={i}>
          <span className="vl-mw" aria-hidden="true">
            <motion.span style={{ display: "inline-block" }} initial={{ y: "108%" }} animate={inView ? { y: "0%" } : { y: "108%" }} transition={{ duration: 0.75, ease: EASE, delay: i * 0.055 }}>{w}</motion.span>
          </span>
          {i < words.length - 1 ? " " : ""}
        </span>
      ))}
    </Tag>
  );
}

/**
 * 화면 높이를 처음 연 값으로 고정한다(--vhx = innerHeight의 1%, px).
 * 인스타그램 · 카카오톡 같은 앱 안 브라우저는 스크롤할 때 도구 막대가 숨었다 나타나며 화면 높이 자체가 바뀐다.
 * 고정 구간(히어로 · 가로 레일 · 작동 방식 340%)이 svh로 잡혀 있으면 그때마다 위쪽 길이가 수백 px씩 바뀌어
 * 보던 화면이 위로 튕겼다(2026-10-28 대표 휴대폰 영상). 높이 변화는 무시하고, 폭이 바뀔 때(회전)만 다시 잰다.
 */
export function useStableVh() {
  useEffect(() => {
    let w = window.innerWidth;
    const set = () => document.documentElement.style.setProperty("--vhx", `${window.innerHeight / 100}px`);
    set();
    const on = () => {
      if (Math.abs(window.innerWidth - w) < 2) return;
      w = window.innerWidth;
      set();
    };
    window.addEventListener("resize", on);
    window.addEventListener("orientationchange", on);
    return () => { window.removeEventListener("resize", on); window.removeEventListener("orientationchange", on); };
  }, []);
}

/**
 * 0부터 올라가는 숫자(보이는 순간 한 번).
 * 처음 그리는 값은 실제 숫자다 — 링크 미리보기 · 검색 로봇 · 스크립트가 늦은 화면에서 "0개"로 보이던 문제(2026-10-28 외부 점검).
 * 화면 밖(아래 300px)에서 미리 0으로 돌려 두고, 실제로 보일 때 올린다. 사람 눈에는 0→숫자 연출만 보인다.
 */
export function CountUp({ to, suffix = "", duration = 1100 }) {
  const ref = useRef(null);
  const reduce = useReducedMotion();
  const [n, setN] = useState(to);
  useEffect(() => {
    const el = ref.current;
    if (reduce || !el || !("IntersectionObserver" in window)) return undefined;
    // 이미 화면 안에 있으면 숫자 그대로 둔다(되감으면 보이는 숫자가 0으로 튄다).
    const r = el.getBoundingClientRect();
    if (r.top < window.innerHeight && r.bottom > 0) return undefined;
    let raf = 0;
    const arm = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      arm.disconnect();
      setN(0);
    }, { rootMargin: "0px 0px 300px 0px" });
    const play = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      play.disconnect();
      const t0 = performance.now();
      const step = (t) => {
        const p = Math.min(1, (t - t0) / duration);
        setN(Math.round(to * (1 - Math.pow(1 - p, 3))));
        if (p < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    }, { threshold: 0.4 });
    arm.observe(el);
    play.observe(el);
    return () => { arm.disconnect(); play.disconnect(); cancelAnimationFrame(raf); };
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
  // 2026-10-27 대표 "스크롤하면 옆으로 넘어가고, 끝나면 다시 아래로 — 다 봐야 한다": 휴대폰에서도 고정해서 가로로 넘긴다.
  // 카드 너비가 글꼴 · 화면 회전에 따라 바뀌므로 트랙 크기가 바뀔 때마다 다시 잰다.
  useEffect(() => {
    const measure = () => {
      if (!track.current) return;
      const tail = window.innerWidth < 900 ? 24 : 80;
      setDist(Math.max(0, track.current.scrollWidth - window.innerWidth + tail));
    };
    measure();
    window.addEventListener("resize", measure);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    if (ro && track.current) ro.observe(track.current);
    return () => { window.removeEventListener("resize", measure); ro?.disconnect(); };
  }, []);
  const { scrollYProgress } = useScroll({ target: outer, offset: ["start start", "end end"] });
  const x = useTransform(scrollYProgress, [0, 1], [0, -dist]);
  if (reduce) {
    return (
      <div className="vl-rail-static">
        {title}
        <div className="vl-rail-scroll" ref={track}>{children}</div>
      </div>
    );
  }
  return (
    <div ref={outer} style={{ height: `calc(var(--vhx, 1svh) * 100 + ${dist}px)` }} className="vl-rail-outer" data-pin="">
      <div className="vl-rail-sticky">
        {title}
        <motion.div className="vl-rail-track" ref={track} style={{ x }}>{children}</motion.div>
        <div className="vl-rail-meter" aria-hidden="true"><motion.i style={{ scaleX: scrollYProgress }} /></div>
      </div>
    </div>
  );
}

/**
 * 검증 과정 이야기 — 스크롤하면 AI 답변의 문장이 하나씩 원문과 대조되고(스캔선 · 대조 막대), 틀린 문장은 줄이 그어진 뒤 고쳐진다.
 * 끝나면 판정 영수증 지문이 찍힌다. 2026-10-27 대표 "휴대폰에서 스크롤해도 아무 일도 없다": 휴대폰에서도 고정해서 움직인다.
 * 휴대폰에서는 단계 목록 대신 위쪽 단계 막대 하나, 기다리는 문장 · 맞은 문장은 한 줄로 접어 한 화면에 들어오게 한다.
 * 움직임 줄이기 설정에서만 결과가 다 보인 한 장면.
 */
const RECEIPT = "sha256:9f2c41d8b07a3e55c1e0";
function StoryPanel({ steps, question, sentences, progress, reduce, gridRef, style }) {
  const step = Math.min(steps.length - 1, Math.floor(progress * steps.length * 0.999));
  // 문장마다 검사 구간: 전체의 15% ~ 85%를 문장 수로 나눈다
  const seg = 0.7 / sentences.length;
  const local = (i) => Math.min(1, Math.max(0, (progress - (0.15 + i * seg)) / seg));
  const stateOf = (i) => {
    const a = 0.15 + i * seg;
    if (progress < a) return "wait";
    if (progress < a + seg) return "check";
    return "done";
  };
  const states = sentences.map((_, i) => stateOf(i));
  const checked = states.filter((st) => st === "done").length;
  const fixed = sentences.filter((s, i) => !s.ok && states[i] === "done").length;
  const sealT = Math.min(1, Math.max(0, (progress - 0.86) / 0.1));
  const scanTop = Math.min(100, Math.max(0, ((progress - 0.15) / 0.7) * 100));
  return (
    <div className="vl-story-grid" ref={gridRef} style={style}>
      <ol className="vl-story-steps">
        {steps.map(([k, v], i) => (
          <li key={k} className={i === step ? "on" : i < step ? "past" : ""}>
            <span className="n">{String(i + 1).padStart(2, "0")}</span>
            <div><b>{k}</b><p>{v}</p></div>
          </li>
        ))}
      </ol>
      <div className="vl-story-mstep" aria-hidden="true">
        <div className="bars">{steps.map(([k], i) => <i key={k} className={i < step ? "past" : i === step ? "on" : ""} />)}</div>
        <div className="cur" key={step}><span className="n">{String(step + 1).padStart(2, "0")} / {String(steps.length).padStart(2, "0")}</span><b>{steps[step][0]}</b><p>{steps[step][1]}</p></div>
      </div>
      <div className="vl-story-doc">
        <div className="vl-story-hud">
          <span className={`live${progress > 0.12 && sealT < 1 ? " on" : ""}`}><i />{sealT >= 1 ? "검증 완료" : progress > 0.12 ? "검증 중" : "대기"}</span>
          <span className="cnt">검사 <b>{checked}</b>/{sentences.length} · 고침 <b>{fixed}</b></span>
          <span className="meter"><i style={{ transform: `scaleX(${Math.min(1, Math.max(0, (progress - 0.15) / 0.7))})` }} /></span>
        </div>
        <div className="vl-story-q"><span>질문</span>{question}</div>
        <div className="vl-story-a">
          <div className="vl-story-scan" style={{ top: `${scanTop}%`, opacity: !reduce && progress > 0.12 && progress < 0.88 ? 1 : 0 }} aria-hidden="true" />
          <span className="who">AI 상담 답변</span>
          {sentences.map((s, i) => {
            const st = states[i];
            return (
              <div key={i} className={`vl-sent ${st} ${s.ok ? "ok" : "bad"}`}>
                <p>
                  {st === "done" && !s.ok ? <><s>{s.text}</s> <span className="fix">{s.fix}</span></> : s.text}
                </p>
                <div className="meta">
                  {st === "wait" && <span className="wait">대기</span>}
                  {st === "check" && <><span className="checking">원문 대조 중 · {s.law}</span><span className="bar"><i style={{ transform: `scaleX(${local(i)})` }} /></span></>}
                  {st === "done" && <span className={`stamp ${s.ok ? "pass" : "fail"}`}>{s.ok ? "✓ 원문과 일치" : "✕ 사실과 다름 → 바로잡음"}</span>}
                  {st === "done" && <code>§ {s.law}</code>}
                </div>
              </div>
            );
          })}
        </div>
        <div className={`vl-story-receipt${sealT > 0 ? " on" : ""}`}>
          <span>판정 영수증</span>
          <code>{sealT > 0 ? RECEIPT.slice(0, Math.max(7, Math.round(sealT * RECEIPT.length))) : "—"}{sealT > 0 && sealT < 1 ? "▍" : ""}</code>
          {sealT >= 1 && <em>모델 없이 재현 가능</em>}
        </div>
      </div>
    </div>
  );
}

export function VerifyStory({ steps, question, sentences }) {
  const outer = useRef(null);
  const sticky = useRef(null);
  const measure = useRef(null);
  const reduce = useReducedMotion();
  const [p, setP] = useState(reduce ? 1 : 0);
  const [fit, setFit] = useState(1);
  const { scrollYProgress } = useScroll({ target: outer, offset: ["start start", "end end"] });
  useMotionValueEvent(scrollYProgress, "change", (v) => { if (!reduce) setP(v); });
  // 작은 휴대폰에서 끝 장면(문장이 다 펼쳐진 상태)이 화면보다 크면 고정 화면 전체를 그만큼 줄인다.
  // 문장마다 대조 중인 장면과 끝 장면을 보이지 않게 그려 두고 가장 큰 높이로 재므로, 스크롤 중에 크기가 바뀌지 않는다.
  useEffect(() => {
    if (reduce) return undefined;
    const run = () => {
      const st = sticky.current;
      const m = measure.current;
      if (!st || !m) return;
      const need = Math.max(...[...m.children].map((c) => c.offsetHeight));
      const cs = getComputedStyle(st);
      const avail = st.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      setFit(need > avail ? Math.max(0.72, avail / need) : 1);
    };
    run();
    window.addEventListener("resize", run);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(run) : null;
    if (ro && measure.current) [...measure.current.children].forEach((c) => ro.observe(c));
    return () => { window.removeEventListener("resize", run); ro?.disconnect(); };
  }, [reduce]);
  const props = { steps, question, sentences, reduce };
  if (reduce) return <div className="vl-story-static"><StoryPanel {...props} progress={1} /></div>;
  return (
    <div ref={outer} className="vl-story-outer" data-pin="">
      <div className="vl-story-sticky" ref={sticky}>
        <StoryPanel {...props} progress={p} style={fit < 1 ? { transform: `scale(${fit})` } : undefined} />
        <div className="vl-story-measure" aria-hidden="true" data-nosnippet="" ref={measure}>
          {[...sentences.map((_, i) => 0.15 + ((i + 0.5) * 0.7) / sentences.length), 1].map((v) => <StoryPanel key={v} {...props} progress={v} />)}
        </div>
      </div>
    </div>
  );
}

/** 문항 칸 — 화면에 들어오면 칸이 하나씩 켜지고, 틀린 칸만 키 컬러로 바뀐다(증거 숫자 밑). */
export function CellGrid({ total, hits = 0 }) {
  const ref = useRef(null);
  const reduce = useReducedMotion();
  const [on, setOn] = useState(!!reduce);
  useEffect(() => {
    if (reduce || !ref.current || !("IntersectionObserver" in window)) { setOn(true); return undefined; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setOn(true); io.disconnect(); } }, { threshold: 0.5 });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [reduce]);
  // 틀린 칸은 고르게 흩어 놓는다(12칸 중 4칸이면 1 · 4 · 7 · 10번째)
  const hit = new Set(Array.from({ length: hits }, (_, k) => Math.floor(((k + 0.5) * total) / hits)));
  return (
    <div ref={ref} className={`vl-cells${on ? " on" : ""}`} aria-hidden="true">
      {Array.from({ length: total }, (_, i) => <i key={i} className={hit.has(i) ? "hit" : ""} style={{ transitionDelay: `${i * 45}ms` }} />)}
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
