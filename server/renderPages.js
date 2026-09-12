// 서버 렌더링 정적 페이지: 이용약관·개인정보처리방침·비밀번호 재설정·API 문서.
// 사업자 정보는 환경변수로 채운다(비워두면 해당 줄을 표시하지 않음).
const COMPANY = {
  name: process.env.COMPANY_NAME || "리머(REAMER)",
  ceo: process.env.COMPANY_CEO || "정원영",
  email: process.env.COMPANY_EMAIL || "reamer@d-reamer.com",
  regNo: process.env.BUSINESS_REG_NO || "",
  address: process.env.BUSINESS_ADDRESS || "",
  mailOrderNo: process.env.MAIL_ORDER_NO || "",
};
const EFFECTIVE_DATE = "2026년 9월 12일";

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
  <div class="foot">${businessLine()}<br/><a href="/terms">이용약관</a> · <a href="/privacy"><b>개인정보처리방침</b></a> · <a href="/docs/api">API 문서</a></div>
</div>${script}</body></html>`;
}

export function businessLine() {
  return [
    `상호 ${esc(COMPANY.name)}`,
    `대표 ${esc(COMPANY.ceo)}`,
    COMPANY.regNo && `사업자등록번호 ${esc(COMPANY.regNo)}`,
    COMPANY.mailOrderNo && `통신판매업 신고 ${esc(COMPANY.mailOrderNo)}`,
    COMPANY.address && esc(COMPANY.address),
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
<li>"판정"이란 서비스가 검증 요청 속 사실 주장에 대해 제공하는 "확인됨", "사실과 다름", "판단 보류" 등의 결과와 그 근거를 말합니다.</li>
<li>"API"란 회원이 발급받은 키로 서비스의 검증 기능을 프로그램에서 호출할 수 있게 하는 인터페이스를 말합니다.</li>
</ol>

<h2>제3조 (약관의 효력과 변경)</h2>
<p>이 약관은 서비스 화면에 게시해 효력이 발생합니다. 회사는 관련 법령을 위반하지 않는 범위에서 약관을 변경할 수 있으며, 변경 시 시행일 7일 전(이용자에게 불리한 변경은 30일 전)부터 서비스에 공지합니다. 변경에 동의하지 않는 회원은 탈퇴할 수 있습니다.</p>

<h2>제4조 (서비스의 내용)</h2>
<ol>
<li>회사는 이용자가 입력한 텍스트에서 사실 주장을 추출하고, 법제처 국가법령정보 등 공식 데이터와 웹 자료를 대조해 판정과 근거를 제공합니다.</li>
<li>인용된 법령·판례·문헌을 공식 데이터에서 찾지 못한 경우, 회사는 탐색 범위와 식별자 형식을 바탕으로 산출한 "부존재 신뢰도"와 아직 확인하지 못한 영역을 함께 안내합니다.</li>
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
<li>유료 플랜의 결제·환불 조건은 결제 기능을 제공할 때 별도로 고지하며, 관련 법령(전자상거래법 등)에 따릅니다.</li>
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

export function renderPrivacyPage() {
  return layout(
    "개인정보처리방침",
    `<h1>개인정보처리방침</h1><p class="muted">시행일: ${EFFECTIVE_DATE}</p>
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
</table>

<h2>2. 보유 및 이용 기간</h2>
<table>
<tr><th>항목</th><th>기간</th></tr>
<tr><td>회원 정보와 회원의 검증 기록</td><td>탈퇴 시까지(회원이 기록을 삭제하면 즉시 파기). 무료 플랜은 최근 50건만 보관</td></tr>
<tr><td>비회원 웹 검증 기록, 카카오톡 채널 기록, AI 어시스턴트 대화</td><td>수집일로부터 180일</td></tr>
<tr><td>API 검증 기록과 호출 기록</td><td>수집일로부터 1년(과금·분쟁 대응)</td></tr>
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
<p>회사는 서비스 제공을 위해 다음과 같이 개인정보 처리를 위탁하며, 수탁자는 국외에 있습니다. 이전은 서비스 이용 시점에 네트워크를 통해 이루어집니다. 국외 이전을 원하지 않으면 서비스 이용을 중단하거나 탈퇴할 수 있으며, 이 경우 서비스 이용이 제한됩니다.</p>
<table>
<tr><th>수탁자(국가)</th><th>위탁 업무</th><th>이전 항목</th><th>보유 기간</th></tr>
<tr><td>Anthropic, PBC (미국)</td><td>검증 요청 텍스트의 주장 추출·분석, AI 어시스턴트 응답 생성</td><td>검증 요청 텍스트, 대화 내용</td><td>처리 후 수탁자 정책에 따른 기간(API 입력은 모델 학습에 사용되지 않음)</td></tr>
<tr><td>Supabase, Inc. (미국 법인, 데이터는 ${esc(process.env.DB_REGION_LABEL || "프로젝트 설정 지역의 데이터센터")}에 저장)</td><td>데이터베이스 저장 및 백업</td><td>이 방침 제1항의 모든 항목</td><td>위탁 계약 종료 시까지</td></tr>
<tr><td>Railway Corporation (미국)</td><td>서버 운영(요청 처리)</td><td>이 방침 제1항의 항목 중 처리 과정에서 전달되는 정보</td><td>처리 후 즉시(서버에 별도 저장하지 않음)</td></tr>
<tr><td>Resend, Inc. (미국)</td><td>비밀번호 재설정 등 안내 메일 발송</td><td>이메일 주소</td><td>발송 후 수탁자 정책에 따른 기간</td></tr>
</table>
<p>법령·판례 확인을 위해 주장에 포함된 법령명·조문·사건번호를 법제처 국가법령정보 공동활용 서비스에 조회하며, 이 과정에서 이용자 식별 정보는 전송하지 않습니다.</p>

<h2>5. 개인정보의 파기</h2>
<p>보유 기간이 끝나거나 처리 목적이 달성된 개인정보는 지체 없이 파기합니다. 전자적 파일은 복구할 수 없는 방법으로 삭제하며, 데이터베이스 백업에 남은 정보는 백업 보관 주기에 따라 순차적으로 삭제됩니다.</p>

<h2>6. 이용자의 권리와 행사 방법</h2>
<ul>
<li>개인정보 열람·이동: 계정 설정의 <b>내 데이터 내려받기</b>로 저장된 정보를 받을 수 있습니다.</li>
<li>정정·삭제: 계정 설정에서 이름을 수정하고, 검증 기록을 개별 삭제할 수 있습니다.</li>
<li>처리 정지·동의 철회: 계정 설정에서 데이터 활용 동의를 끄거나, 탈퇴할 수 있습니다.</li>
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
<p>이 개인정보처리방침은 ${EFFECTIVE_DATE}부터 적용됩니다. 내용이 바뀌면 시행 7일 전부터 서비스에 공지합니다.</p>`,
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
        "verified_via": "nec",        // official | nec | web | unavailable
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
<tr><td><code>nec</code></td><td>인용된 식별자를 공식 자료에서 찾지 못해 부존재 신뢰도로 판정</td></tr>
<tr><td><code>web</code></td><td>실시간 웹 자료로 교차 확인</td></tr>
<tr><td><code>unavailable</code></td><td>외부 자료 조회에 실패해 판단 보류</td></tr>
</table>

<h2>부존재 신뢰도(NEC)</h2>
<p>AI가 존재하지 않는 판례·법령·논문을 지어내는 경우, 데이터베이스에서 "못 찾았다"는 사실만으로 "없다"고 단정할 수는 없습니다. 유메는 다음 세 지표로 부존재 신뢰도를 산출합니다.</p>
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
