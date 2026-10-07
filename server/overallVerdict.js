// 개별 주장 판정(confirmed/false/uncertain)만으로 "전체적으로는 맞는데 이 부분은
// 틀렸다" 식의 총평을 결정론적으로(별도 AI 호출 없이) 만든다. LLM에게 총평을
// 따로 요청하면 개별 판정과 실제로 어긋나는 문장을 만들어낼 위험이 있어서,
// 이미 확정된 판정 배열에서 직접 집계하는 방식으로 총평과 판정이 항상 일치하게 했다.
// /api/verify(SSE)와 카카오톡 스킬 웹훅이 이 함수를 공유해서 쓴다.
export function buildOverallVerdict(claims) {
  const total = claims.length;
  if (total === 0) {
    return {
      label: "검증할 내용 없음",
      detail: "참·거짓을 가릴 수 있는 사실 주장이 없습니다. 의견·감상·창작이거나, 주장이 빠진 순수한 질문(\"한국의 수도는 어디야?\")일 수 있어요. '~라고 하던데 사실이야?'처럼 확인하고 싶은 내용을 함께 적어주시면 바로 확인해드립니다.",
      tone: "uncertain",
    };
  }
  const falseClaims = claims.filter((c) => c.verdict === "false");
  const uncertainClaims = claims.filter((c) => c.verdict === "uncertain");
  const confirmedCount = total - falseClaims.length - uncertainClaims.length;

  if (falseClaims.length === 0 && uncertainClaims.length === 0) {
    return { label: "전체 확인됨", detail: `${total}개 주장 모두 사실과 일치합니다.`, tone: "confirmed" };
  }
  // '확인되지 않음'은 중립이 아니다. 그리고 두 가지가 섞여 있다(verifyPipeline withUncertainReason).
  //   근거 없음 — 공개 기록에 있어야 할 내용인데 뒷받침하는 근거가 없다. 말한 쪽이 근거 없이 단정했다.
  //   공개 기록 밖 — 비공개·유료·개인 경험처럼 원래 공개 자료로 확인할 수 없다.
  // 앞의 것은 분명하게 "근거 없음"이라고 말한다. 같은 말로 뭉개면 유메가 못 찾은 것처럼 들린다.
  const noEvidence = uncertainClaims.filter((c) => (c.uncertain_reason || "no_evidence") === "no_evidence");
  const notPublic = uncertainClaims.length - noEvidence.length;
  if (falseClaims.length === 0) {
    const allUnverified = confirmedCount === 0;
    const list = uncertainClaims.map((c) => `"${c.text}"`).join(", ");
    const why = noEvidence.length
      ? `${noEvidence.length}개는 공개된 자료 어디에서도 근거를 찾을 수 없습니다(근거 없음)${notPublic ? `, ${notPublic}개는 공개 기록으로 확인할 수 없는 종류입니다` : ""}`
      : `${notPublic}개는 공개 기록으로 확인할 수 없는 종류입니다`;
    return {
      label: noEvidence.length ? (allUnverified ? "근거 없음" : "근거 없는 주장 있음") : (allUnverified ? "확인되지 않음" : "일부 확인되지 않음"),
      detail: allUnverified
        ? `${total}개 주장 중 ${why}. 사실로 쓰지 마세요 — ${list}`
        : `${total}개 중 ${confirmedCount}개는 확인됐지만, ${why}. 이 부분은 그대로 믿으면 안 됩니다 — ${list}`,
      tone: "unverified",
    };
  }
  const wrongList = falseClaims.map((c) => `"${c.text}"`).join(", ");
  const majorityWrong = falseClaims.length >= Math.ceil(total / 2);
  const unverifiedNote = noEvidence.length
    ? ` 그리고 ${noEvidence.length}개는 공개된 자료 어디에서도 근거를 찾을 수 없습니다(근거 없음).${notPublic ? ` ${notPublic}개는 공개 기록으로 확인할 수 없는 종류입니다.` : ""}`
    : notPublic
      ? ` 그리고 ${notPublic}개는 공개 기록으로 확인할 수 없는 종류입니다.`
      : "";
  return {
    label: majorityWrong ? "대부분 부정확" : "부분적으로 부정확",
    detail: `${total}개 중 ${falseClaims.length}개가 사실과 다릅니다 — ${wrongList}.${unverifiedNote}`,
    tone: "false",
  };
}
