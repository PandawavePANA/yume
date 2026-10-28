// 출처 · 내용 분리 판정과 고친 문장 게이트(2026-10-28 외부 점검 핸드오프 P0 · P1). 사례는 그 점검의 재현 케이스다.
import test from "node:test";
import assert from "node:assert/strict";
import { courtTip, fieldOf, fixAllowed, fixPasses, markUnfixable, NEC_CONFIRM, splitCitationClaim, stripCitation } from "../citationSplit.js";
import { applyStance } from "../claimStance.js";
import { buildOverallVerdict } from "../overallVerdict.js";

const C19 = "헌법재판소 2023헌마4471 결정에 따라 상시 5인 미만 사업장 근로자도 부당해고 구제신청을 할 수 있게 됐다.";
const necClaim = (score, extra = {}) => ({
  text: C19,
  quote: C19,
  domain: "법률",
  verdict: "false",
  verified_via: "nec",
  explanation: `인용된 ‘2023헌마4471’은(는) 존재하지 않을 가능성이 높습니다(부존재 신뢰도 ${score}).`,
  nec: { grade: "nonexistent", score, identifier: { type: "case", value: "2023헌마4471", canonical: "2023헌마4471" } },
  existence: { status: "absent", target: "2023헌마4471", label: "2023헌마4471", score },
  ...extra,
});

test("인용을 떼고 내용만 남긴다 — 기관명 · 연결어까지", () => {
  assert.equal(stripCitation(C19, "2023헌마4471"), "상시 5인 미만 사업장 근로자도 부당해고 구제신청을 할 수 있게 됐다.");
  assert.equal(stripCitation("대법원 2024다318572 판결은 국가가 보증금 전액을 배상해야 한다고 판시했다.", "2024다318572"), "국가가 보증금 전액을 배상해야 한다고 판시했다.");
  assert.equal(stripCitation("국세청 예규 서면-2022-법규소득-9917호에 따라 300만 원 이하는 신고하지 않아도 된다.", "서면-2022-법규소득-9917"), "300만 원 이하는 신고하지 않아도 된다.");
  assert.equal(stripCitation("인용이 없는 문장", "2023헌마4471"), "인용이 없는 문장");
});

test("P0: 부존재 0.77 · 내용 미확인 → 확인 불가, 고친 문장 없음 · 사람 확인 필요", () => {
  const c = splitCitationClaim(applyStance(necClaim(0.768)));
  assert.equal(c.verdict, "uncertain");
  assert.equal(c.source_check.status, "unverifiable");
  assert.equal(c.content_verdict, "unverified");
  assert.equal(c.fix_status, "needs_human");
  assert.equal(c.suggested_fix, undefined);
  assert.match(c.explanation, /확인 불가/);
  assert.match(c.explanation, /헌법재판소 판례검색/);
  assert.doesNotMatch(c.explanation, /판결서 인터넷열람/);
  assert.equal(fixAllowed(c), false);
});

test("P0: 내용이 법령 원문 대조로 틀렸으면 '출처 확인 불가 + 내용 거짓'으로 한 판정에 적는다", () => {
  const reviewed = {
    ...applyStance(necClaim(0.768)),
    verified_via: "official",
    statute_review: "confirmed_error",
    explanation: "상시 4명 이하 사업장에는 제23조①과 제28조가 적용되지 않습니다. 근거: 근로기준법 시행령 [별표 1]",
    sources: [{ title: "근로기준법 시행령 [별표 1]", url: "https://www.law.go.kr/", quote: "제23조제1항 … 제28조 … 적용하지 않는다" }],
  };
  const c = splitCitationClaim(reviewed);
  assert.equal(c.verdict, "false");
  assert.equal(c.content_verdict, "false");
  assert.match(c.explanation, /^출처 ‘2023헌마4471’은\(는\) 확인 불가/);
  assert.match(c.explanation, /내용: 상시 4명 이하/);
  assert.equal(fixAllowed(c), true);
  // 고친 문장이 틀린 내용을 그대로 단정하거나 가짜 출처를 다시 쓰면 버린다
  assert.equal(fixPasses(c, "상시 5인 미만 사업장 근로자도 부당해고 구제신청을 할 수 있게 됐다."), false, "틀린 내용을 출처만 지워 되풀이한 문장 — 이번 사고 그대로");
  assert.equal(fixPasses(c, "헌법재판소 2023헌마4471 결정에 따라 상시 5인 미만 사업장에는 제28조가 적용되지 않는다."), false);
  assert.equal(fixPasses(c, "상시 5인 미만 사업장에는 해고 제한(제23조①)과 부당해고 구제신청(제28조) 규정이 적용되지 않는다."), true);
});

