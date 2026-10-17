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
import { gatherKoreaData } from "./koreaData.js";
import { loadFacts as defaultLoadFacts, saveFacts as defaultSaveFacts, factKey as storeKey } from "./factStore.js";
import { checkCaseNumber } from "./nec/identifiers.js";
import { hasOC, searchConstitutional, searchPrecedent } from "./lawApi.js";
import { computeCheck } from "./computeCheck.js";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const TIMEOUT_MS = 170_000;

// 확인 깊이. 답을 쓴 쪽의 등급에 맞춘다 — 가벼운 답에 비싼 확인을 붙이면 원가가 답 값을 넘는다.
export const CHECK_LEVELS = {
  // budgetMs: 확인 한 단계(공식 · 웹)의 시간 한도 — 검색 도구가 오래 끌면(한 번에 150초 실측) 기다리지 않고 그 주장은 확인 안 됨으로 둔다.
  // legalEffort: 법령 대조 · 반론 검토의 생각 깊이(null 은 모델 기본). 여명은 medium — 2026-10-17 로무앤톡 11개 비교에서
  // 기본과 같이 4/4 잡고 오탐 0(기본은 1), 한 건 평균 15.0초 → 9.3초.
  fast: { key: "fast", searches: 2, reviseModel: "claude-haiku-5-5", reviseEffort: "low", budgetMs: 15_000, reviseMs: 12_000, legalEffort: "medium" }, // 여명: 빠르게(검색 2번)
  standard: { key: "standard", searches: 4, reviseModel: "claude-sonnet-5-5", reviseEffort: "low", budgetMs: 40_000, reviseMs: 25_000 },
  deep: { key: "deep", searches: 5, reviseModel: "claude-sonnet-5-5", reviseEffort: "medium", budgetMs: 90_000, reviseMs: 45_000 },
};
const VERIFIER_MODEL = "claude-sonnet-5-5";
const EXTRACT_MODEL = "claude-haiku-5-5";
export const MAX_ANSWER_CHARS = 60_000;
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

