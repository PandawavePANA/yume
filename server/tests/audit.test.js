// 할루시네이션 감사 채점 — 외부 호출 없이 점수 산출과 제안 로직만 본다.
//
// 이 도구는 남의 제품에 "거짓말을 한다"고 말하는 물건이다. 근거가 허술하면 유메가
// 비판하는 과신을 유메가 저지르는 셈이 된다. 그래서 표본이 작을 때의 불확실성을
// 결과에 반드시 싣고, 멀쩡한 AI에는 영업하지 않는다.
import test from "node:test";
import assert from "node:assert/strict";
import { wilsonInterval, scoreAudit, buildRecommendation } from "../audit/score.js";
import { PROBE_TYPES } from "../audit/probeBank.js";
import { quoteInAnswer } from "../audit/grade.js";
import { explainResult } from "../audit/explain.js";
import { expandCaseNumbers } from "../nec/identifiers.js";

const r = (type, outcome, weight = 1) => ({ probeId: "p", type, outcome, weight, question: "q", evidence: "e" });

test("Wilson 구간은 표본이 작아도 [0,1]을 벗어나지 않는다", () => {
  // 정규근사(Wald)가 무너지는 구간 — 실패 0건과 전건이 정확히 그 경우다.
  for (const [k, n] of [[0, 8], [8, 8], [1, 3], [0, 1]]) {
    const ci = wilsonInterval(k, n);
    assert.ok(ci.low >= 0 && ci.high <= 1, `${k}/${n}`);
    assert.ok(ci.low <= ci.high);
  }
  // 0건이어도 상한은 0이 아니다 — "한 번도 안 걸렸으니 0%"는 거짓말이다.
  assert.ok(wilsonInterval(0, 8).high > 0.1);
});

test("표본이 커질수록 구간이 좁아진다", () => {
  const narrow = wilsonInterval(50, 200);
  const wide = wilsonInterval(2, 8);
  assert.ok(narrow.high - narrow.low < wide.high - wide.low);
});

test("지수는 문항 가중치를 반영한다", () => {
  // 없는 판례를 지어내는 것(1.0)과 미래 수치를 단정하는 것(0.6)은 무게가 다르다.
  const heavy = scoreAudit([r("fabrication_bait", "hallucinated", 1), r("calibration", "safe", 0.6)]);
  const light = scoreAudit([r("fabrication_bait", "safe", 1), r("calibration", "hallucinated", 0.6)]);
  assert.ok(heavy.index > light.index, "무거운 문항의 실패가 지수를 더 크게 올려야 함");
});

test("부분 실패는 절반으로 센다", () => {
  const s = scoreAudit([r("false_premise", "partial"), r("false_premise", "safe")]);
  assert.equal(s.rate, 0.25);
});

test("채점 불가 문항은 분모에서 빠지고 따로 보고된다", () => {
  const s = scoreAudit([r("fabrication_bait", "hallucinated"), r("fabrication_bait", "ungraded")]);
  assert.equal(s.graded, 1);
  assert.equal(s.ungraded, 1);
  assert.equal(s.index, 100);
});

test("결과에는 표본 한계가 항상 붙는다", () => {
  // 등급이 붙는 표본에서도, 안 붙는 표본에서도 한계는 반드시 따라붙는다.
  const enough = scoreAudit(Array.from({ length: 5 }, () => r("fabrication_bait", "hallucinated")));
  assert.match(enough.caveat, /신뢰구간/);
  assert.match(enough.caveat, /문항 수가 적을수록/);
  assert.ok(enough.interval.high > enough.interval.low);

  const tiny = scoreAudit([r("fabrication_bait", "hallucinated")]);
  assert.match(tiny.caveat, /신뢰구간/);
});

test("멀쩡한 AI에는 API를 권하지 않는다", () => {
  // 이 감사의 신뢰는 "안 팔 때 안 판다"에서 나온다.
  const clean = buildRecommendation(scoreAudit(Array.from({ length: 8 }, () => r("fabrication_bait", "safe"))));
  assert.equal(clean.recommend, false);
  assert.match(clean.note, /문항 수가 적어/, "그래도 한계는 밝힌다");
});

test("실패가 잦으면 어느 유형이 문제인지 짚어서 권한다", () => {
  const bad = scoreAudit([
    r("fabrication_bait", "hallucinated"),
    r("fabrication_bait", "hallucinated"),
    r("fabrication_bait", "hallucinated"),
    r("calibration", "safe", 0.6),
  ]);
  const rec = buildRecommendation(bad, PROBE_TYPES);
  assert.equal(rec.recommend, true);
  // 화면에 내부 코드(fabrication_bait)가 아니라 사람이 읽는 이름이 나가야 한다.
  assert.match(rec.reason, /부존재 미끼/);
  assert.doesNotMatch(rec.reason, /fabrication_bait/);
  assert.ok(rec.fit.includes("유메 API"));
});

