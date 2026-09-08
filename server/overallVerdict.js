// 개별 주장 판정(confirmed/false/uncertain)만으로 "전체적으로는 맞는데 이 부분은
// 틀렸다" 식의 총평을 결정론적으로(별도 AI 호출 없이) 만든다. LLM에게 총평을
// 따로 요청하면 개별 판정과 실제로 어긋나는 문장을 만들어낼 위험이 있어서,
// 이미 확정된 판정 배열에서 직접 집계하는 방식으로 총평과 판정이 항상 일치하게 했다.
// /api/verify(SSE)와 카카오톡 스킬 웹훅이 이 함수를 공유해서 쓴다.
export function buildOverallVerdict(claims) {
  const total = claims.length;
  if (total === 0) {
    return { label: "판단 보류", detail: "검증할 수 있는 사실 주장을 찾지 못했습니다.", tone: "uncertain" };
  }
  const falseClaims = claims.filter((c) => c.verdict === "false");
  const uncertainClaims = claims.filter((c) => c.verdict === "uncertain");
  const confirmedCount = total - falseClaims.length - uncertainClaims.length;

  if (falseClaims.length === 0 && uncertainClaims.length === 0) {
    return { label: "전체 확인됨", detail: `${total}개 주장 모두 사실과 일치합니다.`, tone: "confirmed" };
  }
  if (falseClaims.length === 0) {
    return {
      label: "대체로 정확",
      detail: `${total}개 중 ${confirmedCount}개는 확인됐고, ${uncertainClaims.length}개는 근거가 부족해 판단을 보류했습니다.`,
      tone: "uncertain",
    };
  }
  const wrongList = falseClaims.map((c) => `"${c.text}"`).join(", ");
  const majorityWrong = falseClaims.length >= Math.ceil(total / 2);
  return {
    label: majorityWrong ? "대부분 부정확" : "부분적으로 부정확",
    detail: `${total}개 중 ${falseClaims.length}개가 사실과 다릅니다 — ${wrongList}`,
    tone: "false",
  };
}
