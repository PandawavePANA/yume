import test from "node:test";
import assert from "node:assert/strict";
import { cacheKey, getCached, setCached, clearLawCache, cacheStats } from "../lawCache.js";

test("같은 요청은 같은 키, OC는 키에 들어가지 않는다", () => {
  // OC는 서버 전용 코드라 키에 섞이면 안 되고, 파라미터 순서가 달라도 같은 요청이다.
  const a = cacheKey("lawSearch.do", { OC: "secret", target: "law", query: "민법" });
  const b = cacheKey("lawSearch.do", { query: "민법", target: "law", OC: "other" });
  assert.equal(a, b);
  assert.ok(!a.includes("secret"));
});

test("찾은 응답은 오래, 못 찾은 응답은 짧게 들고 있는다", () => {
  // 못 찾음은 부존재 판정의 근거가 된다 — 오래된 것을 쓰면 새로 등록된 법령에
  // 없는 죄를 씌우게 된다.
  clearLawCache();
  const k1 = cacheKey("x", { a: 1 });
  const k2 = cacheKey("x", { a: 2 });
  setCached(k1, { ok: true, v: "found" }, { found: true });
  setCached(k2, { ok: true, v: "miss" }, { found: false });
  assert.equal(getCached(k1).v, "found");
  assert.equal(getCached(k2).v, "miss");
});

test("키에 한국 날짜가 들어간다", () => {
  // 법령 개정은 시행일 0시에 적용되므로, 날짜가 바뀌면 캐시가 통째로 무효가 돼야 한다.
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  assert.ok(cacheKey("lawSearch.do", { query: "민법" }).startsWith(kst));
});

test("없는 키는 null", () => {
  clearLawCache();
  assert.equal(getCached(cacheKey("nope", {})), null);
});

test("상한을 넘으면 오래된 것부터 버린다", () => {
  clearLawCache();
  const { max } = cacheStats();
  for (let i = 0; i < max + 50; i += 1) setCached(cacheKey("x", { i }), { ok: true, i });
  assert.ok(cacheStats().entries <= max, "무한히 쌓이면 안 된다");
});
