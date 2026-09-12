import { chatReply } from "./claude.js";
import { getHistory, appendTurns } from "./chatHistory.js";
import { checkAndConsume, refundOne, FREE_DAILY_LIMIT } from "./usageStore.js";
import { startVerification, MAX_INPUT_CHARS } from "./verifyPipeline.js";
import { getVerification, newVerificationId } from "./verificationStore.js";
import { logError } from "./errorLog.js";

// 카카오 i 오픈빌더 "스킬" 서버. 카카오는 스킬 응답을 5초 안에 요구하므로(콜백 방식은
// 실제로 쓸 수 없음을 테스트로 확인), 검증 요청이면 결과 페이지 링크(/r/:id)부터 바로
// 돌려주고 검증은 백그라운드에서 끝낸다. 결과 페이지가 자동 새로고침으로 완료를 기다린다.
//   - "검증"/"팩트체크"가 들어간 메시지 → 검증 + 결과 링크
//   - 그 외 → 일반 대화(chatReply)
// 카카오 사용자 ID 기준 하루 무료 한도가 있다. 카카오 채널 데이터는 데이터 활용 동의 절차가
// 없으므로 데이터셋에서 항상 제외된다(data_consent = 0).
const VERIFY_TRIGGER = /검증|팩트\s*체크/;
const ONBOARDING_TEXT = `저는 AI 답변 팩트체크 서비스 유메예요 🌙 편하게 대화하다가, 소문이나 정보가 진짜인지 궁금하면 내용과 함께 "검증해줘"라고 말해주세요. 하루 ${FREE_DAILY_LIMIT}회까지 무료예요.\n\n`;

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
            title: "유메 검증 결과",
            description: "결과가 나오는 대로 이 페이지에 자동으로 표시됩니다. 10~30초 정도 걸려요.",
            buttons: [{ action: "webLink", label: "결과 확인하기", webLinkUrl: resultUrl }],
          },
        },
      ],
    },
  };
}

function stripVerifyTrigger(raw) {
  const stripped = raw
    .replace(/(그거|이거|이거는|이 내용|이 답변|위 내용)?\s*(검증|팩트\s*체크)\s*(좀)?\s*(해)?\s*줘?\s*[.!?~]*$/u, "")
    .trim();
  return stripped || raw;
}

export async function kakaoSkillHandler(req, res) {
  const utterance = String(req.body?.userRequest?.utterance || "").trim();
  const kakaoId = req.body?.userRequest?.user?.id;
  if (!kakaoId) return res.json(textReply("사용자 정보를 확인할 수 없어요. 잠시 후 다시 시도해주세요."));
  const clientKey = `kakao:${kakaoId}`;
  const history = await getHistory(clientKey);
  const isFirstTurn = history.length === 0;
  const prefix = isFirstTurn ? ONBOARDING_TEXT : "";
  const remember = (turns) => appendTurns(clientKey, turns, { channel: "kakao" }).catch((e) => logError("kakaoWebhook:history", e));

  if (!utterance) return res.json(textReply(prefix + "확인하고 싶은 내용을 그대로 붙여넣어 보내주세요."));

  if (VERIFY_TRIGGER.test(utterance)) {
    const verifyText = stripVerifyTrigger(utterance).slice(0, MAX_INPUT_CHARS);
    if (!verifyText) {
      await remember([{ role: "user", content: utterance }]);
      return res.json(textReply(prefix + '검증하고 싶은 내용을 함께 붙여넣어 주세요. 예: "[뉴스 내용] 검증해줘"'));
    }
    const usage = await checkAndConsume({ kakaoId });
    if (!usage.allowed) {
      await remember([{ role: "user", content: utterance }]);
      return res.json(textReply(prefix + `오늘 무료 확인 ${FREE_DAILY_LIMIT}회를 다 쓰셨어요. 내일 다시 이용해주세요. 더 많이 확인하려면 유메 웹사이트에서 가입해 요금제를 이용할 수 있어요.`));
    }
    const usageNote = usage.usedFree ? `(오늘 무료 확인 ${FREE_DAILY_LIMIT - usage.remainingFree}/${FREE_DAILY_LIMIT}회 사용)` : `(토큰 1개 사용 · 남은 토큰 ${usage.tokens}개)`;

    const id = newVerificationId();
    const { done } = await startVerification({ id, text: verifyText, source: "kakao", clientKey, dataConsent: false });
    done.catch(() => refundOne({ kakaoId, usedFree: usage.usedFree }).catch(() => {}));
    const resultUrl = `${baseUrl(req)}/r/${id}`;
    await remember([
      { role: "user", content: utterance },
      { role: "assistant", content: `(검증 요청을 결과 페이지로 안내함: ${resultUrl})` },
    ]);
    // 같은 내용을 이미 검증했다면 캐시로 곧바로 끝나므로 아주 잠깐만 기다려 본다(카카오 5초 제한 안).
    await Promise.race([done.catch(() => null), new Promise((r) => setTimeout(r, 300))]);
    const finished = (await getVerification(id))?.status === "done";
    const introText = finished ? "이전에 확인한 것과 같은 내용이라 바로 결과를 보여드려요 ⚡" : "유메가 확인하고 있어요 🔎 아래 링크에서 결과를 확인해보세요.";
    return res.json(linkReply({ resultUrl, text: `${prefix}${introText} ${usageNote}` }));
  }

  try {
    // 첫 턴에는 안내 문구를 앞에 붙이므로, 모델이 인사·자기소개를 반복하지 않게 이번 호출에만 힌트를 준다.
    const messageForModel = isFirstTurn
      ? `${utterance}\n\n(참고: 방금 사용자에게 서비스 소개가 이미 전달됐음. 다시 인사하거나 자기소개하지 말고 위 메시지에 바로 답할 것.)`
      : utterance;
    const reply = await chatReply([...history, { role: "user", content: messageForModel }]);
    await remember([{ role: "user", content: utterance }, { role: "assistant", content: reply }]);
    res.json(textReply(prefix + reply));
  } catch (e) {
    logError("kakaoWebhook:chat", e);
    res.json(textReply(prefix + "죄송해요, 지금 답변드리기 어려워요. 잠시 후 다시 시도해주세요."));
  }
}
