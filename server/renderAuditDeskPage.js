// 감사 데스크 — 특정 회사의 AI 서비스를 표본 감사하고, 비공개로 알리고, 영업 숫자를 세는 화면(/admin/audits).
//
// 탭 순서가 곧 기획안 4장의 절차다: 개요(약관 확인) → 질문·답변 → 재확인 → 보고서·발송 → 공개.
// 화면이 순서를 건너뛰게 두지 않는다 — 약관을 확인하기 전에는 검사가 안 돌고, 재확인이 남으면
// 발송 버튼이 잠긴다. 서버(auditDesk.js)가 같은 규칙을 한 번 더 지킨다.
// "지수 발행" 탭은 재확인을 마친 감사를 모아 VERILINE 할루시네이션 지수 한 호를 얼린다.
//
// DOM은 전부 textContent로 만든다(h 함수). 상대 서비스의 답변을 그대로 붙여넣는 화면이라
// innerHTML에 넣는 순간 남의 글이 이 관리자 화면에서 실행된다.
export function renderAuditDeskPage() {
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="robots" content="noindex, nofollow" />
<title>감사 데스크 · 베리라인</title>
<style>
  *, *::before, *::after { box-sizing:border-box; }
  :root {
    --bg:#07070b; --ink:#eceae4; --dim:rgba(236,234,228,.68); --faint:rgba(236,234,228,.44);
    --line:rgba(236,234,228,.11); --line2:rgba(236,234,228,.2); --card:rgba(255,255,255,.035); --field:rgba(0,0,0,.32);
    --blue:#4c7df6; --mid:#6d5ae0; --violet:#8b5cf6; --beam:linear-gradient(100deg,var(--blue),var(--mid) 52%,var(--violet));
    --good:#46c08a; --warn:#e0a53c; --bad:#e0745c; --mono:ui-monospace,SFMono-Regular,"SF Mono",Menlo,monospace;
  }
  body { margin:0; background:var(--bg); color:var(--ink); word-break:keep-all;
         font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display','Segoe UI','Noto Sans KR',sans-serif; -webkit-font-smoothing:antialiased; }
  body::before { content:""; position:fixed; inset:0; pointer-events:none; z-index:0;
    background: radial-gradient(720px 400px at 16% -8%, rgba(109,90,224,.2), transparent 62%), radial-gradient(600px 360px at 90% 4%, rgba(76,125,246,.12), transparent 66%); }
  main { position:relative; z-index:1; max-width:1320px; margin:0 auto; padding:20px clamp(14px,3vw,26px) 70px; }
  a { color:#a99bf5; }
  .bar { display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:14px; }
  .logo { display:flex; align-items:center; gap:9px; font:600 12px/1 var(--mono); letter-spacing:.2em; margin-right:6px; }
  .logo i { width:9px; height:9px; background:var(--beam); border-radius:2px; transform:rotate(45deg); }
  .sp { flex:1; }
  .ghost { font:inherit; font-size:12px; padding:7px 12px; border-radius:9px; cursor:pointer; white-space:nowrap; border:1px solid var(--line2);
           background:transparent; color:var(--dim); text-decoration:none; display:inline-block; }
  .ghost:hover { background:rgba(255,255,255,.06); color:var(--ink); }
  .ghost.on { background:var(--beam); border-color:transparent; color:#fff; font-weight:600; }
  .ghost[disabled] { opacity:.4; cursor:not-allowed; }
  .btn { font:inherit; font-size:12.5px; padding:8px 14px; border-radius:9px; cursor:pointer; border:0; background:var(--beam); color:#fff; font-weight:600; white-space:nowrap; }
  .btn[disabled] { opacity:.4; cursor:not-allowed; }
  .btn.warn { background:#3a2a14; color:#ffcf8a; border:1px solid rgba(224,165,60,.4); }
  .btn.bad { background:#3a1a14; color:#ffb4a2; border:1px solid rgba(224,116,92,.4); }
  .btn.ok { background:#123a28; color:#9ff0c6; border:1px solid rgba(70,192,138,.4); }
  .funnel { display:grid; grid-template-columns:repeat(8,minmax(0,1fr)); gap:1px; background:var(--line); border:1px solid var(--line); border-radius:14px; overflow:hidden; }
  @media (max-width:980px) { .funnel { grid-template-columns:repeat(4,minmax(0,1fr)); } }
  .funnel .m { background:#0a0a10; padding:10px 12px; }
  .funnel .k { font-size:11px; color:var(--faint); }
  .funnel .v { margin-top:4px; font-size:19px; font-weight:680; font-variant-numeric:tabular-nums; }
  .funnel .r { font-size:10.5px; color:var(--faint); margin-left:4px; font-weight:400; }
  .sub { display:flex; gap:14px; flex-wrap:wrap; align-items:center; font-size:12px; color:var(--dim); margin:10px 2px 14px; }
  .sub b { color:var(--ink); font-variant-numeric:tabular-nums; }
  .sprint { padding:3px 10px; border-radius:999px; border:1px solid var(--line2); }
  .sprint.focus { border-color:rgba(70,192,138,.5); color:#9ff0c6; } .sprint.narrow { border-color:rgba(224,165,60,.5); color:#ffcf8a; } .sprint.rethink { border-color:rgba(224,116,92,.5); color:#ffb4a2; }
  .split { display:grid; grid-template-columns:330px minmax(0,1fr); gap:12px; align-items:start; }
  @media (max-width:900px) { .split { grid-template-columns:1fr; } }
  .panel { border:1px solid var(--line); border-radius:16px; background:var(--card); overflow:hidden; }
  .panel > h2 { font-size:12px; margin:0; padding:12px 15px; font-weight:600; border-bottom:1px solid var(--line); display:flex; align-items:center; gap:8px; }
  .rows { max-height:min(72vh,760px); overflow:auto; }
  .row { width:100%; text-align:left; background:transparent; border:0; border-bottom:1px solid var(--line); padding:11px 14px; cursor:pointer; color:inherit; font:inherit; display:block; }
  .row:hover { background:rgba(255,255,255,.045); } .row.on { background:rgba(109,90,224,.17); }
  .row .t1 { display:flex; gap:7px; align-items:center; } .row .nm { font-size:13.5px; font-weight:620; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .row .t2 { margin-top:4px; font-size:11.5px; color:var(--faint); display:flex; gap:6px; align-items:center; }
  .pill { display:inline-block; font-size:10.5px; padding:2px 8px; border-radius:999px; border:1px solid var(--line2); color:var(--dim); white-space:nowrap; }
  .pill.g { border-color:rgba(70,192,138,.45); color:#9ff0c6; } .pill.w { border-color:rgba(224,165,60,.45); color:#ffcf8a; } .pill.b { border-color:rgba(224,116,92,.45); color:#ffb4a2; } .pill.v { border-color:rgba(139,92,246,.55); color:#cbbcff; }
  .dot { width:6px; height:6px; border-radius:50%; background:var(--warn); flex:none; }
  .newf { padding:12px 14px; border-bottom:1px solid var(--line); display:grid; gap:7px; }
  input, select, textarea { font:inherit; font-size:13px; color:var(--ink); background:var(--field); border:1px solid var(--line2); border-radius:9px; padding:8px 10px; width:100%; }
  textarea { resize:vertical; line-height:1.55; }
  input:focus, select:focus, textarea:focus { outline:none; border-color:var(--mid); box-shadow:0 0 0 3px rgba(109,90,224,.16); }
  label.f { display:block; font-size:11.5px; color:var(--faint); margin:0 0 4px; }
  .grid2 { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; } .grid3 { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; }
  @media (max-width:700px) { .grid2, .grid3 { grid-template-columns:1fr; } }
  .detail { min-height:300px; }
  .dh { padding:14px 16px; border-bottom:1px solid var(--line); display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
  .dh .ttl { font-size:16px; font-weight:680; letter-spacing:-.01em; }
  .tabs { display:flex; gap:6px; padding:10px 14px; border-bottom:1px solid var(--line); flex-wrap:wrap; }
  .body { padding:16px; display:grid; gap:14px; }
  .box { border:1px solid var(--line); border-radius:12px; padding:13px 14px; background:rgba(255,255,255,.02); }
  .box h3 { margin:0 0 8px; font-size:13px; font-weight:650; display:flex; align-items:center; gap:8px; }
  .help { font-size:12px; color:var(--faint); line-height:1.6; margin:4px 0 0; }
  .actions { display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-top:10px; }
  .item { border:1px solid var(--line); border-radius:12px; padding:12px 13px; display:grid; gap:8px; }
  .item .q { font-size:13.5px; font-weight:600; line-height:1.55; }
  .queue { display:flex; flex-wrap:wrap; gap:6px; align-items:center; padding:10px 14px; border-bottom:1px solid var(--line); }
  .chip { padding:4px 10px; font-size:12px; } .chip b { color:var(--text); margin-left:2px; }
  .item.active { border-color:var(--mid); box-shadow:0 0 0 2px rgba(109,90,224,.25); }
  mark { background:rgba(224,116,92,.4); color:#fff; border-radius:3px; padding:0 2px; }
  .item .meta { display:flex; gap:6px; align-items:center; flex-wrap:wrap; font-size:11.5px; color:var(--faint); }
  .shots { display:flex; gap:6px; flex-wrap:wrap; align-items:center; }
  .shots img { width:84px; height:64px; object-fit:cover; border-radius:6px; border:1px solid var(--line2); cursor:pointer; }
  .shot { position:relative; } .shot button { position:absolute; top:-6px; right:-6px; width:18px; height:18px; border-radius:50%; border:0; background:#3a1a14; color:#ffb4a2; font-size:11px; cursor:pointer; padding:0; line-height:18px; }
  .find { border:1px solid var(--line); border-radius:12px; padding:12px 13px; display:grid; gap:7px; }
  .find.confirmed { border-color:rgba(224,116,92,.45); } .find.excluded, .find.yume_wrong { opacity:.6; }
  .proof { margin:8px 0; padding:10px 12px; border:1px solid rgba(70,170,110,.45); border-radius:10px; background:rgba(70,170,110,.08); }
  .proof .ph { font-weight:700; margin-bottom:6px; } .proof mark { padding:0 3px; border-radius:3px; }
  .kv { display:grid; grid-template-columns:86px minmax(0,1fr); gap:8px; font-size:12.5px; line-height:1.6; }
  .kv b { color:var(--faint); font-weight:500; }
  .said { border-left:3px solid var(--bad); padding-left:8px; } .truth { border-left:3px solid var(--good); padding-left:8px; }
  .chk { display:grid; gap:6px; }
  .chk .c { display:grid; grid-template-columns:22px minmax(0,1fr); gap:8px; font-size:12.5px; padding:7px 0; border-top:1px solid var(--line); }
  .chk .c .mk { font-weight:800; } .chk .c.ok .mk { color:var(--good); } .chk .c.no .mk { color:var(--bad); }
  .chk .c .d { color:var(--faint); font-size:11.5px; margin-top:2px; }
  .nums { display:grid; grid-template-columns:repeat(auto-fit,minmax(110px,1fr)); gap:1px; background:var(--line); border:1px solid var(--line); border-radius:10px; overflow:hidden; }
  .nums div { background:#0a0a10; padding:9px 11px; } .nums .k { font-size:11px; color:var(--faint); } .nums .v { font-size:17px; font-weight:680; margin-top:3px; font-variant-numeric:tabular-nums; }
  pre.mail { white-space:pre-wrap; font:inherit; font-size:12.5px; line-height:1.7; background:var(--field); border:1px solid var(--line2); border-radius:9px; padding:10px 12px; margin:6px 0 0; }
  .empty { padding:36px 18px; text-align:center; color:var(--faint); font-size:13px; line-height:1.8; }
  .toast { position:fixed; left:50%; bottom:22px; transform:translateX(-50%); background:#1b1830; border:1px solid var(--line2); color:var(--ink); padding:10px 16px; border-radius:10px; font-size:13px; z-index:50; max-width:min(92vw,640px); }
  .toast.err { border-color:rgba(224,116,92,.6); color:#ffd0c4; }
  table.t { width:100%; border-collapse:collapse; font-size:12.5px; font-variant-numeric:tabular-nums; }
  table.t th, table.t td { text-align:left; padding:7px 8px; border-bottom:1px solid var(--line); }
  table.t th { color:var(--faint); font-weight:500; font-size:11.5px; }
  .mono { font-family:var(--mono); font-size:11.5px; word-break:break-all; }
  .lint { color:#ffcf8a; font-size:12px; }
</style>
</head>
<body>
<main>
  <div class="bar">
    <span class="logo"><i></i>AUDIT DESK</span>
    <button class="ghost on" id="tabDesk">감사 데스크</button>
    <button class="ghost" id="tabIndex">지수 발행</button>
    <span class="sp"></span>
    <a class="ghost" href="/hallucination-index" target="_blank" rel="noopener">공개 지수</a>
    <a class="ghost" href="/admin/desk">의뢰 데스크</a>
    <a class="ghost" href="/admin/studio">스튜디오</a>
  </div>
  <div id="view"></div>
</main>
<script>
(function () {
  "use strict";
  // ── 작은 도구들 ──
  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else if (k.slice(0, 2) === "on" && typeof v === "function") el.addEventListener(k.slice(2), v);
      else if (k === "value") el.value = v;
      else if (k === "checked") el.checked = !!v;
      else if (k === "disabled") el.disabled = !!v;
      else el.setAttribute(k, v === true ? "" : String(v));
    }
    for (var i = 2; i < arguments.length; i++) add(el, arguments[i]);
    return el;
  }
  function add(el, c) {
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)) { c.forEach(function (x) { add(el, x); }); return; }
    el.appendChild(typeof c === "object" ? c : document.createTextNode(String(c)));
  }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }
  var toastTimer;
  function toast(msg, err) {
    var old = document.querySelector(".toast"); if (old) old.remove();
    var t = h("div", { class: "toast" + (err ? " err" : ""), role: "status", text: msg });
    document.body.appendChild(t); clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.remove(); }, err ? 6000 : 2600);
  }
  async function api(method, url, body) {
    var r = await fetch(url, { method: method, credentials: "same-origin", headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
    if (r.status === 401) { location.href = "/admin/audits"; throw new Error("로그인이 필요해요."); }
    var d = await r.json().catch(function () { return {}; });
    if (!r.ok) throw new Error(d.error || ("요청 실패 (" + r.status + ")"));
    return d;
  }
  function run(fn) { return function (e) { if (e && e.preventDefault) e.preventDefault(); Promise.resolve().then(fn).catch(function (err) { toast(err.message, true); }); }; }
  var n = function (v) { return Number(v || 0).toLocaleString("ko-KR"); };
  var pct = function (v) { return v === null || v === undefined ? "—" : Number(v).toFixed(1) + "%"; };
  function kdt(ms) { if (!ms) return ""; var d = new Date(Number(ms)); return d.toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }); }
  function kd(ms) { if (!ms) return ""; return new Date(Number(ms)).toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" }); }
  function toLocalInput(ms) { var d = new Date(Number(ms) || Date.now()); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); }
  function fromLocalInput(v) { if (!v) return null; var t = new Date(v).getTime(); return isFinite(t) ? t : null; }
  function dateInput(ms) { var d = new Date(Number(ms) || Date.now()); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); }
  // 한국 시간 자정 기준 날짜 → ms
  function kstMidnight(v) { if (!v) return null; return new Date(v + "T00:00:00+09:00").getTime(); }
  async function copy(text) { try { await navigator.clipboard.writeText(text); toast("복사했어요."); } catch (e) { toast("복사하지 못했어요.", true); } }

  var STAGE_CLASS = { prospect: "", testing: "v", reviewed: "v", sent: "w", followed_up: "w", replied: "g", meeting: "g", full_audit: "g", paid_intent: "g", won: "g", declined: "b", no_reply: "", excluded: "b" };
  var TERMINAL = { declined: 1, no_reply: 1, excluded: 1, won: 1 };
  var SEVERITY = { hallucinated: "지어냄", partial: "부분 불일치", false: "원문과 불일치", nonexistent: "존재하지 않는 근거", safe: "정확", confirmed: "원문과 일치" };
  var KIND = { probe: "기준 문항", template: "주제 질문", custom: "직접 질문" };
  var ITEM_STATUS = { new: ["답변 전", ""], answered: ["검사 전", "w"], checking: ["검사 중", "v"], checked: ["검사 완료", "g"], failed: ["검사 실패", "b"] };

  var state = { meta: null, list: [], funnel: null, sel: Number(location.hash.slice(1)) || null, detail: null, tab: "overview", view: "desk", poll: null, index: null, issueSel: null };
  var view = document.getElementById("view");

  document.getElementById("tabDesk").onclick = function () { state.view = "desk"; this.classList.add("on"); document.getElementById("tabIndex").classList.remove("on"); render(); };
  document.getElementById("tabIndex").onclick = function () { state.view = "index"; this.classList.add("on"); document.getElementById("tabDesk").classList.remove("on"); loadIndex(); };

  async function boot() {
    state.meta = await api("GET", "/api/admin/audits/meta");
    await loadList();
    if (state.sel) await loadDetail(state.sel);
    render();
  }
  async function loadList() { var d = await api("GET", "/api/admin/audits"); state.list = d.audits; state.funnel = d.funnel; state.queue = d.queue || []; }
  async function loadDetail(id) {
    try { state.detail = await api("GET", "/api/admin/audits/" + id); state.sel = id; location.hash = String(id); }
    catch (e) { state.detail = null; state.sel = null; toast(e.message, true); }
    schedulePoll();
  }
  function schedulePoll() {
    clearTimeout(state.poll);
    var d = state.detail;
    var busy = d && (d.checking || d.items.some(function (i) { return i.status === "checking"; }));
    if (busy) state.poll = setTimeout(async function () { await loadDetail(state.sel); await loadList(); render(); }, 4000);
  }
  async function refresh() { await loadList(); if (state.sel) await loadDetail(state.sel); render(); }

  function render() {
    if (state.view === "index") return renderIndex();
    renderDesk();
    // 재확인 하나를 처리하면 다음 남은 후보로 넘어간다.
    if (state.focusNext) {
      state.focusNext = false;
      var next = document.querySelector(".find.pending");
      if (next) next.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }

  // ── 감사 데스크 ──
  function renderDesk() {
    clear(view);
    view.appendChild(funnelView());
    var listPanel = h("div", { class: "panel" }, h("h2", null, "감사 건", h("span", { class: "sp" }), h("span", { class: "pill", text: n(state.list.length) + "건" })), queueView(), newForm(), listRows());
    var detail = h("div", { class: "panel detail" }, state.detail ? detailView() : h("div", { class: "empty" }, "왼쪽에서 감사 건을 고르거나 새로 만드세요.", h("br"), "기획안 순서: 약관 확인 → 질문 20~30개 → 손으로 입력·캡처 → 베리라인 검사 → 원문 재확인 → 보고서 → 발송 → 1주 뒤 후속 한 번."));
    view.appendChild(h("div", { class: "split" }, listPanel, detail));
  }

  function funnelView() {
    var f = state.funnel || { steps: [] };
    var grid = h("div", { class: "funnel" }, f.steps.map(function (s) {
      return h("div", { class: "m" }, h("div", { class: "k", text: s.label }), h("div", { class: "v" }, n(s.n), s.rate !== null ? h("span", { class: "r", text: s.rate + "%" }) : null));
    }));
    var sp = f.sprint;
    var sprintEl = sp
      ? h("span", { class: "sprint " + sp.decision, title: "기획안 6-1 판단 기준 — 유료 의향 3곳 이상 집중 / 1~2곳 타깃 변경 / 0곳 재검토" }, "8주 스프린트 " + (sp.ended ? "종료" : sp.week + "주차") + " · 유료 의향 " + sp.paidIntent + "곳 → " + sp.label)
      : null;
    var startInput = h("input", { type: "date", value: sp ? dateInput(sp.start) : dateInput(Date.now()), style: "width:150px;padding:5px 8px" });
    return h("div", null, grid, h("div", { class: "sub" },
      sprintEl,
      h("span", null, "스프린트 시작 ", startInput, " ", h("button", { class: "ghost", onclick: run(async function () { await api("POST", "/api/admin/audits/sprint", { start: kstMidnight(startInput.value) }); toast("스프린트 시작일을 저장했어요."); await refresh(); }) }, "저장")),
      h("span", null, "유료 의향 금액 ", h("b", { text: n(f.revenue) + "원" })),
      h("span", null, "평균 소요 ", h("b", { text: f.avgMinutes ? f.avgMinutes + "분" : "—" })),
      h("span", null, "평균 API 비용 ", h("b", { text: f.avgCostKrw !== null && f.avgCostKrw !== undefined ? n(f.avgCostKrw) + "원" : "—" })),
      f.followupsDue ? h("span", { class: "pill w", text: "오늘 후속 연락 " + f.followupsDue + "건" }) : null));
  }

  function newForm() {
    var company = h("input", { placeholder: "회사 이름", maxlength: 120 });
    var service = h("input", { placeholder: "서비스 이름 (예: ○○ AI 상담)", maxlength: 120 });
    var domain = h("select", null, (state.meta.domains || []).map(function (d) { return h("option", { value: d, text: d }); }));
    var cat = h("select", null, Object.keys(state.meta.categories).map(function (k) { return h("option", { value: k, text: state.meta.categories[k] }); }));
    var form = h("form", { class: "newf", onsubmit: run(async function () {
      var r = await api("POST", "/api/admin/audits", { company: company.value, service_name: service.value, domain: domain.value, category: cat.value });
      company.value = ""; service.value = "";
      await loadList(); await loadDetail(r.id); state.tab = "overview"; render();
    }) }, company, service, h("div", { class: "grid2" }, domain, cat), h("button", { class: "btn", type: "submit" }, "감사 건 만들기"));
    // 후보 목록을 한 번에 — 한 줄에 한 곳(회사, 서비스, 업종, 주소, 메모). 노무→인사, 세무→공공으로 맞춘다.
    var bulk = h("textarea", { rows: 4, placeholder: "한 줄에 한 곳 — 회사, 서비스, 업종, 주소, 메모 (탭이나 쉼표로 구분)\\n예: 로무앤톡, 로무앤톡 AI 노무상담, 노무, , A군" });
    var more = h("details", { class: "newf" }, h("summary", { class: "help", style: "cursor:pointer", text: "후보 여러 곳 한꺼번에 등록" }), bulk,
      h("div", null, h("button", { class: "ghost", onclick: run(async function () { var r = await api("POST", "/api/admin/audits/import", { text: bulk.value }); toast(r.created + "곳을 등록했어요" + (r.skipped && r.skipped.length ? " (이미 있어 건너뜀 " + r.skipped.length + ")" : "") + "."); bulk.value = ""; await loadList(); render(); }) }, "등록")));
    return h("div", null, form, more);
  }

  // 오늘 할 일 — 같은 일끼리 묶어 한 번에 처리한다. 누르면 그 일이 남은 다음 건을 연다.
  function queueView() {
    var q = state.queue || [];
    if (!q.length) return null;
    return h("div", { class: "queue" }, h("span", { class: "help", text: "오늘 할 일" }), q.map(function (g) {
      return h("button", { class: "ghost chip", title: "누를 때마다 이 일이 남은 다음 건을 엽니다", onclick: run(async function () {
        var i = g.ids.indexOf(state.sel);
        var id = g.ids[(i + 1) % g.ids.length];
        var tab = { review: "review", send: "send", check: "items", answer: "items", questions: "items" }[g.key] || "overview";
        await loadDetail(id); state.tab = tab; render();
      }) }, g.label + " ", h("b", { text: String(g.ids.length) }));
    }));
  }

  function listRows() {
    if (!state.list.length) return h("div", { class: "empty", text: "아직 감사 건이 없어요." });
    return h("div", { class: "rows" }, state.list.map(function (a) {
      return h("button", { class: "row" + (a.id === state.sel ? " on" : ""), onclick: run(async function () { await loadDetail(a.id); state.tab = "overview"; render(); }) },
        h("div", { class: "t1" }, a.followupDue ? h("span", { class: "dot", title: "후속 연락할 날" }) : null, h("span", { class: "nm", text: a.company + (a.service_name ? " · " + a.service_name : "") }), h("span", { class: "sp" }), h("span", { class: "pill " + (STAGE_CLASS[a.stage] || ""), text: a.stageLabel })),
        h("div", { class: "t2" }, h("span", { text: a.domain }), a.next ? h("span", { text: "→ " + a.next }) : null, a.minutes ? h("span", { class: "sp" }) : null, a.minutes ? h("span", { text: a.minutes + "분" }) : null));
    }));
  }

  function detailView() {
    var d = state.detail, a = d.audit;
    var tabs = [["overview", "개요·약관"], ["items", "질문·답변 " + d.results.answered + "/" + d.items.length], ["review", "재확인" + (d.results.issues.pending ? " " + d.results.issues.pending : "")], ["send", "보고서·발송"], ["public", "공개·지수"]];
    var body = h("div", { class: "body" });
    ({ overview: overviewTab, items: itemsTab, review: reviewTab, send: sendTab, public: publicTab }[state.tab] || overviewTab)(body, d);
    return h("div", null,
      h("div", { class: "dh" }, h("span", { class: "ttl", text: a.company + (a.service_name ? " · " + a.service_name : "") }), h("span", { class: "pill " + (STAGE_CLASS[a.stage] || ""), text: state.meta.stages[a.stage] || a.stage }),
        d.checking ? h("span", { class: "pill v", text: "검사 도는 중…" }) : null, h("span", { class: "sp" }),
        h("button", { class: "ghost", onclick: run(async function () { if (!confirm("이 감사 건을 지울까요? 질문·답변·캡처가 모두 지워집니다.")) return; await api("DELETE", "/api/admin/audits/" + a.id); state.detail = null; state.sel = null; location.hash = ""; await refresh(); }) }, "삭제")),
      h("div", { class: "tabs" }, tabs.map(function (t) { return h("button", { class: "ghost" + (state.tab === t[0] ? " on" : ""), onclick: function () { state.tab = t[0]; render(); } }, t[1]); })),
      body);
  }

  function field(label, el) { return h("div", null, h("label", { class: "f", text: label }), el); }

  function overviewTab(body, d) {
    var a = d.audit;
    var f = {};
    function inp(k, ph, max) { f[k] = h("input", { value: a[k] || "", placeholder: ph || "", maxlength: max || 200 }); return f[k]; }
    var domain = h("select", null, state.meta.domains.map(function (x) { return h("option", { value: x, text: x, selected: x === a.domain }); }));
    var cat = h("select", null, Object.keys(state.meta.categories).map(function (k) { return h("option", { value: k, text: state.meta.categories[k], selected: k === a.category }); }));
    var methods = state.meta.inputMethods || { manual: "화면에 직접 입력" };
    var im = h("select", null, Object.keys(methods).map(function (k) { return h("option", { value: k, text: methods[k], selected: k === (a.input_method || "manual") }); }));
    f.notes = h("textarea", { rows: 3, value: a.notes || "", placeholder: "메모 (내부용)" });
    f.minutes_spent = h("input", { type: "number", min: 0, value: a.minutes_spent || 0 });
    body.appendChild(h("div", { class: "box" }, h("h3", null, "대상"),
      h("div", { class: "grid2" }, field("회사", inp("company", "", 120)), field("서비스", inp("service_name", "", 120))),
      h("div", { class: "grid3", style: "margin-top:10px" }, field("서비스 주소", inp("service_url", "https://", 400)), field("업종", domain), field("종류", cat)),
      h("div", { class: "grid3", style: "margin-top:10px" }, field("담당자", inp("contact_name", "이름", 60)), field("직책", inp("contact_role", "CTO · 제품 책임자 · AI 담당", 60)), field("담당자 이메일(개인)", inp("contact_email", "name@company.com", 200))),
      h("div", { class: "grid2", style: "margin-top:10px" }, field("어떻게 찾았나", inp("found_via", "링크드인 · 회사 블로그 · 채용공고 · 학습서 41장 리스트", 200)), field("들인 시간(분) — 비우면 자동 기록 " + Math.round(Number(a.work_ms || 0) / 60000) + "분", f.minutes_spent)),
      h("div", { class: "grid2", style: "margin-top:10px" }, field("질문 방법 — 보고서·메일의 '검사 방법' 문장이 이걸 따릅니다", im), h("p", { class: "help", style: "align-self:end", text: "공식 API로 공개된 모델(Claude·GPT API 등)을 감사할 때만 '공식 API'로 바꾸세요." })),
      h("div", { style: "margin-top:10px" }, field("메모", f.notes)),
      h("div", { class: "actions" }, h("button", { class: "btn", onclick: run(async function () {
        var body = { domain: domain.value, category: cat.value, input_method: im.value };
        Object.keys(f).forEach(function (k) { body[k] = f[k].value; });
        await api("PATCH", "/api/admin/audits/" + a.id, body); toast("저장했어요."); await refresh();
      }) }, "저장"))));

    // 약관
    var tosUrl = h("input", { value: a.tos_url || "", placeholder: "이용약관 주소" });
    var tosNote = h("textarea", { rows: 2, value: a.tos_note || "", placeholder: "확인한 조항 (자동화·크롤링·벤치마크·평가 목적 사용 금지 여부)" });
    function tos(v) { return run(async function () { await api("PATCH", "/api/admin/audits/" + a.id, { tos_url: tosUrl.value, tos_note: tosNote.value, tos_verdict: v }); toast(v === "ok" ? "약관 확인 완료 — 검사를 시작할 수 있어요." : v === "prohibited" ? "금지 조항이 있어 이 건은 제외했어요." : "보류로 적었어요."); await refresh(); }); }
    var verdict = { ok: ["문제없음", "g"], prohibited: ["금지 조항 있음 — 제외", "b"], unclear: ["애매함 — 보류", "w"] }[a.tos_verdict];
    body.appendChild(h("div", { class: "box" }, h("h3", null, "1단계 · 약관 확인", verdict ? h("span", { class: "pill " + verdict[1], text: verdict[0] + (a.tos_checked_at ? " · " + kd(a.tos_checked_at) : "") }) : h("span", { class: "pill w", text: "확인 전" })),
      h("p", { class: "help", text: "자동화 금지, 벤치마크·평가 목적 사용 금지 조항이 있으면 그 회사는 제외합니다(기획안 4-3). 이 도구는 상대 서비스를 자동으로 부르지 않습니다 — 질문은 사람이 일반 사용자 수준으로 손으로 넣습니다." }),
      h("div", { class: "grid2", style: "margin-top:10px" }, tosUrl, tosNote),
      h("div", { class: "actions" }, h("button", { class: "btn ok", onclick: tos("ok") }, "문제없음"), h("button", { class: "btn bad", onclick: tos("prohibited") }, "금지 조항 있음 — 제외"), h("button", { class: "btn warn", onclick: tos("unclear") }, "애매함 — 보류"))));

    // 진행 기록
    var tl = [["만든 날", a.created_at], ["약관 확인", a.tos_checked_at], ["발송", a.sent_at], ["후속 예정", a.followup_due_at], ["후속 연락", a.followed_up_at], ["답장", a.replied_at], ["미팅", a.meeting_at], ["무료 전체 검사", a.full_audit_at], ["유료 의향", a.paid_intent_at], ["종료", a.closed_at]].filter(function (x) { return x[1]; });
    body.appendChild(h("div", { class: "box" }, h("h3", null, "진행 기록"), h("table", { class: "t" }, h("tbody", null, tl.map(function (x) { return h("tr", null, h("th", { text: x[0] }), h("td", { text: kdt(x[1]) })); })))));
  }

  // ── 질문·답변 ──
  function itemsTab(body, d) {
    var a = d.audit;
    var comp = d.composition;
    body.appendChild(h("div", { class: "box" }, h("h3", null, "2단계 · 질문 세트", h("span", { class: "pill", text: d.items.length + "개 (권장 20~30)" })),
      h("p", { class: "help", text: "기준 문항은 법제처 원문으로 정답을 먼저 확정한 질문이라 채점이 확실합니다. 주제 질문은 실제 사용자가 하는 말 그대로이고, 답변 속 주장을 베리라인이 하나씩 원문과 대조합니다. 둘을 섞으세요. 해석이 갈리는 질문, 실존 인물·사건 당사자 정보는 넣지 않습니다." }),
      h("div", { class: "actions" }, Object.keys(comp).map(function (k) { var c = comp[k]; return h("span", { class: "pill " + (c.count >= c.target ? "g" : ""), text: c.label + " " + c.count + "/" + c.target }); })),
      h("div", { class: "actions" },
        h("button", { class: "btn", onclick: run(async function () { toast("법제처에서 정답을 확정하는 중… 30초쯤 걸려요."); var r = await api("POST", "/api/admin/audits/" + a.id + "/quickset"); toast("질문 " + r.added + "개를 넣었어요 (기준 문항 " + r.probes + " · 주제 질문 " + r.templates + ")."); await refresh(); }) }, "질문 세트 한 번에 (약 25개)"),
        // 공격형 세트 — 채점 결과가 있으면 무너진 유형에 몰아준다(약점 집중 2차).
        h("button", { class: "btn", title: "올해 개정·계산·틀린 값 압박·삭제 조문·벌칙 종류·없는 법률. 정답은 법제처 원문과 계산으로 확정합니다. 이미 채점한 결과가 있으면 무너진 유형에 문항을 몰아줍니다.", onclick: run(async function () { toast("공격형 문항을 만드는 중… 1분쯤 걸려요."); var r = await api("POST", "/api/admin/audits/" + a.id + "/attack", { size: 15 }); var fam = Object.keys(r.families || {}).map(function (k) { return ((state.meta.probeTypes || {})[k] || k) + " " + r.families[k]; }).join(" · "); toast("공격형 " + r.added + "개를 넣었어요" + (r.focused ? " (약점 집중)" : "") + " — " + fam); await refresh(); }) }, d.results.probe ? "약점 집중 2차 (공격형 약 15개)" : "공격형 세트 (약 15개)"),
        h("button", { class: "ghost", onclick: run(async function () { toast("법제처에서 정답을 확정하는 중… 20초쯤 걸려요."); var r = await api("POST", "/api/admin/audits/" + a.id + "/probes", { size: 8 }); toast("기준 문항 " + r.added + "개를 넣었어요."); await refresh(); }) }, "기준 문항 8개 더"),
        (function () {
          var sel = h("select", { style: "width:auto" }, d.topics.map(function (t) { return h("option", { value: t.key, text: t.label + " (" + t.count + ")" }); }));
          return h("span", { style: "display:flex;gap:6px" }, sel, h("button", { class: "ghost", onclick: run(async function () { var r = await api("POST", "/api/admin/audits/" + a.id + "/template", { topic: sel.value }); toast("주제 질문 " + r.added + "개를 넣었어요."); await refresh(); }) }, "주제 질문 추가"));
        })(),
        h("button", { class: "ghost", title: "회사·서비스·메모만 보고 이 서비스 이용자가 할 법한 질문을 씁니다. 상대 서비스는 부르지 않습니다.", onclick: run(async function () { toast("이 서비스에 맞춘 질문을 쓰는 중… 10초쯤 걸려요."); var r = await api("POST", "/api/admin/audits/" + a.id + "/tailored", { count: 6 }); toast("맞춤 질문 " + r.added + "개를 넣었어요. 어색한 건 지우세요."); await refresh(); }) }, "이 회사 맞춤 질문 6개")),
      copyToBlock(a, d),
      (function () {
        var q = h("input", { placeholder: "직접 질문 쓰기 — 실제 사용자가 할 법한 말로" });
        var t = h("select", { style: "width:auto" }, h("option", { value: "", text: "유형" }), Object.keys(state.meta.questionTypes).map(function (k) { return h("option", { value: k, text: state.meta.questionTypes[k] }); }));
        return h("form", { class: "actions", onsubmit: run(async function () { await api("POST", "/api/admin/audits/" + a.id + "/items", { question: q.value, qtype: t.value }); q.value = ""; await refresh(); }) }, q, t, h("button", { class: "ghost", type: "submit" }, "추가"));
      })()));

    // 대화 전체 붙여넣기 — 질문은 한 건씩 손으로 묻되, 답을 한 건씩 저장하지 않는다.
    var lastImport = state.lastImport; state.lastImport = null;
    var ta = h("textarea", { rows: 6, placeholder: "대상 서비스에서 질문을 하나씩 다 물은 뒤, 대화 화면 전체를 복사해 여기에 붙여넣으세요. 질문 문장을 찾아 질문별로 나눠 저장합니다." });
    var tAt = h("input", { type: "datetime-local", value: toLocalInput(Date.now()), style: "width:auto" });
    var ow = h("input", { type: "checkbox", style: "width:auto" });
    body.appendChild(h("div", { class: "box" }, h("h3", null, "3단계 · 손으로 묻고 답 기록"),
      h("p", { class: "help", text: "질문은 대상 서비스에 하나씩 직접 입력합니다(자동 입력 금지). 다 물었으면 대화 전체를 한 번에 붙여넣으세요 — 질문별로 나눠 저장하고 바로 검사를 시작합니다. 캡처는 질문 카드를 누른 뒤 Ctrl+V로 붙여넣으면 됩니다(대표 사례로 쓸 질문은 캡처가 있어야 발송할 수 있습니다)." }),
      nextQuestionBar(d),
      ta,
      h("div", { class: "actions" }, h("span", { class: "help", text: "대화한 시각" }), tAt,
        h("label", { class: "help", style: "display:flex;gap:6px;align-items:center" }, ow, "이미 적은 답도 덮어쓰기"),
        h("button", { class: "btn", onclick: run(async function () {
          var r = await api("POST", "/api/admin/audits/" + a.id + "/transcript", { text: ta.value, answered_at: fromLocalInput(tAt.value), overwrite: ow.checked });
          toast("질문 " + r.total + "개 중 " + r.matched + "개의 답을 찾아 저장했어요." + (r.checking ? " 검사를 시작했어요." : ""));
          state.lastImport = r; await refresh();
        }) }, "질문별로 나눠 저장")),
      lastImport && lastImport.unmatched && lastImport.unmatched.length
        ? h("div", { class: "lint", style: "margin-top:8px" }, "답을 못 찾은 질문 " + lastImport.unmatched.length + "개 — 카드에서 직접 붙여넣으세요: ", lastImport.unmatched.map(function (u) { return u.question.slice(0, 40); }).join(" / "))
        : null));

    d.items.forEach(function (it, idx) { body.appendChild(itemCard(it, idx, d)); });

    var waiting = d.items.filter(function (i) { return (i.answer || "").trim() && (i.status === "answered" || i.status === "failed"); }).length;
    body.appendChild(h("div", { class: "box" }, h("h3", null, "4단계 · 베리라인으로 검사"),
      h("p", { class: "help", text: a.tos_verdict === "ok" ? "기준 문항은 정답과 대조해 채점하고(독립 채점 2회 일치), 나머지는 답변 속 주장을 원문과 대조합니다. 한 문항에 20~60초 걸립니다. 화면을 닫아도 서버에서 계속 돕니다." : "약관 확인을 먼저 해주세요(개요 탭)." }),
      h("div", { class: "actions" }, h("button", { class: "btn", disabled: a.tos_verdict !== "ok" || !waiting || d.checking, onclick: run(async function () { var r = await api("POST", "/api/admin/audits/" + a.id + "/check"); toast(r.queued ? "답변 " + r.queued + "개 검사를 시작했어요." : "검사할 답변이 없어요."); await refresh(); }) }, d.checking ? "검사 중…" : "검사 실행 (" + waiting + "개)"),
        h("span", { class: "help", text: "API 비용 누적 약 " + n(d.cost.krw) + "원" }))));
  }

  // 같은 질문 세트를 다른 후보에도 — 같은 업종이면 만들기는 한 번, 회사끼리 비교도 된다.
  function copyToBlock(a, d) {
    if (!d.items.length) return null;
    var others = (state.list || []).filter(function (x) { return x.id !== a.id && !TERMINAL[x.stage] && !x.sent_at; });
    if (!others.length) return null;
    others.sort(function (x, y) { return (y.domain === a.domain) - (x.domain === a.domain) || x.items - y.items; });
    var boxes = others.map(function (x) {
      var cb = h("input", { type: "checkbox", style: "width:auto", value: String(x.id), checked: x.domain === a.domain && !x.items });
      return h("label", { class: "help", style: "display:flex;gap:6px;align-items:center" }, cb, x.company + " · " + x.domain + (x.items ? " (질문 " + x.items + "개 있음)" : ""));
    });
    return h("details", { style: "margin-top:10px" }, h("summary", { class: "help", style: "cursor:pointer", text: "이 질문 세트를 다른 후보에도 넣기 (같은 업종은 미리 골라 둠)" }),
      h("div", { style: "display:grid;gap:4px;margin:8px 0" }, boxes),
      h("button", { class: "ghost", onclick: run(async function () {
        var ids = boxes.map(function (l) { return l.querySelector("input"); }).filter(function (c) { return c.checked; }).map(function (c) { return Number(c.value); });
        var r = await api("POST", "/api/admin/audits/" + a.id + "/copy-to", { ids: ids });
        toast(r.results.length + "곳에 질문 " + r.added + "개를 넣었어요." + (r.results.some(function (x) { return x.error; }) ? " 질문이 가득 찬 곳은 건너뛰었어요." : ""));
        await refresh();
      }) }, "골라 둔 곳에 넣기"));
  }

  // 손으로 묻는 동안 — 다음 빈 질문을 복사해 대상 서비스에 붙여넣는다(입력은 사람이 한다).
  function nextQuestionBar(d) {
    var empty = d.items.filter(function (i) { return !(i.answer || "").trim(); });
    if (!empty.length) return null;
    state.asked = state.asked || {};
    var left = empty.filter(function (i) { return !state.asked[i.id]; });
    var label = left.length ? "다음 질문 복사 (" + (empty.length - left.length + 1) + "/" + empty.length + ")" : "빈 질문을 다 복사했어요 — 처음부터";
    return h("div", { class: "actions" }, h("button", { class: "btn", onclick: run(async function () {
      var pool = empty.filter(function (i) { return !state.asked[i.id]; });
      if (!pool.length) { state.asked = {}; pool = empty; }
      var it = pool[0];
      state.activeItem = it.id;
      // 복사에 실패하면 다음으로 넘기지 않는다 — 넘기면 묻지 않은 질문을 건너뛰게 된다.
      try { await navigator.clipboard.writeText(it.question); toast("복사했어요 — 대상 서비스에 붙여넣고 직접 보내세요."); }
      catch (e) { toast("복사하지 못했어요. 카드의 [질문 복사]를 눌러 주세요.", true); render(); return; }
      state.asked[it.id] = true;
      render();
      var el = document.getElementById("item-" + it.id); if (el) el.scrollIntoView({ block: "center" });
    }) }, label), h("span", { class: "help", text: "대상 서비스 입력창에 붙여넣고 직접 보내세요. 답은 다 물은 뒤 대화 전체를 아래에 한 번에." }));
  }

  function itemCard(it, idx, d) {
    var st = ITEM_STATUS[it.status] || [it.status, ""];
    var ans = h("textarea", { rows: it.answer ? 5 : 3, value: it.answer || "", placeholder: "대상 서비스가 준 답변을 그대로 붙여넣기", disabled: it.status === "checking" });
    var at = h("input", { type: "datetime-local", value: toLocalInput(it.answered_at || Date.now()), style: "width:auto" });
    ans.addEventListener("input", function () { if (!it.answered_at) at.value = toLocalInput(Date.now()); }, { once: true });
    var probe = it.probe_json ? JSON.parse(it.probe_json) : null;
    var grade = it.grade_json ? JSON.parse(it.grade_json) : null;
    var verify = it.verify_json ? JSON.parse(it.verify_json) : null;
    var files = d.files.filter(function (f) { return Number(f.item_id) === Number(it.id); });
    var fileInput = h("input", { type: "file", accept: "image/png,image/jpeg,image/webp", style: "display:none" });
    fileInput.addEventListener("change", run(async function () {
      var file = fileInput.files[0]; if (!file) return;
      var url = await shrink(file);
      await api("POST", "/api/admin/audits/items/" + it.id + "/file", { image: url });
      toast("캡처를 올렸어요."); await refresh();
    }));
    var result = null;
    if (grade) result = h("div", { class: "meta" }, h("span", { class: "pill " + (grade.outcome === "safe" ? "g" : grade.outcome === "ungraded" ? "" : "b"), text: { safe: "정상", partial: "부분 실패", hallucinated: "할루시네이션", ungraded: "채점 불가" }[grade.outcome] || grade.outcome }), h("span", { text: grade.reason || "" }));
    else if (verify) {
      var cs = verify.claims || [];
      var fc = cs.filter(function (c) { return c.verdict === "false"; }).length, cc = cs.filter(function (c) { return c.verdict === "confirmed"; }).length;
      result = h("div", { class: "meta" }, h("span", { class: "pill", text: "주장 " + cs.length }), h("span", { class: "pill g", text: "일치 " + cc }), fc ? h("span", { class: "pill b", text: "불일치 후보 " + fc }) : null, h("span", { class: "pill", text: "확인 불가 " + (cs.length - fc - cc) }));
    }
    // 카드를 누르면 Ctrl+V로 붙여넣는 캡처가 이 질문에 붙는다(아래 paste 처리).
    return h("div", { class: "item" + (state.activeItem === it.id ? " active" : ""), id: "item-" + it.id, onclick: function () {
        state.activeItem = it.id;
        document.querySelectorAll(".item.active").forEach(function (el) { el.classList.remove("active"); });
        var me = document.getElementById("item-" + it.id); if (me) me.classList.add("active");
      } },
      h("div", { class: "meta" }, h("span", { text: "#" + (idx + 1) }), h("span", { class: "pill " + (it.kind === "probe" ? "v" : ""), text: KIND[it.kind] || it.kind }), it.qtype ? h("span", { class: "pill", text: state.meta.questionTypes[it.qtype] || it.qtype }) : null, probe ? h("span", { class: "pill", text: state.meta.probeTypes[probe.type] || probe.type }) : null, h("span", { class: "sp" }), h("span", { class: "pill " + st[1], text: st[0] })),
      h("div", { class: "q", text: it.question }),
      // 두 번 묻는 문항(틀린 값 압박) — 첫 답을 받은 뒤 같은 대화에서 이어서 보낸다. 답 칸에는 두 답을 모두 붙여넣는다.
      (probe && (probe.followups || (probe.followup ? [probe.followup] : [])) || []).map(function (f, k, list) {
        return h("div", { class: "lint", style: "margin-top:6px" }, h("b", { text: "이어서 보낼 말" + (list.length > 1 ? " " + (k + 1) : "") + " — " }), f, " ", h("button", { class: "ghost", onclick: function (e) { e.stopPropagation(); copy(f); } }, "복사"));
      }),
      h("div", { class: "actions", style: "margin-top:0" }, h("button", { class: "ghost", onclick: function () { copy(it.question); } }, "질문 복사"),
        probe ? h("details", null, h("summary", { class: "help", style: "cursor:pointer", text: "정답(내부용)" }), h("div", { class: "help", text: probe.groundTruth || "" })) : null),
      ans,
      h("div", { class: "actions", style: "margin-top:0" }, h("span", { class: "help", text: "받은 시각" }), at,
        h("button", { class: "btn", disabled: it.status === "checking", onclick: run(async function () { var r = await api("PATCH", "/api/admin/audits/items/" + it.id, { answer: ans.value, answered_at: fromLocalInput(at.value) }); toast(r.checking ? "저장하고 검사를 시작했어요." : "답변을 저장했어요."); await refresh(); }) }, "답변 저장"),
        h("button", { class: "ghost", onclick: function () { fileInput.click(); } }, "캡처 올리기"), fileInput,
        h("span", { class: "help", text: state.activeItem === it.id ? "Ctrl+V로 캡처 붙여넣기" : "" }),
        h("span", { class: "sp" }),
        h("button", { class: "ghost", onclick: run(async function () { if (!confirm("이 질문을 지울까요?")) return; await api("DELETE", "/api/admin/audits/items/" + it.id); await refresh(); }) }, "삭제")),
      files.length ? h("div", { class: "shots" }, files.map(function (f) {
        var src = "/api/admin/audits/file/" + f.id;
        return h("span", { class: "shot" }, h("img", { src: src, alt: "답변 캡처", onclick: function () { window.open(src, "_blank"); } }), h("button", { title: "캡처 삭제", onclick: run(async function () { await api("DELETE", "/api/admin/audits/file/" + f.id); await refresh(); }) }, "×"));
      })) : null,
      // 캡처는 답을 받은 그 자리에서만 찍을 수 있다 — 상대 서비스에 대화 기록이 안 남는 경우가 많다(2026-10-13 로무앤톡).
      it.answer && !files.length && d.audit.input_method !== "api" ? h("div", { class: "lint", text: "캡처 없음 — 답을 받은 화면을 지금 캡처해 두세요. 상대 서비스에 기록이 남지 않으면 나중에 다시 찍을 수 없고, 캡처 없는 오류는 보고서 링크를 만들 수 없습니다(감사 러너는 자동으로 남깁니다)." }) : null,
      it.error ? h("div", { class: "lint", text: "오류: " + it.error }) : null,
      result);
  }

  // 캡처 붙여넣기 — 고른 질문 카드에 붙인다. 화면 캡처 단축키로 찍고 바로 Ctrl+V.
  document.addEventListener("paste", function (e) {
    if (state.view !== "desk" || state.tab !== "items" || !state.activeItem) return;
    var list = (e.clipboardData && e.clipboardData.items) || [];
    for (var i = 0; i < list.length; i++) {
      if (String(list[i].type).indexOf("image") !== 0) continue;
      var file = list[i].getAsFile(); if (!file) continue;
      e.preventDefault();
      var target = state.activeItem;
      run(async function () { var url = await shrink(file); await api("POST", "/api/admin/audits/items/" + target + "/file", { image: url }); toast("캡처를 붙여넣었어요."); await refresh(); })();
      return;
    }
  });

  // 캡처는 긴 변 1800px JPEG로 줄여 올린다(서버는 한 장 3MB까지 받는다).
  function shrink(file) {
    return new Promise(function (resolve, reject) {
      var img = new Image(); var url = URL.createObjectURL(file);
      img.onload = function () {
        var s = Math.min(1, 1800 / Math.max(img.width, img.height));
        var c = document.createElement("canvas"); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        resolve(c.toDataURL("image/jpeg", 0.86));
      };
      img.onerror = function () { reject(new Error("이미지를 읽지 못했어요.")); };
      img.src = url;
    });
  }

  // ── 재확인 ──
  function reviewTab(body, d) {
    var items = {}; d.items.forEach(function (i) { items[i.id] = i; });
    var issues = d.findings.filter(function (f) { return f.polarity === "issue"; });
    var goods = d.findings.filter(function (f) { return f.polarity === "good"; });
    var r = d.results.issues;
    body.appendChild(h("div", { class: "box" }, h("h3", null, "5단계 · 직접 재확인", h("span", { class: "pill " + (r.pending ? "w" : "g"), text: r.pending ? "남은 항목 " + r.pending : "모두 확인" })),
      h("p", { class: "help", text: d.codeOnly
        ? "코드 확정 모드 — 틀린 지적 하나가 전체 신뢰를 무너뜨립니다. 그래서 보고서에는 코드가 원문과 기계적으로 대조한 오류(값 · 없는 조문 · 삭제 · 제재 종류)만 싣습니다. 초록 상자의 'AI가 한 말'과 '원문'을 나란히 보고 숫자·이름이 다르면 '불일치 맞음'을 누르세요. 법을 몰라도 됩니다. 코드로 확정되지 않은 후보는 참고로만 남깁니다(한 번에 빼기)."
        : "베리라인도 틀릴 수 있고, 틀린 지적 하나가 전체 신뢰를 무너뜨립니다. 오류 후보마다 공식 원문을 직접 열어 확인하고 그 주소를 남기세요. 조금이라도 애매하면 '애매해서 제외'. 원문으로 확인한 것만 보고서·지수에 들어갑니다." }),
      h("div", { class: "nums", style: "margin-top:10px" }, [["오류 후보", r.total], ["확인", r.confirmed], ["제외", r.excluded], ["베리라인 오판", r.yume_wrong], ["남음", r.pending]].map(function (x) { return h("div", null, h("div", { class: "k", text: x[0] }), h("div", { class: "v", text: n(x[1]) })); })),
      (function () {
        // 판정 강도 — 어디부터 볼지. 약한 후보는 한 번에 뺄 수 있다(빼는 쪽만 일괄, 확정은 한 건씩).
        var pend = issues.filter(function (f) { return f.review === "pending"; });
        var cnt = function (lv) { return pend.filter(function (f) { return f.strength && f.strength.level === lv; }).length; };
        var weak = cnt("weak");
        var proven = pend.filter(function (f) { return f.proof && f.proof.proven; }).length;
        var drop = d.codeOnly ? pend.filter(function (f) { return !(f.proof && f.proof.proven) || (f.strength && f.strength.level === "weak"); }).length : weak;
        return h("div", { class: "actions" },
          h("span", { class: "help", text: d.codeOnly
            ? "남은 후보 " + pend.length + "건 중 코드 확정 " + proven + "건 · 참고 " + (pend.length - proven) + "건. 코드 확정부터 위에 놓았습니다."
            : "남은 후보의 판정 강도 — 강함 " + cnt("strong") + " · 보통 " + cnt("medium") + " · 약함 " + weak + ". 강함부터 위에 놓았습니다. 숫자가 원문과 다르면 붉게 표시됩니다." }),
          drop ? h("button", { class: "btn warn", onclick: run(async function () { if (!confirm((d.codeOnly ? "코드로 확정할 수 없는 " : "근거가 약한 ") + drop + "건을 '애매해서 제외'(참고)로 처리할까요? 확정은 한 건씩만 할 수 있습니다.")) return; var x = await api("POST", "/api/admin/audits/" + d.audit.id + "/exclude-weak"); toast(x.excluded + "건을 제외했어요."); await refresh(); }) }, (d.codeOnly ? "참고 " : "약함 ") + drop + "건 한 번에 제외") : null);
      })()));
    if (!issues.length) body.appendChild(h("div", { class: "empty", text: d.results.checked ? "베리라인이 지목한 오류 후보가 없어요. 질문을 더 하거나, 이 서비스는 이번 표본에서 깨끗했다고 기록하세요." : "검사를 먼저 실행하세요." }));
    var RANK = { strong: 0, medium: 1, weak: 2 };
    issues.slice().sort(function (x, y) {
      var px = x.review === "pending" ? 0 : 1, py = y.review === "pending" ? 0 : 1;
      if (px !== py) return px - py;
      var cx = x.proof && x.proof.proven ? 0 : 1, cy = y.proof && y.proof.proven ? 0 : 1;
      if (cx !== cy) return cx - cy;
      return (RANK[x.strength && x.strength.level] || 1) - (RANK[y.strength && y.strength.level] || 1);
    }).forEach(function (f) { body.appendChild(findingCard(f, items[f.item_id])); });

    var hl = h("textarea", { rows: 3, value: d.audit.highlights || "", placeholder: "잘된 점을 직접 적기 — 예: 조문 번호를 정확히 댄 답이 많았고, 확실하지 않을 때 원문 확인을 권했다." });
    body.appendChild(h("div", { class: "box" }, h("h3", null, "잘된 점", h("span", { class: "pill", text: goods.filter(function (g) { return Number(g.featured); }).length + "건 선택" })),
      h("p", { class: "help", text: "공정하게 씁니다 — 잘된 점이 하나도 없으면 발송할 수 없습니다. 아래 후보에서 고르거나 직접 적으세요." }),
      hl, h("div", { class: "actions" }, h("button", { class: "ghost", onclick: run(async function () { await api("PATCH", "/api/admin/audits/" + d.audit.id, { highlights: hl.value }); toast("저장했어요."); await refresh(); }) }, "잘된 점 저장"))));
    goods.slice(0, 40).forEach(function (g) {
      var it = items[g.item_id] || {};
      body.appendChild(h("div", { class: "find" + (g.review === "excluded" ? " excluded" : "") },
        h("div", { class: "meta" }, h("span", { class: "pill g", text: SEVERITY[g.severity] || g.severity }), h("span", { class: "help", text: (it.question || g.claim || "").slice(0, 90) })),
        h("div", { class: "kv" }, h("b", { text: "AI 답변" }), h("div", { text: g.ai_quote || g.claim }), h("b", { text: "베리라인" }), h("div", { text: g.yume_reason || "" })),
        h("label", { class: "help", style: "display:flex;gap:6px;align-items:center" }, h("input", { type: "checkbox", style: "width:auto", checked: Number(g.featured), onchange: run(async function (e) { await api("PATCH", "/api/admin/audits/findings/" + g.id, { featured: e.target.checked }); await refresh(); }) }), "보고서의 '잘된 점'에 싣기")));
    });
  }

  // AI 답변 속 숫자 중 원문에 없는 것을 붉게 — 기간·금액 하나만 다른 할루시네이션을 바로 보게.
  function markNumbers(text, ref) {
    text = String(text || "");
    var refNums = (String(ref || "").match(/\\d[\\d,.]*/g) || []).map(function (x) { return x.replace(/[,.]+$/, ""); });
    if (!refNums.length) return [text];
    var out = [], last = 0, re = /\\d[\\d,.]*/g, m;
    while ((m = re.exec(text))) {
      var num = m[0].replace(/[,.]+$/, "");
      if (refNums.indexOf(num) >= 0) continue;
      out.push(text.slice(last, m.index));
      out.push(h("mark", { text: num, title: "원문에 없는 숫자" }));
      last = m.index + num.length;
    }
    out.push(text.slice(last));
    return out;
  }

  function findingCard(f, it) {
    it = it || {};
    var url = h("input", { value: f.checked_url || "", placeholder: "직접 열어 확인한 공식 원문 주소 (https://…)" });
    var note = h("input", { value: f.review_note || "", placeholder: "메모 — 무엇을 확인했는지, 왜 뺐는지" });
    // 보고서 사례 제목 — 상대 담당자가 한 줄로 알아보게. 비우면 자동 제목.
    var title = f.polarity === "issue" ? h("input", { value: f.report_title || "", maxlength: 200, placeholder: "보고서 한 줄 제목 (선택) — 예: 해고예고 예외에 법에 없는 '노동위원회 인정' 요건을 붙임", onchange: run(async function () { await api("PATCH", "/api/admin/audits/findings/" + f.id, { report_title: title.value }); toast("제목을 저장했어요."); }) }) : null;
    function rv(v) { return run(async function () { await api("PATCH", "/api/admin/audits/findings/" + f.id, { review: v, checked_url: url.value, review_note: note.value }); toast({ confirmed: "불일치로 확정했어요.", excluded: "제외했어요.", yume_wrong: "베리라인 오판으로 돌렸어요.", pending: "되돌렸어요." }[v]); state.focusNext = v !== "pending"; await refresh(); }); }
    var label = { pending: ["재확인 전", "w"], confirmed: ["불일치 확정", "b"], excluded: ["제외", ""], yume_wrong: ["베리라인 오판", ""] }[f.review] || [f.review, ""];
    var st = f.strength;
    var pf = f.proof;
    var proven = !!(pf && pf.proven);
    var canConfirm = !state.detail.codeOnly || proven;
    // 코드 확정 — AI가 한 말과 원문을 나란히. 법을 몰라도 숫자 · 이름 두 개를 비교해 확인한다.
    var proofBox = proven ? h("div", { class: "proof" },
      h("div", { class: "ph", text: "코드 확정 · " + ({ value: "값이 다름", stance: "첫 문장이 틀린 전제에 동의(본문은 정정)", flip: "반박에 굴복", nonexist: "없는 조문", fake_case: "없는 판례", fake_doi: "없는 논문", fake_law: "없는 법률", deleted: "삭제된 조문", denied_new: "있는 제도를 없다고 함", sanction: "제재 종류가 다름", claim_value: "값이 다름" }[pf.kind] || pf.kind) }),
      h("div", { class: "kv" },
        h("b", { text: "AI가 한 말" }), h("div", { class: "said", text: pf.ai_line || "" }),
        h("b", { text: "원문" }), h("div", { class: "truth" }, pf.source_line || "", pf.url ? h("div", null, h("a", { href: pf.url, target: "_blank", rel: "noopener nofollow", text: "법제처·공식 원문 열기 ↗" })) : null),
        h("b", { text: "다른 점" }), h("div", null, h("mark", { text: pf.wrong || "" }), "  →  원문: ", h("b", { text: pf.correct || "" }))),
      h("div", { class: "help", text: pf.why || "" }))
      : state.detail.codeOnly && f.polarity === "issue" ? h("div", { class: "help", style: "margin:6px 0", text: "참고 — " + ((pf && pf.why) || "코드로 확정할 수 없는 항목입니다.") }) : null;
    return h("div", { class: "find " + f.review },
      h("div", { class: "meta" }, h("span", { class: "pill " + label[1], text: label[0] }), h("span", { class: "pill", text: (f.source === "probe" ? "기준 문항 · " : "주장 · ") + (SEVERITY[f.severity] || f.severity) }),
        proven ? h("span", { class: "pill g", text: "코드 확정" }) : state.detail.codeOnly ? h("span", { class: "pill", text: "참고" }) : null,
        st ? h("span", { class: "pill " + ({ strong: "g", medium: "", weak: "w" }[st.level] || ""), text: "판정 강도 " + ({ strong: "강함", medium: "보통", weak: "약함" }[st.level] || st.level) + " · " + st.why }) : null,
        f.nec_score !== null && f.nec_score !== undefined ? h("span", { class: "pill", text: "부존재 신뢰도 " + Number(f.nec_score).toFixed(2) }) : null),
      proofBox,
      h("div", { class: "kv" },
        h("b", { text: "질문" }), h("div", { text: it.question || "" }),
        h("b", { text: "AI 답변" }), h("div", { class: "said" }, markNumbers(f.ai_quote || f.claim || "", f.truth || "")),
        h("b", { text: "베리라인 판정" }), h("div", { text: f.yume_reason || "" }),
        h("b", { text: "원문" }), h("div", { class: "truth" }, f.truth || "", f.source_url ? h("div", null, h("a", { href: f.source_url, target: "_blank", rel: "noopener nofollow", text: f.source_label || f.source_url })) : null)),
      h("div", { class: "grid2" }, h("div", { style: "display:flex;gap:6px" }, url, f.source_url ? h("button", { class: "ghost", title: "베리라인이 댄 원문을 새 창으로 열고 그 주소를 적어요", onclick: function () { window.open(f.source_url, "_blank", "noopener"); url.value = f.source_url; } }, "원문 열기") : null), note),
      title ? h("div", { style: "margin-top:8px" }, title) : null,
      h("div", { class: "actions", style: "margin-top:0" },
        canConfirm ? h("button", { class: "btn bad", onclick: rv("confirmed") }, proven ? "두 값이 다름 — 불일치 맞음" : "원문 확인 — 불일치 맞음") : null,
        h("button", { class: "btn warn", onclick: rv("excluded") }, canConfirm ? "애매해서 제외" : "참고로 두기(보고서 제외)"), h("button", { class: "ghost", onclick: rv("yume_wrong") }, "베리라인 오판"), f.review !== "pending" ? h("button", { class: "ghost", onclick: rv("pending") }, "되돌리기") : null,
        f.review === "confirmed" ? h("label", { class: "help", style: "display:flex;gap:6px;align-items:center;margin-left:8px" }, h("input", { type: "checkbox", style: "width:auto", checked: Number(f.featured), onchange: run(async function (e) { await api("PATCH", "/api/admin/audits/findings/" + f.id, { featured: e.target.checked }); await refresh(); }) }), "보고서 대표 사례") : null,
        f.review === "confirmed" ? h("label", { class: "help", style: "display:flex;gap:6px;align-items:center" }, h("input", { type: "checkbox", style: "width:auto", checked: Number(f.in_index), onchange: run(async function (e) { await api("PATCH", "/api/admin/audits/findings/" + f.id, { in_index: e.target.checked }); await refresh(); }) }), "지수 사례(익명)") : null));
  }

  // ── 보고서·발송 ──
  function sendTab(body, d) {
    var a = d.audit, res = d.results;
    var p = res.probe;
    body.appendChild(h("div", { class: "box" }, h("h3", null, "결과 요약 (보고서에 숫자만 들어갑니다)"),
      h("div", { class: "nums" },
        p ? [h("div", null, h("div", { class: "k", text: "기준 문항 채점" }), h("div", { class: "v", text: n(p.graded) })), h("div", null, h("div", { class: "k", text: "가중 비율" }), h("div", { class: "v", text: pct(p.index) })), h("div", null, h("div", { class: "k", text: "95% 구간" }), h("div", { class: "v", style: "font-size:14px", text: pct(p.interval.low) + "~" + pct(p.interval.high) }))] : null,
        [["주장 검사", res.claims.total], ["원문 일치", res.claims.match], ["불일치", res.claims.mismatch], ["확인 불가", res.claims.unverifiable]].map(function (x) { return h("div", null, h("div", { class: "k", text: x[0] }), h("div", { class: "v", text: n(x[1]) })); })),
      p ? h("p", { class: "help", text: "내부 참고: " + (p.bandLabel || "") + " — " + (p.headline || "") + " (보고서에는 이 평가 문구를 넣지 않습니다)" }) : null));

    body.appendChild(h("div", { class: "box" }, h("h3", null, "6단계 · 보고서"),
      h("p", { class: "help", text: "부록 B 양식(1~2쪽). 상대가 여는 링크는 추측할 수 없는 주소이고, 언제든 회수할 수 있습니다." }),
      h("div", { class: "actions" }, h("a", { class: "btn", href: "/admin/audits/" + a.id + "/report", target: "_blank", rel: "noopener" }, "보고서 미리보기"),
        h("button", { class: "ghost", title: "확정된 오류 중 가장 확실한 3건, 잘된 점 3건을 고르고 잘된 점 초안을 씁니다. 재확인이 끝나면 자동으로도 한 번 돕니다.", onclick: run(async function () { var r = await api("POST", "/api/admin/audits/" + a.id + "/autopick"); toast("대표 사례 " + r.issues + "건 · 잘된 점 " + r.goods + "건을 골랐어요" + (r.wroteHighlights ? " (잘된 점 초안 작성)" : "") + "."); await refresh(); }) }, "대표 사례·잘된 점 자동 선택"),
        d.reportUrl ? [h("button", { class: "ghost", onclick: function () { copy(d.reportUrl); } }, "공유 링크 복사"), h("button", { class: "ghost", onclick: run(async function () { if (!confirm("링크를 회수할까요? 이미 보낸 링크는 더 이상 열리지 않습니다.")) return; await api("DELETE", "/api/admin/audits/" + a.id + "/share"); await refresh(); }) }, "링크 회수")]
          : h("button", { class: "ghost", onclick: run(async function () { await api("POST", "/api/admin/audits/" + a.id + "/share"); toast("공유 링크를 만들었어요."); await refresh(); }) }, "공유 링크 만들기")),
      d.reportUrl ? h("div", { class: "mono", style: "margin-top:8px", text: d.reportUrl }) : null));

    // 체크리스트
    var cl = d.checklist;
    var manual = JSON.parse(a.checklist_json || "{}");
    body.appendChild(h("div", { class: "box" }, h("h3", null, "발송 전 체크리스트 (부록 D-1)", h("span", { class: "pill " + (cl.passed ? "g" : "w"), text: cl.passed ? "모두 통과" : cl.items.filter(function (c) { return !c.ok; }).length + "개 남음" })),
      h("div", { class: "chk" }, cl.items.map(function (c) {
        return h("div", { class: "c " + (c.ok ? "ok" : "no") }, h("span", { class: "mk", text: c.ok ? "✓" : "✗" }),
          h("div", null, c.manual ? h("label", { style: "display:flex;gap:7px;align-items:center;cursor:pointer" }, h("input", { type: "checkbox", style: "width:auto", checked: !!manual[c.key], onchange: run(async function (e) { var o = {}; o[c.key] = e.target.checked; await api("PATCH", "/api/admin/audits/" + a.id, { checklist: o }); await refresh(); }) }), c.label) : h("div", { text: c.label }),
            h("div", { class: "d", text: c.detail || "" })));
      }))));

    // 메일
    var subj = h("input", { value: d.mail.first.subject });
    var mbody = h("textarea", { rows: 14, value: d.mail.first.body });
    var mailto = function () { return "mailto:" + encodeURIComponent(a.contact_email || "") + "?subject=" + encodeURIComponent(subj.value) + "&body=" + encodeURIComponent(mbody.value); };
    body.appendChild(h("div", { class: "box" }, h("h3", null, "7단계 · 첫 메일 (부록 C-1)", d.mail.first.edited ? h("span", { class: "pill v", text: "고친 본문" }) : h("span", { class: "pill", text: "템플릿" })),
      h("p", { class: "help", text: "대표 메일함이 아니라 담당자 개인에게, 본인 메일 계정에서 보냅니다. 가격·기한은 넣지 않습니다. 고친 뒤 저장하면 체크리스트가 다시 검사합니다." }),
      field("제목", subj), h("div", { style: "margin-top:8px" }, field("본문", mbody)),
      cl.lint && cl.lint.length ? h("div", { class: "lint", text: "걸린 표현: " + cl.lint.map(function (l) { return "“" + l.match + "” " + l.why; }).join(" / ") }) : null,
      h("div", { class: "actions" },
        h("button", { class: "ghost", onclick: run(async function () { await api("PATCH", "/api/admin/audits/" + a.id, { mail_subject: subj.value === d.mail.first.defaultSubject ? "" : subj.value, mail_body: mbody.value === d.mail.first.defaultBody ? "" : mbody.value }); toast("저장하고 다시 검사했어요."); await refresh(); }) }, "저장·다시 검사"),
        d.mail.first.edited ? h("button", { class: "ghost", onclick: run(async function () { await api("PATCH", "/api/admin/audits/" + a.id, { mail_subject: "", mail_body: "" }); await refresh(); }) }, "템플릿으로 되돌리기") : null,
        h("button", { class: "ghost", onclick: function () { copy(subj.value + "\\n\\n" + mbody.value); } }, "복사"),
        h("a", { class: "ghost", href: "#", onclick: function (e) { e.preventDefault(); location.href = mailto(); } }, "메일 앱으로 열기"),
        h("span", { class: "sp" }),
        a.sent_at ? h("span", { class: "pill w", text: "발송 " + kdt(a.sent_at) }) : h("button", { class: "btn", disabled: !cl.passed, onclick: run(async function () { if (!confirm("메일을 실제로 보낸 뒤 누르세요. 발송 처리하면 7일 뒤 후속 연락일이 잡힙니다.")) return; await api("POST", "/api/admin/audits/" + a.id + "/sent"); toast("발송 처리했어요. 후속 연락은 7일 뒤 한 번만."); await refresh(); }) }, "발송 처리"),
        // 체크리스트를 다 못 채우고 대표가 직접 보낸 경우 — 보낸 사실과 후속 연락일만은 남긴다.
        !a.sent_at && !cl.passed && a.report_token ? h("button", { class: "btn ghost", style: "margin-left:6px", onclick: run(async function () { var why = prompt("체크리스트를 다 채우지 못한 채 직접 보냈나요? 이유를 한 줄 적어 주세요(예: 캡처 없이 대표 결정으로 발송).", ""); if (!why) return; await api("POST", "/api/admin/audits/" + a.id + "/sent", { override: true, reason: why }); toast("직접 보낸 것으로 기록했어요. 후속 연락은 7일 뒤 한 번만."); await refresh(); }) }, "직접 보낸 것으로 기록") : null)));

    if (a.sent_at) {
      body.appendChild(h("div", { class: "box" }, h("h3", null, "8단계 · 후속 연락 (1주 뒤 한 번만)", a.followed_up_at ? h("span", { class: "pill g", text: "보냄 " + kd(a.followed_up_at) }) : h("span", { class: "pill " + (Number(a.followup_due_at) <= Date.now() ? "w" : ""), text: "예정 " + kd(a.followup_due_at) })),
        h("pre", { class: "mail", text: d.mail.followup.subject + "\\n\\n" + d.mail.followup.body }),
        h("div", { class: "actions" }, h("button", { class: "ghost", onclick: function () { copy(d.mail.followup.subject + "\\n\\n" + d.mail.followup.body); } }, "복사"),
          !a.followed_up_at && !a.replied_at ? h("button", { class: "btn", onclick: stage("followed_up") }, "후속 연락 보냄") : null,
          h("span", { class: "help", text: "이후로는 따로 연락하지 않습니다." }))));
      body.appendChild(h("div", { class: "box" }, h("h3", null, "답장이 오면 (부록 C-3·C-4)"),
        h("pre", { class: "mail", text: d.mail.interested.body }), h("div", { class: "actions" }, h("button", { class: "ghost", onclick: function () { copy(d.mail.interested.body); } }, "복사")),
        h("div", { class: "help", style: "margin-top:10px", text: "통화에서 물어볼 것" }), h("ol", { style: "margin:4px 0 0;padding-left:18px;font-size:12.5px;line-height:1.8" }, d.mail.callQuestions.map(function (q) { return h("li", { text: q }); }))));
      var amount = h("input", { type: "number", min: 0, value: a.paid_amount_krw || "", placeholder: "금액(원)", style: "width:140px" });
      var reason = h("textarea", { rows: 2, value: a.decline_reason || "", placeholder: "거절 이유 — 상대가 한 말 그대로" });
      var price = h("input", { value: a.price_heard || "", placeholder: "상대가 말한 가격" });
      var needs = h("textarea", { rows: 2, value: a.needs || "", placeholder: "꼭 필요하다고 말한 기능" });
      body.appendChild(h("div", { class: "box" }, h("h3", null, "9단계 · 결과"),
        h("div", { class: "actions", style: "margin-top:0" },
          h("button", { class: "ghost", onclick: stage("replied") }, "답장 받음"), h("button", { class: "ghost", onclick: stage("meeting") }, "미팅 잡힘"), h("button", { class: "ghost", onclick: stage("full_audit") }, "무료 전체 검사 진행"),
          amount, h("button", { class: "btn ok", onclick: stage("paid_intent", function () { return { paid_amount_krw: amount.value }; }) }, "유료 의향(금액 확정)"), h("button", { class: "btn ok", onclick: stage("won", function () { return { paid_amount_krw: amount.value }; }) }, "계약"),
          h("button", { class: "btn bad", onclick: stage("declined", function () { return { decline_reason: reason.value }; }) }, "거절"), h("button", { class: "ghost", onclick: stage("no_reply") }, "무응답 종료")),
        h("p", { class: "help", text: "'좋네요, 나중에 연락드릴게요'는 유료 의향이 아닙니다. 소액이라도 결제했거나 금액·일정이 적힌 의사를 받은 경우만 셉니다(기획안 6-2)." }),
        h("div", { class: "grid2", style: "margin-top:8px" }, field("거절 이유(원문 그대로)", reason), field("필요 기능", needs)),
        h("div", { style: "margin-top:8px" }, field("들은 가격", price)),
        h("div", { class: "actions" }, h("button", { class: "ghost", onclick: run(async function () { await api("PATCH", "/api/admin/audits/" + a.id, { decline_reason: reason.value, price_heard: price.value, needs: needs.value, paid_amount_krw: amount.value }); toast("저장했어요."); await refresh(); }) }, "기록 저장"))));
    }
    // 10단계 — 견적서 링크. 범위를 정했으면 여기서 견적을 내고 링크를 답장에 붙인다. 고객은 그 화면에서
    // 세금계산서 정보를 적고 계약을 신청하고, 입금 확인은 기업 거래 화면(/admin/deals)에서 한다.
    var QP = { audit: ["AI 정밀 감사", "표본 감사 + 보고서 + 개선 회의 1회"], audit_regular: ["AI 정기 감사 (분기)", "분기 재감사 + 공개 감사 기록·배지"], poc: ["2주 PoC", "문서 검사 + 정확도 보고서"], custom: ["", ""], starter: null, growth: null, metered: null };
    var qProd = h("select", null, [["audit", "정밀 감사"], ["audit_regular", "정기 감사"], ["poc", "2주 PoC"], ["custom", "맞춤"], ["growth", "API 그로스(월)"], ["starter", "API 스타터(월)"], ["metered", "API 종량제"]].map(function (o) { return h("option", { value: o[0] }, o[1]); }));
    var qName = h("input", { value: QP.audit[0], placeholder: "품목 이름" });
    var qSpec = h("input", { value: QP.audit[1], placeholder: "규격·설명(선택)" });
    var qAmt = h("input", { type: "number", min: 0, step: 10000, placeholder: "공급가액(원, VAT 별도)" });
    var qQty = h("input", { type: "number", min: 1, value: 1, placeholder: "수량" });
    var qMail = h("input", { value: a.contact_email || "", placeholder: "견적서 받을 이메일(선택)" });
    qProd.onchange = function () { var v = QP[qProd.value]; var isApi = !v; qName.disabled = isApi; qSpec.disabled = isApi; qAmt.disabled = isApi; if (v) { qName.value = v[0]; qSpec.value = v[1]; } qQty.value = qProd.value === "metered" ? 1000 : 1; qQty.placeholder = isApi ? (qProd.value === "metered" ? "예상 월 호출 수(100 단위)" : "기간(개월)") : "수량"; };
    var quotes = d.quotes || [];
    body.appendChild(h("div", { class: "box" }, h("h3", null, "10단계 · 견적서 링크 (계약까지 한 번에)", quotes.length ? h("span", { class: "pill g", text: quotes.length + "건" }) : null),
      h("p", { class: "help", text: "금액을 정했으면 견적서 링크를 만들어 답장에 붙이세요. 고객은 그 화면에서 인쇄·PDF 저장을 하고, 세금계산서 정보를 적어 계약을 신청합니다. 메일 본문에는 금액을 쓰지 말고 링크만 — 발송 문구 점검이 금액을 막습니다." }),
      quotes.length ? h("div", null, quotes.map(function (q) { return h("div", { class: "actions", style: "margin-top:4px" }, h("span", { class: "pill " + (q.status === "paid" ? "g" : q.status === "requested" ? "w" : ""), text: q.statusLabel }), h("span", { class: "help", text: q.number + " · " + q.productLabel + " · 합계 " + n(q.total_krw) + "원" }), h("button", { class: "ghost", onclick: function () { copy(q.url); } }, "링크 복사"), h("a", { class: "ghost", href: q.url, target: "_blank", rel: "noopener" }, "열기")); })) : null,
      h("div", { class: "grid2", style: "margin-top:8px" }, field("상품", qProd), field("받을 이메일", qMail), field("품목 이름", qName), field("규격·설명", qSpec), field("공급가액(원)", qAmt), field("수량", qQty)),
      h("div", { class: "actions" }, h("button", { class: "btn", onclick: run(async function () {
        var v = QP[qProd.value];
        var payload = { product: qProd.value, auditId: a.id, company: a.company, name: a.contact_name || "", email: qMail.value.trim() };
        if (v) payload.items = [{ name: qName.value.trim(), spec: qSpec.value.trim(), qty: Number(qQty.value) || 1, unit: "식", unitKrw: Number(qAmt.value) }];
        else payload.qty = Number(qQty.value);
        var r = await api("POST", "/api/admin/b2b/quotes", payload);
        await copy(r.quote.url);
        toast("견적서를 만들고 링크를 복사했어요 — " + r.quote.number);
        await refresh();
      }) }, "견적서 만들고 링크 복사"), h("a", { class: "ghost", href: "/admin/deals", target: "_blank", rel: "noopener" }, "기업 거래 화면"))));
    function stage(s, extra) { return run(async function () { var b = extra ? extra() : {}; b.stage = s; await api("POST", "/api/admin/audits/" + a.id + "/stage", b); toast((state.meta.stages[s] || s) + "(으)로 기록했어요."); await refresh(); }); }
  }

  // ── 공개·지수 ──
  function publicTab(body, d) {
    var a = d.audit;
    var note = h("textarea", { rows: 2, value: a.consent_note || "", placeholder: "동의 기록 — 누가(이름·직책), 언제, 어떤 경로(메일 회신 등)로 무엇에 동의했는지" });
    body.appendChild(h("div", { class: "box" }, h("h3", null, "회사명 공개 동의", Number(a.consent_name) ? h("span", { class: "pill g", text: "동의 " + kd(a.consent_at) }) : h("span", { class: "pill", text: "동의 없음 — 비공개" })),
      h("p", { class: "help", text: "동의가 없으면 이 회사 이름은 어디에도 나가지 않습니다. 지수에는 업종 단위 익명 숫자로만 들어갑니다. 동의는 서면(메일 회신)으로 받고 그 기록을 적으세요." }),
      note,
      h("div", { class: "actions" }, Number(a.consent_name)
        ? h("button", { class: "btn bad", onclick: run(async function () { if (!confirm("동의를 철회로 기록할까요? 공개 감사 기록도 함께 내립니다.")) return; await api("PATCH", "/api/admin/audits/" + a.id, { consent_name: false }); await refresh(); }) }, "동의 철회")
        : h("button", { class: "btn", onclick: run(async function () { await api("PATCH", "/api/admin/audits/" + a.id, { consent_note: note.value, consent_name: true }); toast("동의를 기록했어요."); await refresh(); }) }, "동의 받음으로 기록"))));
    body.appendChild(h("div", { class: "box" }, h("h3", null, "공개 감사 기록·배지", a.public_id ? h("span", { class: "pill g", text: "공개 중" }) : null),
      h("p", { class: "help", text: "동의한 회사는 공개 감사 기록 페이지와 홈페이지 배지를 받습니다(유효 90일, 지나면 '재검사 필요'). 정기 감사 상품의 핵심 혜택입니다." }),
      d.publicUrl ? [h("div", { class: "mono", text: d.publicUrl }), h("div", { class: "actions" }, h("a", { class: "ghost", href: d.publicUrl, target: "_blank", rel: "noopener" }, "열기"), h("button", { class: "ghost", onclick: function () { copy('<a href="' + d.publicUrl + '"><img src="' + d.publicUrl + '/badge.svg" alt="VERILINE 할루시네이션 감사 기록" height="30" /></a>'); } }, "배지 코드 복사"), h("button", { class: "ghost", onclick: run(async function () { await api("DELETE", "/api/admin/audits/" + a.id + "/public"); await refresh(); }) }, "공개 내리기"))]
        : h("div", { class: "actions" }, h("button", { class: "btn", disabled: !Number(a.consent_name) || !d.results.reviewComplete, onclick: run(async function () { await api("POST", "/api/admin/audits/" + a.id + "/public"); toast("공개 감사 기록을 만들었어요."); await refresh(); }) }, "공개 감사 기록 만들기"), !Number(a.consent_name) ? h("span", { class: "help", text: "동의가 먼저예요." }) : !d.results.reviewComplete ? h("span", { class: "help", text: "재확인이 끝나야 해요." }) : null)));
    body.appendChild(h("div", { class: "box" }, h("h3", null, "지수 집계"),
      h("label", { class: "help", style: "display:flex;gap:7px;align-items:center" }, h("input", { type: "checkbox", style: "width:auto", checked: Number(a.index_excluded), onchange: run(async function (e) { await api("PATCH", "/api/admin/audits/" + a.id, { index_excluded: e.target.checked }); await refresh(); }) }), "이 감사를 지수 집계에서 뺀다 (예: 시험용, 방법이 달랐던 감사)"),
      h("p", { class: "help", text: "재확인을 마친 감사만 지수에 들어갑니다. 결과가 나쁘다는 이유로 빼지 마세요 — 지수의 신뢰는 거기서 나옵니다." })));
  }

  // ── 지수 발행 ──
  async function loadIndex() { state.index = await api("GET", "/api/admin/index"); if (state.issueSel) await loadIssue(state.issueSel); render(); }
  async function loadIssue(id) { state.issue = (await api("GET", "/api/admin/index/" + id)).issue; state.issueSel = id; }

  function renderIndex() {
    clear(view);
    var ix = state.index || { issues: [] };
    var slug = h("input", { placeholder: "주소 이름 (예: 2026-q4, 2026-11)" });
    var title = h("input", { placeholder: "제목 (예: 2026년 4분기 · 창간호)" });
    var now = new Date();
    var s = h("input", { type: "date", value: dateInput(new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime()) });
    var e = h("input", { type: "date", value: dateInput(new Date(now.getFullYear(), now.getMonth(), 1).getTime()) });
    var next = h("input", { value: ix.next || "", placeholder: "다음 호 예정 (예: 2027년 1월 둘째 주) — 공개 페이지에 보입니다" });
    var previewBox = h("div");
    var left = h("div", { class: "panel" }, h("h2", null, "새 호"),
      h("div", { class: "newf" }, slug, title, h("div", { class: "grid2" }, field("시작(포함)", s), field("끝(미포함)", e)),
        h("p", { class: "help", text: "끝 날짜 0시 전까지 받은 답변을 셉니다. 발행은 기간이 끝난 뒤에만 됩니다." }),
        h("div", { class: "actions", style: "margin-top:0" },
          h("button", { class: "ghost", onclick: run(async function () { var r = await api("POST", "/api/admin/index/preview", { start: kstMidnight(s.value), end: kstMidnight(e.value) }); clear(previewBox).appendChild(dataView(r.data)); }) }, "미리 계산"),
          h("button", { class: "btn", onclick: run(async function () { var r = await api("POST", "/api/admin/index", { slug: slug.value, title: title.value, start: kstMidnight(s.value), end: kstMidnight(e.value) }); await loadIssue(r.id); await loadIndex(); }) }, "초안 만들기"))),
      h("div", { class: "newf" }, field("다음 호 예정", next), h("div", null, h("button", { class: "ghost", onclick: run(async function () { await api("POST", "/api/admin/index/next", { next: next.value }); toast("저장했어요."); }) }, "저장"))),
      h("h2", null, "발행 목록"),
      ix.issues.length ? h("div", { class: "rows" }, ix.issues.map(function (i) {
        return h("button", { class: "row" + (i.id === state.issueSel ? " on" : ""), onclick: run(async function () { await loadIssue(i.id); render(); }) },
          h("div", { class: "t1" }, h("span", { class: "nm", text: i.title }), h("span", { class: "sp" }), h("span", { class: "pill " + (i.status === "published" ? "g" : "w"), text: i.status === "published" ? "발행" + (Number(i.revision) ? " · 정정 " + i.revision : "") : "초안" })),
          h("div", { class: "t2", text: i.slug + " · " + kd(i.period_start) + " ~ " + kd(Number(i.period_end) - 1) }));
      })) : h("div", { class: "empty", text: "아직 없어요." }));
    var right = h("div", { class: "panel detail" }, state.issue ? issueView(state.issue) : h("div", { class: "body" }, previewBox.childNodes.length ? previewBox : h("div", { class: "empty" }, "초안을 고르거나 기간을 정해 미리 계산하세요.", h("br"), "지수에는 재확인을 마친 감사, 무료 자가 점검(익명), 베리라인 검사 현황(집계 숫자)이 들어갑니다."), previewBox));
    view.appendChild(h("div", { class: "split" }, left, right));
  }

  function dataView(dt) {
    var hdl = dt.headline;
    var wrap = h("div", { class: "box" }, h("h3", null, "계산 결과", h("span", { class: "pill", text: dt.method })));
    wrap.appendChild(h("div", { class: "nums" },
      h("div", null, h("div", { class: "k", text: "대표 숫자" }), h("div", { class: "v", text: hdl && hdl.rate !== null ? pct(hdl.rate) : "—" })),
      h("div", null, h("div", { class: "k", text: "95% 구간" }), h("div", { class: "v", style: "font-size:14px", text: hdl && hdl.rate !== null ? pct(hdl.low) + "~" + pct(hdl.high) : "—" })),
      h("div", null, h("div", { class: "k", text: "표본" }), h("div", { class: "v", text: hdl ? n(hdl.n) + (hdl.provisional ? " (예비)" : "") : "0" })),
      h("div", null, h("div", { class: "k", text: "감사 서비스" }), h("div", { class: "v", text: n(dt.audits.services) })),
      h("div", null, h("div", { class: "k", text: "자가 점검 답변" }), h("div", { class: "v", text: n(dt.selfAudits.overall.n) })),
      h("div", null, h("div", { class: "k", text: "베리라인 검사 글" }), h("div", { class: "v", text: n(dt.engine.texts) }))));
    function table(title, cells) {
      if (!cells || !cells.length) return null;
      return h("div", { style: "margin-top:12px" }, h("div", { class: "help", text: title }), h("table", { class: "t" }, h("thead", null, h("tr", null, h("th", { text: "구분" }), h("th", { text: "n" }), h("th", { text: "비율" }), h("th", { text: "95% 구간" }))),
        h("tbody", null, cells.map(function (c) { return h("tr", null, h("td", { text: c.label }), h("td", { text: n(c.n) }), h("td", { text: c.rate === null ? "표본 부족" : pct(c.rate) }), h("td", { text: c.rate === null ? "" : pct(c.low) + "~" + pct(c.high) })); }))));
    }
    add(wrap, [table("감사 · 유형별", dt.audits.byType), table("감사 · 업종별", dt.audits.byDomain), table("자가 점검 · 유형별", dt.selfAudits.byType)]);
    add(wrap, h("p", { class: "help", text: "공개 동의 서비스 " + dt.audits.named.length + "곳 · 익명 사례 " + dt.audits.cases.length + "건 · 주장 대조 " + n(dt.audits.claims.total) + "건" }));
    return wrap;
  }

  function issueView(is) {
    var body = h("div", { class: "body" });
    var published = is.status === "published";
    var title = h("input", { value: is.title, disabled: published });
    var com = h("textarea", { rows: 8, value: is.commentary || "", placeholder: "이번 호에서 볼 것 — 숫자를 해석해 주는 해설. 과장하지 말고, 표본과 한계를 같이 적으세요. 공개 페이지 맨 위에 실립니다." });
    body.appendChild(h("div", { class: "box" }, h("h3", null, is.title, h("span", { class: "pill " + (published ? "g" : "w"), text: published ? "발행 " + kd(is.published_at) : "초안" })),
      h("div", { class: "help", text: is.slug + " · " + kd(is.period_start) + " ~ " + kd(Number(is.period_end) - 1) + " · 방법 " + is.method_version }),
      published ? h("div", { class: "actions" }, h("a", { class: "ghost", href: "/hallucination-index/" + is.slug, target: "_blank", rel: "noopener" }, "공개 페이지"), h("a", { class: "ghost", href: "/hallucination-index/" + is.slug + ".json", target: "_blank", rel: "noopener" }, "원자료 JSON"), h("span", { class: "mono", text: "SHA-256 " + is.sha256 })) : null,
      h("div", { style: "margin-top:10px" }, field("제목", title)), h("div", { style: "margin-top:8px" }, field("해설", com)),
      published
        ? (function () {
            var why = h("input", { placeholder: "정정 사유 — 공개 페이지에 그대로 실립니다" });
            var re = h("input", { type: "checkbox", style: "width:auto" });
            return h("div", null, h("div", { style: "margin-top:10px" }, field("정정 사유", why)),
              h("label", { class: "help", style: "display:flex;gap:6px;align-items:center;margin-top:6px" }, re, "숫자도 다시 계산한다 (데이터 오류를 바로잡을 때만)"),
              h("div", { class: "actions" }, h("button", { class: "btn warn", onclick: run(async function () { if (!confirm("정정 발행할까요? 지문이 바뀌고 이전 지문과 사유가 공개 기록으로 남습니다.")) return; var r = await api("POST", "/api/admin/index/" + is.id + "/correct", { note: why.value, commentary: com.value, recompute: re.checked }); toast("정정 발행했어요. 새 지문 " + r.sha256.slice(0, 12) + "…"); await loadIssue(is.id); await loadIndex(); }) }, "정정 발행")));
          })()
        : h("div", { class: "actions" },
            h("button", { class: "ghost", onclick: run(async function () { await api("PATCH", "/api/admin/index/" + is.id, { title: title.value, commentary: com.value }); toast("저장했어요."); await loadIssue(is.id); render(); }) }, "저장"),
            h("button", { class: "ghost", onclick: run(async function () { await api("PATCH", "/api/admin/index/" + is.id, { title: title.value, commentary: com.value, recompute: true }); toast("다시 계산했어요."); await loadIssue(is.id); render(); }) }, "다시 계산"),
            h("button", { class: "btn", disabled: Number(is.period_end) > Date.now(), onclick: run(async function () { await api("PATCH", "/api/admin/index/" + is.id, { title: title.value, commentary: com.value }); if (!confirm("발행할까요? 발행하면 숫자가 고정되고 지문이 붙습니다. 이후에는 정정 발행으로만 고칠 수 있습니다.")) return; var r = await api("POST", "/api/admin/index/" + is.id + "/publish"); toast("발행했어요. 지문 " + r.sha256.slice(0, 12) + "…"); await loadIssue(is.id); await loadIndex(); }) }, Number(is.period_end) > Date.now() ? "기간이 끝나면 발행" : "발행"),
            h("span", { class: "sp" }),
            h("button", { class: "ghost", onclick: run(async function () { if (!confirm("초안을 지울까요?")) return; await api("DELETE", "/api/admin/index/" + is.id); state.issue = null; state.issueSel = null; await loadIndex(); }) }, "초안 삭제"))));
    body.appendChild(dataView(is.data));
    if (is.corrections && is.corrections.length) body.appendChild(h("div", { class: "box" }, h("h3", null, "정정 기록"), h("table", { class: "t" }, h("tbody", null, is.corrections.map(function (c) { return h("tr", null, h("td", { text: kd(c.at) }), h("td", { text: c.note }), h("td", { class: "mono", text: c.prev_sha256 || "" })); })))));
    return body;
  }

  boot().catch(function (e) { toast(e.message, true); });
})();
</script>
</body>
</html>`;
}
