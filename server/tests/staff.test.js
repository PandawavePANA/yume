// AI 직원 — 직원은 기안하고 대표는 결재만 한다. 진짜 AI·메일 대신 가짜를 끼워 흐름을 끝까지 확인한다.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yume-staff-"));
process.env.DATA_DIR = dir;
process.env.PGLITE_DIR = "memory://";
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
else delete process.env.DATABASE_URL;
process.env.ADMIN_SECRET = "test-admin-secret-0123";
delete process.env.ANTHROPIC_API_KEY;
delete process.env.MAIL_FROM_YUME;
delete process.env.MAIL_FROM_OUTREACH;
process.env.B2B_BANK_ACCOUNT = "테스트은행 000";

const { default: app } = await import("../app.js");
const db = await import("../db.js");
const staff = await import("../staff/index.js");
const store = await import("../staff/store.js");
const desk = await import("../auditDesk.js");
const deals = await import("../b2bDeals.js");
const { confirmPayment } = await import("../b2bApi.js");

let server;
let base;
before(() => new Promise((resolve) => { server = app.listen(0, "127.0.0.1", () => { base = `http://127.0.0.1:${server.address().port}`; resolve(); }); }));
after(async () => {
  server.close();
  await db.closeDb();
  fs.rmSync(dir, { recursive: true, force: true });
});

const ADMIN = { "X-Admin-Key": "test-admin-secret-0123" };
const sent = [];
const fakeMail = async (m) => { sent.push(m); return { sent: true }; };
const deps = (over = {}) => ({ sendMail: fakeMail, confirmPayment, readPage: async () => ({ url: "https://x.example/terms", text: "", links: [] }), ai: async () => ({ json: {}, usd: 0 }), addAttackSet: async () => ({ error: "x" }), addTailoredQuestions: async () => ({ error: "x" }), startChecks: async () => ({ ok: true }), isChecking: () => false, ...over });
const GOOD_BIZ = "627-03-03900";

test("근무 시간표: 매일 정해진 시각 · 근무 시간대 · 평일", () => {
  const kst = (s) => Date.parse(`${s}+09:00`);
  const daily = { schedule: { daily: { h: 8, m: 30 } } };
  assert.equal(staff.notBefore(daily, kst("2026-10-14T08:00:00")), null, "8:30 전에는 차례가 아님");
  assert.equal(staff.notBefore(daily, kst("2026-10-14T09:00:00")), kst("2026-10-14T08:30:00"));
  const hours = { schedule: { every: 30 * 60_000, hours: [8, 22] } };
  assert.equal(staff.notBefore(hours, kst("2026-10-14T23:00:00")), null);
  const weekdays = { schedule: { daily: { h: 10, m: 0 }, weekdays: true } };
  assert.equal(staff.notBefore(weekdays, kst("2026-10-17T11:00:00")), null, "토요일은 쉼");
  assert.equal(staff.businessHours(kst("2026-10-14T10:00:00")), true);
  assert.equal(staff.businessHours(kst("2026-10-14T19:00:00")), false);
});

