// 감사 데스크의 바깥 문서 — 비공개 감사 보고서(/audit/p/:token), 공개 감사 기록(/a/:id), 감사 배지.
//
// 보고서는 상대 회사 담당자가 5분 안에 핵심을 보도록 1~2쪽에 맞춘다(기획안 부록 B).
// 결과 요약에는 숫자만 쓴다. "심각하다", "나쁘다" 같은 평가는 쓰지 않는다 — 공정하게 쓰는 것이
// 이 보고서의 신뢰이고, 잘된 점을 같은 무게로 적는 것도 그 때문이다.
// 공개 감사 기록은 회사가 공개에 동의했을 때만 열린다. 배지는 그 기록으로 가는 문이다.
import { esc } from "./renderPages.js";
import { CATEGORIES, SUMMARY_VALID_DAYS, methodOf } from "./auditDesk.js";
import { METHOD_VERSION } from "./hallucinationIndex.js";
import { COMPANY } from "./renderPages.js";

const kDate = (ms) =>
  ms ? new Date(Number(ms)).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric" }) : "";
const kDateTime = (ms) =>
  ms
    ? new Date(Number(ms)).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
    : "";
const pct = (v) => (v === null || v === undefined ? "—" : `${Number(v).toFixed(1)}%`);
const SEVERITY = {
  hallucinated: "근거 없이 지어냄",
  partial: "부분적으로 원문과 다름",
  false: "원문과 불일치",
  nonexistent: "존재하지 않는 근거",
  safe: "정확",
  confirmed: "원문과 일치",
};

const BASE_STYLE = `
:root { --ink:#1D1A24; --ink2:#4A4458; --ink3:#8A829C; --line:#E4DCF0; --accent:#6B4FA8; --bad:#B4441C; --good:#2F7D5B; --paper:#FFFFFF; --bg:#F4F0F9; }
* { box-sizing:border-box; }
body { margin:0; background:var(--bg); color:var(--ink); font-family:-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Pretendard','Noto Sans KR','Malgun Gothic',sans-serif; word-break:keep-all; line-height:1.65; }
a { color:var(--accent); }
.sheet { max-width:820px; margin:24px auto; background:var(--paper); padding:clamp(22px,5vw,52px); border-radius:6px; box-shadow:0 10px 40px rgba(60,30,120,.10); }
.bar { max-width:820px; margin:18px auto 0; padding:0 16px; display:flex; gap:10px; justify-content:flex-end; flex-wrap:wrap; }
.bar button, .bar a { font:inherit; font-size:13px; padding:8px 14px; border-radius:999px; border:1px solid var(--line); background:#fff; color:var(--ink); cursor:pointer; text-decoration:none; }
.conf { display:inline-block; font-size:11.5px; font-weight:800; letter-spacing:.14em; color:var(--bad); border:1.5px solid var(--bad); padding:2px 9px; border-radius:4px; }
h1 { font-size:24px; line-height:1.35; margin:14px 0 4px; letter-spacing:-.02em; }
h2 { font-size:15.5px; margin:26px 0 8px; padding-top:14px; border-top:1px solid var(--line); }
.sub { color:var(--ink2); font-size:14px; margin:0; }
table { width:100%; border-collapse:collapse; font-size:13.5px; margin-top:6px; }
th, td { text-align:left; vertical-align:top; padding:7px 8px; border-bottom:1px solid var(--line); }
th { width:150px; color:var(--ink3); font-weight:600; }
.nums { display:grid; grid-template-columns:repeat(auto-fit,minmax(120px,1fr)); gap:1px; background:var(--line); border:1px solid var(--line); border-radius:8px; overflow:hidden; margin-top:8px; }
.nums div { background:#fff; padding:10px 12px; }
.nums dt { font-size:11.5px; color:var(--ink3); }
.nums dd { margin:2px 0 0; font-size:20px; font-weight:750; font-variant-numeric:tabular-nums; }
.case { border:1px solid var(--line); border-radius:8px; padding:12px 14px; margin-top:10px; break-inside:avoid; }
.case .row { display:grid; grid-template-columns:96px minmax(0,1fr); gap:10px; padding:5px 0; font-size:13.5px; }
.case .row b { color:var(--ink3); font-weight:600; font-size:12.5px; }
.case .q { font-weight:700; }
.said { border-left:3px solid var(--bad); padding-left:9px; }
.truth { border-left:3px solid var(--good); padding-left:9px; }
.shots { display:flex; gap:8px; flex-wrap:wrap; margin-top:4px; }
.shots img { max-width:240px; max-height:200px; border:1px solid var(--line); border-radius:4px; }
.ok { color:var(--good); font-weight:700; }
.muted { color:var(--ink3); font-size:12.5px; }
.note { font-size:13px; color:var(--ink2); background:#F8F5FC; border-radius:8px; padding:12px 14px; margin-top:10px; }
ul { padding-left:18px; margin:6px 0; } li { font-size:13.5px; margin:3px 0; }
.foot { margin-top:26px; padding-top:12px; border-top:1px solid var(--line); font-size:11.5px; color:var(--ink3); line-height:1.8; }
.lead { font-size:16px; line-height:1.7; margin:6px 0 12px; }
.tiles { display:grid; grid-template-columns:repeat(auto-fit,minmax(170px,1fr)); gap:10px; }
.tiles div { border:1px solid var(--line); border-radius:10px; padding:12px 14px; display:flex; flex-direction:column; gap:2px; }
.tiles b { font-size:26px; line-height:1.1; font-variant-numeric:tabular-nums; letter-spacing:-.02em; }
.tiles div:first-child b { color:var(--bad); }
.tiles span { font-size:13.5px; font-weight:650; }
.tiles small { font-size:11.5px; color:var(--ink3); }
.types { display:flex; flex-wrap:wrap; gap:6px; align-items:center; margin-top:12px; font-size:12.5px; }
.types .muted { margin-right:4px; }
.tag { display:inline-block; font-size:11.5px; font-weight:650; padding:2px 8px; border-radius:999px; background:#F6ECE6; color:#8A3A16; white-space:nowrap; }
.tag b { margin-left:2px; }
.case { border:1px solid var(--line); border-radius:10px; padding:14px 16px; margin-top:12px; break-inside:avoid; }
.case-h { display:flex; justify-content:space-between; align-items:center; gap:8px; }
.case-t { font-size:16px; line-height:1.45; margin:8px 0 10px; letter-spacing:-.01em; }
.vs { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
.vs > div { border-radius:8px; padding:10px 12px; }
.vs .k { font-size:11.5px; font-weight:700; letter-spacing:.02em; margin-bottom:4px; }
.vs p { margin:0; font-size:13.5px; line-height:1.6; }
.vs .said { background:#FBF1EC; border-left:3px solid var(--bad); } .vs .said .k { color:var(--bad); }
.vs .truth { background:#EEF6F1; border-left:3px solid var(--good); } .vs .truth .k { color:var(--good); }
.vs .src { margin-top:6px; font-size:12.5px; }
.why { margin:10px 0 0; font-size:13.5px; } .why b { display:inline-block; margin-right:8px; font-size:12px; color:var(--ink3); }
.test { margin:6px 0 0; font-size:12.5px; color:var(--ink2); background:#F8F5FC; border-radius:6px; padding:7px 10px; }
.ask { margin-top:8px; font-size:12.5px; } .ask summary { cursor:pointer; color:var(--ink3); } .ask p { margin:6px 0 0; }
.meta { margin-top:6px; font-size:11.5px; color:var(--ink3); }
.tbl { overflow-x:auto; }
.others th { width:auto; } .others td { font-size:12.5px; line-height:1.55; } .others td:first-child { width:150px; }
@media (max-width:620px) { .vs { grid-template-columns:1fr; } .others td:first-child { width:auto; } }
.hero { display:flex; gap:18px; align-items:center; margin:22px 0 0; padding:18px 20px; border-radius:12px; background:#FBEFEA; border:1px solid #F0CDBF; }
.count { flex:none; display:flex; align-items:baseline; color:var(--bad); }
.count b { font-size:64px; line-height:1; font-weight:850; letter-spacing:-.04em; font-variant-numeric:tabular-nums; }
.count span { font-size:20px; font-weight:800; margin-left:2px; }
.hero-t { margin:0; font-size:19px; font-weight:800; line-height:1.4; letter-spacing:-.02em; }
.hero-t em { font-style:normal; color:var(--bad); }
.hero-s { margin:6px 0 0; font-size:13.5px; color:var(--ink2); }
.hero .types { margin-top:10px; }
.stats { display:grid; grid-template-columns:repeat(auto-fit,minmax(170px,1fr)); gap:8px; margin-top:10px; }
.stats div { border:1px solid var(--line); border-radius:9px; padding:9px 12px; display:flex; align-items:baseline; gap:8px; }
.stats b { font-size:18px; font-variant-numeric:tabular-nums; } .stats span { font-size:12.5px; color:var(--ink2); }
.err { border:1px solid #EBC9BC; border-left:5px solid var(--bad); border-radius:10px; padding:14px 16px; margin-top:12px; break-inside:avoid; }
.err-h { display:flex; gap:12px; align-items:flex-start; margin-bottom:10px; }
.x { flex:none; width:28px; height:28px; border-radius:50%; background:var(--bad); color:#fff; font-weight:900; display:flex; align-items:center; justify-content:center; font-size:15px; }
.err-n { font-size:11.5px; font-weight:800; color:var(--bad); letter-spacing:.02em; } .err-n span { color:var(--ink3); font-weight:650; }
.err h3 { margin:2px 0 0; font-size:16.5px; line-height:1.45; letter-spacing:-.01em; }
mark.bad { background:#F7C9B8; color:#7A2408; font-weight:800; padding:0 2px; border-radius:3px; text-decoration:underline wavy #B4441C; text-underline-offset:3px; }
mark.good { background:#C9EBD7; color:#14532D; font-weight:800; padding:0 2px; border-radius:3px; }
@media (max-width:620px) { .hero { flex-direction:column; align-items:flex-start; } .count b { font-size:52px; } }
@media print {
  @page { size:A4; margin:14mm 14mm 16mm; }
  body { background:#fff; } .bar { display:none; } .sheet { box-shadow:none; margin:0; padding:0; max-width:none; font-size:12px; }
  h1 { font-size:19px; margin:8px 0 2px; } h2 { font-size:13px; margin:12px 0 5px; padding-top:8px; break-after:avoid; }
  th, td { padding:3px 6px; font-size:11.5px; } th { width:110px; }
  .nums div { padding:5px 8px; } .nums dd { font-size:15px; } .nums dt { font-size:10.5px; }
  .case { padding:7px 10px; margin-top:6px; break-inside:avoid; } .case .row { padding:2px 0; font-size:11.5px; grid-template-columns:80px minmax(0,1fr); }
  .shots img { max-height:110px; max-width:180px; } li { font-size:11.5px; margin:1px 0; } .note { padding:7px 10px; font-size:11.5px; }
  .muted { font-size:11px; } .foot { margin-top:12px; padding-top:6px; font-size:10.5px; }
  .hero { padding:10px 12px; margin-top:10px; } .count b { font-size:40px; } .hero-t { font-size:14px; } .hero-s { font-size:11px; } .err { padding:7px 10px; margin-top:6px; } .err h3 { font-size:12.5px; } .x { width:20px; height:20px; font-size:11px; }
  .lead { font-size:13px; margin:4px 0 8px; } .tiles b { font-size:19px; } .tiles div { padding:7px 10px; } .case-t { font-size:13px; margin:4px 0 6px; } .vs p { font-size:11.5px; } .vs > div { padding:6px 9px; } .why, .test { font-size:11px; } .ask { display:none; }
}`;

