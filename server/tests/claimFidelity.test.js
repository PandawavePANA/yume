// 주장이 원문의 조건("누구에게"·숫자)을 잃으면 되살린다 — 안 그러면 다른 문장을 검증한다.
import test from "node:test";
import assert from "node:assert/strict";
import { droppedConditions, restoreConditions } from "../claimFidelity.js";

const labor = {
  text: "근로계약서를 서면으로 작성하지 않으면 500만원 이하의 벌금이 부과된다",
  quote: "또한 근로계약서를 서면으로 쓰지 않으면 근로자에게 500만원 이하의 벌금이 부과됩니다.",
  verdict: "pending_legal_check",
};

test("원문의 '근로자에게'가 주장에서 빠지면 잡는다", () => {
  assert.deepEqual(droppedConditions(labor), ["근로자에게"]);
});

test("숫자는 쉼표를 떼고 비교하고, 다 있으면 빈 배열", () => {
  assert.deepEqual(droppedConditions({ text: "2025년 최저임금은 시간당 10030원", quote: "2025년 최저임금은 시간당 10,030원입니다." }), []);
  assert.deepEqual(droppedConditions({ text: "최저임금은 시간당 10,030원", quote: "2025년 최저임금은 시간당 10,030원입니다." }), ["2025"]);
});

test("빠진 게 없으면 모델을 부르지 않는다", async () => {
  let called = 0;
  const claims = [{ text: "한글날은 10월 9일이다", quote: "한글날은 매년 10월 9일입니다.", verdict: "uncertain" }];
  const out = await restoreConditions(claims, { call: async () => { called++; return {}; } });
  assert.equal(called, 0);
  assert.equal(out, claims);
});

test("판정 전 주장만 고치고, 빠진 조건을 실제로 담은 문장만 받는다", async () => {
  const judged = { ...labor, verdict: "confirmed" };
  const call = async () => ({ fixes: [{ n: 1, text: "근로계약서를 서면으로 쓰지 않으면 근로자에게 500만원 이하의 벌금이 부과된다" }] });
  const [fixed, untouched] = await restoreConditions([labor, judged], { call });
  assert.match(fixed.text, /근로자에게/);
  assert.equal(fixed.restored_from, labor.text);
  assert.equal(untouched.text, labor.text, "이미 판정이 난 주장은 그 문장 그대로");

  const [same] = await restoreConditions([labor], { call: async () => ({ fixes: [{ n: 1, text: "근로계약서 미작성 시 벌금" }] }) });
  assert.equal(same.text, labor.text, "조건을 되살리지 못한 고침은 버린다");

  const [safe] = await restoreConditions([labor], { call: async () => { throw new Error("down"); } });
  assert.equal(safe.text, labor.text, "실패하면 그대로");
});

test("단정의 세기(확실히·모든)가 빠지면 잡는다 — 틀린 말이 순한 말로 바뀌어 검증되지 않게", () => {
  const lost = droppedConditions({
    text: "아스피린은 암을 예방하는 효과가 있다",
    quote: "아스피린은 암을 확실히 예방하므로 모든 성인은 매일 복용해야 합니다.",
  });
  assert.deepEqual(lost, ["확실히", "모든"]);
});
