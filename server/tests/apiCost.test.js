// API 원가 계량.
//
// "크레딧이 너무 빨리 닳는다"를 고치려면 어디서 닳는지부터 세야 한다. 특히 웹 검색은
// 건당 과금($10/1,000회)인 데다 결과가 대화에 누적돼 이후 턴의 입력 토큰까지 부풀린다 —
// 토큰만 보면 진짜 비용이 안 보인다.
import test from "node:test";
import assert from "node:assert/strict";
import { costOf, newLedger, record, summarize } from "../apiCost.js";

test("웹 검색은 토큰과 별개로 건당 과금된다", () => {
  const noSearch = costOf({ model: "claude-sonnet-5", input: 10000, output: 2000 });
  const withSearch = costOf({ model: "claude-sonnet-5", input: 10000, output: 2000, searches: 4 });
  assert.ok(withSearch > noSearch);
  assert.equal(Math.round((withSearch - noSearch) * 1000) / 1000, 0.04, "검색 4회 = $0.04");
});

test("Haiku로 내리면 같은 작업이 3분의 1 값이 된다", () => {
  const sonnet = costOf({ model: "claude-sonnet-5", input: 20000, output: 500 });
  const haiku = costOf({ model: "claude-haiku-4-5-20251001", input: 20000, output: 500 });
  assert.ok(haiku < sonnet / 2.5, `haiku ${haiku} vs sonnet ${sonnet}`);
});

test("캐시된 입력은 1/10 값으로 계산된다", () => {
  const fresh = costOf({ model: "claude-sonnet-5", input: 10000 });
  const cached = costOf({ model: "claude-sonnet-5", cachedInput: 10000 });
  assert.equal(Math.round((fresh / cached) * 10) / 10, 10);
});

test("검증 한 건의 호출을 모아 어디서 나갔는지 보여준다", () => {
  const l = newLedger();
  record(l, { label: "extract", model: "claude-sonnet-5", usage: { input_tokens: 30000, output_tokens: 1500, server_tool_use: { web_search_requests: 4 } } });
  record(l, { label: "ground", model: "claude-haiku-4-5-20251001", usage: { input_tokens: 2000, output_tokens: 200 } });
  record(l, { label: "research", model: "claude-sonnet-5", usage: { input_tokens: 25000, output_tokens: 800, server_tool_use: { web_search_requests: 3 } } });

  const c = summarize(l);
  assert.equal(c.calls, 3);
  assert.equal(c.searches, 7);
  assert.equal(c.byLabel.extract.searches, 4);
  assert.equal(c.byLabel.ground.searches, 0);
  // 검색이 붙은 항목이 비용 상위여야 한다 — 줄일 곳을 그렇게 찾는다.
  const top = Object.entries(c.byLabel).sort((a, b) => b[1].usd - a[1].usd)[0][0];
  assert.ok(top === "extract" || top === "research");
});

test("호출이 없으면 요약도 없다", () => {
  assert.equal(summarize(newLedger()), null);
  record(null, { label: "x", model: "claude-sonnet-5", usage: {} }); // 장부가 없어도 터지지 않는다
});

test("모르는 모델은 Sonnet 단가로 본다", () => {
  assert.equal(
    costOf({ model: "claude-future-9", input: 1e6 }),
    costOf({ model: "claude-sonnet-5", input: 1e6 }),
  );
});
