// 기업 견적·계약 신청 — 금액은 서버 요율표에서만, 사업자번호는 검증번호까지, 입금 확인은 키 하나에 한도.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yume-b2b-"));
process.env.DATA_DIR = dir;
process.env.PGLITE_DIR = "memory://";
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
else delete process.env.DATABASE_URL;
process.env.ADMIN_SECRET = "test-admin-secret-0123";
delete process.env.ANTHROPIC_API_KEY;
delete process.env.B2B_BANK_ACCOUNT;

const { default: app } = await import("../app.js");
const db = await import("../db.js");
const deals = await import("../b2bDeals.js");
const { API_RATES } = await import("../apiRates.js");

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

const ADMIN = { "X-Admin-Key": "test-admin-secret-0123" };
async function call(method, url, body, headers = {}) {
  const res = await fetch(base + url, {
    method,
    headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* HTML */
  }
  return { status: res.status, json, text };
}
const tokenOf = (url) => url.split("/b2b/quote/")[1];
// 국세청 검증번호 규칙을 통과하는 번호(유메 공급자 번호).
const GOOD_BIZ = "627-03-03900";

test("사업자등록번호: 검증번호가 맞아야 통과한다", () => {
  assert.equal(deals.validBizNo(GOOD_BIZ), true);
  assert.equal(deals.validBizNo("6270303900"), true);
  assert.equal(deals.validBizNo("627-03-03901"), false);
  assert.equal(deals.validBizNo("123"), false);
  assert.equal(deals.formatBizNo("6270303900"), GOOD_BIZ);
});

test("금액: 공개 요율표로 계산하고 부가세는 원 미만 버림", () => {
  const g = API_RATES.tiers.find((t) => t.key === "growth");
  const p = deals.priceSelf("growth", 3);
  assert.equal(p.supply, g.monthlyKrw * 3);
  assert.equal(p.vat, Math.floor(g.monthlyKrw * 3 * 0.1));
  assert.equal(p.total, p.supply + p.vat);
  assert.ok(deals.priceSelf("growth", 13).error, "12개월 넘으면 거절");
  assert.ok(deals.priceSelf("metered", 150).error, "100회 단위가 아니면 거절");
  assert.ok(deals.priceSelf("audit", 1).error, "감사는 사이트에서 직접 견적 불가");
  const d = deals.priceDesk([{ name: "AI 정밀 감사", qty: 1, unitKrw: 1_234_567 }]);
  assert.equal(d.vat, 123_456);
  assert.ok(deals.priceDesk([{ name: "", unitKrw: 100 }]).error);
});

test("견적 → 계약 신청 → 입금 확인: 브라우저가 보낸 금액은 무시하고, 한도는 최근 키 하나에", async () => {
  // 고객 계정과 키 두 개(최근 것에만 한도가 걸려야 한다).
  const t = Date.now();
  const u = await db.run("INSERT INTO users (email, password_hash, terms_agreed_at, privacy_agreed_at, created_at) VALUES ('buyer@acme.co.kr', 'x', :t, :t, :t) RETURNING id", { t });
  const uid = u.rows[0].id;
  await db.run("INSERT INTO api_keys (user_id, label, prefix, key_hash, monthly_quota, created_at) VALUES (:uid, 'old', 'ym_old', 'h-old', 20, :t)", { uid, t });
  await db.run("INSERT INTO api_keys (user_id, label, prefix, key_hash, monthly_quota, created_at) VALUES (:uid, 'new', 'ym_new', 'h-new', 20, :t)", { uid, t });

  const q = await call("POST", "/api/b2b/quote", { product: "starter", qty: 2, company: "에이씨미", name: "김구매", email: "buyer@acme.co.kr", total: 1, supply: 1 });
  assert.equal(q.status, 201);
  const starter = API_RATES.tiers.find((x) => x.key === "starter");
  assert.equal(q.json.total, starter.monthlyKrw * 2 + Math.floor(starter.monthlyKrw * 2 * 0.1));
  assert.match(q.json.number, /^YM-\d{8}-\d{4}$/);
  const token = tokenOf(q.json.url);

  // 감사 상품은 사이트에서 바로 견적을 낼 수 없다.
  assert.equal((await call("POST", "/api/b2b/quote", { product: "audit", qty: 1, company: "x", name: "y", email: "a@b.co" })).status, 400);

  // 견적서 화면: 공급자 정보·합계·신청서
  const page = await call("GET", `/b2b/quote/${token}`);
  assert.equal(page.status, 200);
  assert.match(page.text, /견 적 서/);
  assert.match(page.text, /627-03-03900/);
  assert.match(page.text, /이 견적으로 계약 신청/);

  // 잘못된 사업자번호·동의 없음은 거절
  const bad = await call("POST", `/api/b2b/quote/${token}/request`, { bizNo: "627-03-03901", bizName: "에이씨미", ceo: "박대표", taxEmail: "tax@acme.co.kr", payMethod: "transfer", agree: true });
  assert.equal(bad.status, 400);
  assert.match(bad.json.error, /사업자등록번호/);
  const noAgree = await call("POST", `/api/b2b/quote/${token}/request`, { bizNo: GOOD_BIZ, bizName: "에이씨미", ceo: "박대표", taxEmail: "tax@acme.co.kr", payMethod: "transfer", agree: false });
  assert.equal(noAgree.status, 400);

  const ok = await call("POST", `/api/b2b/quote/${token}/request`, { bizNo: "6270303900", bizName: "에이씨미", ceo: "박대표", taxEmail: "tax@acme.co.kr", bizType: "서비스", bizItem: "소프트웨어", payMethod: "transfer", agree: true });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.status, "requested");
  // 두 번 보내도 한 번만
  assert.equal((await call("POST", `/api/b2b/quote/${token}/request`, { agree: true })).json.status, "requested");

  const after1 = await call("GET", `/b2b/quote/${token}`);
  assert.match(after1.text, /계약 신청이 접수됐습니다/);
  assert.match(after1.text, /입금 계좌는 영업일 하루 안에/, "계좌 환경변수가 없으면 지어내지 않고 메일로 안내");

  // 운영자 목록: 홈택스 발급 정보가 붙어 있다
  assert.equal((await call("GET", "/api/admin/b2b/quotes")).status, 401);
  const list = await call("GET", "/api/admin/b2b/quotes", null, ADMIN);
  const row = list.json.quotes.find((x) => x.company === "에이씨미");
  assert.match(row.hometax, /공급받는자 등록번호: 627-03-03900/);
  assert.match(row.hometax, /업태\/종목: 서비스 \/ 소프트웨어/);
  assert.equal(row.token, undefined, "목록에 견적 토큰 원문을 싣지 않는다(링크로만)");

  const paid = await call("POST", `/api/admin/b2b/quotes/${row.id}/paid`, {}, ADMIN);
  assert.equal(paid.status, 200);
  assert.equal(paid.json.applied.key, "ym_new");
  assert.equal(paid.json.applied.quota, starter.calls);
  const keys = await db.all("SELECT prefix, monthly_quota FROM api_keys WHERE user_id = :uid ORDER BY id", { uid });
  assert.deepEqual(keys.map((k) => k.monthly_quota), [20, starter.calls]);

  // 입금 확인된 견적은 취소할 수 없다
  assert.equal((await call("POST", `/api/admin/b2b/quotes/${row.id}/cancel`, {}, ADMIN)).status, 400);
});

