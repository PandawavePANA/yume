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
const deps = (over = {}) => ({ sendMail: fakeMail, confirmPayment, askText: async () => ({ text: "", usd: 0 }), readPage: async () => ({ url: "https://x.example/terms", text: "", links: [] }), ai: async () => ({ json: {}, usd: 0 }), addAttackSet: async () => ({ error: "x" }), addTailoredQuestions: async () => ({ error: "x" }), startChecks: async () => ({ ok: true }), isChecking: () => false, ...over });
const GOOD_BIZ = "627-03-03900";

test("근무 시간표: 매일 정해진 시각 · 근무 시간대(06:00~19:30) · 평일만 도는 일", async () => {
  const kst = (s) => Date.parse(`${s}+09:00`);
  const daily = { schedule: { daily: { h: 8, m: 30 } } };
  assert.equal(staff.notBefore(daily, kst("2026-10-14T08:00:00")), null, "8:30 전에는 차례가 아님");
  assert.equal(staff.notBefore(daily, kst("2026-10-14T09:00:00")), kst("2026-10-14T08:30:00"));
  // 근무 시간 06:00~19:30(분 단위) — 대표가 정한 시간표
  const { WORK_HOURS } = await import("../staff/roster.js");
  const hours = { schedule: { every: 30 * 60_000, hours: WORK_HOURS } };
  assert.equal(staff.notBefore(hours, kst("2026-10-14T05:59:00")), null, "6시 전 출근 안 함");
  assert.ok(staff.notBefore(hours, kst("2026-10-14T06:00:00")));
  assert.ok(staff.notBefore(hours, kst("2026-10-14T19:29:00")));
  assert.equal(staff.notBefore(hours, kst("2026-10-14T19:30:00")), null, "19:30 퇴근");
  assert.ok(staff.notBefore(hours, kst("2026-10-17T10:00:00")), "주말에도 근무");
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
  const terms = "제1조(목적) 이 약관은 서비스 이용 조건을 정합니다. " + "제10조(금지행위) 회원은 자동화된 수단으로 서비스에 접속하거나 정보를 대량으로 수집해서는 안 됩니다. ".repeat(20);
  const readPage = async () => ({ url: "https://tos.example.com/terms", text: terms, links: [] });
  const ai = async () => ({ usd: 0.02, json: { verdict: "ok", confidence: "high", quote: "회원은 자동화된 수단으로 서비스에 접속하거나", reason: "자동화만 금지" } });
  await staff.runStaff("doyun", { manual: true, deps: deps({ ai, readPage }) });
  assert.equal((await desk.auditById(made.id)).tos_verdict, "ok", "확신 높은 '문제없음'은 바로 반영");

  const made2 = await desk.createAudit({ company: "가짜인용AI", service_url: "https://fake.example.com", domain: "법률" });
  await desk.updateAudit(made2.id, { tos_url: "https://fake.example.com/terms" });
  const liar = async () => ({ usd: 0, json: { verdict: "ok", confidence: "high", quote: "평가 목적 이용을 적극 허용합니다", reason: "" } });
  await staff.runStaff("doyun", { manual: true, deps: deps({ ai: liar, readPage }) });
  assert.equal((await desk.auditById(made2.id)).tos_verdict, "unclear", "약관 글에 없는 인용은 믿지 않는다");
  // 서버가 약관을 못 읽으면 → 현장 요원(PC 브라우저)에게 열어 오게 한다
  const made3 = await desk.createAudit({ company: "못읽음AI", service_url: "https://none.example.com", domain: "법률" });
  await desk.updateAudit(made3.id, { tos_url: "https://none.example.com/terms" });
  const broken = async () => { throw new Error("404"); };
  await staff.runStaff("doyun", { manual: true, deps: deps({ ai, readPage: broken }) });
  assert.equal((await desk.auditById(made3.id)).tos_render, "queued");
  assert.equal((await desk.auditById(made3.id)).tos_verdict, null, "PC가 열어 올 때까지 기다린다");
  // 현장 요원이 가져온 글로 판단한다
  await db.run("UPDATE ai_audits SET tos_render = 'done', tos_text = :t WHERE id = :id", { id: made3.id, t: terms });
  await staff.runStaff("doyun", { manual: true, deps: deps({ ai, readPage: broken }) });
  assert.equal((await desk.auditById(made3.id)).tos_verdict, "ok");
  // PC 브라우저로도 못 찾으면 보류(애매)로 두고 넘어간다 — 대표에게 묻지 않는다
  const made4 = await desk.createAudit({ company: "끝내못읽음AI", service_url: "https://none2.example.com", domain: "법률" });
  await db.run("UPDATE ai_audits SET tos_render = 'failed' WHERE id = :id", { id: made4.id });
  await staff.runStaff("doyun", { manual: true, deps: deps({ ai, readPage: broken }) });
  assert.equal((await desk.auditById(made4.id)).tos_verdict, "unclear");
  // 메인 화면을 약관으로 착각하지 않는다
  const { looksLikeTos } = await import("../staff/jobs/tos.js");
  assert.equal(looksLikeTos("세금 환급 AI 상담 — 지금 시작하세요 이용약관 개인정보처리방침"), false);
  assert.equal(looksLikeTos(terms), true);
});

