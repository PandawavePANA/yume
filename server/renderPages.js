// 서버 렌더링 정적 페이지: 이용약관·개인정보처리방침·비밀번호 재설정·API 문서.
//
// 사업자 정보는 전자상거래법 제10조와 결제대행 심사가 요구하는 항목이다. 배포 환경변수로
// 덮어쓸 수 있지만, 기본값을 비워 두면 환경변수를 안 넣은 배포에서 조용히 사라진다 —
// 실제로 심사에서 "사이트에 명시되어 있지 않음"으로 걸린 게 이 때문이라 등록증 값을
// 기본값으로 박아 둔다. 프런트엔드 쪽 같은 값은 src/businessInfo.js에 있다.
// 결제 완료 안내 메일도 같은 값을 써야 해서 내보낸다 — 두 벌로 두면 한쪽만 바뀐다.
export const COMPANY = {
  name: process.env.COMPANY_NAME || "리머(REAMER)",
  ceo: process.env.COMPANY_CEO || "정원영",
  email: process.env.COMPANY_EMAIL || "reamer@d-reamer.com",
  regNo: process.env.BUSINESS_REG_NO || "627-03-03900",
  address: process.env.BUSINESS_ADDRESS || "대구광역시 달성군 유가읍 테크노대로5길 80, 212동 1402호 (호반베르디움 2차)",
  // 유선번호. 심사가 "유선번호만 가능"으로 못박은 항목이라 휴대폰 번호는 쓸 수 없다.
  tel: process.env.BUSINESS_TEL || "053-557-3415",
  // 간이과세자는 통신판매업 신고 면제 대상일 수 있어, 없으면 표시하지 않는다.
  mailOrderNo: process.env.MAIL_ORDER_NO || "",
};
const EFFECTIVE_DATE = "2026년 9월 12일";
// 개인정보처리방침은 약관과 따로 개정된다. 바꿀 때마다 이 날짜와 아래 개정 이력을 함께 고친다.
const PRIVACY_EFFECTIVE_DATE = "2026년 9월 19일";
const PRIVACY_PREVIOUS = ["2026년 9월 12일"];

import { PLANS } from "./plans.js";
import { CREDIT_PACKS, PLAN_CREDITS, CHARS_PER_CREDIT } from "./credits.js";

const esc = (s = "") => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function layout(title, body, { narrow = false, script = "" } = {}) {
  return `<!doctype html>
<html lang="ko"><head>
<meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)} · 유메</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system,BlinkMacSystemFont,'SF Pro Display','Segoe UI','Noto Sans KR',sans-serif;
    background: radial-gradient(ellipse 80% 60% at 50% -10%, #D3B8F5 0%, #E3CDF7 40%, #F1E3FA 75%, #F8F0FC 100%); color: #241F33; min-height: 100vh; word-break: keep-all; }
  .wrap { max-width: ${narrow ? 440 : 860}px; margin: 0 auto; padding: 36px 18px 70px; }
  .top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 22px; }
  .top a { color: #6B4FA8; text-decoration: none; font-weight: 700; font-size: 15px; }
  .card { background: #fff; border: 1px solid #D9BFF0; border-radius: 20px; padding: clamp(20px, 4vw, 38px); box-shadow: 0 16px 44px rgba(107,79,168,0.14); }
  h1 { font-size: 24px; margin: 0 0 6px; } h2 { font-size: 16.5px; margin: 30px 0 10px; color: #3B3159; } h3 { font-size: 14.5px; margin: 18px 0 8px; }
  p, li { font-size: 14px; line-height: 1.8; color: #3F3A52; } .muted { color: #8577A8; font-size: 12.5px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; margin: 10px 0; } th, td { border: 1px solid #E6DAF6; padding: 8px 10px; text-align: left; vertical-align: top; line-height: 1.6; }
  th { background: #F7F1FE; color: #5B3FA0; font-weight: 700; }
  code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; } code { background: #F1E6FB; color: #5B3A9E; padding: 1px 6px; border-radius: 5px; font-size: 12.5px; }
  pre { background: #211A32; color: #E8E1FA; padding: 14px 16px; border-radius: 12px; overflow-x: auto; font-size: 12.5px; line-height: 1.6; }
  input { width: 100%; padding: 11px 13px; border-radius: 10px; border: 1px solid #D4BEF0; font-size: 14px; margin: 6px 0 14px; }
  button { width: 100%; padding: 12px 0; border-radius: 12px; border: none; background: linear-gradient(90deg,#B49AEE,#6B4FA8); color: #fff; font-size: 14.5px; font-weight: 600; cursor: pointer; }
  .msg { font-size: 13px; min-height: 18px; margin-top: 10px; } .err { color: #C6402F; } .ok { color: #1F9D66; }
  .foot { text-align: center; margin-top: 24px; font-size: 12px; color: #A99BC9; line-height: 1.8; } .foot a { color: #8577A8; }
</style></head>
<body><div class="wrap">
  <div class="top"><a href="/">← 유메로 돌아가기</a></div>
  <div class="card">${body}</div>
  <div class="foot">${businessLine()}<br/><a href="/terms">이용약관</a> · <a href="/privacy"><b>개인정보처리방침</b></a> · <a href="/refund">환불정책</a> · <a href="/products">상품 안내</a> · <a href="/docs/api">API 문서</a></div>
</div>${script}</body></html>`;
}

