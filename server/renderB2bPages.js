// 기업 거래 페이지 — 견적서(/b2b/quote/:token), 계약 문서(/b2b/terms·dpa·security), 운영자 화면(/admin/deals).
//
// 견적서는 구매 담당자가 결재에 그대로 붙이는 문서다. 그래서 화면이 곧 A4 한 장이고, 인쇄하면 버튼과
// 신청서는 빠지고 견적서만 남는다. 공급자 정보는 사이트 하단과 같은 값(COMPANY)을 쓴다 — 두 벌로 두면
// 주소를 옮길 때 한쪽만 바뀐다.
//
// 계약 문서는 "표준본"이다. 실제로 하는 일만 적는다 — 보관 기간·위탁·국외 이전은 개인정보처리방침과
// 같은 값이고, 받지 않은 인증이나 지키지 못할 수치(SLA)는 적지 않는다.
import { COMPANY, COMPLAINT_NOTICE, complaintOfficer, businessLine, esc, layout, VERILINE } from "./renderPages.js";
import { API_RATES, API_UNIT_CHARS, AUDIT_LEAD, AUDIT_RATES } from "./apiRates.js";
import { kstDate } from "./businessDays.js";
import { siteOrigin } from "./site.js";
import { canIssueTaxInvoice } from "./receiptInfo.js";
// 견적서 결제 줄의 증빙 표시 — 일반과세 시작 전에는 세금계산서를 약속하지 않는다(2026-10-29).
const proofLabel = () => (canIssueTaxInvoice() ? "전자세금계산서 발급" : "지출증빙 현금영수증 발급 · 일반과세 전환 뒤 세금계산서");
import {
  DESK_PRODUCTS,
  isAuditProduct,
  parseOrder,
  PAY_METHODS,
  QUOTE_VALID_DAYS,
  SELF_PRODUCTS,
  STATUS_LABEL,
  TERMS_VERSION,
  isExpired,
  parseBilling,
  parseItems,
  quoteNumber,
  payMethodsOffered,
  cardEnabled,
} from "./b2bDeals.js";

const won = (n) => `${Number(n).toLocaleString("ko-KR")}원`;
const kdate = (t) => {
  const d = new Date(Number(t) + 9 * 3600_000);
  return `${d.getUTCFullYear()}년 ${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`;
};
const bankAccount = () => String(process.env.B2B_BANK_ACCOUNT || "").trim();
const productLabel = (key) => SELF_PRODUCTS[key]?.label || DESK_PRODUCTS[key] || key;

export const SHEET_CSS = `
:root { --ink:#0F1522; --ink2:#4f4960; --ink3:#857e98; --line:#e2dcec; --soft:#f6f3fb; --accent:#2F6BFF; --ok:#2f7d5b; --fail:#c2410c; --ground:#eeeaf4; }
* { box-sizing:border-box; }
body { margin:0; background:var(--ground); color:var(--ink); font-family:-apple-system,BlinkMacSystemFont,'Noto Sans KR','Pretendard Variable','Malgun Gothic',sans-serif; word-break:keep-all; }
.bar { max-width:820px; margin:0 auto; padding:18px 16px 0; display:flex; gap:8px; justify-content:space-between; align-items:center; flex-wrap:wrap; }
.bar a { color:var(--accent); text-decoration:none; font-weight:700; font-size:14px; }
.btn { display:inline-flex; align-items:center; gap:6px; padding:10px 16px; border-radius:999px; border:0; background:var(--accent); color:#fff; font:inherit; font-size:14px; font-weight:650; cursor:pointer; text-decoration:none; }
.btn.ghost { background:rgba(47, 107, 255,.1); color:var(--accent); }
.sheet { max-width:820px; margin:14px auto 0; background:#fff; padding:clamp(22px,5vw,48px); border-radius:6px; box-shadow:0 10px 40px rgba(20, 35, 80,.08); }
.head { display:flex; justify-content:space-between; gap:16px; align-items:flex-end; border-bottom:2.5px solid var(--ink); padding-bottom:12px; flex-wrap:wrap; }
.head h1 { margin:0; font-size:28px; letter-spacing:.32em; font-weight:800; }
.head .no { text-align:right; font-size:12.5px; color:var(--ink2); line-height:1.7; font-variant-numeric:tabular-nums; }
.parties { display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-top:16px; }
@media (max-width:620px) { .parties { grid-template-columns:1fr; } }
.party { border:1px solid var(--line); border-radius:8px; padding:12px 14px; font-size:13px; line-height:1.75; }
.party .k { font-size:11px; font-weight:750; letter-spacing:.12em; color:var(--accent); margin-bottom:4px; }
.party b { font-size:15px; }
.sum { margin-top:16px; background:var(--soft); border-radius:8px; padding:12px 14px; display:flex; justify-content:space-between; align-items:baseline; gap:10px; flex-wrap:wrap; }
.sum .l { font-size:13px; color:var(--ink2); }
.sum .v { font-size:24px; font-weight:800; letter-spacing:-.02em; font-variant-numeric:tabular-nums; }
.tablewrap { overflow-x:auto; margin-top:14px; }
table.items { width:100%; border-collapse:collapse; font-size:13px; min-width:520px; }
table.items th { text-align:left; font-size:11.5px; color:var(--ink3); font-weight:700; border-bottom:1.5px solid var(--ink); padding:7px 6px; }
table.items td { border-bottom:1px solid var(--line); padding:9px 6px; vertical-align:top; }
table.items td.n, table.items th.n { text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; }
table.items .spec { color:var(--ink3); font-size:12px; }
table.tot { margin-left:auto; margin-top:8px; border-collapse:collapse; font-size:13.5px; min-width:260px; }
table.tot td { padding:5px 6px; font-variant-numeric:tabular-nums; }
table.tot td.n { text-align:right; }
table.tot tr.g td { border-top:1.5px solid var(--ink); font-weight:800; font-size:15px; }
.terms { margin-top:18px; font-size:12.5px; color:var(--ink2); line-height:1.8; }
.terms ol { margin:4px 0 0; padding-left:18px; }
.stamp { margin-top:18px; font-size:12px; color:var(--ink3); border-top:1px solid var(--line); padding-top:10px; line-height:1.7; }
.state { max-width:820px; margin:14px auto 0; background:#fff; border-radius:12px; padding:18px 20px; font-size:14px; line-height:1.75; }
.state h2 { margin:0 0 6px; font-size:18px; }
.state.ok { border-left:5px solid var(--ok); } .state.warn { border-left:5px solid var(--fail); }
form.req { max-width:820px; margin:14px auto 60px; background:#fff; border-radius:12px; padding:20px clamp(16px,4vw,28px); display:grid; gap:14px; }
form.req h2 { margin:0; font-size:19px; }
form.req p.lede { margin:0; font-size:13.5px; color:var(--ink2); line-height:1.7; }
.grid2 { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:12px; }
label.f { display:grid; gap:5px; font-size:13px; font-weight:650; color:var(--ink2); }
label.f input, label.f select { width:100%; padding:10px 12px; border-radius:9px; border:1px solid #d6cce8; font:inherit; font-size:14.5px; color:var(--ink); background:#fff; }
label.f small { font-weight:400; color:var(--ink3); font-size:12px; }
.radio { display:grid; gap:8px; }
.radio label { display:flex; gap:8px; align-items:flex-start; font-size:14px; padding:10px 12px; border:1px solid var(--line); border-radius:9px; cursor:pointer; }
.agree { display:flex; gap:8px; align-items:flex-start; font-size:13.5px; line-height:1.6; }
.agree a { color:var(--accent); }
.msg { font-size:13.5px; min-height:20px; } .msg.err { color:var(--fail); }
:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
pre.copy { white-space:pre-wrap; background:var(--soft); border-radius:8px; padding:12px; font-size:12.5px; line-height:1.7; }
@media print {
  body { background:#fff; }
  .bar, .state, form.req, .noprint { display:none !important; }
  .sheet { box-shadow:none; margin:0; max-width:none; padding:0; border-radius:0; }
  @page { size:A4; margin:16mm; }
}
`;