async function callModel({ model, system, user, maxTokens = 4000, effort = "low", tools = null, ledger = null, label, fetchImpl = fetch, timeoutMs = TIMEOUT_MS }) {
  const body = { model, max_tokens: maxTokens, system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }], messages: [{ role: "user", content: user }], output_config: { effort } };
  if (tools) body.tools = tools;
  const res = await fetchImpl(ANTHROPIC_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey(), "anthropic-version": "2023-06-01" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
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
또 뽑지 않는 것: 요리법·생활 요령·공부법·운동법 같은 방법 안내와 그 속의 일반적인 팁(재료·순서·시간 포함), 프로그래밍 언어·라이브러리의 널리 알려진 동작과 쓰는 법, 누구나 아는 상식, 오늘 날짜·요일(주어진 오늘 날짜 그대로인 것), 답한 AI가 자기 자신(이름·기능)에 대해 한 말. 단 약 용량·법·돈(세금·금리·지원금)·안전 기준처럼 틀리면 해가 되는 수치는 방법 안내 속에 있어도 뽑는다.
quote는 답변의 문장을 한 글자도 바꾸지 않고(150자 이내). 중요한 것부터 최대 8개. 사람의 건강·돈에 영향이 큰 것을 먼저.
field는 그 사실을 공식적으로 확인할 수 있는 분야: law(법령·판례) medical(의료·의약·건강) economy(경제·금융·금리·환율) tax(세금) labor(노동·고용·임금) realestate(부동산·주거) company(기업·공시) welfare(복지·행정·교육·선거·외교) statistics(통계) general(그 밖).
drug: field가 medical이고 특정 약에 관한 주장이면 그 약의 제품명(예: 타이레놀정500밀리그람이면 "타이레놀") — 아니면 빈 문자열.
company: field가 company이면 그 회사의 정식 이름(예: "삼성전자", "카카오") — 아니면 빈 문자열.
출력: {"claims":[{"quote":"…","claim":"확인할 사실을 한 문장으로","kind":"legal|number|date|entity|event|quote|source|other","field":"…","drug":"","company":""}]}
[사용자 자료]가 함께 주어지면, 답변이 그 자료(사용자가 올린 계약서·문서 등)의 내용을 옮기거나 요약한 부분은 뽑지 않는다 — 사용자가 준 자료 자체는 확인 대상이 아니다. 자료 밖에서 가져온 사실(법·제도·수치·기관 정보 등)만 뽑는다.
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

// 검색 도구 판 — YUME_CHECK_SEARCH=basic 이면 기본판(20250305: 코드 실행 거르기 없음). 속도 비교용 스위치.
// 2026-10-16 측정: 기본판이 10초쯤 빠르지만, 국세청 상담센터의 옛 안내(중소기업 취업자 감면 한도 150만 원)를 근거로
// 맞는 답(2023년부터 200만 원)을 '틀림'으로 고쳤다. 틀린 바로잡기는 유메가 거짓말을 만드는 것이라 기본값은 동적 거르기 판.
const searchTool = (maxUses, allowedDomains = null) => ({
  type: process.env.YUME_CHECK_SEARCH === "basic" ? "web_search_20250305" : "web_search_20260209",
  name: "web_search",
  max_uses: maxUses,
  user_location: { type: "approximate", country: "KR", timezone: "Asia/Seoul" },
  ...(allowedDomains?.length ? { allowed_domains: allowedDomains } : {}),
});

/** 주장 묶음 하나를 웹 검색으로 판정한다. 근거 주소가 이번 검색 결과에 없으면 unverified로 내린다. */
async function judgeClaims(claims, { maxUses, allowedDomains = null, ledger, label, json, timeoutMs }) {
  const list = claims.map((c, i) => `${i + 1}. ${c.claim} (답변 원문: "${c.quote}")`).join("\n");
  const scope = allowedDomains?.length ? "[찾는 범위] 한국 공식 기관 사이트에서만 찾는다.\n" : "";
  const ver = await json({ model: VERIFIER_MODEL, system: WEBCHECK_SYSTEM, user: `${todayLine()}${scope}[주장]\n${list}`, maxTokens: 6000, effort: "low", tools: [searchTool(maxUses, allowedDomains)], ledger, label, ...(timeoutMs ? { timeoutMs } : {}) });
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

// 0차: 기관 Open API 원자료로 판정(키가 있을 때만 — koreaData.js). 근거 문장이 원자료에 그대로 있어야 인정한다.
const DATA_JUDGE_SYSTEM = `너는 유메의 사실 확인자다. 각 [주장]을 아래 [공식 데이터](한국 기관 Open API 원자료, JSON)만으로 판정한다. 기억·추측으로 판정하지 않는다. JSON만 출력한다.
- supported: 공식 데이터가 주장을 뒷받침한다.
- contradicted: 공식 데이터가 다르게 말한다. 실제 값을 correct에 적는다.
- unverified: 공식 데이터에 그 내용이 없거나, 시점이 달라 판단할 수 없다.
- quote에는 판정 근거가 된 공식 데이터의 글자를 한 글자도 바꾸지 않고 옮긴다(값과 그 이름이 함께 보이게, 200자 이내). src에는 그 데이터 번호.
출력: {"results":[{"i":번호,"verdict":"supported|contradicted|unverified","correct":"","src":번호,"quote":"","note":"40자 이내"}]}`;

const squash = (s) => String(s || "").replace(/\\[nrt]/g, " ").replace(/[\s"\\]+/g, "");
/** 글 속 숫자들(쉼표 뺀) — '4,530명' → '4530', '2.5%' → '2.5' */
export const numbersOf = (s) => [...String(s || "").matchAll(/\d[\d,]*(?:\.\d+)?/g)].map((m) => m[0].replace(/,/g, ""));

// 0.5차: 답을 쓴 모델이 실제로 연 웹 페이지의 원문 발췌(검색 도구가 준 cited_text). 모델이 쓴 글이 아니라 페이지 글자다.
const PAGE_JUDGE_SYSTEM = `너는 유메의 사실 확인자다. 각 [주장]을 아래 [페이지 발췌](답을 쓸 때 실제로 연 웹 페이지의 원문 일부)만으로 판정한다. 기억·추측으로 판정하지 않는다. JSON만 출력한다.
- supported: 발췌가 주장을 뒷받침한다(같은 대상·같은 시점이어야 한다. 다른 해·다른 학교·다른 기관의 내용이면 unverified).
- contradicted: 발췌가 다르게 말한다. 실제 값을 correct에 적는다.
- unverified: 발췌에 그 내용이 없거나 판단할 수 없다.
- quote에는 판정 근거가 된 발췌의 글자를 한 글자도 바꾸지 않고 옮긴다(200자 이내). src에는 그 발췌 번호.
출력: {"results":[{"i":번호,"verdict":"supported|contradicted|unverified","correct":"","src":번호,"quote":"","note":"40자 이내"}]}`;

/** 답을 쓸 때 연 페이지 발췌(무궁 등 호출하는 쪽이 넘긴다). 주소와 글자가 있는 것만, 넘치면 자른다. */
export function normalizeSources(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const s of raw.slice(0, 30)) {
    const url = String(s?.url || "");
    const text = String(s?.text || s?.cited_text || "").trim();
    if (!/^https?:\/\//.test(url) || text.length < 10) continue;
    out.push({ url: url.slice(0, 500), title: String(s?.title || url).slice(0, 120), text: text.slice(0, 2000), span: String(s?.span || "").slice(0, 1000) });
  }
  return out;
}

export async function judgeFromData(claims, data, { ledger = null, json = callJson, system = DATA_JUDGE_SYSTEM, label = "check_data" } = {}) {
  const list = claims.map((c, i) => `${i + 1}. ${c.claim} (답변 원문: "${c.quote}")`).join("\n");
  const head = system === DATA_JUDGE_SYSTEM ? "공식 데이터" : "페이지 발췌";
  const blocks = data.map((d, i) => `[${head} ${i + 1}] ${d.source}\n${d.text}`).join("\n\n");
  // 주어진 원문 안에서 찾아 맞추는 일이라 빠른 모델로 한다(근거 문장이 원문에 그대로 있는지는 아래 코드가 다시 본다).
  // Sonnet 으로 하면 발췌 대조 한 번에 14초가 걸렸다(2026-10-16 측정).
  const out = await json({ model: EXTRACT_MODEL, system, user: `${todayLine()}${blocks}\n\n[주장]\n${list}`, maxTokens: 4000, effort: "low", ledger, label });
  const byI = new Map((out.json?.results || []).map((r) => [Number(r.i), r]));
  return claims.map((c, k) => {
    const r = byI.get(k + 1);
    const d = data[Number(r?.src) - 1];
    let verdict = r && ["supported", "contradicted"].includes(r.verdict) ? r.verdict : "unverified";
    // 근거 문장이 그 원자료에 실제로 있어야 한다(지어낸 근거 방지).
    if (verdict !== "unverified" && !(d && squash(r.quote).length >= 4 && squash(d.text).includes(squash(r.quote)))) verdict = "unverified";
    if (verdict === "contradicted" && !String(r.correct || "").trim()) verdict = "unverified";
    if (verdict === "unverified") return { ...c, verdict, correct: "", url: "", official: false, quoteSrc: "", note: "" };
    return { ...c, verdict, correct: r.correct || "", url: d.url, official: d.official ?? true, via: d.via || "data", sourceName: d.source, quoteSrc: r.quote, note: r.note || "" };
  });
}

// 확인한 사실을 6시간 기억한다(같은 사실을 다시 검색하지 않게 — 속도와 원가). 결론이 난 것만, 근거 주소와 함께.
// 서버를 다시 켜면 비워진다. 바뀌는 정보(일정·가격)도 6시간이면 충분히 짧다.
const FACT_TTL_MS = 6 * 3600 * 1000;
const factCache = new Map();
const factKey = (c) => `${c.field || "general"}|${String(c.claim || "").replace(/[\s"'“”‘’.,·]/g, "")}`;
function cachedFact(c, now = Date.now()) {
  const e = factCache.get(factKey(c));
  if (!e) return null;
  if (now - e.at > FACT_TTL_MS) {
    factCache.delete(factKey(c));
    return null;
  }
  return { ...e.r, quote: c.quote, claim: c.claim, field: c.field, cached: true };
}
function rememberFact(c, r, now = Date.now()) {
  if (!r || r.verdict === "unverified" || r.cached) return;
  factCache.set(factKey(c), { at: now, r: { verdict: r.verdict, correct: r.correct || "", url: r.url || "", official: !!r.official, via: r.via, sourceName: r.sourceName, quoteSrc: r.quoteSrc || "", note: r.note || "" } });
  if (factCache.size > 5000) factCache.delete(factCache.keys().next().value);
}
export function _clearFactCache() {
  factCache.clear();
}

export async function checkEverydayFacts(answer, { level = CHECK_LEVELS.fast, ledger = null, skipLegal = false, references = [], sources = [], json = callJson, koreaData = gatherKoreaData, facts = { load: defaultLoadFacts, save: defaultSaveFacts } } = {}) {
  const refBlock = references.length ? `[사용자 자료]\n${references.map((r) => `<${r.title}>\n${r.text}`).join("\n\n").slice(0, 15000)}\n\n` : "";
  const ex = await json({ model: EXTRACT_MODEL, system: EXTRACT_SYSTEM, user: `${refBlock}[답변]\n${answer.slice(0, 8000)}`, maxTokens: 3000, effort: "low", ledger, label: "check_extract" });
  const quoteOk = (q) => String(q || "").replace(/\s+/g, "").length >= 4 && answer.replace(/\s+/g, "").includes(String(q).replace(/\s+/g, ""));
  const claims = (ex.json?.claims || [])
    .filter((c) => quoteOk(c.quote) && !(skipLegal && (c.kind === "legal" || c.field === "law")))
    .map((c) => ({ ...c, field: FIELD_KEYS.includes(c.field) ? c.field : "general" }))
    .slice(0, 8);
  // 확인할 사실이 없는 답(잡담·글쓰기·번역)은 여기서 끝난다 — 웹 확인 원가가 들지 않는다.
  if (!claims.length) return { claims: [], results: [] };

  const fielded = claims.filter((c) => c.field !== "general");
  const byQuote = new Map();
  const open = (c) => (byQuote.get(c.quote)?.verdict || "unverified") === "unverified";
  // 기억해 둔 사실 — 6시간 안에 같은 사실을 확인했으면 그 결과를 쓴다.
  for (const c of claims) {
    const hit = cachedFact(c);
    if (hit) byQuote.set(c.quote, hit);
  }
  // 확인된 사실 저장소(DB) — 메모리에 없으면 전에 확인해 둔 판정을 꺼낸다(사실마다 유효 기간이 다르다, factStore.js)
  const notCached = claims.filter(open);
  if (notCached.length) {
    const stored = await facts.load(notCached).catch(() => new Map());
    for (const c of notCached) {
      const r = stored.get(storeKey(c));
      if (r) byQuote.set(c.quote, { ...c, ...r, quote: c.quote, claim: c.claim, field: c.field, cached: true, stored: true });
    }
  }
  // 0차: 기관 Open API 원자료(키가 있을 때)
  if (fielded.length) {
    const data = await koreaData(fielded).catch(() => []);
    if (data.length) {
      const judged = await judgeFromData(fielded, data, { ledger, json }).catch(() => []);
      for (const r of judged) if (r.verdict !== "unverified") byQuote.set(r.quote, r);
    }
  }
  // 0.4차(모델 없이, 즉시): 답 속 그 문장(span)에 붙은 출처 원문(cited_text)에 그 주장의 숫자가 **모두 그대로** 있으면 확인됨.
  // 숫자가 없는 주장은 여기서 판정하지 않는다(말 바꿔 쓰기를 코드로 판단할 수 없으니 다음 단계로).
  if (sources.length) {
    for (const c of claims.filter(open)) {
      const nums = numbersOf(c.quote);
      if (!nums.length) continue;
      const q = squash(c.quote);
      const hit = sources.find((s) => s.span && (squash(s.span).includes(q) || q.includes(squash(s.span))) && nums.every((n) => numbersOf(s.text).includes(n)));
      if (hit) byQuote.set(c.quote, { ...c, verdict: "supported", correct: "", url: hit.url, official: isOfficialUrl(hit.url), via: "cite", sourceName: hit.title, quoteSrc: hit.text.slice(0, 200), note: "답 속 인용 원문과 숫자 일치" });
    }
  }
  // 0.5차: 답을 쓸 때 실제로 연 페이지의 원문 발췌 — 검색 없이 먼저 대조한다(일상 질문을 빠르고 싸게).
  if (sources.length) {
    const todo = claims.filter(open);
    if (todo.length) {
      const page = sources.map((s) => ({ source: `${s.title} (${s.url})`, url: s.url, text: s.text, official: isOfficialUrl(s.url), via: "page" }));
      const judged = await judgeFromData(todo, page, { ledger, json, system: PAGE_JUDGE_SYSTEM, label: "check_page" }).catch(() => []);
      for (const r of judged) if (r.verdict !== "unverified") byQuote.set(r.quote, r);
    }
  }
  // 1차(공식 기관 사이트만)와 2차(웹 전체)를 동시에 돌린다 — 차례로 돌리면 답 하나에 30초가 넘었다(2026-10-16 대표 "대답이 느려").
  // 판정은 공식 출처가 결론을 냈으면 그것을, 못 냈으면 웹 전체 결과를 쓴다(예전 순서와 같은 우선순위).
  // 어느 쪽이 실패해도(검색 장애 · 답 형식 오류) 다른 쪽과 앞 단계 결과는 살린다 — 못 본 것만 확인 안 됨.
  const blank = (list) => list.map((c) => ({ ...c, verdict: "unverified", correct: "", url: "", official: false, quoteSrc: "", note: "" }));
  // 여명(빠르게): 답을 쓸 때 찾아본 출처가 있으면 그 원문으로만 확인하고 다시 검색하지 않는다 — 원문으로 확인 안 된 것은
  // 단정하지 않게 고쳐 내보낸다(확인된 것만 단정한다는 원칙은 같다). 재검색은 한울 · 황혼이 한다. (2026-10-16 대표 "44초 말이 안 돼")
  const skipSearch = level.key === "fast" && sources.length > 0;
  const officialTodo = skipSearch ? [] : fielded.filter(open);
  const webTodo = skipSearch ? [] : claims.filter(open);
  // (주장을 몇 개씩 나눠 동시에 돌려 보기도 했지만 호출마다 검색 결과를 따로 읽어 더 느리고 3배 비쌌다 — 2026-10-16 측정. 한 호출로 둔다.)
  const judgeAll = (list, opts) => (list.length ? judgeClaims(list, { ...opts, maxUses: level.searches, timeoutMs: level.budgetMs }).catch(() => blank(list)) : []);
  const [first, second] = await Promise.all([
    judgeAll(officialTodo, { allowedDomains: officialDomainsFor([...new Set(officialTodo.map((c) => c.field))]), ledger, label: "check_official", json }),
    judgeAll(webTodo, { ledger, label: "check_web", json }),
  ]);
  for (const r of second) if (r.verdict !== "unverified") byQuote.set(r.quote, r);
  for (const r of first) if (r.verdict !== "unverified" || !byQuote.has(r.quote)) byQuote.set(r.quote, r);
  const results = claims.map((c) => byQuote.get(c.quote) || { ...c, verdict: "unverified", correct: "", url: "", official: false, quoteSrc: "", note: "" });
  for (const [k, c] of claims.entries()) rememberFact(c, results[k]);
  await facts.save(claims.map((c, k) => [c, results[k]])).catch(() => 0);
  return { claims, results, storeHits: results.filter((r) => r.stored).length };
}

// ── 판례 · 결정례 사건번호 ─────────────────────────────────────────
// 답이 사건번호(예: 2019다12345, 2020헌마123)를 적으면 법제처 판례 · 결정례 목록에 정말 있는지 본다 — AI가 가장 많이 지어내는 것 중 하나.
// 있으면 '확인됨'(사건이 존재함), 없으면 '확인 안 됨'으로 두어 단정하지 않게 고친다(하급심 일부는 목록에 없을 수 있어 '틀림'으로 몰지 않는다).
const CASE_G = /(\d{2,4})\s?([가-힣]{1,3})\s?(\d{2,7})/g;
function sentenceAround(text, index, len) {
  const before = text.slice(0, index);
  const cut = Math.max(before.lastIndexOf("\n"), before.lastIndexOf(". "), before.lastIndexOf("다."));
  const start = cut < 0 ? 0 : cut + (before.startsWith("다.", cut) ? 2 : 1);
  const rest = text.slice(index + len);
  const m = rest.search(/[.!?\n]/);
  const end = index + len + (m < 0 ? rest.length : m + 1);
  return text.slice(start, end).trim().slice(0, 150);
}
export async function checkCaseCitations(text, { prec = searchPrecedent, detc = searchConstitutional, enabled = hasOC() } = {}) {
  if (!enabled) return [];
  const seen = new Map();
  for (const m of String(text).matchAll(CASE_G)) {
    const id = checkCaseNumber(m[0]);
    if (!id.level || id.F >= 1 || seen.has(id.canonical)) continue;
    seen.set(id.canonical, { raw: m[0], id, index: m.index });
    if (seen.size >= 4) break;
  }
  const out = [];
  await Promise.all([...seen.values()].map(async ({ raw, id, index }) => {
    const r = await (id.level === "constitutional" ? detc : prec)(id.canonical).catch(() => ({ ok: false }));
    if (!r?.ok) return;
    const quote = sentenceAround(text, index, raw.length);
    out.push(r.found
      ? { found: true, caseNumber: id.canonical, quote, claim: `${id.canonical} 사건이 실제로 있다`, url: r.detailUrl || "", title: [r.court, r.caseName].filter(Boolean).join(" ") }
      : { found: false, caseNumber: id.canonical, quote, claim: `${id.canonical} 사건이 실제로 있다` });
  }));
  return out;
}

// ── 고쳐 쓰기 ─────────────────────────────────────────────────
const REVISE_SYSTEM = `너는 유메의 교정자다. [답변]을 [고칠 곳]대로 고쳐 답변 전체를 다시 쓴다.
- "틀림"은 근거에 적힌 실제 값으로 고치고 근거(조문 또는 출처)를 밝힌다.
- "확인 안 됨"은 단정하지 않게 고친다: 꼭 필요하지 않으면 빼고, 남길 때는 "확인되지 않았어요"처럼 불확실하다고 분명히 쓴다. 새 사실을 지어 넣지 않는다.
- "확인됨"은 출처로 확인된 사실이다. 답변에 "기억에 의존했다", "확인 자료 없이 답했다", "검색해 본 결과가 아니다"처럼 답 전체를 못 믿게 하는 말이 있으면, 확인된 사실에 대해서는 그 말을 뺀다.
- 고칠 곳이 아닌 부분은 문장과 형식을 그대로 둔다. 설명이나 머리말 없이 고친 답변 본문만 출력한다.
- 출력 형식: 고친 답변 본문 전체를 <answer> 와 </answer> 사이에만 쓴다. 그 밖에는 아무것도 쓰지 않는다(생각·메모·영어 설명 금지).`;

// 고칠 문장만 바꾸기 — 출력이 짧아 전체 다시 쓰기보다 몇 배 빠르다.
const PATCH_SYSTEM = `너는 유메의 교정자다. [답변]에서 [고칠 곳]만 고친다. 답변 전체를 다시 쓰지 않고 바꿀 부분만 JSON으로 낸다.
- old: 답변에 실제로 있는 글을 한 글자도 바꾸지 않고 그대로 옮긴다(띄어쓰기 · 문장부호 · 마크다운 기호까지). 고칠 문장 하나 또는 그 일부.
- new: 그 자리에 들어갈 글. 앞뒤 문맥 · 말투 · 형식(목록 기호, 굵게)이 그대로 이어지게 쓴다.
- "틀림"은 근거의 실제 값으로 고치고 근거(조문 또는 출처 이름)를 짧게 밝힌다.
- "확인 안 됨"은 단정하지 않게 고친다: 꼭 필요하지 않으면 빼고(new를 빈 글로), 남길 때는 확인되지 않았다고 분명히 쓴다. 새 사실을 지어 넣지 않는다.
- "확인됨" 사실이 있는데 답변에 "기억에 의존했다"처럼 답 전체를 못 믿게 하는 말이 있으면 그 말을 뺀다.
- 같은 사실이 답변 여러 곳에 나오면 각각 고친다. 고칠 곳이 아닌 부분은 건드리지 않는다.
출력(JSON만): {"edits":[{"old":"…","new":"…"}]}`;

async function revisePatch({ model, user, ledger, timeoutMs, json = callJson }) {
  const r = await json({ model, system: PATCH_SYSTEM, user, maxTokens: 4000, effort: "low", ledger, label: "check_patch", ...(timeoutMs ? { timeoutMs } : {}) });
  return Array.isArray(r.json?.edits) ? r.json.edits : [];
}

/**
 * 바꿀 글(old)을 답에서 그대로 찾아 바꾼다. 하나라도 못 찾거나, 바꾼 뒤에도 '틀림' 문장이 그대로 남으면 null
 * (그때는 전체 다시 쓰기로 간다 — 틀린 답을 내보내지 않는다).
 */
export function applyEdits(text, edits, fixes = []) {
  if (!Array.isArray(edits) || !edits.length) return null;
  let out = String(text);
  for (const e of edits) {
    const old = String(e?.old ?? "");
    if (old.trim().length < 2 || !out.includes(old)) return null;
    out = out.replace(old, () => String(e?.new ?? ""));
  }
  if (fixes.some((f) => f.quote && squash(out).includes(squash(f.quote)))) return null;
  out = out.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return out && out !== String(text).trim() ? out : null;
}

/**
 * 고쳐 쓴 답에서 본문만 꺼낸다. <answer> 표시 안만 쓰고, 표시가 없으면 모델의 혼잣말 줄
 * ("Wait — I need to…", "Let me…")을 걷어 낸다 — 2026-10-16 무궁 답에 그대로 섞여 나간 사고.
 */
export function cleanRevised(raw, original = "") {
  const s = String(raw || "");
  const tagged = s.match(/<answer>([\s\S]*?)<\/answer>/i);
  let body = tagged ? tagged[1] : s.replace(/<\/?answer>/gi, "");
  const korean = /[가-힣]/.test(original);
  if (korean) {
    const META = /^\s*(wait|let me|i need|i'll|i will|i should|okay|ok,|hmm|actually|note:|now,? i|here is|here's)\b/i;
    body = body
      .split("\n")
      .filter((line) => !(META.test(line) && !/[가-힣]/.test(line) && !original.includes(line.trim())))
      .join("\n");
  }
  return body.replace(/\n{3,}/g, "\n\n").trim();
}

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

/** 사용자가 대화에 준 자료(올린 파일·서랍 자료). 넘치면 자른다 — 대화형 AI는 큰 문서를 그대로 넘긴다. */
export function normalizeAnswerReferences(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  let total = 0;
  for (const [i, r] of raw.slice(0, 10).entries()) {
    const text = typeof r === "string" ? r : typeof r?.text === "string" ? r.text : "";
    if (!text.trim()) continue;
    const room = 60_000 - total;
    if (room <= 0) break;
    out.push({ title: String(r?.title || `자료 ${i + 1}`).slice(0, 80), text: text.slice(0, room) });
    total += Math.min(text.length, room);
  }
  return out;
}

// ── 질문 맥락: 답을 쓰기 전에 현행 조문 ─────────────────────────────
// 같은 질문의 조문 모으기는 10분 기억한다 — 답 쓰기 전(context)과 확인(answer-check)에서 두 번 모으면 법령 질문마다 몇 초씩 더 걸렸다.
const gatherCache = new Map();
function gatherQuestion(q, gather, ledger, cacheable = true) {
  const k = String(q).trim();
  const hit = cacheable ? gatherCache.get(k) : null;
  if (hit && Date.now() - hit.at < 600_000) return hit.p;
  const p = gather(q, [], { ledger }).catch(() => ({ laws: [], articles: [] }));
  if (cacheable) {
    gatherCache.set(k, { at: Date.now(), p });
    p.then((g) => { if (!g.articles?.length) gatherCache.delete(k); });
    if (gatherCache.size > 300) gatherCache.delete(gatherCache.keys().next().value);
  }
  return p;
}

/**
 * 법령 이야기가 든 질문이면 관련 현행 조문을 모은다. 답을 쓰는 쪽은 block을 시스템 안내에 넣는다.
 * 돌려주는 값: { legal, laws, articles:[{law,label,title,url}], block }
 */
export async function prepareContext(question, { ledger = null, deps = {} } = {}) {
  const gather = deps.gatherArticles || gatherArticles;
  const q = String(question || "").slice(0, MAX_QUESTION_CHARS);
  if (!LAW_HINT.test(q)) return { legal: false, laws: [], articles: [], block: "" };
  const g = await gatherQuestion(q, gather, ledger, !deps.gatherArticles);
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
/**
 * 확인할 사실이 있는 답인가(2026-10-18 대표 "일상적인 간단한 질문도 너무 오래 걸려, 유메가 필요한 정도를 계산해서").
 * 짧은 답에 숫자 · 날짜 · 이름(기관 · 회사 · 약 · 장소) · 법 · 인용이 하나도 없으면 사실 뽑기(모델 호출)를 건너뛴다 — 인사 · 잡담 · 감상 · 다듬기.
 * 코드 검산(계산 · 요일)과 법령 대조 여부 판단은 그대로 한다. 애매하면 늘 확인한다(건너뛰는 쪽이 좁다).
 */
const FACT_CUES = /\d|[一-龥]|「|“|"|'|[A-Z][a-zA-Z]{2,}|(청|부|처|원|공단|공사|대학교|대학|은행|병원|법원|회사|그룹|협회|재단|위원회|센터|시청|구청|군청|정부|국회|대통령|장관|의원|조선|고려|왕|전쟁|약|복용|성분|부작용|효능|증상|질환|법|규정|제도|세금|보험|연금|지원금|금리|환율|주가|가격|요금|출시|발표|일정|기간|마감|최초|최대|최고|유일|평균|비율|퍼센트|미국|중국|일본|서울|부산|세계|국내|해외)/;
export function hasCheckableFacts(text) {
  const t = String(text || "").replace(/```[\s\S]*?```/g, " ");
  if (t.length > 500) return true;
  return FACT_CUES.test(t);
}

export async function checkAnswer({ question = "", answer, level: levelKey = "fast", references = [], sources = [], ledger = null, onStage = () => {}, deps = {} }) {
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

  // 검산(코드) — 계산식 · 요일 · 올해. 모델에 묻지 않고 바로 판정한다(0원 · 1ms).
  const calc = (deps.computeCheck || computeCheck)(text, { now: deps.now ? deps.now() : Date.now() });
  verification.fixes.push(...calc.fixes);
  verification.computed = calc.checked;

  onStage("유메가 답 속 사실을 확인하는 중…");
  const legalCheck = legalTalk
    ? (async () => {
        const [fromQ, fromA] = await Promise.all([
          LAW_HINT.test(q) ? gatherQuestion(q, gather, ledger, !deps.gatherArticles) : { laws: [], articles: [] },
          gather(text, [], { ledger }).catch(() => ({ laws: [], articles: [] })),
        ]);
        const all = mergeGathered(fromQ, fromA);
        if (!all.articles.length) return { all, errors: [] };
        const r = await review(text, [], { ledger, gathered: all, effort: level.legalEffort || null }).catch(() => null);
        if (!r?.issues?.length) return { all, errors: [], ran: !!r?.ran };
        const cands = r.issues.map((it, i) => ({ id: `R${i}`, source: "review", index: -1, answer_quote: it.answer_quote, problem: it.problem, kind: it.kind, locked: true, proof: { law: it.law, label: it.articleLabel, url: it.url, quote: it.article_quote } }));
        const decided = await defendFn(text, all.articles, cands, { ledger, effort: level.legalEffort || null }).catch(() => []);
        return { all, ran: true, errors: decided.filter((d) => d.decision === "error"), cleared: decided.filter((d) => d.decision !== "error").length };
      })()
    : Promise.resolve(null);
  // 확인할 사실이 없는 짧은 답(인사 · 잡담 · 감상)은 사실 뽑기를 건너뛴다 — 모델 호출 0번, 1초 안쪽
  const factCheck = (deps.checkEverydayFacts || hasCheckableFacts(text))
    ? everyday(text, { level, ledger, skipLegal: legalTalk, references: normalizeAnswerReferences(references), sources: normalizeSources(sources) }).catch(() => ({ claims: [], results: [], failed: true }))
    : Promise.resolve({ claims: [], results: [], skipped: true });
  const caseCheck = (deps.checkCaseCitations || checkCaseCitations)(text).catch(() => []);
  const [legal, facts, cases] = await Promise.all([legalCheck, factCheck, caseCheck]);
  for (const c of cases || []) {
    if (c.found) verification.supported.push({ claim: c.claim, quote: c.quote, url: c.url, evidence: c.title, field: "law", official: true });
    else verification.hedged.push({ quote: c.quote, claim: c.claim, field: "law", note: `법제처 판례 · 결정례 목록에서 ${c.caseNumber} 사건을 찾지 못함 — 사건번호를 빼거나 확인되지 않았다고 쓸 것` });
  }
  if (cases?.length) verification.cases = cases.map((c) => ({ caseNumber: c.caseNumber, found: c.found, url: c.url || "" }));

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
  verification.store_hits = facts?.storeHits || 0;
  if (facts?.skipped) verification.light = true; // 확인할 사실이 없는 답
  if (facts?.failed) verification.fact_check_failed = true;

  const blanket = verification.supported.length > 0 && BLANKET_DISCLAIMER.test(text);
  let finalText = text;
  if (verification.fixes.length || verification.hedged.length || blanket) {
    onStage(verification.fixes.length ? `틀린 곳 ${verification.fixes.length}개를 근거대로 고치는 중…` : "답을 다듬는 중…");
    const lines = [
      ...verification.fixes.map((f) => `- 틀림: "${f.quote}" → ${f.problem}${f.hint ? ` (${f.hint})` : ""}${f.law ? ` (근거: ${f.law} ${f.label} “${f.evidence}”)` : f.url ? ` (근거: ${f.url} “${String(f.evidence || "").slice(0, 200)}”)` : ""}`),
      ...verification.hedged.map((h) => `- 확인 안 됨: "${h.quote}"${h.note ? ` (${h.note})` : ""}`),
      ...verification.supported.map((s) => `- 확인됨: "${s.quote || s.claim}" (출처: ${s.url})`),
    ].join("\n");
    const articlesBlock = legal?.all?.articles?.length ? `[현행 조문]\n${legal.all.articles.map((a) => a.block).join("\n\n")}\n\n` : "";
    const user = `${todayLine()}${articlesBlock}[답변]\n${text}\n\n[고칠 곳]\n${lines}`;
    // 먼저 고칠 문장만 바꾼다(답 전체를 다시 쓰면 고칠 곳이 한 줄이어도 답 길이만큼 시간이 걸렸다 — 2026-10-17 실측 2~8초).
    // 바꿀 글을 답에서 못 찾거나 틀린 문장이 그대로 남으면 예전처럼 전체를 다시 쓴다.
    const patchFn = deps.revisePatch || (deps.revise ? null : revisePatch);
    const patched = patchFn
      ? await patchFn({ model: level.reviseModel, user, ledger, timeoutMs: level.reviseMs }).then((edits) => applyEdits(text, edits, verification.fixes)).catch(() => null)
      : null;
    const revised = patched ? `<answer>${patched}</answer>` : await revise({
      model: level.reviseModel,
      system: REVISE_SYSTEM,
      user,
      maxTokens: 12000,
      effort: level.reviseEffort,
      ledger,
      label: "check_revise",
      ...(level.reviseMs ? { timeoutMs: level.reviseMs } : {}),
    }).catch(() => "");
    const cleaned = cleanRevised(revised, text);
    if (cleaned) finalText = cleaned;
    else if (verification.fixes.length || verification.hedged.length) {
      // 고쳐 쓰기가 실패해도 틀린 답을 그대로 돌려주지 않는다 — 바로잡을 곳을 답 아래에 분명히 붙인다.
      verification.revise_failed = true;
      finalText = appendCorrections(text, verification);
    }
  }
  return { text: finalText, changed: finalText !== text, verification };
}
