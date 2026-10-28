// 공개 글 페이지 — /hallucination(허브), /hallucination/:slug(글), /hallucination-index/special-N(특별호 표지).
//
// 검색으로 들어오는 사람이 처음 보는 베리라인다. 그래서 서버에서 완성된 HTML을 내보낸다(자바스크립트 없이도
// 본문·제목·구조화 데이터가 다 있다). 틀은 지수 페이지(renderIndexPage.page)를 같이 쓴다 — 같은 출판물이다.
import { esc } from "./renderPages.js";
import { page } from "./renderIndexPage.js";
import { ARTICLES, ARTICLE_BASE, HUB, PUBLISHED, SPECIAL_ISSUES, articlePath } from "./articles.js";

import { siteOrigin } from "./site.js";
const SITE = siteOrigin();
const ORG = { "@type": "Organization", name: "베리라인(VERILINE)", url: SITE, logo: `${SITE}/veriline-icon-512.png` };
const kDate = (iso) => {
  const [y, m, d] = String(iso).split("-").map(Number);
  return `${y}년 ${m}월 ${d}일`;
};
const ld = (obj) => `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, "\\u003c")}</script>`;

const STYLE = `
.crumbs { font-size:12.5px; color:var(--ink3); padding:18px 0 0; display:flex; gap:6px; flex-wrap:wrap; }
.crumbs a { color:var(--ink3); text-decoration:none; } .crumbs a:hover { color:var(--accent); }
.art { max-width:720px; }
.art-head { padding:26px 0 22px; border-bottom:2px solid var(--ink); }
.art-head h1 { font-family:var(--display); font-weight:900; font-size:clamp(28px,4.6vw,44px); line-height:1.22; letter-spacing:-.02em; margin:10px 0 0; text-wrap:balance; }
.art-head .lede { font-size:clamp(16px,1.8vw,18.5px); color:var(--ink2); line-height:1.8; margin:16px 0 0; }
.art-meta { font-size:12.5px; color:var(--ink3); margin-top:14px; display:flex; gap:12px; flex-wrap:wrap; }
.art-body { padding:10px 0 20px; font-size:16.5px; line-height:1.9; }
.art-body h2 { font-family:var(--display); font-size:clamp(21px,2.6vw,25px); font-weight:700; margin:38px 0 10px; letter-spacing:-.01em; line-height:1.35; }
.art-body h3 { font-size:17px; margin:24px 0 6px; }
.art-body p { margin:12px 0; } .art-body ul { padding-left:20px; } .art-body li { margin:6px 0; }
.art-body a { color:var(--accent); text-underline-offset:3px; }
.art-body table { font-size:14.5px; }
.art-body .callout { background:var(--sheet); border:1px solid var(--line); border-left:3px solid var(--accent); border-radius:10px; padding:14px 18px; margin:18px 0; font-size:15px; }
.art-body .callout ul { margin:8px 0 0; }
.art-body .muted { font-size:13.5px; }
.next { display:grid; grid-template-columns:repeat(auto-fit,minmax(230px,1fr)); gap:12px; margin-top:16px; }
.next a { display:block; text-decoration:none; color:var(--ink); background:var(--sheet); border:1px solid var(--line); border-radius:14px; padding:16px 18px; }
.next a:hover { border-color:var(--accent); }
.next .k { font-size:11.5px; color:var(--ink3); letter-spacing:.06em; }
.next .t { font-weight:700; margin-top:4px; line-height:1.45; }
.try { margin:30px 0 10px; padding:22px 24px; border-radius:18px; background:var(--ink); color:var(--paper); }
.try h2 { margin:0; font-family:var(--display); font-size:22px; }
.try p { color:inherit; opacity:.8; margin:8px 0 0; font-size:15px; }
.try .btns a.btn { background:var(--paper); color:var(--ink); border-color:transparent; }
.try .btns a.btn.alt { background:transparent; color:var(--paper); border-color:rgba(255,255,255,.35); }
.issue-list { margin-top:18px; }
.issue-list a { display:grid; grid-template-columns:42px minmax(0,1fr); gap:14px; padding:18px 0; border-top:1px solid var(--line); text-decoration:none; color:var(--ink); }
.issue-list .n { font-family:var(--display); font-weight:900; font-size:24px; color:var(--accent); }
.issue-list .t { font-family:var(--display); font-weight:700; font-size:19px; line-height:1.4; }
.issue-list .d { font-size:14px; color:var(--ink2); margin-top:4px; line-height:1.7; }
.faq details { border-top:1px solid var(--line); padding:14px 0; }
.faq summary { cursor:pointer; font-weight:700; font-size:16px; }
.faq p { color:var(--ink2); margin:8px 0 0; font-size:15px; line-height:1.8; }
`;

