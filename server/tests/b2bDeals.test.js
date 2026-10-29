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
// 국세청 검증번호 규칙을 통과하는 번호(베리라인 공급자 번호).
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
  // 2026-10-14부터 감사는 정가로 사이트에서 바로 산다(수량 1 고정, 정기 감사만 분기 수).
  assert.equal(deals.priceSelf("audit", 1).supply, 870_000);
  assert.ok(deals.priceSelf("audit", 2).error, "정밀 감사는 1회 단위");
  assert.equal(deals.priceSelf("audit_regular", 4).supply, 1_800_000);
  assert.ok(deals.priceSelf("audit_regular", 5).error);
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
  assert.match(q.json.number, /^VL-\d{8}-\d{4}$/);
  const token = tokenOf(q.json.url);

  // 감사 상품은 감사할 서비스 정보 없이는 주문서를 낼 수 없다.
  const noOrder = await call("POST", "/api/b2b/quote", { product: "audit", qty: 1, company: "x", name: "y", email: "a@b.co" });
  assert.equal(noOrder.status, 400);
  assert.match(noOrder.json.error, /서비스 이름/);

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
  // 품목을 안 넣으면 정가로 낸다(감사는 2026-10-14부터 정가 공개).
  const listPrice = await call("POST", "/api/admin/b2b/quotes", { product: "audit", company: "x", items: [] }, ADMIN);
  assert.equal(listPrice.status, 201);
  assert.equal(listPrice.json.quote.supply_krw, 870_000);
  assert.equal((await call("POST", "/api/admin/b2b/quotes", { product: "poc", company: "x", items: [] }, ADMIN)).status, 400, "정가 없는 상품은 금액이 있어야");

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
  assert.match(report, /준비된 견적서 — VL-\d{8}-\d{4}/);
  assert.match(report, /\/b2b\/quote\//);
  assert.doesNotMatch(report, /2,000,000|2,200,000/, "보고서에는 금액을 싣지 않는다");
  assert.match(report, /\/b2b\/dpa/);

  // 데스크 상세에도 같은 견적이 보인다
  const d = await call("GET", `/api/admin/audits/${auditId}`, null, ADMIN);
  assert.equal(d.json.quotes.length, 1);
  assert.equal(d.json.quotes[0].status, "issued");
});

