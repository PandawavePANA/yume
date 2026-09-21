// 문맥 복구 — 입력 검증과 문을 지키는지. Claude는 부르지 않는다(키가 없으면
// 그 앞에서 전부 걸러져야 한다는 것이 여기서 보려는 것이다).
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yume-repair-"));
process.env.DATA_DIR = dir;
process.env.PGLITE_DIR = "memory://";
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
else delete process.env.DATABASE_URL;
delete process.env.ANTHROPIC_API_KEY;

const { default: app } = await import("../app.js");
const db = await import("../db.js");
const { MIN_TRANSCRIPT_CHARS, MAX_TRANSCRIPT_CHARS } = await import("../contextRepair.js");

let server, base;
before(() => new Promise((r) => { server = app.listen(0, "127.0.0.1", () => { base = `http://127.0.0.1:${server.address().port}`; r(); }); }));
after(async () => { server.close(); await db.closeDb(); fs.rmSync(dir, { recursive: true, force: true }); });

let ip = 0;
const post = (body) => fetch(`${base}/api/context-repair`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Forwarded-For": `10.4.0.${(ip += 1)}` },
  body: JSON.stringify(body),
});

test("빈 입력은 받지 않는다", async () => {
  const r = await post({ transcript: "   " });
  assert.equal(r.status, 400);
  assert.match((await r.json()).error, /붙여넣어/);
});

test("너무 짧으면 무엇이 부족한지 알려준다", async () => {
  const r = await post({ transcript: "안녕" });
  assert.equal(r.status, 400);
  assert.match((await r.json()).error, /짧/);
});

test("한도를 넘으면 자르라고 안내한다", async () => {
  const r = await post({ transcript: "가".repeat(MAX_TRANSCRIPT_CHARS + 1) });
  assert.equal(r.status, 413);
  assert.match((await r.json()).error, /잘라서|까지/);
});

test("길이가 맞으면 검증을 통과해 실제 처리까지 간다", async () => {
  // Claude 키가 없는 환경이라 상류에서 실패한다. 400/413이 아니라는 것이 핵심 —
  // 입력 검증을 지나 파이프라인에 도달했다는 뜻이다.
  const r = await post({ transcript: "나: 예산은 500만원입니다.\n".repeat(20) });
  assert.ok(r.status !== 400 && r.status !== 413, `입력 검증에서 걸리면 안 된다 (${r.status})`);
});

test("한 IP가 계속 밀어 넣지 못한다", async () => {
  const body = { transcript: "나: 문맥 테스트 대화입니다.\n".repeat(20) };
  let blocked = 0;
  for (let i = 0; i < 6; i += 1) {
    const r = await fetch(`${base}/api/context-repair`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-For": "10.4.9.9" },
      body: JSON.stringify(body),
    });
    if (r.status === 429) blocked += 1;
  }
  assert.ok(blocked > 0, "분당 제한에 걸린 요청이 있어야 한다");
});

test("한도 상수는 화면과 같은 값을 쓴다", () => {
  // 화면(ContextRepairCard)이 200/60000을 직접 들고 있다. 서버가 더 좁아지면
  // 사용자는 버튼을 누를 수 있는데 서버가 거절하는 상태가 된다.
  assert.equal(MIN_TRANSCRIPT_CHARS, 200);
  assert.equal(MAX_TRANSCRIPT_CHARS, 60000);
});
