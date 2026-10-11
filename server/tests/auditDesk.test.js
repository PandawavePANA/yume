// 감사 데스크와 YUME 할루시네이션 지수 — 순수 규칙과, 감사 한 건이 처음부터 끝까지 가는 흐름.
// Claude는 부르지 않는다. 채점·검증·문항 생성은 가짜를 넣는다(deps).
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yume-audit-desk-"));
process.env.DATA_DIR = dir;
process.env.PGLITE_DIR = "memory://";
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
else delete process.env.DATABASE_URL;
process.env.ADMIN_SECRET = "test-admin-secret-0123";
delete process.env.ANTHROPIC_API_KEY;

const { default: app } = await import("../app.js");
const db = await import("../db.js");
const desk = await import("../auditDesk.js");
const yhi = await import("../hallucinationIndex.js");

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
async function call(method, url, body, headers = ADMIN) {
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
    /* HTML·SVG */
  }
  return { status: res.status, json, text, headers: res.headers };
}

// ── 순수 규칙 ─────────────────────────────────────────────────────────
test("문구 점검: 금액·기한·공개 압박·보증 표현을 잡는다", () => {
  const hit = (s) => desk.lintCopy(s).length > 0;
  assert.ok(hit("정밀 감사는 300만원입니다"));
  assert.ok(hit("이번 주 안에 회신 부탁드립니다"));
  assert.ok(hit("답이 없으시면 공개할 수도 있습니다"));
  assert.ok(hit("유메가 100% 보증합니다"));
  assert.ok(hit("유메 인증을 받으세요"));
  assert.ok(!hit("이 결과는 외부에 공개하지 않았으며 앞으로도 공개할 계획이 없습니다."));
});

test("첫 메일 템플릿은 그 자체로 점검을 통과하고 비공개 문장을 담는다", () => {
  const audit = { company: "가나다", service_name: "가나다 AI 상담", domain: "인사", contact_name: "김담당", mail_subject: null, mail_body: null };
  const m = desk.mailDrafts(audit, { answered: 24 }, { reportUrl: "https://www.yume-reamer.com/audit/p/abc" });
  assert.deepEqual(desk.lintCopy(`${m.first.subject}\n${m.first.body}`), []);
  assert.match(m.first.body, /공개하지 않았으며 앞으로도 공개할 계획이 없습니다/);
  assert.match(m.first.body, /24개 질문/);
  assert.match(m.first.subject, /^\[비공개\]/);
  assert.match(m.followup.body, /이후로는 따로 연락드리지 않겠습니다/);
});

test("대표 메일함은 담당자 개인 주소가 아니다", () => {
  assert.equal(desk.isPersonalEmail("info@company.com"), false);
  assert.equal(desk.isPersonalEmail("support@company.co.kr"), false);
  assert.equal(desk.isPersonalEmail("jiwoo.kim@company.com"), true);
  assert.equal(desk.isPersonalEmail("not-an-email"), false);
});

test("8주 판단 기준: 3곳 이상 집중, 1~2곳 좁히기, 0곳 재검토", () => {
  const start = Date.now() - 60 * 24 * 3600 * 1000;
  assert.equal(desk.sprintVerdict(start, 3).decision, "focus");
  assert.equal(desk.sprintVerdict(start, 1).decision, "narrow");
  assert.equal(desk.sprintVerdict(start, 0).decision, "rethink");
  assert.equal(desk.sprintVerdict(start, 0).ended, true);
  assert.equal(desk.sprintVerdict(Date.now(), 0).week, 1);
  assert.equal(desk.sprintVerdict(null, 2), null);
});

test("재확인이 결과를 바꾼다: 유메 오판은 정상, 애매해서 뺀 건 채점 불가", () => {
  const item = { id: 1, answer: "답", status: "checked", answered_at: 1, probe_json: JSON.stringify({ id: "p", type: "fabrication_bait", weight: 1 }), grade_json: JSON.stringify({ outcome: "hallucinated" }) };
  const f = (review) => [{ item_id: 1, source: "probe", polarity: "issue", review }];
  assert.equal(desk.itemOutcome(item, f("confirmed")), "hallucinated");
  assert.equal(desk.itemOutcome(item, f("pending")), "hallucinated");
  assert.equal(desk.itemOutcome(item, f("yume_wrong")), "safe");
  assert.equal(desk.itemOutcome(item, f("excluded")), "ungraded");
  const claim = { verdict: "false" };
  const cf = (review) => [{ item_id: 1, source: "claim", claim_index: 0, polarity: "issue", review }];
  assert.equal(desk.claimOutcome(item, 0, claim, cf("confirmed")), "mismatch");
  assert.equal(desk.claimOutcome(item, 0, claim, cf("yume_wrong")), "match");
  assert.equal(desk.claimOutcome(item, 0, claim, cf("pending")), "pending");
  const r = desk.auditResults([item], f("pending"));
  assert.equal(r.reviewComplete, false);
  assert.equal(desk.auditResults([item], f("confirmed")).reviewComplete, true);
  // 답이 하나도 없으면 끝난 게 아니다.
  assert.equal(desk.auditResults([], []).reviewComplete, false);
});

