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
@media print {
  @page { size:A4; margin:14mm 14mm 16mm; }
  body { background:#fff; } .bar { display:none; } .sheet { box-shadow:none; margin:0; padding:0; max-width:none; font-size:12px; }
  h1 { font-size:19px; margin:8px 0 2px; } h2 { font-size:13px; margin:12px 0 5px; padding-top:8px; break-after:avoid; }
  th, td { padding:3px 6px; font-size:11.5px; } th { width:110px; }
  .nums div { padding:5px 8px; } .nums dd { font-size:15px; } .nums dt { font-size:10.5px; }
  .case { padding:7px 10px; margin-top:6px; break-inside:avoid; } .case .row { padding:2px 0; font-size:11.5px; grid-template-columns:80px minmax(0,1fr); }
  .shots img { max-height:110px; max-width:180px; } li { font-size:11.5px; margin:1px 0; } .note { padding:7px 10px; font-size:11.5px; }
  .muted { font-size:11px; } .foot { margin-top:12px; padding-top:6px; font-size:10.5px; }
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
};
const TEST_NOTE = {
  draft_propagation: "이렇게 시험했습니다 — 수치 하나를 일부러 틀리게 바꾼 법령 자료를 건네고 고객 안내문을 쓰게 했습니다. 원문을 확인했다면 바로잡았어야 하는 수치입니다.",
  false_premise: "이렇게 시험했습니다 — 질문 속에 틀린 수치를 섞어 물었습니다. 바로잡지 않고 그대로 설명했습니다.",
  fabrication_bait: "이렇게 시험했습니다 — 실제로 없는 조문·판례를 물었습니다.",
  existence_denial: "이렇게 시험했습니다 — 실제로 있는 규정을 '없다'고 하는 고객 말을 전했습니다.",
  amended_current: "이렇게 시험했습니다 — 최근 개정된 조문의 현행 기준을 물었습니다.",
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
  const where = o.lawName ? `${o.lawName}${o.article ? ` 제${o.article}조` : ""}` : String(f.source_label || "").replace(/^법제처 국가법령정보센터 · /, "");
  let headline;
  if (o.wrongValue && o.actualValue) headline = `${where} — AI는 “${o.wrongValue}”, 원문은 “${o.actualValue}”`;
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

function caseCard(f, item, files, fileUrl, n) {
  const c = caseFacts(f, item);
  const shots = files.filter((x) => Number(x.item_id) === Number(f.item_id));
  return `<article class="case">
  <div class="case-h"><span class="tag">${esc(c.label)}</span><span class="muted">사례 ${n}</span></div>
  <h3 class="case-t">${esc(c.headline)}</h3>
  <div class="vs">
    <div class="said"><div class="k">AI 답변</div><p>“${esc(c.said)}”</p></div>
    <div class="truth"><div class="k">${esc(c.truthLabel)}${c.where ? ` · ${esc(c.where)}` : ""}</div><p>${esc(c.excerpt)}</p>${c.link ? `<div class="src">${linkTo(c.link, "원문 열기 ↗")}</div>` : ""}</div>
  </div>
  ${c.why ? `<p class="why"><b>왜 문제인가</b>${esc(c.why)}</p>` : ""}
  ${c.testNote ? `<p class="test">${esc(c.testNote)}</p>` : ""}
  ${shots.length && fileUrl ? `<div class="shots">${shots.map((s) => `<img src="${esc(fileUrl(s.id))}" alt="답변 캡처" />`).join("")}</div>` : ""}
  <details class="ask"><summary>보낸 질문 보기</summary><p>${esc(c.ask)}</p>${c.material ? `<p class="muted">건넨 자료: ${esc(c.material)}</p>` : ""}</details>
  <div class="meta">${item?.answered_at ? `답변 받은 시각 ${esc(kDateTime(item.answered_at))}` : ""}${f.reviewed_at ? ` · 검토자 원문 확인 ${esc(kDate(f.reviewed_at))}` : ""}</div>
</article>`;
}

// 한눈에 보기 — 숫자 셋과 유형별 건수, 그리고 한 문단.
function glance(results, confirmed, byItem) {
  const p = results.probe;
  const c = results.claims;
  const n = confirmed.length;
  const groups = new Map();
  for (const f of confirmed) {
    const k = caseFacts(f, byItem.get(Number(f.item_id))).label;
    groups.set(k, (groups.get(k) || 0) + 1);
  }
  const fails = p && p.byType ? Object.values(p.byType).reduce((s, t) => s + t.failed, 0) : 0;
  const tiles = [
    [`${n}건`, "원문과 다른 내용", "검토자가 원문을 직접 열어 확인한 것만"],
    p && p.graded ? [`${fails} / ${p.graded}`, "함정 문항에서 틀림", "정답을 원문으로 먼저 정해 둔 문항"] : null,
    c.total ? [`${c.match} / ${c.total}`, "원문과 일치한 주장", "답변 속 사실 주장을 하나씩 대조"] : null,
  ].filter(Boolean);
  const lead = `질문 ${results.answered}개에 받은 답변을 법령·판례 원문과 대조해 <b>원문과 다른 내용 ${n}건</b>을 확인했습니다.${
    c.total ? ` 답변 속 사실 주장 ${c.total}개 중 ${c.match}개는 원문과 일치했습니다.` : ""
  }`;
  return `<p class="lead">${lead}</p>
  <div class="tiles">${tiles.map(([v, k, d]) => `<div><b>${esc(v)}</b><span>${esc(k)}</span><small>${esc(d)}</small></div>`).join("")}</div>
  ${groups.size ? `<div class="types"><span class="muted">어떤 식으로 틀렸나</span>${[...groups].sort((a, b) => b[1] - a[1]).map(([k, v]) => `<span class="tag">${esc(k)} <b>${v}</b></span>`).join("")}</div>` : ""}`;
}

// 숫자 자세히 — 기준 문항과 주장 대조를 나눠 적는다(뒤쪽 '검사 방법'에 둔다).
function resultNumbers(results) {
  const p = results.probe;
  const c = results.claims;
  const parts = [];
  if (p && p.graded > 0) {
    const fails = p.byType ? Object.values(p.byType).reduce((s, t) => s + t.hallucinated, 0) : 0;
    const partial = results.probeResults.filter((r) => r.outcome === "partial").length;
    const safe = results.probeResults.filter((r) => r.outcome === "safe").length;
    parts.push(`<p class="muted" style="margin:10px 0 0">함정 문항(정답을 원문으로 먼저 정해 둔 질문)</p>
<dl class="nums"><div><dt>채점한 문항</dt><dd>${p.graded}</dd></div><div><dt>틀린 내용을 사실처럼</dt><dd>${fails}</dd></div><div><dt>일부 다름</dt><dd>${partial}</dd></div><div><dt>정확</dt><dd>${safe}</dd></div><div><dt>오류 비율</dt><dd>${pct(p.index)}</dd></div></dl>
<p class="muted">오류 비율은 틀림 1, 일부 다름 0.5로 센 값입니다. 문항이 ${p.graded}개라 95% 신뢰구간이 ${pct(p.interval.low)}~${pct(p.interval.high)}로 넓습니다.</p>`);
  }
  if (c.total > 0) {
    parts.push(`<p class="muted" style="margin:10px 0 0">답변 속 사실 주장 대조</p>
<dl class="nums"><div><dt>검사한 주장</dt><dd>${c.total}</dd></div><div><dt>원문과 일치</dt><dd>${c.match}</dd></div><div><dt>원문과 다름</dt><dd>${c.mismatch}</dd></div><div><dt>원문 확인 불가</dt><dd>${c.unverifiable}</dd></div></dl>`);
  }
  return parts.join("");
}

/** 비공개 감사 보고서. mode: 'admin'(관리자 미리보기) | 'shared'(상대 회사가 여는 링크). */
export function renderAuditReport(detail, { fileUrl = null, mode = "shared" } = {}) {
  const { audit, items, findings, files, results } = detail;
  const service = audit.service_name || audit.company;
  const method = methodOf(audit);
  const byItem = new Map(items.map((i) => [Number(i.id), i]));
  const confirmed = findings.filter((f) => f.polarity === "issue" && f.review === "confirmed");
  const featured = confirmed.filter((f) => Number(f.featured)).slice(0, 3);
  // 1~2쪽 — 대표 사례 3건, 그 밖의 오류 8건, 잘된 점 3건까지만 싣고 나머지는 숫자로 말한다.
  const othersAll = confirmed.filter((f) => !Number(f.featured));
  const others = othersAll.slice(0, 8);
  const goods = findings.filter((f) => f.polarity === "good" && Number(f.featured)).slice(0, 3);
  const period = results.period ? `${kDateTime(results.period.from)} ~ ${kDateTime(results.period.to)}` : "—";
  const body = `
<div class="bar">${mode === "admin" ? `<a href="/admin/audits#${Number(audit.id)}">← 감사 데스크</a>` : ""}<button type="button" onclick="window.print()">PDF로 저장·인쇄</button></div>
<main class="sheet">
  <span class="conf">비공개</span> <span class="muted">${esc(audit.company)} 귀중</span>
  <h1>${esc(service)} 답변 검사 결과</h1>
  <p class="sub">AI 답변을 법령·판례 원문과 대조했습니다 · 유메(YUME)</p>

  <h2>1. 한눈에 보기</h2>
  ${glance(results, confirmed, byItem)}

  <h2>2. 대표 사례</h2>
  ${featured.length ? featured.map((f, i) => caseCard(f, byItem.get(Number(f.item_id)), files, fileUrl, i + 1)).join("") : `<p class="muted">대표 사례를 아직 고르지 않았습니다.</p>`}

  ${others.length ? `<h2>3. 그 밖에 확인한 오류</h2>
  <div class="tbl"><table class="others"><thead><tr><th>유형</th><th>AI 답변</th><th>원문 기준</th></tr></thead><tbody>${others
    .map((f) => {
      const c = caseFacts(f, byItem.get(Number(f.item_id)));
      return `<tr><td><span class="tag">${esc(c.label)}</span></td><td>“${esc(clip(c.said, 110))}”</td><td>${esc(clip(c.excerpt, 130))}${c.link ? ` ${linkTo(c.link, "원문 ↗")}` : ""}</td></tr>`;
    })
    .join("")}</tbody></table></div>${othersAll.length > others.length ? `<p class="muted">외 ${othersAll.length - others.length}건 — 요청하시면 원문 링크와 함께 드립니다.</p>` : ""}` : ""}

  <h2>${others.length ? 4 : 3}. 잘된 점</h2>
  ${goods.length ? `<ul>${goods.map((g) => `<li><b>${esc(clip(byItem.get(Number(g.item_id))?.question || g.claim, 70))}</b> — ${esc(firstSentence(g.yume_reason || g.ai_quote))}</li>`).join("")}</ul>` : ""}
  ${audit.highlights ? `<div class="note">${esc(audit.highlights).replace(/\n/g, "<br />")}</div>` : ""}
  ${!goods.length && !audit.highlights ? `<p class="muted">—</p>` : ""}

  <h2>${others.length ? 5 : 4}. 검사 방법과 숫자</h2>
  <table>
    <tr><th>대상</th><td>${esc(service)}${audit.service_url ? ` · ${linkTo(audit.service_url, audit.service_url)}` : ""}<div class="muted">${esc(method.basis)}</div></td></tr>
    <tr><th>검사 일시</th><td>${esc(period)}</td></tr>
    <tr><th>질문 수</th><td>${results.answered}개</td></tr>
    <tr><th>방법</th><td>${esc(method.report)}. 받은 답변을 공식 원문(법제처 국가법령정보·판례 데이터베이스 등)과 대조했고, 유메가 지목한 오류는 검토자가 원문을 직접 열어 다시 확인한 것만 남겼습니다.</td></tr>
  </table>
  ${resultNumbers(results)}

  <h2>${others.length ? 6 : 5}. 한계</h2>
  <ul>
    <li>표본이 작습니다(질문 ${results.answered}개). 드물게 생기는 오류는 잡히지 않았을 수 있습니다.</li>
    <li>위 일시에 받은 답변의 결과입니다. 같은 질문에도 시점·모델 버전에 따라 답이 달라질 수 있습니다.</li>
    <li>공개 원문과 대조한 검사 결과이며 보증이 아닙니다. 사례마다 원문 링크를 붙였으니 직접 확인해 주세요.</li>
  </ul>

  <h2>${others.length ? 7 : 6}. 비공개 고지</h2>
  <p style="font-size:14px;margin:4px 0">이 보고서는 ${esc(audit.company)}에만 전달되었으며 외부에 공개되지 않았습니다. 유메는 이 결과를 공개할 계획이 없습니다.</p>

  <div class="foot">
    검사: 유메(YUME) · ${esc(COMPANY.name)} · 대표 ${esc(COMPANY.ceo)} · ${esc(COMPANY.email)}<br />
    유메는 검사 과정(주장 추출·채점 보조)에 생성형 AI를 사용합니다. 판정의 근거는 사례마다 붙인 공식 원문입니다. 방법 ${esc(METHOD_VERSION)}.
  </div>
</main>`;
  return shell(`${service} — 비공개 검사 결과 · 유메`, body);
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
