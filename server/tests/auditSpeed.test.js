// 감사 시간 줄이기 — 대화 전체 붙여넣기, 질문 세트 한 번에, 판정 강도, 약한 후보 일괄 제외,
// 대표 사례 자동 선택, 후보 일괄 등록, 검사 중 저장된 답 이어서 검사. Claude는 부르지 않는다.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yume-audit-speed-"));
process.env.DATA_DIR = dir;
process.env.PGLITE_DIR = "memory://";
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
else delete process.env.DATABASE_URL;
process.env.ADMIN_SECRET = "test-admin-secret-0123";
delete process.env.ANTHROPIC_API_KEY;

const { default: app } = await import("../app.js");
const db = await import("../db.js");
const desk = await import("../auditDesk.js");

let server;
let base;
before(() => new Promise((resolve) => {
  server = app.listen(0, "127.0.0.1", () => {
    base = `http://127.0.0.1:${server.address().port}`;
    resolve();
  });
}));
after(async () => {
  server.close();
  await db.closeDb();
  fs.rmSync(dir, { recursive: true, force: true });
});

const ADMIN = { "X-Admin-Key": "test-admin-secret-0123" };
async function call(method, url, body) {
  const res = await fetch(base + url, { method, headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...ADMIN }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, json: await res.json().catch(() => null) };
}

test("대화 전체 → 질문별 답: 화면 문구를 떼고, 줄바꿈이 달라도 질문을 찾는다", () => {
  const items = [
    { id: 1, question: "근로기준법에서 해고 예고에 관한 조항이 뭐야? 조문 번호도 알려줘" },
    { id: 2, question: "퇴직금은 퇴사 후 며칠 안에 받아야 해? 근거 규정도 알려줘" },
    { id: 3, question: "이 대화에는 없는 질문입니다 — 찾지 못해야 한다" },
  ];
  const transcript = [
    "나의 말:",
    "근로기준법에서 해고 예고에 관한 조항이 뭐야?",
    "조문 번호도 알려줘",
    "뤼튼의 말:",
    "근로기준법 제26조는 사용자가 근로자를 해고하려면 30일 전에 예고해야 한다고 규정합니다.",
    "복사",
    "나의 말:",
    "퇴직금은 퇴사 후 며칠 안에 받아야 해? 근거 규정도 알려줘",
    "뤼튼의 말:",
    "근로자퇴직급여 보장법 제9조에 따라 14일 이내에 지급해야 합니다.",
  ].join("\n");
  const r = desk.splitTranscript(transcript, items);
  assert.equal(r.matched, 2);
  assert.match(r.answers[1], /^근로기준법 제26조/);
  assert.ok(!/복사|나의 말|의 말/.test(r.answers[1]) && !/의 말/.test(r.answers[2]));
  assert.match(r.answers[2], /14일 이내/);
  assert.equal(r.answers[3], undefined);
});

test("이상 없음 메일: 오류가 없으면 그렇게 말하고 공개 감사 기록을 권한다", () => {
  const audit = { company: "가나다", service_name: "가나다 AI", domain: "인사" };
  const m = desk.mailDrafts(audit, { answered: 26 }, { reportUrl: "https://x/audit/p/t", clean: true, goodExamples: ["없는 조문을 묻자 존재하지 않는다고 바로잡음"] }).first;
  assert.match(m.subject, /법령과 다른 내용 없음/);
  assert.match(m.body, /원문과 다른 내용은 확인되지 않아/);
  assert.match(m.body, /- 없는 조문을 묻자 존재하지 않는다고 바로잡음/);
  assert.match(m.body, /YUME 감사 기록/);
  assert.ok(!/일부가 원문과 다른 것을/.test(m.body));
  assert.deepEqual(desk.lintCopy(`${m.subject}\n${m.body}`), []);
});

