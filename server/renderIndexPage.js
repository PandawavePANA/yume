// YUME 할루시네이션 지수 공개 페이지 — /hallucination-index, /hallucination-index/:slug
//
// 이 페이지는 인용되기 위해 있다. 기자·심사위원·구매 담당자가 숫자 하나를 옮겨 적을 때
// 그 숫자가 무엇을 뜻하는지(표본·구간·방법·한계)가 같은 화면에 같이 있어야 한다.
// 그래서 통계 보고서처럼 만든다 — 큰 숫자 하나, 그 숫자의 불확실성, 그리고 방법과 한계.
// 숫자보다 크게 쓰는 문구는 없다. 지문(SHA-256)과 원자료 내려받기는 "고칠 수 없는 기록"이라는 증빙이다.
import { COMPLAINT_NOTICE, businessLine, complaintOfficer, esc } from "./renderPages.js";
import { METHOD_VERSION, MIN_CELL, MIN_HEADLINE } from "./hallucinationIndex.js";

const BASE_PATH = "/hallucination-index";
const kDate = (ms) =>
  new Date(Number(ms)).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric" });
const kShort = (ms) =>
  new Date(Number(ms)).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" });
// 기간 끝은 '그 시각 전까지'라 화면에는 하루 앞 날짜로 적는다.
const periodText = (s, e) => `${kShort(s)} ~ ${kShort(Number(e) - 1)}`;
const pct = (v) => (v === null || v === undefined ? "—" : `${Number(v).toFixed(1)}%`);
const num = (v) => Number(v || 0).toLocaleString("ko-KR");

