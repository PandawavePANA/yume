import { useEffect, useRef, useState } from "react";
import "./reamer.css";
import "@/components/reamer/site.css";
import SiteBackdrop from "@/components/reamer/SiteBackdrop";
import Logo from "@/components/reamer/Logo";
import { BUSINESS, telHref, COPYRIGHT, businessLine } from "@/businessInfo";
import { NAV, TRUST, WHY, SERVICES, PROCESS, WORK, ALSO, TIMELINE, FAQ, AFTER_SEND } from "@/reamerContent";

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

// 스크롤에 맞춰 나타나는 연출.
//
// 감추는 일은 CSS가 하지만, 감추는 규칙 자체는 JS가 켜 준 뒤에만 적용된다
// (<html class="reveal-on">). 관찰자가 돌지 않는 환경 — 스크립트 실패, 크롤러,
// 링크 미리보기, 페이지 전체 캡처 — 에서는 규칙이 아예 붙지 않아 글이 그대로 보인다.
// 이걸 CSS만으로 하면 그런 환경에서 페이지가 통째로 빈 화면이 된다. 실제로 그랬다.
function useReveal() {
  useEffect(() => {
    const root = document.documentElement;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (reduce || !("IntersectionObserver" in window)) return;

    root.classList.add("reveal-on");
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("is-in");
          io.unobserve(entry.target);
        }
      },
      { threshold: 0.08, rootMargin: "0px 0px -4% 0px" },
    );
    document.querySelectorAll("[data-reveal]").forEach((el) => io.observe(el));

    // 마지막 안전망. 관찰자가 어떤 이유로든 돌지 않아도 글은 반드시 보여야 한다.
    // 히어로 등장 연출도 같은 클래스에 걸려 있어 여기서 같이 풀린다 — 2.5초면
    // 등장(최대 1.7초)은 끝났고, 안 끝났다면 끝나야 할 이유가 더 크다.
    const failsafe = setTimeout(() => root.classList.remove("reveal-on"), 2500);
    return () => {
      clearTimeout(failsafe);
      io.disconnect();
    };
  }, []);
}

// 스크롤에 따라 움직이는 것 전부를 한 곳에서 정한다: 상단 바를 눌러 붙일지,
// 읽기 진행선을 얼마나 채울지, 배경 연출을 얼마나 남길지, 그리고 화면 캡처를
// 얼마나 어긋나게 둘지.
//
// 하나로 묶는 이유는 두 가지다. 값들이 서로 어긋나지 않고, 스크롤 한 번에
// 레이아웃 계산이 한 번만 일어난다. 처음에는 시차 이동만 따로 떼어 관찰자로
// "보이는 것만" 재게 해 뒀는데, 대상이 다섯 개뿐이라 아낄 것이 없으면서
// 관찰자 콜백이 오지 않으면 통째로 죽는 경로만 하나 늘었다. 다섯 번 재는 편이
// 싸고 확실하다.
//
// 배경 세기는 히어로를 지나면 내린다. 입자가 본문 글씨를 가로질러 읽기를
// 방해하기 때문이다 — 실제로 FAQ 문단 위로 지나갔다.
function useScrollChrome(ref) {
  useEffect(() => {
    const root = document.documentElement;
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    const shifted = still ? [] : Array.from(document.querySelectorAll("[data-parallax]"));
    let raf = 0;

    const apply = () => {
      raf = 0;
      const y = window.scrollY;
      const vh = window.innerHeight;
      ref.current?.classList.toggle("is-scrolled", y > 24);

      const doc = root.scrollHeight - vh;
      root.style.setProperty("--read", doc > 0 ? String(Math.min(1, y / doc)) : "0");

      const t = Math.min(1, y / Math.max(vh * 0.85, 1));
      root.style.setProperty("--bd", String(1 - t * 0.93));

      for (const el of shifted) {
        const r = el.getBoundingClientRect();
        if (r.bottom < -200 || r.top > vh + 200) continue;
        // 화면 가운데를 지날 때 0, 위아래 끝에서 ∓1.
        const p = (r.top + r.height / 2 - vh / 2) / (vh / 2 + r.height / 2);
        el.style.setProperty("--p", (p < -1 ? -1 : p > 1 ? 1 : p).toFixed(4));
      }
    };

    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(apply);
    };
    apply();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [ref]);
}

