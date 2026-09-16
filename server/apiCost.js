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

// cacheWrite는 캐시에 올릴 때 한 번 내는 값이다(1시간 TTL은 기본 입력의 2배).
// 읽을 때 1/10이라 금방 회수되지만, 계량에서 빼면 "아낀 것만 보이고 낸 것은 안 보이는"
// 장부가 된다.
export function costOf({ model, input = 0, output = 0, cachedInput = 0, cacheWrite = 0, searches = 0 }) {
  const p = PRICING[model] || DEFAULT_PRICE;
  return input * p.in + cachedInput * p.cachedIn + cacheWrite * p.in * 2 + output * p.out + searches * WEB_SEARCH_USD;
}

// 검증 한 건 동안의 호출을 모은다. 요청마다 새로 만들고, 끝나면 요약을 남긴다.
export function newLedger() {
  return { calls: [], startedAt: Date.now() };
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
      `토큰 in ${cost.input}(캐시 ${cost.cachedInput})/out ${cost.output} · ${Math.round(cost.elapsedMs / 100) / 10}s — ${parts}`,
  );
}
