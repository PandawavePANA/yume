// 회귀 테스트: 발령번호로 인용된 행정규칙을 법령으로 잘못 분류하던 버그.
//
// 실제 사고 — "공정위 고시 제2022-4호 제2조"(통신판매업 신고 면제 기준)는 실재하는
// 현행 고시인데, 이름이 '고시'로 끝나지 않아 일반 법령으로 분류됐다. 그 결과 법령
// 검색공간(법률·대통령령·총리령·부령)에서 조회됐고, 당연히 없으니 부존재 신뢰도
// 0.847로 "존재하지 않는다"고 단정했다. 실재하는 규범을 지어낸 것으로 몬 오탐이다.
//
// 외부 호출 없이 분류 단계만 본다 — 근본 원인이 거기였기 때문이다.
import test from "node:test";
import assert from "node:assert/strict";
import { parseAdminRuleCitation, statuteKind } from "../legalPipeline.js";
import { resolveAdminRuleOrg, normalizeIssueNo } from "../lawApi.js";

test("발령번호로 인용된 고시는 법령이 아니라 행정규칙으로 분류한다", () => {
  for (const name of [
    "공정위 고시 제2022-4호",
    "공정거래위원회 고시 제2022-4호",
    "금융위원회 고시 제2021-12호",
    "과기정통부 훈령 제2020-7호",
    "국세청 예규 제2019-3호",
  ]) {
    assert.equal(statuteKind(name), "admin_rule_numbered", name);
  }
});

test("인용에서 종류·번호를 분해한다", () => {
  // org에는 번호 앞 문자열을 그대로 담고, 실제 기관 식별은 resolveAdminRuleOrg가 한다.
  const a = parseAdminRuleCitation("공정위 고시 제2022-4호");
  assert.equal(a.kind, "고시");
  assert.equal(a.issueNo, "2022-4");
  assert.equal(resolveAdminRuleOrg(a.org).code, "1130000");

  // 공백·붙임표 변형
  const b = parseAdminRuleCitation("공정거래위원회 고시 제 2022 – 4 호");
  assert.equal(b.issueNo, "2022-4");
  assert.equal(resolveAdminRuleOrg(b.org).code, "1130000");
});

test("추출 단계가 정식 제목으로 풀어 쓴 인용도 기관을 찾아낸다", () => {
  // 실제 사고 형태 — 모델이 인용을 제목까지 붙여 확장해 버린다. 맨 앞을 기관으로
  // 단정하면 "통신판매업 신고 면제 기준에 대한"이 기관이 돼 조회가 실패한다.
  const c = parseAdminRuleCitation("통신판매업 신고 면제 기준에 대한 고시(공정거래위원회고시 제2022-4호)");
  assert.equal(c.kind, "고시");
  assert.equal(c.issueNo, "2022-4");
  assert.equal(resolveAdminRuleOrg(c.org).code, "1130000", "발령번호에 가장 가까운 기관을 골라야 함");
});

test("기관명이 여럿 섞이면 발령번호에 가장 가까운 쪽을 고른다", () => {
  const r = resolveAdminRuleOrg("환경부 협의를 거쳐 국세청이 발령한 국세청고시");
  assert.equal(r.code, "1210000");
});

test("일반 법령과 제목형 고시는 이 경로로 새지 않는다", () => {
  assert.equal(parseAdminRuleCitation("민법"), null);
  assert.equal(statuteKind("민법"), "statute");
  assert.equal(statuteKind("전자상거래 등에서의 소비자보호에 관한 법률"), "statute");
  // 제목으로 인용된 고시는 기존 이름 검색 경로(admin_rule)를 그대로 쓴다.
  assert.equal(statuteKind("통신판매업 신고 면제 기준에 대한 고시"), "admin_rule");
  assert.equal(statuteKind("서울특별시 도시계획 조례"), "ordinance");
});

test("소관부처 코드는 별칭으로도 찾히고, 모르는 기관은 null을 돌려준다", () => {
  assert.equal(resolveAdminRuleOrg("공정위").code, "1130000");
  assert.equal(resolveAdminRuleOrg("공정거래위원회").code, "1130000");
  assert.equal(resolveAdminRuleOrg("금융위").code, "1160100");
  // 기관을 특정하지 못하면 null — 호출부는 이때 부존재로 단정하지 않고 웹으로 넘긴다.
  assert.equal(resolveAdminRuleOrg("우주항공정책국"), null);
});

test("발령번호 표기 흔들림을 정규화한다", () => {
  assert.equal(normalizeIssueNo("제2022-4호"), "2022-4");
  assert.equal(normalizeIssueNo(" 2022 - 4 "), "2022-4");
  assert.equal(normalizeIssueNo("2022–4"), "2022-4");
});
