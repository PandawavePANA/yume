import crypto from "node:crypto";
import { extractAndVerify, chatReply } from "./claude.js";
import { resolveLegalClaims } from "./legalPipeline.js";
import { saveResult } from "./resultsStore.js";
import { buildOverallVerdict } from "./overallVerdict.js";
import { getHistory, appendTurns } from "./chatHistory.js";

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
//   - "검증"/"팩트체크"가 들어간 메시지 → 기존처럼 검증 파이프라인 + 대시보드 링크
//   - 그 외 → 일반 대화(chatReply)로 답하고, 카카오톡 채팅방 안에서 바로 대화가
//     이어진다. 이 채팅 응답은 검증과 달리 보통 몇 초 안에 끝나서 5초 제한 안에
//     동기 응답으로 처리한다(다만 아주 긴 답변이 나오면 드물게 타임아웃 여지는
//     있다).
// 첫 메시지(해당 사용자의 대화 기록이 비어있을 때)에는 이 두 가지 사용법을
// 설명하는 안내 문구를 답변 앞에 붙여준다.
//
// 실제 채널 자체(카카오톡 채널 생성, 오픈빌더에서 이 URL을 스킬로 등록하는 것)는
// 카카오 비즈니스 계정으로 직접 만들어야 하는 부분이라 이 파일만으로는 동작하지
// 않는다.

const VERIFY_TRIGGER = /검증|팩트\s*체크/;
const ONBOARDING_TEXT =
  "안녕하세요! 저는 AI 답변 팩트체크 서비스 유메예요 🌙\n\n" +
  "편하게 아무 얘기나 물어보셔도 되고, 궁금한 소문이나 정보가 사실인지 확인하고 싶으면 " +
  "내용을 붙여넣으면서 \"검증해줘\"라고 말씀해주세요. 검증 결과는 대시보드 링크로 보내드려요.\n\n";

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

export function kakaoSkillHandler(req, res) {
  const utterance = (req.body?.userRequest?.utterance || "").trim();
  const userId = req.body?.userRequest?.user?.id;
  const origin = baseUrl(req);
  const isFirstTurn = getHistory(userId).length === 0;
  const prefix = isFirstTurn ? ONBOARDING_TEXT : "";

  if (!utterance) {
    return res.json(textReply(prefix + "확인하고 싶은 내용을 그대로 붙여넣어 보내주세요."));
  }

  if (VERIFY_TRIGGER.test(utterance)) {
    const verifyText = stripVerifyTrigger(utterance);
    if (!verifyText) {
      appendTurns(userId, [{ role: "user", content: utterance }]);
      return res.json(textReply(prefix + "검증하고 싶은 내용을 함께 붙여넣어 주세요. 예: \"[뉴스 내용] 검증해줘\""));
    }

    // 1) id를 먼저 만들고 "확인 중" 상태로 저장한 뒤, 5초 안에 그 링크부터 바로 응답한다.
    const id = crypto.randomBytes(6).toString("hex");
    saveResult(id, { input: verifyText, status: "pending" });
    const resultUrl = `${origin}/r/${id}`;
    appendTurns(userId, [
      { role: "user", content: utterance },
      { role: "assistant", content: `(검증 요청을 대시보드로 안내함: ${resultUrl})` },
    ]);
    res.json(linkReply({ resultUrl, text: prefix + "유메가 확인하고 있어요 🔎 아래 링크에서 결과를 확인해보세요." }));

    // 2) 응답을 보낸 뒤 백그라운드에서 실제 검증을 계속 진행하고, 끝나면 같은 id에
    //    최종 결과로 덮어쓴다.
    (async () => {
      try {
        const extracted = await extractAndVerify(verifyText);
        const claims = await resolveLegalClaims(extracted.claims);
        const overall = buildOverallVerdict(claims);
        saveResult(id, { input: verifyText, status: "done", result: { ...extracted, claims, overall } });
      } catch (e) {
        console.error("카카오 스킬 검증 오류:", e);
        saveResult(id, { input: verifyText, status: "error" });
      }
    })();
    return;
  }

  // 검증 요청이 아니면 일반 대화로 응답한다 — 카카오톡 채팅방 안에서 바로 이어진다.
  (async () => {
    try {
      const history = getHistory(userId);
      const reply = await chatReply([...history, { role: "user", content: utterance }]);
      appendTurns(userId, [{ role: "user", content: utterance }, { role: "assistant", content: reply }]);
      res.json(textReply(prefix + reply));
    } catch (e) {
      console.error("카카오 스킬 대화 오류:", e);
      res.json(textReply(prefix + "죄송해요, 지금 답변드리기 어려워요. 잠시 후 다시 시도해주세요."));
    }
  })();
}
