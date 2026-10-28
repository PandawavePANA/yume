// 메인 히어로 애니메이션 — "베리라인을 거치면 바로잡힌다".
// 2026-10-26 대표: 필터를 두 개로 — ① 틀린 곳을 찾아 줄을 긋는 필터, ② 그것을 원문으로 고쳐 완성하는 필터.
// 필터 틀과 카드 폭을 같게(카드가 틀을 그대로 통과하게). 흐름은 오른쪽 위 → 왼쪽 아래(대표 지시).
// 같은 날 "벨트가 더 길어야 해, 너무 겹쳐 보인다" · "더 예쁘고 세련되면서 깔끔하게" —
// 경로를 늘려 앞뒤 카드 사이 세로 간격 171px(빈틈 약 70px), 벨트는 가는 레일 두 줄 + 흐르는 점선,
// 필터는 뷰파인더 모서리와 스캔선 한 줄, 라벨은 작은 알약.
// 같은 날 밤 "더 다채롭고 멋있고 기술적이게" — 단계마다 색을 준다(검사 = 오류색 · 바로잡음 = 코발트→청록),
// 벨트 위 점선은 같은 색 흐름으로, 빈 두 모서리에 엔진 표시(왼쪽 위)와 판정 영수증 단말(오른쪽 아래)을 둔다.
// 영수증은 카드가 ②를 지날 때마다 그 카드의 판정을 한 줄씩 찍는다 — 실제 영수증 칸(decided_by · rule · source · sha256 · models_called).
//
// 카드 한 장의 여정(10.5초): AI 답변(원래 글) → ① 통과: 틀린 값에 줄이 그어짐 → ② 통과: 그 자리가 원문 값과 조문으로 바뀜.
// 카드 3장이 3.5초 간격으로 돈다. 카드 내용은 실제 사례 — 감사 오류 2건(고용보험법 · 최저임금법)과
// 법제처 연혁으로 확인한 개정 1건(남녀고용평등법 제19조의4, 2025.2.23 시행 분할 2회 → 3회).
// 움직임 줄이기 설정이면 세 단계가 나란히 놓인 멈춘 장면으로 보인다.
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";

const CARDS = [
  { pre: "초단시간 근로자 기준기간: ", bad: "2주", post: " 소정근로일수 2일 이하", good: "1주", law: "고용보험법 제40조 ②",
    receipt: { claim: "2주", rule: "code:value", source: "고용보험법 제40조②", sha: "a41f07c2…9c2e", value: "1주" } },
  { pre: "근로감독관 검사 거부 시 ", bad: "벌금 500만 원", post: "", good: "과태료 100만 원 이하", law: "최저임금법 제31조",
    receipt: { claim: "벌금 500만 원", rule: "code:sanction_class", source: "최저임금법 제31조", sha: "5d93be10…04a7", value: "과태료 100만원 이하" } },
  { pre: "육아휴직은 ", bad: "2회", post: "까지 나누어 사용", good: "3회", law: "남녀고용평등법 제19조의4 · 2025.2.23 개정",
    receipt: { claim: "2회", rule: "code:amended", source: "남녀고용평등법 제19조의4", sha: "e7c2149a…b31f", value: "3회(2025.2.23 시행)" } },
];

// 장면 좌표(640×640). 카드는 224×100, 필터 틀은 카드와 같은 폭(바깥 6px씩).
const W = 640;
const H = 640;
const CW = 224;
const CH = 100;
const PAD = 6;
// 카드 왼쪽 위 좌표의 경로: 시작 → 필터① → 필터② → 끝
const P0 = [404, 8];
const P3 = [8, 520];
const at = (t) => [P0[0] + (P3[0] - P0[0]) * t, P0[1] + (P3[1] - P0[1]) * t];
const G1 = at(1 / 3);
const G2 = at(2 / 3);
const px = (v) => `${Math.round(v)}px`;

