import test from "node:test";
import assert from "node:assert/strict";
import { factTerms } from "../factStore.js";

test("질문에서 사실 찾기용 낱말만 뽑는다", () => {
  assert.deepEqual(factTerms("올해 최저임금 시급이랑 월급 얼마야?"), ["최저임금", "시급", "월급"]);
  assert.ok(factTerms("타이레놀 하루 최대 몇 mg까지 먹어도 돼?").includes("mg"));
  assert.deepEqual(factTerms("뭐야?"), []);
});
