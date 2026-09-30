import { useEffect, useRef, useState } from "react";
import "./reamer.css";
import "@/components/reamer/site.css";
import SiteBackdrop from "@/components/reamer/SiteBackdrop";
import Logo from "@/components/reamer/Logo";
import { BUSINESS, telHref, COPYRIGHT, businessLine } from "@/businessInfo";
import { rememberToken } from "@/components/reamer/threadApi";
import { NAV, HERO_NOTE, WHY, GUARANTEES, SERVICES, PROCESS, WORK, ALSO, CREDENTIALS, TIMELINE, FAQ, AFTER_SEND } from "@/reamerContent";
import "@/components/reamer/motion.css";
import { useFloatingCta, usePointerFx, useScrollSpy, useScrub } from "@/components/reamer/useMotion";
import "@/components/reamer/tech.css";
import { BuildTerminal, CursorGrid, LivePing, ParticleWord, ScrollRuler, useScrambleLabels } from "@/components/reamer/tech";
// 움직임 부품이 터져도 그 자리만 비우고 본문은 남긴다(Decor.jsx 주석 참고).
import Decor from "@/components/reamer/Decor";
import "@/components/reamer/fx.css";
import { BlueprintSolid, ClickSparks } from "@/components/reamer/fx";

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

// 섹션 제목용. 낱말마다 한 덩어리(줄바꿈이 낱말 가운데서 일어나지 않게)로 묶고, 글자마다 순번(--i)을
// 붙여 화면에 들어올 때 한 자씩 차례로 떠오르게 한다(motion.css). 글자 span은 커서 꼬리도 그대로 쓴다.
const TitleChars = ({ text }) => {
  let i = 0;
  return text.split(" ").map((word, wi, arr) => (
    <span key={wi}>
      <span className="tw">
        {Array.from(word).map((ch) => (
          <span className="trail-ch" key={i} style={{ "--i": i++ }}>{ch}</span>
        ))}
      </span>
      {wi < arr.length - 1 ? " " : null}
    </span>
  ));
};

// 선언 문장. 스크롤한 만큼 앞에서부터 단어에 불이 켜지고(--k: 단어의 자리), 외주에서 흔한 사고 넷에는
// 켜진 뒤 빨간 줄이 그어진다. 마지막 약속 부분은 스펙트럼으로 켜진다.
const MANIFESTO = [
  ["하다"], ["보면"], ["말이"], ["바뀌고,", "strike"], ["담당자가"], ["바뀌고,", "strike"], ["다"], ["만든"], ["뒤에"],
  ["심사에서"], ["막히고,", "strike"], ["끝나면"], ["코드조차"], ["받지"], ["못합니다.", "strike"],
  ["리머는", "key"], ["이"], ["네"], ["가지를"], ["시작하기", "key"], ["전에", "key"], ["막아", "key"], ["둡니다.", "key"],
];
function Manifesto() {
  const n = MANIFESTO.length;
  return (
    <section className="manifesto" data-scrub aria-label="리머가 막아 두는 것">
      <div className="wrap">
        <p className="label manifesto__label">왜 리머인가</p>
        <p className="manifesto__text">
          {MANIFESTO.map(([w, kind], i) => (
            <span key={i}>
              <span className={`mw${kind ? ` mw--${kind}` : ""}`} style={{ "--k": (i / n).toFixed(3) }}>{w}</span>
              {i < n - 1 ? " " : null}
            </span>
          ))}
        </p>
      </div>
    </section>
  );
}

