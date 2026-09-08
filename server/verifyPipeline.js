import { extractAndVerify } from "./claude.js";
import { resolveLegalClaims } from "./legalPipeline.js";
import { buildOverallVerdict } from "./overallVerdict.js";
import { resolveProductLinks } from "./coupang.js";
import { saveResult } from "./resultsStore.js";
import { getCached, setCached } from "./verifyCache.js";
import { logError } from "./errorLog.js";

// 카카오 채널(kakaoWebhook.js)과 유메 검증 API(apiV1.js)가 공통으로 쓰는 백그라운드
// 검증 파이프라인. 두 곳 다 "5초/즉시 안에 id부터 응답하고, 실제 검증은 이 함수가
// 비동기로 끝낸 뒤 resultsStore에 채워 넣으면 폴링/새로고침으로 확인하는" 구조라
// 로직을 하나로 합쳤다.
export async function runVerificationJob(id, text, source = "unknown") {
  try {
    const cached = getCached(text);
    if (cached) {
      saveResult(id, { input: text, status: "done", result: cached, source });
      return;
    }
    const extracted = await extractAndVerify(text);
    const claims = await resolveLegalClaims(extracted.claims);
    const overall = buildOverallVerdict(claims);
    const relatedProducts = await resolveProductLinks(extracted.related_products);
    const result = { ...extracted, claims, overall, related_products: relatedProducts };
    saveResult(id, { input: text, status: "done", result, source });
    setCached(text, result);
  } catch (e) {
    console.error("검증 파이프라인 오류:", e);
    logError("verifyPipeline", e);
    saveResult(id, { input: text, status: "error", source });
  }
}
