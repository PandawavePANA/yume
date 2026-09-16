// 홈(/)의 스토리텔링 섹션.
//
// 원래 개인 화면(YumeDashboard) 아래에 길게 붙어 있던 마케팅 랜딩이다. 검증하러 온
// 사람에게는 입력창 아래 스크롤 벽이었고, 도입을 검토하러 온 사람에게는 정작 닿지 않는
// 위치였다. 화면을 홈·개인·기업으로 가르면서 이쪽으로 옮겼다 — 설득은 홈에서 하고,
// /app은 쓰는 곳으로만 둔다.
import { motion, useScroll, useTransform, useSpring, useMotionValue } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { EASE_APPLE, UI } from "./theme.js";

// AI 할루시네이션이 발생하는 구조적 원인 5가지와, 유메가 도메인에 상관없이
// 그 원인마다 붙이는 대응 로직. 법률 도메인에서 먼저 검증한 내용을 일반화했다.
const HALLUCINATION_CAUSES = [
  { title: "저빈도 값 붕괴", problem: "조문 번호·수치처럼 드문 값은 AI가 비슷한 값과 섞습니다.", fix: "원문을 항목 단위까지 펼쳐 문자열로 직접 대조" },
  { title: "시점 붕괴", problem: "개정 전·후 버전이 둘 다 학습돼 어느 게 최신인지 AI는 모릅니다.", fix: "지금 유효한 버전만 기준으로 판정" },
  { title: "자기회귀적 오류 전파", problem: "한 번 부정확한 표현이 나오면 뒤이어 계속 틀립니다.", fix: "답변 전체가 아니라 주장 단위로 쪼개 독립 검증" },
  { title: "확신 편향", problem: "근거가 약해도, 아예 없는 사실이어도 AI의 말투는 항상 자신 있게 나옵니다.", fix: "확인됨·사실과 다름·확인되지 않음, 3단계로 정직하게 판정" },
  { title: "유사 개체 혼동", problem: "이름이나 맥락이 비슷한 두 개념이 서로 섞입니다.", fix: "유사도가 아니라 원문 일치 여부로 최종 판정" },
];

function WordReveal({ lines, delay = 0, style }) {
  let wordCount = 0;
  return (
    <>
      {lines.map((line, li) => (
        <span key={li} style={{ display: "block" }}>
          {line.split(" ").map((word, wi) => {
            const i = wordCount++;
            return (
              <motion.span key={wi}
                initial={{ opacity: 0, y: 18, filter: "blur(6px)" }}
                whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                viewport={{ once: true, amount: 0.6 }}
                transition={{ duration: 0.8, ease: EASE_APPLE, delay: delay + i * 0.06 }}
                style={{ display: "inline-block", marginRight: "0.26em", ...style }}
              >{word}</motion.span>
            );
          })}
        </span>
      ))}
    </>
  );
}

