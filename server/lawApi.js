// 법제처 국가법령정보 공동활용 Open API 클라이언트.
// 조문/판례 검색·본문조회는 문서화가 부실해, 실제 OC 코드로 라이브 호출해 확인한
// 응답 스키마를 기준으로 구현했다.
//   - target=prec  + nb=사건번호  : 판례 사건번호 정확 검색
//   - target=prec  + query=…     : 판결문 전문 검색(다른 판결의 참조판례에 인용된 번호도 걸림)
//   - target=detc  + nb=사건번호  : 헌법재판소 결정례 정확 검색
//   - target=law   + query=법령명 : 부분 일치 검색(‘주택임대차법’ → 주택임대차보호법)
import { XMLParser } from "fast-xml-parser";
import { normalizeLawName } from "./nec/identifiers.js";
import { cacheKey, getCached, setCached } from "./lawCache.js";

const BASE = "http://www.law.go.kr/DRF";
const xmlParser = new XMLParser({ ignoreAttributes: false });
const TIMEOUT_MS = 10_000;

export function hasOC() {
  return !!process.env.LAW_OC;
}

function toPublicUrl(relativeOrAbs) {
  if (!relativeOrAbs) return null;
  const full = relativeOrAbs.startsWith("http") ? relativeOrAbs : `https://www.law.go.kr${relativeOrAbs}`;
  try {
    const u = new URL(full);
    u.searchParams.delete("OC"); // 서버 전용 OC 코드는 클라이언트로 절대 전달하지 않음
    u.protocol = "https:";
    return u.toString();
  } catch {
    return full;
  }
}

// 법제처 API는 간헐적으로 타임아웃·연결 끊김을 낸다(테스트에서 재현됨). 한 번 삐끗했다고
// 웹 폴백으로 내려가면 그 주장은 조문 원문 대조라는 가장 강한 근거를 잃는다. 한 번 더 부른다.
//
// 그 앞에 캐시를 둔다. 같은 조문이 검증마다 반복해서 조회되는데 본문은 그 사이 바뀌지
// 않는다. 실패한 응답은 캐시하지 않는다 — 장애를 하루 종일 되풀이하게 된다.
async function callLawApi(path, params) {
  const key = cacheKey(path, params);
  const hit = getCached(key);
  if (hit) return hit;

  const first = await callLawApiOnce(path, params);
  if (first.ok) return setCached(key, first, { found: hasContent(first) });
  if (first.reason === "no_oc") return first;

  await new Promise((r) => setTimeout(r, 400));
  const second = await callLawApiOnce(path, params);
  return second.ok ? setCached(key, second, { found: hasContent(second) }) : second;
}

// "찾았는가"를 응답 모양만 보고 가늠한다. 검색 응답은 totalCnt가 0이면 못 찾은 것이고,
// 본문 조회는 내용이 비어 있으면 못 찾은 것이다. 못 찾은 응답은 짧게만 들고 있는다 —
// 부존재 판정의 근거가 되기 때문에 오래된 것을 쓰면 없는 죄를 씌우게 된다.
function hasContent(r) {
  const d = r?.data;
  if (!d) return false;
  const search = d.LawSearch || d.AdmRulSearch || d.OrdinSearch || d.PrecSearch || d.DetcSearch;
  if (search) return Number(search.totalCnt) > 0;
  return true;
}

async function callLawApiOnce(path, params) {
  const OC = process.env.LAW_OC;
  if (!OC) return { ok: false, reason: "no_oc" };
  try {
    const jsonQs = new URLSearchParams({ OC, type: "JSON", ...params });
    const res = await fetch(`${BASE}/${path}?${jsonQs.toString()}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    const text = await res.text();
    try {
      return { ok: true, data: JSON.parse(text) };
    } catch {
      const xmlQs = new URLSearchParams({ OC, type: "XML", ...params });
      const xmlRes = await fetch(`${BASE}/${path}?${xmlQs.toString()}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      const xmlText = await xmlRes.text();
      return { ok: true, data: xmlParser.parse(xmlText) };
    }
  } catch (e) {
    return { ok: false, reason: "network_error", error: e.message };
  }
}

