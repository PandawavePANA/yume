import { useEffect, useRef } from "react";
import "./reamer.css";
import "@/components/reamer/site.css";
import SiteBackdrop from "@/components/reamer/SiteBackdrop";
import Logo from "@/components/reamer/Logo";

// Characters are split into spans so the global cursor-tile trail can flip
// them dark as a tile passes underneath.
const Chars = ({ text }) =>
  Array.from(text).map((ch, i) =>
    ch === " " ? " " : (
      <span className="trail-ch" key={i}>
        {ch}
      </span>
    ),
  );

function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll("[data-reveal]");
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("is-in");
          io.unobserve(entry.target);
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}

// Scroll-scrubbed timeline spine. Written straight to a CSS variable so it
// tracks the scrollbar without a React render per frame.
function useTimelineFill(ref) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    let current = 0;
    const update = () => {
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const span = rect.height + vh * 0.35;
      const target = Math.min(
        1,
        Math.max(0, (vh * 0.82 - rect.top) / Math.max(span, 1)),
      );
      current += (target - current) * 0.18;
      el.style.setProperty("--fill", `${current * 100}%`);
      raf = requestAnimationFrame(update);
    };
    raf = requestAnimationFrame(update);
    return () => cancelAnimationFrame(raf);
  }, [ref]);
}

function useScrolledNav(ref) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = () => {
      el.classList.toggle("is-scrolled", window.scrollY > 80);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [ref]);
}

function useCardGlow() {
  useEffect(() => {
    const cards = Array.from(document.querySelectorAll(".card"));
    const onMove = (e) => {
      const el = e.currentTarget;
      const r = el.getBoundingClientRect();
      el.style.setProperty("--mx", `${e.clientX - r.left}px`);
      el.style.setProperty("--my", `${e.clientY - r.top}px`);
    };
    cards.forEach((c) => c.addEventListener("pointermove", onMove));
    return () => cards.forEach((c) => c.removeEventListener("pointermove", onMove));
  }, []);
}

const NAV = [
  { label: "제품", href: "#products" },
  { label: "소개", href: "#about" },
  { label: "포트폴리오", href: "#portfolio" },
  { label: "문의", href: "#contact" },
];

const SPECS = [
  { k: "설립", v: "2026" },
  { k: "대표", v: "정원영" },
  { k: "제품", v: "유메 · 아이픽 · 오토레이" },
  { k: "분야", v: "AI 소프트웨어" },
];

const PRODUCTS = [
  {
    no: "01",
    status: "운영 중",
    live: true,
    name: "유메",
    en: "YUME",
    desc: "AI 답변을 위한 팩트체크. 답변 속 사실 주장을 추출해 공식 자료와 실시간 웹으로 검증하고, 무엇이 맞고 무엇이 확인되지 않았는지까지 구분해 보여줍니다.",
    href: "https://www.yume-reamer.com/",
    go: "yume-reamer.com",
  },
  {
    no: "02",
    status: "개발 중",
    name: "아이픽",
    en: "AIpick",
    desc: "대화형 상품 추천. 무엇을 찾는지 말하면 아이픽이 예산·용도·취향을 좁혀가는 질문을 던지고, 마지막엔 살 만한 상품 세 개만 남겨 보여줍니다.",
    go: "출시 예정",
  },
  {
    no: "03",
    status: "개발 중",
    name: "오토레이",
    en: "AutoRay",
    desc: "자동 매매 프로그램. 사람이 붙어 있지 않아도 정해둔 규칙대로 시장을 읽고 진입과 청산을 실행합니다.",
    go: "출시 예정",
  },
];

