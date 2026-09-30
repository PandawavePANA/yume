// 일감 하나는 한 곳에만 있어야 한다 — 총합 대시보드가 "진행 중"으로 안 바뀌던 문제.
//
// 일감이 생기는 길은 셋이다. 보드에서 "일감으로"(문의 → 상담), 의뢰인의 견적 결제,
// 데스크의 "일감 만들기". 그런데 셋이 서로를 몰랐다.
//
//   문의가 들어온다 → 보드에서 "일감으로" → 일감 A(상담)가 생긴다.
//   의뢰인이 대화방에서 견적을 결제한다 → 결제는 대화에 적힌 일감만 찾는데,
//   "일감으로"는 대화에 아무것도 적지 않았다 → 못 찾고 일감 B(진행 중)를 새로 만든다.
//
// 결과: A는 영원히 "상담"이고 B가 옆에 따로 선다. 돈은 B에 붙고, 문의 내용은 A에 있다.
// 대시보드의 "진행 중"은 늘지만 사장이 보던 그 일감은 안 바뀐다.
//
// 셋이 공유하는 열쇠는 문의 번호(inquiry_id)다. 대화도 일감도 그걸 들고 있다.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yume-projlink-"));
process.env.DATA_DIR = dir;
process.env.PGLITE_DIR = "memory://";
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
else delete process.env.DATABASE_URL;
process.env.ADMIN_EMAILS = "admin@yume.test";
process.env.ADMIN_SECRET = "test-admin-secret-0123";
process.env.DATASET_SALT = "test-salt";
process.env.VITE_PORTONE_STORE_ID = "store-test";
process.env.VITE_PORTONE_CHANNEL_KEY = "channel-test";
process.env.PORTONE_V2_API_SECRET = "secret-test";
delete process.env.ANTHROPIC_API_KEY;

// 포트원 응답을 흉내 낸다 — 결제가 실제로 된 것으로.
const realFetch = globalThis.fetch;
let paidAmount = 0;
globalThis.fetch = async (url, init) => {
  if (String(url).startsWith("https://api.portone.io/")) {
    const body = { status: "PAID", amount: { total: paidAmount }, method: { type: "CARD" }, paidAt: "2026-09-30T00:00:00Z" };
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  }
  return realFetch(url, init);
};

const { default: app } = await import("../app.js");
const db = await import("../db.js");
const { settleQuote } = await import("../quoteCheckout.js");

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

let admin;
async function adminCall(method, url, body) {
  if (!admin) {
    let cookie = "";
    admin = async (m, u, b) => {
      const res = await fetch(base + u, {
        method: m,
        headers: { "X-Forwarded-For": "10.9.0.1", ...(b ? { "Content-Type": "application/json" } : {}), ...(cookie ? { Cookie: cookie } : {}) },
        body: b ? JSON.stringify(b) : undefined,
      });
      for (const c of res.headers.getSetCookie?.() || []) {
        const [pair] = c.split(";");
        cookie = pair.endsWith("=") ? "" : pair;
      }
      const type = res.headers.get("content-type") || "";
      return { status: res.status, data: type.includes("json") ? await res.json() : await res.text() };
    };
    const r = await admin("POST", "/api/auth/signup", {
      email: "admin@yume.test", password: "passw0rd!", name: "운영", nickname: "boss",
      agreeTerms: true, agreePrivacy: true, agreeIdentity: true,
    });
    assert.equal(r.status, 201, JSON.stringify(r.data));
  }
  return admin(method, url, body);
}

let seq = 0;
// 문의 하나와, 그 문의에서 열린 대화방 하나. 실제로는 문의가 들어오면 대화방이 같이 열린다.
async function inquiryWithThread(title) {
  seq += 1;
  const t = db.now();
  const q = await db.run(
    `INSERT INTO inquiries (name, contact, company, kind, message, status, created_at)
     VALUES (:n, :c, :co, '웹사이트', :m, 'new', :t) RETURNING id`,
    { n: `의뢰인${seq}`, c: `010-0000-000${seq}`, co: title, m: `${title} 만들어 주세요`, t },
  );
  const inquiryId = q.rows[0].id;
  const th = await db.run(
    `INSERT INTO threads (token_hash, inquiry_id, client_name, client_contact, title, status, created_at, updated_at)
     VALUES (:h, :iid, :n, :c, :title, 'open', :t, :t) RETURNING id`,
    { h: `hash-${seq}-${Date.now()}`, iid: inquiryId, n: `의뢰인${seq}`, c: `010-0000-000${seq}`, title, t },
  );
  return { inquiryId, threadId: th.rows[0].id };
}

