// 아이디어 → 견적 → 사이트 → 결제 → 성공. 스크롤한 만큼 단계가 넘어가는 그림.
//
// 섹션은 길고(단계 수만큼 화면 높이를 쌓는다) 그 안의 패널은 화면에 멈춰 있다(sticky).
// 스크롤 값이 곧 진행도다 — 내리면 앞으로, 올리면 되감긴다. 자바스크립트는 숫자 셋만
// 적는다: 전체 진행(--p), 지금 단계(data-step), 그 단계 안의 진행(--sp). 그림은 전부
// CSS가 그 숫자로 그린다(flow.css). 그래서 스크롤마다 리액트가 다시 그리지 않는다.
//
// 섹션 높이는 처음부터 정해져 있다. 켜고 끄는 클래스는 첫 그리기에 이미 붙어 있어서,
// 로드한 뒤에 섹션이 늘어나 아래가 밀리는 일이 없다.
// "움직임 줄이기"에서는 고정 패널 대신 다섯 단계를 차례로 늘어놓는다.
import { useEffect, useRef } from "react";

const reduced = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

// 문구는 사이트에 이미 적혀 있는 약속만 쓴다(PROCESS · GUARANTEES · SERVICES).
const STEPS = [
  { key: "idea", label: "아이디어", title: "한 줄이면 시작할 수 있습니다", desc: "기획서가 없어도 됩니다. 무엇을 만들지부터 함께 정리하고, 이 단계는 비용이 들지 않습니다." },
  { key: "quote", label: "견적", title: "범위와 금액을 먼저 정합니다", desc: "만들 것과 만들지 않을 것을 문서로 나누고, 금액과 기간을 정합니다. 정한 금액은 도중에 바꾸지 않습니다." },
  { key: "site", label: "사이트", title: "매주 돌아가는 화면을 봅니다", desc: "다 만든 뒤에야 처음 보여드리지 않습니다. 매주 실제로 동작하는 화면을 주소로 열어 보실 수 있습니다." },
  { key: "pay", label: "결제", title: "실제로 돈을 받게 만듭니다", desc: "카드 결제와 휴대폰 본인인증, 심사에 필요한 약관·환불정책까지 붙여서 바로 결제를 받을 수 있게 합니다." },
  { key: "live", label: "성공", title: "운영이 시작됩니다", desc: "실제 도메인에 올려 넘겨드립니다. 코드·서버·도메인·결제 계정 모두 드리고, 만든 범위 안의 오류는 기간 제한 없이 고칩니다." },
];
const N = STEPS.length;

