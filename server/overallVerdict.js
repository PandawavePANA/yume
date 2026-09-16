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
      detail: "참·거짓을 가릴 수 있는 사실 주장이 없는 글입니다. 의견·감상·창작이거나 인사말처럼 검증 대상이 아닌 내용일 수 있어요.",
      tone: "uncertain",
    };
  }
  const falseClaims = claims.filter((c) => c.verdict === "false");
  const uncertainClaims = claims.filter((c) => c.verdict === "uncertain");
  const confirmedCount = total - falseClaims.length - uncertainClaims.length;

  if (falseClaims.length === 0 && uncertainClaims.length === 0) {
    return { label: "전체 확인됨", detail: `${total}개 주장 모두 사실과 일치합니다.`, tone: "confirmed" };
  }
  if (falseClaims.length === 0) {
    // '확인되지 않음'은 중립이 아니다. 유메가 근거를 확보하지 못했다는 뜻이고,
    // 사용자 입장에서는 그대로 믿으면 안 되는 부분이다. 총평에서도 그렇게 말한다.
    const allUnverified = confirmedCount === 0;
    const list = uncertainClaims.map((c) => `"${c.text}"`).join(", ");
    return {
      label: allUnverified ? "확인되지 않음" : "일부 확인되지 않음",
      detail: allUnverified
        ? `${total}개 주장 모두 뒷받침할 근거를 찾지 못했습니다. 사실이라고도, 틀렸다고도 볼 수 없으니 그대로 인용하지 마세요 — ${list}`
        : `${total}개 중 ${confirmedCount}개는 확인됐지만, ${uncertainClaims.length}개는 근거를 찾지 못했습니다. 이 부분은 그대로 믿으면 안 됩니다 — ${list}`,
      tone: "unverified",
    };
  }
  const wrongList = falseClaims.map((c) => `"${c.text}"`).join(", ");
  const majorityWrong = falseClaims.length >= Math.ceil(total / 2);
  const unverifiedNote = uncertainClaims.length
    ? ` 그리고 ${uncertainClaims.length}개는 근거를 찾지 못해 확인되지 않았습니다.`
    : "";
  return {
    label: majorityWrong ? "대부분 부정확" : "부분적으로 부정확",
    detail: `${total}개 중 ${falseClaims.length}개가 사실과 다릅니다 — ${wrongList}.${unverifiedNote}`,
    tone: "false",
  };
}
