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
import crypto from "node:crypto";

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
process.env.PORTONE_WEBHOOK_SECRET = "whsec_" + Buffer.from("test-webhook-secret-0123456789").toString("base64");
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

// ── 웹훅 ────────────────────────────────────────────────────────────────────
// 이 주소는 공개돼 있다. 서명을 확인하지 않으면 누구나 "결제됐다"고 보내 크레딧을 받아 간다.
// 서명은 포트원 공식 SDK(Standard Webhooks 규격)가 확인하므로, 여기서는 같은 규격으로 서명을
// 만들어 보내 "맞는 서명만 통과하는가"와 "통과했을 때 지급이 한 번만 되는가"를 본다.
function signWebhook(secret, id, timestamp, payload) {
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const sig = crypto.createHmac("sha256", key).update(`${id}.${timestamp}.${payload}`).digest("base64");
  return { "webhook-id": id, "webhook-timestamp": String(timestamp), "webhook-signature": `v1,${sig}` };
}

async function sendWebhook(body, { secret = process.env.PORTONE_WEBHOOK_SECRET, id = `msg_${Date.now()}` } = {}) {
  const payload = JSON.stringify(body);
  const ts = Math.floor(Date.now() / 1000);
  const res = await realFetch(`${base}/api/portone/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...signWebhook(secret, id, ts, payload) },
    body: payload,
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}

test("서명이 없거나 틀린 웹훅은 크레딧을 주지 않는다", async () => {
  const { call, userId } = await signedIn();
  const order = await call("POST", "/api/checkout", { packKey: PACK.key });
  portone.payment = { status: "PAID", amount: { total: PACK.krw }, method: { type: "CARD" } };

  const bare = await realFetch(`${base}/api/portone/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "Transaction.Paid", data: { paymentId: order.data.paymentId } }),
  });
  assert.equal(bare.status, 400, "서명 없는 요청은 거절해야 한다");

  const forged = await sendWebhook(
    { type: "Transaction.Paid", data: { paymentId: order.data.paymentId } },
    { secret: "whsec_" + Buffer.from("wrong-secret-value-0123456789").toString("base64") },
  );
  assert.equal(forged.status, 400, "다른 키로 만든 서명은 거절해야 한다");
  assert.equal(await credits.balance(userId), 0);
});

test("웹훅으로 입금이 확인되면 크레딧이 들어간다(가상계좌)", async () => {
  const { call, userId } = await signedIn();
  const order = await call("POST", "/api/checkout", { packKey: PACK.key });

  // 결제창에서 돌아온 시점엔 아직 입금 전이다 — 여기서는 주지 않는다.
  portone.payment = { status: "VIRTUAL_ACCOUNT_ISSUED", amount: { total: PACK.krw } };
  await call("POST", "/api/checkout/confirm", { paymentId: order.data.paymentId });
  assert.equal(await credits.balance(userId), 0);

  // 입금이 되면 포트원이 알려 준다.
  portone.payment = { status: "PAID", amount: { total: PACK.krw }, method: { type: "VIRTUAL_ACCOUNT" } };
  const hook = await sendWebhook({ type: "Transaction.Paid", data: { paymentId: order.data.paymentId } });
  assert.equal(hook.status, 200);
  assert.equal(await credits.balance(userId), PACK.credits);
});

test("웹훅과 화면 확인이 겹쳐도 크레딧은 한 번만 들어간다", async () => {
  const { call, userId } = await signedIn();
  const order = await call("POST", "/api/checkout", { packKey: PACK.key });
  portone.payment = { status: "PAID", amount: { total: PACK.krw }, method: { type: "CARD" } };
  await sendWebhook({ type: "Transaction.Paid", data: { paymentId: order.data.paymentId } });
  await call("POST", "/api/checkout/confirm", { paymentId: order.data.paymentId });
  await sendWebhook({ type: "Transaction.Paid", data: { paymentId: order.data.paymentId } });
  assert.equal(await credits.balance(userId), PACK.credits);
});

test("결제가 취소되면 지급했던 크레딧을 되돌린다", async () => {
  const { call, userId } = await signedIn();
  const order = await call("POST", "/api/checkout", { packKey: PACK.key });
  portone.payment = { status: "PAID", amount: { total: PACK.krw }, method: { type: "CARD" } };
  await call("POST", "/api/checkout/confirm", { paymentId: order.data.paymentId });
  assert.equal(await credits.balance(userId), PACK.credits);

  const cancel = await sendWebhook({ type: "Transaction.Cancelled", data: { paymentId: order.data.paymentId } });
  assert.equal(cancel.status, 200);
  assert.equal(await credits.balance(userId), 0);
  // 같은 취소가 두 번 와도 두 번 빼지 않는다.
  await sendWebhook({ type: "Transaction.Cancelled", data: { paymentId: order.data.paymentId } }, { id: "msg_again" });
  assert.equal(await credits.balance(userId), 0);
});