function sheetPage(title, body, script = "") {
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>${esc(title)} · 베리라인</title><style>${SHEET_CSS}</style></head>
<body>${body}${script}</body></html>`;
}

/**
 * API 상품의 키 안내 — 입금(계약) 확인 때 서버가 "고객 이메일과 같은 계정의 가장 최근 키"에 월 한도를 건다.
 * 개발팀이 다른 이메일로 가입하면 한도가 걸리지 않으니, 어떤 이메일로 어디서 키를 받는지 화면에 박아 둔다.
 */
function apiKeyHelp(q, billing) {
  if (isAuditProduct(q.product)) return "";
  const mail = q.email || billing?.taxEmail || "";
  const main = siteOrigin();
  return `<br/><br/><b>API 키 받기</b> — 개발팀이 <a href="${esc(main)}/?open=api">베리라인 개발자 키 발급</a>에서 <b>${esc(mail)}</b>로 가입해 키를 받아 두세요. 입금(계약)이 확인되면 그 계정의 키에 이 계약의 월 한도가 자동으로 걸립니다. 연결 방법: <a href="${esc(main)}/docs/api">API 문서</a>`;
}

/** 견적서 + (발행 상태면) 계약 신청서. */
export function renderQuotePage(q) {
  const items = parseItems(q);
  const billing = parseBilling(q);
  const expired = isExpired(q);
  const no = quoteNumber(q);
  const bank = bankAccount();
  const isMetered = q.product === "metered";
  const isAudit = isAuditProduct(q.product);
  const order = parseOrder(q);

  const sheet = `
<article class="sheet" aria-label="견적서">
  <div class="head">
    <h1>견 적 서</h1>
    <div class="no">견적번호 <b>${esc(no)}</b><br/>견적일 ${kdate(q.created_at)}<br/>유효기간 ${kdate(q.valid_until)}까지 (${QUOTE_VALID_DAYS}일)</div>
  </div>
  <div class="parties">
    <div class="party">
      <div class="k">수신</div>
      <b>${esc(q.company)}</b> 귀하<br/>
      ${q.contact_name ? `담당 ${esc(q.contact_name)}<br/>` : ""}${q.email ? `${esc(q.email)}<br/>` : ""}
      아래와 같이 견적합니다.
    </div>
    <div class="party">
      <div class="k">공급자</div>
      <b>${esc(COMPANY.name)}</b> · 대표 ${esc(COMPANY.ceo)}<br/>
      사업자등록번호 ${esc(COMPANY.regNo)}<br/>
      ${esc(COMPANY.address)}<br/>
      ${esc(COMPANY.tel)} · ${esc(VERILINE.email)}
    </div>
  </div>
  <div class="sum"><span class="l">합계 금액 (공급가액 + 부가세)</span><span class="v">${won(q.total_krw)}</span></div>
  <div class="tablewrap"><table class="items">
    <thead><tr><th>품목</th><th class="n">수량</th><th class="n">단가</th><th class="n">공급가액</th></tr></thead>
    <tbody>${items.map((it) => `<tr><td>${esc(it.name)}${it.spec ? `<div class="spec">${esc(it.spec)}</div>` : ""}</td><td class="n">${Number(it.qty).toLocaleString("ko-KR")}${esc(it.unit)}</td><td class="n">${won(it.unitKrw)}</td><td class="n">${won(it.amountKrw)}</td></tr>`).join("")}</tbody>
  </table></div>
  <table class="tot">
    <tr><td>공급가액</td><td class="n">${won(q.supply_krw)}</td></tr>
    <tr><td>부가세 (10%)</td><td class="n">${won(q.vat_krw)}</td></tr>
    <tr class="g"><td>합계</td><td class="n">${won(q.total_krw)}</td></tr>
  </table>
  ${order ? `<div class="party" style="margin-top:14px">
    <div class="k">감사 대상</div>
    <b>${esc(order.serviceName)}</b> · ${esc(order.domain)}<br/>
    ${esc(order.serviceUrl)}${order.access ? `<br/>접근: ${esc(order.access)}` : ""}${order.focus ? `<br/>중점: ${esc(order.focus)}` : ""}
  </div>` : ""}
  <div class="terms">
    <b>조건</b>
    <ol>
      ${isAudit
        ? `<li>결제: 계좌이체(${proofLabel()})${cardEnabled() ? " 또는 법인카드" : ""}. 입금 확인 후 <b>${esc(AUDIT_LEAD)}</b> 안에 비공개 감사 보고서를 보냅니다. 로그인이 필요한 서비스는 테스트 계정을 받은 날부터 셉니다.</li>
      <li>감사는 일반 사용자로서 서비스에 질문을 넣고, 베리라인이 원문과 대조한 뒤 사람이 공식 원문으로 재확인한 오류만 보고서에 담습니다. 자동으로 대량 질의하지 않습니다.</li>
      <li>착수 전에 취소하면 전액 환불합니다. 보고서는 귀사에만 드리며, 회사 이름은 서면 동의가 있을 때만 공개합니다.</li>`
        : isMetered
        ? `<li>종량제는 후불입니다. 수량은 예상 월 호출 수이며, 매달 말일까지의 실제 사용량 × 단가로 정산해 다음 달 10일까지 전자세금계산서를 발급합니다. 예상 물량을 월 상한으로 설정하고, 늘릴 때는 알려 주시면 됩니다.</li>`
        : `<li>결제: 계좌이체(${proofLabel()})${cardEnabled() ? " 또는 법인카드" : ""}. 월 약정은 매달 선결제이며, 쓰지 않은 호출은 다음 달로 넘어가지 않습니다.</li>`}
      ${isAudit ? "" : `<li>보낸 글 ${API_UNIT_CHARS.toLocaleString("ko-KR")}자마다 1건으로 셉니다. 처리하지 못하고 실패한 건은 세지 않고, 같은 요청을 다시 보내도 멱등 키로 두 번 과금되지 않습니다.</li>`}
      <li>서비스 조건은 <b>베리라인 기업 서비스 이용 조건</b>(${esc(TERMS_VERSION)})과 <b>데이터 처리 부속서</b>를 따르며, 귀사 계약서 양식으로 진행할 수도 있습니다.</li>
      <li>베리라인의 판정은 검증 시점의 공개 원문으로 확인한 기록이며, 서비스 품질 보증이나 법률·의료·금융 자문이 아닙니다.</li>
    </ol>
  </div>
  <div class="stamp">${businessLine()}<br/>${esc(COMPLAINT_NOTICE)} ${esc(complaintOfficer())}</div>
</article>`;

  let tail = "";
  if (q.status === "cancelled") {
    tail = `<section class="state warn"><h2>취소된 견적입니다</h2>새 견적이 필요하시면 <a href="${esc(VERILINE.site)}/#pricing">베리라인</a>에서 다시 받거나 ${esc(VERILINE.email)}로 알려 주세요.</section>`;
  } else if (q.status === "paid" && isAudit) {
    const done = Number(q.rounds_done || 0);
    tail = `<section class="state ok"><h2>${done ? "감사 보고서를 보냈습니다" : "감사를 진행하고 있습니다"}</h2>
      ${esc(kdate(q.paid_at))} 입금 확인.${done
        ? ` 보고서는 ${esc(kdate(q.delivered_at))}에 ${esc(billing?.taxEmail || q.email || "담당자 이메일")}로 보냈습니다.${q.due_at && Number(q.due_at) > Number(q.delivered_at) ? ` 다음 정기 감사는 ${esc(kstDate(q.due_at))} 무렵입니다.` : ""}`
        : ` 보고서는 <b>${q.due_at ? esc(kstDate(q.due_at)) : esc(AUDIT_LEAD)}까지</b> 보내 드립니다. 로그인이 필요한 서비스라면 테스트 계정을 ${esc(VERILINE.email)}로 보내 주세요.`}
      전자세금계산서는 ${esc(billing?.taxEmail || "등록하신 이메일")}로 발급됩니다.</section>`;
  } else if (q.status === "paid") {
    tail = `<section class="state ok"><h2>${isMetered ? "계약이 확정됐습니다" : "입금이 확인됐습니다"}</h2>${esc(kdate(q.paid_at))} 확인. 전자세금계산서는 ${esc(billing?.taxEmail || "등록하신 이메일")}로 발급됩니다. 문의: ${esc(VERILINE.email)}${apiKeyHelp(q, billing)}</section>`;
  } else if (q.status === "requested") {
    tail = `<section class="state ok"><h2>계약 신청이 접수됐습니다</h2>
      ${esc(kdate(q.requested_at))} 접수 · 결제 방법: ${esc(PAY_METHODS[q.pay_method] || "-")}<br/>
      ${q.pay_method === "transfer"
        ? isMetered
          ? "종량제는 후불이라 지금 입금하실 것은 없습니다. 이용을 시작하면 매달 사용량으로 세금계산서를 발급합니다."
          : bank
            ? `입금 계좌: <b>${esc(bank)}</b> · 입금자명에 견적번호 <b>${esc(no)}</b> 또는 회사명을 적어 주세요. 입금이 확인되면 전자세금계산서를 발급하고 ${isAudit ? "감사를 시작합니다" : "이용을 시작합니다"}.`
            : `입금 계좌는 영업일 하루 안에 ${esc(billing?.taxEmail || q.email || "담당자 이메일")}로 보내 드립니다.`
        : "법인카드 결제 링크를 영업일 하루 안에 보내 드립니다."}
      ${isAudit ? `<br/>입금이 확인되면 <b>${esc(AUDIT_LEAD)}</b> 안에 감사 보고서를 보내 드립니다.` : apiKeyHelp(q, billing)}
      <div class="noprint" style="margin-top:8px;font-size:12.5px;color:#857e98">이 주소를 즐겨찾기해 두시면 진행 상태를 언제든 확인할 수 있습니다.</div></section>`;
  } else if (expired) {
    tail = `<section class="state warn"><h2>유효기간이 지난 견적입니다</h2>같은 조건으로 <a href="${esc(VERILINE.site)}/#pricing">새 견적</a>을 받아 주세요.</section>`;
  } else {
    tail = `
<form class="req" id="req" novalidate>
  <h2>이 견적으로 ${isAudit ? "감사" : "계약"} 신청</h2>
  <p class="lede">증빙(전자세금계산서 · 현금영수증) 발급에 쓰는 정보입니다. 사업자등록증에 적힌 그대로 적어 주세요. 신청하면 담당자 이메일로 다음 단계를 보내 드리고, 이 페이지에서도 진행 상태를 볼 수 있습니다.</p>
  <div class="grid2">
    <label class="f">사업자등록번호 *<input id="bizNo" name="bizNo" inputmode="numeric" autocomplete="off" placeholder="000-00-00000" required /></label>
    <label class="f">상호 *<input id="bizName" name="bizName" value="${esc(q.company)}" required /></label>
    <label class="f">대표자 성명 *<input id="ceo" name="ceo" required /></label>
    <label class="f">세금계산서 받을 이메일 *<input id="taxEmail" name="taxEmail" type="email" value="${esc(q.email || "")}" required /></label>
  </div>
  <div class="grid2">
    <label class="f">사업장 주소 <small>선택</small><input id="address" name="address" /></label>
    <label class="f">업태 / 종목 <small>선택 · 예: 서비스 / 소프트웨어</small><input id="bizTypeItem" name="bizTypeItem" /></label>
    <label class="f">담당자 연락처 <small>선택</small><input id="contactPhone" name="contactPhone" inputmode="tel" /></label>
    <label class="f">귀사 발주(구매)번호 <small>있으면</small><input id="poNumber" name="poNumber" /></label>
  </div>
  <div class="radio" role="radiogroup" aria-label="결제 방법">
    ${Object.entries(payMethodsOffered()).map(([k, v], i) => `<label><input type="radio" name="payMethod" value="${k}" ${i === 0 ? "checked" : ""} /> <span>${esc(v)}${k === "transfer" && isMetered ? " — 매달 사용량으로 청구" : ""}</span></label>`).join("")}
  </div>
  <label class="agree"><input type="checkbox" id="agree" /> <span><a href="/b2b/terms" target="_blank" rel="noopener">베리라인 기업 서비스 이용 조건</a>과 <a href="/b2b/dpa" target="_blank" rel="noopener">데이터 처리 부속서</a>(${esc(TERMS_VERSION)})를 읽었고 동의합니다. 귀사 계약서로 진행하시려면 신청 후 메일로 보내 주세요.</span></label>
  <div><button class="btn" type="submit" id="send">${isAudit ? "감사 신청하기" : "계약 신청하기"}</button></div>
  <div class="msg" id="msg" role="status"></div>
</form>`;
  }

  const script = q.status === "issued" && !expired ? `<script>
(function(){
  var f = document.getElementById('req'); if (!f) return;
  var msg = document.getElementById('msg');
  f.addEventListener('submit', async function(e){
    e.preventDefault(); msg.className = 'msg'; msg.textContent = '';
    var v = function(id){ var el = document.getElementById(id); return el ? el.value.trim() : ''; };
    var ti = v('bizTypeItem').split('/');
    var body = { bizNo: v('bizNo'), bizName: v('bizName'), ceo: v('ceo'), taxEmail: v('taxEmail'), address: v('address'),
      bizType: (ti[0]||'').trim(), bizItem: (ti[1]||'').trim(), contactPhone: v('contactPhone'), poNumber: v('poNumber'),
      payMethod: (f.querySelector('input[name=payMethod]:checked')||{}).value, agree: document.getElementById('agree').checked };
    var btn = document.getElementById('send'); btn.disabled = true; btn.textContent = '보내는 중…';
    try {
      var r = await fetch('/api/b2b/quote/${esc(q.token)}/request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      var d = await r.json().catch(function(){ return {}; });
      if (!r.ok) throw new Error(d.error || '보내지 못했어요. 잠시 후 다시 시도해 주세요.');
      location.reload();
    } catch (err) { msg.className = 'msg err'; msg.textContent = err.message; btn.disabled = false; btn.textContent = '계약 신청하기'; }
  });
})();
</script>` : "";

  const bar = `<div class="bar"><a href="${esc(VERILINE.site)}">← 베리라인 기업용</a><span style="display:flex;gap:8px"><button class="btn ghost" type="button" onclick="window.print()">인쇄 · PDF 저장</button><span class="btn ghost" style="cursor:default">${esc(STATUS_LABEL[q.status] || q.status)}${expired ? " · 기간 만료" : ""}</span></span></div>`;
  return sheetPage(`견적서 ${no}`, bar + sheet + tail, script);
}

// ── 계약 문서(표준본) ─────────────────────────────────────────────

const docFoot = `<p class="muted">판: ${esc(TERMS_VERSION)} · 공급자 ${esc(COMPANY.name)}(대표 ${esc(COMPANY.ceo)}, 사업자등록번호 ${esc(COMPANY.regNo)}) · 이 문서는 표준본이며, 귀사 계약서 양식으로 진행하거나 조항을 협의할 수 있습니다. 함께 보기: <a href="/b2b/terms">기업 서비스 이용 조건</a> · <a href="/b2b/dpa">데이터 처리 부속서</a> · <a href="/b2b/security">보안·데이터 처리 설명서</a></p>`;

export function renderB2bTerms() {
  const t = API_RATES.tiers.map((x) => `${esc(x.label)} 월 ${won(x.monthlyKrw)}(${x.calls.toLocaleString("ko-KR")}건)`).join(", ");
  const a = Object.values(AUDIT_RATES).map((x) => `${esc(x.label)} ${won(x.krw)}`).join(", ");
  return layout("기업 서비스 이용 조건", `
<h1>베리라인 기업 서비스 이용 조건</h1>
<p class="muted">기업 고객이 견적서로 계약하는 서비스(검증 API 약정·종량제, 문서 검사, AI 감사, PoC)에 적용되는 표준 조건입니다.</p>

<h2>제1조 (적용 순서)</h2>
<p>개별 견적서·주문서에 적힌 내용이 이 조건보다 먼저이고, 이 조건에 없는 내용은 <a href="/terms">베리라인 이용약관</a>을 따릅니다. 귀사 계약서로 계약한 경우에는 그 계약서가 먼저입니다.</p>

<h2>제2조 (서비스)</h2>
<ol>
<li><b>검증 API·문서 검사</b>: 글 속 사실 주장을 떼어 내 공식 원문(법제처 국가법령정보 공동활용 API, DOI 레지스트리 등)과 공개 출처에 대조하고, 주장별 판정·근거·출처·원문 속 위치를 돌려줍니다.</li>
<li><b>AI 감사</b>: 귀사 AI 서비스를 일반 사용자로서 질문해 답변을 수집하고, 베리라인이 원문과 대조한 뒤 사람이 공식 원문으로 재확인한 오류만 담은 비공개 보고서를 드립니다. 자동으로 대량 질의하지 않습니다.</li>
<li>베리라인의 판정과 보고서는 검증 시점에 공개된 원문으로 확인한 <b>기록</b>입니다. 제10조의2의 범위를 넘어 서비스 품질이나 앞으로의 답변을 보증하지 않으며, 법률·의료·금융 자문이 아닙니다. 최종 판단과 규제 준수 책임은 귀사에 있습니다.</li>
<li>베리라인은 주장 추출·검색어 작성·고친 문장 제안에 생성형 AI(Anthropic Claude)를 씁니다. 판정은 원문과 출처 문장으로만 단정하고, 근거를 대지 못한 판정은 '확인되지 않음'으로 둡니다.</li>
</ol>

<h2>제3조 (계약의 성립)</h2>
<p>귀사가 견적서 화면에서 계약 신청을 하고 베리라인이 확인 메일을 보내면 계약이 성립합니다. 견적서의 유효기간은 발행일부터 ${QUOTE_VALID_DAYS}일입니다.</p>

<h2>제4조 (요금과 결제)</h2>
<ol>
<li>표시 금액은 부가가치세 별도입니다. API는 보낸 글 ${API_UNIT_CHARS.toLocaleString("ko-KR")}자마다 1건으로 셉니다. 공개 요금: 종량제 건당 ${won(API_RATES.metered.unitKrw)}, ${t}. AI 감사: ${a}. PoC·맞춤 물량은 견적서의 금액을 따릅니다.</li>
<li>결제는 계좌이체로 합니다. 법인카드 결제는 준비되면 견적서 화면에 표시하며, 카드로 결제한 건은 카드 매출전표가 증빙입니다. 계좌이체 건의 증빙은 전자세금계산서이고, 공급자가 일반과세로 전환하기 전의 공급분은 지출증빙 현금영수증으로 드립니다.</li>
<li><b>월 약정</b>은 매달 선결제이며 쓰지 않은 호출은 다음 달로 넘어가지 않습니다. <b>종량제</b>는 매달 말일까지의 실제 사용량으로 정산해 다음 달 10일까지 세금계산서를 발급합니다.</li>
<li>처리하지 못하고 실패한 호출은 세지 않습니다. 같은 멱등 키(Idempotency-Key)로 다시 보낸 요청은 한 번만 셉니다.</li>
</ol>

<h2>제5조 (한도)</h2>
<p>API 키에는 계약한 월 한도(건)가 걸립니다. 한도를 넘는 호출은 처리하지 않고 오류(quota_exceeded)로 돌려주며, 한도 증액을 요청하시면 다음 영업일까지 반영합니다. 분당 요청 한도는 공정 이용을 위한 장치이며 협의로 조정할 수 있습니다.</p>

<h2>제6조 (AI 감사 특칙)</h2>
<ol>
<li>감사 보고서는 입금(카드 결제) 확인 후 ${esc(AUDIT_LEAD)} 안에 보냅니다. 로그인이 필요한 서비스는 귀사가 테스트 계정을 보내 주신 날부터 셉니다. 정기 감사는 첫 보고서 뒤 분기마다 한 번씩 같은 방식으로 감사합니다.</li>
<li>감사 보고서는 귀사에만 비공개 링크로 드리고, 귀사가 요청하면 링크를 회수합니다.</li>
<li>귀사의 이름은 서면으로 동의한 경우에만 공개 감사 기록·배지·VERILINE 할루시네이션 지수에 싣습니다. 지수에는 그 밖에 업종 단위 익명 숫자로만 들어갑니다.</li>
<li>감사 결과는 질문한 기간의 표본 검사 기록입니다. 결과가 나쁘다고 빼거나, 좋게 내 달라는 대가를 받지 않습니다.</li>
</ol>

<h2>제7조 (데이터)</h2>
<p>귀사가 보낸 텍스트·파일·기준 자료의 처리는 <a href="/b2b/dpa">데이터 처리 부속서</a>를 따릅니다. 베리라인은 귀사가 보낸 글의 문장을 다른 고객의 결과나 조회에 보여 주지 않고, 귀사 데이터를 데이터셋으로 제공하거나 판매하지 않습니다(별도 서면 계약으로 허용한 경우 제외).</p>

<h2>제8조 (장애)</h2>
<p>서비스 장애를 알게 되면 계약 담당자 이메일로 알리고, 장애로 처리되지 못한 호출은 과금하지 않습니다. 수치로 정한 서비스 수준(SLA)이 필요하시면 별도로 협의합니다.</p>

<h2>제9조 (해지와 환불)</h2>
<ol>
<li>월 약정은 다음 결제일 전에 알려 주시면 그다음 달부터 해지됩니다. 이미 시작된 달은 환불하지 않고 그달 말까지 쓰실 수 있습니다.</li>
<li>감사·PoC는 착수 전에 취소하면 전액 환불하고, 착수 후에는 진행한 범위만큼 정산합니다.</li>
<li>환불할 때는 수정세금계산서(또는 카드 결제 취소)를 함께 처리합니다.</li>
</ol>

<h2>제10조 (책임의 한도)</h2>
<p>어느 쪽이든 고의 또는 중대한 과실이 없는 한, 이 계약과 관련한 손해배상은 직접 손해로 한정하고 그 금액은 손해가 생긴 날 직전 3개월 동안 귀사가 이 계약으로 지급한 금액을 넘지 않습니다.</p>

<h2>제10조의2 (베리라인이 고친 부분에 대한 책임)</h2>
<ol>
<li>베리라인은 <b>베리라인이 법령 원문으로 바로잡은 부분</b>, 곧 판정 영수증(판정 주체 · 근거 조문 · 시행일 · 원문 지문이 적힌 기록)이 있는 판정에 대해 책임집니다. 검증 결과의 '책임 범위(guarantee)' 항목에 그 목록이 표시됩니다.</li>
<li>그 부분이 판정 시점의 법제처 현행 원문과 다른 것으로 확인되면, 베리라인은 해당 검증 건의 이용료를 환불하고, 영업일 3일 안에 정정 보고서를 드립니다. AI 감사 보고서의 경우 해당 오류 항목을 정정하고, 그 보고서 금액의 범위에서 환불하거나 재감사합니다.</li>
<li>다음은 책임 범위에 들지 않습니다: (가) 결과에 '확인하지 못함'으로 표시된 주장 (나) 판정 영수증 없이 생성형 AI가 이어 쓴 문장 (다) 판정 이후의 법령 개정(영수증의 원문 지문으로 개정 여부를 확인할 수 있습니다) (라) 귀사가 바꾸어 쓴 문장 (마) 공식 원문이 아닌 출처에 기댄 판정.</li>
<li>이 조의 책임은 제10조의 한도 안에서 집니다. 판정이 원문과 같은지는 판정 영수증을 모델 호출 없이 다시 계산하는 재현 기능(/api/receipts/replay)으로 확인합니다.</li>
</ol>

<h2>제11조 (비밀 유지)</h2>
<p>양 당사자는 계약 과정에서 알게 된 상대방의 영업상 정보(감사 결과, 미공개 문서, 기준 자료 등)를 상대방의 동의 없이 제3자에게 공개하지 않습니다. 법령에 따른 제출 요구는 예외입니다.</p>

<h2>제12조 (관할)</h2>
<p>이 계약에 관한 분쟁은 대한민국 법을 따르며, 소송이 필요하면 대구지방법원을 제1심 관할 법원으로 합니다.</p>
${docFoot}`);
}

export function renderB2bDpa() {
  const region = esc(process.env.DB_REGION_LABEL || "프로젝트 설정 지역의 데이터센터");
  return layout("데이터 처리 부속서", `
<h1>데이터 처리 부속서</h1>
<p class="muted">귀사가 베리라인에 보내는 텍스트·파일에 개인정보가 들어 있을 때, 귀사는 개인정보처리자(위탁자)이고 베리라인(사업자 ${esc(COMPANY.name)})은 그 처리를 맡은 수탁자입니다. 이 부속서는 「개인정보 보호법」 제26조의 위탁 문서로 쓸 수 있도록 만든 표준본입니다.</p>

<h2>1. 처리 목적과 범위</h2>
<table>
<tr><th>목적</th><td>계약한 검증·문서 검사·AI 감사의 수행, 과금과 분쟁 대응</td></tr>
<tr><th>처리 항목</th><td>귀사가 보낸 텍스트·파일·기준 자료, API 호출 기록(시각·결과 코드·과금 여부)</td></tr>
<tr><th>처리 금지</th><td>위 목적 밖의 이용, 데이터셋 제공·판매(별도 서면 계약으로 허용한 경우 제외), 다른 고객과 공유하는 판정 캐시에 귀사 기준 자료로 낸 판정을 넣는 일</td></tr>
</table>

<h2>2. 보관과 파기</h2>
<table>
<tr><th>기준 자료(references)</th><td>그 검사에만 쓰고 저장하지 않습니다.</td></tr>
<tr><th>API로 보낸 텍스트와 결과</th><td>과금·분쟁 대응을 위해 수집일부터 1년 보관 후 파기합니다.</td></tr>
<tr><th>계정의 검사 기록</th><td>귀사가 삭제하면 즉시 파기하고, 데이터베이스 백업에 남은 정보는 백업 보관 주기에 따라 순차 삭제됩니다.</td></tr>
<tr><th>AI 감사 자료</th><td>질문·답변·캡처는 보고서 작성과 재감사 비교에 쓰고, 계약 종료 후 귀사가 요청하면 파기합니다.</td></tr>
<tr><th>계약 종료 시</th><td>귀사가 요청하면 30일 안에 파기하고 파기 확인서를 드립니다. 법령이 보존을 요구하는 거래 기록(전자상거래법상 계약·결제 기록 등)은 그 기간 동안 분리 보관합니다.</td></tr>
</table>

<h2>3. 재위탁과 국외 이전</h2>
<p>서비스 제공을 위해 아래 수탁자에게 처리를 다시 맡기며, 국외 수탁자에게는 서비스 이용 시점에 네트워크로 이전됩니다. 수탁자를 바꾸거나 더할 때는 시행 전에 계약 담당자에게 알립니다.</p>
<table>
<tr><th>수탁자(국가)</th><th>업무</th><th>이전 항목</th></tr>
<tr><td>Anthropic, PBC (미국)</td><td>주장 추출·분석, 고친 문장 제안</td><td>검증 요청 텍스트 (API 입력은 모델 학습에 쓰이지 않음)</td></tr>
<tr><td>Supabase, Inc. (미국 법인, 데이터는 ${region}에 저장)</td><td>데이터베이스 저장·백업</td><td>1항의 처리 항목</td></tr>
<tr><td>Railway Corporation (미국)</td><td>서버 운영(요청 처리)</td><td>처리 과정에서 전달되는 정보(별도 저장하지 않음)</td></tr>
</table>

<h2>4. 안전성 확보 조치</h2>
<ul>
<li>모든 통신은 HTTPS로 암호화합니다. 비밀번호는 scrypt로, API 키는 해시로만 저장합니다.</li>
<li>관리자 접근은 권한 계정과 서명된 접근 토큰으로 제한하고, 실패 시도를 IP마다 막으며, 열람·반출 기록을 남깁니다.</li>
<li>웹훅 결과는 HMAC 서명으로 보내 위조를 막습니다.</li>
</ul>
<p>자세한 내용은 <a href="/b2b/security">보안·데이터 처리 설명서</a>에 있습니다.</p>

<h2>5. 귀사의 역할</h2>
<ul>
<li>보내는 텍스트에 개인정보가 들어간다면 귀사 이용자에게 필요한 고지·동의를 받아 주세요.</li>
<li>검증에 필요 없는 개인정보(주민등록번호·건강정보 등)는 지우거나 가린 뒤 보내 주시길 권합니다.</li>
</ul>

<h2>6. 사고 통지와 점검</h2>
<ul>
<li>귀사 데이터의 유출 등을 알게 되면 지체 없이(늦어도 24시간 안에) 계약 담당자에게 알리고, 경위·영향 범위·조치를 함께 전합니다.</li>
<li>귀사가 요청하면 이 부속서의 이행 상황을 서면 질의로 연 1회 점검받습니다.</li>
</ul>
${docFoot}`);
}

export function renderB2bSecurity() {
  return layout("보안·데이터 처리 설명서", `
<h1>보안·데이터 처리 설명서</h1>
<p class="muted">구매·보안 검토 담당자가 자주 묻는 항목에 대한 답입니다. 실제로 하고 있는 것만 적었고, 하지 않은 것은 하지 않았다고 적었습니다.</p>

<h2>구성</h2>
<table>
<tr><th>서버</th><td>Railway(미국)에서 Node.js 서버로 요청을 처리합니다. 요청 내용은 아래 데이터베이스에만 저장합니다(보관 기간은 아래 '보관').</td></tr>
<tr><th>데이터베이스</th><td>Supabase Postgres. 저장소 제공자의 저장 암호화(at-rest)와 백업을 씁니다. 테이블은 행 수준 보안(RLS)을 켜 두고 서버만 접근합니다.</td></tr>
<tr><th>생성형 AI</th><td>Anthropic Claude API — 주장 추출·검색어·고친 문장 제안. API 입력은 모델 학습에 쓰이지 않습니다. 판정은 원문·출처 문장으로만 단정합니다.</td></tr>
<tr><th>공식 원문</th><td>법제처 국가법령정보 공동활용 API, DOI 레지스트리 등에서 원문을 직접 받습니다.</td></tr>
</table>

<h2>접근과 인증</h2>
<ul>
<li>API는 Bearer 키로 인증하며, 키는 발급할 때 한 번만 보여 주고 서버에는 해시만 저장합니다. 키마다 월 한도와 분당 한도가 걸립니다.</li>
<li>계정 비밀번호는 scrypt로 저장합니다. 관리자 화면은 별도 비밀번호와 서명된 쿠키(12시간)로 잠그고, 실패를 IP마다 셉니다.</li>
<li>관리자 행동(열람·반출·권한 변경)은 감사 로그에 남깁니다.</li>
</ul>

<h2>전송과 연동</h2>
<ul>
<li>모든 통신은 HTTPS입니다.</li>
<li>웹훅(callback_url)은 HMAC 서명을 붙여 보내 귀사가 진위를 확인할 수 있습니다.</li>
<li>멱등 키(Idempotency-Key)로 재시도해도 한 번만 처리·과금합니다.</li>
<li>기준 자료(references)는 저장하지 않고, 그 자료로 낸 판정은 다른 고객과 공유하는 캐시에 넣지 않습니다.</li>
<li>API로 보낸 글의 문장은 다른 고객의 결과나 조회(<code>/v1/context</code>)에 나오지 않습니다. 공유되는 것은 공식 출처의 원문 인용뿐입니다.</li>
</ul>

<h2>보관</h2>
<p>API 텍스트와 결과는 과금·분쟁 대응을 위해 1년, 오류 기록은 90일 보관합니다. 자세한 기간과 파기는 <a href="/b2b/dpa">데이터 처리 부속서</a> 2항에 있습니다.</p>

<h2>아직 하지 않은 것</h2>
<ul>
<li>ISMS·ISO 27001 등 정보보호 인증은 받지 않았습니다.</li>
<li>외부 기관의 침투 시험은 받지 않았습니다.</li>
<li>전용(단독) 설치형은 제공하지 않습니다.</li>
</ul>
<p>귀사의 보안 질의서가 있으면 ${esc(COMPANY.email)}로 보내 주세요. 위 범위 안에서 사실대로 답합니다.</p>
${docFoot}`);
}

// ── 운영자 화면 ──────────────────────────────────────────────────

export function renderDealsAdminPage() {
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" /><title>기업 거래 · 베리라인 관리자</title>
<style>${SHEET_CSS}
.wrap { max-width:1100px; margin:0 auto; padding:20px 16px 60px; }
.top { display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap; }
.top h1 { margin:0; font-size:22px; }
.top a { color:var(--accent); font-weight:700; text-decoration:none; font-size:14px; }
.row { background:#fff; border-radius:12px; padding:14px 16px; margin-top:10px; display:grid; gap:6px; }
.row .h { display:flex; justify-content:space-between; gap:10px; flex-wrap:wrap; align-items:baseline; }
.row .h b { font-size:15.5px; }
.pill { font-size:12px; font-weight:700; padding:2px 9px; border-radius:99px; background:var(--soft); color:var(--accent); }
.pill.requested { background:#fde7df; color:var(--fail); } .pill.paid { background:#e3f2ea; color:var(--ok); } .pill.cancelled { background:#eee; color:#777; }
.meta { font-size:13px; color:var(--ink2); line-height:1.7; }
.acts { display:flex; gap:8px; flex-wrap:wrap; }
.btn.sm { padding:7px 12px; font-size:13px; }
.empty { background:#fff; border-radius:12px; padding:24px; margin-top:12px; color:var(--ink2); }
details summary { cursor:pointer; font-size:13px; color:var(--accent); font-weight:650; }
</style></head>
<body><div class="wrap">
  <div class="top"><h1>기업 거래 — 견적 · 계약 신청 · 입금</h1><span><a href="/admin/work">작업 리스트</a> · <a href="/admin/audits">감사 데스크</a> · <a href="/admin">관리자</a></span></div>
  <p class="meta">계약 신청이 오면 ① 세금계산서 정보를 복사해 홈택스에서 발급(입금 전 '청구' / 후 '영수') ② 입금을 확인하면 <b>입금 확인</b> — API 상품은 고객 이메일 계정의 최근 키에 월 한도가 자동으로 걸립니다.</p>
  <div id="list"><div class="empty">불러오는 중…</div></div>
</div>
<script>
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
  async function load(){
    var box = document.getElementById('list');
    try {
      var d = await api('/quotes');
      if (!d.quotes.length) { box.innerHTML = '<div class="empty">아직 견적이 없습니다. 기업용 페이지의 “견적서 바로 받기”나 감사 데스크의 “견적 링크 만들기”로 생깁니다.</div>'; return; }
      box.innerHTML = d.quotes.map(function(q){
        var b = q.billing || {};
        return '<div class="row">' +
          '<div class="h"><b>' + esc(q.company) + '</b><span><span class="pill ' + esc(q.status) + '">' + esc(q.statusLabel) + (q.expired ? ' · 만료' : '') + '</span> <span class="meta">' + esc(q.number) + ' · ' + day(q.created_at) + '</span></span></div>' +
          '<div class="meta">' + esc(q.productLabel) + ' · 합계 <b>' + won(q.total_krw) + '</b> (공급가액 ' + won(q.supply_krw) + ') · ' + esc(q.contact_name || '') + ' ' + esc(q.email || '') + (q.audit_id ? ' · 감사 #' + q.audit_id : '') + (q.source === 'desk' ? ' · 데스크 발행' : '') + '</div>' +
          (q.status === 'requested' || q.status === 'paid' ? '<div class="meta">결제: ' + esc(q.payLabel || '-') + ' · 사업자 ' + esc(b.bizNo || '') + ' ' + esc(b.bizName || '') + ' · 세금계산서 ' + esc(b.taxEmail || '') + '</div>' : '') +
          (q.hometax ? '<details><summary>홈택스 발급 정보 보기</summary><pre class="copy">' + esc(q.hometax) + '</pre></details>' : '') +
          '<div class="acts">' +
            '<a class="btn ghost sm" href="' + esc(q.url) + '" target="_blank" rel="noopener">견적서 열기</a>' +
            '<button class="btn ghost sm" data-copy="' + esc(q.url) + '">링크 복사</button>' +
            (q.hometax ? '<button class="btn ghost sm" data-copy="' + esc(q.hometax) + '">세금계산서 정보 복사</button>' : '') +
            (q.status === 'issued' || q.status === 'requested' ? '<button class="btn sm" data-paid="' + q.id + '">' + (q.product === 'metered' ? '계약 확인' : '입금 확인') + '</button><button class="btn ghost sm" data-cancel="' + q.id + '">취소</button>' : '') +
          '</div></div>';
      }).join('');
    } catch (e) { box.innerHTML = '<div class="empty">' + esc(e.message) + '</div>'; }
  }
  document.addEventListener('click', async function(e){
    var t = e.target;
    if (t.dataset.copy) { try { await navigator.clipboard.writeText(t.dataset.copy); t.textContent = '복사됨'; } catch (_) { prompt('복사하세요', t.dataset.copy); } }
    if (t.dataset.paid) {
      if (!confirm('입금(계약)을 확인 처리할까요? API 상품이면 고객 키에 월 한도가 걸립니다.')) return;
      try { var r = await api('/quotes/' + t.dataset.paid + '/paid', {}); var a = r.applied;
        alert(a ? (a.key ? ('한도 ' + a.quota.toLocaleString('ko-KR') + '회를 ' + a.email + '의 키(' + a.key + '…)에 걸었습니다.') : (a.email ? (a.email + ' 계정에 활성 키가 없습니다. 고객이 키를 만든 뒤 관리자 화면에서 한도를 ' + a.quota.toLocaleString('ko-KR') + '회로 올려 주세요.') : ('같은 이메일의 베리라인 계정이 없습니다. 고객이 가입·키 발급 후 관리자 화면에서 한도를 ' + a.quota.toLocaleString('ko-KR') + '회로 올려 주세요.'))) : '확인 처리했습니다.');
        load(); } catch (err) { alert(err.message); }
    }
    if (t.dataset.cancel) { if (!confirm('이 견적을 취소할까요?')) return; try { await api('/quotes/' + t.dataset.cancel + '/cancel', {}); load(); } catch (err) { alert(err.message); } }
  });
  load();
})();
</script></body></html>`;
}

export { productLabel };