// 하는 일 키워드가 흐르는 띠. 스크롤을 빨리 하면 그만큼 기운다(--vel, useMotion.js).
const TICKER_BIG = ["웹사이트", "앱", "결제 연동", "본인인증", "AI 기능", "업무 자동화", "관리자 화면", "API 연동"];
const TICKER_SMALL = ["기획서 없어도 괜찮습니다", "상담·견적 무료", "대표가 직접 개발", "매주 진행 공유", "코드·계정 모두 이관", "정한 금액 그대로"];
function Ticker() {
  const row = (items, rev) => (
    <div className={`ticker__row${rev ? " ticker__row--rev" : ""}`}>
      {[0, 1].map((k) => (
        <span key={k} style={{ display: "inline-flex" }} aria-hidden={k === 1 || undefined}>
          {items.map((t) => (
            <span className="ticker__item" key={t}>{t}<span className="ticker__star" aria-hidden /></span>
          ))}
        </span>
      ))}
    </div>
  );
  return (
    <div className="ticker" aria-label="리머가 만드는 것">
      <div className="ticker__skew">
        {row(TICKER_BIG, false)}
        {row(TICKER_SMALL, true)}
      </div>
    </div>
  );
}

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

// 묻는 것은 넷뿐이다 — 이름, 연락처, 내용, 희망 견적.
//
// 예전에는 회사명과 "어떤 걸 만드시나요" 항목도 받았다. 뺐다. 종류는 내용을 읽으면
// 알 수 있고, 회사는 없는 사람이 더 많다. 칸이 하나 늘 때마다 보내다 마는 사람도 는다.
const BUDGETS = [
  ["undecided", "아직 미정"],
  ["under-500", "500만원 미만"],
  ["500-1000", "500만~1,000만원"],
  ["1000-3000", "1,000만~3,000만원"],
  ["over-3000", "3,000만원 이상"],
];

function CopyLink({ url }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setDone(true);
    } catch {
      window.prompt("아래 링크를 복사해 두세요.", url);
    }
  };
  return (
    <button type="button" className="btn btn--ghost inquiry__copy" onClick={copy}>
      {done ? "복사했어요. 메모장이나 카톡 ‘나와의 채팅’에 붙여 두세요" : "대화 링크 복사하기"}
    </button>
  );
}

