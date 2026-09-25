// 판정 정정 — 유메가 틀렸다고 알려주는 문.
//
// 왜 이 문을 만들었는지가 곧 이 테스트가 지켜야 할 것이다. 어떤 사용자가 와인 평점 주장을
// 검증했더니 유메가 "사실과 다름"을 붙였는데, 대충 검색해도 그 평점은 실재했다. 그런데
// 그 사실을 우리에게 알릴 방법이 화면에 없었다.
//
// 그래서 가장 중요한 두 가지는 이것이다.
//   ① 어떤 판정이든 정정을 받을 수 있어야 한다("사실과 다름"뿐이 아니다).
//   ② 채택하면 그 주장의 캐시가 지워져야 한다. 안 지우면 같은 주장이 다음 검증에서
//      같은 틀린 판정으로 또 나가고, 고쳤다는 말이 거짓이 된다.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yume-correction-"));
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
const cache = await import("../claimCache.js");
const { correctionEligibility } = await import("../corrections.js");
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

let clientSeq = 0;
function client(ip = null) {
  let cookie = "";
  const from = ip || `10.4.0.${(clientSeq += 1)}`;
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

let nickSeq = 0;
const signupBody = (email) => ({
  email,
  password: "passw0rd!",
  name: "테스터",
  nickname: `fixer${++nickSeq}`,
  agreeTerms: true,
  agreePrivacy: true,
  agreeIdentity: true,
  dataConsent: true,
});

// 사용자가 실제로 겪은 그 주장. 평점은 실재했는데 유메가 "사실과 다름"을 붙였다.
const wineClaim = () => ({
  text: "이 와인은 Wine Enthusiast에서 88점을 받았다",
  domain: "일반",
  verdict: "false",
  verified_via: "web",
  explanation: "Wine Enthusiast 데이터베이스에서 해당 리뷰를 확인할 수 없습니다.",
  sources: [{ title: "Wine Enthusiast", url: "https://www.wineenthusiast.com" }],
});

async function seed(id, userId, claims) {
  await store.createVerification({ id, source: "web", userId, clientKey: `user:${userId}`, input: `입력 ${id}`, dataConsent: true });
  await store.completeVerification(id, {
    overall_domain: "일반",
    claims,
    overall: { label: "일부 사실과 다름", tone: "false", detail: "테스트" },
    related_products: [],
  });
}

async function signedUpUser(email) {
  const c = client();
  const r = await c("POST", "/api/auth/signup", signupBody(email));
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return { c, id: r.data.user.id };
}

async function adminClient() {
  const admin = client();
  const r = await admin("POST", "/api/auth/signup", signupBody("admin@yume.test"));
  if (r.status !== 201) await admin("POST", "/api/auth/login", { email: "admin@yume.test", password: "passw0rd!" });
  return admin;
}

test("정정 대상: 판정이 붙은 주장이면 모두", () => {
  // 제보(bounty)는 NEC '부존재 확실'만 받는다. 정정은 그렇게 좁힐 수 없다 — 우리가
  // 틀리는 자리를 우리가 미리 고를 수 있다면 애초에 이 문이 필요 없다.
  assert.equal(correctionEligibility(wineClaim()).eligible, true);
  assert.equal(correctionEligibility({ text: "x", verdict: "confirmed" }).eligible, true, "맞다고 한 것이 틀렸을 때가 더 위험하다");
  assert.equal(correctionEligibility({ text: "x", verdict: "uncertain" }).eligible, true);
  assert.equal(correctionEligibility({ text: "x", verdict: "pending_legal_check" }).eligible, false, "아직 판정이 없다");
  assert.equal(correctionEligibility(null).eligible, false);
});

test("정정 → 검토 → 채택에서만 공헌도가 지급된다", async () => {
  const { c, id: userId } = await signedUpUser("fix1@yume.test");
  await seed("v-fix-1", userId, [wineClaim()]);
  assert.equal((await c("GET", "/api/contribution")).data.points, 0);

  const body = {
    verificationId: "v-fix-1",
    claimIdx: 0,
    correctVerdict: "confirmed",
    evidenceUrl: "https://www.wineenthusiast.com/buying-guide/example",
    note: "Wine Enthusiast 2024년 10월호에 88점으로 실려 있습니다. 검색에는 안 걸립니다.",
  };

  // 활용 동의 없이는 접수하지 않는다.
  assert.equal((await c("POST", "/api/corrections", body)).status, 400);

  const sent = await c("POST", "/api/corrections", { ...body, consent: true });
  assert.equal(sent.status, 201, JSON.stringify(sent.data));
  const id = sent.data.correction.id;

  // 제출만으로는 0점이다. 제출에 점수를 주면 아무 글이나 넣는 게 최적 전략이 된다.
  assert.equal((await c("GET", "/api/contribution")).data.points, 0);

  const admin = await adminClient();
  const accepted = await admin("POST", `/api/admin/corrections/${id}/review`, { decision: "accept", note: "근거에서 88점 확인" });
  assert.equal(accepted.status, 200, JSON.stringify(accepted.data));
  assert.equal(accepted.data.points, POINTS.correction);

  assert.equal((await c("GET", "/api/contribution")).data.points, POINTS.correction);
  // 같은 건을 두 번 처리해 두 번 지급할 수는 없다.
  assert.equal((await admin("POST", `/api/admin/corrections/${id}/review`, { decision: "accept" })).status, 400);
});

test("채택하면 그 주장의 캐시가 지워진다", async () => {
  // 이게 없으면 정정은 기록으로만 남고, 다음 사람은 같은 틀린 판정을 받는다.
  const { c, id: userId } = await signedUpUser("fix2@yume.test");
  const claim = { ...wineClaim(), text: "이 와인은 James Suckling에서 92점을 받았다" };
  await seed("v-fix-2", userId, [claim]);

  await cache.saveClaim(claim);
  assert.ok(await cache.findClaim(claim), "먼저 캐시에 들어 있어야 의미 있는 검사다");

  const sent = await c("POST", "/api/corrections", {
    verificationId: "v-fix-2",
    claimIdx: 0,
    correctVerdict: "confirmed",
    note: "James Suckling 구독자 페이지에서 92점으로 확인됩니다.",
    consent: true,
  });
  assert.equal(sent.status, 201, JSON.stringify(sent.data));

  const admin = await adminClient();
  const r = await admin("POST", `/api/admin/corrections/${sent.data.correction.id}/review`, { decision: "accept" });
  assert.equal(r.status, 200);
  assert.equal(r.data.cacheCleared, true);
  assert.equal(await cache.findClaim(claim), null, "같은 주장이 다음 검증에서 그 판정으로 다시 나가면 안 된다");
});

test("반려하면 점수도 없고 캐시도 그대로다", async () => {
  const { c, id: userId } = await signedUpUser("fix3@yume.test");
  const claim = { ...wineClaim(), text: "이 와인은 1997년 파리 시음회에서 1위를 했다" };
  await seed("v-fix-3", userId, [claim]);
  await cache.saveClaim(claim);

  const sent = await c("POST", "/api/corrections", {
    verificationId: "v-fix-3",
    claimIdx: 0,
    correctVerdict: "confirmed",
    note: "제가 그 자리에 있었습니다. 다른 근거는 없습니다.",
    consent: true,
  });
  const admin = await adminClient();
  const r = await admin("POST", `/api/admin/corrections/${sent.data.correction.id}/review`, { decision: "reject", note: "근거를 확인할 수 없어요." });
  assert.equal(r.status, 200);
  assert.equal(r.data.points, 0);
  assert.equal((await c("GET", "/api/contribution")).data.points, 0);
  assert.ok(await cache.findClaim(claim), "반려된 정정으로 판정을 무르지는 않는다");

  // 반려 사유는 보낸 사람에게 보인다. 왜 안 됐는지 모르면 다시 보낼 수도 없다.
  const mine = (await c("GET", "/api/credits")).data.corrections;
  assert.equal(mine[0].status, "rejected");
  assert.match(mine[0].reviewer_note, /근거를 확인할 수 없어요/);
});

test("근거 없는 정정, 같은 판정, 남의 검증은 받지 않는다", async () => {
  const { c, id: userId } = await signedUpUser("fix4@yume.test");
  await seed("v-fix-4", userId, [wineClaim()]);
  const base_ = { verificationId: "v-fix-4", claimIdx: 0, consent: true };

  const short = await c("POST", "/api/corrections", { ...base_, correctVerdict: "confirmed", note: "틀렸음" });
  assert.equal(short.status, 400);
  assert.match(short.data.error, /적어주세요/);

  const same = await c("POST", "/api/corrections", { ...base_, correctVerdict: "false", note: "이건 정말로 사실과 다릅니다 확실합니다." });
  assert.equal(same.status, 400, "유메가 낸 판정과 같으면 정정이 아니다");

  const badUrl = await c("POST", "/api/corrections", { ...base_, correctVerdict: "confirmed", evidenceUrl: "javascript:alert(1)", note: "근거는 여기 있습니다 확인해주세요." });
  assert.equal(badUrl.status, 400, "http(s)가 아닌 주소는 받지 않는다");

  // 남의 검증 기록에는 손댈 수 없다.
  const other = await signedUpUser("fix5@yume.test");
  const stranger = await other.c("POST", "/api/corrections", { ...base_, correctVerdict: "confirmed", note: "남의 검증을 고쳐보려 합니다." });
  assert.equal(stranger.status, 404);
});

test("같은 주장에 정정을 두 번 넣어 두 번 받을 수는 없다", async () => {
  const { c, id: userId } = await signedUpUser("fix6@yume.test");
  await seed("v-fix-6", userId, [wineClaim()]);
  const body = { verificationId: "v-fix-6", claimIdx: 0, correctVerdict: "confirmed", note: "같은 주장을 두 번 보내봅니다.", consent: true };
  assert.equal((await c("POST", "/api/corrections", body)).status, 201);
  const again = await c("POST", "/api/corrections", body);
  assert.equal(again.status, 409);
});

test("로그인하지 않으면 정정을 보낼 수 없다", async () => {
  const anon = client();
  const r = await anon("POST", "/api/corrections", { verificationId: "v-fix-1", claimIdx: 0, correctVerdict: "confirmed", note: "익명으로 보내봅니다.", consent: true });
  assert.equal(r.status, 401);
});
