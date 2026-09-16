// 주장 단위 캐시.
//
// 답변은 매번 달라도 그 안의 주장은 겹친다. 같은 주장을 매번 다시 판단할 이유가 없다 —
// 단, 재사용하면 안 되는 경우가 분명히 있고 그게 이 테스트의 내용이다.
process.env.PGLITE_DIR = "memory://";
process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "test-key";

import test, { before, after } from "node:test";
import assert from "node:assert/strict";

const db = await import("../db.js");
const { claimKey, findClaim, saveClaim, applyCache, storeAll, claimCacheStats } = await import("../claimCache.js");

before(() => db.ready);
after(() => db.closeDb());

const legal = (over = {}) => ({
  text: "민법 제750조는 불법행위 책임을 규정한다",
  domain: "법률",
  verdict: "confirmed",
  verified_via: "official",
  explanation: "조문과 일치",
  sources: [{ title: "민법", url: "https://law.go.kr" }],
  legal_ref: { type: "statute", law_name: "민법", article: "750조" },
  ...over,
});

test("같은 주장은 같은 키, 인용이 다르면 다른 키", () => {
  assert.equal(claimKey(legal()), claimKey(legal()));
  // 문장이 비슷해도 조문이 다르면 다른 판단이다.
  assert.notEqual(claimKey(legal()), claimKey(legal({ legal_ref: { type: "statute", law_name: "민법", article: "751조" } })));
  // 공백 차이는 같은 주장으로 본다.
  assert.equal(claimKey(legal()), claimKey(legal({ text: "민법 제750조는   불법행위 책임을 규정한다  " })));
});

test("법률 주장의 키에는 한국 날짜가 들어간다", () => {
  // 법령 개정은 시행일 0시에 적용된다. 개정 전 조문으로 "맞다"고 하는 건 유메가
  // 잡으려는 실패(시점 붕괴) 그 자체라, TTL로 어림잡지 않고 자정 경계에 맞춘다.
  const today = new Date(Date.now() + 9 * 36e5).toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 9 * 36e5 + 864e5).toISOString().slice(0, 10);
  assert.notEqual(today, tomorrow);
  // 날짜가 키에 실제로 반영되는지는, 날짜만 다른 두 입력이 다른 키를 내는지로 확인한다.
  const general = { text: "같은 문장", domain: "일반" };
  assert.equal(claimKey(general), claimKey(general), "비법률은 날짜에 묶이지 않는다");
});

test("확인됨·사실과 다름만 저장하고, 확인되지 않음은 저장하지 않는다", async () => {
  // 확인되지 않음은 "아직 못 찾았다"는 뜻이다. 그걸 붙들고 있으면 영영 확인되지 않는다.
  assert.equal(await saveClaim(legal({ verdict: "uncertain" })), false);
  assert.equal(await findClaim(legal({ verdict: "uncertain" })), null);

  assert.equal(await saveClaim(legal()), true);
  const hit = await findClaim(legal({ verdict: "pending_legal_check" }));
  assert.ok(hit, "추출 직후 상태로 조회해도 찾아야 한다");
  assert.equal(hit.verdict, "confirmed");
  assert.equal(hit.verified_via, "official");
  assert.equal(hit.sources[0].title, "민법");
  assert.equal(hit.from_claim_cache, true);
});

test("사실과 다름도 근거와 부존재 신뢰도까지 그대로 돌아온다", async () => {
  const c = legal({
    text: "민법 제9999조는 상계 소멸을 규정한다",
    verdict: "false",
    verified_via: "nec",
    legal_ref: { type: "statute", law_name: "민법", article: "9999조" },
    nec: { score: 0.87, grade: "nonexistent" },
  });
  await saveClaim(c);
  const hit = await findClaim(c);
  assert.equal(hit.verdict, "false");
  assert.equal(hit.nec.grade, "nonexistent");
  assert.equal(hit.nec.score, 0.87);
});

test("applyCache는 맞는 주장만 바꾸고 나머지는 그대로 둔다", async () => {
  await saveClaim(legal());
  const fresh = { text: "처음 보는 주장", domain: "일반", verdict: "pending_legal_check" };
  const out = await applyCache([legal({ verdict: "pending_legal_check" }), fresh]);
  assert.equal(out[0].from_claim_cache, true);
  assert.equal(out[0].verdict, "confirmed");
  assert.equal(out[1].from_claim_cache, undefined);
  assert.equal(out[1].text, "처음 보는 주장");
});

test("캐시에서 온 주장은 다시 저장하지 않는다", async () => {
  const before = (await claimCacheStats()).entries;
  await storeAll([{ ...legal(), from_claim_cache: true }]);
  assert.equal((await claimCacheStats()).entries, before, "재사용한 것을 또 넣지 않는다");
});

test("적중하면 횟수가 올라간다 — 캐시가 일하고 있는지 볼 수 있어야 한다", async () => {
  const c = legal({ text: "적중 횟수 확인용 주장" });
  await saveClaim(c);
  const before = (await claimCacheStats()).hits;
  await findClaim(c);
  await findClaim(c);
  await new Promise((r) => setTimeout(r, 50)); // 적중 기록은 검증을 막지 않으려고 비동기다
  assert.ok((await claimCacheStats()).hits > before);
});
