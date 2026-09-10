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
  { label: "인사이트", href: "#insights" },
  { label: "문의", href: "#contact" },
];

const SPECS = [
  { k: "설립", v: "2026" },
  { k: "대표", v: "정원영" },
  { k: "1호 제품", v: "유메" },
  { k: "분야", v: "AI 소프트웨어" },
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
  },
  {
    year: "20XX",
    title: "前 판다웨이브 대표",
    desc: "첫 창업을 통해 제품을 처음부터 끝까지 만들고 책임지는 경험을 했습니다.",
  },
  {
    year: "20XX",
    title: "판다 익스체인지 발행",
  },
  {
    year: "20XX",
    title: "저스트로맨스 설립",
  },
  {
    year: "20XX",
    title: "법정 분쟁 중 AI 오답으로 실제 피해",
    desc: "AI가 제시한 잘못된 정보를 믿었다가 실제 피해를 입은 경험이, 유메를 만들게 된 계기가 되었습니다.",
  },
  {
    year: "2026",
    title: "「시점 인식 기반 AI 생성콘텐츠 사실검증 방법 및 시스템」 특허 출원",
    desc: "AI가 만든 주장이 참조 데이터베이스에 존재하는지만 보는 것을 넘어, 특정 시점을 기준으로 여전히 유효한 정보인지까지 판별하는 방법과 시스템. 유메의 핵심 기술입니다.",
  },
  {
    year: "2026",
    title: "리머 설립 · 유메 출시",
    desc: "정밀함을 기준으로 삼은 AI 소프트웨어 스튜디오, 리머를 설립하고 1호 제품 유메를 출시했습니다.",
  },
  {
    year: "진행 중",
    title: "아이픽 개발",
    desc: "대화형 AI 상품 추천 서비스 아이픽을 2호 제품으로 준비하고 있습니다.",
    now: true,
  },
];

const NOTES = [
  {
    title: "할루시네이션은 버그가 아니라 시장이다",
    desc: "자신 있는 답변과 맞는 답변 사이의 간극 — 앞으로 10년, 소프트웨어는 바로 그 틈에서 만들어집니다.",
  },
  {
    title: "니치가 곧 해자다",
    desc: "작고 정확하게 그어진 시장이 넓고 흐릿한 시장을 이깁니다. 다음에 파고들 자리를 고르는 기준.",
  },
  {
    title: "검증된 답을 위한 디자인",
    desc: "화면의 모든 주장이 저마다 근거를 가져야 할 때, 인터페이스는 무엇이 달라지는가.",
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
                <Chars text="정밀하게 다듬는다." />
                <br />
                <Chars text="몇 번이고, 다시." />
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
                <Chars text="두 개의 제품." />
                <br />
                <Chars text="하나의 기준." />
              </h2>

              <div className="cards cards--2">
                <a
                  className="card"
                  data-reveal
                  style={{ "--d": "0.12s" }}
                  href="https://www.yume-reamer.com/"
                  target="_blank"
                  rel="noreferrer"
                >
                  <div className="card__top">
                    <span className="card__status card__status--live">운영 중</span>
                    <span className="card__status">01</span>
                  </div>
                  <h3 className="card__name">
                    <Chars text="유메" />
                  </h3>
                  <p className="card__desc">
                    AI 답변을 위한 팩트체크. 유메는 답변 속 사실 주장을
                    추출해 공식 자료와 실시간 웹으로 검증하고, 무엇이
                    맞는지 정확히 보여줍니다.
                  </p>
                  <span className="card__go">
                    yume-reamer.com <span className="btn__arrow">→</span>
                  </span>
                </a>

                <div className="card" data-reveal style={{ "--d": "0.2s" }}>
                  <div className="card__top">
                    <span className="card__status">개발 중</span>
                    <span className="card__status">02</span>
                  </div>
                  <h3 className="card__name">
                    <Chars text="아이픽" />
                  </h3>
                  <p className="card__desc">
                    대화형 상품 추천. 무엇을 찾는지 말하면 아이픽이 진짜
                    좁혀주는 질문을 던지고, 마지막엔 살 만한 상품 3개를
                    보여줍니다.
                  </p>
                  <span className="card__go">출시 예정</span>
                </div>
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

          <section className="section" id="insights">
            <div className="wrap">
              <p className="label" data-reveal>
                인사이트
              </p>
              <h2 className="title" data-reveal style={{ "--d": "0.08s" }}>
                <Chars text="작업실에서 온 노트." />
              </h2>

              <div className="cards cards--3">
                {NOTES.map((note, i) => (
                  <div
                    className="card"
                    key={note.title}
                    data-reveal
                    style={{ "--d": `${0.12 + i * 0.08}s` }}
                  >
                    <div className="card__top">
                      <span className="card__status">노트 0{i + 1}</span>
                    </div>
                    <h3 className="card__name">
                      <Chars text={note.title} />
                    </h3>
                    <p className="card__desc">{note.desc}</p>
                    <span className="card__go">출시 예정</span>
                  </div>
                ))}
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
                <a className="footer__link" href="#about">
                  소개
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
