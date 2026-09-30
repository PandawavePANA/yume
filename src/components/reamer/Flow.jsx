// 아이디어 → 견적 → 사이트 → 결제 → 성공. 스크롤한 만큼 단계가 넘어가는 그림.
//
// 섹션은 길고(단계 수만큼 화면 높이를 쌓는다) 그 안의 패널은 화면에 멈춰 있다(sticky).
// 스크롤 값이 곧 진행도다 — 내리면 앞으로, 올리면 되감긴다. 자바스크립트는 숫자 셋만
// 적는다: 전체 진행(--p), 지금 단계(data-step), 그 단계 안의 진행(--sp). 그림은 전부
// CSS가 그 숫자로 그린다(flow.css). 그래서 스크롤마다 리액트가 다시 그리지 않는다.
//
// 진행도는 스크롤 값을 곧바로 쓰지 않고 조금 늦게 따라간다(관성). 휠은 뚝뚝 끊겨 오는데
// 그대로 그리면 선이 계단처럼 자란다. 따라가게 하면 멈춘 뒤에도 부드럽게 제자리에 선다.
//
// 그림의 조각들은 같은 규칙을 쓴다: class="fl …"과 --t(언제 시작하는지, 0~1), --g(얼마나 빨리).
// 그 단계의 진행이 --t를 지나면 나타나고, 되감으면 사라진다.
//
// 섹션 높이는 처음부터 정해져 있다. 켜고 끄는 클래스는 첫 그리기에 이미 붙어 있어서,
// 로드한 뒤에 섹션이 늘어나 아래가 밀리는 일이 없다.
// "움직임 줄이기"에서는 고정 패널 대신 다섯 단계를 차례로 늘어놓는다.
import { useEffect, useRef } from "react";

const reduced = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

// 문구는 사이트에 이미 적혀 있는 약속만 쓴다(PROCESS · GUARANTEES · SERVICES).
const STEPS = [
  { key: "idea", en: "IDEA", label: "아이디어", title: "한 줄이면 시작할 수 있습니다", desc: "기획서가 없어도 됩니다. 무엇을 만들지부터 함께 정리하고, 이 단계는 비용이 들지 않습니다." },
  { key: "quote", en: "QUOTE", label: "견적", title: "범위와 금액을 먼저 정합니다", desc: "만들 것과 만들지 않을 것을 문서로 나누고, 금액과 기간을 정합니다. 정한 금액은 도중에 바꾸지 않습니다." },
  { key: "site", en: "BUILD", label: "사이트", title: "매주 돌아가는 화면을 봅니다", desc: "다 만든 뒤에야 처음 보여드리지 않습니다. 매주 실제로 동작하는 화면을 주소로 열어 보실 수 있습니다." },
  { key: "pay", en: "PAYMENT", label: "결제", title: "실제로 돈을 받게 만듭니다", desc: "카드 결제와 휴대폰 본인인증, 심사에 필요한 약관·환불정책까지 붙여서 바로 결제를 받을 수 있게 합니다." },
  { key: "live", en: "LIVE", label: "성공", title: "운영이 시작됩니다", desc: "실제 도메인에 올려 넘겨드립니다. 코드·서버·도메인·결제 계정 모두 드리고, 만든 범위 안의 오류는 기간 제한 없이 고칩니다." },
];
const N = STEPS.length;

