// 본인확인으로 비밀번호를 되찾는 길.
//
// 메일함을 못 여는 사람을 위한 두 번째 문이라, 첫 번째 문보다 헐거우면 안 된다.
// 여기서 확인하는 것은 하나다 — **본인이 아닌 사람이 남의 계정을 열 수 있는가.**
//
// 특히 인증 번호(identityVerificationId)는 모바일에서 주소창을 타고 돌아오므로 기록에
// 남을 수 있다. 그 번호를 주운 것만으로 열린다면 이 기능은 계정 탈취 통로가 된다.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yume-pwreset-"));
process.env.DATA_DIR = dir;
process.env.PGLITE_DIR = "memory://";
delete process.env.DATABASE_URL;
process.env.ADMIN_SECRET = "test-admin-secret-0123";
process.env.VITE_PORTONE_STORE_ID = "store-test";
process.env.VITE_PORTONE_CHANNEL_KEY = "channel-test";
process.env.VITE_PORTONE_IDENTITY_CHANNEL_KEY = "channel-identity-test";
process.env.PORTONE_V2_API_SECRET = "secret-test";
process.env.CI_HASH_PEPPER = "pepper-test";
delete process.env.ANTHROPIC_API_KEY;
delete process.env.RESEND_API_KEY;

const { default: app } = await import("../app.js");
const db = await import("../db.js");
const { hashCi } = await import("../portone.js");

