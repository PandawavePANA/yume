// 기술 구역의 움직이는 그림 — 엔진 3.0이 답 하나를 검증하는 순서(2026-10-27 대표 "모션 그래픽을 더, 과하지 않게").
// 여섯 단계가 차례로 켜지고 그 사이를 빛 한 점이 흐른다. 코드가 하는 단계(코발트)와 AI가 하는 단계(회색)를 색으로만 구별한다.
// 화면에 들어올 때 시작하고, 움직임 줄이기 설정이면 모두 켜진 멈춘 그림으로 보인다. 휴대폰에서는 세로로 쌓인다.
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";

const STEPS = [
  { k: "AI", t: "주장 읽기", d: "답에서 “무엇의 · 얼마”를 표로" },
  { k: "코드", t: "조문 저장소", d: "법제처 현행 조문 · 벌칙 · 위임 지도" },
  { k: "코드", t: "코드 판정", d: "금액 · 기간 · 이상/미만 · 벌금/과태료" },
  { k: "코드", t: "근거 묶음", d: "주장마다 맞는 조문 줄만" },
  { k: "AI", t: "고쳐 쓰기", d: "확정된 값으로만" },
  { k: "코드", t: "판정 영수증", d: "원문 지문 · 모델 없이 재현" },
];
const CYCLE = 9; // 초
// 단계가 켜질 때마다 한 줄씩 찍히는 판정 기록(검증 이야기와 같은 고용보험법 제40조 ② 사례)
const LOG = [
  ["claim", "초단시간 · 2주 소정근로일수 2일 이하"],
  ["source", "고용보험법 제40조 ② · 현행 조문"],
  ["check", "2주 ≠ 1주 → 불일치"],
  ["evidence", "제40조 ② 원문 1줄"],
  ["fix", "1주 소정근로일수 2일 이하"],
  ["receipt", "sha256:9f2c41d8…b07a · 재현 가능"],
];
const logFrames = LOG.map((_, i) => {
  const a = ((i * 100) / LOG.length).toFixed(1);
  const b = ((i * 100) / LOG.length + 3).toFixed(1);
  return `@keyframes epL${i} { 0%, ${a}% { opacity:0; transform:translateX(-6px); } ${b}%, 93% { opacity:1; transform:none; } 100% { opacity:0; } }`;
}).join("\n");