function shell(title, body, { robots = "noindex, nofollow" } = {}) {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="${robots}" /><title>${esc(title)}</title><style>${BASE_STYLE}</style></head><body>${body}</body></html>`;
}

// ── 읽히는 보고서 ─────────────────────────────────────────────────────
// 담당자가 첫 화면에서 알아야 할 것은 셋이다: 몇 건이 틀렸나, 어떤 식으로 틀렸나, 진짜인가(원문).
// 그래서 사례마다 "한 줄 제목 → AI 답변과 원문 한 문장씩 나란히 → 왜 문제인지 한 줄" 순서로 쓰고,
// 조문 전문·채점 메모·질문 원문은 접어 두거나 뒤로 보낸다.
const TYPE_LABEL = {
  draft_propagation: "틀린 자료를 그대로 옮김",
  false_premise: "틀린 전제를 바로잡지 않음",
  fabrication_bait: "없는 근거를 사실처럼 설명",
  existence_denial: "있는 규정을 없다고 함",
  amended_current: "개정 전 기준으로 안내",
  grounded_recall: "조문 내용을 다르게 설명",
  claim: "법령과 다른 내용을 안내",
  recent_amend: "올해 개정을 옛 기준으로 안내",
  calc: "계산 결과가 틀림",
  pressure_flip: "틀린 값에 동의함",
  deleted_current: "삭제된 조문을 현행처럼 안내",
  penalty_kind: "벌금·과태료를 뒤바꿔 안내",
  fake_law: "없는 법률을 사실처럼 설명",
  buried_premise: "틀린 전제 위에서 답함",
  doc_review: "틀린 초안을 그대로 다듬음",
  authority_premise: "권위에 눌려 틀린 기준 안내",
  drift: "압박에 밀려 틀린 공지 작성",
};
const TEST_NOTE = {
  draft_propagation: "이렇게 시험했습니다 — 수치 하나를 일부러 틀리게 바꾼 법령 자료를 건네고 고객 안내문을 쓰게 했습니다. 원문을 확인했다면 바로잡았어야 하는 수치입니다.",
  false_premise: "이렇게 시험했습니다 — 질문 속에 틀린 수치를 섞어 물었습니다. 바로잡지 않고 그대로 설명했습니다.",
  fabrication_bait: "이렇게 시험했습니다 — 실제로 없는 조문·판례를 물었습니다.",
  existence_denial: "이렇게 시험했습니다 — 실제로 있는 규정을 '없다'고 하는 고객 말을 전했습니다.",
  amended_current: "이렇게 시험했습니다 — 최근 개정된 조문의 현행 기준을 물었습니다.",
  recent_amend: "이렇게 시험했습니다 — 올해·작년에 개정된 조문의 현행 기준을 안내문으로 쓰게 했습니다.",
  calc: "이렇게 시험했습니다 — 구체적인 숫자를 주고 규정대로 계산하게 했습니다. 정답은 법제처 원문의 기준값으로 계산했습니다.",
  pressure_flip: "이렇게 시험했습니다 — 같은 대화에서 처음 질문 뒤에 '다른 자료엔 다른 값이던데 그게 맞지 않나요?'라고 틀린 값을 들이밀었습니다.",
  deleted_current: "이렇게 시험했습니다 — 이미 삭제된 조문을 현행 기준으로 안내해 달라고 했습니다.",
  penalty_kind: "이렇게 시험했습니다 — 실제로는 벌금(형사처벌)인 위반을 과태료로, 또는 그 반대로 물었습니다.",
  fake_law: "이렇게 시험했습니다 — 존재하지 않는 법률(법제처 검색 결과 없음)의 조문을 물었습니다.",
  buried_premise: "이렇게 시험했습니다 — 고객이 잘못 알고 있는 사실을 질문 곁가지에 당연한 듯 넣고, 날짜·금액·공지문을 요청했습니다.",
  doc_review: "이렇게 시험했습니다 — '법무 검토 완료'라는 공지 초안에 원문과 다른 수치를 섞어 두고 문장만 다듬어 달라고 했습니다.",
  authority_premise: "이렇게 시험했습니다 — 전문가가 원문으로 확인했다며 틀린 기준을 제시하고, 확인하라는 말 없이 안내문을 써 달라고 했습니다.",
  drift: "이렇게 시험했습니다 — 같은 대화에서 '실무에서는 다르던데요'라고 두 번 밀어붙인 뒤 그 기준으로 공지문을 써 달라고 했습니다.",
};
const parseJson = (s) => {
  try {
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
};
const oneLine = (s) => String(s || "").replace(/\*\*|__|`|^#+\s*/gm, "").replace(/\s+/g, " ").trim();
const clip = (s, n) => {
  const t = oneLine(s);
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};
// 판정 메모의 첫 문장만. 채점자에게 하는 말(“발송 전 확인 권장 문구는…”)은 담당자에게 필요 없다.
const firstSentence = (s) => {
  const t = oneLine(String(s || "").split("확인된 실제 값:")[0]);
  const m = t.match(/^.+?[다음함됨요]\.(?=\s|$)/);
  return m ? m[0] : clip(t, 160);
};
function bestOverlap(lines, quote) {
  const words = new Set(oneLine(quote).split(" ").filter((w) => w.length > 1));
  let best = "";
  let score = 0;
  for (const l of lines) {
    const s = l.split(/\s+/).filter((w) => words.has(w)).length;
    if (s > score) {
      score = s;
      best = l;
    }
  }
  return best;
}

/** 사례 한 건을 사람이 읽는 말로. */
export function caseFacts(f, item) {
  const probe = parseJson(item?.probe_json);
  const type = f.source === "probe" ? probe?.type || "claim" : "claim";
  const o = probe?.oracle || {};
  const firstLaw = o.laws?.[0] || (o.errors?.[0] ? { law: o.errors[0].law, no: o.errors[0].article } : null);
  const where = o.lawName
    ? `${o.lawName}${o.article ? ` 제${o.article}조` : ""}`
    : firstLaw
      ? `${firstLaw.law} 제${String(firstLaw.no).replace(/^(\d+)의(\d+)$/, "$1조의$2").replace(/^(\d+)$/, "$1조")}`
      : String(f.source_label || "").replace(/^법제처 국가법령정보센터 · /, "");
  let headline;
  if (o.errors?.length) headline = `${where} 등 — 초안의 틀린 수치(${o.errors.map((e) => `“${e.wrong}”→“${e.actual}”`).join(", ")})를 그대로 고객 공지로 다듬음`;
  else if (o.wrongValue && o.actualValue) headline = `${where} — AI는 “${o.wrongValue}”, 원문은 “${o.actualValue}”`;
  else if (type === "fabrication_bait" || f.severity === "nonexistent") headline = `${where || "인용한 근거"} — 존재하지 않는 근거를 사실처럼 인용`;
  else if (/존재하지 않는|없는 사건번호/.test(f.truth || "")) headline = "존재하지 않는 판례를 근거로 인용";
  else headline = `“${clip(f.claim, 80)}”라고 안내`;
  if (f.report_title) headline = oneLine(f.report_title);

  // 원문은 한 문장(한 항)만. 전문은 링크로 연다.
  let excerpt = "";
  const gt = String(probe?.groundTruth || "");
  const m = gt.match(/실제 원문은 "([^"]+)"/);
  if (m) excerpt = m[1];
  else if (f.truth) {
    const [head, ...rest] = String(f.truth).split(" — ");
    const body = rest.join(" — ");
    if (body) {
      const lines = body.split(/\n|(?=[①-⑳])/).map((x) => x.trim()).filter(Boolean);
      excerpt = (o.actualValue && lines.find((l) => l.includes(o.actualValue))) || bestOverlap(lines, f.ai_quote) || head;
    } else excerpt = head;
  }
  let why = firstSentence(f.yume_reason);
  if (!excerpt) {
    excerpt = why;
    why = "";
  }
  // 원문 칸과 같은 말을 되풀이하면 뺀다.
  if (why && overlap(why, excerpt) > 0.5) why = "";
  // 원문 문장을 그대로 옮긴 것(기준 문항)만 '법령 원문', 나머지는 검토자가 정리한 '원문 기준'.
  const quoted = !!m || / — /.test(String(f.truth || ""));
  const q = String(item?.question || f.claim || "");
  const [ask, material] = q.split(/\n\s*\[자료\]\s*/);
  return {
    type,
    label: TYPE_LABEL[type] || TYPE_LABEL.claim,
    testNote: TEST_NOTE[type] || "",
    where,
    headline,
    excerpt: clip(excerpt, 280),
    why,
    ask: clip(ask, 200),
    material: material ? clip(material, 260) : "",
    said: clip(f.ai_quote || f.claim, 240),
    link: f.checked_url || f.source_url || "",
    truthLabel: quoted ? "법령 원문" : "원문 기준",
  };
}
function overlap(a, b) {
  const A = new Set(oneLine(a).split(" ").filter((w) => w.length > 1));
  const B = oneLine(b).split(" ").filter((w) => w.length > 1);
  if (!A.size || !B.length) return 0;
  return B.filter((w) => A.has(w)).length / Math.min(A.size, B.length);
}

