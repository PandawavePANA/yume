// 견적서 한 장 — 의뢰인이 사내 결재에 올리거나 PDF로 저장할 문서.
//
// 기업 의뢰인은 대화 화면을 캡처해서 올리지 않는다. "견적서"라는 이름의 문서가 있어야 결재가
// 돈다. 새 창에 인쇄용 문서를 그리고 인쇄 창을 연다 — 거기서 "PDF로 저장"을 고르면 파일이 된다.
//
// 금액은 화면과 같게 "부가세 포함" 한 줄로만 적는다. 공급가·세액을 나눠 적으려면 과세 유형
// (일반/간이)에 따라 계산이 달라지는데, 그걸 추측해서 적은 문서는 틀린 세금 서류가 된다.
import { BUSINESS } from "@/businessInfo";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const won = (n) => `${Number(n || 0).toLocaleString("ko-KR")}원`;
const day = (t) => new Date(Number(t) || Date.now()).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });

export function openQuoteDoc(quote, thread) {
  const w = window.open("", "_blank");
  if (!w) return false;
  const no = `R-${new Date(quote.at || Date.now()).toISOString().slice(0, 10).replace(/-/g, "")}-${quote.id}`;
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8" />
<title>견적서 ${esc(no)} · ${esc(BUSINESS.name)}</title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 32px; color: #16141c; background: #fff; word-break: keep-all;
         font: 14px/1.7 -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif; }
  @media print { body { padding: 0; } .noprint { display: none; } }
  h1 { font-size: 28px; letter-spacing: .3em; margin: 0 0 4px; }
  .meta { color: #6b6676; font-size: 12.5px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 26px 0; }
  .box { border: 1px solid #dcd8e4; border-radius: 8px; padding: 14px 16px; font-size: 13px; }
  .box b { display: block; font-size: 11.5px; color: #6b6676; font-weight: 600; margin-bottom: 6px; letter-spacing: .04em; }
  table { width: 100%; border-collapse: collapse; margin-top: 6px; }
  th, td { border-bottom: 1px solid #e6e3ec; padding: 11px 8px; text-align: left; vertical-align: top; }
  th { font-size: 12px; color: #6b6676; font-weight: 600; border-bottom: 2px solid #16141c; }
  td.n { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .total { display: flex; justify-content: space-between; align-items: baseline; margin-top: 16px; padding: 14px 8px;
           border-top: 2px solid #16141c; font-size: 16px; font-weight: 700; }
  .total span:last-child { font-size: 22px; }
  .detail { white-space: pre-wrap; font-size: 13px; color: #3d3947; }
  .terms { margin-top: 26px; font-size: 12px; color: #54505e; }
  .terms li { margin: 3px 0; }
  .btn { display: inline-block; margin: 0 8px 20px 0; padding: 9px 16px; border-radius: 8px; border: 1px solid #16141c;
         background: #16141c; color: #fff; font: inherit; font-size: 13px; cursor: pointer; }
</style></head><body>
<div class="noprint"><button class="btn" onclick="print()">인쇄 · PDF로 저장</button></div>
<h1>견 적 서</h1>
<div class="meta">견적번호 ${esc(no)} · 발행일 ${esc(day(quote.at))}${quote.expiresAt ? ` · 유효기간 ${esc(day(quote.expiresAt))}까지` : ""}</div>
<div class="grid">
  <div class="box"><b>받는 분</b>${esc(thread?.name ? `${thread.name} 님` : "의뢰인")}${thread?.title ? `<br/>${esc(thread.title)}` : ""}</div>
  <div class="box"><b>공급자</b>${esc(BUSINESS.name)}(${esc(BUSINESS.nameEn)}) · 대표 ${esc(BUSINESS.ceo)}<br/>
    사업자등록번호 ${esc(BUSINESS.regNo)}<br/>${esc(BUSINESS.address)}<br/>${esc(BUSINESS.tel)} · ${esc(BUSINESS.email)}</div>
</div>
<table>
  <thead><tr><th>항목</th><th>기간</th><th style="text-align:right">금액</th></tr></thead>
  <tbody><tr>
    <td><b>${esc(quote.title)}</b>${quote.detail ? `<div class="detail">${esc(quote.detail)}</div>` : ""}</td>
    <td>${esc(quote.weeks || "협의")}</td>
    <td class="n">${esc(won(quote.amount))}</td>
  </tr></tbody>
</table>
<div class="total"><span>합계 (부가세 포함)</span><span>${esc(won(quote.amount))}</span></div>
<ul class="terms">
  <li>위 범위 안의 작업은 확정 후 금액이 바뀌지 않습니다.</li>
  <li>착수 전에는 전액 환불되며, 착수 이후에는 진행된 부분을 제외하고 환불됩니다(전자상거래법 제17조).</li>
  <li>확정과 결제는 대화 화면에서 진행됩니다.</li>
</ul>
</body></html>`;
  w.document.open();
  w.document.write(html);
  w.document.close();
  return true;
}