test("감사 바로 구매: 주문서 → 감사 신청 → 입금 확인 → 감사 데스크에 건이 생기고 작업 리스트에 마감이 잡힌다", async () => {
  const order = { serviceName: "노무봇", serviceUrl: "nomubot.example.com", domain: "인사", access: "회원가입하면 누구나", focus: "육아휴직" };
  const bad = await call("POST", "/api/b2b/quote", { product: "audit", company: "노무봇", name: "최담당", email: "ops@nomubot.co.kr", order: { ...order, domain: "우주" } });
  assert.equal(bad.status, 400);
  assert.match(bad.json.error, /업종/);

  const q = await call("POST", "/api/b2b/quote", { product: "audit", company: "노무봇", name: "최담당", email: "ops@nomubot.co.kr", order, total: 1 });
  assert.equal(q.status, 201);
  assert.equal(q.json.total, 957_000, "87만원 + 부가세 — 브라우저가 보낸 금액은 무시");
  const token = tokenOf(q.json.url);
  const page = await call("GET", `/b2b/quote/${token}`);
  assert.match(page.text, /감사 대상/);
  assert.match(page.text, /https:\/\/nomubot\.example\.com/, "주소에 https://를 붙여 저장");
  assert.match(page.text, /영업일 기준 1~3일/);
  assert.match(page.text, /이 견적으로 감사 신청/);

  // 신청하면 작업 리스트 '입금 대기'에 이름이 올라온다.
  const req = await call("POST", `/api/b2b/quote/${token}/request`, { bizNo: GOOD_BIZ, bizName: "(주)노무봇", ceo: "최대표", taxEmail: "tax@nomubot.co.kr", payMethod: "transfer", agree: true });
  assert.equal(req.status, 200);
  assert.equal((await call("GET", "/api/admin/b2b/work")).status, 401);
  let w = (await call("GET", "/api/admin/b2b/work", null, ADMIN)).json;
  const waiting = w.pay.find((c) => c.company === "(주)노무봇");
  assert.ok(waiting, "입금 대기에 있다");
  assert.equal(waiting.service, "노무봇");
  assert.equal(w.now.length, 0);

  // 입금 확인 → 감사 데스크에 건, 마감은 영업일 3일 뒤
  const paid = await call("POST", `/api/admin/b2b/quotes/${waiting.id}/paid`, {}, ADMIN);
  assert.equal(paid.status, 200);
  assert.ok(paid.json.auditId, "감사 건이 생겼다");
  const audit = await db.one("SELECT * FROM ai_audits WHERE id = :id", { id: paid.json.auditId });
  assert.equal(audit.company, "(주)노무봇");
  assert.equal(audit.service_url, "https://nomubot.example.com");
  assert.equal(audit.domain, "인사");
  assert.equal(audit.tos_verdict, "ok", "고객이 맡긴 감사라 약관 확인 통과");
  assert.equal(audit.stage, "testing");
  // 두 번 눌러도 감사 건은 하나
  await call("POST", `/api/admin/b2b/quotes/${waiting.id}/paid`, {}, ADMIN);
  const { ensureAuditForQuote } = await import("../workList.js");
  assert.equal(await ensureAuditForQuote(waiting.id), paid.json.auditId);
  assert.equal(Number((await db.one("SELECT COUNT(*) AS n FROM ai_audits WHERE company = '(주)노무봇'")).n), 1);

  w = (await call("GET", "/api/admin/b2b/work", null, ADMIN)).json;
  const doing = w.now.find((c) => c.id === waiting.id);
  assert.ok(doing.due_at > Date.now());
  assert.ok(doing.daysLeft <= 3 && doing.daysLeft >= 1);
  assert.equal(doing.audit_id, paid.json.auditId);
  const progress = (await call("GET", `/b2b/quote/${token}`)).text;
  assert.match(progress, /감사를 진행하고 있습니다/);
  // 증빙 안내는 공급 시점의 과세 상태대로 — 일반과세 전이면 세금계산서를 약속하지 않는다(2026-10-29)
  const { canIssueTaxInvoice } = await import("../receiptInfo.js");
  const paidRow = await deals.quoteById(waiting.id);
  if (canIssueTaxInvoice(Number(paidRow.paid_at))) assert.match(progress, /전자세금계산서는/);
  else {
    assert.match(progress, /지출증빙 현금영수증/);
    assert.doesNotMatch(progress, /전자세금계산서는/);
  }

  // 유료 감사의 보고서 메일은 영업용 첫 메일 틀이 아니다 — (광고) · 수신 거부 · "넘기셔도" 없이, 포함된 설명 통화 · 재검사를 적는다
  const detail = (await call("GET", `/api/admin/audits/${paid.json.auditId}`, null, ADMIN)).json;
  assert.equal(detail.mail.client, true);
  assert.doesNotMatch(detail.mail.first.subject, /\(광고\)/);
  assert.match(detail.mail.first.subject, /AI 감사 보고서 \(주문 /);
  assert.match(detail.mail.first.body, /설명 통화 30분/);
  assert.match(detail.mail.first.body, /재검사 1회/);
  assert.doesNotMatch(detail.mail.first.body, /수신 거부|넘기셔도/);
  assert.doesNotMatch(detail.mail.followup.body, /따로 연락드리지 않겠습니다/);
  const { lintCopy } = await import("../auditDesk.js");
  assert.deepEqual(lintCopy(`${detail.mail.first.subject}\n${detail.mail.first.body}`), [], "발송 문구 점검을 그대로 통과");
  assert.equal(detail.checklist.items.find((c) => c.key === "recipient_person").ok, true, "주문 때 적은 주소면 대표 메일함이어도 된다");

  // 감사 데스크에서 발송을 기록하면 주문도 '보고서 보냄'으로 맞춘다(두 화면을 따로 누르지 않게)
  const { deliveredFromDesk } = await import("../workList.js");
  const synced = await deliveredFromDesk(paid.json.auditId);
  assert.equal(Number(synced.rounds_done), 1);
  assert.equal(await deliveredFromDesk(paid.json.auditId), null, "두 번 맞추지 않는다");
  const sent = (await call("GET", `/b2b/quote/${token}`)).text;
  assert.match(sent, /감사 보고서를 보냈습니다/);
  assert.match(sent, /포함된 사후 관리/);
  assert.match(sent, /재검사 1회/);

  // 보고서 보냄 → 완료로(데스크 발송으로 맞춰진 주문은 작업 리스트 '완료'에 있고, 더 보낼 회차가 없다)
  w = (await call("GET", "/api/admin/b2b/work", null, ADMIN)).json;
  assert.ok(!w.now.find((c) => c.id === waiting.id));
  assert.ok(w.done.find((c) => c.id === waiting.id));
  assert.match(w.done.find((c) => c.id === waiting.id).aftercare.join(" "), /재검사 1회/, "보낸 뒤 남은 포함 항목이 작업 리스트에 보인다");
  assert.equal((await call("POST", `/api/admin/b2b/quotes/${waiting.id}/delivered`, {}, ADMIN)).status, 400, "회차를 넘겨 보낼 수 없다");

  const { renderWorkPage } = await import("../renderWorkPage.js");
  assert.match(renderWorkPage(), /작업 리스트/);
});

test("정기 감사 1년 선납: 회차마다 보고서를 보내면 다음 마감이 한 분기 뒤로", async () => {
  const order = { serviceName: "세무봇", serviceUrl: "https://taxbot.example.com", domain: "금융" };
  const { quote } = await deals.createQuote({ product: "audit_regular_year", qty: 1, company: "세무봇", contactName: "김", email: "k@taxbot.co.kr", order });
  assert.equal(Number(quote.supply_krw), 1_620_000);
  await deals.requestContract(quote.token, { bizNo: GOOD_BIZ, bizName: "세무봇", ceo: "김", taxEmail: "k@taxbot.co.kr", payMethod: "transfer", agree: true });
  await call("POST", `/api/admin/b2b/quotes/${quote.id}/paid`, {}, ADMIN);
  const r1 = await call("POST", `/api/admin/b2b/quotes/${quote.id}/delivered`, {}, ADMIN);
  assert.equal(r1.json.finished, false);
  const after1 = await deals.quoteById(quote.id);
  assert.equal(Number(after1.rounds_done), 1);
  assert.ok(Number(after1.due_at) - Date.now() > 80 * 86_400_000, "다음 회차는 한 분기 뒤");
  const w = (await call("GET", "/api/admin/b2b/work", null, ADMIN)).json;
  assert.ok(w.later.find((c) => c.id === quote.id), "2주 넘게 남은 회차는 '예정'에");
});

test("파일럿은 신청·입금된 3곳까지만", async () => {
  await db.run("DELETE FROM b2b_quotes WHERE product = 'audit_pilot'");
  const order = { serviceName: "봇", serviceUrl: "https://bot.example.com", domain: "법률" };
  assert.equal((await call("GET", "/api/b2b/seats")).json.pilot, 3);
  for (let i = 0; i < 3; i++) {
    const { quote } = await deals.createQuote({ product: "audit_pilot", qty: 1, company: `파일럿${i}`, contactName: "이", email: `p${i}@x.co.kr`, order });
    assert.equal(Number(quote.supply_krw), 435_000);
    const r = await deals.requestContract(quote.token, { bizNo: GOOD_BIZ, bizName: `파일럿${i}`, ceo: "이", taxEmail: `p${i}@x.co.kr`, payMethod: "transfer", agree: true });
    assert.ok(!r.error, r.error);
  }
  assert.equal((await call("GET", "/api/b2b/seats")).json.pilot, 0);
  const full = await deals.createQuote({ product: "audit_pilot", qty: 1, company: "네번째", contactName: "이", email: "p4@x.co.kr", order });
  assert.match(full.error, /모두 찼어요/);
});
