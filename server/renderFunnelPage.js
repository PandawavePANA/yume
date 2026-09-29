// 유입 화면 — 광고를 켜 놓고 매일 여는 곳. 출처마다 방문 → 첫 확인 → 가입 → 결제가 몇 명인지,
// 그리고 날짜별로 AI 비용이 얼마나 나갔는지를 한 장에 둔다. 광고비와 나란히 놓고 "한 명 데려오는 데
// 얼마, 그 사람이 얼마를 냈나"를 보는 것이 목적이다.
export function renderFunnelPage() {
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>유입 · 유메 운영</title>
<style>
  *{box-sizing:border-box}
  :root{--ink:#141118;--ink2:#54505E;--ink3:#8B8694;--line:#E6E2EC;--accent:#5B3FA0;--good:#1F8A57;--warn:#9A6A12;--bad:#B8321F}
  body{margin:0;background:#FBFAF8;color:var(--ink);font:14px/1.6 -apple-system,"Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif;word-break:keep-all}
  main{max-width:1080px;margin:0 auto;padding:22px 16px 60px}
  .bar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:18px}
  .bar h1{font-size:18px;margin:0 auto 0 0;letter-spacing:-.02em}
  .ghost{font:inherit;font-size:12.5px;padding:7px 12px;border-radius:9px;border:1px solid var(--line);background:#fff;color:var(--ink2);text-decoration:none;cursor:pointer}
  .ghost.on{background:var(--ink);color:#fff;border-color:var(--ink)}
  .tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin-bottom:18px}
  .tile{background:#fff;border:1px solid var(--line);border-radius:12px;padding:12px 14px}
  .tile .k{font-size:12px;color:var(--ink3)} .tile .v{font-size:22px;font-weight:700;font-variant-numeric:tabular-nums;letter-spacing:-.02em;margin-top:2px}
  .tile .s{font-size:11.5px;color:var(--ink3)}
  .meter{height:6px;border-radius:9px;background:#EEE9F5;margin-top:8px;overflow:hidden}.meter i{display:block;height:100%;background:var(--accent)}
  .meter.hot i{background:var(--bad)}
  h2{font-size:14px;margin:22px 0 8px}
  .wrap{overflow-x:auto;background:#fff;border:1px solid var(--line);border-radius:12px}
  table{width:100%;border-collapse:collapse;min-width:640px}
  th,td{padding:9px 12px;border-bottom:1px solid var(--line);text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
  th:first-child,td:first-child{text-align:left}
  th{font-size:11.5px;color:var(--ink3);font-weight:600;background:#FBFAFD}
  tr:last-child td{border-bottom:0}
  .pct{color:var(--ink3);font-size:11.5px;margin-left:4px}
  .note{font-size:12px;color:var(--ink3);margin-top:8px}
  .bars{display:flex;align-items:flex-end;gap:4px;height:120px;padding:10px 12px 0;background:#fff;border:1px solid var(--line);border-radius:12px}
  .bars div{flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;height:100%;justify-content:flex-end}
  .bars b{display:block;width:100%;max-width:26px;background:var(--accent);border-radius:4px 4px 0 0;min-height:2px}
  .bars span{font-size:10px;color:var(--ink3)}
  .err{display:none;padding:10px 12px;border-radius:10px;background:#FBE9E7;color:var(--bad);margin-bottom:12px}
</style></head><body><main>
<div class="bar">
  <h1>유입 · 광고 성과</h1>
  <a class="ghost" href="/admin">유메 운영</a>
  <a class="ghost" href="/admin/desk">의뢰 데스크</a>
  <button class="ghost" data-days="7">7일</button>
  <button class="ghost on" data-days="14">14일</button>
  <button class="ghost" data-days="30">30일</button>
</div>
<div class="err" id="err"></div>
<div class="tiles" id="tiles"></div>
<h2>출처별 흐름</h2>
<div class="wrap"><table><thead><tr><th>출처</th><th>방문</th><th>첫 확인</th><th>가입</th><th>결제한 사람</th><th>결제 금액</th></tr></thead><tbody id="rows"><tr><td colspan="6">불러오는 중…</td></tr></tbody></table></div>
<p class="note">광고 주소 끝에 <code>?utm_source=naver&amp;utm_medium=cpc&amp;utm_campaign=launch</code>처럼 붙이면 그 이름으로 묶입니다. 방문은 브라우저 기준(같은 사람이 여러 번 와도 1), 결제는 가입했을 때의 출처로 셉니다.</p>
<h2>날짜별 AI 비용</h2>
<div class="bars" id="bars"></div>
<div class="wrap" style="margin-top:10px"><table><thead><tr><th>날짜</th><th>방문</th><th>확인 수</th><th>AI 비용</th><th>확인 1건당</th></tr></thead><tbody id="days"></tbody></table></div>
</main>
<script>
(function () {
  var E = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]; }); };
  var won = function (n) { return Math.round(n).toLocaleString("ko-KR") + "원"; };
  var pct = function (a, b) { return b ? '<span class="pct">' + Math.round((a / b) * 100) + "%</span>" : ""; };
  async function load(days) {
    try {
      var r = await fetch("/api/admin/funnel?days=" + days, { credentials: "same-origin" });
      if (r.status === 401) { location.reload(); return; }
      var d = await r.json();
      if (!r.ok) throw new Error(d.error || "불러오지 못했어요.");
      var krw = d.usdKrw;
      var tot = d.rows.reduce(function (a, x) { a.v += x.visits; a.c += x.checkers; a.s += x.signups; a.b += x.buyers; a.r += x.revenue; return a; }, { v: 0, c: 0, s: 0, b: 0, r: 0 });
      var cost = d.days.reduce(function (a, x) { return a + x.usd; }, 0) * krw;
      var share = d.budgetUsd ? d.todayUsd / d.budgetUsd : 0;
      document.getElementById("tiles").innerHTML = [
        ["방문", tot.v.toLocaleString(), "첫 확인 " + tot.c.toLocaleString() + "명"],
        ["가입", tot.s.toLocaleString(), "결제 " + tot.b.toLocaleString() + "명"],
        ["결제 금액", won(tot.r), "같은 기간 AI 비용 약 " + won(cost)],
        ["오늘 AI 비용", "$" + d.todayUsd.toFixed(2), "상한 $" + d.budgetUsd + " (약 " + won(d.budgetUsd * krw) + ")", share],
      ].map(function (t) {
        return '<div class="tile"><div class="k">' + E(t[0]) + '</div><div class="v">' + E(t[1]) + '</div><div class="s">' + E(t[2]) + "</div>" +
          (t[3] !== undefined ? '<div class="meter' + (t[3] >= 0.8 ? " hot" : "") + '"><i style="width:' + Math.min(100, Math.round(t[3] * 100)) + '%"></i></div>' : "") + "</div>";
      }).join("");
      document.getElementById("rows").innerHTML = d.rows.length ? d.rows.map(function (x) {
        return "<tr><td>" + E(x.source) + "</td><td>" + x.visits + "</td><td>" + x.checkers + pct(x.checkers, x.visits) + "</td><td>" + x.signups + pct(x.signups, x.visits) +
          "</td><td>" + x.buyers + "</td><td>" + won(x.revenue) + "</td></tr>";
      }).join("") : '<tr><td colspan="6">아직 기록이 없습니다. 방문이 생기면 여기에 쌓입니다.</td></tr>';
      var max = Math.max.apply(null, d.days.map(function (x) { return x.usd; }).concat([0.01]));
      document.getElementById("bars").innerHTML = d.days.map(function (x) {
        return '<div title="' + E(x.day) + " $" + x.usd.toFixed(2) + '"><b style="height:' + Math.round((x.usd / max) * 90) + '%"></b><span>' + E(x.day.slice(5)) + "</span></div>";
      }).join("");
      document.getElementById("days").innerHTML = d.days.slice().reverse().map(function (x) {
        return "<tr><td>" + E(x.day) + "</td><td>" + x.visitors + "</td><td>" + x.checks + "</td><td>$" + x.usd.toFixed(2) + " (약 " + won(x.usd * krw) + ")</td><td>" +
          (x.checks ? won((x.usd * krw) / x.checks) : "—") + "</td></tr>";
      }).join("");
    } catch (e) {
      var el = document.getElementById("err"); el.textContent = e.message; el.style.display = "block";
    }
  }
  document.addEventListener("click", function (ev) {
    var b = ev.target.closest("[data-days]"); if (!b) return;
    document.querySelectorAll("[data-days]").forEach(function (x) { x.classList.toggle("on", x === b); });
    load(Number(b.dataset.days));
  });
  load(14);
})();
</script></body></html>`;
}