function InquiryForm() {
  const [form, setForm] = useState({ name: "", contact: "", budget: "undecided", message: "", website: "" });
  const [state, setState] = useState("idle");
  const [error, setError] = useState("");
  // 접수와 동시에 열리는 대화방 주소. 이 링크 하나로 상담·견적·결제가 이어진다.
  const [threadUrl, setThreadUrl] = useState("");
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
      if (!r.ok) throw new Error(data.error || "보내지 못했어요. 잠시 후 다시 시도해 주세요.");
      setThreadUrl(data.threadUrl || "");
      rememberToken(String(data.threadUrl || "").split("#")[1]);
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
        <svg className="inquiry__check" viewBox="0 0 48 48" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="24" cy="24" r="22" />
          <path d="M14.5 24.5l6.5 6.5 13-14" />
        </svg>
        <p className="inquiry__done-title">문의가 접수됐습니다</p>
        {threadUrl ? (
          <>
            <p className="inquiry__done-desc">
              바로 대화하실 수 있는 공간을 열어 두었습니다. 상담부터 견적, 결제까지 이곳에서 모두 하실 수 있고,
              영업일 기준 하루 안에 첫 답장을 드립니다.
            </p>
            <a className="btn btn--solid inquiry__submit" href={threadUrl}>
              대화 열기 <span className="btn__arrow">→</span>
            </a>
            {/* 링크 메일은 연락처가 이메일일 때만 나간다(threads.js mailThreadOpened). 전화번호를
                남긴 사람에게 "보내드렸다"고 하면 없는 메일을 기다리다 링크를 잃는다 — 이 링크가 대화의
                유일한 열쇠라, 그때는 지금 저장하게 한다. */}
            {/.+@.+\..+/.test(form.contact) ? (
              <p className="inquiry__note">
                같은 링크를 <b>{form.contact}</b>로도 보내드렸습니다. 링크를 아는 사람은 누구나 대화를 볼 수 있으니
                다른 사람과 공유하지 마세요.
              </p>
            ) : (
              <>
                <p className="inquiry__note">
                  <b>이 링크를 꼭 저장해 두세요.</b> 전화번호로 문의하셔서 메일로는 보내드리지 못했습니다.
                  이 브라우저에서는 사이트 맨 위 ‘내 의뢰’로 다시 열 수 있지만, 다른 기기에서는 이 링크가 있어야 열립니다.
                </p>
                <CopyLink url={threadUrl} />
              </>
            )}
          </>
        ) : (
          <p className="inquiry__done-desc">
            영업일 기준 하루 안에 <b>{form.contact}</b>로 답장드리겠습니다.
            급하시면 <a href={`mailto:${BUSINESS.email}`}>{BUSINESS.email}</a>로 바로 연락 주셔도 됩니다.
          </p>
        )}
      </div>
    );
  }

  return (
    <form className="inquiry" onSubmit={submit}>
      <div className="inquiry__row">
        <label className="inquiry__field">
          <span>이름 *</span>
          <input id="iq-name" value={form.name} onChange={set("name")} required maxLength={60} placeholder="홍길동" />
        </label>
        <label className="inquiry__field">
          <span>연락처 *</span>
          <input id="iq-contact" value={form.contact} onChange={set("contact")} required maxLength={200}
            placeholder="이메일 또는 전화번호" />
        </label>
      </div>

      <label className="inquiry__field">
        <span>희망 견적</span>
        <select id="iq-budget" value={form.budget} onChange={set("budget")}>
          {BUDGETS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </label>

      <label className="inquiry__field">
        <span>문의 내용 *</span>
        <textarea id="iq-message" value={form.message} onChange={set("message")} required rows={5}
          placeholder="만들고 싶은 것, 참고하는 서비스, 원하시는 일정 등 아는 만큼만 적어 주세요. 아직 막연해도 괜찮습니다." />
      </label>

      {/* 봇 함정. 사람에게는 보이지 않는다. */}
      <input className="inquiry__trap" tabIndex={-1} autoComplete="off" aria-hidden
        value={form.website} onChange={set("website")} />

      {error && <p className="inquiry__error">{error} 메일로 보내셔도 됩니다: <a href={`mailto:${BUSINESS.email}`}>{BUSINESS.email}</a></p>}

      <button className="btn btn--solid inquiry__submit" data-magnet type="submit" disabled={state === "sending"}>
        {state === "sending" ? "보내는 중…" : "문의 보내기"} <span className="btn__arrow">→</span>
      </button>
      <p className="inquiry__note">
        보내 주신 내용은 답장에만 사용합니다. 영업일 기준 하루 안에 답장드립니다.
      </p>
    </form>
  );
}

