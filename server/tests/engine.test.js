// 베리라인 엔진(veriline-1.0) — 수치 · 제재 코드 대조와 개정 추적. 사례는 실제 감사에서 찾은 오류(2026-10).
import test from "node:test";
import assert from "node:assert/strict";
import { extractQuantities, numericAudit, sanctionKinds, signalsBlock } from "../engine/quantities.js";
import { matchesOld, traceAmendment } from "../engine/amendmentTrace.js";
import { applyStatuteReview } from "../statuteReview.js";

// 고용보험법 제40조 ② 2호 취지(초단시간 근로자 기준기간) — 테스트용 축약 문언
const ART40 = "최종 이직 당시 1주 소정근로시간이 15시간 미만이고, 1주 소정근로일수가 2일 이하인 근로자로 근로하였던 경우 기준기간은 이직일 이전 24개월로 한다.";
const ART31 = "제31조(과태료) ① 다음 각 호의 어느 하나에 해당하는 자에게는 100만원 이하의 과태료를 부과한다. 1. 근로감독관의 검사를 거부·방해 또는 기피한 자";

test("수치를 단위까지 뽑는다 — 주는 7일, 년은 12개월, 만 원은 1만 원 단위, 연도 · 날짜는 뺀다", () => {
  const q = extractQuantities("2주 소정근로일수 2일, 벌금 500만 원, 5년 이내, 2026년 1월 1일 시행, 3분의 2");
  const raw = q.map((x) => [x.raw, x.dim, x.base]);
  assert.deepEqual(raw.find((r) => r[0] === "2주"), ["2주", "day", 14]);
  assert.deepEqual(raw.find((r) => r[0] === "2일"), ["2일", "day", 2]);
  assert.deepEqual(raw.find((r) => r[0] === "500만 원"), ["500만 원", "money", 5000000]);
  assert.deepEqual(raw.find((r) => r[0] === "5년"), ["5년", "month", 60]);
  assert.ok(!raw.some((r) => r[0] === "2026년"), "연도는 기간이 아니다");
  assert.ok(!raw.some((r) => r[0] === "1일"), "10월 1일 같은 날짜는 뺀다");
  assert.ok(raw.some((r) => r[1] === "ratio" && Math.abs(r[2] - 2 / 3) < 1e-9));
  assert.deepEqual(extractQuantities("상시 5명 이상").map((x) => [x.dim, x.base]), [["people", 5]]);
});

test("제재 종류를 가른다 — 벌금은 형벌, 과태료는 행정질서벌", () => {
  assert.deepEqual(sanctionKinds("1년 이하의 징역 또는 1천만원 이하의 벌금"), ["징역", "벌금"]);
  assert.deepEqual(sanctionKinds(ART31), ["과태료"]);
});

test("실제 감사 오류 F-01: '2주 소정근로일수'를 코드가 조문의 '1주'와 다르다고 짚는다", () => {
  const articles = [{ id: "A1", law: "고용보험법", no: 40, text: ART40 }];
  const s = numericAudit("초단시간 근로자는 2주 소정근로일수가 2일 이하이면 기준기간이 24개월로 늘어납니다.", articles);
  assert.equal(s.length, 1);
  assert.equal(s[0].kind, "number");
  assert.equal(s[0].claim, "2주");
  assert.ok(s[0].articleValues.includes("1주"));
  assert.match(signalsBlock(s), /N1.*2주/);
});

test("맞는 문장은 후보로 올리지 않는다(오탐 방지)", () => {
  const articles = [{ id: "A1", law: "고용보험법", no: 40, text: ART40 }];
  assert.equal(numericAudit("초단시간 근로자는 1주 소정근로일수가 2일 이하이면 기준기간이 24개월입니다.", articles).length, 0);
});

test("실제 감사 오류 F-04: 검사 거부에 '벌금'이라 하면 조문의 '과태료'와 제재 종류가 다르다", () => {
  const articles = [{ id: "A1", law: "최저임금법", no: 31, text: ART31 }];
  const s = numericAudit("근로감독관의 검사를 거부하면 벌금 500만 원이 부과됩니다.", articles);
  assert.ok(s.some((x) => x.kind === "sanction" && /과태료/.test(x.note)));
  assert.ok(s.some((x) => x.kind === "number" && x.claim === "500만 원"));
});

test("옛 조문에만 있는 값이면 개정 전 내용으로 본다", () => {
  assert.deepEqual(matchesOld("자영업자 합산은 5년 이내", "피보험기간을 5년 이내에서 합산한다", "피보험기간을 3년 이내에서 합산한다"), { by: "number", value: "5년" });
  assert.equal(matchesOld("3년 이내", "5년 이내", "3년 이내"), null);
  assert.deepEqual(matchesOld("벌금을 낸다", "벌금에 처한다", "과태료를 부과한다"), { by: "sanction", value: "벌금" });
});