function normalizeArticleNo(raw) {
  if (!raw) return "";
  const m = String(raw).match(/\d+/);
  return m ? m[0] : String(raw).trim();
}

function toArray(v) {
  return Array.isArray(v) ? v : v ? [v] : [];
}

// 법령 하나가 개정되면 여러 MST(과거/현재/시행예정 버전)가 동시에 존재할 수 있다.
// target=eflaw(현행법령)는 오늘 날짜 기준으로 실제 유효한 버전에 "현행연혁코드":"현행"을
// 정확히 붙여주지만, 검색 결과가 "법령당 1행"이 아니라 "버전(개정)당 1행"이라 짧은 법령명
// (예: "민법")은 무관한 법령들의 전체 개정 이력에 밀려 exact match가 display 창을 벗어날
// 수 있다(실측: "민법" 쿼리는 eflaw에서 결과가 "난민법" 계열로 도배됨). display를 넉넉히
// 잡아 우선 exact match를 찾고, 그래도 못 찾으면 법령당 1행만 반환하는 target=law로
// 폴백한다.
const EFLAW_DISPLAY = 100;

const sameName = (a, b) => normalizeLawName(a) === normalizeLawName(b);

function toResult(picked, status) {
  return {
    ok: true,
    found: true,
    currentVersionAvailable: status === "current",
    versionStatus: status, // "current" | "upcoming_only" | "historical_only"
    mst: picked["법령일련번호"],
    lawNameOfficial: picked["법령명한글"],
    effectiveDate: picked["시행일자"],
    detailUrl: toPublicUrl((picked["법령상세링크"] || "").replace("target=eflaw", "target=law")),
  };
}

// 이름이 (띄어쓰기·가운뎃점 차이까지 무시하고) 정확히 같은 법령만 "찾음"으로 본다.
// 부분 일치로 걸린 다른 법령은 candidates로 돌려줘서 근접도(P) 계산에 쓴다.
export async function searchStatute(lawName) {
  const r = await callLawApi("lawSearch.do", { target: "eflaw", query: lawName, display: EFLAW_DISPLAY });
  if (!r.ok) return r;
  const items = toArray(r.data?.LawSearch?.law);
  const exactCurrent = items.find((x) => sameName(x["법령명한글"], lawName) && x["현행연혁코드"] === "현행");
  if (exactCurrent) return toResult(exactCurrent, "current");

  const fallback = await callLawApi("lawSearch.do", { target: "law", query: lawName, display: 20 });
  const fItems = fallback.ok ? toArray(fallback.data?.LawSearch?.law) : [];
  const fExact = fItems.find((x) => sameName(x["법령명한글"], lawName) && x["현행연혁코드"] === "현행");
  if (fExact) return toResult(fExact, "current");

  const exactAny = [...items, ...fItems].filter((x) => sameName(x["법령명한글"], lawName));
  if (exactAny.length > 0) {
    const upcoming = exactAny.find((x) => x["현행연혁코드"] === "시행예정");
    return toResult(upcoming || exactAny[0], upcoming ? "upcoming_only" : "historical_only");
  }

  const seen = new Set();
  const candidates = [...fItems, ...items]
    .filter((x) => x["현행연혁코드"] === "현행")
    .filter((x) => (seen.has(x["법령명한글"]) ? false : seen.add(x["법령명한글"])))
    .slice(0, 10)
    .map((x) => toResult(x, "current"));
  return { ok: true, found: false, candidates, searchedOk: fallback.ok };
}

// 법령명이 통째로 틀린 경우 부분 일치로도 안 걸리므로, 어간(‘…법’ 떼기)으로 한 번 더 찾는다.
export async function searchLawCandidatesByStem(lawName) {
  const stem = String(lawName).replace(/\s+/g, " ").trim().replace(/(에 관한 )?(법률|법|시행령|시행규칙)$/, "").trim();
  if (!stem || stem.length < 2 || stem === lawName) return [];
  const r = await callLawApi("lawSearch.do", { target: "law", query: stem, display: 10 });
  if (!r.ok) return [];
  return toArray(r.data?.LawSearch?.law)
    .filter((x) => x["현행연혁코드"] === "현행")
    .map((x) => toResult(x, "current"));
}

