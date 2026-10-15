// 조문 하나만 보고는 판정할 수 없는 경우 — 그 조문이 내용을 다른 곳에 맡기거나 끌어다 쓸 때.
//
// 1) 위임: "연 100분의 40 이내의 범위에서 … 대통령령으로 정하는 이율"(근로기준법 제37조①).
//    실제 이율(연 100분의 20)은 시행령 제17조에 있다. 법률 조문만 넘기면 "20%"라는 맞는 주장이
//    "40%와 다르다"며 틀렸다고 나간다(2026-10-13 감사 #3).
// 2) 참조 정의: "“평균임금”이란 「근로기준법」 제2조제1항제6호에 따른 평균임금을 말한다"(근퇴법 제2조4호).
//    정의의 실체는 참조된 조문에 있다. 이 조문만 보면 "3개월 임금총액÷총일수"가 없다며 틀렸다고 한다.
//
// 그래서 대조 전에 맡긴 곳(시행령·시행규칙)과 끌어다 쓴 곳(참조 조문)을 받아 본문 뒤에 붙인다.
// 덤으로 붙이는 것이라, 조회가 실패하면 조용히 빠지고 원래 조문만으로 대조한다.
import { searchStatute, getStatuteArticlesAll, getStatuteProvision } from "./lawApi.js";
import { normalizeLawName, resolveLawAlias } from "./nec/identifiers.js";

const MAX_DECREE_ARTICLES = 3;
const MAX_REFERENCES = 4;
const MAX_LINK_CHARS = 900;

const clip = (s) => (s.length > MAX_LINK_CHARS ? s.slice(0, MAX_LINK_CHARS) + "…" : s);

// "대통령령으로 정하는 이율", "고용노동부령으로 정한다", "총리령 또는 부령으로 정하는"
const DELEGATION = /(대통령령|총리령|[가-힣]{0,10}부령)으로\s*정(?:하|한)/g;

/** 조문이 내용을 맡긴 하위 법령의 종류 — "시행령"(대통령령)·"시행규칙"(총리령·부령). */
export function delegationsIn(text) {
  const kinds = [...String(text || "").matchAll(DELEGATION)].map((m) => (m[1] === "대통령령" ? "시행령" : "시행규칙"));
  return [...new Set(kinds)];
}

// 시행령 조문이 모법의 위임 문구를 따옴표로 받아 정의하는가("법 제37조제1항에서 "대통령령으로 정하는 이율"이란").
const squashAll = (s) => String(s || "").replace(/\s/g, "");
const QUOTED_DELEGATION = /["“]([^"”]*?(?:대통령령|총리령|부령)으로\s*정하는[^"”]*)["”]/g;
function definesPhraseOf(decreeText, statuteText) {
  const statute = squashAll(statuteText);
  return [...String(decreeText).matchAll(QUOTED_DELEGATION)].some((m) => statute.includes(squashAll(m[1])));
}

// 시행령에서 모법 조문을 가리키는 표기("법 제37조제1항"). 「다른법」 제37조나 제37조의2는 아니다.
function citesParent(text, no, branch) {
  const tail = branch ? `의\\s*${branch}(?!\\d)` : "(?!\\d|\\s*의\\s*\\d)";
  return new RegExp(`(^|[^가-힣」])법\\s*제\\s*${no}\\s*조${tail}`).test(text);
}

// "「근로기준법」 제2조제1항제6호에 따른 평균임금을 말한다" — 정의·준용처럼 내용을 통째로 끌어다 쓰는
// 참조만 따라간다. "「은행법」에 따른 은행"처럼 조문 없이 이름만 든 것이나 단순 언급은 두고 간다.
const REFERENCE = /「([^」]+)」\s*제\s*(\d+)\s*조(?:\s*의\s*(\d+))?(?:\s*제\s*(\d+)\s*항)?(?:\s*제\s*(\d+)\s*호)?([^.\n]{0,60})/g;
const BY_REFERENCE = /^\s*(?:에\s*따른\s*([^.\n]*?)(?:을|를)\s*말한다|에\s*따른다|(?:을|를)\s*준용한다)/;