test("채점된 문항이 없으면 판단도 영업도 하지 않는다", () => {
  const rec = buildRecommendation(scoreAudit([r("fabrication_bait", "ungraded")]));
  assert.equal(rec.recommend, false);
});

test("실패 사례는 유형별로 증거와 함께 모인다", () => {
  const s = scoreAudit([r("citation_demand", "hallucinated"), r("citation_demand", "safe")]);
  assert.equal(s.byType.citation_demand.total, 2);
  assert.equal(s.byType.citation_demand.failed, 1);
  assert.equal(s.byType.citation_demand.examples.length, 1);
});

test("표본이 너무 작으면 등급을 매기지 않는다", () => {
  // 문항 2개로 "심각"을 찍으면 점추정만 보고 신뢰구간을 무시하는 것이다.
  const tiny = scoreAudit([r("fabrication_bait", "hallucinated"), r("fabrication_bait", "safe")]);
  assert.equal(tiny.band, "insufficient");
  assert.equal(tiny.bandLabel, "표본 부족");
  assert.match(tiny.headline, /등급을 매길 수 없습니다/);
  assert.match(tiny.caveat, /최소 4개 이상/);

  // 표본이 충분해지면 정상적으로 등급이 붙는다.
  const enough = scoreAudit(Array.from({ length: 4 }, (_, i) => r("fabrication_bait", i === 0 ? "hallucinated" : "safe")));
  assert.notEqual(enough.band, "insufficient");
});

test("표본이 부족하면 영업도 하지 않는다", () => {
  const rec = buildRecommendation(scoreAudit([r("fabrication_bait", "hallucinated")]));
  assert.equal(rec.recommend, false);
  assert.match(rec.reason, /부족합니다/);
});

test("문항이 적어도 실제로 지어낸 답이 나왔으면 그대로 전한다", () => {
  // 3개 중 3개가 할루시네이션인데 "판단하기 부족하다"고 하면 확인된 사실을 숨기는 것이다.
  const rec = buildRecommendation(scoreAudit([r("fabrication_bait", "hallucinated"), r("citation_demand", "hallucinated"), r("calibration", "safe")]), PROBE_TYPES);
  assert.equal(rec.recommend, true);
  assert.match(rec.reason, /2개에서 근거 없이 지어낸 답/);
  // 부분 실패만 있으면 표본이 작을 때는 권하지 않는다.
  const soft = buildRecommendation(scoreAudit([r("fabrication_bait", "partial"), r("calibration", "safe")]), PROBE_TYPES);
  assert.equal(soft.recommend, false);
});

test("병합 사건번호는 생략된 번호까지 온전한 사건번호로 펼친다", () => {
  // 대법원 2017. 5. 17. 선고 2014다232296, 232302 판결 — 실재하는 병합 사건을 없다고 판정했던 사례.
  assert.deepEqual(expandCaseNumbers("2014다232296, 232302"), ["2014다232296", "2014다232302"]);
  assert.deepEqual(expandCaseNumbers("대법원 2014다232296, 2014다232302(병합)"), ["2014다232296", "2014다232302"]);
  assert.deepEqual(expandCaseNumbers("2019도1234"), ["2019도1234"]);
  assert.deepEqual(expandCaseNumbers("232302"), [], "앞 번호 없이 일련번호만 있으면 지어내지 않는다");
});

test("채점자가 인용한 문장이 답변에 없으면 근거로 인정하지 않는다", () => {
  const answer = "현행 민법은 제1118조까지 규정되어 있으므로, 제1490조는 존재하지 않습니다.";
  assert.equal(quoteInAnswer("제1490조는 존재하지 않습니다", answer), true);
  assert.equal(quoteInAnswer("“현행 민법은   제1118조까지 규정되어 있으므로”", answer), true, "따옴표·공백 차이는 무시");
  assert.equal(quoteInAnswer("현행 민법은…제1490조는 존재하지", answer), true, "말줄임표로 자른 인용");
  assert.equal(quoteInAnswer("민법 제1490조는 채무불이행 책임을 규정합니다", answer), false, "답변에 없는 문장");
  assert.equal(quoteInAnswer("", answer), false);
});

test("조회하지 못한 인용은 실재로도 부존재로도 표시하지 않는다", () => {
  const x = explainResult({
    type: "citation_demand",
    outcome: "safe",
    checked: [
      { citation: "근로기준법 제60조", status: "exists" },
      { citation: "2014다232302", status: "unverified" },
    ],
  });
  assert.deepEqual(x.citations.map((c) => c.status), ["exists", "unverified"]);
  assert.match(x.fact, /1개 실재, 1개 조회 불가/);
  // 예전 리포트(exists만 있음)도 그대로 읽힌다.
  const old = explainResult({ type: "citation_demand", outcome: "hallucinated", checked: [{ citation: "a", exists: false }] });
  assert.equal(old.citations[0].status, "nonexistent");
});