const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com" /><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@500;700;900&display=swap" />`;

const STYLE = `
:root {
  --paper:#F7F4FB; --sheet:#FFFFFF; --ink:#1A1626; --ink2:#4A4458; --ink3:#857D96; --line:rgba(46,24,96,.12); --line2:rgba(46,24,96,.22);
  --accent:#6B4FA8; --accent-soft:rgba(107,79,168,.10); --fail:#C2410C; --partial:#D99A2B; --safe:#2F7D5B; --band:rgba(194,65,12,.16);
  --serif:'Noto Serif KR','Nanum Myeongjo',ui-serif,Georgia,serif;
  --sans:-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Pretendard','Noto Sans KR','Malgun Gothic',sans-serif;
  --mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --paper:#121019; --sheet:#1A1724; --ink:#EEEAF6; --ink2:#C4BDD6; --ink3:#8F87A3; --line:rgba(220,210,255,.12); --line2:rgba(220,210,255,.22);
  --accent:#B39BF0; --accent-soft:rgba(179,155,240,.12); --fail:#F08A5D; --partial:#E8B65A; --safe:#6CC59A; --band:rgba(240,138,93,.2);
} }
:root[data-theme="dark"] {
  --paper:#121019; --sheet:#1A1724; --ink:#EEEAF6; --ink2:#C4BDD6; --ink3:#8F87A3; --line:rgba(220,210,255,.12); --line2:rgba(220,210,255,.22);
  --accent:#B39BF0; --accent-soft:rgba(179,155,240,.12); --fail:#F08A5D; --partial:#E8B65A; --safe:#6CC59A; --band:rgba(240,138,93,.2);
}
* { box-sizing:border-box; }
html { -webkit-text-size-adjust:100%; }
body { margin:0; background:var(--paper); color:var(--ink); font-family:var(--sans); word-break:keep-all; line-height:1.7; }
a { color:var(--accent); }
a:focus-visible, button:focus-visible { outline:2px solid var(--accent); outline-offset:2px; border-radius:4px; }
.wrap { max-width:980px; margin:0 auto; padding:0 16px; }
.top { display:flex; justify-content:space-between; align-items:center; gap:12px; padding:18px 0; border-bottom:1px solid var(--line); flex-wrap:wrap; }
.brand { font-weight:800; letter-spacing:.22em; font-size:13px; color:var(--accent); text-decoration:none; }
.top nav { display:flex; gap:14px; flex-wrap:wrap; font-size:13px; }
.top nav a { color:var(--ink2); text-decoration:none; }
.mast { padding:44px 0 26px; border-bottom:2px solid var(--ink); }
.kicker { font-size:12px; font-weight:700; letter-spacing:.16em; text-transform:uppercase; color:var(--ink3); }
.mast h1 { font-family:var(--serif); font-weight:900; font-size:clamp(30px,5.4vw,54px); line-height:1.15; letter-spacing:-.02em; margin:10px 0 0; text-wrap:balance; }
.mast .sub { font-size:clamp(15px,1.6vw,17px); color:var(--ink2); margin:14px 0 0; max-width:62ch; }
.meta { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:0; border-bottom:1px solid var(--line); }
.meta div { padding:12px 14px 12px 0; }
.meta dt { font-size:11.5px; color:var(--ink3); letter-spacing:.04em; }
.meta dd { margin:3px 0 0; font-size:14px; font-weight:600; font-variant-numeric:tabular-nums; }
.hero { display:grid; grid-template-columns:minmax(0,1.1fr) minmax(0,1fr); gap:clamp(20px,4vw,48px); padding:36px 0; border-bottom:1px solid var(--line); align-items:center; }
@media (max-width:760px) { .hero { grid-template-columns:1fr; } }
.big { font-family:var(--serif); font-weight:900; font-size:clamp(64px,12vw,120px); line-height:1; letter-spacing:-.04em; font-variant-numeric:tabular-nums; }
.big small { font-size:.42em; letter-spacing:0; margin-left:2px; }
.hero .what { font-size:15px; color:var(--ink2); margin-top:12px; max-width:44ch; }
.pill { display:inline-block; font-size:12px; font-weight:700; padding:3px 10px; border-radius:999px; background:var(--accent-soft); color:var(--accent); letter-spacing:.02em; }
.pill.warn { background:rgba(217,154,43,.16); color:var(--partial); }
.scale { margin-top:6px; }
.scale svg { width:100%; height:auto; display:block; overflow:visible; }
.scale .cap { font-size:12.5px; color:var(--ink3); margin-top:8px; }
section { padding:34px 0; border-bottom:1px solid var(--line); }
section > h2 { font-family:var(--serif); font-size:clamp(21px,2.6vw,27px); font-weight:700; letter-spacing:-.01em; margin:0; }
section > .lede { color:var(--ink2); font-size:15px; margin:8px 0 0; max-width:66ch; }
.commentary { font-size:16.5px; line-height:1.85; max-width:66ch; white-space:pre-wrap; margin-top:14px; }
.bars { margin-top:18px; }
.bar { display:grid; grid-template-columns:minmax(120px,190px) minmax(0,1fr) 92px; gap:14px; align-items:center; padding:10px 0; border-top:1px solid var(--line); }
@media (max-width:620px) { .bar { grid-template-columns:1fr 84px; } .bar .track { grid-column:1 / -1; order:3; } }
.bar .name { font-size:14px; font-weight:650; }
.bar .name span { display:block; font-size:12px; color:var(--ink3); font-weight:400; line-height:1.5; }
.bar .val { text-align:right; font-variant-numeric:tabular-nums; font-weight:700; font-size:15px; }
.bar .val span { display:block; font-size:11.5px; color:var(--ink3); font-weight:400; }
.track svg { width:100%; height:22px; display:block; }
.muted { color:var(--ink3); font-size:13px; }
table { width:100%; border-collapse:collapse; margin-top:16px; font-size:14px; font-variant-numeric:tabular-nums; }
th, td { text-align:left; padding:10px 8px; border-bottom:1px solid var(--line); vertical-align:top; }
th { font-size:12px; color:var(--ink3); font-weight:600; letter-spacing:.03em; border-bottom:1px solid var(--line2); }
td.n { text-align:right; white-space:nowrap; }
.tbl { overflow-x:auto; }
.cases { display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:14px; margin-top:18px; }
.case { background:var(--sheet); border:1px solid var(--line); border-radius:14px; padding:16px 18px; display:flex; flex-direction:column; gap:10px; }
.case .tag { font-size:11.5px; color:var(--ink3); letter-spacing:.03em; }
.case .q { font-size:14px; font-weight:650; }
.case .said { font-size:13.5px; padding-left:12px; border-left:3px solid var(--fail); color:var(--ink2); }
.case .truth { font-size:13.5px; padding-left:12px; border-left:3px solid var(--safe); color:var(--ink2); }
.case .lbl { display:block; font-size:11px; font-weight:700; letter-spacing:.06em; color:var(--ink3); margin-bottom:2px; }
.stats { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:1px; background:var(--line); border:1px solid var(--line); border-radius:14px; overflow:hidden; margin-top:18px; }
.stats div { background:var(--sheet); padding:14px 16px; }
.stats dt { font-size:12px; color:var(--ink3); }
.stats dd { margin:4px 0 0; font-family:var(--serif); font-size:26px; font-weight:700; font-variant-numeric:tabular-nums; }
.method { columns:2 300px; column-gap:36px; margin-top:16px; }
.method div { break-inside:avoid; margin-bottom:16px; }
.method h3 { font-size:14px; margin:0 0 4px; }
.method p { font-size:13.5px; color:var(--ink2); margin:0; }
.hash { font-family:var(--mono); font-size:12.5px; word-break:break-all; background:var(--sheet); border:1px solid var(--line); border-radius:10px; padding:12px 14px; margin-top:12px; }
.btns { display:flex; gap:10px; flex-wrap:wrap; margin-top:14px; }
.btn { display:inline-block; padding:10px 16px; border-radius:999px; border:1px solid var(--line2); color:var(--ink); text-decoration:none; font-size:13.5px; font-weight:600; background:var(--sheet); }
.btn.primary { background:var(--ink); color:var(--paper); border-color:var(--ink); }
.archive { margin-top:16px; }
.archive a { display:grid; grid-template-columns:110px minmax(0,1fr) auto; gap:14px; padding:14px 0; border-top:1px solid var(--line); text-decoration:none; color:var(--ink); align-items:baseline; }
.archive a:hover .t { color:var(--accent); }
.archive .t { font-family:var(--serif); font-weight:700; font-size:17px; }
.archive .v { font-variant-numeric:tabular-nums; font-weight:700; }
@media (max-width:560px) { .archive a { grid-template-columns:1fr auto; } .archive a .d { grid-column:1 / -1; } }
.foot { padding:30px 0 60px; font-size:12px; color:var(--ink3); line-height:1.9; }
.foot a { color:var(--ink3); }
@media print { .top nav, .btns, .noprint { display:none !important; } body { background:#fff; } section, .hero { break-inside:avoid; } }
@media (prefers-reduced-motion: no-preference) { .grow { transform-origin:left center; animation:grow .9s cubic-bezier(.2,.7,.2,1) both; } @keyframes grow { from { transform:scaleX(0); } } }
`;

function page({ title, description, path, body, base = "" }) {
  const url = `${base}${path}`;
  return `<!doctype html>
<html lang="ko"><head>
<meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}" />
<meta property="og:type" content="article" /><meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(description)}" /><meta property="og:url" content="${esc(url)}" />
<meta property="og:site_name" content="유메 · AI 할루시네이션 검사" /><meta name="twitter:card" content="summary" />
<link rel="canonical" href="${esc(url)}" />
${FONTS}
<style>${STYLE}</style></head>
<body><div class="wrap">
<header class="top">
  <a class="brand" href="/">YUME</a>
  <nav aria-label="지수 메뉴"><a href="${BASE_PATH}">할루시네이션 지수</a><a href="${BASE_PATH}#method">방법</a><a href="${BASE_PATH}#archive">지난 호</a><a href="/business">AI 감사 받기</a></nav>
