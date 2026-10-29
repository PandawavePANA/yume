// 기업용 첫 화면 SEO(2026-10-29 대표 "SEO 탑티어"). 빌드 때 business.html에 세 가지를 넣는다.
//   1) #root 안의 정적 본문 — 화면은 React가 그리고(createRoot가 #root 안을 통째로 바꾼다), 검색엔진은 이 글을 바로 읽는다.
//      네이버 · 다음 수집기는 자바스크립트를 거의 돌리지 않아, 예전에는 HTML 원문에 글이 667자뿐이었다.
//      글은 화면과 같은 원본(src/businessContent.js · server/apiRates.js)에서 만든다 — 사람이 보는 글과 다르면 클로킹이다.
//   2) 구조화 데이터(JSON-LD) — 회사 · 사이트 · 서비스와 가격 · FAQ. 평점 · 후기처럼 없는 것은 넣지 않는다.
//   3) 검색엔진 소유 확인 메타 — 대표가 받은 값을 환경변수로(GOOGLE_SITE_VERIFICATION · NAVER_SITE_VERIFICATION). 없으면 넣지 않는다.
import { API_RATES, AUDIT_PILOT_SEATS, AUDIT_RATES, AUDIT_REFUND } from "../server/apiRates.js";
import { FAQ, HERO, PROOF_CASES, STEPS } from "../src/businessContent.js";

const ORIGIN = "https://veriline.kr";
// 서버 페이지(약관 · 개인 검사)의 앞부분 — veriline.kr이 아직 정적 서비스면 빌드 변수로 실제 서버 주소를 준다(src/businessConfig.js와 같은 값)
const SITE = (process.env.VITE_SITE_URL || "").replace(/\/+$/, "");
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const won = (n) => `${n.toLocaleString("ko-KR")}원`;

export function staticBody() {
  const regMonth = Math.round(AUDIT_RATES.audit_regular.krw / 3);
  return `
<div class="vl-seo" style="max-width:860px;margin:0 auto;padding:96px 20px;color:#E4E7EF;font-family:sans-serif;line-height:1.7">
  <header><a href="/"><img src="/veriline-logo.svg" alt="베리라인 VERILINE" width="140" height="28" /></a></header>
  <main>
    <p>${esc(HERO.badge)}</p>
    <h1>${esc(HERO.title)}</h1>
    <p>${esc(HERO.promise)}</p>
    <p>${esc(HERO.lead)}</p>
    <p><a href="#diagnosis">우리 AI 무료 진단 받기</a> · <a href="/sample-report.pdf">샘플 보고서 보기</a></p>

    <section id="cases"><h2>실제 무료 진단에서 찾은 AI 할루시네이션 — 노무 상담 AI A사</h2>
      <ul>${PROOF_CASES.map((c) => `<li><b>${esc(c.title)}</b> (${esc(c.type)}) — AI 답: ${esc(c.bad)} → 현행 원문: ${esc(c.good)} · ${esc(c.law)}</li>`).join("")}</ul>
    </section>

    <section id="how"><h2>베리라인은 AI 답변을 이렇게 검증합니다</h2>
      <ol>${STEPS.map(([t, d]) => `<li><b>${esc(t)}</b> — ${esc(d)}</li>`).join("")}</ol>
      <p>노무 · 세무 · 법률 AI 챗봇의 답을 법제처 국가법령정보센터의 현행 원문과 대조합니다. 틀린 숫자 · 기간 · 벌칙, 삭제된 조문, 없는 조문을 찾아 근거 조문과 함께 고칩니다.</p>
    </section>

    <section id="pricing"><h2>가격 — 무료 진단 → 한 번 감사 → 법이 바뀔 때마다</h2>
      <ul>
        <li><b>무료 진단 0원</b> — 함정 질문 10~15개 · 원문과 다른 답과 근거 조문 요약 · 영업일 3일</li>
        <li><b>정밀 감사 ${won(AUDIT_RATES.audit.krw)}</b>(1회, 부가세 별도 · 첫 ${AUDIT_PILOT_SEATS}곳 ${won(AUDIT_RATES.audit_pilot.krw)}) — 함정 질문 50개 · 확정된 오류만 원문과 나란히 · 30분 설명 · 고친 뒤 재검사 1회 · ${esc(AUDIT_REFUND)}</li>
        <li><b>정기 감사 월 ${won(regMonth)}꼴</b>(분기 ${won(AUDIT_RATES.audit_regular.krw)} 청구) — 분기마다 30문항 · 관련 법이 바뀌면 바뀐 조문 질문을 바로 재검사</li>
        <li><b>검증 API</b> — 매달 ${API_RATES.trial.calls}건 무료 · 종량 ${won(API_RATES.metered.unitKrw)}/건 · 스타터 월 ${won(API_RATES.tiers[0].monthlyKrw)}</li>
      </ul>
    </section>

    <section id="faq"><h2>자주 묻는 질문</h2>
      ${FAQ.map(([q, a]) => `<h3>${esc(q)}</h3><p>${esc(a)}</p>`).join("\n      ")}
    </section>

    <section id="diagnosis"><h2>무료 진단</h2><p>서비스 주소와 연락처만 남기면 영업일 3일 안에 틀린 곳과 근거 조문을 드립니다. 문의: <a href="mailto:contact@veriline.kr">contact@veriline.kr</a></p></section>
  </main>
  <footer><p>베리라인 VERILINE · 판정은 공개 원문과 대조한 검증 정보이며 법률 · 의료 · 금융 자문이 아닙니다.</p>
    <p><a href="${SITE}/b2b/terms">기업 서비스 이용 조건</a> · <a href="${SITE}/privacy">개인정보처리방침</a> · <a href="${SITE}/check">개인 AI 할루시네이션 체크</a></p></footer>
</div>`;
}

