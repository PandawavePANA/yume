// 고난도 함정(trapBank) — 네트워크 없이: 같은 조문 값 바꿔치기, 원문이 바뀌면 시나리오를 내지 않기.
import test from "node:test";
import assert from "node:assert/strict";
import { nearMissFrom, scenarioFromTexts, SCENARIOS } from "../audit/trapBank.js";

const ART95 =
  "제95조(육아휴직 급여)\n① 법 제70조제1항에 따른 육아휴직 급여는 다음 각 호의 구분에 따른 금액을 월별 지급액으로 한다.\n" +
  "1. 육아휴직 시작일부터 3개월까지: 육아휴직 시작일을 기준으로 한 월 통상임금에 해당하는 금액. 다만, 해당 금액이 250만원을 넘는 경우에는 250만원으로 한다.\n" +
  "2. 육아휴직 4개월째부터 6개월째까지: 육아휴직 시작일을 기준으로 한 월 통상임금에 해당하는 금액. 다만, 해당 금액이 200만원을 넘는 경우에는 200만원으로 한다.";

test("값 바꿔치기: 같은 조문의 다른 값(200만원↔250만원)을 쓰고, 그 문장에 없는 값만 고른다", () => {
  let swapped = 0;
  for (let i = 0; i < 30; i++) {
    const p = nearMissFrom(ART95);
    assert.ok(p, "바꿀 수치를 찾아야 한다");
    assert.notEqual(p.actualValue, p.wrongValue);
    assert.ok(!p.sentence.includes(p.wrongValue.replace(/(\d+)/, "$1")) || p.sentence !== p.sentenceWrong);
    assert.ok(p.sentenceWrong.includes(p.wrongValue.replace("만원", "")), "틀린 문장에 틀린 값이 들어 있다");
    if (p.swap) swapped += 1;
  }
  assert.ok(swapped > 0, "같은 조문 안 다른 값으로 바꾸는 경우가 있어야 한다");
});

test("값 바꿔치기: '1일 2회'처럼 비율 앞자리는 바꾸지 않고, 긴 문장은 낱말 경계에서 자른다", () => {
  const rate = "제75조(육아 시간) 생후 1년 미만의 유아(乳兒)를 가진 여성 근로자가 청구하면 1일 2회 각각 30분 이상의 유급 수유 시간을 주어야 한다.";
  for (let i = 0; i < 20; i++) {
    const p = nearMissFrom(rate);
    if (!p) continue;
    assert.ok(!/^\d+일$/.test(p.actualValue) || !p.sentenceWrong.match(/\d+일 2회/) || p.actualValue !== "1일", "1일 2회의 1일은 바꾸지 않는다");
  }
  const long = `제61조(연차 유급휴가의 사용 촉진) ① ${"사용자가 근로자별로 사용하지 아니한 휴가 일수를 알려주고 ".repeat(4)}최초 1년의 근로기간이 끝나기 3개월 전을 기준으로 10일 이내에 서면으로 촉구할 것. ${"근로자가 그 사용 시기를 정하여 사용자에게 통보하도록 하여야 한다 ".repeat(4)}`;
  const p = nearMissFrom(long);
  assert.ok(p);
  assert.ok(p.sentenceWrong.startsWith("…") || p.sentenceWrong.startsWith("최초") || p.sentenceWrong.startsWith("사용자가"), "낱말 중간에서 시작하지 않는다");
});

test("시나리오: 원문이 기준을 담고 있을 때만 내고, 바뀌었으면 내지 않는다", () => {
  const sc = SCENARIOS.find((s) => s.id === "notice_60");
  const t = Date.UTC(2026, 9, 13);
  const ok = scenarioFromTexts(sc, ["제26조(해고의 예고) 사용자는 근로자를 해고하려면 적어도 30일 전에 예고를 하여야 하고"], t);
  assert.equal(ok.type, "buried_premise");
  assert.match(ok.question, /60일로 늘어났잖아요/);
  assert.match(ok.groundTruth, /2026년 11월 12일/);
  assert.equal(ok.oracle.actualValue, "30일");
  assert.equal(scenarioFromTexts(sc, ["제26조(해고의 예고) 사용자는 근로자를 해고하려면 적어도 45일 전에 예고를 하여야 하고"], t), null);
  assert.equal(scenarioFromTexts(sc, [null], t), null);

  const caps = SCENARIOS.find((s) => s.id === "parental_caps_swapped");
  const c = scenarioFromTexts(caps, [ART95 + "\n3. 육아휴직 7개월째부터 종료일까지: 월 통상임금의 100분의 80에 해당하는 금액. 다만, 해당 금액이 160만원을 넘는 경우에는 160만원으로 한다."], t);
  assert.equal(c.oracle.answer, 2_500_000);
  // 모든 시나리오는 확인할 원문 기준(verify)과 출처(src)를 갖는다.
  for (const s of SCENARIOS) {
    assert.ok(s.verify.length > 0 && s.src.length > 0, s.id);
  }
});

test("업종별 시나리오: 모든 업종에 곁가지 틀린 전제가 있고, 그 업종으로 표시된다", () => {
  const t = Date.UTC(2026, 9, 13);
  for (const d of ["인사", "의료", "금융", "커머스", "제조", "공공", "법률"]) {
    assert.ok(SCENARIOS.filter((s) => s.domain === d).length >= 4, `${d} 시나리오 4개 이상`);
  }
  const ids = SCENARIOS.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length, "id는 겹치지 않는다");

  const ins = SCENARIOS.find((s) => s.id === "insurance_withdraw_30");
  const law = "1. 보장성 상품: 보험증권을 받은 날부터 15일과 청약을 한 날부터 30일 중 먼저 도래하는 기간";
  const q = scenarioFromTexts(ins, [law], t);
  assert.equal(q.domain, "금융");
  // 청약 9/18, 증권 9/23 → 증권+15일(10/8)이 먼저 — 오늘(10/13)은 지났다.
  assert.equal(q.oracle.answer, "2026년 10월 8일");
  assert.equal(scenarioFromTexts(ins, [law.replace("15일", "20일")], t), null);

  const rent = SCENARIOS.find((s) => s.id === "rent_increase_10");
  assert.equal(scenarioFromTexts(rent, ["② 제1항에 따른 증액청구는 약정한 차임이나 보증금의 20분의 1의 금액을 초과하지 못한다."], t).oracle.answer, 315_000_000);

  const pl = SCENARIOS.find((s) => s.id === "pl_1y");
  const p = scenarioFromTexts(pl, ["① 이 법에 따른 손해배상의 청구권은 피해자 또는 그 법정대리인이 다음 각 호의 사항을 모두 알게 된 날부터 3년간 행사하지 아니하면 시효의 완성으로 소멸한다."], t);
  assert.equal(p.domain, "제조");
  assert.match(p.question, /1년 안에/);
});