async function acceptedQuote(threadId, amount) {
  const t = db.now();
  const r = await db.run(
    `INSERT INTO thread_quotes (thread_id, title, amount_krw, status, payment_id, created_at, updated_at)
     VALUES (:tid, '착수금', :amt, 'accepted', :pid, :t, :t) RETURNING *`,
    { tid: threadId, amt: amount, pid: `reamer_q_test_${threadId}_${Date.now()}`, t },
  );
  return r.rows[0];
}

const projectsFor = (inquiryId) => db.all("SELECT * FROM projects WHERE inquiry_id = :iid ORDER BY id", { iid: inquiryId });

test("일감으로 옮긴 문의가 결제되면 그 일감이 진행 중이 된다 — 새로 만들지 않는다", async () => {
  const { inquiryId, threadId } = await inquiryWithThread("쇼핑몰");

  const conv = await adminCall("POST", `/api/admin/studio/inquiry/${inquiryId}/convert`);
  assert.equal(conv.status, 201, JSON.stringify(conv.data));
  const [before] = await projectsFor(inquiryId);
  assert.equal(before.status, "lead", "옮긴 직후는 상담");

  paidAmount = 1_500_000;
  const quote = await acceptedQuote(threadId, paidAmount);
  const r = await settleQuote(quote);
  assert.equal(r.ok, true, JSON.stringify(r));

  const after = await projectsFor(inquiryId);
  assert.equal(after.length, 1, "결제가 일감을 하나 더 만들면 안 된다 — 보드에 같은 일이 둘로 선다");
  assert.equal(after[0].id, before.id, "사장이 보던 바로 그 일감이어야 한다");
  assert.equal(after[0].status, "active", "결제는 일을 시작한다는 뜻이다");
  assert.equal(Number(after[0].paid_krw), 1_500_000, "받은 돈이 그 일감에 붙는다");
  assert.ok(after[0].started_at, "시작 시각이 찍힌다");

  const board = await adminCall("GET", "/api/admin/studio");
  const mine = board.data.projects.find((p) => p.id === before.id);
  assert.equal(mine.status, "active", "총합 대시보드에서도 진행 중");
});

test("데스크에서 일감을 만들어도 이미 옮긴 일감을 쓴다", async () => {
  const { inquiryId, threadId } = await inquiryWithThread("예약 앱");
  await adminCall("POST", `/api/admin/studio/inquiry/${inquiryId}/convert`);
  const [before] = await projectsFor(inquiryId);

  const r = await adminCall("POST", `/api/admin/desk/${threadId}/project`);
  assert.ok(r.status === 200 || r.status === 201, JSON.stringify(r.data));

  const after = await projectsFor(inquiryId);
  assert.equal(after.length, 1, "데스크가 일감을 하나 더 만들면 안 된다");
  assert.equal(r.data.id, before.id);
  assert.equal(after[0].status, "active", "데스크에서 시작하면 진행 중이다");
});

test("결제가 먼저 오면 새 일감이 진행 중으로 생긴다 — 예전과 같다", async () => {
  const { inquiryId, threadId } = await inquiryWithThread("랜딩 페이지");
  paidAmount = 400_000;
  const r = await settleQuote(await acceptedQuote(threadId, paidAmount));
  assert.equal(r.ok, true);
  const ps = await projectsFor(inquiryId);
  assert.equal(ps.length, 1);
  assert.equal(ps[0].status, "active");

  // 그 뒤에 보드에서 "일감으로"를 눌러도 둘째가 생기지 않는다.
  const conv = await adminCall("POST", `/api/admin/studio/inquiry/${inquiryId}/convert`);
  assert.equal(conv.status, 409);
  assert.equal((await projectsFor(inquiryId)).length, 1);
});

test("보드에서 상태를 진행 중으로 바꾸면 그대로 반영된다", async () => {
  const { inquiryId } = await inquiryWithThread("사내 도구");
  await adminCall("POST", `/api/admin/studio/inquiry/${inquiryId}/convert`);
  const [p] = await projectsFor(inquiryId);
  const before = (await adminCall("GET", "/api/admin/studio")).data.summary.active;

  const r = await adminCall("PATCH", `/api/admin/studio/project/${p.id}`, { status: "active" });
  assert.equal(r.status, 200, JSON.stringify(r.data));

  const board = (await adminCall("GET", "/api/admin/studio")).data;
  assert.equal(board.projects.find((x) => x.id === p.id).status, "active");
  assert.equal(board.summary.active, before + 1, "진행 중 개수도 하나 는다");
});