const PORTFOLIO = [
  {
    year: "2026",
    kind: "특허 출원",
    title: "검색공간 완전성 기반 부존재 신뢰도 정량화",
    en: "Quantifying Non-Existence Confidence Based on Search-Space Completeness",
    desc: "AI는 존재하지 않는 판례와 문헌을 실재하는 것처럼 지어냅니다. 그런데 검증하는 쪽에도 구멍이 있습니다 — 데이터베이스에서 찾지 못했다는 사실은 “없다”가 아니라 “찾아본 범위 안에는 없다”일 뿐이니까요. 이 발명은 그 판정을 이분법으로 내리지 않습니다. 탐색이 실제로 덮은 범위, 식별자의 형식오류, 유사 항목과의 근접도를 가중 결합해 부존재 신뢰도를 수치로 산출하고, 아직 확인하지 못한 영역이 어디인지까지 함께 제시합니다.",
    formula: "NEC = w₁·C + w₂·F + w₃·(1 − P)",
    tags: [
      "방법 청구항 9",
      "시스템 청구항 2",
      "기록매체 청구항 1",
      "유메 검증 엔진의 기반 기술",
    ],
    featured: true,
  },
  {
    year: "2026",
    kind: "제품 엔지니어링",
    title: "유메 검증 파이프라인",
    desc: "AI 답변에서 검증 가능한 사실 주장만 골라내고, 도메인에 따라 검증 경로를 나눕니다. 일반 주제는 웹 교차검증으로, 법률은 법제처 국가법령정보 공동활용 API를 직접 조회해 이중으로 확인합니다.",
    tags: ["React", "Express", "법제처 Open API", "Claude API"],
  },
  {
    year: "20XX",
    kind: "블록체인",
    title: "판다 익스체인지 (PAX)",
    desc: "BNB 체인 기반 디플레이션 토큰. 발행량이 알고리즘에 따라 자동으로 소각되어 시간이 지날수록 공급이 줄어드는 구조로, 인플레이션 헷지 자산을 목표로 설계했습니다.",
    tags: ["BNB Chain", "AI 자동 소각", "디플레이션", "인플레이션 헷지"],
    href: "https://www.paxpresale.com",
    go: "paxpresale.com",
  },
  {
    year: "20XX",
    kind: "트레이딩 시스템",
    title: "저스트로맨스 — 트레이딩 지표",
    desc: "시장을 읽는 관점을 세 갈래로 나눠 각각 독립된 프로그램으로 개발한 지표 프로젝트입니다.",
    tags: ["다윗", "골리앗", "노아"],
  },
  {
    year: "20XX",
    kind: "딥러닝",
    title: "폐렴 엑스레이 판독 모델",
    desc: "흉부 엑스레이 이미지에서 폐렴 소견을 판독하는 딥러닝 모델. 의료 영상 분류를 처음부터 끝까지 다뤄본 프로젝트입니다.",
    tags: ["딥러닝", "의료 영상", "이미지 분류"],
  },
];