test("영업팀 서연: 후보를 찾아 결재 → 대표가 고른 곳만 감사 데스크에 (이미 있는 곳은 빼고)", async () => {
  await desk.createAudit({ company: "있던곳", service_url: "https://old.example.com", domain: "인사" });
  const ai = async () => ({
    usd: 0.12,
    json: { candidates: [
      { company: "노무AI", service_name: "노무AI 상담", service_url: "https://nomu.example.com/chat", contact_email: "hello@nomu.example.com", tos_url: "https://nomu.example.com/terms", why: "근로기준법 질문에 답함" },
      { company: "중복", service_url: "https://www.old.example.com/x" },
      { company: "세무AI", service_url: "https://tax.example.com", why: "연말정산" },
    ] },
  });
  const r = await staff.runStaff("seoyeon", { manual: true, deps: deps({ ai }) });
  assert.ok(r.ok, r.error);
  const [a] = (await store.listApprovals()).filter((x) => x.kind === "add_prospects");
  assert.equal(a.payload.candidates.length, 2, "이미 있는 호스트는 뺀다");
  assert.deepEqual(a.payload.line.map((p) => p.role), ["기안", "검토", "결재"], "결재선: 서연 → 지호 → 대표");
  const ok = await staff.approve(a.id, { pick: [0] }, { deps: deps() });
  assert.ok(ok.ok, ok.error);
  const made = await db.one("SELECT * FROM ai_audits WHERE company = '노무AI'");
  assert.equal(made.tos_url, "https://nomu.example.com/terms");
  assert.match(made.found_via, /서연/);
  assert.ok(!(await db.one("SELECT 1 AS x FROM ai_audits WHERE company = '세무AI'")), "고르지 않은 후보는 안 올린다");
  assert.equal((await staff.approve(a.id, {}, { deps: deps() })).error, "이미 처리한 결재예요.", "두 번 결재해도 한 번만");
  const logs = await store.recentLogs(10, "seoyeon");
  assert.ok(logs.some((l) => /대표 결재 완료/.test(l.title)));
});

test("법무팀 도윤: 약관을 읽고 근거 조항과 함께 결재 — 지어낸 인용이면 '애매'로 낮춘다", async () => {
  const made = await desk.createAudit({ company: "약관확인AI", service_url: "https://tos.example.com", domain: "법률" });
  await desk.updateAudit(made.id, { tos_url: "https://tos.example.com/terms" });
  const terms = "제10조(금지행위) 회원은 자동화된 수단으로 서비스에 접속하거나 정보를 대량으로 수집해서는 안 됩니다. ".repeat(8);
  const readPage = async () => ({ url: "https://tos.example.com/terms", text: terms, links: [] });
  const ai = async () => ({ usd: 0.02, json: { verdict: "ok", confidence: "high", quote: "회원은 자동화된 수단으로 서비스에 접속하거나", reason: "자동화만 금지" } });
  await staff.runStaff("doyun", { manual: true, deps: deps({ ai, readPage }) });
  const a = (await store.listApprovals()).find((x) => x.kind === "tos_verdict" && x.payload.auditId === made.id);
  assert.equal(a.payload.verdict, "ok");
  assert.ok((await staff.approve(a.id, {}, { deps: deps() })).ok);
  assert.equal((await desk.auditById(made.id)).tos_verdict, "ok");

  const made2 = await desk.createAudit({ company: "가짜인용AI", service_url: "https://fake.example.com", domain: "법률" });
  await desk.updateAudit(made2.id, { tos_url: "https://fake.example.com/terms" });
  const liar = async () => ({ usd: 0, json: { verdict: "ok", confidence: "high", quote: "평가 목적 이용을 적극 허용합니다", reason: "" } });
  await staff.runStaff("doyun", { manual: true, deps: deps({ ai: liar, readPage }) });
  const b = (await store.listApprovals()).find((x) => x.payload.auditId === made2.id);
  assert.equal(b.payload.verdict, "unclear", "약관 글에 없는 인용은 믿지 않는다");
});

