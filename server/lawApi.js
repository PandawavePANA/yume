// 법제처 국가법령정보 공동활용 Open API 클라이언트.
// 조문/판례 검색·본문조회는 문서화가 부실해, 실제 OC 코드로 라이브 호출해 확인한
// 응답 스키마를 기준으로 구현했다.
//   - target=prec  + nb=사건번호  : 판례 사건번호 정확 검색
//   - target=prec  + query=…     : 판결문 전문 검색(다른 판결의 참조판례에 인용된 번호도 걸림)
//   - target=detc  + nb=사건번호  : 헌법재판소 결정례 정확 검색
//   - target=law   + query=법령명 : 부분 일치 검색(‘주택임대차법’ → 주택임대차보호법)
import { XMLParser } from "fast-xml-parser";
import { normalizeLawName } from "./nec/identifiers.js";

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

async function callLawApi(path, params) {
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