export async function searchAdminRule(name) {
  const r = await callLawApi("lawSearch.do", { target: "admrul", query: name, display: 20 });
  if (!r.ok) return r;
  const items = toArray(r.data?.AdmRulSearch?.admrul);
  const hit = items.find((x) => sameName(x["행정규칙명"], name));
  return {
    ok: true,
    found: !!hit,
    item: hit ? { name: hit["행정규칙명"], url: toPublicUrl(hit["행정규칙상세링크"]) } : null,
    candidates: items.slice(0, 5).map((x) => ({ lawNameOfficial: x["행정규칙명"], detailUrl: toPublicUrl(x["행정규칙상세링크"]) })),
  };
}

// ── 행정규칙 발령번호 조회 ────────────────────────────────────────────────
// 고시·훈령·예규는 "공정거래위원회 고시 제2022-4호"처럼 발령번호로 인용되는 일이 많다.
// 그런데 법제처 검색 API는 발령번호를 색인하지 않는다 — target=admrul에서 nb는 무시돼
// query와 같은 전문 검색으로 동작하고, knd(종류)·발령일자 필터도 받지 않는다(라이브 확인).
// 그래서 소관부처 코드로 그 부처의 행정규칙 목록을 받아 발령번호를 직접 대조한다.
// org 코드는 부처 본청뿐 아니라 소속기관·공동발령 규칙까지 묶으므로 소관부처명도 함께 본다.
// 아래 코드는 전부 target=admrul 상세조회의 "소관부처코드"를 그대로 옮긴 것이다(추정 없음).
const ADMIN_RULE_ORGS = [
  [["공정거래위원회", "공정위"], "1130000"],
  [["금융위원회", "금융위", "금융정보분석원", "FIU"], "1160100"],
  [["국세청"], "1210000"],
  [["관세청"], "1220000"],
  [["법무부"], "1270000"],
  [["경찰청"], "1320000"],
  [["보건복지부", "복지부"], "1352000"],
  [["문화체육관광부", "문체부"], "1371000"],
  [["성평등가족부", "여성가족부", "여가부"], "1384000"],
  [["산업통상부", "산업통상자원부", "산업부", "국가기술표준원"], "1451000"],
  [["식품의약품안전처", "식약처"], "1471000"],
  [["기후에너지환경부", "환경부"], "1482000"],
  [["고용노동부", "노동부", "고용부"], "1492000"],
  [["국토교통부", "국토부"], "1613000"],
  [["과학기술정보통신부", "과기정통부", "방송통신위원회", "우정사업본부"], "1721000"],
  [["행정안전부", "행안부", "국가기록원"], "1741000"],
  [["중소벤처기업부", "중기부"], "1421000"],
  [["교육부"], "1342000"],
  [["해양수산부", "해수부"], "1192000"],
  [["농림축산식품부", "농식품부"], "1543000"],
  [["개인정보보호위원회", "개인정보위"], "1790365"],
  [["방송미디어통신위원회", "방통위"], "1571000"],
  [["국가데이터처", "통계청"], "1241000"],
  [["산림청"], "1400000"],
  [["소방청"], "1661000"],
  [["질병관리청", "질병청"], "1790387"],
  [["지식재산처", "특허청"], "1431000"],
];

const ADMIN_RULE_PAGE = 100;
const ADMIN_RULE_MAX_PAGES = 6; // 최대 600건까지만 훑는다. 넘으면 '확인 불가'로 돌려보낸다.

// 인용 문자열에는 기관명이 여러 개 섞여 들어오기도 한다
// (예: "통신판매업 신고 면제 기준에 대한 고시(공정거래위원회고시 제2022-4호)").
// 발령번호 바로 앞에 붙은 기관이 실제 발령기관이므로, 가장 오른쪽에서 걸리는 별칭을 고른다.
export function resolveAdminRuleOrg(name) {
  const norm = normalizeLawName(name);
  if (!norm) return null;
  let best = null;
  for (const [aliases, code] of ADMIN_RULE_ORGS) {
    for (const a of aliases) {
      const at = norm.lastIndexOf(normalizeLawName(a));
      if (at === -1) continue;
      // 같은 위치라면 더 긴(구체적인) 별칭을 쓴다 — "국세청" vs "청" 같은 포함 관계 대비.
      if (!best || at > best.at || (at === best.at && a.length > best.alias.length)) {
        best = { code, label: aliases[0], alias: a, at };
      }
    }
  }
  return best ? { code: best.code, label: best.label, alias: best.alias } : null;
}