export function businessLine() {
  return [
    `상호 ${esc(COMPANY.name)}`,
    `대표 ${esc(COMPANY.ceo)}`,
    COMPANY.regNo && `사업자등록번호 ${esc(COMPANY.regNo)}`,
    COMPANY.mailOrderNo && `통신판매업 신고 ${esc(COMPANY.mailOrderNo)}`,
    COMPANY.address && `주소 ${esc(COMPANY.address)}`,
    COMPANY.tel && `대표전화 ${esc(COMPANY.tel)}`,
    `문의 ${esc(COMPANY.email)}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function renderResetPasswordPage() {
  return layout(
    "비밀번호 재설정",
    `<h1>새 비밀번호 설정</h1>
     <p class="muted">영문과 숫자를 포함해 8자 이상으로 정해주세요.</p>
     <label class="muted" for="pw">새 비밀번호</label>
     <input id="pw" type="password" autocomplete="new-password" />
     <label class="muted" for="pw2">새 비밀번호 확인</label>
     <input id="pw2" type="password" autocomplete="new-password" />
     <button id="go">비밀번호 변경</button>
     <div id="msg" class="msg"></div>`,
    {
      narrow: true,
      script: `<script>
  var token = new URLSearchParams(location.search).get("token") || "";
  var msg = document.getElementById("msg");
  if (!token) { msg.className = "msg err"; msg.textContent = "재설정 링크가 올바르지 않아요. 메일의 링크를 다시 눌러주세요."; }
  document.getElementById("go").onclick = async function () {
    var pw = document.getElementById("pw").value, pw2 = document.getElementById("pw2").value;
    if (pw !== pw2) { msg.className = "msg err"; msg.textContent = "두 비밀번호가 서로 달라요."; return; }
    this.disabled = true;
    try {
      var r = await fetch("/api/auth/reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: token, password: pw }) });
      var d = await r.json();
      if (!r.ok) throw new Error(d.error || "변경하지 못했어요.");
      msg.className = "msg ok"; msg.innerHTML = '비밀번호를 바꿨어요. <a href="/">유메에서 로그인하기</a>';
    } catch (e) { msg.className = "msg err"; msg.textContent = e.message; this.disabled = false; }
  };
</script>`,
    },
  );
}

export function renderTermsPage() {
  return layout(
    "이용약관",
    `<h1>유메 이용약관</h1><p class="muted">시행일: ${EFFECTIVE_DATE}</p>

<h2>제1조 (목적)</h2>
<p>이 약관은 ${esc(COMPANY.name)}(이하 "회사")가 제공하는 팩트체크 서비스 "유메(YUME)"(이하 "서비스")의 이용 조건과 절차, 회사와 이용자의 권리·의무 및 책임 사항을 정합니다.</p>

<h2>제2조 (정의)</h2>
<ol>
<li>"이용자"란 이 약관에 따라 서비스를 이용하는 회원 및 비회원을 말합니다.</li>
<li>"회원"이란 이메일로 가입해 계정을 보유한 이용자를 말합니다.</li>
<li>"검증 요청"이란 이용자가 확인을 위해 서비스에 입력하는 텍스트를 말합니다.</li>
<li>"판정"이란 서비스가 검증 요청 속 사실 주장에 대해 제공하는 "확인됨", "사실과 다름", "확인되지 않음" 등의 결과와 그 근거를 말합니다.</li>
<li>"API"란 회원이 발급받은 키로 서비스의 검증 기능을 프로그램에서 호출할 수 있게 하는 인터페이스를 말합니다.</li>
</ol>

<h2>제3조 (약관의 효력과 변경)</h2>
<p>이 약관은 서비스 화면에 게시해 효력이 발생합니다. 회사는 관련 법령을 위반하지 않는 범위에서 약관을 변경할 수 있으며, 변경 시 시행일 7일 전(이용자에게 불리한 변경은 30일 전)부터 서비스에 공지합니다. 변경에 동의하지 않는 회원은 탈퇴할 수 있습니다.</p>

<h2>제4조 (서비스의 내용)</h2>
<ol>
<li>회사는 이용자가 입력한 텍스트에서 사실 주장을 추출하고, 법제처 국가법령정보 등 공식 데이터와 웹 자료를 대조해 판정과 근거를 제공합니다.</li>
<li>인용된 법령·판례·문헌 또는 사실 주장을 공식 데이터와 웹에서 찾지 못한 경우, 회사는 탐색 범위를 바탕으로 산출한 "부존재 신뢰도"와 아직 확인하지 못한 영역을 함께 안내합니다.</li>
<li>회원에게는 검증 기록 저장, API 키 발급, 개인 데이터 내려받기 기능을 제공합니다.</li>
</ol>

<h2>제5조 (판정의 성격과 한계)</h2>
<ol>
<li>판정은 서비스가 확인할 수 있었던 자료를 기준으로 한 <b>참고 정보</b>이며, 법률·의료·금융·세무 등 전문가의 자문을 대신하지 않습니다. 중요한 결정은 반드시 해당 분야 전문가와 원문 자료로 다시 확인하시기 바랍니다.</li>
<li>공식 데이터베이스와 웹 자료는 모든 사실을 수록하지 않으며, 수록 범위와 최신성에는 한계가 있습니다. "부존재 신뢰도"와 "탐색 커버리지"는 추정값입니다.</li>
<li>회사는 판정의 정확성을 높이기 위해 노력하지만, 판정이 항상 옳다고 보증하지 않습니다.</li>
</ol>

<h2>제6조 (회원 가입)</h2>
<p>이용자는 이메일과 비밀번호를 입력하고 이 약관과 개인정보 수집·이용에 동의해 가입합니다. 타인의 정보를 도용하거나 허위 정보를 입력한 경우 회사는 가입을 거절하거나 이용을 제한할 수 있습니다. 만 14세 미만은 가입할 수 없습니다.</p>

<h2>제7조 (요금제와 이용 한도)</h2>
<ol>
<li>서비스는 무료 플랜과 유료 플랜으로 제공되며, 플랜별 하루 이용 횟수와 기능은 요금제 화면에 게시합니다.</li>
<li>유료 플랜에도 서비스 안정성과 공정한 이용을 위해 하루 이용 한도(공정 이용 한도)가 적용됩니다.</li>
<li>서버 오류로 검증이 완료되지 않은 요청은 이용 횟수에서 차감하지 않습니다.</li>
<li>유료 플랜과 크레딧의 결제·환불 조건은 <a href="/refund">환불정책</a>에서 정하며, 「전자상거래 등에서의 소비자보호에 관한 법률」 등 관계 법령에 따릅니다.</li>
</ol>

<h2>제7조의2 (결제)</h2>
<ol>
<li>유료 상품의 결제 수단은 신용카드·체크카드이며, 결제는 회사가 지정한 전자결제대행사를 통해 이루어집니다.</li>
<li>서비스 화면과 <a href="/products">상품 안내</a>에 표시되는 금액은 부가가치세가 포함된 최종 결제 금액입니다.</li>
<li>유료 플랜은 <b>1개월 이용권을 그때마다 결제하는 방식</b>이며, 자동으로 갱신되거나 다시 결제되지 않습니다. 따라서 별도의 정기결제 해지 절차가 없습니다. 이용 기간이 끝나면 무료 플랜으로 돌아갑니다.</li>
<li>결제 금액은 서버가 확정하며, 회원은 결제 전 주문 화면에서 상품명·금액·판매자 정보와 환불 조건을 확인한 뒤 결제합니다.</li>
<li>결제가 정상적으로 확인되면 크레딧과 이용 권한은 즉시 계정에 반영됩니다.</li>
</ol>

<h2>제7조의3 (청약철회)</h2>
<ol>
<li>회원은 결제일부터 <b>7일 이내</b>에 청약철회를 할 수 있습니다.</li>
<li>다만 「전자상거래 등에서의 소비자보호에 관한 법률」 제17조 제2항 제5호에 따라, <b>이미 사용한 크레딧</b>에 대해서는 청약철회가 제한됩니다. 사용 여부와 수량은 검증 기록으로 확인됩니다.</li>
<li>사용하지 않은 크레딧에 대해서는 전액을 환불합니다. 구체적인 산정 방법과 신청 절차는 <a href="/refund">환불정책</a>에서 정합니다.</li>
<li>청약철회는 ${esc(COMPANY.email)}로 신청하실 수 있습니다.</li>
</ol>

<h2>제7조의4 (미성년자의 결제)</h2>
<ol>
<li>만 19세 미만의 미성년자가 법정대리인의 동의 없이 결제한 경우, 본인 또는 법정대리인은 그 결제를 취소할 수 있습니다.</li>
<li>다만 미성년자가 법정대리인이 재산의 처분을 허락한 범위에서 결제한 경우이거나, 성년자로 믿게 하기 위하여 속임수를 쓴 경우에는 취소가 제한될 수 있습니다.</li>
<li>취소를 원하시는 경우 ${esc(COMPANY.email)}로 결제 내역과 함께 알려주시면 확인 후 처리해 드립니다.</li>
</ol>

<h2>제8조 (API 이용)</h2>
<ol>
<li>API 키는 회원 계정에 귀속되며, 회원은 키가 유출되지 않도록 관리할 책임이 있습니다. 유출이 의심되면 즉시 키를 폐기하고 새로 발급받아야 합니다.</li>
<li>API에는 월 호출 한도와 분당 요청 한도가 적용됩니다. 과금 단위와 단가는 별도 계약 또는 요금 안내에 따릅니다.</li>
<li>API로 전송하는 텍스트에 포함된 개인정보에 대해서는 API를 이용하는 회원이 개인정보보호법상 필요한 고지·동의 등 적법한 처리 근거를 갖추어야 합니다.</li>
</ol>

<h2>제9조 (이용자의 의무)</h2>
<ol>
<li>이용자는 다른 사람의 개인정보(주민등록번호, 연락처, 건강정보 등)를 필요 이상으로 검증 요청에 넣지 않아야 합니다.</li>
<li>서비스를 불법적인 목적으로 이용하거나, 자동화된 방법으로 비정상적인 대량 요청을 보내거나(API 제외), 서비스의 운영을 방해해서는 안 됩니다.</li>
<li>판정 결과를 회사의 공식 의견인 것처럼 왜곡해 게시하거나, 판정을 근거로 타인의 명예를 훼손해서는 안 됩니다.</li>
</ol>

<h2>제10조 (서비스 이용 제한)</h2>
<p>회사는 이용자가 제9조를 위반한 경우 사전 통지 후(긴급한 경우 사후 통지) 이용을 제한하거나 계정을 정지할 수 있습니다.</p>

<h2>제11조 (서비스의 변경·중단)</h2>
<p>회사는 운영상·기술상 필요에 따라 서비스의 전부 또는 일부를 변경하거나 중단할 수 있으며, 이용자에게 불리한 변경·중단은 사전에 공지합니다. 천재지변, 외부 데이터 제공 기관의 장애 등 회사가 통제할 수 없는 사유로 인한 중단은 예외로 합니다.</p>

<h2>제12조 (탈퇴)</h2>
<p>회원은 언제든지 계정 설정에서 탈퇴할 수 있습니다. 탈퇴 시 회원 정보와 검증 기록, API 키는 개인정보처리방침에 따라 지체 없이 파기됩니다.</p>

<h2>제13조 (지식재산권)</h2>
<p>서비스와 판정 결과의 형식·디자인·소프트웨어에 대한 권리는 회사에 있습니다. 이용자는 자신이 받은 판정 결과를 개인적·업무적 참고 목적으로 자유롭게 이용할 수 있습니다.</p>

<h2>제14조 (책임의 제한)</h2>
<p>회사는 고의 또는 중대한 과실이 없는 한, 이용자가 판정을 참고해 내린 결정으로 발생한 손해에 대해 책임을 지지 않습니다. 다만 관련 법령상 회사의 책임을 제한할 수 없는 경우에는 그에 따릅니다.</p>

<h2>제15조 (분쟁 해결)</h2>
<p>서비스 이용과 관련한 분쟁은 대한민국 법을 따르며, 소송이 제기되는 경우 민사소송법상의 관할 법원에서 해결합니다.</p>

<h2>부칙</h2>
<p>이 약관은 ${EFFECTIVE_DATE}부터 시행합니다.</p>`,
  );
}

// 구글 플레이가 요구하는 "앱 밖에서도 볼 수 있는 계정 삭제 안내" 페이지.
export function renderAccountDeletionPage() {
  return layout(
    "계정 삭제 안내",
    `<h1>유메 계정 삭제 안내</h1>
<p class="muted">${esc(COMPANY.name)}가 운영하는 유메(YUME) 웹사이트와 앱(Android·iOS)의 계정 삭제 방법입니다.</p>

<h2>앱 또는 웹사이트에서 직접 삭제하기</h2>
<ol>
<li>유메 앱을 열거나 <a href="/">www.yume-reamer.com</a>에 접속해 로그인합니다.</li>
<li>오른쪽 위 내 이름을 누르고 <b>계정 설정</b>을 엽니다.</li>
<li><b>보안</b> 탭의 <b>회원 탈퇴</b>에서 비밀번호를 입력하고 <b>탈퇴하기</b>를 누릅니다.</li>
</ol>
<p>탈퇴하는 즉시 계정과 연결된 정보가 삭제되며 되돌릴 수 없습니다.</p>

<h2>로그인할 수 없는 경우</h2>
<p>가입한 이메일 주소에서 <a href="mailto:${esc(COMPANY.email)}?subject=${encodeURIComponent("[유메] 계정 삭제 요청")}">${esc(COMPANY.email)}</a>로 "계정 삭제 요청"이라고 보내주세요. 본인 확인 후 10일 이내에 삭제하고 결과를 알려드립니다.</p>

<h2>삭제되는 정보</h2>
<table>
<tr><th>즉시 삭제</th><td>이메일, 비밀번호, 이름·회사명, 검증 기록, API 키, 로그인 세션, 데이터 활용 동의</td></tr>
<tr><th>일정 기간 보관 후 삭제</th><td>API 호출 기록(과금·분쟁 대응, 수집일로부터 1년), 오류 기록(90일), 데이터베이스 백업(백업 보관 주기에 따라 순차 삭제)</td></tr>
</table>
<p>탈퇴 전에 데이터 활용에 동의해 이미 가명처리되어 제공된 데이터는 이용자를 알아볼 수 없는 형태이므로 회수 대상에서 제외됩니다. 자세한 내용은 <a href="/privacy">개인정보처리방침</a>을 확인해주세요.</p>`,
  );
}

// 환불정책 — PG 심사가 "교환/환불정보"를 비실물도 필수로 본다.
//
// 이용약관 안에 한 줄로 "결제 시 별도 고지"라고만 두었던 것을 실제 정책으로 옮긴다.
// 심사자는 결제 페이지에서 링크 한 번으로 닿는 독립 페이지를 본다.
//
// 내용은 전자상거래법 제17조를 그대로 따른다. 디지털 콘텐츠는 사용을 시작하면
// 청약철회가 제한되지만(제2항 제5호), 그 제한은 "쓴 부분"에만 걸린다. 크레딧은 한 개씩
// 떨어져 나가므로 남은 개수를 정확히 셀 수 있다 — 쓴 건 빼고 남은 건 돌려주면 된다.
// 공개 상품 안내 — 카드사 심사가 "실제 판매 가능한 상품"과 가격을 로그인 없이 확인한다.
//
// 크레딧 구매는 로그인한 계정의 설정 화면 안에 있어서, 심사자가 계정 없이는 상품을
// 볼 수 없었다. 같은 값을 공개 페이지로 한 번 더 낸다 — 가격은 실제 판매 설정
// (plans.js, credits.js)에서 그대로 읽으므로 화면과 심사 자료가 어긋날 수 없다.
//
// 무료 플랜은 여기 싣지 않는다. 심사는 0원 상품을 반려하고, 무료 플랜은 판매 상품이
// 아니라 가입하면 주어지는 기본 한도다.
const won = (n) => `${Number(n).toLocaleString()}원`;

export function renderProductsPage() {
  const plans = ["standard", "expert"]
    .map((k) => ({ key: k, ...PLANS[k], credits: PLAN_CREDITS[k] }))
    .filter((p) => p.monthlyKrw);

  const planRows = plans
    .map(
      (p) => `<tr>
        <td><b>${esc(p.label)} 플랜 1개월 이용권</b><br/><span class="muted">${p.credits.toLocaleString()}크레딧 지급 · 하루 ${p.dailyLimit}회 공정 이용 한도 · 자동 갱신 없음</span></td>
        <td>${won(p.monthlyKrw)} (1개월)</td>
        <td>결제 확인 즉시</td>
      </tr>`,
    )
    .join("");

  const packRows = CREDIT_PACKS.map(
    (p) => `<tr>
      <td><b>${esc(p.label)}</b><br/><span class="muted">추가 구매 · 유효기간 없음</span></td>
      <td>${won(p.krw)}</td>
      <td>결제 확인 즉시</td>
    </tr>`,
  ).join("");

  return layout(
    "상품 안내",
    `<h1>상품 안내</h1>
     <p class="muted">${esc(COMPANY.name)} · 모든 상품은 디지털 콘텐츠이며 배송되는 실물이 없습니다.</p>

     <h2>크레딧이란</h2>
     <p>크레딧은 유메가 AI 답변 속 사실 주장을 검증하는 데 쓰는 이용권입니다.
     검증 1회에 1크레딧이 차감되며, 입력이 길면 <b>${CHARS_PER_CREDIT.toLocaleString()}자마다 1크레딧</b>씩 더 차감됩니다.
     유효기간은 없고, 서버 오류로 검증이 완료되지 않으면 차감된 크레딧은 자동으로 환급됩니다.</p>

     <h2>요금제 이용권</h2>
     <table>
       <tr><th>상품</th><th>판매가격</th><th>제공 시기</th></tr>
       ${planRows}
     </table>

     <h2>크레딧 추가 구매</h2>
     <p class="muted">이용권으로 받은 크레딧을 모두 사용한 경우 추가로 구매할 수 있습니다. 이용권 없이도 구매할 수 있습니다.</p>
     <table>
       <tr><th>상품</th><th>판매가격</th><th>제공 시기</th></tr>
       ${packRows}
     </table>

     <h2>제공 시기와 배송</h2>
     <ol>
     <li>모든 상품은 디지털 콘텐츠로, <b>배송되는 실물이 없습니다.</b> 별도의 배송비와 배송 기간이 발생하지 않습니다.</li>
     <li>결제가 확인되면 <b>즉시</b> 회원 계정에 적립되며, 적립 내역은 계정 설정의 크레딧 화면에서 확인할 수 있습니다.</li>
     <li>요금제 이용권의 크레딧은 결제 확인 즉시 한 번에 지급되며, 이용 기간은 결제일부터 1개월입니다.</li>
     <li><b>자동으로 갱신되거나 다시 결제되지 않습니다.</b> 계속 이용하시려면 기간이 끝난 뒤 다시 구매하시면 됩니다. 별도로 해지하실 것이 없습니다.</li>
     </ol>

     <h2>교환과 환불</h2>
     <ol>
     <li>디지털 콘텐츠이므로 교환은 제공하지 않으며, 환불로만 처리합니다.</li>
     <li>사용하지 않은 크레딧은 결제일부터 7일 이내에 환불받을 수 있습니다. 자세한 조건은 <a href="/refund">환불정책</a>을 확인해주세요.</li>
     <li>환불 문의: <a href="mailto:${esc(COMPANY.email)}">${esc(COMPANY.email)}</a>${COMPANY.tel ? ` · ${esc(COMPANY.tel)}` : ""}</li>
     </ol>

     <p class="muted">표시된 금액은 부가세를 포함한 최종 결제 금액입니다. 품절되는 상품이 없으며, 가격은 변경 시 이 화면에 먼저 고지합니다.</p>`,
  );
}

export function renderRefundPage() {
  return layout(
    "환불정책",
    `<h1>환불정책</h1>
     <p class="muted">시행일: ${EFFECTIVE_DATE} · ${esc(COMPANY.name)}</p>

     <h2>제1조 (적용 범위)</h2>
     <p>이 정책은 유메가 제공하는 유료 요금제 이용권(1개월)과 크레딧 추가 구매에 적용됩니다. 유메가 판매하는 상품은 모두 디지털 콘텐츠이며 배송되는 실물이 없습니다.</p>

     <h2>제2조 (청약철회)</h2>
     <ol>
     <li>이용자는 결제일부터 <b>7일 이내</b>에 청약철회를 할 수 있습니다.</li>
     <li>다만 「전자상거래 등에서의 소비자보호에 관한 법률」 제17조 제2항 제5호에 따라, <b>이미 사용한 크레딧</b>에 대해서는 청약철회가 제한됩니다. 크레딧은 검증 1회마다 차감되므로 사용 여부와 수량이 기록으로 확인됩니다.</li>
     <li>크레딧을 한 개도 사용하지 않았다면 결제 금액 <b>전액</b>을 환불합니다.</li>
     </ol>

     <h2>제3조 (요금제 이용권 환불)</h2>
     <ol>
     <li>결제 후 <b>7일 이내</b>이고 해당 월에 지급된 크레딧을 사용하지 않았다면 전액 환불합니다.</li>
     <li>크레딧을 일부 사용한 경우, 사용한 크레딧에 해당하는 금액을 공제하고 환불합니다. 공제 단가는 <b>결제 금액을 그 달에 지급된 크레딧 수로 나눈 값</b>입니다.</li>
     <li>결제 후 7일이 지난 경우, 남은 이용 기간에 대해 일할 계산하여 환불합니다. 이때에도 이미 사용한 크레딧에 해당하는 금액은 공제합니다.</li>
     <li>환불이 이루어지면 해당 요금제는 즉시 종료되고 남은 크레딧은 소멸합니다.</li>
     </ol>

     <h2>제4조 (크레딧 추가 구매 환불)</h2>
     <ol>
     <li>구매한 크레딧을 한 개도 사용하지 않았다면 결제일부터 7일 이내에 전액 환불합니다.</li>
     <li>일부를 사용한 경우, <b>남은 크레딧 수 × 구매 단가</b>를 환불합니다. 구매 단가는 결제 금액을 구매 수량으로 나눈 값입니다.</li>
     <li>크레딧은 현금으로 교환되지 않으며, 환불은 결제 수단을 통한 취소로만 처리됩니다.</li>
     </ol>

     <h2>제5조 (환불하지 않는 경우)</h2>
     <ol>
     <li>이용약관을 위반하여 이용이 정지된 경우</li>
     <li>이벤트·추천 보상 등 <b>무상으로 지급된 크레딧</b>. 이는 결제 대금이 없으므로 환불 대상이 아닙니다.</li>
     <li>분기 공헌도 보상으로 지급된 크레딧 및 물품</li>
     </ol>

     <h2>제6조 (서비스 장애와 오류)</h2>
     <ol>
     <li>서버 오류로 검증이 완료되지 않은 경우, 차감된 크레딧은 <b>자동으로 환급</b>됩니다. 별도로 신청하지 않으셔도 됩니다.</li>
     <li>유메의 귀책으로 서비스를 정상 이용할 수 없었던 기간이 있는 경우, 그 기간에 대해 환불하거나 크레딧으로 보상합니다.</li>
     <li>판정 결과에 대한 이견은 환불 사유에 해당하지 않습니다. 유메의 판정은 참고 정보이며, 근거와 조회 시점을 함께 제공하여 이용자가 직접 확인할 수 있도록 하고 있습니다.</li>
     </ol>

     <h2>제7조 (신청 방법과 처리 기한)</h2>
     <ol>
     <li>환불은 <a href="mailto:${esc(COMPANY.email)}">${esc(COMPANY.email)}</a>로 가입 이메일과 결제 내역을 알려주시면 접수됩니다.</li>
     <li>접수일부터 <b>3영업일 이내</b>에 처리 결과를 회신하고, 환불 사유가 확인되면 <b>3영업일 이내</b>에 결제 취소를 요청합니다.</li>
     <li>카드 결제의 경우 카드사 사정에 따라 실제 대금 반환까지 영업일 기준 3~5일이 추가로 걸릴 수 있습니다.</li>
     </ol>

     <h2>제8조 (분쟁 해결)</h2>
     <p>환불과 관련하여 이견이 있는 경우 이용자와 협의하여 해결하며, 협의가 되지 않으면 「소비자기본법」에 따른 소비자분쟁조정위원회의 조정을 따를 수 있습니다.</p>

     <p class="muted">이 정책에 정하지 않은 사항은 이용약관과 관계 법령에 따릅니다.</p>`,
  );
}

export function renderPrivacyPage() {
  return layout(
    "개인정보처리방침",
    `<h1>개인정보처리방침</h1><p class="muted">시행일: ${PRIVACY_EFFECTIVE_DATE}</p>
<p>${esc(COMPANY.name)}(이하 "회사")는 「개인정보 보호법」에 따라 이용자의 개인정보를 보호하고 관련 고충을 신속하게 처리하기 위해 다음과 같이 개인정보처리방침을 공개합니다.</p>

<h2>1. 처리하는 개인정보와 목적</h2>
<table>
<tr><th>구분</th><th>항목</th><th>목적</th></tr>
<tr><td>회원가입(필수)</td><td>이메일, 비밀번호(암호화 저장), 이름(선택 입력)</td><td>회원 식별, 로그인, 비밀번호 재설정, 공지 전달</td></tr>
<tr><td>서비스 이용(필수)</td><td>검증 요청 텍스트, 판정 결과, 이용 일시, 이용 횟수</td><td>팩트체크 제공, 검증 기록 저장, 이용 한도 관리, 중복 검증 재사용</td></tr>
<tr><td>자동 수집</td><td>IP 주소, 브라우저 정보(User-Agent), 로그인 유지 쿠키, 접속 기록, 오류 기록</td><td>부정 이용 방지, 비회원 무료 한도 관리, 보안, 장애 대응</td></tr>
<tr><td>AI 어시스턴트 대화</td><td>대화 내용</td><td>대화 응답, 서비스 품질 확인</td></tr>
<tr><td>카카오톡 채널</td><td>카카오가 제공하는 채널 사용자 식별값, 메시지 내용</td><td>채널 대화·검증 제공, 이용 한도 관리</td></tr>
<tr><td>API 이용 기업</td><td>담당자 이메일·회사명, API 호출 기록</td><td>API 제공, 사용량 집계와 과금</td></tr>
<tr><td>본인확인(통합인증서비스, 해당 기능 이용 시)</td><td>이름, 생년월일, 성별, 휴대전화번호, 연계정보(CI), 중복가입확인정보(DI)</td><td>본인 확인, 만 14세 미만 가입 제한, 중복 가입 및 부정 이용 방지, 유료 서비스 이용 시 본인 확인</td></tr>
</table>
<p>본인확인은 본인확인기관이 제공하는 통합인증서비스(카카오·네이버·PASS 등 인증서)를 통해 이뤄지며, 회사는 <b>주민등록번호를 수집하지 않습니다</b>. 연계정보(CI)는 본인확인기관이 주민등록번호를 일방향 암호화해 만든 값으로, 이용자를 서비스 간에 동일인으로 확인하는 데에만 쓰입니다.</p>
<p>유메 모바일 앱(Android·iOS)은 웹사이트와 같은 정보만 처리합니다. 앱은 연락처·위치·사진·카메라·마이크 등 기기 정보에 접근하지 않고, 광고 식별자를 수집하지 않으며, 이용자를 추적하지 않습니다. 앱에서 접속했는지 구분하기 위해 브라우저 정보(User-Agent)에 앱 이름이 포함됩니다.</p>

<h2>2. 보유 및 이용 기간</h2>
<table>
<tr><th>항목</th><th>기간</th></tr>
<tr><td>회원 정보와 회원의 검증 기록</td><td>탈퇴 시까지(회원이 기록을 삭제하면 즉시 파기). 무료 플랜은 최근 50건만 보관</td></tr>
<tr><td>비회원 웹 검증 기록, 카카오톡 채널 기록, AI 어시스턴트 대화</td><td>수집일로부터 180일</td></tr>
<tr><td>API 검증 기록과 호출 기록</td><td>수집일로부터 1년(과금·분쟁 대응)</td></tr>
<tr><td>본인확인 정보(이름·생년월일·성별·휴대전화번호·CI·DI)</td><td>탈퇴 시까지</td></tr>
<tr><td>로그인 세션</td><td>마지막 이용 후 30일</td></tr>
<tr><td>오류 기록</td><td>90일</td></tr>
</table>
<p>관계 법령에서 보존을 요구하는 경우(예: 전자상거래법상 계약·결제 기록 5년)에는 해당 기간 동안 분리해 보관합니다.</p>

<h2>3. 개인정보의 제3자 제공</h2>
<p>회사는 이용자의 개인정보를 제1항의 목적 범위에서만 처리하며, 다음의 경우를 제외하고 제3자에게 제공하지 않습니다.</p>
<h3>[선택 동의] 가명처리한 검증 데이터의 제공</h3>
<p>회원가입 또는 계정 설정에서 <b>데이터 활용에 별도로 동의한 회원</b>의 검증 기록에 한해, 아래와 같이 가명처리한 데이터를 제공할 수 있습니다. 동의하지 않아도 서비스 이용에 제한은 없으며, 언제든 계정 설정에서 철회할 수 있습니다. 철회하면 이후 제공 대상에서 즉시 제외됩니다.</p>
<table>
<tr><th>제공받는 자</th><td>회사와 데이터 이용 계약을 체결한 AI 개발 기업 및 연구기관 (제공 시 제공받는 자의 명칭을 이 방침에 추가해 공개합니다)</td></tr>
<tr><th>제공 목적</th><td>AI 답변의 사실 오류(할루시네이션) 연구, AI 모델의 정확도 개선</td></tr>
<tr><th>제공 항목</th><td>서비스가 추출한 주장 문장, 판정 결과와 근거·출처, 분야, 부존재 신뢰도 등 판정 지표, 월 단위 시점. <b>입력 원문, 이메일, IP 등 이용자를 알아볼 수 있는 정보는 제공하지 않으며</b>, 이름·연락처·주민등록번호·계좌번호·주소 번지 등은 가림 처리합니다.</td></tr>
<tr><th>보유 기간</th><td>제공받는 자와의 계약 기간(계약 종료 시 파기 의무 부과)</td></tr>
</table>
<p>비회원, 카카오톡 채널, API로 들어온 검증 데이터는 이 제공 대상에 포함되지 않습니다(API는 이용 기업이 계약으로 별도 허용한 경우에 한함).</p>

<h2>4. 개인정보 처리 위탁 및 국외 이전</h2>
<p>회사는 서비스 제공을 위해 다음과 같이 개인정보 처리를 위탁합니다. 이 중 국외 수탁자에게는 서비스 이용 시점에 네트워크를 통해 이전됩니다. 국외 이전을 원하지 않으면 서비스 이용을 중단하거나 탈퇴할 수 있으며, 이 경우 서비스 이용이 제한됩니다.</p>
<table>
<tr><th>수탁자(국가)</th><th>위탁 업무</th><th>이전 항목</th><th>보유 기간</th></tr>
<tr><td>Anthropic, PBC (미국)</td><td>검증 요청 텍스트의 주장 추출·분석, AI 어시스턴트 응답 생성</td><td>검증 요청 텍스트, 대화 내용</td><td>처리 후 수탁자 정책에 따른 기간(API 입력은 모델 학습에 사용되지 않음)</td></tr>
<tr><td>Supabase, Inc. (미국 법인, 데이터는 ${esc(process.env.DB_REGION_LABEL || "프로젝트 설정 지역의 데이터센터")}에 저장)</td><td>데이터베이스 저장 및 백업</td><td>이 방침 제1항의 모든 항목</td><td>위탁 계약 종료 시까지</td></tr>
<tr><td>Railway Corporation (미국)</td><td>서버 운영(요청 처리)</td><td>이 방침 제1항의 항목 중 처리 과정에서 전달되는 정보</td><td>처리 후 즉시(서버에 별도 저장하지 않음)</td></tr>
<tr><td>Resend, Inc. (미국)</td><td>비밀번호 재설정 등 안내 메일 발송</td><td>이메일 주소</td><td>발송 후 수탁자 정책에 따른 기간</td></tr>
<tr><td>주식회사 케이지이니시스 (대한민국)</td><td>본인확인(통합인증서비스)</td><td>이름, 생년월일, 성별, 휴대전화번호, 연계정보(CI), 중복가입확인정보(DI)</td><td>본인확인 완료 후 관계 법령에 따른 기간</td></tr>
</table>
<p>법령·판례 확인을 위해 주장에 포함된 법령명·조문·사건번호를 법제처 국가법령정보 공동활용 서비스에 조회하며, 이 과정에서 이용자 식별 정보는 전송하지 않습니다.</p>

<h2>5. 개인정보의 파기</h2>
<p>보유 기간이 끝나거나 처리 목적이 달성된 개인정보는 지체 없이 파기합니다. 전자적 파일은 복구할 수 없는 방법으로 삭제하며, 데이터베이스 백업에 남은 정보는 백업 보관 주기에 따라 순차적으로 삭제됩니다.</p>

<h2>6. 이용자의 권리와 행사 방법</h2>
<ul>
<li>개인정보 열람·이동: 계정 설정의 <b>내 데이터 내려받기</b>로 저장된 정보를 받을 수 있습니다.</li>
<li>정정·삭제: 계정 설정에서 이름을 수정하고, 검증 기록을 개별 삭제할 수 있습니다.</li>
<li>처리 정지·동의 철회: 계정 설정에서 데이터 활용 동의를 끄거나, 탈퇴할 수 있습니다(<a href="/account-deletion">계정 삭제 안내</a>).</li>
<li>그 밖의 요청은 ${esc(COMPANY.email)}로 보내주시면 10일 이내에 처리 결과를 알려드립니다.</li>
</ul>

<h2>7. 안전성 확보 조치</h2>
<ul>
<li>비밀번호는 복호화할 수 없는 방식(scrypt)으로, API 키는 해시로만 저장합니다.</li>
<li>모든 통신은 HTTPS로 암호화합니다.</li>
<li>관리자 접근은 권한이 부여된 계정으로 제한하고, 개인정보 열람·반출 기록을 보관합니다.</li>
<li>로그인 시도 횟수 제한 등 부정 접근 방지 조치를 적용합니다.</li>
</ul>

<h2>8. 쿠키</h2>
<p>회사는 로그인 상태를 유지하기 위한 필수 쿠키(yume_sid)만 사용하며, 광고·추적 목적의 쿠키는 사용하지 않습니다. 브라우저 설정에서 쿠키를 거부할 수 있으나 이 경우 로그인이 필요한 기능을 이용할 수 없습니다. 비회원의 최근 검증 기록은 이용자 브라우저의 로컬 저장소에만 보관됩니다.</p>

<h2>9. 개인정보 보호책임자</h2>
<table>
<tr><th>성명</th><td>${esc(COMPANY.ceo)} (대표)</td></tr>
<tr><th>연락처</th><td>${esc(COMPANY.email)}</td></tr>
</table>

<h2>10. 권익침해 구제 방법</h2>
<ul>
<li>개인정보분쟁조정위원회: (국번없이) 1833-6972, www.kopico.go.kr</li>
<li>개인정보침해신고센터: (국번없이) 118, privacy.kisa.or.kr</li>
<li>대검찰청: (국번없이) 1301, www.spo.go.kr</li>
<li>경찰청: (국번없이) 182, ecrm.police.go.kr</li>
</ul>

<h2>11. 방침의 변경</h2>
<p>이 개인정보처리방침은 ${PRIVACY_EFFECTIVE_DATE}부터 적용됩니다. 내용이 바뀌면 시행 7일 전부터 서비스에 공지합니다.</p>
<p class="muted">개정 이력: ${PRIVACY_EFFECTIVE_DATE} 본인확인(통합인증서비스) 처리 항목·위탁 추가 · 이전 방침 ${PRIVACY_PREVIOUS.join(", ")} 시행</p>`,
  );
}

export function renderApiDocsPage(baseUrl) {
  const base = esc(String(baseUrl).replace(/\/$/, ""));
  return layout(
    "API 문서",
    `<h1>유메 검증 API <span class="muted">v1</span></h1>
<p>자사 서비스의 AI 답변을 사용자에게 보여주기 전에 유메로 사실 여부를 확인하세요. 응답에는 주장별 판정·근거·출처와, 인용된 법령·판례·문헌이 공식 자료에 없을 때의 <b>부존재 신뢰도</b>가 함께 들어 있습니다.</p>

<h2>시작하기</h2>
<ol>
<li>유메에 가입하고 계정 메뉴의 <b>API 키</b>에서 키를 발급받습니다. 키는 발급할 때 한 번만 보여주므로 안전한 곳에 보관하세요.</li>
<li>모든 요청에 <code>Authorization: Bearer &lt;API 키&gt;</code> 헤더를 붙입니다.</li>
<li>키는 서버에서만 사용하세요. 브라우저·앱에 넣으면 누구나 키를 볼 수 있습니다.</li>
</ol>

<h2>POST /v1/verify</h2>
<p>텍스트 하나를 검증합니다. 검증에는 보통 10~40초가 걸립니다. <code>wait</code>를 주면 결과가 나올 때까지(최대 60초) 연결을 유지하고, 주지 않으면 즉시 <code>202</code>와 id를 돌려주므로 <code>GET /v1/verify/:id</code>로 조회하세요.</p>
<table>
<tr><th>필드</th><th>타입</th><th>설명</th></tr>
<tr><td><code>text</code></td><td>string</td><td>검증할 텍스트. 최대 10,000자</td></tr>
<tr><td><code>wait</code></td><td>boolean | number</td><td>선택. <code>true</code>면 최대 60초, 숫자면 그 초만큼 기다림</td></tr>
</table>
<pre>curl -X POST ${base}/v1/verify \\
  -H "Authorization: Bearer yume_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{"text": "대법원 2019다123456 판결에 따르면 …", "wait": true}'</pre>
<h3>Node.js</h3>
<pre>const res = await fetch("${base}/v1/verify", {
  method: "POST",
  headers: { Authorization: \`Bearer \${process.env.YUME_API_KEY}\`, "Content-Type": "application/json" },
  body: JSON.stringify({ text, wait: 30 }),
});
let job = await res.json();
while (job.status === "pending") {
  await new Promise((r) => setTimeout(r, 3000));
  job = await (await fetch(\`${base}/v1/verify/\${job.id}\`, { headers: { Authorization: \`Bearer \${process.env.YUME_API_KEY}\` } })).json();
}</pre>
<h3>Python</h3>
<pre>import os, time, requests
H = {"Authorization": f"Bearer {os.environ['YUME_API_KEY']}"}
job = requests.post("${base}/v1/verify", json={"text": text, "wait": 30}, headers=H).json()
while job["status"] == "pending":
    time.sleep(3)
    job = requests.get(f"${base}/v1/verify/{job['id']}", headers=H).json()</pre>

<h2>응답</h2>
<pre>{
  "id": "9f2c1a7b3d4e5f60",
  "status": "done",              // pending | done | error
  "cached": false,
  "created_at": "2026-09-12T03:10:00.000Z",
  "completed_at": "2026-09-12T03:10:21.000Z",
  "result": {
    "verdict": { "label": "부분적으로 부정확", "tone": "false", "detail": "3개 중 1개가 사실과 다릅니다 — …" },
    "domain": "법률",
    "claims": [
      {
        "text": "대법원 2019다123456 판결은 …",
        "domain": "법률",
        "verdict": "false",           // confirmed | false | uncertain
        "verified_via": "nec",        // official | nec | web | research | unavailable
        "explanation": "인용된 ‘2019다123456’은(는) 존재하지 않을 가능성이 높습니다(부존재 신뢰도 0.735). …",
        "sources": [],
        "legal_ref": { "type": "case", "case_number": "2019다123456" },
        "nec": {
          "identifier": { "type": "case", "canonical": "2019다123456", "searchSpace": "대법원 판결" },
          "score": 0.735, "grade": "nonexistent", "gradeLabel": "부존재 확실", "threshold": 0.7,
          "weights": { "w1": 0.65, "w2": 0.2, "w3": 0.15 },
          "coverage": { "value": 0.9, "estimated": true, "searched": [ … ] },
          "formatError": { "value": 0, "skippedSearch": false, "checks": [] },
          "proximity": { "value": 0, "similar": [] },
          "uncovered": [],
          "summary": "…"
        }
      }
    ]
  },
  "usage": { "used": 12, "quota": 1000, "remaining": 988, "resets_at": "2026-09-30T15:00:00.000Z" }
}</pre>

<h2>verified_via</h2>
<table>
<tr><td><code>official</code></td><td>법제처 국가법령정보의 현행 조문·판례·헌재 결정 원문과 대조</td></tr>
<tr><td><code>nec</code></td><td>인용된 식별자 또는 사실 주장을 공식 자료·웹에서 찾지 못해 부존재 신뢰도로 판정</td></tr>
<tr><td><code>web</code></td><td>실시간 웹 자료로 교차 확인</td></tr>
<tr><td><code>research</code></td><td>앞 단계에서 결론이 나지 않아 도메인별 심층 재확인을 거침</td></tr>
<tr><td><code>unavailable</code></td><td>외부 자료 조회에 실패해 확인되지 않음</td></tr>
</table>

<h2>부존재 신뢰도(NEC)</h2>
<p>AI가 존재하지 않는 판례·법령·논문을 지어내거나, 있지도 않은 통계·사건을 사실처럼 말하는 경우가 있습니다. 데이터베이스에서 "못 찾았다"는 사실만으로 곧바로 "없다"고 단정할 수는 없으므로, 유메는 다음 세 지표로 부존재 신뢰도를 산출합니다.</p>
<p>식별자(법령·판례·DOI 등)는 공식 레지스트리가 검색공간입니다. 식별자가 없는 일반 사실 주장은 <b>"이 주장이 사실이라면 어디에 기록되어 있어야 하는가"</b>를 검색공간으로 삼습니다 — 공공 통계·공시처럼 사실이라면 반드시 공표되는 영역을 충분히 탐색하고도 찾지 못하면 부존재 신뢰도가 임계값을 넘어 <code>사실과 다름</code>으로 판정합니다. 반대로 비공개 내부 정보나 개인 경험처럼 애초에 기록이 남지 않는 주장은 탐색 커버리지가 낮아 부존재로 단정하지 않고 <code>확인되지 않음</code>으로 남습니다.</p>
<pre>NEC = w1·C + w2·F + w3·(1 − P)</pre>
<ul>
<li><b>C 탐색 커버리지</b> — 탐색한 자료가 해당 식별자의 검색공간을 얼마나 덮는지(기관별 공표 수록 범위 기반 추정값)</li>
<li><b>F 형식오류 지수</b> — 체계·범위·시간·발급규칙 정합성 검사 결과. 형식상 존재할 수 없으면 탐색 없이 판정</li>
<li><b>P 유사항목 근접도</b> — 비슷한 실재 항목(한 글자 틀린 사건번호 등)이 있을수록 높음</li>
</ul>
<p><code>grade</code>가 <code>nonexistent</code>(NEC ≥ 0.7)이면 해당 주장은 <code>false</code>로, <code>unverifiable</code>이면 <code>uncovered</code>에 아직 확인하지 못한 영역과 확인 방법이 담깁니다. 지원 식별자: 판례 사건번호, 헌법재판소 사건번호, 법령·조문, DOI, arXiv, PMID, ISBN.</p>

<h2>GET /v1/verify/:id</h2>
<p>같은 계정의 키로 요청한 검증만 조회할 수 있습니다. 조회는 과금되지 않습니다.</p>

<h2>GET /v1/usage</h2>
<pre>{ "key": { "label": "운영 서버", "prefix": "yume_live_ab12cd…" }, "rate_per_min": 30,
  "month": { "used": 12, "quota": 1000, "remaining": 988, "resets_at": "…" } }</pre>

<h2>한도와 과금</h2>
<ul>
<li>과금 단위는 받아들여진 <code>POST /v1/verify</code> 1건입니다(같은 텍스트의 캐시 재사용 포함). 입력 오류·인증 실패·한도 초과로 거절된 요청은 과금되지 않습니다.</li>
<li>월 한도는 매달 1일 0시(KST)에 초기화됩니다. 한도 상향과 단가 협의는 ${esc(COMPANY.email)}로 문의해주세요.</li>
<li>키별 분당 요청 한도가 있으며, 초과 시 <code>429</code>와 <code>Retry-After</code> 헤더를 돌려줍니다.</li>
</ul>

<h2>오류</h2>
<pre>{ "error": { "code": "quota_exceeded", "message": "…" } }</pre>
<table>
<tr><th>HTTP</th><th>code</th><th>의미</th></tr>
<tr><td>400</td><td>invalid_request</td><td>text가 비어 있음</td></tr>
<tr><td>401</td><td>invalid_api_key</td><td>키가 없거나 폐기됨</td></tr>
<tr><td>404</td><td>not_found</td><td>검증 id가 없거나 다른 계정의 것</td></tr>
<tr><td>413</td><td>text_too_long</td><td>10,000자 초과</td></tr>
<tr><td>429</td><td>rate_limited / quota_exceeded</td><td>분당 한도 / 월 한도 초과</td></tr>
</table>

<h2>데이터 처리</h2>
<p>API로 보낸 텍스트는 검증과 과금·분쟁 대응을 위해 1년간 보관되며, 별도 계약으로 허용한 경우를 제외하고 데이터셋 제공 대상에 포함되지 않습니다. 텍스트에 개인정보가 들어간다면 귀사 이용자에게 필요한 고지·동의를 받아주세요. 자세한 내용은 <a href="/privacy">개인정보처리방침</a>과 <a href="/terms">이용약관</a>을 참고하세요.</p>`,
  );
}
