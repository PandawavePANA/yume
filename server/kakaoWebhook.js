import crypto from "node:crypto";
import { extractAndVerify, chatReply } from "./claude.js";
import { resolveLegalClaims } from "./legalPipeline.js";
import { saveResult } from "./resultsStore.js";
import { buildOverallVerdict } from "./overallVerdict.js";
import { getHistory, appendTurns } from "./chatHistory.js";
import { getCached, setCached } from "./verifyCache.js";
import { resolveProductLinks } from "./coupang.js";
import { checkAndConsume, addTokensDemo, FREE_DAILY_LIMIT, TOKEN_PRICE_KRW } from "./usageStore.js";

// 카카오 i 오픈빌더 "스킬" 서버 규격. 오픈빌더 쪽에서 사용자가 채널에 보낸 메시지를
// 이 엔드포인트로 그대로 넘겨준다.
//
// 처음엔 카카오의 "콜백(useCallback)" 방식으로 만들었었다 — 즉시 안내만 응답하고,
// 검증이 끝나면 나중에 callbackUrl로 최종 결과를 다시 보내는 방식. 그런데 카카오
// 공식 스킬 가이드에 "스킬 타임아웃 시간은 고정이고 별도 조정이 불가능하니, 5초
// 안에 응답하도록 서버를 개발하라"고 명시돼 있어서, 이 콜백 방식 자체를 쓸 수
// 없다는 게 실제 테스트로 확인됐다(callbackUrl이 요청에 아예 안 실려 옴).
//
// 그래서 방식을 바꿨다: 검증이 끝날 때까지 카카오톡 채팅방 안에서 기다리게 하는
// 게 아니라, 5초 안에 결과 페이지 링크부터 바로 드린 뒤, 그 페이지 안에서
// (자동 새로고침으로) 검증이 끝나기를 기다리게 한다.
//
// 여기에 더해, 메시지마다 무조건 검증하지 않고 두 갈래로 나눈다:
//   - "검증"/"팩트체크"가 들어간 메시지 → 검증 파이프라인 + 대시보드 링크
//   - 그 외 → 일반 대화(chatReply)로 답하고, 카카오톡 채팅방 안에서 바로 이어진다.
// 첫 메시지(해당 사용자의 대화 기록이 비어있을 때)에는 이 두 가지 사용법을
// 설명하는 안내 문구를 답변 앞에 붙여준다.
//
// 비용 관리 — 같은 지라시가 여러 단톡방에 토씨 하나 안 틀리고 퍼지는 걸
// 감안해서 두 가지를 넣었다:
//   1) 캐싱: 완전히 같은 텍스트는 이전 검증 결과를 그대로 재사용한다(verifyCache.js).
//   2) 하루 무료 한도 + 토큰: 카카오 user id 기준으로 하루 5회까지 무료,
//      그 이상은 토큰(1개=100원)을 소모한다(usageStore.js). 토큰 "충전"은
//      아직 실제 결제 연동 전이라 "토큰충전 N" 데모 명령으로만 채워진다 —
//      실제 결제(카카오페이 등)는 별도로 붙여야 한다. 웹사이트 쪽 구독
//      (무료/스탠다드/전문가)은 이것과 별개로 그대로 둔다.
//
// 실제 채널 자체(카카오톡 채널 생성, 오픈빌더에서 이 URL을 스킬로 등록하는 것)는
// 카카오 비즈니스 계정으로 직접 만들어야 하는 부분이라 이 파일만으로는 동작하지
// 않는다.

const VERIFY_TRIGGER = /검증|팩트\s*체크/;
const CHARGE_TRIGGER = /토큰\s*충전\s*(\d+)?/;
// 안내 문구는 짧게 — 아래 chatReply 호출에서 모델에게 "이미 인사는 전달됐으니
// 또 인사하지 마라"는 힌트를 같이 주지만, 그래도 문구 자체가 길면 답변과 합쳐졌을
// 때 부담스러우니 한두 문장으로 줄였다.
const ONBOARDING_TEXT = "저는 AI 답변 팩트체크 서비스 유메예요 🌙 편하게 대화하다가, 소문이나 정보가 진짜인지 궁금하면 내용과 함께 \"검증해줘\"라고 말해주세요.\n\n";

function baseUrl(req) {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL.replace(/\/$/, "");
  return `${req.protocol}://${req.get("host")}`;
}

function textReply(text) {
  return { version: "2.0", template: { outputs: [{ simpleText: { text } }] } };
}

function linkReply({ resultUrl, text }) {
  return {
    version: "2.0",
    template: {
      outputs: [
        { simpleText: { text } },
        {
          basicCard: {
            title: "유메 검증 대시보드",
            description: "결과가 나오는 대로 이 페이지에 자동으로 표시됩니다. 10~30초 정도 걸려요.",
            buttons: [{ action: "webLink", label: "결과 확인하기", webLinkUrl: resultUrl }],
          },
        },
      ],
    },
  };
}

// "이 내용 검증해줘" 같은 트리거 문구를 끝에서 떼어내고 실제 검증 대상만 남긴다.
// 문구를 못 알아들으면(정규식이 안 맞으면) 원문 그대로를 검증 대상으로 쓴다 —
// 어차피 extractAndVerify가 사실 주장이 아닌 문장은 알아서 걸러낸다.
function stripVerifyTrigger(raw) {
  const stripped = raw
    .replace(/(그거|이거|이거는|이 내용|이 답변|위 내용)?\s*(검증|팩트\s*체크)\s*(좀)?\s*(해)?\s*줘?\s*[.!?~]*$/u, "")
    .trim();
  return stripped || raw;
}

