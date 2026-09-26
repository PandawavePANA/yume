// 화면에 나가는 한 줄 요약이 판정과 어긋나지 않는지.
//
// 요약은 추출 단계에서 쓰인다 — 공식 대조도, 부존재 판정도, 근거 검사대도 지나기 전이다.
// 그래서 뒤 단계가 판정을 바꾸면 요약은 그대로 틀린 말이 된다. "사실과 다른 내용이
// 있습니다"라고 적혀 있는데 화면 아래에는 '확인되지 않음'만 있는 꼴이다.
//
// 총평(overall)은 확정된 판정 배열에서 결정론적으로 만들므로 늘 맞다. 어긋날 수 있는 건
// 이 요약 하나뿐이라, 바뀌었을 가능성이 있으면 버린다.
import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeClaim } from "../claimGuard.js";
import { reviewAccusations } from "../reviewAccusations.js";

// verifyPipeline이 쓰는 것과 같은 판단. 파이프라인은 DB를 물고 오므로 규칙만 떼어 본다.
const summaryWentStale = (claims) =>
  claims.some((c) => ["official", "nec", "research"].includes(c.verified_via) || c.unbacked_verdict || c.withdrawn_verdict);

test("근거 검사대가 판정을 내리면 요약을 버린다", () => {
  // 경로 표시는 "web" 그대로 남는다. 그것만 보면 못 잡는 자리다.
  const c = sanitizeClaim({
    text: "어떤 와인이 88점을 받았다",
    domain: "일반",
    verdict: "false",
    verified_via: "web",
    explanation: "해당 리뷰를 확인할 수 없습니다.",
    sources: [{ title: "a", url: "https://a" }],
  });
  assert.equal(c.verified_via, "web", "경로는 안 바뀐다");
  assert.equal(summaryWentStale([c]), true);
});

test("출처 없는 판정을 내려도 요약을 버린다", () => {
  const c = sanitizeClaim({ text: "x", domain: "일반", verdict: "confirmed", verified_via: "web", explanation: "그럴듯함", sources: [] });
  assert.equal(summaryWentStale([c]), true);
});

test("지목을 거두면 요약을 버린다", async () => {
  const [c] = await reviewAccusations(
    [{ text: "x", verdict: "false", verified_via: "web", explanation: "검색 결과와 다름", sources: [{ title: "a", url: "https://a" }] }],
    { review: async () => ({ upheld: false, reason: "반박이 아님" }) },
  );
  assert.equal(c.verified_via, "web");
  assert.equal(summaryWentStale([c]), true);
});

test("아무것도 안 바뀌었으면 요약을 그대로 쓴다", () => {
  const c = sanitizeClaim({
    text: "x", domain: "일반", verdict: "confirmed", verified_via: "web",
    explanation: "통계청 자료와 일치", sources: [{ title: "통계청", url: "https://kostat.go.kr" }],
  });
  assert.equal(summaryWentStale([c]), false);
});

test("공식 대조·부존재·심층 재확인은 예전처럼 잡힌다", () => {
  for (const via of ["official", "nec", "research"]) {
    assert.equal(summaryWentStale([{ text: "x", verdict: "confirmed", verified_via: via }]), true, via);
  }
});
