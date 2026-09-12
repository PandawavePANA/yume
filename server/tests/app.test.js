// 서버 통합 테스트 — 임시 DB로 앱을 띄워 HTTP로 흐름 전체를 확인한다. Claude는 호출하지 않는다
// (API 검증 흐름은 같은 텍스트의 완료된 검증을 DB에 먼저 넣어 캐시 경로로 확인).
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yume-test-"));
process.env.DATA_DIR = dir;
process.env.PGLITE_DIR = "memory://";
// TEST_DATABASE_URL을 주면 실제 Postgres 서버(pg 드라이버 경로)로, 없으면 메모리 PGlite로 돈다.
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
else delete process.env.DATABASE_URL;
process.env.ADMIN_EMAILS = "admin@yume.test";
process.env.ADMIN_SECRET = "test-admin-secret-0123";
process.env.DATASET_SALT = "test-salt";
delete process.env.ANTHROPIC_API_KEY;

const { default: app } = await import("../app.js");
const db = await import("../db.js");
const store = await import("../verificationStore.js");
const { buildNecReport, NEC_WEIGHTS } = await import("../nec/nec.js");
const { checkCaseNumber } = await import("../nec/identifiers.js");
const { coverageFor } = await import("../nec/searchSpace.js");

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

// 클라이언트마다 다른 IP로 보이게 한다(가입·로그인 요청 제한이 IP 기준이라).
let clientSeq = 0;
function client() {
  let cookie = "";
  const ip = `10.0.0.${(clientSeq += 1)}`;
  return async function call(method, url, body, headers = {}) {
    const res = await fetch(base + url, {
      method,
      headers: { "X-Forwarded-For": ip, ...(body ? { "Content-Type": "application/json" } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.getSetCookie?.() || [];
    for (const c of set) {
      const [pair] = c.split(";");
      cookie = pair.endsWith("=") ? "" : pair;
    }
    const type = res.headers.get("content-type") || "";
    const data = type.includes("json") ? await res.json() : await res.text();
    return { status: res.status, data, headers: res.headers };
  };
}

const signupBody = (email, extra = {}) => ({ email, password: "passw0rd!", name: "테스터", agreeTerms: true, agreePrivacy: true, ...extra });

async function seedVerification({ id, userId = null, apiKeyId = null, source = "web", input, dataConsent = false, claims }) {
  await store.createVerification({ id, source, userId, apiKeyId, clientKey: userId ? `user:${userId}` : "ip:1.1.1.1", input, dataConsent });
  await store.completeVerification(id, {
    overall_domain: claims[0].domain,
    summary: null,
    claims,
    overall: { label: "부분적으로 부정확", tone: "false", detail: "테스트" },
    related_products: [],
  });
}

test("회원가입 검증과 세션", async () => {
  const c = client();
  assert.equal((await c("POST", "/api/auth/signup", { ...signupBody("a@yume.test"), agreeTerms: false })).status, 400);
  assert.equal((await c("POST", "/api/auth/signup", { ...signupBody("a@yume.test"), password: "short" })).status, 400);
  assert.equal((await c("POST", "/api/auth/signup", { ...signupBody("not-an-email") })).status, 400);
  const ok = await c("POST", "/api/auth/signup", signupBody("a@yume.test"));
  assert.equal(ok.status, 201);
  assert.equal(ok.data.user.plan, "free");
  assert.equal(ok.data.user.password_hash, undefined);
  assert.equal((await c("POST", "/api/auth/signup", signupBody("A@yume.test"))).status, 409, "이메일은 대소문자 무시");
  const me = await c("GET", "/api/auth/me");
  assert.equal(me.data.user.email, "a@yume.test");
  await c("POST", "/api/auth/logout");
  assert.equal((await c("GET", "/api/auth/me")).data.user, null);
  const login = await c("POST", "/api/auth/login", { email: "a@yume.test", password: "passw0rd!" });
  assert.equal(login.status, 200);
});

test("로그인 실패가 반복되면 올바른 비밀번호도 잠시 막힌다", async () => {
  const c = client();
  await c("POST", "/api/auth/signup", signupBody("lock@yume.test"));
  for (let i = 0; i < 6; i += 1) assert.equal((await c("POST", "/api/auth/login", { email: "lock@yume.test", password: "wrong-pass1" })).status, 401);
  assert.equal((await c("POST", "/api/auth/login", { email: "lock@yume.test", password: "passw0rd!" })).status, 429);
});

test("다른 출처에서 온 쿠키 요청은 거절(CSRF)", async () => {
  const c = client();
  const r = await c("POST", "/api/auth/login", { email: "a@yume.test", password: "passw0rd!" }, { Origin: "https://evil.example" });
  assert.equal(r.status, 403);
});

test("비회원 사용량과 입력 검증", async () => {
  const c = client();
  const u = await c("GET", "/api/usage");
  assert.equal(u.data.remainingFree, 5);
  assert.equal((await c("POST", "/api/verify", { text: "  " })).status, 400);
  assert.equal((await c("POST", "/api/verify", { text: "가".repeat(10_001) })).status, 413);
  const h = await c("GET", "/api/health");
  assert.equal(h.data.db, true);
});

test("API 키 발급 → 캐시 경로로 검증 → 소유권·한도", async () => {
  const owner = client();
  await owner("POST", "/api/auth/signup", signupBody("biz@yume.test", { company: "테스트AI" }));
  assert.equal((await client()("POST", "/api/account/api-keys", { label: "x" })).status, 401, "로그인 필요");
  const created = await owner("POST", "/api/account/api-keys", { label: "운영 서버" });
  assert.equal(created.status, 201);
  const key = created.data.key;
  assert.match(key, /^yume_live_[0-9a-f]{48}$/);
  const list = await owner("GET", "/api/account/api-keys");
  assert.ok(!JSON.stringify(list.data).includes(key), "목록에는 원문 키가 없어야 함");

  const auth = { Authorization: `Bearer ${key}` };
  const noKey = await fetch(`${base}/v1/usage`);
  assert.equal(noKey.status, 401);
  assert.equal((await noKey.json()).error.code, "invalid_api_key");

  const usage = await (await fetch(`${base}/v1/usage`, { headers: auth })).json();
  assert.equal(usage.month.quota, 100);

  const bad = await fetch(`${base}/v1/verify`, { method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: "{}" });
  assert.equal(bad.status, 400);
  const brokenJson = await fetch(`${base}/v1/verify`, { method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: "{oops" });
  assert.equal(brokenJson.status, 400);

  const text = "대법원 2019다123456 판결은 모든 계약을 무효로 본다.";
  const nec = buildNecReport({
    identifier: checkCaseNumber("2019다123456"),
    spaceKey: "case_supreme",
    coverage: coverageFor("case_supreme", ["law.go.kr:prec", "law.go.kr:citation", "web"].map((id) => ({ id, ok: true }))),
    weights: NEC_WEIGHTS.legal,
  });
  await seedVerification({
    id: "seedapi0000000001",
    input: text,
    claims: [{ text: "대법원 2019다123456 판결은 모든 계약을 무효로 본다.", domain: "법률", verdict: "false", verified_via: "nec", explanation: "부존재", sources: [], nec }],
  });

  const r = await fetch(`${base}/v1/verify`, { method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
  assert.equal(r.status, 200);
  const job = await r.json();
  assert.equal(job.status, "done");
  assert.equal(job.cached, true);
  assert.equal(job.result.claims[0].verified_via, "nec");
  assert.equal(job.result.claims[0].nec.grade, "nonexistent");
  assert.equal(job.usage.used, 1);
  assert.equal(job.result.related_products, undefined, "API 응답에는 제휴 상품을 넣지 않음");

  const fetched = await fetch(`${base}/v1/verify/${job.id}`, { headers: auth });
  assert.equal(fetched.status, 200);

  const other = client();
  await other("POST", "/api/auth/signup", signupBody("other@yume.test"));
  const otherKey = (await other("POST", "/api/account/api-keys", { label: "남의 키" })).data.key;
  assert.equal((await fetch(`${base}/v1/verify/${job.id}`, { headers: { Authorization: `Bearer ${otherKey}` } })).status, 404, "다른 계정의 검증은 조회 불가");

  // 한도를 1로 낮추면 다음 요청은 거절(과금 안 됨)
  const keyId = created.data.record.id;
  const admin = client();
  await admin("POST", "/api/auth/signup", signupBody("admin@yume.test"));
  assert.equal((await admin("PATCH", `/api/admin/api-keys/${keyId}`, { monthlyQuota: 1 })).status, 200);
  const over = await fetch(`${base}/v1/verify`, { method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
  assert.equal(over.status, 429);
  assert.equal((await over.json()).error.code, "quota_exceeded");

  // 폐기된 키는 즉시 거절
  await owner("DELETE", `/api/account/api-keys/${keyId}`);
  assert.equal((await fetch(`${base}/v1/usage`, { headers: auth })).status, 401);

  const report = await admin("GET", "/api/admin/billing");
  assert.ok(report.data.rows.some((row) => row.email === "biz@yume.test" && row.billable_calls === 1));
});

test("관리자 권한", async () => {
  const user = client();
  await user("POST", "/api/auth/signup", signupBody("plain@yume.test"));
  assert.equal((await user("GET", "/api/admin/overview")).status, 401);
  const admin = client();
  const login = await admin("POST", "/api/auth/login", { email: "admin@yume.test", password: "passw0rd!" });
  assert.equal(login.data.user.role, "admin");
  const ov = await admin("GET", "/api/admin/overview");
  assert.equal(ov.status, 200);
  assert.equal(ov.data.series.length, 30);
  const bySecret = await fetch(`${base}/api/admin/db`, { headers: { "X-Admin-Key": process.env.ADMIN_SECRET } });
  assert.equal(bySecret.status, 200);
  assert.equal((await fetch(`${base}/api/admin/db`, { headers: { "X-Admin-Key": "wrong" } })).status, 401);
});

test("데이터셋: 동의한 데이터만, 가명처리해서, 기록을 남기고 반출", async () => {
  const consenting = client();
  const s1 = await consenting("POST", "/api/auth/signup", signupBody("consent@yume.test", { dataConsent: true }));
  const refusing = client();
  const s2 = await refusing("POST", "/api/auth/signup", signupBody("refuse@yume.test"));

  await seedVerification({
    id: "seedds00000000001",
    userId: s1.data.user.id,
    input: "김철수 씨가 말하길 010-1234-5678로 연락하라고… 원문 전체",
    dataConsent: true,
    claims: [
      { text: "김철수 씨는 2020-12-10에 서울 테헤란로 123에서 계약했다", domain: "법률", verdict: "uncertain", verified_via: "web", explanation: "연락처 010-1234-5678", sources: [{ title: "t", url: "https://ex.com/a?token=secret" }] },
      { text: "비타민 C는 감기를 완전히 예방한다", domain: "의료", verdict: "false", verified_via: "web", explanation: "근거 없음", sources: [] },
    ],
  });
  await seedVerification({
    id: "seedds00000000002",
    userId: s2.data.user.id,
    input: "동의 안 한 사람의 원문",
    dataConsent: false,
    claims: [{ text: "동의하지 않은 주장", domain: "일반", verdict: "confirmed", verified_via: "web", explanation: "", sources: [] }],
  });

  const admin = client();
  await admin("POST", "/api/auth/login", { email: "admin@yume.test", password: "passw0rd!" });
  const stats = await admin("GET", "/api/admin/dataset/stats");
  assert.equal(stats.data.eligibleClaims, 2, "동의한 사용자의 주장 2개만");

  const preview = await admin("POST", "/api/admin/dataset/preview", { filters: {} });
  const dump = JSON.stringify(preview.data.sample);
  assert.ok(!dump.includes("010-1234-5678"), "전화번호 가림");
  assert.ok(!dump.includes("김철수"), "호칭 붙은 이름 가림");
  assert.ok(!dump.includes("원문 전체") && !dump.includes("동의하지 않은"), "원문·비동의 데이터 제외");
  assert.ok(dump.includes("2020-12-10"), "날짜는 보존");
  assert.ok(!dump.includes("token=secret"), "출처 URL의 쿼리스트링 제거");
  assert.ok(!dump.includes("consent@yume.test"));

  assert.equal((await admin("POST", "/api/admin/dataset/exports", { filters: {} })).status, 400, "구매처·목적 필수");
  const ex = await admin("POST", "/api/admin/dataset/exports", { filters: { verdicts: ["false"] }, buyer: "테스트 연구소", purpose: "할루시네이션 연구", maxDownloads: 1 });
  assert.equal(ex.status, 201);
  assert.equal(ex.data.recordCount, 1);
  const dlPath = new URL(ex.data.downloadUrl).pathname;
  const dl = await fetch(base + dlPath);
  assert.equal(dl.status, 200);
  const lines = (await dl.text()).trim().split("\n").map((l) => JSON.parse(l));
  assert.equal(lines.length, 1);
  assert.equal(lines[0].verdict, "false");
  assert.match(lines[0].month, /^\d{4}-\d{2}$/);
  assert.equal((await fetch(base + dlPath)).status, 410, "다운로드 횟수 초과");

  const audit = await admin("GET", "/api/admin/audit");
  assert.ok(audit.data.logs.some((l) => l.action === "data_export_created"));
  assert.ok(audit.data.logs.some((l) => l.action === "data_export_downloaded"));

  // 동의를 철회하면 즉시 반출 대상에서 빠진다
  await consenting("PATCH", "/api/account", { dataConsent: false });
  assert.equal((await admin("GET", "/api/admin/dataset/stats")).data.eligibleClaims, 0);
});

test("검증 기록·결과 페이지·내 데이터 내려받기·탈퇴", async () => {
  const c = client();
  const s = await c("POST", "/api/auth/signup", signupBody("leaver@yume.test"));
  const uid = s.data.user.id;
  const nec = buildNecReport({ identifier: checkCaseNumber("1985헌마123"), spaceKey: "case_constitutional", skippedSearch: true, weights: NEC_WEIGHTS.legal });
  await seedVerification({ id: "seedme00000000001", userId: uid, input: "내 검증 원문", claims: [{ text: "1985헌마123 결정", domain: "법률", verdict: "false", verified_via: "nec", explanation: "부존재", sources: [], nec }] });

  const hist = await c("GET", "/api/history");
  assert.equal(hist.data.items.length, 1);
  const one = await c("GET", `/api/history/${hist.data.items[0].id}`);
  assert.equal(one.data.input, "내 검증 원문");
  assert.equal((await client()("GET", `/api/history/${hist.data.items[0].id}`)).status, 401);

  const page = await fetch(`${base}/r/seedme00000000001`);
  const html = await page.text();
  assert.ok(html.includes("부존재 신뢰도") && html.includes("외부 조회 없이"));

  const mine = await c("GET", "/api/account/export");
  assert.equal(mine.data.verifications.length, 1);

  assert.equal((await c("DELETE", "/api/account", { password: "wrong0000" })).status, 400);
  assert.equal((await c("DELETE", "/api/account", { password: "passw0rd!" })).status, 200);
  assert.equal((await db.one("SELECT COUNT(*) AS n FROM users WHERE id = :id", { id: uid })).n, 0);
  assert.equal((await db.one("SELECT COUNT(*) AS n FROM verifications WHERE user_id = :id OR id = 'seedme00000000001'", { id: uid })).n, 0);
  assert.equal((await db.one("SELECT COUNT(*) AS n FROM claims WHERE verification_id = 'seedme00000000001'")).n, 0);
});