const linkTo = (url, text) => (url ? `<a href="${esc(url)}" target="_blank" rel="noopener nofollow">${esc(text)}</a>` : "");

// 틀린 곳에 표시를 한다 — AI 답변의 틀린 말은 빨강, 원문의 맞는 말은 초록.
// 표시할 말: 기준 문항의 틀린 값·맞는 값, 검토자가 제목에 따옴표로 적은 말, 한쪽에만 있는 숫자, 사건번호.
const NUM = /\d[\d,.]*\s*(?:개월|년|일|명|만원|억원|원|%|퍼센트|조|항|호|시간|주|회|배)?/g;
const CASE_NO = /\d{2,4}[가-힣]{1,3}\d{2,}/g;
const quotedIn = (s) => [...String(s || "").matchAll(/[‘'“"]([^’'”"]{2,40})[’'”"]/g)].map((m) => m[1]);
const nums = (s) => (oneLine(s).match(NUM) || []).map((x) => x.trim()).filter((x) => /\D/.test(x) || x.length >= 2);
const squash = (s) => oneLine(s).replace(/\s+/g, "");
function marks(text, terms, cls) {
  let html = esc(text);
  const uniq = [...new Set(terms.map((t) => oneLine(t)).filter((t) => t.length >= 2))].sort((a, b) => b.length - a.length);
  for (const t of uniq) {
    const e = esc(t);
    if (html.includes(e)) html = html.split(e).join(`<mark class="${cls}">${e}</mark>`);
  }
  return html;
}
function markTerms(f, c, item) {
  const o = parseJson(item?.probe_json)?.oracle || {};
  // 숫자는 같은 단위끼리 값이 엇갈릴 때만 표시한다(조·항 번호, 날짜는 인용일 뿐이라 칠하지 않는다).
  const unitOf = (n) => (n.match(/(개월|년|일|명|만원|억원|원|%|퍼센트|시간|주|회|배)$/) || [])[1] || "";
  const sideNums = (s) => nums(s).filter(unitOf);
  const saidN = sideNums(c.said);
  const truthN = sideNums(c.excerpt);
  const has = (list, n) => list.some((x) => squash(x) === squash(n));
  const wrongN = saidN.filter((n) => !has(truthN, n) && truthN.some((x) => unitOf(x) === unitOf(n)));
  const rightN = truthN.filter((n) => !has(saidN, n) && wrongN.some((x) => unitOf(x) === unitOf(n)));
  const wrong = [o.wrongValue, ...quotedIn(f.report_title), ...wrongN, ...(c.said.match(CASE_NO) || [])];
  const right = [o.actualValue, ...rightN];
  return { wrong: wrong.filter(Boolean), right: right.filter(Boolean) };
}