// 조각 하나의 시작 시점(--t)과 속도(--g).
const at = (t, g) => (g ? { "--t": t, "--g": g } : { "--t": t });
// 네 갈래 별(반짝임).
const star = (x, y, r) => {
  const k = r * 0.24;
  return `M${x} ${y - r}L${x + k} ${y - k}L${x + r} ${y}L${x + k} ${y + k}L${x} ${y + r}L${x - k} ${y + k}L${x - r} ${y}L${x - k} ${y - k}Z`;
};
// 떠오르는 입자 — 자리는 고정값이다(그릴 때마다 달라지면 깜빡인다).
const MOTES = [[38, 270, 9, 0], [92, 300, 12, 3], [150, 250, 10, 6], [206, 296, 13, 1], [262, 276, 9, 5], [318, 302, 11, 2], [372, 262, 12, 7], [428, 292, 10, 4], [66, 210, 14, 8], [300, 224, 12, 9], [452, 236, 11, 6], [180, 204, 13, 2]];
const QUOTE_ROWS = [["화면 설계", 92], ["결제 · 본인인증", 118], ["관리자 화면", 74], ["배포 · 인수", 100]];
const BARS = [30, 44, 38, 64, 82, 110, 138];
const PTS = BARS.map((h, i) => [82 + i * 38, 250 - h]);

// 성공 장면의 월 매출. 스크롤에 맞춰 선이 그려지는 만큼 숫자도 같이 오른다.
// 1,400에서 2,800,000까지는 2,000배라 곧게 더하면 끝에서만 확 뛴다 — 배율로 올려야
// 처음부터 끝까지 고르게 자라는 것처럼 보인다. 중간값은 앞 세 자리만 남겨 깔끔하게 끊는다.
const REV_FROM = 1400;
const REV_TO = 2800000;
const revenueAt = (k) => {
  if (k <= 0) return REV_FROM;
  if (k >= 1) return REV_TO;
  const v = REV_FROM * (REV_TO / REV_FROM) ** k;
  const unit = 10 ** (Math.floor(Math.log10(v)) - 2);
  return Math.round(v / unit) * unit;
};
const usd = (n) => `$${Math.round(n).toLocaleString("en-US")}`;

