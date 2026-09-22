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

  .bar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 18px; }
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
  button.b, a.b { font: inherit; font-size: 12.5px; padding: 8px 12px; border-radius: 9px; cursor: pointer;
             border: 1px solid var(--line2); background: rgba(255,255,255,.05); color: var(--dim); white-space: nowrap;
             display: inline-block; text-decoration: none; }
  button.b:hover, a.b:hover { background: rgba(255,255,255,.1); color: var(--ink); }
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
  /* 상태 이름을 그대로 클래스로 쓰면 "todo"가 행 선택자(.todo)와 부딪혀
     체크박스에까지 행 스타일이 먹는다. 접두사를 붙여 떼어 놓는다. */
  .box.is-doing { border-color: var(--warn); }
  .box.is-doing::after { content: ""; position: absolute; inset: 4px; border-radius: 2px; background: var(--warn); }
  .box.is-done { border-color: transparent; background: var(--beam); }
  .box.is-done::after { content: ""; position: absolute; left: 6px; top: 3px; width: 4px; height: 8px;
                     border: solid #fff; border-width: 0 1.6px 1.6px 0; transform: rotate(42deg); }
  .todo .tx { flex: 1; font-size: 12.5px; line-height: 1.55; cursor: text; }
  .todo.is-done .tx { color: var(--faint); text-decoration: line-through; }
  .todo .ops { display: flex; gap: 2px; opacity: 0; transition: opacity .15s; }
  .todo:hover .ops { opacity: 1; }
  .todo .ops button { border: 0; background: none; color: var(--faint); cursor: pointer; font-size: 12px; padding: 1px 3px; line-height: 1; }
  .todo .ops button:hover { color: var(--ink); }
  /* 하는 중인 일은 표시가 계속 보여야 한다 — 손대는 중이라는 건 지나가는 상태가 아니고,
     마우스를 올려야만 보이면 목록을 훑을 때 아무 소용이 없다. */
  .todo .ops button.doing.on { color: var(--warn); }
  .todo:has(.ops button.doing.on) .ops { opacity: 1; }
  .addrow { margin-top: 10px; }

  /* ── 완료 칸 ── */
  /* 목록에서 끝난 일이 이리로 모인다. 사업 목록과 **같은 줄에 나란히 선 카드**다 —
     따로 떨어진 칸이면 끝낸 일이 어디로 갔는지 눈으로 따라가지 못한다.
     카드 색을 살짝 달리해 "지나간 것"으로 읽히게 하되, 지워진 것처럼 보이지는
     않게 한다 — 해제하면 돌아가야 하는 살아 있는 항목이다. */
  .done-box { background: rgba(70,192,138,.045); border-color: rgba(70,192,138,.2); }
  .done-box .cnt {
    font: 600 11px/1 var(--mono); padding: 3px 8px; border-radius: 99px;
    background: rgba(70,192,138,.16); color: #7ddab0; border: 1px solid rgba(70,192,138,.28);
  }
  /* 완료는 계속 쌓인다. 카드 안에서만 스크롤하게 둔다 — 카드가 길어지면
     같은 줄의 사업 목록까지 늘어나 화면이 통째로 흔들린다. */
  .donelist {
    max-height: 340px; overflow-y: auto; overscroll-behavior: contain;
    padding-right: 4px; scrollbar-width: thin; scrollbar-color: rgba(255,255,255,.16) transparent;
  }
  .donelist::-webkit-scrollbar { width: 7px; }
  .donelist::-webkit-scrollbar-thumb { background: rgba(255,255,255,.16); border-radius: 99px; }
  .donelist::-webkit-scrollbar-track { background: transparent; }
  .donelist .todo:first-of-type { border-top: 0; }
  /* 좁은 카드 안이라 제목이 줄바꿈될 자리를 먼저 내준다 */
  .donelist .tx { min-width: 0; }
  .from {
    display: inline-flex; align-items: center; gap: 6px; flex: none;
    min-width: 0; max-width: 42%;
    font-size: 11px; color: var(--faint); white-space: nowrap;
  }
  .from b { font-weight: 400; overflow: hidden; text-overflow: ellipsis; }
  .from i { width: 7px; height: 7px; border-radius: 50%; flex: none; }
  .drop {
    flex: none; border: 0; background: none; color: var(--faint); cursor: pointer;
    font-size: 12px; line-height: 1; padding: 1px 3px; opacity: 0; transition: opacity .15s;
  }
  .todo:hover .drop { opacity: 1; }
  .drop:hover { color: #f0a08c; }
  /* 목록이 다 비었을 때. 빈 자리를 그냥 두면 고장난 것처럼 보인다. */
  .allclear { padding: 10px 0; font-size: 12px; color: var(--faint); }

  table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
  th, td { text-align: left; padding: 9px 8px; border-bottom: 1px solid var(--line); }
  th { font-size: 11px; color: var(--faint); font-weight: 600; white-space: nowrap; }
  td.n, th.n { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .scroll { overflow-x: auto; }
  .empty { padding: 26px 0; text-align: center; font-size: 12.5px; color: var(--faint); line-height: 1.7; }
  .extwarn { display: none; margin-top: 14px; padding: 9px 12px; border-radius: 10px; font-size: 12px; line-height: 1.6;
             background: rgba(224,116,92,.1); border: 1px solid rgba(224,116,92,.26); color: #f0a08c; }
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
    <a class="ghost" href="/admin/desk" id="deskLink">의뢰 데스크</a>
    <a class="ghost" href="/admin">유메 운영</a>
    <a class="ghost" href="/admin/p/ballast">밸러스트</a>
    <a class="ghost" href="/admin/p/aipick">아이픽</a>
    <a class="ghost" href="/admin/p/proba">프로바</a>
    <button class="ghost" id="out">로그아웃</button>
  </div>

  <div class="err" id="err"></div>

  <section class="wallet">
    <div class="lbl">총 매출</div>
    <div class="total" id="total">₩0</div>
    <div class="assets" id="assets"></div>
    <div class="pipe" id="pipe"></div>
    <div class="pipekey" id="pipekey"></div>
    <div class="extwarn" id="extwarn"></div>
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
  var TINT = { yume: "#7c5cd6", proba: "#4c7df6", ballast: "#59a9ff", aipick: "#d8b48a", personal: "#4fb8a8" };

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
    var ext = S.external || [];
    var linked = ext.filter(function (e) { return e.state === "ok" || e.state === "stale"; });
    var broken = ext.filter(function (e) { return e.state === "error"; });

    document.getElementById("total").textContent =
      won(s.revenueOutsourcing + s.revenueYume + (s.revenueProducts || 0));

    var tiles =
      asset("var(--violet)", "외주", won(s.revenueOutsourcing), s.done + "건 완료") +
      asset("var(--blue)", "유메", won(s.revenueYume), s.yumeOrders + "건");

    // 제품마다 한 칸씩. 연결 안 한 것과 연결이 깨진 것을 0원으로 뭉개지 않는다 —
    // 0원은 "안 팔렸다"는 뜻인데, 사실은 "물어보지 않았다"거나 "못 물어봤다"이다.
    ext.forEach(function (e) {
      var tint = TINT[e.key] || "var(--mid)";
      if (e.state === "ok" || e.state === "stale") {
        var sub = e.count + "건";
        // 결제 연동 전 제품은 그 사실을 칸에 적는다. 안 적으면 통장에 있는 돈으로 읽힌다.
        if (e.unverified) sub = "완료 기준 · 결제 연동 전";
        else if (e.state === "stale") sub += " · 응답 없음(직전 값)";
        tiles += asset(e.unverified ? "rgba(236,234,228,.4)" : tint, E(e.label), won(e.total), sub);
      } else if (e.state === "unlinked") {
        tiles += asset("rgba(236,234,228,.25)", E(e.label), "—", "연결 안 됨");
      } else {
        tiles += asset("var(--bad)", E(e.label), "!", "불러오지 못함");
      }
    });

    tiles +=
      asset("var(--warn)", "미수금", won(s.outstanding), "계약 " + kwon(s.contracted)) +
      asset("var(--good)", "진행 중", String(s.active), "상담 " + s.lead + " · 신규 의뢰 " + s.inquiriesNew) +
      asset(s.deskWaiting ? "var(--warn)" : "rgba(236,234,228,.3)", "답할 차례", String(s.deskWaiting || 0), "열린 대화 " + (s.deskOpen || 0) + "건");

    // 답장이 밀려 있으면 내비게이션의 데스크 링크를 눈에 띄게 둔다. 외주에서 일감을
    // 놓치는 가장 흔한 이유가 "답장해야 하는 걸 잊는 것"이다.
    var dl = document.getElementById("deskLink");
    if (dl) { dl.textContent = s.deskWaiting ? "의뢰 데스크 " + s.deskWaiting : "의뢰 데스크"; dl.className = s.deskWaiting ? "ghost on" : "ghost"; }

    document.getElementById("assets").innerHTML = tiles;

    var warn = document.getElementById("extwarn");
    warn.innerHTML = broken.length
      ? broken.map(function (e) { return "<b>" + E(e.label) + "</b> 매출을 불러오지 못했어요 — " + E(e.error || ""); }).join("<br>")
      : "";
    warn.style.display = broken.length ? "block" : "none";
    void linked;

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
          (q.thread_id ? '<a class="b" href="/admin/desk#t' + q.thread_id + '">대화 열기</a>' : "") +
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
    // 개인 할 일을 맨 앞에 둔다. 사업 목록과 색을 달리해서 한눈에 갈린다.
    var owners = (S.extras || []).map(function (o) {
      return { key: o.key, label: o.label, href: null, tint: TINT[o.key] || "var(--mid)", sub: o.sub };
    }).concat(S.products.map(function (p) {
      return { key: p.key, label: p.label, href: p.href, tint: TINT[p.key] || "var(--mid)", sub: "자사 제품" };
    })).concat(S.projects.filter(function (p) { return p.status !== "dropped"; }).map(function (p) {
      return { key: "project:" + p.id, label: p.title, href: null, tint: "var(--mid)", sub: (PRJ[p.status] || "") + (p.client ? " · " + p.client : "") };
    }));
    var ownerOf = {};
    owners.forEach(function (o) { ownerOf[o.key] = o; });

    // 끝난 일은 목록에서 빼고 아래 "완료" 칸으로 모은다. 남은 일만 보이면
    // 무엇이 남았는지가 한눈에 들어오고, 목록이 완료 항목으로 길어지지 않는다.
    // 어디서 왔는지는 product에 그대로 있으므로, 해제하면 그 자리로 돌아간다.
    var doneAll = S.tasks.filter(function (t) { return t.state === "done" && ownerOf[t.product]; });

    // data-flip은 이동 애니메이션이 같은 항목을 이전 위치와 짝지을 때 쓴다.
    // 완료 칸에서는 순서 바꾸기 대신 어느 목록에서 왔는지를 보여 준다 —
    // 해제하면 돌아갈 자리라서, 그게 지금 필요한 정보다.
    var row = function (t, inDone) {
      var o = ownerOf[t.product];
      var tail = inDone
        ? '<span class="from"><i style="background:' + o.tint + '"></i><b>' + E(o.label) + "</b></span>" +
          '<button class="drop" data-tdel="' + t.id + '" title="삭제">×</button>'
        : '<span class="ops">' +
          '<button class="doing' + (t.state === "doing" ? " on" : "") + '" data-doing="' + t.id + '" data-state="' + t.state + '" ' +
            'title="' + (t.state === "doing" ? "하는 중 해제" : "하는 중으로") + '">◐</button>' +
          '<button data-move="' + t.id + '" data-dir="up" title="위로">↑</button>' +
          '<button data-move="' + t.id + '" data-dir="down" title="아래로">↓</button>' +
          '<button data-tdel="' + t.id + '" title="삭제">×</button></span>';
      return '<div class="todo' + (inDone ? " is-done" : "") + '" data-flip="t' + t.id + '">' +
        '<button class="box is-' + t.state + '" data-task="' + t.id + '" data-state="' + t.state + '" ' +
          'title="' + (inDone ? "완료 해제" : "완료로") + '"></button>' +
        '<span class="tx" data-edit="' + t.id + '">' + E(t.title) + "</span>" +
        tail +
      "</div>";
    };

    document.getElementById("pane-todo").innerHTML =
      '<section class="card"><h2>체크리스트</h2>' +
      '<p class="d">개인 할 일과 사업마다 하나씩. <b>네모를 누르면 바로 완료</b>되어 맨 끝 완료 칸으로 옮겨가고, ' +
      '다시 누르면 원래 자리로 돌아옵니다. 손대는 중인 일은 ◐로 표시해 두세요.</p>' +
      '<div class="lists">' + owners.map(function (o) {
        var ts = tasksOf(o.key);
        var left = ts.filter(function (t) { return t.state !== "done"; });
        var done = ts.length - left.length;
        return '<div class="list"><h3><span class="dot" style="background:' + o.tint + '"></span>' + E(o.label) + "</h3>" +
          '<div class="meta"><span>' + done + " / " + ts.length + " 완료</span>" +
          (o.href ? '<a href="' + E(o.href) + '" target="_blank" rel="noreferrer">열기 ↗</a>' : '<span>' + E(o.sub) + "</span>") + "</div>" +
          (left.length ? left.map(function (t) { return row(t, false); }).join("")
                       : '<div class="allclear">남은 일이 없습니다</div>') +
          '<div class="addrow"><input data-add="' + E(o.key) + '" placeholder="할 일 추가 후 Enter" /></div></div>';
      }).join("") +

      // 완료 칸도 목록과 같은 격자에 들어가는 카드다. 사업 카드를 모두 지난
      // **맨 끝**에 둬서, 끝낸 일이 오른쪽 아래로 빠진다는 방향이 눈에 남게 한다.
      // 비어 있어도 항상 그린다 — 자리가 보여야 어디로 가는지 알 수 있다.
      '<div class="list done-box"><h3><span class="dot" style="background:var(--good)"></span>완료' +
        '<span class="cnt">' + doneAll.length + "</span></h3>" +
      '<div class="meta"><span>끝난 일이 모입니다</span><span>네모를 누르면 제자리로</span></div>' +
      (doneAll.length
        ? '<div class="donelist">' + doneAll.map(function (t) { return row(t, true); }).join("") + "</div>"
        : '<div class="allclear">아직 완료한 일이 없습니다</div>') +
      "</div></div></section>";
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

  // 할 일이 목록과 완료 칸 사이를 옮겨 다닐 때, 그냥 사라졌다 나타나면 어디로 갔는지
  // 알 수 없다. 다시 그리기 전에 위치를 재 두고, 그린 뒤 그 차이만큼 되돌려 놓은 채
  // 제자리로 보낸다(FLIP). 화면을 다시 그리는 건 한 번뿐이고, 움직이는 것은 transform이라
  // 레이아웃을 건드리지 않는다.
  var STILL = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function snapshot() {
    var m = {};
    if (STILL) return m;
    document.querySelectorAll("[data-flip]").forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (r.width || r.height) m[el.dataset.flip] = r;
    });
    return m;
  }

  function playFlip(before) {
    if (STILL || !before) return;
    document.querySelectorAll("[data-flip]").forEach(function (el) {
      var b = before[el.dataset.flip];
      if (!b || !el.animate) return;
      var a = el.getBoundingClientRect();
      var dx = b.left - a.left, dy = b.top - a.top;
      // 1px 미만은 눈에 띄지도 않으면서 애니메이션만 늘린다.
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      el.animate(
        [{ transform: "translate(" + dx + "px," + dy + "px)" }, { transform: "none" }],
        { duration: 460, easing: "cubic-bezier(.22,1,.36,1)" },
      );
    });
  }

  async function load() {
    var before = snapshot();
    try { S = await api("/studio"); clearErr(); paint(); playFlip(before); }
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
      if (el.dataset.task) {
        // 한 번 누르면 완료. 완료된 것을 누르면 해제되어 원래 목록으로 돌아간다.
        var next = el.dataset.state === "done" ? "todo" : "done";
        await api("/studio/task/" + el.dataset.task, { method: "PATCH", body: { state: next } });
        return load();
      }
      if (el.dataset.doing) {
        // 하는 중 켜고 끄기. 완료와 섞이지 않게 따로 둔다.
        var to = el.dataset.state === "doing" ? "todo" : "doing";
        await api("/studio/task/" + el.dataset.doing, { method: "PATCH", body: { state: to } });
        return load();
      }
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