// 뷰포트에 들어오는 순간 0에서 목표값까지 이징을 타며 세는 카운터 (통계 카드용).
function CountUp({ to, suffix = "", duration = 1.4 }) {
  const [value, setValue] = useState(0);
  const startedRef = useRef(false);
  return (
    <motion.span
      onViewportEnter={() => {
        if (startedRef.current) return;
        startedRef.current = true;
        const start = performance.now();
        const tick = (now) => {
          const p = Math.min(1, (now - start) / (duration * 1000));
          const eased = 1 - Math.pow(1 - p, 3);
          setValue(Math.round(to * eased));
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }}
      viewport={{ once: true, amount: 0.8 }}
    >{value}{suffix}</motion.span>
  );
}

// "10건 → 73건" 통계 카드. 숫자·화살표·캡션이 차례로 떠오르고, 73건은 은은한 보라 빛과
// 함께 자리를 잡는다 — 급증했다는 이야기를 과장 없이 움직임으로 보여준다.
function HallucinationStatCard() {
  const container = {
    hidden: {},
    show: { transition: { staggerChildren: 0.14, delayChildren: 0.05 } },
  };
  const card = {
    hidden: { opacity: 0, y: 24 },
    show: { opacity: 1, y: 0, transition: { duration: 0.8, ease: EASE_APPLE } },
  };
  const rise = {
    hidden: { opacity: 0, y: 14 },
    show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE_APPLE } },
  };
  const arrow = {
    hidden: { opacity: 0, scaleX: 0 },
    show: { opacity: 1, scaleX: 1, transition: { duration: 0.6, ease: EASE_APPLE } },
  };
  const glow = {
    hidden: { opacity: 0, scale: 0.6 },
    show: { opacity: [0, 0.7, 0.25], scale: [0.6, 1.3, 1.4], transition: { duration: 1.4, ease: "easeOut" } },
  };

  return (
    <motion.div variants={container} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.6 }}>
      <motion.div
        variants={card}
        whileHover={{ y: -4 }}
        transition={{ duration: 0.4, ease: EASE_APPLE }}
        style={{
          background: UI.surface, backdropFilter: UI.glass, WebkitBackdropFilter: UI.glass,
          border: `1px solid ${UI.hairlineLight}`, borderRadius: 28, padding: "36px 48px", minWidth: 260, boxShadow: UI.shadowCard,
        }}
      >
        <div style={{ fontSize: "clamp(40px, 6vw, 60px)", fontWeight: 700, letterSpacing: "-0.04em", display: "flex", alignItems: "center", justifyContent: "center", gap: 14 }}>
          <motion.span variants={rise} style={{ display: "inline-block", color: UI.ink3 }}>
            <CountUp to={10} suffix="건" />
          </motion.span>
          <motion.span variants={arrow} style={{ display: "inline-block", color: UI.ink3, fontWeight: 400 }}>→</motion.span>
          <motion.span variants={rise} style={{ display: "inline-block", position: "relative" }}>
            <motion.span
              variants={glow}
              style={{
                position: "absolute", inset: "-22px -18px", borderRadius: 999,
                background: "radial-gradient(circle, rgba(139,95,217,0.45) 0%, rgba(139,95,217,0) 70%)",
                zIndex: -1,
              }}
            />
            <span style={{ background: UI.brandText, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>
              <CountUp to={73} suffix="건" />
            </span>
          </motion.span>
        </div>
        <motion.div variants={rise} style={{ fontSize: 14, color: UI.ink2, marginTop: 10, lineHeight: 1.6 }}>
          법정 문서에서 발견된 AI 할루시네이션<br />2023년 → 2025년 상반기
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

// 스크롤해서 뷰포트에 들어올 때 한 번, 살짝 떠오르며 나타나는 범용 래퍼(애플식 등장).
function Reveal({ children, delay = 0, y = 32, scale = 0.985, blur = 0, style }) {
  const hidden = blur ? { opacity: 0, y, scale, filter: `blur(${blur}px)` } : { opacity: 0, y, scale };
  const shown = blur ? { opacity: 1, y: 0, scale: 1, filter: "blur(0px)" } : { opacity: 1, y: 0, scale: 1 };
  return (
    <motion.div
      initial={hidden}
      whileInView={shown}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.9, ease: EASE_APPLE, delay }}
      style={style}
    >
      {children}
    </motion.div>
  );
}

// 애플 제품 페이지처럼 스크롤에 맞춰 천천히 제자리를 찾는 쇼케이스 카드 — 실제 검증
// 도구가 아니라 유메가 어떻게 다른지 보여주는 장면. 기울기는 읽는 데 방해되지 않을 만큼만.
function RotatingShowcaseCard() {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 0.95", "center 0.5"] });
  const rotateX = useTransform(scrollYProgress, [0, 1], [18, 0]);
  const scale = useTransform(scrollYProgress, [0, 1], [0.9, 1]);
  const opacity = useTransform(scrollYProgress, [0, 0.5], [0.3, 1]);
  const badgeOpacity = useTransform(scrollYProgress, [0.55, 0.9], [0, 1]);
  const badgeY = useTransform(scrollYProgress, [0.55, 0.9], [10, 0]);

  return (
    <div ref={ref} style={{ perspective: 1600, display: "flex", justifyContent: "center", padding: "20px 0" }}>
      <motion.div style={{
        rotateX, scale, opacity, transformStyle: "preserve-3d", transformOrigin: "50% 100%",
        width: "min(440px, 88vw)", background: UI.surface, backdropFilter: UI.glass, WebkitBackdropFilter: UI.glass,
        borderRadius: 28, border: `1px solid ${UI.hairlineLight}`, boxShadow: UI.shadowCard, overflow: "hidden",
      }}>
        <div style={{ padding: "26px 28px" }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: UI.ink3, marginBottom: 14 }}>유메 검증 결과</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center", width: 22, height: 22, borderRadius: 999,
              background: "#E7F6EE", color: "#1F9D66", fontSize: 12, fontWeight: 700,
            }}>✓</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: UI.ink2 }}>법률 · 확인됨</span>
            <motion.span style={{
              opacity: badgeOpacity, y: badgeY, fontSize: 11, fontWeight: 600, color: UI.accent,
              background: "#EFE7FC", borderRadius: 999, padding: "2px 9px",
            }}>법제처 공식 확인</motion.span>
          </div>
          <div style={{ fontSize: 17, color: UI.ink, fontWeight: 600, letterSpacing: "-0.01em", lineHeight: 1.45, marginBottom: 10 }}>
            민법 제750조: 고의·과실로 손해를 가하면 배상 책임이 있다
          </div>
          <div style={{ fontSize: 14, color: UI.ink2, lineHeight: 1.65 }}>
            법제처 국가법령정보에서 실제 조문을 대조해, 짐작이 아니라 확인된 사실만 보여드립니다.
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// "세 단계로, 확실하게" 카드 1개 — 부모(StepsSection)가 넘겨주는 스크롤 진행률에 맞춰
// 차례로 떠오른다(스크롤 위치 자체가 애니메이션 진행률).
function StepCard({ step, i, progress }) {
  const start = i * 0.16;
  const end = start + 0.5;
  const opacity = useTransform(progress, [start, end], [0, 1]);
  const y = useTransform(progress, [start, end], [48, 0]);
  const scale = useTransform(progress, [start, end], [0.96, 1]);
  return (
    <motion.div style={{ opacity, y, scale }}>
      <motion.div whileHover={{ y: -4 }} transition={{ duration: 0.4, ease: EASE_APPLE }} style={{
        background: UI.surface, backdropFilter: UI.glass, WebkitBackdropFilter: UI.glass,
        border: `1px solid ${UI.hairlineLight}`, borderRadius: 24, padding: "32px 28px", height: "100%", boxSizing: "border-box",
        boxShadow: UI.shadowSoft,
      }}>
        <div style={{
          fontSize: 15, fontWeight: 700, letterSpacing: "0.02em", marginBottom: 18,
          background: UI.brandText, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent",
        }}>{step.n}</div>
        <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", color: UI.ink, marginBottom: 10 }}>{step.title}</div>
        <div style={{ fontSize: 15, color: UI.ink2, lineHeight: 1.65 }}>{step.desc}</div>
      </motion.div>
    </motion.div>
  );
}

