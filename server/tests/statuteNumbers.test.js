import test from "node:test";
import assert from "node:assert/strict";
import { confirmByStatute, numbersIn } from "../statuteNumbers.js";

const ART = {
  law: "조세특례제한법",
  no: 95,
  branch: 2,
  url: "https://www.law.go.kr/법령/조세특례제한법/제95조의2",
  text: "① 과세기간 종료일 현재 주택을 소유하지 아니한 세대의 세대주로서 해당 과세기간의 총급여액이 8천만원 이하인 근로소득이 있는 근로자(해당 과세기간에 종합소득과세표준을 계산할 때 합산하는 종합소득금액이 7천만원을 초과하는 사람은 제외한다)가 월세액을 지급하는 경우 그 금액의 100분의 15[해당 과세기간에 총급여액이 5천500만원 이하인 근로소득이 있는 근로자의 경우에는 100분의 17]에 해당하는 금액을 해당 과세기간의 종합소득산출세액에서 공제한다. 다만, 해당 월세액이 1천만원을 초과하는 경우 그 초과하는 금액은 없는 것으로 한다.",
};

test("조문 꼴과 답 꼴의 숫자가 같은 값으로 모인다", () => {
  const law = numbersIn(ART.text);
  for (const k of ["₩80000000", "₩70000000", "₩55000000", "₩10000000", "%15", "%17"]) assert.ok(law.has(k), k);
  const ans = numbersIn("총급여 5,500만 원 이하이면 17%, 초과이면 15%이고, 연간 한도는 1,000만 원이에요.");
  assert.deepEqual([...ans].sort(), ["%15", "%17", "₩10000000", "₩55000000"].sort());
  assert.ok(numbersIn("기준시가 4억 원 이하").has("₩400000000"));
  assert.ok(numbersIn("4억 5천만 원").has("₩450000000"));
  assert.ok(numbersIn("전용면적 85㎡ 이하").has("85m2"));
});

test("숫자가 모두 조문에 있는 문장만 확인됨으로 옮긴다", () => {
  const hedged = [
    { quote: "공제율은 총급여 5,500만 원 이하이면 17%, 초과이면 15%이고, 연간 한도는 1,000만 원까지예요.", claim: "공제율" },
    { quote: "총급여액이 8,000만 원 이하(종합소득금액 7,000만 원 이하)여야 해요.", claim: "총급여" },
    { quote: "국민주택규모(전용면적 85㎡ 이하) 또는 기준시가 4억 원 이하 주택이어야 해요.", claim: "주택" },
    { quote: "공제율은 총급여에 따라 12%예요.", claim: "틀린 숫자" },
    { quote: "신청은 연말정산 때 하면 돼요.", claim: "숫자 없음" },
  ];
  const { keep, confirmed } = confirmByStatute(hedged, [ART]);
  assert.deepEqual(confirmed.map((c) => c.item.claim), ["공제율", "총급여"]);
  assert.equal(confirmed[0].article, ART);
  assert.deepEqual(keep.map((k) => k.claim), ["주택", "틀린 숫자", "숫자 없음"]);
});

test("고칠 곳으로 잡힌 문장은 숫자가 맞아도 그대로 둔다", () => {
  const q = "총급여액이 8,000만 원 이하여야 해요.";
  const { confirmed } = confirmByStatute([{ quote: q }], [ART], new Set([q]));
  assert.equal(confirmed.length, 0);
});
