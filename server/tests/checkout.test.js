// 크레딧 결제(포트원 V2)와 본인확인 테스트.
//
// 여기서 보는 것은 하나다 — **돈을 내지 않았는데 크레딧이 들어가는 경로가 있는가.**
// 결제창이 돌려주는 값은 고객 브라우저를 거치므로 금액을 바꿀 수 있다. 그래서 서버가
// 포트원에 직접 물어본 금액만 믿어야 하고, 금액이 다르거나 결제가 끝나지 않았으면
// 크레딧이 한 개도 들어가면 안 된다. 포트원 API는 부르지 않고 응답만 흉내 낸다.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yume-checkout-"));
process.env.DATA_DIR = dir;
process.env.PGLITE_DIR = "memory://";
delete process.env.DATABASE_URL;
process.env.ADMIN_SECRET = "test-admin-secret-0123";
// 결제·본인확인 연동이 켜진 상태로 띄운다(값은 흉내용).
process.env.VITE_PORTONE_STORE_ID = "store-test";
process.env.VITE_PORTONE_CHANNEL_KEY = "channel-test";
process.env.VITE_PORTONE_IDENTITY_CHANNEL_KEY = "channel-identity-test";
process.env.PORTONE_V2_API_SECRET = "secret-test";
process.env.CI_HASH_PEPPER = "pepper-test";
delete process.env.ANTHROPIC_API_KEY;

const { default: app } = await import("../app.js");
const db = await import("../db.js");
const credits = await import("../credits.js");

// 포트원 응답을 흉내 낸다. 테스트가 실제로 api.portone.io를 부르면 안 된다.
const realFetch = globalThis.fetch;
let portone = {};
globalThis.fetch = async (url, init) => {
  const u = String(url);
  if (u.startsWith("https://api.portone.io/")) {
    const key = u.includes("/identity-verifications/") ? "identity" : "payment";
    const body = portone[key];
    if (!body) return new Response(JSON.stringify({ message: "not found" }), { status: 404, headers: { "content-type": "application/json" } });
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  }
  return realFetch(url, init);
};

let server;
let base;
before(
  () =>
    new Promise((resolve) => {
      server = app.listen(0, "127.0.0.1", () => {
        base = `http://127.0.0.1:${server.address().port}`;
        resolve();
      });
    }),
);
after(async () => {
  globalThis.fetch = realFetch;
  server.close();
  await db.closeDb();
  fs.rmSync(dir, { recursive: true, force: true });
});

