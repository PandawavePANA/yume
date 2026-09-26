// Claude API 비용 계량.
//
// 크레딧이 빨리 닳는다는 건 알겠는데 어디서 닳는지는 아무도 모르는 상태였다. 검증 한
// 건이 Claude를 몇 번 부르고 웹 검색을 몇 번 돌리는지 세지 않으면, 무엇을 줄여야 하는지도
// 추측이 된다. 그래서 호출마다 토큰과 검색 횟수를 모아 검증 단위로 합산한다.
//
// 가장 중요한 건 웹 검색이다. 검색은 건당 과금이고($10/1,000회) 결과가 대화에 그대로
// 쌓여서 다음 턴의 입력 토큰까지 부풀린다 — 한 번 더 검색하면 두 번 비싸진다.

// 2026년 9월 기준 공개 단가(USD). 값이 바뀌면 여기만 고친다.
const PRICING = {
  "claude-sonnet-5": { in: 3 / 1e6, out: 15 / 1e6, cachedIn: 0.3 / 1e6 },
  "claude-opus-5": { in: 15 / 1e6, out: 75 / 1e6, cachedIn: 1.5 / 1e6 },
  "claude-haiku-4-5-20251001": { in: 1 / 1e6, out: 5 / 1e6, cachedIn: 0.1 / 1e6 },
};
const WEB_SEARCH_USD = 10 / 1000;
const DEFAULT_PRICE = PRICING["claude-sonnet-5"];

// cacheWrite는 캐시에 올릴 때 내는 값이다. 5분 TTL은 입력의 1.25배, 1시간은 2배.
// 읽을 때 1/10이라 금방 회수되지만, 계량에서 빼면 "아낀 것만 보이고 낸 것은 안 보이는"
// 장부가 된다 — 실제로 이 값을 안 보다가 TTL을 잘못 올린 적이 있다.
const CACHE_WRITE_MULTIPLIER = 1.25;
export function costOf({ model, input = 0, output = 0, cachedInput = 0, cacheWrite = 0, searches = 0 }) {
  const p = PRICING[model] || DEFAULT_PRICE;
  return input * p.in + cachedInput * p.cachedIn + cacheWrite * p.in * CACHE_WRITE_MULTIPLIER + output * p.out + searches * WEB_SEARCH_USD;
}

// 검증 한 건이 쓸 수 있는 웹검색 총량.
//
// 실측으로 검색 1회가 약 $0.054(75원)다. 검색 수수료 자체는 $0.01인데, 결과가 대화에
// 그대로 쌓여 그다음 턴의 입력·캐시 토큰까지 함께 부풀리기 때문에 5배가 넘는다.
// 그래서 "몇 번 검색했나"가 사실상 원가 그 자체다.
//
// 문제는 그 횟수에 천장이 없었다는 것이다. 단계마다 상한은 있었지만(추출 6, 리서치 3,
// 지목 재확인 2) 리서치는 **결론이 안 난 주장마다** 도니까, 주장 7개짜리 답변에서
// 6개가 미결이면 그 단계에서만 18회를 쓴다. 검증 한 건이 1달러를 넘을 수 있고,
// 그 한 건이 스탠다드 한 달 요금의 15%다.
//
// 그래서 단계별 상한 대신 **검증 한 건이 쓸 총량**을 정한다. 실측한 13건이 0~8회를
// 썼으니 12면 정상 검증은 건드리지 않고 꼬리만 자른다. 남은 양을 각 단계가 물어보고
// 자기 몫을 정하므로, 앞에서 덜 썼으면 뒤에서 더 쓸 수 있다 — 단계별 상한보다
// 필요한 곳에 쓰인다.
export const SEARCH_BUDGET = 12;

// 검증 한 건 동안의 호출을 모은다. 요청마다 새로 만들고, 끝나면 요약을 남긴다.
export function newLedger({ searchBudget = SEARCH_BUDGET } = {}) {
  return { calls: [], startedAt: Date.now(), searchBudget };
}