test("개정 추적: 현행 다음 버전부터 거슬러 올라가 값이 바뀐 시행일을 찾는다", async () => {
  const versions = [
    { mst: "300", status: "시행예정", effective: "20280101" },
    { mst: "200", status: "현행", effective: "20250223" },
    { mst: "150", status: "연혁", effective: "20240101" },
    { mst: "100", status: "연혁", effective: "20220101" },
  ];
  const texts = { 150: "피보험기간을 3년 이내에서 합산한다", 100: "피보험기간을 5년 이내에서 합산한다" };
  const t = await traceAmendment(
    { law: "고용보험법", no: 50, claimText: "자영업자 피보험기간 합산은 5년 이내", currentText: "피보험기간을 3년 이내에서 합산한다" },
    { versionsFn: async () => versions, articleFn: async (mst) => ({ found: true, text: texts[mst] }) },
  );
  assert.equal(t.outdated, true);
  assert.equal(t.oldEffective, "20220101");
  assert.equal(t.changedOn, "20240101");
  assert.match(t.note, /2022\.1\.1 시행본/);
});

test("법령 대조에 합칠 때 확정된 오류에 코드 대조 결과와 개정 추적이 붙는다", async () => {
  const text = "자영업자 피보험기간 합산은 5년 이내입니다.";
  const review = {
    ran: true,
    articles: [{ id: "A1", law: "고용보험법", no: 50, branch: null, text: "피보험기간을 3년 이내에서 합산한다" }],
    issues: [{ answer_quote: text, problem: "현행은 3년", kind: "contradiction", article: "A1", law: "고용보험법", articleLabel: "제50조", url: "u", article_quote: "피보험기간을 3년 이내에서 합산한다" }],
    signals: [{ kind: "number", sentence: text, claim: "5년", article: "A1", articleValues: ["3년"], note: "x" }],
  };
  const defendFn = async (_t, _a, cands) => cands.map((c) => ({ ...c, decision: "error", reason: "현행 규정은 3년 이내입니다." }));
  const traceFn = async () => ({ outdated: true, value: "5년", oldEffective: "20220101", changedOn: "20240101", note: "개정 전 내용입니다." });
  const out = await applyStatuteReview(text, [], review, { defendFn, traceFn });
  const f = out.find((c) => c.verdict === "false");
  assert.ok(f);
  assert.equal(f.error_kind, "outdated");
  assert.equal(f.amendment.changedOn, "20240101");
  assert.deepEqual(f.code_check, { kind: "number", claim: "5년", article_values: ["3년"] });
  assert.match(f.explanation, /개정 전 내용/);
});

// 2026-10-25 실 API로 확인한 사례: 남녀고용평등법 제19조의4 ① 육아휴직 분할 — 2024.10.22 시행본 "2회", 2025.2.23 시행 개정 후 "3회".
// 조문 다른 자리에 같은 값("1회의 기간")이 있어도, 같은 꼬리("에 한정하여")로 맞춰 잡아야 한다.
const OLD19 = "① 근로자는 육아휴직을 2회에 한정하여 나누어 사용할 수 있다. ③ 근로자는 육아기 근로시간 단축을 나누어 사용할 수 있다. 이 경우 나누어 사용하는 1회의 기간은 1개월 이상이 되어야 한다.";
const NEW19 = "① 근로자는 육아휴직을 3회에 한정하여 나누어 사용할 수 있다. ③ 근로자는 육아기 근로시간 단축을 나누어 사용할 수 있다. 이 경우 나누어 사용하는 1회의 기간은 1개월 이상이 되어야 한다. 2회 이상";
test("같은 꼬리에 다른 값 — '2회에 한정하여' vs 현행 '3회에 한정하여'를 잡고, 개정 전 내용으로 추적한다", async () => {
  const s = numericAudit("육아휴직은 2회에 한정하여 나누어 사용할 수 있습니다.", [{ id: "A1", law: "남녀고용평등법", no: 19, text: NEW19 }]);
  assert.equal(s[0]?.claim, "2회");
  assert.deepEqual(s[0]?.articleValues, ["3회"]);
  assert.deepEqual(matchesOld("육아휴직은 2회에 한정하여 나누어 사용할 수 있습니다.", OLD19, NEW19), { by: "number", value: "2회" });
});

test("법령 대조 켜기: 낱말 목록에 없어도 법 이름 · 조문 번호 모양이면 켜고, 일상 글은 켜지 않는다(2026-10-26)", async () => {
  const { LAW_HINT } = await import("../statuteReview.js");
  for (const s of ["남녀고용평등법상 명단 공표 대상이 2회 연속 미달이죠?", "세무조사 사전통지는 15일 전입니다(제81조의7).", "근로자퇴직급여 보장법 상 푸른씨앗", "할부거래법에 따라 처벌", "법인세 중간예납세액이 50만원"]) assert.ok(LAW_HINT.test(s), s);
  for (const s of ["김치찌개 끓이는 방법 알려줘", "파이썬 문법이 헷갈려요", "다이어트 비법 공유", "이 요리법은 3인분이에요"]) assert.ok(!LAW_HINT.test(s), s);
});