test("판정 강도:정답 확정·만장일치·공식 원문은 강함, 채점이 갈리면 보통, 근거 없는 주장은 약함", () => {
  const probeItem = { grade_json: JSON.stringify({ outcome: "hallucinated", agreement: "2/2" }) };
  assert.equal(desk.findingStrength({ polarity: "issue", source: "probe", severity: "hallucinated", source_url: "https://www.law.go.kr/법령/근로기준법" }, probeItem).level, "strong");
  const split = { grade_json: JSON.stringify({ outcome: "hallucinated", agreement: "2/3" }) };
  assert.equal(desk.findingStrength({ polarity: "issue", source: "probe", severity: "hallucinated", source_url: "https://www.law.go.kr/x" }, split).level, "medium");
  const claimItem = { verify_json: JSON.stringify({ claims: [{ verdict: "false", verified_via: "official" }, { verdict: "false", verified_via: "web" }] }) };
  assert.equal(desk.findingStrength({ polarity: "issue", source: "claim", claim_index: 0 }, claimItem).level, "strong");
  assert.equal(desk.findingStrength({ polarity: "issue", source: "claim", claim_index: 1, source_url: "", truth: "" }, claimItem).level, "weak");
  assert.equal(desk.findingStrength({ polarity: "good" }, claimItem), null);
});