let seq = 0;
function client() {
  let cookie = "";
  const ip = `10.9.0.${(seq += 1)}`;
  return async function call(method, url, body) {
    const res = await realFetch(base + url, {
      method,
      headers: { "X-Forwarded-For": ip, ...(body ? { "Content-Type": "application/json" } : {}), ...(cookie ? { Cookie: cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    for (const c of res.headers.getSetCookie?.() || []) {
      const [pair] = c.split(";");
      cookie = pair.endsWith("=") ? "" : pair;
    }
    const type = res.headers.get("content-type") || "";
    return { status: res.status, data: type.includes("json") ? await res.json() : await res.text() };
  };
}

let userSeq = 0;
async function signedIn() {
  const call = client();
  const n = (userSeq += 1);
  const r = await call("POST", "/api/auth/signup", {
    email: `pay${n}-${Date.now()}@example.com`,
    password: "passw0rd!",
    nickname: `payer${n}${Date.now() % 100000}`,
    agreeTerms: true,
    agreePrivacy: true,
    agreeIdentity: true,
  });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return { call, userId: r.data.user.id };
}

const PACK = { key: "pack_20", credits: 20, krw: 12000 };

test("결제가 끝난 만큼만 크레딧이 들어간다", async () => {
  const { call, userId } = await signedIn();
  const before = await credits.balance(userId);

  const order = await call("POST", "/api/checkout", { packKey: PACK.key });
  assert.equal(order.status, 200);
  assert.equal(order.data.totalAmount, PACK.krw);
  assert.equal(order.data.storeId, "store-test");

  portone.payment = { status: "PAID", amount: { total: PACK.krw }, method: { type: "PaymentMethodCard", card: { name: "국민" } }, paidAt: "2026-09-20T00:00:00Z" };
  const done = await call("POST", "/api/checkout/confirm", { paymentId: order.data.paymentId });
  assert.equal(done.status, 200);
  assert.equal(done.data.credits, PACK.credits);
  assert.equal(await credits.balance(userId), before + PACK.credits);
});

test("같은 결제를 두 번 확인해도 크레딧은 한 번만 들어간다", async () => {
  const { call, userId } = await signedIn();
  const order = await call("POST", "/api/checkout", { packKey: PACK.key });
  portone.payment = { status: "PAID", amount: { total: PACK.krw }, method: { type: "CARD" } };
  await call("POST", "/api/checkout/confirm", { paymentId: order.data.paymentId });
  const after1 = await credits.balance(userId);
  const again = await call("POST", "/api/checkout/confirm", { paymentId: order.data.paymentId });
  assert.equal(again.status, 200);
  assert.equal(again.data.already, true);
  assert.equal(await credits.balance(userId), after1, "두 번째 확인으로 잔액이 늘면 안 된다");
});

test("결제 금액이 주문 금액과 다르면 한 개도 주지 않는다", async () => {
  const { call, userId } = await signedIn();
  const before = await credits.balance(userId);
  const order = await call("POST", "/api/checkout", { packKey: PACK.key });
  // 브라우저가 금액을 100원으로 바꿔 결제한 상황.
  portone.payment = { status: "PAID", amount: { total: 100 }, method: { type: "CARD" } };
  const r = await call("POST", "/api/checkout/confirm", { paymentId: order.data.paymentId });
  assert.equal(r.status, 400);
  assert.equal(r.data.code, "AMOUNT_MISMATCH");
  assert.equal(await credits.balance(userId), before);
});

test("가상계좌는 입금 전이라 크레딧을 주지 않는다", async () => {
  const { call, userId } = await signedIn();
  const before = await credits.balance(userId);
  const order = await call("POST", "/api/checkout", { packKey: PACK.key });
  portone.payment = { status: "VIRTUAL_ACCOUNT_ISSUED", amount: { total: PACK.krw } };
  const r = await call("POST", "/api/checkout/confirm", { paymentId: order.data.paymentId });
  assert.equal(r.status, 202);
  assert.equal(r.data.code, "AWAITING_DEPOSIT");
  assert.equal(await credits.balance(userId), before);
});

test("남의 주문은 확인할 수 없다", async () => {
  const a = await signedIn();
  const b = await signedIn();
  const order = await a.call("POST", "/api/checkout", { packKey: PACK.key });
  portone.payment = { status: "PAID", amount: { total: PACK.krw }, method: { type: "CARD" } };
  const stolen = await b.call("POST", "/api/checkout/confirm", { paymentId: order.data.paymentId });
  assert.equal(stolen.status, 404);
  assert.equal(await credits.balance(b.userId), 0);
});

test("본인확인은 포트원이 VERIFIED를 준 경우에만 통과한다", async () => {
  const { call } = await signedIn();
  const start = await call("POST", "/api/identity/start");
  assert.equal(start.status, 200);
  assert.ok(start.data.identityVerificationId);

  portone.identity = { status: "FAILED" };
  const failed = await call("POST", "/api/identity/confirm", { identityVerificationId: start.data.identityVerificationId });
  assert.equal(failed.status, 400);

  portone.identity = { status: "VERIFIED", verifiedCustomer: { ci: "CI-VALUE-1", name: "정원영", phoneNumber: "010-0000-0000" } };
  const ok = await call("POST", "/api/identity/confirm", { identityVerificationId: start.data.identityVerificationId });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.name, "정원영");
});

test("CI는 저장하지 않고 해시만 남는다", async () => {
  const { call, userId } = await signedIn();
  const start = await call("POST", "/api/identity/start");
  portone.identity = { status: "VERIFIED", verifiedCustomer: { ci: "CI-VALUE-2", name: "홍길동", phoneNumber: "01011112222" } };
  await call("POST", "/api/identity/confirm", { identityVerificationId: start.data.identityVerificationId });
  const row = await db.one("SELECT identity_ci_hash, identity_verified_at FROM users WHERE id = :id", { id: userId });
  assert.ok(row.identity_verified_at);
  assert.notEqual(row.identity_ci_hash, "CI-VALUE-2");
  assert.match(row.identity_ci_hash, /^[0-9a-f]{64}$/);
});

test("같은 사람(CI)이 다른 계정으로 인증하면 표시된다", async () => {
  const a = await signedIn();
  const b = await signedIn();
  portone.identity = { status: "VERIFIED", verifiedCustomer: { ci: "CI-SAME", name: "같은사람", phoneNumber: "01033334444" } };
  const sa = await a.call("POST", "/api/identity/start");
  const ra = await a.call("POST", "/api/identity/confirm", { identityVerificationId: sa.data.identityVerificationId });
  assert.equal(ra.data.duplicate, false);
  const sb = await b.call("POST", "/api/identity/start");
  const rb = await b.call("POST", "/api/identity/confirm", { identityVerificationId: sb.data.identityVerificationId });
  assert.equal(rb.data.duplicate, true);
});

test("로그인하지 않으면 결제도 본인확인도 시작할 수 없다", async () => {
  const call = client();
  assert.equal((await call("POST", "/api/checkout", { packKey: PACK.key })).status, 401);
  assert.equal((await call("POST", "/api/identity/start")).status, 401);
});