// 발령번호는 응답에 따라 문자열이거나 객체(텍스트 노드)로 온다.
function issueNoOf(item) {
  const v = item?.["발령번호"];
  if (v == null) return "";
  if (typeof v === "object") return String(v["#text"] ?? v._ ?? Object.values(v)[0] ?? "").trim();
  return String(v).trim();
}

export function normalizeIssueNo(raw) {
  return String(raw || "").replace(/[제호\s]/g, "").replace(/[–—−]/g, "-").trim();
}

// 해당 부처의 행정규칙을 전부 훑어 발령번호가 정확히 같은 것을 찾는다.
//   resolved:false → 판단 근거가 없다는 뜻(부처 미상 / 목록이 상한을 넘음). 부존재로 쓰면 안 된다.
//   resolved:true, found:false → 그 부처 목록을 끝까지 확인했는데 없다는 뜻. 부존재 근거가 된다.
export async function findAdminRuleByNumber(orgName, kind, issueNo) {
  const org = resolveAdminRuleOrg(orgName);
  if (!org) return { ok: true, resolved: false, reason: "unknown_org" };
  const want = normalizeIssueNo(issueNo);
  if (!want) return { ok: true, resolved: false, reason: "no_issue_no" };

  const first = await callLawApi("lawSearch.do", { target: "admrul", org: org.code, display: String(ADMIN_RULE_PAGE), page: "1" });
  if (!first.ok) return first;
  const total = Number(first.data?.AdmRulSearch?.totalCnt) || 0;
  const pages = Math.ceil(total / ADMIN_RULE_PAGE);
  const rest = await Promise.all(
    Array.from({ length: Math.max(0, Math.min(pages, ADMIN_RULE_MAX_PAGES) - 1) }, (_, i) =>
      callLawApi("lawSearch.do", { target: "admrul", org: org.code, display: String(ADMIN_RULE_PAGE), page: String(i + 2) }),
    ),
  );
  const items = [first, ...rest]
    .filter((r) => r.ok)
    .flatMap((r) => toArray(r.data?.AdmRulSearch?.admrul));

  const orgNorm = normalizeLawName(orgName);
  const hit = items.find((x) => {
    if (normalizeIssueNo(issueNoOf(x)) !== want) return false;
    if (kind && String(x["행정규칙종류"] || "").trim() !== kind) return false;
    // org 코드가 소속기관까지 묶으므로, 인용된 기관명과 실제 소관부처가 겹치는지 확인한다.
    const owner = normalizeLawName(x["소관부처명"]);
    return owner.includes(orgNorm) || orgNorm.includes(owner) || owner.includes(normalizeLawName(org.label));
  });

  if (hit) {
    return {
      ok: true,
      resolved: true,
      found: true,
      item: {
        seq: hit["행정규칙일련번호"],
        name: hit["행정규칙명"],
        kind: hit["행정규칙종류"],
        issueNo: issueNoOf(hit),
        issuedOn: hit["발령일자"],
        effectiveDate: hit["시행일자"],
        owner: hit["소관부처명"],
        current: hit["현행연혁구분"] === "현행",
        url: toPublicUrl(hit["행정규칙상세링크"]),
      },
    };
  }
  if (pages > ADMIN_RULE_MAX_PAGES) return { ok: true, resolved: false, reason: "list_truncated", total };
  return { ok: true, resolved: true, found: false, total };
}