export function jsonLd() {
  const org = {
    "@type": "Organization",
    "@id": `${ORIGIN}/#org`,
    name: "베리라인",
    alternateName: ["VERILINE", "Veriline"],
    url: `${ORIGIN}/`,
    logo: `${ORIGIN}/veriline-icon-512.png`,
    email: "contact@veriline.kr",
    description: "노무 · 세무 · 법률 AI의 답변을 법령 원문과 대조해 할루시네이션을 찾고 고치는 검증 서비스",
  };
  const site = { "@type": "WebSite", "@id": `${ORIGIN}/#site`, url: `${ORIGIN}/`, name: "베리라인", inLanguage: "ko-KR", publisher: { "@id": `${ORIGIN}/#org` } };
  const offer = (name, krw, desc) => ({
    "@type": "Offer",
    name,
    description: desc,
    price: krw,
    priceCurrency: "KRW",
    priceSpecification: { "@type": "UnitPriceSpecification", price: krw, priceCurrency: "KRW", valueAddedTaxIncluded: false },
  });
  const service = {
    "@type": "Service",
    "@id": `${ORIGIN}/#service`,
    name: "AI 할루시네이션 검증 · AI 답변 감사",
    serviceType: "AI 답변 검증",
    provider: { "@id": `${ORIGIN}/#org` },
    areaServed: { "@type": "Country", name: "대한민국" },
    description: "노무 · 세무 · 법률 AI 챗봇의 답을 법제처 현행 원문과 대조해 틀린 숫자 · 삭제된 조문 · 없는 조문을 찾습니다.",
    hasOfferCatalog: {
      "@type": "OfferCatalog",
      name: "베리라인 요금",
      itemListElement: [
        offer("무료 진단", 0, "함정 질문 10~15개 · 원문과 다른 답과 근거 조문 요약"),
        offer("정밀 감사", AUDIT_RATES.audit.krw, `함정 질문 50개 · 확정된 오류만 원문과 나란히 · ${AUDIT_REFUND}`),
        offer("정기 감사(분기)", AUDIT_RATES.audit_regular.krw, "분기마다 30문항 · 법 개정 시 즉시 재검사"),
        offer("검증 API 스타터(월)", API_RATES.tiers[0].monthlyKrw, `매달 ${API_RATES.tiers[0].calls}건`),
      ],
    },
  };
  const faq = { "@type": "FAQPage", "@id": `${ORIGIN}/#faq`, mainEntity: FAQ.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) };
  return { "@context": "https://schema.org", "@graph": [org, site, service, faq] };
}

/** vite 플러그인 — business.html에만 적용한다. */
export function businessSeoPlugin() {
  return {
    name: "veriline-business-seo",
    transformIndexHtml: {
      order: "post",
      handler(html, ctx) {
        if (!/business\.html$/.test(ctx?.filename || ctx?.path || "")) return html;
        const verify = [
          process.env.GOOGLE_SITE_VERIFICATION && `<meta name="google-site-verification" content="${esc(process.env.GOOGLE_SITE_VERIFICATION)}" />`,
          process.env.NAVER_SITE_VERIFICATION && `<meta name="naver-site-verification" content="${esc(process.env.NAVER_SITE_VERIFICATION)}" />`,
        ].filter(Boolean).join("\n    ");
        const ld = `<script type="application/ld+json">${JSON.stringify(jsonLd()).replace(/</g, "\\u003c")}</script>`;
        return html
          .replace("</head>", `    ${verify ? `${verify}\n    ` : ""}${ld}\n  </head>`)
          .replace('<div id="root"></div>', `<div id="root">${staticBody()}</div>`);
      },
    },
  };
}
