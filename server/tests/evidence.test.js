// 베리라인이 틀리지 않기 위한 규율 — 근거 없는 단정을 내보내지 않는다.
//
// 베리라인이 틀리는 경로는 둘뿐이다. 없는 걸 있다고 하거나, 못 찾은 걸 찾았다고 하거나.
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
  assert.match(c.explanation, /출처를 베리라인이 확보하지 못했습니다/);
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

test("총평은 '근거 없음'을 중립이 아니라 경고로, 분명하게 말한다", () => {
  const mixed = buildOverallVerdict([
    { text: "A", verdict: "confirmed" },
    { text: "B", verdict: "uncertain", uncertain_reason: "no_evidence" },
  ]);
  assert.equal(mixed.tone, "unverified");
  assert.equal(mixed.label, "근거 없는 주장 있음");
  assert.match(mixed.detail, /그대로 믿으면 안 됩니다/);
  assert.match(mixed.detail, /"B"/, "어느 주장인지 짚어준다");

  const none = buildOverallVerdict([{ text: "A", verdict: "uncertain" }, { text: "B", verdict: "uncertain" }]);
  assert.equal(none.label, "근거 없음", "이유가 없으면 근거 없음으로 본다");
  assert.match(none.detail, /어디에서도 근거를 찾을 수 없습니다/);
  assert.match(none.detail, /사실로 쓰지 마세요/);
});

test("공개 기록으로 확인할 수 없는 종류는 '근거 없음'과 따로 말한다", () => {
  // 와인 평점처럼 사실이어도 공개 웹에 없는 것 — 없다는 게 아무것도 말해 주지 않는다.
  const r = buildOverallVerdict([{ text: "A", verdict: "uncertain", uncertain_reason: "not_public" }]);
  assert.equal(r.label, "확인되지 않음");
  assert.match(r.detail, /공개 기록으로 확인할 수 없는 종류/);
  assert.doesNotMatch(r.detail, /근거 없음/);
});

test("사실과 다름이 있으면 근거 없는 주장 수도 함께 알린다", () => {
  const r = buildOverallVerdict([
    { text: "A", verdict: "false" },
    { text: "B", verdict: "uncertain", uncertain_reason: "no_evidence" },
    { text: "C", verdict: "confirmed" },
  ]);
  assert.equal(r.tone, "false");
  assert.match(r.detail, /1개는 공개된 자료 어디에서도 근거를 찾을 수 없습니다\(근거 없음\)/);
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
