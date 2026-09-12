// 부존재 신뢰도(NEC) 엔진 단위 테스트 — 외부 호출 없이 형식 검증·커버리지·수식만 본다.
// 실행: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { checkCaseNumber, checkStatute, checkDoi, checkArxiv, checkIsbn, checkPmid, resolveLawAlias } from "../nec/identifiers.js";
import { coverageFor } from "../nec/searchSpace.js";
import { buildNecReport, computeNec, NEC_WEIGHTS, T2_GRADE } from "../nec/nec.js";
import { lawNameSimilarity, caseVariants, caseSimilarity } from "../nec/similarity.js";

const W = NEC_WEIGHTS.legal;

test("가중치 합은 1 (청구항 5)", () => {
  for (const w of Object.values(NEC_WEIGHTS)) assert.equal(Math.round((w.w1 + w.w2 + w.w3) * 1000), 1000);
});

test("정상 사건번호는 형식오류 0", () => {
  const r = checkCaseNumber("2016다254467");
  assert.equal(r.F, 0);
  assert.equal(r.level, "supreme");
  assert.equal(r.canonical, "2016다254467");
  assert.equal(checkCaseNumber("96다12345").F, 0);
});

test("법원명 접두어와 병합 사건번호를 벗겨낸다", () => {
  const r = checkCaseNumber("대법원 2016다254467, 254474");
  assert.equal(r.canonical, "2016다254467");
  assert.equal(r.F, 0);
});

test("시간 정합성: 헌재 설립(1988) 이전 헌마, 1998년 이전 두", () => {
  assert.equal(checkCaseNumber("1985헌마123").F, 1);
  assert.equal(checkCaseNumber("1995두1234").F, 1);
  assert.equal(checkCaseNumber("2019헌마123").F, 0);
});

test("범위 적합성: 미래 연도·자릿수 초과", () => {
  assert.equal(checkCaseNumber(`${new Date().getFullYear() + 1}다1234`).F, 1);
  assert.ok(checkCaseNumber("2019헌마99999").F >= 0.9);
});

test("발급규칙 정합성: 0으로 시작하는 일련번호, 법원과 사건부호 불일치", () => {
  assert.ok(checkCaseNumber("2019다0123").F >= 0.9);
  assert.ok(checkCaseNumber("2020가합1234", "대법원").F >= 0.8);
  assert.ok(checkCaseNumber("2019헌마123", "대법원").F >= 0.8);
});

test("연도 표기 경고는 약하게, 표기는 공식형으로 정규화", () => {
  const r = checkCaseNumber("1996다12345");
  assert.ok(r.F > 0 && r.F < 0.5);
  assert.equal(r.canonical, "96다12345");
  const r2 = checkCaseNumber("05다1234");
  assert.equal(r2.canonical, "2005다1234");
});

test("모르는 사건부호·형식 불일치", () => {
  assert.equal(checkCaseNumber("2019합1234").F, 0.5);
  assert.equal(checkCaseNumber("판례 이십일번").F, 1);
});

test("법령 조문 형식 검증과 약칭", () => {
  assert.equal(checkStatute("민법", "750조").F, 0);
  assert.equal(checkStatute("민법", "제2000조").F, 1);
  assert.equal(resolveLawAlias("아청법"), "아동ㆍ청소년의 성보호에 관한 법률");
  assert.equal(checkStatute("주택임대차법").looksAbbreviated, false);
  assert.equal(checkStatute("근기법").looksAbbreviated, true);
});

test("학술 식별자 형식 검증", () => {
  assert.equal(checkDoi("10.1038/nature12373").F, 0);
  assert.equal(checkDoi("https://doi.org/10.1038/nature12373").canonical, "10.1038/nature12373");
  assert.equal(checkDoi("10.12/abc").F, 1);
  assert.equal(checkArxiv("2101.00001").F, 0);
  assert.ok(checkArxiv("1412.12345").F >= 0.9, "2015년 이전 번호에 5자리 일련번호");
  assert.equal(checkArxiv("0612.1234").F, 1, "새 형식은 2007년 4월부터");
  assert.equal(checkArxiv("hep-th/9901001").F, 0);
  assert.equal(checkIsbn("9780306406157").F, 0);
  assert.equal(checkIsbn("9780306406158").F, 1, "체크 숫자 오류");
  assert.equal(checkIsbn("0306406152").F, 0);
  assert.ok(checkPmid("99999999").F >= 0.8);
});

test("법령명 근접도", () => {
  assert.equal(lawNameSimilarity("개인정보보호법", "개인정보 보호법"), 1);
  assert.ok(lawNameSimilarity("주택임대차법", "주택임대차보호법") >= 0.75);
  assert.ok(lawNameSimilarity("존재하지않는특별법", "국가보안법") < 0.5);
});