test("수치 대조: 처벌 문장은 의무 조문이 아니라 벌칙 조문과 비교한다(2026-10-26 할부거래법 사례)", async () => {
  const { numericAudit } = await import("../engine/quantities.js");
  const articles = [
    { id: "A1", law: "할부거래에 관한 법률", no: 27, title: "소비자피해보상보험계약등", text: "선불식 할부거래업자는 소비자피해보상보험계약등을 체결하여야 한다. 계약 기간은 1년 이상으로 한다." },
    { id: "A2", law: "할부거래에 관한 법률", no: 50, title: "벌칙", text: "다음 각 호의 어느 하나에 해당하는 자는 1년 이하의 징역 또는 3천만원 이하의 벌금에 처한다. 소비자피해보상보험계약등을 체결하면서 선수금 자료를 거짓으로 제출한 자" },
  ];
  const s = numericAudit("제27조의 소비자피해보상보험계약등을 체결하면서 선수금 자료를 거짓으로 제출하면 3년 이하의 징역 또는 3천만원 이하의 벌금에 처해집니다.", articles);
  assert.ok(s.some((x) => x.article === "A2" && x.claim === "3년"), JSON.stringify(s));
});

test("법령 검증관: 도구로 받은 조문으로 인용을 잠그고, 지어낸 근거는 버리며, 고친 답의 새 수치를 표시한다(엔진 1.1)", async () => {
  const { legalAgentCheck, makeLawTools } = await import("../engine/legalAgent.js");
  const tools = makeLawTools({
    search: async () => ({ ok: true, found: true, mst: "1", lawNameOfficial: "할부거래에 관한 법률", effectiveDate: "20260101", versionStatus: "current" }),
    article: async () => ({ found: true, title: "벌칙", text: "다음 각 호의 어느 하나에 해당하는 자는 1년 이하의 징역 또는 3천만원 이하의 벌금에 처한다.", effectiveDate: "20260101" }),
  });
  const answer = "거짓 자료를 내면 3년 이하의 징역 또는 3천만원 이하의 벌금입니다.";
  const replies = [
    { stop_reason: "tool_use", content: [{ type: "tool_use", id: "t1", name: "get_article", input: { law: "할부거래에 관한 법률", article: 50 } }] },
    { stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify({ verdict: "error", issues: [
      { answer_quote: "3년 이하의 징역", problem: "1년 이하", law: "할부거래에 관한 법률", article: "제50조", article_quote: "1년 이하의 징역 또는 3천만원 이하의 벌금에 처한다" },
      { answer_quote: "3천만원 이하의 벌금", problem: "지어낸 근거", law: "x", article: "제1조", article_quote: "이 문장은 어떤 조문에도 없다" },
    ], answer: "아닙니다. 1년 이하의 징역 또는 3천만원 이하의 벌금이며, 과태료 500만원은 없습니다(할부거래법 제50조)." }) }] },
  ];
  let i = 0;
  const r = await legalAgentCheck({ question: "과태료죠?", answer, gathered: { articles: [] }, model: "m", deps: { tools, call: async () => replies[i++] } });
  assert.equal(r.ran, true);
  assert.equal(r.issues.length, 1); // 근거 문장이 원문에 없는 지목은 버린다
  assert.equal(r.issues[0].proof.label, "제50조");
  assert.match(r.answer, /1년 이하의 징역/);
  assert.deepEqual(r.unsupported, ["500만원"]); // 조문 · 원래 답 · 질문 어디에도 없는 새 수치
  assert.equal(r.toolCalls, 1);
});

test("수치 대조: 징역 · 벌금 문장은 과태료 조문이 아니라 징역 · 벌금을 정한 벌칙 조문과 비교한다", async () => {
  const { numericAudit } = await import("../engine/quantities.js");
  const articles = [
    { id: "A1", law: "할부거래에 관한 법률", no: 53, title: "과태료", text: "선불식 할부거래업자가 자료를 거짓으로 제출한 경우 1천만원 이하의 과태료를 부과한다." },
    { id: "A2", law: "할부거래에 관한 법률", no: 50, title: "벌칙", text: "소비자피해보상보험계약등을 체결하면서 선수금 자료를 거짓으로 제출한 자는 1년 이하의 징역 또는 3천만원 이하의 벌금에 처한다." },
  ];
  const s = numericAudit("선수금 자료를 거짓으로 제출하면 3년 이하의 징역 또는 3천만원 이하의 벌금에 처해집니다.", articles);
  assert.ok(s.some((x) => x.article === "A2" && x.claim === "3년"), JSON.stringify(s));
  assert.ok(!s.some((x) => x.kind === "sanction"), JSON.stringify(s)); // "형벌이라 했는데 과태료" 같은 엉뚱한 단서를 내지 않는다
});

