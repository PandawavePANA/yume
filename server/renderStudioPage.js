// 스튜디오 운영 보드(/admin/studio). 들어온 의뢰부터 진행 중인 일, 끝난 일, 매출,
// 그리고 자사 제품 네 개의 진행 상황까지 한 화면에서 본다.
//
// /admin과 같은 방식이다 — 여기서는 빈 틀과 스크립트만 내려보내고, 데이터는 관리자
// 세션으로 /api/admin/studio를 불러 채운다. 생김새도 /admin과 맞췄다. 내부 도구가
// 두 개인데 서로 다른 제품처럼 보이면 쓰는 사람이 매번 다시 적응해야 한다.
export function renderStudioPage() {
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>리머 스튜디오 보드</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system,BlinkMacSystemFont,'SF Pro Display','Segoe UI','Noto Sans KR',sans-serif; background: #F6F1FC; color: #241F33; word-break: keep-all; }
  a { color: #6B4FA8; }
  main { padding: 24px clamp(14px, 3vw, 34px) 80px; max-width: 1320px; margin: 0 auto; }
  header.top { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; margin-bottom: 4px; }
  h1 { font-size: 20px; margin: 0; }
  .sub { font-size: 12.5px; color: #8577A8; margin: 2px 0 18px; }
  .tabs { display: flex; gap: 6px; margin-left: auto; }
  .tabs a { font-size: 12.5px; text-decoration: none; padding: 6px 11px; border-radius: 8px; background: #fff; border: 1px solid #E6DAF6; }
  .tabs a.on { background: #EFE4FC; color: #5B3FA0; font-weight: 700; }

  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(168px, 1fr)); gap: 10px; margin-bottom: 18px; }
  .kpi { background: #fff; border: 1px solid #E6DAF6; border-radius: 14px; padding: 13px 15px; }
  .kpi .l { font-size: 11px; color: #8577A8; font-weight: 600; margin-bottom: 5px; }
  .kpi .v { font-size: 21px; font-weight: 800; font-variant-numeric: tabular-nums; }
  .kpi .s { font-size: 11px; color: #A99BC9; margin-top: 3px; }
  .kpi.hi { background: linear-gradient(140deg,#5B3FA0,#7C5CD6); border-color: transparent; color: #fff; }
  .kpi.hi .l, .kpi.hi .s { color: rgba(255,255,255,.72); }

  .panel { background: #fff; border: 1px solid #E6DAF6; border-radius: 16px; padding: 18px 20px; margin-bottom: 16px; }
  .panel h2 { font-size: 14px; margin: 0 0 3px; }
  .panel .desc { font-size: 11.5px; color: #A99BC9; margin-bottom: 14px; }
  .tablewrap { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
  th, td { text-align: left; padding: 8px 9px; border-bottom: 1px solid #F0E8FA; vertical-align: top; }
  th { color: #8577A8; font-weight: 600; font-size: 11.5px; white-space: nowrap; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .muted { color: #A99BC9; }
  .wrapline { white-space: pre-wrap; max-width: 380px; }

  .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 10.5px; font-weight: 700; white-space: nowrap; background: #EFE6FA; color: #6B4FA8; }
  .s-new { background: #E6F0FF; color: #2F5FB3; }
  .s-replied, .s-doing, .s-active { background: #FFF6E0; color: #B4690E; }
  .s-quoted, .s-lead { background: #EDE7FB; color: #6B4FA8; }
  .s-won, .s-done { background: #EAF7F0; color: #1F9D66; }
  .s-lost, .s-dropped { background: #FBEDEA; color: #C6402F; }
  .s-todo { background: #F0EDF6; color: #8577A8; }

  input, select, textarea { font: inherit; font-size: 12.5px; padding: 6px 8px; border: 1px solid #E1D6F2; border-radius: 8px; background: #fff; color: inherit; width: 100%; }
  textarea { min-height: 54px; resize: vertical; }
  button { font: inherit; font-size: 12.5px; padding: 6px 11px; border-radius: 8px; border: 1px solid #E1D6F2; background: #fff; color: #4C5266; cursor: pointer; white-space: nowrap; }
  button:hover { background: #F7F2FE; }
  button.p { background: #5B3FA0; border-color: #5B3FA0; color: #fff; }
  button.p:hover { background: #6B4FB8; }
  button.d { color: #C6402F; }
  .row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-bottom: 12px; }
  .row > * { width: auto; }
  .bar { height: 6px; border-radius: 99px; background: #EFE9F8; overflow: hidden; min-width: 84px; }
  .bar i { display: block; height: 100%; background: linear-gradient(90deg,#5B3FA0,#7C5CD6); }

  .prod { display: grid; grid-template-columns: repeat(auto-fit, minmax(270px, 1fr)); gap: 14px; }
  .prodcard { border: 1px solid #E6DAF6; border-radius: 14px; padding: 14px 15px; background: #FDFBFF; }
  .prodcard h3 { margin: 0 0 2px; font-size: 13.5px; }
  .prodcard .meta { font-size: 11px; color: #A99BC9; margin-bottom: 10px; }
  .task { display: flex; align-items: flex-start; gap: 8px; padding: 6px 0; border-bottom: 1px solid #F3EDFA; font-size: 12.5px; }
  .task:last-child { border-bottom: 0; }
  .task .t { flex: 1; cursor: pointer; }
  .task.done .t { text-decoration: line-through; color: #A99BC9; }
  .task .x { border: 0; background: none; color: #C9BEDF; padding: 0 2px; cursor: pointer; }
  .task .x:hover { color: #C6402F; }
  .addtask { display: flex; gap: 6px; margin-top: 9px; }
  .empty { font-size: 12px; color: #A99BC9; padding: 10px 0; }
  .err { background: #FBEDEA; color: #C6402F; border-radius: 10px; padding: 10px 12px; font-size: 12.5px; margin-bottom: 12px; display: none; }
</style>
</head>
<body>
<main>
  <header class="top">
    <h1>리머 스튜디오 보드</h1>
    <nav class="tabs"><a href="/admin">유메 운영</a><a class="on" href="/admin/studio">스튜디오</a></nav>
  </header>
  <p class="sub">의뢰 · 진행 중 · 완료 · 매출, 그리고 자사 제품 진행 상황.</p>

  <div class="err" id="err"></div>
  <div class="grid" id="kpi"></div>

  <section class="panel">
    <h2>들어온 의뢰</h2>
    <p class="desc">리머 사이트 문의 양식으로 접수된 건입니다. “일감으로” 를 누르면 아래 목록으로 옮겨집니다.</p>
    <div class="tablewrap"><table id="inq"></table></div>
  </section>

  <section class="panel">
    <h2>일감</h2>
    <p class="desc">상태 · 진행률 · 금액은 칸을 고치면 바로 저장됩니다. 매출은 실제로 받은 금액만 합산합니다.</p>
    <div class="row">
      <input id="nTitle" placeholder="일감 이름" style="min-width:180px" />
      <input id="nClient" placeholder="고객" style="min-width:120px" />
      <input id="nAmount" type="number" min="0" step="10000" placeholder="계약 금액" style="min-width:120px" />
      <button class="p" id="addProject">추가</button>
    </div>
    <div class="tablewrap"><table id="proj"></table></div>
  </section>

  <section class="panel">
    <h2>가격 참고표</h2>
    <p class="desc">
      사이트에 적어둔 기간에 <b>일당</b>을 곱해 낸 값입니다. 시장 조사 결과가 아니라 계산기예요 —
      일당을 바꾸면 전부 다시 계산됩니다. 견적을 낼 때 “이보다 낮으면 손해”의 기준으로 쓰세요.
    </p>
    <div class="row">
      <label style="font-size:12.5px;color:#8577A8">일당</label>
      <input id="rate" type="number" min="0" step="10000" style="width:130px" />
      <span class="muted" style="font-size:11.5px">원 · 주 5일 기준</span>
      <button id="rateReset">기본값</button>
    </div>
    <div class="tablewrap"><table id="price"></table></div>
    <p class="desc" style="margin:12px 0 0">
      결제 심사 보정 권고 대응, 인수 후 새 기능 추가는 이 표에 포함되지 않습니다 — 별도 건으로 잡으세요.
      인수 후 1회 무료 AS와 범위 내 오류 수정은 포함이므로, 그 몫을 미리 얹어 두는 편이 안전합니다.
    </p>
  </section>

  <section class="panel">
    <h2>자사 제품 진행 상황</h2>
    <p class="desc">할 일을 누르면 할 일 → 하는 중 → 완료 순으로 바뀝니다.</p>
    <div class="prod" id="prod"></div>
  </section>
</main>

<script>
(function () {
  var S = null;
  var E = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  }); };
  var won = function (n) { return "₩" + Number(n || 0).toLocaleString("ko-KR"); };
  var day = function (t) { return t ? new Date(Number(t)).toLocaleDateString("ko-KR", { year: "2-digit", month: "2-digit", day: "2-digit" }) : ""; };
  var dinput = function (t) { if (!t) return ""; var d = new Date(Number(t)); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };

  function fail(m) { var e = document.getElementById("err"); e.textContent = m; e.style.display = "block"; }
  async function api(path, opts) {
    opts = opts || {};
    var r = await fetch("/api/admin" + path, {
      method: opts.method || "GET",
      credentials: "same-origin",
      headers: opts.body ? { "Content-Type": "application/json" } : {},
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    var d = await r.json().catch(function () { return {}; });
    if (!r.ok) throw new Error(d.error || ("요청이 실패했어요 (" + r.status + ")"));
    return d;
  }

  var INQ_ST = { new: "신규", replied: "회신함", quoted: "견적 보냄", won: "수주", lost: "무산" };
  var PRJ_ST = { lead: "상담", active: "진행 중", done: "완료", dropped: "무산" };
  var TASK_ST = { todo: "할 일", doing: "하는 중", done: "완료" };
  var NEXT = { todo: "doing", doing: "done", done: "todo" };

  function kpis() {
    var s = S.summary;
    var total = s.revenueOutsourcing + s.revenueYume;
    var card = function (l, v, sub, hi) {
      return '<div class="kpi' + (hi ? " hi" : "") + '"><div class="l">' + l + '</div><div class="v">' + v + "</div>" +
        (sub ? '<div class="s">' + sub + "</div>" : "") + "</div>";
    };
    document.getElementById("kpi").innerHTML =
      card("총 매출", won(total), "외주 " + won(s.revenueOutsourcing) + " · 유메 " + won(s.revenueYume), true) +
      card("새 의뢰", s.inquiriesNew, "전체 " + s.inquiriesTotal + "건") +
      card("진행 중", s.active, "상담 " + s.lead + "건") +
      card("완료", s.done, "누적") +
      card("미수금", won(s.outstanding), "계약 " + won(s.contracted));
  }

  function inquiries() {
    var t = document.getElementById("inq");
    if (!S.inquiries.length) { t.outerHTML = '<table id="inq"></table>'; document.getElementById("inq").innerHTML = ""; t = document.getElementById("inq"); t.innerHTML = '<tr><td class="empty">아직 들어온 의뢰가 없습니다.</td></tr>'; return; }
    var head = "<tr><th>접수</th><th>이름 · 회사</th><th>연락처</th><th>종류 · 예산</th><th>내용</th><th>상태</th><th></th></tr>";
    t.innerHTML = head + S.inquiries.map(function (q) {
      var st = q.status || "new";
      return "<tr>" +
        "<td class='muted'>" + day(q.created_at) + "</td>" +
        "<td><b>" + E(q.name) + "</b>" + (q.company ? "<br><span class='muted'>" + E(q.company) + "</span>" : "") + "</td>" +
        "<td>" + E(q.contact) + "</td>" +
        "<td>" + E(q.kind || "") + "<br><span class='muted'>" + E(q.budget || "") + "</span></td>" +
        "<td class='wrapline'>" + E(q.message) + "</td>" +
        "<td><select data-inq='" + q.id + "'>" + Object.keys(INQ_ST).map(function (k) {
          return "<option value='" + k + "'" + (k === st ? " selected" : "") + ">" + INQ_ST[k] + "</option>";
        }).join("") + "</select></td>" +
        "<td><button data-conv='" + q.id + "'>일감으로</button></td>" +
      "</tr>";
    }).join("");
  }

  function projects() {
    var t = document.getElementById("proj");
    if (!S.projects.length) { t.innerHTML = '<tr><td class="empty">아직 등록된 일감이 없습니다.</td></tr>'; return; }
    var head = "<tr><th>이름</th><th>고객</th><th>상태</th><th>진행</th><th>계약</th><th>받음</th><th>시작</th><th>마감</th><th></th></tr>";
    t.innerHTML = head + S.projects.map(function (p) {
      return "<tr>" +
        "<td><input data-f='title' data-id='" + p.id + "' value='" + E(p.title) + "' style='min-width:150px' /></td>" +
        "<td><input data-f='client' data-id='" + p.id + "' value='" + E(p.client || "") + "' style='min-width:96px' /></td>" +
        "<td><select data-f='status' data-id='" + p.id + "'>" + Object.keys(PRJ_ST).map(function (k) {
          return "<option value='" + k + "'" + (k === p.status ? " selected" : "") + ">" + PRJ_ST[k] + "</option>";
        }).join("") + "</select></td>" +
        "<td><div class='bar' title='" + p.progress + "%'><i style='width:" + Number(p.progress || 0) + "%'></i></div>" +
          "<input data-f='progress' data-id='" + p.id + "' type='number' min='0' max='100' value='" + Number(p.progress || 0) + "' style='width:64px;margin-top:4px' /></td>" +
        "<td class='num'><input data-f='amount_krw' data-id='" + p.id + "' type='number' min='0' step='10000' value='" + Number(p.amount_krw || 0) + "' style='width:106px' /></td>" +
        "<td class='num'><input data-f='paid_krw' data-id='" + p.id + "' type='number' min='0' step='10000' value='" + Number(p.paid_krw || 0) + "' style='width:106px' /></td>" +
        "<td><input data-f='started_at' data-id='" + p.id + "' type='date' value='" + dinput(p.started_at) + "' style='width:124px' /></td>" +
        "<td><input data-f='due_at' data-id='" + p.id + "' type='date' value='" + dinput(p.due_at) + "' style='width:124px' /></td>" +
        "<td><button class='d' data-del='" + p.id + "'>삭제</button></td>" +
      "</tr>";
    }).join("");
  }

  function products() {
    document.getElementById("prod").innerHTML = S.products.map(function (p) {
      var mine = S.tasks.filter(function (t) { return t.product === p.key; });
      var done = mine.filter(function (t) { return t.state === "done"; }).length;
      return "<div class='prodcard'>" +
        "<h3>" + E(p.label) + "</h3>" +
        "<div class='meta'>" + done + " / " + mine.length + " 완료 · <a href='" + E(p.href) + "' target='_blank' rel='noreferrer'>열기</a></div>" +
        (mine.length ? mine.map(function (t) {
          return "<div class='task" + (t.state === "done" ? " done" : "") + "'>" +
            "<span class='badge s-" + t.state + "'>" + TASK_ST[t.state] + "</span>" +
            "<span class='t' data-task='" + t.id + "' data-state='" + t.state + "'>" + E(t.title) + "</span>" +
            "<button class='x' data-tdel='" + t.id + "' title='삭제'>×</button>" +
          "</div>";
        }).join("") : "<div class='empty'>할 일이 없습니다.</div>") +
        "<div class='addtask'><input data-add='" + p.key + "' placeholder='할 일 추가 후 Enter' /></div>" +
      "</div>";
    }).join("");
  }

  // 사이트 "하는 일"에 적어둔 기간과 같은 값. 한쪽만 고치면 견적과 약속이 어긋난다.
  var PRICE = [
    { name: "웹사이트 · 웹서비스", lo: 1, hi: 3, note: "회원·결제까지 붙으면 상단" },
    { name: "결제 · 인증 연동", lo: 1, hi: 3, note: "신청 · 연동 · 테스트 확인까지" },
    { name: "AI 기능 연동", lo: 1, hi: 3, note: "검증·근거 대조를 넣으면 상단" },
    { name: "업무 자동화 · 데이터", lo: 1, hi: 2, note: "연동할 외부 API 수에 비례" },
  ];
  var DEFAULT_RATE = 400000;
  function rate() {
    var v = Number(localStorage.getItem("studio.rate") || DEFAULT_RATE);
    return Number.isFinite(v) && v > 0 ? v : DEFAULT_RATE;
  }
  function prices() {
    var r = rate();
    document.getElementById("rate").value = r;
    var t = document.getElementById("price");
    t.innerHTML = "<tr><th>서비스</th><th>기간</th><th>일수</th><th>적정가</th><th>메모</th></tr>" +
      PRICE.map(function (p) {
        var lo = p.lo * 5 * r, hi = p.hi * 5 * r;
        return "<tr><td><b>" + E(p.name) + "</b></td>" +
          "<td class='muted'>" + p.lo + "~" + p.hi + "주</td>" +
          "<td class='num muted'>" + (p.lo * 5) + "~" + (p.hi * 5) + "일</td>" +
          "<td class='num'><b>" + won(lo) + " ~ " + won(hi) + "</b></td>" +
          "<td class='muted'>" + E(p.note) + "</td></tr>";
      }).join("");
  }

  function paint() { kpis(); inquiries(); projects(); products(); prices(); }

  async function load() {
    try { S = await api("/studio"); paint(); }
    catch (e) {
      if (String(e.message).indexOf("관리자") >= 0) {
        fail("관리자 로그인이 필요합니다. 유메에 관리자 계정으로 로그인한 뒤 이 페이지를 새로고침하세요.");
      } else fail(e.message);
    }
  }

  // 한 칸을 고치면 그 자리에서 저장한다. 저장 버튼을 따로 두면 누르지 않고 떠나서
  // 고친 내용이 사라진다.
  document.addEventListener("change", async function (ev) {
    var el = ev.target;
    if (el.id === "rate") {
      var v = Number(el.value);
      if (Number.isFinite(v) && v > 0) localStorage.setItem("studio.rate", String(Math.floor(v)));
      return prices();
    }
    try {
      if (el.dataset.inq) { await api("/studio/inquiry/" + el.dataset.inq, { method: "PATCH", body: { status: el.value } }); return load(); }
      if (el.dataset.f && el.dataset.id) {
        var v = el.value;
        if (el.type === "date") v = v ? new Date(v + "T00:00:00").getTime() : null;
        var body = {}; body[el.dataset.f] = v;
        await api("/studio/project/" + el.dataset.id, { method: "PATCH", body: body });
        return load();
      }
    } catch (e) { fail(e.message); }
  });

  document.addEventListener("click", async function (ev) {
    var el = ev.target.closest("[data-conv],[data-del],[data-task],[data-tdel],#addProject,#rateReset");
    if (!el) return;
    if (el.id === "rateReset") { localStorage.removeItem("studio.rate"); return prices(); }
    try {
      if (el.id === "addProject") {
        var title = document.getElementById("nTitle").value.trim();
        if (!title) return fail("일감 이름을 적어주세요.");
        await api("/studio/project", { method: "POST", body: {
          title: title,
          client: document.getElementById("nClient").value,
          amount_krw: Number(document.getElementById("nAmount").value || 0),
        } });
        document.getElementById("nTitle").value = ""; document.getElementById("nClient").value = ""; document.getElementById("nAmount").value = "";
        return load();
      }
      if (el.dataset.conv) { await api("/studio/inquiry/" + el.dataset.conv + "/convert", { method: "POST" }); return load(); }
      if (el.dataset.del) {
        if (!confirm("이 일감을 삭제할까요? 되돌릴 수 없습니다.")) return;
        await api("/studio/project/" + el.dataset.del, { method: "DELETE" }); return load();
      }
      if (el.dataset.task) { await api("/studio/task/" + el.dataset.task, { method: "PATCH", body: { state: NEXT[el.dataset.state] } }); return load(); }
      if (el.dataset.tdel) { await api("/studio/task/" + el.dataset.tdel, { method: "DELETE" }); return load(); }
    } catch (e) { fail(e.message); }
  });

  document.addEventListener("keydown", async function (ev) {
    if (ev.key !== "Enter" || !ev.target.dataset.add) return;
    var title = ev.target.value.trim();
    if (!title) return;
    try {
      await api("/studio/task", { method: "POST", body: { product: ev.target.dataset.add, title: title } });
      ev.target.value = ""; load();
    } catch (e) { fail(e.message); }
  });

  load();
})();
</script>
</body>
</html>`;
}