export default function Flow() {
  const ref = useRef(null);
  const pct = useRef(null);
  const rev = useRef(null);
  // 첫 그리기부터 켠다 — 효과 안에서 켜면 로드 직후 섹션 높이가 바뀌어 아래가 밀린다.
  const on = typeof window !== "undefined" && !reduced();

  useEffect(() => {
    const el = ref.current;
    if (!el || !on) return undefined;
    let raf = 0;
    let target = 0;
    let cur = 0;
    const measure = () => {
      const r = el.getBoundingClientRect();
      const span = r.height - window.innerHeight;
      target = span > 0 ? Math.min(1, Math.max(0, -r.top / span)) : 0;
    };
    const apply = () => {
      const f = cur * N;
      const step = Math.min(N - 1, Math.floor(f));
      const sp = Math.min(1, Math.max(0, f - step));
      el.style.setProperty("--p", cur.toFixed(4));
      el.style.setProperty("--sp", sp.toFixed(4));
      if (el.dataset.step !== String(step)) el.dataset.step = String(step);
      if (pct.current) pct.current.textContent = `${String(Math.round(cur * 100)).padStart(2, "0")}%`;
      // 매출 숫자는 매출선과 같은 박자로 오른다(flow.css의 .fl-chart: --t 0.18, --g 1.5).
      if (rev.current) {
        const k = step < N - 1 ? 0 : Math.min(1, Math.max(0, (sp - 0.18) * 1.5));
        const text = usd(revenueAt(k));
        if (rev.current.textContent !== text) rev.current.textContent = text;
      }
    };
    const tick = () => {
      raf = 0;
      cur += (target - cur) * 0.14;
      if (Math.abs(target - cur) < 0.0004) cur = target;
      apply();
      if (cur !== target) raf = requestAnimationFrame(tick);
    };
    const kick = () => { measure(); if (!raf) raf = requestAnimationFrame(tick); };
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
    // 처음에는 따라가지 않고 바로 제자리에 둔다(새로고침했을 때 0에서부터 달려오지 않게).
    measure();
    cur = target;
    apply();
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
            <span className="flow__rail">
              <span className="flow__fill" />
              <span className="flow__comet" />
            </span>
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
                    {/* 제목은 낱말마다 가림막 뒤에서 밀려 올라온다. */}
                    <h3 className="flow__title">
                      {s.title.split(" ").map((w, k, arr) => (
                        <span key={k}>
                          <span className="flow__tw"><span style={{ "--i": k }}>{w}</span></span>
                          {k < arr.length - 1 ? " " : null}
                        </span>
                      ))}
                    </h3>
                    <p className="flow__desc">{s.desc}</p>
                  </div>
                ))}
              </div>
              <div className="flow__meter" aria-hidden>
                <span className="flow__meter-pct" ref={pct}>00%</span>
                <span className="flow__meter-bar"><i /></span>
                <span className="flow__meter-txt">스크롤해서 넘겨 보세요</span>
              </div>
            </div>

            <div className="flow__stage" aria-hidden>
              <svg viewBox="0 0 480 320" className="flow__svg">
                <defs>
                  {/* 무대 전체에 걸친 빛줄기(파랑 → 보라). 도형마다 따로 계산하게 두면(기본값) 완전히
                      가로·세로로 선 직선은 넓이가 0이라 그라디언트가 아예 안 그려진다 — 빛살의 1/3이 사라진다. */}
                  <linearGradient id="flBeam" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="480" y2="0">
                    <stop offset="0" stopColor="#3b82f6" />
                    <stop offset="0.5" stopColor="#6d5ae0" />
                    <stop offset="1" stopColor="#8b5cf6" />
                  </linearGradient>
                  <linearGradient id="flBeamV" x1="0" y1="1" x2="0" y2="0">
                    <stop offset="0" stopColor="#3b82f6" stopOpacity="0.15" />
                    <stop offset="1" stopColor="#8b5cf6" stopOpacity="0.85" />
                  </linearGradient>
                  <radialGradient id="flGlow" cx="0.5" cy="0.5" r="0.5">
                    <stop offset="0" stopColor="#8b5cf6" stopOpacity="0.5" />
                    <stop offset="0.6" stopColor="#6d5ae0" stopOpacity="0.12" />
                    <stop offset="1" stopColor="#6d5ae0" stopOpacity="0" />
                  </radialGradient>
                  <linearGradient id="flCard" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor="#2f6fe0" />
                    <stop offset="0.55" stopColor="#6d5ae0" />
                    <stop offset="1" stopColor="#9a6bff" />
                  </linearGradient>
                  <linearGradient id="flShine" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0" stopColor="#fff" stopOpacity="0" />
                    <stop offset="0.5" stopColor="#fff" stopOpacity="0.45" />
                    <stop offset="1" stopColor="#fff" stopOpacity="0" />
                  </linearGradient>
                  <linearGradient id="flArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#8b5cf6" stopOpacity="0.4" />
                    <stop offset="1" stopColor="#3b82f6" stopOpacity="0" />
                  </linearGradient>
                  <clipPath id="flCardClip"><rect x="52" y="84" width="200" height="126" rx="14" /></clipPath>
                </defs>

                {/* ── 바탕: 도면 격자, 도는 원, 재단선, 떠오르는 입자, 단계마다 자리를 옮기는 빛 ── */}
                <g className="fl-amb">
                  <circle className="fl-blob" cx="240" cy="160" r="170" fill="url(#flGlow)" />
                  <g className="fl-grid">
                    {Array.from({ length: 13 }, (_, i) => <line key={`v${i}`} x1={i * 40} y1="0" x2={i * 40} y2="320" />)}
                    {Array.from({ length: 9 }, (_, i) => <line key={`h${i}`} x1="0" y1={i * 40} x2="480" y2={i * 40} />)}
                  </g>
                  <circle className="fl-orbit fl-orbit--a" cx="240" cy="160" r="150" />
                  <circle className="fl-orbit fl-orbit--b" cx="240" cy="160" r="122" />
                  <path className="fl-crop" d="M12 34V12H34M446 12H468V34M12 286V308H34M446 308H468V286" />
                  {MOTES.map(([x, y, d, delay], i) => (
                    <circle key={i} className="fl-mote" cx={x} cy={y} r={i % 3 === 0 ? 1.8 : 1.2} style={{ "--d": `${d}s`, "--dl": `${-delay}s` }} />
                  ))}
                  <g className="fl-figs">
                    {STEPS.map((s, i) => (
                      <text key={s.key} className="fl-fig" x="24" y="300" style={{ "--n": i }}>FIG. {String(i + 1).padStart(2, "0")} — {s.en}</text>
                    ))}
                  </g>
                </g>

                {/* ── 01 아이디어: 흩어진 스케치가 전구로 모이고, 전구가 그려져 불이 들어온다 ── */}
                <g className="flow__scene flow__scene--0">
                  <circle className="fl fl-fade fl-breath" style={at(0.5, 3)} cx="240" cy="128" r="116" fill="url(#flGlow)" />
                  {Array.from({ length: 12 }, (_, i) => {
                    const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
                    const r1 = 84;
                    const r2 = i % 2 ? 98 : 110;
                    return (
                      <line key={i} className="fl fl-fade fl-ray" style={{ ...at(0.58, 4), "--k": i }}
                        x1={(240 + Math.cos(a) * r1).toFixed(1)} y1={(128 + Math.sin(a) * r1).toFixed(1)}
                        x2={(240 + Math.cos(a) * r2).toFixed(1)} y2={(128 + Math.sin(a) * r2).toFixed(1)} />
                    );
                  })}
                  <g className="fl fl-fade" style={at(0.62, 4)}>
                    <g className="fl-spin"><circle className="fl-electron" cx="364" cy="128" r="3" /></g>
                    <g className="fl-spin fl-spin--rev"><circle className="fl-electron" cx="140" cy="128" r="2.2" /></g>
                  </g>
                  {/* 왼쪽·오른쪽의 작은 스케치들 */}
                  <g className="fl-sketch">
                    <rect className="fl fl-draw" style={at(0.08, 3)} pathLength="1" x="52" y="62" width="46" height="80" rx="8" />
                    <path className="fl fl-draw" style={at(0.14, 4)} pathLength="1" d="M62 76h26M62 86h18M62 118h26" />
                    <rect className="fl fl-draw" style={at(0.18, 3)} pathLength="1" x="40" y="176" width="88" height="58" rx="6" />
                    <path className="fl fl-draw" style={at(0.24, 4)} pathLength="1" d="M40 190h88M52 204h40M52 214h28" />
                    <path className="fl fl-draw" style={at(0.28, 3)} pathLength="1" d="M372 120V96M388 120V80M404 120V104M420 120V70M364 120H430" />
                    <path className="fl fl-draw" style={at(0.34, 3)} pathLength="1" d="M366 164h62a8 8 0 0 1 8 8v22a8 8 0 0 1 -8 8h-38l-12 10v-10h-12a8 8 0 0 1 -8 -8v-22a8 8 0 0 1 8 -8z" />
                  </g>
                  <path className="fl fl-fade fl-link" style={at(0.38, 4)} d="M98 102C140 102 150 118 182 124M128 204C160 196 168 170 196 158M364 100C330 100 322 112 298 120M358 184C332 178 318 166 292 154" />
                  <path className="fl fl-draw fl-bulb" style={at(0, 1.6)} pathLength="1" d="M240 64a62 62 0 0 1 38 111v24h-76v-24a62 62 0 0 1 38 -111z" />
                  <path className="fl fl-draw fl-hilite" style={at(0.46, 5)} pathLength="1" d="M204 112a40 40 0 0 1 24 -26" />
                  <path className="fl fl-draw fl-bulb" style={at(0.3, 2.5)} pathLength="1" d="M212 212h56M216 224h48M222 236h36M232 248h16" />
                  <path className="fl fl-fade fl-filament" style={at(0.5, 4)} d="M240 199V170M222 158l9 -18l9 18l9 -18l9 18" />
                  {[[176, 66, 7], [312, 56, 9], [330, 176, 6], [160, 170, 5], [286, 32, 5]].map(([x, y, r], i) => (
                    <path key={i} className="fl fl-pop fl-twinkle" style={{ ...at(0.68 + i * 0.04, 6), "--k": i }} d={star(x, y, r)} />
                  ))}
                  <g className="fl fl-rise" style={at(0.74, 5)}>
                    <rect className="fl-chip" x="158" y="268" width="164" height="34" rx="17" />
                    <text className="fl-chip-txt" x="240" y="290">예약 받는 앱 만들래요</text>
                  </g>
                </g>

                {/* ── 02 견적: 항목이 하나씩 적히고, 서명하고, "확정" 도장이 찍힌다 ── */}
                <g className="flow__scene flow__scene--1">
                  <rect className="fl fl-fade fl-sheet-back" style={at(0, 3)} x="146" y="36" width="216" height="264" rx="8" transform="rotate(4 254 168)" />
                  <rect className="fl-sheet" x="132" y="28" width="216" height="264" rx="8" />
                  <text className="fl-h" x="152" y="60">견적서</text>
                  <text className="fl-mono fl-end" x="328" y="58">No. 001</text>
                  <path className="fl fl-draw fl-rule" style={at(0.02, 5)} pathLength="1" d="M152 72H328" />
                  {QUOTE_ROWS.map(([label, w], i) => {
                    const y = 98 + i * 28;
                    return (
                      <g key={label}>
                        <path className="fl fl-draw fl-tick" style={at(0.08 + i * 0.1, 7)} pathLength="1" d={`M154 ${y}l4 4l8 -9`} />
                        <text className="fl fl-fade fl-item" style={at(0.1 + i * 0.1, 7)} x="174" y={y + 4}>{label}</text>
                        <rect className="fl fl-gxr fl-amt" style={at(0.13 + i * 0.1, 6)} x={328 - w * 0.62} y={y - 4} width={w * 0.62} height="8" rx="4" />
                      </g>
                    );
                  })}
                  <path className="fl fl-draw fl-cross" style={at(0.5, 7)} pathLength="1" d="M154 205l10 10M164 205l-10 10" />
                  <text className="fl fl-fade fl-item fl-item--off" style={at(0.52, 7)} x="174" y="214">범위 밖 기능</text>
                  <path className="fl fl-draw fl-strike" style={at(0.56, 7)} pathLength="1" d="M172 210H250" />
                  <path className="fl fl-draw fl-rule" style={at(0.6, 6)} pathLength="1" d="M152 228H328" />
                  <text className="fl fl-fade fl-sum" style={at(0.62, 6)} x="152" y="250">합계 · 기간</text>
                  <rect className="fl fl-gxr fl-total" style={at(0.64, 5)} x="244" y="240" width="84" height="12" rx="4" />
                  <path className="fl fl-draw fl-sign" style={at(0.7, 5)} pathLength="1" d="M154 278c6 -14 12 8 18 -4s8 12 16 -2s10 8 18 -4s10 4 20 -2" />
                  <g className="fl fl-stamp" style={at(0.8, 6)}>
                    <circle className="fl-impact" cx="344" cy="226" r="40" />
                    <circle className="fl-stamp-o" cx="344" cy="226" r="38" />
                    <circle className="fl-stamp-i" cx="344" cy="226" r="31" />
                    <text className="fl-stamp-t" x="344" y="233">확정</text>
                  </g>
                </g>

                {/* ── 03 사이트: 주소가 쳐지고, 화면이 조립되고, 옆에서 폰 화면이 올라온다 ── */}
                <g className="flow__scene flow__scene--2">
                  <rect className="fl-win" x="40" y="30" width="330" height="236" rx="10" />
                  <path className="fl-win-bar" d="M40 58H370" />
                  <circle className="fl-win-dot" cx="56" cy="44" r="4" /><circle className="fl-win-dot" cx="70" cy="44" r="4" /><circle className="fl-win-dot" cx="84" cy="44" r="4" />
                  <rect className="fl-url" x="104" y="36" width="210" height="16" rx="8" />
                  <path className="fl-lock" d="M113 44h6v5h-6zM114.5 44v-2a1.5 1.5 0 0 1 3 0v2" />
                  <text className="fl fl-type fl-url-txt" style={at(0.02, 4)} x="126" y="48">yourbrand.com</text>
                  <circle className="fl fl-pop fl-k-beam" style={at(0.1, 8)} cx="62" cy="74" r="5" />
                  {[0, 1, 2].map((i) => <rect key={i} className="fl fl-gx fl-k-dim" style={at(0.12 + i * 0.03, 8)} x={238 + i * 30} y="71" width="20" height="5" rx="2.5" />)}
                  <rect className="fl fl-pop fl-k-beam" style={at(0.2, 8)} x="330" y="67" width="28" height="13" rx="4" />
                  <rect className="fl fl-gx fl-k-ink" style={at(0.24, 6)} x="56" y="94" width="132" height="12" rx="3" />
                  <rect className="fl fl-gx fl-k-ink" style={at(0.29, 6)} x="56" y="111" width="98" height="12" rx="3" />
                  <rect className="fl fl-gx fl-k-dim" style={at(0.34, 6)} x="56" y="131" width="122" height="5" rx="2.5" />
                  <rect className="fl fl-gx fl-k-dim" style={at(0.37, 6)} x="56" y="141" width="92" height="5" rx="2.5" />
                  <rect className="fl fl-pop fl-k-beam" style={at(0.42, 7)} x="56" y="154" width="58" height="17" rx="4" />
                  <g className="fl fl-pop" style={at(0.3, 5)}>
                    <rect className="fl-img" x="214" y="90" width="142" height="82" rx="7" />
                    <circle className="fl-sun" cx="326" cy="112" r="8" />
                    <path className="fl-hill" d="M221 165l32 -36l22 22l18 -16l56 30z" />
                  </g>
                  {[0, 1, 2].map((i) => (
                    <g key={i} className="fl fl-rise" style={at(0.5 + i * 0.07, 6)}>
                      <rect className="fl-cardlet" x={56 + i * 102} y="186" width="94" height="68" rx="7" />
                      <circle className="fl-k-beam" cx={72 + i * 102} cy="204" r="7" />
                      <rect className="fl-k-ink" x={66 + i * 102} y="222" width="62" height="5" rx="2.5" />
                      <rect className="fl-k-dim" x={66 + i * 102} y="233" width="44" height="5" rx="2.5" />
                    </g>
                  ))}
                  <g className="fl fl-phone" style={at(0.62, 4)}>
                    <rect className="fl-phone-body" x="358" y="112" width="92" height="178" rx="15" />
                    <rect className="fl-phone-notch" x="390" y="119" width="28" height="5" rx="2.5" />
                    <rect className="fl-img" x="368" y="134" width="72" height="40" rx="6" />
                    <rect className="fl-k-ink" x="368" y="184" width="56" height="7" rx="3" />
                    <rect className="fl-k-dim" x="368" y="197" width="44" height="4" rx="2" />
                    <rect className="fl-k-beam" x="368" y="210" width="40" height="13" rx="4" />
                    <rect className="fl-cardlet" x="368" y="234" width="72" height="42" rx="6" />
                  </g>
                  <rect className="fl-build-bg" x="40" y="280" width="300" height="3" rx="1.5" />
                  <rect className="fl fl-gx fl-k-beam" style={at(0, 1)} x="40" y="280" width="300" height="3" rx="1.5" />
                  <text className="fl-mono" x="40" y="300">BUILD · 매주 공유</text>
                  <circle className="fl fl-ripple" style={at(0.92, 9)} cx="86" cy="163" r="16" />
                  <g className="fl fl-cursor" style={at(0.8, 6)}><path d="M0 0L0 18L5 13L9 22L12 21L8 12L15 12Z" /></g>
                </g>

                {/* ── 04 결제: 광택이 흐르는 카드 → 흐르는 점선 → 눈금 달린 링이 차오르고 체크 ── */}
                <g className="flow__scene flow__scene--3">
                  <g className="fl fl-card" style={at(0, 2.4)}>
                    <rect x="52" y="84" width="200" height="126" rx="14" fill="url(#flCard)" />
                    <g clipPath="url(#flCardClip)"><rect className="fl-shine" x="-40" y="60" width="70" height="180" fill="url(#flShine)" /></g>
                    <rect className="fl-chip2" x="72" y="108" width="32" height="24" rx="5" />
                    <path className="fl-chip2-l" d="M72 120h32M88 108v24" />
                    <path className="fl-wave" d="M120 112a11 11 0 0 1 0 16M127 107a18 18 0 0 1 0 26M134 102a25 25 0 0 1 0 36" />
                    <text className="fl-card-no" x="72" y="170">•••• •••• •••• 4242</text>
                    <text className="fl-card-name" x="72" y="194">YOUR BRAND</text>
                    <circle className="fl-brand" cx="218" cy="188" r="10" /><circle className="fl-brand fl-brand--b" cx="232" cy="188" r="10" />
                  </g>
                  <path className="fl fl-fade fl-stream" style={at(0.28, 5)} d="M254 148H306" />
                  <g className="fl-ticks">
                    {Array.from({ length: 36 }, (_, i) => {
                      const a = (i / 36) * Math.PI * 2;
                      const r1 = 64;
                      const r2 = i % 3 ? 68 : 72;
                      return <line key={i} x1={(364 + Math.cos(a) * r1).toFixed(1)} y1={(148 + Math.sin(a) * r1).toFixed(1)} x2={(364 + Math.cos(a) * r2).toFixed(1)} y2={(148 + Math.sin(a) * r2).toFixed(1)} />;
                    })}
                  </g>
                  <circle className="fl-ring-bg" cx="364" cy="148" r="54" />
                  <circle className="fl fl-draw fl-ring" style={at(0.3, 1.9)} cx="364" cy="148" r="54" pathLength="1" />
                  <circle className="fl fl-pop fl-done-glow" style={at(0.88, 7)} cx="364" cy="148" r="44" />
                  <path className="fl fl-out fl-padlock" style={at(0.8, 8)} d="M352 146h24v20h-24zM357 146v-7a7 7 0 0 1 14 0v7" />
                  <path className="fl fl-draw fl-check" style={at(0.84, 7)} pathLength="1" d="M342 150l15 15l28 -32" />
                  <text className="fl fl-rise fl-pay-txt" style={at(0.88, 7)} x="364" y="238">결제 완료</text>
                  <g className="fl fl-rise" style={at(0.9, 7)}>
                    <path className="fl-receipt" d="M72 228h160v50l-10 -6l-10 6l-10 -6l-10 6l-10 -6l-10 6l-10 -6l-10 6l-10 -6l-10 6l-10 -6l-10 6l-10 -6l-10 6l-10 -6l-10 6z" />
                    <circle className="fl-ok" cx="90" cy="246" r="7" /><path className="fl-ok-tick" d="M86 246l3 3l5 -6" />
                    <rect className="fl-k-ink" x="106" y="241" width="70" height="5" rx="2.5" /><rect className="fl-k-dim" x="106" y="252" width="48" height="4" rx="2" />
                    <rect className="fl-k-beam" x="190" y="240" width="30" height="8" rx="4" />
                  </g>
                </g>

                {/* ── 05 성공: 막대가 서고, 선이 올라가고, 점이 찍히고, 지표가 떠오른다 ── */}
                <g className="flow__scene flow__scene--4">
                  <path className="fl fl-draw fl-hline" style={at(0, 3)} pathLength="1" d="M60 110H340M60 150H340M60 190H340M60 230H340" />
                  <path className="fl-axis" d="M60 66V250H344" />
                  {BARS.map((h, i) => <rect key={i} className="fl fl-gy fl-bar" style={at(0.04 + i * 0.05, 5)} x={72 + i * 38} y={250 - h} width="20" height={h} rx="3" />)}
                  <path className="fl fl-fade fl-area" style={at(0.45, 2.4)} d={`M${PTS[0][0]} 250${PTS.map(([x, y]) => `L${x} ${y}`).join("")}L${PTS[PTS.length - 1][0]} 250Z`} />
                  <polyline className="fl fl-draw fl-chart" style={at(0.18, 1.5)} pathLength="1" points={PTS.map((p) => p.join(",")).join(" ")} />
                  {PTS.map(([x, y], i) => <circle key={i} className="fl fl-pop fl-pt" style={at(0.22 + i * 0.095, 9)} cx={x} cy={y} r="4.5" />)}
                  <circle className="fl fl-fade fl-halo" style={at(0.84, 6)} cx={PTS[6][0]} cy={PTS[6][1]} r="9" />
                  {Array.from({ length: 10 }, (_, i) => {
                    const a = (i / 10) * Math.PI * 2;
                    const [x, y] = PTS[6];
                    return <line key={i} className="fl fl-fade fl-spark" style={{ ...at(0.86, 6), "--k": i }} x1={(x + Math.cos(a) * 12).toFixed(1)} y1={(y + Math.sin(a) * 12).toFixed(1)} x2={(x + Math.cos(a) * 22).toFixed(1)} y2={(y + Math.sin(a) * 22).toFixed(1)} />;
                  })}
                  <g className="fl fl-rise" style={at(0.5, 5)}>
                    <rect className="fl-live-bg" x="60" y="30" width="108" height="28" rx="14" />
                    <circle className="fl-live-ring" cx="78" cy="44" r="5" /><circle className="fl-live-dot" cx="78" cy="44" r="5" />
                    <text className="fl-live-txt" x="92" y="49">운영 중</text>
                  </g>
                  {/* 월 매출 — 숫자는 스크롤이 적는다(위 apply). 세로축 끝에 시작값과 도착값을 적어 둔다. */}
                  <text className="fl-axis-k" x="54" y={PTS[0][1] + 3}>$1.4K</text>
                  <text className="fl fl-fade fl-axis-k fl-axis-k--top" style={at(0.8, 6)} x="54" y={PTS[6][1] + 3}>$2.8M</text>
                  <g className="fl fl-rise" style={at(0.12, 5)}>
                    <text className="fl-rev-k" x="360" y="40">월 매출 · 예시</text>
                    <text className="fl-rev" x="360" y="66" ref={rev}>{usd(REV_FROM)}</text>
                  </g>
                  {["방문", "가입", "결제"].map((label, i) => (
                    <g key={label} className="fl fl-rise" style={at(0.56 + i * 0.1, 6)}>
                      <rect className="fl-stat" x="360" y={88 + i * 54} width="104" height="42" rx="9" />
                      <text className="fl-stat-k" x="372" y={105 + i * 54}>{label}</text>
                      <path className="fl-up" d={`M446 ${102 + i * 54}l5 -6l5 6`} />
                      <path className="fl-mini" d={`M372 ${122 + i * 54}l12 -4l10 2l12 -8l12 3l14 -10l18 -3`} />
                    </g>
                  ))}
                  {[[116, 9, 0], [170, 11, 2], [224, 8, 4], [282, 10, 1], [330, 12, 3], [200, 13, 5]].map(([x, d, dl], i) => (
                    <rect key={i} className="fl fl-fade fl-confetti" style={{ ...at(0.88, 6), "--d": `${d * 0.35}s`, "--dl": `${-dl * 0.4}s` }} x={x} y="236" width="4" height="8" rx="1.5" />
                  ))}
                </g>
              </svg>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
