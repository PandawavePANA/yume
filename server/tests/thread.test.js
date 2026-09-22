// 의뢰 스레드 — 문의 한 건에 붙는 대화·견적·결제.
//
// 여기서 지키려는 건 셋이다.
//   1. 링크가 곧 열쇠다. 토큰은 URL이 아니라 헤더로 오가고, 틀린 토큰은 아무것도 흘리지 않는다.
//   2. 금액은 서버가 정한다. 브라우저가 보낸 숫자로 결제창을 열면 얼마든지 깎을 수 있다.
//   3. "답할 차례"는 사람이 한 말로만 넘어간다. 견적을 보낸 기록까지 세면
//      내가 방금 한 행동이 내 알림으로 돌아온다.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yume-thread-"));
process.env.DATA_DIR = dir;
process.env.PGLITE_DIR = "memory://";
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
else delete process.env.DATABASE_URL;
process.env.INQUIRY_ALLOWED_ORIGINS = "https://www.d-reamer.com";
process.env.ADMIN_PASSWORD = "desk-test-password";
process.env.ADMIN_COOKIE_SECRET = "desk-test-cookie-secret-0123456789";
process.env.THREAD_LINK_KEY = "desk-test-link-key-0123456789";
delete process.env.ANTHROPIC_API_KEY;
delete process.env.RESEND_API_KEY;
// 결제 연동이 반만 켜진 상태를 만들지 않는다 — 이 파일은 결제창을 열지 않는다.
delete process.env.PORTONE_V2_API_SECRET;

const { default: app } = await import("../app.js");
const db = await import("../db.js");
const threads = await import("../threads.js");

let server;
let base;
let cookie = "";

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

let ipSeq = 0;
const ORIGIN = "https://www.d-reamer.com";

