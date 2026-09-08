import crypto from "node:crypto";
import { extractAndVerify } from "./claude.js";
import { resolveLegalClaims } from "./legalPipeline.js";
import { saveResult } from "./resultsStore.js";
import { buildOverallVerdict } from "./overallVerdict.js";

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
// (자동 새로고침으로) 검증이 끝나기를 기다리게 한다. 카카오의 5초 제한과
// 전혀 부딪히지 않는 방식이다 — 스킬 응답은 항상 즉시 끝난다.
//
// 실제 채널 자체(카카오톡 채널 생성, 오픈빌더에서 이 URL을 스킬로 등록하는 것)는
// 카카오 비즈니스 계정으로 직접 만들어야 하는 부분이라 이 파일만으로는 동작하지
// 않는다.

function baseUrl(req) {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL.replace(/\/$/, "");
  return `${req.protocol}://${req.get("host")}`;
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

export function kakaoSkillHandler(req, res) {
  const utterance = (req.body?.userRequest?.utterance || "").trim();
  const origin = baseUrl(req);

  if (!utterance) {
    return res.json({
      version: "2.0",
      template: { outputs: [{ simpleText: { text: "확인하고 싶은 내용을 그대로 붙여넣어 보내주세요." } }] },
    });
  }

  // 1) id를 먼저 만들고 "확인 중" 상태로 저장한 뒤, 5초 안에 그 링크부터 바로 응답한다.
  const id = crypto.randomBytes(6).toString("hex");
  saveResult(id, { input: utterance, status: "pending" });
  const resultUrl = `${origin}/r/${id}`;
  res.json(linkReply({ resultUrl, text: "유메가 확인하고 있어요 🔎 아래 링크에서 결과를 확인해보세요." }));

  // 2) 응답을 보낸 뒤 백그라운드에서 실제 검증을 계속 진행하고, 끝나면 같은 id에
  //    최종 결과로 덮어쓴다. 사용자가 이미 받은 링크(/r/:id)는 그대로 두고,
  //    페이지 쪽에서 자동 새로고침하며 이 결과가 채워지길 기다린다.
  (async () => {
    try {
      const extracted = await extractAndVerify(utterance);
      const claims = await resolveLegalClaims(extracted.claims);
      const overall = buildOverallVerdict(claims);
      saveResult(id, { input: utterance, status: "done", result: { ...extracted, claims, overall } });
    } catch (e) {
      console.error("카카오 스킬 처리 오류:", e);
      saveResult(id, { input: utterance, status: "error" });
    }
  })();
}