</header>
${body}
<footer class="foot">
  유메(YUME)는 AI가 쓴 글의 근거를 공식 원문과 대조하는 AI 할루시네이션 검사 서비스입니다. 검사 과정에 생성형 AI를 사용하며, 지수와 판정은 공개 원문과 대조한 검사 결과이지 특정 서비스의 품질 보증이나 법률 자문이 아닙니다.<br />
  ${businessLine()}<br />${esc(COMPLAINT_NOTICE)} ${esc(complaintOfficer())}<br />
  <a href="/terms">이용약관</a> · <a href="/privacy">개인정보처리방침</a> · <a href="/docs/api">API 문서</a>
</footer>
</div></body></html>`;
}

// 0~100% 눈금 위에 점추정과 신뢰구간. 눈금의 끝은 구간 상단이 들어가도록 10% 단위로 정한다.
function scaleMax(cells) {
  const hi = Math.max(10, ...cells.map((c) => Number(c.high ?? c.rate ?? 0)));
  return Math.min(100, Math.ceil(hi / 10) * 10);
}

function heroScale(cell) {
  if (cell.rate === null) return "";
  const max = 100;
  const W = 600;
  const x = (v) => 10 + (Number(v) / max) * (W - 20);
  const ticks = [0, 25, 50, 75, 100];
  return `<div class="scale"><svg viewBox="0 0 ${W} 64" role="img" aria-label="할루시네이션율 ${pct(cell.rate)}, 95% 신뢰구간 ${pct(cell.low)}~${pct(cell.high)}">
  <line x1="10" y1="30" x2="${W - 10}" y2="30" stroke="var(--line2)" stroke-width="1" />
  ${ticks.map((t) => `<line x1="${x(t)}" y1="25" x2="${x(t)}" y2="35" stroke="var(--line2)" /><text x="${x(t)}" y="56" text-anchor="middle" font-size="12" fill="var(--ink3)" font-family="var(--sans)">${t}%</text>`).join("")}
  <rect class="grow" x="${x(cell.low)}" y="20" width="${Math.max(2, x(cell.high) - x(cell.low))}" height="20" rx="4" fill="var(--band)" />
  <circle cx="${x(cell.rate)}" cy="30" r="7" fill="var(--fail)" />
  <text x="${x(cell.rate)}" y="12" text-anchor="middle" font-size="12.5" font-weight="700" fill="var(--ink)" font-family="var(--sans)">${pct(cell.rate)}</text>