test("조문 인용 잠금: 머리말과 해당 호를 이어 붙인 인용은 받고, 조문에 없는 조각이 하나라도 있으면 버린다(2026-10-26)", async () => {
  const { quoteInArticle } = await import("../engine/legalAgent.js");
  const art = "① 다음 각 호의 어느 하나에 해당하는 자는 7년 이하의 징역 또는 7천만원 이하의 벌금에 처한다. 1. 폭행ㆍ협박 또는 감금의 방법으로 직업소개를 한 자 2. 「성매매알선 등 행위의 처벌에 관한 법률」 제2조제1항제1호에 따른 성매매 행위나 그 밖의 음란한 행위가 이루어지는 업무에 취업하게 할 목적으로 직업소개를 한 자";
  assert.ok(quoteInArticle(art, "제46조(벌칙) ① 다음 각 호의 어느 하나에 해당하는 자는 7년 이하의 징역 또는 7천만원 이하의 벌금에 처한다. 2. 「성매매알선 등 행위의 처벌에 관한 법률」 제2조제1항제1호에 따른 성매매 행위나"));
  assert.ok(quoteInArticle(art, "다음 각 호의 어느 하나에 해당하는 자는 7년 이하의 징역 또는 7천만원 이하의 벌금에 처한다. ... 1. 폭행ㆍ협박 또는 감금의 방법으로 직업소개를 한 자"));
  assert.ok(!quoteInArticle(art, "다음 각 호의 어느 하나에 해당하는 자는 10년 이하의 징역 또는 1억원 이하의 벌금에 처한다. ... 1. 폭행ㆍ협박 또는 감금의 방법으로 직업소개를 한 자"));
  assert.ok(!quoteInArticle(art, "이 문장은 어디에도 없는 지어낸 근거 문장이다"));
});

test("엔진 2.0: 벌칙 지도로 형량을 코드가 확정하고(판정관 호출 없이), 확정 값으로만 고쳐 쓴다", async () => {
  const { loadStatute, _clearStatuteCache } = await import("../engine/v2/statuteStore.js");
  const { verifyLegalV2 } = await import("../engine/v2/verify.js");
  _clearStatuteCache();
  const law = { law: "할부거래에 관한 법률", mst: "1", effective: "20260101", url: "u", articles: [
    { no: 27, branch: 0, title: "소비자피해보상보험계약등", text: "제27조(소비자피해보상보험계약등) ① 선불식 할부거래업자는 소비자피해보상보험계약등을 체결하여야 한다." },
    { no: 50, branch: 0, title: "벌칙", text: "제50조(벌칙) 다음 각 호의 어느 하나에 해당하는 자는 1년 이하의 징역 또는 3천만원 이하의 벌금에 처한다.\n1. 제27조제1항을 위반하여 선수금 자료를 거짓으로 제출한 자" },
    { no: 53, branch: 0, title: "과태료", text: "제53조(과태료) ① 다음 각 호의 어느 하나에 해당하는 자에게는 1천만원 이하의 과태료를 부과한다.\n1. 제22조를 위반하여 통지하지 아니한 자" },
  ] };
  const store = await loadStatute("할부거래법", { disk: false, fetcher: async (n) => (/시행령/.test(n) ? null : law) });
  assert.equal(store.byDuty.get("27-0")[0].sanction, "1년 이하의 징역 또는 3천만원 이하의 벌금");
  const answer = "아니요. 선수금 자료를 거짓으로 내면 3년 이하의 징역 또는 3천만원 이하의 벌금에 처해집니다.";
  const seen = [];
  const call = async ({ label }) => {
    seen.push(label);
    if (label === "v2_extract") return JSON.stringify({ laws: ["할부거래법"], claims: [{ id: "C1", quote: "3년 이하의 징역 또는 3천만원 이하의 벌금에 처해집니다", topic: "선불식 할부거래업자 제27조 소비자피해보상보험계약 선수금 자료 거짓 제출 처벌", attribute: "형량", value: "3년 이하의 징역 또는 3천만원 이하의 벌금", law: "할부거래법", article: "제27조" }], premises: [], asked: [] });
    if (label === "v2_write") return "<answer>아니요. 1년 이하의 징역 또는 3천만원 이하의 벌금입니다(할부거래법 제50조).</answer>";
    throw new Error(`unexpected ${label}`);
  };
  const r = await verifyLegalV2({ question: "과태료죠?", answer, deps: { call, loadStatute: async () => store } });
  assert.deepEqual(seen, ["v2_extract", "v2_write"]); // 코드가 확정 → 판정관을 부르지 않는다
  assert.equal(r.errors.length, 1);
  assert.equal(r.errors[0].proof.label, "제50조");
  assert.match(r.answer, /1년 이하의 징역/);
  assert.deepEqual(r.unsupported, []);
});

