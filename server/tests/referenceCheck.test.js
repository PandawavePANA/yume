// 기업 기준 자료(references)와 자사(organization) 보호.
//
// 기업이 검사하는 글은 상당수가 자기 이야기다. 그 사실은 공개 웹에 없거나 조금뿐이라,
// 웹만 보면 '확인되지 않음'이 쏟아지거나 "기록이 없으니 지어냈다"가 된다.
// 실제로 "리머는 2026년 9월 유메를 출시했습니다"가 부존재 판정으로 '사실과 다름'을 받았다.
import test from "node:test";
import assert from "node:assert/strict";
import { checkAgainstReferences, mentionsOrganization, normalizeReferences, referenceScope } from "../referenceCheck.js";
import { resolveUncertainClaims } from "../resolveUncertain.js";
import { sanitizeClaim } from "../claimGuard.js";

const REF = { title: "요금 안내", text: "프로 요금제는 월 19,000원이며 매달 검증 300회를 제공합니다. 환불은 결제 후 7일 이내에 가능합니다." };

test("기준 자료 형식 검사 — 틀리면 무엇이 틀렸는지 알려주고 아무것도 시작하지 않는다", () => {
  assert.deepEqual(normalizeReferences(undefined, " 리머 "), { refs: [], organization: "리머" });
  assert.match(normalizeReferences("문자열", "").error, /배열/);
  assert.match(normalizeReferences([{ title: "x" }]).error, /references\[0\]/);
  assert.match(normalizeReferences(Array(6).fill({ text: "a" })).error, /5개/);
  assert.match(normalizeReferences([{ text: "가".repeat(20_001) }]).error, /20,000자/);
  const ok = normalizeReferences(["그냥 문자열도 받는다"]);
  assert.equal(ok.refs[0].title, "기준 자료 1");
});

const claims = [
  { text: "프로 요금제는 월 19,000원이다", domain: "금융", verdict: "uncertain", sources: [] },
  { text: "환불은 결제 후 30일 이내 가능하다", domain: "일반", verdict: "uncertain", sources: [] },
  { text: "유메는 2026년 출시됐다", domain: "일반", verdict: "uncertain", sources: [] },
  { text: "검증은 매달 500회 제공된다", domain: "일반", verdict: "uncertain", sources: [] },
];

test("기준 자료가 다루는 주장만 그 자료로 판정하고, 근거 문장은 원문 그대로 붙인다", async () => {
  const call = async () => ({
    results: [
      { n: 1, status: "confirmed", ref: 1, evidence: "프로 요금제는 월 19,000원이며", explanation: "기준 자료와 일치" },
      { n: 2, status: "false", ref: 1, evidence: "환불은 결제 후 7일 이내에 가능합니다.", explanation: "기준 자료에 따르면 7일 이내" },
      { n: 3, status: "not_covered" },
      // 기준 자료에 없는 문장을 근거로 댔다 — 지어낸 근거이므로 판정으로 인정하지 않는다.
      { n: 4, status: "false", ref: 1, evidence: "검증은 매달 300회만 제공됩니다.", explanation: "300회" },
    ],
  });
  const [a, b, c, d] = await checkAgainstReferences(claims, [REF], { call });
  assert.equal(a.verdict, "confirmed");
  assert.equal(a.verified_via, "reference");
  assert.equal(a.sources[0].title, "기준 자료: 요금 안내");
  assert.equal(a.sources[0].quote, "프로 요금제는 월 19,000원이며");
  assert.equal(b.verdict, "false");
  assert.equal(b.from_reference, true);
  assert.equal(c.verdict, "uncertain"); // 다루지 않음 → 그대로 다음 단계로
  assert.ok(!c.from_reference);
  assert.equal(d.verdict, "uncertain"); // 지어낸 근거는 버린다
  assert.ok(!d.from_reference);
});

test("기준 자료 판정은 URL이 없어도 근거 없는 판정으로 강등되지 않는다", () => {
  const out = sanitizeClaim({ text: "x", domain: "일반", verdict: "false", verified_via: "reference", explanation: "기준 자료에 따르면 7일", sources: [{ title: "기준 자료: 요금", quote: "7일 이내" }], suggested_fix: "7일 이내" });
  assert.equal(out.verdict, "false");
  assert.equal(out.suggested_fix, "7일 이내");
});

test("기준 자료·자사명이 있으면 결과 캐시를 나눈다 — 다른 회사에게 그 판정이 나가지 않는다", () => {
  assert.equal(referenceScope([], ""), "");
  assert.match(referenceScope([REF], ""), /^ref:[0-9a-f]{64}$/);
  assert.notEqual(referenceScope([REF], "리머"), referenceScope([REF], "다른회사"));
});

test("자사명이 주장에 들어 있는지 — 띄어쓰기·대소문자 무시", () => {
  assert.ok(mentionsOrganization("리머 는 2026년 9월 유메를 출시했다", "리머"));
  assert.ok(mentionsOrganization("REAMER launched YUME", "reamer"));
  assert.ok(!mentionsOrganization("삼성전자는 1969년 설립됐다", "리머"));
  assert.ok(!mentionsOrganization("아무 문장", "")); // 자사명이 없으면 보호도 없다
});

// 부존재 판정이 설 만한 리서치 결과(공식 발표 영역을 다 뒤졌는데 없음).
const report = (over = {}) => ({ verdict: "uncertain", explanation: "검색했으나 출시 기록을 찾지 못함", sources: [], recordedness: "reported", searchedThoroughly: true, nearMiss: null, subjectFound: true, ...over });
const launch = { text: "리머는 2026년 9월 유메를 출시했다", domain: "일반", verdict: "uncertain", explanation: "", sources: [] };

test("자사에 관한 주장은 기록이 없다는 이유로 '사실과 다름'이 되지 않는다", async () => {
  const [out] = await resolveUncertainClaims([launch], { research: async () => report(), organization: "리머" });
  assert.equal(out.verdict, "uncertain");
  assert.match(out.explanation, /기준 자료로 보내 주시면/);
});

test("주체 자체를 찾지 못했으면 그 활동의 기록 부재로 단정하지 않는다", async () => {
  const [out] = await resolveUncertainClaims([launch], { research: async () => report({ subjectFound: false }) });
  assert.equal(out.verdict, "uncertain");
  assert.match(out.explanation, /주체를 공개 자료에서 찾지 못했습니다/);
});

test("다른 회사·주체를 찾은 경우의 부존재 판정은 그대로다(지어낸 통계를 잡는 경로)", async () => {
  const [out] = await resolveUncertainClaims([{ ...launch, text: "삼성전자는 2026년 9월 유메를 출시했다" }], { research: async () => report(), organization: "리머" });
  assert.equal(out.verdict, "false");
  assert.equal(out.verified_via, "nec");
});