const STEPS = [
  { n: "01", title: "붙여넣기", desc: "ChatGPT·클로드·제미나이 등 어떤 AI의 답변이든 그대로 붙여넣으세요." },
  { n: "02", title: "대조하기", desc: "법률은 법제처 공식 데이터베이스로, 그 외는 실시간 웹검색으로 하나하나 대조합니다." },
  { n: "03", title: "확인하기", desc: "확인됨 · 사실과 다름 · 확인되지 않음으로 명확하게, 근거와 출처까지 함께 보여드립니다." },
];

// 헤더(HOW IT WORKS + 제목)와 카드 3개를, 이 섹션이 뷰포트를 지나가는 스크롤
// 진행률 하나에 종속시킨다 — 내려가면 서서히 나타나고, 올리면 그만큼 되돌아간다.
function StepsSection() {
  const ref = useRef(null);
  const { scrollYProgress: progress } = useScroll({ target: ref, offset: ["start 0.9", "start 0.3"] });
  const headerOpacity = useTransform(progress, [0, 0.4], [0, 1]);
  const headerY = useTransform(progress, [0, 0.4], [28, 0]);

  return (
    <section ref={ref} style={{ maxWidth: 1080, margin: "200px auto 0", padding: "0 24px" }}>
      <motion.div style={{ textAlign: "center", marginBottom: 64, opacity: headerOpacity, y: headerY }}>
        <Eyebrow>HOW IT WORKS</Eyebrow>
        <h2 style={UI.sectionTitle}>세 단계로, 확실하게.</h2>
      </motion.div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 20 }}>
        {STEPS.map((step, i) => (
          <StepCard key={step.n} step={step} i={i} progress={progress} />
        ))}
      </div>
    </section>
  );
}

function Eyebrow({ children }) {
  return (
    <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: "0.04em", marginBottom: 14, color: UI.accentSoft }}>{children}</div>
  );
}