// 개발 문의 양식.
//
// 메일 주소만 적어 두면 대부분은 눌러 보고 만다 — 무엇을 써야 할지 모르기 때문이다.
// 무엇을 만들고 싶은지, 예산이 어느 정도인지를 미리 물어 두면 첫 회신에서 바로
// 다음 이야기를 할 수 있다. 메일 주소도 그대로 남겨 둔다(양식을 싫어하는 사람이 있다).
const API = (import.meta.env?.VITE_YUME_API_ORIGIN || "https://www.yume-reamer.com").replace(/\/+$/, "");

const KINDS = [
  ["web", "웹사이트 · 웹서비스"],
  ["app", "모바일 앱"],
  ["ai", "AI 기능 연동"],
  ["automation", "업무 자동화 · 데이터"],
  ["maintain", "기존 서비스 개선"],
  ["other", "그 외"],
];
const BUDGETS = [
  ["undecided", "아직 미정"],
  ["under-500", "500만원 미만"],
  ["500-1000", "500만~1,000만원"],
  ["1000-3000", "1,000만~3,000만원"],
  ["over-3000", "3,000만원 이상"],
];

function InquiryForm() {
  const [form, setForm] = useState({ name: "", contact: "", company: "", kind: "web", budget: "undecided", message: "", website: "" });
  const [state, setState] = useState("idle");
  const [error, setError] = useState("");
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setState("sending");
    try {
      const r = await fetch(`${API}/api/inquiry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || "보내지 못했어요. 잠시 후 다시 시도해주세요.");
      setState("done");
    } catch (err) {
      // 네트워크가 막혀도 메일이라는 길이 남아 있다는 걸 알려 준다.
      setError(err.message || "보내지 못했어요.");
      setState("idle");
    }
  };

  if (state === "done") {
    return (
      <div className="inquiry inquiry--done">
        <p className="inquiry__done-title">문의가 접수됐습니다.</p>
        <p className="inquiry__done-desc">
          영업일 기준 하루 안에 <b>{form.contact}</b>로 회신드리겠습니다.
          급하시면 <a href={`mailto:${BUSINESS.email}`}>{BUSINESS.email}</a>로 바로 연락 주셔도 됩니다.
        </p>
      </div>
    );
  }

  return (
    <form className="inquiry" onSubmit={submit}>
      <div className="inquiry__row">
        <label className="inquiry__field">
          <span>성함 *</span>
          <input id="iq-name" value={form.name} onChange={set("name")} required maxLength={60} placeholder="홍길동" />
        </label>
        <label className="inquiry__field">
          <span>회사 · 팀</span>
          <input id="iq-company" value={form.company} onChange={set("company")} maxLength={100} placeholder="선택" />
        </label>
      </div>

      <label className="inquiry__field">
        <span>연락받으실 곳 *</span>
        <input id="iq-contact" value={form.contact} onChange={set("contact")} required maxLength={200} placeholder="이메일 또는 전화번호" />
      </label>

      <div className="inquiry__row">
        <label className="inquiry__field">
          <span>어떤 걸 만드시나요</span>
          <select id="iq-kind" value={form.kind} onChange={set("kind")}>
            {KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className="inquiry__field">
          <span>예산</span>
          <select id="iq-budget" value={form.budget} onChange={set("budget")}>
            {BUDGETS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
      </div>

      <label className="inquiry__field">
        <span>내용 *</span>
        <textarea id="iq-message" value={form.message} onChange={set("message")} required rows={5}
          placeholder="만들고 싶은 것, 참고할 만한 서비스, 원하시는 일정 — 아는 만큼만 적어주셔도 됩니다." />
      </label>

      {/* 봇 함정. 사람에게는 보이지 않는다. */}
      <input className="inquiry__trap" tabIndex={-1} autoComplete="off" aria-hidden
        value={form.website} onChange={set("website")} />

      {error && <p className="inquiry__error">{error} 메일로는 <a href={`mailto:${BUSINESS.email}`}>{BUSINESS.email}</a>.</p>}

      <button className="btn btn--solid inquiry__submit" type="submit" disabled={state === "sending"}>
        {state === "sending" ? "보내는 중…" : "문의 보내기"} <span className="btn__arrow">→</span>
      </button>
      <p className="inquiry__note">
        보내주신 내용은 회신에만 씁니다. 영업일 기준 하루 안에 답장드립니다.
      </p>
    </form>
  );
}

// 작업물 한 건. 화면 캡처가 먼저 오고 설명이 따라온다 — 글보다 만든 것이 빠르다.
function WorkCase({ item, index }) {
  const [shot, setShot] = useState(0);
  const current = item.shots[shot];
  // 제품 색을 그 카드 안에서만 쓰도록 변수로 내려보낸다.
  return (
    <article className="case" data-reveal style={item.accent ? { "--accent": item.accent } : undefined}>
      <div className="case__media" data-parallax>
        <a className="case__frame" href={item.href} target="_blank" rel="noreferrer" aria-label={`${item.name} 사이트 열기`}>
          <img
            className="case__img"
            src={current.src}
            alt={current.alt}
            width={1440}
            height={900}
            loading={index === 0 ? "eager" : "lazy"}
            decoding="async"
          />
        </a>
        {item.shots.length > 1 && (
          <div className="case__dots">
            {item.shots.map((s, i) => (
              <button
                key={s.src}
                type="button"
                aria-label={s.alt}
                aria-pressed={i === shot}
                className={`case__dot${i === shot ? " is-on" : ""}`}
                onClick={() => setShot(i)}
              />
            ))}
          </div>
        )}
      </div>

      <div className="case__body">
        <p className="case__meta">
          <span className={`case__kind${item.live ? " case__kind--live" : ""}`}>{item.kind}</span>
          <span className="case__year">{item.year}</span>
        </p>
        <h3 className="case__name">
          {/* 글자별 span을 flex 항목으로 두면 낱자 사이마다 gap이 들어가 "유메"가
              "유 메"로 벌어진다. 한 겹 감싸서 이름은 한 덩어리로 둔다. */}
          <span className="case__name-ko">
            <Chars text={item.name} />
          </span>
          <span className="case__en">{item.en}</span>
        </h3>
        <p className="case__blurb">{item.blurb}</p>
        <p className="case__problem">{item.problem}</p>

        <ul className="case__built">
          {item.built.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>

        {item.note && <p className="case__note">{item.note}</p>}

        <ul className="case__stack">
          {item.stack.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>

        <a className="case__go" href={item.href} target="_blank" rel="noreferrer">
          {item.go}
          <span className="btn__arrow"> →</span>
        </a>
      </div>
    </article>
  );
}

const ReamerSite = () => {
  const navRef = useRef(null);
  useReveal();
  useScrollChrome(navRef);

  return (
    <>
      <SiteBackdrop />

      <div className="site">
        <div className="site__rails" aria-hidden>
          <span className="site__rail site__rail--l" />
          <span className="site__rail site__rail--r" />
        </div>

        <nav className="nav" aria-label="Primary" ref={navRef}>
          <a className="nav__brand" href="#top">
            <Logo size={30} full />
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
            개발 문의
          </a>
          {/* 읽은 만큼 차는 빛줄기. 긴 한 장짜리라 지금 어디쯤인지가 보이면 덜 막막하다. */}
          <span className="nav__read" aria-hidden />
        </nav>

        <main id="top">
          {/* 히어로. 화면을 꽉 채우지 않는다 — 첫 화면에서 작업물이 시작되는 것까지
              보여야 "무엇을 만드는 곳인지"가 한 번에 전달된다. */}
          <section className="hero">
            <div className="wrap hero__grid">
              {/* 첫 화면에는 나타나는 연출을 걸지 않는다. 처음 보이는 글이 스크립트가
                  끝나야 나타나면, 탭이 뒤에 있거나 느린 기기에서는 빈 화면을 먼저 본다.
                  연출은 스크롤해서 만나는 아래쪽에만 붙인다. */}
              <div className="hero__copy">
                <p className="label">개발 외주 · 웹 · 앱 · AI</p>
                <h1 className="display">
                  <Chars text="무엇이든" />
                  <br />
                  <Chars text="개발해 드립니다" />
                </h1>
                <p className="lede">
                  웹사이트, 앱, 결제·인증 연동, AI 기능, 업무 자동화. 기획이 반쯤 잡혀 있어도 괜찮습니다.
                  <b> 상담과 견적은 무료이고, 한 번 확정한 금액은 바뀌지 않습니다.</b>
                </p>
                <div className="actions">
                  <a className="btn btn--solid" href="#contact">
                    무료로 견적 받기 <span className="btn__arrow">→</span>
                  </a>
                  <a className="btn btn--ghost" href="#work">
                    작업물 보기
                  </a>
                </div>
              </div>

              <ul className="trust">
                {TRUST.map((t) => (
                  <li className="trust__item" key={t.k}>
                    <span className="trust__v">{t.v}</span>
                    <span className="trust__k">{t.k}</span>
                    <span className="trust__sub">{t.sub}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* 작업물을 맨 앞에 둔다. 외주를 맡기려는 사람이 가장 먼저 확인하는 건
              소개 글이 아니라 "이 사람이 만든 게 뭔가"다. */}
          <section className="section" id="work">
            <div className="wrap">
              <header className="head" data-reveal>
                <p className="label">작업물</p>
                <h2 className="title">
                  <Chars text="만들어서, 실제로 돌리고 있습니다." />
                </h2>
                <p className="lede">
                  {/* 개수를 글에 박아두면 작업물을 추가할 때마다 한쪽만 고치게 된다. */}
                  아래 {WORK.length}개는 지금 주소를 열면 그대로 동작합니다. 화면은 직접 찍은 것입니다.
                </p>
              </header>

              <div className="cases">
                {WORK.map((item, i) => (
                  <WorkCase item={item} index={i} key={item.slug} />
                ))}
              </div>

              <div className="also" data-reveal>
                <h3 className="also__head">그 외 작업</h3>
                <ul className="also__list">
                  {ALSO.map((a) => (
                    <li className="also__item" key={a.title}>
                      <div className="also__top">
                        <span className="also__year">{a.year}</span>
                        <span className="also__kind">{a.kind}</span>
                      </div>
                      <h4 className="also__title">{a.title}</h4>
                      <p className="also__desc">{a.desc}</p>
                      <p className="also__meta">{a.meta}</p>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>

          {/* 작업물이 "만들 수 있는가"에 답했다면, 여기는 "맡겨도 되는가"에 답한다.
              개발 외주에서 사고가 나는 지점은 거의 정해져 있어서 그 지점을 먼저 짚는다. */}
          <section className="section" id="why">
            <div className="wrap">
              <header className="head" data-reveal>
                <p className="label">맡기는 이유</p>
                <h2 className="title">
                  <Chars text="외주가 틀어지는 지점은 정해져 있습니다." />
                </h2>
                <p className="lede">
                  말이 바뀌고, 담당자가 바뀌고, 다 만들고 나서 심사에서 막히고, 끝나고 나면
                  코드를 못 받습니다. 그 넷을 먼저 막아두고 시작합니다.
                </p>
              </header>

              <ul className="why">
                {WHY.map((w) => (
                  <li className="why__item" key={w.head} data-reveal>
                    <h3 className="why__head">{w.head}</h3>
                    <p className="why__body">{w.body}</p>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section className="section" id="services">
            <div className="wrap">
              <header className="head" data-reveal>
                <p className="label">하는 일</p>
                <h2 className="title">
                  <Chars text="무엇을 맡길 수 있나." />
                </h2>
                <p className="lede">
                  문서가 다 나와 있지 않아도 됩니다. 필요한 것을 이야기하면서 범위를 좁히고,
                  만들어서, 실제로 돌아가는 상태로 넘겨드립니다.
                </p>
              </header>

              <div className="svc">
                {SERVICES.map((sv) => (
                  <div className="svc__item" key={sv.name} data-reveal>
                    <h3 className="svc__name">
                      {sv.name}
                      <span className="svc__when">{sv.when}</span>
                    </h3>
                    <p className="svc__desc">{sv.desc}</p>
                    <ul className="svc__list">
                      {sv.items.map((it) => (
                        <li key={it}>{it}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* 맡기는 쪽의 가장 큰 불안은 "맡기고 나면 어떻게 되는가"다.
              번호를 붙인 건 실제로 순서가 있기 때문이다. */}
          <section className="section" id="process">
            <div className="wrap">
              <header className="head" data-reveal>
                <p className="label">진행 방식</p>
                <h2 className="title">
                  <Chars text="맡기면 이렇게 진행됩니다." />
                </h2>
                <p className="lede">
                  첫 두 단계에는 비용이 들지 않습니다. 범위와 금액을 확정한 뒤에 시작합니다.
                </p>
              </header>

              <ol className="steps">
                {PROCESS.map((p) => (
                  <li className="step" key={p.no} data-reveal>
                    <span className="step__no">{p.no}</span>
                    <div className="step__body">
                      <h3 className="step__name">
                        {p.name}
                        <span className="step__when">{p.when}</span>
                      </h3>
                      <p className="step__desc">{p.desc}</p>
                    </div>
                  </li>
                ))}
              </ol>

              <dl className="faq" data-reveal>
                {FAQ.map((f) => (
                  <div className="faq__item" key={f.q}>
                    <dt className="faq__q">{f.q}</dt>
                    <dd className="faq__a">{f.a}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </section>

          <section className="section" id="about">
            <div className="wrap about">
              <div className="about__intro" data-reveal>
                <p className="label">소개</p>
                <h2 className="title">
                  <Chars text="정원영" />
                </h2>
                <p className="lede">
                  리머 대표. 한국디지털미디어고 해킹방어과를 거쳐 중앙대학교 전자전기공학부에
                  재학 중이며, 여러 번의 창업과 스스로 겪은 AI 오답의 피해를 계기로 리머를
                  시작했습니다. 맡은 일은 대표가 직접 만듭니다.
                </p>
                <blockquote className="quote">
                  “대충 뚫린 구멍은, 결국 누군가 대가를 치른다는 걸 직접 겪었습니다.”
                </blockquote>
              </div>

              <ol className="tl">
                {TIMELINE.map((item) => (
                  <li className={`tl__item${item.now ? " tl__item--now" : ""}`} key={item.title} data-reveal>
                    <span className="tl__year">{item.year}</span>
                    <div className="tl__body">
                      <h3 className="tl__title">{item.title}</h3>
                      {item.desc && <p className="tl__desc">{item.desc}</p>}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </section>

          <section className="section section--contact" id="contact">
            <div className="wrap contact">
              <div className="contact__copy" data-reveal>
                <p className="label">문의</p>
                <h2 className="title">
                  <Chars text="무엇을 만들어 드릴까요." />
                </h2>
                <p className="lede">
                  기획이 반쯤 잡혀 있어도 괜찮습니다. 무엇을 만들어야 하는지부터 같이 정리합니다.
                  영업일 기준 하루 안에 회신드립니다.
                </p>
                <ul className="contact__direct">
                  <li>
                    <span>이메일</span>
                    <a href={`mailto:${BUSINESS.email}`}>{BUSINESS.email}</a>
                  </li>
                  {BUSINESS.tel && (
                    <li>
                      <span>전화</span>
                      <a href={telHref}>{BUSINESS.tel}</a>
                    </li>
                  )}
                </ul>

                <ol className="after">
                  {AFTER_SEND.map((t, i) => (
                    <li className="after__item" key={t}>
                      <span className="after__no">{String(i + 1).padStart(2, "0")}</span>
                      <span>{t}</span>
                    </li>
                  ))}
                </ol>
              </div>
              <div className="contact__form" data-reveal style={{ "--d": "0.08s" }}>
                <InquiryForm />
              </div>
            </div>
          </section>
        </main>

        <footer className="footer">
          <div className="wrap footer__row">
            <a className="nav__brand" href="#top">
              <Logo size={30} full />
              <span className="nav__word">REAMER</span>
            </a>
            <ul className="footer__links">
              {NAV.map((n) => (
                <li key={n.href}>
                  <a className="footer__link" href={n.href}>{n.label}</a>
                </li>
              ))}
              <li>
                <a className="footer__link" href="#contact">문의</a>
              </li>
            </ul>
          </div>
          {/* 사업자 정보 — 세 사이트가 같은 값을 보여줘야 해서 businessInfo.js에서 가져온다. */}
          <address className="wrap footer__biz">
            <span>
              {businessLine([
                `상호 ${BUSINESS.name}(${BUSINESS.nameEn})`,
                `대표 ${BUSINESS.ceo}`,
                `사업자등록번호 ${BUSINESS.regNo}`,
                BUSINESS.mailOrderNo && `통신판매업 신고 ${BUSINESS.mailOrderNo}`,
              ])}
            </span>
            <span>주소 {BUSINESS.address}</span>
            <span>
              {BUSINESS.tel && (
                <>
                  대표전화 <a className="footer__link" href={telHref}>{BUSINESS.tel}</a>
                  {" · "}
                </>
              )}
              이메일 <a className="footer__link" href={`mailto:${BUSINESS.email}`}>{BUSINESS.email}</a>
            </span>
            <p className="footer__copy">{COPYRIGHT}</p>
          </address>
        </footer>
      </div>
    </>
  );
};

export default ReamerSite;