// 행정규칙 본문은 법령과 달리 "조문내용"이 조문별 문자열 배열로 온다(조문단위 구조 없음).
export async function getAdminRuleArticle(seq, articleNo, branchNo = null) {
  const r = await callLawApi("lawService.do", { target: "admrul", ID: seq });
  if (!r.ok) return r;
  const svc = r.data?.AdmRulService;
  const lines = toArray(svc?.["조문내용"]).map((x) => String(x || "").trim()).filter(Boolean);
  if (!lines.length) return { ok: true, found: false, maxArticleNo: 0 };

  const parsed = lines
    .map((text) => {
      const m = text.match(/^제(\d+)조(?:의(\d+))?/);
      return m ? { no: Number(m[1]), branch: m[2] ? Number(m[2]) : 0, text } : null;
    })
    .filter(Boolean);
  const maxArticleNo = parsed.reduce((m, a) => Math.max(m, a.no), 0);
  const want = Number(normalizeArticleNo(articleNo));
  const sameNo = parsed.filter((a) => a.no === want);
  const match = branchNo ? sameNo.find((a) => a.branch === branchNo) : sameNo.find((a) => !a.branch) || sameNo[0];
  if (!match || /<삭제>/.test(match.text)) {
    return { ok: true, found: false, maxArticleNo, deleted: !!match, branches: sameNo.map((a) => a.branch).filter(Boolean) };
  }
  const info = svc?.["행정규칙기본정보"] || {};
  return {
    ok: true,
    found: true,
    text: match.text,
    title: (match.text.match(/^제\d+조(?:의\d+)?\(([^)]*)\)/) || [])[1] || "",
    effectiveDate: info["시행일자"] || "",
    current: info["현행여부"] === "Y",
    maxArticleNo,
  };
}

export async function searchOrdinance(name) {
  const r = await callLawApi("lawSearch.do", { target: "ordin", query: name, display: 20 });
  if (!r.ok) return r;
  const items = toArray(r.data?.OrdinSearch?.law);
  const hit = items.find((x) => sameName(x["자치법규명"], name));
  return {
    ok: true,
    found: !!hit,
    item: hit ? { name: hit["자치법규명"], url: toPublicUrl(hit["자치법규상세링크"]) } : null,
    candidates: items.slice(0, 5).map((x) => ({ lawNameOfficial: x["자치법규명"], detailUrl: toPublicUrl(x["자치법규상세링크"]) })),
  };
}

// 조문 하나가 항(項)ㆍ호(號)ㆍ목(目)으로 구조화된 경우 실제 조문 텍스트는 "조문내용"이
// 아니라 항.항내용 / 호.호내용 / 목.목내용에 나뉘어 들어있다(단순 조문만 "조문내용"에
// 전체 텍스트가 있음). 실사례 확인: 아동·청소년의 성보호에 관한 법률 제2조(정의)는
// "조문내용"이 비어 있고 9개 호가 전부 "호"."호내용"에만 존재 — 이걸 놓치면 grounding에
// 빈 텍스트를 넘기게 되어 판정이 부정확해진다.
function flattenArticleText(unit) {
  const lines = [];
  if (unit["조문내용"]) lines.push(String(unit["조문내용"]).trim());
  for (const hang of toArray(unit["항"])) {
    if (hang["항내용"]) lines.push(String(hang["항내용"]).trim());
    for (const ho of toArray(hang["호"])) {
      if (ho["호내용"]) lines.push(String(ho["호내용"]).trim());
      for (const mok of toArray(ho["목"])) {
        if (mok["목내용"]) lines.push(String(mok["목내용"]).trim());
      }
    }
  }
  return lines.filter(Boolean).join("\n");
}

// maxArticleNo는 형식 검증(범위 적합성)에 쓴다 — 마지막 조문보다 큰 번호는 존재할 수 없다.
export async function getStatuteArticle(mst, articleNo, branchNo = null) {
  const r = await callLawApi("lawService.do", { target: "law", MST: mst });
  if (!r.ok) return r;
  const arr = toArray(r.data?.["법령"]?.["조문"]?.["조문단위"]).filter((u) => u["조문여부"] === "조문");
  const maxArticleNo = arr.reduce((m, u) => Math.max(m, Number(normalizeArticleNo(u["조문번호"])) || 0), 0);
  const normalized = normalizeArticleNo(articleNo);
  const sameNo = arr.filter((u) => normalizeArticleNo(u["조문번호"]) === normalized);
  const match = branchNo
    ? sameNo.find((u) => Number(u["조문가지번호"]) === branchNo)
    : sameNo.find((u) => !u["조문가지번호"] || Number(u["조문가지번호"]) === 0) || sameNo[0];
  const branches = sameNo.map((u) => Number(u["조문가지번호"]) || 0).filter((b) => b > 0);
  if (!match) return { ok: true, found: false, maxArticleNo, branches };
  const text = flattenArticleText(match);
  if (!text) return { ok: true, found: false, maxArticleNo, branches };
  return {
    ok: true,
    found: true,
    text,
    title: match["조문제목"] || "",
    effectiveDate: match["조문시행일자"] || "",
    maxArticleNo,
  };
}