const TIMELINE = [
  {
    year: "20XX",
    title: "정보올림피아드 전국 2위",
    desc: "학생 시절 전국 규모 정보올림피아드에서 2위에 입상하며 기술적 기반을 다졌습니다.",
  },
  {
    year: "20XX",
    title: "한국디지털미디어고등학교 해킹방어과 졸업",
    desc: "보안을 전공하며 시스템을 깊이 뜯어보는 훈련을 쌓았습니다.",
  },
  {
    year: "20XX",
    title: "중앙대학교 전자전기공학부 재학",
  },
  {
    year: "20XX",
    title: "딥러닝 기반 폐렴 환자 엑스레이 판독 프로그램 개발",
    desc: "흉부 엑스레이 이미지에서 폐렴 소견을 판독하는 딥러닝 모델을 만들었습니다.",
  },
  {
    year: "20XX",
    title: "前 판다웨이브 대표",
    desc: "첫 창업을 통해 제품을 처음부터 끝까지 만들고 책임지는 경험을 했습니다.",
  },
  {
    year: "20XX",
    title: "판다 익스체인지 발행",
    desc: "BNB 체인 기반 AI 자동 소각 디플레이션 토큰을 발행했습니다. 공급이 알고리즘에 따라 계속 줄어드는 구조로, 인플레이션 헷지 자산을 목표로 설계했습니다.",
  },
  {
    year: "20XX",
    title: "저스트로맨스 설립",
    desc: "트레이딩 지표 개발 프로젝트. 다윗 · 골리앗 · 노아 세 개의 프로그램으로 구성했습니다.",
  },
  {
    year: "20XX",
    title: "법정 분쟁 중 AI 오답으로 실제 피해",
    desc: "AI가 제시한 잘못된 정보를 믿었다가 실제 피해를 입은 경험이, 유메를 만들게 된 계기가 되었습니다.",
  },
  {
    year: "2026",
    title: "「검색공간 완전성 기반 부존재 신뢰도 정량화 방법 및 시스템」 특허 출원",
    desc: "“못 찾았다”를 “없다”로 단정하지 않고, 그 판정이 얼마나 믿을 만한지를 수치로 산출하는 방법과 시스템. 유메 검증 엔진의 기반 기술입니다.",
  },
  {
    year: "2026",
    title: "리머 설립 · 유메 출시",
    desc: "정밀함을 기준으로 삼은 AI 소프트웨어 스튜디오, 리머를 설립하고 유메를 출시했습니다.",
  },
  {
    year: "진행 중",
    title: "아이픽 · 오토레이 개발",
    desc: "대화형 AI 상품 추천 아이픽과 자동 매매 프로그램 오토레이를 함께 준비하고 있습니다. 유메까지 세 개 제품 체제로 운영합니다.",
    now: true,
  },
];