</svg><div class="cap">점은 이번 호의 추정치, 띠는 95% 신뢰구간입니다. 표본이 늘면 띠가 좁아집니다.</div></div>`;
}

function barRows(cells, { showMeaning = false } = {}) {
  if (!cells?.length) return `<p class="muted">이 기간에 해당하는 표본이 없습니다.</p>`;
  const max = scaleMax(cells.filter((c) => c.rate !== null));
  return `<div class="bars">${cells
    .map((c) => {
      const label = `<div class="name">${esc(c.label)}${showMeaning && c.meaning ? `<span>${esc(c.meaning)}</span>` : ""}</div>`;
      if (c.rate === null) {
        return `<div class="bar">${label}<div class="track"><svg viewBox="0 0 400 22" preserveAspectRatio="none" aria-hidden="true"><line x1="0" y1="11" x2="400" y2="11" stroke="var(--line)" stroke-dasharray="3 4" /></svg></div><div class="val">표본 부족<span>n=${num(c.n)} (기준 ${MIN_CELL})</span></div></div>`;
      }
      const x = (v) => (Number(v) / max) * 400;
      return `<div class="bar">${label}<div class="track"><svg viewBox="0 0 400 22" preserveAspectRatio="none" role="img" aria-label="${esc(c.label)} ${pct(c.rate)}, 구간 ${pct(c.low)}~${pct(c.high)}">
  <rect x="0" y="9" width="400" height="4" rx="2" fill="var(--line)" />
  <rect class="grow" x="0" y="6" width="${Math.max(1.5, x(c.rate))}" height="10" rx="3" fill="var(--fail)" />
  <line x1="${x(c.low)}" y1="11" x2="${x(c.high)}" y2="11" stroke="var(--ink)" stroke-width="1.4" />
  <line x1="${x(c.low)}" y1="5" x2="${x(c.low)}" y2="17" stroke="var(--ink)" stroke-width="1.4" />
  <line x1="${x(c.high)}" y1="5" x2="${x(c.high)}" y2="17" stroke="var(--ink)" stroke-width="1.4" />
</svg></div><div class="val">${pct(c.rate)}<span>${pct(c.low)}~${pct(c.high)} · n=${num(c.n)}</span></div></div>`;
    })
    .join("")}${cells.some((c) => c.rate !== null)
    ? `<p class="muted" style="margin-top:10px">막대 끝의 가로선은 95% 신뢰구간입니다. 눈금 끝은 ${max}%입니다.</p>`
    : `<p class="muted" style="margin-top:10px">칸마다 표본이 ${MIN_CELL}건 이상 모이면 비율을 싣습니다.</p>`}</div>`;
}

const METHOD = [
  ["무엇을 재는가", "AI 서비스가, 공식 원문으로 정답이 먼저 확정된 질문에 근거 없이 지어낸 답을 내는 비율입니다. '모른다'고 답하거나 틀린 전제를 바로잡은 답은 정상으로 셉니다."],
  ["질문", "법제처 국가법령정보·판례 데이터베이스와 학술 레지스트리(DOI)로 정답을 확정한 기준 문항입니다. 존재하지 않는 조문·판례를 묻는 문항, 틀린 수치가 든 자료로 고객 안내문을 쓰게 하는 문항, 최근 개정된 현행 기준을 묻는 문항 등이 섞여 있습니다."],
  ["답변 수집", "유메 감사는 운영자가 대상 서비스를 일반 사용자로서 손으로 써서 답변을 받습니다(자동 대량 질의를 하지 않습니다). 기업 자가 점검은 기업이 자기 AI에 질문을 넣고 받은 답을 유메에 붙여넣은 것입니다."],
  ["채점", "정답을 아는 채점자가 두 번 따로 채점해 같을 때만 받아들이고, 갈리면 한 번 더 채점해 다수결로 정합니다. 채점 근거로 든 문장이 실제 답변에 없으면 그 채점은 버립니다. 출처를 요구한 문항은 답변이 댄 조문·사건번호·DOI를 공식 데이터베이스에 다시 조회합니다."],
  ["사람의 재확인", "유메 감사에서 오류로 지목된 항목은 운영자가 공식 원문을 직접 열어 확인한 것만 오류로 셉니다. 애매한 항목은 빼고, 유메가 잘못 지목한 것은 정상으로 돌립니다."],
  ["점수", "할루시네이션 1, 부분 실패 0.5, 정상 0으로 세고 문항별 가중치를 반영해 평균합니다. 채점할 수 없었던 답은 분모에서 뺍니다. 95% 신뢰구간은 Wilson 방법으로 냅니다."],
  ["공개 기준", `칸 하나의 표본이 ${MIN_CELL}건 미만이면 비율을 싣지 않습니다. 대표 숫자는 표본이 ${MIN_HEADLINE}건 미만이면 '예비'로 표시합니다.`],
  ["회사명", "개별 회사·서비스 이름은 그 회사가 공개에 동의한 경우에만 싣습니다. 사례는 익명이며 답변 속 이름은 ○○로 가립니다."],
  ["독립성", "지수의 숫자는 돈으로 바꿀 수 없습니다. 유메의 유료 고객도 같은 방법으로 세고, 결과가 나쁘다는 이유로 빼지 않습니다."],
  ["한계", "표본은 무작위 추출이 아닙니다(감사 대상과 자가 점검에 참여한 기업). 그래서 이 숫자는 국내 AI 서비스 전체의 오류율 추정치가 아니라, 같은 방법으로 잰 기간별 비교 지표입니다. 질문은 법령·판례처럼 공식 원문이 있는 분야에 치우쳐 있습니다. 결과는 답변을 받은 시점의 것입니다."],
];

function methodSection() {
  return `<section id="method"><h2>방법 <span class="pill">${esc(METHOD_VERSION)}</span></h2>
