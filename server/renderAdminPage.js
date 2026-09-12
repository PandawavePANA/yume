// 운영자 대시보드(/admin). 이 HTML은 빈 틀과 스크립트만 담고, 데이터는 관리자 세션으로
// /api/admin/*를 호출해 채운다. 로그인은 일반 유메 계정과 같고 role=admin만 통과한다
// (ADMIN_EMAILS 환경변수에 적힌 이메일로 가입·로그인하면 관리자 권한이 붙는다).
export function renderAdminPage() {
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>유메 운영 대시보드</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system,BlinkMacSystemFont,'SF Pro Display','Segoe UI','Noto Sans KR',sans-serif; background: #F6F1FC; color: #241F33; word-break: keep-all; }
  a { color: #6B4FA8; }
  .shell { display: grid; grid-template-columns: 210px 1fr; min-height: 100vh; }
  aside { background: #fff; border-right: 1px solid #E6DAF6; padding: 20px 12px; position: sticky; top: 0; height: 100vh; }
  .brand { font-weight: 800; font-size: 16px; color: #3B3159; padding: 0 10px 18px; }
  .brand small { display: block; font-weight: 500; font-size: 11px; color: #A99BC9; margin-top: 2px; }
  .nav button { display: block; width: 100%; text-align: left; border: none; background: transparent; padding: 9px 12px; border-radius: 9px; font-size: 13.5px; color: #4C5266; cursor: pointer; margin-bottom: 2px; }
  .nav button.on { background: #EFE4FC; color: #5B3FA0; font-weight: 700; }
  .nav button:hover { background: #F5EEFD; }
  .who { position: absolute; bottom: 16px; left: 12px; right: 12px; font-size: 11.5px; color: #8577A8; padding: 0 10px; }
  main { padding: 26px clamp(14px, 3vw, 34px) 60px; min-width: 0; }
  h1 { font-size: 20px; margin: 0 0 4px; } .sub { font-size: 12.5px; color: #8577A8; margin-bottom: 18px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 10px; margin-bottom: 18px; }
  .kpi { background: #fff; border: 1px solid #E6DAF6; border-radius: 14px; padding: 13px 15px; }
  .kpi .l { font-size: 11px; color: #8577A8; font-weight: 600; margin-bottom: 5px; } .kpi .v { font-size: 22px; font-weight: 800; } .kpi .s { font-size: 11px; color: #A99BC9; margin-top: 2px; }
  .panel { background: #fff; border: 1px solid #E6DAF6; border-radius: 16px; padding: 18px 20px; margin-bottom: 16px; }
  .panel h2 { font-size: 14px; margin: 0 0 4px; } .panel .desc { font-size: 11.5px; color: #A99BC9; margin-bottom: 12px; }
  .two { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px; }
  .tablewrap { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
  th, td { text-align: left; padding: 8px 9px; border-bottom: 1px solid #F0E8FA; vertical-align: top; }
  th { color: #8577A8; font-weight: 600; font-size: 11.5px; white-space: nowrap; }
  tr.click { cursor: pointer; } tr.click:hover td { background: #FBF8FF; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 10.5px; font-weight: 700; white-space: nowrap; background: #EFE6FA; color: #6B4FA8; }
  .b-done, .b-confirmed, .b-active { background: #EAF7F0; color: #1F9D66; } .b-pending, .b-uncertain { background: #FFF6E0; color: #B4690E; }
  .b-error, .b-false, .b-suspended, .b-revoked { background: #FBEDEA; color: #C6402F; } .b-kakao { background: #FFF0DC; color: #A56A15; } .b-api { background: #E6F0FF; color: #2F5FB3; }
  .row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-bottom: 12px; }
  input, select, textarea { font: inherit; font-size: 13px; padding: 7px 10px; border-radius: 9px; border: 1px solid #D9C8F2; background: #fff; }
  textarea { width: 100%; }
  .btn { border: 1px solid #D4BEF0; background: #fff; color: #6B4FA8; font-size: 12.5px; font-weight: 700; padding: 7px 13px; border-radius: 999px; cursor: pointer; }
  .btn.primary { background: linear-gradient(90deg,#B49AEE,#6B4FA8); color: #fff; border: none; } .btn.danger { color: #C6402F; border-color: #F0BCB0; }
  .btn:disabled { opacity: .5; cursor: default; }
  .empty { color: #B0A2D6; font-size: 12.5px; padding: 10px 0; }
  .muted { color: #8577A8; font-size: 12px; }
  pre { background: #211A32; color: #E8E1FA; border-radius: 10px; padding: 12px; font-size: 11.5px; overflow-x: auto; white-space: pre-wrap; word-break: break-all; max-height: 360px; }
  .modal-bg { position: fixed; inset: 0; background: rgba(40,28,70,.35); display: flex; align-items: flex-start; justify-content: center; padding: 40px 16px; overflow-y: auto; z-index: 20; }
  .modal { background: #fff; border-radius: 18px; width: min(860px, 100%); padding: 24px; position: relative; }
  .modal .x { position: absolute; top: 14px; right: 16px; border: none; background: none; font-size: 20px; color: #9C8FC2; cursor: pointer; }
  .claim { border: 1px solid #F0E8FA; border-radius: 12px; padding: 11px 13px; margin-bottom: 8px; font-size: 12.5px; line-height: 1.6; }
  .input-block { background: #F9F5FF; border: 1px solid #EFE6FA; border-radius: 10px; padding: 10px 12px; white-space: pre-wrap; font-size: 12.5px; margin-bottom: 12px; max-height: 240px; overflow-y: auto; }
  .bubble { border-radius: 10px; padding: 8px 12px; margin-bottom: 6px; max-width: 85%; white-space: pre-wrap; font-size: 12.5px; }
  .bubble.user { background: #F1E6FB; } .bubble.assistant { background: #F5F5F7; margin-left: auto; }
  #gate { max-width: 380px; margin: 12vh auto; background: #fff; border: 1px solid #E6DAF6; border-radius: 18px; padding: 28px; }
  #gate input { width: 100%; margin: 6px 0 12px; } #gate .btn { width: 100%; padding: 10px; }
  .err { color: #C6402F; font-size: 12.5px; min-height: 16px; }
  .legend { display: flex; gap: 12px; font-size: 11px; color: #8577A8; margin-top: 6px; } .legend i { display: inline-block; width: 9px; height: 9px; border-radius: 2px; margin-right: 4px; vertical-align: -1px; }
  .hbar { display: grid; grid-template-columns: 110px 1fr 70px; gap: 8px; align-items: center; font-size: 12px; margin-bottom: 6px; }
  .hbar .track { height: 9px; background: #F1EAFB; border-radius: 999px; overflow: hidden; } .hbar .fill { height: 100%; background: linear-gradient(90deg,#B49AEE,#6B4FA8); }
  .copy { font-family: ui-monospace, monospace; font-size: 12px; background: #F7F1FE; border: 1px dashed #CBB3EE; border-radius: 9px; padding: 9px 11px; word-break: break-all; }
  @media (max-width: 760px) { .shell { grid-template-columns: 1fr; } aside { position: static; height: auto; } .who { position: static; margin-top: 10px; } .nav { display: flex; flex-wrap: wrap; gap: 4px; } .nav button { width: auto; } }
</style>
</head>
<body>
<div id="gate" hidden>
  <div style="font-size:17px;font-weight:800;margin-bottom:4px;">유메 운영 대시보드</div>
  <div class="muted" style="margin-bottom:14px;">관리자 권한이 있는 유메 계정으로 로그인하세요.</div>
  <input id="gEmail" type="email" placeholder="이메일" autocomplete="username" />
  <input id="gPw" type="password" placeholder="비밀번호" autocomplete="current-password" />
  <button class="btn primary" id="gBtn">로그인</button>
  <div class="err" id="gErr" style="margin-top:10px;"></div>
</div>

<div class="shell" id="app" hidden>
  <aside>
    <div class="brand">YUME 운영<small>DB 대시보드</small></div>
    <div class="nav" id="nav"></div>
    <div class="who" id="who"></div>
  </aside>
  <main id="main"></main>
</div>
<div id="modalRoot"></div>

<script>
var TABS = [
  ["overview", "개요"], ["users", "회원"], ["verifications", "검증 기록"], ["api", "API · 과금"],
  ["dataset", "데이터셋 판매"], ["chats", "대화"], ["errors", "오류"], ["audit", "감사 로그"], ["db", "DB"]
];
var state = { tab: "overview", me: null };
var PLAN_LABEL = { free: "무료", standard: "스탠다드", expert: "전문가", business: "비즈니스" };
var VERDICT_LABEL = { confirmed: "확인됨", "false": "사실과 다름", uncertain: "판단 보류" };
var VIA_LABEL = { official: "공식 대조", nec: "부존재 신뢰도", web: "웹 교차확인", unavailable: "조회 실패" };

function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
function safeUrl(u) { try { var x = new URL(String(u || "")); return x.protocol === "http:" || x.protocol === "https:" ? x.toString() : "#"; } catch (e) { return "#"; } }
function t(ms) { return ms ? new Date(ms).toLocaleString("ko-KR", { year: "2-digit", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "-"; }
function n(x) { return Number(x || 0).toLocaleString("ko-KR"); }
function badge(cls, text) { return '<span class="badge b-' + esc(cls) + '">' + esc(text) + "</span>"; }
function $(id) { return document.getElementById(id); }

async function api(path, opts) {
  opts = opts || {};
  var res = await fetch(path, { method: opts.method || "GET", credentials: "same-origin", headers: opts.body ? { "Content-Type": "application/json" } : {}, body: opts.body ? JSON.stringify(opts.body) : undefined });
  var data = await res.json().catch(function () { return {}; });
  if (!res.ok) throw new Error(data.error || ("요청 실패 (" + res.status + ")"));
  return data;
}

function modal(html) {
  $("modalRoot").innerHTML = '<div class="modal-bg" id="mbg"><div class="modal"><button class="x" id="mx">×</button>' + html + "</div></div>";
  $("mx").onclick = closeModal;
  $("mbg").onclick = function (e) { if (e.target.id === "mbg") closeModal(); };
}
function closeModal() { $("modalRoot").innerHTML = ""; }

// ── 로그인 ──
async function boot() {
  try {
    var me = await api("/api/auth/me");
    if (me.user && me.user.role === "admin") { state.me = me.user; return start(); }
    if (me.user) { $("gErr").textContent = me.user.email + " 계정에는 관리자 권한이 없어요."; }
  } catch (e) {}
  $("gate").hidden = false;
}
$("gBtn").onclick = async function () {
  $("gErr").textContent = "";
  try {
    var r = await api("/api/auth/login", { method: "POST", body: { email: $("gEmail").value, password: $("gPw").value } });
    if (r.user.role !== "admin") { $("gErr").textContent = "관리자 권한이 없는 계정이에요."; return; }
    state.me = r.user; $("gate").hidden = true; start();
  } catch (e) { $("gErr").textContent = e.message; }
};
$("gPw").addEventListener("keydown", function (e) { if (e.key === "Enter") $("gBtn").click(); });

function start() {
  $("app").hidden = false;
  $("who").innerHTML = esc(state.me.email) + '<br/><a href="#" id="logout">로그아웃</a> · <a href="/">서비스로</a>';
  $("logout").onclick = async function (e) { e.preventDefault(); await api("/api/auth/logout", { method: "POST" }); location.reload(); };
  $("nav").innerHTML = TABS.map(function (x) { return '<button data-tab="' + x[0] + '">' + x[1] + "</button>"; }).join("");
  $("nav").onclick = function (e) { var b = e.target.closest("button"); if (b) go(b.getAttribute("data-tab")); };
  go(location.hash.slice(1) || "overview");
}

function go(tab) {
  if (!TABS.some(function (x) { return x[0] === tab; })) tab = "overview";
  state.tab = tab; location.hash = tab;
  Array.prototype.forEach.call($("nav").children, function (b) { b.classList.toggle("on", b.getAttribute("data-tab") === tab); });
  $("main").innerHTML = '<div class="empty">불러오는 중…</div>';
  var fn = { overview: renderOverview, users: renderUsers, verifications: renderVerifications, api: renderApi, dataset: renderDataset, chats: renderChats, errors: renderErrors, audit: renderAudit, db: renderDb }[tab];
  fn().catch(function (e) { $("main").innerHTML = '<div class="panel"><div class="err">' + esc(e.message) + "</div></div>"; });
}

// ── 개요 ──
function kpi(l, v, s) { return '<div class="kpi"><div class="l">' + esc(l) + '</div><div class="v">' + esc(v) + "</div>" + (s ? '<div class="s">' + esc(s) + "</div>" : "") + "</div>"; }

function stackedChart(series) {
  var W = 760, H = 180, pad = 26, bw = (W - pad * 2) / series.length;
  var max = Math.max(1, Math.max.apply(null, series.map(function (d) { return d.web + d.kakao + d.api; })), Math.max.apply(null, series.map(function (d) { return d.signups; })));
  var colors = { web: "#8E6FD8", kakao: "#E8B349", api: "#5B8DEF" };
  var bars = series.map(function (d, i) {
    var y = H - pad, out = "";
    ["web", "kakao", "api"].forEach(function (k) {
      var h = (d[k] / max) * (H - pad * 2);
      if (h > 0) { y -= h; out += '<rect x="' + (pad + i * bw + 2) + '" y="' + y + '" width="' + Math.max(2, bw - 4) + '" height="' + h + '" rx="2" fill="' + colors[k] + '"><title>' + d.day + " " + k + " " + d[k] + "</title></rect>"; }
    });
    return out;
  }).join("");
  var line = series.map(function (d, i) { return (pad + i * bw + bw / 2) + "," + (H - pad - (d.signups / max) * (H - pad * 2)); }).join(" ");
  var labels = series.map(function (d, i) { return i % 5 === 0 ? '<text x="' + (pad + i * bw + bw / 2) + '" y="' + (H - 8) + '" font-size="10" text-anchor="middle" fill="#A99BC9">' + d.day.slice(5) + "</text>" : ""; }).join("");
  return '<svg viewBox="0 0 ' + W + " " + H + '" style="width:100%;height:auto;">' +
    '<line x1="' + pad + '" y1="' + (H - pad) + '" x2="' + (W - pad) + '" y2="' + (H - pad) + '" stroke="#E6DAF6"/>' + bars +
    '<polyline points="' + line + '" fill="none" stroke="#1F9D66" stroke-width="2"/>' + labels +
    '<text x="' + pad + '" y="14" font-size="10" fill="#A99BC9">최대 ' + max + "</text></svg>" +
    '<div class="legend"><span><i style="background:#8E6FD8"></i>웹</span><span><i style="background:#E8B349"></i>카카오</span><span><i style="background:#5B8DEF"></i>API</span><span><i style="background:#1F9D66"></i>가입</span></div>';
}

function hbars(rows, labelFn, valFn, extraFn) {
  var max = Math.max.apply(null, rows.map(valFn).concat([1]));
  return rows.length ? rows.map(function (r) {
    return '<div class="hbar"><span>' + esc(labelFn(r)) + '</span><div class="track"><div class="fill" style="width:' + (valFn(r) / max * 100) + '%"></div></div><span class="muted">' + n(valFn(r)) + (extraFn ? " " + extraFn(r) : "") + "</span></div>";
  }).join("") : '<div class="empty">데이터 없음</div>';
}

async function renderOverview() {
  var d = await api("/api/admin/overview"), k = d.kpis;
  $("main").innerHTML =
    '<h1>개요</h1><div class="sub">마지막 갱신 ' + t(d.generatedAt) + ' · <a href="#" id="rf">새로고침</a></div>' +
    '<div class="grid">' +
      kpi("전체 회원", n(k.users), "7일 신규 " + n(k.newUsers7d)) +
      kpi("유료 회원", n(k.paidUsers), "데이터 활용 동의 " + n(k.dataConsentUsers)) +
      kpi("오늘 검증", n(k.verificationsToday), "오늘 이용자 " + n(k.activeClientsToday)) +
      kpi("7일 검증", n(k.verifications7d), "누적 " + n(k.verificationsTotal)) +
      kpi("평균 소요", (k.avgLatencyMs7d / 1000).toFixed(1) + "초", "캐시 재사용 " + Math.round(k.cacheHitRate7d * 100) + "%") +
      kpi("진행 중 · 24h 실패", n(k.pending) + " · " + n(k.errors24h)) +
      kpi("API 키", n(k.apiKeysActive), "이번 달 과금 호출 " + n(k.apiCallsThisMonth)) +
      kpi("판정된 주장", n(k.claimsTotal), "부존재 신뢰도 판정 " + n(k.necJudged) + " (부존재 확실 " + n(k.necNonexistent) + ")") +
    "</div>" +
    '<div class="panel"><h2>최근 30일 검증·가입</h2><div class="desc">경로별 검증 건수(막대)와 신규 가입(선), KST 기준</div>' + stackedChart(d.series) + "</div>" +
    '<div class="two">' +
      '<div class="panel"><h2>판정 분포</h2>' + hbars(d.verdicts, function (r) { return VERDICT_LABEL[r.verdict] || r.verdict || "-"; }, function (r) { return r.n; }) + "</div>" +
      '<div class="panel"><h2>판정 방식</h2>' + hbars(d.via, function (r) { return VIA_LABEL[r.via] || r.via || "-"; }, function (r) { return r.n; }) + "</div>" +
      '<div class="panel"><h2>분야별 주장 · 오류율</h2>' + hbars(d.domains, function (r) { return r.domain || "-"; }, function (r) { return r.n; }, function (r) { return "(" + Math.round((r.false_n / Math.max(1, r.n)) * 100) + "% 오류)"; }) + "</div>" +
      '<div class="panel"><h2>요금제 분포</h2>' + hbars(d.plans, function (r) { return PLAN_LABEL[r.plan] || r.plan; }, function (r) { return r.n; }) + "</div>" +
    "</div>";
  $("rf").onclick = function (e) { e.preventDefault(); go("overview"); };
}

// ── 회원 ──
var userQuery = { q: "", plan: "", page: 0 };
async function renderUsers() {
  var qs = new URLSearchParams(userQuery).toString();
  var d = await api("/api/admin/users?" + qs);
  $("main").innerHTML = '<h1>회원</h1><div class="sub">총 ' + n(d.total) + '명 · 행을 누르면 상세·권한 관리</div>' +
    '<div class="row"><input id="uq" placeholder="이메일·이름·회사 검색" value="' + esc(userQuery.q) + '"/>' +
    '<select id="up"><option value="">전체 요금제</option>' + Object.keys(PLAN_LABEL).map(function (p) { return '<option value="' + p + '"' + (userQuery.plan === p ? " selected" : "") + ">" + PLAN_LABEL[p] + "</option>"; }).join("") + "</select>" +
    '<button class="btn" id="us">검색</button></div>' +
    '<div class="panel tablewrap"><table><thead><tr><th>이메일</th><th>이름·회사</th><th>요금제</th><th>상태</th><th>검증</th><th>키</th><th>토큰</th><th>데이터 동의</th><th>가입</th><th>최근 로그인</th></tr></thead><tbody>' +
    (d.users.length ? d.users.map(function (u) {
      return '<tr class="click" data-id="' + u.id + '"><td>' + esc(u.email) + (u.role === "admin" ? " " + badge("api", "관리자") : "") + "</td><td>" + esc(u.name || "-") + (u.company ? '<div class="muted">' + esc(u.company) + "</div>" : "") + "</td><td>" + badge(u.effectivePlan === "free" ? "x" : "done", PLAN_LABEL[u.effectivePlan]) + (u.plan_expires_at ? '<div class="muted">~' + t(u.plan_expires_at) + "</div>" : "") + "</td><td>" + badge(u.status, u.status === "active" ? "정상" : "정지") + "</td><td>" + n(u.verification_count) + "</td><td>" + n(u.key_count) + "</td><td>" + n(u.tokens) + "</td><td>" + (u.data_consent ? "동의" : "-") + "</td><td>" + t(u.created_at) + "</td><td>" + t(u.last_login_at) + "</td></tr>";
    }).join("") : '<tr><td colspan="10" class="empty">회원이 없어요.</td></tr>') +
    "</tbody></table></div>" + pager(d.total, userQuery.page, function (p) { userQuery.page = p; go("users"); });
  $("us").onclick = function () { userQuery.q = $("uq").value; userQuery.plan = $("up").value; userQuery.page = 0; go("users"); };
  $("uq").addEventListener("keydown", function (e) { if (e.key === "Enter") $("us").click(); });
  bindPager();
  document.querySelectorAll("tr.click").forEach(function (tr) { tr.onclick = function () { openUser(tr.getAttribute("data-id")); }; });
}

var pagerCb = null;
function pager(total, page, cb) {
  pagerCb = cb;
  var pages = Math.ceil(total / 50);
  if (pages <= 1) return "";
  return '<div class="row"><button class="btn" id="pgPrev"' + (page <= 0 ? " disabled" : "") + '>이전</button><span class="muted">' + (page + 1) + " / " + pages + '</span><button class="btn" id="pgNext"' + (page >= pages - 1 ? " disabled" : "") + ">다음</button></div>";
}
function bindPager() {
  var p = $("pgPrev"), x = $("pgNext");
  var cur = state.tab === "users" ? userQuery.page : vQuery.page;
  if (p) p.onclick = function () { pagerCb(cur - 1); };
  if (x) x.onclick = function () { pagerCb(cur + 1); };
}

async function openUser(id) {
  var d = await api("/api/admin/users/" + id), u = d.user;
  var expires = u.plan_expires_at ? new Date(u.plan_expires_at).toISOString().slice(0, 10) : "";
  modal('<h1 style="font-size:17px;">' + esc(u.email) + '</h1><div class="sub">회원 #' + u.id + " · 가입 " + t(u.created_at) + " · 최근 로그인 " + t(u.last_login_at) + "</div>" +
    '<div class="panel"><h2>요금제 · 권한</h2><div class="row">' +
      '<label class="muted">요금제</label><select id="mPlan">' + Object.keys(PLAN_LABEL).map(function (p) { return '<option value="' + p + '"' + (u.plan === p ? " selected" : "") + ">" + PLAN_LABEL[p] + "</option>"; }).join("") + "</select>" +
      '<label class="muted">만료일</label><input id="mExp" type="date" value="' + expires + '"/>' +
      '<label class="muted">역할</label><select id="mRole"><option value="user"' + (u.role === "user" ? " selected" : "") + '>일반</option><option value="admin"' + (u.role === "admin" ? " selected" : "") + ">관리자</option></select>" +
      '<button class="btn primary" id="mSave">저장</button></div>' +
      '<div class="row"><label class="muted">토큰 ' + n(u.tokens) + '개 보유 →</label><input id="mTok" type="number" placeholder="지급(+) / 회수(−)" style="width:150px"/><button class="btn" id="mTokBtn">반영</button>' +
      '<span style="flex:1"></span><button class="btn ' + (u.status === "active" ? "danger" : "") + '" id="mStatus">' + (u.status === "active" ? "이용 정지" : "정지 해제") + "</button></div>" +
      '<div class="muted">데이터 활용 동의: ' + (u.data_consent ? "동의 (" + t(u.data_consent_at) + ")" : "미동의") + " · 회사: " + esc(u.company || "-") + "</div><div class=\\"err\\" id=\\"mErr\\"></div></div>" +
    '<div class="panel"><h2>최근 검증</h2><div class="tablewrap"><table><tbody>' + (d.verifications.length ? d.verifications.map(function (v) { return '<tr class="click" data-v="' + v.id + '"><td>' + badge(v.overall_tone || v.status, v.overall_tone ? VERDICT_LABEL[v.overall_tone] : v.status) + "</td><td>" + esc(v.preview) + "</td><td>" + t(v.created_at) + "</td></tr>"; }).join("") : '<tr><td class="empty">없음</td></tr>') + "</tbody></table></div></div>" +
    '<div class="panel"><h2>API 키</h2>' + (d.apiKeys.length ? d.apiKeys.map(function (k) { return "<div>" + badge(k.status, k.status) + " " + esc(k.label) + " <code>" + esc(k.maskedKey) + "</code> · " + n(k.usedThisMonth) + "/" + n(k.monthlyQuota) + "</div>"; }).join("") : '<div class="empty">없음</div>') + "</div>" +
    '<div class="panel"><h2>로그인 세션</h2>' + (d.sessions.length ? d.sessions.map(function (s) { return '<div class="muted">' + t(s.last_seen_at) + " · " + esc(s.ip) + " · " + esc((s.user_agent || "").slice(0, 60)) + "</div>"; }).join("") : '<div class="empty">없음</div>') + "</div>");
  async function patch(body) { try { await api("/api/admin/users/" + id, { method: "PATCH", body: body }); closeModal(); go("users"); } catch (e) { $("mErr").textContent = e.message; } }
  $("mSave").onclick = function () { patch({ plan: $("mPlan").value, planExpiresAt: $("mExp").value || null, role: $("mRole").value }); };
  $("mTokBtn").onclick = function () { patch({ grantTokens: Number($("mTok").value) }); };
  $("mStatus").onclick = function () { if (confirm(u.status === "active" ? "이 회원의 이용을 정지할까요? 로그인 세션이 모두 끊어집니다." : "정지를 해제할까요?")) patch({ status: u.status === "active" ? "suspended" : "active" }); };
  document.querySelectorAll("tr[data-v]").forEach(function (tr) { tr.onclick = function () { openVerification(tr.getAttribute("data-v")); }; });
}

// ── 검증 기록 ──
var vQuery = { source: "", status: "", tone: "", domain: "", q: "", page: 0 };
async function renderVerifications() {
  var qs = new URLSearchParams(vQuery).toString();
  var d = await api("/api/admin/verifications?" + qs);
  function sel(id, opts, cur) { return '<select id="' + id + '">' + opts.map(function (o) { return '<option value="' + o[0] + '"' + (cur === o[0] ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select>"; }
  $("main").innerHTML = '<h1>검증 기록</h1><div class="sub">총 ' + n(d.total) + "건 · 원문 열람은 감사 로그에 남습니다</div>" +
    '<div class="row">' + sel("vs", [["", "전체 경로"], ["web", "웹"], ["kakao", "카카오"], ["api", "API"]], vQuery.source) +
    sel("vst", [["", "전체 상태"], ["done", "완료"], ["pending", "진행 중"], ["error", "오류"]], vQuery.status) +
    sel("vt", [["", "전체 총평"], ["confirmed", "확인됨"], ["uncertain", "보류 포함"], ["false", "오류 포함"]], vQuery.tone) +
    '<input id="vd" placeholder="분야(예: 법률)" value="' + esc(vQuery.domain) + '" style="width:120px"/><input id="vq" placeholder="원문 검색" value="' + esc(vQuery.q) + '"/><button class="btn" id="vgo">조회</button></div>' +
    '<div class="panel tablewrap"><table><thead><tr><th>상태</th><th>경로</th><th>이용자</th><th>분야</th><th>주장</th><th>내용</th><th>소요</th><th>시각</th></tr></thead><tbody>' +
    (d.items.length ? d.items.map(function (v) {
      var who = v.user_email || (v.client_key || "").replace(/^ip:/, "비회원 ");
      return '<tr class="click" data-v="' + v.id + '"><td>' + badge(v.status === "done" ? (v.overall_tone || "done") : v.status, v.status === "done" ? (VERDICT_LABEL[v.overall_tone] || "완료") : v.status === "pending" ? "진행 중" : "오류") + (v.from_cache ? " " + badge("x", "캐시") : "") + "</td><td>" + badge(v.source, v.source) + "</td><td>" + esc(who) + (v.data_consent ? ' <span class="badge b-done">데이터</span>' : "") + "</td><td>" + esc(v.overall_domain || "-") + "</td><td>" + n(v.claim_count) + (v.false_count ? ' <span class="muted">(오류 ' + v.false_count + ")</span>" : "") + "</td><td>" + esc(v.preview) + "</td><td>" + (v.elapsed_ms ? (v.elapsed_ms / 1000).toFixed(1) + "s" : "-") + "</td><td>" + t(v.created_at) + "</td></tr>";
    }).join("") : '<tr><td colspan="8" class="empty">기록이 없어요.</td></tr>') + "</tbody></table></div>" +
    pager(d.total, vQuery.page, function (p) { vQuery.page = p; go("verifications"); });
  $("vgo").onclick = function () { vQuery = { source: $("vs").value, status: $("vst").value, tone: $("vt").value, domain: $("vd").value, q: $("vq").value, page: 0 }; go("verifications"); };
  $("vq").addEventListener("keydown", function (e) { if (e.key === "Enter") $("vgo").click(); });
  bindPager();
  document.querySelectorAll("tr[data-v]").forEach(function (tr) { tr.onclick = function () { openVerification(tr.getAttribute("data-v")); }; });
}

function necHtml(nec) {
  if (!nec) return "";
  var sim = (nec.proximity.similar || []).map(function (s) { return '<li><a href="' + esc(safeUrl(s.url)) + '" target="_blank" rel="noopener">' + esc(s.value) + "</a> " + esc(s.title || "") + " (" + Number(s.similarity).toFixed(2) + ")</li>"; }).join("");
  var unc = (nec.uncovered || []).map(function (u) { return "<li>" + esc(u.area) + " → " + esc(u.howToCheck) + "</li>"; }).join("");
  var checks = (nec.formatError.checks || []).filter(function (c) { return c.score > 0; }).map(function (c) { return esc(c.name) + " " + c.score + ": " + esc(c.note); }).join("<br/>");
  return '<div style="margin-top:8px;padding:9px 11px;border-radius:10px;background:#FCFAFF;border:1px solid #EDE3FA;">' +
    "<b>부존재 신뢰도 " + nec.score + " · " + esc(nec.gradeLabel) + "</b> <span class=\\"muted\\">" + esc(nec.identifier.canonical) + " / " + esc(nec.identifier.searchSpace) + "</span><br/>" +
    '<div style="margin:3px 0;">' + esc(nec.summary || "") + "</div>" +
    '<span class="muted">C ' + nec.coverage.value + (nec.coverage.logical ? "(형식상 배제)" : "") + " · F " + nec.formatError.value + " · P " + nec.proximity.value + " → " + nec.weights.w1 + "·C + " + nec.weights.w2 + "·F + " + nec.weights.w3 + "·(1−P)</span>" +
    (checks ? '<div class="muted" style="margin-top:4px;">' + checks + "</div>" : "") +
    (sim ? '<div style="margin-top:4px;">유사 실재 항목<ul style="margin:2px 0 0 16px;padding:0;">' + sim + "</ul></div>" : "") +
    (unc ? '<div style="margin-top:4px;">미탐색 영역<ul style="margin:2px 0 0 16px;padding:0;">' + unc + "</ul></div>" : "") + "</div>";
}

async function openVerification(id) {
  var v = await api("/api/admin/verifications/" + id), r = v.result;
  var claims = r && r.claims ? r.claims.map(function (c) {
    var src = (c.sources || []).map(function (s) { return '<div><a href="' + esc(safeUrl(s.url)) + '" target="_blank" rel="noopener">' + esc(s.title || s.url) + "</a></div>"; }).join("");
    return '<div class="claim">' + badge(c.verdict, VERDICT_LABEL[c.verdict] || c.verdict) + " " + badge("x", VIA_LABEL[c.verified_via] || c.verified_via || "웹") + " <b>" + esc(c.text) + '</b><div class="muted" style="margin-top:4px;">' + esc(c.domain) + " · " + esc(c.explanation || "") + "</div>" + src + necHtml(c.nec) + "</div>";
  }).join("") : '<div class="empty">' + esc(v.error || "결과가 아직 없어요.") + "</div>";
  modal('<h1 style="font-size:17px;">검증 ' + esc(v.id) + '</h1><div class="sub">' + esc(v.source) + " · " + t(v.created_at) + (v.elapsed_ms ? " · " + (v.elapsed_ms / 1000).toFixed(1) + "초" : "") + (v.data_consent ? " · 데이터 활용 동의" : "") + ' · <a href="/r/' + esc(v.id) + '" target="_blank">결과 페이지</a></div>' +
    '<div class="input-block">' + esc(v.input) + "</div>" +
    (r && r.overall ? '<div class="panel"><b>' + esc(r.overall.label) + "</b> — " + esc(r.overall.detail) + "</div>" : "") + claims);
}

// ── API · 과금 ──
async function renderApi() {
  var month = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 7);
  var keys = await api("/api/admin/api-keys");
  $("main").innerHTML = '<h1>API · 과금</h1><div class="sub">B2B 고객이 발급한 키와 월별 사용량</div>' +
    '<div class="panel tablewrap"><h2>API 키</h2><table><thead><tr><th>고객</th><th>키</th><th>상태</th><th>이번 달</th><th>월 한도</th><th>분당</th><th>데이터 제공</th><th>최근 사용</th><th></th></tr></thead><tbody>' +
    (keys.keys.length ? keys.keys.map(function (k) {
      return "<tr><td>" + esc(k.ownerEmail) + (k.ownerCompany ? '<div class="muted">' + esc(k.ownerCompany) + "</div>" : "") + "</td><td>" + esc(k.label) + "<div><code>" + esc(k.maskedKey) + "</code></div></td><td>" + badge(k.status, k.status === "active" ? "사용 중" : "폐기") + "</td><td>" + n(k.usedThisMonth) + '</td><td><input data-q="' + k.id + '" type="number" value="' + k.monthlyQuota + '" style="width:90px"/></td><td><input data-r="' + k.id + '" type="number" value="' + k.ratePerMin + '" style="width:64px"/></td><td><input data-s="' + k.id + '" type="checkbox"' + (k.dataSharing ? " checked" : "") + "/></td><td>" + t(k.lastUsedAt) + '</td><td><button class="btn" data-save="' + k.id + '">저장</button> ' + (k.status === "active" ? '<button class="btn danger" data-revoke="' + k.id + '">폐기</button>' : "") + "</td></tr>";
    }).join("") : '<tr><td colspan="9" class="empty">발급된 키가 없어요.</td></tr>') + "</tbody></table>" +
    '<div class="muted" style="margin-top:8px;">데이터 제공은 고객사와의 계약에서 데이터셋 활용을 허용받은 경우에만 켜세요. 켜진 이후의 검증만 데이터셋 대상이 됩니다.</div></div>' +
    '<div class="panel"><h2>월별 과금 리포트</h2><div class="row"><input id="bm" type="month" value="' + month + '"/><button class="btn" id="bgo">조회</button><a class="btn" id="bcsv" href="#">CSV 내려받기</a></div><div id="bill" class="tablewrap"></div></div>';
  document.querySelectorAll("[data-save]").forEach(function (b) {
    b.onclick = async function () {
      var id = b.getAttribute("data-save");
      try { await api("/api/admin/api-keys/" + id, { method: "PATCH", body: { monthlyQuota: Number(document.querySelector('[data-q="' + id + '"]').value), ratePerMin: Number(document.querySelector('[data-r="' + id + '"]').value), dataSharing: document.querySelector('[data-s="' + id + '"]').checked } }); b.textContent = "저장됨"; } catch (e) { alert(e.message); }
    };
  });
  document.querySelectorAll("[data-revoke]").forEach(function (b) {
    b.onclick = async function () { if (!confirm("이 키를 폐기할까요? 고객 서비스의 호출이 즉시 실패합니다.")) return; await api("/api/admin/api-keys/" + b.getAttribute("data-revoke"), { method: "PATCH", body: { status: "revoked" } }); go("api"); };
  });
  async function loadBill() {
    var m = $("bm").value, d = await api("/api/admin/billing?month=" + m);
    $("bcsv").href = "/api/admin/billing?format=csv&month=" + m;
    $("bill").innerHTML = "<table><thead><tr><th>고객</th><th>키</th><th>과금 호출</th><th>캐시 재사용</th><th>전체 요청</th></tr></thead><tbody>" +
      (d.rows.length ? d.rows.map(function (r) { return "<tr><td>" + esc(r.email) + (r.company ? " · " + esc(r.company) : "") + "</td><td>" + esc(r.label) + "</td><td><b>" + n(r.billable_calls) + "</b></td><td>" + n(r.cached_calls) + "</td><td>" + n(r.total_requests) + "</td></tr>"; }).join("") : '<tr><td colspan="5" class="empty">이 달 사용 기록이 없어요.</td></tr>') + "</tbody></table>";
  }
  $("bgo").onclick = loadBill;
  loadBill();
}

// ── 데이터셋 ──
async function renderDataset() {
  var s = await api("/api/admin/dataset/stats"), ex = await api("/api/admin/dataset/exports");
  var domains = Array.from(new Set(s.byDomainVerdict.map(function (r) { return r.domain; }).filter(Boolean)));
  $("main").innerHTML = '<h1>데이터셋 판매</h1><div class="sub">동의한 회원·계약된 API 고객의 검증만, 가명처리해 주장 단위로 반출합니다. 입력 원문·이메일·IP는 절대 포함되지 않습니다.</div>' +
    '<div class="grid">' + kpi("반출 가능 주장", n(s.eligibleClaims), "전체 주장 " + n(s.totalClaims) + " 중") + kpi("동의 회원", n(s.consentingUsers)) + kpi("데이터 제공 API 키", n(s.sharingKeys)) + kpi("부존재 신뢰도 포함", n(s.necClaims), "지어낸 판례·문헌 탐지 레코드") + "</div>" +
    '<div class="panel tablewrap"><h2>분야 × 판정</h2><table><thead><tr><th>분야</th><th>확인됨</th><th>사실과 다름</th><th>판단 보류</th></tr></thead><tbody>' +
    (domains.length ? domains.map(function (d) { function c(v) { var r = s.byDomainVerdict.find(function (x) { return x.domain === d && x.verdict === v; }); return n(r ? r.n : 0); } return "<tr><td>" + esc(d) + "</td><td>" + c("confirmed") + "</td><td>" + c("false") + "</td><td>" + c("uncertain") + "</td></tr>"; }).join("") : '<tr><td colspan="4" class="empty">아직 반출 가능한 데이터가 없어요.</td></tr>') + "</tbody></table></div>" +
    '<div class="panel"><h2>새 반출 만들기</h2><div class="desc">조건을 고르고 미리보기로 가명처리 결과를 확인한 뒤 반출하세요. 반출 링크는 만들 때 한 번만 표시됩니다.</div>' +
      '<div class="row"><span class="muted">분야</span>' + (domains.length ? domains.map(function (d) { return '<label><input type="checkbox" class="fd" value="' + esc(d) + '"/> ' + esc(d) + "</label>"; }).join(" ") : '<span class="muted">(전체)</span>') + "</div>" +
      '<div class="row"><span class="muted">판정</span><label><input type="checkbox" class="fv" value="confirmed"/> 확인됨</label><label><input type="checkbox" class="fv" value="false"/> 사실과 다름</label><label><input type="checkbox" class="fv" value="uncertain"/> 판단 보류</label></div>' +
      '<div class="row"><span class="muted">기간</span><input id="ff" type="date"/> ~ <input id="ft" type="date"/><label><input type="checkbox" id="fo"/> 공식 대조·부존재 판정만</label><label><input type="checkbox" id="fdd" checked/> 중복 주장 제거</label><button class="btn" id="fprev">미리보기</button></div>' +
      '<div id="prev"></div>' +
      '<div class="row"><input id="eb" placeholder="구매처(회사명)" style="flex:1;min-width:180px"/><input id="ep" placeholder="제공 목적(계약서 기재 목적)" style="flex:2;min-width:220px"/></div>' +
      '<div class="row"><select id="efmt"><option value="jsonl">JSONL</option><option value="csv">CSV</option></select><input id="eprice" type="number" placeholder="금액(원, 선택)" style="width:140px"/><label class="muted">유효 <input id="edays" type="number" value="7" style="width:60px"/>일</label><label class="muted">최대 <input id="emax" type="number" value="5" style="width:60px"/>회 다운로드</label><button class="btn primary" id="ego">반출 링크 만들기</button></div>' +
      '<div id="eout"></div></div>' +
    '<div class="panel tablewrap"><h2>반출 기록</h2><table><thead><tr><th>#</th><th>구매처 · 목적</th><th>건수</th><th>형식</th><th>금액</th><th>다운로드</th><th>만료</th><th>상태</th><th></th></tr></thead><tbody>' +
    (ex.exports.length ? ex.exports.map(function (e) { var expired = e.expires_at < Date.now(); return "<tr><td>" + e.id + "</td><td><b>" + esc(e.buyer) + '</b><div class="muted">' + esc(e.purpose) + "</div></td><td>" + n(e.record_count) + "</td><td>" + esc(e.format) + "</td><td>" + (e.price_krw != null ? n(e.price_krw) + "원" : "-") + "</td><td>" + e.download_count + "/" + e.max_downloads + "</td><td>" + t(e.expires_at) + "</td><td>" + badge(e.status === "active" && !expired ? "active" : "revoked", e.status !== "active" ? "회수" : expired ? "만료" : "유효") + "</td><td>" + (e.status === "active" && !expired ? '<button class="btn danger" data-rv="' + e.id + '">회수</button>' : "") + "</td></tr>"; }).join("") : '<tr><td colspan="9" class="empty">반출 기록이 없어요.</td></tr>') + "</tbody></table></div>";
  function filters() {
    var f = { domains: Array.from(document.querySelectorAll(".fd:checked")).map(function (x) { return x.value; }), verdicts: Array.from(document.querySelectorAll(".fv:checked")).map(function (x) { return x.value; }), onlyOfficial: $("fo").checked, dedupe: $("fdd").checked };
    if ($("ff").value) f.from = new Date($("ff").value + "T00:00:00+09:00").getTime();
    if ($("ft").value) f.to = new Date($("ft").value + "T00:00:00+09:00").getTime() + 864e5;
    return f;
  }
  $("fprev").onclick = async function () {
    var p = await api("/api/admin/dataset/preview", { method: "POST", body: { filters: filters() } });
    $("prev").innerHTML = '<div class="muted" style="margin-bottom:6px;">조건에 맞는 주장 ' + n(p.count) + "건 (중복 제거 전) · 앞 " + p.sample.length + "건 미리보기</div><pre>" + esc(p.sample.map(function (r) { return JSON.stringify(r); }).join("\\n")) + "</pre>";
  };
  $("ego").onclick = async function () {
    if (!confirm("가명처리된 데이터를 반출하고 링크를 만듭니다. 이 반출은 감사 로그와 제3자 제공 기록에 남습니다. 계속할까요?")) return;
    try {
      var r = await api("/api/admin/dataset/exports", { method: "POST", body: { filters: filters(), buyer: $("eb").value, purpose: $("ep").value, format: $("efmt").value, priceKrw: $("eprice").value, validDays: Number($("edays").value), maxDownloads: Number($("emax").value) } });
      $("eout").innerHTML = '<div class="muted" style="margin:8px 0 4px;">' + n(r.recordCount) + "건 반출 완료. 이 링크를 구매처에 전달하세요 — 다시 표시되지 않습니다.</div><div class=\\"copy\\">" + esc(r.downloadUrl) + "</div>";
    } catch (e) { $("eout").innerHTML = '<div class="err">' + esc(e.message) + "</div>"; }
  };
  document.querySelectorAll("[data-rv]").forEach(function (b) { b.onclick = async function () { if (!confirm("이 반출 링크를 회수할까요?")) return; await api("/api/admin/dataset/exports/" + b.getAttribute("data-rv") + "/revoke", { method: "POST" }); go("dataset"); }; });
}

// ── 대화 ──
async function renderChats() {
  var d = await api("/api/admin/chats");
  $("main").innerHTML = '<h1>대화</h1><div class="sub">웹 AI 어시스턴트 + 카카오 채널 (180일 보관)</div><div class="panel tablewrap"><table><thead><tr><th>채널</th><th>대화 상대</th><th>메시지</th><th>마지막</th></tr></thead><tbody>' +
    (d.conversations.length ? d.conversations.map(function (c) { return '<tr class="click" data-c="' + esc(c.client_key) + '"><td>' + badge(c.channel, c.channel === "kakao" ? "카카오" : "웹") + "</td><td>" + esc(c.client_key) + "</td><td>" + n(c.turns) + "</td><td>" + t(c.last_at) + "</td></tr>"; }).join("") : '<tr><td colspan="4" class="empty">대화가 없어요.</td></tr>') + "</tbody></table></div>";
  document.querySelectorAll("tr[data-c]").forEach(function (tr) {
    tr.onclick = async function () {
      var m = await api("/api/admin/chats/" + encodeURIComponent(tr.getAttribute("data-c")));
      modal('<h1 style="font-size:16px;">' + esc(tr.getAttribute("data-c")) + "</h1>" + m.messages.map(function (x) { return '<div class="bubble ' + (x.role === "user" ? "user" : "assistant") + '"><div class="muted">' + (x.role === "user" ? "사용자" : "유메") + " · " + t(x.created_at) + "</div>" + esc(x.content) + "</div>"; }).join(""));
    };
  });
}

async function renderErrors() {
  var d = await api("/api/admin/errors");
  $("main").innerHTML = '<h1>오류</h1><div class="sub">최근 200건 (90일 보관)</div><div class="panel">' +
    (d.errors.length ? d.errors.map(function (e) { return '<details style="border-bottom:1px solid #F0E8FA;padding:8px 0;"><summary style="cursor:pointer;font-size:12.5px;"><code>' + esc(e.source) + "</code> " + esc(e.message) + ' <span class="muted">' + t(e.created_at) + "</span></summary>" + (e.stack ? "<pre>" + esc(e.stack) + "</pre>" : "") + "</details>"; }).join("") : '<div class="empty">기록된 오류가 없어요.</div>') + "</div>";
}

async function renderAudit() {
  var d = await api("/api/admin/audit");
  $("main").innerHTML = '<h1>감사 로그</h1><div class="sub">가입·동의 변경·관리자 열람·권한 변경·데이터 반출 기록</div><div class="panel tablewrap"><table><thead><tr><th>시각</th><th>행위자</th><th>동작</th><th>대상</th><th>내용</th><th>IP</th></tr></thead><tbody>' +
    (d.logs.length ? d.logs.map(function (l) { return "<tr><td>" + t(l.created_at) + "</td><td>" + esc(l.actor) + "</td><td><b>" + esc(l.action) + "</b></td><td>" + esc(l.target || "") + '</td><td class="muted">' + esc(l.detail ? JSON.stringify(l.detail) : "") + "</td><td>" + esc(l.ip || "") + "</td></tr>"; }).join("") : '<tr><td colspan="6" class="empty">기록이 없어요.</td></tr>') + "</tbody></table></div>";
}

async function renderDb() {
  var d = await api("/api/admin/db");
  $("main").innerHTML = '<h1>DB</h1><div class="sub">' + esc(d.engine) + " · " + (d.sizeBytes / 1024 / 1024).toFixed(2) + " MB</div>" +
    '<div class="panel"><div class="muted" style="margin-bottom:10px;">' + esc(d.persistentHint) + '</div><div class="row"><a class="btn primary" href="/api/admin/db/backup">전체 사본 내려받기 (NDJSON)</a><span class="muted">모든 테이블을 한 줄에 한 행씩 받아요. 개인정보가 들어 있으니 안전한 곳에만 보관하세요.</span></div></div>' +
    '<div class="panel tablewrap"><table><thead><tr><th>테이블</th><th>행 수</th></tr></thead><tbody>' + d.tables.map(function (x) { return "<tr><td><code>" + esc(x.name) + "</code></td><td>" + n(x.rows) + "</td></tr>"; }).join("") + "</tbody></table></div>";
}

boot();
</script>
</body>
</html>`;
}