test("P0: 출처를 지우고 확인 안 된 내용을 그대로 단정한 고친 문장은 버린다", () => {
  const c = splitCitationClaim(applyStance(necClaim(0.95)));
  assert.equal(c.verdict, "false");
  assert.equal(c.source_check.status, "absent_confirmed");
  assert.equal(c.fix_status, "needs_human");
  assert.equal(fixPasses(c, "상시 5인 미만 사업장 근로자도 부당해고 구제신청을 할 수 있게 됐다."), false);
});

test("P1: 확정 문턱은 0.9 — 그 이상만 '존재하지 않음'", () => {
  assert.equal(NEC_CONFIRM, 0.9);
  assert.equal(splitCitationClaim(applyStance(necClaim(0.9))).source_check.status, "absent_confirmed");
  assert.equal(splitCitationClaim(applyStance(necClaim(0.899))).source_check.status, "unverifiable");
});

test("조문 단위 부존재(삭제된 조문)는 현행 원문을 직접 본 판정이라 나누지 않는다", () => {
  const art = { ...necClaim(0.8), existence: { status: "absent", kind: "article", target: "근로기준법 제109조제2항", label: "근로기준법 제109조제2항", score: 0.8 } };
  const c = splitCitationClaim(applyStance(art));
  assert.equal(c.verdict, "false");
  assert.equal(c.content_verdict, undefined);
});

test("'없다'고 말한 주장은 여기서 다루지 않는다(방향 판정이 이미 끝남)", () => {
  const denial = { ...necClaim(0.8), text: "2023헌마4471 결정은 존재하지 않는다.", quote: "2023헌마4471 결정은 존재하지 않는다.", absence_of: "2023헌마4471" };
  const c = splitCitationClaim(applyStance(denial));
  assert.notEqual(c.content_verdict, "unverified");
});

test("고친 문장 게이트: 법률 '사실과 다름'은 원문 인용이 붙은 판정에만", () => {
  const web = { domain: "법률", verdict: "false", verified_via: "web", sources: [{ url: "https://blog.example", quote: "" }] };
  const official = { domain: "법률", verdict: "false", verified_via: "official", sources: [{ url: "https://www.law.go.kr/", quote: "퇴직한 날부터 14일 이내에 지급하여야 한다" }] };
  const general = { domain: "일반", verdict: "false", verified_via: "web", sources: [] };
  assert.equal(fixAllowed(web), false);
  assert.equal(fixAllowed(official), true);
  assert.equal(fixAllowed(general), true);
  const marked = markUnfixable([web, official]);
  assert.equal(marked[0].fix_status, "needs_human");
  assert.equal(marked[1].fix_status, undefined);
});

test("헌재 사건은 헌재 판례검색, 대법원 사건은 판결서 열람으로 안내한다", () => {
  assert.match(courtTip("2023헌마4471"), /헌법재판소 판례검색/);
  assert.match(courtTip("2019헌바 12"), /헌법재판소/);
  assert.match(courtTip("2024다318572"), /판결서 인터넷열람/);
});

test("세부 분야: 근거 법령 · 낱말로 노무 · 세무 · 부동산을 가린다", () => {
  assert.equal(fieldOf({ domain: "법률", text: C19 }), "노무");
  assert.equal(fieldOf({ domain: "법률", text: "1세대 1주택 고가주택 기준은 양도가액 12억 원 초과이다.", sources: [{ title: "소득세법 제89조" }] }), "세무");
  assert.equal(fieldOf({ domain: "법률", text: "인도와 주민등록을 마치면 다음 날부터 대항력이 생긴다." }), "부동산");
  assert.equal(fieldOf({ domain: "법률", text: "퇴직금은 퇴직일부터 14일 안에 지급해야 한다." }), "노무");
  assert.equal(fieldOf({ domain: "일반", text: "퇴직금" }), null);
});

test("P1: 맞는 말 사이에 확인 불가가 하나라도 있으면 '전체 확인됨'을 띄우지 않는다(B19)", () => {
  const ok = { text: "대항력은 다음 날 0시에 생긴다", verdict: "confirmed" };
  const fake = splitCitationClaim(applyStance({ ...necClaim(0.8), text: "서면-2022-법규소득-9917호에 따라 부업 300만 원 이하는 신고하지 않아도 된다" }));
  const overall = buildOverallVerdict([ok, ok, ok, fake]);
  assert.notEqual(overall.label, "전체 확인됨");
  assert.notEqual(overall.tone, "confirmed");
});