// ── 이미 갈라져 있던 일감 ────────────────────────────────────────────────────
// 고치기 전에 생긴 짝은 저절로 붙지 않는다(대화는 이미 새 일감을 가리키고 있다).
// 보드가 짝을 보여 주고, 사장이 한 번 눌러 합친다.
async function splitPair(title, paid) {
  const { inquiryId, threadId } = await inquiryWithThread(title);
  const t = db.now();
  // 고치기 전 모양 그대로: "일감으로"가 만든 상담 일감 A, 결제가 따로 만든 진행 중 일감 B.
  const a = await db.run(
    `INSERT INTO projects (title, client, kind, status, amount_krw, paid_krw, progress, due_at, note, inquiry_id, created_at, updated_at)
     VALUES (:title, '의뢰인', '웹사이트', 'lead', 0, 0, 0, :due, '문의 내용', :iid, :t, :t) RETURNING id`,
    { title, due: t + 14 * 86400000, iid: inquiryId, t },
  );
  const b = await db.run(
    `INSERT INTO projects (title, client, kind, status, amount_krw, paid_krw, progress, started_at, inquiry_id, created_at, updated_at)
     VALUES (:title, '의뢰인', '사이트 결제', 'active', :paid, :paid, 0, :t, :iid, :t, :t) RETURNING id`,
    { title, paid, iid: inquiryId, t },
  );
  const A = a.rows[0].id;
  const B = b.rows[0].id;
  await db.run("UPDATE threads SET project_id = :b WHERE id = :id", { b: B, id: threadId });
  await db.run("INSERT INTO product_tasks (product, title, state, sort, created_at, updated_at) VALUES (:p, '시안 보내기', 'todo', 1, :t, :t)", { p: `project:${A}`, t });
  await db.run("INSERT INTO product_tasks (product, title, state, sort, created_at, updated_at) VALUES (:p, '결제 확인', 'done', 1, :t, :t)", { p: `project:${B}`, t });
  return { inquiryId, threadId, A, B };
}

test("보드가 갈라진 짝을 찾아 보여 준다", async () => {
  const { A, B } = await splitPair("회원제 커뮤니티", 900_000);
  const board = (await adminCall("GET", "/api/admin/studio")).data;
  const s = board.splits.find((x) => x.keep.id === A);
  assert.ok(s, "짝이 보드에 떠야 한다");
  assert.equal(s.keep.status, "lead", "남길 쪽은 사장이 보던 상담 일감");
  assert.deepEqual(s.from.map((f) => f.id), [B]);
  assert.equal(s.from[0].paid, 900_000);
});

test("합치면 돈·할 일·대화가 상담 일감으로 옮겨지고 진행 중이 된다", async () => {
  const { A, B, threadId } = await splitPair("재고 관리", 700_000);
  const r = await adminCall("POST", `/api/admin/studio/project/${A}/merge`, { from: B });
  assert.equal(r.status, 200, JSON.stringify(r.data));

  const a = await db.one("SELECT * FROM projects WHERE id = :id", { id: A });
  assert.equal(a.status, "active", "돈을 받은 일이니 진행 중");
  assert.equal(Number(a.paid_krw), 700_000, "받은 돈이 옮겨 온다");
  assert.ok(Number(a.amount_krw) >= 700_000, "계약 금액이 받은 돈보다 작을 수는 없다");
  assert.ok(a.started_at, "시작일도 옮겨 온다");
  assert.ok(a.due_at, "원래 적어 둔 마감은 그대로");
  assert.equal(a.note, "문의 내용", "원래 메모도 그대로");

  assert.ok(!(await db.one("SELECT id FROM projects WHERE id = :id", { id: B })), "오른쪽은 사라진다");
  const th = await db.one("SELECT project_id FROM threads WHERE id = :id", { id: threadId });
  assert.equal(th.project_id, A, "대화도 남는 쪽을 가리킨다 — 다음 결제·환불이 여기로 온다");
  const tasks = await db.all("SELECT title FROM product_tasks WHERE product = :p ORDER BY title", { p: `project:${A}` });
  assert.deepEqual(tasks.map((t) => t.title).sort(), ["결제 확인", "시안 보내기"], "양쪽 할 일이 다 남는다");

  const board = (await adminCall("GET", "/api/admin/studio")).data;
  assert.equal(board.splits.find((x) => x.keep.id === A), undefined, "합친 뒤에는 보드에서 사라진다");
});

test("다른 의뢰의 일감끼리는 합치지 않는다 — 두 고객의 돈이 섞인다", async () => {
  const one = await splitPair("A사 홈페이지", 100_000);
  const two = await splitPair("B사 앱", 200_000);
  const r = await adminCall("POST", `/api/admin/studio/project/${one.A}/merge`, { from: two.B });
  assert.equal(r.status, 400);
  assert.match(r.data.error, /같은 의뢰/);
  assert.ok(await db.one("SELECT id FROM projects WHERE id = :id", { id: two.B }), "아무것도 지워지지 않는다");
  const a = await db.one("SELECT paid_krw FROM projects WHERE id = :id", { id: one.A });
  assert.equal(Number(a.paid_krw), 0, "돈도 옮겨지지 않는다");
});
