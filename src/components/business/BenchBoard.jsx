// 성능 구역 — 자체 데이터셋 · 정확도 · 가격을 한 화면에(2026-10-27 대표 "내세울 만한 데이터셋과 모델 능력 · 비용을 전면에").
// 숫자는 모두 실제 측정값이다(바탕화면 veriline/dataset README · IR bench.json). 서로 다른 문항 세트의 숫자는 한 막대 묶음에 섞지 않는다.
// 2026-10-29: "Opus보다 정확"으로 읽히지 않게 — 1문항 차이는 대등으로 적고, 원가 비율은 IR bench.json RATIO(42%)와 맞춘다.
// 막대는 0~100% 전체 눈금 — 축을 잘라 차이를 부풀리지 않는다. 화면에 들어오면 한 번 차오른다.
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { CountUp } from "./motion.jsx";
import { API_RATES } from "../../../server/apiRates.js";

const FIELDS = [["노무", 148], ["법률", 131], ["의료", 125], ["세무", 101]];
const TRAPS = [["제재", 188], ["예외", 78], ["기간", 61], ["수치", 54], ["요건", 51], ["없는 조문", 32], ["개정", 25]];
const ACC = [
  { k: "베리라인 정밀", v: 98.5, n: "66문항", us: true },
  { k: "Opus + 법제처 API", v: 97.0, n: "같은 66문항 · 같은 원가" },
  { k: "베리라인 기본", v: 93.0, n: "128문항 · Opus + 법제처 API 원가의 42%" },
];

const CSS = `
.bb { display:grid; grid-template-columns:minmax(0,1.05fr) minmax(0,.95fr); gap:16px; margin-top:48px; }
@media (max-width: 900px) { .bb { grid-template-columns:1fr; } }
.bb-card { border:1px solid var(--line); border-radius:18px; padding:clamp(22px,3vw,32px); background:var(--white); min-width:0; }
.bb-card.dark { background:var(--black); color:#fff; border-color:var(--black); }
.bb-k { font-size:13px; font-weight:600; color:var(--g2); }
.bb-card.dark .bb-k { color:#8E8E97; }
.bb-big { display:flex; align-items:baseline; gap:10px; margin-top:8px; flex-wrap:wrap; }
.bb-big b { font-size:clamp(56px,7vw,88px); font-weight:700; letter-spacing:-.05em; line-height:1; font-variant-numeric:tabular-nums; }
.bb-big > span { font-size:17px; font-weight:600; color:#D4D4D8; }
.bb-p { margin:14px 0 0; font-size:15px; line-height:1.7; color:#A1A1AA; max-width:52ch; }
.bb-p b { color:#fff; font-weight:600; }
.bb-fields { display:grid; gap:10px; margin-top:22px; }
.bb-row { display:grid; grid-template-columns:44px 1fr 40px; gap:12px; align-items:center; font-size:14px; }
.bb-row em { font-style:normal; text-align:right; font-variant-numeric:tabular-nums; color:#D4D4D8; }
.bb-bar { height:8px; border-radius:4px; background:rgba(255,255,255,.08); overflow:hidden; }
.bb-bar i { display:block; height:100%; border-radius:4px; background:var(--key-on-dark); transform-origin:left; transform:scaleX(0); transition:transform 1.1s cubic-bezier(.2,.7,.2,1); }
.bb.on .bb-bar i { transform:scaleX(var(--w)); }
.bb-chips { display:flex; flex-wrap:wrap; gap:6px; margin-top:18px; }
.bb-chips span { font-size:12.5px; padding:4px 10px; border-radius:999px; border:1px solid rgba(255,255,255,.14); color:#C9CBD6; }
.bb-chips span b { color:#fff; font-weight:600; margin-left:4px; font-variant-numeric:tabular-nums; }
.bb-acc { display:grid; gap:18px; margin-top:20px; }
.bb-acc .top { display:flex; justify-content:space-between; align-items:baseline; gap:10px; }
.bb-acc .top span { font-size:15px; font-weight:600; }
.bb-acc .top b { font-size:28px; letter-spacing:-.03em; font-variant-numeric:tabular-nums; }
.bb-acc .us .top b, .bb-acc .us .top span { color:var(--key); }
.bb-acc small { display:block; font-size:12.5px; color:var(--g2); margin-top:4px; }
.bb-acc .bb-bar { background:var(--off); height:10px; margin-top:8px; }
.bb-acc .bb-bar i { background:#C9CBD6; }
.bb-acc .us .bb-bar i { background:var(--key); }
.bb-price { display:flex; justify-content:space-between; align-items:flex-end; gap:16px; flex-wrap:wrap; margin-top:26px; padding-top:20px; border-top:1px solid var(--line); }
.bb-price b { font-size:30px; letter-spacing:-.035em; }
.bb-price b small { font-size:14px; color:var(--g2); font-weight:500; letter-spacing:0; }
.bb-price p { margin:4px 0 0; font-size:13.5px; color:var(--g1); }
.bb-note { font-size:12.5px; color:var(--g2); margin-top:14px; line-height:1.6; }
@media (prefers-reduced-motion: reduce) { .bb-bar i { transition:none; } }
`;

