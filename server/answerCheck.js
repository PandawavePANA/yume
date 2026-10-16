// 답변 확인 — 다른 AI가 쓴 답을 내보내기 전에 유메가 확인하고, 틀린 곳은 고친 답을 돌려준다.
//
// 2026-10-16 대표 결정: 유메는 검증 엔진으로 독립해 있고, 대화형 AI(무궁 등)는 유메 API를 쓰는 별도 서비스다.
// 그래서 "답 쓰기"는 여기 없다. 여기서 하는 일은 둘이다.
//   prepareContext(질문)        — 법령 이야기면 현행 조문을 먼저 모아 준다(답을 쓰는 쪽이 원문을 근거로 쓰게).
//   checkAnswer(질문, 답)       — ① 법령은 현행 조문 전체와 대조하고 반론 검토를 통과한 오류만 남긴다(statuteReview)
//                                 ② 나머지 사실(수치·날짜·인물·기관)은 웹 출처로 확인한다. 근거로 댄 주소가 그 확인에서
//                                    실제로 검색된 결과에 없으면 인정하지 않는다(지어낸 출처 방지)
//                                 ③ 틀린 곳은 근거대로, 확인 안 된 곳은 단정하지 않게 고친 답을 돌려준다.
// "틀리지 않는다"는 보증이 아니라 방법이다 — 확인한 것과 못 한 것을 나눠 돌려준다.
import { classifyUpstream, noteUpstreamFailure, noteUpstreamSuccess } from "./upstream.js";
import { record } from "./apiCost.js";
import { todayLine } from "./claude.js";
import { LAW_HINT, gatherArticles, mergeGathered, reviewStatutes, defend } from "./statuteReview.js";
import { FIELD_KEYS, isOfficialUrl, officialDomainsFor } from "./koreaSources.js";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const TIMEOUT_MS = 170_000;

// 확인 깊이. 답을 쓴 쪽의 등급에 맞춘다 — 가벼운 답에 비싼 확인을 붙이면 원가가 답 값을 넘는다.
export const CHECK_LEVELS = {
  fast: { key: "fast", searches: 3, reviseModel: "claude-haiku-5-5", reviseEffort: "low" },
  standard: { key: "standard", searches: 4, reviseModel: "claude-sonnet-5-5", reviseEffort: "low" },
  deep: { key: "deep", searches: 5, reviseModel: "claude-sonnet-5-5", reviseEffort: "medium" },
};
const VERIFIER_MODEL = "claude-sonnet-5-5";
const EXTRACT_MODEL = "claude-haiku-5-5";
export const MAX_ANSWER_CHARS = 20_000;
export const MAX_QUESTION_CHARS = 4_000;

function apiKey() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("서버에 ANTHROPIC_API_KEY가 설정되지 않았습니다.");
  return key;
}

/** 응답의 웹 검색 결과 주소(근거로 댄 주소가 실제 검색 결과에 있었는지 대조하는 데 쓴다). */
export function searchResultUrls(content = []) {
  const urls = new Set();
  for (const b of content) if (b?.type === "web_search_tool_result" && Array.isArray(b.content)) for (const r of b.content) if (r?.url) urls.add(r.url);
  return urls;
}

function parseJsonText(text) {
  const cleaned = String(text || "").replace(/```json|```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("JSON 응답이 아닙니다.");
  return JSON.parse(cleaned.slice(start, end + 1));
}

async function callModel({ model, system, user, maxTokens = 4000, effort = "low", tools = null, ledger = null, label, fetchImpl = fetch }) {
  const body = { model, max_tokens: maxTokens, system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }], messages: [{ role: "user", content: user }], output_config: { effort } };
  if (tools) body.tools = tools;
  const res = await fetchImpl(ANTHROPIC_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey(), "anthropic-version": "2023-06-01" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.type === "error") throw noteUpstreamFailure(classifyUpstream(new Error(data.error?.message || `Claude API 오류 (${res.status})`), res.status));
  noteUpstreamSuccess();
  record(ledger, { label, model, usage: data.usage });
  return data;
}

export async function callJson(opts) {
  const data = await callModel(opts);
  const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
  return { json: parseJsonText(text), urls: searchResultUrls(data.content || []) };
}

