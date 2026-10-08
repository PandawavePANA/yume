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
import { searchesLeft } from "./apiCost.js";
import { coverageFor } from "./nec/searchSpace.js";
import { buildNecReport, NEC_WEIGHTS } from "./nec/nec.js";
import { mentionsOrganization } from "./referenceCheck.js";
import { isDenial } from "./claimStance.js";

const W = NEC_WEIGHTS.assertion;
// 공개 기록으로 확인할 수 없는 종류(searchSpace.js의 기록 가능성).
const NOT_PUBLIC = new Set(["private", "unrecordable", "niche"]);

const MAX_CONCURRENT = 3;

// 설명이 없거나 사실상 내용이 없는 보류는 사용자에게 아무것도 주지 못한다.
const EMPTY_EXPLANATION = /^(확인\s*(불가|할\s*수\s*없|되지\s*않)|판단\s*(보류|불가)|알\s*수\s*없|모름|근거\s*없)/;

function needsResearch(claim) {
  if (claim.verdict !== "uncertain") return false;
  // 부존재 신뢰도로 "확인 불가" 등급이 난 식별자는 이미 웹까지 넓혀 본 상태지만,
  // 그 판정은 '식별자가 실재하는가'에 대한 것이라 주장 내용 자체는 아직 미검증이다.
  return true;
}

// 여러 주체를 묶은 집계·통계 주장. 누군가 집계해 공표했어야 성립하므로 '주체를 못 찾았다'가 변명이 되지 않는다.
const AGGREGATE = /(평균|집계|통계|비율|점유율|순위|합계|중앙값|조사\s*결과|설문|업계|업종별|지역별|전국\s*\S*\s*(수|규모))/;
export function isAggregate(text) {
  return AGGREGATE.test(String(text || ""));
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

export async function resolveUncertainClaims(claims, { research = defaultResearch, onProgress = () => {}, ledger = null, organization = "" } = {}) {
  const targets = claims.map((c, i) => ({ c, i })).filter(({ c }) => needsResearch(c));
  if (targets.length === 0) return claims;

  // 검색을 못 쓰는 상태면 부르지 않는다.
  //
  // 이 단계는 결론이 안 난 주장 **마다** 돌기 때문에, 검증 한 건이 쓰는 검색이 여기서
  // 가장 많이 늘어난다. 검증 한 건의 검색 총량(apiCost.js의 SEARCH_BUDGET)을 다 쓰고
  // 나면 검색 없이 부르게 되는데, 그건 배경지식으로 추측하라는 뜻이라 리서치가 아니다.
  // 돈만 쓰고 근거는 못 대니 부르지 않고 '확인되지 않음'으로 남긴다 — 정직한 결과다.
  if (searchesLeft(ledger) <= 0) return claims;

  onProgress(`결론이 안 난 주장 ${targets.length}개를 더 확인하는 중…`);

  const resolved = await inBatches(targets, MAX_CONCURRENT, async ({ c, i }) => {
    try {
      const r = await research(c.text, {
        domain: c.domain || "일반",
        priorExplanation: c.explanation || "",
        priorSources: c.sources || [],
        onProgress,
        ledger,
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
      // 부존재로 단정하면 안 되는 두 경우. 기록이 없다는 것이 '지어냈다'의 근거가 되려면,
      // 그 기록이 있어야 할 곳을 뒤졌다는 전제가 서야 한다.
      //   · 주체 자체를 찾지 못했다 — 주체가 검색에 안 잡히면 그 활동 기록이 없는 것도 당연하다.
      //   · 요청한 기업 자신에 관한 주장이다 — 자기 회사 이야기는 공개 웹에 거의 없다.
      //     "리머는 2026년 9월 유메를 출시했습니다"가 실제로 '지어낸 정보'로 판정됐다.
      //   단, 집계·통계 주장에는 '주체'가 없다. "대구 중구 안경 공방 평균 객단가"를 두고 모델이
      //   subject_found:false를 내서 지어낸 통계가 빠져나간 적이 있어, 프롬프트에만 맡기지 않는다.
      const ownClaim = mentionsOrganization(c.text, organization);
      const subjectMissing = r.subjectFound === false && !isAggregate(c.text);
      if (nec && nec.grade === "nonexistent" && (ownClaim || subjectMissing)) {
        return {
          i,
          claim: {
            ...c,
            verdict: "uncertain",
            verified_via: "research",
            explanation:
              (ownClaim
                ? `'${organization}'에 관한 내용은 공개 자료에 남지 않는 경우가 많아, 기록을 못 찾았다고 '사실과 다름'으로 단정하지 않습니다. 기준 자료로 보내 주시면 그 자료와 대조합니다.`
                : `이 주장의 주체를 공개 자료에서 찾지 못했습니다. 주체가 검색에 잡히지 않으면 그 활동 기록이 없는 것도 당연해서, '없다'로 단정하지 않고 확인되지 않음으로 둡니다.`) +
              (r.explanation ? ` (확인 경과: ${r.explanation})` : ""),
            sources,
            uncertain_reason: "not_public",
          },
        };
      }
      // "그런 통계는 발표된 적 없다"처럼 없다고 말한 주장이면, 기록이 어디에도 없다는 확인은
      // 주장이 맞다는 뜻이다(claimStance.js). 같은 계산을 거꾸로 읽으면 맞는 정정을 거짓이라 부른다.
      if (nec && nec.grade === "nonexistent" && isDenial(c)) {
        return {
          i,
          claim: {
            ...c,
            verdict: "confirmed",
            verified_via: "nec",
            stance: "denies",
            explanation:
              `${nec.identifier.searchSpace}를 통틀어 이 대상의 기록을 찾지 못했습니다(부존재 신뢰도 ${nec.score}). ` +
              `사실이라면 남아 있어야 할 기록이 없으므로 "없다"는 이 주장은 맞습니다.` +
              (r.explanation ? ` (확인 경과: ${r.explanation})` : ""),
            sources,
            nec,
          },
        };
      }
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

      // 부존재로 단정할 만큼은 아니다. 다만 "왜 단정하지 않는가"는 둘로 갈린다 — 이 둘을 같은
      // '확인되지 않음'으로 보여 주면, 사용자는 유메가 못 찾은 것인지 원래 확인할 수 없는 것인지 모른다.
      //   no_evidence — 공개 기록에 있어야 할 종류인데 뒷받침하는 근거가 없다. 말한 쪽(대개 AI)이
      //                 근거 없이 단정한 것이다. 화면에는 "근거 없음"으로, 쓰지 말라고 분명히 말한다.
      //   not_public  — 비공개·유료·개인 경험처럼 공개 기록으로 확인할 수 없는 종류다. 없다는 게
      //                 아무것도 말해 주지 않는다(와인 평점 88점이 실제로 그랬다).
      return {
        i,
        claim: {
          ...c,
          verdict: "uncertain",
          verified_via: "research",
          explanation: isUseless(r.explanation) ? fallbackNote(c) : r.explanation,
          sources,
          uncertain_reason: NOT_PUBLIC.has(r.recordedness) ? "not_public" : "no_evidence",
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