function articleCard(slug, label) {
  const a = ARTICLES[slug];
  return `<a href="${articlePath(slug)}"><div class="k">${esc(label)}</div><div class="t">${esc(a.title)}</div></a>`;
}

function tryBox() {
  return `<aside class="try noprint"><h2>지금 가진 AI 답변, 원문으로 체크해 보세요</h2>
<p>AI 답변을 통째로 붙여 넣으면 베리라인이 사실 주장을 하나씩 떼어 공식 원문과 대조합니다. 매일 무료 3회.</p>
<div class="btns"><a class="btn" href="${SITE}/check">베리라인으로 할루시네이션 체크</a><a class="btn alt" href="${SITE}/">기업용 · AI 감사</a></div></aside>`;
}

export function renderArticle(slug, { base = "" } = {}) {
  const a = ARTICLES[slug];
  if (!a) return null;
  const issue = SPECIAL_ISSUES.find((s) => s.no === a.issue);
  const siblings = issue.articles.filter((s) => s !== slug);
  const others = Object.keys(ARTICLES).filter((s) => ARTICLES[s].issue !== a.issue).slice(0, 2);
  const path = articlePath(slug);
  const head = [
    ld({
      "@context": "https://schema.org",
      "@type": "Article",
      headline: a.title,
      description: a.description,
      inLanguage: "ko-KR",
      datePublished: PUBLISHED,
      dateModified: a.updated || PUBLISHED,
      author: ORG,
      publisher: ORG,
      mainEntityOfPage: `${SITE}${path}`,
      isPartOf: { "@type": "PublicationIssue", name: `VERILINE 할루시네이션 지수 · ${issue.title}`, url: `${SITE}/hallucination-index/${issue.slug}` },
      about: ["AI 할루시네이션", "AI 환각", "할루시네이션 체크"],
      image: `${SITE}/og-yume.png`,
    }),
    ld({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "베리라인", item: SITE },
        { "@type": "ListItem", position: 2, name: "AI 할루시네이션", item: `${SITE}${ARTICLE_BASE}` },
        { "@type": "ListItem", position: 3, name: a.title, item: `${SITE}${path}` },
      ],
    }),
  ].join("\n");
  const body = `
<nav class="crumbs" aria-label="현재 위치"><a href="/">베리라인</a><span>›</span><a href="${ARTICLE_BASE}">AI 할루시네이션</a><span>›</span><a href="/hallucination-index/${issue.slug}">${esc(issue.title)}</a></nav>
<article class="art">
  <header class="art-head">
    <div class="kicker">VERILINE 할루시네이션 지수 · ${esc(issue.title)}</div>
    <h1>${esc(a.title)}</h1>
    <p class="lede">${esc(a.lede)}</p>
    <div class="art-meta"><span>베리라인</span><span>${esc(kDate(a.updated || PUBLISHED))}</span><span>읽는 데 약 ${a.minutes}분</span></div>
  </header>
  <div class="art-body">${a.body}</div>
  ${tryBox()}
  <section style="border-bottom:0;padding-top:20px"><h2 style="font-size:19px">${esc(issue.title)}의 다른 글</h2>
    <div class="next">${siblings.map((s) => articleCard(s, issue.title)).join("")}</div>
    <h2 style="font-size:19px;margin-top:26px">함께 읽기</h2>
    <div class="next">${others.map((s) => articleCard(s, SPECIAL_ISSUES.find((x) => x.no === ARTICLES[s].issue).title)).join("")}<a href="${ARTICLE_BASE}"><div class="k">총정리</div><div class="t">AI 할루시네이션 — 뜻, 원인, 유형, 체크 방법</div></a></div>
  </section>
</article>`;
  return page({ title: a.seoTitle, description: a.description, path, body, base, head, style: STYLE });
}