// 벨트 — 카드 중심 경로를 양끝으로 늘린 띠(진행 방향에 수직으로 반폭 64px).
const LEN = Math.hypot(P3[0] - P0[0], P3[1] - P0[1]);
const DIR = [(P3[0] - P0[0]) / LEN, (P3[1] - P0[1]) / LEN];
const NRM = [-DIR[1], DIR[0]];
const center = (t) => { const [x, y] = at(t); return [x + CW / 2, y + CH / 2 + 10]; };
const BS = center(-0.12);
const BE = center(1.22);
const HALF = 64;
const off = (p, k) => [p[0] + NRM[0] * k, p[1] + NRM[1] * k];
const f = (p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`;
const R1 = [off(BS, HALF), off(BE, HALF)];
const R2 = [off(BS, -HALF), off(BE, -HALF)];
// 벨트 위 색 구간이 바뀌는 자리(필터 ①, ②의 중심) — 그라디언트 위치(0~1)
const tOn = (t) => (t + 0.12) / 1.34;

const RED = "#FF6B85";
const COB = "#6E8BFF";
const TEAL = "#2EE6C5";
const AMBER = "#FFB547";

const CSS = `
.gs { position:relative; width:100%; aspect-ratio:${W}/${H}; max-width:600px; margin-left:auto; }
.gs-stage { position:absolute; left:0; top:0; width:${W}px; height:${H}px; transform-origin:0 0; }
.gs-belt { position:absolute; inset:0; overflow:visible; }
.gs-belt .flow { animation:gsDash 1.2s linear infinite; }
.gs-belt .flow2 { animation:gsDash 2.4s linear infinite; }
.gs-card { position:absolute; z-index:2; left:0; top:0; width:${CW}px; height:${CH}px; animation:gsMove 10.5s linear infinite; will-change:transform, opacity; }
.gs-card .face { position:absolute; inset:0; border-radius:12px; padding:12px 14px; font-size:12.5px; line-height:1.5; color:#F4F4F5; word-break:keep-all; overflow:hidden; display:flex; flex-direction:column; gap:5px; }
.gs-card .raw { background:#14141A; border:1px solid rgba(255,255,255,.14); box-shadow:0 10px 30px rgba(0,0,0,.45); animation:gsRaw 10.5s linear infinite; }
.gs-card .found { background:#1A1316; border:1px solid rgba(255,107,133,.6); box-shadow:0 10px 30px rgba(0,0,0,.45); animation:gsFound 10.5s linear infinite; opacity:0; }
.gs-card .fixed { background:#0F1530; border:1px solid rgba(123,149,255,.65); box-shadow:0 10px 30px rgba(0,0,0,.45); animation:gsFixed 10.5s linear infinite; opacity:0; }
.gs-card .tag { display:flex; align-items:center; gap:6px; font-size:10.5px; font-weight:600; letter-spacing:.02em; }
.gs-card .raw .tag { color:#9A9AA6; }
.gs-card .found .tag { color:${RED}; }
.gs-card .fixed .tag { color:${TEAL}; }
.gs-card .dot { width:5px; height:5px; border-radius:50%; background:currentColor; }
.gs-card .mark { white-space:nowrap; color:#FFD3DB; text-decoration:line-through; text-decoration-thickness:1.5px; text-decoration-color:${RED}; background:rgba(255,107,133,.16); border-radius:3px; padding:0 3px; }
.gs-card .fix { white-space:nowrap; color:#fff; font-weight:700; background:rgba(47,91,255,.42); border-radius:3px; padding:0 3px; }
.gs-card .law { margin-top:auto; font-family:"IBM Plex Mono", "IBM Plex Sans KR", "Malgun Gothic", monospace; font-size:10px; color:#8FF0DC; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.gs-card.c2, .gs-card.c2 .face { animation-delay:-3.5s; }
.gs-card.c3, .gs-card.c3 .face { animation-delay:-7s; }
/* 필터 — 카드와 같은 폭의 뷰파인더. ① 오류색, ② 코발트→청록 */
.gs-filter { position:absolute; z-index:1; width:${CW + PAD * 2}px; height:${CH + PAD * 2}px; pointer-events:none; }
.gs-filter.f1 { color:${RED}; }
.gs-filter.f2 { color:${TEAL}; }
.gs-filter svg { position:absolute; inset:0; overflow:visible; }
.gs-filter.over { z-index:5; }
.gs-filter .scan { position:absolute; left:${PAD + 6}px; right:${PAD + 6}px; height:2px; top:${PAD}px; border-radius:2px; background:linear-gradient(90deg, transparent, currentColor 30%, currentColor 70%, transparent); animation:gsScan 3.5s ease-in-out infinite; }
.gs-filter.f2 .scan { background:linear-gradient(90deg, transparent, ${COB} 25%, ${TEAL} 75%, transparent); }
.gs-pill { position:absolute; z-index:6; display:flex; align-items:center; gap:8px; white-space:nowrap; pointer-events:none; }
.gs-pill i { display:block; width:14px; height:1px; background:currentColor; opacity:.6; }
.gs-pill span { display:inline-flex; align-items:center; gap:6px; font-size:11.5px; font-weight:600; letter-spacing:.01em; padding:5px 10px 5px 6px; border-radius:999px; border:1px solid currentColor; background:rgba(10,10,14,.78); backdrop-filter:blur(6px); }
.gs-pill b { display:inline-grid; place-items:center; width:16px; height:16px; border-radius:50%; font-size:10px; font-weight:700; color:#0A0A0B; }
.gs-pill em { font-style:normal; font-family:"IBM Plex Mono", "IBM Plex Sans KR", "Malgun Gothic", monospace; font-size:10px; font-weight:500; opacity:.75; }
.gs-pill.p1 { color:${RED}; }
.gs-pill.p1 b { background:${RED}; }
.gs-pill.p2 { color:${TEAL}; }
.gs-pill.p2 b { background:${TEAL}; }
/* 엔진 표시(왼쪽 위) */
.gs-hud { position:absolute; left:6px; top:4px; z-index:4; font-family:"IBM Plex Mono", "IBM Plex Sans KR", "Malgun Gothic", monospace; font-size:11px; color:#A9A9B6; display:flex; flex-direction:column; gap:7px; }
.gs-hud .name { display:flex; align-items:center; gap:8px; color:#fff; font-size:12px; font-weight:600; letter-spacing:.06em; }
.gs-hud .live { width:6px; height:6px; border-radius:50%; background:${TEAL}; animation:gsBlink 1.6s ease-in-out infinite; }
.gs-hud .row { display:flex; gap:6px; flex-wrap:wrap; }
.gs-hud .chip { border:1px solid rgba(255,255,255,.14); border-radius:6px; padding:2px 7px; background:rgba(255,255,255,.03); }
.gs-hud .chip.a { color:#C9CBD6; }
.gs-hud .chip.c { color:#AFC0FF; border-color:rgba(110,139,255,.4); }
.gs-hud .chip.t { color:#C9CBD6; }
/* 판정 영수증 단말(오른쪽 아래) */
.gs-term { position:absolute; right:4px; bottom:4px; z-index:4; width:300px; border-radius:12px; background:rgba(9,10,16,.88); border:1px solid rgba(255,255,255,.12); box-shadow:0 18px 50px rgba(0,0,0,.45); font-family:"IBM Plex Mono", "IBM Plex Sans KR", "Malgun Gothic", monospace; font-size:10.5px; line-height:1.48; overflow:hidden; backdrop-filter:blur(8px); }
.gs-term .bar { display:flex; align-items:center; gap:6px; padding:6px 12px; border-bottom:1px solid rgba(255,255,255,.08); color:#8A8A96; font-size:10.5px; }
.gs-term .bar i { width:8px; height:8px; border-radius:50%; display:block; }
.gs-term .bar .t { margin-left:6px; }
.gs-term .bar .ok { margin-left:auto; color:${TEAL}; }
.gs-term pre { margin:0; padding:8px 12px 10px; white-space:pre; color:#C9CBD6; }
.gs-term .ln { display:block; opacity:0; animation:gsType .35s ease-out forwards; }
.gs-term .k { color:#8FA3FF; } .gs-term .s { color:#FFD08A; } .gs-term .r { color:${RED}; } .gs-term .g { color:${TEAL}; } .gs-term .m { color:#6B6B78; }
.gs-term .cur { display:inline-block; width:7px; height:12px; background:${TEAL}; vertical-align:-2px; animation:gsBlink 1s steps(2) infinite; }
@keyframes gsType { from { opacity:0; transform:translateX(-4px); } to { opacity:1; transform:none; } }
@keyframes gsBlink { 50% { opacity:.25; } }
@keyframes gsMove {
  0%      { transform:translate(${px(P0[0])}, ${px(P0[1])}); opacity:0; }
  6%      { opacity:1; }
  33.33%  { transform:translate(${px(G1[0])}, ${px(G1[1])}); }
  66.66%  { transform:translate(${px(G2[0])}, ${px(G2[1])}); }
  94%     { opacity:1; }
  100%    { transform:translate(${px(P3[0])}, ${px(P3[1])}); opacity:0; }
}
@keyframes gsRaw   { 0%, 31% { opacity:1; } 34%, 100% { opacity:0; } }
@keyframes gsFound { 0%, 31% { opacity:0; } 34% { opacity:1; filter:brightness(1.35); } 40%, 64% { opacity:1; filter:none; } 67%, 100% { opacity:0; } }
@keyframes gsFixed { 0%, 64% { opacity:0; } 67% { opacity:1; filter:brightness(1.35); } 73%, 100% { opacity:1; filter:none; } }
@keyframes gsScan { 0% { top:${PAD}px; opacity:1; } 50% { top:${CH + PAD}px; opacity:.45; } 100% { top:${PAD}px; opacity:1; } }
@keyframes gsDash { from { stroke-dashoffset:0; } to { stroke-dashoffset:-24; } }
@media (max-width: 560px) { .gs-term { width:268px; font-size:10.5px; } }
@media (prefers-reduced-motion: reduce) {
  .gs-card, .gs-card .face, .gs-filter .scan, .gs-belt .flow, .gs-belt .flow2, .gs-hud .live, .gs-term .cur { animation:none !important; }
  .gs-term .ln { opacity:1; animation:none; }
  .gs-card.c1 { transform:translate(${px(P0[0])}, ${px(P0[1])}); }
  .gs-card.c1 .found, .gs-card.c1 .fixed { opacity:0; }
  .gs-card.c2 { transform:translate(${px((G1[0] + G2[0]) / 2)}, ${px((G1[1] + G2[1]) / 2)}); }
  .gs-card.c2 .raw, .gs-card.c2 .fixed { opacity:0; } .gs-card.c2 .found { opacity:1; }
  .gs-card.c3 { transform:translate(${px(P3[0])}, ${px(P3[1])}); }
  .gs-card.c3 .raw, .gs-card.c3 .found { opacity:0; } .gs-card.c3 .fixed { opacity:1; }
}
`;

// 뷰파인더 모서리 네 개
const FW = CW + PAD * 2;
const FH = CH + PAD * 2;
const K = 16;
const CORNERS = `M0 ${K} V4 Q0 0 4 0 H${K} M${FW - K} 0 H${FW - 4} Q${FW} 0 ${FW} 4 V${K} M${FW} ${FH - K} V${FH - 4} Q${FW} ${FH} ${FW - 4} ${FH} H${FW - K} M${K} ${FH} H4 Q0 ${FH} 0 ${FH - 4} V${FH - K}`;

// 틀은 카드 아래(모서리 선이 글자를 가로지르지 않게), 스캔선만 카드 위로 지나간다.
function Filter({ g, n }) {
  const pos = { left: g[0] - PAD, top: g[1] - PAD };
  return (
    <>
      <div className={`gs-filter f${n}`} style={pos}>
        <svg width={FW} height={FH} viewBox={`0 0 ${FW} ${FH}`} aria-hidden="true">
          <rect x="0.5" y="0.5" width={FW - 1} height={FH - 1} rx="14" fill="currentColor" fillOpacity="0.04" stroke="currentColor" strokeOpacity="0.22" />
          <path d={CORNERS} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>
      <div className={`gs-filter over f${n}`} style={pos}><div className="scan" /></div>
    </>
  );
}

function Card({ c, i }) {
  return (
    <div className={`gs-card c${i + 1}`}>
      <div className="face raw">
        <div className="tag"><span className="dot" />AI 답변</div>
        <div>{c.pre}{c.bad}{c.post}</div>
      </div>
      <div className="face found">
        <div className="tag"><span className="dot" />틀린 곳 찾음</div>
        <div>{c.pre}<span className="mark">{c.bad}</span>{c.post}</div>
      </div>
      <div className="face fixed">
        <div className="tag"><span className="dot" />원문으로 바로잡음</div>
        <div>{c.pre}<span className="fix">{c.good}</span>{c.post}</div>
        <div className="law">§ {c.law}</div>
      </div>
    </div>
  );
}

// 카드가 ②를 지나는 순간(주기의 2/3)마다 그 카드의 영수증을 새로 찍는다.
function Receipt() {
  const reduce = useReducedMotion();
  // c1은 -0s, c2는 -3.5s, c3는 -7s에서 시작 → 7s에 c1, 3.5s에 c2, 0s에 c3가 ②를 지난다
  const [n, setN] = useState(2);
  useEffect(() => {
    if (reduce) return undefined;
    const t = setInterval(() => setN((x) => (x + 2) % 3), 3500); // c3 → c2 → c1 순서로 ②를 지난다
    return () => clearInterval(t);
  }, [reduce]);
  const r = CARDS[n].receipt;
  const lines = [
    <><span className="m">{"{"}</span></>,
    <>  <span className="k">"claim"</span>: <span className="s">"{r.claim}"</span>,</>,
    <>  <span className="k">"verdict"</span>: <span className="r">"wrong"</span>,</>,
    <>  <span className="k">"decided_by"</span>: <span className="g">"code"</span>,</>,
    <>  <span className="k">"rule"</span>: <span className="s">"{r.rule}"</span>,</>,
    <>  <span className="k">"source"</span>: <span className="s">"{r.source}"</span>,</>,
    <>  <span className="k">"text_sha256"</span>: <span className="m">"{r.sha}"</span>,</>,
    <>  <span className="k">"fixed"</span>: <span className="g">"{r.value}"</span>,</>,
    <>  <span className="k">"verdict_models_called"</span>: <span className="g">0</span></>,
    <><span className="m">{"}"}</span> <span className="cur" /></>,
  ];
  return (
    <div className="gs-term" aria-hidden="true">
      <div className="bar"><i style={{ background: "#FF5F57" }} /><i style={{ background: "#FEBC2E" }} /><i style={{ background: "#28C840" }} /><span className="t">receipt.json · 재현 가능</span><span className="ok">● replay ok</span></div>
      <pre key={n}>{lines.map((l, i) => <span key={i} className="ln" style={{ animationDelay: `${i * 0.12}s` }}>{l}{"\n"}</span>)}</pre>
    </div>
  );
}

export default function GateScene() {
  const box = useRef(null);
  const [scale, setScale] = useState(1);
  // 장면은 640×640 좌표로 그리고, 칸 너비에 맞춰 통째로 줄인다(휴대폰에서도 같은 장면).
  useEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    const fit = () => setScale(el.clientWidth / W);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div className="gs" ref={box} role="img" aria-label="AI 답변 카드가 첫 번째 필터에서 틀린 곳이 빨갛게 표시되고, 두 번째 필터에서 법령 원문 값으로 고쳐지며, 판정 영수증이 찍히는 장면">
      <style>{CSS}</style>
      <div className="gs-stage" style={{ transform: `scale(${scale})` }}>
        <svg className="gs-belt" width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
          <defs>
            <linearGradient id="gsFade" gradientUnits="userSpaceOnUse" x1={BS[0]} y1={BS[1]} x2={BE[0]} y2={BE[1]}>
              <stop offset="0" stopColor="#fff" stopOpacity="0" />
              <stop offset="0.14" stopColor="#fff" stopOpacity="1" />
              <stop offset="0.8" stopColor="#fff" stopOpacity="1" />
              <stop offset="1" stopColor="#fff" stopOpacity="0" />
            </linearGradient>
            <mask id="gsMask" maskUnits="userSpaceOnUse" x="-100" y="-100" width={W + 200} height={H + 200}>
              <rect x="-100" y="-100" width={W + 200} height={H + 200} fill="url(#gsFade)" />
            </mask>
            {/* 벨트 색 흐름: 들어오는 쪽 흰색 → ① 지나 오류색 → ② 지나 코발트 · 청록 */}
            <linearGradient id="gsHue" gradientUnits="userSpaceOnUse" x1={BS[0]} y1={BS[1]} x2={BE[0]} y2={BE[1]}>
              <stop offset="0" stopColor="#E4E4E7" />
              <stop offset={tOn(1 / 3) - 0.04} stopColor="#E4E4E7" />
              <stop offset={tOn(1 / 3) + 0.02} stopColor={RED} />
              <stop offset={tOn(2 / 3) - 0.04} stopColor={RED} />
              <stop offset={tOn(2 / 3) + 0.02} stopColor={COB} />
              <stop offset="1" stopColor={TEAL} />
            </linearGradient>
          </defs>
          <g mask="url(#gsMask)">
            <polygon points={`${f(R1[0])} ${f(R1[1])} ${f(R2[1])} ${f(R2[0])}`} fill="rgba(110,139,255,0.035)" />
            <line x1={R1[0][0]} y1={R1[0][1]} x2={R1[1][0]} y2={R1[1][1]} stroke="url(#gsHue)" strokeOpacity="0.35" strokeWidth="1" />
            <line x1={R2[0][0]} y1={R2[0][1]} x2={R2[1][0]} y2={R2[1][1]} stroke="url(#gsHue)" strokeOpacity="0.35" strokeWidth="1" />
            <line className="flow" x1={BS[0]} y1={BS[1]} x2={BE[0]} y2={BE[1]} stroke="url(#gsHue)" strokeOpacity="0.75" strokeWidth="1.6" strokeDasharray="2 22" strokeLinecap="round" />
            <line className="flow2" x1={off(BS, 30)[0]} y1={off(BS, 30)[1]} x2={off(BE, 30)[0]} y2={off(BE, 30)[1]} stroke="url(#gsHue)" strokeOpacity="0.3" strokeWidth="1" strokeDasharray="1 11" />
            <line className="flow2" x1={off(BS, -30)[0]} y1={off(BS, -30)[1]} x2={off(BE, -30)[0]} y2={off(BE, -30)[1]} stroke="url(#gsHue)" strokeOpacity="0.3" strokeWidth="1" strokeDasharray="1 11" />
          </g>
        </svg>
        <div className="gs-hud" aria-hidden="true">
          <div className="name"><span className="live" />VERILINE ENGINE 3.0</div>
          <div className="row"><span className="chip a">law.go.kr · 현행</span><span className="chip c">code verdict</span></div>
          <div className="row"><span className="chip t">sha-256 receipt</span><span className="chip">판정 단계 모델 0</span></div>
        </div>
        {CARDS.map((c, i) => <Card key={c.law} c={c} i={i} />)}
        <Filter g={G1} n={1} />
        <div className="gs-pill p1" style={{ left: G1[0] + CW + PAD, top: G1[1] + CH / 2 - 13 }}><i /><span><b>1</b>틀린 곳 찾기 <em>scan</em></span></div>
        <Filter g={G2} n={2} />
        <div className="gs-pill p2" style={{ left: G2[0] + CW + PAD, top: G2[1] + CH / 2 - 13 }}><i /><span><b>2</b>원문으로 고치기 <em>fix</em></span></div>
        <Receipt />
      </div>
    </div>
  );
}
