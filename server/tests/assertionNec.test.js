// 일반 사실 주장의 부존재 검증 — 유메의 출발점.
//
// 공식 기록과 웹을 다 뒤졌는데 없는데 AI가 확언했다면 틀린 쪽은 AI다. "못 찾았다"는
// 유메의 실패가 아니라 유메가 내놓는 답이다. 다만 아무 때나 그렇게 말하면 안 된다 —
// 애초에 기록이 남지 않는 주장(비공개 매출, 개인 경험)은 못 찾는 게 당연하기 때문이다.
// 그 경계를 기록 가능성(recordedness)과 탐색 충실도로 가른다.
import test from "node:test";
import assert from "node:assert/strict";
import { resolveUncertainClaims } from "../resolveUncertain.js";

const claim = (over = {}) => ({ text: "2024년 대구 중구 안경 공방 평균 객단가는 18만 7천원", domain: "일반", verdict: "uncertain", explanation: "", sources: [], ...over });
const report = (over = {}) => ({ verdict: "uncertain", explanation: "여러 포털을 검색했으나 해당 수치를 찾지 못함", sources: [], recordedness: "public_record", searchedThoroughly: true, nearMiss: null, ...over });

const run = (c, r) => resolveUncertainClaims([c], { research: async () => r });

test("공공 기록에 있어야 할 통계인데 다 뒤져도 없으면 '사실과 다름'", async () => {
  const [out] = await run(claim(), report());
  assert.equal(out.verdict, "false");
  assert.equal(out.verified_via, "nec");
  assert.equal(out.nec.grade, "nonexistent");
  assert.match(out.explanation, /지어낸 정보로 봅니다/);
  assert.match(out.explanation, /부존재 신뢰도/);
});

test("언론 보도·출판물 영역도 마찬가지로 부존재 판정이 선다", async () => {
  for (const recordedness of ["published", "reported"]) {
    const [out] = await run(claim(), report({ recordedness }));
    assert.equal(out.verdict, "false", recordedness);
    assert.equal(out.nec.grade, "nonexistent", recordedness);
  }
});

test("비공개 정보는 못 찾는 게 당연하므로 부존재로 단정하지 않는다", async () => {
  const [out] = await run(claim({ text: "리머의 2025년 매출은 4억 2천만원" }), report({ recordedness: "private" }));
  assert.equal(out.verdict, "uncertain");
  assert.equal(out.nec.grade, "unverifiable");
});

test("기록으로 남지 않는 영역도 단정하지 않는다", async () => {
  const [out] = await run(claim({ text: "그는 어제 기분이 좋았다" }), report({ recordedness: "unrecordable" }));
  assert.equal(out.verdict, "uncertain");
});

test("대충 찾고 만 경우에는 부존재 근거가 성립하지 않는다", async () => {
  // 부존재는 '다 뒤졌다'가 전제다. 탐색이 부실하면 커버리지를 인정하지 않는다.
  const [out] = await run(claim(), report({ searchedThoroughly: false }));
  assert.equal(out.verdict, "uncertain");
  assert.ok(out.nec.score < out.nec.threshold);
});

test("비슷한 실재 사실이 있으면 지어낸 게 아니라 잘못 기억한 것으로 본다", async () => {
  const [out] = await run(claim(), report({ nearMiss: { value: "2023년 같은 지역 평균 객단가 12만 4천원(소상공인시장진흥공단)", similarity: 0.85 } }));
  assert.equal(out.verdict, "uncertain");
  assert.equal(out.nec.grade, "unverifiable");
  assert.equal(out.nec.proximity.similar[0].similarity, 0.85);
});

test("부존재 판정에는 미탐색 영역 안내가 붙지 않고, 보류에는 붙는다", async () => {
  const [no] = await run(claim(), report());
  assert.equal(no.nec.uncovered.length, 0);
  const [maybe] = await run(claim(), report({ recordedness: "private" }));
  assert.ok(maybe.nec.uncovered.length > 0, "확인되지 않음이면 어디를 더 봐야 하는지 알려준다");
  assert.ok(maybe.nec.uncovered[0].howToCheck);
});

test("근거를 찾아 판정이 서면 부존재 경로로 가지 않는다", async () => {
  const [out] = await run(claim(), report({ verdict: "confirmed", explanation: "소상공인시장진흥공단 자료로 확인", sources: [{ title: "소진공", url: "https://semas.or.kr" }] }));
  assert.equal(out.verdict, "confirmed");
  assert.equal(out.verified_via, "research");
});

test("출처 없이 '사실과 다름'만 주장하면 부존재 신뢰도로 검증한다", async () => {
  // 없는 걸 없다고 할 때는 인용할 출처가 없다 — 그래서 모델의 말만 믿으면 안 되고,
  // 검색공간을 얼마나 덮었는지로 따져야 한다.
  const [strong] = await run(claim(), report({ verdict: "false", sources: [], recordedness: "public_record", searchedThoroughly: true }));
  assert.equal(strong.verdict, "false");
  assert.equal(strong.verified_via, "nec", "부존재 신뢰도가 근거가 된다");
  assert.equal(strong.nec.grade, "nonexistent");

  // 대충 찾고 "없다"고 하면 인정하지 않는다.
  const [weak] = await run(claim(), report({ verdict: "false", sources: [], searchedThoroughly: false }));
  assert.equal(weak.verdict, "uncertain");
});

test("반박 출처가 있는 '사실과 다름'은 그대로 받는다", async () => {
  // 실제 수상작을 찾아 반박하는 경우 — 부존재가 아니라 모순이므로 출처가 근거다.
  const [out] = await run(claim(), report({
    verdict: "false",
    explanation: "실제 수상작은 다른 작품",
    sources: [{ title: "BIFF 공식", url: "https://biff.kr" }],
  }));
  assert.equal(out.verdict, "false");
  assert.equal(out.verified_via, "research");
});
