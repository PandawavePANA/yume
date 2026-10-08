// 있는 걸 없다고 하는 주장, 없는 걸 있다고 하는 주장 — 둘 다 같은 저울로 잡는다.
//
// 부존재 확인(대상이 공식 자료에 없음)은 주장의 방향에 따라 뜻이 정반대다.
//   "2019다999991 판결은 ○○를 판시했다"   + 대상 없음 → 사실과 다름(지어낸 인용)
//   "2019다999991이라는 판례는 존재하지 않는다" + 대상 없음 → 확인됨(맞는 정정)
//   "민법에는 제750조가 없다"              + 대상 있음 → 사실과 다름(있는 걸 없다고 함)
import test from "node:test";
import assert from "node:assert/strict";
import { absenceTarget, applyStance, isDenial, sameTarget } from "../claimStance.js";
import { resolveIdentifierClaims } from "../identifierPipeline.js";
import { sanitizeClaim } from "../claimGuard.js";
import { resolveUncertainClaims } from "../resolveUncertain.js";

test("대상 비교 — 표기가 달라도 같은 대상, 더 좁은 대상은 다른 대상", () => {
  assert.ok(sameTarget("대법원 2019다999991 판결", "2019다999991"));
  assert.ok(sameTarget("민법 제9999조", "민법 9999조"));
  assert.ok(sameTarget("10.1234/ABC.5", "10.1234/abc.5"));
  assert.ok(!sameTarget("민법 제750조 제3항", "민법 제750조"), "조문이 있다고 그 항이 있는 건 아니다");
  assert.ok(!sameTarget("2019다999991", "2019다999992"));
});

test("주장의 방향 — 추출 단계 값이 우선, 없을 때만 표현으로 판별", () => {
  assert.equal(absenceTarget({ text: "어떤 주장", absence_of: "2019다999991" }), "2019다999991");
  assert.equal(absenceTarget({ text: "그런 판례는 존재하지 않습니다", absence_of: "" }), null, "추출 단계가 긍정이라고 답했다");
  assert.ok(isDenial({ text: "대법원 2019다999991이라는 판례는 존재하지 않습니다" }), "예전 캐시처럼 필드가 없으면 표현으로");
  assert.ok(!isDenial({ text: "이 경우 임차인에게 배상 책임이 없다" }), "내용으로서의 '없다'는 방향이 아니다");
  assert.ok(isDenial({ text: "민법 제750조에는 제3항이 없다" }));
});

test("없는 것을 없다고 했으면 확인됨, 있다고 했으면 사실과 다름", () => {
  const absent = { status: "absent", target: "2019다999991", label: "2019다999991", score: 0.748 };
  const denial = applyStance({ text: "2019다999991 판례는 존재하지 않는다", absence_of: "2019다999991", verdict: "false", verified_via: "nec", existence: absent });
  assert.equal(denial.verdict, "confirmed");
  assert.match(denial.explanation, /"없다"는 이 주장은 맞습니다/);
  assert.equal(denial.existence, undefined, "내부 표시는 지운다");

  const affirm = applyStance({ text: "2019다999991 판결은 임대인 책임을 인정했다", absence_of: "", verdict: "false", verified_via: "nec", existence: absent });
  assert.equal(affirm.verdict, "false", "지어낸 인용은 그대로 사실과 다름");
  assert.equal(affirm.existence, undefined);
});

test("있는 것을 없다고 했으면 사실과 다름 — 실재 출처를 근거로", () => {
  const present = { status: "present", target: "민법 제750조", label: "민법 제750조", sources: [{ title: "민법 - 불법행위의 내용", url: "https://www.law.go.kr/x" }] };
  const out = applyStance({ text: "민법에는 제750조가 없다", absence_of: "민법 제750조", verdict: "confirmed", verified_via: "official", existence: present });
  assert.equal(out.verdict, "false");
  assert.match(out.explanation, /실제로 존재합니다/);
  assert.equal(out.sources[0].url, "https://www.law.go.kr/x");

  const narrower = applyStance({ text: "민법 제750조에는 제3항이 없다", absence_of: "민법 제750조 제3항", verdict: "confirmed", verified_via: "official", existence: present });
  assert.equal(narrower.verdict, "confirmed", "항 단위 부정은 조문 원문 대조 결과를 그대로 둔다");
});

