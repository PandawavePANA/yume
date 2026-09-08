// 사이트 운영자만 보는 내부 대시보드(/admin). 실제 데이터는 이 페이지가 직접
// 담고 있지 않고, 브라우저에서 /api/admin/stats를 관리자 키로 호출해서 채운다
// — 이 HTML 자체는 로그인 화면 + 빈 틀만 서버가 렌더링하고, 키가 맞아야만
// 화면에 숫자가 채워진다. React 앱과는 분리된 정적 페이지라(SPA에 아직
// 라우터가 없음) renderResultPage.js와 같은 방식으로 만들었다.
//
// "유메에서 일어나는 모든 일을 확인하고 싶다"는 요청에 맞춰, 요약 숫자뿐 아니라
// 실제 대화 내용·검증 원문과 판정 상세·캐시 원문·오류 로그까지 전부 펼쳐 볼 수
// 있게 만들었다. 그만큼 민감한 화면이라 반드시 ADMIN_SECRET으로 막아둘 것.
export function renderAdminPage() {
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>유메 관리자 대시보드</title>
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0; font-family: -apple-system,BlinkMacSystemFont,'SF Pro Display','Segoe UI','Noto Sans KR',sans-serif;
    background: radial-gradient(ellipse 80% 60% at 50% -10%, #D3B8F5 0%, #E3CDF7 40%, #F1E3FA 75%, #F8F0FC 100%);
    color: #241F33; min-height: 100vh;
  }
  .wrap { max-width: 1120px; margin: 0 auto; padding: 32px 18px 60px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .sub { font-size: 12.5px; color: #8577A8; margin-bottom: 24px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 12px; margin-bottom: 24px; }
  .stat-card { background: #fff; border: 1px solid #D9BFF0; border-radius: 14px; padding: 16px 18px; }
  .stat-label { font-size: 11.5px; color: #8577A8; font-weight: 600; margin-bottom: 6px; }
  .stat-value { font-size: 24px; font-weight: 700; color: #241F33; }
  .stat-value small { font-size: 13px; font-weight: 500; color: #8577A8; }
  .section { background: #fff; border: 1px solid #D9BFF0; border-radius: 16px; padding: 20px 22px; margin-bottom: 20px; }
  .section-title { font-size: 13.5px; font-weight: 700; color: #33363F; margin-bottom: 4px; }
  .section-desc { font-size: 11.5px; color: #A99BC9; margin-bottom: 14px; }
  table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #EFE6FA; color: #4C5266; vertical-align: top; }
  th { color: #8577A8; font-weight: 600; font-size: 11.5px; }
  tr:last-child td { border-bottom: none; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 10.5px; font-weight: 700; white-space: nowrap; }
  .badge.done { background: #EAF7F0; color: #1F9D66; }
  .badge.pending { background: #FFF6E0; color: #B4690E; }
  .badge.error { background: #FBEDEA; color: #C6402F; }
  .badge.web { background: #EFE6FA; color: #6B4FA8; }
  .badge.kakao { background: #FFF0DC; color: #A56A15; }
  .badge.confirmed { background: #EAF7F0; color: #1F9D66; }
  .badge.false { background: #FBEDEA; color: #C6402F; }
  .badge.uncertain { background: #FFF6E0; color: #B4690E; }
  .empty { color: #B0A2D6; font-size: 12.5px; padding: 8px 0; }
  #gate { max-width: 380px; margin: 90px auto; background: #fff; border: 1px solid #D9BFF0; border-radius: 16px; padding: 28px; text-align: center; }
  #gate input { width: 100%; padding: 10px 12px; border-radius: 10px; border: 1px solid #D9BFF0; font-size: 13.5px; margin: 14px 0; }
  #gate button { width: 100%; padding: 10px 0; border-radius: 10px; border: none; background: linear-gradient(90deg,#B49AEE,#6B4FA8); color: #fff; font-weight: 600; font-size: 13.5px; cursor: pointer; }
  #gateError { color: #C6402F; font-size: 12px; min-height: 16px; margin-top: 8px; }
  #dashboard { display: none; }
  .refresh-note { font-size: 11.5px; color: #A99BC9; }
  .toprow { display: flex; justify-content: space-between; align-items: center; }
  #refreshBtn { border: 1px solid #D9BFF0; background: #fff; color: #6B4FA8; font-size: 12px; font-weight: 600; padding: 6px 12px; border-radius: 999px; cursor: pointer; }
  details.row-detail { border-top: 1px solid #EFE6FA; }
  details.row-detail summary { cursor: pointer; padding: 8px 10px; font-size: 12.5px; color: #4C5266; list-style: none; }
  details.row-detail summary::-webkit-details-marker { display: none; }
  details.row-detail summary::before { content: "▸ "; color: #B0A2D6; }
  details.row-detail[open] summary::before { content: "▾ "; }
  .detail-body { padding: 4px 10px 14px 22px; font-size: 12.5px; color: #4C5266; line-height: 1.6; }
  .bubble { border-radius: 10px; padding: 8px 12px; margin-bottom: 6px; max-width: 90%; white-space: pre-wrap; word-break: break-word; }
  .bubble.user { background: #F1E6FB; color: #33363F; }
  .bubble.assistant { background: #F5F5F7; color: #33363F; margin-left: auto; }
  .bubble-role { font-size: 10px; font-weight: 700; color: #A99BC9; margin-bottom: 2px; }
  .claim-item { border: 1px solid #EFE6FA; border-radius: 10px; padding: 10px 12px; margin-bottom: 8px; }
  .claim-item .claim-text { font-weight: 600; margin-bottom: 4px; }
  .claim-item .claim-expl { color: #6E6389; font-size: 12px; margin-top: 4px; }
  .src-link { display: block; font-size: 11px; color: #6B4FA8; text-decoration: none; margin-top: 2px; word-break: break-all; }
  .input-block { background: #F9F5FF; border: 1px solid #EFE6FA; border-radius: 8px; padding: 10px 12px; white-space: pre-wrap; word-break: break-word; margin-bottom: 10px; }
  code { background: #F1E6FB; color: #5B3A9E; padding: 1px 5px; border-radius: 4px; font-size: 11.5px; }
</style>
</head>
<body>
  <div id="gate">
    <div style="font-size:16px;font-weight:700;margin-bottom:4px;">🌙 유메 관리자 대시보드</div>
    <div style="font-size:12px;color:#8577A8;">서버 콘솔에 출력된 관리자 키를 입력하세요</div>
    <input id="keyInput" type="password" placeholder="관리자 키" />
    <button onclick="loadDashboard()">입장하기</button>
    <div id="gateError"></div>
  </div>

  <div id="dashboard" class="wrap">
    <div class="toprow">
      <div>
        <h1>유메 관리자 대시보드</h1>
        <div class="sub">사이트·카카오·API에서 일어나는 모든 일을 한 화면에서 (전부 메모리 저장 — 서버 재배포 시 초기화) · <span id="ts" class="refresh-note"></span></div>
      </div>
      <button id="refreshBtn" onclick="refresh()">새로고침</button>
    </div>

    <div class="grid" id="statCards"></div>

    <div class="section">
      <div class="section-title">웹사이트 무료 플랜 사용자 (IP 기준)</div>
      <div class="section-desc">상위 50명, 오늘 무료 사용량·토큰 보유량 순</div>
      <table id="webTable"><thead><tr><th>구분</th><th>식별자</th><th>오늘 무료 사용</th><th>보유 토큰</th></tr></thead><tbody></tbody></table>
    </div>

    <div class="section">
      <div class="section-title">발급된 API 키</div>
      <div class="section-desc">외부 서비스가 유메 검증 API(/v1)를 호출할 때 쓰는 키</div>
      <table id="apiKeyTable"><thead><tr><th>라벨</th><th>키(마스킹)</th><th>발급일</th><th>오늘 호출</th><th>누적 호출</th></tr></thead><tbody></tbody></table>
    </div>

    <div class="section">
      <div class="section-title">대화 내용 (웹 AI 위젯 + 카카오 채널)</div>
      <div class="section-desc">항목을 눌러 실제 대화 전체를 확인할 수 있어요</div>
      <table id="chatTable"><thead><tr><th>구분</th><th>사용자</th><th>턴 수</th><th>마지막 활동</th></tr></thead><tbody></tbody></table>
    </div>

    <div class="section">
      <div class="section-title">최근 검증 요청 (전체)</div>
      <div class="section-desc">웹/카카오/외부 API를 통틀어 들어온 모든 검증 요청 — 원문과 판정 상세를 펼쳐볼 수 있어요</div>
      <table id="resultsTable"><thead><tr><th>상태</th><th>경로</th><th>내용</th><th>시각</th></tr></thead><tbody></tbody></table>
    </div>

    <div class="section">
      <div class="section-title">캐시된 검증 (같은 텍스트 재검증 방지)</div>
      <div class="section-desc">완전히 같은 텍스트가 다시 들어오면 재사용하는 캐시 항목</div>
      <table id="cacheTable"><thead><tr><th>도메인</th><th>내용</th><th>캐시된 시각</th></tr></thead><tbody></tbody></table>
    </div>

    <div class="section">
      <div class="section-title">오류 로그</div>
      <div class="section-desc">서버 catch 블록에서 잡힌 오류 (최신순)</div>
      <table id="errorTable"><thead><tr><th>발생 위치</th><th>메시지</th><th>시각</th></tr></thead><tbody></tbody></table>
    </div>
  </div>

<script>
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}
function fmtTime(ms) {
  if (!ms) return "-";
  return new Date(ms).toLocaleString("ko-KR");
}
function statCard(label, value, sub) {
  return '<div class="stat-card"><div class="stat-label">' + esc(label) + '</div><div class="stat-value">' + esc(value) + (sub ? ' <small>' + esc(sub) + '</small>' : '') + '</div></div>';
}
function badge(cls, text) { return '<span class="badge ' + esc(cls) + '">' + esc(text) + '</span>'; }
function verdictLabel(v) { return v === "confirmed" ? "확인됨" : v === "false" ? "사실과 다름" : "판단 보류"; }

function renderClaims(result) {
  if (!result) return '<div class="empty">아직 결과가 없어요.</div>';
  var out = '';
  if (result.overall) {
    out += '<div style="margin-bottom:10px;"><strong>총평:</strong> ' + esc(result.overall.detail || result.summary || '') + '</div>';
  }
  var claims = Array.isArray(result.claims) ? result.claims : [];
  out += claims.map(function (c) {
    var sources = Array.isArray(c.sources) ? c.sources.map(function (s) {
      return '<a class="src-link" href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(s.title || s.url) + '</a>';
    }).join('') : '';
    return '<div class="claim-item"><div class="claim-text">' + badge(c.verdict, verdictLabel(c.verdict)) + ' &nbsp;' + esc(c.text) +
      '</div><div class="claim-expl">' + esc(c.explanation || '') + '</div>' + sources + '</div>';
  }).join('');
  if (!claims.length) out += '<div class="empty">추출된 주장이 없어요.</div>';
  return out;
}

function renderChatTurns(turns) {
  if (!turns || !turns.length) return '<div class="empty">대화 내용이 없어요.</div>';
  return turns.map(function (t) {
    return '<div class="bubble ' + (t.role === 'user' ? 'user' : 'assistant') + '"><div class="bubble-role">' + (t.role === 'user' ? '사용자' : '유메') + '</div>' + esc(t.content) + '</div>';
  }).join('');
}

async function loadDashboard() {
  var key = document.getElementById("keyInput").value.trim();
  var errEl = document.getElementById("gateError");
  errEl.textContent = "";
  if (!key) { errEl.textContent = "관리자 키를 입력해주세요."; return; }
  try {
    var res = await fetch("/api/admin/stats", { headers: { "X-Admin-Key": key } });
    if (res.status === 401) { errEl.textContent = "관리자 키가 올바르지 않아요."; return; }
    var data = await res.json();
    localStorage.setItem("yume_admin_key", key);
    render(data);
    document.getElementById("gate").style.display = "none";
    document.getElementById("dashboard").style.display = "block";
  } catch (e) {
    errEl.textContent = "불러오는 중 오류가 발생했어요.";
  }
}

async function refresh() {
  var key = localStorage.getItem("yume_admin_key");
  if (!key) return;
  try {
    var res = await fetch("/api/admin/stats", { headers: { "X-Admin-Key": key } });
    if (!res.ok) return;
    render(await res.json());
  } catch (e) {}
}

function render(data) {
  document.getElementById("ts").textContent = "마지막 갱신: " + fmtTime(data.generatedAt);

  document.getElementById("statCards").innerHTML = [
    statCard("웹 무료 사용자", data.website.webUsers, "IP 기준"),
    statCard("오늘 무료 확인 횟수", data.website.totalFreeUsedToday, "/일 " + data.website.freeDailyLimit + "회 한도"),
    statCard("웹 보유 토큰 합계", data.website.totalTokens + "개", (data.website.totalTokens * data.website.tokenPriceKrw).toLocaleString() + "원 상당"),
    statCard("대화 진행중 사용자", data.chats.activeUsers, data.chats.totalTurns + "턴 누적 (웹+카카오)"),
    statCard("발급된 API 키", data.apiKeys.list.length, "일일 한도 " + data.apiKeys.dailyLimit + "회"),
    statCard("검증 결과 저장", data.results.total, "대기 " + data.results.pending + " · 완료 " + data.results.done + " · 오류 " + data.results.error),
    statCard("캐시된 검증", data.cache.size, "최대 " + data.cache.maxEntries + "건"),
    statCard("오류 로그", data.errors.length, "최근 " + data.errors.length + "건 기록"),
  ].join("");

  var webBody = document.querySelector("#webTable tbody");
  webBody.innerHTML = data.website.top.length ? data.website.top.map(function (u) {
    return "<tr><td>" + badge(u.type, u.type === "web" ? "웹" : "카카오") + "</td><td>" + esc(u.id) + "</td><td>" + u.freeUsedToday + "</td><td>" + u.tokens + "</td></tr>";
  }).join("") : "";
  if (!data.website.top.length) webBody.innerHTML = '<tr><td colspan="4" class="empty">아직 사용 기록이 없어요.</td></tr>';

  var keyBody = document.querySelector("#apiKeyTable tbody");
  keyBody.innerHTML = data.apiKeys.list.length ? data.apiKeys.list.map(function (k) {
    return "<tr><td>" + esc(k.label) + "</td><td><code>" + esc(k.maskedKey) + "</code></td><td>" + fmtTime(k.createdAt) + "</td><td>" + k.dailyCount + "</td><td>" + k.requestCount + "</td></tr>";
  }).join("") : "";
  if (!data.apiKeys.list.length) keyBody.innerHTML = '<tr><td colspan="5" class="empty">아직 발급된 키가 없어요.</td></tr>';

  var chatBody = document.querySelector("#chatTable tbody");
  chatBody.innerHTML = data.chats.list.length ? data.chats.list.map(function (c) {
    return "<tr><td>" + badge(c.type, c.type === "web" ? "웹" : "카카오") + "</td><td>" + esc(c.userId) + "</td><td>" + c.turns.length + "</td><td>" + fmtTime(c.lastActiveAt) + "</td></tr>" +
      "<tr><td colspan='4' style='padding:0;border:none;'><details class='row-detail'><summary>대화 내용 보기</summary><div class='detail-body'>" + renderChatTurns(c.turns) + "</div></details></td></tr>";
  }).join("") : "";
  if (!data.chats.list.length) chatBody.innerHTML = '<tr><td colspan="4" class="empty">아직 대화가 없어요.</td></tr>';

  var resultsBody = document.querySelector("#resultsTable tbody");
  resultsBody.innerHTML = data.results.recent.length ? data.results.recent.map(function (r) {
    var sourceLabel = r.source === "web" ? "웹" : r.source && r.source.indexOf("kakao") === 0 ? "카카오" : r.source && r.source.indexOf("api:") === 0 ? "API (" + r.source.slice(4) + ")" : (r.source || "-");
    return "<tr><td>" + badge(r.status, r.status === "done" ? "완료" : r.status === "pending" ? "대기" : "오류") + "</td><td>" + esc(sourceLabel) + "</td>" +
      "<td>" + esc((r.input || "").slice(0, 60)) + ((r.input || "").length > 60 ? "…" : "") + "</td><td>" + fmtTime(r.createdAt) + "</td></tr>" +
      "<tr><td colspan='4' style='padding:0;border:none;'><details class='row-detail'><summary>원문·전체 판정 보기</summary><div class='detail-body'>" +
      "<div class='input-block'>" + esc(r.input || '') + "</div>" + renderClaims(r.result) + "</div></details></td></tr>";
  }).join("") : "";
  if (!data.results.recent.length) resultsBody.innerHTML = '<tr><td colspan="4" class="empty">아직 검증 요청이 없어요.</td></tr>';

  var cacheBody = document.querySelector("#cacheTable tbody");
  cacheBody.innerHTML = data.cache.recent.length ? data.cache.recent.map(function (c) {
    return "<tr><td>" + esc(c.domain || "-") + "</td><td>" + esc((c.input || "").slice(0, 60)) + ((c.input || "").length > 60 ? "…" : "") + "</td><td>" + fmtTime(c.cachedAt) + "</td></tr>" +
      "<tr><td colspan='3' style='padding:0;border:none;'><details class='row-detail'><summary>원문·전체 판정 보기</summary><div class='detail-body'>" +
      "<div class='input-block'>" + esc(c.input || '') + "</div>" + renderClaims(c.result) + "</div></details></td></tr>";
  }).join("") : "";
  if (!data.cache.recent.length) cacheBody.innerHTML = '<tr><td colspan="3" class="empty">아직 캐시된 검증이 없어요.</td></tr>';

  var errorBody = document.querySelector("#errorTable tbody");
  errorBody.innerHTML = data.errors.length ? data.errors.map(function (e) {
    return "<tr><td><code>" + esc(e.source) + "</code></td><td>" + esc(e.message) + "</td><td>" + fmtTime(e.at) + "</td></tr>";
  }).join("") : "";
  if (!data.errors.length) errorBody.innerHTML = '<tr><td colspan="3" class="empty">기록된 오류가 없어요.</td></tr>';
}

(function () {
  var saved = localStorage.getItem("yume_admin_key");
  if (saved) {
    document.getElementById("keyInput").value = saved;
    loadDashboard();
  }
  document.getElementById("keyInput").addEventListener("keydown", function (e) {
    if (e.key === "Enter") loadDashboard();
  });
})();
</script>
</body>
</html>`;
}