<p class="lede">방법을 바꾸면 버전을 올리고 이 자리에 적습니다. 같은 버전의 호끼리만 직접 비교하세요.</p>
<div class="method">${METHOD.map(([h, p]) => `<div><h3>${esc(h)}</h3><p>${esc(p)}</p></div>`).join("")}</div></section>`;
}

function headlineBlock(h, { compact = false, data = null } = {}) {
  if (!h || h.rate === null) {
    // 대표 숫자가 없는 호. 빈칸("—")만 두지 않고, 이번 호에 실제로 잰 것(기준선)을 보여 준다.
    const e = data?.engine || {};
    return `<div>
  <div class="kicker">이번 호 대표 숫자</div>
  <div class="big" style="font-size:clamp(40px,7vw,72px)">다음 호부터</div>
  <p class="what">재확인을 마친 감사 표본이 공개 기준을 넘으면 대표 숫자를 싣습니다. 표본 없이 숫자를 내지 않습니다. 이번 호는 방법과 기준선을 공개합니다.</p>
</div>
<div><div class="kicker">기준선 · 유메 검사 현황</div>
<dl class="stats" style="margin-top:10px"><div><dt>검사한 글</dt><dd>${num(e.texts)}</dd></div><div><dt>대조한 사실 주장</dt><dd>${num(e.claims)}</dd></div><div><dt>원문과 다름</dt><dd>${num(e.false)}</dd></div><div><dt>감사한 서비스</dt><dd>${num(data?.audits?.services)}</dd></div></dl>
<div class="scale"><div class="cap">집계 숫자만 싣습니다. 의심스러워 넣은 글이 많아 선택 편향이 있으므로 AI 전체의 오류율이나 비교 지표가 아닙니다.</div></div></div>`;
  }
  const src = h.source === "audits" ? "출처: 유메 감사, 사람 재확인 완료" : "출처: 기업 자가 점검";
  return `<div>
  <div class="kicker">${h.source === "audits" ? "AI 서비스 할루시네이션율" : "자가 점검 할루시네이션율"} ${h.provisional ? `<span class="pill warn">예비 · 표본 ${num(h.n)}건</span>` : ""}</div>
  <div class="big">${Number(h.rate).toFixed(1)}<small>%</small></div>
  <p class="what">정답이 공식 원문으로 확정된 질문 <b>${num(h.n)}건</b> 가운데, AI가 근거 없이 지어낸 답의 가중 비율입니다(${esc(src)}). 지어냄 ${num(h.hallucinated)}건 · 부분 실패 ${num(h.partial)}건 · 정상 ${num(h.safe)}건.</p>
