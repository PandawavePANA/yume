// 검증 한 건이 쓰는 검색에 천장이 있는지.
//
// 실측으로 검색 1회가 약 $0.054(75원)다. 검색 수수료는 $0.01인데 결과가 대화에 쌓여
// 다음 턴의 입력·캐시 토큰까지 부풀리기 때문에 5배가 넘는다. 그래서 "몇 번 검색했나"가
// 사실상 원가 그 자체다.
//
// 그런데 천장이 없었다. 단계별 상한은 있었지만(추출 6, 리서치 3, 지목 재확인 2) 리서치는
// 결론이 안 난 주장 **마다** 돌기 때문에, 주장 7개에서 6개가 미결이면 그 단계에서만
// 18회를 쓴다. 검증 한 건이 1달러를 넘을 수 있고, 그건 스탠다드 한 달 요금의 15%다.
import test from "node:test";
import assert from "node:assert/strict";
import { SEARCH_BUDGET, newLedger, record, searchesLeft } from "../apiCost.js";
import { resolveUncertainClaims } from "../resolveUncertain.js";

const spend = (ledger, searches) =>
  record(ledger, { label: "x", model: "claude-sonnet-5", usage: { server_tool_use: { web_search_requests: searches } } });

test("쓴 만큼 남은 양이 줄어든다", () => {
  const ledger = newLedger();
  assert.equal(searchesLeft(ledger), SEARCH_BUDGET);
  spend(ledger, 6);
  assert.equal(searchesLeft(ledger), SEARCH_BUDGET - 6);
  spend(ledger, 3);
  assert.equal(searchesLeft(ledger), SEARCH_BUDGET - 9);
});

test("총량을 넘겨 써도 남은 양은 음수가 되지 않는다", () => {
  const ledger = newLedger();
  spend(ledger, SEARCH_BUDGET + 5);
  assert.equal(searchesLeft(ledger), 0);
});

test("장부가 없으면 제한하지 않는다", () => {
  // 단위 테스트나 검증 바깥의 단발 호출. 예산을 강제할 자리가 아니다.
  assert.equal(searchesLeft(null), Infinity);
});

test("예산을 따로 줄 수 있다", () => {
  const ledger = newLedger({ searchBudget: 2 });
  spend(ledger, 1);
  assert.equal(searchesLeft(ledger), 1);
});

const uncertain = (text) => ({ text, domain: "일반", verdict: "uncertain", explanation: "근거를 더 찾아봐야 합니다", sources: [] });

test("검색 총량을 다 쓰면 심층 재확인을 부르지 않는다", async () => {
  // 검색 없이 리서치를 부르는 건 배경지식으로 추측하라는 뜻이라 리서치가 아니다.
  // 돈만 쓰고 근거는 못 댄다.
  const ledger = newLedger();
  spend(ledger, SEARCH_BUDGET);
  let called = 0;
  const claims = [uncertain("주장 A"), uncertain("주장 B")];
  const out = await resolveUncertainClaims(claims, { ledger, research: async () => { called++; return { verdict: "confirmed" }; } });
  assert.equal(called, 0, "한 번도 부르지 않는다");
  assert.deepEqual(out, claims, "판정은 '확인되지 않음' 그대로 — 정직한 결과다");
});

test("총량이 남아 있으면 예전처럼 돈다", async () => {
  const ledger = newLedger();
  spend(ledger, 4);
  let called = 0;
  const out = await resolveUncertainClaims([uncertain("주장 A")], {
    ledger,
    research: async () => { called++; return { verdict: "confirmed", explanation: "찾았습니다", sources: [{ title: "a", url: "https://a" }] }; },
  });
  assert.equal(called, 1);
  assert.equal(out[0].verdict, "confirmed");
});