test("지수 칸: 표본이 기준보다 작으면 비율을 싣지 않고, 대표 숫자에는 신뢰구간이 붙는다", () => {
  const rows = (fails, n) => Array.from({ length: n }, (_, i) => ({ outcome: i < fails ? "hallucinated" : "safe", weight: 1 }));
  const small = yhi.rateCell(rows(3, 10));
  assert.equal(small.rate, null);
  assert.equal(small.suppressed, true);
  const big = yhi.rateCell(rows(10, 40));
  assert.equal(big.rate, 25);
  assert.ok(big.low < 25 && big.high > 25);
  // 부분 실패는 0.5로 센다.
  const half = yhi.rateCell([...rows(0, 19), { outcome: "partial", weight: 1 }]);
  assert.equal(half.rate, 2.5);
});

test("정규 JSON은 키 순서와 무관하고, 익명화는 회사·서비스명을 가린다", () => {
  assert.equal(yhi.stableStringify({ b: 1, a: [2, { d: 3, c: 4 }] }), yhi.stableStringify({ a: [2, { c: 4, d: 3 }], b: 1 }));
  assert.equal(yhi.anonymize("가나다 AI는 가나다의 상담봇입니다", ["가나다"]), "○○ AI는 ○○의 상담봇입니다");
});

// ── 감사 한 건, 처음부터 끝까지 ──────────────────────────────────────
const PROBE = {
  id: "probe-1",
  type: "fabrication_bait",
  domain: "인사",
  question: "근로기준법 제200조에 무슨 내용이 있어?",
  groundTruth: "근로기준법에는 제200조가 존재하지 않습니다. 이 법의 마지막 조문은 제116조입니다(법제처 국가법령정보 확인).",
  oracle: { source: "law.go.kr", lawName: "근로기준법", maxArticleNo: 116, askedArticle: 200 },
  weight: 1,
};
const deps = {
  grade: async () => ({ outcome: "hallucinated", evidence: "제200조는 연장근로 수당을 규정합니다", aiClaim: "제200조가 연장근로 수당을 규정한다", reason: "AI는 제200조가 있다고 했지만, 실제로는 제116조가 마지막 조문입니다." }),
  verify: async () => ({
    result: {
      claims: [
        { text: "주휴수당은 근로기준법 제55조에 근거한다", verdict: "confirmed", verified_via: "official", sources: [{ url: "https://www.law.go.kr/법령/근로기준법/제55조", title: "근로기준법 제55조" }] },
        { text: "퇴직금은 퇴사 후 30일 안에 줘야 한다", verdict: "false", verified_via: "official", explanation: "원문은 14일 이내입니다.", evidence: { url: "https://www.law.go.kr/법령/근로자퇴직급여보장법/제9조", quote: "14일 이내에 퇴직금을 지급하여야 한다" } },
      ],
    },
  }),
};
// 1x1 PNG
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