/** 이 검증에서 아직 쓸 수 있는 검색 횟수. 장부가 없으면 제한하지 않는다(단위 테스트·단발 호출). */
export function searchesLeft(ledger) {
  if (!ledger) return Infinity;
  const used = ledger.calls.reduce((n, c) => n + (c.searches || 0), 0);
  return Math.max(0, (ledger.searchBudget ?? SEARCH_BUDGET) - used);
}

export function record(ledger, { label, model, usage }) {
  if (!ledger) return;
  const input = Number(usage?.input_tokens) || 0;
  const cachedInput = Number(usage?.cache_read_input_tokens) || 0;
  const cacheWrite = Number(usage?.cache_creation_input_tokens) || 0;
  const output = Number(usage?.output_tokens) || 0;
  const searches = Number(usage?.server_tool_use?.web_search_requests) || 0;
  ledger.calls.push({ label, model, input, cachedInput, cacheWrite, output, searches, usd: costOf({ model, input, output, cachedInput, cacheWrite, searches }) });
}

export function summarize(ledger) {
  if (!ledger?.calls.length) return null;
  const sum = (k) => ledger.calls.reduce((n, c) => n + c[k], 0);
  return {
    calls: ledger.calls.length,
    input: sum("input"),
    cachedInput: sum("cachedInput"),
    cacheWrite: sum("cacheWrite"),
    output: sum("output"),
    searches: sum("searches"),
    usd: Math.round(sum("usd") * 10000) / 10000,
    elapsedMs: Date.now() - ledger.startedAt,
    byLabel: ledger.calls.reduce((acc, c) => {
      const e = (acc[c.label] ||= { calls: 0, searches: 0, usd: 0 });
      e.calls += 1;
      e.searches += c.searches;
      e.usd = Math.round((e.usd + c.usd) * 10000) / 10000;
      return acc;
    }, {}),
  };
}

// 검증 한 건의 원가를 한 줄로 남긴다. 사용자에게는 나가지 않는다 — 운영 지표다.
// 어디서 돈이 나가는지는 "검색 몇 회"가 제일 잘 말해주므로 그것부터 적는다.
export function logApiCost(id, source, cost) {
  const parts = Object.entries(cost.byLabel)
    .sort((a, b) => b[1].usd - a[1].usd)
    .map(([k, v]) => `${k} ${v.calls}회${v.searches ? `/검색${v.searches}` : ""} $${v.usd}`)
    .join(" · ");
  console.log(
    `[cost] ${source}:${id} $${cost.usd} · 검색 ${cost.searches}회 · 호출 ${cost.calls}회` +
      `${cost.reusedClaims ? ` · 캐시 재사용 ${cost.reusedClaims}건` : ""} · ` +
      `토큰 in ${cost.input}/캐시읽기 ${cost.cachedInput}/캐시쓰기 ${cost.cacheWrite}/out ${cost.output} · ${Math.round(cost.elapsedMs / 100) / 10}s — ${parts}`,
  );
}

// 검증 행이 없는 호출의 원가를 남긴다(캡처 읽기 등).
//
// verifications.cost_usd는 검증 한 건에 붙는 값이라, 검증이 생기기 전에 나가는 돈은
// 거기 실을 자리가 없다. 로그로만 두면 원가를 깎으려고 만든 장부에서 새 항목이 빠진다.
//
// 실패해도 삼킨다 — 사용자는 이미 답을 받았고, 지표 한 줄 때문에 그걸 오류로 만들 수 없다.
export async function recordOpsCost(kind, userId, cost) {
  if (!cost) return;
  const { run, now } = await import("./db.js");
  await run(
    `INSERT INTO api_costs (kind, user_id, cost_usd, calls, searches, created_at)
     VALUES (:kind, :uid, :usd, :calls, :searches, :t)`,
    {
      kind: String(kind).slice(0, 40),
      uid: userId || null,
      usd: Number(cost.usd) || 0,
      calls: Number(cost.calls) || 0,
      searches: Number(cost.searches) || 0,
      t: now(),
    },
  ).catch(() => {});
}