test("경영지원 민재: 감사 신청 → 입금 확인 결재(대표 알림) → 승인하면 감사 건·마감 생성 → 감사팀이 질문 준비 → 답 수집 요청", async () => {
  sent.length = 0;
  const { quote } = await deals.createQuote({ product: "audit", qty: 1, company: "결재노무", contactName: "최", email: "ops@pay.example.com", order: { serviceName: "결재봇", serviceUrl: "https://paybot.example.com", domain: "인사" } });
  await deals.requestContract(quote.token, { bizNo: GOOD_BIZ, bizName: "(주)결재노무", ceo: "최", taxEmail: "tax@pay.example.com", payMethod: "transfer", agree: true });
  await staff.runStaff("minjae", { manual: true, deps: deps() });
  const a = (await store.listApprovals()).find((x) => x.kind === "confirm_payment" && x.payload.quoteId === Number(quote.id));
  assert.ok(a, "입금 확인 결재가 올라왔다");
  assert.match(a.summary, /테스트은행 000/);
  assert.ok(sent.some((m) => /\[베리라인 결재\] 입금 확인/.test(m.subject)), "급한 결재는 대표에게 메일로도 알린다");
  const r = await staff.approve(a.id, {}, { deps: deps() });
  assert.ok(r.ok, r.error);
  const q = await deals.quoteById(quote.id);
  assert.equal(q.status, "paid");
  assert.ok(q.audit_id && q.due_at);

  // 감사팀 하린: 질문 세트 → 답이 없으니 답 수집 요청 결재
  const addAttackSet = async (id) => { await desk.addCustomItem(id, { question: "육아휴직 급여 상한은?" }); await desk.addCustomItem(id, { question: "구직급여 수급 요건은?" }); return { added: 2 }; };
  await staff.runStaff("harin", { manual: true, deps: deps({ addAttackSet }) });
  for (let i = 0; i < 8; i++) await staff.runStaff("field", { manual: true, deps: deps() }); // 질문 검수(기준 없는 질문은 그대로)
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

test("영업팀 지호: 후속 메일은 베리라인 도메인 인증 전에는 결재해도 안 나가고, 인증 뒤에는 베리라인 주소로 나간다", async () => {
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

  process.env.MAIL_FROM_YUME = "베리라인 <hello@yume-reamer.com>";
  const ok = await staff.approve(a.id, {}, { deps: deps() });
  delete process.env.MAIL_FROM_YUME;
  assert.ok(ok.ok, ok.error);
  assert.match(sent[0].from, /정원영 \(베리라인\) <hello@yume-reamer\.com>/);
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
  assert.equal(o.staff.length, 10);
  assert.equal(o.staff.find((s) => s.id === "field").status, "off", "PC의 현장 요원이 연결되지 않았으면 쉬는 중");
  assert.equal(o.summary.fieldAgent, false);
  assert.deepEqual([...new Set(o.staff.map((s) => s.team))].sort(), ["audit", "engine", "legal", "office", "ops", "sales"]);
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

test("답 수집 배정: 약관에 자동 접속 금지가 없으면 현장 요원에게, 있으면 대표에게 — 가입·로그인이 막히면 결재, 처리하면 다시 줄 세움", async () => {
  await store.setState("doyun", { daily_cap: 50 });
  const terms = "제1조(목적) 이 약관은 서비스 이용 조건을 정합니다. " + "제9조(회원의 의무) 회원은 타인의 정보를 도용해서는 안 됩니다. ".repeat(25);
  const readPage = async () => ({ url: "https://free.example.com/terms", text: terms, links: [] });
  const freeAi = async () => ({ usd: 0.01, json: { verdict: "ok", confidence: "high", quote: "회원은 타인의 정보를 도용해서는 안 됩니다", reason: "막는 조항 없음", automation_banned: false } });
  const free = await desk.createAudit({ company: "자동가능AI", service_url: "https://free.example.com", domain: "인사" });
  await desk.updateAudit(free.id, { tos_url: "https://free.example.com/terms" });
  await staff.runStaff("doyun", { manual: true, deps: deps({ ai: freeAi, readPage }) });
  const a1 = await desk.auditById(free.id);
  assert.equal(a1.tos_verdict, "ok");
  assert.equal(a1.collect_mode, "agent", "자동 접속 금지 조항이 없으면 현장 요원");
  assert.match(a1.tos_note, /현장 요원 자동/);

  // 질문이 준비되면 현장 요원 줄에 선다(대표 결재 없음)
  await desk.addCustomItem(free.id, { question: "연차 미사용 수당은?" });
  for (let i = 0; i < 8; i++) await staff.runStaff("field", { manual: true, deps: deps() });
  await staff.runStaff("harin", { manual: true, deps: deps() });
  assert.equal((await desk.auditById(free.id)).collect_status, "queued");
  assert.ok(!(await store.listApprovals()).some((x) => x.kind === "collect_answers" && x.payload.auditId === free.id));

  // 현장 요원이 로그인 화면을 만나면 → 대표 결재 → '처리했어요'면 다시 줄에
  await db.run("UPDATE ai_audits SET collect_status = 'login_required', collect_note = '로그인 화면', collect_at = :t WHERE id = :id", { id: free.id, t: Date.now() });
  await staff.runStaff("harin", { manual: true, deps: deps() });
  const issue = (await store.listApprovals()).find((x) => x.kind === "collect_issue" && x.payload.auditId === free.id);
  assert.ok(issue, "가입·로그인 필요 결재");
  assert.match(issue.title, /회원가입·로그인 필요/);
  assert.ok((await staff.approve(issue.id, {}, { deps: deps() })).ok);
  assert.equal((await desk.auditById(free.id)).collect_status, "queued");

  // 또 막혔는데 대표가 반려하면 → 사람이 넣는 방식으로 바뀌고 답 수집 요청이 올라온다
  await db.run("UPDATE ai_audits SET collect_status = 'failed', collect_note = '입력창 없음', collect_at = :t WHERE id = :id", { id: free.id, t: Date.now() + 1 });
  await staff.runStaff("harin", { manual: true, deps: deps() });
  const issue2 = (await store.listApprovals()).find((x) => x.kind === "collect_issue" && x.payload.auditId === free.id);
  assert.ok((await staff.reject(issue2.id, "사람이 할게")).ok);
  assert.equal((await desk.auditById(free.id)).collect_mode, "manual");
  await staff.runStaff("harin", { manual: true, deps: deps() });
  assert.ok((await store.listApprovals()).some((x) => x.kind === "collect_answers" && x.payload.auditId === free.id), "사람용 답 수집 요청");

  // 금지 조항이 있으면 처음부터 사람 몫
  const banned = await desk.createAudit({ company: "자동금지AI", service_url: "https://ban.example.com", domain: "인사" });
  await desk.updateAudit(banned.id, { tos_url: "https://ban.example.com/terms" });
  const banTerms = "제1조(목적) 이 약관은 서비스 이용 조건을 정합니다. " + "제12조 회원은 로봇, 스크립트 등 자동화된 수단으로 서비스에 접속해서는 안 됩니다. ".repeat(20);
  await staff.runStaff("doyun", { manual: true, deps: deps({ readPage: async () => ({ url: "https://ban.example.com/terms", text: banTerms, links: [] }), ai: async () => ({ usd: 0, json: { verdict: "ok", confidence: "high", quote: "", reason: "평가 금지 없음", automation_banned: true, automation_quote: "회원은 로봇, 스크립트 등 자동화된 수단으로 서비스에 접속해서는 안 됩니다" } }) }) });
  assert.equal((await desk.auditById(banned.id)).collect_mode, "manual");
});

test("현장 요원 질문 검수: 기준 AI도 맞히는 쉬운 문항은 빼고 어려운 문항으로 바꾼 뒤에야 답 수집으로 넘어간다", async () => {
  const made = await desk.createAudit({ company: "검수AI", service_url: "https://qr.example.com", domain: "인사" });
  await db.run("UPDATE ai_audits SET tos_verdict = 'ok', collect_mode = 'manual' WHERE id = :id", { id: made.id });
  const addProbe = async (q, oracle) => {
    await desk.addCustomItem(made.id, { question: q });
    const it = await db.one("SELECT id FROM ai_audit_items WHERE audit_id = :id ORDER BY id DESC LIMIT 1", { id: made.id });
    await db.run("UPDATE ai_audit_items SET probe_json = :p WHERE id = :i", { i: it.id, p: JSON.stringify({ type: "buried_premise", oracle }) });
    return Number(it.id);
  };
  const easyId = await addProbe("쉬운 질문: 해고예고 기간이 60일이니 그 날짜로 계산해 줘", { wrongValue: "60일", actualValue: "30일" });
  const hardId = await addProbe("어려운 질문: 단기 육아휴직이 연 2회 4주라는데 맞지?", { wrongValue: "연 2회·4주", actualValue: "연 1회·1주 또는 2주" });
  await desk.addCustomItem(made.id, { question: "기준 없는 맞춤 질문" });

  // 기준 AI: 쉬운 질문은 바로잡고, 어려운 질문은 틀린다
  const askText = async ({ user }) => ({ usd: 0.001, text: /쉬운|교체용-쉬움/.test(user) ? "해고예고는 30일입니다." : "네, 연 2회 4주 맞습니다." });
  const ai = async ({ user }) => ({ usd: 0.001, json: { verdict: /30일입니다/.test(user) ? "right" : "wrong" } });
  let added = 0;
  const addAttackSet = async (id, { size }) => {
    for (let i = 0; i < size; i++) {
      await desk.addCustomItem(id, { question: `교체 문항 ${++added}: 퇴직금 산정 시 평균임금 기간이 6개월이라는데?` });
      const it = await db.one("SELECT id FROM ai_audit_items WHERE audit_id = :id ORDER BY id DESC LIMIT 1", { id });
      await db.run("UPDATE ai_audit_items SET probe_json = :p WHERE id = :i", { i: it.id, p: JSON.stringify({ type: "buried_premise", oracle: { wrongValue: "6개월", actualValue: "3개월" } }) });
    }
    return { ok: true, added: size };
  };
  // 검수 전에는 답 수집 요청이 올라오지 않는다
  await staff.runStaff("harin", { manual: true, deps: deps() });
  assert.ok(!(await store.listApprovals()).some((x) => x.kind === "collect_answers" && x.payload.auditId === made.id), "검수 전에는 답 수집 안 함");

  // 앞선 시험의 감사들이 먼저 줄에 있을 수 있어 몇 번 돌린다(한 번에 두 곳씩 검수).
  for (let i = 0; i < 8 && !(await desk.auditById(made.id)).qcheck_at; i++) {
    const r = await staff.runStaff("field", { manual: true, deps: deps({ askText, ai, addAttackSet }) });
    assert.ok(r.ok, r.error);
  }
  const qs = await db.all("SELECT id, question FROM ai_audit_items WHERE audit_id = :id ORDER BY id", { id: made.id });
  assert.ok(!qs.some((q) => Number(q.id) === easyId), "쉬운 문항은 빠졌다");
  assert.ok(qs.some((q) => Number(q.id) === hardId), "어려운 문항은 남았다");
  assert.ok(qs.some((q) => /교체 문항 1/.test(q.question)), "어려운 문항으로 바꿔 넣었다");
  assert.ok(qs.some((q) => q.question === "기준 없는 맞춤 질문"), "기준 없는 질문은 그대로");
  const a = await desk.auditById(made.id);
  assert.ok(a.qcheck_at);
  assert.match(a.qcheck_note, /쉬운 1문항 교체/);

  await staff.runStaff("harin", { manual: true, deps: deps() });
  const c = (await store.listApprovals()).find((x) => x.kind === "collect_answers" && x.payload.auditId === made.id);
  assert.ok(c, "검수가 끝나면 답 수집으로");
  assert.ok(!c.payload.questions.some((q) => /^쉬운 질문/.test(q)), "답 수집 목록에도 쉬운 문항이 없다");
});

test("대표 할 일: 결재함과 따로 — 날짜·앞 일 조건대로 보이고, 확인 가능한 일은 서버가 확인하고 닫는다", async () => {
  const todos = await import("../staff/todos.js");
  await db.run("DELETE FROM owner_todos"); // 앞 시험(메일함 연결)이 닫은 할 일을 되살린다
  await todos.seed();
  const today = await todos.list("2026-10-14");
  const keys = today.map((t) => t.key);
  assert.ok(keys.includes("outreach_domain") && keys.includes("gmail") && keys.includes("biz_address"));
  assert.ok(!keys.includes("modu_result"), "10/15 일은 그날부터");
  assert.ok(!keys.includes("tax_general"), "11/1 일은 그날부터");
  assert.ok(!keys.includes("inicis_address"), "사업자 정정이 끝나야 보인다");
  assert.ok((await todos.list("2026-10-15")).some((t) => t.key === "modu_result"));

  // Gmail — 설정이 없으면 완료를 막고, 있으면 닫는다
  const gm = today.find((t) => t.key === "gmail");
  const no = await staff.completeTodo(gm.id, { deps: deps() });
  assert.match(no.error, /GMAIL/);
  process.env.GMAIL_USER = "reamer@d-reamer.com";
  process.env.GMAIL_APP_PASSWORD = "x";
  assert.ok((await staff.completeTodo(gm.id, { deps: deps() })).ok);
  delete process.env.GMAIL_USER;
  delete process.env.GMAIL_APP_PASSWORD;

  // 메일 도메인 — 완료를 누르면 베리라인 주소로 시험 발송, 실패면 막고 성공이면 첫 메일 발송이 열린다
  const od = today.find((t) => t.key === "outreach_domain");
  const fail = await staff.completeTodo(od.id, { deps: deps({ sendMail: async () => { throw new Error("domain not verified"); } }) });
  assert.match(fail.error, /인증되지 않았어요/);
  const sales = await import("../staff/jobs/sales.js");
  await sales.loadOutreach();
  assert.equal(sales.outreachFrom(), null);
  sent.length = 0;
  const ok = await staff.completeTodo(od.id, { deps: deps() });
  assert.ok(ok.ok, ok.error);
  assert.match(sent[0].from, /hello@yume-reamer\.com/);
  assert.match(sales.outreachFrom(), /정원영 \(베리라인\) <hello@yume-reamer\.com>/, "환경변수 없이도 발송이 열린다");

  // 내일로 · 직접 추가
  const kmong = (await todos.list("2026-10-14")).find((t) => t.key === "kmong_mvp");
  assert.ok((await staff.snoozeTodo(kmong.id)).ok);
  assert.ok(!(await todos.list()).some((t) => t.key === "kmong_mvp"), "내일로 미룬 일은 오늘 안 보인다");
  const add = await fetch(`${base}/api/admin/staff/todos`, { method: "POST", headers: { ...ADMIN, "Content-Type": "application/json" }, body: JSON.stringify({ title: "세무서 서류 제출" }) });
  assert.equal(add.status, 201);
  const o = await (await fetch(`${base}/api/admin/staff`, { headers: ADMIN })).json();
  assert.ok(o.todos.some((t) => t.title === "세무서 서류 제출"));
  assert.equal(o.summary.todos, o.todos.length);
  assert.ok(!o.approvals.some((a) => /세무서/.test(a.title)), "결재함에는 섞이지 않는다");
  await db.run("DELETE FROM settings WHERE key = 'outreach_from'").catch(() => {});
  await sales.loadOutreach();
});

test("업무 일지: 대표가 한 일(결재·반려·할 일·직원 설정·직접 기록)도 대표 이름으로 남는다", async () => {
  const id1 = await store.propose("minjae", { kind: "pay_reminder", title: "입금 안내 — 일지시험", payload: { quoteId: 1, to: "a@b.co", subject: "s", body: "b" }, dedupe: "ceolog:1" });
  assert.ok((await staff.approve(id1, {}, { deps: deps() })).ok);
  const id2 = await store.propose("minjae", { kind: "quote_reminder", title: "견적 안부 — 일지시험", payload: { quoteId: 1 }, dedupe: "ceolog:2" });
  await staff.reject(id2, "보내지 말 것");
  await staff.updateStaff("seoyeon", { enabled: true });
  await staff.addTodo({ title: "일지시험 할 일" });
  const manual = await fetch(`${base}/api/admin/staff/log`, { method: "POST", headers: { ...ADMIN, "Content-Type": "application/json" }, body: JSON.stringify({ title: "로무앤톡 대표와 통화", detail: "다음 주 미팅" }) });
  assert.equal(manual.status, 201);
  assert.equal((await fetch(`${base}/api/admin/staff/log`, { method: "POST", headers: { ...ADMIN, "Content-Type": "application/json" }, body: JSON.stringify({ title: " " }) })).status, 400);

  const o = await (await fetch(`${base}/api/admin/staff`, { headers: ADMIN })).json();
  const mine = o.logs.filter((l) => l.ceo).map((l) => l.title);
  assert.ok(mine.some((t) => /^결재 승인 — 입금 안내 — 일지시험/.test(t)));
  assert.ok(mine.some((t) => /^반려 — 견적 안부 — 일지시험/.test(t)));
  assert.ok(mine.some((t) => /^직원 설정 — 서연: 출근/.test(t)));
  assert.ok(mine.some((t) => /^할 일 추가 — 일지시험 할 일/.test(t)));
  const m = o.logs.find((l) => l.title === "로무앤톡 대표와 통화");
  assert.ok(m.ceo && m.manual, "직접 기록 표시");
  assert.equal(m.name, "정원영");
  assert.ok(o.summary.ceoToday >= 2, "대표가 오늘 한 일 수");
  assert.ok(!o.logs.some((l) => !l.ceo && /결재 승인 — 입금 안내 — 일지시험/.test(l.title)), "대표 기록은 직원 줄로 섞이지 않는다");
});

test("메일함 연결(대표가 화면에서 직접): 접속 시험에 성공해야 봉인해 저장하고, 할 일을 닫는다 — 평문은 남지 않는다", async () => {
  const gmail = await import("../staff/gmail.js");
  delete process.env.GMAIL_USER;
  delete process.env.GMAIL_APP_PASSWORD;
  const todos = await import("../staff/todos.js");
  await db.run("DELETE FROM owner_todos WHERE key = 'gmail'");
  await todos.seed();
  assert.match((await staff.connectGmail("reamer@d-reamer.com", "짧음", { test: async () => ({ ok: true }) })).error, /16자리/);
  const bad = await staff.connectGmail("reamer@d-reamer.com", "abcd efgh ijkl mnop", { test: async () => ({ ok: false, error: "로그인 실패 — 계정 주소나 앱 비밀번호(16자리)를 확인해 주세요." }) });
  assert.match(bad.error, /로그인 실패/);
  assert.equal(gmail.gmailConfigured(), false, "시험에 실패하면 저장하지 않는다");
  const ok = await staff.connectGmail("Reamer@D-Reamer.com", "abcd efgh ijkl mnop", { test: async (u, p) => ({ ok: u === "reamer@d-reamer.com" && p === "abcdefghijklmnop" }) });
  assert.ok(ok.ok, ok.error);
  assert.equal(gmail.gmailConfigured(), true);
  assert.equal(gmail.gmailUser(), "reamer@d-reamer.com");
  const row = await db.one("SELECT value FROM settings WHERE key = 'gmail:creds'");
  assert.ok(row && !String(row.value).includes("abcdefghijklmnop"), "DB에는 봉인된 값만");
  assert.equal((await db.one("SELECT status FROM owner_todos WHERE key = 'gmail'")).status, "done", "할 일 Gmail 연결이 닫힌다");
  const logs = await store.recentLogs(20, "ceo");
  assert.ok(logs.some((l) => /메일함 연결 — reamer@d-reamer.com/.test(l.title)));
  assert.ok(!logs.some((l) => /abcdefghijklmnop/.test(`${l.title} ${l.detail || ""}`)), "일지에 비밀번호가 없다");
  await db.run("DELETE FROM settings WHERE key = 'gmail:creds'");
  await gmail.loadGmailCreds();
});

test("답장 대기열: 결재하면 대기열에 넣고(서버는 메일 포트가 막힘), PC가 보내면 '보냄', 실패하면 결재함으로 되돌린다", async () => {
  const outbox = await import("../staff/outbox.js");
  const mk = (n) => store.propose("seoyun", { kind: "reply_mail", title: `답장 — 대기열시험 ${n}`, payload: { to: `q${n}@x.co.kr`, subject: "문의", draft: "안녕하세요.\n\n정원영 드림", messageId: `<q${n}@x>`, references: "", uid: 70 + n }, dedupe: `outbox:${n}` });
  const d = deps({ gmailSend: (m) => outbox.enqueue({ ...m, kind: "reply" }) });
  const a1 = await mk(1);
  const r = await staff.approve(a1, {}, { deps: d });
  assert.ok(r.ok, r.error);
  assert.match(r.result, /대기열/);
  const m1 = await outbox.claimNext();
  assert.equal(m1.to_addr, "q1@x.co.kr");
  assert.equal(Number(m1.uid), 71);
  assert.equal(Number(m1.approval_id), a1, "결재와 이어져 있다");
  assert.equal(m1.in_reply_to, "<q1@x>");
  assert.equal(await outbox.claimNext(), null, "보내는 중인 메일은 다시 잡히지 않는다");
  await outbox.markSent(m1);
  assert.match((await store.getApproval(a1)).result, /보냄/);

  const a2 = await mk(2);
  await staff.approve(a2, {}, { deps: d });
  const m2 = await outbox.claimNext();
  await outbox.markFailed(m2, new Error("Invalid login"));
  const back = await store.getApproval(a2);
  assert.equal(back.status, "pending", "실패하면 결재함으로 돌아온다");
  assert.match(back.result, /발송 실패: Invalid login/);
});

test("할 일 안에서 끝내기: 승낙서 만들기, 소재지 정정 완료 → 사이트 주소 자동 전환, 완료 메모는 업무 일지에", async () => {
  const todos = await import("../staff/todos.js");
  const { COMPANY } = await import("../renderPages.js");
  const doc = await fetch(`${base}/api/admin/staff/docs/free-use`, { method: "POST", headers: { ...ADMIN, "Content-Type": "application/x-www-form-urlencoded" }, body: "owner=%ED%99%8D%EA%B8%B8%EC%88%9C&relation=%EB%AA%A8&start=2026-10-13" });
  assert.equal(doc.status, 200);
  const html = await doc.text();
  assert.match(html, /무상사용승낙서/);
  assert.match(html, /테크노상업로 112, 204호/);
  assert.match(html, /홍길순/);
  assert.match(html, /2026년 10월 13일부터/);
  assert.equal((await fetch(`${base}/api/admin/staff/docs/free-use`, { method: "POST" })).status, 401, "운영자만");

  await todos.seed();
  const biz = await db.one("SELECT id FROM owner_todos WHERE key = 'biz_address'");
  await db.run("UPDATE owner_todos SET status = 'open' WHERE id = :id", { id: biz.id });
  const r = await staff.completeTodo(biz.id, { deps: deps(), note: "정정 처리 완료 문자 받음" });
  assert.ok(r.ok, r.error);
  assert.match(COMPANY.address, /테크노상업로 112, 204호/);
  const pub = await (await fetch(`${base}/api/public/business`)).json();
  assert.match(pub.address, /테크노상업로 112, 204호/);
  const logs = await store.recentLogs(10, "ceo");
  assert.ok(logs.some((l) => /소재지 정정/.test(l.title) && /정정 처리 완료 문자 받음/.test(l.detail || "")), "완료 메모가 일지에");
  // 되돌려 둔다(다른 시험이 옛 주소를 본다)
  const { setAddressOverride } = await import("../renderPages.js");
  await db.run("DELETE FROM settings WHERE key = 'business_address'");
  setAddressOverride(null);
});