export function renderHub({ base = "" } = {}) {
  const path = ARTICLE_BASE;
  const head = [
    ld({
      "@context": "https://schema.org",
      "@type": "Article",
      headline: HUB.title,
      description: HUB.description,
      inLanguage: "ko-KR",
      datePublished: PUBLISHED,
      dateModified: PUBLISHED,
      author: ORG,
      publisher: ORG,
      mainEntityOfPage: `${SITE}${path}`,
      about: ["AI 할루시네이션", "AI 환각", "할루시네이션 체크"],
      image: `${SITE}/og-yume.png`,
    }),
    ld({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: HUB.faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
    }),
    ld({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "베리라인", item: SITE },
        { "@type": "ListItem", position: 2, name: "AI 할루시네이션", item: `${SITE}${path}` },
      ],
    }),
  ].join("\n");
  const short = [
    ["뜻", "생성형 AI가 사실이 아니거나 근거 없는 내용을 사실처럼 자신 있게 말하는 현상. '환각'이라고도 합니다.", "what"],
    ["원인", "언어 모델은 참이 아니라 그럴듯한 다음 단어를 고릅니다. 기억의 빈칸, 학습 시점, 틀린 전제, 출처 요구에서 특히 자주 생깁니다.", "what"],
    ["유형", "없는 근거 지어내기, 거짓 전제 편승, 세부 수치 오류, 있는 규정 부정, 틀린 자료 전파, 개정 미반영, 출처 조작, 과신.", "types"],
    ["사례", "가짜 판례를 인용해 제재받은 변호사(2023), 챗봇의 잘못된 안내에 회사 책임을 인정한 결정(2024), 법원 문서 사례 1,624건(2026년 6월).", "cases"],
    ["체크 방법", "사실 주장을 뽑고, 원문이 있어야 할 곳에서 현행 원문을 열어 문장 단위로 대조하고, 못 찾은 것은 '확인 안 됨'으로 둡니다.", "check"],
    ["가짜 판례 판별", "못 찾았다고 곧 없다고 하지 않습니다. 탐색 커버리지·형식·근접도로 '없음'의 확신을 숫자로 냅니다.", "nonexistence"],
  ];
  const body = `
<nav class="crumbs" aria-label="현재 위치"><a href="/">베리라인</a><span>›</span><span>AI 할루시네이션</span></nav>
<article class="art" style="max-width:820px">
  <header class="art-head">
    <div class="kicker">총정리 · VERILINE 할루시네이션 지수</div>
    <h1>${esc(HUB.title)}</h1>
    <p class="lede">${esc(HUB.lede)}</p>
    <div class="art-meta"><span>베리라인</span><span>${esc(kDate(PUBLISHED))}</span></div>
  </header>
  <div class="art-body">
    <h2>짧게 답하면</h2>
    <table>${short.map(([k, v, s]) => `<tr><th style="width:120px">${esc(k)}</th><td>${esc(v)} <a href="${articlePath(s)}">자세히</a></td></tr>`).join("")}</table>
  </div>
  ${SPECIAL_ISSUES.map((iss) => `<section style="padding-top:18px"><div class="kicker">${esc(iss.title)}</div><h2 style="margin-top:6px">${esc(iss.kicker)}</h2><p class="lede">${esc(iss.intro)}</p>
  <div class="issue-list">${iss.articles.map((s, i) => `<a href="${articlePath(s)}"><span class="n">${i + 1}</span><span><span class="t">${esc(ARTICLES[s].title)}</span><span class="d" style="display:block">${esc(ARTICLES[s].description)}</span></span></a>`).join("")}</div></section>`).join("")}
  <section><h2>VERILINE 할루시네이션 지수</h2><p class="lede">AI가 근거 없이 지어내는 비율을 공식 원문으로 정답을 확정한 질문으로, 같은 방법을 써서 반복해 잽니다. 숫자마다 표본·신뢰구간·방법을 함께 싣고, 발행본에는 고칠 수 없는 지문을 붙입니다.</p>
  <div class="btns"><a class="btn primary" href="/hallucination-index">지수 보기</a><a class="btn" href="/hallucination-index#method">측정 방법</a></div></section>
  <section class="faq"><h2>자주 묻는 질문</h2>${HUB.faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("")}</section>
  ${tryBox()}
</article>`;
  return page({ title: HUB.seoTitle, description: HUB.description, path, body, base, head, style: STYLE });
}

