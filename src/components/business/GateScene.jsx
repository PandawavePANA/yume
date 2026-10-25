// 메인 히어로 애니메이션 — "베리라인을 거치면 바로잡힌다".
// 2026-10-26 대표: 필터를 두 개로 — ① 틀린 곳을 찾아 줄을 긋는 필터, ② 그것을 원문으로 고쳐 완성하는 필터.
// 필터 틀과 카드 폭을 같게(카드가 틀을 그대로 통과하게). 흐름은 오른쪽 위 → 왼쪽 아래(대표 지시).
// 같은 날 "벨트가 더 길어야 해, 너무 겹쳐 보인다" · "더 예쁘고 세련되면서 깔끔하게" —
// 경로를 늘려 앞뒤 카드 사이 세로 간격 171px(빈틈 약 70px), 벨트는 가는 레일 두 줄 + 흐르는 점선,
// 필터는 뷰파인더 모서리와 스캔선 한 줄, 라벨은 작은 알약. 번쩍임 · 무늬 · 큰 그림자는 덜어냈다.
//
// 카드 한 장의 여정(10.5초): AI 답변(원래 글) → ① 통과: 틀린 값에 줄이 그어짐 → ② 통과: 그 자리가 원문 값(키 컬러)과 조문으로 바뀜.
// 카드 3장이 3.5초 간격으로 돈다. 필터의 스캔선은 카드가 지나는 순간 가장 밝다.
// 색은 흑백 + 키 컬러 하나: 틀림은 색 없이 흰 취소선, 바로잡음만 코발트.
// 카드 내용은 실제 사례 — 감사 오류 2건(고용보험법 · 최저임금법)과 법제처 연혁으로 확인한 개정 1건(남녀고용평등법 제19조의4, 2025.2.23 시행 분할 2회 → 3회).
// 움직임 줄이기 설정이면 세 단계가 나란히 놓인 멈춘 장면으로 보인다.
import { useEffect, useRef, useState } from "react";

