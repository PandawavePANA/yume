// 주장 하나가 사용자에게 나가기 직전에 통과하는 검사대.
//
// 유메가 틀리는 경로는 둘뿐이다. 없는 걸 있다고 하거나, 못 찾은 걸 찾았다고 하거나.
// 앞은 부존재 신뢰도(NEC)가 막는다. 뒤를 막는 게 여기다 — 출처 한 건 없이 "확인됨"으로
// 나가면 그건 검증이 아니라 모델이 그냥 한 말이고, 사용자는 그걸 유메의 판정으로 읽는다.
// 근거를 못 댈 판정은 내리지 않고 '확인되지 않음'으로 내린다. 화면에는 붉게 표시된다.
//
// DB를 물고 오지 않도록 파이프라인에서 떼어 두었다. 이 규율만 따로 테스트할 수 있어야 한다.
const VERDICTS = new Set(["confirmed", "false", "uncertain"]);
// 추출 모델이 가끔 목록에 없는 도메인을 만들어 낸다(예: "환경"). 통계·데이터셋·요금제
// 분기가 전부 이 값을 기준으로 도니, 목록 밖 값은 "일반"으로 모은다.
const DOMAINS = new Set(["법률", "의료", "금융", "역사", "과학", "일반"]);

// 스스로 근거를 갖는 판정 경로.
//   official — 법제처 조문 원문을 직접 대조했다. 조문 자체가 근거다.
//   nec      — 부존재 신뢰도를 정량 산출했다. 점수와 탐색 커버리지가 근거다.
// 그 외(web·research·추출 단계)는 "찾은 출처"가 유일한 근거이므로, 출처가 없으면
// 그 판정은 근거 없는 단정이다.
const SELF_GROUNDED = new Set(["official", "nec"]);

export function sanitizeClaim(c) {
  const { identifier_found: _f, ...claim } = c;
  if (!VERDICTS.has(claim.verdict)) claim.verdict = "uncertain";
  if (!DOMAINS.has(claim.domain)) claim.domain = "일반";
  // 추출 단계에서 바로 판정된 비법률 주장은 경로 표시가 비어 있었다 — 웹검색 결과이므로 명시한다.
  if (!claim.verified_via) claim.verified_via = "web";
  if (claim.domain !== "법률") delete claim.legal_ref;

  const hasEvidence = Array.isArray(claim.sources) && claim.sources.some((s) => s && s.url);
  if (!SELF_GROUNDED.has(claim.verified_via) && claim.verdict !== "uncertain" && !hasEvidence) {
    const asserted = claim.verdict === "confirmed" ? "사실이라고" : "사실과 다르다고";
    claim.unbacked_verdict = claim.verdict;
    claim.verdict = "uncertain";
    claim.explanation =
      `이 주장을 ${asserted} 볼 만한 출처를 유메가 확보하지 못했습니다. ` +
      `근거 없이 판정하지 않기 때문에 '확인되지 않음'으로 표시합니다.` +
      (claim.explanation ? ` (검토 내용: ${claim.explanation})` : "");
  }
  return claim;
}
