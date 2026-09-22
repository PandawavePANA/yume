import { extractAndVerify } from "./claude.js";
import { resolveLegalClaims } from "./legalPipeline.js";
import { resolveIdentifierClaims } from "./identifierPipeline.js";
import { resolveUncertainClaims } from "./resolveUncertain.js";
import { reviewAccusations } from "./reviewAccusations.js";
import { applyCache, storeAll } from "./claimCache.js";
import { sanitizeClaim } from "./claimGuard.js";
import { buildOverallVerdict } from "./overallVerdict.js";
import { resolveProductLinks } from "./coupang.js";
import { logError } from "./errorLog.js";
import { logApiCost, newLedger, summarize } from "./apiCost.js";
import {
  ENGINE_VERSION,
  completeVerification,
  createVerification,
  failVerification,
  findCached,
  recordApiCost,
} from "./verificationStore.js";

export const MAX_INPUT_CHARS = 10_000;

// 이미 만들어진 검증 행을 끝까지 처리한다.
//   추출·웹검증(Claude) → 법률 주장 공식 대조 + 부존재 신뢰도(NEC) → 학술 식별자 실재 확인
//   → 결정론적 총평 → 관련 상품 링크
async function processVerification({ id, text, source, onProgress = () => {} }) {
  const startedAt = Date.now();
  try {
    const cached = await findCached(text);
    if (cached) {
      onProgress("전에 확인한 내용이라 저장된 결과를 바로 보여드려요…");
      await completeVerification(id, cached, { fromCache: true, elapsedMs: Date.now() - startedAt });
      return { result: cached, fromCache: true };
    }

    onProgress("AI 답변에서 사실 주장을 추출하는 중…");
    // 이 검증 한 건이 Claude를 몇 번 부르고 검색을 몇 번 돌렸는지 모은다.
    const ledger = newLedger();
    const extracted = await extractAndVerify(text, onProgress, { ledger });
    const legalCount = extracted.claims.filter((c) => c.domain === "법률").length;
    onProgress(
      legalCount > 0
        ? `${extracted.claims.length}개 주장을 찾았습니다. 법률 주장 ${legalCount}개는 공식 데이터와 대조합니다…`
        : `${extracted.claims.length}개 주장을 찾았습니다. 결과를 정리하는 중…`,
    );

    // 전에 판단한 적 있는 주장은 그 판정을 그대로 쓴다. 답변은 달라도 주장은 겹친다.
    let claims = await applyCache(extracted.claims);
    const reused = claims.filter((c) => c.from_claim_cache).length;
    if (reused > 0) onProgress(`전에 확인한 주장 ${reused}개는 그 결과를 그대로 씁니다…`);

    claims = await resolveLegalClaims(claims, { onProgress, ledger });
    claims = await resolveIdentifierClaims(claims, { onProgress });
    // 심층 재확인 '전에' 한 번 거른다. 출처 없이 confirmed로 온 주장을 여기서 내려놓아야
    // 아래 재확인 대상에 포함된다 — 거르는 순서가 반대면 근거를 찾아볼 기회 없이 강등만 된다.
    claims = claims.map(sanitizeClaim);
    // 결론이 안 난 주장을 도메인별로 한 번 더 판다. 근거를 찾으면 판정이 살아 돌아온다.
    claims = await resolveUncertainClaims(claims, { onProgress, ledger });
    // 재확인이 만들어낸 판정도 같은 잣대로 다시 거른다(이미 강등된 건 건드리지 않는다).
    claims = claims.map(sanitizeClaim);
    // 마지막으로 "사실과 다름" 지목만 다시 본다. 맞는 정보를 거짓이라 부르는 게
    // 유메가 낼 수 있는 가장 해로운 오류라, 여기에만 따로 비용을 쓴다.
    claims = await reviewAccusations(claims, { onProgress, ledger });
    // 이번에 새로 판단한 것만 캐시에 넣는다(확인되지 않음은 저장하지 않는다).
    await storeAll(claims);
    // 내부 표시는 여기서 뗀다. 중간에 떼면 지목 재확인과 저장이 캐시된 주장을 구분하지
    // 못해 이미 끝난 일을 다시 한다.
    const reusedCount = claims.filter((c) => c.from_claim_cache).length;
    claims = claims.map(({ from_claim_cache: _c, ...rest }) => rest);

    const overall = buildOverallVerdict(claims);
    const relatedProducts = await resolveProductLinks(extracted.related_products);
    // 추출 단계의 한 줄 요약은 공식 대조·부존재 판정 전에 쓰인 것이라, 뒤 단계에서 판정이
    // 바뀌었을 수 있는 경우엔 버리고 결정론적 총평만 보여준다.
    const verdictsChanged = claims.some((c) => ["official", "nec", "research"].includes(c.verified_via));
    const result = {
      overall_domain: extracted.overall_domain || claims[0]?.domain || "일반",
      summary: verdictsChanged ? null : extracted.summary || null,
      claims,
      overall,
      related_products: relatedProducts,
      engine: ENGINE_VERSION,
    };
    await completeVerification(id, result, { elapsedMs: Date.now() - startedAt });
    // 원가는 사용자에게 내보내지 않는다 — 운영 지표라 로그로만 남긴다.
    const cost = summarize(ledger);
    if (cost) {
      const full = { ...cost, reusedClaims: reusedCount };
      logApiCost(id, source, full);
      // 질의할 수 있는 자리에도 남긴다. 로그는 지워지고, 원가는 나중에 세어야 한다.
      recordApiCost(id, full);
    }
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