</div>
<div>${compact ? "" : heroScale(h)}${compact ? heroScale(h) : ""}</div>`;
}

export function renderIndexIssue(issue, { base = "" } = {}) {
  const d = JSON.parse(issue.data_json);
  const corrections = JSON.parse(issue.corrections_json || "[]");
  const a = d.audits || {};
  const s = d.selfAudits || {};
  const e = d.engine || {};
  const h = d.headline;
  const path = `${BASE_PATH}/${issue.slug}`;
  const description = h && h.rate !== null
    ? `${issue.title} — 공식 원문으로 정답이 확정된 질문 ${num(h.n)}건에서 AI 할루시네이션율 ${pct(h.rate)} (95% 신뢰구간 ${pct(h.low)}~${pct(h.high)}).`
    : `${issue.title} — 유메가 같은 방법으로 반복해 재는 AI 할루시네이션 공개 지표.`;
  const body = `
<div class="mast">
  <div class="kicker">YUME 할루시네이션 지수 · ${esc(periodText(issue.period_start, issue.period_end))}</div>
  <h1>${esc(issue.title)}</h1>
  <p class="sub">유메가 같은 방법으로 반복해 재는 AI 할루시네이션 공개 지표입니다. 숫자마다 표본과 신뢰구간을 함께 싣습니다.</p>
</div>
<dl class="meta">
  <div><dt>발행</dt><dd>${esc(kDate(issue.published_at))}${Number(issue.revision) ? ` · 정정 ${Number(issue.revision)}회` : ""}</dd></div>
  <div><dt>방법</dt><dd>${esc(issue.method_version)}</dd></div>
  <div><dt>감사한 서비스</dt><dd>${num(a.services)}곳</dd></div>
  <div><dt>채점한 답변</dt><dd>${num((a.overall?.n || 0) + (s.overall?.n || 0))}건</dd></div>
</dl>
<div class="hero">${headlineBlock(h, { data: d })}</div>

${issue.commentary ? `<section><h2>이번 호에서 볼 것</h2><div class="commentary">${esc(issue.commentary)}</div></section>` : ""}

<section><h2>어떤 질문에서 무너지는가</h2>
<p class="lede">실패 유형별 할루시네이션율입니다(유메 감사). 같은 AI라도 유형에 따라 크게 다릅니다.</p>
${barRows(a.byType, { showMeaning: true })}</section>

<section><h2>업종별</h2><p class="lede">감사 대상 서비스의 업종 기준입니다.</p>${barRows(a.byDomain)}
${a.byCategory?.length > 1 ? `<h3 style="margin-top:26px;font-size:15px">서비스 종류별</h3>${barRows(a.byCategory)}` : ""}</section>

${a.cases?.length ? `<section><h2>실제로 나온 답</h2><p class="lede">사람이 공식 원문을 직접 열어 확인한 사례만 싣습니다. 서비스 이름은 가렸습니다.</p>
<div class="cases">${a.cases
    .map(
      (c) => `<article class="case"><div class="tag">${esc(c.domain)} · ${esc(c.category)}${c.type ? ` · ${esc(c.type)}` : ""}</div>
<div class="q">${esc(c.question)}</div>
<div class="said"><span class="lbl">AI 답변</span>${esc(c.said)}</div>
<div class="truth"><span class="lbl">공식 원문</span>${esc(c.truth || "원문 링크 참고")}</div>
${c.source_url ? `<a href="${esc(c.source_url)}" target="_blank" rel="noopener nofollow" style="font-size:12.5px;word-break:break-all">${esc(c.source_label || c.source_url)}</a>` : ""}</article>`,
    )
    .join("")}</div></section>` : ""}

${a.claims?.total ? `<section><h2>답변 속 주장 대조</h2><p class="lede">감사에서 실제 사용자 질문으로 받은 답변의 사실 주장을 하나씩 원문과 대조한 결과입니다.</p>
<dl class="stats"><div><dt>대조한 주장</dt><dd>${num(a.claims.total)}</dd></div><div><dt>원문과 일치</dt><dd>${num(a.claims.match)}</dd></div><div><dt>원문과 불일치</dt><dd>${num(a.claims.mismatch)}</dd></div><div><dt>원문 확인 불가</dt><dd>${num(a.claims.unverifiable)}</dd></div></dl>
<p class="muted" style="margin-top:10px">판정이 난 주장 중 불일치 비율: ${a.claims.mismatchRate === null ? `표본 부족(기준 ${MIN_CELL})` : pct(a.claims.mismatchRate)}</p></section>` : ""}

