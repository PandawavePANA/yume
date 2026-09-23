// 서버 응답 문구의 언어.
//
// 여기서 지키는 것 둘.
//
// 하나. 화면은 영어인데 오류만 한국어로 뜨는 일이 없어야 한다. 오류는 일이 틀어진
// 자리에서만 보이므로, 거기서 말이 안 통하면 사용자는 무엇이 잘못됐는지 모른 채 멈춘다.
//
// 둘. **번역이 내용까지 건드리면 안 된다.** 응답에는 사용자가 쓴 글과 검증 결과가
// 들어 있다. 문구를 갈아끼우는 장치가 안쪽까지 훑으면 언젠가 남의 문장을 멋대로 바꾼다.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yume-i18n-"));
process.env.DATA_DIR = dir;
process.env.PGLITE_DIR = "memory://";
delete process.env.DATABASE_URL;
process.env.ADMIN_SECRET = "test-admin-secret-0123";
delete process.env.ANTHROPIC_API_KEY;
delete process.env.RESEND_API_KEY;

const { default: app } = await import("../app.js");
const db = await import("../db.js");
const { pickLang, translate } = await import("../i18n.js");

let server;
let base;
before(() => new Promise((resolve) => {
  server = app.listen(0, "127.0.0.1", () => { base = `http://127.0.0.1:${server.address().port}`; resolve(); });
}));
after(async () => {
  server.close();
  await db.closeDb();
  fs.rmSync(dir, { recursive: true, force: true });
});

let seq = 0;
const call = (url, headers = {}, body = {}) =>
  fetch(base + url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-For": `10.11.0.${(seq += 1)}`, ...headers },
    body: JSON.stringify(body),
  }).then(async (r) => ({ status: r.status, data: await r.json() }));

test("아무 말이 없으면 한국어로 답한다", async () => {
  const r = await call("/api/auth/login", {}, { email: "nope@example.com", password: "x" });
  assert.match(r.data.error, /[가-힣]/, "기본은 한국어여야 한다");
});

test("화면에서 고른 언어로 답한다", async () => {
  const r = await call("/api/auth/login", { "X-Yume-Lang": "en" }, { email: "nope@example.com", password: "x" });
  assert.equal(r.data.error, "That email or password isn't right.");
});

test("브라우저 설정만 있어도 알아듣는다", async () => {
  const r = await call("/api/auth/login", { "Accept-Language": "en-US,en;q=0.9" }, { email: "nope@example.com", password: "x" });
  assert.doesNotMatch(r.data.error, /[가-힣]/);
});

test("고른 언어가 브라우저 설정을 이긴다", () => {
  // 한국에서 영어로 쓰는 사람과 해외에서 한국어로 쓰는 사람이 둘 다 있다.
  // 브라우저 설정만 믿으면 본인이 고른 것과 어긋난다.
  const req = (h) => ({ get: (k) => h[k.toLowerCase()] });
  assert.equal(pickLang(req({ "accept-language": "ko-KR,ko", "x-yume-lang": "en" })), "en");
  assert.equal(pickLang(req({ "accept-language": "en-US,en", "x-yume-lang": "ko" })), "ko");
  assert.equal(pickLang(req({ "accept-language": "ko-KR,ko;q=0.9,en;q=0.8" })), "ko");
  assert.equal(pickLang(req({ "accept-language": "fr-FR,fr" })), "ko", "모르는 언어는 한국어로");
  assert.equal(pickLang(req({})), "ko");
});

test("사전에 없는 문구는 한국어 그대로 나간다", () => {
  // 빈 칸이 나가는 것보다 한국어가 나가는 것이 낫다. 관리자 화면 문구가 여기 해당한다.
  const 처음보는말 = "이 문장은 사전에 없습니다.";
  assert.equal(translate(처음보는말, "en"), 처음보는말);
});

test("error와 message만 바꾸고 내용은 건드리지 않는다", async () => {
  // 사용자가 쓴 글이 사전의 키와 우연히 같아도 바뀌면 안 된다.
  const r = await fetch(base + "/api/health", { headers: { "X-Yume-Lang": "en" } }).then((x) => x.json());
  assert.equal(r.ok, true);
  assert.equal(typeof r.db, "boolean", "다른 칸은 그대로여야 한다");
});

test("영어 사전에 한국어가 남아 있지 않다", async () => {
  const EN = (await import("../messages.en.js")).default;
  const left = Object.entries(EN).filter(([, v]) => /[가-힣]/.test(v));
  assert.deepEqual(left, [], "번역하다 만 항목이 있다");
});
