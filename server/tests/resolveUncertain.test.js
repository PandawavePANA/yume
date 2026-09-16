// 마지막 관문 테스트 — "모른다"로 끝나는 주장이 나가지 않는지 본다.
// 실제 Claude 호출 없이 research 함수를 주입해서 분기만 검증한다.
import test from "node:test";
import assert from "node:assert/strict";
import { resolveUncertainClaims } from "../resolveUncertain.js";

const claim = (over = {}) => ({ text: "2020년 한국 출산율은 0.84였다", domain: "일반", verdict: "uncertain", explanation: "", sources: [], ...over });

test("보류된 주장은 심층 재확인을 거쳐 판정된다", async () => {
  const out = await resolveUncertainClaims([claim()], {
    research: async () => ({ verdict: "confirmed", explanation: "통계청 인구동향조사 기준 0.84로 확인됩니다.", sources: [{ title: "통계청", url: "https://kostat.go.kr" }] }),
  });
  assert.equal(out[0].verdict, "confirmed");
  assert.equal(out[0].verified_via, "research");
  assert.equal(out[0].sources.length, 1);
});

test("이미 판정된 주장은 건드리지 않는다", async () => {
  let called = 0;
  const input = [claim({ verdict: "confirmed", explanation: "확인됨" }), claim({ verdict: "false", explanation: "틀림" })];
  const out = await resolveUncertainClaims(input, { research: async () => { called++; return { verdict: "false", explanation: "x", sources: [] }; } });
  assert.equal(called, 0);
  assert.deepEqual(out, input);
});

test("재확인 후에도 보류면 '무엇이 남았는지'를 반드시 남긴다", async () => {
  const out = await resolveUncertainClaims([claim({ domain: "의료" })], {
    research: async () => ({ verdict: "uncertain", explanation: "", sources: [] }),
  });
  assert.equal(out[0].verdict, "uncertain");
  // 설명이 비어 있으면 안 된다 — 이게 이 모듈의 존재 이유다.
  assert.ok(out[0].explanation.length > 20, "빈 설명으로 내보내면 안 됨");
  assert.ok(out[0].explanation.includes("보건"), "도메인에 맞는 안내여야 함");
});

test("쓸모없는 한 줄 보류도 구체적인 안내로 바꾼다", async () => {
  for (const useless of ["확인할 수 없습니다", "판단 보류", "알 수 없음", "모름"]) {
    const out = await resolveUncertainClaims([claim()], { research: async () => ({ verdict: "uncertain", explanation: useless, sources: [] }) });
    assert.notEqual(out[0].explanation, useless, `"${useless}"가 그대로 나가면 안 됨`);
    assert.ok(out[0].explanation.length > 20);
  }
});

test("리서치 호출이 실패해도 앞 단계 결과를 지키고 설명은 채운다", async () => {
  const out = await resolveUncertainClaims([claim({ explanation: "법제처 조회 실패", sources: [{ title: "a", url: "https://a" }] })], {
    research: async () => { throw new Error("rate limit"); },
  });
  assert.equal(out[0].verdict, "uncertain");
  assert.ok(out[0].explanation.length > 20, "실패해도 빈 설명이면 안 됨");
  assert.equal(out[0].sources.length, 1, "앞 단계 출처는 보존");
});

test("여러 주장을 나눠 처리하고 순서를 지킨다", async () => {
  const input = [claim({ text: "A" }), claim({ text: "B", verdict: "confirmed" }), claim({ text: "C" }), claim({ text: "D" })];
  const out = await resolveUncertainClaims(input, {
    // 반박 출처가 있는 false — 순서만 보는 테스트라 근거는 갖춰 둔다.
    research: async (text) => ({ verdict: "false", explanation: `${text} 는 틀렸습니다 — 실제 수치는 다릅니다.`, sources: [{ title: "통계청", url: "https://kostat.go.kr" }] }),
  });
  assert.deepEqual(out.map((c) => c.text), ["A", "B", "C", "D"]);
  assert.deepEqual(out.map((c) => c.verdict), ["false", "confirmed", "false", "false"]);
});