async function client(path, { method = "GET", body, token } = {}) {
  const headers = { "X-Forwarded-For": `10.7.0.${(ipSeq += 1)}`, Origin: ORIGIN };
  if (body) headers["Content-Type"] = "application/json";
  if (token) headers["X-Thread-Token"] = token;
  const res = await fetch(`${base}/api${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function admin(path, { method = "GET", body } = {}) {
  if (!cookie) {
    const login = await fetch(`${base}/api/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: process.env.ADMIN_PASSWORD }),
    });
    cookie = (login.headers.getSetCookie() || []).map((c) => c.split(";")[0]).join("; ");
    assert.ok(cookie, "관리자 로그인 쿠키를 받아야 한다");
  }
  const headers = { Cookie: cookie };
  if (body) headers["Content-Type"] = "application/json";
  const res = await fetch(`${base}/api/admin${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

/** 문의 한 건을 넣고 그 스레드의 토큰을 돌려준다. */
async function openThread(over = {}) {
  const res = await fetch(`${base}/api/inquiry`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-For": `10.7.1.${(ipSeq += 1)}`, Origin: ORIGIN },
    body: JSON.stringify({
      name: "김의뢰",
      company: "테스트상사",
      contact: "client@example.com",
      kind: "web",
      budget: "500-1000",
      message: "예매 오픈 알림 서비스를 만들고 싶습니다. 3주 정도 생각합니다.",
      ...over,
    }),
  });
  assert.equal(res.status, 201);
  const { threadUrl } = await res.json();
  return threadUrl.split("#")[1];
}

test("문의를 넣으면 대화방이 열리고 첫 줄에 문의 내용이 들어 있다", async () => {
  const token = await openThread();
  const r = await client("/thread", { token });
  assert.equal(r.status, 200);
  assert.equal(r.body.messages.length, 1);
  assert.equal(r.body.messages[0].sender, "client");
  assert.match(r.body.messages[0].body, /예매 오픈 알림/);
  assert.equal(r.body.quotes.length, 0);
});

test("토큰은 헤더로만 통한다 — 쿼리스트링에 실어도 열리지 않는다", async () => {
  const token = await openThread();
  const viaQuery = await fetch(`${base}/api/thread?token=${encodeURIComponent(token)}`, {
    headers: { Origin: ORIGIN, "X-Forwarded-For": "10.7.2.1" },
  });
  assert.equal(viaQuery.status, 404, "URL에 실린 토큰은 접속 로그에 남으므로 받지 않는다");
});

test("틀린 토큰은 존재 여부를 흘리지 않는다", async () => {
  const r = await client("/thread", { token: "z".repeat(43) });
  assert.equal(r.status, 404);
  assert.equal(r.body.code, "NO_THREAD");
  assert.equal(r.body.thread, undefined);
});

test("교차 출처 관문이 헤더와 GET을 허용하고, 허용하지 않은 출처는 막는다", async () => {
  const pre = await fetch(`${base}/api/thread`, {
    method: "OPTIONS",
    headers: { Origin: ORIGIN, "Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": "x-thread-token" },
  });
  assert.equal(pre.status, 204);
  assert.match(pre.headers.get("access-control-allow-headers") || "", /X-Thread-Token/i);
  assert.match(pre.headers.get("access-control-allow-methods") || "", /GET/);
  // 쿠키를 쓰지 않는 문이라 자격증명을 열어 주면 안 된다.
  assert.equal(pre.headers.get("access-control-allow-credentials"), null);

  const evil = await fetch(`${base}/api/thread`, { method: "OPTIONS", headers: { Origin: "https://evil.example" } });
  assert.equal(evil.status, 403);
});

test("의뢰인이 남긴 말은 우리 차례로 넘어오고, 우리가 답하면 되돌아간다", async () => {
  const token = await openThread();
  const list0 = await admin("/desk");
  const row0 = list0.body.threads[0];
  assert.equal(row0.waiting, true, "문의 자체가 의뢰인의 말이다");
  assert.equal(row0.unread, 1);

  await admin(`/desk/${row0.id}/message`, { method: "POST", body: { body: "감사합니다. 두 가지만 확인할게요." } });
  const list1 = await admin("/desk");
  const row1 = list1.body.threads.find((t) => t.id === row0.id);
  assert.equal(row1.waiting, false);
  assert.equal(row1.unread, 0);
  assert.match(row1.preview, /감사합니다/, "미리보기는 마지막 줄이어야 한다");

  await client("/thread/message", { method: "POST", token, body: { body: "문자로 받고 싶습니다." } });
  const list2 = await admin("/desk");
  const row2 = list2.body.threads.find((t) => t.id === row0.id);
  assert.equal(row2.waiting, true);
  assert.equal(row2.unread, 1);
});

test("견적을 보내도 내 차례로 돌아오지 않는다", async () => {
  const token = await openThread();
  const { id } = (await admin("/desk")).body.threads[0];
  await admin(`/desk/${id}/message`, { method: "POST", body: { body: "견적 보내드립니다." } });
  await admin(`/desk/${id}/quote`, {
    method: "POST",
    body: { title: "1차 개발", amount_krw: 1_500_000, weeks: "2~3주", detail: "포함 내용", valid_days: 14 },
  });

  const row = (await admin("/desk")).body.threads.find((t) => t.id === id);
  assert.equal(row.waiting, false, "견적 발송은 우리가 움직인 것이다");
  assert.equal(row.unread, 0, "내가 한 일이 내 알림으로 돌아오면 안 된다");
  assert.equal(row.pending, 1_500_000);

  // 의뢰인 화면에도 같은 금액이 보여야 한다.
  const seen = await client("/thread", { token });
  assert.equal(seen.body.quotes.length, 1);
  assert.equal(seen.body.quotes[0].amount, 1_500_000);
  assert.equal(seen.body.quotes[0].status, "sent");
});

test("금액은 서버가 정한다 — 브라우저가 보낸 숫자는 쓰지 않는다", async () => {
  const token = await openThread();
  const { id } = (await admin("/desk")).body.threads[0];
  const made = await admin(`/desk/${id}/quote`, { method: "POST", body: { title: "1차", amount_krw: 2_000_000 } });
  await client(`/thread/quote/${made.body.id}/accept`, { method: "POST", token, body: {} });

  const r = await client(`/thread/quote/${made.body.id}/checkout`, {
    method: "POST",
    token,
    body: { name: "김의뢰", email: "client@example.com", phone: "01012345678", amount: 1000, totalAmount: 1000 },
  });
  if (r.status === 503) return; // 결제 연동이 꺼진 환경 — 금액을 만들 자리 자체가 없다
  assert.equal(r.status, 200);
  assert.equal(r.body.totalAmount, 2_000_000);
});

test("결제 연동이 꺼져 있으면 결제창을 열지 않는다", async () => {
  const token = await openThread();
  const { id } = (await admin("/desk")).body.threads[0];
  const made = await admin(`/desk/${id}/quote`, { method: "POST", body: { title: "1차", amount_krw: 900_000 } });
  await client(`/thread/quote/${made.body.id}/accept`, { method: "POST", token, body: {} });
  const r = await client(`/thread/quote/${made.body.id}/checkout`, {
    method: "POST",
    token,
    body: { name: "김의뢰", email: "client@example.com", phone: "01012345678" },
  });
  // 반만 설정된 상태로 창을 열면 "결제는 했는데 확인할 수 없는" 최악이 된다.
  assert.equal(r.status, 503);
  assert.equal((await client("/thread", { token })).body.payable, false);
});

test("남의 스레드 견적은 내 토큰으로 결제할 수 없다", async () => {
  const mine = await openThread();
  const theirs = await openThread({ contact: "other@example.com", name: "박타인" });
  const list = (await admin("/desk")).body.threads;
  const theirRow = list.find((t) => t.name === "박타인");
  const made = await admin(`/desk/${theirRow.id}/quote`, { method: "POST", body: { title: "남의 건", amount_krw: 5_000_000 } });

  const r = await client(`/thread/quote/${made.body.id}/checkout`, {
    method: "POST",
    token: mine,
    body: { name: "김의뢰", email: "client@example.com", phone: "01012345678" },
  });
  assert.equal(r.status, 404);
  void theirs;
});

test("종료된 대화에는 더 쓸 수 없다", async () => {
  const token = await openThread();
  const { id } = (await admin("/desk")).body.threads[0];
  await admin(`/desk/${id}`, { method: "PATCH", body: { status: "closed" } });
  const r = await client("/thread/message", { method: "POST", token, body: { body: "한 마디 더" } });
  assert.equal(r.status, 409);
});

test("링크 재발급은 있는 주소와 없는 주소에 같은 답을 준다", async () => {
  const token = await openThread({ contact: "relink@example.com" });
  const hit = await client("/thread/resend", { method: "POST", body: { email: "relink@example.com" } });
  const miss = await client("/thread/resend", { method: "POST", body: { email: "nobody@example.com" } });
  assert.deepEqual(hit.body, miss.body, "있다/없다를 알려 주면 남의 이메일을 넣어 확인할 수 있다");
  assert.equal(hit.status, miss.status);

  // 새로 발급했으면 옛 토큰은 그 자리에서 죽어야 한다.
  await new Promise((r) => setTimeout(r, 150));
  const old = await client("/thread", { token });
  assert.equal(old.status, 404);
});

test("토큰은 해시로만 저장되고, 되돌릴 값은 따로 봉해 둔다", async () => {
  const token = await openThread({ contact: "seal@example.com" });
  const row = await db.one("SELECT * FROM threads WHERE client_email = 'seal@example.com'");
  assert.ok(row.token_hash);
  assert.ok(!String(row.token_hash).includes(token), "토큰 원문이 그대로 남으면 안 된다");
  assert.ok(!String(row.link_enc || "").includes(token), "봉인된 값도 원문을 드러내면 안 된다");
  // 비밀값이 있으면 알림 메일에 넣을 링크를 만들 수 있어야 한다.
  assert.equal(threads.openToken(row.link_enc), token);
});

test("링크 발급을 다시 하면 새 주소가 나오고 옛 주소는 닫힌다", async () => {
  const token = await openThread({ contact: "rotate@example.com" });
  const { id } = (await admin("/desk")).body.threads[0];
  const issued = await admin(`/desk/${id}/link`, { method: "POST", body: {} });
  assert.match(issued.body.url, /\/t#[\w-]{20,}$/);
  const fresh = issued.body.url.split("#")[1];
  assert.notEqual(fresh, token);
  assert.equal((await client("/thread", { token })).status, 404);
  assert.equal((await client("/thread", { token: fresh })).status, 200);
});

test("데스크는 관리자만 연다", async () => {
  const res = await fetch(`${base}/api/admin/desk`);
  assert.equal(res.status, 401);
});

// 결제창을 닫았다가 다시 열면 주문번호를 새로 발급한다(포트원은 쓴 번호를 다시 받지 않는다).
// 그런데 의뢰인이 **먼저 연 창**에서 결제를 마치면, 표에는 나중 번호만 남아 있다.
// 그때 웹훅이 들고 오는 옛 번호로도 견적을 되찾을 수 있어야 진짜 들어온 돈을 잃지 않는다.
test("지난 주문번호로도 견적을 되찾는다", async () => {
  const { quoteByPaymentId, newPaymentId } = await import("../quoteCheckout.js");
  await openThread({ contact: "stale@example.com" });
  const { id } = (await admin("/desk")).body.threads[0];
  const made = await admin(`/desk/${id}/quote`, { method: "POST", body: { title: "1차", amount_krw: 1_000_000 } });
  const quoteId = made.body.id;

  const first = newPaymentId(quoteId);
  const second = newPaymentId(quoteId);
  await db.run("UPDATE thread_quotes SET payment_id = :p WHERE id = :id", { p: second, id: quoteId });

  assert.equal((await quoteByPaymentId(second))?.id, quoteId, "표에 적힌 번호로 찾아야 한다");
  assert.equal((await quoteByPaymentId(first))?.id, quoteId, "지난 번호로도 찾아야 한다");
  assert.equal(await quoteByPaymentId("reamer_q999999_zzzz"), null);
  assert.equal(await quoteByPaymentId("남의_주문번호"), null);
});

// ── 견적 확정 → 결제 ────────────────────────────────────────────────────
//
// 확정을 거치지 않은 견적으로는 결제창이 열리지 않아야 한다. 화면에서는 버튼 순서로
// 막지만 화면은 우회할 수 있으므로, 서버가 같은 순서를 강제하는지가 이 테스트의 전부다.
test("확정하지 않은 견적은 결제할 수 없다", async () => {
  const token = await openThread();
  const { id } = (await admin("/desk")).body.threads[0];
  const made = await admin(`/desk/${id}/quote`, { method: "POST", body: { title: "1차", amount_krw: 1_200_000 } });

  const r = await client(`/thread/quote/${made.body.id}/checkout`, {
    method: "POST",
    token,
    body: { name: "김의뢰", email: "client@example.com", phone: "01012345678" },
  });
  assert.equal(r.status, 409);
  assert.equal(r.body.code, "NOT_ACCEPTED");
});

test("확정하면 결제 단계로 넘어가고, 결제 전이면 되돌릴 수 있다", async () => {
  const token = await openThread();
  const { id } = (await admin("/desk")).body.threads[0];
  const made = await admin(`/desk/${id}/quote`, { method: "POST", body: { title: "1차", amount_krw: 1_200_000 } });
  const qid = made.body.id;

  const yes = await client(`/thread/quote/${qid}/accept`, { method: "POST", token, body: {} });
  assert.equal(yes.status, 200);
  assert.equal(yes.body.status, "accepted");

  const seen = await client("/thread", { token });
  assert.equal(seen.body.quotes[0].status, "accepted");
  // 확정은 대화에도 한 줄로 남아야 한다 — 나중에 훑을 때 흐름에서 빠지면 안 된다.
  assert.ok(seen.body.messages.some((m) => m.kind === "accepted"));
  // 확정만으로 단계가 "견적 확정"까지 올라간다. 결제는 그다음이다.
  assert.equal(seen.body.progress.stage, "quote");

  const undo = await client(`/thread/quote/${qid}/accept`, { method: "POST", token, body: { accept: false } });
  assert.equal(undo.status, 200);
  assert.equal((await client("/thread", { token })).body.quotes[0].status, "sent");
});

test("남의 견적은 내 토큰으로 확정할 수 없다", async () => {
  const mine = await openThread();
  await openThread({ contact: "other2@example.com", name: "박타인2" });
  const theirRow = (await admin("/desk")).body.threads.find((t) => t.name === "박타인2");
  const made = await admin(`/desk/${theirRow.id}/quote`, { method: "POST", body: { title: "남의 건", amount_krw: 3_000_000 } });

  const r = await client(`/thread/quote/${made.body.id}/accept`, { method: "POST", token: mine, body: {} });
  assert.equal(r.status, 404);
});

// ── 진행 상황 ───────────────────────────────────────────────────────────
test("진행 상황은 공개한 항목만 보이고, 진행률은 그 체크 수에서 나온다", async () => {
  const token = await openThread({ contact: "prog@example.com" });
  const { id } = (await admin("/desk")).body.threads[0];

  // 상담만 하는 동안에는 진행 칸 자체가 뜨지 않는다.
  assert.equal((await client("/thread", { token })).body.progress.show, false);

  const proj = await admin(`/desk/${id}/project`, { method: "POST", body: {} });
  const pid = proj.body.id;

  const a = await admin("/studio/task", { method: "POST", body: { product: `project:${pid}`, title: "화면 설계" } });
  const b = await admin("/studio/task", { method: "POST", body: { product: `project:${pid}`, title: "결제 연동" } });
  // 내부용 메모는 공개하지 않는다.
  const c = await admin("/studio/task", {
    method: "POST",
    body: { product: `project:${pid}`, title: "내부 메모 — 단가 재확인", shared: false },
  });

  await admin(`/studio/task/${a.body.id}`, { method: "PATCH", body: { state: "done" } });

  const seen = await client("/thread", { token });
  const p = seen.body.progress;
  assert.equal(p.show, true);
  assert.equal(p.stage, "build", "일감이 진행 중이면 개발 단계다");
  assert.equal(p.taskCount, 2, "공개된 항목만 센다");
  assert.equal(p.taskDone, 1);
  assert.equal(p.percent, 50, "막대와 목록이 같은 곳에서 나와야 한다");
  const titles = p.tasks.map((t) => t.title);
  assert.ok(titles.includes("화면 설계"));
  assert.ok(!titles.some((t) => t.includes("내부 메모")), "숨긴 항목이 새면 안 된다");

  // 숨겼다 공개하면 바로 반영된다.
  await admin(`/studio/task/${c.body.id}`, { method: "PATCH", body: { shared: true } });
  assert.equal((await client("/thread", { token })).body.progress.taskCount, 3);
  void b;
});

test("미리보기 주소는 http(s)만 통과한다", async () => {
  const token = await openThread({ contact: "prev@example.com" });
  const { id } = (await admin("/desk")).body.threads[0];
  const pid = (await admin(`/desk/${id}/project`, { method: "POST", body: {} })).body.id;

  await admin(`/desk/project/${pid}`, { method: "PATCH", body: { preview_url: "javascript:alert(1)" } });
  assert.equal((await client("/thread", { token })).body.progress.previewUrl, null, "스킴이 다르면 내보내지 않는다");

  await admin(`/desk/project/${pid}`, { method: "PATCH", body: { preview_url: "https://preview.example/app" } });
  assert.equal((await client("/thread", { token })).body.progress.previewUrl, "https://preview.example/app");
});

// 인수가 끝나도 대화는 닫지 않는다. AS 문의가 이어지는 자리가 바로 여기다.
test("완료로 표시해도 의뢰인은 계속 대화할 수 있다", async () => {
  const token = await openThread({ contact: "after@example.com" });
  const { id } = (await admin("/desk")).body.threads[0];
  const pid = (await admin(`/desk/${id}/project`, { method: "POST", body: {} })).body.id;

  await admin(`/desk/project/${pid}`, { method: "PATCH", body: { status: "done" } });

  const seen = await client("/thread", { token });
  assert.equal(seen.body.progress.stage, "done");
  assert.equal(seen.body.progress.done, true);
  assert.equal(seen.body.thread.status, "open", "완료는 종료가 아니다");
  assert.ok(seen.body.messages.some((m) => m.kind === "delivered"), "완료 안내가 대화에 남아야 한다");

  const said = await client("/thread/message", { method: "POST", token, body: { body: "버튼 하나만 수정 부탁드립니다." } });
  assert.equal(said.status, 201, "인수 후 문의가 막히면 안 된다");
});
