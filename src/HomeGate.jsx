// 홈(/) — Originkit hero-40 레이아웃 기반.
//
// hero-40은 전면 히어로 하나에 CTA가 하나인 구성이다. 유메는 여기서 개인과 기업을
// 갈라야 하므로 CTA 자리를 둘로 늘렸다. 갈림길은 클릭을 하나 더 요구하니 그 값을
// 해야 한다 — 그래서 버튼에 "개인/기업" 두 글자만 두지 않고, 각 길에서 무엇을 얻는지를
// 바로 옆에 적었다.
//
// 아래로는 원래 개인 화면에 붙어 있던 스토리텔링 섹션이 이어진다. 설득은 여기서 하고
// /app은 쓰는 곳으로만 남긴다.
import DitherReveal from "./components/originkit/DitherReveal.jsx";
import HomeSections from "./HomeSections.jsx";
import { navigate, ROUTES } from "./routes.js";
import { UI } from "./theme.js";
import "./home.css";

const NAV = [
  { label: "개인용", to: ROUTES.app },
  { label: "기업용", to: ROUTES.business },
  { label: "API", href: "/docs/api" },
];

export default function HomeGate() {
  return (
    <main className="home">
      <section className="home-hero">
        <div className="home-noise" aria-hidden="true" />

        <div className="home-dither" aria-hidden="true">
          <DitherReveal image={{ src: "/originkit/hero-40/white-hands.png", alt: "" }} />
        </div>

        <header className="home-header">
          <button className="home-brand" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} aria-label="유메 홈">
            YUME
          </button>

          <nav className="home-nav" aria-label="주요 메뉴">
            {NAV.map((item) =>
              item.href ? (
                <a key={item.label} href={item.href}>{item.label}</a>
              ) : (
                <button key={item.label} onClick={() => navigate(item.to)}>{item.label}</button>
              ),
            )}
          </nav>

          <button className="home-header-cta" onClick={() => navigate(ROUTES.app)}>
            바로 확인하기
            <span aria-hidden="true">↗</span>
          </button>
        </header>

        <div className="home-hero-content">
          <p className="home-eyebrow">AI 답변 팩트체크</p>
          <h1 className="home-title">
            <span className="home-line home-line-muted">AI는 확신에 차서</span>
            <span className="home-line">틀린 말을 합니다</span>
          </h1>
          <p className="home-copy">
            유메는 AI 답변 속 사실 주장을 법제처 공식 데이터와 대조하고,
            <br className="home-break" /> 지어낸 법령·판례·통계를 찾아냅니다.
          </p>

          <div className="home-actions">
            <button className="home-cta" onClick={() => navigate(ROUTES.app)}>
              개인으로 확인하기
              <span aria-hidden="true">↗</span>
            </button>
            <button className="home-cta home-cta-ghost" onClick={() => navigate(ROUTES.business)}>
              기업으로 점검받기
              <span aria-hidden="true">↗</span>
            </button>
          </div>

          <p className="home-actions-note">
            개인은 가입 없이 바로 · 기업은 무료 할루시네이션 점검부터
          </p>
        </div>

        <footer className="home-hero-footer">
          <p>확인된 사실만 전달합니다.</p>
          <a className="home-scroll-cue" href="#why">
            아래로 <span aria-hidden="true">↓</span>
          </a>
          <p>
            법률·의료·금융·역사·과학
            <br /> 어떤 주제든 주장 단위로 확인합니다.
          </p>
        </footer>
      </section>

      <div id="why">
        <HomeSections onStart={() => navigate(ROUTES.app)} />
      </div>

      <footer className="home-foot">
        <div className="home-foot-inner">
          <div className="home-foot-brand">YUME</div>
          <nav className="home-foot-links" aria-label="바닥글 메뉴">
            <button onClick={() => navigate(ROUTES.app)}>개인용</button>
            <button onClick={() => navigate(ROUTES.business)}>기업용</button>
            <a href="/docs/api">API 문서</a>
            <a href="/terms">이용약관</a>
            <a href="/privacy">개인정보처리방침</a>
          </nav>
        </div>
        <div className="home-foot-note" style={{ color: UI.ink3 }}>
          판정은 참고 정보이며 전문가의 자문을 대신하지 않습니다.
        </div>
      </footer>
    </main>
  );
}