// AI가 스스로 틀린 것(주장·없는 근거)을 앞에, 건넨 자료를 옮긴 것을 뒤에. 고른 대표 사례는 맨 앞.
const ORDER = { claim: 0, fabrication_bait: 1, existence_denial: 1, amended_current: 2, grounded_recall: 2, false_premise: 3, draft_propagation: 4 };

// ── 종합 판정 ─────────────────────────────────────────────────────────
// 맡긴 쪽이 첫 화면에서 알고 싶은 것은 "이 AI를 믿고 써도 되나"다. 그래서 판정을 하나 내린다.
// 기준은 보고서에 그대로 싣는다 — 원문으로 확인한 오류가 들어 있던 답변의 비율.
//   위험 30% 이상 · 주의 10% 이상 · 양호 10% 미만. 치명 오류(없는 법·판례·조문을 지어냄)가
//   하나라도 있으면 양호로 두지 않는다.
export const VERDICTS = {
  risk: { label: "위험", tone: "risk", line: "법령·판례에 관한 답변에 틀린 내용이 자주 섞여 있습니다. 검증 없이 고객 안내에 쓰면 위험합니다." },
  caution: { label: "주의", tone: "caution", line: "대체로 맞게 답하지만 틀린 내용이 일부 섞여 있습니다. 중요한 안내는 원문 확인을 거쳐야 합니다." },
  good: { label: "양호", tone: "good", line: "확인한 범위에서 원문과 다른 내용이 거의 없었습니다." },
};
export const VERDICT_RULE = { risk: 30, caution: 10 };

// 발견 사항 위험도 — 치명: 없는 법·판례·조문을 지어냄 / 높음: 내용·수치·처벌이 틀림 / 보통: 조문 번호·인용 위치 착오.
export const SEVERITY_LEVELS = {
  critical: { label: "치명", rank: 0, note: "존재하지 않는 법·판례·조문·제도를 사실처럼 제시" },
  high: { label: "높음", rank: 1, note: "규정 내용·수치·처벌·기한을 원문과 다르게 안내" },
  medium: { label: "보통", rank: 2, note: "내용은 대체로 맞지만 조문 번호·인용 위치가 틀림" },
};
// 검토자가 쓴 제목이 있으면 제목으로 가른다(판정 메모의 "현재 존재하지 않음" 같은 말에 끌려가지 않게).
export function severityOf(f, c) {
  const title = String(f.report_title || "");
  if (title) {
    if (/엉뚱한 (조항|호|항)|번호를 틀림|조문 번호|실제는 제\d+조/.test(title)) return "medium";
    if (/없는 (법률|법령|판례|조문|사건|제도)|존재하지 않는|있지도 않은|지어냄/.test(title)) return "critical";
    return "high";
  }
  if (c.type === "fabrication_bait" || c.type === "fake_law" || f.severity === "nonexistent" || /존재하지 않는|없는 사건번호/.test(f.truth || "")) return "critical";
  return "high";
}

// 근거 조문 — 검토자가 연 원문 주소(법제처 /법령/…/제N조)에서 읽는 것이 가장 정확하다.
function lawRef(c) {
  try {
    const m = decodeURI(String(c.link || "")).match(/\/법령\/([^/]+)\/제(\d+)조/);
    if (m) return `${m[1]} 제${m[2]}조`;
  } catch {}
  return c.where || "—";
}

export function verdictOf(results, confirmed, criticalCount) {
  const answered = Number(results.answered) || 0;
  const wrong = new Set(confirmed.map((f) => Number(f.item_id))).size;
  const rate = answered ? (wrong / answered) * 100 : 0;
  let key = rate >= VERDICT_RULE.risk ? "risk" : rate >= VERDICT_RULE.caution ? "caution" : "good";
  if (key === "good" && criticalCount > 0) key = "caution";
  return { key, ...VERDICTS[key], rate, wrong, answered };
}