test("학술 식별자 — DOI가 없다는 주장과 있다는 주장", async () => {
  const lookups = {
    doi: {
      label: "DOI",
      source: "doi.org",
      fn: async (v) => (v === "10.1000/real" ? { ok: true, found: true, title: "Real paper", url: "https://doi.org/10.1000/real" } : { ok: true, found: false }),
    },
  };
  const claims = [
    { text: "DOI 10.1000/fake 논문은 존재하지 않는다", absence_of: "10.1000/fake", verdict: "uncertain", sources: [], identifiers: [{ type: "doi", value: "10.1000/fake" }] },
    { text: "DOI 10.1000/real 논문은 존재하지 않는다", absence_of: "10.1000/real", verdict: "uncertain", sources: [], identifiers: [{ type: "doi", value: "10.1000/real" }] },
    { text: "DOI 10.1000/fake 논문은 수면 효과를 보였다", absence_of: "", verdict: "uncertain", sources: [], identifiers: [{ type: "doi", value: "10.1000/fake" }] },
  ];
  const [a, b, c] = (await resolveIdentifierClaims(claims, { lookups })).map(applyStance);
  assert.equal(a.verdict, "confirmed", "없는 DOI를 없다고 했다");
  assert.equal(b.verdict, "false", "있는 DOI를 없다고 했다");
  assert.match(b.explanation, /실제로 존재합니다/);
  assert.equal(c.verdict, "false", "없는 DOI를 근거로 댔다");
});

test("검색에 안 나온다는 이유로 '없다'를 확인됨이라 하지 않는다", () => {
  const c = sanitizeClaim({
    text: "이 와인은 Wine Enthusiast 평점을 받은 적이 없다",
    absence_of: "Wine Enthusiast 평점",
    domain: "일반",
    verdict: "confirmed",
    verified_via: "web",
    explanation: "검색 결과에서 해당 평점을 찾을 수 없습니다",
    sources: [{ title: "t", url: "https://e.x" }],
  });
  assert.equal(c.verdict, "uncertain");
  assert.equal(c.unbacked_verdict, "confirmed");

  const positive = sanitizeClaim({
    text: "WHO 본부는 제네바에 있다", absence_of: "", domain: "일반", verdict: "confirmed", verified_via: "web",
    explanation: "WHO 공식 페이지에서 확인", sources: [{ title: "WHO", url: "https://who.int" }],
  });
  assert.equal(positive.verdict, "confirmed", "긍정 주장은 건드리지 않는다");
});

test("공표된 기록이 있어야 할 대상을 '없다'고 했고 정말 없으면 확인됨", async () => {
  const claim = { text: "2024년 대구 중구 안경 공방 평균 객단가 통계는 발표된 적이 없다", absence_of: "2024년 대구 중구 안경 공방 평균 객단가 통계", domain: "일반", verdict: "uncertain", explanation: "", sources: [] };
  const report = { verdict: "uncertain", explanation: "통계청·대구시 자료를 검색했으나 해당 집계 없음", sources: [], recordedness: "public_record", searchedThoroughly: true, nearMiss: null, subjectFound: true };
  const [out] = await resolveUncertainClaims([claim], { research: async () => report });
  assert.equal(out.verdict, "confirmed");
  assert.equal(out.verified_via, "nec");
  assert.match(out.explanation, /"없다"는 이 주장은 맞습니다/);

  // 같은 결과라도 긍정 주장이면 지어낸 통계다.
  const [affirm] = await resolveUncertainClaims([{ ...claim, text: "2024년 대구 중구 안경 공방 평균 객단가는 18만 7천원이다", absence_of: "" }], { research: async () => report });
  assert.equal(affirm.verdict, "false");
});

test("비공개 영역을 '없다'고 하면 단정하지 않는다", async () => {
  const claim = { text: "리머라는 회사는 존재하지 않는다", absence_of: "리머라는 회사", domain: "일반", verdict: "uncertain", explanation: "", sources: [] };
  const report = { verdict: "uncertain", explanation: "검색에서 찾지 못함", sources: [], recordedness: "private", searchedThoroughly: true, nearMiss: null, subjectFound: false };
  const [out] = await resolveUncertainClaims([claim], { research: async () => report });
  assert.equal(out.verdict, "uncertain", "작은 회사가 검색에 없다고 없는 회사가 되지 않는다");
});

test("원문에 적힌 인용인지, 추출 단계가 짐작한 인용인지 가린다", async () => {
  const { citationInText } = await import("../legalPipeline.js");
  assert.deepEqual(citationInText({ text: "민법 제750조는 불법행위 책임을 정한다" }, { law_name: "민법", article: "750조" }), { law: true, article: true });
  assert.deepEqual(citationInText({ text: "근기법 60조에 따라 연차는 15일이다" }, { law_name: "근로기준법", article: "60조" }), { law: true, article: true }, "약칭으로 인용해도 인용이다");
  assert.deepEqual(citationInText({ text: "연차휴가는 1년에 15일이다" }, { law_name: "근로기준법", article: "60조" }), { law: false, article: false }, "추출 단계가 채운 짐작");
  assert.equal(citationInText({ text: "민법 제7조는…" }, { law_name: "민법", article: "750조" }).article, false, "번호 일부만 겹치면 인용이 아니다");
});
