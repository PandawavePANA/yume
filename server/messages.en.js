// 서버가 사용자에게 돌려보내는 문구의 영어판.
//
// 화면은 전부 영어로 나오는데 서버 응답만 한국어로 뜨면, 그 순간 "번역하다 만
// 서비스"가 된다. 오류 문구는 일이 틀어진 자리에서만 보이므로 더 그렇다.
//
// ── 왜 문구를 키로 쓰는가 ──
// 호출부마다 코드를 붙이는 방법도 있었다. 그러려면 error: "..." 100곳을 전부
// 고쳐야 하고, 고치다 하나 빠뜨리면 그 자리만 조용히 영어가 안 나온다. 응답을
// 내보내는 한 자리에서 문구를 갈아끼우면 호출부를 건드리지 않아도 된다.
// 사전에 없는 문구는 한국어 그대로 나간다 — 빈 문자열보다 한국어가 낫다.
//
// ── 여기 없는 것 ──
// 관리자 화면(renderAdminPage·renderStudioPage·adminApi)의 문구는 넣지 않았다.
// 운영자만 보는 자리고, 그 사람은 한국어로 읽는다. 번역해 두면 오히려 화면과
// 문서가 어긋난다.
export default {
  // ── 로그인 · 계정 ──
  "로그인이 필요해요.": "Please sign in.",
  "관리자만 접근할 수 있어요.": "Administrators only.",
  "올바른 이메일 주소를 입력해주세요.": "Enter a valid email address.",
  "비밀번호는 8자 이상이어야 해요.": "Your password must be at least 8 characters.",
  "비밀번호가 너무 길어요.": "That password is too long.",
  "비밀번호에 영문과 숫자를 모두 포함해주세요.": "Use both letters and numbers in your password.",
  "이미 가입된 이메일이에요. 로그인해주세요.": "That email already has an account. Please sign in.",
  "이메일 또는 비밀번호가 올바르지 않아요.": "That email or password isn't right.",
  "현재 비밀번호가 올바르지 않아요.": "Your current password isn't right.",
  "비밀번호가 올바르지 않아요.": "That password isn't right.",
  "이용이 정지된 계정이에요. reamer@d-reamer.com으로 문의해주세요.":
    "This account is suspended. Please contact reamer@d-reamer.com.",
  "필수 약관(이용약관·개인정보 수집·이용)에 동의해주세요.":
    "Please accept the required terms and the privacy notice.",
  "본인확인 정보(CI) 수집·이용에 동의해주세요.":
    "Please agree to the collection and use of your connecting information (CI).",
  "본인확인 정보(CI) 수집·이용에 먼저 동의해주세요.":
    "Please agree to the collection and use of your connecting information (CI) first.",
  "가입된 이메일이라면 비밀번호 재설정 링크를 보냈어요. 메일함을 확인해주세요.":
    "If that email has an account, a reset link is on its way. Check your inbox.",
  "재설정 링크가 만료됐거나 이미 사용됐어요. 다시 요청해주세요.":
    "That reset link has expired or was already used. Please request a new one.",
  "본인확인이 아직 준비되지 않았어요. 이메일로 재설정해주세요.":
    "Phone verification isn't available yet. Please reset by email.",
  "본인확인 정보가 맞지 않아요. 처음부터 다시 시도해주세요.":
    "That verification doesn't match. Please start again.",
  "본인확인은 끝났지만 이 명의로 본인확인을 마친 계정이 없어요. 가입은 했는데 본인확인 전이라면 이메일로 재설정해주세요.":
    "You're verified, but no account is registered to this person. If you signed up but never verified, reset by email instead.",
  "휴대폰 본인확인을 마치면 바로 이용하실 수 있어요.": "Finish phone verification and you're good to go.",
  "휴대폰 본인확인을 마치면 결제하실 수 있어요.": "Finish phone verification to pay.",
  "휴대폰 본인확인을 마치면 채팅에 참여할 수 있어요.": "Finish phone verification to join the chat.",
  "키를 찾을 수 없거나 이미 폐기됐어요.": "That key doesn't exist or was already revoked.",
  "기록을 찾을 수 없어요.": "No record found.",

  // ── 닉네임 ──
  "닉네임은 2자 이상으로 지어주세요.": "Nicknames need at least 2 characters.",
  "닉네임은 16자까지 쓸 수 있어요.": "Nicknames can be up to 16 characters.",
  "닉네임에는 한글·영문·숫자와 . _ - 만 쓸 수 있어요.":
    "Nicknames can use letters, numbers and . _ - only.",
  "이미 쓰이고 있는 닉네임이에요. 다른 이름으로 지어주세요.": "That nickname is taken. Please pick another.",
  "운영자로 오해할 수 있는 닉네임은 쓸 수 없어요.": "That nickname could be mistaken for staff. Please pick another.",

  // ── 검증 ──
  "검증할 텍스트를 입력해주세요.": "Paste the text you want checked.",
  "검증 중 오류가 발생했습니다.": "Something went wrong while checking.",
  "검증 기록을 찾을 수 없어요.": "That check couldn't be found.",
  "주장을 지정해주세요.": "Pick which claim you mean.",
  "같은 네트워크에서 오늘 쓸 수 있는 무료 확인 횟수를 모두 사용했어요. 내일 다시 이용해주세요.":
    "This network has used all of today's free checks. Please try again tomorrow.",
  "오늘 남은 확인 횟수를 모두 사용했어요.": "You've used all of today's checks.",

  // ── 캡처 ──
  "PNG · JPG · WEBP 이미지만 올릴 수 있어요.": "Only PNG, JPG and WEBP images are accepted.",
  "이미지를 읽지 못했어요.": "Couldn't read that image.",
  "이미지 한 장은 5MB까지 올릴 수 있어요.": "Each image can be up to 5MB.",
  "이미지를 올려주세요.": "Please add an image.",
  "캡처에서 AI 답변을 찾지 못했어요. 답변 부분이 잘 보이게 다시 찍어주세요.":
    "No AI answer was found in that screenshot. Try again with the answer clearly visible.",
  "캡처를 읽지 못했어요. 잠시 후 다시 시도해주세요.": "Couldn't read that screenshot. Please try again shortly.",

  // ── 문맥 되살리기 ──
  "링크를 여는 데 실패했어요. 대화를 직접 붙여넣어 주세요.":
    "That link wouldn't open. Please paste the conversation directly.",
  "대화 공유 링크를 넣거나, 대화를 직접 붙여넣어 주세요.":
    "Add a share link, or paste the conversation directly.",
  "대화 내용이 너무 짧아요. 주고받은 내용을 조금 더 붙여넣어 주세요.":
    "That's too short. Paste a bit more of the exchange.",
  "지원하지 않는 플랫폼이에요.": "That platform isn't supported.",
  "공유 링크 주소가 올바르지 않아요.": "That share link isn't valid.",
  "공유 링크는 https 주소여야 해요.": "Share links must use https.",

  // ── 결제 · 크레딧 ──
  "결제 연동이 아직 설정되지 않았어요.": "Payments aren't set up yet.",
  "본인확인 연동이 아직 설정되지 않았어요.": "Identity verification isn't set up yet.",
  "본인확인 번호가 없어요.": "The verification id is missing.",
  "결제할 수 없는 요금제예요.": "That plan can't be purchased.",
  "선택한 크레딧 팩을 찾을 수 없어요.": "That credit pack doesn't exist.",
  "주문을 찾을 수 없어요.": "That order couldn't be found.",
  "포트원 조회에 실패했어요.": "We couldn't reach the payment provider.",
  "입금이 확인되면 크레딧이 지급돼요.": "Credits arrive once the transfer clears.",
  "결제가 완료되지 않았어요.": "The payment didn't complete.",
  "결제 금액이 주문 금액과 달라요. 고객센터로 문의해주세요.":
    "The amount paid doesn't match the order. Please contact support.",
  "본인확인이 완료되지 않았어요.": "Identity verification didn't complete.",
  "본인확인 결과에 연계정보(CI)가 없어요. 채널 설정을 확인해주세요.":
    "The verification result has no connecting information (CI). Check the channel settings.",
  "연락받으실 휴대폰 번호나 이메일을 입력해주세요.": "Enter a mobile number or email we can reach you at.",
  "연락처가 너무 길어요.": "That contact detail is too long.",
  "구매 신청을 찾을 수 없어요.": "That purchase request couldn't be found.",
  "이미 처리된 신청이에요.": "That request was already handled.",

  // ── 제보 · 추천 ──
  "제보한 내용을 유메가 데이터로 활용하는 데 동의해주세요.":
    "Please agree that Yume may use your report as research data.",
  "이미 접수된 인용이에요.": "That citation was already reported.",
  "제보를 찾을 수 없어요.": "That report couldn't be found.",
  "이미 처리된 제보예요.": "That report was already handled.",
  "처리 방식이 올바르지 않아요.": "That action isn't valid.",
  "추천 기록을 찾을 수 없어요.": "That referral couldn't be found.",
  "이미 지급된 건이에요.": "That one was already paid out.",

  // ── 전체 채팅 ──
  "내용을 입력해주세요.": "Write something first.",

  // ── 무료 점검 ──
  "지금은 문항을 만들 수 없어요. 공식 데이터 조회가 일시적으로 불안정합니다. 잠시 후 다시 시도해주세요.":
    "We can't build the questions right now — the official data lookup is unstable. Please try again shortly.",
  "문항을 만들지 못했어요. 잠시 후 다시 시도해주세요.": "Couldn't build the questions. Please try again shortly.",
  "감사 세션이 만료됐어요. 문항을 다시 발급받아 주세요.": "This audit expired. Please get a new set of questions.",
  "answers는 { 문항id: 답변 } 형태여야 해요.": "`answers` must be an object of question id to answer.",
  "채점에 실패했어요. 잠시 후 다시 시도해주세요.": "Scoring failed. Please try again shortly.",

  // ── 문의 · 대화 ──
  "성함을 입력해주세요.": "Please enter your name.",
  "연락받으실 이메일이나 전화번호를 입력해주세요.": "Enter an email or phone number we can reach you at.",
  "어떤 걸 만들고 싶으신지 조금만 더 적어주세요.": "Tell us a little more about what you want built.",
  "대화를 찾을 수 없어요.": "That conversation couldn't be found.",
  "링크가 만료되었거나 올바르지 않아요.": "That link has expired or isn't valid.",
  "종료된 대화예요. 새로 문의해주세요.": "This conversation is closed. Please start a new enquiry.",
  "견적을 찾을 수 없어요.": "That quote couldn't be found.",
  "이미 결제가 완료된 건이에요.": "That one is already paid.",
  "지금은 바꿀 수 없는 견적이에요.": "This quote can't be changed right now.",
  "견적 유효기간이 지났어요. 대화로 말씀해주시면 다시 보내드리겠습니다.":
    "This quote has expired. Message us and we'll send a new one.",
  "견적을 먼저 확정해주세요.": "Please accept the quote first.",
  "지금은 결제할 수 없는 견적이에요.": "This quote can't be paid right now.",
  "결제가 아직 준비되지 않았어요. 잠시 후 다시 시도해주세요.": "Payment isn't ready yet. Please try again shortly.",
  "결제자 성함을 입력해주세요.": "Enter the payer's name.",
  "영수증을 받으실 이메일을 입력해주세요.": "Enter an email for the receipt.",
  "휴대폰 번호를 정확히 입력해주세요.": "Enter a valid mobile number.",
  "주문번호가 맞지 않아요. 새로고침 후 다시 시도해주세요.":
    "That order number doesn't match. Refresh and try again.",
  "결제를 확인하지 못했어요.": "We couldn't confirm the payment.",
  "취소된 견적이에요.": "That quote was cancelled.",
  "결제가 시작되지 않았어요.": "The payment never started.",
  "방금 상태가 바뀌었어요. 새로고침 후 다시 시도해주세요.":
    "This just changed. Refresh and try again.",

  // ── 데이터 반출 링크 ──
  "링크가 올바르지 않습니다.": "That link isn't valid.",
  "회수된 링크입니다.": "That link was revoked.",
  "만료된 링크입니다.": "That link has expired.",
  "보관 기간이 지나 파일이 삭제되었습니다.": "The file was deleted after its retention period.",
  "다운로드 가능 횟수를 모두 사용했습니다.": "That link has no downloads left.",

  // ── 요청 자체가 잘못된 경우 ──
  "JSON 형식이 올바르지 않아요.": "That isn't valid JSON.",
  "요청 본문이 너무 커요.": "The request body is too large.",
  "존재하지 않는 API예요.": "No such endpoint.",
  "잘못된 요청 출처예요.": "Bad request origin.",
  "허용되지 않은 출처의 요청이에요.": "That origin isn't allowed.",
  "요청이 너무 많아요. 잠시 후 다시 시도해주세요.": "Too many requests. Please try again shortly.",
  "시도가 너무 많아요. 잠시 후 다시 해주세요.": "Too many attempts. Please try again shortly.",

  // ── 서버가 흔들릴 때 ──
  "서버 오류가 발생했습니다.": "Server error.",
  "서버 오류가 발생했어요.": "Server error.",
  "지금은 답변하기 어려워요. 잠시 후 다시 시도해주세요.": "Can't answer right now. Please try again shortly.",
  "메시지가 없습니다.": "No message.",

  // ── 나머지 ──
  "카카오 스킬이 설정되지 않았어요.":
    "The KakaoTalk skill is not configured.",
  "채점할 답변이 없습니다. 문항에 대한 AI 답변을 하나 이상 넣어주세요.":
    "There is nothing to score. Add at least one AI answer to a question.",
  "구매처와 제공 목적을 입력해주세요.":
    "Enter the recipient and the purpose of the transfer.",
  "조건에 맞는 동의 데이터가 없습니다.":
    "No consented data matches those filters.",
};