test("데스크 견적: 운영자가 금액을 정하고 감사 건에 묶인다 · 계약 문서가 열린다", async () => {
  const r = await call("POST", "/api/admin/b2b/quotes", { product: "audit_regular", company: "로펌AI", items: [{ name: "AI 정기 감사(분기)", qty: 1, unitKrw: 1_500_000 }] }, ADMIN);
  assert.equal(r.status, 201);
  assert.equal(r.json.quote.total_krw, 1_650_000);
  assert.equal(r.json.quote.source, "desk");
  assert.equal((await call("POST", "/api/admin/b2b/quotes", { product: "audit", company: "x", items: [] }, ADMIN)).status, 400);

  for (const p of ["/b2b/terms", "/b2b/dpa", "/b2b/security"]) {
    const d = await call("GET", p);
    assert.equal(d.status, 200, p);
    assert.match(d.text, /B2B-\d{4}-\d{2}-\d{2}/, `${p} 판 표시`);
  }
  const dpa = await call("GET", "/b2b/dpa");
  assert.match(dpa.text, /Anthropic/);
  assert.match(dpa.text, /1년/);
  const sec = await call("GET", "/b2b/security");
  assert.match(sec.text, /인증은 받지 않았습니다/, "받지 않은 인증을 받았다고 쓰지 않는다");
});

test("유효기간이 지난 견적은 계약 신청을 받지 않는다", async () => {
  const { quote } = await deals.createQuote({ product: "growth", qty: 1, company: "만료회사", contactName: "이", email: "x@y.co.kr" });
  await db.run("UPDATE b2b_quotes SET valid_until = 1 WHERE id = :id", { id: quote.id });
  const r = await call("POST", `/api/b2b/quote/${quote.token}/request`, { bizNo: GOOD_BIZ, bizName: "만료회사", ceo: "이", taxEmail: "x@y.co.kr", payMethod: "card", agree: true });
  assert.equal(r.status, 409);
  const page = await call("GET", `/b2b/quote/${quote.token}`);
  assert.match(page.text, /유효기간이 지난 견적/);
  assert.doesNotMatch(page.text, /이 견적으로 계약 신청/);
});

test("감사 보고서의 '다음 단계': 데스크에서 낸 견적이 맨 앞, 금액은 싣지 않는다", async () => {
  const created = await call("POST", "/api/admin/audits", { company: "다음단계노무", service_name: "다음단계 AI", domain: "인사", category: "service" }, ADMIN);
  const auditId = created.json.id;
  const { renderAuditReport } = await import("../renderAuditDossier.js");
  const desk = await import("../auditDesk.js");
  const reportOf = async () => renderAuditReport(await desk.auditDetail(auditId), { mode: "admin" });
  const before1 = await reportOf();
  assert.match(before1, /다음 단계/);
  assert.doesNotMatch(before1, /준비된 견적서/);

  const q = await call("POST", "/api/admin/b2b/quotes", { product: "audit", auditId, company: "다음단계노무", items: [{ name: "AI 정밀 감사", qty: 1, unitKrw: 2_000_000 }] }, ADMIN);
  assert.equal(q.status, 201);
  const report = await reportOf();
  assert.match(report, /준비된 견적서 — YM-\d{8}-\d{4}/);
  assert.match(report, /\/b2b\/quote\//);
  assert.doesNotMatch(report, /2,000,000|2,200,000/, "보고서에는 금액을 싣지 않는다");
  assert.match(report, /\/b2b\/dpa/);

  // 데스크 상세에도 같은 견적이 보인다
  const d = await call("GET", `/api/admin/audits/${auditId}`, null, ADMIN);
  assert.equal(d.json.quotes.length, 1);
  assert.equal(d.json.quotes[0].status, "issued");
});
