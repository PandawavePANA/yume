// 제품 하나의 운영 화면(/admin/p/ballast 같은 주소).
//
// 유메는 이 서버 안에 데이터가 있어서 /admin이 직접 조회하지만, 밸러스트·아이픽·프로바는
// 각자 자기 데이터베이스를 쓴다. 그래서 이 화면은 조회하지 않고 **그 제품이 보내 준
// 현황을 그리기만** 한다. 무엇을 셀지는 제품이 정하고, 여기서는 모양만 안다.
//
// 그래서 화면 코드가 제품 수만큼 늘어나지 않는다. 제품이 지표를 하나 더 보내면
// 칸이 하나 더 생기고, 이 파일은 그대로다.
import { EXTERNAL_PRODUCTS } from "./productRevenue.js";

export function renderProductPage(key) {
  const p = EXTERNAL_PRODUCTS.find((x) => x.key === key);
  if (!p) return null;

  const nav = [
    { href: "/admin", label: "유메 운영" },
    ...EXTERNAL_PRODUCTS.map((x) => ({ href: `/admin/p/${x.key}`, label: `${x.label} 운영`, on: x.key === key })),
    { href: "/admin/studio", label: "스튜디오" },
  ];

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="robots" content="noindex, nofollow" />
<title>${p.label} 운영 · 리머</title>
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
    background: radial-gradient(720px 400px at 16% -8%, rgba(109,90,224,.22), transparent 62%),
                radial-gradient(600px 360px at 90% 4%, rgba(76,125,246,.14), transparent 66%); }
  main { position:relative; z-index:1; max-width:1100px; margin:0 auto; padding:22px clamp(14px,3vw,26px) 80px; }

  .bar { display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:18px; }
  .logo { display:flex; align-items:center; gap:9px; font:600 12px/1 var(--mono); letter-spacing:.2em; }
  .logo i { width:9px; height:9px; background:var(--beam); border-radius:2px; transform:rotate(45deg); }
  .bar .sp { flex:1; }
  .ghost { font:inherit; font-size:12px; padding:7px 12px; border-radius:9px; cursor:pointer; white-space:nowrap;
           border:1px solid var(--line2); background:transparent; color:var(--dim); text-decoration:none; }
  .ghost:hover { background:rgba(255,255,255,.06); color:var(--ink); }
  .ghost.on { background:var(--beam); border-color:transparent; color:#fff; font-weight:600; }

  .head { border:1px solid var(--line); border-radius:22px; padding:22px clamp(16px,2.4vw,26px);
          background:linear-gradient(160deg,rgba(109,90,224,.16),rgba(255,255,255,.028) 46%); margin-bottom:14px; }
  .lbl { font:600 10.5px/1 var(--mono); letter-spacing:.16em; color:var(--faint); text-transform:uppercase; }
  .amt { margin:11px 0 0; font-size:clamp(30px,5.4vw,42px); font-weight:700; letter-spacing:-.03em;
         font-variant-numeric:tabular-nums; line-height:1.05;
         background:linear-gradient(120deg,var(--ink) 32%,#b9a8ff); -webkit-background-clip:text; background-clip:text; color:transparent; }
  .note { margin-top:9px; font-size:12px; color:var(--faint); line-height:1.6; }
  .warnbox { margin-top:12px; padding:9px 12px; border-radius:10px; font-size:12px; line-height:1.6;
             background:rgba(224,116,92,.1); border:1px solid rgba(224,116,92,.26); color:#f0a08c; }

  .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:1px; margin-top:20px;
          background:var(--line); border:1px solid var(--line); border-radius:14px; overflow:hidden; }
  .m { background:#0a0a10; padding:13px 15px; }
  .m .k { font-size:11.5px; color:var(--faint); }
  .m .v { margin-top:6px; font-size:19px; font-weight:650; font-variant-numeric:tabular-nums; }
  .m .v small { font-size:12px; font-weight:500; color:var(--faint); margin-left:3px; }

  .card { border:1px solid var(--line); border-radius:18px; background:var(--card);
          padding:18px clamp(14px,2vw,20px); margin-bottom:12px; }
  .card h2 { font-size:13.5px; margin:0 0 3px; font-weight:600; }
  .card .d { font-size:11.5px; color:var(--faint); margin:0 0 14px; line-height:1.6; }
  .row { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:12px; align-items:start;
         padding:11px 0; border-top:1px solid var(--line); }
  .row:first-of-type { border-top:0; }
  .t1 { font-size:14px; font-weight:600; letter-spacing:-.01em; }
  .t2 { font-size:11.5px; color:var(--faint); margin-top:3px; }
  .num { text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; font-weight:650; font-size:14px; }
  .pill { display:inline-block; padding:2px 8px; border-radius:99px; font-size:10.5px; font-weight:600;
          background:rgba(255,255,255,.07); color:var(--dim); border:1px solid var(--line); }
  .pill.good { background:rgba(70,192,138,.15); color:#7ddab0; border-color:rgba(70,192,138,.28); }
  .pill.warn { background:rgba(224,165,60,.15); color:#e8c078; border-color:rgba(224,165,60,.28); }
  .pill.bad  { background:rgba(224,116,92,.16); color:#f0a08c; border-color:rgba(224,116,92,.3); }
  .empty { padding:26px 0; text-align:center; font-size:12.5px; color:var(--faint); line-height:1.8; }
  .err { display:none; margin-bottom:12px; padding:11px 13px; border-radius:11px; font-size:12.5px;
         background:rgba(224,116,92,.12); border:1px solid rgba(224,116,92,.3); color:#f0a08c; }
</style>
</head>
<body>
<main>
  <div class="bar">
    <span class="logo"><i></i>REAMER</span>
    <span class="sp"></span>
    ${nav.map((n) => `<a class="ghost${n.on ? " on" : ""}" href="${n.href}">${n.label}</a>`).join("")}
  </div>

  <div class="err" id="err"></div>

  <section class="head">
    <div class="lbl">${p.label} 매출</div>
    <div class="amt" id="amt">—</div>
    <div class="note" id="note"></div>
    <div class="warnbox" id="warn" style="display:none"></div>
    <div class="grid" id="metrics"></div>
  </section>

  <section class="card">
    <h2>최근 내역</h2>
    <p class="d">${p.label}이(가) 보내 준 최근 기록입니다.</p>
    <div id="recent"><div class="empty">불러오는 중…</div></div>
  </section>

  <p class="note" style="text-align:center">
    <a class="ghost" href="${p.site}" target="_blank" rel="noreferrer">${p.label} 사이트 열기 ↗</a>
  </p>
</main>

<script>
(function () {
  var KEY = ${JSON.stringify(p.key)};
  var E = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]; }); };
  var won = function (n) { return "₩" + Number(n || 0).toLocaleString("ko-KR"); };
  var day = function (t) { var d = new Date(t); return isNaN(d) ? "" :
    d.toLocaleDateString("ko-KR", { month:"numeric", day:"numeric" }); };

  function fail(m) { var e = document.getElementById("err"); e.textContent = m; e.style.display = "block"; }

  (async function () {
    var r = await fetch("/api/admin/studio/product/" + KEY, { credentials: "same-origin" });
    if (r.status === 401) return location.reload();
    var d = await r.json().catch(function () { return {}; });
    if (!r.ok) return fail(d.error || "불러오지 못했어요.");

    // 연결 안 된 것과 실패한 것을 숫자로 뭉개지 않는다.
    if (d.state === "unlinked") {
      document.getElementById("amt").textContent = "—";
      document.getElementById("note").textContent = "아직 연결되지 않았습니다. 이 제품의 매출 주소를 설정하면 여기에 나타납니다.";
      document.getElementById("recent").innerHTML = '<div class="empty">연결 후 표시됩니다.</div>';
      return;
    }
    if (d.state === "error") {
      document.getElementById("amt").textContent = "!";
      var w = document.getElementById("warn");
      w.textContent = "불러오지 못했어요 — " + (d.error || "");
      w.style.display = "block";
      document.getElementById("recent").innerHTML = '<div class="empty">—</div>';
      return;
    }

    document.getElementById("amt").textContent = won(d.total);
    var note = [];
    if (d.note) note.push(d.note);
    if (d.count != null) note.push(d.count + "건");
    if (d.state === "stale") note.push("지금은 응답이 없어 직전 값입니다");
    document.getElementById("note").textContent = note.join(" · ");

    document.getElementById("metrics").innerHTML = (d.metrics || []).map(function (m) {
      return '<div class="m"><div class="k">' + E(m.label) + "</div>" +
             '<div class="v">' + E(m.value) + (m.sub ? "<small>" + E(m.sub) + "</small>" : "") + "</div></div>";
    }).join("") || '<div class="m"><div class="k">지표</div><div class="v">—</div></div>';

    var rec = d.recent || [];
    document.getElementById("recent").innerHTML = rec.length ? rec.map(function (x) {
      return '<div class="row"><div><div class="t1">' + E(x.title) + "</div>" +
        '<div class="t2">' + day(x.when) + (x.sub ? " · " : "") +
          (x.sub ? '<span class="pill ' + E(x.tone) + '">' + E(x.sub) + "</span>" : "") + "</div></div>" +
        '<div class="num">' + (x.amount ? won(x.amount) : "") + "</div></div>";
    }).join("") : '<div class="empty">최근 내역이 없습니다.</div>';
  })().catch(function (e) { fail(e.message); });
})();
</script>
</body>
</html>`;
}