export function referencesIn(text) {
  const out = [];
  for (const m of String(text || "").matchAll(REFERENCE)) {
    const how = m[6].match(BY_REFERENCE);
    if (!how) continue;
    const ref = {
      law: m[1].trim(),
      no: Number(m[2]),
      branch: m[3] ? Number(m[3]) : null,
      paragraph: m[4] ? Number(m[4]) : null,
      item: m[5] ? Number(m[5]) : null,
      term: (how[1] || "").trim(),
    };
    ref.label = `제${ref.no}조${ref.branch ? `의${ref.branch}` : ""}${ref.paragraph ? `제${ref.paragraph}항` : ""}${ref.item ? `제${ref.item}호` : ""}`;
    if (!out.some((r) => normalizeLawName(r.law) === normalizeLawName(ref.law) && r.label === ref.label)) out.push(ref);
  }
  return out;
}

async function decreeLinks({ lawName, article, text }) {
  const kinds = delegationsIn(text);
  if (!kinds.length || !article) return [];
  const base = String(lawName).replace(/\s*시행(령|규칙)$/, "").trim();
  const out = [];
  for (const decree of kinds) {
    const decreeName = `${base} ${decree}`;
    if (normalizeLawName(decreeName) === normalizeLawName(lawName)) continue;
    const search = await searchStatute(decreeName);
    if (!search.ok || !search.found || search.versionStatus !== "current") continue;
    const all = await getStatuteArticlesAll(search.mst);
    if (!all.ok) continue;
    // 모법 조문이 맡긴 문구("대통령령으로 정하는 이율")를 그대로 받아 정의하는 조문을 앞에 둔다.
    const hits = all.articles
      .filter((a) => a.text && !a.expired && citesParent(a.text, article.no, article.branch))
      .map((a) => ({ a, exact: definesPhraseOf(a.text, text) }))
      .sort((x, y) => Number(y.exact) - Number(x.exact))
      .slice(0, MAX_DECREE_ARTICLES);
    for (const { a } of hits) {
      const label = `제${a.no}조${a.branch ? `의${a.branch}` : ""}`;
      out.push({
        kind: "delegation",
        heading: `[위임 규정 — ${search.lawNameOfficial} ${label}] 위 조문이 ${decree === "시행령" ? "대통령령" : "부령"}으로 정하도록 맡긴 내용`,
        text: clip(a.text),
        source: { title: `${search.lawNameOfficial} - ${a.title || label}`, url: search.detailUrl },
      });
    }
  }
  return out;
}

async function referenceLinks({ lawName, text, claimText }) {
  const refs = referencesIn(text).filter((r) => normalizeLawName(resolveLawAlias(r.law) || r.law) !== normalizeLawName(lawName));
  if (!refs.length) return [];
  // 참조가 많으면 주장에 나온 용어("평균임금")를 정의하는 것부터 받는다. "임금"은 "평균임금" 안에도
  // 들어 있으므로 더 긴(구체적인) 용어가 앞선다.
  const claim = String(claimText || "").replace(/\s/g, "");
  const ranked = refs
    .map((r, i) => {
      const term = r.term.replace(/\s/g, "");
      return { r, i, hit: term && claim.includes(term) ? term.length : 0 };
    })
    .sort((x, y) => y.hit - x.hit || x.i - y.i)
    .slice(0, MAX_REFERENCES)
    .map(({ r }) => r);
  const out = [];
  for (const r of ranked) {
    const search = await searchStatute(resolveLawAlias(r.law) || r.law);
    if (!search.ok || !search.found || search.versionStatus !== "current") continue;
    const p = await getStatuteProvision(search.mst, r.no, r.branch, { paragraph: r.paragraph, item: r.item });
    if (!p.ok || !p.found) continue;
    out.push({
      kind: "reference",
      heading: `[참조 조문 — ${search.lawNameOfficial} ${r.label}] 위 조문이 그대로 끌어다 쓰는 규정`,
      text: clip(p.text),
      source: { title: `${search.lawNameOfficial} ${r.label}`, url: search.detailUrl },
    });
  }
  return out;
}

/**
 * 조문 본문에 위임 규정·참조 조문을 붙인 대조용 텍스트를 만든다.
 * @returns {{ text: string, sources: {title:string,url:string}[], links: object[] }}
 */
export async function withLinkedProvisions({ lawName, article, text, claimText }) {
  let links = [];
  try {
    const [d, r] = await Promise.all([decreeLinks({ lawName, article, text }), referenceLinks({ lawName, text, claimText })]);
    links = [...d, ...r];
  } catch {
    links = [];
  }
  if (!links.length) return { text, sources: [], links };
  return {
    text: [text, ...links.map((l) => `\n${l.heading}\n${l.text}`)].join("\n"),
    sources: links.map((l) => l.source),
    links,
  };
}