test("경영지원 민재: 감사 신청 → 입금 확인 결재(대표 알림) → 승인하면 감사 건·마감 생성 → 감사팀이 질문 준비 → 답 수집 요청", async () => {
  sent.length = 0;
  const { quote } = await deals.createQuote({ product: "audit", qty: 1, company: "결재노무", contactName: "최", email: "ops@pay.example.com", order: { serviceName: "결재봇", serviceUrl: "https://paybot.example.com", domain: "인사" } });
  await deals.requestContract(quote.token, { bizNo: GOOD_BIZ, bizName: "(주)결재노무", ceo: "최", taxEmail: "tax@pay.example.com", payMethod: "transfer", agree: true });
  await staff.runStaff("minjae", { manual: true, deps: deps() });
  const a = (await store.listApprovals()).find((x) => x.kind === "confirm_payment" && x.payload.quoteId === Number(quote.id));
  assert.ok(a, "입금 확인 결재가 올라왔다");
  assert.match(a.summary, /테스트은행 000/);
  assert.ok(sent.some((m) => /\[유메 결재\] 입금 확인/.test(m.subject)), "급한 결재는 대표에게 메일로도 알린다");
  const r = await staff.approve(a.id, {}, { deps: deps() });
  assert.ok(r.ok, r.error);
  const q = await deals.quoteById(quote.id);
  assert.equal(q.status, "paid");
  assert.ok(q.audit_id && q.due_at);

  // 감사팀 하린: 질문 세트 → 답이 없으니 답 수집 요청 결재
  const addAttackSet = async (id) => { await desk.addCustomItem(id, { question: "육아휴직 급여 상한은?" }); await desk.addCustomItem(id, { question: "구직급여 수급 요건은?" }); return { added: 2 }; };
  await staff.runStaff("harin", { manual: true, deps: deps({ addAttackSet }) });
  const items = await db.all("SELECT * FROM ai_audit_items WHERE audit_id = :id", { id: q.audit_id });
  assert.equal(items.length, 2);
  const c = (await store.listApprovals()).find((x) => x.kind === "collect_answers" && x.payload.auditId === Number(q.audit_id));
  assert.ok(c, "답 수집 요청");
  assert.equal(c.payload.questions.length, 2);
});

test("감사팀 수아: 오류 후보를 원문과 대조해 재확인 결재 — 대표가 바꾼 판정대로 반영, 원문 링크 없으면 확정 불가", async () => {
  const made = await desk.createAudit({ company: "재확인AI", service_url: "https://qa.example.com", domain: "인사" });
  await desk.updateAudit(made.id, { tos_verdict: "ok" });
  await desk.addCustomItem(made.id, { question: "질문1" });
  await desk.addCustomItem(made.id, { question: "질문2" });
  const its = await db.all("SELECT id FROM ai_audit_items WHERE audit_id = :id ORDER BY id", { id: made.id });
  const t = Date.now();
  for (const it of its) await db.run("UPDATE ai_audit_items SET answer = '답', answered_at = :t, status = 'checked' WHERE id = :id", { id: it.id, t });
  const ins = (item, url) => db.run(
    `INSERT INTO ai_audit_findings (audit_id, item_id, source, polarity, severity, claim, ai_quote, yume_reason, truth, source_url, created_at)
     VALUES (:a, :i, 'probe', 'issue', 'contradicted', '2주', 'AI: 2주', '원문은 1주', '고용보험법 제40조 — 1주', :u, :t) RETURNING id`,
    { a: made.id, i: item, u: url, t },
  );
  const f1 = (await ins(its[0].id, "https://www.law.go.kr/법령/고용보험법/제40조")).rows[0].id;
  const f2 = (await ins(its[1].id, "")).rows[0].id;
  const ai = async () => ({ usd: 0.05, json: { items: [{ id: Number(f1), verdict: "confirmed", reason: "1주와 2주", title: "AI가 \"2주\"라고 안내" }, { id: Number(f2), verdict: "confirmed", reason: "?" }] } });
  await staff.runStaff("sua", { manual: true, deps: deps({ ai }) });
  const a = (await store.listApprovals()).find((x) => x.kind === "review_findings" && x.payload.auditId === Number(made.id));
  assert.ok(a);
  const byId = Object.fromEntries(a.payload.items.map((x) => [x.id, x]));
  assert.equal(byId[Number(f1)].qa, "confirmed");
  assert.equal(byId[Number(f2)].qa, "excluded", "원문 링크가 없으면 확정 권고를 하지 않는다");
  const r = await staff.approve(a.id, { decisions: { [Number(f2)]: "yume_wrong" } }, { deps: deps() });
  assert.ok(r.ok, r.error);
  const rows = await db.all("SELECT id, review, checked_url, report_title FROM ai_audit_findings WHERE audit_id = :id ORDER BY id", { id: made.id });
  assert.equal(rows[0].review, "confirmed");
  assert.match(rows[0].checked_url, /law\.go\.kr/);
  assert.match(rows[0].report_title, /2주/);
  assert.equal(rows[1].review, "yume_wrong", "대표가 바꾼 판정");
});

