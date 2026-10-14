// 대표 작업 리스트(/admin/work) — 감사 주문이 들어오면 여기에 이름이 올라온다.
// 마감이 가까운 것부터, 손댈 버튼만 둔다. 데이터는 /api/admin/b2b/work(workList.js).
import { esc } from "./renderPages.js";
import { AUDIT_LEAD } from "./apiRates.js";
import { SHEET_CSS } from "./renderB2bPages.js";

const CSS = `${SHEET_CSS}
.wrap { max-width:980px; margin:0 auto; padding:20px 16px 60px; }
.top { display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap; }
.top h1 { margin:0; font-size:22px; }
.top a { color:var(--accent); font-weight:700; text-decoration:none; font-size:14px; }
.kpis { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:10px; margin:14px 0 4px; }
.kpi { background:#fff; border-radius:12px; padding:12px 14px; }
.kpi .v { font-size:26px; font-weight:800; font-variant-numeric:tabular-nums; }
.kpi .l { font-size:12.5px; color:var(--ink2); }
.kpi.alert .v { color:var(--fail); }
h2.sec { font-size:16px; margin:22px 0 4px; display:flex; gap:8px; align-items:baseline; flex-wrap:wrap; }
h2.sec small { font-size:12.5px; color:var(--ink3); font-weight:500; }
.row { background:#fff; border-radius:12px; padding:14px 16px; margin-top:8px; display:grid; gap:6px; border-left:5px solid transparent; }
.row.overdue { border-left-color:var(--fail); } .row.soon { border-left-color:#d99a00; } .row.ok { border-left-color:var(--ok); }
.row .h { display:flex; justify-content:space-between; gap:10px; flex-wrap:wrap; align-items:baseline; }
.row .h b { font-size:15.5px; }
.due { font-size:13px; font-weight:800; padding:2px 10px; border-radius:99px; background:var(--soft); color:var(--accent); white-space:nowrap; }
.row.overdue .due { background:#fde7df; color:var(--fail); } .row.soon .due { background:#fff3d6; color:#8a5a00; }
.meta { font-size:13px; color:var(--ink2); line-height:1.7; overflow-wrap:anywhere; }
.meta a { color:var(--accent); }
.acts { display:flex; gap:8px; flex-wrap:wrap; }
.btn.sm { padding:7px 12px; font-size:13px; }
.empty { background:#fff; border-radius:12px; padding:16px; margin-top:8px; color:var(--ink3); font-size:13.5px; }
`;

