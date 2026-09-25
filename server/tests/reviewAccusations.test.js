// 지목 재확인 — 맞는 정보를 거짓이라 부르는 오류를 막는다.
//
// 유메의 두 오류는 값이 다르다. "확인되지 않음"은 정직한 결과지만, 잘못된 "사실과 다름"은
// 사용자가 멀쩡한 사실을 버리게 만들고, 근거까지 달려 있어 알아차리기도 어렵다.
import test from "node:test";
import assert from "node:assert/strict";
import { reviewAccusations } from "../reviewAccusations.js";

const claim = (over = {}) => ({ text: "어떤 주장", verdict: "false", verified_via: "web", explanation: "검색 결과와 다름", sources: [{ title: "a", url: "https://a" }], ...over });

test("근거가 반박이 아니라 '뒷받침 못함'이면 지목을 거둔다", async () => {
  const out = await reviewAccusations([claim()], {
    review: async () => ({ upheld: false, reason: "찾은 자료는 다른 사안을 다룬다" }),
  });
  assert.equal(out[0].verdict, "uncertain");
  assert.equal(out[0].withdrawn_verdict, "false");
  assert.match(out[0].explanation, /지목을 거뒀습니다/);
  assert.match(out[0].explanation, /처음 판단/, "원래 판단도 남긴다");
});

test("근거가 실제로 반박하면 지목을 유지한다", async () => {
  const out = await reviewAccusations([claim()], { review: async () => ({ upheld: true, counterFact: "실제 평점은 90점", reason: "수치가 실제로 다름" }) });
  assert.equal(out[0].verdict, "false");
  assert.equal(out[0].withdrawn_verdict, undefined);
  assert.equal(out[0].counter_fact, "실제 평점은 90점");
  assert.match(out[0].explanation, /실제 평점은 90점/, "실제 값은 설명문에도 남는다(캐시는 설명문만 보관한다)");
});

test("실제 값을 대지 못한 '유지'는 받지 않는다", async () => {
  // 반박은 언제나 "그럼 실제로는 무엇인가"를 가지고 있다. 그걸 못 대면 말이 아무리
  // 단정적이어도 반박이 아니라 미확인이다.
  const out = await reviewAccusations([claim()], { review: async () => ({ upheld: true, counterFact: "", reason: "틀린 게 맞다" }) });
  assert.equal(out[0].verdict, "uncertain");
  assert.equal(out[0].withdrawn_verdict, "false");
  assert.match(out[0].explanation, /실제로는 무엇인가/);
});

test("실제 값이라며 '못 찾았다'를 내놓으면 지목을 거둔다", async () => {
  const out = await reviewAccusations([claim()], { review: async () => ({ upheld: true, counterFact: "해당 평점을 찾을 수 없음", reason: "x" }) });
  assert.equal(out[0].verdict, "uncertain");
});

test("실제 값이 이미 설명문에 있으면 두 번 쓰지 않는다", async () => {
  const c = claim({ explanation: "실제 평점은 90점으로 확인됩니다" });
  const out = await reviewAccusations([c], { review: async () => ({ upheld: true, counterFact: "실제 평점은 90점", reason: "x" }) });
  assert.equal(out[0].explanation, c.explanation);
});

test("공식 대조와 부존재 신뢰도 판정은 건드리지 않는다", async () => {
  // 근거가 형식적으로 확정된 판정이라 다시 보면 오히려 모델의 인상으로 흔들게 된다.
  let called = 0;
  const input = [claim({ verified_via: "official" }), claim({ verified_via: "nec" })];
  const out = await reviewAccusations(input, { review: async () => { called++; return { upheld: false }; } });
  assert.equal(called, 0);
  assert.deepEqual(out, input);
});

test("사실과 다름이 아닌 판정은 대상이 아니다", async () => {
  let called = 0;
  const input = [claim({ verdict: "confirmed" }), claim({ verdict: "uncertain" })];
  await reviewAccusations(input, { review: async () => { called++; return { upheld: false }; } });
  assert.equal(called, 0);
});

test("지목이 쏟아져도 재확인 비용은 상한을 넘지 않는다", async () => {
  let called = 0;
  const many = Array.from({ length: 8 }, (_, i) => claim({ text: `주장${i}` }));
  await reviewAccusations(many, { review: async () => { called++; return { upheld: true, counterFact: "실제로는 다른 값" }; } });
  assert.equal(called, 3, "한 검증에서 최대 3건까지만 다시 본다");
});

test("재확인이 실패하면 원래 판정을 지킨다", async () => {
  // 확인하지 못했다고 해서 이미 근거를 갖춘 지목을 거둘 이유는 없다.
  const out = await reviewAccusations([claim()], { review: async () => { throw new Error("rate limit"); } });
  assert.equal(out[0].verdict, "false");
});

test("순서를 지킨다", async () => {
  const input = [claim({ text: "A" }), claim({ text: "B", verdict: "confirmed" }), claim({ text: "C" })];
  const out = await reviewAccusations(input, { review: async () => ({ upheld: false, reason: "x" }) });
  assert.deepEqual(out.map((c) => c.text), ["A", "B", "C"]);
  assert.deepEqual(out.map((c) => c.verdict), ["uncertain", "confirmed", "uncertain"]);
});
