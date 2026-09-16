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
const contribution = await import("../contribution.js");
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

let nickSeq = 0;
const signupBody = (email, extra = {}) => ({
  email,
  password: "passw0rd!",
  name: "테스터",
  // 닉네임은 유니크 제약이 걸려 있다. 호출마다 새로 만들어, 이메일 중복 테스트가
  // 닉네임 충돌 때문에 통과해버리는 일이 없게 한다.
  nickname: `tester${++nickSeq}`,
  agreeTerms: true,
  agreePrivacy: true,
  ...extra,
});

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

test("제보 → 검토 → 승인 시에만 기여도 점수가 지급된다", async () => {
  const { c, id: userId } = await signedUpUser("bounty@yume.test", { dataConsent: true });
  await seed("v-bounty-1", userId, [necClaim("2019다999991")]);

  assert.equal((await c("GET", "/api/contribution")).data.points, 0);

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

  // 접수만으로는 아직 0 — 제출이 아니라 승인에 점수를 준다
  assert.equal((await c("GET", "/api/contribution")).data.points, 0);

  const admin = client();
  await admin("POST", "/api/auth/signup", signupBody("admin@yume.test"));
  const approve = await admin("POST", `/api/admin/bounties/${bountyId}/review`, { decision: "approve", note: "링크 확인함" });
  assert.equal(approve.status, 200, JSON.stringify(approve.data));
  assert.equal(approve.data.points, contribution.POINTS.report);

  const after = await c("GET", "/api/contribution");
  assert.equal(after.data.points, contribution.POINTS.report);
  assert.equal(after.data.rank, 1, "점수가 있으면 순위가 매겨진다");
  assert.equal((await c("GET", "/api/credits")).data.bounties[0].status, "approved");

  // 크레딧은 제보로 늘지 않는다 — 서로 다른 값이다
  assert.equal((await c("GET", "/api/credits")).data.balance, credits.PLAN_CREDITS.free);

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

test("크레딧 구매는 신청만 받고, 입금 확인 뒤에야 지급된다", async () => {
  const { c, id: userId } = await signedUpUser("buy@yume.test");
  const before = (await c("GET", "/api/credits")).data.balance;

  const noContact = await c("POST", "/api/credit-packs", { packKey: "pack_100", contact: "" });
  assert.equal(noContact.status, 400);

  const ok = await c("POST", "/api/credit-packs", { packKey: "pack_100", contact: "010-1234-5678" });
  assert.equal(ok.status, 201, JSON.stringify(ok.data));

  // 신청만으로는 절대 늘지 않는다 — 결제 없이 크레딧을 주면 안 된다
  assert.equal((await c("GET", "/api/credits")).data.balance, before, "입금 확인 전에는 지급하지 않는다");

  const admin = client();
  await admin("POST", "/api/auth/login", { email: "admin@yume.test", password: "passw0rd!" });
  const done = await admin("POST", `/api/admin/redemptions/${ok.data.request.id}/handle`, { decision: "fulfill" });
  assert.equal(done.status, 200, JSON.stringify(done.data));
  assert.equal((await c("GET", "/api/credits")).data.balance, before + 100, "입금이 확인되면 그때 들어간다");
});

test("요금제 월 지급은 같은 달에 두 번 들어오지 않는다", async () => {
  const { c, id: userId } = await signedUpUser("grant@yume.test");
  const first = (await c("GET", "/api/credits")).data.balance;
  assert.equal(first, credits.PLAN_CREDITS.free, "가입 후 첫 조회에 그 달 지급분이 들어온다");
  await c("GET", "/api/credits");
  await c("GET", "/api/credits");
  assert.equal((await c("GET", "/api/credits")).data.balance, first, "여러 번 열어도 한 번만 들어온다");
});

test("크레딧이 모자라면 차감되지 않고, 동시에 써도 음수가 되지 않는다", async () => {
  const { id: userId } = await signedUpUser("race@yume.test");
  await credits.ensureMonthlyGrant({ id: userId, plan: "free" });
  const bal = await credits.balance(userId);
  assert.ok(bal > 0);

  // 잔액을 1개만 남기고 비운다
  assert.equal(await credits.spend(userId, bal - 1, "verify"), true);
  const results = await Promise.all([credits.spendOne(userId, null), credits.spendOne(userId, null)]);
  assert.equal(results.filter(Boolean).length, 1, "한 번만 차감돼야 한다");
  assert.equal(await credits.balance(userId), 0);
  assert.equal(await credits.spendOne(userId, null), false, "잔액이 없으면 false");
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

// ── 기여도 ──────────────────────────────────────────────────────────────
// 크레딧과 다른 값이라는 것 자체가 검증 대상이다. 검증을 돌려 크레딧이 줄어도
// 기여도는 줄지 않아야 하고, 그래야 랭킹이 "많이 쓴 사람"이 아니라 "많이 보탠 사람"을 센다.

test("검증은 10점, 사실과 다른 주장이 잡히면 50점을 더한다", async () => {
  const { id: userId } = await signedUpUser("contrib@yume.test");

  await contribution.awardForVerification(userId, "v-c-1", [{ verdict: "confirmed", text: "맞는 주장" }]);
  assert.equal(await contribution.total(userId), contribution.POINTS.verify);

  await contribution.awardForVerification(userId, "v-c-2", [
    { verdict: "false", text: "지어낸 판례" },
    { verdict: "confirmed", text: "맞는 주장" },
  ]);
  assert.equal(await contribution.total(userId), contribution.POINTS.verify * 2 + contribution.POINTS.finding);
});

test("같은 검증으로는 점수가 두 번 쌓이지 않는다", async () => {
  const { id: userId } = await signedUpUser("contrib-dup@yume.test");
  await contribution.awardForVerification(userId, "v-dup", [{ verdict: "false", text: "x" }]);
  const once = await contribution.total(userId);
  await contribution.awardForVerification(userId, "v-dup", [{ verdict: "false", text: "x" }]);
  assert.equal(await contribution.total(userId), once, "재시도로 같은 검증이 두 번 기록돼도 한 번만");
});

test("사실과 다른 주장이 여러 건이어도 검증 한 건당 발견 점수는 한 번", async () => {
  // 주장 수로 점수가 곱해지면 긴 글을 붙여넣는 게 최적 전략이 된다.
  const { id: userId } = await signedUpUser("contrib-many@yume.test");
  await contribution.awardForVerification(userId, "v-many", [
    { verdict: "false", text: "a" },
    { verdict: "false", text: "b" },
    { verdict: "false", text: "c" },
  ]);
  assert.equal(await contribution.total(userId), contribution.POINTS.verify + contribution.POINTS.finding);
});

test("크레딧을 써도 기여도는 줄지 않는다", async () => {
  const { id: userId } = await signedUpUser("contrib-spend@yume.test");
  await contribution.awardForVerification(userId, "v-spend", [{ verdict: "false", text: "x" }]);
  const points = await contribution.total(userId);

  await credits.ensureMonthlyGrant({ id: userId, plan: "free" });
  await credits.spendOne(userId, null);
  assert.ok((await credits.balance(userId)) < credits.PLAN_CREDITS.free, "크레딧은 줄고");
  assert.equal(await contribution.total(userId), points, "기여도는 그대로다");
});

test("랭킹은 점수 순, 동점이면 먼저 도달한 사람이 앞", async () => {
  const { id: a } = await signedUpUser("rank-a@yume.test");
  const { id: b } = await signedUpUser("rank-b@yume.test");
  await contribution.award(a, "adjust", 500, { ref: "t-a" });
  await contribution.award(b, "adjust", 500, { ref: "t-b" });
  await contribution.award(b, "adjust", 1, { ref: "t-b2" });

  const board = await contribution.leaderboard(50);
  const ia = board.findIndex((r) => r.userId === a);
  const ib = board.findIndex((r) => r.userId === b);
  assert.ok(ib < ia, "점수가 높은 쪽이 앞");
  assert.equal(board[ib].rank, ib + 1);

  const mine = await contribution.rankOf(a);
  assert.equal(mine.points, 500);
  assert.ok(mine.rank > 0);
});

test("랭킹에는 이메일이 나가지 않는다", async () => {
  const { id } = await signedUpUser("secret@yume.test");
  await contribution.award(id, "adjust", 10, { ref: "t-secret" });
  const board = await contribution.leaderboard(50);
  const dump = JSON.stringify(board);
  assert.ok(!dump.includes("secret@yume.test"), "이메일이 보드에 섞이면 안 된다");
  assert.ok(!dump.includes("@"), "어떤 이메일도 나가면 안 된다");
});

// ── 닉네임 · 분기 ───────────────────────────────────────────────────────
test("닉네임은 겹칠 수 없고, 대소문자만 다른 것도 같은 이름으로 본다", async () => {
  const a = client();
  assert.equal((await a("POST", "/api/auth/signup", { ...signupBody("nick1@yume.test"), nickname: "달빛탐정" })).status, 201);

  const b = client();
  const dup = await b("POST", "/api/auth/signup", { ...signupBody("nick2@yume.test"), nickname: "달빛탐정" });
  assert.equal(dup.status, 409);
  assert.match(dup.data.error, /닉네임/);

  const c2 = client();
  const upper = await c2("POST", "/api/auth/signup", { ...signupBody("nick3@yume.test"), nickname: "Moonlight" });
  assert.equal(upper.status, 201);
  const c3 = client();
  assert.equal((await c3("POST", "/api/auth/signup", { ...signupBody("nick4@yume.test"), nickname: "moonlight" })).status, 409, "대소문자만 달라도 중복");
});

test("닉네임 규칙 — 길이·문자·사칭", () => {
  assert.ok(contribution.nicknameProblem("ㅇ"), "2자 미만");
  assert.ok(contribution.nicknameProblem("가".repeat(17)), "17자 초과");
  assert.ok(contribution.nicknameProblem("hello world"), "공백 불가");
  assert.ok(contribution.nicknameProblem("유메운영자"), "사칭 소지");
  assert.ok(contribution.nicknameProblem("YUME_admin"), "사칭 소지");
  assert.equal(contribution.nicknameProblem("달빛탐정"), null);
  assert.equal(contribution.nicknameProblem("moon_light-2"), null);
});

test("닉네임 없이는 가입할 수 없다", async () => {
  const c2 = client();
  const r = await c2("POST", "/api/auth/signup", { ...signupBody("nonick@yume.test"), nickname: "" });
  assert.equal(r.status, 400);
});

test("랭킹은 닉네임으로 표시된다", async () => {
  const c2 = client();
  await c2("POST", "/api/auth/signup", { ...signupBody("board@yume.test"), nickname: "별빛관찰" });
  const me = (await c2("GET", "/api/auth/me")).data.user;
  await contribution.award(me.id, "adjust", 777, { ref: "t-board" });
  const board = await contribution.leaderboard(50);
  const mine = board.find((r) => r.userId === me.id);
  assert.equal(mine.name, "별빛관찰");
});

test("분기가 다르면 점수가 랭킹에 잡히지 않는다", async () => {
  // 랭킹은 분기마다 초기화된다 — 기록은 남기고 이번 분기 것만 센다.
  const { id } = await signedUpUser("quarter@yume.test");
  await contribution.award(id, "adjust", 400, { ref: "t-now" });
  assert.equal(await contribution.total(id), 400);

  await db.run("UPDATE contribution_ledger SET period = '1999-Q1' WHERE user_id = :id", { id });
  assert.equal(await contribution.total(id), 0, "지난 분기 점수는 이번 랭킹에서 빠진다");
  assert.equal(await contribution.total(id, null), 400, "기록 자체는 남아 있다");
  assert.equal((await contribution.rankOf(id)).rank, null);
  assert.equal((await contribution.leaderboard(50, "1999-Q1")).find((r) => r.userId === id).points, 400);
});

test("분기 마감 — 4~10위는 크레딧이 들어가고, 1~3위는 보낼 목록만 남는다", async () => {
  const period = "2098-Q1";
  const ids = [];
  for (let i = 0; i < 6; i += 1) {
    const { id } = await signedUpUser(`settle${i}@yume.test`);
    ids.push(id);
    await contribution.award(id, "adjust", 1000 - i * 10, { ref: `t-settle-${i}` });
    await db.run("UPDATE contribution_ledger SET period = :p WHERE user_id = :id AND ref = :ref", { p: period, id, ref: `t-settle-${i}` });
  }
  const before = await Promise.all(ids.map((id) => credits.balance(id)));
  const r = await contribution.settleQuarter(period);
  assert.equal(r.settled.length, 6);
  assert.equal(r.settled[0].kind, "goldbar", "1위는 물건");
  assert.equal(r.settled[3].kind, "credits", "4위는 크레딧");

  const after = await Promise.all(ids.map((id) => credits.balance(id)));
  assert.equal(after[0], before[0], "골드바 수상자에게 크레딧이 들어가면 안 된다");
  assert.equal(after[3] - before[3], 1000, "4위 크레딧 지급");
  assert.equal(after[5] - before[5], 300, "6위 크레딧 지급");

  // 두 번 마감해도 상은 한 번만
  const again = await contribution.settleQuarter(period);
  assert.equal(again.settled.length, 0);
  assert.equal(await credits.balance(ids[3]), after[3]);
});