test("모르는 주문·모르는 이벤트는 조용히 넘어간다", async () => {
  const unknown = await sendWebhook({ type: "Transaction.Paid", data: { paymentId: "yume-does-not-exist" } });
  assert.equal(unknown.status, 200);
  const other = await sendWebhook({ type: "BillingKey.Issued", data: { billingKey: "bk_1" } });
  assert.equal(other.status, 200);
});

test("동의 항목 전에 가입한 회원도 그 자리에서 동의하고 본인확인할 수 있다", async () => {
  const { call, userId } = await signedIn();
  // 예전 가입자를 흉내 낸다 — 동의 시각이 비어 있는 상태.
  await db.run("UPDATE users SET identity_agreed_at = NULL WHERE id = :id", { id: userId });

  const blocked = await call("POST", "/api/identity/start");
  assert.equal(blocked.status, 400);
  assert.equal(blocked.data.code, "NEEDS_CONSENT", "동의 없이 인증창을 열어주면 안 된다");

  const start = await call("POST", "/api/identity/start", { agree: true });
  assert.equal(start.status, 200);
  const row = await db.one("SELECT identity_agreed_at FROM users WHERE id = :id", { id: userId });
  assert.ok(row.identity_agreed_at, "동의 시각이 남아야 한다");
});

// ── 요금제 1개월 이용권 ─────────────────────────────────────────────────────
// 크레딧과 같은 결제 경로를 쓰되, 지급되는 것이 크레딧이 아니라 기간이다.
test("요금제는 결제가 확인돼야 열리고, 기간은 30일이다", async () => {
  const { call, userId } = await signedIn();
  const order = await call("POST", "/api/checkout", { plan: "standard" });
  assert.equal(order.status, 200);
  assert.equal(order.data.totalAmount, 9900, "금액은 서버 plans.js가 정한다");

  // 결제 전에는 무료 그대로다.
  let u = await db.one("SELECT plan FROM users WHERE id = :id", { id: userId });
  assert.equal(u.plan, "free");

  portone.payment = { status: "PAID", amount: { total: 9900 }, method: { type: "CARD" } };
  const done = await call("POST", "/api/checkout/confirm", { paymentId: order.data.paymentId });
  assert.equal(done.status, 200);
  assert.equal(done.data.plan, "standard");

  u = await db.one("SELECT plan, plan_expires_at FROM users WHERE id = :id", { id: userId });
  assert.equal(u.plan, "standard");
  const days = (u.plan_expires_at - Date.now()) / (24 * 3600 * 1000);
  assert.ok(days > 29 && days < 31, `30일이어야 하는데 ${days.toFixed(1)}일`);
});

test("이미 있는 기간 뒤에 이어 붙는다", async () => {
  const { call, userId } = await signedIn();
  portone.payment = { status: "PAID", amount: { total: 9900 }, method: { type: "CARD" } };
  const first = await call("POST", "/api/checkout", { plan: "standard" });
  await call("POST", "/api/checkout/confirm", { paymentId: first.data.paymentId });
  const second = await call("POST", "/api/checkout", { plan: "standard" });
  await call("POST", "/api/checkout/confirm", { paymentId: second.data.paymentId });

  const u = await db.one("SELECT plan_expires_at FROM users WHERE id = :id", { id: userId });
  const days = (u.plan_expires_at - Date.now()) / (24 * 3600 * 1000);
  assert.ok(days > 59 && days < 61, `미리 산 기간이 날아가면 안 된다 — ${days.toFixed(1)}일`);
});

test("파는 요금제가 아니면 주문되지 않는다", async () => {
  const { call } = await signedIn();
  assert.equal((await call("POST", "/api/checkout", { plan: "business" })).status, 400, "비즈니스는 문의 상품이다");
  assert.equal((await call("POST", "/api/checkout", { plan: "free" })).status, 400);
  assert.equal((await call("POST", "/api/checkout", { plan: "nope" })).status, 400);
});

test("요금제 결제가 취소되면 늘려 준 기간을 도로 깎는다", async () => {
  const { call, userId } = await signedIn();
  portone.payment = { status: "PAID", amount: { total: 29000 }, method: { type: "CARD" } };
  const order = await call("POST", "/api/checkout", { plan: "expert" });
  await call("POST", "/api/checkout/confirm", { paymentId: order.data.paymentId });
  assert.equal((await db.one("SELECT plan FROM users WHERE id = :id", { id: userId })).plan, "expert");

  await sendWebhook({ type: "Transaction.Cancelled", data: { paymentId: order.data.paymentId } });
  const u = await db.one("SELECT plan, plan_expires_at FROM users WHERE id = :id", { id: userId });
  assert.equal(u.plan, "free", "30일짜리 한 번을 취소하면 요금제가 닫혀야 한다");
  assert.equal(u.plan_expires_at, null);
});
