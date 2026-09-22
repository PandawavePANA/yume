// 개발 외주 문의 접수 — 리머 소개 사이트에서 오는 교차 출처 요청.
//
// 여기서 지키려는 건 하나다: **문의는 잃어버리면 안 된다.** 메일 발송은 실패할 수 있으니
// 접수의 기준은 DB에 남았는지이고, 메일 설정이 없어도 접수는 성공해야 한다.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yume-inquiry-"));
process.env.DATA_DIR = dir;
process.env.PGLITE_DIR = "memory://";
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
else delete process.env.DATABASE_URL;
process.env.INQUIRY_ALLOWED_ORIGINS = "https://www.d-reamer.com";
delete process.env.ANTHROPIC_API_KEY;
// 메일 설정이 없는 상태를 일부러 유지한다 — 배포 직후가 정확히 이 상태다.
delete process.env.RESEND_API_KEY;
delete process.env.SMTP_HOST;

const { default: app } = await import("../app.js");
const db = await import("../db.js");

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

let ipSeq = 0;
// 요청 제한이 IP 기준이라 케이스마다 다른 IP로 보낸다.
const post = (body, headers = {}) =>
  fetch(`${base}/api/inquiry`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-For": `10.9.0.${(ipSeq += 1)}`, ...headers },
    body: JSON.stringify(body),
  });

const ok = {
  name: "김철수",
  contact: "test@example.com",
  kind: "web",
  budget: "500-1000",
  message: "쇼핑몰을 하나 만들고 싶습니다. 결제까지 되면 좋겠어요.",
};

test("메일 설정이 없어도 접수되고 DB에 남는다", async () => {
  const res = await post(ok);
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.ok, true);
  // 접수와 동시에 대화방이 열리고, 그 링크를 돌려준다. 메일이 안 나가는 상태에서도
  // 화면에서 바로 들어갈 수 있어야 한다 — 배포 직후가 정확히 그 상태다.
  assert.match(body.threadUrl, /\/t#[\w-]{20,}$/);

  const row = await db.one("SELECT * FROM inquiries ORDER BY id DESC LIMIT 1");
  assert.equal(row.name, "김철수");
  assert.equal(row.contact, "test@example.com");
  // 코드가 아니라 사람이 읽을 라벨로 저장한다 — 메일함에서 그대로 읽히게.
  assert.equal(row.kind, "웹사이트 · 웹서비스");
  assert.equal(row.budget, "500만~1,000만원");
  assert.match(row.message, /쇼핑몰/);
});

test("이름·연락처가 없거나 내용이 너무 짧으면 받지 않는다", async () => {
  for (const bad of [{ ...ok, name: "" }, { ...ok, contact: "  " }, { ...ok, message: "짧음" }]) {
    const res = await post(bad);
    assert.equal(res.status, 400, JSON.stringify(bad));
    assert.ok((await res.json()).error, "무엇이 문제인지 알려줘야 한다");
  }
});

test("보이지 않는 칸이 채워지면 접수한 척하고 버린다", async () => {
  const before = (await db.one("SELECT COUNT(*) AS n FROM inquiries")).n;
  const res = await post({ ...ok, name: "봇", website: "http://spam.example" });
  // 400을 주면 무엇이 걸렸는지 알려 주는 셈이라 성공처럼 답한다.
  assert.equal(res.status, 201);
  assert.equal((await db.one("SELECT COUNT(*) AS n FROM inquiries")).n, before, "저장되면 안 된다");
});

// 양식이 넷으로 줄면서 종류는 더 이상 묻지 않는다. 예전 양식이 아직 떠 있는
// 브라우저가 보내오는 값은 계속 받고, 없거나 모르는 값이면 기본값으로 떨어진다.
test("종류를 보내지 않거나 모르는 값이면 기본값으로 떨어진다", async () => {
  await post({ ...ok, kind: "지어낸값", budget: "지어낸값" });
  const guessed = await db.one("SELECT * FROM inquiries ORDER BY id DESC LIMIT 1");
  assert.equal(guessed.kind, "개발 문의");
  assert.equal(guessed.budget, "아직 미정");

  const { kind, ...noKind } = ok;
  void kind;
  await post(noKind);
  const row = await db.one("SELECT * FROM inquiries ORDER BY id DESC LIMIT 1");
  assert.equal(row.kind, "개발 문의");
  assert.equal(row.budget, "500만~1,000만원");
  assert.equal(row.company, null, "회사는 이제 묻지 않는다");
});

// 이 테스트는 AUDIT_ALLOWED_ORIGINS를 일부러 비워 둔 채 돈다. 감사 API도 app.use("/api", ...)로
// 얹히므로, 감사 쪽 CORS가 라우터 전역에 달려 있으면 문의 프리플라이트를 자기 허용목록으로
// 판단해 403으로 끊는다. 브라우저는 그러면 본 요청을 아예 보내지 않아 양식이 조용히 죽는다.
test("허용한 출처에만 교차 출처를 열어 준다 (옆 라우터가 가로채지 않는다)", async () => {
  assert.ok(!process.env.AUDIT_ALLOWED_ORIGINS, "감사 허용목록은 비어 있어야 의미가 있는 테스트다");
  const allowed = "https://www.d-reamer.com";
  const pre = await fetch(`${base}/api/inquiry`, { method: "OPTIONS", headers: { Origin: allowed } });
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get("access-control-allow-origin"), allowed);

  const other = await fetch(`${base}/api/inquiry`, { method: "OPTIONS", headers: { Origin: "https://evil.example" } });
  assert.equal(other.status, 403);
  assert.equal(other.headers.get("access-control-allow-origin"), null);
});

test("한 IP가 계속 밀어 넣지 못한다", async () => {
  const ip = "10.9.9.9";
  const send = () => post(ok, { "X-Forwarded-For": ip });
  let blocked = 0;
  for (let i = 0; i < 12; i += 1) if ((await send()).status === 429) blocked += 1;
  assert.ok(blocked > 0, "제한에 걸린 요청이 있어야 한다");
});
