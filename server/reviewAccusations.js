// 지목 재확인 — "사실과 다름"으로 찍힌 주장만 한 번 더 본다.
//
// 유메가 낼 수 있는 오류는 두 종류인데 값이 다르다. 못 찾은 걸 못 찾았다고 하는 건
// 정직한 결과지만, 맞는 정보를 거짓이라고 지목하면 사용자는 멀쩡한 사실을 버린다.
// 그리고 그 오류는 사용자가 알아차리기도 어렵다 — 유메가 근거까지 달아서 틀렸다고
// 하니까. 그래서 지목에만 따로 비용을 쓴다.
//
// 대상은 웹·리서치로 나온 지목뿐이다. 법제처 조문 대조(official)와 부존재 신뢰도(nec)는
// 근거가 형식적으로 확정돼 있어 다시 볼 것이 없고, 다시 보면 오히려 확정된 판정을
// 모델의 인상으로 흔드는 꼴이 된다.
//
// 가장 자주 잡히는 실수는 "뒷받침하지 못함"과 "반박함"을 섞는 것이다. 근거가 주장을
// 지지하지 않는다는 건 틀렸다는 뜻이 아니라 확인되지 않았다는 뜻인데, 검색 결과를 읽다
// 보면 이 둘이 쉽게 뭉개진다.
import { reviewAccusation as defaultReview } from "./claude.js";

const REVIEWABLE_VIA = new Set(["web", "research"]);
const MAX_REVIEWS = 3; // 한 검증에서 지목이 쏟아져도 비용이 선형으로 늘지 않게 상한을 둔다

export async function reviewAccusations(claims, { review = defaultReview, onProgress = () => {}, ledger = null } = {}) {
  const targets = claims
    .map((c, i) => ({ c, i }))
    // 캐시에서 온 지목은 처음 판정될 때 이미 이 검토를 거쳤다. 두 번 볼 필요가 없다.
    .filter(({ c }) => c.verdict === "false" && REVIEWABLE_VIA.has(c.verified_via) && !c.from_claim_cache)
    .slice(0, MAX_REVIEWS);
  if (targets.length === 0) return claims;

  onProgress(`사실과 다름으로 본 주장 ${targets.length}개를 다시 확인하는 중…`);

  const out = [...claims];
  await Promise.all(
    targets.map(async ({ c, i }) => {
      try {
        const r = await review({ claimText: c.text, explanation: c.explanation || "", sources: c.sources || [], ledger });
        if (r.upheld) return;
        // 지목을 거둔다. 근거가 반박이 아니라 "뒷받침 못함"이었다는 뜻이므로,
        // 확인되지 않음이 정확한 자리다 — 사용자에게도 그렇게 말한다.
        out[i] = {
          ...c,
          verdict: "uncertain",
          withdrawn_verdict: "false",
          explanation:
            `사실과 다르다고 볼 만한 근거가 아니어서 지목을 거뒀습니다. ` +
            `찾은 자료가 이 주장을 반박하는 것이 아니라 뒷받침하지 못하는 데 그칩니다` +
            (r.reason ? ` — ${r.reason}` : "") +
            (c.explanation ? ` (처음 판단: ${c.explanation})` : ""),
        };
      } catch {
        // 재확인에 실패하면 원래 판정을 그대로 둔다. 확인하지 못했다고 해서
        // 이미 근거를 갖춘 지목을 거둘 이유는 없다.
      }
    }),
  );
  return out;
}
