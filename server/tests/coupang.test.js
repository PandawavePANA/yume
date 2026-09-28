// 쿠팡파트너스 — 키워드를 실제 상품과 파트너스 링크로 바꾸는 일.
//
// 쿠팡 검색 API는 1시간 10회다. 넘기면 24시간 동안 링크 생성까지 막히고, 세 번이면 파트너스
// 활동이 제한된다. 그래서 이 테스트의 중심은 "절대 한도를 넘겨 부르지 않는다"이다.
process.env.PGLITE_DIR = "memory://";
process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "test-key";
process.env.COUPANG_ACCESS_KEY = "test-access";
process.env.COUPANG_SECRET_KEY = "test-secret";

import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";

const db = await import("../db.js");
const { resolveProductLinks, searchProduct, SEARCH_PER_HOUR, _resetCoupangPause } = await import("../coupang.js");

before(() => db.ready);
after(() => db.closeDb());

const realFetch = globalThis.fetch;
let calls = [];
function mockCoupang({ products = true, status = 200 } = {}) {
  calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    calls.push({ url: u, method: init.method, auth: init.headers?.Authorization });
    if (status !== 200) return new Response("blocked", { status });
    if (u.includes("/products/search")) {
      const keyword = decodeURIComponent(new URL(u).searchParams.get("keyword"));
      return Response.json({
        rCode: "0",
        data: {
          landingUrl: `https://link.coupang.com/re/AFFSRP?lptag=AF1&pageKey=${encodeURIComponent(keyword)}`,
          productData: products
            ? [{ productId: 1, productName: `${keyword} 1위 상품`, productPrice: 32900, productImage: "https://img/1.jpg",
                productUrl: `https://link.coupang.com/re/AFFSDP?lptag=AF1&pageKey=1`, isRocket: true }]
            : [],
        },
      });
    }
    if (u.includes("/deeplink")) return Response.json({ rCode: "0", data: [{ shortenUrl: "https://link.coupang.com/a/deep" }] });
    return new Response("?", { status: 404 });
  };
}

beforeEach(async () => {
  globalThis.fetch = realFetch;
  _resetCoupangPause();
  await db.run("DELETE FROM coupang_products");
  await db.run("DELETE FROM usage_daily WHERE client_key LIKE 'coupang:%'");
});
after(() => { globalThis.fetch = realFetch; });

test("키워드 → 1위 상품과 그 상품의 파트너스 링크", async () => {
  mockCoupang();
  const [p] = await resolveProductLinks([{ keyword: "코카콜라", reason: "탄산음료" }]);
  assert.equal(p.isAffiliate, true);
  assert.match(p.url, /lptag=AF1/);
  assert.equal(p.product.name, "코카콜라 1위 상품");
  assert.equal(p.product.price, 32900);
  assert.equal(p.product.rocket, true);
  assert.match(p.moreUrl, /AFFSRP/);
  assert.equal(p.reason, "탄산음료");
  // 서명에는 쿼리 문자열까지 들어간다 — 빠지면 쿠팡이 401을 준다.
  assert.match(calls[0].auth, /^CEA algorithm=HmacSHA256, access-key=test-access, signed-date=\d{6}T\d{6}Z, signature=[0-9a-f]{64}$/);
});

test("같은 키워드는 하루 동안 다시 묻지 않는다 (대소문자·공백이 달라도)", async () => {
  mockCoupang();
  await searchProduct("비타민 C");
  await searchProduct("  비타민   c ");
  assert.equal(calls.length, 1);
});

test(`검색은 시간당 ${SEARCH_PER_HOUR}회에서 멈추고, 그다음은 검색 결과 페이지 딥링크로`, async () => {
  mockCoupang();
  const keywords = Array.from({ length: SEARCH_PER_HOUR + 3 }, (_, i) => `상품${i}`);
  const out = await resolveProductLinks(keywords.map((keyword) => ({ keyword, reason: "" })));
  const searches = calls.filter((c) => c.url.includes("/products/search")).length;
  assert.equal(searches, SEARCH_PER_HOUR, "쿠팡 한도(10)를 넘겨 부르면 24시간 차단");
  assert.ok(SEARCH_PER_HOUR < 10);
  // 한도 뒤의 것도 링크는 붙는다 — 추적되는 검색 페이지로.
  const tail = out.slice(SEARCH_PER_HOUR);
  assert.ok(tail.every((p) => p.isAffiliate && p.url === "https://link.coupang.com/a/deep" && p.product === null));
});

test("결과가 없는 키워드도 담아 두고, 추적되는 검색 페이지로 보낸다", async () => {
  mockCoupang({ products: false });
  const [p] = await resolveProductLinks([{ keyword: "없는상품", reason: "" }]);
  assert.equal(p.product, null);
  assert.match(p.url, /AFFSRP/);
  await searchProduct("없는상품");
  assert.equal(calls.filter((c) => c.url.includes("/products/search")).length, 1);
});

test("이미 풀어 둔 항목은 다시 묻지 않는다 (결과 페이지를 열 때마다 부르는 자리)", async () => {
  mockCoupang();
  const saved = { keyword: "x", reason: "", url: "https://link.coupang.com/a/old", isAffiliate: true, product: null };
  const [p] = await resolveProductLinks([saved]);
  assert.deepEqual(p, saved);
  assert.equal(calls.length, 0);
});

test("쿠팡이 막으면 한 시간 스스로 멈추고, 링크는 일반 검색으로 붙는다", async () => {
  mockCoupang({ status: 429 });
  const [p] = await resolveProductLinks([{ keyword: "막힘", reason: "" }]);
  assert.equal(p.isAffiliate, false);
  assert.equal(p.url, `https://www.coupang.com/np/search?q=${encodeURIComponent("막힘")}`);
  const n = calls.length;
  await resolveProductLinks([{ keyword: "다른것", reason: "" }]);
  assert.equal(calls.length, n, "차단된 동안 더 두드리면 위반이 쌓인다");
});

test("키가 없으면 부르지 않고 일반 검색 링크", async () => {
  mockCoupang();
  const a = process.env.COUPANG_ACCESS_KEY;
  delete process.env.COUPANG_ACCESS_KEY;
  try {
    const [p] = await resolveProductLinks([{ keyword: "키없음", reason: "" }]);
    assert.equal(p.isAffiliate, false);
    assert.equal(calls.length, 0);
  } finally {
    process.env.COUPANG_ACCESS_KEY = a;
  }
});
