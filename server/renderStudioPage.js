// 스튜디오 운영 보드(/admin/studio).
//
// 생김새는 지갑 앱에서 가져왔다. 지갑이 잘하는 일이 정확히 이 화면이 할 일이기
// 때문이다 — 맨 위에 "지금 얼마"를 크게 하나 두고, 그 아래에 그 숫자가 어디서
// 왔는지를 줄로 늘어놓고, 나머지는 눌러서 들어가게 한다. 예전에는 표 네 개가
// 세로로 이어져 있어서, 총 매출을 보려면 스크롤을 올리고 의뢰를 보려면 내려야 했다.
//
// 색은 리머 사이트와 같은 파랑→보라 스펙트럼을 쓴다. 대표가 하루에 두 화면을
// 오가는데 서로 다른 제품처럼 생겼으면 매번 다시 적응해야 한다.
//
// 데이터는 여기서 내려보내지 않는다. 빈 틀만 주고 /api/admin/studio를 불러 채운다.
export function renderStudioPage() {
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="robots" content="noindex, nofollow" />
<title>리머 스튜디오</title>
<style>
  *, *::before, *::after { box-sizing: border-box; }
  :root {
    --bg: #07070b;
    --ink: #eceae4;
    --dim: rgba(236,234,228,.66);
    --faint: rgba(236,234,228,.42);
    --line: rgba(236,234,228,.11);
    --line2: rgba(236,234,228,.2);
    --card: rgba(255,255,255,.035);
    --blue: #4c7df6; --mid: #6d5ae0; --violet: #8b5cf6;
    --beam: linear-gradient(100deg, var(--blue), var(--mid) 52%, var(--violet));
    --good: #46c08a; --warn: #e0a53c; --bad: #e0745c;
    --mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
  }
  body {
    margin: 0; background: var(--bg); color: var(--ink); word-break: keep-all;
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', 'Noto Sans KR', sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  /* 지갑 앱의 그 은은한 광원. 잔액 카드 뒤에서만 빛난다. */
  body::before {
    content: ""; position: fixed; inset: 0; pointer-events: none; z-index: 0;
    background:
      radial-gradient(760px 420px at 18% -8%, rgba(109,90,224,.26), transparent 62%),
      radial-gradient(620px 380px at 88% 4%, rgba(76,125,246,.16), transparent 66%);
  }
  main { position: relative; z-index: 1; max-width: 1180px; margin: 0 auto; padding: 22px clamp(14px,3vw,26px) 80px; }

  .bar { display: flex; align-items: center; gap: 10px; margin-bottom: 18px; }
  .logo { display: flex; align-items: center; gap: 9px; font: 600 12px/1 var(--mono); letter-spacing: .2em; }
  .logo i { width: 9px; height: 9px; background: var(--beam); border-radius: 2px; transform: rotate(45deg); }
  .bar .sp { flex: 1; }
  .ghost { font: inherit; font-size: 12px; padding: 7px 12px; border-radius: 9px; cursor: pointer;
           border: 1px solid var(--line2); background: transparent; color: var(--dim); text-decoration: none; }
  .ghost:hover { background: rgba(255,255,255,.06); color: var(--ink); }

  /* ── 잔액 카드 ── */
  .wallet { border: 1px solid var(--line); border-radius: 22px; padding: 22px clamp(16px,2.4vw,26px);
            background: linear-gradient(160deg, rgba(109,90,224,.16), rgba(255,255,255,.028) 46%); margin-bottom: 14px; }
  .wallet .lbl { font: 600 10.5px/1 var(--mono); letter-spacing: .16em; color: var(--faint); text-transform: uppercase; }
  .total { margin: 11px 0 0; font-size: clamp(32px, 6vw, 46px); font-weight: 700; letter-spacing: -.03em;
           font-variant-numeric: tabular-nums; line-height: 1.05;
           background: linear-gradient(120deg, var(--ink) 32%, #b9a8ff); -webkit-background-clip: text; background-clip: text; color: transparent; }
  .assets { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px,1fr)); gap: 1px; margin-top: 20px;
            background: var(--line); border: 1px solid var(--line); border-radius: 14px; overflow: hidden; }
  .asset { background: #0a0a10; padding: 13px 15px; }
  .asset .k { display: flex; align-items: center; gap: 7px; font-size: 11.5px; color: var(--faint); }
  .asset .k i { width: 7px; height: 7px; border-radius: 50%; }
  .asset .v { margin-top: 6px; font-size: 16px; font-weight: 650; font-variant-numeric: tabular-nums; }
  .asset .n { font-size: 11px; color: var(--faint); margin-top: 2px; }

  /* 파이프라인 — 돈이 어느 단계에 얼마나 묶여 있는지 */
  .pipe { display: flex; height: 8px; border-radius: 99px; overflow: hidden; background: rgba(255,255,255,.05); margin-top: 18px; }
  .pipe span { display: block; height: 100%; }
  .pipekey { display: flex; flex-wrap: wrap; gap: 14px; margin-top: 10px; font-size: 11.5px; color: var(--faint); }
  .pipekey b { color: var(--ink); font-weight: 600; font-variant-numeric: tabular-nums; }
  .pipekey i { display: inline-block; width: 8px; height: 8px; border-radius: 2px; margin-right: 6px; }

  /* ── 탭 ── */
  .tabs { display: flex; gap: 4px; padding: 4px; margin: 18px 0 16px; border: 1px solid var(--line);
          border-radius: 13px; background: rgba(255,255,255,.028); overflow-x: auto; }
  .tabs button { flex: 1; min-width: 88px; font: inherit; font-size: 12.5px; padding: 9px 12px; border: 0; cursor: pointer;
                 border-radius: 9px; background: transparent; color: var(--dim); white-space: nowrap; }
  .tabs button.on { background: var(--beam); color: #fff; font-weight: 600; }
  .tabs button .c { font-size: 10.5px; opacity: .72; margin-left: 5px; font-variant-numeric: tabular-nums; }

  .card { border: 1px solid var(--line); border-radius: 18px; background: var(--card); padding: 18px clamp(14px,2vw,20px); margin-bottom: 12px; }
  .card > h2 { font-size: 13.5px; margin: 0 0 3px; font-weight: 600; }
  .card > .d { font-size: 11.5px; color: var(--faint); margin: 0 0 14px; line-height: 1.6; }
  .pane { display: none; } .pane.on { display: block; }

  /* ── 줄 목록(지갑의 거래 내역처럼) ── */
  .item { display: grid; grid-template-columns: 38px minmax(0,1fr) auto; gap: 12px; align-items: start;
          padding: 13px 0; border-top: 1px solid var(--line); }
  .item:first-child { border-top: 0; }
  .av { width: 38px; height: 38px; border-radius: 12px; display: grid; place-items: center;
        font: 600 13px/1 var(--mono); background: rgba(255,255,255,.05); border: 1px solid var(--line); }
  .t1 { font-size: 14px; font-weight: 600; letter-spacing: -.01em; }
  .t2 { font-size: 11.5px; color: var(--faint); margin-top: 3px; line-height: 1.6; }
  .t3 { font-size: 12.5px; color: var(--dim); margin-top: 7px; line-height: 1.7; white-space: pre-wrap;
        max-height: 92px; overflow: auto; }
  .right { text-align: right; display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }
  .amt { font-size: 14px; font-weight: 650; font-variant-numeric: tabular-nums; white-space: nowrap; }

  .pill { display: inline-block; padding: 3px 9px; border-radius: 99px; font-size: 10.5px; font-weight: 600; white-space: nowrap;
          background: rgba(255,255,255,.07); color: var(--dim); border: 1px solid var(--line); }
  .p-new { background: rgba(76,125,246,.16); color: #9bbcff; border-color: rgba(76,125,246,.3); }
  .p-active, .p-doing, .p-replied { background: rgba(224,165,60,.15); color: #e8c078; border-color: rgba(224,165,60,.28); }
  .p-done, .p-won { background: rgba(70,192,138,.15); color: #7ddab0; border-color: rgba(70,192,138,.28); }
  .p-lost, .p-dropped, .p-late { background: rgba(224,116,92,.16); color: #f0a08c; border-color: rgba(224,116,92,.3); }
  .p-lead, .p-quoted { background: rgba(139,92,246,.15); color: #c0a8ff; border-color: rgba(139,92,246,.28); }

  input, select, textarea { font: inherit; font-size: 12.5px; padding: 8px 10px; width: 100%; color: var(--ink);
    border: 1px solid var(--line2); border-radius: 9px; background: rgba(0,0,0,.28); }
  input:focus, select:focus, textarea:focus { outline: none; border-color: var(--mid); box-shadow: 0 0 0 3px rgba(109,90,224,.16); }
  input::placeholder { color: rgba(236,234,228,.28); }
  select option { background: #14141c; }
  button.b { font: inherit; font-size: 12.5px; padding: 8px 12px; border-radius: 9px; cursor: pointer;
             border: 1px solid var(--line2); background: rgba(255,255,255,.05); color: var(--dim); white-space: nowrap; }
  button.b:hover { background: rgba(255,255,255,.1); color: var(--ink); }
  button.b.pri { background: var(--beam); border-color: transparent; color: #fff; font-weight: 600; }
  button.b.danger:hover { color: #f0a08c; border-color: rgba(224,116,92,.4); }
  .row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .row > input, .row > select { width: auto; flex: 1 1 130px; min-width: 110px; }

  .prog { height: 5px; border-radius: 99px; background: rgba(255,255,255,.07); overflow: hidden; width: 118px; }
  .prog i { display: block; height: 100%; background: var(--beam); }

  /* ── 체크리스트 ── */
  .lists { display: grid; grid-template-columns: repeat(auto-fit, minmax(290px,1fr)); gap: 12px; }
  .list { border: 1px solid var(--line); border-radius: 16px; background: rgba(255,255,255,.025); padding: 15px 16px; }
  .list h3 { margin: 0; font-size: 13.5px; font-weight: 600; display: flex; align-items: center; gap: 8px; }
  .list h3 .dot { width: 8px; height: 8px; border-radius: 50%; }
  .list .meta { font-size: 11px; color: var(--faint); margin: 5px 0 11px; display: flex; align-items: center; gap: 8px; }
  .list .meta a { color: var(--faint); }
  .todo { display: flex; align-items: flex-start; gap: 9px; padding: 7px 0; border-top: 1px solid var(--line); }
  .todo:first-of-type { border-top: 0; }
  .box { flex: none; width: 17px; height: 17px; margin-top: 1px; border-radius: 6px; cursor: pointer;
         border: 1px solid var(--line2); background: transparent; position: relative; }
  .box.doing { border-color: var(--warn); }
  .box.doing::after { content: ""; position: absolute; inset: 4px; border-radius: 2px; background: var(--warn); }
  .box.done { border-color: transparent; background: var(--beam); }
  .box.done::after { content: ""; position: absolute; left: 6px; top: 3px; width: 4px; height: 8px;
                     border: solid #fff; border-width: 0 1.6px 1.6px 0; transform: rotate(42deg); }
  .todo .tx { flex: 1; font-size: 12.5px; line-height: 1.55; cursor: text; }
  .todo.is-done .tx { color: var(--faint); text-decoration: line-through; }
  .todo .ops { display: flex; gap: 2px; opacity: 0; transition: opacity .15s; }
  .todo:hover .ops { opacity: 1; }
  .todo .ops button { border: 0; background: none; color: var(--faint); cursor: pointer; font-size: 12px; padding: 1px 3px; line-height: 1; }
  .todo .ops button:hover { color: var(--ink); }
  .addrow { margin-top: 10px; }

  table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
  th, td { text-align: left; padding: 9px 8px; border-bottom: 1px solid var(--line); }
  th { font-size: 11px; color: var(--faint); font-weight: 600; white-space: nowrap; }
  td.n, th.n { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .scroll { overflow-x: auto; }
  .empty { padding: 26px 0; text-align: center; font-size: 12.5px; color: var(--faint); line-height: 1.7; }
  .err { display: none; margin-bottom: 12px; padding: 11px 13px; border-radius: 11px; font-size: 12.5px;
         background: rgba(224,116,92,.12); border: 1px solid rgba(224,116,92,.3); color: #f0a08c; }
  .hint { font-size: 11px; color: var(--faint); margin-top: 8px; line-height: 1.6; }
  @media (max-width: 620px) { .item { grid-template-columns: 32px minmax(0,1fr); } .item .right { grid-column: 2; align-items: flex-start; } .av { width: 32px; height: 32px; } }
</style>
</head>
<body>
<main>
  <div class="bar">
    <span class="logo"><i></i>REAMER</span>
    <span class="sp"></span>
    <a class="ghost" href="/admin">유메 운영</a>
    <button class="ghost" id="out">로그아웃</button>
  </div>

  <div class="err" id="err"></div>

  <section class="wallet">
    <div class="lbl">총 매출</div>
    <div class="total" id="total">₩0</div>
    <div class="assets" id="assets"></div>
    <div class="pipe" id="pipe"></div>
    <div class="pipekey" id="pipekey"></div>
  </section>

  <nav class="tabs" id="tabs"></nav>

  <div class="pane" id="pane-home"></div>
  <div class="pane" id="pane-inq"></div>
  <div class="pane" id="pane-proj"></div>
  <div class="pane" id="pane-todo"></div>
  <div class="pane" id="pane-price"></div>
</main>

<script>
(function () {
  var S = null, TAB = localStorage.getItem("studio.tab") || "home";

  var E = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var won = function (n) { return "₩" + Number(n || 0).toLocaleString("ko-KR"); };
  // 큰 금액은 자리수를 다 읽는 것보다 규모가 먼저 보이는 편이 낫다.
  var kwon = function (n) {
    n = Number(n || 0);
    if (n >= 100000000) return "₩" + (n / 100000000).toFixed(n % 100000000 ? 1 : 0) + "억";
    if (n >= 10000) return "₩" + Math.round(n / 10000).toLocaleString("ko-KR") + "만";
    return won(n);
  };
  var day = function (t) { return t ? new Date(Number(t)).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" }) : ""; };
  var dinput = function (t) { if (!t) return ""; var d = new Date(Number(t));
    return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
  var initial = function (s) { return String(s || "?").trim().slice(0, 2); };

  var INQ = { new: "신규", replied: "회신함", quoted: "견적 보냄", won: "수주", lost: "무산" };
  var PRJ = { lead: "상담", active: "진행 중", done: "완료", dropped: "무산" };
  var NEXT = { todo: "doing", doing: "done", done: "todo" };
  var TINT = { yume: "#7c5cd6", proba: "#4c7df6", ballast: "#59a9ff", aipick: "#d8b48a" };

  function fail(m) { var e = document.getElementById("err"); e.textContent = m; e.style.display = "block"; }
  function clearErr() { document.getElementById("err").style.display = "none"; }

  async function api(path, opts) {
    opts = opts || {};
    var r = await fetch("/api/admin" + path, {
      method: opts.method || "GET", credentials: "same-origin",
      headers: opts.body ? { "Content-Type": "application/json" } : {},
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    var d = await r.json().catch(function () { return {}; });
    if (!r.ok) throw new Error(d.error || ("요청이 실패했어요 (" + r.status + ")"));
    return d;
  }

  // 체크리스트가 있는 일감은 진행률을 목록에서 끌어온다. 손으로 적은 숫자와
  // 체크 상태가 따로 놀면 어느 쪽이 맞는지 알 수 없게 된다.
  function tasksOf(key) { return S.tasks.filter(function (t) { return t.product === key; }); }
  function progressOf(p) {
    var ts = tasksOf("project:" + p.id);
    if (!ts.length) return { pct: Number(p.progress || 0), derived: false, done: 0, total: 0 };
    var done = ts.filter(function (t) { return t.state === "done"; }).length;
    return { pct: Math.round((done / ts.length) * 100), derived: true, done: done, total: ts.length };
  }
  function lateness(p) {
    if (!p.due_at || p.status === "done" || p.status === "dropped") return null;
    var d = Math.floor((Number(p.due_at) - Date.now()) / 864e5);
    if (d < 0) return { txt: (-d) + "일 지남", cls: "p-late" };
    if (d <= 3) return { txt: "D-" + d, cls: "p-active" };
    return null;
  }

  // ── 잔액 ──
  function wallet() {
    var s = S.summary;
    document.getElementById("total").textContent = won(s.revenueOutsourcing + s.revenueYume);
    document.getElementById("assets").innerHTML =
      asset("var(--violet)", "외주", won(s.revenueOutsourcing), s.done + "건 완료") +
      asset("var(--blue)", "유메 결제", won(s.revenueYume), s.yumeOrders + "건") +
      asset("var(--warn)", "미수금", won(s.outstanding), "계약 " + kwon(s.contracted)) +
      asset("var(--good)", "진행 중", String(s.active), "상담 " + s.lead + " · 신규 의뢰 " + s.inquiriesNew);

    // 계약된 돈이 어느 단계에 묶여 있는지. 합이 0이면 막대를 감춘다.
    var leadK = 0, activeK = 0, doneK = 0;
    S.projects.forEach(function (p) {
      if (p.status === "dropped") return;
      var a = Number(p.amount_krw || 0);
      if (p.status === "lead") leadK += a; else if (p.status === "active") activeK += a; else doneK += a;
    });
    var tot = leadK + activeK + doneK;
    var pipe = document.getElementById("pipe"), key = document.getElementById("pipekey");
    if (!tot) { pipe.style.display = "none"; key.innerHTML = ""; return; }
    pipe.style.display = "flex";
    var seg = function (v, c) { return '<span style="width:' + ((v / tot) * 100) + '%;background:' + c + '"></span>'; };
    pipe.innerHTML = seg(leadK, "var(--violet)") + seg(activeK, "var(--warn)") + seg(doneK, "var(--good)");
    key.innerHTML =
      '<span><i style="background:var(--violet)"></i>상담 <b>' + kwon(leadK) + "</b></span>" +
      '<span><i style="background:var(--warn)"></i>진행 <b>' + kwon(activeK) + "</b></span>" +
      '<span><i style="background:var(--good)"></i>완료 <b>' + kwon(doneK) + "</b></span>";
  }
  function asset(c, k, v, n) {
    return '<div class="asset"><div class="k"><i style="background:' + c + '"></i>' + k + "</div>" +
      '<div class="v">' + v + '</div><div class="n">' + E(n) + "</div></div>";
  }

  // ── 탭 ──
  function tabs() {
    var s = S.summary;
    var defs = [
      ["home", "요약", ""], ["inq", "의뢰", s.inquiriesNew || ""],
      ["proj", "일감", s.active || ""], ["todo", "할 일", ""], ["price", "가격", ""],
    ];
    document.getElementById("tabs").innerHTML = defs.map(function (d) {
      return '<button data-tab="' + d[0] + '"' + (TAB === d[0] ? ' class="on"' : "") + ">" + d[1] +
        (d[2] ? '<span class="c">' + d[2] + "</span>" : "") + "</button>";
    }).join("");
    ["home", "inq", "proj", "todo", "price"].forEach(function (k) {
      document.getElementById("pane-" + k).className = "pane" + (TAB === k ? " on" : "");
    });
  }

  // ── 요약 ──
  function home() {
    var soon = S.projects.filter(function (p) { return p.status === "active"; })
      .sort(function (a, b) { return (Number(a.due_at) || 9e15) - (Number(b.due_at) || 9e15); });
    var fresh = S.inquiries.filter(function (q) { return (q.status || "new") === "new"; }).slice(0, 4);

    document.getElementById("pane-home").innerHTML =
      '<section class="card"><h2>진행 중인 일</h2><p class="d">마감이 가까운 순서입니다.</p>' +
      (soon.length ? soon.map(function (p) {
        var g = progressOf(p), late = lateness(p);
        return '<div class="item"><div class="av">' + E(initial(p.client || p.title)) + "</div>" +
          '<div><div class="t1">' + E(p.title) + "</div>" +
          '<div class="t2">' + E(p.client || "고객 미정") + (p.due_at ? " · 마감 " + day(p.due_at) : "") +
          (g.derived ? " · 할 일 " + g.done + "/" + g.total : "") + "</div></div>" +
          '<div class="right">' + (late ? '<span class="pill ' + late.cls + '">' + late.txt + "</span>" : "") +
          '<div class="prog"><i style="width:' + g.pct + '%"></i></div>' +
          '<span class="t2">' + g.pct + "%</span></div></div>";
      }).join("") : '<div class="empty">진행 중인 일이 없습니다.<br>의뢰 탭에서 “일감으로”를 누르거나 직접 추가하세요.</div>') +
      "</section>" +
      '<section class="card"><h2>새 의뢰</h2><p class="d">아직 회신하지 않은 건입니다.</p>' +
      (fresh.length ? fresh.map(function (q) {
        return '<div class="item"><div class="av">' + E(initial(q.name)) + "</div>" +
          '<div><div class="t1">' + E(q.name) + (q.company ? " · " + E(q.company) : "") + "</div>" +
          '<div class="t2">' + E(q.kind || "") + " · " + E(q.budget || "") + " · " + day(q.created_at) + "</div>" +
          '<div class="t3">' + E(q.message) + "</div></div>" +
          '<div class="right"><button class="b" data-conv="' + q.id + '">일감으로</button></div></div>';
      }).join("") : '<div class="empty">새 의뢰가 없습니다.</div>') + "</section>";
  }

  // ── 의뢰 ──
  function inquiries() {
    document.getElementById("pane-inq").innerHTML =
      '<section class="card"><h2>들어온 의뢰</h2><p class="d">리머 사이트 문의 양식으로 접수된 건입니다. 연락처를 누르면 메일이 열립니다.</p>' +
      (S.inquiries.length ? S.inquiries.map(function (q) {
        var st = q.status || "new";
        var isMail = String(q.contact || "").indexOf("@") > 0;
        return '<div class="item"><div class="av">' + E(initial(q.name)) + "</div>" +
          '<div><div class="t1">' + E(q.name) + (q.company ? ' <span class="t2" style="display:inline">· ' + E(q.company) + "</span>" : "") + "</div>" +
          '<div class="t2">' + (isMail ? '<a href="mailto:' + E(q.contact) + '" style="color:inherit">' + E(q.contact) + "</a>" : E(q.contact)) +
          " · " + E(q.kind || "") + " · " + E(q.budget || "") + " · " + day(q.created_at) + "</div>" +
          '<div class="t3">' + E(q.message) + "</div></div>" +
          '<div class="right"><span class="pill p-' + st + '">' + INQ[st] + "</span>" +
          '<select data-inq="' + q.id + '" style="width:112px">' + Object.keys(INQ).map(function (k) {
            return '<option value="' + k + '"' + (k === st ? " selected" : "") + ">" + INQ[k] + "</option>"; }).join("") + "</select>" +
          '<button class="b" data-conv="' + q.id + '">일감으로</button></div></div>';
      }).join("") : '<div class="empty">아직 들어온 의뢰가 없습니다.</div>') + "</section>";
  }

  // ── 일감 ──
  function projects() {
    var q = (document.getElementById("pf") || {}).value || "";
    var list = S.projects.filter(function (p) {
      if (!q) return true;
      return ((p.title || "") + " " + (p.client || "")).toLowerCase().indexOf(q.toLowerCase()) >= 0;
    });
    document.getElementById("pane-proj").innerHTML =
      '<section class="card"><h2>일감 추가</h2>' +
      '<div class="row"><input id="nTitle" placeholder="일감 이름" /><input id="nClient" placeholder="고객" />' +
      '<input id="nAmount" type="number" min="0" step="100000" placeholder="계약 금액" />' +
      '<button class="b pri" id="addProject">추가</button></div></section>' +
      '<section class="card"><h2>일감 ' + S.projects.length + "건</h2>" +
      '<p class="d">칸을 고치면 바로 저장됩니다. 체크리스트가 있는 일감은 진행률을 체크 상태에서 가져옵니다.</p>' +
      '<div class="row" style="margin-bottom:12px"><input id="pf" placeholder="이름 · 고객으로 찾기" value="' + E(q) + '" /></div>' +
      (list.length ? '<div class="scroll"><table><tr><th>이름</th><th>고객</th><th>상태</th><th>진행</th>' +
        '<th class="n">계약</th><th class="n">받음</th><th>마감</th><th></th></tr>' +
        list.map(function (p) {
          var g = progressOf(p), late = lateness(p);
          return "<tr><td><input data-f='title' data-id='" + p.id + "' value='" + E(p.title) + "' style='min-width:130px' /></td>" +
            "<td><input data-f='client' data-id='" + p.id + "' value='" + E(p.client || "") + "' style='min-width:84px' /></td>" +
            "<td><select data-f='status' data-id='" + p.id + "' style='width:88px'>" + Object.keys(PRJ).map(function (k) {
              return "<option value='" + k + "'" + (k === p.status ? " selected" : "") + ">" + PRJ[k] + "</option>"; }).join("") + "</select></td>" +
            "<td><div class='prog' style='width:76px'><i style='width:" + g.pct + "%'></i></div>" +
            (g.derived ? "<div class='t2'>" + g.done + "/" + g.total + " · " + g.pct + "%</div>"
                       : "<input data-f='progress' data-id='" + p.id + "' type='number' min='0' max='100' value='" + g.pct + "' style='width:64px;margin-top:4px' />") + "</td>" +
            "<td class='n'><input data-f='amount_krw' data-id='" + p.id + "' type='number' min='0' step='100000' value='" + Number(p.amount_krw || 0) + "' style='width:104px' /></td>" +
            "<td class='n'><input data-f='paid_krw' data-id='" + p.id + "' type='number' min='0' step='100000' value='" + Number(p.paid_krw || 0) + "' style='width:104px' /></td>" +
            "<td><input data-f='due_at' data-id='" + p.id + "' type='date' value='" + dinput(p.due_at) + "' style='width:132px' />" +
            (late ? "<div><span class='pill " + late.cls + "'>" + late.txt + "</span></div>" : "") + "</td>" +
            "<td><button class='b danger' data-del='" + p.id + "'>삭제</button></td></tr>";
        }).join("") + "</table></div>"
        : '<div class="empty">' + (q ? "찾는 일감이 없습니다." : "아직 일감이 없습니다.") + "</div>") + "</section>";
  }

  // ── 할 일 ──
  // 자사 제품 넷과, 무산되지 않은 외주 일감 전부가 각자 목록을 가진다.
  function todos() {
    var owners = S.products.map(function (p) {
      return { key: p.key, label: p.label, href: p.href, tint: TINT[p.key] || "var(--mid)", sub: "자사 제품" };
    }).concat(S.projects.filter(function (p) { return p.status !== "dropped"; }).map(function (p) {
      return { key: "project:" + p.id, label: p.title, href: null, tint: "var(--mid)", sub: (PRJ[p.status] || "") + (p.client ? " · " + p.client : "") };
    }));

    document.getElementById("pane-todo").innerHTML =
      '<section class="card"><h2>체크리스트</h2>' +
      '<p class="d">사업마다 하나씩. 네모를 누르면 할 일 → 하는 중 → 완료로 돕니다. 글자를 누르면 고칠 수 있고, 저장은 자동입니다.</p>' +
      '<div class="lists">' + owners.map(function (o) {
        var ts = tasksOf(o.key);
        var done = ts.filter(function (t) { return t.state === "done"; }).length;
        return '<div class="list"><h3><span class="dot" style="background:' + o.tint + '"></span>' + E(o.label) + "</h3>" +
          '<div class="meta"><span>' + done + " / " + ts.length + " 완료</span>" +
          (o.href ? '<a href="' + E(o.href) + '" target="_blank" rel="noreferrer">열기 ↗</a>' : '<span>' + E(o.sub) + "</span>") + "</div>" +
          ts.map(function (t) {
            return '<div class="todo' + (t.state === "done" ? " is-done" : "") + '">' +
              '<button class="box ' + t.state + '" data-task="' + t.id + '" data-state="' + t.state + '" title="' + t.state + '"></button>' +
              '<span class="tx" data-edit="' + t.id + '">' + E(t.title) + "</span>" +
              '<span class="ops"><button data-move="' + t.id + '" data-dir="up" title="위로">↑</button>' +
              '<button data-move="' + t.id + '" data-dir="down" title="아래로">↓</button>' +
              '<button data-tdel="' + t.id + '" title="삭제">×</button></span></div>';
          }).join("") +
          '<div class="addrow"><input data-add="' + E(o.key) + '" placeholder="할 일 추가 후 Enter" /></div></div>';
      }).join("") + "</div></section>";
  }

  // ── 가격 ──
  var PRICE = [
    { name: "웹사이트 · 웹서비스", lo: 1, hi: 3, note: "회원 · 결제까지 붙으면 상단" },
    { name: "결제 · 인증 연동", lo: 1, hi: 3, note: "신청 · 연동 · 테스트 확인까지" },
    { name: "AI 기능 연동", lo: 1, hi: 3, note: "검증 · 근거 대조를 넣으면 상단" },
    { name: "업무 자동화 · 데이터", lo: 1, hi: 2, note: "연동할 외부 API 수에 비례" },
  ];
  var DEFAULT_RATE = 400000;
  function rate() { var v = Number(localStorage.getItem("studio.rate") || DEFAULT_RATE);
    return Number.isFinite(v) && v > 0 ? v : DEFAULT_RATE; }

  function price() {
    var r = rate();
    document.getElementById("pane-price").innerHTML =
      '<section class="card"><h2>가격 참고표</h2>' +
      '<p class="d">사이트에 적어둔 기간에 일당을 곱한 값입니다. 시장 조사가 아니라 계산기예요 — 일당을 바꾸면 전부 다시 계산됩니다.</p>' +
      '<div class="row" style="margin-bottom:14px"><input id="rate" type="number" min="0" step="10000" value="' + r + '" style="max-width:150px" />' +
      '<span class="t2">원 · 주 5일 기준</span><button class="b" id="rateReset">기본값</button></div>' +
      '<div class="scroll"><table><tr><th>서비스</th><th>기간</th><th class="n">일수</th><th class="n">적정가</th><th>메모</th></tr>' +
      PRICE.map(function (p) {
        return "<tr><td><b>" + E(p.name) + "</b></td><td class='t2'>" + p.lo + "~" + p.hi + "주</td>" +
          "<td class='n t2'>" + (p.lo * 5) + "~" + (p.hi * 5) + "일</td>" +
          "<td class='n'><b>" + won(p.lo * 5 * r) + " ~ " + won(p.hi * 5 * r) + "</b></td>" +
          "<td class='t2'>" + E(p.note) + "</td></tr>";
      }).join("") + "</table></div>" +
      '<p class="hint">결제 심사 보정 권고 대응과 인수 후 새 기능 추가는 이 표에 없습니다 — 별도 건으로 잡으세요. ' +
      '인수 후 1회 무료 AS와 범위 내 오류 수정은 포함이므로 그 몫을 미리 얹어 두는 편이 안전합니다.</p></section>';
  }

  function paint() { wallet(); tabs(); home(); inquiries(); projects(); todos(); price(); }

  async function load() {
    try { S = await api("/studio"); clearErr(); paint(); }
    catch (e) {
      if (String(e.message).indexOf("관리자") >= 0) location.reload();
      else fail(e.message);
    }
  }

  document.addEventListener("click", async function (ev) {
    var el = ev.target.closest("[data-tab],[data-conv],[data-del],[data-task],[data-tdel],[data-move],[data-edit],#addProject,#rateReset,#out");
    if (!el) return;
    try {
      if (el.dataset.tab) { TAB = el.dataset.tab; localStorage.setItem("studio.tab", TAB); return tabs(); }
      if (el.id === "out") { await api("/logout", { method: "POST" }); return location.reload(); }
      if (el.id === "rateReset") { localStorage.removeItem("studio.rate"); return price(); }
      if (el.id === "addProject") {
        var t = document.getElementById("nTitle").value.trim();
        if (!t) return fail("일감 이름을 적어주세요.");
        await api("/studio/project", { method: "POST", body: { title: t,
          client: document.getElementById("nClient").value,
          amount_krw: Number(document.getElementById("nAmount").value || 0) } });
        return load();
      }
      if (el.dataset.conv) { await api("/studio/inquiry/" + el.dataset.conv + "/convert", { method: "POST" }); TAB = "proj"; localStorage.setItem("studio.tab", TAB); return load(); }
      if (el.dataset.del) {
        if (!confirm("이 일감과 딸린 체크리스트를 삭제할까요? 되돌릴 수 없습니다.")) return;
        await api("/studio/project/" + el.dataset.del, { method: "DELETE" }); return load();
      }
      if (el.dataset.task) { await api("/studio/task/" + el.dataset.task, { method: "PATCH", body: { state: NEXT[el.dataset.state] } }); return load(); }
      if (el.dataset.move) { await api("/studio/task/" + el.dataset.move + "/move", { method: "POST", body: { dir: el.dataset.dir } }); return load(); }
      if (el.dataset.tdel) { await api("/studio/task/" + el.dataset.tdel, { method: "DELETE" }); return load(); }
      if (el.dataset.edit) {
        var cur = el.textContent;
        var next = prompt("할 일 수정", cur);
        if (next == null || next.trim() === "" || next === cur) return;
        await api("/studio/task/" + el.dataset.edit, { method: "PATCH", body: { title: next.trim() } });
        return load();
      }
    } catch (e) { fail(e.message); }
  });

  document.addEventListener("change", async function (ev) {
    var el = ev.target;
    if (el.id === "rate") {
      var v = Number(el.value);
      if (Number.isFinite(v) && v > 0) localStorage.setItem("studio.rate", String(Math.floor(v)));
      return price();
    }
    try {
      if (el.dataset.inq) { await api("/studio/inquiry/" + el.dataset.inq, { method: "PATCH", body: { status: el.value } }); return load(); }
      if (el.dataset.f && el.dataset.id) {
        var v2 = el.value;
        if (el.type === "date") v2 = v2 ? new Date(v2 + "T00:00:00").getTime() : null;
        var body = {}; body[el.dataset.f] = v2;
        await api("/studio/project/" + el.dataset.id, { method: "PATCH", body: body });
        return load();
      }
    } catch (e) { fail(e.message); }
  });

  // 찾기는 서버를 부르지 않는다. 이미 받아둔 목록에서 거르면 되고, 타이핑마다
  // 요청을 보내면 느려지기만 한다.
  document.addEventListener("input", function (ev) { if (ev.target.id === "pf") projects(); });

  document.addEventListener("keydown", async function (ev) {
    if (ev.key !== "Enter" || !ev.target.dataset.add) return;
    var title = ev.target.value.trim();
    if (!title) return;
    var owner = ev.target.dataset.add;
    try {
      await api("/studio/task", { method: "POST", body: { product: owner, title: title } });
      ev.target.value = "";
      await load();
      // 방금 적은 칸에 그대로 커서를 둔다. 여러 개를 연달아 적는 일이 많다.
      var again = document.querySelector('[data-add="' + owner.replace(/"/g, '\\\\"') + '"]');
      if (again) again.focus();
    } catch (e) { fail(e.message); }
  });

  load();
})();
</script>
</body>
</html>`;
}