// 포트원 대신 대답한다. 어느 CI를 돌려줄지는 테스트마다 바꾼다.
const realFetch = globalThis.fetch;
let currentCi = "ci-default";
globalThis.fetch = async (url, init) => {
  const u = String(url);
  if (u.startsWith("https://api.portone.io/")) {
    if (u.includes("/identity-verifications/")) {
      return new Response(
        JSON.stringify({ status: "VERIFIED", verifiedCustomer: { ci: currentCi, name: "정원영", phoneNumber: "010-1234-5678" } }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return new Response(JSON.stringify({ message: "not found" }), { status: 404, headers: { "content-type": "application/json" } });
  }
  return realFetch(url, init);
};

let server;
let base;
before(() => new Promise((resolve) => {
  server = app.listen(0, "127.0.0.1", () => { base = `http://127.0.0.1:${server.address().port}`; resolve(); });
}));
after(async () => {
  globalThis.fetch = realFetch;
  server.close();
  await db.closeDb();
  fs.rmSync(dir, { recursive: true, force: true });
});

// IP를 손님마다 다르게 준다 — 한 시간에 6번이라는 제한에 테스트끼리 걸리지 않도록.
let seq = 0;
function client() {
  let cookie = "";
  const ip = `10.7.0.${(seq += 1)}`;
  return async function call(method, url, body) {
    const res = await realFetch(base + url, {
      method,
      headers: { "X-Forwarded-For": ip, ...(body ? { "Content-Type": "application/json" } : {}), ...(cookie ? { Cookie: cookie } : {}) },
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

let userSeq = 0;
/** 가입시키고, ci를 주면 본인확인까지 마친 상태로 만든다. */
async function makeUser({ ci = null } = {}) {
  const call = client();
  const n = (userSeq += 1);
  const email = `pwr${n}-${Date.now()}@example.com`;
  const r = await call("POST", "/api/auth/signup", {
    email, password: "passw0rd!", nickname: `pwr${n}${Date.now() % 100000}`,
    agreeTerms: true, agreePrivacy: true, agreeIdentity: true,
  });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  if (ci) {
    await db.run("UPDATE users SET identity_verified_at = :t, identity_ci_hash = :h WHERE id = :id",
      { t: Date.now(), h: hashCi(ci), id: r.data.user.id });
  }
  return { call, userId: r.data.user.id, email };
}

/** 인증창을 다녀온 것처럼 시작→확인을 한 손님으로 이어서 한다. */
async function runReset(ci) {
  currentCi = ci;
  const call = client();
  const start = await call("POST", "/api/auth/identity-reset/start", { agree: true });
  assert.equal(start.status, 200, JSON.stringify(start.data));
  const confirm = await call("POST", "/api/auth/identity-reset/confirm", {
    identityVerificationId: start.data.identityVerificationId,
  });
  return { start, confirm, call };
}

test("본인확인을 마치면 이메일을 몰라도 비밀번호를 바꾼다", async () => {
  const ci = `ci-happy-${Date.now()}`;
  const { userId, email } = await makeUser({ ci });

  const { confirm } = await runReset(ci);
  assert.equal(confirm.status, 200, JSON.stringify(confirm.data));
  assert.equal(confirm.data.accounts.length, 1);

  // 이메일은 가려서 돌려준다 — 본인은 알아보되 어깨너머로는 안 보이게.
  const masked = confirm.data.accounts[0].email;
  assert.notEqual(masked, email);
  assert.ok(masked.includes("*"));
  assert.ok(masked.endsWith(email.slice(email.indexOf("@"))));

  // 받은 토큰으로 실제로 바뀌는지.
  const done = await client()("POST", "/api/auth/reset", { token: confirm.data.accounts[0].token, password: "newpassw0rd!" });
  assert.equal(done.status, 200, JSON.stringify(done.data));

  const login = await client()("POST", "/api/auth/login", { email, password: "newpassw0rd!" });
  assert.equal(login.status, 200, JSON.stringify(login.data));
  assert.equal(login.data.user.id, userId);
});

test("인증 번호만 주워서는 남의 계정이 열리지 않는다", async () => {
  const ci = `ci-steal-${Date.now()}`;
  await makeUser({ ci });
  currentCi = ci;

  // 피해자가 인증을 시작한다 — 이 번호가 주소창을 타고 기록에 남았다고 치자.
  const victim = client();
  const start = await victim("POST", "/api/auth/identity-reset/start", { agree: true });
  assert.equal(start.status, 200);

  // 번호를 주운 사람이 자기 브라우저에서 확인을 시도한다. 쿠키가 없으므로 열리면 안 된다.
  const stolen = await client()("POST", "/api/auth/identity-reset/confirm", {
    identityVerificationId: start.data.identityVerificationId,
  });
  assert.equal(stolen.status, 400, JSON.stringify(stolen.data));
  assert.ok(!stolen.data.accounts);
});

test("같은 번호를 두 번 쓸 수 없다", async () => {
  const ci = `ci-replay-${Date.now()}`;
  await makeUser({ ci });
  currentCi = ci;

  const call = client();
  const start = await call("POST", "/api/auth/identity-reset/start", { agree: true });
  const first = await call("POST", "/api/auth/identity-reset/confirm", { identityVerificationId: start.data.identityVerificationId });
  assert.equal(first.status, 200, JSON.stringify(first.data));

  // 확인과 동시에 쿠키를 비우므로, 같은 손님이 다시 눌러도 열리지 않는다.
  const again = await call("POST", "/api/auth/identity-reset/confirm", { identityVerificationId: start.data.identityVerificationId });
  assert.equal(again.status, 400, JSON.stringify(again.data));
});

test("같은 명의로 만든 계정은 전부 돌려준다", async () => {
  const ci = `ci-multi-${Date.now()}`;
  await makeUser({ ci });
  await makeUser({ ci });

  const { confirm } = await runReset(ci);
  assert.equal(confirm.status, 200, JSON.stringify(confirm.data));
  assert.equal(confirm.data.accounts.length, 2);
  // 계정마다 토큰이 따로여야 한 쪽을 바꿔도 다른 쪽이 덩달아 열리지 않는다.
  assert.notEqual(confirm.data.accounts[0].token, confirm.data.accounts[1].token);
});

test("본인확인을 안 마친 계정은 이 길로 열리지 않는다", async () => {
  await makeUser();                       // 본인확인 없이 가입만
  const { confirm } = await runReset(`ci-none-${Date.now()}`);
  assert.equal(confirm.status, 404, JSON.stringify(confirm.data));
  assert.equal(confirm.data.code, "NO_ACCOUNT");
});

test("CI 수집에 동의하지 않으면 인증창을 열어 주지 않는다", async () => {
  const r = await client()("POST", "/api/auth/identity-reset/start", {});
  assert.equal(r.status, 400, JSON.stringify(r.data));
  assert.equal(r.data.code, "NEEDS_CONSENT");
});

test("비밀번호를 바꾸면 쓰던 기기의 로그인이 모두 풀린다", async () => {
  const ci = `ci-sessions-${Date.now()}`;
  const { call } = await makeUser({ ci });

  // 가입 직후라 이 손님은 로그인된 상태다.
  const before = await call("GET", "/api/auth/me");
  assert.ok(before.data.user, "가입 직후에는 세션이 있어야 한다");

  const { confirm } = await runReset(ci);
  await client()("POST", "/api/auth/reset", { token: confirm.data.accounts[0].token, password: "another0ne!" });

  const after2 = await call("GET", "/api/auth/me");
  assert.ok(!after2.data.user, "비밀번호를 바꾼 뒤에는 기존 세션이 끊겨야 한다");
});