test("판정 영수증: 코드 판정은 출처 · 원문 지문 · 값 비교를 남기고, 영수증만으로 AI 없이 다시 확인된다", async () => {
  const { loadStatute, _clearStatuteCache } = await import("../engine/v2/statuteStore.js");
  const { makeReceipt, replayReceipt, provenanceStats, sha256 } = await import("../engine/v2/receipt.js");
  const { candidatesFor, decide } = await import("../engine/v2/verify.js");
  _clearStatuteCache();
  const law = { law: "할부거래에 관한 법률", mst: "7", effective: "20260101", url: "u", articles: [
    { no: 27, branch: 0, title: "소비자피해보상보험계약등", text: "제27조(소비자피해보상보험계약등) ① 선불식 할부거래업자는 보험계약을 체결하여야 한다." },
    { no: 50, branch: 0, title: "벌칙", text: "제50조(벌칙) 다음 각 호의 어느 하나에 해당하는 자는 1년 이하의 징역 또는 3천만원 이하의 벌금에 처한다.\n1. 제27조제1항을 위반하여 자료를 거짓으로 제출한 자" },
  ] };
  const fetcher = async (n) => (/시행령/.test(n) ? null : law);
  const store = await loadStatute("할부거래법", { disk: false, fetcher });
  const c = { id: "C1", kind: "claim", quote: "3년 이하의 징역에 처해집니다", topic: "제27조 자료 거짓 제출 처벌", attribute: "형량", value: "3년 이하의 징역", law: "할부거래법", article: "제27조" };
  const d = decide(c, candidatesFor(store, c));
  const r = makeReceipt({ c, store, d });
  assert.equal(r.verdict, "wrong");
  assert.equal(r.decided_by, "code");
  assert.equal(r.source.article, "제50조");
  assert.equal(r.source.text_sha256, sha256(law.articles[1].text));
  const replay = await replayReceipt(r, { load: async () => store });
  assert.equal(replay.models_called, 0);
  assert.ok(replay.ok, JSON.stringify(replay.steps));
  // 조문이 바뀌면 지문이 어긋나 다시 보라고 알린다
  const changed = { ...store, articles: [store.articles[0], { ...store.articles[1], text: store.articles[1].text.replace("1년", "2년") }] };
  const replay2 = await replayReceipt(r, { load: async () => changed });
  assert.equal(replay2.ok, false);
  assert.equal(provenanceStats([r]).code_share, 100);
});

test("엔진 3.0 효력 상실: 부칙의 '○년 ○월 ○일까지 유효' 표시가 지난 항은 효력 없음으로 읽고, 아직 안 지났으면 건드리지 않는다", async () => {
  const { expiryOf } = await import("../engine/v3/evidence.js");
  const a = { no: 53, text: "③ 상시 30명 미만의 근로자를 사용하는 사용자는 … 8시간을 초과하지 아니하는 범위에서 근로시간을 연장할 수 있다.\n⑥ 제3항은 15세 이상 18세 미만의 근로자에 대하여는 적용하지 아니한다.\n[효력 상실] [법률 제15513호(2018.3.20) 제53조제3항, 제53조제6항의 개정규정은 같은 법 부칙 제2조의 규정에 의하여 2022년 12월 31일까지 유효함]" };
  const e = expiryOf(a, new Date(2026, 9, 26));
  assert.deepEqual(e.paragraphs, [3, 6]);
  assert.equal(e.until, "2022.12.31");
  assert.equal(expiryOf(a, new Date(2022, 5, 1)), null); // 그때는 아직 유효
  assert.equal(expiryOf({ no: 1, text: "제1조(목적) 이 법은 …" }), null);
});

