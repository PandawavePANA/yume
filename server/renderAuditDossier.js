// 감사 데스크의 바깥 문서 — 비공개 감사 보고서(/audit/p/:token), 공개 감사 기록(/a/:id), 감사 배지.
//
// 보고서는 상대 회사 담당자가 5분 안에 핵심을 보도록 1~2쪽에 맞춘다(기획안 부록 B).
// 결과 요약에는 숫자만 쓴다. "심각하다", "나쁘다" 같은 평가는 쓰지 않는다 — 공정하게 쓰는 것이
// 이 보고서의 신뢰이고, 잘된 점을 같은 무게로 적는 것도 그 때문이다.
// 공개 감사 기록은 회사가 공개에 동의했을 때만 열린다. 배지는 그 기록으로 가는 문이다.
import { esc } from "./renderPages.js";
import { CATEGORIES, SUMMARY_VALID_DAYS } from "./auditDesk.js";
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
@media print {
  @page { size:A4; margin:14mm 14mm 16mm; }
  body { background:#fff; } .bar { display:none; } .sheet { box-shadow:none; margin:0; padding:0; max-width:none; font-size:12px; }
  h1 { font-size:19px; margin:8px 0 2px; } h2 { font-size:13px; margin:12px 0 5px; padding-top:8px; break-after:avoid; }
  th, td { padding:3px 6px; font-size:11.5px; } th { width:110px; }
  .nums div { padding:5px 8px; } .nums dd { font-size:15px; } .nums dt { font-size:10.5px; }
  .case { padding:7px 10px; margin-top:6px; break-inside:avoid; } .case .row { padding:2px 0; font-size:11.5px; grid-template-columns:80px minmax(0,1fr); }
  .shots img { max-height:110px; max-width:180px; } li { font-size:11.5px; margin:1px 0; } .note { padding:7px 10px; font-size:11.5px; }
  .muted { font-size:11px; } .foot { margin-top:12px; padding-top:6px; font-size:10.5px; }
}`;

function shell(title, body, { robots = "noindex, nofollow" } = {}) {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="${robots}" /><title>${esc(title)}</title><style>${BASE_STYLE}</style></head><body>${body}</body></html>`;
}

// 결과 요약 — 숫자만. 기준 문항(정답 확정)과 실제 사용자 질문(주장 대조)을 나눠 적는다.
function resultNumbers(results) {
  const p = results.probe;
  const c = results.claims;
  const parts = [];
  if (p && p.graded > 0) {
    const fails = (p.byType ? Object.values(p.byType).reduce((s, t) => s + t.hallucinated, 0) : 0);
    const partial = results.probeResults.filter((r) => r.outcome === "partial").length;
    const safe = results.probeResults.filter((r) => r.outcome === "safe").length;
    parts.push(`<h3 style="font-size:13.5px;margin:12px 0 0">기준 문항 — 정답을 공식 원문으로 먼저 확정한 질문</h3>
<dl class="nums"><div><dt>채점한 문항</dt><dd>${p.graded}</dd></div><div><dt>근거 없이 지어냄</dt><dd>${fails}</dd></div><div><dt>부분적으로 다름</dt><dd>${partial}</dd></div><div><dt>정확</dt><dd>${safe}</dd></div><div><dt>가중 비율</dt><dd>${pct(p.index)}</dd></div></dl>
<p class="muted">95% 신뢰구간 ${pct(p.interval.low)}~${pct(p.interval.high)}. 문항 수가 적을수록 구간이 넓습니다. 지어냄 1, 부분 0.5로 셉니다.</p>`);
  }
  if (c.total > 0) {
    parts.push(`<h3 style="font-size:13.5px;margin:12px 0 0">실제 사용자 질문 — 답변 속 사실 주장 대조</h3>
<dl class="nums"><div><dt>검사한 주장</dt><dd>${c.total}</dd></div><div><dt>원문과 일치</dt><dd>${c.match}</dd></div><div><dt>원문과 불일치</dt><dd>${c.mismatch}</dd></div><div><dt>원문 확인 불가</dt><dd>${c.unverifiable}</dd></div></dl>`);
  }
  return parts.join("") || `<p class="muted">채점한 답변이 아직 없습니다.</p>`;
}

function caseBlock(f, item, files, fileUrl, n) {
  const shots = files.filter((x) => Number(x.item_id) === Number(f.item_id));
  return `<div class="case">
  <div class="row"><b>사례 ${n} · 질문</b><div class="q">${esc(item?.question || f.claim)}</div></div>
  <div class="row"><b>서비스 답변</b><div class="said">“${esc(f.ai_quote || f.claim)}”${item?.answered_at ? `<div class="muted">답변 받은 시각 ${esc(kDateTime(item.answered_at))}${shots.length ? ` · 캡처 ${shots.length}장` : ""}</div>` : ""}
    ${shots.length && fileUrl ? `<div class="shots">${shots.map((s) => `<img src="${esc(fileUrl(s.id))}" alt="답변 캡처" />`).join("")}</div>` : ""}</div></div>
  <div class="row"><b>공식 원문</b><div class="truth">${esc(f.truth || "아래 원문 링크 참고")}${f.source_url || f.checked_url ? `<div><a href="${esc(f.checked_url || f.source_url)}" target="_blank" rel="noopener nofollow">${esc(f.source_label || f.checked_url || f.source_url)}</a></div>` : ""}</div></div>
  <div class="row"><b>차이점</b><div>${esc(f.yume_reason || "")}</div></div>
  <div class="row"><b>유메 판정</b><div>${esc(SEVERITY[f.severity] || f.severity)} · 근거 원문 첨부</div></div>
  <div class="row"><b>직접 재확인</b><div class="ok">✔ 완료${f.reviewed_at ? ` <span class="muted" style="font-weight:400">(${esc(kDate(f.reviewed_at))})</span>` : ""}</div></div>
</div>`;
}

