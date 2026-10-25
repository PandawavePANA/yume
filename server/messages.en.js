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
  // 한도 문구(server/app.js limitMessage). 숫자가 상수에서 오므로 값이 바뀌면 여기도 같이 바꾼다 —
  // 어긋나면 영어 화면에 한국어가 그대로 나갈 뿐 깨지지는 않는다.
  "같은 네트워크에서 오늘 쓸 수 있는 무료 확인 횟수를 모두 사용했어요. 내일 0시(한국 시간)에 다시 이용하실 수 있어요.":
    "This network has used all of today's free checks. They come back at midnight Korea time.",
  "오늘 무료 확인 3회를 다 쓰셨어요. 내일 0시(한국 시간)에 다시 3회가 생겨요. 가입하면 매일 무료 3회는 그대로이고 기록이 저장돼요. 휴대폰 본인확인까지 마치면 매달 5크레딧을 더 드려요.":
    "You've used today's 3 free checks. 3 more arrive at midnight Korea time. Sign up and you keep 3 free checks a day with a saved history; verify your phone for 5 extra credits every month.",
  "제보 보상을 받으려면 휴대폰 본인확인을 먼저 마쳐주세요.": "Verify your phone first to receive rewards for reports.",
  "오늘은 이용자가 많아 준비한 무료 확인이 모두 찼어요. 내일 0시(한국 시간)에 다시 열려요. 지금 더 확인하려면 크레딧이 필요해요(20크레딧 12,000원부터).":
    "Today's free checks are used up; it's been busy. They reopen at midnight Korea time. To keep checking now you need credits (from 12,000 won for 20).",
  "오늘은 이용자가 많아 준비한 무료 확인이 모두 찼어요. 내일 0시(한국 시간)에 다시 열려요. 가입하고 크레딧을 충전하면 지금도 확인할 수 있어요.":
    "Today's free checks are used up; it's been busy. They reopen at midnight Korea time. Sign up and add credits to keep checking now.",
  "오늘 무료 3회를 다 쓰셨어요. 크레딧으로 더 확인하려면 휴대폰 본인확인이 한 번 필요해요.":
    "You've used today's 3 free checks. To keep checking with credits, verify your phone once.",
  "오늘 무료 확인 3회를 다 쓰셨어요. 내일 0시(한국 시간)에 다시 3회가 생겨요. 지금 더 확인하려면 크레딧이 필요해요(20크레딧 12,000원부터).":
    "You've used today's 3 free checks. 3 more arrive at midnight Korea time. To keep checking now you need credits (from 12,000 won for 20).",
  "오늘 남은 확인 횟수를 모두 사용했어요.": "You've used all of today's checks.",

  "알 수 없는 기록이에요.":
    "Unknown event.",
  // ── 의뢰 대화 사진 ──
  "사진을 찾을 수 없어요.": "That photo couldn't be found.",
  "사진을 읽지 못했어요. 다시 골라주세요.": "Couldn't read that photo. Please choose it again.",
  "JPG · PNG · WEBP 사진만 보낼 수 있어요.": "Only JPG, PNG and WEBP photos can be sent.",
  "사진 파일이 아니거나 손상됐어요.": "That isn't a photo, or the file is damaged.",
  "사진 한 장은 3MB까지 보낼 수 있어요.": "Each photo can be up to 3MB.",
  "보낼 사진을 골라주세요.": "Choose the photos to send.",

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
  "제보한 내용을 베리라인이 데이터로 활용하는 데 동의해주세요.":
    "Please agree that Veriline may use your report as research data.",
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

  // ── 판정 정정 ──
  "보내주신 내용을 베리라인이 판정 개선에 쓰는 데 동의해주세요.":
    "Please agree that VERILINE may use what you send to improve its verdicts.",
  "맞는 판정을 골라주세요.": "Pick the verdict you believe is right.",
  "베리라인이 낸 판정과 같아요. 다른 판정이어야 정정이 됩니다.":
    "That is the verdict VERILINE already gave. A correction has to differ from it.",
  "근거 링크가 올바른 주소가 아니에요. 생략하고 설명만 적어주셔도 됩니다.":
    "That evidence link is not a valid address. You can leave it out and just describe the evidence.",
  "근거 링크는 http 또는 https 주소만 넣을 수 있어요.":
    "Evidence links must be http or https addresses.",
  "이 주장은 이미 정정을 보내셨어요.": "You have already sent a correction for this claim.",
  "정정을 찾을 수 없어요.": "That correction could not be found.",
  "이미 처리된 정정이에요.": "That correction has already been reviewed.",
  // 일감 합치기 (projectLink.js)
  "합칠 일감을 다시 골라주세요.": "Pick the jobs to merge again.",
  "일감을 찾을 수 없어요.": "That job could not be found.",
  "같은 의뢰에서 나온 일감만 합칠 수 있어요.": "Only jobs from the same inquiry can be merged.",
  // 묶음 검증 (apiV1.js)
  "검증을 시작하지 못했습니다. 다시 보내주세요.": "Could not start this verification. Please send it again.",
  // 무료 AI 점검 (auditApi.js)
  "답변을 질문별로 나누지 못했어요. 질문 전체 복사로 받은 지시대로 각 답변 앞에 [답변 1], [답변 2]가 붙어 있는지 확인해 주세요.": "Couldn't split the answer by question. Check that each answer starts with [Answer 1], [Answer 2] as the copied instructions asked.",
  "answer_text(답변 전체) 또는 answers({ 문항id: 답변 })를 보내주세요.": "Send answer_text (the whole answer) or answers ({ questionId: answer }).",
  // 크레딧 (creditsApi.js)
  "월 요금제 판매를 마쳤어요. 크레딧을 충전해서 이용해주세요.": "Monthly plans are no longer sold. Please top up credits instead.",
  // 문서 검사 (documents.js, documentsWeb.js)
  "text 또는 file({ name, content_base64 })을 보내주세요.": "Send text or file ({ name, content_base64 }).",
  "검사할 내용이 없습니다.": "There is nothing to check.",
  "검사할 글을 붙여 넣거나 파일을 올려 주세요.": "Paste the text to check or upload a file.",
  "API 키를 더 만들 수 없어 문서 검사를 시작하지 못했어요. 쓰지 않는 키를 하나 폐기해 주세요.": "Couldn't start the document check because no more API keys can be created. Revoke a key you don't use.",
  "문서를 찾을 수 없어요.": "That document could not be found.",
  // 멱등 키 (idempotency.js)
  "Idempotency-Key는 공백 없는 영문·숫자·기호 100자 이하여야 합니다.": "Idempotency-Key must be up to 100 letters, digits or symbols with no spaces.",
  // 참고 자료 대조 (referenceCheck.js)
  "references는 배열이어야 합니다. 예: [{\"title\":\"상품 설명서\",\"text\":\"...\"}]": "references must be an array. Example: [{\"title\":\"Product sheet\",\"text\":\"...\"}]",
  // 검증 마크 (trustMarks.js)
  "문서를 찾을 수 없습니다.": "Document not found.",
  "검증 마크를 받으면 이 글과 검증 결과가 공개 검증 페이지에 게시됩니다. 동의하시면 publish: true로 보내주세요.": "Issuing a verification mark publishes this text and its results on a public verification page. If you agree, send publish: true.",
  "마크를 찾을 수 없어요.": "That mark could not be found.",
  // 웹훅 (webhooks.js)
  "callback_url은 2,000자 이하의 문자열이어야 합니다.": "callback_url must be a string of at most 2,000 characters.",
  "callback_url이 올바른 주소가 아닙니다.": "callback_url is not a valid URL.",
  "callback_url은 https 주소여야 합니다.": "callback_url must be an https URL.",
  "callback_url에 계정 정보를 넣을 수 없습니다.": "callback_url cannot contain credentials.",
  "callback_url은 공인 주소여야 합니다(내부망·사설 IP·localhost 불가).": "callback_url must be a public address (no internal networks, private IPs or localhost).",
  "callback_secret은 200자 이하의 문자열이어야 합니다.": "callback_secret must be a string of at most 200 characters.",
  // 지수 공개 페이지 (app.js)
  "아직 발행한 지수가 없어요.": "No index issue has been published yet.",
  "그런 호가 없어요.": "That issue doesn't exist.",
  // 감사 데스크 (auditDesk.js, auditDeskApi.js)
  "회사 이름을 적어주세요.": "Enter the company name.",
  "감사 건을 찾을 수 없어요.": "That audit could not be found.",
  "동의 내용을 적어주세요(누가, 언제, 어떤 경로로 동의했는지).": "Record the consent (who agreed, when, and how).",
  "알 수 없는 단계예요.": "Unknown stage.",
  "발송은 체크리스트를 통과한 뒤 '발송 처리'로만 할 수 있어요.": "Sending can only be recorded with 'Mark as sent' after the checklist passes.",
  "아직 보내지 않은 건이에요. 먼저 발송 처리를 해주세요.": "This hasn't been sent yet. Mark it as sent first.",
  "후속 연락은 한 번만 합니다. 이미 보냈어요.": "There is only one follow-up, and it has already been sent.",
  "유료 의향은 금액이 있어야 셉니다. 결제했거나 금액·일정이 적힌 의사를 받은 금액을 적어주세요.": "Paid intent counts only with an amount. Enter the amount paid, or the amount in a commitment with a price and date.",
  "지금은 기준 문항을 만들 수 없어요. 법제처 조회가 불안정합니다. 잠시 후 다시 시도해주세요.": "Can't build reference questions right now — the official law database is unstable. Please try again shortly.",
  "알 수 없는 주제예요.": "Unknown topic.",
  "질문을 적어주세요.": "Enter a question.",
  "질문을 찾을 수 없어요.": "That question could not be found.",
  "검사 중인 답변은 고칠 수 없어요. 끝난 뒤에 고쳐주세요.": "An answer can't be edited while it's being checked. Edit it after the check finishes.",
  "답변 시각이 미래예요. 상대 서비스에서 답을 받은 시각을 적어주세요.": "The answer time is in the future. Enter when the service actually gave the answer.",
  "캡처를 찾을 수 없어요.": "That screenshot could not be found.",
  "약관 확인이 먼저예요. 자동화·평가 목적 사용 금지 조항이 없다는 걸 확인하고 '문제없음'으로 적어주세요.": "Check the terms of service first. Confirm there's no ban on automation or evaluation use, then mark it as OK.",
  "재확인 항목을 찾을 수 없어요.": "That review item could not be found.",
  "알 수 없는 재확인 결과예요.": "Unknown review result.",
  "직접 열어 확인한 공식 원문 링크를 적어주세요.": "Enter the link to the official source you opened and checked yourself.",
  "링크는 http(s)로 시작해야 해요.": "Links must start with http(s).",
  "원문으로 확인된 항목만 보고서 사례로 쓸 수 있어요.": "Only items confirmed against the source can be used as report examples.",
  "지수 사례는 원문으로 확인된 오류만 쓸 수 있어요.": "Only errors confirmed against the source can be used as index examples.",
  "이미 발송 처리한 건이에요.": "This has already been marked as sent.",
  "회사명 공개 동의가 먼저예요. 동의 없이 결과를 공개하지 않습니다.": "Consent to publish the company name comes first. Results are never published without it.",
  "재확인이 끝난 감사만 공개할 수 있어요.": "Only audits with every item rechecked can be published.",
  "스프린트 시작일을 다시 확인해주세요.": "Check the sprint start date.",
  "기간을 다시 확인해주세요 — 시작이 끝보다 앞이어야 해요.": "Check the period — the start must come before the end.",
  "지수를 찾을 수 없어요.": "That index issue could not be found.",
  // 지수 발행 (hallucinationIndex.js)
  "주소 이름은 영문 소문자·숫자·하이픈 3~32자로 적어주세요(예: 2026-q4).": "Use 3–32 lowercase letters, digits or hyphens for the address (e.g. 2026-q4).",
  "제목을 적어주세요.": "Enter a title.",
  "같은 주소 이름이 이미 있어요.": "That address is already taken.",
  "발행한 지수는 정정 발행으로만 고칠 수 있어요.": "A published issue can only be changed by publishing a correction.",
  "이미 발행한 지수예요.": "This issue is already published.",
  "기간이 끝난 뒤에 발행할 수 있어요. 진행 중인 기간의 숫자는 얼리지 않습니다.": "An issue can be published only after its period ends. Numbers for an ongoing period aren't frozen.",
  "해설을 적어주세요. 숫자만 내놓으면 읽는 사람이 무엇을 봐야 할지 모릅니다.": "Write the commentary. Numbers alone don't tell readers what to look at.",
  "발행한 지수만 정정할 수 있어요.": "Only published issues can be corrected.",
  "정정 사유를 적어주세요. 사유는 지수 페이지에 그대로 공개됩니다.": "Enter the reason for the correction. It is published on the index page as written.",
  "초안만 지울 수 있어요.": "Only drafts can be deleted.",
  "대화 내용을 붙여넣어 주세요.": "Paste the conversation.",
  "가져올 질문이 없어요. 이 건에 질문 세트를 먼저 만드세요.": "There are no questions to copy. Build a question set for this audit first.",
  "질문을 넣을 감사 건을 골라주세요.": "Choose the audits to add the questions to.",
  "지금은 맞춤 질문을 만들 수 없어요. 잠시 후 다시 시도해주세요.": "Tailored questions can't be drafted right now. Try again shortly.",
  "답을 채울 빈 질문이 없어요.": "There are no unanswered questions to fill.",
  "지금은 질문을 만들 수 없어요. 법제처 조회가 불안정합니다. 잠시 후 다시 시도해주세요.": "Questions can't be generated right now because the law.go.kr lookup is unstable. Try again shortly.",

  // ── 기업 견적 · 계약 신청 ──
  "사이트에서 바로 견적을 받을 수 있는 상품이 아니에요.": "This product can't be quoted instantly on the site.",
  "품목 이름과 금액(공급가액)을 넣어 주세요.": "Enter an item name and an amount (before VAT).",
  "이 상품은 범위를 듣고 견적을 드려요. 도입 문의로 보내 주세요.": "We quote this product after hearing the scope. Please send an inquiry.",
  "알 수 없는 상품이에요.": "Unknown product.",
  "회사명을 입력해 주세요.": "Enter your company name.",
  "담당자 성함을 입력해 주세요.": "Enter the contact person's name.",
  "견적서를 받으실 이메일을 정확히 입력해 주세요.": "Enter a valid email address to receive the quote.",
  "견적서를 찾을 수 없어요.": "Quote not found.",
  "취소된 견적이에요. 새 견적을 받아 주세요.": "This quote was cancelled. Please request a new one.",
  "유효기간이 지난 견적이에요. 같은 조건으로 새 견적을 받아 주세요.": "This quote has expired. Please request a new one with the same terms.",
  "사업자등록번호를 다시 확인해 주세요(10자리, 검증번호 불일치).": "Check the business registration number (10 digits; the check digit doesn't match).",
  "상호(사업자등록증의 이름)를 입력해 주세요.": "Enter the business name as shown on the registration certificate.",
  "대표자 성명을 입력해 주세요.": "Enter the representative's name.",
  "세금계산서를 받을 이메일을 정확히 입력해 주세요.": "Enter a valid email address for the tax invoice.",
  "결제 방법을 골라 주세요.": "Choose a payment method.",
  "서비스 이용 조건과 데이터 처리 부속서에 동의해 주세요.": "Please agree to the service terms and the data processing addendum.",
  "입금 확인된 견적은 취소할 수 없어요(환불은 수정세금계산서와 함께 따로).": "A paid quote can't be cancelled (refunds are handled separately with an amended tax invoice).",
  "지금은 검사 엔진 점검 중이라 충전을 잠시 멈췄어요. 결제하고 쓰지 못하는 일이 없도록 한 조치예요. 잠시 후 다시 시도해 주세요.": "Top-ups are paused while the checking engine is under maintenance, so you don't pay for something you can't use. Please try again shortly.",
  "아직 카드 결제를 받을 수 없는 상태라 이 결제는 처리되지 않았어요. 계좌이체로 진행해 주세요.": "Card payments aren't available yet, so this payment wasn't processed. Please pay by bank transfer.",
  "증빙 종류를 골라 주세요.": "Choose the type of receipt.",
  "현금영수증을 받을 휴대폰 번호를 정확히 입력해 주세요.": "Enter a valid mobile number for the cash receipt.",
  "입금자명을 입력해 주세요.": "Enter the depositor name.",
};
