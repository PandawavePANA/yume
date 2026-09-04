// 법제처 국가법령정보 공동활용 Open API 클라이언트.
// 조문/판례 검색·본문조회는 문서화가 부실해, 실제 OC 코드로 라이브 호출해 확인한
// 응답 스키마를 기준으로 구현했다.
import { XMLParser } from "fast-xml-parser";

const BASE = "http://www.law.go.kr/DRF";
const xmlParser = new XMLParser({ ignoreAttributes: false });

export function hasOC() {
  return !!process.env.LAW_OC;
}

function toPublicUrl(relativeOrAbs) {
  if (!relativeOrAbs) return null;
  const full = relativeOrAbs.startsWith("http") ? relativeOrAbs : `https://www.law.go.kr${relativeOrAbs}`;
  try {
    const u = new URL(full);
    u.searchParams.delete("OC"); // 서버 전용 OC 코드는 클라이언트로 절대 전달하지 않음
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
    const res = await fetch(`${BASE}/${path}?${jsonQs.toString()}`);
    const text = await res.text();
    try {
      return { ok: true, data: JSON.parse(text) };
    } catch {
      const xmlQs = new URLSearchParams({ OC, type: "XML", ...params });
      const xmlRes = await fetch(`${BASE}/${path}?${xmlQs.toString()}`);
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
// 폴백한다(그 경우 시행예정 버전이 섞여 나올 이론적 여지는 있지만, 실측상 target=law의
// "현행" 표시도 오늘 기준으로 유효한 버전만 가리켰다 — 이중 안전장치로만 둔다).
const EFLAW_DISPLAY = 100;

function pickCurrentEntry(items, lawName) {
  const exactCurrent = items.find((x) => x["법령명한글"] === lawName && x["현행연혁코드"] === "현행");
  if (exactCurrent) return { entry: exactCurrent, exactNameMatch: true, status: "current" };
  const anyCurrent = items.find((x) => x["현행연혁코드"] === "현행");
  if (anyCurrent) return { entry: anyCurrent, exactNameMatch: false, status: "current" };
  // "현행"이 하나도 없으면 폐지되었거나(연혁만 존재) 아직 시행 전(시행예정만 존재)인 상태다.
  const upcoming = items.find((x) => x["현행연혁코드"] === "시행예정");
  if (upcoming) return { entry: upcoming, exactNameMatch: false, status: "upcoming_only" };
  return { entry: items[0], exactNameMatch: false, status: "historical_only" };
}

function toResult(picked, exactNameMatch, status) {
  return {
    ok: true,
    found: true,
    currentVersionAvailable: status === "current",
    versionStatus: status, // "current" | "upcoming_only" | "historical_only"
    exactNameMatch,
    mst: picked["법령일련번호"],
    lawNameOfficial: picked["법령명한글"],
    effectiveDate: picked["시행일자"],
    detailUrl: toPublicUrl((picked["법령상세링크"] || "").replace("target=eflaw", "target=law")),
  };
}

export async function searchStatute(lawName) {
  const r = await callLawApi("lawSearch.do", { target: "eflaw", query: lawName, display: EFLAW_DISPLAY });
  if (!r.ok) return r;
  const list = r.data?.LawSearch?.law;
  const items = Array.isArray(list) ? list : list ? [list] : [];
  const exactCurrent = items.find((x) => x["법령명한글"] === lawName && x["현행연혁코드"] === "현행");
  if (exactCurrent) return toResult(exactCurrent, true, "current");

  // eflaw에서 exact match를 못 찾음 (결과가 없거나, 무관한 법령들의 개정 이력에 밀림) →
  // 법령당 1행만 주는 target=law로 폴백해 최소한 "그 법령이 존재하는지"는 놓치지 않는다.
  const fallback = await callLawApi("lawSearch.do", { target: "law", query: lawName, display: 20 });
  if (fallback.ok) {
    const fList = fallback.data?.LawSearch?.law;
    const fItems = Array.isArray(fList) ? fList : fList ? [fList] : [];
    const fExact = fItems.find((x) => x["법령명한글"] === lawName && x["현행연혁코드"] === "현행");
    if (fExact) return toResult(fExact, true, "current");
  }

  if (items.length === 0) return { ok: true, found: false };
  const { entry: picked, exactNameMatch, status } = pickCurrentEntry(items, lawName);
  return toResult(picked, exactNameMatch, status);
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

export async function getStatuteArticle(mst, articleNo) {
  const r = await callLawApi("lawService.do", { target: "law", MST: mst });
  if (!r.ok) return r;
  const units = r.data?.["법령"]?.["조문"]?.["조문단위"];
  const arr = Array.isArray(units) ? units : units ? [units] : [];
  const normalized = normalizeArticleNo(articleNo);
  const match = arr.find((u) => u["조문여부"] === "조문" && normalizeArticleNo(u["조문번호"]) === normalized);
  if (!match) return { ok: true, found: false };
  const text = flattenArticleText(match);
  if (!text) return { ok: true, found: false };
  return {
    ok: true,
    found: true,
    text,
    title: match["조문제목"] || "",
    effectiveDate: match["조문시행일자"] || "",
  };
}

export async function searchPrecedent(caseNumber) {
  const r = await callLawApi("lawSearch.do", { target: "prec", query: caseNumber, display: 20 });
  if (!r.ok) return r;
  const list = r.data?.PrecSearch?.prec;
  const items = Array.isArray(list) ? list : list ? [list] : [];
  if (items.length === 0) return { ok: true, found: false };
  const exact = items.find((x) => x["사건번호"] === caseNumber);
  if (!exact) return { ok: true, found: false };
  return {
    ok: true,
    found: true,
    exactMatch: true,
    precId: exact["판례일련번호"],
    caseNumber: exact["사건번호"],
    court: exact["법원명"],
    caseName: exact["사건명"],
    detailUrl: toPublicUrl(exact["판례상세링크"]),
  };
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
    court: d["법원명"],
    date: d["선고일자"],
    caseName: d["사건명"],
    caseNumber: d["사건번호"],
  };
}