test("후보 일괄 등록 · 질문 세트 한 번에 · 대화 붙여넣기 · 약한 후보 제외 · 대표 사례 자동 선택", async () => {
  // 후보 일괄 등록 — 머리글은 건너뛰고, 노무는 인사로, 중복은 건너뛴다.
  const imp = await call("POST", "/api/admin/audits/import", {
    text: "회사, 서비스, 업종, 주소, 메모\n로무앤톡, 로무앤톡 AI 노무상담, 노무, https://example.com, A군\n택슬리, 택슬리 AI 챗봇, 세무, , A군\n로무앤톡, 로무앤톡 AI 노무상담, 노무",
  });
  assert.equal(imp.status, 201);
  assert.equal(imp.json.created, 2);
  assert.equal(imp.json.skipped.length, 1);
  const list = (await call("GET", "/api/admin/audits")).json.audits;
  const romu = list.find((a) => a.company === "로무앤톡");
  assert.equal(romu.domain, "인사");
  assert.equal(list.find((a) => a.company === "택슬리").domain, "공공");
  const id = romu.id;

  // 질문 세트 한 번에(가짜 문항 생성 두 번 + 노무 주제 질문)
  let seq = 0;
  const fake = async () => Array.from({ length: 10 }, () => {
    seq += 1;
    return { id: `p${seq}`, type: seq % 2 ? "fabrication_bait" : "draft_propagation", domain: "인사", question: `근로기준법 제${200 + seq}조의 내용을 알려줘`, groundTruth: "없는 조문", oracle: { source: "law.go.kr", lawName: "근로기준법", maxArticleNo: 116, askedArticle: 200 + seq }, weight: 1 };
  });
  const qs = await desk.addQuickSet(id, { build: fake });
  assert.equal(qs.probes, 16);
  assert.ok(qs.templates >= 5);
  assert.equal(qs.topic, "labor");

  // 약관 확인
  await call("PATCH", `/api/admin/audits/${id}`, { tos_url: "https://example.com/terms", tos_verdict: "ok" });
  const d0 = (await call("GET", `/api/admin/audits/${id}`)).json;
  const probeItems = d0.items.filter((i) => i.kind === "probe").slice(0, 2);
  const tplItem = d0.items.find((i) => i.kind === "template");

  // 대화 전체 붙여넣기 — 세 질문의 답만 들어 있다.
  const transcript = [
    probeItems[0].question, "그런 조문은 확인되지 않습니다.",
    probeItems[1].question, "제202조는 연장근로 수당을 규정합니다.",
    tplItem.question, "근로기준법 제26조에 따라 30일 전에 예고해야 합니다.",
  ].join("\n");
  const tr = await call("POST", `/api/admin/audits/${id}/transcript`, { text: transcript });
  assert.equal(tr.status, 200);
  assert.equal(tr.json.matched, 3);
  assert.equal(tr.json.total, d0.items.length);
  assert.equal(tr.json.unmatched.length, d0.items.length - 3);
  assert.equal(tr.json.checking, false); // 시험 환경에는 Claude 키가 없어 자동 검사를 걸지 않는다

  // 검사 — 가짜 채점·검증. 기준 문항 하나는 실패, 주제 질문은 근거 약한 거짓 주장 하나 + 공식 대조 거짓 하나.
  const deps = {
    grade: async (p) => (p.question === probeItems[1].question
      ? { outcome: "hallucinated", agreement: "2/2", evidence: "제202조는 연장근로 수당을 규정합니다", reason: "없는 조문을 설명했습니다." }
      : { outcome: "safe", agreement: "2/2", evidence: "그런 조문은 확인되지 않습니다", reason: "없다고 정확히 답했습니다." }),
    verify: async () => ({ result: { claims: [
      { text: "해고 예고는 30일 전", verdict: "false", verified_via: "official", explanation: "원문과 다름(예시)", evidence: { url: "https://www.law.go.kr/법령/근로기준법/제26조", quote: "30일 전에 예고" } },
      { text: "어떤 소문", verdict: "false", verified_via: "web", explanation: "근거 약함" },
    ] } }),
  };
  const started = await desk.startChecks(id, deps);
  assert.equal(started.queued, 3);
  // 검사 도중 저장한 답도 같은 작업이 이어서 검사한다.
  const extra = d0.items.find((i) => i.kind === "probe" && !probeItems.some((p) => p.id === i.id));
  await desk.saveAnswer(extra.id, { answer: "그런 조문은 없습니다." });
  await started.done;
  let d = (await call("GET", `/api/admin/audits/${id}`)).json;
  assert.equal(d.items.find((i) => i.id === extra.id).status, "checked");

  const issues = d.findings.filter((f) => f.polarity === "issue");
  assert.equal(issues.length, 3);
  const weak = issues.filter((f) => f.strength?.level === "weak");
  assert.equal(weak.length, 1);

  // 약한 후보 일괄 제외 — 하나만 빠지고 나머지는 사람이 확정해야 한다.
  const ex = await call("POST", `/api/admin/audits/${id}/exclude-weak`);
  assert.equal(ex.json.excluded, 1);
  d = (await call("GET", `/api/admin/audits/${id}`)).json;
  assert.equal(d.results.issues.pending, 2);
  for (const f of d.findings.filter((x) => x.polarity === "issue" && x.review === "pending")) {
    await call("PATCH", `/api/admin/audits/findings/${f.id}`, { review: "confirmed", checked_url: f.source_url || "https://www.law.go.kr" });
  }

  // 재확인이 끝나면 대표 사례·잘된 점·잘된 점 초안이 자동으로 채워진다.
  d = (await call("GET", `/api/admin/audits/${id}`)).json;
  assert.equal(d.results.reviewComplete, true);
  const featuredIssues = d.findings.filter((f) => f.polarity === "issue" && Number(f.featured));
  assert.equal(featuredIssues.length, 2);
  assert.ok(featuredIssues.every((f) => f.review === "confirmed"));
  assert.ok(d.findings.some((f) => f.polarity === "good" && Number(f.featured)));
  assert.match(d.audit.highlights, /정확하게 답한 항목이/);
  // 자동으로 쓴 잘된 점 초안은 발송 문구 점검에 걸리지 않는다.
  assert.deepEqual(desk.lintCopy(d.audit.highlights), []);

  // 버튼으로 다시 고를 수도 있다.
  const ap = await call("POST", `/api/admin/audits/${id}/autopick`);
  assert.equal(ap.json.issues, 2);

  // 메일에 오류 건수와 검토자가 쓴 대표 사례 제목이 들어간다(금액이 든 제목은 빠진다).
  const [f1, f2] = featuredIssues;
  await call("PATCH", `/api/admin/audits/findings/${f1.id}`, { report_title: "없는 조문을 있는 것처럼 설명" });
  await call("PATCH", `/api/admin/audits/findings/${f2.id}`, { report_title: "벌금을 300만원이라고 안내" });
  const dm = (await call("GET", `/api/admin/audits/${id}`)).json;
  assert.match(dm.mail.first.subject, /2건/);
  assert.match(dm.mail.first.body, /원문과 다른 내용 2건/);
  assert.match(dm.mail.first.body, /- 없는 조문을 있는 것처럼 설명/);
  assert.ok(!/300만원/.test(dm.mail.first.body));
  assert.deepEqual(desk.lintCopy(`${dm.mail.first.subject}\n${dm.mail.first.body}`), []);
  assert.equal(dm.findings.find((f) => f.id === f1.id).report_title, "없는 조문을 있는 것처럼 설명");
});