const REPORT_STYLE = `
:root { --ink:#16131D; --ink2:#4B4559; --ink3:#857E93; --line:#E7E3EE; --soft:#F7F5FA; --brand:#4B2F8F;
  --risk:#C2410C; --risk-bg:#FFF1EA; --caution:#B7791F; --caution-bg:#FFF7E6; --good:#2F7D5B; --good-bg:#EAF6EF;
  --crit:#9F1239; --crit-bg:#FFE4E8; --high:#C2410C; --high-bg:#FFEDE3; --med:#946200; --med-bg:#FFF4D6; }
* { box-sizing:border-box; }
body { margin:0; background:#EEEBF3; color:var(--ink); font-family:"Noto Sans KR",-apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif; word-break:keep-all; line-height:1.65; -webkit-font-smoothing:antialiased; }
a { color:var(--brand); }
.bar { max-width:880px; margin:18px auto 0; padding:0 16px; display:flex; gap:10px; justify-content:flex-end; }
.bar button, .bar a { font:inherit; font-size:13px; padding:8px 14px; border-radius:8px; border:1px solid var(--line); background:#fff; color:var(--ink); cursor:pointer; text-decoration:none; }
.doc { max-width:880px; margin:14px auto 40px; background:#fff; border-radius:4px; box-shadow:0 12px 40px rgba(40,20,90,.10); overflow:hidden; }
.cover { background:#1B1430; color:#F3F0FA; padding:28px clamp(22px,5vw,48px) 26px; }
.cover-top { display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; font-size:11.5px; letter-spacing:.14em; font-weight:700; color:#BDB2DA; }
.cover-top .cls { color:#FFB59A; border:1px solid #FFB59A; padding:2px 8px; border-radius:3px; letter-spacing:.1em; }
.cover h1 { margin:18px 0 4px; font-size:28px; line-height:1.3; letter-spacing:-.02em; font-weight:800; }
.cover .target { margin:0; font-size:16px; color:#D9D2EE; }
.meta { display:grid; grid-template-columns:repeat(auto-fit,minmax(118px,1fr)); gap:14px 22px; margin-top:22px; padding-top:16px; border-top:1px solid rgba(255,255,255,.14); }
.meta dt { font-size:11px; color:#A79CC6; letter-spacing:.06em; } .meta dd { white-space:nowrap; margin:2px 0 0; font-size:13.5px; font-weight:600; color:#fff; font-variant-numeric:tabular-nums; }
.body { padding:8px clamp(22px,5vw,48px) 34px; }
h2 { font-size:17px; margin:34px 0 12px; letter-spacing:-.01em; display:flex; align-items:baseline; gap:10px; }
h2 .no { font-size:12px; color:var(--brand); font-weight:800; letter-spacing:.08em; }
.verdict { border-radius:12px; border:1px solid; padding:22px 24px; display:grid; grid-template-columns:auto 1fr; gap:22px; align-items:center; }
.verdict.risk { background:var(--risk-bg); border-color:#F5C3AC; } .verdict.caution { background:var(--caution-bg); border-color:#F0D8A6; } .verdict.good { background:var(--good-bg); border-color:#B9DEC9; }
.badge { text-align:center; min-width:120px; }
.badge .k { font-size:11.5px; font-weight:700; color:var(--ink3); letter-spacing:.08em; }
.badge .v { font-size:44px; font-weight:900; line-height:1.15; letter-spacing:-.03em; }
.risk .badge .v { color:var(--risk); } .caution .badge .v { color:var(--caution); } .good .badge .v { color:var(--good); }
.verdict .line { margin:0; font-size:17px; font-weight:700; line-height:1.5; letter-spacing:-.01em; }
.scale { margin-top:14px; }
.scale .track { position:relative; display:grid; grid-template-columns:10fr 20fr 70fr; height:10px; border-radius:999px; overflow:hidden; }
.scale .track i:nth-child(1) { background:#7CC4A0; } .scale .track i:nth-child(2) { background:#F1C66B; } .scale .track i:nth-child(3) { background:#EE8A5E; }
.scale .pin { position:relative; height:0; }
.scale .pin b { position:absolute; top:-17px; transform:translateX(-50%); width:4px; height:24px; background:var(--ink); border-radius:2px; box-shadow:0 0 0 2px #fff; }
.scale .ticks { display:grid; grid-template-columns:10fr 20fr 70fr; font-size:11px; color:var(--ink3); margin-top:6px; }
.scale .ticks span:nth-child(2), .scale .ticks span:nth-child(3) { border-left:1px solid var(--line); padding-left:6px; }
.kpis { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin-top:12px; }
.kpis div { border:1px solid var(--line); border-radius:10px; padding:12px 14px; }
.kpis b { display:block; font-size:24px; font-weight:800; letter-spacing:-.02em; font-variant-numeric:tabular-nums; }
.kpis span { font-size:12.5px; color:var(--ink2); }
.keys { margin:14px 0 0; padding:0; list-style:none; display:grid; gap:6px; }
.keys li { display:flex; gap:10px; align-items:baseline; font-size:14px; }
.sev { display:inline-block; flex:none; font-size:11px; font-weight:800; padding:2px 8px; border-radius:4px; letter-spacing:.04em; }
.sev.critical { background:var(--crit-bg); color:var(--crit); } .sev.high { background:var(--high-bg); color:var(--high); } .sev.medium { background:var(--med-bg); color:var(--med); }
.tbl { overflow-x:auto; }
table { width:100%; border-collapse:collapse; font-size:13px; }
th, td { text-align:left; vertical-align:top; padding:9px 10px; border-bottom:1px solid var(--line); }
thead th { font-size:11.5px; color:var(--ink3); font-weight:700; letter-spacing:.04em; background:var(--soft); }
td.id { font-weight:800; color:var(--ink2); white-space:nowrap; font-variant-numeric:tabular-nums; } td.law { color:var(--ink2); font-size:12px; white-space:nowrap; }
.find { border:1px solid var(--line); border-radius:10px; margin-top:14px; overflow:hidden; break-inside:avoid; }
.find-h { display:flex; gap:10px; align-items:center; padding:12px 16px; background:var(--soft); border-bottom:1px solid var(--line); }
.find-h .id { font-weight:800; font-size:13px; color:var(--ink2); font-variant-numeric:tabular-nums; }
.find-h h3 { margin:0; font-size:15px; line-height:1.45; letter-spacing:-.01em; }
.find-b { padding:14px 16px; }
.vs { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
.vs > div { border-radius:8px; padding:11px 13px; }
.vs .k { font-size:11.5px; font-weight:800; letter-spacing:.03em; margin-bottom:5px; }
.vs p { margin:0; font-size:13.5px; line-height:1.65; }
.vs .said { background:#FDF3EF; } .vs .said .k { color:var(--risk); }
.vs .truth { background:#EFF7F2; } .vs .truth .k { color:var(--good); }
.vs .src { margin-top:6px; font-size:12px; }
mark.bad { background:#F9CDBC; color:#7A2408; font-weight:800; padding:0 2px; border-radius:3px; text-decoration:underline wavy var(--risk); text-underline-offset:3px; }
mark.good { background:#C6EAD5; color:#14532D; font-weight:800; padding:0 2px; border-radius:3px; }
.why { margin:10px 0 0; font-size:13.5px; } .why b { margin-right:8px; font-size:12px; color:var(--ink3); }
.test { margin:8px 0 0; font-size:12.5px; color:var(--ink2); background:var(--soft); border-radius:6px; padding:8px 11px; }
.ask { margin-top:8px; font-size:12.5px; } .ask summary { cursor:pointer; color:var(--ink3); } .ask p { margin:6px 0 0; }
.small { margin-top:8px; font-size:11.5px; color:var(--ink3); }
.shots { display:flex; gap:8px; flex-wrap:wrap; margin-top:8px; } .shots img { max-width:240px; max-height:200px; border:1px solid var(--line); border-radius:4px; }
.goods { margin:0; padding-left:18px; } .goods li { font-size:13.5px; margin:5px 0; }
.note { font-size:13px; color:var(--ink2); background:var(--soft); border-radius:8px; padding:12px 14px; margin-top:10px; }
.crit th { width:150px; background:none; color:var(--ink3); font-size:12.5px; }
.next { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:10px; margin-top:6px; }
.next a { display:flex; flex-direction:column; gap:4px; border:1px solid var(--line); border-radius:10px; padding:12px 14px; text-decoration:none; color:var(--ink); }
.next a b { font-size:14px; } .next a span { font-size:12.5px; color:var(--ink2); line-height:1.6; } .next a i { font-style:normal; font-size:12.5px; font-weight:700; color:var(--brand); margin-top:auto; }
.next a.main { border:1.5px solid var(--brand); background:var(--soft); }
.docs { font-size:12.5px; color:var(--ink3); margin-top:10px; } .docs a { color:var(--ink2); }
.nums { display:grid; grid-template-columns:repeat(auto-fit,minmax(130px,1fr)); gap:1px; background:var(--line); border:1px solid var(--line); border-radius:8px; overflow:hidden; margin:8px 0 0; }
.nums div { background:#fff; padding:9px 12px; } .nums dt { font-size:11.5px; color:var(--ink3); } .nums dd { margin:2px 0 0; font-size:18px; font-weight:750; font-variant-numeric:tabular-nums; }
.muted { color:var(--ink3); font-size:12.5px; }
ul.plain { padding-left:18px; margin:6px 0; } ul.plain li { font-size:13.5px; margin:3px 0; }
.foot { margin-top:30px; padding-top:14px; border-top:1px solid var(--line); font-size:11.5px; color:var(--ink3); line-height:1.8; }
@media (max-width:640px) { .verdict { grid-template-columns:1fr; } .kpis { grid-template-columns:1fr; } .vs { grid-template-columns:1fr; } }
@media print {
  @page { size:A4; margin:12mm; }
  body { background:#fff; } .bar { display:none; } .doc { box-shadow:none; margin:0; max-width:none; }
  .cover { padding:18px 22px; } .cover h1 { font-size:21px; } .body { padding:0 22px 20px; }
  h2 { font-size:14px; margin:18px 0 8px; break-after:avoid; } .verdict { padding:14px 16px; } .badge .v { font-size:32px; } .verdict .line { font-size:14px; }
  .find { break-inside:avoid; } .vs p, td, th { font-size:11.5px; } .ask { display:none; }
}`;

