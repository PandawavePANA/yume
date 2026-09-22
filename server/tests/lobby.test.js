// 전체 채팅(로비) — 문턱과 등수 표시.
//
// 지키려는 것 셋:
//   1. 계정만 만들고 떠들 수 없다. 휴대폰 본인확인 + 검증 4회분의 공헌도가 필요하다.
//   2. 문턱은 **누적** 점수로 본다. 등수는 분기마다 초기화되지만 문턱까지 초기화하면
//      분기가 바뀐 날 아침에 오래 쓰던 사람들이 전부 말을 못 하게 된다.
//   3. 이름 옆 색은 서버가 정한다. 화면이 제멋대로 칠하면 같은 등수가 다르게 보인다.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yume-lobby-"));
process.env.DATA_DIR = dir;
process.env.PGLITE_DIR = "memory://";
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
else delete process.env.DATABASE_URL;
delete process.env.ANTHROPIC_API_KEY;

const { default: app } = await import("../app.js");
const db = await import("../db.js");
const lobby = await import("../lobby.js");
const contribution = await import("../contribution.js");

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
/** 쿠키를 들고 다니는 클라이언트 하나. */
function client() {
  let cookie = "";
  return async (method, path, body) => {
    const headers = { "X-Forwarded-For": `10.5.0.${(seq += 1)}` };
    if (body) headers["Content-Type"] = "application/json";
    if (cookie) headers.Cookie = cookie;
    const res = await fetch(base + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const sc = res.headers.getSetCookie?.() || [];
    if (sc.length) cookie = sc.map((c) => c.split(";")[0]).join("; ");
    return { status: res.status, data: await res.json().catch(() => ({})) };
  };
}

async function signup(email, nickname) {
  const c = client();
  const r = await c("POST", "/api/auth/signup", {
    email,
    password: "passw0rd!",
    name: "테스터",
    nickname,
    agreeTerms: true,
    agreePrivacy: true,
    agreeIdentity: true,
  });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  const row = await db.one("SELECT id FROM users WHERE email = :e", { e: email });
  return { c, id: Number(row.id) };
}

/** 본인확인은 포트원을 거쳐야 하므로, 테스트에서는 그 결과만 심는다. */
const verifyIdentity = (id) =>
  db.run("UPDATE users SET identity_verified_at = :t WHERE id = :id", { t: Date.now(), id });

// 검증 n회분의 공헌도를 넣는다(검증 1회 = 10점).
//
// ref는 부를 때마다 새로 만든다 — award가 같은 ref를 두 번 쌓지 않도록 막고 있어서,
// 한 사람에게 나눠서 두 번 넣을 때 번호를 이어 붙이지 않으면 두 번째가 조용히 무시된다.
let refSeq = 0;
async function doVerifications(id, n) {
  for (let i = 0; i < n; i += 1) {
    refSeq += 1;
    await contribution.award(id, "verify", contribution.POINTS.verify, { ref: `test:${id}:${refSeq}` });
  }
  contribution.forgetRankCache();
}

test("계정만 있으면 채팅하지 못한다 — 본인확인과 검증 4회가 먼저다", async () => {
  const { c } = await signup("gate@yume.test", "문턱이");

  const view = await c("GET", "/api/lobby");
  assert.equal(view.status, 200);
  assert.equal(view.data.me.canChat, false);
  assert.equal(view.data.me.needVerifications, 4, "검증 4회분이 남았다고 알려줘야 한다");
  assert.equal(view.data.me.identityRequired, true);
  assert.equal(view.data.minPoints, 40, "검증 10점 × 4회");

  const said = await c("POST", "/api/lobby", { body: "안녕하세요" });
  assert.equal(said.status, 403);
  assert.equal(said.data.code, "IDENTITY_REQUIRED");
});

test("본인확인만으로도 부족하다 — 검증 4회를 채워야 열린다", async () => {
  const { c, id } = await signup("half@yume.test", "절반이");
  await verifyIdentity(id);

  // 3회까지는 막힌다.
  await doVerifications(id, 3);
  const blocked = await c("POST", "/api/lobby", { body: "아직인가요" });
  assert.equal(blocked.status, 403);
  assert.equal(blocked.data.code, "NEED_POINTS");
  assert.match(blocked.data.error, /1번 더/, "몇 번 남았는지 알려줘야 한다");

  // 4회째에 열린다.
  await doVerifications(id, 1);
  const view = await c("GET", "/api/lobby");
  assert.equal(view.data.me.canChat, true);
  assert.equal(view.data.me.needVerifications, 0);

  const said = await c("POST", "/api/lobby", { body: "이제 됩니다" });
  assert.equal(said.status, 201, JSON.stringify(said.data));
  assert.equal(said.data.message.body, "이제 됩니다");
  assert.equal(said.data.message.name, "절반이", "이메일이 아니라 닉네임이 나간다");
});

test("문턱은 누적 점수로 본다 — 분기가 바뀌어도 말을 막지 않는다", async () => {
  const { c, id } = await signup("carry@yume.test", "이월이");
  await verifyIdentity(id);
  await doVerifications(id, 4);

  // 지난 분기 것으로 옮긴다(분기 초기화를 흉내 낸다).
  await db.run("UPDATE contribution_ledger SET period = '2000-Q1' WHERE user_id = :id", { id });
  contribution.forgetRankCache();

  const view = await c("GET", "/api/lobby");
  assert.equal(view.data.me.points, 0, "이번 분기 점수는 0이고");
  assert.equal(view.data.me.earned, 40, "누적은 그대로 남는다");
  assert.equal(view.data.me.canChat, true, "분기가 바뀌었다고 말을 막으면 안 된다");

  const said = await c("POST", "/api/lobby", { body: "분기 넘어와도 됩니다" });
  assert.equal(said.status, 201);
});

test("이름 옆 등수와 색은 서버가 붙인다", async () => {
  const one = await signup("rank1@yume.test", "일등이");
  const two = await signup("rank2@yume.test", "이등이");
  await verifyIdentity(one.id);
  await verifyIdentity(two.id);

  // 1등이 더 높게. 점수가 같으면 먼저 도달한 쪽이 앞이라 확실히 벌려 둔다.
  await doVerifications(one.id, 20);
  await doVerifications(two.id, 5);

  await one.c("POST", "/api/lobby", { body: "제가 1등입니다" });
  await two.c("POST", "/api/lobby", { body: "저는 2등" });

  const view = await two.c("GET", "/api/lobby");
  const mine = view.data.messages.find((m) => m.name === "일등이");
  const other = view.data.messages.find((m) => m.name === "이등이");

  assert.equal(mine.rank, 1);
  assert.equal(mine.color, "#E03131", "1위는 빨강");
  assert.equal(mine.tier, "top1");
  assert.equal(other.rank, 2);
  assert.equal(other.color, "#1971C2", "2~10위는 파랑");
  assert.equal(other.tier, "top10");
});

test("등수 구간은 1 / 2–10 / 11–50 / 51–100 으로 갈린다", () => {
  const color = (r) => contribution.tierOf(r)?.color || null;
  assert.equal(color(1), "#E03131");
  assert.equal(color(2), "#1971C2");
  assert.equal(color(10), "#1971C2");
  assert.equal(color(11), "#E8590C");
  assert.equal(color(50), "#E8590C");
  assert.equal(color(51), "#2F9E44");
  assert.equal(color(100), "#2F9E44");
  assert.equal(color(101), null, "100위 밖은 색을 주지 않는다");
  assert.equal(color(null), null);
});

test("새로 온 말만 받아 온다 (after)", async () => {
  const { c, id } = await signup("poll@yume.test", "폴링이");
  await verifyIdentity(id);
  await doVerifications(id, 4);

  const before = await c("GET", "/api/lobby");
  const last = before.data.messages.at(-1)?.id || 0;

  await c("POST", "/api/lobby", { body: "새 메시지" });
  const after = await c("GET", `/api/lobby?after=${last}`);
  assert.equal(after.data.messages.length, 1);
  assert.equal(after.data.messages[0].body, "새 메시지");
});

test("긴 글과 빈 글은 받지 않는다", async () => {
  const { c, id } = await signup("long@yume.test", "장문이");
  await verifyIdentity(id);
  await doVerifications(id, 4);

  const empty = await c("POST", "/api/lobby", { body: "   " });
  assert.equal(empty.status, 400);

  const long = await c("POST", "/api/lobby", { body: "가".repeat(500) });
  assert.equal(long.status, 201);
  assert.equal(long.data.message.body.length, lobby.MAX_BODY, "넘치면 자른다");
});

test("운영자가 내린 말은 목록에서 빠진다", async () => {
  const { c, id } = await signup("hide@yume.test", "내림이");
  await verifyIdentity(id);
  await doVerifications(id, 4);

  const said = await c("POST", "/api/lobby", { body: "내려질 말" });
  const msgId = said.data.message.id;

  assert.equal(await lobby.hide(msgId, id), true);
  const view = await c("GET", "/api/lobby");
  assert.ok(!view.data.messages.some((m) => m.id === msgId), "내린 말은 안 보인다");

  // 지운 게 아니라 내린 것이라 검토 목록에는 남는다.
  const review = await lobby.listForReview(200);
  assert.ok(review.some((r) => Number(r.id) === msgId && r.hidden), "기록은 남아야 한다");
});

test("로그인하지 않으면 읽지도 쓰지도 못한다", async () => {
  const anon = client();
  assert.equal((await anon("GET", "/api/lobby")).status, 401);
  assert.equal((await anon("POST", "/api/lobby", { body: "익명" })).status, 401);
});