${a.named?.length ? `<section><h2>공개에 동의한 서비스</h2><p class="lede">감사 결과 공개에 동의한 곳만 이름을 싣습니다. 순위가 아니라 각자의 검사 결과입니다.</p>
<div class="tbl"><table><thead><tr><th>서비스</th><th>업종</th><th style="text-align:right">문항</th><th style="text-align:right">할루시네이션율</th><th style="text-align:right">95% 구간</th></tr></thead><tbody>
${a.named.map((n) => `<tr><td>${n.public_id ? `<a href="/a/${esc(n.public_id)}">${esc(n.service)}</a>` : esc(n.service)}<div class="muted">${esc(n.company)}</div></td><td>${esc(n.domain)}</td><td class="n">${num(n.n)}</td><td class="n">${pct(n.rate)}</td><td class="n">${pct(n.low)}~${pct(n.high)}</td></tr>`).join("")}
</tbody></table></div></section>` : ""}

<section><h2>기업 자가 점검</h2><p class="lede">기업이 무료 점검으로 자기 AI에 질문을 넣고 받은 답을 유메가 채점한 결과입니다. 어느 회사의 어떤 AI인지는 남기지 않습니다.</p>
${s.overall?.n ? `<dl class="stats"><div><dt>채점한 답변</dt><dd>${num(s.overall.n)}</dd></div><div><dt>할루시네이션율</dt><dd>${pct(s.overall.rate)}</dd></div><div><dt>95% 구간</dt><dd style="font-size:19px">${pct(s.overall.low)}~${pct(s.overall.high)}</dd></div></dl>${barRows(s.byType)}` : `<p class="muted">이 기간의 자가 점검 표본이 없습니다.</p>`}</section>

<section><h2>유메 검사 현황</h2><p class="lede">이 기간 유메에 검사를 맡긴 글(대부분 AI 답변)에서 나온 사실 주장의 판정입니다. 의심스러워서 넣은 글이 많아 AI 답변 전체의 오류율보다 높게 나올 수 있습니다.</p>
<dl class="stats"><div><dt>검사한 글</dt><dd>${num(e.texts)}</dd></div><div><dt>사실 주장</dt><dd>${num(e.claims)}</dd></div><div><dt>사실과 다름</dt><dd>${pct(e.falseRate)}</dd></div><div><dt>확인되지 않음</dt><dd>${pct(e.uncertainRate)}</dd></div></dl></section>

${methodSection()}

<section id="record"><h2>기록</h2>
<p class="lede">이 호의 숫자는 발행 순간 고정됐습니다. 아래 원자료(JSON)를 내려받아 SHA-256을 계산하면 이 지문과 같아야 합니다. 고친 적이 있으면 사유와 이전 지문을 모두 남깁니다.</p>
<div class="hash">SHA-256 ${esc(issue.sha256 || "")}</div>
<div class="btns"><a class="btn" href="${path}.json">원자료 JSON</a><a class="btn" href="${path}.csv">표 CSV</a><a class="btn" href="javascript:window.print()">인쇄·PDF</a></div>
${corrections.length ? `<div class="tbl"><table><thead><tr><th>정정일</th><th>사유</th><th>이전 지문</th></tr></thead><tbody>${corrections.map((c) => `<tr><td style="white-space:nowrap">${esc(kShort(c.at))}</td><td>${esc(c.note)}</td><td style="font-family:var(--mono);font-size:11.5px;word-break:break-all">${esc(c.prev_sha256 || "")}</td></tr>`).join("")}</tbody></table></div>` : ""}
<p class="muted" style="margin-top:14px">인용: 유메, 「${esc(issue.title)}」, ${esc(kDate(issue.published_at))}, ${esc(`${base || ""}${path}`)}</p>
</section>

<section class="noprint" style="border-bottom:0"><h2>귀사 AI도 같은 방법으로</h2><p class="lede">유메 감사는 귀사 AI 서비스를 같은 질문 체계로 표본 검사하고, 사람이 원문으로 재확인한 결과를 비공개 보고서로 드립니다. 공개 여부는 귀사가 정합니다.</p>
<div class="btns"><a class="btn primary" href="/business">AI 감사 문의</a><a class="btn" href="${BASE_PATH}">지난 호 보기</a></div></section>`;
  return page({ title: `${issue.title} · YUME 할루시네이션 지수`, description, path, body, base });
}

export function renderIndexHome(issues, latest, { base = "", next = "" } = {}) {
  const d = latest ? JSON.parse(latest.data_json) : null;
  const h = d?.headline;
  const archive = issues.length
    ? `<div class="archive">${issues
        .map((i) => {
          let rate = "—";
          try {
            const hd = JSON.parse(i.data_json || "null")?.headline;
            if (hd && hd.rate !== null) rate = pct(hd.rate);
          } catch {
            /* 목록에는 data_json이 없을 수 있다 */
          }
          return `<a href="${BASE_PATH}/${esc(i.slug)}"><span class="d muted">${esc(kShort(i.published_at))}</span><span class="t">${esc(i.title)}</span><span class="v">${rate}</span></a>`;
        })
        .join("")}</div>`
    : `<p class="muted" style="margin-top:14px">아직 발행한 호가 없습니다.</p>`;
  const body = `