test("영업팀 지호: 후속 메일은 유메 도메인 인증 전에는 결재해도 안 나가고, 인증 뒤에는 유메 주소로 나간다", async () => {
  sent.length = 0;
  const made = await desk.createAudit({ company: "후속AI", service_url: "https://fu.example.com", domain: "인사", contact_email: "kim@fu.example.com" });
  const t = Date.now();
  await db.run("UPDATE ai_audits SET tos_verdict = 'ok', stage = 'sent', sent_at = :s, followup_due_at = :d WHERE id = :id", { id: made.id, s: t - 8 * 86_400_000, d: t - 3600_000 });
  await staff.runStaff("jiho", { manual: true, deps: deps() });
  const a = (await store.listApprovals()).find((x) => x.kind === "send_followup" && x.payload.auditId === made.id);
  assert.ok(a, "후속 메일 기안");
  assert.match(a.payload.body, /수신 거부/, "수신 거부 안내가 붙는다");
  const blocked = await staff.approve(a.id, {}, { deps: deps() });
  assert.match(blocked.error, /인증 전/);
  assert.equal((await store.getApproval(a.id)).status, "pending", "실패하면 결재함에 남는다");
  assert.equal(sent.length, 0);

  process.env.MAIL_FROM_YUME = "유메 <hello@yume-reamer.com>";
  const ok = await staff.approve(a.id, {}, { deps: deps() });
  delete process.env.MAIL_FROM_YUME;
  assert.ok(ok.ok, ok.error);
  assert.match(sent[0].from, /정원영 \(유메\) <hello@yume-reamer\.com>/);
  assert.equal(sent[0].to, "kim@fu.example.com");
  assert.equal((await desk.auditById(made.id)).stage, "followed_up");
});

test("반려·사무실 화면·비서실장 브리핑", async () => {
  const id = await store.propose("minjae", { kind: "quote_reminder", title: "반려 시험", payload: { quoteId: 1 }, dedupe: "test:reject" });
  assert.ok((await staff.reject(id, "지금은 보내지 말 것")).ok);
  assert.equal((await store.getApproval(id)).status, "rejected");
  assert.equal(await store.propose("minjae", { kind: "quote_reminder", title: "다시", dedupe: "test:reject" }), null, "반려한 일은 다시 올리지 않는다");

  assert.equal((await fetch(`${base}/api/admin/staff`)).status, 401);
  const o = await (await fetch(`${base}/api/admin/staff`, { headers: ADMIN })).json();
  assert.equal(o.staff.length, 7);
  assert.deepEqual([...new Set(o.staff.map((s) => s.team))].sort(), ["audit", "legal", "office", "ops", "sales"]);
  assert.ok(o.summary.pending >= 1);
  const off = await fetch(`${base}/api/admin/staff/seoyeon`, { method: "POST", headers: { ...ADMIN, "Content-Type": "application/json" }, body: JSON.stringify({ enabled: false }) });
  assert.equal(off.status, 200);
  assert.equal((await staff.runStaff("seoyeon", { deps: deps() })).skipped, "off", "퇴근한 직원은 차례가 와도 쉬다");
  const fixed = await fetch(`${base}/api/admin/staff/sua`, { method: "POST", headers: { ...ADMIN, "Content-Type": "application/json" }, body: JSON.stringify({ autonomy: "auto" }) });
  assert.equal(fixed.status, 400, "QA는 늘 결재 후");

  const { briefing } = await import("../staff/jobs/secretary.js");
  const b = await briefing(Date.now(), (await import("../staff/roster.js")).ROSTER);
  assert.match(b.subject, /아침 브리핑/);
  assert.match(b.text, /결재 대기 \d+건/);
  const { renderStaffPage } = await import("../renderStaffPage.js");
  assert.match(renderStaffPage(), /AI 본사/);
});