const CSS = `
.ep { position:relative; margin-top:clamp(36px,5vw,56px); }
.ep-row { position:relative; display:grid; grid-template-columns:repeat(6, minmax(0,1fr)); gap:12px; }
.ep-line { position:absolute; left:4%; right:4%; top:26px; height:1px; background:rgba(255,255,255,.12); overflow:hidden; }
.ep-line i { position:absolute; top:-1px; left:0; width:80px; height:3px; border-radius:2px; background:linear-gradient(90deg, transparent, #7B95FF, transparent); animation:epRun ${CYCLE}s linear infinite; }
.ep-step { position:relative; display:flex; flex-direction:column; gap:8px; padding-top:4px; }
.ep-node { width:44px; height:44px; border-radius:12px; display:grid; place-items:center; font-size:11.5px; font-weight:700; border:1px solid rgba(255,255,255,.14); background:#111216; color:#8E8E97; transition:none; animation:epOn ${CYCLE}s ease-in-out infinite; }
.ep-step.code .ep-node { color:#AFC0FF; border-color:rgba(123,149,255,.35); }
.ep-step h4 { margin:6px 0 0; font-size:16px; font-weight:700; color:#fff; letter-spacing:-.01em; }
.ep-step p { margin:0; font-size:13.5px; line-height:1.55; color:#8E8E97; }
.ep-legend { display:flex; gap:18px; margin-top:22px; font-size:13px; color:#8E8E97; }
.ep-legend span::before { content:""; display:inline-block; width:8px; height:8px; border-radius:3px; margin-right:7px; vertical-align:0; border:1px solid rgba(255,255,255,.2); background:#111216; }
.ep-legend .c::before { border-color:rgba(123,149,255,.5); background:rgba(123,149,255,.25); }
.ep.paused .ep-node, .ep.paused .ep-line i { animation-play-state:paused; }
@keyframes epRun { from { transform:translateX(-80px); } to { transform:translateX(calc(100vw)); } }
@keyframes epOn { 0%, 100% { background:#111216; box-shadow:none; } 6%, 14% { background:#1A2140; box-shadow:0 0 0 1px rgba(123,149,255,.55); } 22% { background:#111216; box-shadow:none; } }
.ep-log { margin-top:28px; border:1px solid rgba(255,255,255,.1); border-radius:14px; background:#0E0F13; padding:14px 16px 16px; font-family:"IBM Plex Mono","IBM Plex Sans KR","Malgun Gothic",monospace; font-size:12.5px; line-height:1.9; max-width:640px; }
.ep-log .hd { font-family:"IBM Plex Sans KR","Malgun Gothic",sans-serif; display:flex; justify-content:space-between; gap:12px; color:#6B6B73; font-size:11px; letter-spacing:.06em; padding-bottom:8px; margin-bottom:6px; border-bottom:1px solid rgba(255,255,255,.08); }
.ep-log .hd i { display:inline-block; width:6px; height:6px; border-radius:50%; background:#7B95FF; margin-right:7px; vertical-align:1px; }
.ep-log .ln { display:grid; grid-template-columns:76px 1fr; gap:10px; opacity:0; }
.ep-log .ln span { color:#6B6B73; }
.ep-log .ln b { font-family:"IBM Plex Sans KR","Apple SD Gothic Neo","Malgun Gothic",sans-serif; font-weight:500; color:#D4D4D8; min-width:0; overflow-wrap:anywhere; }
.ep-log .ln.k b { color:#AFC0FF; }
.ep.paused .ep-log .ln { animation-play-state:paused !important; }
${logFrames}
@media (max-width: 860px) {
  .ep-row { grid-template-columns:1fr; gap:14px; }
  .ep-line { left:22px; right:auto; top:8px; bottom:8px; width:1px; height:auto; }
  .ep-line i { width:3px; height:60px; left:-1px; top:0; background:linear-gradient(180deg, transparent, #7B95FF, transparent); animation-name:epRunV; }
  .ep-step { flex-direction:row; align-items:flex-start; gap:14px; }
  .ep-step h4 { margin:2px 0 2px; }
  @keyframes epRunV { from { transform:translateY(-60px); } to { transform:translateY(560px); } }
}
@media (max-width: 480px) { .ep-log { font-size:11.5px; padding:12px 12px 14px; } .ep-log .ln { grid-template-columns:62px 1fr; gap:8px; } }
@media (prefers-reduced-motion: reduce) { .ep-node, .ep-line i, .ep-log .ln { animation:none !important; } .ep-line i { display:none; } .ep-log .ln { opacity:1; } }
`;

export default function EnginePipeline() {
  const ref = useRef(null);
  const reduce = useReducedMotion();
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={`ep${visible || reduce ? "" : " paused"}`} role="img" aria-label="엔진 3.0이 답 하나를 검증하는 여섯 단계: 주장 읽기(AI), 조문 저장소 · 코드 판정 · 근거 묶음(코드), 고쳐 쓰기(AI), 판정 영수증(코드)">
      <style>{CSS}</style>
      <div className="ep-row">
        <div className="ep-line" aria-hidden="true"><i /></div>
        {STEPS.map((s, i) => (
          <div key={s.t} className={`ep-step${s.k === "코드" ? " code" : ""}`}>
            <div className="ep-node" style={{ animationDelay: `${(i * CYCLE) / STEPS.length}s` }}>{s.k}</div>
            <div><h4>{s.t}</h4><p>{s.d}</p></div>
          </div>
        ))}
      </div>
      <div className="ep-legend" aria-hidden="true"><span className="c">코드가 판정</span><span>AI가 읽고 씀</span></div>
      <div className="ep-log" aria-hidden="true">
        <div className="hd"><span><i />verification.receipt</span><span>고용보험법 제40조 ②</span></div>
        {LOG.map(([k, v], i) => (
          <div key={k} className={`ln${k === "fix" || k === "receipt" ? " k" : ""}`} style={{ animation: `epL${i} ${CYCLE}s linear infinite` }}><span>{k}</span><b>{v}</b></div>
        ))}
      </div>
    </div>
  );
}
