// 갈림길 화면 — 개인이 쓰러 왔는지, 기업이 도입하러 왔는지 가른다.
//
// 이 화면은 클릭을 하나 더 요구하므로, 그 클릭값을 해야 한다. 그래서 선택지만 두 개
// 던지지 않고 각 길에서 무엇을 얻는지를 카드 안에 적는다. "개인용/기업용" 두 글자만
// 있는 갈림길은 방문자에게 판단 근거를 주지 않고 이탈만 만든다.
import { navigate, ROUTES } from "./routes.js";

const UI = {
  ink: "#1D1A24",
  ink2: "#5E5870",
  ink3: "#9A93AC",
  accent: "#6B4FA8",
  hairline: "rgba(60, 40, 110, 0.10)",
};

function Card({ eyebrow, title, desc, points, cta, to, dark }) {
  const fg = dark ? "#fff" : UI.ink;
  const sub = dark ? "#CFC9DE" : UI.ink2;
  return (
    <button
      onClick={() => navigate(to)}
      style={{
        textAlign: "left", cursor: "pointer", display: "flex", flexDirection: "column",
        padding: "clamp(24px, 3.4vw, 34px)", borderRadius: 26, gap: 12,
        border: dark ? "none" : `1px solid ${UI.hairline}`,
        background: dark ? "#1F1B2E" : "rgba(255,255,255,0.86)",
        boxShadow: dark
          ? "0 24px 60px rgba(24,16,44,0.28)"
          : "0 1px 2px rgba(40,20,90,0.04), 0 12px 32px rgba(60,35,120,0.07)",
        transition: "transform .18s ease, box-shadow .18s ease",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-3px)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; }}
    >
      <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: dark ? "#A88BEA" : UI.ink3 }}>
        {eyebrow}
      </div>
      <div style={{ fontSize: "clamp(21px, 2.4vw, 26px)", fontWeight: 700, letterSpacing: "-0.03em", color: fg, lineHeight: 1.3 }}>
        {title}
      </div>
      <div style={{ fontSize: 14.5, color: sub, lineHeight: 1.65 }}>{desc}</div>
      <ul style={{ margin: "4px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 7 }}>
        {points.map((p) => (
          <li key={p} style={{ fontSize: 13.5, color: sub, lineHeight: 1.6, paddingLeft: 17, position: "relative" }}>
            <span aria-hidden="true" style={{ position: "absolute", left: 0, color: dark ? "#A88BEA" : UI.accent }}>·</span>
            {p}
          </li>
        ))}
      </ul>
      <div style={{ marginTop: "auto", paddingTop: 16, fontSize: 14.5, fontWeight: 600, color: dark ? "#A88BEA" : UI.accent }}>
        {cta} →
      </div>
    </button>
  );
}

export default function HomeGate() {
  return (
    <main
      style={{
        minHeight: "100dvh", display: "flex", flexDirection: "column", justifyContent: "center",
        padding: "calc(40px + var(--yume-safe-top)) 20px calc(40px + var(--yume-safe-bottom))",
        background: "radial-gradient(120% 80% at 50% 0%, #F3ECFD 0%, #F6F2FC 55%, #F6F2FC 100%)",
      }}
    >
      <div style={{ width: "min(940px, 100%)", margin: "0 auto" }}>
        <header style={{ textAlign: "center", marginBottom: "clamp(28px, 4vw, 44px)" }}>
          <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.3em", color: UI.accent, textTransform: "uppercase" }}>YUME</div>
          <h1 style={{ fontSize: "clamp(28px, 4.4vw, 46px)", fontWeight: 700, letterSpacing: "-0.035em", color: UI.ink, margin: "14px 0 0", lineHeight: 1.2, textWrap: "balance" }}>
            AI는 확신에 차서 틀립니다
          </h1>
          <p style={{ fontSize: "clamp(15px, 1.6vw, 18px)", color: UI.ink2, lineHeight: 1.65, margin: "14px auto 0", maxWidth: "46ch" }}>
            유메는 AI 답변 속 사실 주장을 법제처 공식 데이터와 웹으로 대조하고,
            지어낸 법령·판례·통계를 찾아냅니다.
          </p>
        </header>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))", gap: 16, alignItems: "stretch" }}>
          <Card
            eyebrow="개인"
            title="AI 답변, 믿어도 되는지 확인하기"
            desc="ChatGPT·클로드가 준 답을 붙여넣으면 주장별로 사실 여부를 가려 드립니다."
            points={[
              "법률 주장은 법제처 조문 원문과 직접 대조",
              "지어낸 판례·법령·논문은 부존재 신뢰도로 판정",
              "무료로 하루 5회, 가입 없이 바로 사용",
            ]}
            cta="바로 확인해보기"
            to={ROUTES.app}
          />
          <Card
            dark
            eyebrow="기업"
            title="우리 회사 AI, 거짓말을 할까?"
            desc="도입을 권하기 전에 먼저 점검해 드립니다. 정답을 미리 아는 질문으로 귀사 AI를 시험합니다."
            points={[
              "무료 할루시네이션 점검 — 가입도 API 키도 불필요",
              "결과가 깨끗하면 도입을 권하지 않습니다",
              "검증 API·데이터셋·업종별 솔루션",
            ]}
            cta="무료로 점검받기"
            to={ROUTES.business}
          />
        </div>

        <div style={{ textAlign: "center", marginTop: 28, fontSize: 13, color: UI.ink3 }}>
          <a href="/docs/api" className="yume-link" style={{ color: UI.ink3 }}>API 문서</a>
          <span style={{ margin: "0 10px", opacity: 0.5 }}>·</span>
          <a href="/terms" className="yume-link" style={{ color: UI.ink3 }}>이용약관</a>
          <span style={{ margin: "0 10px", opacity: 0.5 }}>·</span>
          <a href="/privacy" className="yume-link" style={{ color: UI.ink3 }}>개인정보처리방침</a>
        </div>
      </div>
    </main>
  );
}
