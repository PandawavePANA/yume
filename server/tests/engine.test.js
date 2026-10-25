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
