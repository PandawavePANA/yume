// 영어 사전. 키는 한국어 원문이다(왜 그런지는 i18n.js 머리말에).
//
// 직역하지 않는다. 한국어 원문은 "~해요"체로 부드럽게 쓰는데 영어에서 그 말투를
// 흉내 내면 번역투가 된다. 영어는 영어대로 짧고 분명하게 쓴다.
//
// 법률·금융·결제 문구는 뜻이 바뀌면 안 되므로 의미를 먼저 맞추고 그 다음에 다듬는다.
// 특히 판정 세 가지(확인됨·사실과 다름·확인되지 않음)는 제품의 핵심 어휘라
// 화면마다 같은 단어를 써야 한다 — Confirmed / False / Unverified.

export default {
  // ── 상단 바 · 계정 ──────────────────────────────────────────────
  "랭킹": "Ranking",
  "채팅": "Chat",
  "기업용": "For business",
  "로그인": "Sign in",
  "로그인하기": "Sign in",
  "로그인 / 회원가입": "Sign in",
  "로그아웃": "Sign out",
  "회원가입": "Create account",
  "계정 설정": "Account settings",
  "API 키": "API keys",
  "API 키 관리": "Manage API keys",
  "데이터 · 개인정보": "Data & privacy",
  "운영 대시보드": "Admin dashboard",
  "기록 열기/닫기": "Toggle history",
  "무료": "Free",
  "{plan} 플랜": "{plan} plan",
  "검증 대시보드": "Verification dashboard",
  "한국어로 전환": "Switch to Korean",

  // ── 첫 화면 ────────────────────────────────────────────────────
  "AI에게 질문하고": "Ask any AI —",
  "로 확인하세요": "then check it with",
  "AI 답변 확인하기": "Check an AI answer",
  "유메로 확인하기": "Verify with Yume",
  "붙여넣기": "Paste",
  "복사한 내용 붙여넣기": "Paste from clipboard",
  "캡처 올리기": "Upload screenshot",
  "캡처 이미지에서 읽어오기": "Read text from a screenshot",
  "읽는 중…": "Reading…",
  "무료로 가입": "Sign up free",
  "무료로 가입하기": "Create a free account",
  "요금제 보기": "See plans",
  "새 검증": "New check",
  "다른 답변 확인하기": "Check another answer",
  "지금 확인해보기": "Try it now",

  "비타민 C를 하루 10g 이상 섭취하면 감기를 완전히 예방할 수 있다는 연구가 2021년 하버드 의대에서 발표됐다...":
    "A 2021 Harvard Medical School study found that taking more than 10g of vitamin C a day completely prevents the common cold...",

  // ── 검증 진행 · 결과 ────────────────────────────────────────────
  "사실 주장을 추출하고 실시간으로 검색 중…": "Pulling out factual claims and searching…",
  "내용을 분석하는 중…": "Reading the text…",
  "내용이 길면 최대 30초 정도 걸릴 수 있어요": "Longer answers can take up to 30 seconds",
  "검증 결과": "Result",
  "유메 검증 결과": "Yume result",
  "확인됨": "Confirmed",
  "사실과 다름": "False",
  "확인되지 않음": "Unverified",
  "법률 · 확인됨": "Law · Confirmed",
  "법제처 공식 확인": "Verified against official statutes",
  "부존재 신뢰도 판정": "Non-existence confidence",
  "심층 재확인": "Deep re-check",
  "공식 자료 조회 실패": "Official lookup failed",
  "인용 문헌 실재 확인": "Checked whether the source exists",
  "⚡ 이전 검증 결과 재사용": "⚡ Reused an earlier result",
  "관련 상품": "Related products",
  "추천할 상품을 찾지 못했습니다.": "No related products found.",
  "쿠팡에서 보기 ›": "View on Coupang ›",
  "결과 공유": "Share result",
  "검증 가능한 주장을 찾지 못했습니다.": "No checkable claims were found.",
  "건": "",

  // ── 안내 · 오류 ────────────────────────────────────────────────
  "불러오는 중…": "Loading…",
  "닫기": "Close",
  "삭제": "Delete",
  "전송": "Send",
  "입력 중…": "Typing…",
  "오류가 발생했습니다.": "Something went wrong.",
  "서버 오류가 발생했습니다.": "Server error.",
  "분석 중 문제가 발생했습니다.": "Something went wrong while analysing.",
  "서버와 연결이 끊겼어요. 잠시 후 다시 시도해주세요.": "Lost connection to the server. Please try again in a moment.",
  "죄송해요, 지금 답변드리기 어려워요. 잠시 후 다시 시도해주세요.": "Sorry — I can't answer right now. Please try again shortly.",
  "기록을 불러오지 못했어요.": "Couldn't load your history.",
  "삭제하지 못했어요.": "Couldn't delete that.",
  "이미지를 읽지 못했어요.": "Couldn't read the image.",
  "캡처를 읽지 못했어요.": "Couldn't read the screenshot.",
  "결제하지 못했어요.": "The payment didn't go through.",
  "입금이 확인되면 크레딧이 지급돼요.": "Credits arrive once the transfer clears.",
  "입금이 확인되면 바로 적용돼요.": "It applies as soon as the transfer clears.",
  "크레딧이 들어왔어요.": "Credits added.",
  "본인확인이 완료됐어요.": "Identity verified.",
  "본인확인에 실패했어요.": "Identity verification failed.",
  "아직 검증 기록이 없어요. 첫 답변을 붙여넣어 보세요.": "No checks yet. Paste an answer to start.",

  // ── 유메 도우미 ────────────────────────────────────────────────
  "AI에게 물어보기": "Ask Yume",
  "유메에게 질문하기": "Ask Yume",
  "궁금한 점을 물어보세요": "Ask anything",
  "안녕하세요! 유메에 대한 질문이든 그냥 편한 대화든, 뭐든 물어보세요 :)":
    "Hi! Ask me about Yume, or just chat — whatever you like :)",

  // ── 세 단계 ────────────────────────────────────────────────────
  "세 단계로, 확실하게.": "Three steps. No guessing.",
  "ChatGPT·클로드·제미나이 등 어떤 AI의 답변이든 그대로 붙여넣으세요.":
    "Drop in an answer from ChatGPT, Claude, Gemini — any AI.",
  "대조하기": "Compare",
  "법률은 법제처 공식 데이터베이스로, 그 외는 실시간 웹검색으로 하나하나 대조합니다.":
    "Legal claims go to the official statute database. Everything else goes to live web search.",
  "확인하기": "Decide",
  "확인됨 · 사실과 다름 · 확인되지 않음으로 명확하게, 근거와 출처까지 함께 보여드립니다.":
    "Confirmed, false or unverified — with the evidence and sources behind each call.",

  // ── 왜 유메인가 ────────────────────────────────────────────────
  "왜 유메인가": "WHY YUME",
  "AI는 확신에 찬 목소리로,": "AI speaks with total confidence,",
  "틀린 말을 합니다.": "and gets things wrong.",
  "확인된 사실": "verified facts",
  "무엇이 다른가": "WHAT'S DIFFERENT",
  "AI에게 AI를": "We don't ask one AI",
  "검증하게 하지 않습니다.": "to grade another.",
  "공식 원천 데이터와 직접 대조하는 구조": "comparing claims against primary sources",
  "할루시네이션의 원인": "WHY IT HAPPENS",
  "AI는 왜 틀릴까요,": "Why AI gets it wrong,",
  "유메는 원인부터 봅니다.": "and where Yume looks first.",
  "알던 걸 잊고 지어내는": "forgets what it knew and starts inventing",
  "확인하고": "Check it,",
  "붙여넣기 한 번이면 충분해요. 가입하지 않아도 바로 써볼 수 있어요.":
    "One paste is all it takes. No account needed to try it.",
  "AI 답변, 확인하고 믿으세요.": "Check the answer. Then trust it.",

  // ── 할루시네이션 다섯 원인 ─────────────────────────────────────
  "저빈도 값 붕괴": "Rare values collapse",
  "조문 번호·수치처럼 드문 값은 AI가 비슷한 값과 섞습니다.":
    "Article numbers and figures appear rarely, so models blur them into similar ones.",
  "원문을 항목 단위까지 펼쳐 문자열로 직접 대조": "Expands the source to the clause and compares the text itself",
  "시점 붕괴": "Time collapse",
  "개정 전·후 버전이 둘 다 학습돼 어느 게 최신인지 AI는 모릅니다.":
    "Both the old and amended versions are in the training data, and the model can't tell which is current.",
  "지금 유효한 버전만 기준으로 판정": "Judges only against the version in force today",
  "자기회귀적 오류 전파": "Errors compound",
  "한 번 부정확한 표현이 나오면 뒤이어 계속 틀립니다.":
    "Once one phrase goes wrong, everything written after it follows the mistake.",
  "답변 전체가 아니라 주장 단위로 쪼개 독립 검증": "Splits the answer into claims and checks each on its own",
  "확신 편향": "Confidence bias",
  "근거가 약해도, 아예 없는 사실이어도 AI의 말투는 항상 자신 있게 나옵니다.":
    "The tone stays certain whether the evidence is thin or the fact doesn't exist at all.",
  "확인됨·사실과 다름·확인되지 않음, 3단계로 정직하게 판정": "Reports one of three honest verdicts, including \"unverified\"",
  "유사 개체 혼동": "Lookalike confusion",
  "이름이나 맥락이 비슷한 두 개념이 서로 섞입니다.": "Two concepts with similar names or contexts get merged.",
  "유사도가 아니라 원문 일치 여부로 최종 판정": "Decides on an exact source match, not on similarity",

  // ── 요금제 ─────────────────────────────────────────────────────
  "요금제": "Plans",
  "현재 플랜": "Current plan",
  "준비 중": "Coming soon",
  "결제창 여는 중…": "Opening checkout…",
  "이용 문의하기": "Contact us",
  "도입 문의하기": "Talk to us",
  "도입 문의": "Talk to us",
  "문의하기": "Contact",
  "제휴 문의": "Partner with us",
  "일상적인 사실관계 확인": "Everyday fact checking",
  "매달 5 크레딧 (2,000자당 1크레딧)": "5 credits a month (1 credit per 2,000 characters)",
  "법률 주장 법제처 공식 대조": "Legal claims checked against official statutes",
  "인용된 판례·법령·논문의 부존재 신뢰도": "Non-existence confidence for cited cases, statutes and papers",
  "로그인 시 검증 기록 최근 50건 저장": "Last 50 checks saved when signed in",
  "스탠다드": "Standard",
  "매일 AI 답변을 확인하는 분께": "For people who check AI answers daily",
  "매달 20 크레딧 (정가 12,000원어치)": "20 credits a month (KRW 12,000 of value)",
  "무료 플랜 기능 전체 포함": "Everything in Free",
  "검증 기록 무제한 저장": "Unlimited saved history",
  "크레딧 소진 시 추가 구매 가능": "Top up any time",
  "전문가": "Expert",
  "업무에서 조문·판례를 자주 확인하는 분께": "For professionals checking statutes and case law at work",
  "매달 60 크레딧 (정가 36,000원어치)": "60 credits a month (KRW 36,000 of value)",
  "스탠다드 전체 포함": "Everything in Standard",
  "우선 지원": "Priority support",
  "/월": "/mo",
  "0원": "Free",
  "앱에서는 무료 플랜을 이용할 수 있어요. 유료 플랜은 준비 중이에요.":
    "The app runs on the free plan. Paid plans are on the way.",
  "카드로 바로 결제하고 1개월 동안 이용하실 수 있어요. 자동 갱신되지 않습니다.":
    "Pay by card for one month. It does not auto-renew.",
  "온라인 결제는 준비 중이에요. 유료 플랜은 문의해주시면 바로 열어드려요.":
    "Online payment is coming soon. Get in touch and we'll open a paid plan for you.",

  // ── 비즈니스 패널 ──────────────────────────────────────────────
  "설정 · 비즈니스": "Settings & business",
  "⚙ 설정 · 비즈니스": "⚙ Settings & business",
  "비즈니스 · API": "Business & API",
  "유메의 검증 엔진을 API·데이터·엔터프라이즈 솔루션으로 제공합니다":
    "Yume's verification engine, available as an API, as data, and as enterprise solutions",
  "무료 · 가입 불필요": "Free · no account needed",
  "우리 회사 AI, 거짓말을 할까?": "Is your company's AI making things up?",
  "무료로 점검하기 →": "Run a free audit →",
  "개발자 · 데이터 · 파트너십": "Developers · data · partnerships",
  "유메 검증 API": "Yume Verification API",
  "AI 기능이 있는 서비스에 팩트체크를 API로 붙일 수 있습니다. 주장별 판정·근거와 부존재 신뢰도를 그대로 받아 쓰세요. 호출량 기반 종량제.":
    "Add fact checking to any product with AI in it. You get a verdict, the evidence and a non-existence confidence score for every claim. Pay per call.",
  "가입하고 키 받기": "Sign up for a key",
  "API 문서 보기 ›": "Read the API docs ›",
  "API 문서": "API docs",
  "협업 파트너십": "Partnerships",
  "검증 결과와 맞닿은 상품·서비스를 결과 화면에 노출하고, 노출당 정산받는 제휴 프로그램입니다.":
    "Place relevant products beside verification results and earn per impression.",
  "데이터셋 라이선싱": "Dataset licensing",
  "이용자가 동의한 검증 기록을 가명처리한 주장·판정 데이터셋입니다. 지어낸 판례·문헌을 가려낸 부존재 신뢰도 레코드를 포함해, AI 모델의 할루시네이션 개선에 쓸 수 있습니다.":
    "A pseudonymised claim-and-verdict dataset built from checks users consented to share. It includes non-existence records for invented cases and papers, which is what hallucination research needs.",
  "B2B 솔루션": "Enterprise",
  "법률 문서 자동검증 API": "Legal document verification API",
  "로펌·기업 법무팀의 내부 문서 작성 워크플로우에 넣어 인용 조문·판례를 자동 검증합니다.":
    "Drops into a law firm or in-house drafting workflow and checks every cited statute and case.",
  "의료·제약 정보 검증": "Medical and pharma review",
  "환자 대상 안내자료·교육자료의 의학적 사실관계를 검증합니다.":
    "Checks the medical claims in patient-facing leaflets and training material.",
  "금융기관 응대 검증": "Financial communications review",
  "고객 응대 스크립트·상품설명서의 사실관계를 사전 검증합니다.":
    "Checks customer scripts and product disclosures before they go out.",

  // ── 푸터 ───────────────────────────────────────────────────────
  "이용약관": "Terms of service",
  "개인정보처리방침": "Privacy policy",
  "환불정책": "Refund policy",
  "상품 안내": "Products",

  // ── 전체 채팅 ──────────────────────────────────────────────────
  "전체 채팅": "Community chat",
  "채팅 닫기": "Close chat",
  "공헌도": "Contribution",
  "로그인하면 전체 채팅을 볼 수 있어요.": "Sign in to see the chat.",
  "아직 대화가 없어요. 첫 마디를 남겨보세요.": "Nothing here yet. Say the first thing.",
  "메시지를 입력하세요": "Write a message",
  "보내기": "Send",
  "검증 {n}회를 더 하면 채팅에 참여할 수 있어요.": "Run {n} more checks to join the chat.",
  "휴대폰 본인확인을 마치면 채팅에 참여할 수 있어요.": "Finish phone verification to join the chat.",

  // ── 로그인 · 가입 ──────────────────────────────────────────────
  "유메 시작하기": "Get started with Yume",
  "비밀번호 재설정": "Reset your password",
  "검증 기록이 계정에 저장되고, 어느 기기에서든 이어볼 수 있어요.":
    "Your checks are saved to your account and follow you across devices.",
  "가입하면 검증 기록 저장과 API 키 발급을 쓸 수 있어요.":
    "An account gets you saved history and API keys.",
  "가입한 이메일로 재설정 링크를 보내드려요.": "We'll email you a reset link.",
  "본인확인을 마쳤어요. 비밀번호를 바꿀 계정을 골라주세요.": "Verified. Choose the account to reset.",
  "이메일": "Email",
  "비밀번호": "Password",
  "비밀번호 확인": "Confirm password",
  "이름": "Name",
  "닉네임": "Nickname",
  "(선택)": "(optional)",
  "영문+숫자 8자 이상": "8+ characters, letters and numbers",
  "한 번 더 입력해주세요": "Type it once more",
  "두 비밀번호가 서로 달라요.": "Those two passwords don't match.",
  "계정 만들기": "Create account",
  "재설정 링크 보내기": "Send reset link",
  "처리 중…": "Working…",
  "비밀번호를 잊으셨나요?": "Forgot your password?",
  "처음이신가요?": "New here?",
  "메일함을 못 쓰시나요?": "Can't get into that inbox?",
  "휴대폰 본인확인으로 재설정": "Reset with phone verification",
  "이 계정의 비밀번호 바꾸기": "Reset this account",
  "이 명의로 본인확인을 마친 계정이 없어요.": "No verified account is registered to this person.",
  "10분 안에 새 비밀번호를 정해주세요. 바꾸고 나면 다른 기기의 로그인은 모두 풀려요.":
    "Set a new password within 10 minutes. This signs you out everywhere else.",
  "가입 후 휴대폰 본인확인을 마친 계정만 이 길로 열려요. 본인확인기관에 이름·휴대전화번호를 제공하고 받은 연계정보(CI)로 계정을 찾습니다 — 이메일을 몰라도 됩니다.":
    "This works only for accounts that finished phone verification. We find your account through the connecting information the verification agency returns, so you don't need to remember the email.",
  "공헌도 랭킹에 표시되는 이름이에요. 다른 분과 겹칠 수 없어요.":
    "This is the name shown on the contribution ranking. It has to be unique.",
  "2~16자, 한글·영문·숫자": "2–16 characters",
  "전체 동의": "Agree to all",
  "필수 항목에 동의해주세요.": "Please accept the required items.",
  "이미 계정이 있으신가요?": "Already have an account?",
  "자세히": "Details",
  "접기": "Hide",

  // ── 분기 보상 ─────────────────────────────────────────────────
  "{n}명 더 모이면 상이 올라갑니다": "{n} more members and the prize levels up",
  "가입 {a}명 / {b}명": "{a} of {b} members",
  "1위 {label}": "1st place: {label}",
  "미니 골드바 1g": "1g mini gold bar",
  "골드바 3.75g (한 돈)": "3.75g gold bar",
  "미니 골드바 3.75g (한 돈)": "3.75g mini gold bar",
  "50 크레딧": "50 credits",
  "30 크레딧": "30 credits",
  "15 크레딧": "15 credits",
  "내 공헌도": "Your contribution",

  // ── 공통 ───────────────────────────────────────────────────────
  "저장": "Save",
  "취소": "Cancel",
  "확인": "OK",
  "일반": "General",
  "다시 시도": "Try again",

  // ── 모달 · 설정 · 결제 ─────────────────────────────────────────
  "오늘 남은 확인":
    "Checks left today",
  "회사":
    "Company",
  "(API·비즈니스 이용 시)":
    "(for API and business use)",
  "API 문서 보기 →":
    "Read the API docs →",
  "이 키는 지금 한 번만 보여드려요. 안전한 곳에 복사해두세요.":
    "This key is shown once. Copy it somewhere safe.",
  "curl 예시":
    "curl example",
  "키 이름 (예: 운영 서버)":
    "Key name (e.g. production)",
  "새 키 발급":
    "Create key",
  "아직 발급한 키가 없어요.":
    "No keys yet.",
  "폐기됨":
    "Revoked",
  "폐기":
    "Revoke",
  "가명처리한 검증 데이터 제공 [선택]":
    "Share pseudonymised verification data (optional)",
  "내 데이터 내려받기":
    "Download your data",
  "계정 정보·동의 내역·검증 기록·대화·API 키 목록을 JSON 파일로 받아요.":
    "Get your account details, consents, verification history, chats and API key list as a JSON file.",
  "JSON으로 내려받기":
    "Download JSON",
  "비밀번호 변경":
    "Change password",
  "현재 비밀번호":
    "Current password",
  "새 비밀번호":
    "New password",
  "변경":
    "Change",
  "회원 탈퇴":
    "Delete account",
  "계정과 검증 기록, API 키, 대화 기록이 지체 없이 파기돼요.":
    "Your account, verification history, API keys and chats are destroyed without delay.",
  "탈퇴하기":
    "Delete my account",
  "무료 점검":
    "Free audit",
  "정답을 미리 아는 질문":
    "Questions with a known answer",
  "가입도, API 키도 필요 없습니다.":
    "No account, no API key.",
  "질문은 이렇게 만듭니다":
    "How the questions are built",
  "법제처 국가법령정보에서 민법 마지막 조문 번호를 확인한 뒤":
    "We look up the last article number of the Civil Act in the official statute database, then",
  "어떤 분야의 AI인가요?":
    "What kind of AI is it?",
  "(선택 — 리포트에 표시됩니다)":
    "(optional — appears in the report)",
  "예: ○○ 로펌 사내 법률 assistant":
    "e.g. in-house legal assistant at a law firm",
  "AI가 준 답변을 그대로 붙여넣으세요":
    "Paste the answer your AI gave",
  "처음으로":
    "Start over",
  "유형별 결과":
    "Results by type",
  "문항별 기록":
    "Question by question",
  "이 결과를 두고 드리는 제안":
    "What we'd suggest from this",
  "이번 점검에서는 유메를 권하지 않습니다.":
    "On these results, we wouldn't pitch you Yume.",
  "다시 점검하기":
    "Run it again",
  "AI가 한 말":
    "What the AI said",
  "공식 확인 결과":
    "What the official source says",
  "조문 원문 보기":
    "Read the original text",
  "왜 문제인가":
    "Why it matters",
  "올바른 답이었다면":
    "A correct answer would have been",
  "개인정보 수집·이용":
    "Collection and use of personal data",
  "수집 항목":
    "What is collected",
  "이름, 생년월일, 성별, 휴대전화번호, 연계정보(CI), 중복가입확인정보(DI)":
    "Name, date of birth, gender, mobile number, connecting information (CI), duplicate-account information (DI)",
  "목적":
    "Purpose",
  "본인 확인, 만 14세 미만 가입 제한, 중복 가입·부정 이용 방지, 유료 결제 시 명의 확인":
    "Identity verification, blocking under-14 signups, preventing duplicate and fraudulent accounts, confirming the payer's name",
  "보유 기간":
    "Retention",
  "탈퇴 시까지":
    "Until you delete your account",
  "수탁자":
    "Processor",
  "본인확인기관의 통합인증서비스(카카오·네이버·PASS 등 인증서)":
    "The identity agency's authentication service (Kakao, Naver, PASS and similar)",
  "주민등록번호를 수집하지 않습니다.":
    "does not collect resident registration numbers.",
  "제공받는 자":
    "Recipient",
  "유메와 데이터 이용 계약을 맺은 AI 개발 기업·연구기관":
    "AI companies and research institutions under a data agreement with Yume",
  "AI 답변의 사실 오류(할루시네이션) 연구와 정확도 개선":
    "Research into AI factual errors (hallucination) and accuracy improvement",
  "항목":
    "Items",
  "유메가 추출한 주장 문장·판정·근거(원문·이메일·IP 제외, 이름·연락처 등은 가림)":
    "The claims Yume extracted, the verdicts and the evidence — excluding your original text, email and IP, with names and contact details masked",
  "제공받는 자와의 계약 기간":
    "For the term of the agreement with the recipient",
  "제보 접수했어요":
    "Report received",
  "제보하고 공헌도 받기":
    "Report it and earn contribution",
  "제보할 인용":
    "The citation you're reporting",
  "어느 AI의 답변이었나요?":
    "Which AI said it?",
  "대화 공유 링크":
    "Link to the conversation",
  "제보한 인용과 판정 내용을 유메가 할루시네이션 데이터로 활용하는 데 동의합니다.":
    "I agree that Yume may use this citation and verdict as hallucination research data.",
  "← 돌아가기":
    "← Back",
  "결제":
    "Checkout",
  "결제 금액":
    "Amount",
  "구매자 정보":
    "Your details",
  "홍길동":
    "Full name",
  "휴대폰 번호":
    "Mobile number",
  "문맥 요약 프롬프트":
    "Context recap prompt",
  "이 대화의 목적":
    "What this conversation is for",
  "정해진 것":
    "Already decided",
  "지켜야 하는 것":
    "Constraints",
  "아직 안 정해진 것":
    "Still open",
  "남은 크레딧":
    "Credits left",
  "크레딧":
    "Credits",
  "요금제를 올려도 자동으로 늘어나지 않고":
    "Upgrading a plan does not top these up automatically, and",
  "크레딧 추가 구매":
    "Buy more credits",
  "본인확인":
    "Identity verification",
  "[필수]":
    "[required]",
  "연락받으실 휴대폰 번호 또는 이메일":
    "A mobile number or email we can reach you at",
  "친구 추천":
    "Refer a friend",
  "내 제보":
    "My reports",
  "구매 신청 내역":
    "Purchase requests",
  "크레딧 내역":
    "Credit history",
  "혹시 이것을 말한 걸까요?":
    "Did it mean this?",
  "아직 확인하지 못한 영역":
    "Not yet covered by the search",
  "공헌도 랭킹":
    "Contribution ranking",
  "가장 많이 찾아낸 사람들":
    "Who caught the most",
  "찾아낸 것":
    "Caught",
  "분기마다 초기화":
    "Resets each quarter",
  "랭킹은 로그인하면 볼 수 있어요.":
    "Sign in to see the ranking.",
  "전체 랭킹":
    "Full ranking",
  "아직 순위가 없어요. 첫 번째가 되어보세요.":
    "No one is ranked yet. Be the first.",
  "내 적립 내역":
    "Your points history",
  "최근 검증":
    "Recent checks",
  "오늘 {n}회 남음":
    "{n} left today",
  "법률, 의료, 금융, 역사, 과학 — 어떤 주제든 괜찮아요. AI 답변 속 사실 주장을 유메가 하나하나 확인합니다.":
    "Law, medicine, finance, history, science — any subject. Yume checks every factual claim in the answer, one by one.",

  // ── 문장 가운데 강조가 있는 것 ─────────────────────────────────
  "하면 검증 기록이 계정에 저장돼요.":
    " to save your checks to an account.",
  "법률 주장은 법제처 국가법령정보와 직접 대조하고, 인용된 판례·법령·논문이 공식 자료에 없으면 부존재 신뢰도로 판정합니다. 판정은 참고 정보이며 전문가의 자문을 대신하지 않습니다.":
    "Legal claims are compared directly against Korea’s National Law Information Center. When a cited case, statute or paper is missing from official sources, Yume reports how confident it is that the source does not exist. Results are for reference and do not replace professional advice.",
  "대화가 꼬였나요? 문맥 되살리기":
    "Conversation drifting? Rebuild the context",
  "대화가 길어지면 AI는 앞서 정한 것을 잊고 지어내기 시작합니다. 주고받은 내용을 붙여넣으면, 다시 붙여넣을 {x}를 만들어 드려요.":
    "In a long conversation the model forgets what you settled earlier and starts inventing. Paste the exchange and we’ll write you a {x} to paste back in.",
  "문맥 요약 프롬프트":
    "context recap prompt",

  // ── 본문 문단 ──────────────────────────────────────────────────
  "법정 문서에서 발견된 AI 할루시네이션":
    "AI hallucinations found in court filings",
  "2023년 → 2025년 상반기":
    "2023 → first half of 2025",
  "민법 제750조: 고의·과실로 손해를 가하면 배상 책임이 있다":
    "Civil Act art. 750: harm caused intentionally or negligently carries liability",
  "법제처 국가법령정보에서 실제 조문을 대조해, 짐작이 아니라 확인된 사실만 보여드립니다.":
    "Matched against the actual article text in the National Law Information Center — verified, not inferred.",
  "유메는 창업자가 실제로 겪은 법정 분쟁에서 시작됐습니다. AI가 알려준 정보를 그대로 믿었다가 피해를 입은 경험이, \"확인된 사실\"만 전달하는 서비스를 만들게 했습니다.":
    "Yume started with a lawsuit its founder lived through. Trusting what an AI told him cost him — and that is why this service passes on only what it has verified.",
  "일반적인 팩트체크는 또 다른 AI의 짐작에 의존합니다. 유메는 법률 도메인에서 먼저 검증한 \"공식 원천 데이터와 직접 대조하는 구조\"를 도메인마다 반복합니다. 짐작이 아니라, 확인입니다.":
    "Most fact-checkers just ask a second model what it thinks. Yume compares every claim against a primary source — the method we proved on Korean law first, then carried into every other domain. Checking, not guessing.",
  "할루시네이션은 우연이 아니라, AI가 답을 만드는 방식 자체에서 반복되는 구조적 현상입니다. 유메는 이 원인 다섯 가지를 각각 뜯어보고, 원인마다 다른 검증 로직을 붙였습니다.":
    "Hallucination is not bad luck. It falls out of how these models produce text. Yume separates five causes and runs different logic against each one.",
  "AI 답변, {x} 믿으세요.":
    "{x} the answer. Then trust it.",
  "확인하고":
    "Check",
  "요청을 처리하지 못했어요 ({status})": "Request failed ({status})",
};
