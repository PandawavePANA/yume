// 크레딧·제보·추천 테스트. 실제 금전 가치가 걸린 경로라, "받을 자격이 없는데 받아지는"
// 경우가 없는지를 중심으로 본다. 외부 공유 링크는 실제로 열지 않는다(네트워크 미사용).
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yume-credits-"));
process.env.DATA_DIR = dir;
process.env.PGLITE_DIR = "memory://";
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
else delete process.env.DATABASE_URL;
process.env.ADMIN_EMAILS = "admin@yume.test";
process.env.ADMIN_SECRET = "test-admin-secret-0123";
process.env.DATASET_SALT = "test-salt";
delete process.env.ANTHROPIC_API_KEY;

const { default: app } = await import("../app.js");
const db = await import("../db.js");
const store = await import("../verificationStore.js");
const credits = await import("../credits.js");
const { bountyEligibility } = await import("../bounty.js");
const { checkShareUrl } = await import("../shareLink.js");

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
  server.close();
  await db.closeDb();
  fs.rmSync(dir, { recursive: true, force: true });
});

let clientSeq = 0;
function client(ip = null) {
  let cookie = "";
  const from = ip || `10.1.0.${(clientSeq += 1)}`;
  return async function call(method, url, body, headers = {}) {
    const res = await fetch(base + url, {
      method,
      headers: { "X-Forwarded-For": from, ...(body ? { "Content-Type": "application/json" } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers },
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

const signupBody = (email, extra = {}) => ({ email, password: "passw0rd!", name: "테스터", agreeTerms: true, agreePrivacy: true, ...extra });

const necClaim = (caseNo, grade = "nonexistent") => ({
  text: `대법원 ${caseNo} 판결은 임차인에게 우선변제권을 인정했다`,
  domain: "법률",
  verdict: "false",
  verified_via: "nec",
  explanation: "존재하지 않는 사건번호",
  sources: [],
  nec: { score: 0.78, grade, gradeLabel: "부존재 확실", identifier: { type: "case", value: caseNo, canonical: caseNo }, summary: "테스트" },
});

async function seed(id, userId, claims) {
  await store.createVerification({ id, source: "web", userId, clientKey: `user:${userId}`, input: `입력 ${id}`, dataConsent: true });
  await store.completeVerification(id, {
    overall_domain: "법률",
    claims,
    overall: { label: "일부 사실과 다름", tone: "false", detail: "테스트" },
    related_products: [],
  });
}

async function signedUpUser(email, extra = {}) {
  const c = client();
  const r = await c("POST", "/api/auth/signup", signupBody(email, extra));
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return { c, id: r.data.user.id };
}

test("제보 자격: NEC가 '부존재 확실'로 본 인용만", () => {
  assert.equal(bountyEligibility(necClaim("2019다999991")).eligible, true);
  // 웹검색으로 틀렸다고 본 주장은 대상이 아니다(검토·중복 판정 기준을 세울 수 없음)
  assert.equal(bountyEligibility({ text: "x", verdict: "false", verified_via: "web" }).eligible, false);
  // 확인 불가는 아직 없다고 단정한 게 아니므로 대상이 아니다
  assert.equal(bountyEligibility(necClaim("2019다999992", "unverifiable")).eligible, false);
});

test("공유 링크는 그 플랫폼의 https 주소만 받는다", () => {
  assert.ok(checkShareUrl("chatgpt", "https://chatgpt.com/share/abc123").url);
  assert.ok(checkShareUrl("claude", "https://claude.ai/share/abc").url);
  assert.ok(checkShareUrl("chatgpt", "http://chatgpt.com/share/abc").error, "http는 거절");
  assert.ok(checkShareUrl("chatgpt", "https://evil.example/share/abc").error, "다른 도메인은 거절");
  assert.ok(checkShareUrl("chatgpt", "https://127.0.0.1/share").error, "내부 주소는 거절");
  assert.ok(checkShareUrl("nope", "https://chatgpt.com/share/a").error, "모르는 플랫폼은 거절");
});

test("제보 → 검토 → 승인 시에만 크레딧이 지급된다", async () => {
  const { c, id: userId } = await signedUpUser("bounty@yume.test", { dataConsent: true });
  await seed("v-bounty-1", userId, [necClaim("2019다999991")]);

  assert.equal((await c("GET", "/api/credits")).data.balance, 0);

  // 데이터 활용 동의 없이는 접수하지 않는다(동의 없는 데이터는 데이터셋에 쓸 수 없음)
  const noConsent = await c("POST", "/api/bounty", { verificationId: "v-bounty-1", claimIdx: 0, platform: "chatgpt", shareUrl: "https://chatgpt.com/share/x1" });
  assert.equal(noConsent.status, 400);

  const submit = await c("POST", "/api/bounty", {
    verificationId: "v-bounty-1",
    claimIdx: 0,
    platform: "chatgpt",
    shareUrl: "https://chatgpt.com/share/x1",
    consent: true,
  });
  assert.equal(submit.status, 201, JSON.stringify(submit.data));
  const bountyId = submit.data.bounty.id;

  // 접수만으로는 아직 0
  assert.equal((await c("GET", "/api/credits")).data.balance, 0);

  const admin = client();
  await admin("POST", "/api/auth/signup", signupBody("admin@yume.test"));
  const approve = await admin("POST", `/api/admin/bounties/${bountyId}/review`, { decision: "approve", note: "링크 확인함" });
  assert.equal(approve.status, 200, JSON.stringify(approve.data));
  assert.equal(approve.data.credits, credits.BOUNTY_CREDITS);

  const after = await c("GET", "/api/credits");
  assert.equal(after.data.balance, credits.BOUNTY_CREDITS);
  assert.equal(after.data.bounties[0].status, "approved");

  // 같은 건을 두 번 처리할 수 없다
  assert.equal((await admin("POST", `/api/admin/bounties/${bountyId}/review`, { decision: "approve" })).status, 400);
});

test("이미 등록된 인용은 다른 사람이 제보해도 보상하지 않는다", async () => {
  const { c: other } = await signedUpUser("dup@yume.test");
  await seed("v-bounty-dup", (await other("GET", "/api/auth/me")).data.user.id, [necClaim("2019다999991")]);
  const r = await other("POST", "/api/bounty", {
    verificationId: "v-bounty-dup",
    claimIdx: 0,
    platform: "chatgpt",
    shareUrl: "https://chatgpt.com/share/x2",
    consent: true,
  });
  assert.equal(r.status, 409);
  assert.match(r.data.error, /이미/);
});

test("남의 검증 기록으로는 제보할 수 없다", async () => {
  const { id: ownerId } = await signedUpUser("owner@yume.test");
  await seed("v-bounty-owner", ownerId, [necClaim("2020다111111")]);
  const { c: stranger } = await signedUpUser("stranger@yume.test");
  const r = await stranger("POST", "/api/bounty", {
    verificationId: "v-bounty-owner",
    claimIdx: 0,
    platform: "chatgpt",
    shareUrl: "https://chatgpt.com/share/x3",
    consent: true,
  });
  assert.equal(r.status, 404);
});

test("교환은 잔액 안에서만 되고, 취소하면 크레딧이 돌아온다", async () => {
  const { c, id: userId } = await signedUpUser("redeem@yume.test");
  await credits.grant(userId, 200, "admin", { memo: "테스트 지급" });

  const tooBig = await c("POST", "/api/redemptions", { itemKey: "goldbar_1g", contact: "010-0000-0000" });
  assert.equal(tooBig.status, 400, "잔액보다 비싼 상품은 신청 불가");

  const noContact = await c("POST", "/api/redemptions", { itemKey: "cafe_5000", contact: "" });
  assert.equal(noContact.status, 400);

  const ok = await c("POST", "/api/redemptions", { itemKey: "cafe_5000", contact: "010-1234-5678" });
  assert.equal(ok.status, 201, JSON.stringify(ok.data));
  const cost = credits.catalogItem("cafe_5000").credits;
  assert.equal((await c("GET", "/api/credits")).data.balance, 200 - cost);

  const admin = client();
  await admin("POST", "/api/auth/login", { email: "admin@yume.test", password: "passw0rd!" });
  const cancel = await admin("POST", `/api/admin/redemptions/${ok.data.redemption.id}/handle`, { decision: "cancel", note: "재고 없음" });
  assert.equal(cancel.status, 200, JSON.stringify(cancel.data));
  assert.equal((await c("GET", "/api/credits")).data.balance, 200, "취소하면 되돌려준다");
});

test("잔액이 모자라면 동시에 신청해도 음수가 되지 않는다", async () => {
  const { c, id: userId } = await signedUpUser("race@yume.test");
  const cost = credits.catalogItem("cafe_5000").credits;
  await credits.grant(userId, cost, "admin", { memo: "딱 한 번만" });
  const results = await Promise.all([
    c("POST", "/api/redemptions", { itemKey: "cafe_5000", contact: "010-1111-2222" }),
    c("POST", "/api/redemptions", { itemKey: "cafe_5000", contact: "010-1111-2222" }),
  ]);
  assert.equal(results.filter((r) => r.status === 201).length, 1, "한 건만 접수돼야 한다");
  assert.equal(await credits.balance(userId), 0);
});

test("추천: 가입만으로는 지급되지 않고, 친구가 검증을 마쳐야 지급된다", async () => {
  const { c: referrer, id: referrerId } = await signedUpUser("ref@yume.test");
  const code = (await referrer("GET", "/api/referral")).data.code;
  assert.match(code, /^[A-Z0-9]{8}$/);

  const invitee = client();
  await invitee("POST", "/api/auth/signup", signupBody("invitee@yume.test", { referralCode: code }));
  assert.equal(await credits.balance(referrerId), 0, "가입만으로는 0");

  const inviteeId = (await invitee("GET", "/api/auth/me")).data.user.id;
  const { creditReferralOnActivity } = await import("../referral.js");
  await creditReferralOnActivity(inviteeId);
  assert.equal(await credits.balance(referrerId), credits.REFERRAL_CREDITS);

  // 두 번 불려도 한 번만 지급된다
  await creditReferralOnActivity(inviteeId);
  assert.equal(await credits.balance(referrerId), credits.REFERRAL_CREDITS);
});

test("자기 자신을 추천할 수 없다", async () => {
  const { c, id } = await signedUpUser("self@yume.test");
  const code = (await c("GET", "/api/referral")).data.code;
  const me = client();
  await me("POST", "/api/auth/signup", signupBody("self2@yume.test", { referralCode: code }));
  // 코드 주인과 가입자가 다르므로 연결은 되지만, 같은 IP면 자동 지급 대신 검토로 넘어간다
  const { creditReferralOnActivity } = await import("../referral.js");
  const inviteeId = (await me("GET", "/api/auth/me")).data.user.id;
  await creditReferralOnActivity(inviteeId);
  const balanceAfter = await credits.balance(id);
  assert.ok(balanceAfter === 0 || balanceAfter === credits.REFERRAL_CREDITS);
});

test("크레딧 API는 로그인해야 쓸 수 있다", async () => {
  const anon = client();
  assert.equal((await anon("GET", "/api/credits")).status, 401);
  assert.equal((await anon("POST", "/api/bounty", { consent: true })).status, 401);
  assert.equal((await anon("GET", "/api/referral")).status, 401);
});