const SCRIPT = `
(function(){
  var won = function(n){ return Number(n).toLocaleString('ko-KR') + '원'; };
  var esc = function(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); };
  var day = function(t){ if (!t) return ''; var d = new Date(Number(t) + 9*3600000); return (d.getUTCMonth()+1) + '/' + d.getUTCDate(); };
  async function api(path, body){
    var r = await fetch('/api/admin/b2b' + path, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' });
    var d = await r.json().catch(function(){ return {}; });
    if (!r.ok) throw new Error(d.error || '실패했어요');
    return d;
  }
  function dueText(c){
    if (!c.due_at) return '마감 없음';
    if (c.overdue) return '마감 지남 · ' + c.dueLabel;
    return (c.daysLeft === 0 ? '오늘 마감' : '영업일 ' + c.daysLeft + '일 남음') + ' · ' + c.dueLabel;
  }
  function svc(c){
    if (!c.service) return '';
    return '<div class="meta">감사 대상: <b>' + esc(c.service) + '</b>' + (c.domain ? ' · ' + esc(c.domain) : '') +
      (c.serviceUrl ? ' · <a href="' + esc(c.serviceUrl) + '" target="_blank" rel="noopener">' + esc(c.serviceUrl) + '</a>' : '') +
      (c.access ? '<br/>접근: ' + esc(c.access) : '') + (c.focus ? '<br/>중점: ' + esc(c.focus) : '') + '</div>';
  }
  function auditRow(c){
    var cls = c.overdue ? 'overdue' : (c.daysLeft != null && c.daysLeft <= 1 ? 'soon' : 'ok');
    return '<div class="row ' + cls + '">' +
      '<div class="h"><b>' + esc(c.company) + '</b><span class="due">' + esc(dueText(c)) + '</span></div>' +
      '<div class="meta">' + esc(c.productLabel) + (c.rounds > 1 ? ' · ' + (c.roundsDone + 1) + '/' + c.rounds + '회차' : '') + ' · ' + won(c.supply_krw) + '(공급가) · ' + esc(c.number) + ' · 입금 ' + day(c.paid_at) + ' · ' + esc(c.contact) + '</div>' +
      svc(c) +
      '<div class="acts">' +
        (c.audit_id ? '<a class="btn sm" href="/admin/audits#' + c.audit_id + '">감사 열기</a>' : '') +
        '<a class="btn ghost sm" href="' + esc(c.url) + '" target="_blank" rel="noopener">주문서</a>' +
        '<button class="btn ghost sm" type="button" data-done="' + c.id + '">보고서 보냄</button>' +
      '</div></div>';
  }
  function payRow(c){
    return '<div class="row soon">' +
      '<div class="h"><b>' + esc(c.company) + '</b><span class="due">신청 ' + (c.waitingDays ? c.waitingDays + '일 전' : '오늘') + '</span></div>' +
      '<div class="meta">' + esc(c.kind === 'audit' ? c.productLabel : 'API · ' + c.number) + ' · 합계 <b>' + won(c.total_krw) + '</b> · ' + esc(c.payMethod === 'card' ? '법인카드(결제 링크 보내기)' : '계좌이체') + ' · ' + esc(c.number) + ' · ' + esc(c.contact) + '</div>' +
      svc(c) +
      '<div class="acts"><button class="btn sm" type="button" data-paid="' + c.id + '">입금 확인</button><a class="btn ghost sm" href="' + esc(c.url) + '" target="_blank" rel="noopener">주문서</a><a class="btn ghost sm" href="/admin/deals">세금계산서 정보</a></div></div>';
  }
  function plainRow(c, note){
    return '<div class="row">' +
      '<div class="h"><b>' + esc(c.company) + '</b><span class="due">' + esc(note) + '</span></div>' +
      '<div class="meta">' + esc(c.kind === 'api' ? 'API' : c.productLabel) + ' · ' + won(c.total_krw) + ' · ' + esc(c.number) + ' · ' + esc(c.contact) + '</div>' + svc(c) +
      '<div class="acts"><a class="btn ghost sm" href="' + esc(c.url) + '" target="_blank" rel="noopener">견적서</a>' + (c.audit_id ? '<a class="btn ghost sm" href="/admin/audits#' + c.audit_id + '">감사 열기</a>' : '') + '</div></div>';
  }
  function section(title, hint, rows, empty){
    return '<h2 class="sec">' + esc(title) + ' <small>' + esc(hint) + '</small></h2>' + (rows.length ? rows.join('') : '<div class="empty">' + esc(empty) + '</div>');
  }
  async function load(){
    var box = document.getElementById('list');
    try {
      var w = await api('/work');
      var overdue = w.now.filter(function(c){ return c.overdue; }).length;
      document.getElementById('kpis').innerHTML =
        '<div class="kpi' + (overdue ? ' alert' : '') + '"><div class="v">' + w.now.length + '</div><div class="l">지금 할 감사' + (overdue ? ' · 마감 지남 ' + overdue : '') + '</div></div>' +
        '<div class="kpi"><div class="v">' + w.pay.length + '</div><div class="l">입금 확인 기다림</div></div>' +
        '<div class="kpi"><div class="v">' + w.later.length + '</div><div class="l">예정된 정기 감사</div></div>' +
        '<div class="kpi"><div class="v">' + w.quoted.length + '</div><div class="l">견적만 받은 곳(30일)</div></div>';
      box.innerHTML =
        section('지금 할 감사', '마감 빠른 순', w.now.map(auditRow), '할 감사가 없습니다.') +
        section('입금 대기', '입금(카드 결제)을 확인하면 감사가 시작됩니다', w.pay.map(payRow), '기다리는 신청이 없습니다.') +
        section('예정된 정기 감사', '다음 회차 마감 2주 전에 위로 올라옵니다', w.later.map(function(c){ return plainRow(c, '다음 회차 ' + (c.dueLabel || '')); }), '예정된 회차가 없습니다.') +
        section('견적만 받은 곳', '신청 전 · 연락해 볼 후보', w.quoted.map(function(c){ return plainRow(c, '견적만'); }), '최근 30일 견적이 없습니다.') +
        section('최근 보낸 보고서', '30일', w.done.map(function(c){ return plainRow(c, '완료'); }), '아직 없습니다.');
    } catch (e) { box.innerHTML = '<div class="empty">' + esc(e.message) + '</div>'; }
  }
  document.addEventListener('click', async function(e){
    var t = e.target.closest('[data-paid],[data-done]');
    if (!t) return;
    if (t.dataset.paid) {
      if (!confirm('입금(카드 결제)을 확인 처리할까요? 감사 주문이면 감사 데스크에 감사 건이 생기고 마감이 잡힙니다. 고객에게 확인 메일이 갑니다.')) return;
      try { var r = await api('/quotes/' + t.dataset.paid + '/paid', {}); if (r.auditId) location.href = '/admin/audits#' + r.auditId; else load(); } catch (err) { alert(err.message); }
    }
    if (t.dataset.done) {
      if (!confirm('이 감사의 보고서를 보냈다고 표시할까요? (보고서 링크 발송은 감사 데스크에서)')) return;
      try { await api('/quotes/' + t.dataset.done + '/delivered', {}); load(); } catch (err) { alert(err.message); }
    }
  });
  load();
})();`;

export function renderWorkPage() {
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" /><title>작업 리스트 · 유메 관리자</title>
<style>${CSS}</style></head>
<body><div class="wrap">
  <div class="top"><h1>작업 리스트</h1><span><a href="/admin/staff">AI 본사</a> · <a href="/admin/deals">기업 거래</a> · <a href="/admin/audits">감사 데스크</a> · <a href="/admin">관리자</a></span></div>
  <p class="meta">감사 주문은 고객이 감사 신청을 하면 <b>입금 대기</b>에 올라오고, <b>입금 확인</b>을 누르면 감사 데스크에 그 회사 감사 건이 생기면서 <b>지금 할 감사</b>로 옮겨 갑니다. 마감은 입금 확인 + 영업일 3일(고객 안내: ${esc(AUDIT_LEAD)}). 보고서를 보냈으면 <b>보고서 보냄</b>.</p>
  <div class="kpis" id="kpis"></div>
  <div id="list"><div class="empty">불러오는 중…</div></div>
</div>
<script>${SCRIPT}</script></body></html>`;
}
