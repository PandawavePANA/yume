import crypto from "node:crypto";
import { extractAndVerify } from "./claude.js";
import { resolveLegalClaims } from "./legalPipeline.js";
import { saveResult } from "./resultsStore.js";
import { buildOverallVerdict } from "./overallVerdict.js";

// 카카오 i 오픈빌더 "스킬" 서버 규격. 오픈빌더 쪽에서 사용자가 채널에 보낸 메시지를
// 이 엔드포인트로 그대로 넘겨준다. 카카오는 스킬 서버가 5초 안에 응답하지 않으면
// 타임아웃으로 처리하는데, 유메의 검증(웹검색 + 법제처 조회)은 보통 10~30초가
// 걸려서 그 안에 못 끝낸다. 그래서 카카오가 지원하는 "콜백" 방식을 쓴다:
//   1) 요청이 오면 즉시 "확인 중이에요" 같은 안내만 먼저 응답한다(useCallback:true).
//   2) 백그라운드에서 실제 검증을 계속 진행한다.
//   3) 끝나면 요청에 같이 온 callbackUrl로 최종 결과를 다시 POST해서 사용자에게
//      전달되게 한다.
// 실제 채널 자체(카카오톡 채널 생성, 오픈빌더에서 이 URL을 스킬로 등록하는 것)는
// 카카오 비즈니스 계정으로 직접 만들어야 하는 부분이라 이 파일만으로는 동작하지
// 않는다 — README나 별도 안내 문서에 그 절차를 정리해두는 걸 권한다.

function baseUrl(req) {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL.replace(/\/$/, "");
  return `${req.protocol}://${req.get("host")}`;
}

function immediateReply(text) {
  return { version: "2.0", useCallback: true, data: { text } };
}

function finalSkillResponse({ overall, resultUrl }) {
  return {
    version: "2.0",
    template: {
      outputs: [
        { simpleText: { text: `[${overall.label}]\n${overall.detail}` } },
        {
          basicCard: {
            title: "유메 검증 대시보드",
            description: "주장별 근거와 출처까지 자세히 보려면 아래에서 확인하세요.",
            buttons: [{ action: "webLink", label: "대시보드에서 자세히 보기", webLinkUrl: resultUrl }],
          },
        },
      ],
    },
  };
}

async function sendCallback(callbackUrl, payload) {
  try {
    const res = await fetch(callbackUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) console.error("카카오 콜백 전송 실패:", res.status, await res.text().catch(() => ""));
  } catch (e) {
    console.error("카카오 콜백 전송 오류:", e);
  }
}

export function kakaoSkillHandler(req, res) {
  const utterance = (req.body?.userRequest?.utterance || "").trim();
  const callbackUrl = req.body?.userRequest?.callbackUrl;
  const origin = baseUrl(req);

  if (!utterance) {
    return res.json({
      version: "2.0",
      template: { outputs: [{ simpleText: { text: "확인하고 싶은 내용을 그대로 붙여넣어 보내주세요." } }] },
    });
  }
  if (!callbackUrl) {
    // 콜백을 지원하지 않는 요청(오픈빌더 설정에서 콜백이 꺼져 있는 경우)이면
    // 그냥 최선을 다해 빨리 끝내고 바로 응답한다 — 다만 5초를 넘기면 카카오가
    // 자체적으로 타임아웃 처리하니, 실제 운영 시엔 오픈빌더에서 이 스킬의
        // "콜백 사용"을 반드시 켜두는 걸 권장한다.
    return res.json({
      version: "2.0",
      template: { outputs: [{ simpleText: { text: "지금은 확인이 지연되고 있어요. 잠시 후 다시 시도해주세요." } }] },
    });
  }

  // 1) 먼저 즉시 응답 — 사용자는 "확인 중" 메시지를 바로 받는다.
  res.json(immediateReply("유메가 확인하고 있어요. 결과가 나오면 이어서 보내드릴게요 🔎"));

  // 2) 백그라운드에서 실제 검증 진행 후, 끝나면 callbackUrl로 최종 결과 전송.
  (async () => {
    try {
      const extracted = await extractAndVerify(utterance);
      const claims = await resolveLegalClaims(extracted.claims);
      const overall = buildOverallVerdict(claims);
      const id = crypto.randomBytes(6).toString("hex");
      saveResult(id, { input: utterance, result: { ...extracted, claims, overall } });
      const resultUrl = `${origin}/r/${id}`;
      await sendCallback(callbackUrl, finalSkillResponse({ overall, resultUrl }));
    } catch (e) {
      console.error("카카오 스킬 처리 오류:", e);
      await sendCallback(callbackUrl, {
        version: "2.0",
        template: { outputs: [{ simpleText: { text: "죄송해요, 확인 중 오류가 발생했어요. 잠시 후 다시 시도해주세요." } }] },
      });
    }
  })();
}