function precItem(x) {
  return {
    precId: x["판례일련번호"],
    caseNumber: x["사건번호"],
    court: x["법원명"] || x["데이터출처명"],
    caseName: x["사건명"],
    date: x["선고일자"],
    detailUrl: toPublicUrl(x["판례상세링크"]),
  };
}

export async function searchPrecedent(caseNumber) {
  const r = await callLawApi("lawSearch.do", { target: "prec", nb: caseNumber, display: 5 });
  if (!r.ok) return r;
  const items = toArray(r.data?.PrecSearch?.prec);
  const exact = items.find((x) => String(x["사건번호"]).replace(/\s+/g, "") === caseNumber);
  if (!exact) return { ok: true, found: false };
  return { ok: true, found: true, exactMatch: true, ...precItem(exact) };
}

export async function getPrecedentDetail(precId) {
  const r = await callLawApi("lawService.do", { target: "prec", ID: precId });
  if (!r.ok) return r;
  const d = r.data?.PrecService;
  if (!d) return { ok: true, found: false };
  const strip = (s) => (s || "").replace(/<br\s*\/?>/g, " ").replace(/\s+/g, " ").trim();
  return {
    ok: true,
    found: true,
    text: [strip(d["판시사항"]), strip(d["판결요지"])].filter(Boolean).join("\n"),
    references: strip(d["참조판례"]),
    court: d["법원명"],
    date: d["선고일자"],
    caseName: d["사건명"],
    caseNumber: d["사건번호"],
  };
}

// 다른 공개 판결문의 참조판례에 이 사건번호가 인용돼 있으면, 본문이 DB에 없더라도
// 실재한다는 강한 증거다(판결문 전문 검색 → 상위 결과의 참조판례 필드에서 확인).
export async function findCitations(caseNumber) {
  const r = await callLawApi("lawSearch.do", { target: "prec", query: caseNumber, display: 5 });
  if (!r.ok) return r;
  const items = toArray(r.data?.PrecSearch?.prec).filter((x) => String(x["사건번호"]).replace(/\s+/g, "") !== caseNumber);
  const citing = [];
  for (const x of items.slice(0, 2)) {
    const d = await getPrecedentDetail(x["판례일련번호"]);
    if (d.ok && d.found && d.references.replace(/\s+/g, "").includes(caseNumber)) citing.push(precItem(x));
  }
  return { ok: true, cited: citing.length > 0, citing };
}

export async function searchConstitutional(caseNumber) {
  const r = await callLawApi("lawSearch.do", { target: "detc", nb: caseNumber, display: 5 });
  if (!r.ok) return r;
  const items = toArray(r.data?.DetcSearch?.Detc);
  const exact = items.find((x) => String(x["사건번호"]).replace(/\s+/g, "") === caseNumber);
  if (!exact) return { ok: true, found: false };
  return {
    ok: true,
    found: true,
    detcId: exact["헌재결정례일련번호"],
    caseNumber: exact["사건번호"],
    caseName: exact["사건명"],
    date: exact["종국일자"],
    detailUrl: toPublicUrl(exact["헌재결정례상세링크"]),
  };
}

export async function getConstitutionalDetail(detcId) {
  const r = await callLawApi("lawService.do", { target: "detc", ID: detcId });
  if (!r.ok) return r;
  const d = r.data?.DetcService;
  if (!d) return { ok: true, found: false };
  const strip = (s) => (s || "").replace(/<br\s*\/?>/g, " ").replace(/\s+/g, " ").trim();
  const summary = [strip(d["판시사항"]), strip(d["결정요지"])].filter(Boolean).join("\n");
  return {
    ok: true,
    found: true,
    text: summary || strip(d["전문"]).slice(0, 3000),
    caseName: d["사건명"],
    caseNumber: d["사건번호"],
    date: d["종국일자"],
  };
}