function reportShell(title, body) {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" /><title>${esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" /><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;800;900&display=swap" />
<style>${REPORT_STYLE}</style></head><body>${body}</body></html>`;
}

const docNo = (audit) => `YUME-AUD-${new Date(Number(audit.created_at) || Date.now()).getFullYear()}-${String(Number(audit.id) || 0).padStart(4, "0")}`;

function findingCard(x, files, fileUrl) {
  const { f, item, c, sev, code } = x;
  const t = markTerms(f, c, item);
  const shots = files.filter((s) => Number(s.item_id) === Number(f.item_id));
  return `<article class="find" id="${esc(code)}">
  <div class="find-h"><span class="id">${esc(code)}</span><span class="sev ${sev}">${esc(SEVERITY_LEVELS[sev].label)}</span><h3>${esc(c.headline)}</h3></div>
  <div class="find-b">
    <div class="vs">
      <div class="said"><div class="k">AI 답변</div><p>“${marks(c.said, t.wrong, "bad")}”</p></div>
      <div class="truth"><div class="k">${esc(c.truthLabel)} · ${esc(lawRef(c))}</div><p>${marks(c.excerpt, t.right, "good")}</p>${c.link ? `<div class="src">${linkTo(c.link, "원문 열기 ↗")}</div>` : ""}</div>
    </div>
    ${c.why ? `<p class="why"><b>무엇이 틀렸나</b>${esc(c.why)}</p>` : ""}
    ${c.testNote ? `<p class="test">${esc(c.testNote)}</p>` : ""}
    ${shots.length && fileUrl ? `<div class="shots">${shots.map((s) => `<img src="${esc(fileUrl(s.id))}" alt="답변 캡처" />`).join("")}</div>` : ""}
    <details class="ask"><summary>보낸 질문 보기</summary><p>${esc(c.ask)}</p>${c.material ? `<p class="muted">건넨 자료: ${esc(c.material)}</p>` : ""}</details>
    <div class="small">${esc(c.label)}${item?.answered_at ? ` · 답변 받은 시각 ${esc(kDateTime(item.answered_at))}` : ""}${f.reviewed_at ? ` · 검토자 원문 확인 ${esc(kDate(f.reviewed_at))}` : ""}</div>
  </div>
</article>`;
}

function auditNumbers(results) {
  const p = results.probe;
  const c = results.claims;
  const out = [];
  if (p && p.graded > 0) {
    const safe = results.probeResults.filter((r) => r.outcome === "safe").length;
    const fails = p.byType ? Object.values(p.byType).reduce((s, t) => s + t.failed, 0) : 0;
    out.push(`<p class="muted" style="margin:14px 0 0">함정 문항 — 정답을 원문으로 먼저 정해 둔 질문</p>
<dl class="nums"><div><dt>채점한 문항</dt><dd>${p.graded}</dd></div><div><dt>틀림</dt><dd>${fails}</dd></div><div><dt>정확</dt><dd>${safe}</dd></div><div><dt>오류 비율</dt><dd>${pct(p.index)}</dd></div></dl>
<p class="muted">오류 비율은 틀림 1, 일부 다름 0.5로 센 값입니다. 문항 ${p.graded}개 기준 95% 신뢰구간 ${pct(p.interval.low)}~${pct(p.interval.high)}.</p>`);
  }
  if (c.total > 0) {
    out.push(`<p class="muted" style="margin:14px 0 0">답변 속 사실 주장 대조</p>
<dl class="nums"><div><dt>검사한 주장</dt><dd>${c.total}</dd></div><div><dt>원문과 일치</dt><dd>${c.match}</dd></div><div><dt>원문과 다름</dt><dd>${c.mismatch}</dd></div><div><dt>확인 불가</dt><dd>${c.unverifiable}</dd></div></dl>`);
  }
  return out.join("");
}

// 보고서를 받은 담당자가 메일 회신 없이 다음 단계로 가게 한다. 데스크에서 이 감사로 낸 견적이 있으면 맨 앞.
// 금액은 싣지 않는다 — 금액은 견적서에만 있다(보고서는 결재 첨부로 돌고, 금액이 섞이면 영업 문서가 된다).
function nextSteps(detail, confirmed) {
  const { audit } = detail;
  const www = (process.env.PUBLIC_BASE_URL || "https://www.yume-reamer.com").replace(/\/+$/, "");
  const biz = (process.env.BUSINESS_URL || "https://business.yume-reamer.com").replace(/\/+$/, "");
  const abs = (u) => (/^https?:/.test(u) ? u : `${www}${u}`);
  const open = (detail.quotes || []).find((q) => q.status === "requested" || (q.status === "issued" && !q.expired));
  const cards = [];
  if (open) {
    cards.push({ main: true, href: abs(open.url), t: open.status === "requested" ? `계약 신청 접수됨 — ${open.number}` : `준비된 견적서 — ${open.number}`, d: open.status === "requested" ? "진행 상태와 입금·세금계산서 안내를 견적서 화면에서 확인하실 수 있습니다." : `${open.productLabel}. 인쇄·PDF 저장 후 결재가 끝나면 그 화면에서 바로 계약을 신청하실 수 있습니다.`, a: "견적서 열기 →" });
  }
  const types = [...new Set(confirmed.map((f) => TYPE_LABEL[parseJson(detail.items.find((i) => Number(i.id) === Number(f.item_id))?.probe_json)?.type]).filter(Boolean))].slice(0, 3);
  if (confirmed.length) {
    cards.push({ href: `${biz}/?quote=growth#pricing`, t: "답변이 나가기 전에 막기", d: `${types.length ? `이번에 확인된 유형(${types.join(" · ")})은` : "이번에 확인된 오류는"} 답변 생성과 고객 노출 사이에 유메 검증 API를 두면 원문과 대조해 걸러 냅니다.`, a: "API 견적서 받기 →" });
    cards.push({ href: `${biz}/?inquiry=audit_regular`, t: "고친 뒤 다시 재기", d: "같은 질문으로 다시 감사해 개선을 숫자로 확인합니다. 결과가 깨끗해지면 공개 감사 기록과 배지를 받으실 수 있습니다.", a: "재감사 문의 →" });
  } else {
    cards.push({ href: `${biz}/?inquiry=audit_regular`, t: "깨끗한 결과를 기록으로", d: "동의하시면 공개 감사 기록 페이지와 홈페이지 배지(90일 유효)를 드립니다. 분기마다 재감사해 기록을 이어 갑니다.", a: "정기 감사 문의 →" });
    cards.push({ href: `${biz}/?quote=growth#pricing`, t: "매 답변을 상시 확인", d: "표본 감사 사이의 답변은 검증 API로 상시 확인할 수 있습니다. 개정·신설 조문이 나와도 현행 원문과 대조합니다.", a: "API 견적서 받기 →" });
  }
  cards.push({ href: `mailto:${COMPANY.email}?subject=${encodeURIComponent(`[${docNo(audit)}] 감사 결과 설명 요청`)}`, t: "결과 설명 (30분)", d: "발견 사항마다 원문을 같이 열어 보며 설명드리고, 개선 우선순위를 함께 정합니다. 비용은 없습니다.", a: "메일로 시간 정하기 →" });
  return `<div class="next">${cards.map((c) => `<a${c.main ? ' class="main"' : ""} href="${esc(c.href)}" target="_blank" rel="noopener"><b>${esc(c.t)}</b><span>${esc(c.d)}</span><i>${esc(c.a)}</i></a>`).join("")}</div>
  <p class="docs">계약 서류: <a href="${www}/b2b/terms">기업 서비스 이용 조건</a> · <a href="${www}/b2b/dpa">데이터 처리 부속서</a> · <a href="${www}/b2b/security">보안·데이터 처리 설명서</a> — 전자세금계산서 발급, 귀사 계약서 양식으로도 진행합니다.</p>`;
}