async function callText(opts) {
  const data = await callModel(opts);
  return (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
}

// ── 사실 확인(법령 밖의 모든 분야) ─────────────────────────────────
// ① 싼 모델이 답에서 확인할 수 있는 사실만 뽑고 분야(의료·경제·세금…)를 붙인다
// ② 그 분야의 한국 공식 기관 사이트에서만 먼저 찾아 판정한다(koreaSources.js)
// ③ 거기서 결론이 안 난 것만 웹 전체에서 다시 찾는다
// ④ 근거로 댄 주소가 그 확인에서 실제로 검색된 결과에 없으면 인정하지 않는다(지어낸 출처 방지)
const EXTRACT_SYSTEM = `너는 유메의 사실 추출기다. [답변]에서 공개 자료로 참·거짓을 확인할 수 있는 사실 주장만 뽑는다. JSON만 출력한다.
뽑는 것: 수치·통계·금액·날짜·연도, 인물·기관·회사·제품의 사실, 사건, 인용문, 출처(논문·보고서·기사), 제도의 내용, 약·질병·치료의 사실(용량·부작용·금기 포함), 세율·금리·지원금 같은 기준.
뽑지 않는 것: 의견·조언·추천·감상, 예시·가정, 일반 상식 수준의 정의, 답변 안에서 직접 한 계산 과정, 인사·잡담, 코드.
quote는 답변의 문장을 한 글자도 바꾸지 않고(150자 이내). 중요한 것부터 최대 8개. 사람의 건강·돈에 영향이 큰 것을 먼저.
field는 그 사실을 공식적으로 확인할 수 있는 분야: law(법령·판례) medical(의료·의약·건강) economy(경제·금융·금리·환율) tax(세금) labor(노동·고용·임금) realestate(부동산·주거) company(기업·공시) welfare(복지·행정·교육·선거·외교) statistics(통계) general(그 밖).
출력: {"claims":[{"quote":"…","claim":"확인할 사실을 한 문장으로","kind":"legal|number|date|entity|event|quote|source|other","field":"…"}]}
확인할 사실이 없으면 {"claims":[]}.`;

const WEBCHECK_SYSTEM = `너는 유메의 사실 확인자다. 각 [주장]을 web_search로 찾아본 자료로 판정한다. 기억으로 판정하지 않는다. JSON만 출력한다.
- supported: 신뢰할 만한 자료가 주장을 뒷받침한다. url과 그 페이지의 근거 문장(quote)을 그대로 적는다.
- contradicted: 신뢰할 만한 자료가 다르게 말한다. 실제 값(correct)과 url·quote를 적는다.
- unverified: 찾아도 근거가 없거나 자료끼리 엇갈린다. 못 찾았다는 것은 틀렸다는 뜻이 아니다.
- 한국 정부·공공기관 자료를 블로그·커뮤니티·광고보다 앞에 둔다. 오늘 날짜 기준 최신 기준(올해 고시·개정)을 우선하고, 옛 기준이면 그렇다고 판정한다.
- 약·질병의 용량·금기·부작용은 식약처 허가정보나 공공 건강정보에 그대로 있을 때만 supported로 한다.
- 검색 횟수에는 한도가 있다. 여러 주장을 한 번의 검색어로 묶어 찾고, 한도에 걸리면 더 찾지 말고 **이미 받은 검색 결과로** 판정한다. 받은 결과에 근거가 있으면 한도를 이유로 unverified로 두지 않는다.
- url은 이번 검색 결과에 실제로 나온 주소만 쓴다.
출력: {"results":[{"i":번호,"verdict":"supported|contradicted|unverified","correct":"","url":"","quote":"","note":"40자 이내"}]}`;

const searchTool = (maxUses, allowedDomains = null) => ({
  type: "web_search_20260209",
  name: "web_search",
  max_uses: maxUses,
  user_location: { type: "approximate", country: "KR", timezone: "Asia/Seoul" },
  ...(allowedDomains?.length ? { allowed_domains: allowedDomains } : {}),
});

/** 주장 묶음 하나를 웹 검색으로 판정한다. 근거 주소가 이번 검색 결과에 없으면 unverified로 내린다. */
async function judgeClaims(claims, { maxUses, allowedDomains = null, ledger, label, json }) {
  const list = claims.map((c, i) => `${i + 1}. ${c.claim} (답변 원문: "${c.quote}")`).join("\n");
  const scope = allowedDomains?.length ? "[찾는 범위] 한국 공식 기관 사이트에서만 찾는다.\n" : "";
  const ver = await json({ model: VERIFIER_MODEL, system: WEBCHECK_SYSTEM, user: `${todayLine()}${scope}[주장]\n${list}`, maxTokens: 6000, effort: "low", tools: [searchTool(maxUses, allowedDomains)], ledger, label });
  const byI = new Map((ver.json?.results || []).map((r) => [Number(r.i), r]));
  return claims.map((c, k) => {
    const r = byI.get(k + 1) || { verdict: "unverified" };
    let verdict = ["supported", "contradicted", "unverified"].includes(r.verdict) ? r.verdict : "unverified";
    if (verdict !== "unverified" && !(r.url && ver.urls.has(r.url))) verdict = "unverified";
    if (verdict === "contradicted" && !String(r.correct || "").trim()) verdict = "unverified";
    const url = verdict === "unverified" ? "" : r.url;
    return { ...c, verdict, correct: r.correct || "", url, official: !!url && isOfficialUrl(url), quoteSrc: verdict === "unverified" ? "" : r.quote || "", note: r.note || "" };
  });
}

export async function checkEverydayFacts(answer, { level = CHECK_LEVELS.fast, ledger = null, skipLegal = false, json = callJson } = {}) {
  const ex = await json({ model: EXTRACT_MODEL, system: EXTRACT_SYSTEM, user: `[답변]\n${answer.slice(0, 8000)}`, maxTokens: 3000, effort: "low", ledger, label: "check_extract" });
  const quoteOk = (q) => String(q || "").replace(/\s+/g, "").length >= 4 && answer.replace(/\s+/g, "").includes(String(q).replace(/\s+/g, ""));
  const claims = (ex.json?.claims || [])
    .filter((c) => quoteOk(c.quote) && !(skipLegal && (c.kind === "legal" || c.field === "law")))
    .map((c) => ({ ...c, field: FIELD_KEYS.includes(c.field) ? c.field : "general" }))
    .slice(0, 8);
  // 확인할 사실이 없는 답(잡담·글쓰기·번역)은 여기서 끝난다 — 웹 확인 원가가 들지 않는다.
  if (!claims.length) return { claims: [], results: [] };

  // 1차: 분야가 있는 주장은 그 분야의 공식 기관 사이트에서만
  const fielded = claims.filter((c) => c.field !== "general");
  const byQuote = new Map();
  if (fielded.length) {
    const domains = officialDomainsFor([...new Set(fielded.map((c) => c.field))]);
    const first = await judgeClaims(fielded, { maxUses: level.searches, allowedDomains: domains, ledger, label: "check_official", json }).catch(() => fielded.map((c) => ({ ...c, verdict: "unverified" })));
    for (const r of first) byQuote.set(r.quote, r);
  }
  // 2차: 공식 출처에서 결론이 안 난 것과 분야가 없는 것만 웹 전체에서
  const rest = claims.filter((c) => (byQuote.get(c.quote)?.verdict || "unverified") === "unverified");
  if (rest.length) {
    const second = await judgeClaims(rest, { maxUses: level.searches, ledger, label: "check_web", json });
    for (const r of second) byQuote.set(r.quote, r);
  }
  const results = claims.map((c) => byQuote.get(c.quote) || { ...c, verdict: "unverified", correct: "", url: "", official: false, quoteSrc: "", note: "" });
  return { claims, results };
}

// ── 고쳐 쓰기 ─────────────────────────────────────────────────
const REVISE_SYSTEM = `너는 유메의 교정자다. [답변]을 [고칠 곳]대로 고쳐 답변 전체를 다시 쓴다.
- "틀림"은 근거에 적힌 실제 값으로 고치고 근거(조문 또는 출처)를 밝힌다.
- "확인 안 됨"은 단정하지 않게 고친다: 꼭 필요하지 않으면 빼고, 남길 때는 "확인되지 않았어요"처럼 불확실하다고 분명히 쓴다. 새 사실을 지어 넣지 않는다.
- "확인됨"은 출처로 확인된 사실이다. 답변에 "기억에 의존했다", "확인 자료 없이 답했다", "검색해 본 결과가 아니다"처럼 답 전체를 못 믿게 하는 말이 있으면, 확인된 사실에 대해서는 그 말을 뺀다.
- 고칠 곳이 아닌 부분은 문장과 형식을 그대로 둔다. 설명이나 머리말 없이 고친 답변 본문만 출력한다.`;

// 답 전체를 못 믿게 만드는 면책 문구 — 확인된 사실이 있으면 고쳐 쓰기 대상이 된다.
export const BLANKET_DISCLAIMER = /기억에\s*의존|확인\s*자료\s*없이|검색해\s*본\s*결과(?:는|가)\s*아니|제가\s*가진\s*지식에\s*근거한/;

/** 고쳐 쓰기를 못 했을 때 답 아래에 붙이는 바로잡음(모델 없이 코드가 쓴다). */
export function appendCorrections(text, v) {
  const lines = [
    ...v.fixes.map((f) => `- “${f.quote}” → ${f.problem}${f.law ? ` (${f.law} ${f.label})` : ""}`),
    ...v.hedged.map((h) => `- “${h.quote}” → 공개 자료로 확인되지 않았어요. 사실로 받아들이지 마세요.`),
  ];
  return `${text.trim()}\n\n---\n**유메 확인 — 바로잡을 곳**\n${lines.join("\n")}`;
}

const articlePublic = (a) => ({ law: a.law, label: `제${a.no}조${a.branch ? `의${a.branch}` : ""}`, title: a.title, url: a.url, deleted: !!a.deleted });

// ── 질문 맥락: 답을 쓰기 전에 현행 조문 ─────────────────────────────
/**
 * 법령 이야기가 든 질문이면 관련 현행 조문을 모은다. 답을 쓰는 쪽은 block을 시스템 안내에 넣는다.
 * 돌려주는 값: { legal, laws, articles:[{law,label,title,url}], block }
 */
export async function prepareContext(question, { ledger = null, deps = {} } = {}) {
  const gather = deps.gatherArticles || gatherArticles;
  const q = String(question || "").slice(0, MAX_QUESTION_CHARS);
  if (!LAW_HINT.test(q)) return { legal: false, laws: [], articles: [], block: "" };
  const g = await gather(q, [], { ledger }).catch(() => ({ laws: [], articles: [] }));
  return {
    legal: true,
    laws: g.laws,
    articles: g.articles.map(articlePublic),
    block: g.articles.length ? `[현행 조문 — 유메가 법제처 국가법령정보에서 지금 받아 온 원문. 법령 이야기는 이것을 기준으로 답하라]\n${g.articles.map((a) => a.block).join("\n\n")}` : "",
  };
}

// ── 답 확인 ──────────────────────────────────────────────────
/**
 * 답을 확인하고, 고칠 곳이 있으면 고친 답을 돌려준다.
 * 돌려주는 값: { text, changed, verification }
 *   verification: { checked, laws, articles, fixes[], hedged[], supported[], cleared, facts_checked, fact_check_failed, revise_failed }
 */
export async function checkAnswer({ question = "", answer, level: levelKey = "fast", ledger = null, onStage = () => {}, deps = {} }) {
  const level = CHECK_LEVELS[levelKey] || CHECK_LEVELS.fast;
  const gather = deps.gatherArticles || gatherArticles;
  const review = deps.reviewStatutes || reviewStatutes;
  const defendFn = deps.defend || defend;
  const everyday = deps.checkEverydayFacts || checkEverydayFacts;
  const revise = deps.revise || callText;
  const text = String(answer || "").trim();
  const q = String(question || "").slice(0, MAX_QUESTION_CHARS);

  const verification = { checked: true, laws: [], articles: [], fixes: [], hedged: [], supported: [], cleared: 0 };
  const legalTalk = LAW_HINT.test(q) || LAW_HINT.test(text);

  onStage("유메가 답 속 사실을 확인하는 중…");
  const legalCheck = legalTalk
    ? (async () => {
        const [fromQ, fromA] = await Promise.all([
          LAW_HINT.test(q) ? gather(q, [], { ledger }).catch(() => ({ laws: [], articles: [] })) : { laws: [], articles: [] },
          gather(text, [], { ledger }).catch(() => ({ laws: [], articles: [] })),
        ]);
        const all = mergeGathered(fromQ, fromA);
        if (!all.articles.length) return { all, errors: [] };
        const r = await review(text, [], { ledger, gathered: all }).catch(() => null);
        if (!r?.issues?.length) return { all, errors: [], ran: !!r?.ran };
        const cands = r.issues.map((it, i) => ({ id: `R${i}`, source: "review", index: -1, answer_quote: it.answer_quote, problem: it.problem, kind: it.kind, locked: true, proof: { law: it.law, label: it.articleLabel, url: it.url, quote: it.article_quote } }));
        const decided = await defendFn(text, all.articles, cands, { ledger }).catch(() => []);
        return { all, ran: true, errors: decided.filter((d) => d.decision === "error"), cleared: decided.filter((d) => d.decision !== "error").length };
      })()
    : Promise.resolve(null);
  const factCheck = everyday(text, { level, ledger, skipLegal: legalTalk }).catch(() => ({ claims: [], results: [], failed: true }));
  const [legal, facts] = await Promise.all([legalCheck, factCheck]);

  if (legal?.all) {
    verification.laws = legal.all.laws;
    verification.articles = legal.all.articles.slice(0, 10).map(articlePublic);
    verification.cleared += legal.cleared || 0;
    for (const e of legal.errors || []) verification.fixes.push({ type: "legal", quote: e.answer_quote, problem: e.reason || e.problem, law: e.proof?.law, label: e.proof?.label, url: e.proof?.url, evidence: e.proof?.quote });
  }
  for (const r of facts?.results || []) {
    if (r.verdict === "supported") verification.supported.push({ claim: r.claim, quote: r.quote, url: r.url, evidence: r.quoteSrc, field: r.field, official: r.official });
    else if (r.verdict === "contradicted") verification.fixes.push({ type: "fact", quote: r.quote, problem: `실제로는 ${r.correct}`, url: r.url, evidence: r.quoteSrc, field: r.field, official: r.official });
    else verification.hedged.push({ quote: r.quote, claim: r.claim, field: r.field });
  }
  verification.facts_checked = (facts?.results || []).length;
  if (facts?.failed) verification.fact_check_failed = true;

  const blanket = verification.supported.length > 0 && BLANKET_DISCLAIMER.test(text);
  let finalText = text;
  if (verification.fixes.length || verification.hedged.length || blanket) {
    onStage(verification.fixes.length ? `틀린 곳 ${verification.fixes.length}개를 근거대로 고치는 중…` : "답을 다듬는 중…");
    const lines = [
      ...verification.fixes.map((f) => `- 틀림: "${f.quote}" → ${f.problem}${f.law ? ` (근거: ${f.law} ${f.label} “${f.evidence}”)` : f.url ? ` (근거: ${f.url} “${String(f.evidence || "").slice(0, 200)}”)` : ""}`),
      ...verification.hedged.map((h) => `- 확인 안 됨: "${h.quote}"`),
      ...verification.supported.map((s) => `- 확인됨: "${s.quote || s.claim}" (출처: ${s.url})`),
    ].join("\n");
    const articlesBlock = legal?.all?.articles?.length ? `[현행 조문]\n${legal.all.articles.map((a) => a.block).join("\n\n")}\n\n` : "";
    const revised = await revise({
      model: level.reviseModel,
      system: REVISE_SYSTEM,
      user: `${todayLine()}${articlesBlock}[답변]\n${text}\n\n[고칠 곳]\n${lines}`,
      maxTokens: 12000,
      effort: level.reviseEffort,
      ledger,
      label: "check_revise",
    }).catch(() => "");
    if (revised.trim()) finalText = revised.trim();
    else if (verification.fixes.length || verification.hedged.length) {
      // 고쳐 쓰기가 실패해도 틀린 답을 그대로 돌려주지 않는다 — 바로잡을 곳을 답 아래에 분명히 붙인다.
      verification.revise_failed = true;
      finalText = appendCorrections(text, verification);
    }
  }
  return { text: finalText, changed: finalText !== text, verification };
}
