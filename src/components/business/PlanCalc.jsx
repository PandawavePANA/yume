// 요금 계산기 — 한 달 답변 수를 고르면 가장 싼 요금제와 건당 가격을 바로 보여 준다(2026-10-27).
// 요금은 서버 요율표(API_RATES)에서만 읽는다. 구독 요금제의 초과 사용 규칙은 정해져 있지 않아,
// 포함 건수를 넘는 요금제는 고르지 않고 종량제 · 상위 요금제 · 엔터프라이즈 상담으로만 안내한다.
import { useState } from "react";
import { API_RATES } from "../../../server/apiRates.js";

const STOPS = [50, 100, 200, 300, 400, 600, 800, 1000, 1200, 2000, 5000, 10000];
const won = (n) => `${Math.round(n).toLocaleString("ko-KR")}원`;

function best(n) {
  const opts = [{ key: "metered", label: API_RATES.metered.label, monthly: n * API_RATES.metered.unitKrw }];
  for (const t of API_RATES.tiers) if (n <= t.calls) opts.push({ key: t.key, label: t.label, monthly: t.monthlyKrw });
  if (n > Math.max(...API_RATES.tiers.map((t) => t.calls))) return { key: "enterprise", label: API_RATES.enterprise.label, monthly: null };
  return opts.sort((a, b) => a.monthly - b.monthly)[0];
}

const CSS = `
.pc { margin-top:20px; border:1px solid var(--line); border-radius:16px; background:var(--white); padding:clamp(20px,3vw,28px); display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:24px; align-items:center; }
@media (max-width: 760px) { .pc { grid-template-columns:1fr; } }
.pc label { display:block; font-size:14px; font-weight:600; }
.pc .val { font-size:30px; font-weight:700; letter-spacing:-.03em; margin-top:6px; font-variant-numeric:tabular-nums; }
.pc .val small { font-size:14px; color:var(--g2); font-weight:500; letter-spacing:0; }
.pc input[type=range] { width:100%; margin-top:14px; accent-color:var(--key); height:28px; }
.pc .ticks { display:flex; justify-content:space-between; font-size:11.5px; color:var(--g2); }
.pc .out { border-radius:12px; background:var(--off); padding:18px 20px; }
.pc .out .k { font-size:13px; color:var(--g1); }
.pc .out .plan { font-size:20px; font-weight:700; margin-top:2px; }
.pc .out .m { font-size:30px; font-weight:700; letter-spacing:-.035em; margin-top:6px; font-variant-numeric:tabular-nums; }
.pc .out .m small { font-size:14px; color:var(--g2); font-weight:500; letter-spacing:0; }
.pc .out .u { font-size:13.5px; color:var(--key); font-weight:600; margin-top:2px; }
.pc .out .vl-btn { margin-top:14px; width:100%; }
`;

export default function PlanCalc({ onQuote, onConsult }) {
  const [i, setI] = useState(4);
  const n = STOPS[i];
  const b = best(n);
  return (
    <div className="pc">
      <style>{CSS}</style>
      <div>
        <label htmlFor="pc-range">한 달에 검증할 AI 답변 수</label>
        <div className="val">{n.toLocaleString("ko-KR")}<small> 건 / 월</small></div>
        <input id="pc-range" type="range" min={0} max={STOPS.length - 1} step={1} value={i} onChange={(e) => setI(Number(e.target.value))} aria-valuetext={`${n}건`} />
        <div className="ticks"><span>{STOPS[0].toLocaleString("ko-KR")}</span><span>{STOPS[STOPS.length - 1].toLocaleString("ko-KR")}</span></div>
      </div>
      <div className="out" aria-live="polite">
        <div className="k">가장 싼 요금제</div>
        <div className="plan">{b.label}</div>
        {b.monthly != null ? (
          <>
            <div className="m">{won(b.monthly)}<small> / 월 · 부가세 별도</small></div>
            <div className="u">답변 1건당 {won(b.monthly / n)}</div>
            <button type="button" className="vl-btn key sm" onClick={() => onQuote(b.key)}>이 요금제로 견적서 받기 <span className="arr">→</span></button>
          </>
        ) : (
          <>
            <div className="m">월 {won(API_RATES.enterprise.fromKrw)}<small>부터</small></div>
            <div className="u">전용 한도 · 계약서 · 대량 처리</div>
            <button type="button" className="vl-btn key sm" onClick={onConsult}>대량 사용 상담 <span className="arr">→</span></button>
          </>
        )}
      </div>
    </div>
  );
}