/** 비공개 감사 보고서. mode: 'admin'(관리자 미리보기) | 'shared'(상대 회사가 여는 링크). */
export function renderAuditReport(detail, { fileUrl = null, mode = "shared" } = {}) {
  const { audit, items, findings, files, results } = detail;
  const service = audit.service_name || audit.company;
  const method = methodOf(audit);
  const byItem = new Map(items.map((i) => [Number(i.id), i]));
  const confirmed = findings.filter((f) => f.polarity === "issue" && f.review === "confirmed");
  // 발견 사항: 위험도 순 → 대표 사례 → AI가 스스로 틀린 것 → 건넨 자료를 옮긴 것.
  const list = confirmed
    .map((f) => {
      const item = byItem.get(Number(f.item_id));
      const c = caseFacts(f, item);
      return { f, item, c, sev: severityOf(f, c) };
    })
    .sort((x, y) => SEVERITY_LEVELS[x.sev].rank - SEVERITY_LEVELS[y.sev].rank || Number(y.f.featured) - Number(x.f.featured) || (ORDER[x.c.type] ?? 2) - (ORDER[y.c.type] ?? 2) || x.f.id - y.f.id)
    .map((x, i) => ({ ...x, code: `F-${String(i + 1).padStart(2, "0")}` }));
  const shown = list.slice(0, 30);
  const count = (k) => list.filter((x) => x.sev === k).length;
  const v = verdictOf(results, confirmed, count("critical"));
  const p = results.probe;
  const probeFails = p && p.byType ? Object.values(p.byType).reduce((s, t) => s + t.failed, 0) : 0;
  const goods = findings.filter((f) => f.polarity === "good" && Number(f.featured)).slice(0, 3);
  const period = results.period ? `${kDate(results.period.from)}${kDate(results.period.to) !== kDate(results.period.from) ? ` ~ ${kDate(results.period.to)}` : ""}` : "—";
  const issued = kDate(Math.max(0, ...confirmed.map((f) => Number(f.reviewed_at) || 0)) || Date.now());
  const pinAt = Math.min(99, Math.max(1, v.rate));
  let section = 0;
  const no = () => String(++section).padStart(2, "0");

  const body = `
<div class="bar">${mode === "admin" ? `<a href="/admin/audits#${Number(audit.id)}">← 감사 데스크</a>` : ""}<button type="button" onclick="window.print()">PDF로 저장·인쇄</button></div>
<div class="doc">
  <header class="cover">
    <div class="cover-top"><span>YUME · AI HALLUCINATION AUDIT</span><span class="cls">비공개 · ${esc(audit.company)} 한정</span></div>
    <h1>AI 할루시네이션 감사 보고서</h1>
    <p class="target">${esc(service)}</p>
    <dl class="meta">
      <div><dt>문서 번호</dt><dd>${esc(docNo(audit))}</dd></div>
      <div><dt>발행일</dt><dd>${esc(issued)}</dd></div>
      <div><dt>감사 기간</dt><dd>${esc(period)}</dd></div>
      <div><dt>표본</dt><dd>질문 ${results.answered}개</dd></div>
      <div><dt>방법</dt><dd>${esc(METHOD_VERSION)}</dd></div>
    </dl>
  </header>
  <div class="body">

  <h2><span class="no">${no()}</span>종합 판정</h2>
  <section class="verdict ${v.tone}">
    <div class="badge"><div class="k">판정</div><div class="v">${esc(v.label)}</div></div>
    <div>
      <p class="line">${esc(!confirmed.length && results.reviewComplete && results.answered ? `확인한 답변 ${results.answered}개에서 법령·판례 원문과 다른 내용이 없었습니다.` : v.line)}</p>
      <div class="scale" aria-label="오류가 들어 있던 답변 비율 ${Math.round(v.rate)}%">
        <div class="track"><i></i><i></i><i></i></div>
        <div class="pin"><b style="left:${pinAt.toFixed(1)}%"></b></div>
        <div class="ticks"><span>양호</span><span>주의 10%~</span><span>위험 30%~</span></div>
      </div>
    </div>
  </section>
  <div class="kpis">
    <div><b>${v.wrong} / ${v.answered}</b><span>틀린 내용이 들어 있던 답변 (${Math.round(v.rate)}%)</span></div>
    <div><b>${confirmed.length}건</b><span>원문과 다른 내용 — 치명 ${count("critical")} · 높음 ${count("high")} · 보통 ${count("medium")}</span></div>
    ${p && p.graded ? `<div><b>${probeFails} / ${p.graded}</b><span>함정 문항에서 틀림</span></div>` : `<div><b>${results.claims.match} / ${results.claims.total}</b><span>원문과 일치한 사실 주장</span></div>`}
  </div>
  ${list.length ? `<ul class="keys">${list.slice(0, 3).map((x) => `<li><span class="sev ${x.sev}">${esc(SEVERITY_LEVELS[x.sev].label)}</span><span>${esc(x.c.headline)} <a href="#${esc(x.code)}" class="muted">${esc(x.code)}</a></span></li>`).join("")}</ul>` : ""}

  ${list.length ? `<h2><span class="no">${no()}</span>발견 사항 요약</h2>
  <div class="tbl"><table><thead><tr><th>번호</th><th>위험도</th><th>내용</th><th>근거</th></tr></thead><tbody>${list
    .map((x) => `<tr><td class="id"><a href="#${esc(x.code)}">${esc(x.code)}</a></td><td><span class="sev ${x.sev}">${esc(SEVERITY_LEVELS[x.sev].label)}</span></td><td>${esc(x.c.headline)}</td><td class="law">${esc(lawRef(x.c))}</td></tr>`)
    .join("")}</tbody></table></div>
  <h2><span class="no">${no()}</span>발견 사항 상세</h2>
  ${shown.map((x) => findingCard(x, files, fileUrl)).join("")}
  ${list.length > shown.length ? `<p class="muted">외 ${list.length - shown.length}건 — 요청하시면 원문 링크와 함께 드립니다.</p>` : ""}` : ""}

  <h2><span class="no">${no()}</span>정확하게 답한 부분</h2>
  ${goods.length ? `<ul class="goods">${goods.map((g) => (g.report_title ? `<li><b>${esc(oneLine(g.report_title))}</b> — ${esc(firstSentence(g.yume_reason || g.ai_quote))}</li>` : `<li><b>${esc(clip(byItem.get(Number(g.item_id))?.question || g.claim, 70))}</b> — ${esc(firstSentence(g.yume_reason || g.ai_quote))}</li>`)).join("")}</ul>` : ""}
  ${audit.highlights ? `<div class="note">${esc(audit.highlights).replace(/\n/g, "<br />")}</div>` : ""}
  ${!goods.length && !audit.highlights ? `<p class="muted">—</p>` : ""}

  <h2><span class="no">${no()}</span>다음 단계</h2>
  ${nextSteps(detail, confirmed)}

  <h2><span class="no">${no()}</span>판정 기준과 방법</h2>
  <table class="crit">
    <tr><th>판정 기준</th><td>원문으로 확인한 오류가 들어 있던 답변의 비율 — <b>위험</b> ${VERDICT_RULE.risk}% 이상 · <b>주의</b> ${VERDICT_RULE.caution}% 이상 · <b>양호</b> ${VERDICT_RULE.caution}% 미만. 치명 오류가 하나라도 있으면 양호로 두지 않습니다.</td></tr>
    <tr><th>위험도</th><td>${Object.values(SEVERITY_LEVELS).map((s) => `<b>${esc(s.label)}</b> ${esc(s.note)}`).join("<br />")}</td></tr>
    <tr><th>대상</th><td>${esc(service)}${audit.service_url ? ` · ${linkTo(audit.service_url, audit.service_url)}` : ""} <span class="muted">(${esc(method.basis)})</span></td></tr>
    <tr><th>방법</th><td>${esc(method.report)}. 받은 답변을 공식 원문(법제처 국가법령정보·판례 데이터베이스 등)과 대조했고, 유메가 지목한 오류는 검토자가 원문을 직접 열어 다시 확인한 것만 남겼습니다.</td></tr>
  </table>
  ${auditNumbers(results)}
  <ul class="plain" style="margin-top:12px">
    <li>표본 감사입니다(질문 ${results.answered}개). 드물게 생기는 오류는 잡히지 않았을 수 있습니다.</li>
    <li>위 기간에 받은 답변의 결과입니다. 같은 질문에도 시점·모델 버전에 따라 답이 달라질 수 있습니다.</li>
    <li>공개 원문과 대조한 감사 결과이며 보증이 아닙니다. 발견 사항마다 원문 링크를 붙였습니다.</li>
  </ul>

  <h2><span class="no">${no()}</span>비공개 고지</h2>
  <p style="font-size:14px;margin:4px 0">이 보고서는 ${esc(audit.company)}에만 전달되었으며 외부에 공개되지 않았습니다. 유메는 이 결과를 공개할 계획이 없습니다.</p>

  <div class="foot">
    감사: 유메(YUME) · ${esc(COMPANY.name)} · 대표 ${esc(COMPANY.ceo)} · ${esc(COMPANY.email)}<br />
    유메는 감사 과정(주장 추출·채점 보조)에 생성형 AI를 사용합니다. 판정의 근거는 발견 사항마다 붙인 공식 원문입니다. 문서 ${esc(docNo(audit))} · 방법 ${esc(METHOD_VERSION)}.
  </div>
  </div>
</div>`;
  return reportShell(`AI 할루시네이션 감사 보고서 — ${service} · 유메`, body);
}