export default function HomeSections({ onStart }) {
  return (
    <>
      {/* 왜 유메인가 — 문제 제기 */}
      <section style={{ maxWidth: 900, margin: "160px auto 0", padding: "0 24px", textAlign: "center" }}>
        <Reveal><Eyebrow>왜 유메인가</Eyebrow></Reveal>
        <h2 style={{ ...UI.sectionTitle, margin: "0 0 48px" }}>
          <WordReveal delay={0.05} lines={["AI는 확신에 찬 목소리로,", "틀린 말을 합니다."]} />
        </h2>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 20, margin: "0 auto 40px" }}>
          <HallucinationStatCard />
        </div>
        <Reveal delay={0.15}>
          <p style={{ ...UI.lead, maxWidth: 600, margin: "0 auto" }}>
            유메는 창업자가 실제로 겪은 법정 분쟁에서 시작됐습니다. AI가 알려준 정보를 그대로 믿었다가 피해를 입은 경험이, "확인된 사실"만 전달하는 서비스를 만들게 했습니다.
          </p>
        </Reveal>
      </section>

      <StepsSection />

      {/* 무엇이 다른가 — 회전 쇼케이스 카드 */}
      <section style={{ maxWidth: 1080, margin: "200px auto 0", padding: "0 24px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 56, alignItems: "center" }}>
          <div>
            <Reveal><Eyebrow>무엇이 다른가</Eyebrow></Reveal>
            <h2 style={{ ...UI.sectionTitle, fontSize: "clamp(30px, 4.2vw, 46px)", margin: "0 0 22px" }}>
              <WordReveal lines={["AI에게 AI를", "검증하게 하지 않습니다."]} />
            </h2>
            <Reveal delay={0.1}>
              <p style={{ ...UI.lead, margin: 0 }}>
                일반적인 팩트체크는 또 다른 AI의 짐작에 의존합니다. 유메는 법률 도메인에서 먼저 검증한 "공식 원천 데이터와 직접 대조하는 구조"를 도메인마다 반복합니다. 짐작이 아니라, 확인입니다.
              </p>
            </Reveal>
          </div>
          <RotatingShowcaseCard />
        </div>
      </section>

      {/* 왜 AI는 틀릴까 — 할루시네이션 원인 5가지와 유메의 대응 */}
      <section style={{ maxWidth: 1080, margin: "200px auto 0", padding: "0 24px", textAlign: "center" }}>
        <Reveal><Eyebrow>할루시네이션의 원인</Eyebrow></Reveal>
        <h2 style={{ ...UI.sectionTitle, margin: "0 0 18px" }}>
          <WordReveal lines={["AI는 왜 틀릴까요,", "유메는 원인부터 봅니다."]} />
        </h2>
        <Reveal delay={0.08}>
          <p style={{ ...UI.lead, margin: "0 auto 56px", maxWidth: 680 }}>
            할루시네이션은 우연이 아니라, AI가 답을 만드는 방식 자체에서 반복되는 구조적 현상입니다. 유메는 이 원인 다섯 가지를 각각 뜯어보고, 원인마다 다른 검증 로직을 붙였습니다.
          </p>
        </Reveal>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(188px, 1fr))", gap: 14 }}>
          {HALLUCINATION_CAUSES.map((c, i) => (
            <Reveal key={c.title} delay={i * 0.06} style={{ height: "100%" }}>
              <motion.div whileHover={{ y: -6, boxShadow: UI.shadowCard }} transition={{ duration: 0.4, ease: EASE_APPLE }}
                style={{
                  background: UI.surface, backdropFilter: UI.glass, WebkitBackdropFilter: UI.glass,
                  border: `1px solid ${UI.hairlineLight}`, borderRadius: 22, padding: "26px 22px",
                  height: "100%", boxSizing: "border-box", textAlign: "left", boxShadow: UI.shadowSoft,
                }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: UI.accentSoft, marginBottom: 14, fontVariantNumeric: "tabular-nums" }}>{String(i + 1).padStart(2, "0")}</div>
                <div style={{ fontSize: 17, fontWeight: 700, color: UI.ink, marginBottom: 8, letterSpacing: "-0.02em" }}>{c.title}</div>
                <div style={{ fontSize: 14, color: UI.ink2, lineHeight: 1.65, marginBottom: 14 }}>{c.problem}</div>
                <div style={{ fontSize: 14, color: UI.accent, lineHeight: 1.65, fontWeight: 600, paddingTop: 14, borderTop: `1px solid ${UI.hairline}` }}>{c.fix}</div>
              </motion.div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* 마무리 CTA */}
      <section style={{ maxWidth: 760, margin: "200px auto 0", padding: "0 24px", textAlign: "center" }}>
        <Reveal>
          <h2 style={{ ...UI.sectionTitle, margin: "0 0 18px" }}>
            AI 답변, <span style={{ background: UI.brandText, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>확인하고</span> 믿으세요.
          </h2>
        </Reveal>
        <Reveal delay={0.1}>
          <p style={{ ...UI.lead, margin: "0 auto 32px" }}>붙여넣기 한 번이면 충분해요. 가입하지 않아도 바로 써볼 수 있어요.</p>
        </Reveal>
        <Reveal delay={0.18}>
          <motion.button whileHover={{ y: -1, boxShadow: "0 14px 32px rgba(107,79,168,0.36)" }} whileTap={{ scale: 0.97 }}
            onClick={onStart} style={{
            padding: "14px 28px", borderRadius: 980, border: "none", background: UI.button, color: "#fff",
            fontSize: 16, fontWeight: 600, cursor: "pointer", letterSpacing: "-0.01em", boxShadow: "0 8px 22px rgba(107,79,168,0.26)",
          }}>지금 확인해보기</motion.button>
        </Reveal>
      </section>
    </>
  );
}