export default function Flow() {
  const ref = useRef(null);
  // 첫 그리기부터 켠다 — 효과 안에서 켜면 로드 직후 섹션 높이가 바뀌어 아래가 밀린다.
  const on = typeof window !== "undefined" && !reduced();

  useEffect(() => {
    const el = ref.current;
    if (!el || !on) return undefined;
    let raf = 0;
    const update = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      const span = r.height - window.innerHeight;
      const p = span > 0 ? Math.min(1, Math.max(0, -r.top / span)) : 0;
      const f = p * N;
      const step = Math.min(N - 1, Math.floor(f));
      const sp = Math.min(1, Math.max(0, f - step));
      el.style.setProperty("--p", p.toFixed(4));
      el.style.setProperty("--sp", sp.toFixed(4));
      if (el.dataset.step !== String(step)) el.dataset.step = String(step);
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(update); };
    // 화면 근처에 있을 때만 스크롤을 듣는다.
    let listening = false;
    const listen = (yes) => {
      if (yes === listening) return;
      listening = yes;
      if (yes) { window.addEventListener("scroll", kick, { passive: true }); window.addEventListener("resize", kick); kick(); }
      else { window.removeEventListener("scroll", kick); window.removeEventListener("resize", kick); }
    };
    const io = "IntersectionObserver" in window
      ? new IntersectionObserver(([e]) => listen(e.isIntersecting), { rootMargin: "200px 0px" })
      : null;
    if (io) io.observe(el); else listen(true);
    update();
    return () => {
      if (raf) cancelAnimationFrame(raf);
      io?.disconnect();
      listen(false);
    };
  }, [on]);

  return (
    <section className={`flow${on ? " flow--on" : ""}`} ref={ref} data-step="0" aria-label="맡기시면 이렇게 됩니다">
      <div className="flow__pin">
        <div className="wrap flow__inner">
          <div className="flow__track" aria-hidden={on || undefined}>
            <span className="flow__rail"><span className="flow__fill" /></span>
            <ol className="flow__nodes">
              {STEPS.map((s, i) => (
                <li className="flow__node" key={s.key} style={{ "--n": i }}>
                  <span className="flow__dot" />
                  <span className="flow__label">{s.label}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="flow__body">
            <div className="flow__copy">
              <p className="label">맡기시면 이렇게 됩니다</p>
              <div className="flow__count" aria-hidden>
                <span className="flow__count-now">
                  {STEPS.map((s, i) => <span className="flow__num" key={s.key} style={{ "--n": i }}>{String(i + 1).padStart(2, "0")}</span>)}
                </span>
                <span className="flow__count-all">/ {String(N).padStart(2, "0")}</span>
              </div>
              <div className="flow__texts">
                {STEPS.map((s, i) => (
                  <div className="flow__text" key={s.key} style={{ "--n": i }}>
                    <p className="flow__step">{String(i + 1).padStart(2, "0")} · {s.label}</p>
                    <h3 className="flow__title">{s.title}</h3>
                    <p className="flow__desc">{s.desc}</p>
                  </div>
                ))}
              </div>
              <div className="flow__meter" aria-hidden>
                <span className="flow__meter-bar"><i /></span>
                <span className="flow__meter-txt">스크롤해서 넘겨 보세요</span>
              </div>
            </div>

            <div className="flow__stage" aria-hidden>
              <svg viewBox="0 0 480 320" className="flow__svg">
                <defs>
                  <linearGradient id="flowBeam" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0" stopColor="#3b82f6" />
                    <stop offset="0.5" stopColor="#6d5ae0" />
                    <stop offset="1" stopColor="#8b5cf6" />
                  </linearGradient>
                  <radialGradient id="flowGlow" cx="0.5" cy="0.5" r="0.5">
                    <stop offset="0" stopColor="#8b5cf6" stopOpacity="0.55" />
                    <stop offset="1" stopColor="#8b5cf6" stopOpacity="0" />
                  </radialGradient>
                  <linearGradient id="flowCard" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor="#3b82f6" stopOpacity="0.9" />
                    <stop offset="1" stopColor="#8b5cf6" stopOpacity="0.9" />
                  </linearGradient>
                </defs>

                {/* 도면 격자 — 모든 장면 뒤에 깔린다 */}
                <g className="flow__grid">
                  {Array.from({ length: 13 }, (_, i) => <line key={`v${i}`} x1={i * 40} y1="0" x2={i * 40} y2="320" />)}
                  {Array.from({ length: 9 }, (_, i) => <line key={`h${i}`} x1="0" y1={i * 40} x2="480" y2={i * 40} />)}
                </g>

                {/* 01 아이디어 — 전구가 그려지고 불이 들어온다 */}
                <g className="flow__scene flow__scene--0">
                  <circle cx="240" cy="130" r="110" fill="url(#flowGlow)" className="fx-bulb-glow" />
                  {Array.from({ length: 10 }, (_, i) => {
                    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
                    return (
                      <line key={i} className="fx-ray" style={{ "--k": i }}
                        x1={240 + Math.cos(a) * 82} y1={128 + Math.sin(a) * 82}
                        x2={240 + Math.cos(a) * 104} y2={128 + Math.sin(a) * 104} />
                    );
                  })}
                  <path className="fx-draw fx-bulb" pathLength="1"
                    d="M240 64 a62 62 0 0 1 38 111 v24 h-76 v-24 a62 62 0 0 1 38 -111 z" />
                  <path className="fx-draw fx-bulb-base" pathLength="1" d="M212 214 h56 M218 228 h44 M228 242 h24" />
                  <path className="fx-filament" pathLength="1" d="M222 158 l9 -18 l9 18 l9 -18 l9 18" />
                  <g className="fx-note">
                    <rect x="300" y="228" width="150" height="40" rx="6" />
                    <text x="375" y="253">예약 받는 앱 만들래요</text>
                  </g>
                </g>

                {/* 02 견적 — 문서의 줄이 채워지고 "확정" 도장이 찍힌다 */}
                <g className="flow__scene flow__scene--1">
                  <rect className="fx-doc" x="140" y="34" width="200" height="252" rx="8" />
                  <text className="fx-doc-title" x="164" y="68">견적서</text>
                  <line className="fx-doc-rule" x1="164" y1="80" x2="316" y2="80" />
                  {[0.82, 0.64, 0.74, 0.5, 0.58].map((w, i) => (
                    <g key={i} className="fx-row" style={{ "--k": i }}>
                      <circle cx="170" cy={104 + i * 30} r="5" className={i < 3 ? "fx-yes" : "fx-no"} />
                      <rect x="184" y={100 + i * 30} width={132 * w} height="8" rx="4" />
                    </g>
                  ))}
                  <line className="fx-doc-rule" x1="164" y1="252" x2="316" y2="252" />
                  <text className="fx-doc-total" x="164" y="272">금액 · 기간</text>
                  <rect className="fx-doc-sum" x="248" y="262" width="68" height="12" rx="3" />
                  <g className="fx-stamp">
                    <circle cx="330" cy="236" r="38" />
                    <circle cx="330" cy="236" r="31" />
                    <text x="330" y="244">확정</text>
                  </g>
                </g>

                {/* 03 사이트 — 브라우저 안에서 화면이 조립된다 */}
                <g className="flow__scene flow__scene--2">
                  <rect className="fx-win" x="70" y="34" width="340" height="252" rx="10" />
                  <line className="fx-win-bar" x1="70" y1="62" x2="410" y2="62" />
                  <circle cx="88" cy="48" r="4" className="fx-win-dot" />
                  <circle cx="102" cy="48" r="4" className="fx-win-dot" />
                  <circle cx="116" cy="48" r="4" className="fx-win-dot" />
                  <rect className="fx-url" x="140" y="41" width="200" height="14" rx="7" />
                  <rect className="fx-blk" style={{ "--t": 0.05 }} x="86" y="74" width="308" height="12" rx="3" />
                  <rect className="fx-blk fx-blk--hero" style={{ "--t": 0.2 }} x="86" y="96" width="308" height="78" rx="6" />
                  <rect className="fx-blk fx-blk--line" style={{ "--t": 0.32 }} x="104" y="116" width="150" height="12" rx="3" />
                  <rect className="fx-blk fx-blk--line" style={{ "--t": 0.4 }} x="104" y="134" width="110" height="8" rx="3" />
                  <rect className="fx-blk fx-blk--btn" style={{ "--t": 0.48 }} x="104" y="150" width="64" height="16" rx="3" />
                  {[0, 1, 2].map((i) => (
                    <rect key={i} className="fx-blk" style={{ "--t": 0.58 + i * 0.1 }} x={86 + i * 105} y="186" width="98" height="84" rx="6" />
                  ))}
                  <g className="fx-cursor" style={{ "--t": 0.86 }}>
                    <path d="M0 0 L0 18 L5 13 L9 22 L12 21 L8 12 L15 12 Z" />
                  </g>
                </g>

                {/* 04 결제 — 카드가 들어오고 링이 차오른 뒤 체크 */}
                <g className="flow__scene flow__scene--3">
                  <g className="fx-card">
                    <rect x="72" y="88" width="190" height="120" rx="12" />
                    <rect className="fx-chip" x="92" y="112" width="30" height="22" rx="4" />
                    <text className="fx-card-no" x="92" y="168">•••• •••• •••• 4242</text>
                    <text className="fx-card-name" x="92" y="190">REAMER PAY</text>
                  </g>
                  <circle className="fx-ring-bg" cx="352" cy="148" r="52" />
                  <circle className="fx-ring" cx="352" cy="148" r="52" pathLength="1" />
                  <path className="fx-check" pathLength="1" d="M330 150 l15 15 l28 -32" />
                  <text className="fx-pay-txt" x="352" y="232">결제 완료</text>
                </g>

                {/* 05 성공 — 매출선이 올라가고 "운영 중" */}
                <g className="flow__scene flow__scene--4">
                  <line className="fx-axis" x1="70" y1="260" x2="420" y2="260" />
                  <line className="fx-axis" x1="70" y1="60" x2="70" y2="260" />
                  <path className="fx-area" d="M70 250 L130 238 L190 244 L250 206 L310 178 L370 118 L420 78 L420 260 L70 260 Z" />
                  <polyline className="fx-draw fx-chart" pathLength="1" points="70,250 130,238 190,244 250,206 310,178 370,118 420,78" />
                  <circle className="fx-peak" cx="420" cy="78" r="6" />
                  {Array.from({ length: 8 }, (_, i) => {
                    const a = (i / 8) * Math.PI * 2;
                    return <line key={i} className="fx-spark" style={{ "--k": i }} x1={420 + Math.cos(a) * 12} y1={78 + Math.sin(a) * 12} x2={420 + Math.cos(a) * 24} y2={78 + Math.sin(a) * 24} />;
                  })}
                  <g className="fx-live">
                    <rect x="84" y="70" width="104" height="30" rx="15" />
                    <circle cx="104" cy="85" r="5" />
                    <text x="118" y="90">운영 중</text>
                  </g>
                </g>
              </svg>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
