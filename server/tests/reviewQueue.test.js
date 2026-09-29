// 운영자 검토함 — 유메 화면 안에서 바로 승인/반려하는 문.
//
// 왜 필요했나. 검토 화면은 /admin에 이미 있었는데 그쪽은 ADMIN_PASSWORD로 한 번 더
// 잠겨 있다. 그 값이 설정되기 전에는 문이 열리지 않아서, 사용자가 실제로 제보를 보냈는데
// 운영자가 확인할 방법이 없었다. 보상이 걸린 접수함을 아무도 못 여는 것은 그 자체로
// 사고다 — 보낸 사람은 기다리는데 우리는 보지도 못한다.
//
// 여기서 지켜야 할 것 셋.
//   ① 권한은 /api/admin/*와 똑같다. 문을 하나 더 냈다고 더 쉽게 열리면 안 된다.
//   ② 검토에 필요한 것만 나간다. 운영 통계나 남의 IP가 이 문으로 새면 안 된다.
//   ③ 반려 사유가 보낸 사람에게 그대로 전달된다. 이유를 모르면 같은 것을 또 보낸다.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yume-review-"));
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
const { POINTS } = await import("../contribution.js");

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

let seq = 0;
function client() {
  let cookie = "";
  const from = `10.7.0.${(seq += 1)}`;
  return async function call(method, url, body) {
    const res = await fetch(base + url, {
      method,
      headers: { "X-Forwarded-For": from, ...(body ? { "Content-Type": "application/json" } : {}), ...(cookie ? { Cookie: cookie } : {}) },
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

let nick = 0;
const signupBody = (email) => ({
  email, password: "passw0rd!", name: "테스터", nickname: `rev${++nick}`,
  agreeTerms: true, agreePrivacy: true, agreeIdentity: true, dataConsent: true,
});

async function signedUp(email) {
  const c = client();
  const r = await c("POST", "/api/auth/signup", signupBody(email));
  assert.equal(r.status, 201, JSON.stringify(r.data));
  // 제보·정정은 보상이 걸려 있어 본인확인을 마친 계정만 보낸다. 창 호출은 브라우저 몫이라 결과만 심는다.
  await db.run("UPDATE users SET identity_verified_at = :t WHERE id = :id", { t: Date.now(), id: r.data.user.id });
  return { c, id: r.data.user.id };
}

const necClaim = (caseNo) => ({
  text: `대법원 ${caseNo} 판결은 임차인에게 우선변제권을 인정했다`,
  domain: "법률", verdict: "false", verified_via: "nec", explanation: "존재하지 않는 사건번호", sources: [],
  nec: { score: 0.81, grade: "nonexistent", gradeLabel: "부존재 확실", identifier: { type: "case", value: caseNo, canonical: caseNo }, summary: "테스트" },
});

const wineClaim = {
  text: "이 와인은 Wine Enthusiast에서 88점을 받았다",
  domain: "일반", verdict: "false", verified_via: "web",
  explanation: "해당 리뷰를 확인할 수 없습니다.", sources: [{ title: "a", url: "https://a" }],
};

async function seed(id, userId, claims) {
  await store.createVerification({ id, source: "web", userId, clientKey: `user:${userId}`, input: `입력 ${id}`, dataConsent: true });
  await store.completeVerification(id, { overall_domain: "일반", claims, overall: { label: "x", tone: "false", detail: "t" }, related_products: [] });
}

test("로그인하지 않았거나 일반 회원이면 검토함이 열리지 않는다", async () => {
  assert.equal((await client()("GET", "/api/admin/queue")).status, 401);
  const { c } = await signedUp("plain@yume.test");
  assert.equal((await c("GET", "/api/admin/queue")).status, 401, "권한은 /api/admin/*와 똑같아야 한다");
});

test("접수된 제보와 정정이 검토함에 보인다", async () => {
  const { c, id: userId } = await signedUp("sender@yume.test");
  await seed("v-q-1", userId, [necClaim("2019다777771"), wineClaim]);

  const bounty = await c("POST", "/api/bounty", {
    verificationId: "v-q-1", claimIdx: 0, platform: "chatgpt",
    shareUrl: "https://chatgpt.com/share/q1", consent: true,
  });
  assert.equal(bounty.status, 201, JSON.stringify(bounty.data));

  const correction = await c("POST", "/api/corrections", {
    verificationId: "v-q-1", claimIdx: 1, correctVerdict: "confirmed",
    note: "2024년 10월호 지면에 88점으로 실려 있습니다.", consent: true,
  });
  assert.equal(correction.status, 201, JSON.stringify(correction.data));

  const admin = client();
  await admin("POST", "/api/auth/signup", signupBody("admin@yume.test"));
  const q = await admin("GET", "/api/admin/queue");
  assert.equal(q.status, 200);
  assert.equal(q.data.bounties.length, 1);
  assert.equal(q.data.corrections.length, 1);
  assert.equal(q.data.reportPoints, POINTS.report);
  assert.equal(q.data.correctionPoints, POINTS.correction);

  // 검토에 필요한 것은 있고
  const b = q.data.bounties[0];
  assert.equal(b.identifier, "2019다777771");
  assert.match(b.shareUrl, /chatgpt\.com/, "링크를 직접 열어봐야 승인할 수 있다");
  assert.ok(b.email, "누가 보냈는지");
  const cr = q.data.corrections[0];
  assert.equal(cr.yumeVerdict, "false");
  assert.equal(cr.correctVerdict, "confirmed");
  assert.match(cr.note, /10월호/);

  // 필요 없는 것은 나가지 않는다
  assert.equal(b.dedup_key, undefined);
  assert.equal(b.user_id, undefined);
  assert.equal(q.data.stats, undefined, "운영 통계는 이 문으로 나가지 않는다");
  assert.equal(q.data.referrals, undefined);
});

test("반려 사유가 보낸 사람에게 그대로 전달된다", async () => {
  const { c, id: userId } = await signedUp("rejected@yume.test");
  await seed("v-q-2", userId, [necClaim("2019다777772")]);
  const sent = await c("POST", "/api/bounty", {
    verificationId: "v-q-2", claimIdx: 0, platform: "chatgpt",
    shareUrl: "https://chatgpt.com/share/q2", consent: true,
  });
  assert.equal(sent.status, 201);

  const admin = client();
  await admin("POST", "/api/auth/login", { email: "admin@yume.test", password: "passw0rd!" });
  const reason = "공유 링크를 열어 봤지만 그 대화에 이 사건번호가 나오지 않았어요.";
  const r = await admin("POST", `/api/admin/bounties/${sent.data.bounty.id}/review`, { decision: "reject", note: reason });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.points, 0);

  const mine = (await c("GET", "/api/credits")).data.bounties;
  assert.equal(mine[0].status, "rejected");
  assert.equal(mine[0].reviewer_note, reason, "왜 안 됐는지 모르면 같은 것을 또 보낸다");
  assert.equal((await c("GET", "/api/contribution")).data.points, 0);

  // 처리한 건은 검토함에서 빠진다.
  const q = await admin("GET", "/api/admin/queue");
  assert.equal(q.data.bounties.find((b) => b.id === sent.data.bounty.id), undefined);
});

test("승인하면 그 자리에서 공헌도가 들어간다", async () => {
  const { c, id: userId } = await signedUp("approved@yume.test");
  await seed("v-q-3", userId, [necClaim("2019다777773")]);
  const sent = await c("POST", "/api/bounty", {
    verificationId: "v-q-3", claimIdx: 0, platform: "chatgpt",
    shareUrl: "https://chatgpt.com/share/q3", consent: true,
  });

  const admin = client();
  await admin("POST", "/api/auth/login", { email: "admin@yume.test", password: "passw0rd!" });
  const r = await admin("POST", `/api/admin/bounties/${sent.data.bounty.id}/review`, { decision: "approve", note: "링크에서 확인함" });
  assert.equal(r.status, 200);
  assert.equal(r.data.points, POINTS.report);
  assert.equal((await c("GET", "/api/contribution")).data.points, POINTS.report);
});