/** 비공개 감사 보고서. mode: 'admin'(관리자 미리보기) | 'shared'(상대 회사가 여는 링크). */
export function renderAuditReport(detail, { fileUrl = null, mode = "shared" } = {}) {
  const { audit, items, findings, files, results } = detail;
  const service = audit.service_name || audit.company;
  const byItem = new Map(items.map((i) => [Number(i.id), i]));
  const confirmed = findings.filter((f) => f.polarity === "issue" && f.review === "confirmed");
  const featured = confirmed.filter((f) => Number(f.featured)).slice(0, 3);
  // 1~2쪽에 맞춘다 — 대표 사례 3건, 그 밖의 확인 항목 6건, 잘된 점 3건까지만 싣고 나머지는 숫자로 말한다.
  const othersAll = confirmed.filter((f) => !Number(f.featured));
  const others = othersAll.slice(0, 6);
  const goods = findings.filter((f) => f.polarity === "good" && Number(f.featured)).slice(0, 3);
  const period = results.period ? `${kDateTime(results.period.from)} ~ ${kDateTime(results.period.to)}` : "—";
  const body = `
<div class="bar">${mode === "admin" ? `<a href="/admin/audits#${Number(audit.id)}">← 감사 데스크</a>` : ""}<button type="button" onclick="window.print()">PDF로 저장·인쇄</button></div>
<main class="sheet">
  <span class="conf">비공개</span> <span class="muted">${esc(audit.company)} 귀중</span>
  <h1>${esc(service)} AI 답변 원문 대조 검사 결과</h1>
  <p class="sub">유메(YUME) · AI 할루시네이션 검사</p>

  <h2>1. 개요</h2>
  <table>
    <tr><th>검사 일시</th><td>${esc(period)}</td></tr>
    <tr><th>대상 서비스</th><td>${esc(service)}${audit.service_url ? ` · <a href="${esc(audit.service_url)}" target="_blank" rel="noopener nofollow">${esc(audit.service_url)}</a>` : ""}<div class="muted">답변 받은 시점의 화면 기준</div></td></tr>
    <tr><th>질문 수</th><td>${results.answered}개</td></tr>
    <tr><th>검사 방법</th><td>일반 사용자로서 질문을 직접 입력하고, 받은 답변을 공식 원문(법제처 국가법령정보·판례 데이터베이스·학술 레지스트리 등)과 대조했습니다. 유메가 지목한 오류는 사람이 원문을 직접 열어 다시 확인한 것만 남겼습니다.</td></tr>
  </table>

  <h2>2. 결과 요약</h2>
  ${resultNumbers(results)}

  <h2>3. 대표 사례</h2>
  ${featured.length ? featured.map((f, i) => caseBlock(f, byItem.get(Number(f.item_id)), files, fileUrl, i + 1)).join("") : `<p class="muted">대표 사례를 아직 고르지 않았습니다.</p>`}
  ${others.length ? `<h3 style="font-size:13.5px;margin:16px 0 4px">그 밖에 원문과 다른 것으로 확인된 항목</h3><ul>${others
    .map((f) => `<li>${esc((byItem.get(Number(f.item_id))?.question || f.claim).slice(0, 80))} — ${esc(String(f.yume_reason || "").slice(0, 120))}${f.checked_url ? ` <a href="${esc(f.checked_url)}" target="_blank" rel="noopener nofollow">원문</a>` : ""}</li>`)
    .join("")}${othersAll.length > others.length ? `<li class="muted">외 ${othersAll.length - others.length}건 — 목록은 요청하시면 원문 링크와 함께 드립니다.</li>` : ""}</ul>` : ""}

  <h2>4. 잘된 점</h2>
  ${goods.length ? `<ul>${goods.map((g) => `<li><b>${esc((byItem.get(Number(g.item_id))?.question || g.claim).slice(0, 90))}</b> — ${esc(String(g.yume_reason || g.ai_quote || "").slice(0, 160))}</li>`).join("")}</ul>` : ""}
  ${audit.highlights ? `<div class="note">${esc(audit.highlights).replace(/\n/g, "<br />")}</div>` : ""}
  ${!goods.length && !audit.highlights ? `<p class="muted">—</p>` : ""}

  <h2>5. 한계</h2>
  <ul>
    <li>표본이 작습니다(질문 ${results.answered}개). 드물게 생기는 오류는 잡히지 않았을 수 있고, 비율은 신뢰구간과 함께 읽어야 합니다.</li>
    <li>위 검사 일시에 받은 답변의 결과입니다. 같은 질문에도 시점·모델 버전에 따라 답이 달라질 수 있습니다.</li>
    <li>유메의 판정은 공개 원문과 대조한 검사 결과이며 보증이 아닙니다. 사례마다 원문 링크를 붙였으니 직접 확인해 주세요.</li>
  </ul>

  <h2>6. 비공개 고지</h2>
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
    <tr><th>오류 확정</th><td>유메가 지목한 항목을 사람이 공식 원문으로 직접 재확인했습니다.</td></tr>
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