function usageLimitMessage() {
  return (
    `오늘 무료 확인 ${FREE_DAILY_LIMIT}회를 다 쓰셨어요. 추가 확인은 1건당 토큰 1개(${TOKEN_PRICE_KRW}원)가 필요해요.\n\n` +
    `지금은 프로토타입이라 실제 결제 대신 데모 충전 명령을 써요 — "토큰충전 3"처럼 보내시면 데모로 3토큰이 채워져요 (실제 결제는 없어요).`
  );
}

async function runVerification(id, verifyText) {
  try {
    const cached = getCached(verifyText);
    if (cached) {
      saveResult(id, { input: verifyText, status: "done", result: cached });
      return;
    }
    const extracted = await extractAndVerify(verifyText);
    const claims = await resolveLegalClaims(extracted.claims);
    const overall = buildOverallVerdict(claims);
    const relatedProducts = await resolveProductLinks(extracted.related_products);
    const result = { ...extracted, claims, overall, related_products: relatedProducts };
    saveResult(id, { input: verifyText, status: "done", result });
    setCached(verifyText, result);
  } catch (e) {
    console.error("카카오 스킬 검증 오류:", e);
    saveResult(id, { input: verifyText, status: "error" });
  }
}

export function kakaoSkillHandler(req, res) {
  const utterance = (req.body?.userRequest?.utterance || "").trim();
  const userId = req.body?.userRequest?.user?.id;
  const origin = baseUrl(req);
  const isFirstTurn = getHistory(userId).length === 0;
  const prefix = isFirstTurn ? ONBOARDING_TEXT : "";

  if (!utterance) {
    return res.json(textReply(prefix + "확인하고 싶은 내용을 그대로 붙여넣어 보내주세요."));
  }

  // "토큰충전 N" — 실제 결제 없는 데모 충전. 실제 서비스로 넘어가면 이 분기를
  // 카카오페이 등 결제 연동으로 바꿔야 한다.
  const chargeMatch = utterance.match(CHARGE_TRIGGER);
  if (chargeMatch) {
    const n = Math.max(1, parseInt(chargeMatch[1] || "1", 10));
    const newBalance = addTokensDemo(userId, n);
    appendTurns(userId, [{ role: "user", content: utterance }, { role: "assistant", content: `(데모 토큰 충전 ${n}개)` }]);
    return res.json(textReply(prefix + `데모: ${n}토큰이 충전됐어요 (실제 결제는 없었어요). 현재 보유 토큰: ${newBalance}개`));
  }

  if (VERIFY_TRIGGER.test(utterance)) {
    const verifyText = stripVerifyTrigger(utterance);
    if (!verifyText) {
      appendTurns(userId, [{ role: "user", content: utterance }]);
      return res.json(textReply(prefix + "검증하고 싶은 내용을 함께 붙여넣어 주세요. 예: \"[뉴스 내용] 검증해줘\""));
    }

    const usage = checkAndConsume(userId);
    if (!usage.allowed) {
      appendTurns(userId, [{ role: "user", content: utterance }]);
      return res.json(textReply(prefix + usageLimitMessage()));
    }
    const usageNote = usage.usedFree
      ? `(오늘 무료 확인 ${FREE_DAILY_LIMIT - usage.remainingFree}/${FREE_DAILY_LIMIT}회 사용)`
      : `(토큰 1개 사용 · 남은 토큰 ${usage.tokens}개)`;

    // 캐시에 있으면 기다릴 필요 없이 바로 완료 상태로 링크를 만든다.
    const cached = getCached(verifyText);
    const id = crypto.randomBytes(6).toString("hex");
    if (cached) {
      saveResult(id, { input: verifyText, status: "done", result: cached });
    } else {
      saveResult(id, { input: verifyText, status: "pending" });
    }
    const resultUrl = `${origin}/r/${id}`;
    appendTurns(userId, [
      { role: "user", content: utterance },
      { role: "assistant", content: `(검증 요청을 대시보드로 안내함: ${resultUrl})` },
    ]);
    const introText = cached
      ? "이전에 확인한 것과 같은 내용이라 바로 결과를 보여드려요 ⚡"
      : "유메가 확인하고 있어요 🔎 아래 링크에서 결과를 확인해보세요.";
    res.json(linkReply({ resultUrl, text: `${prefix}${introText} ${usageNote}` }));

    if (!cached) {
      runVerification(id, verifyText);
    }
    return;
  }

  // 검증 요청이 아니면 일반 대화로 응답한다 — 카카오톡 채팅방 안에서 바로 이어진다.
  (async () => {
    try {
      const history = getHistory(userId);
      // 첫 턴에는 안내 문구를 앞에 붙이는데, 모델은 그 문구를 본 적이 없어서
      // 자기도 또 인사/자기소개를 반복하는 경우가 있었다(안내 문구 + 모델의
      // 인사가 겹쳐서 메시지가 너무 길어짐). 저장되는 대화 기록은 원문 그대로
      // 두고, 이번 호출에만 짧은 안내를 덧붙여서 중복 인사를 막는다.
      const messageForModel = isFirstTurn
        ? `${utterance}\n\n(참고: 방금 사용자에게 서비스 소개가 이미 전달됐음. 다시 인사하거나 자기소개하지 말고 위 메시지에 바로 답할 것.)`
        : utterance;
      const reply = await chatReply([...history, { role: "user", content: messageForModel }]);
      appendTurns(userId, [{ role: "user", content: utterance }, { role: "assistant", content: reply }]);
      res.json(textReply(prefix + reply));
    } catch (e) {
      console.error("카카오 스킬 대화 오류:", e);
      res.json(textReply(prefix + "죄송해요, 지금 답변드리기 어려워요. 잠시 후 다시 시도해주세요."));
    }
  })();
}
