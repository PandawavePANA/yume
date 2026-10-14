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

test("영업팀 서연: 후보를 찾아 팀장 전결로 감사 데스크에 바로 올린다(이미 있는 곳은 빼고) — 대표 결재함에는 안 올라온다", async () => {
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
  assert.equal((await store.listApprovals()).filter((x) => x.kind === "add_prospects").length, 0, "대표 결재함에 남지 않는다");
  const [a] = (await store.listApprovals({ status: "all" })).filter((x) => x.kind === "add_prospects");
  assert.equal(a.status, "done");
  assert.match(a.result, /^전결/);
  assert.equal(a.payload.candidates.length, 2, "이미 있는 호스트는 뺀다");
  const made = await db.one("SELECT * FROM ai_audits WHERE company = '노무AI'");
  assert.equal(made.tos_url, "https://nomu.example.com/terms");
  assert.match(made.found_via, /서연/);
  assert.ok(await db.one("SELECT 1 AS x FROM ai_audits WHERE company = '세무AI'"));
  assert.equal((await staff.approve(a.id, {}, { deps: deps() })).error, "이미 처리한 결재예요.", "두 번 처리되지 않는다");
  const logs = await store.recentLogs(10, "seoyeon");
  assert.ok(logs.some((l) => /지호 전결 완료/.test(l.title)));
});