export function renderSpecialIssue(slug, { base = "" } = {}) {
  const iss = SPECIAL_ISSUES.find((s) => s.slug === slug);
  if (!iss) return null;
  const path = `/hallucination-index/${iss.slug}`;
  const head = ld({
    "@context": "https://schema.org",
    "@type": "PublicationIssue",
    name: `VERILINE 할루시네이션 지수 · ${iss.title}`,
    issueNumber: `특별호 ${iss.no}`,
    datePublished: PUBLISHED,
    description: iss.description,
    publisher: ORG,
    hasPart: iss.articles.map((s) => ({ "@type": "Article", headline: ARTICLES[s].title, url: `${SITE}${articlePath(s)}` })),
  });
  const body = `
<div class="mast">
  <div class="kicker">VERILINE 할루시네이션 지수 · 특별호 ${iss.no} · ${esc(kDate(PUBLISHED))}</div>
  <h1>${esc(iss.title.replace(/^특별호 \d+ · /, ""))}</h1>
  <p class="sub">${esc(iss.kicker)}</p>
</div>
<section><p class="commentary" style="margin-top:0">${esc(iss.intro)}</p>
<p class="muted">특별호는 측정 데이터 없이 쓰는 해설입니다. 숫자를 싣는 정기호와 구분합니다.</p>
<div class="issue-list">${iss.articles.map((s, i) => `<a href="${articlePath(s)}"><span class="n">${i + 1}</span><span><span class="t">${esc(ARTICLES[s].title)}</span><span class="d" style="display:block">${esc(ARTICLES[s].lede)}</span></span></a>`).join("")}</div></section>
<section style="border-bottom:0"><h2>다른 호</h2><div class="next">${SPECIAL_ISSUES.filter((x) => x.slug !== slug).map((x) => `<a href="/hallucination-index/${x.slug}"><div class="k">특별호 ${x.no}</div><div class="t">${esc(x.title.replace(/^특별호 \d+ · /, ""))}</div></a>`).join("")}<a href="/hallucination-index"><div class="k">정기호</div><div class="t">VERILINE 할루시네이션 지수 — 지난 호</div></a></div>
${tryBox()}</section>`;
  return page({ title: `${iss.title} · VERILINE 할루시네이션 지수`, description: iss.description, path, body, base, head, style: STYLE });
}

// 사이트맵 — 정적 페이지 + 글 + 발행한 지수. 검색엔진이 새 글을 빨리 찾게 서버가 만든다.
export function sitemapXml(issues = []) {
  const urls = [
    ["/", "weekly", "1.0", null],
    [ARTICLE_BASE, "monthly", "0.9", PUBLISHED],
    ...Object.keys(ARTICLES).map((s) => [articlePath(s), "monthly", "0.8", ARTICLES[s].updated || PUBLISHED]),
    ["/hallucination-index", "weekly", "0.8", null],
    ...SPECIAL_ISSUES.map((s) => [`/hallucination-index/${s.slug}`, "monthly", "0.7", PUBLISHED]),
    ...issues.map((i) => [`/hallucination-index/${i.slug}`, "yearly", "0.7", new Date(Number(i.published_at)).toISOString().slice(0, 10)]),
    ["/products", "monthly", "0.6", null],
    ["/docs/api", "monthly", "0.6", null],
    ["/refund", "yearly", "0.3", null],
    ["/terms", "yearly", "0.3", null],
    ["/privacy", "yearly", "0.3", null],
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(([p, f, pr, lm]) => `  <url><loc>${SITE}${p}</loc>${lm ? `<lastmod>${lm}</lastmod>` : ""}<changefreq>${f}</changefreq><priority>${pr}</priority></url>`).join("\n")}
</urlset>
`;
}
