// 의뢰 데스크 — 들어온 대화에 답하고, 견적을 보내고, 결제를 확인하는 화면.
//
// 스튜디오 보드(/admin/studio)가 "무엇이 얼마나 남았나"를 본다면, 여기는 "누구에게
// 답할 차례인가"만 본다. 두 화면을 합치지 않은 이유는 쓰는 순간이 달라서다. 보드는
// 하루에 한 번 열어 훑는 곳이고, 데스크는 알림이 오면 여는 곳이다.
//
// 목록에서 제일 중요한 한 칸은 금액이 아니라 **마지막으로 말한 쪽**이다. 의뢰인이
// 마지막이면 공을 내가 들고 있는 것이고, 외주에서 일감을 놓치는 가장 흔한 이유가
// 그걸 잊는 것이다.
export function renderDeskPage() {
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="robots" content="noindex, nofollow" />
<title>의뢰 데스크 · 리머</title>
<style>
  *, *::before, *::after { box-sizing: border-box; }
  :root {
    --bg:#07070b; --ink:#eceae4; --dim:rgba(236,234,228,.66); --faint:rgba(236,234,228,.42);
    --line:rgba(236,234,228,.11); --line2:rgba(236,234,228,.2); --card:rgba(255,255,255,.035);
    --blue:#4c7df6; --mid:#6d5ae0; --violet:#8b5cf6;
    --beam:linear-gradient(100deg,var(--blue),var(--mid) 52%,var(--violet));
    --good:#46c08a; --warn:#e0a53c; --bad:#e0745c;
    --mono:ui-monospace,SFMono-Regular,"SF Mono",Menlo,monospace;
  }
  body { margin:0; background:var(--bg); color:var(--ink); word-break:keep-all;
         font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display','Segoe UI','Noto Sans KR',sans-serif;
         -webkit-font-smoothing:antialiased; }
  body::before { content:""; position:fixed; inset:0; pointer-events:none; z-index:0;
    background: radial-gradient(720px 400px at 16% -8%, rgba(109,90,224,.2), transparent 62%),
                radial-gradient(600px 360px at 90% 4%, rgba(76,125,246,.13), transparent 66%); }
  main { position:relative; z-index:1; max-width:1240px; margin:0 auto; padding:22px clamp(14px,3vw,26px) 60px; }

  .bar { display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:16px; }
  .logo { display:flex; align-items:center; gap:9px; font:600 12px/1 var(--mono); letter-spacing:.2em; }
  .logo i { width:9px; height:9px; background:var(--beam); border-radius:2px; transform:rotate(45deg); }
  .bar .sp { flex:1; }
  .ghost { font:inherit; font-size:12px; padding:7px 12px; border-radius:9px; cursor:pointer; white-space:nowrap;
           border:1px solid var(--line2); background:transparent; color:var(--dim); text-decoration:none; display:inline-block; }
  .ghost:hover { background:rgba(255,255,255,.06); color:var(--ink); }
  .ghost.on { background:var(--beam); border-color:transparent; color:#fff; font-weight:600; }
  .ghost[disabled] { opacity:.45; cursor:default; }

  .stats { display:grid; grid-template-columns:repeat(4,1fr); gap:1px; background:var(--line);
           border:1px solid var(--line); border-radius:14px; overflow:hidden; margin-bottom:14px; }
  .stats .m { background:#0a0a10; padding:12px 15px; }
  .stats .k { font-size:11.5px; color:var(--faint); }
  .stats .v { margin-top:5px; font-size:20px; font-weight:680; font-variant-numeric:tabular-nums; letter-spacing:-.02em; }
  .stats .v.alert { color:#ffc98a; }

  .split { display:grid; grid-template-columns:320px minmax(0,1fr); gap:12px; align-items:start; }
  @media (max-width: 860px) { .split { grid-template-columns:1fr; } .split.picked .list { display:none; } }

  .panel { border:1px solid var(--line); border-radius:18px; background:var(--card); overflow:hidden; }
  .panel > h2 { font-size:12px; margin:0; padding:13px 16px; font-weight:600; letter-spacing:.02em;
                border-bottom:1px solid var(--line); display:flex; align-items:center; gap:8px; }
  .panel > h2 .sp { flex:1; }

  .rows { max-height:min(70vh,640px); overflow:auto; }
  .row { width:100%; text-align:left; background:transparent; border:0; border-bottom:1px solid var(--line);
         padding:12px 15px; cursor:pointer; color:inherit; font:inherit; display:block; }
  .row:hover { background:rgba(255,255,255,.045); }
  .row.on { background:rgba(109,90,224,.16); }
  .row .top { display:flex; align-items:center; gap:7px; }
  .row .nm { font-size:13.5px; font-weight:620; letter-spacing:-.01em; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .row .when { margin-left:auto; font-size:10.5px; color:var(--faint); white-space:nowrap; }
  .row .pv { margin-top:4px; font-size:11.5px; color:var(--faint); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .dot { width:6px; height:6px; border-radius:50%; background:var(--warn); flex:none; }
  .badge { min-width:18px; height:18px; padding:0 5px; border-radius:99px; background:var(--bad); color:#fff;
           font:700 10.5px/18px var(--mono); text-align:center; flex:none; }
  .tags { margin-top:6px; display:flex; gap:5px; flex-wrap:wrap; }
  .pill { display:inline-block; padding:2px 8px; border-radius:99px; font-size:10.5px; font-weight:600;
          background:rgba(255,255,255,.07); color:var(--dim); border:1px solid var(--line); }
  .pill.good { background:rgba(70,192,138,.15); color:#7ddab0; border-color:rgba(70,192,138,.28); }
  .pill.warn { background:rgba(224,165,60,.15); color:#e8c078; border-color:rgba(224,165,60,.28); }
  .pill.bad  { background:rgba(224,116,92,.16); color:#f0a08c; border-color:rgba(224,116,92,.3); }

  .who { padding:13px 16px; border-bottom:1px solid var(--line); display:flex; gap:10px; align-items:flex-start; flex-wrap:wrap; }
  .who .t1 { font-size:15px; font-weight:660; letter-spacing:-.015em; }
  .who .t2 { margin-top:3px; font-size:11.5px; color:var(--faint); }
  .who .sp { flex:1; }

  .talk { padding:16px; display:flex; flex-direction:column; gap:10px; max-height:min(58vh,540px); overflow:auto; }
  .msg { max-width:min(78%,560px); padding:10px 13px; border-radius:14px; font-size:13.5px; line-height:1.65;
         white-space:pre-wrap; overflow-wrap:anywhere; }
  .msg.client { align-self:flex-start; background:rgba(255,255,255,.07); border:1px solid var(--line);
                border-bottom-left-radius:5px; }
  .msg.reamer { align-self:flex-end; background:var(--beam); color:#fff; border-bottom-right-radius:5px; }
  .msg .st { display:block; margin-top:5px; font-size:10px; opacity:.6; font-variant-numeric:tabular-nums; }
  .sys { align-self:center; max-width:100%; font-size:11.5px; color:var(--faint); text-align:center;
         padding:5px 12px; border-radius:99px; border:1px dashed var(--line2); }
  .sys.paid { color:#7ddab0; border-color:rgba(70,192,138,.4); }
  .empty { padding:36px 0; text-align:center; font-size:12.5px; color:var(--faint); line-height:1.9; }

  .compose { border-top:1px solid var(--line); padding:12px 16px; }
  textarea, input[type=text], input[type=number] {
    width:100%; background:rgba(0,0,0,.28); color:var(--ink); border:1px solid var(--line2);
    border-radius:11px; padding:10px 12px; font:inherit; font-size:13.5px; resize:vertical; }
  textarea:focus, input:focus { outline:2px solid rgba(109,90,224,.6); outline-offset:1px; }
  .compose .act { margin-top:9px; display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
  .compose .hint { font-size:11px; color:var(--faint); margin-left:auto; }

  .quotes { padding:14px 16px 4px; display:grid; gap:9px; }
  .q { border:1px solid var(--line); border-radius:13px; padding:11px 13px; background:rgba(0,0,0,.2); }
  .q .qh { display:flex; gap:9px; align-items:baseline; flex-wrap:wrap; }
  .q .qt { font-size:13.5px; font-weight:620; }
  .q .qa { margin-left:auto; font-size:15px; font-weight:700; font-variant-numeric:tabular-nums; letter-spacing:-.02em; }
  .q .qd { margin-top:6px; font-size:11.5px; color:var(--faint); line-height:1.65; white-space:pre-wrap; }

  form.newq { padding:14px 16px 16px; display:grid; gap:9px; border-top:1px solid var(--line); }
  form.newq .two { display:grid; grid-template-columns:1fr 1fr; gap:9px; }
  form.newq label { display:grid; gap:4px; font-size:11px; color:var(--faint); }
  details.fold > summary { cursor:pointer; padding:11px 16px; font-size:12px; color:var(--dim);
                           border-top:1px solid var(--line); list-style:none; }
  details.fold > summary::-webkit-details-marker { display:none; }
  details.fold > summary::before { content:"+ "; color:var(--faint); }
  details.fold[open] > summary::before { content:"– "; }

  /* 진행 상황 — 의뢰인 화면에 그대로 비치는 부분 */
  .prog { padding:0 16px 16px; display:grid; gap:10px; }
  .prog__bar { position:relative; height:26px; border-radius:8px; overflow:hidden;
               background:rgba(0,0,0,.32); border:1px solid var(--line); }
  .prog__bar i { display:block; height:100%; background:var(--beam); }
  .prog__bar b { position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
                 font-size:11.5px; font-weight:650; font-variant-numeric:tabular-nums;
                 text-shadow:0 1px 3px rgba(0,0,0,.55); }
  .prog__row { display:flex; gap:8px; align-items:flex-end; flex-wrap:wrap; }
  .prog__row > input[type=text] { flex:1; min-width:180px; }
  .prog__f { flex:1; min-width:120px; display:grid; gap:4px; font-size:11px; color:var(--faint); }
  .prog__row .hint { flex:1; min-width:160px; }
  .tasks { display:grid; gap:1px; background:var(--line); border:1px solid var(--line); border-radius:11px; overflow:hidden; }
  .tasks:empty { display:none; }
  .tk { display:flex; align-items:center; gap:8px; padding:8px 11px; background:#0a0a10; font-size:13px; }
  .tk--done .tk__t { color:var(--faint); text-decoration:line-through; }
  .tk--hidden { opacity:.5; }
  .tk__t { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .tk__x, .tk__i { flex:none; width:26px; height:26px; border-radius:7px; cursor:pointer; font:inherit;
                   border:1px solid var(--line2); background:transparent; color:var(--dim); line-height:1; }
  .tk__x:hover, .tk__i:hover { background:rgba(255,255,255,.08); color:var(--ink); }
  .tk--done .tk__x { color:var(--good); border-color:rgba(70,192,138,.4); }
  .err { display:none; margin-bottom:12px; padding:11px 13px; border-radius:11px; font-size:12.5px;
         background:rgba(224,116,92,.12); border:1px solid rgba(224,116,92,.3); color:#f0a08c; }
  .note { font-size:11.5px; color:var(--faint); line-height:1.7; }
  .linkbox { margin:10px 16px 0; padding:10px 12px; border-radius:11px; font:12px/1.6 var(--mono);
             background:rgba(70,192,138,.1); border:1px solid rgba(70,192,138,.3); color:#9fe0c0;
             overflow-wrap:anywhere; display:none; }
</style>
</head>
<body>
<main>
  <div class="bar">
    <span class="logo"><i></i>REAMER</span>
    <span class="sp"></span>
    <a class="ghost" href="/admin">유메 운영</a>
    <a class="ghost" href="/admin/studio">스튜디오</a>
    <span class="ghost on">의뢰 데스크</span>
  </div>

  <div class="err" id="err"></div>

  <div class="stats" id="stats">
    <div class="m"><div class="k">답할 차례</div><div class="v">—</div></div>
    <div class="m"><div class="k">안 읽음</div><div class="v">—</div></div>
    <div class="m"><div class="k">결제 완료</div><div class="v">—</div></div>
    <div class="m"><div class="k">결제 대기</div><div class="v">—</div></div>
  </div>

  <div class="split" id="split">
    <section class="panel list">
      <h2>대화 <span class="sp"></span><button class="ghost" id="newThread">새 대화</button></h2>
      <div class="rows" id="rows"><div class="empty">불러오는 중…</div></div>
    </section>

    <section class="panel" id="pane">
      <div class="empty">왼쪽에서 대화를 고르세요.</div>
    </section>
  </div>
</main>

<script>
(function () {
  var E = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]; }); };
  var won = function (n) { return "\\u20A9" + Number(n || 0).toLocaleString("ko-KR"); };
  var when = function (t) {
    var d = new Date(Number(t) || 0);
    if (isNaN(d)) return "";
    var today = new Date();
    var sameDay = d.toDateString() === today.toDateString();
    return sameDay
      ? d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })
      : d.toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" });
  };

  var state = { threads: [], picked: null, detail: null, busy: false };

  function fail(m) { var e = document.getElementById("err"); e.textContent = m; e.style.display = m ? "block" : "none"; }

  async function api(path, opts) {
    var o = opts || {};
    var r = await fetch("/api/admin" + path, {
      method: o.method || "GET",
      headers: o.body ? { "Content-Type": "application/json" } : undefined,
      body: o.body ? JSON.stringify(o.body) : undefined,
      credentials: "same-origin",
    });
    if (r.status === 401) { location.reload(); throw new Error("로그인이 필요해요."); }
    var d = await r.json().catch(function () { return {}; });
    if (!r.ok) throw new Error(d.error || "실패했어요.");
    return d;
  }

  // ── 목록 ──
  async function loadList() {
    var d = await api("/desk");
    state.threads = d.threads;
    var s = d.summary;
    var cells = [
      ["답할 차례", String(s.waiting), s.waiting > 0],
      ["안 읽음", String(s.unread), s.unread > 0],
      ["결제 완료", won(s.paid), false],
      ["결제 대기", won(s.pending), false],
    ];
    document.getElementById("stats").innerHTML = cells.map(function (c) {
      return '<div class="m"><div class="k">' + E(c[0]) + '</div><div class="v' + (c[2] ? " alert" : "") + '">' + E(c[1]) + "</div></div>";
    }).join("");

    var rows = document.getElementById("rows");
    if (!state.threads.length) {
      rows.innerHTML = '<div class="empty">아직 들어온 의뢰가 없습니다.<br/>사이트 문의가 접수되면 여기에 바로 뜹니다.</div>';
      return;
    }
    rows.innerHTML = state.threads.map(function (t) {
      var tags = [];
      if (t.status === "closed") tags.push('<span class="pill">종료</span>');
      if (t.pending) tags.push('<span class="pill warn">' + E(won(t.pending)) + " 대기</span>");
      if (t.paid) tags.push('<span class="pill good">' + E(won(t.paid)) + " 입금</span>");
      return '<button class="row' + (state.picked === t.id ? " on" : "") + '" data-open="' + t.id + '">' +
        '<div class="top">' +
          (t.waiting && t.status === "open" ? '<span class="dot"></span>' : "") +
          '<span class="nm">' + E(t.name || "이름 없음") + "</span>" +
          (t.unread ? '<span class="badge">' + t.unread + "</span>" : "") +
          '<span class="when">' + E(when(t.at)) + "</span>" +
        "</div>" +
        '<div class="pv">' + (t.previewSender === "reamer" ? "나: " : "") + E(t.preview) + "</div>" +
        (tags.length ? '<div class="tags">' + tags.join("") + "</div>" : "") +
      "</button>";
    }).join("");
  }

  // ── 대화 ──
  function bubble(m) {
    if (m.sender === "system") {
      var tone = m.kind === "paid" ? " paid" : "";
      return '<div class="sys' + tone + '">' + E(m.body) + "</div>";
    }
    var side = m.sender === "reamer" ? "reamer" : "client";
    return '<div class="msg ' + side + '">' + E(m.body) +
           '<span class="st">' + E(when(m.created_at)) + "</span></div>";
  }

  // sent(보냄) → accepted(의뢰인이 확정) → paid(결제됨).
  // 확정은 합의이지 입금이 아니라, 회수는 결제 전까지 열려 있다.
  function quoteCard(q) {
    var tone = q.status === "paid" ? "good" : q.status === "accepted" ? "warn" : "";
    var label = { sent: "확정 대기", accepted: "확정됨 · 결제 대기", paid: "결제 완료",
                  cancelled: "회수됨", refunded: "환불됨" }[q.status] || q.status;
    var open = q.status === "sent" || q.status === "accepted";
    return '<div class="q">' +
      '<div class="qh"><span class="qt">' + E(q.title) + "</span>" +
        '<span class="pill ' + tone + '">' + E(label) + "</span>" +
        '<span class="qa">' + E(won(q.amount_krw)) + "</span></div>" +
      (q.weeks ? '<div class="qd">기간 ' + E(q.weeks) + "</div>" : "") +
      (q.detail ? '<div class="qd">' + E(q.detail) + "</div>" : "") +
      (q.status === "paid"
        ? '<div class="qd">' + E(q.method || "카드") + " \\u00B7 " + E(q.payment_id || "") + "</div>"
        : open
          ? '<div class="qd"><button class="ghost" data-pull="' + q.id + '">견적 회수</button>' +
            (q.status === "sent" ? ' <span class="hint" style="display:inline">의뢰인이 확정하면 결제 버튼이 열립니다</span>' : "") +
            "</div>"
          : "") +
    "</div>";
  }

  // 의뢰인 화면에 그대로 보이는 부분. 여기서 체크한 것이 저쪽 진행 막대가 된다.
  //
  // 눈 버튼이 공개 여부다. 내부용 메모를 적을 일이 있으므로 항목마다 따로 둔다 —
  // 목록 전체를 한 번에 공개/비공개로 두면, 한 줄 때문에 전부를 숨기게 된다.
  function progressBlock(d) {
    var p = d.project;
    if (!p) {
      return '<details class="fold"><summary>진행 상황 공유</summary>' +
        '<div style="padding:0 16px 16px"><p class="note">일감을 만들면 의뢰인 화면에 진행 단계와 체크리스트가 보입니다. ' +
        '결제가 들어오면 자동으로 만들어지지만, 먼저 시작하는 건이면 여기서 만들 수 있습니다.</p>' +
        '<p style="margin-top:10px"><button class="ghost on" data-mkproj>일감 만들기</button></p></div></details>';
    }

    var tasks = d.tasks || [];
    var shared = tasks.filter(function (t) { return t.shared; });
    var doneN = shared.filter(function (t) { return t.state === "done"; }).length;
    var pct = shared.length ? Math.round((doneN / shared.length) * 100) : Number(p.progress || 0);
    var done = p.status === "done";

    var rows = tasks.map(function (t) {
      var mark = t.state === "done" ? "\\u2713" : t.state === "doing" ? "\\u25D0" : "\\u25CB";
      return '<div class="tk' + (t.state === "done" ? " tk--done" : "") + (t.shared ? "" : " tk--hidden") + '">' +
        '<button class="tk__x" data-tdone="' + t.id + '" data-state="' + E(t.state) + '" title="완료 표시">' + mark + "</button>" +
        '<span class="tk__t">' + E(t.title) + "</span>" +
        '<button class="tk__i" data-tshare="' + t.id + '" data-on="' + (t.shared ? "1" : "0") + '" title="' +
          (t.shared ? "의뢰인에게 보이는 중 — 누르면 숨김" : "숨김 — 누르면 의뢰인에게 공개") + '">' +
          (t.shared ? "\\u25C9" : "\\u25CC") + "</button>" +
        '<button class="tk__i" data-tdel="' + t.id + '" title="삭제">\\u00D7</button>' +
      "</div>";
    }).join("");

    return '<details class="fold" open><summary>진행 상황 공유 \\u00B7 의뢰인에게 보입니다</summary>' +
      '<div class="prog">' +
        '<div class="prog__bar"><i style="width:' + (done ? 100 : pct) + '%"></i>' +
          "<b>" + (done ? "완료" : pct + "%") +
          (shared.length ? " \\u00B7 " + doneN + "/" + shared.length + " 공개" : " \\u00B7 공개 항목 없음") + "</b></div>" +

        (shared.length ? "" :
          '<p class="note">공개된 항목이 없어 의뢰인에게는 아래 진행률만 보입니다. ' +
          '항목의 \\u25CC 를 눌러 공개하거나, 진행률을 직접 적으세요.</p>') +

        '<div class="prog__row">' +
          '<label class="prog__f">진행률(%)<input type="number" id="pgPct" min="0" max="100" value="' + Number(p.progress || 0) + '" ' +
            (shared.length ? 'disabled title="공개 항목이 있으면 체크 수로 계산됩니다"' : "") + " /></label>" +
          '<label class="prog__f" style="flex:2">미리보기 주소<input type="text" id="pgUrl" placeholder="https://..." value="' + E(p.preview_url || "") + '" /></label>' +
          '<button class="ghost" data-pgsave>저장</button>' +
        "</div>" +

        '<div class="tasks">' + rows + "</div>" +
        '<div class="prog__row">' +
          '<input type="text" id="tkNew" placeholder="할 일 추가 — 적으면 바로 의뢰인에게 보입니다" />' +
          '<button class="ghost" data-tadd>추가</button>' +
        "</div>" +

        '<div class="prog__row">' +
          '<button class="ghost' + (done ? "" : " on") + '" data-deliver="' + (done ? "active" : "done") + '">' +
            (done ? "진행 중으로 되돌리기" : "작업 완료로 표시") + "</button>" +
          '<span class="hint">완료로 표시하면 의뢰인 대화에 안내가 남습니다. 대화는 계속 열려 있습니다.</span>' +
        "</div>" +
      "</div></details>";
  }

  async function openThread(id, opts) {
    state.picked = id;
    document.getElementById("split").classList.add("picked");
    var d = await api("/desk/" + id);
    state.detail = d;
    var t = d.thread;

    var head =
      '<div class="who">' +
        "<div><div class=\\"t1\\">" + E(t.name || "이름 없음") + "</div>" +
        '<div class="t2">' + E(t.contact || "연락처 없음") + (t.title ? " \\u00B7 " + E(t.title) : "") + "</div></div>" +
        '<span class="sp"></span>' +
        '<button class="ghost" data-back>목록</button>' +
        '<button class="ghost" data-link>링크 발급</button>' +
        '<button class="ghost" data-close>' + (t.status === "closed" ? "다시 열기" : "대화 종료") + "</button>" +
      "</div>" +
      '<div class="linkbox" id="linkbox"></div>';

    var body = d.messages.length
      ? d.messages.map(bubble).join("")
      : '<div class="empty">아직 오간 말이 없습니다.</div>';

    var quotes = d.quotes.length ? '<div class="quotes">' + d.quotes.map(quoteCard).join("") + "</div>" : "";

    var composer = t.status === "closed"
      ? '<div class="compose"><p class="note">종료된 대화입니다. 다시 열면 이어서 이야기할 수 있습니다.</p></div>'
      : '<div class="compose">' +
          '<textarea id="say" rows="3" placeholder="답장을 적으세요. Ctrl+Enter로 보냅니다."></textarea>' +
          '<div class="act"><button class="ghost on" data-send>보내기</button>' +
          '<span class="hint">' + (t.linkable ? "보내면 의뢰인에게 메일로 알립니다." : "메일 링크를 만들 수 없는 상태입니다(THREAD_LINK_KEY 미설정).") + "</span></div>" +
        "</div>";

    var newQuote =
      '<details class="fold"' + (d.quotes.length ? "" : " open") + "><summary>결제 요청 보내기</summary>" +
      '<form class="newq" id="qform">' +
        "<label>항목<input type=\\"text\\" name=\\"title\\" maxlength=\\"120\\" required placeholder=\\"예: 예매 알림 서비스 개발 (1차)\\" /></label>" +
        '<div class="two">' +
          "<label>금액(원)<input type=\\"number\\" name=\\"amount\\" min=\\"1000\\" step=\\"1000\\" required placeholder=\\"1500000\\" /></label>" +
          "<label>기간<input type=\\"text\\" name=\\"weeks\\" maxlength=\\"40\\" placeholder=\\"2~3주\\" /></label>" +
        "</div>" +
        "<label>포함 내용<textarea name=\\"detail\\" rows=\\"3\\" maxlength=\\"4000\\" placeholder=\\"무엇까지 해 드리는지 적어두면 나중에 서로 다른 말을 하지 않습니다.\\"></textarea></label>" +
        "<label>유효기간(일)<input type=\\"number\\" name=\\"valid\\" min=\\"0\\" max=\\"120\\" value=\\"14\\" /></label>" +
        '<div class="act"><button class="ghost on" type="submit">견적 보내기</button></div>' +
        '<p class="note">보내면 의뢰인 화면에 결제 버튼이 생기고, 메일로도 안내가 나갑니다. 결제가 들어오면 스튜디오 보드의 매출에 자동으로 잡힙니다.</p>' +
      "</form></details>";

    // 8초마다 다시 그리는 화면이다. 쓰던 답장을 날리지 않도록 입력칸은 옮겨 담는다 —
    // 긴 답장을 쓰는 도중에 글이 사라지는 것만큼 이 화면을 안 쓰게 만드는 일도 없다.
    var prev = document.getElementById("say");
    var draft = prev ? prev.value : "";
    var openFolds = [].slice.call(document.querySelectorAll("details.fold")).map(function (f) { return f.open; });

    document.getElementById("pane").innerHTML = head + progressBlock(d) + '<div class="talk" id="talk">' + body + "</div>" + quotes + composer + newQuote;

    var box = document.getElementById("say");
    if (box && draft) box.value = draft;
    [].slice.call(document.querySelectorAll("details.fold")).forEach(function (f, i) { if (openFolds[i] !== undefined) f.open = openFolds[i]; });
    var talk = document.getElementById("talk");
    if (talk) talk.scrollTop = talk.scrollHeight;
    if ((!opts || !opts.quiet) && box) box.focus();
    await loadList();
  }

  // ── 조작 ──
  document.addEventListener("click", async function (ev) {
    var el = ev.target.closest("[data-open],[data-send],[data-back],[data-link],[data-close],[data-pull],[data-mkproj],[data-pgsave],[data-tadd],[data-tdone],[data-tshare],[data-tdel],[data-deliver],#newThread");
    if (!el || state.busy) return;
    ev.preventDefault();
    state.busy = true;
    fail("");
    try {
      if (el.id === "newThread") {
        var nm = prompt("의뢰인 성함");
        if (!nm) return;
        var ct = prompt("연락처(이메일이면 알림이 갑니다)") || "";
        var made = await api("/desk", { method: "POST", body: { name: nm, contact: ct } });
        await loadList();
        await openThread(made.id);
        window.prompt("의뢰인에게 보낼 링크입니다.", made.url);
        return;
      }
      if (el.dataset.open) return await openThread(Number(el.dataset.open));
      if (el.hasAttribute("data-back")) {
        state.picked = null;
        document.getElementById("split").classList.remove("picked");
        document.getElementById("pane").innerHTML = '<div class="empty">왼쪽에서 대화를 고르세요.</div>';
        return await loadList();
      }
      if (el.hasAttribute("data-link")) {
        if (!confirm("새 링크를 발급하면 지금 링크는 열리지 않습니다. 계속할까요?")) return;
        var r = await api("/desk/" + state.picked + "/link", { method: "POST", body: { mail: true } });
        var lb = document.getElementById("linkbox");
        lb.textContent = r.url;
        lb.style.display = "block";
        return;
      }
      if (el.hasAttribute("data-close")) {
        var next = state.detail.thread.status === "closed" ? "open" : "closed";
        await api("/desk/" + state.picked, { method: "PATCH", body: { status: next } });
        return await openThread(state.picked);
      }
      if (el.dataset.pull) {
        if (!confirm("이 견적을 회수할까요?")) return;
        await api("/desk/quote/" + el.dataset.pull, { method: "PATCH", body: {} });
        return await openThread(state.picked);
      }
      if (el.hasAttribute("data-send")) return await send();

      // ── 진행 상황 ──
      var pid = state.detail && state.detail.project ? state.detail.project.id : 0;
      if (el.hasAttribute("data-mkproj")) {
        await api("/desk/" + state.picked + "/project", { method: "POST", body: {} });
        return await openThread(state.picked);
      }
      if (el.hasAttribute("data-pgsave")) {
        var pct = document.getElementById("pgPct");
        var url = document.getElementById("pgUrl");
        await api("/desk/project/" + pid, { method: "PATCH",
          body: { progress: pct && !pct.disabled ? pct.value : undefined, preview_url: url ? url.value : "" } });
        return await openThread(state.picked);
      }
      if (el.hasAttribute("data-tadd")) {
        var box = document.getElementById("tkNew");
        var title = (box.value || "").trim();
        if (!title) return;
        box.value = "";
        await api("/studio/task", { method: "POST", body: { product: "project:" + pid, title: title } });
        return await openThread(state.picked);
      }
      if (el.dataset.tdone) {
        // 한 번 누르면 완료, 완료된 것을 누르면 해제. 스튜디오 보드와 같은 규칙이다.
        var next = el.dataset.state === "done" ? "todo" : "done";
        await api("/studio/task/" + el.dataset.tdone, { method: "PATCH", body: { state: next } });
        return await openThread(state.picked, { quiet: true });
      }
      if (el.dataset.tshare) {
        await api("/studio/task/" + el.dataset.tshare, { method: "PATCH", body: { shared: el.dataset.on !== "1" } });
        return await openThread(state.picked, { quiet: true });
      }
      if (el.dataset.tdel) {
        if (!confirm("이 항목을 지울까요?")) return;
        await api("/studio/task/" + el.dataset.tdel, { method: "DELETE" });
        return await openThread(state.picked, { quiet: true });
      }
      if (el.dataset.deliver) {
        var to2 = el.dataset.deliver;
        if (to2 === "done" && !confirm("작업 완료로 표시할까요? 의뢰인 대화에 안내가 남습니다.")) return;
        await api("/desk/project/" + pid, { method: "PATCH", body: { status: to2 } });
        return await openThread(state.picked);
      }
    } catch (e) {
      fail(e.message);
    } finally {
      state.busy = false;
    }
  });

  async function send() {
    var box = document.getElementById("say");
    var body = (box.value || "").trim();
    if (!body) return;
    box.value = "";
    await api("/desk/" + state.picked + "/message", { method: "POST", body: { body: body } });
    await openThread(state.picked, { quiet: true });
  }

  document.addEventListener("keydown", function (ev) {
    if ((ev.metaKey || ev.ctrlKey) && ev.key === "Enter" && ev.target.id === "say" && !state.busy) {
      ev.preventDefault();
      state.busy = true;
      send().catch(function (e) { fail(e.message); }).finally(function () { state.busy = false; });
    }
  });

  document.addEventListener("submit", async function (ev) {
    if (ev.target.id !== "qform") return;
    ev.preventDefault();
    if (state.busy) return;
    state.busy = true;
    fail("");
    var f = ev.target;
    try {
      await api("/desk/" + state.picked + "/quote", {
        method: "POST",
        body: {
          title: f.elements.title.value,
          amount_krw: f.elements.amount.value,
          weeks: f.elements.weeks.value,
          detail: f.elements.detail.value,
          valid_days: f.elements.valid.value,
        },
      });
      await openThread(state.picked);
    } catch (e) {
      fail(e.message);
    } finally {
      state.busy = false;
    }
  });

  // 새 말이 왔는지 확인한다. 화면을 안 보고 있을 때까지 두드릴 이유는 없다.
  setInterval(function () {
    if (document.hidden || state.busy) return;
    if (state.picked) openThread(state.picked, { quiet: true }).catch(function () {});
    else loadList().catch(function () {});
  }, 8000);

  // 스튜디오 보드에서 "대화 열기"로 들어오면 #t12 처럼 붙어 온다. 목록을 보여 준 뒤
  // 그 대화를 바로 편다 — 눌렀는데 목록만 뜨면 한 번 더 찾아야 한다.
  function fromHash() {
    var m = /^#t([0-9]+)$/.exec(window.location.hash || "");
    return m ? Number(m[1]) : 0;
  }

  loadList()
    .then(function () { var id = fromHash(); if (id) return openThread(id); })
    .catch(function (e) { fail(e.message); });
})();
</script>
</body>
</html>`;
}