test("법무팀 도윤: 약관을 읽고 근거 조항과 함께 결재 — 지어낸 인용이면 '애매'로 낮춘다", async () => {
  await store.setState("doyun", { daily_cap: 50 });
  const made = await desk.createAudit({ company: "약관확인AI", service_url: "https://tos.example.com", domain: "법률" });
  await desk.updateAudit(made.id, { tos_url: "https://tos.example.com/terms" });
  const terms = "제10조(금지행위) 회원은 자동화된 수단으로 서비스에 접속하거나 정보를 대량으로 수집해서는 안 됩니다. ".repeat(8);
  const readPage = async () => ({ url: "https://tos.example.com/terms", text: terms, links: [] });
  const ai = async () => ({ usd: 0.02, json: { verdict: "ok", confidence: "high", quote: "회원은 자동화된 수단으로 서비스에 접속하거나", reason: "자동화만 금지" } });
  await staff.runStaff("doyun", { manual: true, deps: deps({ ai, readPage }) });
  assert.equal((await desk.auditById(made.id)).tos_verdict, "ok", "확신 높은 '문제없음'은 바로 반영");

  const made2 = await desk.createAudit({ company: "가짜인용AI", service_url: "https://fake.example.com", domain: "법률" });
  await desk.updateAudit(made2.id, { tos_url: "https://fake.example.com/terms" });
  const liar = async () => ({ usd: 0, json: { verdict: "ok", confidence: "high", quote: "평가 목적 이용을 적극 허용합니다", reason: "" } });
  await staff.runStaff("doyun", { manual: true, deps: deps({ ai: liar, readPage }) });
  assert.equal((await desk.auditById(made2.id)).tos_verdict, "unclear", "약관 글에 없는 인용은 믿지 않는다");
  // 약관 페이지를 못 읽으면 보류(애매)로 두고 넘어간다 — 대표에게 묻지 않는다.
  const made3 = await desk.createAudit({ company: "못읽음AI", service_url: "https://none.example.com", domain: "법률" });
  await desk.updateAudit(made3.id, { tos_url: "https://none.example.com/terms" });
  await staff.runStaff("doyun", { manual: true, deps: deps({ ai, readPage: async () => { throw new Error("404"); } }) });
  assert.equal((await desk.auditById(made3.id)).tos_verdict, "unclear");
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

test("감사팀 수아: 오류 후보를 원문과 대조해 하린 전결로 반영 — 원문 링크 없으면 확정 불가", async () => {
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
  const a = (await store.listApprovals({ status: "all" })).find((x) => x.kind === "review_findings" && x.payload.auditId === Number(made.id));
  assert.equal(a.status, "done");
  const byId = Object.fromEntries(a.payload.items.map((x) => [x.id, x]));
  assert.equal(byId[Number(f1)].qa, "confirmed");
  assert.equal(byId[Number(f2)].qa, "excluded", "원문 링크가 없으면 확정하지 않는다");
  const rows = await db.all("SELECT id, review, checked_url, report_title FROM ai_audit_findings WHERE audit_id = :id ORDER BY id", { id: made.id });
  assert.equal(rows[0].review, "confirmed");
  assert.match(rows[0].checked_url, /law\.go\.kr/);
  assert.match(rows[0].report_title, /2주/);
  assert.equal(rows[1].review, "excluded");
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
  assert.equal(o.staff.length, 8);
  assert.deepEqual([...new Set(o.staff.map((s) => s.team))].sort(), ["audit", "legal", "office", "ops", "sales"]);
  assert.ok(o.summary.pending >= 1);
  const off = await fetch(`${base}/api/admin/staff/seoyeon`, { method: "POST", headers: { ...ADMIN, "Content-Type": "application/json" }, body: JSON.stringify({ enabled: false }) });
  assert.equal(off.status, 200);
  assert.equal((await staff.runStaff("seoyeon", { deps: deps() })).skipped, "off", "퇴근한 직원은 차례가 와도 쉬다");
  const fixed = await fetch(`${base}/api/admin/staff/sua`, { method: "POST", headers: { ...ADMIN, "Content-Type": "application/json" }, body: JSON.stringify({ autonomy: "auto" }) });
  assert.equal(fixed.status, 400, "모드가 정해진 직원은 바꿀 수 없다");

  const { briefing } = await import("../staff/jobs/secretary.js");
  const b = await briefing(Date.now(), (await import("../staff/roster.js")).ROSTER);
  assert.match(b.subject, /아침 브리핑/);
  assert.match(b.text, /결재 대기 \d+건/);
  const { renderStaffPage } = await import("../renderStaffPage.js");
  assert.match(renderStaffPage(), /AI 본사/);
});

test("비서실 서윤: 메일함을 정리해 답장 초안을 결재로 — 승인하면 대표 주소로 같은 대화에 답장, 수신 거부는 감사 건을 닫는다", async () => {
  process.env.GMAIL_USER = "reamer@d-reamer.com";
  process.env.GMAIL_APP_PASSWORD = "test-not-real";
  const made = await desk.createAudit({ company: "답장회사", service_url: "https://reply.example.com", domain: "인사", contact_email: "lee@reply.example.com" });
  await db.run("UPDATE ai_audits SET tos_verdict = 'ok', stage = 'sent', sent_at = :t WHERE id = :id", { id: made.id, t: Date.now() - 86_400_000 });
  const stop = await desk.createAudit({ company: "그만회사", service_url: "https://stop.example.com", domain: "인사", contact_email: "no@stop.example.com" });
  await db.run("UPDATE ai_audits SET stage = 'sent', sent_at = :t WHERE id = :id", { id: stop.id, t: Date.now() });
  const msgs = [
    { uid: 11, messageId: "<m1@reply>", references: "", from: "lee@reply.example.com", fromName: "이담당", subject: "Re: [비공개] 답장회사 AI 오답 2건", date: Date.now(), text: "보고서 잘 봤습니다. 통화 가능할까요?", autoSubmitted: "", listId: "" },
    { uid: 12, messageId: "<m2@stop>", references: "", from: "no@stop.example.com", fromName: "", subject: "Re: 안내", date: Date.now(), text: "수신 거부합니다.", autoSubmitted: "", listId: "" },
    { uid: 13, messageId: "<m3@noreply>", references: "", from: "no-reply@railway.app", fromName: "Railway", subject: "Deploy succeeded", date: Date.now(), text: "ok", autoSubmitted: "auto-generated", listId: "" },
  ];
  const ai = async ({ user }) => /수신 거부/.test(user)
    ? { usd: 0.01, json: { category: "unsubscribe", needs_reply: false, summary: "수신 거부" } }
    : { usd: 0.02, json: { category: "audit_reply", needs_reply: true, urgency: "high", summary: "통화 요청", draft: "이담당님, 연락 주셔서 감사합니다. 편하신 시간 두세 개를 알려 주세요.\n\n감사합니다.\n정원영 드림" } };
  const replies = [];
  const answered = [];
  sent.length = 0;
  const d = deps({ ai, gmailFetch: async () => ({ uidValidity: "1", messages: msgs }), gmailSend: async (m) => { replies.push(m); return {}; }, gmailMarkAnswered: async (uid) => answered.push(uid) });
  const r = await staff.runStaff("seoyun", { manual: true, deps: d });
  assert.ok(r.ok, r.error);
  assert.equal((await desk.auditById(made.id)).stage, "replied", "감사 메일에 온 답장 → 답장 단계");
  assert.equal((await desk.auditById(stop.id)).stage, "declined", "수신 거부 → 감사 건을 닫는다");
  const a = (await store.listApprovals()).find((x) => x.kind === "reply_mail");
  assert.ok(a, "답장 결재");
  assert.equal(a.payload.to, "lee@reply.example.com");
  assert.ok(sent.some((m) => /급한 답장/.test(m.subject)), "급한 답장은 대표에게 바로 알림");
  assert.equal(Number((await db.one("SELECT COUNT(*) AS n FROM mail_inbox")).n), 3, "알림 메일도 분류해 남긴다");
  await staff.runStaff("seoyun", { manual: true, deps: d });
  assert.equal((await store.listApprovals()).filter((x) => x.kind === "reply_mail").length, 1, "같은 메일을 또 올리지 않는다");

  const bad = await staff.approve(a.id, { body: "[확인 필요: 일정] 연락드리겠습니다." }, { deps: d });
  assert.match(bad.error, /확인 필요/);
  const ok = await staff.approve(a.id, { body: "이담당님, 감사합니다. 목요일 오후 어떠세요?\n\n정원영 드림" }, { deps: d });
  assert.ok(ok.ok, ok.error);
  assert.equal(replies[0].to, "lee@reply.example.com");
  assert.equal(replies[0].inReplyTo, "<m1@reply>", "원래 대화에 붙인다");
  assert.match(replies[0].text, /목요일/, "대표가 고친 본문으로");
  assert.deepEqual(answered, [11]);
  delete process.env.GMAIL_USER;
  delete process.env.GMAIL_APP_PASSWORD;
});
