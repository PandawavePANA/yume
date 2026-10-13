// 검사 엔진 멈춤(잔액 소진·키 오류) — 돈을 받지 않고, 차감·과금 없이 돌려보내고, 충전되면 저절로 풀린다.
import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yume-engine-"));
process.env.DATA_DIR = dir;
process.env.PGLITE_DIR = "memory://";
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
else delete process.env.DATABASE_URL;
process.env.ADMIN_SECRET = "test-admin-secret-0123";
delete process.env.ANTHROPIC_API_KEY;

const { default: app } = await import("../app.js");
const db = await import("../db.js");
const up = await import("../upstream.js");
const { createApiKey } = await import("../apiKeys.js");

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
beforeEach(() => up.resetEngineState());

const creditErr = () => up.classifyUpstream(new Error("Your credit balance is too low to access the Anthropic API."), 400);

test("멈춤 규칙: 잔액 소진·키 오류만 멈춤, 과부하는 아니다 · 성공하면 풀리고 알림이 한 번씩", () => {
  const events = [];
  up.onEngineState({ down: (s) => events.push(`down:${s.code}`), recover: (s) => events.push(`up:${s.code}`) });
  up.noteUpstreamFailure(up.classifyUpstream(new Error("Overloaded"), 529));
  assert.equal(up.engineStopped(), null, "과부하는 저절로 풀리므로 멈춤이 아니다");

  up.noteUpstreamFailure(creditErr());
  up.noteUpstreamFailure(creditErr());
  assert.equal(up.engineStopped(), "credit_exhausted");
  assert.equal(up.engineGate(), "credit_exhausted", "막 실패했으면 다음 요청은 막는다");
  assert.equal(up.upstreamStatus().stopped, true);
  assert.deepEqual(events, ["down:credit_exhausted"], "같은 원인은 한 번만 알린다");

  up.noteUpstreamSuccess();
  assert.equal(up.engineStopped(), null);
  assert.equal(up.engineGate(), null);
  assert.deepEqual(events, ["down:credit_exhausted", "up:credit_exhausted"]);
  up.onEngineState({});
});

test("멈춘 뒤 5분이 지나면 한 요청은 통과시켜 다시 확인한다", () => {
  const realNow = Date.now;
  try {
    up.noteUpstreamFailure(creditErr());
    assert.equal(up.engineGate(), "credit_exhausted");
    const t0 = realNow();
    Date.now = () => t0 + 6 * 60 * 1000;
    assert.equal(up.engineGate(), null, "확인용으로 한 번 통과");
    assert.equal(up.engineGate(), "credit_exhausted", "바로 다음 요청은 다시 막는다");
    assert.equal(up.engineStopped(), "credit_exhausted", "결제는 시험 통과를 허락하지 않는다");
  } finally {
    Date.now = realNow;
  }
});

test("웹 검사·기업 API: 멈춘 동안 차감·과금 없이 돌려보내고, 상태 점검에 보인다", async () => {
  up.noteUpstreamFailure(creditErr());

  const v = await fetch(`${base}/api/verify`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: "대한민국의 수도는 서울이다." }) });
  assert.equal(v.status, 503);
  const vj = await v.json();
  assert.equal(vj.code, "ENGINE_PAUSED");
  assert.match(vj.error, /서비스 쪽 문제/);

  const t = Date.now();
  const u = await db.run("INSERT INTO users (email, password_hash, terms_agreed_at, privacy_agreed_at, created_at) VALUES ('api@co.kr', 'x', :t, :t, :t) RETURNING id", { t });
  const { key } = await createApiKey({ id: u.rows[0].id }, "test");
  const a = await fetch(`${base}/v1/verify`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, body: JSON.stringify({ text: "대한민국의 수도는 서울이다." }) });
  assert.equal(a.status, 503);
  assert.equal(a.headers.get("retry-after"), "300");
  const aj = await a.json();
  assert.equal(aj.error.code, "engine_unavailable");
  const billed = await db.one("SELECT COUNT(*)::int AS n FROM api_usage WHERE billable = 1");
  assert.equal(Number(billed.n), 0, "멈춤으로 돌려보낸 요청은 과금하지 않는다");

  const h = await (await fetch(`${base}/api/health`)).json();
  assert.equal(h.upstream.stopped, true);
  assert.equal(h.upstream.code, "credit_exhausted");
});
