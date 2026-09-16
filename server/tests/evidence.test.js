// 유메가 틀리지 않기 위한 규율 — 근거 없는 단정을 내보내지 않는다.
//
// 유메가 틀리는 경로는 둘뿐이다. 없는 걸 있다고 하거나, 못 찾은 걸 찾았다고 하거나.
// 앞은 부존재 신뢰도(NEC)가 막고, 뒤는 이 검사가 막는다. 출처 한 건 없이 "확인됨"으로
// 나가면 그건 검증이 아니라 모델이 그냥 한 말이다.
import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeClaim } from "../claimGuard.js";
import { buildOverallVerdict } from "../overallVerdict.js";

const base = { text: "어떤 주장", domain: "일반", explanation: "그럴듯한 설명", sources: [] };

test("출처 없는 '확인됨'은 '확인되지 않음'으로 내린다", () => {
  const c = sanitizeClaim({ ...base, verdict: "confirmed", verified_via: "web" });
  assert.equal(c.verdict, "uncertain");
  assert.equal(c.unbacked_verdict, "confirmed");
  assert.match(c.explanation, /출처를 유메가 확보하지 못했습니다/);
  assert.match(c.explanation, /그럴듯한 설명/, "원래 검토 내용은 버리지 않는다");
});

test("출처 없는 '사실과 다름'도 마찬가지로 내린다", () => {
  const c = sanitizeClaim({ ...base, verdict: "false", verified_via: "research" });
  assert.equal(c.verdict, "uncertain");
  assert.equal(c.unbacked_verdict, "false");
});

test("출처가 있으면 판정을 그대로 둔다", () => {
  const c = sanitizeClaim({ ...base, verdict: "confirmed", verified_via: "web", sources: [{ title: "통계청", url: "https://kostat.go.kr" }] });
  assert.equal(c.verdict, "confirmed");
  assert.equal(c.unbacked_verdict, undefined);
});

test("URL 없는 껍데기 출처는 근거로 치지 않는다", () => {
  const c = sanitizeClaim({ ...base, verdict: "confirmed", verified_via: "web", sources: [{ title: "어디선가" }] });
  assert.equal(c.verdict, "uncertain");
});

test("법제처 공식 대조와 부존재 신뢰도는 스스로 근거를 갖는다", () => {
  // official은 조문 원문이, nec은 점수와 탐색 커버리지가 근거다.
  assert.equal(sanitizeClaim({ ...base, verdict: "confirmed", verified_via: "official" }).verdict, "confirmed");
  assert.equal(sanitizeClaim({ ...base, verdict: "false", verified_via: "nec" }).verdict, "false");
});

test("총평은 '확인되지 않음'을 중립이 아니라 경고로 다룬다", () => {
  const mixed = buildOverallVerdict([
    { text: "A", verdict: "confirmed" },
    { text: "B", verdict: "uncertain" },
  ]);
  assert.equal(mixed.tone, "unverified");
  assert.match(mixed.label, /확인되지 않음/);
  assert.match(mixed.detail, /그대로 믿으면 안 됩니다/);
  assert.match(mixed.detail, /"B"/, "어느 주장이 확인되지 않았는지 짚어준다");

  const none = buildOverallVerdict([{ text: "A", verdict: "uncertain" }, { text: "B", verdict: "uncertain" }]);
  assert.equal(none.label, "확인되지 않음");
  assert.match(none.detail, /모두 뒷받침할 근거를 찾지 못했습니다/);
});

test("사실과 다름이 있으면 확인되지 않은 주장 수도 함께 알린다", () => {
  const r = buildOverallVerdict([
    { text: "A", verdict: "false" },
    { text: "B", verdict: "uncertain" },
    { text: "C", verdict: "confirmed" },
  ]);
  assert.equal(r.tone, "false");
  assert.match(r.detail, /1개는 근거를 찾지 못해 확인되지 않았습니다/);
});

test("두 번 거쳐도 설명이 중복으로 덧씌워지지 않는다", () => {
  // 파이프라인은 심층 재확인 앞뒤로 검사대를 두 번 통과시킨다. 멱등해야 한다.
  const once = sanitizeClaim({ ...base, verdict: "confirmed", verified_via: "web" });
  const twice = sanitizeClaim({ ...once });
  assert.equal(twice.verdict, "uncertain");
  assert.equal(twice.explanation, once.explanation, "두 번 걸러도 설명은 그대로");
});

test("강등된 주장이 근거를 찾아오면 판정이 살아 돌아온다", () => {
  const downgraded = sanitizeClaim({ ...base, verdict: "confirmed", verified_via: "web" });
  assert.equal(downgraded.verdict, "uncertain");
  // 심층 재확인이 출처를 찾아온 상황
  const revived = sanitizeClaim({ ...downgraded, verdict: "confirmed", verified_via: "research", sources: [{ title: "통계청", url: "https://kostat.go.kr" }] });
  assert.equal(revived.verdict, "confirmed");
});
