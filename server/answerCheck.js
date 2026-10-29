// 답변 확인 — 다른 AI가 쓴 답을 내보내기 전에 베리라인이 확인하고, 틀린 곳은 고친 답을 돌려준다.
//
// 2026-10-16 대표 결정: 베리라인은 검증 엔진으로 독립해 있고, 대화형 AI(무궁 등)는 베리라인 API를 쓰는 별도 서비스다.
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
import { confirmByStatute } from "./statuteNumbers.js";
import { LAW_HINT, gatherArticles, mergeGathered, reviewStatutes, defend } from "./statuteReview.js";
import { FIELD_KEYS, isOfficialUrl, officialDomainsFor } from "./koreaSources.js";
import { gatherKoreaData } from "./koreaData.js";
import { loadFacts as defaultLoadFacts, saveFacts as defaultSaveFacts, factKey as storeKey } from "./factStore.js";
import { checkCaseNumber } from "./nec/identifiers.js";
import { hasOC, searchConstitutional, searchPrecedent } from "./lawApi.js";
import { computeCheck } from "./computeCheck.js";
import { traceAmendment } from "./engine/amendmentTrace.js";
import { numericAudit, signalsBlock } from "./engine/quantities.js";
import { legalAgentCheck, legalModelFor, legalEffortFor, legalEscalateModelFor, shouldEscalate } from "./engine/legalAgent.js";
import { verifyLegalV2 } from "./engine/v2/verify.js";
import { verifyLegalHybrid } from "./engine/v2/hybrid.js";
import { verifyLegalV3 } from "./engine/v3/engine.js";
import { guaranteeScope } from "./engine/v2/receipt.js";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const TIMEOUT_MS = 170_000;