const ReamerSite = () => {
  const timelineRef = useRef(null);
  const navRef = useRef(null);
  useReveal();
  useCardGlow();
  useTimelineFill(timelineRef);
  useScrolledNav(navRef);

  return (
    <>
      <SiteBackdrop />

      <div className="site">
        <div className="site__rails" aria-hidden>
          <span className="site__rail site__rail--l" />
          <span className="site__rail site__rail--r" />
          <span className="site__rail site__rail--c" />
        </div>

        <nav className="nav" aria-label="Primary" ref={navRef}>
          <a className="nav__brand" href="#top">
            <Logo size={40} full />
            <span className="nav__word">REAMER</span>
          </a>
          <ul className="nav__links">
            {NAV.map((item) => (
              <li key={item.href}>
                <a className="nav__link" href={item.href}>
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
          <a className="nav__cta" href="#contact">
            문의하기
          </a>
        </nav>

        <main id="top">
          <section className="section section--hero">
            <div className="wrap">
              <p className="label" data-reveal>
                AI 소프트웨어 스튜디오
              </p>
              <h1 className="display" data-reveal style={{ "--d": "0.08s" }}>
                <Chars text="레드오션 속에" />
                <br className="force-break" />
                {" "}
                <Chars text="니치마켓이 있다" />
              </h1>
              <p className="lede" data-reveal style={{ "--d": "0.16s" }}>
                리머는 흐릿하게 남겨진 시장을 위한 소프트웨어를 만듭니다.
                대충 그어진 선을 다시 긋습니다 — 더 깨끗하고, 더 날카롭고,
                더 정확하게.
              </p>
              <div className="actions" data-reveal style={{ "--d": "0.24s" }}>
                <a className="btn btn--solid" href="#products">
                  제품 보기 <span className="btn__arrow">→</span>
                </a>
                <a className="btn btn--ghost" href="#about">
                  리머 소개
                </a>
              </div>

              <div className="spec" data-reveal style={{ "--d": "0.32s" }}>
                {SPECS.map((s) => (
                  <div key={s.k}>
                    <p className="spec__k">{s.k}</p>
                    <p className="spec__v">
                      <Chars text={s.v} />
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="section section--tall">
            <div className="wrap manifesto">
              <p className="label" data-reveal style={{ justifyContent: "center" }}>
                리머의 방식
              </p>
              <h2 className="title" data-reveal style={{ "--d": "0.08s" }}>
                <Chars text="리머는 흐린 것을 다듬는다." />
                <span className="manifesto__pause" aria-hidden>
                  · ·
                </span>
                <Chars text="리머는 지금도 다듬고 있다." />
              </h2>
              <p className="lede" data-reveal style={{ "--d": "0.16s" }}>
                모든 시장은 처음엔 거칠게 시작됩니다. 리머가 하는 일은
                대충 그어진 경계를 찾아, 그 위에 발 디딜 수 있는 선을
                다시 긋는 것입니다.
              </p>
            </div>
          </section>

          <section className="section" id="products">
            <div className="wrap">
              <p className="label" data-reveal>
                제품
              </p>
              <h2 className="title" data-reveal style={{ "--d": "0.08s" }}>
                <Chars text="세 개의 제품." />
                <br className="force-break" />
                {" "}
                <Chars text="하나의 기준." />
              </h2>
              <p className="lede" data-reveal style={{ "--d": "0.14s" }}>
                리머는 유메 · 아이픽 · 오토레이 세 개 제품 체제로
                운영합니다. 각각 다른 시장을 보지만, 기준은 하나입니다 —
                흐릿한 판단을 정확한 판단으로 바꾼다.
              </p>

              <div className="cards cards--3">
                {PRODUCTS.map((p, i) => {
                  const inner = (
                    <>
                      <div className="card__top">
                        <span
                          className={`card__status${p.live ? " card__status--live" : ""}`}
                        >
                          {p.status}
                        </span>
                        <span className="card__status">{p.no}</span>
                      </div>
                      <h3 className="card__name">
                        <Chars text={p.name} />
                      </h3>
                      <p className="card__en">{p.en}</p>
                      <p className="card__desc">{p.desc}</p>
                      <span className="card__go">
                        {p.go}
                        {p.href ? <span className="btn__arrow"> →</span> : null}
                      </span>
                    </>
                  );
                  const style = { "--d": `${0.12 + i * 0.08}s` };
                  return p.href ? (
                    <a
                      className="card"
                      key={p.name}
                      data-reveal
                      style={style}
                      href={p.href}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {inner}
                    </a>
                  ) : (
                    <div className="card" key={p.name} data-reveal style={style}>
                      {inner}
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          <section className="section" id="about">
            <div className="wrap">
              <p className="label" data-reveal>
                소개
              </p>
              <h2 className="title" data-reveal style={{ "--d": "0.08s" }}>
                <Chars text="정원영" />
              </h2>
              <p className="lede" data-reveal style={{ "--d": "0.16s" }}>
                리머 대표. 한국디지털미디어고 해킹방어과를 거쳐 중앙대학교
                전자전기공학부에 재학 중이며, 여러 번의 창업과 스스로 겪은 AI
                오답의 피해를 계기로 리머를 시작했습니다.
              </p>
              <blockquote
                className="founder__quote"
                data-reveal
                style={{ "--d": "0.24s" }}
              >
                “대충 뚫린 구멍은, 결국 누군가 대가를 치른다는 걸 직접
                겪었습니다.”
              </blockquote>

              <div className="timeline" ref={timelineRef}>
                <span className="timeline__track" aria-hidden />
                <span
                  className="timeline__fill"
                  aria-hidden
                  style={{ height: "var(--fill, 0%)" }}
                />
                {TIMELINE.map((item, i) => (
                  <div
                    className={`tl${item.now ? " tl--now" : ""}`}
                    key={item.title}
                    data-reveal
                    style={{ "--d": `${(i % 3) * 0.08}s` }}
                  >
                    <span className="tl__dot" aria-hidden />
                    <span className="tl__year">{item.year}</span>
                    <h3 className="tl__title">
                      <Chars text={item.title} />
                    </h3>
                    {item.desc && <p className="tl__desc">{item.desc}</p>}
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="section" id="portfolio">
            <div className="wrap">
              <p className="label" data-reveal>
                개발 포트폴리오
              </p>
              <h2 className="title" data-reveal style={{ "--d": "0.08s" }}>
                <Chars text="만든 것들." />
              </h2>
              <p className="lede" data-reveal style={{ "--d": "0.14s" }}>
                의료 영상 판독 모델부터 디플레이션 토큰, 트레이딩 지표,
                그리고 AI 사실검증 특허까지 — 분야는 달라도 매번 같은
                질문을 붙들었습니다. 이 판단을 어디까지 믿을 수 있는가.
              </p>

              <div className="folio">
                {PORTFOLIO.map((item, i) => {
                  const inner = (
                    <>
                      <div className="folio__top">
                        <span className="folio__kind">{item.kind}</span>
                        <span className="folio__year">{item.year}</span>
                      </div>
                      <h3 className="folio__title">
                        <Chars text={item.title} />
                      </h3>
                      {item.en && <p className="folio__en">{item.en}</p>}
                      <p className="folio__desc">{item.desc}</p>
                      {item.formula && (
                        <p className="folio__formula">{item.formula}</p>
                      )}
                      {item.tags && (
                        <ul className="folio__tags">
                          {item.tags.map((t) => (
                            <li className="folio__tag" key={t}>
                              {t}
                            </li>
                          ))}
                        </ul>
                      )}
                      {item.go && (
                        <span className="folio__go">
                          {item.go}
                          {item.href ? (
                            <span className="btn__arrow"> →</span>
                          ) : null}
                        </span>
                      )}
                    </>
                  );
                  const cls = `folio__item${item.featured ? " folio__item--wide" : ""}`;
                  const style = { "--d": `${0.12 + i * 0.06}s` };
                  return item.href ? (
                    <a
                      className={cls}
                      key={item.title}
                      data-reveal
                      style={style}
                      href={item.href}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {inner}
                    </a>
                  ) : (
                    <div className={cls} key={item.title} data-reveal style={style}>
                      {inner}
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          <section className="section section--tall" id="contact">
            <div className="wrap contact">
              <p className="label" data-reveal style={{ justifyContent: "center" }}>
                문의
              </p>
              <h2 className="title" data-reveal style={{ "--d": "0.08s" }}>
                <Chars text="정확한 것을 함께 만들어봐요." />
              </h2>
              <p className="lede" data-reveal style={{ "--d": "0.16s" }}>
                제휴, 취재 요청, 혹은 너무 대충 그려졌다고 생각하는
                시장이 있다면 — 무엇이든 다 읽습니다.
              </p>
              <a
                className="contact__mail"
                href="mailto:reamer@d-reamer.com"
                data-reveal
                style={{ "--d": "0.24s" }}
              >
                <Chars text="reamer@d-reamer.com" />
              </a>
            </div>
          </section>
        </main>

        <footer className="footer">
          <div className="wrap footer__row">
            <a className="nav__brand" href="#top">
              <Logo size={40} full />
              <span className="nav__word">REAMER</span>
            </a>
            <ul className="footer__links">
              <li>
                <a
                  className="footer__link"
                  href="https://www.yume-reamer.com/"
                  target="_blank"
                  rel="noreferrer"
                >
                  유메
                </a>
              </li>
              <li>
                <a className="footer__link" href="#products">
                  아이픽
                </a>
              </li>
              <li>
                <a className="footer__link" href="#products">
                  오토레이
                </a>
              </li>
              <li>
                <a className="footer__link" href="#about">
                  소개
                </a>
              </li>
              <li>
                <a className="footer__link" href="#portfolio">
                  포트폴리오
                </a>
              </li>
              <li>
                <a className="footer__link" href="#contact">
                  문의
                </a>
              </li>
            </ul>
            <p className="footer__copy">© 2026 REAMER</p>
          </div>
        </footer>
      </div>
    </>
  );
};

export default ReamerSite;
