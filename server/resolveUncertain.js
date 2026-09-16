// 마지막 관문 — 결론이 안 난 주장을 한 번 더 파고, 그래도 없으면 '없다'를 결론으로 낸다.
//
// 유메의 출발점은 이것이다. 공식 기록과 웹을 통틀어 뒤졌는데도 없는데 AI가 그걸 확언했다면,
// 틀린 쪽은 AI다. "못 찾았다"는 유메의 실패가 아니라 유메가 내놓는 답이다.
//
// 지금까지 이 판단은 식별자(법령·판례·DOI)에만 적용됐다. 레지스트리가 있으니 "거기 없다"를
// 말할 수 있었기 때문이다. 일반 사실 주장에는 레지스트리가 없지만 기준은 같다 —
// 이 주장이 사실이라면 어딘가에 기록되어 있어야 한다. 그 '어딘가'(searchSpace.js의
// 기록 가능성별 검색공간)를 다 뒤져도 없으면 부존재 신뢰도가 올라가고, 임계값을 넘으면
// '사실과 다름'으로 판정한다. 지어낸 통계를 잡아내는 경로다.
//
// 반대로 비공개 정보나 개인 경험처럼 애초에 기록이 남지 않는 주장은 아무리 뒤져도
// 커버리지가 낮아 부존재로 단정되지 않는다. 그건 정직하게 '확인되지 않음'으로 남는다.
import { researchClaim as defaultResearch } from "./claude.js";
import { coverageFor } from "./nec/searchSpace.js";
import { buildNecReport, NEC_WEIGHTS } from "./nec/nec.js";

const W = NEC_WEIGHTS.assertion;

const MAX_CONCURRENT = 3;

// 설명이 없거나 사실상 내용이 없는 보류는 사용자에게 아무것도 주지 못한다.
const EMPTY_EXPLANATION = /^(확인\s*(불가|할\s*수\s*없|되지\s*않)|판단\s*(보류|불가)|알\s*수\s*없|모름|근거\s*없)/;

function needsResearch(claim) {
  if (claim.verdict !== "uncertain") return false;
  // 부존재 신뢰도로 "확인 불가" 등급이 난 식별자는 이미 웹까지 넓혀 본 상태지만,
  // 그 판정은 '식별자가 실재하는가'에 대한 것이라 주장 내용 자체는 아직 미검증이다.
  return true;
}

function isUseless(text) {
  const t = String(text || "").trim();
  return t.length < 15 || EMPTY_EXPLANATION.test(t);
}

async function inBatches(items, size, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  }
  return out;
}

