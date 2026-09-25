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
//
// 그래서 검토자에게 두 가지를 더 요구한다.
//
//  1) 직접 검색하게 한다. 원래는 "주어진 근거만 보라"고 했는데, 그러면 첫 판정이 못 찾은
//     것을 검토자도 못 찾은 상태로 판단한다. 실제로 그렇게 새어 나갔다 — 와인 평점
//     88점을 "사실과 다름"으로 지목한 건은 사용자가 대충 검색해도 보이는 사실이었다.
//
//  2) 유지하려면 "그럼 실제로는 무엇인가"를 대게 한다(counterFact). 반박은 언제나 다른
//     값을 가지고 있다. 그걸 못 대면 반박이 아니라 미확인이므로, 말이 아무리 단정적이어도
//     지목을 거둔다. 이 판단은 모델에게 맡기지 않고 여기서 기계적으로 확인한다.
import { reviewAccusation as defaultReview } from "./claude.js";
import { restsOnAbsence } from "./counterEvidence.js";

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
        // 유지하겠다는 답은 실제 값을 함께 가져와야 받는다. 검토자가 "맞다, 틀린 게 맞다"고만
        // 하고 무엇이 실제 값인지 못 대면 그건 반박이 아니다.
        if (r.upheld && groundsAccusation(r.counterFact)) {
          // 유지된 지목에는 검토자가 찾아낸 실제 값을 붙여 둔다. "틀렸다"만으로는 사용자가
          // 아무것도 할 수 없다 — 그럼 뭐가 맞는지가 같은 자리에 있어야 쓸 수 있는 판정이다.
          // 설명문에도 넣는다. 주장 캐시는 설명문만 보관하므로, 필드에만 두면 같은 주장이
          // 다음에 재사용될 때 실제 값이 사라진다.
          const counterFact = r.counterFact.trim();
          out[i] = {
            ...c,
            counter_fact: counterFact,
            explanation: mentions(c.explanation, counterFact) ? c.explanation : `${c.explanation ? `${c.explanation} ` : ""}확인된 실제 값: ${counterFact}.`,
          };
          return;
        }
        const noCounter = r.upheld;
        // 지목을 거둔다. 근거가 반박이 아니라 "뒷받침 못함"이었다는 뜻이므로,
        // 확인되지 않음이 정확한 자리다 — 사용자에게도 그렇게 말한다.
        out[i] = {
          ...c,
          verdict: "uncertain",
          withdrawn_verdict: "false",
          explanation:
            `사실과 다르다고 볼 만한 근거가 아니어서 지목을 거뒀습니다. ` +
            (noCounter
              ? `다시 확인해도 "그럼 실제로는 무엇인가"를 댈 수 없었습니다 — 반박이 아니라 미확인입니다`
              : `찾은 자료가 이 주장을 반박하는 것이 아니라 뒷받침하지 못하는 데 그칩니다`) +
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

// 검토자가 내놓은 '실제 값'이 지목을 떠받칠 수 있는 것인지 본다.
// 너무 짧으면 값이 아니고("다름", "-"), 못 찾았다는 말이면 반박이 아니다.
function groundsAccusation(counterFact) {
  const t = String(counterFact || "").trim();
  if (t.length < 4) return false;
  return !restsOnAbsence(t);
}

// 실제 값이 이미 설명문에 들어 있으면 두 번 쓰지 않는다.
function mentions(explanation, counterFact) {
  const e = String(explanation || "").replace(/\s+/g, "");
  const c = counterFact.replace(/\s+/g, "");
  return c.length > 0 && e.includes(c);
}