// 확인 깊이. 답을 쓴 쪽의 등급에 맞춘다 — 가벼운 답에 비싼 확인을 붙이면 원가가 답 값을 넘는다.
export const CHECK_LEVELS = {
  // budgetMs: 확인 한 단계(공식 · 웹)의 시간 한도(여명 10초 — 10-18 실측 웹 확인 한 번이 9~12초라 답이 20초를 넘었다. 넘으면 그 주장만 덜 단정하게) — 검색 도구가 오래 끌면(한 번에 150초 실측) 기다리지 않고 그 주장은 확인 안 됨으로 둔다.
  // legalEffort: 법령 대조 · 반론 검토의 생각 깊이(null 은 모델 기본). 여명은 medium — 2026-10-17 로무앤톡 11개 비교에서
  // 기본과 같이 4/4 잡고 오탐 0(기본은 1), 한 건 평균 15.0초 → 9.3초.
  fast: { key: "fast", searches: 2, reviseModel: "claude-haiku-5-5", reviseEffort: "low", budgetMs: 10_000, reviseMs: 12_000, legalEffort: "medium" }, // 여명: 빠르게(검색 2번)
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
const EXTRACT_SYSTEM = `너는 베리라인의 사실 추출기다. [답변]에서 공개 자료로 참·거짓을 확인할 수 있는 사실 주장만 뽑는다. JSON만 출력한다.
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

const WEBCHECK_SYSTEM = `너는 베리라인의 사실 확인자다. 각 [주장]을 web_search로 찾아본 자료로 판정한다. 기억으로 판정하지 않는다. JSON만 출력한다.
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
// 맞는 답(2023년부터 200만 원)을 '틀림'으로 고쳤다. 틀린 바로잡기는 베리라인이 거짓말을 만드는 것이라 기본값은 동적 거르기 판.
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
const DATA_JUDGE_SYSTEM = `너는 베리라인의 사실 확인자다. 각 [주장]을 아래 [공식 데이터](한국 기관 Open API 원자료, JSON)만으로 판정한다. 기억·추측으로 판정하지 않는다. JSON만 출력한다.
- supported: 공식 데이터가 주장을 뒷받침한다.
- contradicted: 공식 데이터가 다르게 말한다. 실제 값을 correct에 적는다.
- unverified: 공식 데이터에 그 내용이 없거나, 시점이 달라 판단할 수 없다.
- quote에는 판정 근거가 된 공식 데이터의 글자를 한 글자도 바꾸지 않고 옮긴다(값과 그 이름이 함께 보이게, 200자 이내). src에는 그 데이터 번호.
출력: {"results":[{"i":번호,"verdict":"supported|contradicted|unverified","correct":"","src":번호,"quote":"","note":"40자 이내"}]}`;

const squash = (s) => String(s || "").replace(/\\[nrt]/g, " ").replace(/[\s"\\]+/g, "");
/** 글 속 숫자들(쉼표 뺀) — '4,530명' → '4530', '2.5%' → '2.5' */
export const numbersOf = (s) => [...String(s || "").matchAll(/\d[\d,]*(?:\.\d+)?/g)].map((m) => m[0].replace(/,/g, ""));

// 0.5차: 답을 쓴 모델이 실제로 연 웹 페이지의 원문 발췌(검색 도구가 준 cited_text). 모델이 쓴 글이 아니라 페이지 글자다.
const PAGE_JUDGE_SYSTEM = `너는 베리라인의 사실 확인자다. 각 [주장]을 아래 [페이지 발췌](답을 쓸 때 실제로 연 웹 페이지의 원문 일부)만으로 판정한다. 기억·추측으로 판정하지 않는다. JSON만 출력한다.
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

export async function checkEverydayFacts(answer, { level = CHECK_LEVELS.fast, ledger = null, skipLegal = false, references = [], sources = [], json = callJson, koreaData = gatherKoreaData, facts = { load: defaultLoadFacts, save: defaultSaveFacts }, shareFacts = true } = {}) {
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
  // 기업 API로 온 글은 공유 저장소에 남기지 않는다(2026-10-29 — 한 고객의 문장이 다른 고객의 결과에 섞이지 않게). 읽기만 한다.
  if (shareFacts) await facts.save(claims.map((c, k) => [c, results[k]])).catch(() => 0);
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
const REVISE_SYSTEM = `너는 베리라인의 교정자다. [답변]을 [고칠 곳]대로 고쳐 답변 전체를 다시 쓴다.
- "틀림"은 근거에 적힌 실제 값으로 고치고 근거(조문 또는 출처)를 밝힌다.
- "확인 안 됨"은 틀렸다는 뜻이 아니다(출처를 못 찾았을 뿐). 그 문장에서 확인 안 된 세부(숫자 · 이름 · 날짜 · 가격)만 덜 단정하게 바꾸거나("보통", "~로 알려져 있어요", "대략") 그 세부만 뺀다. 문장 전체를 "확인하지 못했어요"로 바꾸지 않는다.
- "제가 확인하지 못했어요" · "확인되지 않았어요" · "확인할 수 없어요" 같은 말을 문장마다 붙이지 않는다 — 답이 다 모른다는 말처럼 읽힌다. 꼭 알려야 하면 답 끝에 한 줄로만 모은다(예: "요금 · 영업 여부는 방문 전에 한 번 확인해 보세요").
- 분명히 "확인되지 않았어요"라고 쓰는 것은 법 · 약 용량 · 돈(세금 · 금리 · 지원금) · 안전처럼 틀리면 해가 되는 수치뿐이다. 일반적인 설명 · 분위기 · 추천 이유는 그대로 둔다. 새 사실을 지어 넣지 않는다.
- "확인됨"은 출처로 확인된 사실이다. 답변에 "기억에 의존했다", "확인 자료 없이 답했다", "검색해 본 결과가 아니다"처럼 답 전체를 못 믿게 하는 말이 있으면, 확인된 사실에 대해서는 그 말을 뺀다.
- "첫 대답 점검"이 있으면 [질문]과 고친 내용을 비교한다. 고친 내용이 질문자가 맞는지 물은 바로 그 내용을 뒤집으면, "네, 맞습니다" 같은 첫 대답을 "일부 틀렸습니다" 식으로 바꾸고 무엇이 틀렸는지를 첫 문장에서 먼저 말한다. 틀린 곳이 답변이 덧붙인 내용뿐이고 질문자의 말은 맞으면 첫 대답은 그대로 둔다.
- 고칠 곳이 아닌 부분은 문장과 형식을 그대로 둔다. 설명이나 머리말 없이 고친 답변 본문만 출력한다.
- 출력 형식: 고친 답변 본문 전체를 <answer> 와 </answer> 사이에만 쓴다. 그 밖에는 아무것도 쓰지 않는다(생각·메모·영어 설명 금지).`;

// 고칠 문장만 바꾸기 — 출력이 짧아 전체 다시 쓰기보다 몇 배 빠르다.
const PATCH_SYSTEM = `너는 베리라인의 교정자다. [답변]에서 [고칠 곳]만 고친다. 답변 전체를 다시 쓰지 않고 바꿀 부분만 JSON으로 낸다.
- old: 답변에 실제로 있는 글을 한 글자도 바꾸지 않고 그대로 옮긴다(띄어쓰기 · 문장부호 · 마크다운 기호까지). 고칠 문장 하나 또는 그 일부.
- new: 그 자리에 들어갈 글. 앞뒤 문맥 · 말투 · 형식(목록 기호, 굵게)이 그대로 이어지게 쓴다.
- "틀림"은 근거의 실제 값으로 고치고 근거(조문 또는 출처 이름)를 짧게 밝힌다.
- "확인 안 됨"은 틀렸다는 뜻이 아니다(출처를 못 찾았을 뿐). 그 문장에서 확인 안 된 세부(숫자 · 이름 · 날짜 · 가격)만 덜 단정하게 바꾸거나("보통", "~로 알려져 있어요", "대략") 그 세부만 뺀다(new 에서 그 부분만 지운다). 문장 전체를 "확인하지 못했어요"로 바꾸지 않는다.
- "제가 확인하지 못했어요" · "확인되지 않았어요" · "확인할 수 없어요" 같은 말을 문장마다 붙이지 않는다 — 답이 다 모른다는 말처럼 읽힌다. 꼭 알려야 하면 답 끝에 한 줄로만 모은다(예: "요금 · 영업 여부는 방문 전에 한 번 확인해 보세요").
- 분명히 "확인되지 않았어요"라고 쓰는 것은 법 · 약 용량 · 돈(세금 · 금리 · 지원금) · 안전처럼 틀리면 해가 되는 수치뿐이다. 일반적인 설명 · 분위기 · 추천 이유는 그대로 둔다. 새 사실을 지어 넣지 않는다.
- "확인됨" 사실이 있는데 답변에 "기억에 의존했다"처럼 답 전체를 못 믿게 하는 말이 있으면 그 말을 뺀다.
- "첫 대답 점검"이 있으면 [질문]과 고친 내용을 비교한다. 고친 내용이 질문자가 맞는지 물은 바로 그 내용을 뒤집으면, "네, 맞습니다" 같은 첫 대답을 "일부 틀렸습니다" 식으로 바꾸고 무엇이 틀렸는지를 첫 문장에서 먼저 말한다. 틀린 곳이 답변이 덧붙인 내용뿐이고 질문자의 말은 맞으면 첫 대답은 그대로 둔다.
- 같은 사실이 답변 여러 곳에 나오면 각각 고친다. 고칠 곳이 아닌 부분은 건드리지 않는다.
출력(JSON만): {"edits":[{"old":"…","new":"…"}]}`;

// 없는 조문 — 글(또는 질문)이 든 조문 번호가 그 법령에 없을 때(statuteReview.gatherArticles의 missing). 모델 판정 없이 법제처 조문 목록으로 정한다.
// 답이 이미 "그런 조문은 없다"고 했으면 건드리지 않는다. 답이 번호를 다시 적지 않았으면 첫 문장을 고칠 곳으로 둔다.
const NEGATES = /없(?:습니다|어요|다|는|음)|존재하지\s*않|찾을\s*수\s*없|확인되지\s*않|확인할\s*수\s*없/;
export function missingArticleFix(answer, m) {
  const label = `제${m.no}조${m.branch ? `의${m.branch}` : ""}`;
  const re = new RegExp(`제\\s*${m.no}\\s*조${m.branch ? `\\s*의\\s*${m.branch}` : "(?!\\s*의\\s*\\d)"}`);
  const sentences = String(answer || "").split(/(?<=[.!?。])\s+|\n+/).filter((s) => s.trim());
  const hit = sentences.find((s) => re.test(s));
  if (hit ? NEGATES.test(hit) : NEGATES.test(String(answer).slice(0, 300))) return null;
  const quote = (hit || openingSentence(answer)).trim().slice(0, 200);
  if (!quote) return null;
  return {
    type: "legal", error_kind: "nonexistent", quote, law: m.law, label: `제${m.lastNo}조`, url: m.url,
    problem: `${m.law}에는 ${label}가 없습니다 — 본칙의 마지막 조문은 제${m.lastNo}조${m.lastTitle ? `(${m.lastTitle})` : ""}입니다. 없는 조문의 내용을 지어내지 말 것`,
    evidence: `법제처 현행 조문 목록: 마지막 조문 제${m.lastNo}조${m.lastTitle ? `(${m.lastTitle})` : ""}`,
  };
}

// 첫 대답 점검 —"36주 이후가 맞죠?"에 "네, 맞습니다"로 시작한 답은 숫자를 32주로 고쳐도 첫 대답이 틀린 확인을 남긴다
// (2026-10-26 비교 시험: 베리라인이 값은 고치고도 "네, 맞습니다"를 남겨 오답 처리, 같은 문항을 Opus 검증기는 맞힘).
// 고쳐 쓰는 쪽은 질문을 보지 못했으므로, 확인을 구하는 질문 + 긍정으로 여는 답 + 틀린 곳이 있으면 그 첫 문장을 점검 대상으로 넘긴다.
// 틀림으로 세지는 않는다 — 틀린 곳이 답변이 덧붙인 내용뿐이면 첫 대답은 맞는 확인이다.
const CONFIRM_Q = /맞(?:나요|죠|지요|습니까|는지|을까요|는\s*거(?:죠|지요|예요|에요)|는\s*건가요|아요\s*\?|어요\s*\?|아\s*\?|지\s*\?)|사실(?:인가요|이에요\s*\?|이죠|입니까)|그렇(?:죠|지요|나요)\s*\?|틀렸나요|아닌가요/;
const AFFIRM_OPEN = /^[\s*#>"'“]*(?:네|예|맞습니다|맞아요|맞아|맞는\s*말|그렇습니다|그래요|정확합니다|정확해요|대체로\s*맞|거의\s*맞|대부분\s*맞)/;
export function openingSentence(answer) {
  const t = String(answer || "").trim();
  const m = t.match(/^[\s\S]*?(?:[.!?。][*_"”’)]*(?=\s|$)|\n)/);
  return (m ? m[0] : t).trim().slice(0, 160);
}
export function premiseCheck(question, answer, fixes = []) {
  if (!fixes.length || !CONFIRM_Q.test(String(question || ""))) return null;
  const first = openingSentence(answer);
  return first && AFFIRM_OPEN.test(first) ? first : null;
}

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
  return `${text.trim()}\n\n---\n**베리라인 확인 — 바로잡을 곳**\n${lines.join("\n")}`;
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
    block: g.articles.length ? `[현행 조문 — 베리라인이 법제처 국가법령정보에서 지금 받아 온 원문. 법령 이야기는 이것을 기준으로 답하라]\n${g.articles.map((a) => a.block).join("\n\n")}` : "",
  };
}

// ── 답 확인 ──────────────────────────────────────────────────
/**
 * 답을 확인하고, 고칠 곳이 있으면 고친 답을 돌려준다.
 * 돌려주는 값: { text, changed, verification }
 *   verification: { checked, laws, articles, fixes[], hedged[], supported[], cleared, facts_checked, fact_check_failed, revise_failed }
 */
/**
 * 확인할 사실이 있는 답인가(2026-10-18 대표 "일상적인 간단한 질문도 너무 오래 걸려, 베리라인이 필요한 정도를 계산해서").
 * 짧은 답에 숫자 · 날짜 · 이름(기관 · 회사 · 약 · 장소) · 법 · 인용이 하나도 없으면 사실 뽑기(모델 호출)를 건너뛴다 — 인사 · 잡담 · 감상 · 다듬기.
 * 코드 검산(계산 · 요일)과 법령 대조 여부 판단은 그대로 한다. 애매하면 늘 확인한다(건너뛰는 쪽이 좁다).
 */
const FACT_CUES = /\d|[一-龥]|「|“|"|'|[A-Z][a-zA-Z]{2,}|(청|부|처|원|공단|공사|대학교|대학|은행|병원|법원|회사|그룹|협회|재단|위원회|센터|시청|구청|군청|정부|국회|대통령|장관|의원|조선|고려|왕|전쟁|약|복용|성분|부작용|효능|증상|질환|법|규정|제도|세금|보험|연금|지원금|금리|환율|주가|가격|요금|출시|발표|일정|기간|마감|최초|최대|최고|유일|평균|비율|퍼센트|미국|중국|일본|서울|부산|세계|국내|해외)/;
export function hasCheckableFacts(text) {
  const t = String(text || "").replace(/```[\s\S]*?```/g, " ");
  if (t.length > 500) return true;
  return FACT_CUES.test(t);
}

export async function checkAnswer({ question = "", answer, level: levelKey = "fast", references = [], sources = [], ledger = null, onStage = () => {}, deps = {}, shareFacts = true }) {
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

  onStage("베리라인이 답 속 사실을 확인하는 중…");
  const legalCheck = legalTalk
    ? (async () => {
        // 베리라인 엔진 2.0(server/engine/v2/verify.js) — 주장 표 → 코드 대조(조문 저장소 · 벌칙 지도 · 위임 지도) → 애매한 것만 좁게 판단 → 확정 값으로 고쳐 쓰기.
        // 1.x 대조 · 반론을 주입한 시험, VERILINE_ENGINE=1 이면 예전 길. 2.0이 돌지 못하면(주장 표 실패 등) 아래 1.x 길로 간다.
        const useV2 = deps.engineV2 ?? (!deps.reviewStatutes && !deps.defend && process.env.VERILINE_ENGINE !== "1");
        if (useV2) {
          // 기본 2.1(코드 확정 + 저장소 도구를 쥔 검증관, engine/v2/hybrid.js). VERILINE_ENGINE=2.0 이면 주장 표 · 판정관 · 교정자만 쓰는 2.0.
          // 기본 3.0(근거 묶음 + 한 번에 판정 · 작성 + 등급 넘김, engine/v3). 깊음 단계 · VERILINE_MODE=precision 은 2.1 정밀(Opus + 도구).
          const ver = process.env.VERILINE_ENGINE || "3";
          const precisionTier = level.key === "deep" || process.env.VERILINE_MODE === "precision";
          const v2 = ver === "3" && !precisionTier
            ? await (deps.verifyLegalV3 || verifyLegalV3)({ question: q, answer: text, ledger, deps: { todayLine } }).catch(() => null)
            : ver === "2.0"
            ? await (deps.verifyLegalV2 || verifyLegalV2)({ question: q, answer: text, ledger, deps: { todayLine } }).catch(() => null)
            : await (deps.verifyLegalHybrid || verifyLegalHybrid)({
                question: q, answer: text, ledger,
                // 등급: 빠름 = 기본(Haiku, 코드가 고른 조문을 넉넉히), 깊음 = 정밀(Opus, 코드 확정 근거만 주고 스스로 찾게).
                // VERILINE_MODE=precision 이면 단계와 상관없이 정밀(비교 시험용).
                ...(level.key === "deep" || process.env.VERILINE_MODE === "precision"
                  ? { model: process.env.VERILINE_PRECISION_MODEL || "claude-opus-5-5", deps: { todayLine, mode: "precision" } }
                  : { model: legalModelFor(level.key), deps: { todayLine } }),
              }).catch(() => null);
          if (v2) v2.version = v2.engine || (ver === "2.0" ? "veriline-2.0" : precisionTier ? "veriline-2.1-precision" : "veriline-2.1");
          if (v2?.ran) {
            return { all: { laws: v2.laws, articles: [], missing: [] }, ran: true, engine: "v2", v2, errors: v2.errors, agent: { issues: v2.errors, turns: v2.calls, toolCalls: 0, unsupported: v2.unsupported }, agentAnswer: v2.answer, cleared: 0 };
          }
        }
        const [fromQ, fromA] = await Promise.all([
          LAW_HINT.test(q) ? gatherQuestion(q, gather, ledger, !deps.gatherArticles) : { laws: [], articles: [] },
          gather(text, [], { ledger }).catch(() => ({ laws: [], articles: [] })),
        ]);
        const all = mergeGathered(fromQ, fromA);
        const trace = deps.traceAmendment || traceAmendment;
        const traceErrors = (errors, articleOf) => Promise.all(errors.filter((d) => d.proof).slice(0, 2).map(async (d) => {
          const art = articleOf(d);
          if (!art?.no) return;
          const t = await Promise.race([trace({ law: art.law, no: art.no, branch: art.branch, claimText: d.answer_quote, currentText: art.text }), new Promise((r) => setTimeout(() => r(null), 8000))]).catch(() => null);
          if (t?.outdated) d.amendment = t;
        }));
        // 베리라인 엔진 1.1 — 법령 검증관(server/engine/legalAgent.js): 미리 모은 조문 + 코드 확인 단서를 쥐고, 모자라면 법제처 도구로 더 찾아
        // 대조하고 고쳐 쓴다. 근거는 인용 잠금으로, 고친 답의 수치는 코드로 다시 본다. 실패하면 1.0 길(대조 → 반론)로 간다.
        // 1.0 대조 · 반론을 주입한 시험은 1.0 길을 시험하는 것이다 — 검증관은 따로 켜야(deps.legalAgent) 돈다.
        const useAgent = deps.legalAgent ?? (!deps.reviewStatutes && !deps.defend && process.env.VERILINE_LEGAL_AGENT !== "off");
        if (useAgent) {
          const signals = numericAudit(text, all.articles);
          const missingLines = (all.missing || []).map((m) => `- 글이 든 ${m.law} 제${m.no}조${m.branch ? `의${m.branch}` : ""}는 현행 법령에 없다(본칙 마지막 조문 제${m.lastNo}조${m.lastTitle ? `(${m.lastTitle})` : ""})`);
          const hints = [signalsBlock(signals), missingLines.length ? `[코드 확인 결과 — 없는 조문]\n${missingLines.join("\n")}` : ""].filter(Boolean).join("\n\n");
          const runAgent = (model) => (deps.legalAgentCheck || legalAgentCheck)({ question: q, answer: text, gathered: all, hints, model, effort: legalEffortFor(level.key), ledger, deps: { todayLine } }).catch(() => null);
          let agent = await runAgent(legalModelFor(level.key));
          const strong = legalEscalateModelFor(level.key);
          if (strong && strong !== legalModelFor(level.key) && shouldEscalate(agent, signals.length + (all.missing || []).length)) {
            const second = await runAgent(strong);
            if (second?.ran) agent = { ...second, escalatedFrom: { model: legalModelFor(level.key), issues: agent?.issues?.length ?? null } };
          }
          if (agent?.ran) {
            let errors = agent.issues.map((it) => ({ answer_quote: it.answer_quote, reason: it.problem, proof: it.proof, art: { law: it.proof.law, no: it.no, branch: it.branch, text: it.articleText } }));
            // 반론 먼저 — 검증관이 틀렸다고 지목한 곳을 두 번째 검토자(반론 · 인용 잠금)가 다시 본다. 싼 검증관이 맞는 답을 과하게 고치지 않게.
            // 지목이 있을 때만 돈다. 모두 반론에 막히면(ok) 원래 답을 그대로 둔다.
            // 2026-10-26 비교 시험: 켜면 진짜 틀림 4건을 막아 바로잡음이 100% → 87.5%로 떨어지고 1건 $0.025가 더 들었다 — 기본은 끈다.
            if (errors.length && (deps.agentDefense ?? process.env.VERILINE_AGENT_DEFENSE === "on")) {
              const arts = agent.articlesSeen.map((a, i) => ({ ...a, id: `D${i + 1}`, block: `[D${i + 1}] ${a.law} 제${a.no}조${a.branch ? `의${a.branch}` : ""}${a.title ? `(${a.title})` : ""}\n${String(a.text).slice(0, 1800)}` }));
              const cands = errors.map((e, i) => ({ id: `G${i}`, source: "agent", index: -1, answer_quote: e.answer_quote, problem: e.reason, locked: true, proof: e.proof }));
              const decided = await defendFn(text, arts, cands, { ledger, effort: level.legalEffort || null, question: q }).catch(() => null);
              if (decided?.length) {
                const keep = new Set(decided.filter((d) => d.decision !== "ok").map((d) => d.id));
                agent.cleared = errors.length - keep.size;
                errors = errors.filter((e, i) => keep.has(`G${i}`));
                if (!errors.length) agent.answer = null;
              }
            }
            await traceErrors(errors, (d) => d.art);
            return { all, ran: true, errors, agent, agentAnswer: agent.answer, cleared: agent.cleared || 0 };
          }
        }
        if (!all.articles.length) return { all, errors: [] };
        const r = await review(text, [], { ledger, gathered: all, effort: level.legalEffort || null, question: q }).catch(() => null);
        if (!r?.issues?.length) return { all, errors: [], ran: !!r?.ran };
        const cands = r.issues.map((it, i) => ({ id: `R${i}`, source: "review", index: -1, answer_quote: it.answer_quote, problem: it.problem, kind: it.kind, locked: true, proof: { law: it.law, label: it.articleLabel, url: it.url, quote: it.article_quote } }));
        const decided = await defendFn(text, all.articles, cands, { ledger, effort: level.legalEffort || null, question: q }).catch(() => []);
        const errors = decided.filter((d) => d.decision === "error");
        // 베리라인 엔진: 확정된 틀림이 옛 법 그대로인지 법제처 연혁으로 거슬러 본다(모델 호출 없음 · 법제처 API만).
        // "틀렸다"에서 그치지 않고 "2025.2.23 개정 전 내용"까지 밝히면, 고쳐 쓴 답과 보고서가 왜 틀렸는지를 말할 수 있다.
        await traceErrors(errors, (d) => all.articles.find((a) => a.law === d.proof.law && articlePublic(a).label === d.proof.label));
        return { all, ran: true, errors, cleared: decided.filter((d) => d.decision !== "error").length };
      })()
    : Promise.resolve(null);
  // 확인할 사실이 없는 짧은 답(인사 · 잡담 · 감상)은 사실 뽑기를 건너뛴다 — 모델 호출 0번, 1초 안쪽
  const factCheck = (deps.checkEverydayFacts || hasCheckableFacts(text))
    ? everyday(text, { level, ledger, skipLegal: legalTalk, references: normalizeAnswerReferences(references), sources: normalizeSources(sources), shareFacts }).catch(() => ({ claims: [], results: [], failed: true }))
    : Promise.resolve({ claims: [], results: [], skipped: true });
  const caseCheck = (deps.checkCaseCitations || checkCaseCitations)(text).catch(() => []);
  const [legal, facts, cases] = await Promise.all([legalCheck, factCheck, caseCheck]);
  for (const c of cases || []) {
    if (c.found) verification.supported.push({ claim: c.claim, quote: c.quote, url: c.url, evidence: c.title, field: "law", official: true });
    else verification.hedged.push({ quote: c.quote, claim: c.claim, field: "law", note: `법제처 판례 · 결정례 목록에서 ${c.caseNumber} 사건을 찾지 못함 — 사건번호를 빼거나 확인되지 않았다고 쓸 것. 판례의 내용을 고칠 때 언론 기사 · 블로그를 출처로 쓰지 말고, 법제처에서 확인한 판례 번호가 없으면 번호 없이 \"대법원 판례\"로만 적을 것` });
  }
  if (cases?.length) verification.cases = cases.map((c) => ({ caseNumber: c.caseNumber, found: c.found, url: c.url || "" }));

  if (legal?.all) {
    verification.laws = legal.all.laws;
    verification.articles = legal.all.articles.slice(0, 10).map(articlePublic);
    verification.cleared += legal.cleared || 0;
    for (const m of legal.all.missing || []) {
      const f = missingArticleFix(text, m);
      if (f) verification.fixes.push(f);
    }
    for (const e of legal.errors || []) verification.fixes.push({ type: "legal", quote: e.answer_quote, problem: `${e.reason || e.problem}${e.amendment ? ` (${e.amendment.note})` : ""}`, law: e.proof?.law, label: e.proof?.label, url: e.proof?.url, evidence: e.proof?.quote, ...(e.amendment ? { amendment: e.amendment, error_kind: "outdated" } : {}) });
  }
  for (const r of facts?.results || []) {
    if (r.verdict === "supported") verification.supported.push({ claim: r.claim, quote: r.quote, url: r.url, evidence: r.quoteSrc, field: r.field, official: r.official });
    else if (r.verdict === "contradicted") verification.fixes.push({ type: "fact", quote: r.quote, problem: `실제로는 ${r.correct}`, url: r.url, evidence: r.quoteSrc, field: r.field, official: r.official });
    else verification.hedged.push({ quote: r.quote, claim: r.claim, field: r.field });
  }
  // 법 · 제도 답: 받아 온 현행 조문에 숫자가 그대로 있는 문장은 웹 확인이 늦어도 확인됨(조문 숫자 대조, 2026-10-18)
  if (legal?.all?.articles?.length && verification.hedged.length) {
    const fixedQuotes = new Set(verification.fixes.map((f) => f.quote));
    const { keep, confirmed } = confirmByStatute(verification.hedged, legal.all.articles, fixedQuotes);
    verification.hedged = keep;
    for (const { item, article } of confirmed) {
      verification.supported.push({ claim: item.claim, quote: item.quote, url: article?.url || "", evidence: article ? `${article.law} ${articlePublic(article).label}` : "현행 조문", field: "law", official: true, via: "statute" });
    }
    if (confirmed.length) verification.statute_confirmed = confirmed.length;
  }
  verification.facts_checked = (facts?.results || []).length;
  verification.store_hits = facts?.storeHits || 0;
  if (facts?.skipped) verification.light = true; // 확인할 사실이 없는 답
  if (facts?.failed) verification.fact_check_failed = true;

  const blanket = verification.supported.length > 0 && BLANKET_DISCLAIMER.test(text);
  // 법령 검증관이 고쳐 쓴 답이 있으면 그것이 바탕이다. 남은 고칠 곳(법령 밖 사실 · 없는 조문 등)은 그 답에 아직 남아 있는 것만 이어서 고친다.
  const agentAnswer = legal?.agentAnswer || null;
  const base = agentAnswer || text;
  if (agentAnswer) {
    verification.rewritten_by = "legal_agent";
    if (legal.agent.unsupported?.length) verification.unsupported_numbers = legal.agent.unsupported;
  }
  // 어느 엔진이 판정했는지 늘 적는다(2026-10-29) — 3.x가 돌지 못해 예전 길로 갔으면 고객이 알 수 있어야 한다. 그 길에는 판정 영수증 · 책임 범위가 없다.
  verification.engine = "veriline-1";
  if (legal?.engine === "v2") {
    verification.engine = legal.v2.version || "veriline-2.1";
    verification.articles = legal.v2.articles.slice(0, 10);
    verification.claims = legal.v2.table || legal.v2.codeTable;
    // 판정 영수증 — 판정마다 누가(코드 / 모델+원문 인용 잠금) 무엇을 근거로 정했는지. 영수증만으로 AI 없이 다시 확인할 수 있다(engine/v2/receipt.js).
    verification.receipts = legal.v2.receipts || [];
    verification.provenance = legal.v2.provenance || null;
    verification.evidence = legal.v2.evidence || null; // 원문으로 증명된 고침(영수증) / 증빙 없이 AI가 쓴 문장 여부
    // 책임 범위 — 영수증이 있는 판정만(engine/v2/receipt.js guaranteeScope). 확정 못 한 주장은 "확인하지 못함"으로 돌려준다
    verification.guarantee = guaranteeScope({ receipts: verification.receipts, codeTable: legal.v2.codeTable || [], evidence: verification.evidence });
    if (legal.v2.unsupported?.length) verification.unsupported_numbers = legal.v2.unsupported;
  } else if (legal?.agent) verification.legal_agent = { model: legal.agent.escalatedFrom ? legalEscalateModelFor(level.key) : legalModelFor(level.key), escalated: !!legal.agent.escalatedFrom, turns: legal.agent.turns, tool_calls: legal.agent.toolCalls, issues: legal.agent.issues.length };
  const stillIn = (quote) => !!quote && squash(base).includes(squash(quote));
  const pend = agentAnswer
    ? { fixes: verification.fixes.filter((f) => stillIn(f.quote)), hedged: verification.hedged.filter((h) => stillIn(h.quote)), supported: [] }
    : { fixes: verification.fixes, hedged: verification.hedged, supported: verification.supported };
  // 법령 답을 엔진 2.x가 조문으로 확인했으면, 웹 사실 확인의 '확인 안 됨'으로 수치를 흐리게 고치지 않는다 — 2026-10-26 비교 시험에서
  // "60일이 아니라 30일"이라는 맞는 답이 웹에서 출처를 못 찾았다는 이유로 "더 짧은 기한"으로 바뀌어 감점됐다. 출처로 반대 증거를 찾은 틀림(fixes)만 남긴다.
  if (legal?.engine === "v2") {
    if (pend.hedged.length) verification.hedges_skipped_by_statute = pend.hedged.length;
    pend.hedged = [];
  }
  let finalText = base;
  if (pend.fixes.length || pend.hedged.length || (blanket && !agentAnswer)) {
    // 검증관이 이미 고쳐 쓴 답은 첫 대답도 정리돼 있다 — 첫 대답 점검은 1.0 길에서만.
    const premise = agentAnswer ? null : premiseCheck(q, base, pend.fixes);
    if (premise) verification.premise_checked = true;
    onStage(pend.fixes.length ? `틀린 곳 ${pend.fixes.length}개를 근거대로 고치는 중…` : "답을 다듬는 중…");
    const lines = [
      ...pend.fixes.map((f) => `- 틀림: "${f.quote}" → ${f.problem}${f.hint ? ` (${f.hint})` : ""}${f.law ? ` (근거: ${f.law} ${f.label} “${f.evidence}”)` : f.url ? ` (근거: ${f.url} “${String(f.evidence || "").slice(0, 200)}”)` : ""}`),
      ...pend.hedged.map((h) => `- 확인 안 됨: "${h.quote}"${h.note ? ` (${h.note})` : ""}`),
      ...pend.supported.map((s) => `- 확인됨: "${s.quote || s.claim}" (출처: ${s.url})`),
      ...(premise ? [`- 첫 대답 점검: "${premise}" — 질문자는 자기 이해가 맞는지 물었다. 위 '틀림'이 질문자가 말한 내용을 고치는 것이면 첫 대답을 바꾼다.`] : []),
    ].join("\n");
    const articlesBlock = legal?.all?.articles?.length ? `[현행 조문]\n${legal.all.articles.map((a) => a.block).join("\n\n")}\n\n` : "";
    const user = `${todayLine()}${articlesBlock}${q ? `[질문]\n${q}\n\n` : ""}[답변]\n${base}\n\n[고칠 곳]\n${lines}`;
    // 먼저 고칠 문장만 바꾼다(답 전체를 다시 쓰면 고칠 곳이 한 줄이어도 답 길이만큼 시간이 걸렸다 — 2026-10-17 실측 2~8초).
    // 바꿀 글을 답에서 못 찾거나 틀린 문장이 그대로 남으면 예전처럼 전체를 다시 쓴다.
    const patchFn = deps.revisePatch || (deps.revise ? null : revisePatch);
    const patched = patchFn
      ? await patchFn({ model: level.reviseModel, user, ledger, timeoutMs: level.reviseMs }).then((edits) => applyEdits(base, edits, pend.fixes)).catch(() => null)
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
    const cleaned = cleanRevised(revised, base);
    if (cleaned) finalText = cleaned;
    else if (pend.fixes.length || pend.hedged.length) {
      // 고쳐 쓰기가 실패해도 틀린 답을 그대로 돌려주지 않는다 — 바로잡을 곳을 답 아래에 분명히 붙인다.
      verification.revise_failed = true;
      finalText = appendCorrections(base, pend);
    }
  }
  // 확인하지 못했으면 "확인함"이라고 말하지 않는다(2026-10-29) — 모델 호출이 실패하면(키 · 잔액 · 장애) 법령 대조도 사실 확인도
  // 돌지 못한 채 checked: true · 고칠 곳 0개로 나가, 틀린 답이 '검증 통과'처럼 보였다(로컬 키 오류로 재현: 3천만 원 오답이 그대로).
  // 법령 질문인데 법령 대조가 돌지 못했거나 사실 확인이 실패했으면 표시하고, 아무것도 확인하지 못했으면 checked를 false로 둔다.
  const legalFailed = legalTalk && !legal?.ran;
  if (legalFailed) verification.legal_check_failed = true;
  const touched = verification.fixes.length + verification.supported.length + (verification.hedged || []).length + (verification.cleared || 0) + (verification.facts_checked || 0) + (verification.computed || 0);
  if ((legalFailed || verification.fact_check_failed) && !touched) {
    verification.checked = false;
    verification.status = "unverified";
  } else {
    verification.status = legalFailed || verification.fact_check_failed ? "partial" : "verified";
  }
  return { text: finalText, changed: finalText !== text, verification };
}