<div class="mast">
  <div class="kicker">YUME Hallucination Index</div>
  <h1>YUME 할루시네이션 지수</h1>
  <p class="sub">AI가 근거 없이 지어내는 비율을, 공식 원문으로 정답을 확정한 질문으로 같은 방법을 써서 반복해 잽니다. 숫자마다 표본·신뢰구간·방법·한계를 같이 공개하고, 발행한 숫자는 고칠 수 없게 지문을 붙입니다.</p>
</div>
${latest
    ? `<dl class="meta"><div><dt>최신 호</dt><dd><a href="${BASE_PATH}/${esc(latest.slug)}">${esc(latest.title)}</a></dd></div><div><dt>기간</dt><dd>${esc(periodText(latest.period_start, latest.period_end))}</dd></div><div><dt>방법</dt><dd>${esc(latest.method_version)}</dd></div>${next ? `<div><dt>다음 호</dt><dd>${esc(next)}</dd></div>` : ""}</dl>
<div class="hero">${headlineBlock(h, { data: d })}</div>
<div class="btns"><a class="btn primary" href="${BASE_PATH}/${esc(latest.slug)}">이번 호 전체 보기</a></div>`
    : `<div class="hero"><div><div class="kicker">창간 준비 중</div><div class="big" style="font-size:clamp(44px,8vw,80px)">곧 첫 호</div>
<p class="what">첫 호는 유메 감사와 기업 자가 점검이 공개 기준(칸당 ${MIN_CELL}건)을 넘으면 발행합니다. ${next ? `발행 예정: ${esc(next)}.` : ""} 아래에 무엇을 어떻게 재는지 미리 공개합니다.</p></div>
<div><dl class="stats" style="margin-top:0"><div><dt>정답 확정</dt><dd style="font-size:18px">법제처 원문</dd></div><div><dt>채점</dt><dd style="font-size:18px">독립 2회 일치</dd></div><div><dt>오류 확정</dt><dd style="font-size:18px">사람 재확인</dd></div><div><dt>불확실성</dt><dd style="font-size:18px">95% 구간</dd></div></dl></div></div>`}

<section><h2>무엇을 보여 주는가</h2>
<div class="method" style="columns:3 220px">
  <div><h3>유형별로 어디서 무너지는가</h3><p>없는 조문을 지어내는가, 틀린 자료를 그대로 고객 안내문에 쓰는가, 개정 전 기준을 현행처럼 말하는가 — 같은 AI도 유형마다 실패율이 다릅니다.</p></div>
  <div><h3>업종별로 얼마나 다른가</h3><p>법률·의료·금융·커머스·공공·인사·제조 — 업종 법령으로 만든 질문으로 잽니다.</p></div>
  <div><h3>사람이 확인한 실제 사례</h3><p>원문을 직접 열어 확인한 답만 사례로 싣고, 회사 이름은 가립니다.</p></div>
</div></section>

<section id="archive"><h2>지난 호</h2>${archive}</section>
${methodSection()}
<section class="noprint" style="border-bottom:0"><h2>지수에 참여하기</h2><p class="lede">AI 서비스를 운영하는 회사라면 무료 점검으로 자기 AI를 먼저 재 볼 수 있고, 유메 감사로 사람이 재확인한 보고서를 받을 수 있습니다. 회사 이름은 동의하신 경우에만 싣습니다.</p>
<div class="btns"><a class="btn primary" href="/business">AI 감사 문의</a><a class="btn" href="/business#audit">무료 점검</a></div></section>`;
  const description = h && h.rate !== null
    ? `최신 호 AI 할루시네이션율 ${pct(h.rate)} (95% 신뢰구간 ${pct(h.low)}~${pct(h.high)}, 표본 ${num(h.n)}건). 유메가 같은 방법으로 반복해 재는 공개 지표.`
    : "AI가 근거 없이 지어내는 비율을 공식 원문으로 정답을 확정한 질문으로 반복해 재는 공개 지표. 표본·신뢰구간·방법·한계를 함께 공개합니다.";
  return page({ title: "YUME 할루시네이션 지수", description, path: BASE_PATH, body, base });
}

export { BASE_PATH as INDEX_PATH };