test("사건번호 근접 후보와 근접도", () => {
  const id = checkCaseNumber("2019다123456");
  const v = caseVariants(id);
  assert.ok(v.length > 0 && v.length <= 8);
  assert.ok(v.includes("2018다123456") && v.includes("2019두123456"));
  assert.ok(!v.includes("2019다123456"));
  assert.equal(caseSimilarity(id, checkCaseNumber("2019다123465")), 0.92);
  assert.equal(caseSimilarity(id, checkCaseNumber("2018다123456")), 0.85);
});

test("커버리지는 탐색한 DB들의 합집합 비율, 실패한 DB는 제외", () => {
  const one = coverageFor("case_supreme", [{ id: "law.go.kr:prec", ok: true }]);
  assert.equal(one.value, 0.8);
  const two = coverageFor("case_supreme", [{ id: "law.go.kr:prec", ok: true }, { id: "web", ok: true }]);
  assert.equal(two.value, 0.9);
  const failed = coverageFor("case_supreme", [{ id: "law.go.kr:prec", ok: true }, { id: "web", ok: false }]);
  assert.equal(failed.value, 0.8);
});

test("NEC = w1·C + w2·F + w3·(1−P)", () => {
  assert.equal(computeNec({ C: 1, F: 1, P: 0, weights: W }), 1);
  assert.equal(computeNec({ C: 0, F: 0, P: 1, weights: W }), 0);
  assert.equal(computeNec({ C: 0.9, F: 0, P: 0, weights: W }), 0.735);
});

test("판정 등급: 대법원 사건 — 공식DB+인용만이면 확인 불가, 웹까지 없으면 부존재 확실", () => {
  const id = checkCaseNumber("2019다123456");
  const partial = buildNecReport({
    identifier: id,
    spaceKey: "case_supreme",
    coverage: coverageFor("case_supreme", [{ id: "law.go.kr:prec", ok: true }, { id: "law.go.kr:citation", ok: true }]),
    weights: W,
  });
  assert.equal(partial.grade, "unverifiable");
  assert.ok(partial.uncovered.length > 0, "확인 불가일 때는 미탐색 영역 안내 (청구항 7)");
  const full = buildNecReport({
    identifier: id,
    spaceKey: "case_supreme",
    coverage: coverageFor("case_supreme", ["law.go.kr:prec", "law.go.kr:citation", "web"].map((x) => ({ id: x, ok: true }))),
    weights: W,
  });
  assert.equal(full.grade, "nonexistent");
  assert.ok(full.score >= T2_GRADE);
  assert.equal(full.uncovered.length, 0);
});

test("하급심은 수록률이 낮아 못 찾아도 부존재로 단정하지 않는다", () => {
  const r = buildNecReport({
    identifier: checkCaseNumber("2020가합12345"),
    spaceKey: "case_district",
    coverage: coverageFor("case_district", ["law.go.kr:prec", "law.go.kr:citation", "web"].map((x) => ({ id: x, ok: true }))),
    weights: W,
  });
  assert.equal(r.grade, "unverifiable");
});

test("아주 비슷한 실재 항목이 있으면 부존재 신뢰도가 낮아진다", () => {
  const id = checkCaseNumber("2019다123456");
  const coverage = coverageFor("case_supreme", ["law.go.kr:prec", "web"].map((x) => ({ id: x, ok: true })));
  const r = buildNecReport({ identifier: id, spaceKey: "case_supreme", coverage, similar: [{ value: "2019다123465", similarity: 0.92 }], weights: W });
  assert.equal(r.grade, "unverifiable");
  assert.equal(r.proximity.similar[0].value, "2019다123465");
});

test("형식오류가 크면 탐색 없이 부존재 확실 (청구항 2)", () => {
  const r = buildNecReport({ identifier: checkCaseNumber("1985헌마123"), spaceKey: "case_constitutional", skippedSearch: true, weights: W });
  assert.equal(r.grade, "nonexistent");
  assert.equal(r.formatError.skippedSearch, true);
  assert.equal(r.coverage.logical, true);
  assert.match(r.summary, /외부 조회 없이/);
});

test("현행 법령에서 못 찾은 법령명은 부존재 확실, 약칭형이면 확인 불가", () => {
  const cov = coverageFor("statute", [{ id: "law.go.kr:law", ok: true }]);
  assert.equal(buildNecReport({ identifier: checkStatute("존재하지않는특별법", "1조"), spaceKey: "statute", coverage: cov, weights: W }).grade, "nonexistent");
  const abbr = coverageFor("statute_abbrev", [{ id: "law.go.kr:law", ok: true }, { id: "web", ok: true }]);
  assert.equal(buildNecReport({ identifier: checkStatute("근기법"), spaceKey: "statute_abbrev", coverage: abbr, weights: W }).grade, "unverifiable");
});