const CARDS = [
  { pre: "초단시간 근로자 기준기간: ", bad: "2주", post: " 소정근로일수 2일 이하", good: "1주", law: "고용보험법 제40조 ②" },
  { pre: "근로감독관 검사 거부 시 ", bad: "벌금 500만 원", post: "", good: "과태료 100만 원 이하", law: "최저임금법 제31조" },
  { pre: "육아휴직은 ", bad: "2회", post: "까지 나누어 사용", good: "3회", law: "남녀고용평등법 제19조의4 · 2025.2.23 개정" },
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

const CSS = `
.gs { position:relative; width:100%; aspect-ratio:${W}/${H}; max-width:600px; margin-left:auto; }
.gs-stage { position:absolute; left:0; top:0; width:${W}px; height:${H}px; transform-origin:0 0; }
.gs-belt { position:absolute; inset:0; overflow:visible; }
.gs-belt .flow { animation:gsDash 1.2s linear infinite; }
.gs-card { position:absolute; z-index:2; left:0; top:0; width:${CW}px; height:${CH}px; animation:gsMove 10.5s linear infinite; will-change:transform, opacity; }
.gs-card .face { position:absolute; inset:0; border-radius:12px; padding:12px 14px; font-size:12.5px; line-height:1.5; color:#F4F4F5; word-break:keep-all; overflow:hidden; display:flex; flex-direction:column; gap:5px; }
.gs-card .raw { background:#161619; border:1px solid rgba(255,255,255,.12); box-shadow:0 10px 30px rgba(0,0,0,.45); animation:gsRaw 10.5s linear infinite; }
.gs-card .found { background:#18181C; border:1px solid rgba(255,255,255,.42); box-shadow:0 10px 30px rgba(0,0,0,.45); animation:gsFound 10.5s linear infinite; opacity:0; }
.gs-card .fixed { background:#0E1229; border:1px solid rgba(123,149,255,.7); box-shadow:0 10px 32px rgba(47,91,255,.26); animation:gsFixed 10.5s linear infinite; opacity:0; }
.gs-card .tag { display:flex; align-items:center; gap:6px; font-size:10.5px; font-weight:600; letter-spacing:.02em; }
.gs-card .raw .tag { color:#8E8E97; }
.gs-card .found .tag { color:#E4E4E7; }
.gs-card .fixed .tag { color:#AFC0FF; }
.gs-card .dot { width:5px; height:5px; border-radius:50%; background:currentColor; }
.gs-card .mark { white-space:nowrap; color:#fff; text-decoration:line-through; text-decoration-thickness:1.5px; text-decoration-color:#fff; background:rgba(255,255,255,.1); border-radius:3px; padding:0 3px; }
.gs-card .fix { white-space:nowrap; color:#fff; font-weight:700; background:rgba(47,91,255,.38); border-radius:3px; padding:0 3px; }
.gs-card .law { margin-top:auto; font-family:"IBM Plex Mono", ui-monospace, Menlo, monospace; font-size:10px; color:#97A9FF; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.gs-card.c2, .gs-card.c2 .face { animation-delay:-3.5s; }
.gs-card.c3, .gs-card.c3 .face { animation-delay:-7s; }
/* 필터 — 카드와 같은 폭의 뷰파인더 */
.gs-filter { position:absolute; z-index:1; width:${CW + PAD * 2}px; height:${CH + PAD * 2}px; pointer-events:none; color:rgba(255,255,255,.85); }
.gs-filter.f2 { color:#7B95FF; }
.gs-filter svg { position:absolute; inset:0; overflow:visible; }
.gs-filter.over { z-index:5; }
.gs-filter .scan { position:absolute; left:${PAD + 6}px; right:${PAD + 6}px; height:1px; top:${PAD}px; background:linear-gradient(90deg, transparent, currentColor 30%, currentColor 70%, transparent); animation:gsScan 3.5s ease-in-out infinite; }
.gs-pill { position:absolute; z-index:6; display:flex; align-items:center; gap:8px; white-space:nowrap; pointer-events:none; }
.gs-pill i { display:block; width:14px; height:1px; background:currentColor; opacity:.5; }
.gs-pill span { display:inline-flex; align-items:center; gap:6px; font-size:11.5px; font-weight:600; letter-spacing:.01em; padding:5px 10px 5px 6px; border-radius:999px; border:1px solid currentColor; background:rgba(10,10,11,.72); }
.gs-pill b { display:inline-grid; place-items:center; width:16px; height:16px; border-radius:50%; font-size:10px; font-weight:700; color:#0A0A0B; }
.gs-pill.p1 { color:#D4D4D8; }
.gs-pill.p1 span { border-color:rgba(255,255,255,.28); }
.gs-pill.p1 b { background:#E4E4E7; }
.gs-pill.p2 { color:#AFC0FF; }
.gs-pill.p2 span { border-color:rgba(123,149,255,.5); }
.gs-pill.p2 b { background:#7B95FF; }
@keyframes gsMove {
  0%      { transform:translate(${px(P0[0])}, ${px(P0[1])}); opacity:0; }
  6%      { opacity:1; }
  33.33%  { transform:translate(${px(G1[0])}, ${px(G1[1])}); }
  66.66%  { transform:translate(${px(G2[0])}, ${px(G2[1])}); }
  94%     { opacity:1; }
  100%    { transform:translate(${px(P3[0])}, ${px(P3[1])}); opacity:0; }
}
@keyframes gsRaw   { 0%, 31% { opacity:1; } 34%, 100% { opacity:0; } }
@keyframes gsFound { 0%, 31% { opacity:0; } 34% { opacity:1; filter:brightness(1.25); } 40%, 64% { opacity:1; filter:none; } 67%, 100% { opacity:0; } }
@keyframes gsFixed { 0%, 64% { opacity:0; } 67% { opacity:1; filter:brightness(1.25); } 73%, 100% { opacity:1; filter:none; } }
@keyframes gsScan { 0% { top:${PAD}px; opacity:.9; } 50% { top:${CH + PAD}px; opacity:.35; } 100% { top:${PAD}px; opacity:.9; } }
@keyframes gsDash { from { stroke-dashoffset:0; } to { stroke-dashoffset:-24; } }
@media (prefers-reduced-motion: reduce) {
  .gs-card, .gs-card .face, .gs-filter .scan, .gs-belt .flow { animation:none !important; }
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
          <rect x="0.5" y="0.5" width={FW - 1} height={FH - 1} rx="14" fill="none" stroke="currentColor" strokeOpacity="0.14" />
          <path d={CORNERS} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
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
    <div className="gs" ref={box} role="img" aria-label="AI 답변 카드가 첫 번째 필터에서 틀린 곳에 줄이 그어지고, 두 번째 필터에서 법령 원문 값으로 고쳐지는 장면">
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
          </defs>
          <g mask="url(#gsMask)">
            <polygon points={`${f(R1[0])} ${f(R1[1])} ${f(R2[1])} ${f(R2[0])}`} fill="rgba(255,255,255,0.025)" />
            <line x1={R1[0][0]} y1={R1[0][1]} x2={R1[1][0]} y2={R1[1][1]} stroke="rgba(255,255,255,0.16)" strokeWidth="1" />
            <line x1={R2[0][0]} y1={R2[0][1]} x2={R2[1][0]} y2={R2[1][1]} stroke="rgba(255,255,255,0.16)" strokeWidth="1" />
            <line className="flow" x1={BS[0]} y1={BS[1]} x2={BE[0]} y2={BE[1]} stroke="rgba(255,255,255,0.22)" strokeWidth="1" strokeDasharray="2 22" strokeLinecap="round" />
          </g>
        </svg>
        {CARDS.map((c, i) => <Card key={c.law} c={c} i={i} />)}
        <Filter g={G1} n={1} />
        <div className="gs-pill p1" style={{ left: G1[0] + CW + PAD, top: G1[1] + CH / 2 - 13 }}><i /><span><b>1</b>틀린 곳 찾기</span></div>
        <Filter g={G2} n={2} />
        <div className="gs-pill p2" style={{ left: G2[0] + CW + PAD, top: G2[1] + CH / 2 - 13 }}><i /><span><b>2</b>원문으로 고치기</span></div>
      </div>
    </div>
  );
}
