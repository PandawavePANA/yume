// 대표 할 일의 처음 목록과 "어떻게 하나요" 안내(2026-10-14 대표: "할 일은 어떻게 하면 되는지 자세히 적어줘").
// 화면에서 "어떻게 하나요"를 펼치면 이 글이 그대로 보인다. 글을 고치면 다음 정리(10분) 때 열린 할 일에도 반영된다.
// 버튼 이름·메뉴 위치는 각 서비스가 바꿀 수 있다 — 안 보이면 비슷한 이름을 찾거나 Claude에게 화면을 보여 주세요.

export const SEED = [
  {
    key: "outreach_domain",
    priority: 1,
    title: "유메 메일 도메인(yume-reamer.com) 인증",
    link: "https://resend.com/domains",
    check_key: "outreach_domain",
    steps: `왜: 감사 결과 메일이 "정원영 (유메) <hello@yume-reamer.com>"로 나가려면 이 도메인을 메일 발송 서비스(Resend)에 인증해야 합니다. 지금은 첫 메일 발송이 막혀 있습니다. (약 15분 + 반영 대기)

① Resend에 도메인 추가 (3분)
  1. resend.com 에 로그인 — 지금 Ballast 메일을 보내는 그 계정입니다.
  2. 왼쪽 메뉴 Domains → 오른쪽 위 Add Domain
  3. Domain: yume-reamer.com / Region: Tokyo (ap-northeast-1) → Add
  4. DNS 레코드 3줄이 나옵니다. 이 창은 닫지 말고 그대로 두세요.

② 호스팅어에 DNS 레코드 넣기 (7분)
  1. hpanel.hostinger.com 로그인 → 도메인 → yume-reamer.com → DNS / 네임서버 → DNS 레코드 관리
  2. Resend 화면의 값을 한 줄씩 그대로 복사해 "레코드 추가"
     · TXT  이름: resend._domainkey   값: Resend에 보이는 긴 값(p=MIG… 로 시작)
     · MX   이름: send   값: Resend에 보이는 주소(feedback-smtp.ap-northeast-1.amazonses.com 같은 것)   우선순위: 10
     · TXT  이름: send   값: v=spf1 include:amazonses.com ~all
     · TXT  이름: _dmarc   값: v=DMARC1; p=none;   ← Resend에는 없지만 꼭 넣으세요(스팸함 방지)
  3. 주의: 이름 칸에는 send 처럼 앞부분만 씁니다(send.yume-reamer.com 아님). TTL은 기본값. 이미 있는 레코드(사이트 연결 A·CNAME, google-site-verification)는 건드리지 마세요.

③ 인증 확인
  1. Resend 도메인 화면 → Verify DNS Records
  2. 세 줄이 모두 초록색 Verified가 되면 끝(보통 몇 분, 길면 1시간). 1시간이 지나도 안 되면 그 화면을 캡처해 Claude에게.

④ 여기서 '완료' 체크
  서버가 hello@yume-reamer.com 으로 대표 메일함(reamer@d-reamer.com)에 시험 메일을 보냅니다. 성공하면 바로 첫 메일 발송이 열립니다.
  · "restricted" 같은 오류로 실패하면: 서버의 Resend 키가 ballast-reamer.com 전용일 수 있습니다. Resend → API Keys → Create API Key(Permission: Sending access, Domain: All domains) → Railway → yume 서비스 → Variables의 RESEND_API_KEY 값을 새 키로 바꾸고, 옛 키는 Resend에서 삭제.`,
  },
  {
    key: "gmail",
    priority: 1,
    title: "대표 메일함(Gmail) 연결 — 앱 비밀번호",
    link: "https://myaccount.google.com/apppasswords",
    check_key: "gmail",
    steps: `왜: 비서실 서윤이 reamer@d-reamer.com 메일함을 10분마다 읽고, 답장이 필요한 메일은 초안을 붙여 결재로 올리게 됩니다. 구글 로그인 비밀번호는 쓰지 않고, 이 연결 전용 "앱 비밀번호"를 씁니다. (약 10분)

① 2단계 인증 켜기 (이미 켜져 있으면 건너뛰기)
  1. reamer@d-reamer.com 으로 로그인한 상태에서 myaccount.google.com → 보안
  2. "Google에 로그인하는 방법" → 2단계 인증 → 사용 설정(휴대폰 번호 등록)
  · 메뉴가 없거나 회색이면: admin.google.com(관리 콘솔) → 보안 → 인증 → 2단계 인증 → "사용자가 2단계 인증을 사용하도록 허용" 체크 → 저장 → 다시 1번부터.

② IMAP 켜기
  1. Gmail → 오른쪽 위 톱니바퀴 → 모든 설정 보기 → "전달 및 POP/IMAP" 탭
  2. IMAP 액세스 칸에 "IMAP 사용" 선택지가 있으면 켜고 저장.
     선택지 없이 "Auto-Expunge on/off" 같은 세부 설정만 보이면 이미 켜져 있는 것입니다(구글이 켜기 버튼을 없앴음) — 아무것도 바꾸지 말고 다음 단계로.
  · IMAP 칸 자체가 없으면: 관리 콘솔 → 앱 → Google Workspace → Gmail → 최종 사용자 액세스 → "POP 및 IMAP 액세스" 사용 → 저장.

③ 앱 비밀번호 만들기
  1. myaccount.google.com/apppasswords 접속(위 '열기' 버튼)
  2. 앱 이름: 유메 비서 → 만들기
  3. 노란 상자의 16자리를 복사(띄어쓰기 있어도 괜찮음). 이 창을 닫으면 다시 볼 수 없으니 바로 4단계로.

④ Railway에 직접 넣기 (비밀번호를 Claude에게 보내지 마세요)
  1. railway.app 로그인 → 유메 프로젝트 → yume 서비스 → Variables 탭
  2. New Variable 로 두 개 추가
     · GMAIL_USER = reamer@d-reamer.com
     · GMAIL_APP_PASSWORD = 방금 복사한 16자리
  3. 위쪽에 뜨는 Deploy(변경 적용) 버튼을 누르면 2~3분 뒤 서버가 다시 뜹니다.

⑤ 여기서 '완료' 체크 — 서버가 연결 설정을 확인합니다. 10분 안에 AI 본사 위쪽이 "메일함 연결됨"으로 바뀌고, 처음엔 최근 3일치 메일부터 정리합니다.
  · 그만 쓰려면: Railway에서 GMAIL_APP_PASSWORD를 지우거나, myaccount.google.com/apppasswords 에서 "유메 비서"를 삭제하면 바로 끊깁니다.`,
  },
  {
    key: "anthropic_reload",
    priority: 1,
    title: "Anthropic 잔액 충전 · 자동 충전 켜기",
    link: "https://console.anthropic.com/settings/billing",
    steps: `왜: 지금 키는 잔액이 적은 테스트용입니다. 잔액이 바닥나면 AI 직원, 검사 엔진, 그리고 이니시스 심사 결제(충전 화면)까지 함께 멈춥니다. (약 5분)

① 충전
  1. console.anthropic.com 로그인 → Settings → Billing (위 '열기' 버튼)
  2. Buy credits(또는 Add credits) → 50달러 이상 권장
     · 직원 AI 예산이 하루 최대 약 13달러(업무 3 + 감사 채점 10)라 50달러면 넉넉히 며칠, 보통은 훨씬 덜 씁니다.

② 자동 충전 켜기
  같은 Billing 화면 → Auto reload → 켜기 → "잔액이 10달러 아래로 내려가면 30달러 충전" 정도로 설정 → 저장

③ 새 키로 바꾸기 (권장 — 지금 키가 대화에 노출됐었음)
  1. Settings → API Keys → Create Key → 이름: yume-prod → 키 복사(sk-ant-… 한 번만 보임)
  2. Railway → 유메 프로젝트 → yume 서비스 → Variables → ANTHROPIC_API_KEY 값을 새 키로 바꾸고 Deploy
  3. 서버가 다시 뜬 뒤 AI 본사 위쪽이 "검사 엔진 정상"인지 확인 → 옛 키는 API Keys에서 Disable(비활성화)
  4. 로컬 PC의 유메\\.env 파일 ANTHROPIC_API_KEY도 같은 새 키로(현장 요원·러너가 씁니다). 어렵다면 Claude에게 "키 바꿨어"라고 하면 PC 쪽은 맞춰 드립니다.

④ 여기서 '완료' 체크`,
  },
  {
    key: "biz_address",
    priority: 2,
    title: "홈택스 사업자등록 소재지 정정 (테크노상업로 112, 204호)",
    link: "https://www.hometax.go.kr",
    steps: `왜: 사이트와 이니시스 심사는 사업자등록증 주소를 기준으로 봅니다. 사이트는 2026-10-16에 새 주소(테크노상업로 112, 204호)로 바꿨으니, 등록증도 같은 주소로 정정해야 서로 맞습니다. (약 20분 + 처리 2~3일)

① 준비물
  · 무상사용승낙서 — 어머니(상가 소유자)가 "리머(정원영)에게 테크노상업로 112, 204호를 무상으로 사업장으로 쓰게 한다"는 내용에 서명·날인. 양식은 인터넷에 "무상사용승낙서 양식"으로 많습니다.
  · 어머니 신분증 사본
  · (월세를 낸다면 무상사용승낙서 대신 임대차계약서)
  · 공동인증서 또는 금융인증서(홈택스 로그인용)

② 신청
  1. hometax.go.kr 로그인 → 신청/제출 → 사업자등록 신청·정정·휴폐업 → "사업자등록 정정(개인)"
  2. 사업장 정보에서 소재지를 "대구광역시 달성군 유가읍 테크노상업로 112, 204호"로 변경
  3. 사업장 임대 여부: 타인 소유 · 무상(또는 임대차) 선택
  4. 첨부: 무상사용승낙서, 소유자 신분증 사본 → 제출
  5. 처리는 보통 2~3 영업일. 세무서에서 확인 전화가 올 수 있습니다.
  · 통신판매업 신고를 했다면 정부24에서 통신판매업 변경 신고(소재지)도 함께 하세요.

③ 끝나면
  1. 홈택스 → 민원증명 → 사업자등록증 재발급 → PDF로 저장(이니시스·크몽에 보낼 것)
  2. 여기서 '완료' 체크 → 다음 할 일 "이니시스 가맹점·보증보험 주소 변경"이 올라옵니다
  3. Claude에게 "주소 바꿔"라고 말하면 유메·기업용·리머 사이트 주소를 새 주소로 바꿉니다.`,
  },
  {
    key: "inicis_address",
    priority: 2,
    title: "이니시스 가맹점·보증보험 주소 변경",
    after_key: "biz_address",
    steps: `왜: 카드 가맹점 정보와 보증보험 증권 주소가 사업자등록증과 같아야 정산·심사가 문제없습니다. (약 10분)

① 이니시스
  1. 이니시스 담당자(조선아, sunachozz@kggroup.co.kr)에게 메일
     제목 예: [유메/리머] 사업장 소재지 변경 요청
     본문 예: 사업자등록 소재지를 "대구광역시 달성군 유가읍 테크노상업로 112, 204호"로 정정했습니다. 정정된 사업자등록증을 첨부합니다. 가맹점 정보의 주소 변경을 부탁드립니다.
  2. 첨부: 정정된 사업자등록증 PDF
  · 이니시스 가맹점 관리자 화면에서 직접 바꿀 수 있으면 그렇게 해도 됩니다.

② 보증보험
  1. 가입한 보증보험사(증권 발급처) 고객센터·지점에 연락해 "증권 주소 변경(배서)"을 요청
  2. 정정된 사업자등록증을 보내면 처리해 줍니다. 변경된 증권을 이니시스가 요구하면 같이 보내세요.

③ 크몽·은행 등 사업자 정보를 등록해 둔 곳도 주소를 바꾸세요(크몽: 마이크몽 → 계정 설정 → 사업자 정보).

④ 여기서 '완료' 체크`,
  },
  {
    key: "kmong_mvp",
    priority: 2,
    title: "크몽 '모두의 창업 시제품·MVP 제작' 서비스 등록",
    link: "https://kmong.com",
    steps: `왜: 모두의 창업 진출자들이 협약 기간 안에 외주처를 찾는 시기라, 리머의 가장 빠른 매출 통로입니다. 모든 글과 이미지는 이미 만들어져 있습니다. (약 20분 + 크몽 심사 1~3 영업일)

① 자료 위치 (PC)
  바탕화면\\유메\\마켓등록\\크몽\\09_모두의창업시제품_MVP제작\\
  · 0_09_모두의창업_참고.txt — 먼저 한 번 읽기
  · 1_메인이미지.png, 2_상세_01 ~ 08 이미지
  · 등록문구.txt — 칸별로 나눠 적어 둠

② 등록
  1. kmong.com 판매자(전문가) 계정으로 로그인 → 마이크몽 → 서비스 등록(새 서비스)
  2. 등록문구.txt의 순서대로 붙여 넣기
     카테고리(추천) → 서비스 제목 → 검색 키워드 → 서비스 설명(전체 그대로) → 가격 패키지 3단(STANDARD·DELUXE·PREMIUM: 이름·설명·가격·작업일·수정 횟수) → 작업 전 요청사항 → 서비스 제공 절차 → 수정 및 재진행 안내 → 자주 묻는 질문
  3. 이미지: 메인에 1_메인이미지.png, 상세에 2_상세_01부터 08까지 파일 이름 순서대로
  4. 저장 → 심사 요청

③ 주의
  · 본문·제목·이미지에 전화번호·이메일·링크·SNS를 넣지 마세요(반려 사유).
  · 가격은 출발가 그대로. 후기 5개쯤 쌓이면 20~40% 올립니다.

④ 심사 요청까지 했으면 여기서 '완료' 체크(반려되면 사유를 Claude에게 보여 주세요).`,
  },
  {
    key: "b2b_terms",
    priority: 3,
    title: "기업 이용 조건 한 번 읽어 보기 (환불·책임 한도·관할)",
    link: "https://www.yume-reamer.com/b2b/terms",
    steps: `왜: 기업이 감사·API를 살 때 동의하는 표준 조건입니다. Claude가 쓴 초안이라 대표님이 한 번 봐야 합니다. 세 곳만 보면 됩니다. (약 10분)

① 제9조 해지와 환불
  · 월 약정: 다음 결제일 전에 알리면 그다음 달부터 해지, 시작된 달은 환불 없음
  · 감사·PoC: 착수 전 취소는 전액 환불, 착수 후는 진행한 만큼 정산
  → 이대로 괜찮은지(예: 감사 착수 후 환불 비율을 정해 둘지)

② 제10조 책임의 한도
  · 손해배상은 직접 손해만, 금액은 직전 3개월 동안 받은 돈까지
  → 1인 회사에 맞게 위험을 묶어 둔 선입니다. 더 줄이거나 늘릴지

③ 제12조 관할
  · 분쟁이 생기면 대구지방법원
  → 그대로 두면 됩니다

바꿀 곳이 있으면 Claude에게 "9조 이렇게 바꿔"처럼 말하면 고칩니다(바꾸면 조건 판 번호가 올라갑니다). 없으면 여기서 '완료' 체크.`,
  },
  {
    key: "modu_result",
    priority: 1,
    title: "모두의 창업 발표 확인",
    due_date: "2026-10-15",
    steps: `오늘 발표일입니다.

1. 신청한 모두의 창업 누리집(마이페이지)과 문자·메일에서 결과를 확인
2. 결과를 Claude에게 알려 주세요 — 합격 여부, 지원금 금액, 협약·교육 일정, 제출해야 할 서류
   · 합격이면 지원금 사용 계획과 일정표를 거기에 맞춰 다시 짭니다.
3. 여기서 '완료' 체크`,
  },
  {
    key: "tax_general",
    priority: 2,
    title: "일반과세 시작 — 이제 세금계산서를 발급할 수 있어요",
    due_date: "2026-11-01",
    steps: `오늘부터 일반과세자입니다(간이과세 포기 신고 반영).

① 바뀌는 것
  · 오늘 이후 공급분은 기업 고객에게 전자세금계산서를 발급합니다. 10월까지 공급분은 현금영수증(지출증빙)으로 처리합니다.
  · 매출에서 받은 부가세는 분기마다 신고·납부합니다(첫 신고: 2027년 1월 25일까지, 10~12월분).

② 세금계산서 발급 방법(계약이 들어오면)
  1. AI 본사 '작업 리스트' 또는 '기업 거래' 화면에서 해당 주문의 "세금계산서 정보 복사"
  2. hometax.go.kr 로그인(공동인증서) → 전자(세금)계산서 → 발급 → 건별 발급
  3. 복사한 내용대로 공급받는자(사업자번호·상호·대표자·이메일)·품목·공급가액 입력. 작성일자는 공급일(입금받았으면 입금일), 입금 후면 '영수', 전이면 '청구'
  4. 발급 → 고객 이메일로 자동 발송

③ 여기서 '완료' 체크`,
  },
  {
    key: "sojin_loan",
    priority: 2,
    title: "업력 90일 — 소진공 신용취약 소상공인 자금 직접대출 신청 가능",
    due_date: "2026-12-15",
    link: "https://ols.semas.or.kr",
    steps: `오늘로 개업(2026-09-16) 90일이 지나 신청 자격이 생깁니다.

1. ols.semas.or.kr(소상공인정책자금 누리집) 로그인 → 정책자금 신청 → 신용취약소상공인자금 → "직접대출"로 신청
   · 대리대출은 보증서가 필요해 지금은 어렵습니다 — 직접대출로.
2. 준비물: 사업자등록증명, 부가가치세 과세표준증명(또는 매출 자료), 대표자 신분증, 통장 사본
3. 온라인 접수 뒤 지역센터 상담·교육 안내가 옵니다. 일정이 오면 Claude에게 알려 주세요.
4. 신청했으면 여기서 '완료' 체크`,
  },
  // ── 2026-10-14 대표가 말해 준 일 ──
  {
    key: "startup_registration",
    title: "창업기업 등록 다시 하기",
    priority: 1,
    steps: `대표님이 카카오톡 "나에게 보내기"에 관련 자료를 보내 두셨습니다(카톡은 Claude가 열 수 없어요).

1. 카톡 "나에게 보내기"에서 그 자료(안내문·링크·서류)를 엽니다.
2. 안내에 적힌 시스템에 로그인해 창업기업 등록(확인) 신청을 다시 합니다. 보통 필요한 것:
   · 사업자등록증명(홈택스 → 민원증명 → 사업자등록증명, PDF)
   · 대표자 정보, 개업일(2026-09-16), 업종(정보통신업·응용 소프트웨어 개발)
   · 사업장 주소 — 테크노상업로 112, 204호(사업자등록증 주소와 같게).
3. 막히는 부분이 있으면 그 자료 내용을 Claude에게 붙여 넣거나 캡처해 보여 주세요 — 칸별로 무엇을 쓸지 정리해 드립니다.
4. 신청했으면 여기서 '완료' 체크(처리 결과가 나오면 업무 일지에 '내가 한 일'로 적어 두세요).`,
  },
  {
    key: "inicis_guarantee_reply",
    title: "KG이니시스 보증보험 관련 메일에 답장",
    priority: 1,
    steps: `메일함이 연결돼서 비서실 서윤이 관련 메일을 찾아 답장 초안을 결재함에 올려 두었습니다.
  · "답장 — SGI 서울보증 마포지점: 보증보험 가입 신청"
  · "답장 — 조선아: 유메 리머 진행 부탁드립니다" (KG이니시스)

1. AI 본사 → 결재함에서 두 문서를 엽니다. 위쪽에 받은 메일 원문, 아래에 답장 초안이 있습니다.
2. 초안을 읽고 필요한 곳을 고칩니다(예: 증권 번호·가입 금액·보험 기간, [확인 필요] 표시가 있으면 채우기).
   · 증권 파일(PDF) 첨부가 필요한 경우는 지금은 메일함에서 직접 보내 주세요(결재 답장은 글만 보냅니다).
3. 승인 → 대표 PC의 현장 요원이 1분 안에 대표 주소로 보냅니다. 결재 기록이 "보냄"으로 바뀌면 끝.
4. 둘 다 보냈으면 여기서 '완료' 체크.`,
  },
  // ── 2026-10-16 급함 — 무궁(무궁.com)·결제·로그인·한국 공식 데이터. 대표만 할 수 있는 일을 한곳에 ──
  // 키·시크릿은 채팅에 붙이지 않고 Railway 화면에 직접 넣는다. 넣은 뒤 Claude에게 말하면 실제로 되는지 확인한다.
  {
    key: "portone_v2_secret",
    title: "[급함·결제] 포트원 V2 시크릿 넣기 — 지금 상태로는 이니시스가 열려도 유메 결제가 안 됩니다",
    priority: 1,
    link: "https://admin.portone.io",
    steps: `왜: 10-16 Claude가 확인해 보니 Railway yume 서비스에 있는 PORTONE_API_SECRET은 포트원 V2에서 인증이 안 됩니다(401). 유메 코드는 PORTONE_V2_API_SECRET이라는 이름의 V2 시크릿을 씁니다. 이게 없으면 이니시스 적용(2~3일 뒤)이 끝나도 결제창이 열리지 않습니다. (약 5분)

① 포트원에서 V2 시크릿 받기
  1. admin.portone.io 로그인 → 왼쪽 '결제 연동' → '연동 정보'(또는 '식별코드 · API Keys')
  2. 'V2 API' 탭 → API Secret '발급'(이름: yume-server) → 나온 값을 복사(다시 볼 수 없으니 바로 ②로)

② Railway에 넣기
  1. railway.com → 프로젝트 yume → yume 서비스 → Variables → New Variable
     이름: PORTONE_V2_API_SECRET   값: ①에서 복사한 값
  2. 같은 프로젝트 → mugung 서비스 → Variables → New Variable
     이름: PORTONE_V2_API_SECRET   값: \${{yume.PORTONE_V2_API_SECRET}}   ← 이 글자를 그대로(유메 값을 가리키는 표시라 값을 또 붙일 필요 없음)
  3. 저장하면 두 서비스가 자동으로 다시 배포됩니다.

③ Claude에게 "포트원 시크릿 넣었어" — 값을 보지 않고 인증만 되는지 확인합니다. 되면 옛 PORTONE_API_SECRET은 지워도 됩니다.
④ 여기서 '완료' 체크`,
  },
  {
    key: "rotate_google_pw_1016",
    title: "[급함·보안] 대화에 노출된 구글 계정 비밀번호 바꾸기(호스팅어 로그인용 계정)",
    priority: 1,
    link: "https://myaccount.google.com/security",
    steps: `10-16 Claude와의 대화에 호스팅어 로그인용 구글 계정의 비밀번호가 그대로 적혔습니다. 대화 기록에 남으므로 바로 바꾸는 게 안전합니다. (약 5분)

1. 그 구글 계정으로 myaccount.google.com → 보안 → 비밀번호 → 새 비밀번호(다른 곳에서 쓰지 않은 것)
2. 같은 화면에서 2단계 인증이 꺼져 있으면 켜기(휴대폰 번호 또는 Google 메시지)
3. 보안 → "기기 관리"에서 모르는 기기가 있으면 로그아웃
4. 여기서 '완료' 체크`,
  },
  {
    key: "mugung_keys",
    title: "[급함·무궁] 무궁 서버에 유메 API 키 한 줄 넣기 — 이것만 넣으면 무궁.com이 답합니다",
    priority: 1,
    link: "https://railway.com/project/2ad493c4-75b5-45f2-94fd-c181c2f89ea3",
    steps: `10-16 Claude가 해 둔 것: Anthropic 키는 유메 키를 가리키게 연결(나중에 무궁 전용으로 바꾸면 됨), 대표님이 채팅에 준 유메 키(yume_live_b7ce45…)의 한도를 무궁용(월 100만 건)으로 올림.
남은 것 — 키 값은 Claude가 넣지 않습니다(대표 원칙). 1분이면 됩니다.

1. railway.com → 프로젝트 yume → mugung 서비스 → Variables → New Variable
   이름: YUME_API_KEY   값: 그 유메 키(yume_live_b7ce45로 시작하는 것)
2. 저장 → 2~3분 뒤 무궁.com에서 아무 질문이나 해 보기. 답이 나오면 '완료' 체크
3. 나중에(테스트 끝나면) 이 키는 대화에 노출됐으니 유메 계정 → API 키에서 폐기하고 새 키로 바꾸기. Anthropic도 무궁 전용 키를 만들어 ANTHROPIC_API_KEY를 바꾸면 원가가 유메와 나뉩니다.`,
  },
  {
    key: "kakao_login",
    title: "[급함·로그인] 카카오 로그인 앱 만들기(무궁.com)",
    priority: 1,
    link: "https://developers.kakao.com/console/app",
    steps: `무궁.com에 '카카오로 계속하기'가 생기게 합니다. 처음 로그인이 곧 가입입니다. (약 15분)

1. developers.kakao.com → 로그인 → 내 애플리케이션 → 애플리케이션 추가하기
   · 앱 이름: 무궁 · 회사명: 리머 · 카테고리: 생산성
2. 앱 설정 → 플랫폼 → Web 플랫폼 등록 → 사이트 도메인: https://xn--of0bu3x.com  (무궁.com의 기계 표기 — 한글 대신 이걸 넣습니다)
3. 제품 설정 → 카카오 로그인 → 활성화 ON → Redirect URI 등록:
   https://xn--of0bu3x.com/api/auth/kakao/callback
4. 카카오 로그인 → 동의항목: 닉네임(필수). 이메일은 비즈 앱 전환이 필요해 나중에.
5. 앱 설정 → 앱 키 → REST API 키 복사 → Railway mugung 서비스 Variables:
   KAKAO_REST_API_KEY = 그 키
6. (권장) 제품 설정 → 카카오 로그인 → 보안 → Client Secret 코드 생성 · 활성화 → KAKAO_CLIENT_SECRET = 그 코드
7. 저장 후 2~3분 뒤 무궁.com → 메뉴 → 로그인에 카카오 버튼이 보이면 '완료' 체크`,
  },
  {
    key: "naver_login",
    title: "[급함·로그인] 네이버 로그인 앱 만들기(무궁.com)",
    priority: 1,
    link: "https://developers.naver.com/apps/#/register",
    steps: `무궁.com에 '네이버로 계속하기'가 생기게 합니다. (약 15분 + 검수)

1. developers.naver.com → 로그인 → Application → 애플리케이션 등록
   · 애플리케이션 이름: 무궁
   · 사용 API: 네이버 로그인 → 제공 정보: 별명(필수), 이메일 주소(선택)
   · 로그인 오픈 API 서비스 환경: PC 웹 추가
     서비스 URL: https://xn--of0bu3x.com
     네이버 로그인 Callback URL: https://xn--of0bu3x.com/api/auth/naver/callback
   · 모바일 웹도 같은 값으로 추가
2. 등록 → Client ID와 Client Secret 복사 → Railway mugung 서비스 Variables:
   NAVER_CLIENT_ID = Client ID
   NAVER_CLIENT_SECRET = Client Secret
3. 처음에는 '개발 중' 상태라 등록한 관리자(대표 계정)만 로그인됩니다. 내 애플리케이션 → 검수 요청 → 서비스 적용 신청(서비스 소개·화면 캡처 필요 — Claude에게 말하면 문구·캡처를 준비해 드림). 승인되면 누구나 로그인 가능.
4. 무궁.com에서 네이버 버튼이 보이고 대표 계정으로 로그인되면 '완료' 체크`,
  },
  {
    key: "google_login",
    title: "[급함·로그인] 구글 로그인 앱 만들기(무궁.com)",
    priority: 1,
    link: "https://console.cloud.google.com/apis/credentials",
    steps: `무궁.com에 'Google로 계속하기'가 생기게 합니다. (약 20분)

1. console.cloud.google.com → 위쪽 프로젝트 선택 → 새 프로젝트: 무궁
2. API 및 서비스 → OAuth 동의 화면(Google 인증 플랫폼 → 브랜딩)
   · 앱 이름: 무궁 · 지원 이메일: reamer@d-reamer.com · 대상: 외부
   · 앱 홈페이지: https://xn--of0bu3x.com
   · 개인정보처리방침: https://xn--of0bu3x.com/privacy · 서비스 약관: https://xn--of0bu3x.com/terms
   · 승인된 도메인: xn--of0bu3x.com
   · 범위(데이터 액세스): openid, email, profile (민감한 범위 아님 — 심사 없이 바로 됨)
   · 게시 상태: '프로덕션으로 푸시'(테스트 상태면 등록한 사람만 로그인됨)
3. 사용자 인증 정보(클라이언트) → 사용자 인증 정보 만들기 → OAuth 클라이언트 ID → 애플리케이션 유형: 웹 애플리케이션
   · 승인된 리디렉션 URI: https://xn--of0bu3x.com/api/auth/google/callback
4. 나온 클라이언트 ID·클라이언트 보안 비밀번호 → Railway mugung 서비스 Variables:
   GOOGLE_CLIENT_ID = 클라이언트 ID
   GOOGLE_CLIENT_SECRET = 클라이언트 보안 비밀번호
5. 무궁.com에서 Google 버튼으로 로그인되면 '완료' 체크`,
  },
  {
    key: "inicis_billing",
    title: "[급함·결제] 이니시스에 무궁.com 판매 추가 확인(사이트·상품·정기결제)",
    priority: 1,
    steps: `왜: 이번 이니시스 승인은 유메(yume-reamer.com) '포인트충전' 기준입니다. 무궁.com에서 '30일 이용권'을 팔려면 같은 상점으로 되는지, 사이트를 추가 등록해야 하는지 확인이 필요합니다. 결제 코드는 다 만들어 두었고 꺼져 있습니다(이니시스 OK 전에는 켜지 않음).

1. 이니시스 카카오톡 상담 또는 1588-4954, 혹은 담당자(조선아 님) 메일로 문의:
   "리머(사업자 627-03-03900) 가맹점입니다. 유메(yume-reamer.com) 포인트충전으로 승인받았습니다.
    ① 같은 사업자의 새 서비스 '무궁'(https://무궁.com — AI 대화 서비스)에서 같은 상점아이디로 30일 이용권(9,900원·24,900원·59,000원, 신용카드 일시불 단발 결제, 자동결제 없음)을 판매해도 되나요? 사이트 URL 추가 등록이 필요하면 절차를 알려 주세요.
    ② 나중에 월 정기결제(빌링)를 붙이려면 어떤 신청과 서류가 필요한가요?"
2. 무궁.com에는 이미 이용약관·개인정보처리방침·환불 정책·사업자 정보·민원 고지가 올라가 있습니다(심사자가 보면 됨).
3. 답이 오면 Claude에게 보여 주세요. OK면 "무궁 결제 켜"라고 말하면 Claude가 켭니다(MUGUNG_PAYMENTS=on).
4. 여기서 '완료' 체크`,
  },
  {
    key: "mail_order_registration",
    title: "[급함·법] 통신판매업 신고 — 일반과세 전환(11/1) 뒤 온라인 판매에 필요",
    priority: 1,
    link: "https://www.gov.kr",
    steps: `왜: 유메 크레딧과 무궁 이용권을 온라인으로 팔려면 통신판매업 신고번호를 사이트에 표시해야 합니다. 간이과세자는 면제될 수 있지만 11월 1일부터 일반과세로 바뀌면 신고 대상입니다.

1. 이니시스 가맹점관리자(PC) 로그인 → '구매안전서비스 이용확인증'(또는 '에스크로/결제대행 확인서') 발급(PDF). 메뉴가 안 보이면 이니시스 상담에 "통신판매업 신고용 구매안전서비스 이용확인증 발급"을 요청
2. 정부24(gov.kr) → '통신판매업 신고' 검색 → 신청(관할: 대구 달성군청)
   · 판매 방식: 인터넷 · 취급 품목: 기타(디지털 서비스·이용권) · 인터넷 도메인: yume-reamer.com, xn--of0bu3x.com(무궁.com)
   · 첨부: ①의 확인증
3. 처리 후 등록면허세 고지서가 오면 납부 → 신고증 수령
4. 신고번호(예: 제2026-대구달성-0000호)를 Claude에게 알려 주세요 — 유메·무궁 사이트 하단에 표시합니다.
5. 여기서 '완료' 체크`,
  },
  {
    key: "mugung_search",
    title: "[급함·검색] 무궁.com을 구글·네이버 검색에 등록 — '무궁 - 한국인 맞춤형 AI 서비스'로 나오게",
    priority: 1,
    link: "https://searchadvisor.naver.com",
    steps: `무궁.com은 검색에 나올 준비가 끝났습니다(제목 '무궁 - 한국인 맞춤형 AI 서비스', 설명 '거짓말하지 않는 한국인 맞춤형 AI…', 사이트맵). 검색엔진에 '내 사이트'라고 알려 주는 일만 남았습니다. 등록 뒤 실제로 검색에 뜨기까지는 보통 며칠~몇 주 걸립니다. (약 20분)

① 네이버 서치어드바이저 — searchadvisor.naver.com
  1. 로그인 → 웹마스터 도구 → 사이트 등록: https://xn--of0bu3x.com
  2. 소유 확인 방법: 'HTML 태그' → 나온 태그에서 content="…" 안의 값만 복사
  3. Railway → mugung 서비스 → Variables → NAVER_SITE_VERIFICATION = 그 값 → 저장(2~3분 뒤 반영)
  4. 서치어드바이저로 돌아가 '소유확인'
  5. 요청 → 사이트맵 제출: https://xn--of0bu3x.com/sitemap.xml · 요청 → 웹 페이지 수집: https://xn--of0bu3x.com/

② 구글 서치 콘솔 — search.google.com/search-console
  1. 속성 추가 → 'URL 접두어' → https://xn--of0bu3x.com/
  2. 확인 방법: 'HTML 태그' → content="…" 값만 복사
  3. Railway → mugung → Variables → GOOGLE_SITE_VERIFICATION = 그 값 → 저장
  4. 서치 콘솔에서 '확인' → 왼쪽 Sitemaps → sitemap.xml 제출 → 위 검색창에 https://xn--of0bu3x.com/ → 색인 생성 요청

③ (선택) 다음 검색: register.search.daum.net 에서 사이트 등록

막히면 그 화면을 Claude에게 보여 주세요. 소유 확인 값은 비밀이 아니라 채팅으로 줘도 됩니다 — Claude가 넣어 드립니다.
④ 여기서 '완료' 체크`,
  },
  {
    key: "lie_reports",
    title: "무궁 거짓말 신고 검토하는 곳 — 무궁.com/admin",
    priority: 2,
    steps: `무궁은 "거짓말하지 않아요"를 약속하고, 거짓말을 찾은 사람에게 넉넉 7일 이용권을 보상합니다(약관 제3조의2).
신고가 들어오면 여기서 봅니다:
1. 무궁.com/admin 접속 → 운영 토큰 입력
   · 토큰: Railway → 프로젝트 yume → mugung 서비스 → Variables → MUGUNG_ADMIN_TOKEN 값(눈 모양을 눌러 복사). 남에게 보내지 마세요.
2. 질문·답·신고 내용을 보고, 공식 출처로 사실과 다르면 '맞음 · 보상'(신고자에게 넉넉 7일 자동 지급), 아니면 '아님'
3. 판단이 애매하면 Claude에게 신고 내용을 보여 주세요 — 공식 출처로 같이 확인합니다.
이 항목은 확인했으면 '완료' 체크(이후 신고 검토는 아침 브리핑에 함께 알려 드리게 할 예정).`,
  },
  {
    key: "mugung_domain",
    title: "무궁 도메인 연결(무궁.com) — 완료됨, 자동 확인",
    priority: 2,
    check_key: "mugung_domain",
    steps: `10-16 무궁.com 구매·연결 완료(호스팅어 DNS → Railway, HTTPS OK). 서버가 무궁.com이 열리는 것을 확인하면 자동으로 닫힙니다.
남은 선택: 영문 예비 주소 mugungai.com(비어 있음)을 사 두면 링크가 깨져 보이는 앱에서도 쓸 수 있습니다 — 사면 Claude에게 알려 주세요.`,
  },
  {
    key: "korea_data_keys",
    title: "[급함·유메] 한국 공식 데이터 키 4개 발급 — 의료·경제·통계·기업을 원자료로 확인",
    priority: 1,
    steps: `왜: 지금 유메는 의료·경제 같은 사실을 식약처·한국은행 등 공식 사이트에서 '검색'해서 확인합니다. 아래 키가 있으면 검색 없이 기관 데이터베이스에서 값을 직접 꺼내 대조합니다 — 더 정확하고 더 쌉니다. 모두 무료입니다. (전부 합쳐 약 40분, 일부는 승인에 하루~이틀)

① 한국은행 ECOS (금리·환율·물가) — ecos.bok.or.kr/api
  회원가입 → 인증키 신청 → 바로 발급. 이름: ECOS_API_KEY

② KOSIS 국가통계포털 (인구·고용·소득 등) — kosis.kr/openapi
  회원가입 → 활용신청 → 인증키 발급. 이름: KOSIS_API_KEY

③ 공공데이터포털 (식약처 의약품 정보) — data.go.kr
  1. 회원가입 → 마이페이지 → 개인 API 인증키 확인(Encoding·Decoding 두 개가 보임)
  2. 검색창에 "의약품개요정보(e약은요)" → 활용신청(목적: 의약품 정보 사실 확인 서비스 개발)
  3. "의약품 제품 허가정보"도 같은 방법으로 활용신청
  4. 보통 바로~1일 안에 승인. 이름: DATA_GO_KR_KEY (일반 인증키 Decoding 값)

④ DART 전자공시 (기업 정보·재무) — opendart.fss.or.kr
  회원가입 → 인증키 신청 → 메일 확인 후 발급. 이름: DART_API_KEY

⑤ 넣기 — 채팅에 붙이지 마세요
  · Railway → 프로젝트 yume → yume 서비스 → Variables에 위 이름 그대로 4개
  · 넣었으면 Claude에게 "공공데이터 키 넣었어" — 실제 조회가 되는지 확인합니다
⑥ 여기서 '완료' 체크`,
  },
  {
    key: "law_precedent_api",
    title: "법제처 Open API에 '판례' 활용 신청이 돼 있는지 확인",
    priority: 2,
    link: "https://open.law.go.kr",
    steps: `왜: 유메가 법령 조문뿐 아니라 판례 번호·요지도 원문으로 대조하게 됩니다.
1. open.law.go.kr 로그인(유메에 쓰는 OC 아이디) → 마이페이지 → Open API 활용 신청 현황
2. '판례' 목록·본문 조회가 '승인'인지 확인. 없으면 신청(목적: 판례 인용 사실 확인)
3. 승인돼 있거나 승인되면 여기서 '완료' 체크(키는 그대로 같은 OC를 씁니다)`,
  },
  {
    key: "mugung_trademark",
    title: "'무궁' 상표 검색 · 출원 상담",
    priority: 2,
    link: "https://www.kipris.or.kr",
    steps: `1. kipris.or.kr → 상표 검색 → "무궁" 입력 → 9류(소프트웨어)·42류(SaaS)·35류에서 같은·비슷한 이름이 있는지 보기
2. 결과 화면을 캡처해 Claude에게 — 겹치는 게 있으면 피할 방법(로고 결합 등)을 정리합니다
3. 출원까지 하려면 특허로(patent.go.kr)에서 직접 하거나 변리사 상담 — 수수료는 류(분류)마다 따로 붙습니다
4. 여기서 '완료' 체크`,
  },
  // ── 할 일로 챙겨 둘 것(급하지 않음 — 안 하면 다음 날로 넘어간다) ──
  {
    key: "rotate_gmail_pw",
    title: "노출된 Gmail 앱 비밀번호 바꾸기",
    priority: 2,
    after_key: "gmail",
    steps: `메일함 연결에 쓴 앱 비밀번호가 대화에 노출됐었습니다.

1. myaccount.google.com/apppasswords → "유메 비서" 삭제
2. 같은 화면에서 새로 만들기(앱 이름: 유메 비서) → 16자리 복사
3. AI 본사 → 오늘 할 일의 메일함 연결 칸에 새 비밀번호를 넣고 "연결 시험 후 저장"(옛 것을 덮어씁니다)
4. 여기서 '완료' 체크`,
    link: "https://myaccount.google.com/apppasswords",
  },
  {
    key: "inicis_review_pw",
    title: "이니시스 심사가 끝나면 심사용 계정 비밀번호 바꾸기",
    priority: 3,
    steps: `심사용으로 이니시스에 알려 준 유메 계정(reamer@d-reamer.com) 비밀번호가 대화에도 노출됐습니다. 심사가 끝났다는 연락을 받으면:
1. www.yume-reamer.com 로그인 → 계정 → 비밀번호 변경
2. 여기서 '완료' 체크
심사 중이라면 "내일로"를 눌러 두세요(심사 중에 바꾸면 담당자가 못 들어갑니다).`,
  },
  {
    key: "search_console",
    title: "구글 서치콘솔에 사이트맵 제출 · 색인 요청",
    priority: 3,
    link: "https://search.google.com/search-console",
    steps: `유메의 할루시네이션 글·지수 페이지가 구글 검색에 잡히게 하는 일입니다(10분).
1. search.google.com/search-console 접속 → 속성 www.yume-reamer.com (없으면 "속성 추가" → URL 접두어 → https://www.yume-reamer.com → HTML 태그 방식은 Claude에게 말하면 태그를 넣어 드림)
2. 왼쪽 Sitemaps → "https://www.yume-reamer.com/sitemap.xml" 입력 → 제출
3. 위쪽 검색창에 https://www.yume-reamer.com/hallucination 입력 → "색인 생성 요청"
4. 여기서 '완료' 체크`,
  },
  {
    key: "kmong_reamer",
    title: "크몽에 리머 외주 서비스 더 올리기 (08 · 04 · 01 먼저)",
    priority: 3,
    steps: `모두의 창업 MVP 말고 리머의 다른 외주 서비스도 등록 키트가 다 준비돼 있습니다. 단가가 낮아 첫 주문·후기가 빨리 나는 것부터:
  · 08 오류 수정·기능 추가 → 04 업무 자동화 → 01 홈페이지·랜딩
자료: 바탕화면\\유메\\마켓등록\\크몽\\(서비스 폴더)\\ — 이미지와 등록문구.txt. 올리는 방법은 MVP 등록과 같습니다(등록문구 순서대로 붙여 넣기, 이미지 파일 이름 순서대로).
하나 올릴 때마다 업무 일지에 '내가 한 일'로 적고, 셋 다 올렸으면 '완료'.`,
  },
];