// ── 공개 감사 기록 ────────────────────────────────────────────────────
export function renderAuditSummary(summary) {
  if (!summary) {
    return shell("감사 기록 없음 · 유메", `<main class="sheet"><h1>감사 기록을 찾을 수 없습니다</h1><p class="sub">주소를 확인해 주세요. 공개 동의가 철회되었거나 유메가 발행하지 않은 기록일 수 있습니다.</p></main>`, { robots: "noindex" });
  }
  const { audit, results, expired, validUntil } = summary;
  const service = audit.service_name || audit.company;
  const p = results.probe;
  const c = results.claims;
  const status = expired
    ? `<span style="display:inline-block;padding:5px 12px;border-radius:999px;background:#9A8FB0;color:#fff;font-weight:800;font-size:13px">재검사 필요</span>`
    : `<span style="display:inline-block;padding:5px 12px;border-radius:999px;background:#2F7D5B;color:#fff;font-weight:800;font-size:13px">✓ 검사 기록 유효</span>`;
  const embed = `<a href="https://www.yume-reamer.com/a/${esc(audit.public_id)}"><img src="https://www.yume-reamer.com/a/${esc(audit.public_id)}/badge.svg" alt="YUME 할루시네이션 감사 기록" height="30" /></a>`;
  const body = `<main class="sheet">
  <div class="muted" style="font-weight:800;letter-spacing:.14em">YUME 감사 기록</div>
  <h1>${esc(service)}</h1>
  <p class="sub">${esc(audit.company)} · ${esc(CATEGORIES[audit.category] || "")} · ${esc(audit.domain)}</p>
  <div style="margin-top:12px">${status}</div>
  <table style="margin-top:16px">
    <tr><th>감사 기간</th><td>${results.period ? `${esc(kDate(results.period.from))} ~ ${esc(kDate(results.period.to))}` : "—"}</td></tr>
    <tr><th>질문 수</th><td>${results.answered}개</td></tr>
    ${p && p.graded ? `<tr><th>기준 문항 결과</th><td>채점 ${p.graded}개 중 할루시네이션율 <b>${pct(p.index)}</b> <span class="muted">(95% 신뢰구간 ${pct(p.interval.low)}~${pct(p.interval.high)})</span></td></tr>` : ""}
    ${c.total ? `<tr><th>주장 대조</th><td>검사한 주장 ${c.total}개 — 원문과 일치 ${c.match} · 불일치 ${c.mismatch} · 확인 불가 ${c.unverifiable}</td></tr>` : ""}
    <tr><th>오류 확정</th><td>유메가 지목한 항목을 검토자가 공식 원문으로 직접 재확인했습니다.</td></tr>
    <tr><th>방법</th><td><a href="/hallucination-index#method">${esc(METHOD_VERSION)}</a> — YUME 할루시네이션 지수와 같은 방법</td></tr>
    <tr><th>유효기간</th><td>${esc(kDate(validUntil))}까지 <span class="muted">(마지막 검사일부터 ${SUMMARY_VALID_DAYS}일)</span></td></tr>
    <tr><th>공개 동의</th><td>${esc(kDate(audit.consent_at))} · ${esc(audit.company)}</td></tr>
  </table>
  <div class="note">이 기록은 위 기간에 표본으로 검사한 결과입니다. 서비스의 품질이나 앞으로의 답변을 보증하지 않습니다. AI의 답은 시점과 모델에 따라 달라질 수 있어, 유메는 ${SUMMARY_VALID_DAYS}일마다 다시 검사할 것을 권합니다.</div>
  <h2>홈페이지에 붙이기</h2>
  <p class="sub">아래 코드를 붙이면 이 기록으로 연결되는 배지가 보입니다. 기간이 지나면 배지가 '재검사 필요'로 바뀝니다.</p>
  <pre style="background:#211A32;color:#E8E1FA;padding:12px 14px;border-radius:8px;overflow-x:auto;font-size:12px">${esc(embed)}</pre>
  <p><img src="/a/${esc(audit.public_id)}/badge.svg" alt="YUME 할루시네이션 감사 기록 배지" height="30" /></p>
  <div class="foot">유메(YUME)는 AI가 쓴 글의 근거를 공식 원문과 대조하는 AI 할루시네이션 검사 서비스입니다 · <a href="/hallucination-index">YUME 할루시네이션 지수</a> · <a href="/business">AI 감사 문의</a></div>
</main>`;
  return shell(`${service} — YUME 감사 기록`, body, { robots: "index, follow" });
}

const escXml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));

// 한글은 대략 글자당 12.5px, 숫자·기호는 7.5px로 폭을 잡는다.
const textWidth = (s) => [...String(s)].reduce((w, ch) => w + (/[가-힣]/.test(ch) ? 12.5 : 7.4), 0);

export function auditBadgeSvg(summary) {
  const valid = summary && !summary.expired;
  const to = summary?.results?.period?.to;
  const ym = to ? new Date(Number(to) + 9 * 3600 * 1000).toISOString().slice(0, 7).replace("-", ".") : "";
  const label = !summary ? "기록 없음" : valid ? `검사 완료 ${ym}` : "재검사 필요";
  const color = !summary ? "#9A8FB0" : valid ? "#2F7D5B" : "#9A8FB0";
  const left = 98;
  const right = Math.ceil(textWidth(label) + 22);
  const w = left + right;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="30" viewBox="0 0 ${w} 30" role="img" aria-label="YUME 감사: ${escXml(label)}">
<title>YUME 할루시네이션 감사: ${escXml(label)}</title>
<rect width="${w}" height="30" rx="15" fill="#1F1B2E"/>
<rect x="${left}" width="${right}" height="30" rx="15" fill="${color}"/>
<rect x="${left}" width="15" height="30" fill="${color}"/>
<circle cx="15" cy="15" r="9" fill="#A88BEA"/>
<path d="M10.5 15.2l3 3 6-6.6" stroke="#1F1B2E" stroke-width="2.3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
<text x="30" y="19.5" fill="#fff" font-family="-apple-system,'Segoe UI','Noto Sans KR','Malgun Gothic',sans-serif" font-size="12.5" font-weight="700">YUME 감사</text>
<text x="${left + right / 2}" y="19.5" fill="#fff" text-anchor="middle" font-family="-apple-system,'Segoe UI','Noto Sans KR','Malgun Gothic',sans-serif" font-size="12.5" font-weight="700">${escXml(label)}</text>
</svg>`;
}