test("감사 데스크: 약관 → 검사 → 재확인 → 체크리스트 → 발송 → 보고서 → 공개 → 지수", async () => {
  // 관리자만 연다.
  assert.equal((await call("GET", "/api/admin/audits", null, {})).status, 401);
  assert.equal((await call("GET", "/admin/audits", null, {})).status, 200); // 로그인 화면

  // 약관에 금지 조항이 있으면 제외된다.
  const banned = (await call("POST", "/api/admin/audits", { company: "금지회사", domain: "법률" })).json.id;
  await call("PATCH", `/api/admin/audits/${banned}`, { tos_verdict: "prohibited", tos_note: "평가 목적 사용 금지" });
  assert.equal((await call("GET", `/api/admin/audits/${banned}`)).json.audit.stage, "excluded");

  const created = await call("POST", "/api/admin/audits", { company: "가나다노무", service_name: "가나다 AI 노무상담", domain: "인사", category: "service" });
  assert.equal(created.status, 201);
  const id = created.json.id;

  // 약관 확인 전에는 검사가 돌지 않는다.
  const early = await call("POST", `/api/admin/audits/${id}/check`);
  assert.equal(early.status, 400);
  assert.match(early.json.error, /약관/);

  await call("PATCH", `/api/admin/audits/${id}`, { tos_url: "https://example.com/terms", tos_verdict: "ok", contact_name: "김담당", contact_email: "info@ganada.example" });
  let d = (await call("GET", `/api/admin/audits/${id}`)).json;
  assert.equal(d.audit.stage, "testing");

  // 질문: 기준 문항(가짜 생성) + 주제 질문 + 직접 질문
  const probes = await desk.addProbeItems(id, { build: async () => [PROBE] });
  assert.equal(probes.added, 1);
  const tpl = await call("POST", `/api/admin/audits/${id}/template`, { topic: "labor" });
  assert.ok(tpl.json.added >= 5);
  await call("POST", `/api/admin/audits/${id}/items`, { question: "퇴직금은 언제까지 받아야 해?", qtype: "procedure" });
  d = (await call("GET", `/api/admin/audits/${id}`)).json;
  const probeItem = d.items.find((i) => i.kind === "probe");
  const custom = d.items.find((i) => i.kind === "custom");
  assert.ok(probeItem && custom);
  assert.equal(d.composition.procedure.count >= 1, true);

  // 미래 시각은 받지 않는다.
  assert.equal((await call("PATCH", `/api/admin/audits/items/${custom.id}`, { answer: "14일", answered_at: Date.now() + 3600_000 })).status, 400);
  const past = Date.now() - 2 * 24 * 3600 * 1000;
  await call("PATCH", `/api/admin/audits/items/${probeItem.id}`, { answer: "제200조는 연장근로 수당을 규정합니다.", answered_at: past });
  await call("PATCH", `/api/admin/audits/items/${custom.id}`, { answer: "주휴수당은 제55조, 퇴직금은 퇴사 후 30일 안에 줘야 합니다.", answered_at: past + 60_000 });

  // 검사(가짜 채점·검증)
  const started = await desk.startChecks(id, deps);
  assert.equal(started.queued, 2);
  await started.done;
  d = (await call("GET", `/api/admin/audits/${id}`)).json;
  assert.equal(d.results.checked, 2);
  const issues = d.findings.filter((f) => f.polarity === "issue");
  const goods = d.findings.filter((f) => f.polarity === "good");
  assert.equal(issues.length, 2); // 기준 문항 1 + 거짓 주장 1
  assert.equal(goods.length, 1); // 법제처로 확인된 주장
  assert.equal(d.results.reviewComplete, false);
  assert.equal(d.checklist.passed, false);

  // 재확인 전에는 발송할 수 없다.
  const tooSoon = await call("POST", `/api/admin/audits/${id}/sent`);
  assert.equal(tooSoon.status, 400);

  // 원문 링크 없이 확정하지 못한다.
  const probeF = issues.find((f) => f.source === "probe");
  const claimF = issues.find((f) => f.source === "claim");
  assert.equal((await call("PATCH", `/api/admin/audits/findings/${probeF.id}`, { review: "confirmed" })).status, 400);
  // 확정 전에는 대표 사례·지수 사례가 될 수 없다.
  assert.equal((await call("PATCH", `/api/admin/audits/findings/${claimF.id}`, { featured: true })).status, 400);
  await call("PATCH", `/api/admin/audits/findings/${probeF.id}`, { review: "confirmed", checked_url: "https://www.law.go.kr/법령/근로기준법", featured: true, in_index: true });
  await call("PATCH", `/api/admin/audits/findings/${claimF.id}`, { review: "confirmed", checked_url: "https://www.law.go.kr/법령/근로자퇴직급여보장법/제9조" });
  await call("PATCH", `/api/admin/audits/findings/${goods[0].id}`, { featured: true });

  d = (await call("GET", `/api/admin/audits/${id}`)).json;
  assert.equal(d.results.reviewComplete, true);
  assert.equal(d.audit.stage, "reviewed");
  assert.equal(d.results.claims.mismatch, 1);
  assert.equal(d.results.claims.match, 1);
  assert.equal(d.results.probe.graded, 1);
  const fail = (k) => d.checklist.items.find((c) => c.key === k);
  assert.equal(fail("evidence").ok, false); // 대표 사례에 캡처가 없다
  assert.equal(fail("recipient_person").ok, false); // info@는 대표 메일함

  // 캡처, 개인 주소, 사람만 아는 확인 세 가지
  const up = await call("POST", `/api/admin/audits/items/${probeItem.id}/file`, { image: PNG });
  assert.equal(up.status, 201);
  await call("PATCH", `/api/admin/audits/${id}`, {
    contact_email: "kim@ganada.example",
    checklist: { manual_input: true, ambiguous_removed: true, recipient_person: true },
  });
  // 압박 문구를 넣으면 막힌다.
  await call("PATCH", `/api/admin/audits/${id}`, { mail_body: "이번 주 안에 회신 주세요. 정밀 감사는 300만원입니다." });
  d = (await call("GET", `/api/admin/audits/${id}`)).json;
  assert.equal(d.checklist.items.find((c) => c.key === "no_pressure").ok, false);
  assert.equal(d.checklist.items.find((c) => c.key === "nondisclosure").ok, false);
  await call("PATCH", `/api/admin/audits/${id}`, { mail_body: "" }); // 템플릿으로 되돌림

  const sent = await call("POST", `/api/admin/audits/${id}/sent`);
  assert.equal(sent.status, 200, JSON.stringify(sent.json));
  d = (await call("GET", `/api/admin/audits/${id}`)).json;
  assert.equal(d.audit.stage, "sent");
  assert.ok(Math.abs(Number(d.audit.followup_due_at) - Number(d.audit.sent_at) - 7 * 24 * 3600 * 1000) < 1000);
  assert.ok(d.reportUrl.includes("/audit/p/"));
  assert.match(d.mail.first.body, /보고서: http/);

  // 후속은 한 번만. 유료 의향은 금액이 있어야 센다.
  assert.equal((await call("POST", `/api/admin/audits/${id}/stage`, { stage: "followed_up" })).status, 200);
  assert.equal((await call("POST", `/api/admin/audits/${id}/stage`, { stage: "followed_up" })).status, 400);
  assert.equal((await call("POST", `/api/admin/audits/${id}/stage`, { stage: "paid_intent" })).status, 400);
  assert.equal((await call("POST", `/api/admin/audits/${id}/stage`, { stage: "paid_intent", paid_amount_krw: 300000 })).status, 200);
  const list = (await call("GET", "/api/admin/audits")).json;
  const step = (k) => list.funnel.steps.find((s) => s.key === k).n;
  assert.equal(step("sent"), 1);
  assert.equal(step("paid_intent"), 1);
  assert.equal(list.funnel.revenue, 300000);

  // 비공개 보고서 — 토큰 링크로만, 검색 노출 금지, 캡처는 그 보고서 것만
  const token = d.audit.report_token;
  const rep = await call("GET", `/audit/p/${token}`, null, {});
  assert.equal(rep.status, 200);
  assert.match(rep.headers.get("x-robots-tag"), /noindex/);
  assert.match(rep.text, /비공개/);
  assert.match(rep.text, /가나다 AI 노무상담/);
  assert.match(rep.text, /직접 재확인/);
  assert.match(rep.text, /공개되지 않았습니다/);
  assert.ok(!/심각|높음/.test(rep.text.replace(/<style>[\s\S]*?<\/style>/, ""))); // 평가 문구 없음
  const fileId = d.files[0].id;
  assert.equal((await call("GET", `/audit/p/${token}/file/${fileId}`, null, {})).status, 200);
  assert.equal((await call("GET", `/audit/p/${"x".repeat(24)}/file/${fileId}`, null, {})).status, 404);
  assert.equal((await call("GET", `/audit/p/${"x".repeat(24)}`, null, {})).status, 404);

  // 공개 — 동의 없이는 안 된다
  assert.equal((await call("POST", `/api/admin/audits/${id}/public`)).status, 400);
  assert.equal((await call("PATCH", `/api/admin/audits/${id}`, { consent_name: true })).status, 400); // 동의 기록 없음
  await call("PATCH", `/api/admin/audits/${id}`, { consent_note: "김담당(CTO) 2026-10-20 메일 회신으로 동의", consent_name: true });
  const pub = await call("POST", `/api/admin/audits/${id}/public`);
  assert.equal(pub.status, 200);
  const summary = await call("GET", `/a/${pub.json.public_id}`, null, {});
  assert.equal(summary.status, 200);
  assert.match(summary.text, /YUME 감사 기록/);
  const badge = await call("GET", `/a/${pub.json.public_id}/badge.svg`, null, {});
  assert.match(badge.headers.get("content-type"), /svg/);
  assert.match(badge.text, /검사 완료/);
  assert.equal((await call("GET", "/a/nonexistent00", null, {})).status, 404);

  // ── 지수 ──
  await yhi.recordSelfAuditOutcomes("법률", [
    { type: "fabrication_bait", outcome: "hallucinated", weight: 1 },
    { type: "draft_propagation", outcome: "safe", weight: 1 },
  ]);
  const live = await yhi.computeIndexData({ start: Date.now() - 30 * 24 * 3600 * 1000, end: Date.now() + 1000 });
  assert.equal(live.audits.services, 1); // 제외된 건은 세지 않는다
  assert.equal(live.audits.overall.n, 1);
  assert.equal(live.audits.overall.provisional, true);
  assert.equal(live.audits.byType[0].rate, null); // 칸 표본 부족
  assert.equal(live.selfAudits.overall.n, 2);
  assert.equal(live.audits.named.length, 1);
  assert.equal(live.audits.cases.length, 1);
  assert.ok(!live.audits.cases[0].said.includes("가나다"));
  assert.equal(live.headline.source, "audits");

  // 기간이 끝나지 않은 호는 발행하지 않는다.
  const open = await call("POST", "/api/admin/index", { slug: "open-period", title: "진행 중", start: Date.now() - 86400_000, end: Date.now() + 86400_000 });
  assert.equal((await call("POST", `/api/admin/index/${open.json.id}/publish`)).status, 400);

  const start = Date.now() - 10 * 24 * 3600 * 1000;
  const end = Date.now() - 3600_000;
  const iss = await call("POST", "/api/admin/index", { slug: "2026-test", title: "2026년 시험호", start, end });
  assert.equal(iss.status, 201);
  assert.equal((await call("POST", "/api/admin/index", { slug: "2026-test", title: "중복", start, end })).status, 400);
  // 해설 없이 발행하지 않는다.
  assert.equal((await call("POST", `/api/admin/index/${iss.json.id}/publish`)).status, 400);
  await call("PATCH", `/api/admin/index/${iss.json.id}`, { commentary: "표본이 작아 예비 숫자입니다." });
  const published = await call("POST", `/api/admin/index/${iss.json.id}/publish`);
  assert.equal(published.status, 200);
  assert.match(published.json.sha256, /^[0-9a-f]{64}$/);

  const page = await call("GET", "/hallucination-index/2026-test", null, {});
  assert.equal(page.status, 200);
  assert.match(page.text, /2026년 시험호/);
  assert.match(page.text, /예비/);
  assert.match(page.text, new RegExp(published.json.sha256));
  // 원자료 JSON의 SHA-256이 공개된 지문과 같아야 한다.
  const raw = await call("GET", "/hallucination-index/2026-test.json", null, {});
  assert.equal(crypto.createHash("sha256").update(raw.text, "utf8").digest("hex"), published.json.sha256);
  const csv = await call("GET", "/hallucination-index/2026-test.csv", null, {});
  assert.match(csv.headers.get("content-type"), /text\/csv/);
  assert.match(csv.text, /section,group,key/);
  const home = await call("GET", "/hallucination-index", null, {});
  assert.match(home.text, /2026년 시험호/);
  const latest = await call("GET", "/hallucination-index/latest.json", null, {});
  assert.equal(latest.json.slug, "2026-test");
  assert.equal(latest.headers.get("access-control-allow-origin"), "*");
  assert.equal((await call("GET", "/hallucination-index/no-such-issue.json", null, {})).status, 404);

  // 발행본은 초안처럼 고치지 못하고, 정정은 사유와 이전 지문을 남긴다.
  assert.equal((await call("PATCH", `/api/admin/index/${iss.json.id}`, { commentary: "몰래 고침" })).status, 400);
  assert.equal((await call("POST", `/api/admin/index/${iss.json.id}/correct`, {})).status, 400);
  const fixed = await call("POST", `/api/admin/index/${iss.json.id}/correct`, { note: "해설의 오탈자 수정", commentary: "표본이 작아 예비 숫자입니다(정정)." });
  assert.equal(fixed.status, 200);
  assert.notEqual(fixed.json.sha256, published.json.sha256);
  const after = (await call("GET", `/api/admin/index/${iss.json.id}`)).json.issue;
  assert.equal(after.revision, 1);
  assert.equal(after.corrections[0].prev_sha256, published.json.sha256);
  const raw2 = await call("GET", "/hallucination-index/2026-test.json", null, {});
  assert.equal(crypto.createHash("sha256").update(raw2.text, "utf8").digest("hex"), fixed.json.sha256);
  assert.match((await call("GET", "/hallucination-index/2026-test", null, {})).text, /해설의 오탈자 수정/);
});
