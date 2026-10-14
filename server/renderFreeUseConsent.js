// 무상사용승낙서(사업자등록 정정 첨부 서류) — 대표가 AI 본사 할 일 "소재지 정정" 안에서 소유자 이름만 넣고 만든다.
// 소유자 개인정보(이름·생년월일·주소)는 저장하지 않는다 — 이 화면을 그릴 때만 쓰고, 대표가 인쇄·PDF로 저장해 서명한다.
import { COMPANY, esc } from "./renderPages.js";
import { NEW_ADDRESS } from "./businessAddress.js";

export function renderFreeUseConsent({ owner = "", birth = "", ownerAddr = "", relation = "", start = "" } = {}) {
  const d = new Date(Date.now() + 9 * 3600_000);
  const today = `${d.getUTCFullYear()}년 ${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`;
  const from = /^\d{4}-\d{2}-\d{2}$/.test(start) ? `${start.slice(0, 4)}년 ${Number(start.slice(5, 7))}월 ${Number(start.slice(8, 10))}일` : today;
  const blank = (v, w = 180) => (v ? esc(v) : `<span class="blank" style="width:${w}px"></span>`);
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>무상사용승낙서</title>
<style>
  @page { size:A4; margin:22mm 20mm; }
  body { font-family:'Malgun Gothic','Apple SD Gothic Neo','Noto Sans KR',sans-serif; color:#111; margin:0; background:#eee; }
  .sheet { background:#fff; max-width:800px; margin:20px auto; padding:56px 60px; box-shadow:0 4px 20px rgba(0,0,0,.1); }
  h1 { text-align:center; font-size:28px; letter-spacing:.6em; margin:0 0 40px; }
  table { width:100%; border-collapse:collapse; font-size:15px; }
  th, td { border:1px solid #333; padding:12px 14px; text-align:left; vertical-align:middle; }
  th { width:24%; background:#f4f4f4; font-weight:700; }
  p { font-size:15.5px; line-height:2; margin:30px 0; }
  .sign { margin-top:40px; font-size:15.5px; line-height:2.4; }
  .sign .row { display:flex; gap:14px; align-items:center; }
  .blank { display:inline-block; border-bottom:1px solid #333; height:1.2em; vertical-align:bottom; }
  .seal { display:inline-block; margin-left:14px; color:#999; }
  .date { text-align:center; margin-top:46px; font-size:16px; }
  .to { margin-top:40px; font-size:17px; font-weight:700; }
  .bar { max-width:800px; margin:16px auto 0; display:flex; gap:8px; justify-content:flex-end; }
  .bar button { padding:10px 18px; border-radius:10px; border:0; background:#0F8C7E; color:#fff; font-weight:700; cursor:pointer; font-size:14px; }
  .note { max-width:800px; margin:10px auto; font-size:13px; color:#555; }
  @media print { body { background:#fff; } .bar, .note { display:none; } .sheet { box-shadow:none; margin:0; padding:0; max-width:none; } }
</style></head><body>
<div class="bar"><button type="button" onclick="window.print()">인쇄 · PDF로 저장</button></div>
<div class="note">소유자가 서명(또는 날인)한 뒤, 소유자 신분증 사본과 함께 홈택스 사업자등록 정정에 첨부하세요. 빈칸은 손으로 채워도 됩니다.</div>
<article class="sheet">
  <h1>무상사용승낙서</h1>
  <table>
    <tr><th>부동산 소재지</th><td>${esc(NEW_ADDRESS)}</td></tr>
    <tr><th>사용자(상호)</th><td>${esc(COMPANY.name)}</td></tr>
    <tr><th>사용자(대표자)</th><td>${esc(COMPANY.ceo)}</td></tr>
    <tr><th>사업자등록번호</th><td>${esc(COMPANY.regNo)}</td></tr>
    <tr><th>사용 목적</th><td>사업장(사무실)</td></tr>
    <tr><th>사용 기간</th><td>${esc(from)}부터 별도 해지 시까지</td></tr>
    <tr><th>사용 조건</th><td>무상(임대료·보증금 없음)</td></tr>
  </table>
  <p>본인은 위 부동산의 소유자로서, 위 사용자가 위 부동산을 사업장으로 <b>무상으로 사용하는 것을 승낙</b>하며,
  이를 사업자등록(정정) 신청 시 사업장 사용 권한을 증명하는 서류로 제출하는 데 동의합니다.</p>
  <div class="date">${esc(today)}</div>
  <div class="sign">
    <div class="row"><b>소유자</b></div>
    <div class="row">성&nbsp;&nbsp;&nbsp;&nbsp;명 : ${blank(owner, 160)} <span class="seal">(서명 또는 인)</span></div>
    <div class="row">생년월일 : ${blank(birth, 160)}</div>
    <div class="row">주&nbsp;&nbsp;&nbsp;&nbsp;소 : ${blank(ownerAddr, 360)}</div>
    ${relation ? `<div class="row">사용자와의 관계 : ${esc(relation)}</div>` : ""}
  </div>
  <div class="to">세무서장 귀하</div>
</article>
</body></html>`;
}
