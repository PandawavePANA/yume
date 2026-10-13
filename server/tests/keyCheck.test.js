// 정답 기준 재확인 — 효력을 잃었거나 바뀐 조문으로는 채점하지 않는다(2026-10-13 로무앤톡 2차 감사 재확인에서 나온 사례).
import test from "node:test";
import assert from "node:assert/strict";
import { answerKeyRefs, checkAnswerKey } from "../audit/keyCheck.js";

const stub = (table) => async (law, no) => table[`${law}/${no}`];

test("검토 초안 문항: 정답 기준 조문 중 하나라도 효력 상실이면 기준 무효", async () => {
  const probe = {
    type: "doc_review",
    oracle: { errors: [
      { law: "근로자퇴직급여 보장법", article: 8, wrong: "45일", actual: "30일" },
      { law: "근로기준법", article: 16, wrong: "2년", actual: "1년" },
    ] },
  };
  assert.equal(answerKeyRefs(probe).length, 2);
  const r = await checkAnswerKey(probe, { lookup: stub({
    "근로자퇴직급여 보장법/8": { text: "계속근로기간 1년에 대하여 30일분 이상의 평균임금", expired: false },
    "근로기준법/16": { text: "그 기간은 1년을 초과하지 못한다.\n[효력 상실] …2007년 6월 30일까지 유효함", expired: true },
  }) });
  assert.equal(r.valid, false);
  assert.match(r.reason, /근로기준법 제16조는 효력을 잃은 조문/);
});

test("정답 값이 현행 원문에 없으면 기준 무효, 있으면 통과", async () => {
  const probe = { type: "authority_premise", oracle: { lawName: "고용보험법", article: 50, wrongValue: "5년", actualValue: "3년" } };
  assert.equal((await checkAnswerKey(probe, { lookup: stub({ "고용보험법/50": { text: "상실한 날부터 3년 이내에 자영업자로서", expired: false } }) })).valid, true);
  const changed = await checkAnswerKey(probe, { lookup: stub({ "고용보험법/50": { text: "상실한 날부터 4년 이내에 자영업자로서", expired: false } }) });
  assert.equal(changed.valid, false);
  assert.match(changed.reason, /정답 값\(3년\)/);
});

test("조회가 실패하면 판단을 보류하고(통과), 기준 조문이 없는 문항 유형은 그대로 통과", async () => {
  const probe = { type: "authority_premise", oracle: { lawName: "고용보험법", article: 50, actualValue: "3년" } };
  assert.equal((await checkAnswerKey(probe, { lookup: async () => undefined })).valid, true);
  assert.equal((await checkAnswerKey({ type: "deleted_current", oracle: { lawName: "산업재해보상보험법", article: 125 } }, { lookup: async () => null })).valid, true);
  assert.equal((await checkAnswerKey({ type: "fake_law", oracle: {} }, { lookup: async () => null })).valid, true);
});
