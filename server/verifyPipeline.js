import { extractAndVerify, writeSuggestedFixes } from "./claude.js";
import { attachSpans } from "./claimSpan.js";
import { referenceScope } from "./referenceCheck.js";
import { resolveLegalClaims } from "./legalPipeline.js";
import { resolveIdentifierClaims } from "./identifierPipeline.js";
import { resolveUncertainClaims } from "./resolveUncertain.js";
import { reviewAccusations } from "./reviewAccusations.js";
import { applyCache, storeAll } from "./claimCache.js";
import { dropStaleFix, sanitizeClaim } from "./claimGuard.js";
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
// 검증 한 건이 끝나기까지 중앙값 15.6초, 꼬리는 47초다(실측 13건). 그동안 화면에는
// 진행 문구 한 줄뿐이었다 — 무엇을 확인하고 있는지도, 몇 개가 끝났는지도 안 보인다.
//
// 그런데 주장 목록은 **첫 단계가 끝나는 순간** 이미 알고 있고, 비법률 주장은 그때 판정까지
// 나와 있다. 끝까지 쥐고 있다가 한 번에 보여 줄 이유가 없다. 단계가 끝날 때마다 지금까지의
// 주장을 그대로 내보내면, 처음 것은 5~8초에 보이고 나머지가 그 위에서 채워진다.
// 기다리는 시간 자체는 그대로지만 기다리는 경험이 달라진다 — 빈 화면을 보는 것과
// 결과가 하나씩 쌓이는 것을 보는 것은 다른 일이다.
async function processVerification({ id, text, source, onProgress = () => {}, onClaims = () => {}, references = [], organization = "" }) {
  // 기업이 보낸 기준 자료·자사명이 있으면 결과 캐시를 그 조건으로 나눈다(referenceCheck.js).
  const scope = referenceScope(references, organization);
  const startedAt = Date.now();
  try {
    const cached = await findCached(text, scope);
    if (cached) {
      onProgress("전에 확인한 내용이라 저장된 결과를 바로 보여드려요…");
      await completeVerification(id, cached, { fromCache: true, elapsedMs: Date.now() - startedAt });
      return { result: cached, fromCache: true };
    }

    // AI 답변만 받는 게 아니다 — 보도자료·상품 설명·상담 기록, 누가 쓴 글이든 같은 길로 간다.
    onProgress("글에서 사실 주장을 찾는 중…");
    // 이 검증 한 건이 Claude를 몇 번 부르고 검색을 몇 번 돌렸는지 모은다.
    const ledger = newLedger();
    const extracted = await extractAndVerify(text, onProgress, { ledger, references });
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

    // 중간 상태를 내보낸다. 내부 표시(from_claim_cache)는 떼고 보낸다 — 화면이 볼 것이 아니다.
    const show = () => onClaims(claims.map(({ from_claim_cache: _c, ...rest }) => rest));
    show();

    claims = await resolveLegalClaims(claims, { onProgress, ledger });
    show();
    claims = await resolveIdentifierClaims(claims, { onProgress });
    show();
    // 심층 재확인 '전에' 한 번 거른다. 출처 없이 confirmed로 온 주장을 여기서 내려놓아야
    // 아래 재확인 대상에 포함된다 — 거르는 순서가 반대면 근거를 찾아볼 기회 없이 강등만 된다.
    claims = claims.map(sanitizeClaim);
    // 결론이 안 난 주장을 도메인별로 한 번 더 판다. 근거를 찾으면 판정이 살아 돌아온다.
    claims = await resolveUncertainClaims(claims, { onProgress, ledger, organization });
    show();
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

    // 위치와 고친 문장은 판정이 다 끝난 뒤에 붙인다. 판정이 중간에 바뀌면(지목 철회·근거 부족)
    // 고친 문장이 맞는 문장을 고치라고 권하게 된다.
    claims = attachSpans(text, claims);
    if (claims.some((c) => c.verdict === "false")) {
      onProgress("틀린 문장을 어떻게 고치면 되는지 정리하는 중…");
      // 고친 문장은 덤이다. 실패해도 판정은 그대로 나간다.
      claims = await writeSuggestedFixes(claims, { ledger }).catch((e) => {
        logError("verify:fix", e);
        return claims;
      });
    }
    // 내부 표시는 내보내지 않는다(기준 자료로 판정했다는 사실은 verified_via: "reference"가 말한다).
    claims = claims.map(dropStaleFix).map(({ from_reference: _r, ...rest }) => rest);
    const overall = buildOverallVerdict(claims);
    // 기업 API 응답에는 상품 링크를 싣지 않는다(publicVerification이 빼고 보낸다). 쿠팡 조회도 하지 않는다.
    const relatedProducts = source === "api" ? [] : await resolveProductLinks(extracted.related_products);
    // 추출 단계의 한 줄 요약은 공식 대조·부존재 판정 전에 쓰인 것이라, 뒤 단계에서 판정이
    // 바뀌었을 수 있는 경우엔 버리고 결정론적 총평만 보여준다.
    //
    // 경로 표시(verified_via)만 보면 놓치는 것이 있다. 근거 검사대(claimGuard)와 지목
    // 재확인이 판정을 내릴 때는 경로가 "web" 그대로 남는다 — 그때도 요약은 이미 틀린
    // 말이 된다("사실과 다른 내용이 있습니다"라고 써 놓고 화면에는 '확인되지 않음'만 있는 꼴).
    // 그 두 경로는 각각 unbacked_verdict / withdrawn_verdict를 남기므로 그것으로 가린다.
    const verdictsChanged = claims.some(
      (c) => ["official", "nec", "research"].includes(c.verified_via) || c.unbacked_verdict || c.withdrawn_verdict,
    );
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
    // 원가도 돌려준다 — 정확도 측정(tests/accuracy.js)이 사례별 비용을 같이 본다.
    return { result, fromCache: false, cost: cost ? { ...cost, reusedClaims: reusedCount } : null };
  } catch (e) {
    await failVerification(id, e.message).catch(() => {});
    logError(`verify:${source}`, e);
    throw e;
  }
}

function create({ id, text, source, userId = null, apiKeyId = null, clientKey = null, dataConsent = false, references = [], organization = "" }) {
  return createVerification({ id, source, userId, apiKeyId, clientKey, input: text, dataConsent, scope: referenceScope(references, organization) });
}

// 웹(SSE)처럼 결과가 나올 때까지 기다리는 경로. 검증 기록은 항상 DB에 남는다.
export async function runVerification(args) {
  await create(args);
  return processVerification(args);
}

// 여러 건을 한꺼번에 시작하되 동시에 도는 수를 묶는다(긴 문서를 나눈 조각들).
//
// 조각 13개를 한 번에 돌리면 Claude 호출과 검색이 한순간에 몰려 분당 한도에 걸리고,
// 같은 시간에 들어온 다른 사람의 검증까지 느려진다. 행은 전부 먼저 만들어 두고(조회하면
// pending으로 보인다) 일꾼 몇 개가 차례로 처리한다. 돌려주는 건 조각마다의 완료 약속이다.
export async function startVerificationsLimited(list, limit = 3) {
  for (const args of list) await create(args);
  const slots = list.map(() => {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    promise.catch(() => {});
    return { promise, resolve, reject };
  });
  let next = 0;
  const worker = async () => {
    while (next < list.length) {
      const i = next++;
      try {
        slots[i].resolve(await processVerification(list[i]));
      } catch (e) {
        slots[i].reject(e);
      }
    }
  };
  for (let w = 0; w < Math.min(limit, list.length); w++) worker();
  return slots.map((s) => s.promise);
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