export default function BenchBoard({ onTry }) {
  const ref = useRef(null);
  const reduce = useReducedMotion();
  const [on, setOn] = useState(!!reduce);
  useEffect(() => {
    if (reduce || !ref.current || !("IntersectionObserver" in window)) { setOn(true); return undefined; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setOn(true); io.disconnect(); } }, { threshold: 0.25 });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [reduce]);
  const max = Math.max(...FIELDS.map(([, n]) => n));
  const growthUnit = Math.round(API_RATES.tiers[API_RATES.tiers.length - 1].monthlyKrw / API_RATES.tiers[API_RATES.tiers.length - 1].calls);
  return (
    <div ref={ref} className={`bb${on ? " on" : ""}`}>
      <style>{CSS}</style>
      <div className="bb-card dark">
        <div className="bb-k">자체 데이터셋 · VERILINE-TRAP-500</div>
        <div className="bb-big"><b><CountUp to={505} /></b><span>최신 AI가 실제로 틀린 함정 문항</span></div>
        <p className="bb-p">질문 <b>1,200개</b>를 최신 AI(Claude Sonnet 5.5)에 던져 <b>틀린 42%</b>만 남겼습니다. 법령 83개, 문항마다 법제처 원문 인용과 링크가 붙어 있습니다.</p>
        <div className="bb-fields" aria-label="분야별 문항 수">
          {FIELDS.map(([k, n]) => (
            <div key={k} className="bb-row"><span>{k}</span><div className="bb-bar"><i style={{ "--w": n / max }} /></div><em>{n}</em></div>
          ))}
        </div>
        <div className="bb-chips" aria-label="함정 유형">{TRAPS.map(([k, n]) => <span key={k}>{k}<b>{n}</b></span>)}</div>
      </div>
      <div className="bb-card">
        <div className="bb-k">정확도 · 처음 보는 문항 블라인드 시험</div>
        <div className="bb-acc">
          {ACC.map((a) => (
            <div key={a.k} className={a.us ? "us" : ""}>
              <div className="top"><span>{a.k}</span><b>{a.v.toFixed(1)}%</b></div>
              <div className="bb-bar"><i style={{ "--w": a.v / 100 }} /></div>
              <small>{a.n}</small>
            </div>
          ))}
        </div>
        <div className="bb-price">
          <div><b>{API_RATES.metered.unitKrw.toLocaleString("ko-KR")}원<small> / 검증 1건</small></b><p>월 구독이면 건당 {growthUnit.toLocaleString("ko-KR")}원까지 · 1,000자 기준</p></div>
          <button type="button" className="vl-btn key sm" onClick={onTry}>무료로 먼저 확인 <span className="arr">→</span></button>
        </div>
        <p className="bb-note">엔진을 고칠 때 보지 않은 법령으로 만든 문항, 채점은 별도 모델이 원문 기준으로(2026-10 자체 측정). 정밀 등급과 Opus + API의 차이는 66문항 중 1문항으로, 앞선다기보다 대등한 수준입니다. 전문가 검수 골든셋은 준비 중입니다.</p>
      </div>
    </div>
  );
}