test("엔진 3.0 근거 묶음: 제재 주장은 벌칙 줄을, 효력 상실 항은 표시와 사실을 함께 묶는다", async () => {
  const { buildEvidence } = await import("../engine/v3/evidence.js");
  const store = { law: "근로기준법", lastNo: 116, articles: [
    { no: 53, branch: 0, title: "연장 근로의 제한", text: "③ 상시 30명 미만 … 8시간을 초과하지 아니하는 범위에서 근로시간을 연장할 수 있다.\n⑥ 제3항은 15세 이상 18세 미만의 근로자에 대하여는 적용하지 아니한다.\n[효력 상실] [법률 제15513호 제53조제3항, 제53조제6항의 개정규정은 … 2022년 12월 31일까지 유효함]" },
  ], penalties: [], byDuty: new Map(), delegations: new Map(), decree: null };
  const c = { id: "C1", kind: "claim", quote: "18세는 추가 8시간 연장 가능", topic: "30명 미만 사업장 추가 8시간 연장 18세", attribute: "요건", value: "가능" };
  const table = [{ c, store, cand: { provisions: [{ law: "근로기준법", no: 53, branch: 0, title: "연장 근로의 제한", text: store.articles[0].text, url: "u", kind: "article" }] }, d: { verdict: "unknown" } }];
  const ev = buildEvidence({ question: "18세 직원에게 추가로 8시간 연장근로를 시킬 수 있나요?", table, stores: [store] });
  assert.match(ev.block, /효력 상실: 제3항 · 제6항\(2022\.12\.31까지 유효, 지금은 효력 없음\)/);
  assert.ok(ev.facts.some((f) => /18세 미만'이므로 정확히 18세는 포함되지 않는다/.test(f)), JSON.stringify(ev.facts));
  assert.ok(ev.facts.some((f) => /효력 상실/.test(f)));
  assert.equal(ev.coverage, 1);
});

test("엔진 3.0 근거 묶음: 같은 의무의 제재가 조건에 따라 갈리면 조문마다 하나씩 넣고 조건을 사실로 적는다(감염병예방법 제11조)", async () => {
  const { buildEvidence } = await import("../engine/v3/evidence.js");
  const head79 = "제79조의4(벌칙) 다음 각 호의 어느 하나에 해당하는 자는 500만원 이하의 벌금에 처한다.";
  const head80 = "제80조(벌칙) 다음 각 호의 어느 하나에 해당하는 자는 300만원 이하의 벌금에 처한다.";
  const pen = (no, branch, head, line) => ({ no, branch, title: "벌칙", sanction: head.match(/\d+만원 이하의 벌금/)[0], text: `${head}\n${line}`, refs: [{ no: 11, branch: 0 }], kinds: ["벌금"] });
  const fromDuty = [
    pen(79, 4, head79, "1. 제1급감염병 및 제2급감염병에 대하여 제11조에 따른 보고 또는 신고 의무를 위반한 의사"),
    pen(79, 4, head79, "2. 제1급감염병 및 제2급감염병에 대하여 제11조에 따른 보고 또는 신고를 방해한 자"),
    pen(80, 0, head80, "1. 제3급감염병 및 제4급감염병에 대하여 제11조에 따른 보고 또는 신고 의무를 위반한 의사"),
  ];
  const store = { law: "감염병의 예방 및 관리에 관한 법률", lastNo: 83, articles: [{ no: 11, branch: 0, title: "의사 등의 신고", text: "① 의사는 … 보고하여야 한다." }, { no: 79, branch: 4, title: "벌칙", text: head79 }, { no: 80, branch: 0, title: "벌칙", text: head80 }], penalties: fromDuty, byDuty: new Map(), delegations: new Map(), decree: null };
  const c = { id: "C1", kind: "claim", quote: "500만원 이하의 벌금", topic: "제3급감염병 신고 의무 위반 처벌", attribute: "형량", value: "500만원 이하의 벌금" };
  const table = [{ c, store, cand: { duty: store.articles[0], fromDuty, penalties: fromDuty, provisions: [] }, d: { verdict: "unknown" } }];
  const ev = buildEvidence({ question: "제3급감염병 환자를 진단하고 신고하지 않은 의사는 어떤 처벌을 받나요?", table, stores: [store] });
  assert.match(ev.block, /제80조/);
  assert.match(ev.block, /제79조의4/);
  // 조건별 제재 후보는 확정 사실(facts)이 아니라 참고 후보(hints)로 — 추정이 사실로 읽혀 맞는 답을 덮어쓴 일이 있었다
  assert.ok(ev.hints.some((f) => /조건\(행위\)에 따라 다르다/.test(f) && /300만원/.test(f) && /500만원/.test(f) && /가장 많이 겹치는 후보는 제80조/.test(f)), JSON.stringify(ev.hints));
  assert.ok(!ev.facts.some((f) => /후보/.test(f)));
});

test("경계 사실: 경계가 걸린 문장은 결과까지 보여 준다(지방세법 제93조제6항 '2년 미만 … 제1호에 따른 세율')", async () => {
  const { boundaryFacts } = await import("../engine/v2/korean.js");
  const line = "⑥ 부동산매매업자의 토지등 매매차익에 대한 산출세액은 그 매매차익에 제103조의3에서 규정하는 세율을 곱하여 계산한 금액으로 한다. 다만, 토지등의 보유기간이 2년 미만인 경우에는 제103조의3제1항제2호 및 제3호에도 불구하고 같은 항 제1호에 따른 세율을 곱하여 계산한 금액으로 한다.";
  const f = boundaryFacts("부동산매매업자가 토지를 딱 2년 보유하다 팔면 기본세율이 적용되나요?", [{ law: "지방세법", articles: [{ no: 93, branch: 0, title: "세율", text: line }] }]);
  assert.equal(f.length, 1);
  assert.match(f[0].text, /같은 항 제1호에 따른 세율을 곱하여 계산한 금액으로 한다/);
  assert.match(f[0].text, /정확히 2년은 포함되지 않는다\(이 문장이 정한 결과는 적용되지 않는다\)/);
});

test("엔진 3.0 근거 없는 새 숫자: 고친 답에 원래 글 · 근거 어디에도 없는 금액이 나오면 잡고, 조문 번호와 근거에 있는 값은 통과", async () => {
  const { unsupportedNumbers } = await import("../engine/v3/engine.js");
  assert.deepEqual(unsupportedNumbers("3년 이하의 징역 또는 3천만원 이하의 벌금(제29조제1항제1호)", "과태료 몇 백만원이죠?", ["제29조 3년 이하의 징역 또는 3천만원 이하의 벌금"]), []);
  assert.deepEqual(unsupportedNumbers("과태료 1억원 이하(관세법 제277조제4항)", "1천만원 이하 과태료", ["1억원 이하의 과태료"]), []);
  assert.equal(unsupportedNumbers("과태료 700만원입니다", "과태료 몇 백만원?", ["500만원 이하의 과태료"]).length, 1);
});

test("책임 범위: 영수증이 있는 판정만 covered, 확정 못 한 주장은 uncovered로 나눈다", async () => {
  const { guaranteeScope } = await import("../engine/v2/receipt.js");
  const receipts = [{ id: "R1", claim: { quote: "검사 거부는 벌금 500만 원" }, verdict: "wrong", decided_by: "code", source: { law: "최저임금법", article: "제31조" } }];
  const all = guaranteeScope({ receipts, codeTable: [{ kind: "claim", quote: "검사 거부는 벌금 500만 원", verdict: "wrong" }] });
  assert.equal(all.status, "covered");
  const part = guaranteeScope({ receipts, codeTable: [{ kind: "claim", quote: "검사 거부는 벌금 500만 원", verdict: "wrong" }, { kind: "claim", quote: "시정명령도 받는다", verdict: "unknown" }] });
  assert.equal(part.status, "partial");
  assert.deepEqual(part.uncovered, ["시정명령도 받는다"]);
  assert.equal(guaranteeScope({ receipts: [], codeTable: [] }).status, "not_covered");
});

// ── 2026-10-27 로무앤톡 재점검에서 배운 것: 형제 조문 · 누락 · 다른 조문의 예외 · 고친 답 다시 보기 ──
const WAGE_LAW = () => ({ law: "근로기준법", lastNo: 116, url: "u", penalties: [], byDuty: new Map(), delegations: new Map(), decree: null, articles: [
  { no: 43, branch: 2, title: "체불사업주 명단 공개", text: "제43조의2(체불사업주 명단 공개)\n① 고용노동부장관은 명단 공개 기준일 이전 3년 이내 임금등을 체불하여 2회 이상 유죄가 확정된 자로서 명단 공개 기준일 이전 1년 이내 임금등의 체불총액이 3천만원 이상인 체불사업주의 인적사항 등을 공개할 수 있다." },
  { no: 43, branch: 3, title: "임금등 체불자료의 제공", text: "제43조의3(임금등 체불자료의 제공)\n① 고용노동부장관은 종합신용정보집중기관이 다음 각 호의 어느 하나에 해당하는 체불사업주의 인적사항과 체불액 등에 관한 자료를 요구할 때에는 그 자료를 제공할 수 있다.\n1. 임금등 체불자료 제공일 이전 3년 이내 임금등을 체불하여 2회 이상 유죄가 확정된 자로서 임금등 체불자료 제공일 이전 1년 이내 임금등의 체불총액이 2천만원 이상인 체불사업주" },
  { no: 43, branch: 8, title: "체불 임금등에 대한 손해배상청구", text: "제43조의8(체불 임금등에 대한 손해배상청구)\n① 근로자는 사업주가 다음 각 호의 어느 하나에 해당하는 경우 법원에 임금등의 3배 이내의 금액을 지급할 것을 청구할 수 있다.\n2. 1년 동안 임금등의 전부 또는 일부를 지급하지 아니한 개월 수가 총 3개월 이상인 경우" },
  { no: 107, branch: 0, title: "벌칙", text: "제107조(벌칙)\n② 제36조, 제43조 또는 제56조를 위반한 자에 대하여는 피해자의 명시적인 의사와 다르게 공소를 제기할 수 없다. 다만, 제43조의2에 따라 명단 공개된 체불사업주가 명단 공개 기간 중에 제36조, 제43조 또는 제56조를 위반한 경우에는 그러하지 아니하다." },
] });

test("형제 조문: 신용제재 기준(제43조의3)을 물으며 명단 공개 기준 값(3천만 원)을 대면, 질문이 묻는 조문의 2천만 원으로 틀림을 잡는다", async () => {
  const { candidatesFor, decide } = await import("../engine/v2/verify.js");
  const store = WAGE_LAW();
  const p = { id: "P1", kind: "premise", quote: "최근 1년간 체불총액이 3천만원 이상인 경우 맞죠?", topic: "임금체불 사업주 자료를 신용정보집중기관에 제공하는 기준 체불총액", attribute: "금액", value: "3천만원 이상", law: "근로기준법", article: "" };
  const d = decide(p, candidatesFor(store, p));
  assert.equal(d.verdict, "wrong", JSON.stringify(d));
  assert.match(d.correct, /2천만원 이상/);
  // 조문을 직접 댄 주장은 확신 높음(닫힌 고리가 이 값을 강제한다)
  const c = { ...p, kind: "claim", quote: "체불총액이 3천만원 이상인 사업주", article: "제43조의3" };
  assert.equal(decide(c, candidatesFor(store, c)).confidence, "high");
});

test("질문 항목 근거: 답변이 다른 이야기로 돌린 '3배 손해배상'도 질문 항목으로 조문(제43조의8)을 찾아 근거에 넣고, 다른 조문의 예외(제43조의2)를 한 단계 따라간다", async () => {
  const { articleForAsked, referencedArticles, buildEvidence } = await import("../engine/v3/evidence.js");
  const store = WAGE_LAW();
  const hit = articleForAsked({ topic: "체불 임금 3배 손해배상 청구 요건", attribute: "요건" }, "근로기준법상 체불 임금 손해배상 청구에서 2개월이면 3배까지 청구할 수 있나요?", [store]);
  assert.equal(`${hit.a.no}-${hit.a.branch}`, "43-8");
  const a107 = store.articles.find((a) => a.no === 107);
  assert.deepEqual(referencedArticles(a107.text, store, a107).map((a) => `${a.no}-${a.branch}`), ["43-2"]); // 위반 조문 목록(제36조 · 제43조 · 제56조)은 끌어오지 않는다
  const table = [{ c: { id: "C1", kind: "claim", quote: "처벌불원이면 기소할 수 없습니다", topic: "임금체불 반의사불벌", attribute: "예외" }, store, cand: { provisions: [{ law: "근로기준법", no: 107, branch: 0, title: "벌칙", text: a107.text, url: "u", kind: "article" }] }, d: { verdict: "unknown" } }];
  const ev = buildEvidence({ question: "근로기준법상 임금체불은 처벌불원이면 기소 못 하죠? 3배 손해배상은 2개월이면 되나요?", table, stores: [store], asked: [{ topic: "체불 임금 3배 손해배상 청구 요건", attribute: "요건", covered: false }] });
  assert.match(ev.block, /제43조의8/);
  assert.match(ev.block, /제43조의2/);
  assert.equal(ev.askedHits[0].label, "제43조의8");
  assert.equal(ev.askedHits[0].covered, false);
});

test("닫힌 고리: 고친 답에 코드가 확정한 값(2천만 원)이 빠지면 한 번 다시 쓰게 하고, 그래도 빠지면 미해결로 드러낸다", async () => {
  const { verifyLegalV3, fixReflected } = await import("../engine/v3/engine.js");
  const store = WAGE_LAW();
  assert.equal(fixReflected("체불총액 2천만원 이상", { d: { correct: "… 체불총액이 2천만원 이상인 체불사업주" } }), true);
  assert.equal(fixReflected("체불총액 3천만원 이상", { d: { correct: "… 체불총액이 2천만원 이상인 체불사업주" } }), false);
  const run = async (rewrite) => {
    const labels = [];
    const callModel = async ({ label }) => {
      labels.push(label);
      if (label === "v3_extract") return JSON.stringify({ laws: ["근로기준법"], claims: [{ id: "C1", quote: "체불총액이 3천만원 이상인 사업주", topic: "임금체불 자료 신용정보집중기관 제공 기준 체불총액", attribute: "금액", value: "3천만원 이상", law: "근로기준법", article: "제43조의3" }], premises: [], asked: [{ topic: "신용정보집중기관 체불자료 제공 기준", attribute: "금액", covered: true }] });
      if (label === "v3_judge") return JSON.stringify({ verdict: "ok", issues: [], answer: "" });
      if (label === "v3_write") return JSON.stringify({ verdict: "error", issues: [], answer: "3년 이내 2회 이상 유죄, 체불총액 3천만원 이상입니다(근로기준법 제43조의3)." });
      if (label === "v3_rewrite") return JSON.stringify({ verdict: "error", issues: [], answer: rewrite });
      return "{}";
    };
    const r = await verifyLegalV3({ question: "신용정보집중기관 제공 기준이 3천만원 맞죠?", answer: "네, 체불총액이 3천만원 이상인 사업주가 대상입니다(근로기준법 제43조의3).", deps: { callModel, loadStatute: async () => store, noDeep: true, models: { extract: "x", judge: "j", write: "w", deep: "d" } } });
    return { r, labels };
  };
  const ok = await run("아닙니다. 체불총액 2천만원 이상입니다(근로기준법 제43조의3 제1항 제1호).");
  assert.ok(ok.labels.includes("v3_rewrite"));
  assert.match(ok.r.answer, /2천만원/);
  assert.deepEqual(ok.r.unresolved, []);
  const bad = await run("체불총액 3천만원 이상입니다.");
  assert.equal(bad.r.unresolved.length, 1);
  assert.ok(bad.r.route.some((x) => /^unresolved:1/.test(x)));
});