// 폰에서는 작업물 카드의 "만든 것" 목록을 접는다.
//
// 카드 하나가 폰 화면 한 장을 넘었다 — 캡처·사연·제작 항목 네 줄·메모·기술 칩이 다 펼쳐져서,
// 다섯 건만 4,500px이었다. 문의까지 가기 전에 스크롤에 지친다. 훑어보는 사람에게는
// 캡처·이름·한 줄 소개·사연·기술이면 판단이 되고, 궁금한 사람은 펼치면 된다.
// 넓은 화면에서는 옆으로 나란히 놓여 길지 않으므로 늘 펼쳐 둔다.
const NARROW = "(max-width: 720px)";
function useNarrow() {
  const [narrow, setNarrow] = useState(() => typeof window !== "undefined" && window.matchMedia?.(NARROW).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(NARROW);
    if (!mq) return undefined;
    const on = (e) => setNarrow(e.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return narrow;
}

// 자주 묻는 질문 한 건.
//
// 넓은 화면에서는 두 칸으로 나란히 놓여 짧고 훑기 좋으니 답까지 다 보인다. 폰에서는 한 칸으로
// 쌓이는데, 일곱 개가 답까지 다 펼쳐지면 이 구역 하나가 2,000px을 넘었다. 폰에서는 질문만
// 보여 주고 누르면 답이 열린다 — 사람은 자기 질문만 찾아 읽는다.
//
// 검색엔진용 문답은 빌드할 때 따로 새겨 넣으므로(scripts/rename-reamer-index.mjs), 여기서
// 답을 접어도 검색 결과에는 그대로 나간다.
function FaqItem({ f }) {
  const narrow = useNarrow();
  const [open, setOpen] = useState(false);
  if (!narrow) {
    return (
      <div className="faq__item">
        <dt className="faq__q">{f.q}</dt>
        <dd className="faq__a">{f.a}</dd>
      </div>
    );
  }
  return (
    <div className="faq__item">
      <dt className="faq__q">
        <button type="button" className="faq__toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          <span>{f.q}</span>
          <span className="faq__mark" aria-hidden="true">{open ? "−" : "+"}</span>
        </button>
      </dt>
      {open && <dd className="faq__a">{f.a}</dd>}
    </div>
  );
}

// 작업물 한 건. 화면 캡처가 먼저 오고 설명이 따라온다 — 글보다 만든 것이 빠르다.
function WorkCase({ item, index }) {
  const [shot, setShot] = useState(0);
  const narrow = useNarrow();
  const [more, setMore] = useState(false);
  const showBuilt = !narrow || more;
  const current = item.shots[shot];
  // 제품 색을 그 카드 안에서만 쓰도록 변수로 내려보낸다.
  return (
    <article className="case" data-reveal style={item.accent ? { "--accent": item.accent } : undefined}>
      <div className="case__media" data-parallax>
        {/* 제도 치수선 — 캡처의 실제 크기와 형식 */}
        <span className="case__dim" aria-hidden>
          <span className="case__dim-label">1440 × 900 · WEBP</span>
        </span>
        <a className="case__frame" data-tilt href={item.href} target="_blank" rel="noreferrer" aria-label={`${item.name} 사이트 열기`}>
          <span className="case__glare" aria-hidden />
          <span className="case__crop" aria-hidden />
          <span className="case__scan" aria-hidden />
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
          {item.live && <Decor name="ping"><LivePing url={item.href} /></Decor>}
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

        {showBuilt && (
          <ul className="case__built" id={`built-${index}`}>
            {item.built.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        )}
        {showBuilt && item.note && <p className="case__note">{item.note}</p>}
        {narrow && (
          <button
            type="button"
            className="case__more"
            aria-expanded={more}
            aria-controls={`built-${index}`}
            onClick={() => setMore((v) => !v)}
          >
            {more ? "접기" : `만든 것 ${item.built.length}가지 보기`}
            <span aria-hidden="true" className="case__more-mark">{more ? "−" : "+"}</span>
          </button>
        )}

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

const SPY_IDS = ["work", "why", "services", "process", "guarantee"];
const RULER_SECTIONS = [...NAV.map((n) => [n.href.slice(1), n.label]), ["about", "소개"], ["contact", "문의"]];

const ReamerSite = () => {
  const navRef = useRef(null);
  useReveal();
  useScrollChrome(navRef);
  useScrub();
  usePointerFx();
  const active = useScrollSpy(SPY_IDS);
  const floatCta = useFloatingCta();
  useScrambleLabels();

  return (
    <>
      <Decor name="backdrop"><SiteBackdrop /></Decor>
      <Decor name="grid"><CursorGrid /></Decor>
      <Decor name="ruler"><ScrollRuler sections={RULER_SECTIONS} /></Decor>
      <Decor name="sparks"><ClickSparks /></Decor>

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
                <a className={`nav__link${active && item.href === `#${active}` ? " is-active" : ""}`} href={item.href}
                  aria-current={active && item.href === `#${active}` ? "true" : undefined}>
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
          <div className="nav__right">
            {/* 이미 문의한 사람이 돌아올 자리. 링크를 잃었으면 여기서 다시 받는다. */}
            <a className="nav__link" href="/t">
              내 의뢰
            </a>
            <a className="nav__cta" data-magnet href="#contact">
              개발 문의
            </a>
          </div>
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
                {/* 내거는 문장. 앞 줄이 문턱을 없애고, 뒷 줄이 약속한다.
                    두 줄을 같은 크기로 두면 무엇이 약속인지 흐려지므로 뒷 줄만 강조한다. */}
                <h1 className="display">
                  <Chars text="아이디어마저" />
                  <br />
                  <Chars text="없어도 괜찮습니다" />
                  <br />
                  <em className="display__vow">
                    <Chars text="뭐든 만들어 드립니다" />
                  </em>
                </h1>
                <p className="lede">
                  웹사이트, 앱, 결제·본인인증 연동, AI 기능, 업무 자동화까지. 기획서가 없어도, 아직 무엇을
                  만들지 몰라도 괜찮습니다. <b>무엇을 만들지부터 함께 정합니다.</b>
                </p>
                <div className="actions">
                  <a className="btn btn--solid" data-magnet href="#contact">
                    무료로 견적 받기 <span className="btn__arrow">→</span>
                  </a>
                  <a className="btn btn--ghost" data-magnet href="#work">
                    작업물 보기
                  </a>
                </div>
                <p className="hero__note">{HERO_NOTE}</p>
              </div>
              <Decor name="terminal"><BuildTerminal projects={WORK} /></Decor>
            </div>
          </section>

          <Ticker />

          {/* 작업물을 맨 앞에 둔다. 외주를 맡기려는 사람이 가장 먼저 확인하는 건
              소개 글이 아니라 "이 사람이 만든 게 뭔가"다. */}
          <section className="section" id="work">
            <div className="wrap">
              <header className="head" data-reveal>
                <p className="label">작업물</p>
                <h2 className="title">
                  <TitleChars text="직접 만들어 지금도 운영하고 있습니다." />
                </h2>
                <p className="lede">
                  {/* 개수를 글에 박아두면 작업물을 추가할 때마다 한쪽만 고치게 된다. */}
                  아래 {WORK.length}개 서비스는 지금 주소를 열면 그대로 쓸 수 있습니다. 화면도 직접 캡처했습니다.
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

              {/* 작업물을 다 훑고 마음이 움직이는 지점이 여기다. 여기서 문의하려면
                  맨 아래 양식까지 다시 스크롤을 내려야 했다 — 그 사이에 대부분 닫는다. */}
              <div className="cta" data-reveal>
                <p className="cta__line">비슷한 것을 만들고 싶으신가요?</p>
                <a className="btn btn--solid" data-magnet href="#contact">
                  무료로 문의하기 <span className="btn__arrow">→</span>
                </a>
                <p className="cta__note">범위가 정해지기 전까지는 비용이 없습니다. 견적만 받아 보셔도 괜찮습니다.</p>
              </div>
            </div>
          </section>

          <Manifesto />

          {/* 작업물이 "만들 수 있는가"에 답했다면, 여기는 "맡겨도 되는가"에 답한다.
              개발 외주에서 사고가 나는 지점은 거의 정해져 있어서 그 지점을 먼저 짚는다. */}
          <section className="section" id="why">
            <div className="wrap">
              <header className="head" data-reveal>
                <p className="label">맡기는 이유</p>
                <h2 className="title">
                  <TitleChars text="외주가 어긋나는 지점은 늘 비슷합니다." />
                </h2>
              </header>

              <ul className="why">
                {WHY.map((w, i) => (
                  <li className="why__item" key={w.head} data-reveal data-spot style={{ "--i": i }}>
                    <span className="orbit" aria-hidden />
                    <h3 className="why__head">{w.head}</h3>
                    <p className="why__body">{w.body}</p>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section className="section" id="services">
            <div className="wrap wrap--solid">
              <header className="head" data-reveal>
                <p className="label">하는 일</p>
                <h2 className="title">
                  <TitleChars text="이런 일을 맡길 수 있습니다." />
                </h2>
                <p className="lede">
                  기획서가 다 없어도 됩니다. 이야기를 나누며 범위를 좁히고, 직접 만들어서,
                  실제로 돌아가는 상태로 넘겨드립니다.
                </p>
              </header>
              <Decor name="solid"><BlueprintSolid /></Decor>

              <div className="svc">
                {SERVICES.map((sv, i) => (
                  <div className="svc__item" key={sv.name} data-reveal data-spot style={{ "--i": i }}>
                    <span className="orbit" aria-hidden />
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
                  <TitleChars text="맡기시면 이렇게 진행됩니다." />
                </h2>
                <p className="lede">
                  처음 두 단계는 비용이 들지 않습니다. 범위와 금액을 정한 뒤에 시작합니다.
                </p>
              </header>

              <ol className="steps" data-scrub>
                {PROCESS.map((p, i) => (
                  <li className="step" key={p.no} data-reveal style={{ "--k": (i / PROCESS.length).toFixed(3), "--d": `${i * 0.07}s` }}>
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
                  <FaqItem key={f.q} f={f} />
                ))}
              </dl>
            </div>
          </section>

          {/* 약속. 맡기는 쪽이 손해 볼 수 있는 지점마다 하나씩 대응한다. */}
          <section className="section section--vow" id="guarantee">
            <div className="wrap">
              <header className="head" data-reveal>
                <p className="label">약속</p>
                <h2 className="title">
                  <TitleChars text="여섯 가지를 약속합니다." />
                </h2>
              </header>
              <ul className="vow">
                {GUARANTEES.map((g, i) => (
                  <li className="vow__item" key={g.head} data-reveal style={{ "--d": `${(i % 3) * 0.08 + Math.floor(i / 3) * 0.12}s` }}>
                    <span className="vow__mark" aria-hidden />
                    <div>
                      <h3 className="vow__head">{g.head}</h3>
                      <p className="vow__body">{g.body}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section className="section" id="about">
            <div className="wrap about">
              <div className="about__intro" data-reveal>
                <p className="label">소개</p>
                <h2 className="title">
                  <TitleChars text="정원영" />
                </h2>
                <p className="lede">
                  리머 대표. 한국디지털미디어고등학교 해킹방어과를 졸업하고 중앙대학교 전자전기공학부에
                  재학 중입니다. 여러 번의 창업, 그리고 AI 오답으로 직접 손해를 본 경험을 계기로 리머를
                  시작했습니다. 맡은 일은 대표가 직접 만듭니다.
                </p>
                <blockquote className="quote">
                  “허술하게 남겨 둔 구멍은 결국 누군가 대가를 치르게 된다는 걸 직접 겪었습니다.”
                </blockquote>

                {/* 연혁을 다 읽지 않아도 보이도록 앞에 둔다. 맡기기 전에 확인하는 건 대개 이 넷이다. */}
                <dl className="cred">
                  {CREDENTIALS.map((c) => (
                    <div className="cred__row" key={c.k}>
                      <dt className="cred__k">{c.k}</dt>
                      <dd className="cred__v">
                        {c.v}
                        {c.sub && <span className="cred__sub">{c.sub}</span>}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>

              <ol className="tl" data-scrub>
                {TIMELINE.map((item, i) => (
                  <li className={`tl__item${item.now ? " tl__item--now" : ""}`} key={item.title} data-reveal style={{ "--k": (i / TIMELINE.length).toFixed(3) }}>
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
                  <TitleChars text="무엇을 만들어 드릴까요?" />
                </h2>
                <p className="lede">
                  기획이 절반만 잡혀 있어도 괜찮습니다. 무엇을 만들지부터 함께 정리합니다.
                  영업일 기준 하루 안에 답장드립니다.
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
          {/* 입자로 모이는 이름. 커서가 지나가면 흩어졌다가 제자리로 돌아온다. */}
          <div className="wrap">
            <Decor name="particles"><ParticleWord /></Decor>
          </div>
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

      {/* 폰에서 스크롤하는 동안 아래에 따라다니는 문의 버튼. 히어로를 지나면 나오고, 문의 구역이 보이면 비킨다. */}
      <div className={`float-cta${floatCta ? " is-on" : ""}`} aria-hidden={!floatCta}>
        <span className="float-cta__text"><b>상담·견적 무료</b><br />하루 안에 답장드립니다</span>
        <a className="btn btn--solid" href="#contact" tabIndex={floatCta ? 0 : -1}>
          문의하기 <span className="btn__arrow">→</span>
        </a>
      </div>
    </>
  );
};

export default ReamerSite;