export async function resolveUncertainClaims(claims, { research = defaultResearch, onProgress = () => {} } = {}) {
  const targets = claims.map((c, i) => ({ c, i })).filter(({ c }) => needsResearch(c));
  if (targets.length === 0) return claims;

  onProgress(
    targets.length === claims.length
      ? `아직 결론이 안 난 주장 ${targets.length}개를 더 깊이 확인하는 중…`
      : `${targets.length}개 주장은 결론이 안 나서 한 번 더 확인하는 중…`,
  );

  const resolved = await inBatches(targets, MAX_CONCURRENT, async ({ c, i }) => {
    try {
      const r = await research(c.text, {
        domain: c.domain || "일반",
        priorExplanation: c.explanation || "",
        priorSources: c.sources || [],
        onProgress,
      });
      const sources = [...(r.sources || []), ...(c.sources || [])];
      const hasEvidence = sources.some((x) => x && x.url);

      // 출처를 근거로 댈 수 있는 판정은 그대로 받는다.
      //   confirmed — 뒷받침하는 자료를 찾았다
      //   false     — 반박하는 자료를 찾았다(다른 수치, 실제 수상작 등)
      if (r.verdict === "confirmed" || (r.verdict === "false" && hasEvidence)) {
        return { i, claim: { ...c, verdict: r.verdict, verified_via: "research", explanation: r.explanation, sources } };
      }

      // 여기부터는 인용할 출처가 없는 경우다. 두 가지가 섞여 있다.
      //   ① 없어서 못 댄다 — 부존재. 이게 유메가 잡아내야 할 것이다.
      //   ② 안 찾아봐서 못 댄다 — 확인되지 않음.
      // 모델이 "false"라고 말했다는 사실만으로 ①이라고 믿지 않는다. 검색공간을 얼마나
      // 덮었는지로 따져서, 부존재 신뢰도가 임계값을 넘을 때만 판정으로 인정한다.
      const nec = assertionNec(c, r);
      if (nec && nec.grade === "nonexistent") {
        return {
          i,
          claim: {
            ...c,
            verdict: "false",
            verified_via: "nec",
            explanation:
              `${nec.identifier.searchSpace}를 통틀어 이 주장을 뒷받침하는 기록을 찾지 못했습니다(부존재 신뢰도 ${nec.score}). ` +
              `사실이라면 남아 있어야 할 기록이 어디에도 없어, 지어낸 정보로 봅니다.` +
              (r.explanation ? ` (확인 경과: ${r.explanation})` : ""),
            sources,
            nec,
          },
        };
      }

      // 부존재로 단정할 만큼 넓게 뒤지지 못했다 — 정직하게 확인되지 않음으로 남긴다.
      return {
        i,
        claim: {
          ...c,
          verdict: "uncertain",
          verified_via: "research",
          explanation: isUseless(r.explanation) ? fallbackNote(c) : r.explanation,
          sources,
          ...(nec ? { nec } : {}),
        },
      };
    } catch {
      // 리서치 호출 자체가 실패해도 앞 단계 결과는 지키고, 설명만 비어 있지 않게 채운다.
      return { i, claim: isUseless(c.explanation) ? { ...c, explanation: fallbackNote(c) } : c };
    }
  });

  const out = [...claims];
  for (const { i, claim } of resolved) out[i] = claim;
  return out;
}

function fallbackNote(claim) {
  const where =
    claim.domain === "법률"
      ? "법제처 국가법령정보와 웹 자료"
      : claim.domain === "의료"
        ? "공공 보건기관 자료와 웹 자료"
        : claim.domain === "금융"
          ? "금융당국 발표와 웹 자료"
          : "웹 자료";
  return `${where}를 찾아봤지만 이 주장을 뒷받침하거나 반박할 근거를 확보하지 못했습니다. 사실이라고도, 틀렸다고도 볼 수 없으니 그대로 인용하지 마세요. 주장에 나온 수치·연도·주체 중 하나라도 원문 출처가 확인되면 판정할 수 있습니다.`;
}

// 일반 사실 주장의 부존재 신뢰도.
//   C — 이 주장이 기록될 만한 공간을 얼마나 뒤졌나(기록 가능성 × 실제 탐색 충실도)
//   F — 주장 자체가 성립 불가능한가. 식별자와 달리 일반 주장에는 형식이랄 게 없어 0으로 둔다.
//   P — 비슷한 실재 사실이 있나. 있으면 지어낸 게 아니라 잘못 기억한 것일 수 있어 단정을 미룬다.
function assertionNec(claim, report) {
  const spaceKey = report.recordedness;
  if (!spaceKey) return null;
  // 대충 찾고 만 경우에는 커버리지를 인정하지 않는다 — 부존재는 '다 뒤졌다'가 전제다.
  const coverage = coverageFor(spaceKey, [{ id: "web", ok: report.searchedThoroughly === true }]);
  const similar = report.nearMiss ? [{ value: report.nearMiss.value, similarity: report.nearMiss.similarity }] : [];
  return buildNecReport({
    identifier: { type: "assertion", raw: claim.text, canonical: claim.text, F: 0, checks: [] },
    spaceKey,
    coverage,
    similar,
    weights: W,
  });
}
