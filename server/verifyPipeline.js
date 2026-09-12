import { extractAndVerify } from "./claude.js";
import { resolveLegalClaims } from "./legalPipeline.js";
import { resolveIdentifierClaims } from "./identifierPipeline.js";
import { buildOverallVerdict } from "./overallVerdict.js";
import { resolveProductLinks } from "./coupang.js";
import { logError } from "./errorLog.js";
import {
  ENGINE_VERSION,
  completeVerification,
  createVerification,
  failVerification,
  findCached,
} from "./verificationStore.js";

export const MAX_INPUT_CHARS = 10_000;
const VERDICTS = new Set(["confirmed", "false", "uncertain"]);

function sanitizeClaim(c) {
  const { identifier_found: _f, ...claim } = c;
  if (!VERDICTS.has(claim.verdict)) claim.verdict = "uncertain";
  if (claim.domain !== "법률") delete claim.legal_ref;
  return claim;
}

// 이미 만들어진 검증 행을 끝까지 처리한다.
//   추출·웹검증(Claude) → 법률 주장 공식 대조 + 부존재 신뢰도(NEC) → 학술 식별자 실재 확인
//   → 결정론적 총평 → 관련 상품 링크
async function processVerification({ id, text, source, onProgress = () => {} }) {
  const startedAt = Date.now();
  try {
    const cached = await findCached(text);
    if (cached) {
      onProgress("이전에 검증한 것과 똑같은 내용이라 저장된 결과를 바로 보여드려요…");
      await completeVerification(id, cached, { fromCache: true, elapsedMs: Date.now() - startedAt });
      return { result: cached, fromCache: true };
    }

    onProgress("AI 답변에서 사실 주장을 추출하는 중…");
    const extracted = await extractAndVerify(text, onProgress);
    const legalCount = extracted.claims.filter((c) => c.domain === "법률").length;
    onProgress(
      legalCount > 0
        ? `${extracted.claims.length}개 주장을 찾았습니다. 법률 주장 ${legalCount}개는 공식 데이터와 대조합니다…`
        : `${extracted.claims.length}개 주장을 찾았습니다. 결과를 정리하는 중…`,
    );

    let claims = await resolveLegalClaims(extracted.claims, { onProgress });
    claims = await resolveIdentifierClaims(claims, { onProgress });
    claims = claims.map(sanitizeClaim);

    const overall = buildOverallVerdict(claims);
    const relatedProducts = await resolveProductLinks(extracted.related_products);
    // 추출 단계의 한 줄 요약은 공식 대조·부존재 판정 전에 쓰인 것이라, 뒤 단계에서 판정이
    // 바뀌었을 수 있는 경우엔 버리고 결정론적 총평만 보여준다.
    const verdictsChanged = claims.some((c) => c.verified_via === "official" || c.verified_via === "nec");
    const result = {
      overall_domain: extracted.overall_domain || claims[0]?.domain || "일반",
      summary: verdictsChanged ? null : extracted.summary || null,
      claims,
      overall,
      related_products: relatedProducts,
      engine: ENGINE_VERSION,
    };
    await completeVerification(id, result, { elapsedMs: Date.now() - startedAt });
    return { result, fromCache: false };
  } catch (e) {
    await failVerification(id, e.message).catch(() => {});
    logError(`verify:${source}`, e);
    throw e;
  }
}

function create({ id, text, source, userId = null, apiKeyId = null, clientKey = null, dataConsent = false }) {
  return createVerification({ id, source, userId, apiKeyId, clientKey, input: text, dataConsent });
}

// 웹(SSE)처럼 결과가 나올 때까지 기다리는 경로. 검증 기록은 항상 DB에 남는다.
export async function runVerification(args) {
  await create(args);
  return processVerification(args);
}

// 카카오·외부 API처럼 id부터 먼저 돌려주고 결과는 나중에 조회하게 하는 경로.
// DB에 행이 만들어진 뒤에 돌아오므로, 호출한 쪽은 곧바로 그 id로 조회할 수 있다.
// done이 실패하면 실패 자체는 DB·오류 로그에 기록되어 있다.
export async function startVerification(args) {
  await create(args);
  const done = processVerification(args);
  done.catch(() => {});
  return { done };
}