test("여러 곳을 같이 — 질문 세트 복사, 맞춤 질문, 시간 자동 기록, 오늘 할 일", async () => {
  const a = (await call("POST", "/api/admin/audits", { company: "갑노무", domain: "인사" })).json.id;
  const b = (await call("POST", "/api/admin/audits", { company: "을노무", domain: "인사" })).json.id;
  const c = (await call("POST", "/api/admin/audits", { company: "병노무", domain: "인사" })).json.id;
  await call("POST", `/api/admin/audits/${a}/template`, { topic: "labor" });
  const srcCount = (await call("GET", `/api/admin/audits/${a}`)).json.items.length;
  assert.ok(srcCount > 0);

  // 이미 같은 질문이 하나 있는 곳은 그만큼 덜 넣는다.
  const first = (await call("GET", `/api/admin/audits/${a}`)).json.items[0].question;
  await call("POST", `/api/admin/audits/${c}/items`, { question: first });
  const cp = await call("POST", `/api/admin/audits/${a}/copy-to`, { ids: [b, c, a] });
  assert.equal(cp.status, 200);
  assert.equal(cp.json.results.length, 2); // 자기 자신은 뺀다
  assert.equal(cp.json.added, srcCount * 2 - 1);
  assert.equal((await call("GET", `/api/admin/audits/${b}`)).json.items.length, srcCount);
  assert.equal((await call("POST", `/api/admin/audits/${b}/copy-to`, { ids: [] })).status, 400);

  // 맞춤 질문 — 겹치는 것·빈 것은 버리고, 모르는 유형은 비운다.
  const r = await desk.addTailoredQuestions(b, {
    count: 3,
    draft: async ({ audit, existing }) => {
      assert.equal(audit.company, "을노무");
      assert.ok(existing.length === srcCount);
      return [
        { question: existing[0], qtype: "article" },
        { question: "  ", qtype: "case" },
        { question: "5인 미만 사업장도 연차휴가를 줘야 해? 근거 조문도", qtype: "article" },
        { question: "실업급여 신청은 퇴사 후 언제까지 해야 해?", qtype: "weird" },
      ];
    },
  });
  assert.equal(r.added, 2);
  const items = (await call("GET", `/api/admin/audits/${b}`)).json.items;
  assert.equal(items.find((i) => i.question.startsWith("실업급여")).qtype, "");
  assert.equal(items.find((i) => i.question.startsWith("5인")).kind, "custom");
  assert.ok((await desk.addTailoredQuestions(b, { draft: async () => { throw new Error("down"); } })).error);

  // 시간 자동 기록 — 10분 안쪽 간격만 더한다.
  const t0 = Date.now();
  await desk.touchWork(c, t0);
  await desk.touchWork(c, t0 + 4 * 60 * 1000);
  await desk.touchWork(c, t0 + 60 * 60 * 1000); // 자리 비움 — 안 센다
  await desk.touchWork(c, t0 + 62 * 60 * 1000);
  const row = (await call("GET", "/api/admin/audits")).json.audits.find((x) => x.id === c);
  assert.equal(row.minutes, 6);
  // 데스크에서 손대면 기록된다(요청 끝난 뒤 남기므로 잠깐 기다린다).
  await call("PATCH", `/api/admin/audits/${a}`, { notes: "메모" });
  await new Promise((ok) => setTimeout(ok, 100));
  const touched = await db.one("SELECT last_active_at FROM ai_audits WHERE id = :id", { id: a });
  assert.ok(Number(touched.last_active_at) > 0);

  // 질문 방법 — API로 감사한 건은 메일·보고서가 그렇게 말한다(화면 입력이라고 쓰지 않는다).
  await call("PATCH", `/api/admin/audits/${b}`, { input_method: "api", service_name: "어떤 모델" });
  const db2 = (await call("GET", `/api/admin/audits/${b}`)).json;
  assert.equal(db2.audit.input_method, "api");
  assert.match(db2.mail.first.body, /공식 API로/);
  assert.ok(!/일반 사용자로서/.test(db2.mail.first.body));
  const { renderAuditReport } = await import("../renderAuditDossier.js");
  assert.match(renderAuditReport(db2), /공개된 공식 API로 질문을 보냈습니다/);
  await call("PATCH", `/api/admin/audits/${b}`, { input_method: "bogus" });
  assert.equal((await call("GET", `/api/admin/audits/${b}`)).json.audit.input_method, "api");

  // 오늘 할 일 — 약관 확인이 남은 건이 묶여 나온다.
  const list = (await call("GET", "/api/admin/audits")).json;
  const tos = list.queue.find((q) => q.key === "tos");
  assert.ok(tos.ids.includes(a) && tos.ids.includes(b) && tos.ids.includes(c));
  assert.deepEqual(desk.workQueue([{ id: 1, next: "재확인 2건" }, { id: 2, next: "후속 연락 1회 (오늘)" }, { id: 3, next: null }]).map((q) => q.key), ["followup", "review"]);
});
