import test from "node:test";
import assert from "node:assert/strict";
import { quoteIn, citedInText, lexicalTerms, rankArticles, lockIssues, applyStatuteReview, dedupeFalse } from "../statuteReview.js";
import { isDeletedArticleText } from "../lawApi.js";
import { applyStance } from "../claimStance.js";

test("인용 잠금: 띄어쓰기·따옴표가 달라도 같은 문장이면 있다고 본다, 짧거나 없는 문장은 아니다", () => {
  const body = "이직 당시 1주 소정근로시간이 15시간 미만이고, 1주 소정근로일수가 2일 이하인 근로자로 근로하였을 것";
  assert.equal(quoteIn(body, "1주 소정근로일수가 2일 이하인"), true);
  assert.equal(quoteIn(body, "“1주  소정근로일수가 2일 이하인”"), true);
  assert.equal(quoteIn(body, "2주 소정근로일수가 2일 이하인"), false);
  assert.equal(quoteIn(body, "1주"), false, "너무 짧은 인용은 증거가 아니다");
});

test("글에 적힌 법령·조문과 약칭을 찾는다", () => {
  const got = citedInText("고용보험법 제40조에 따르면 … 「근로기준법」 제114조제1호 … 남녀고용평등법 제19조의4에 따라 … 이 법 제3조");
  const has = (law, no, branch = null) => got.some((g) => g.law === law && g.no === no && (g.branch || null) === branch);
  assert.ok(has("고용보험법", 40));
  assert.ok(has("근로기준법", 114));
  assert.ok(has("남녀고용평등법", 19, 4));
  assert.ok(!got.some((g) => g.law === "이 법" || g.law === "이법"));
});

test("조문 번호를 몰라도 글과 말이 겹치는 조문을 위로 올린다", () => {
  const articles = [
    { no: 18, branch: 0, title: "출산전후휴가 급여 등", text: "출산전후휴가 급여를 지급한다", deleted: false },
    { no: 19, branch: 0, title: "육아휴직", text: "⑥ 근로자는 자녀의 방학 등 대통령령으로 정하는 사유로 육아휴직을 1년에 1회에 한정하여 주 단위로 나누어 사용할 수 있다. ⑦ 그 기간은 1주 또는 2주로 한다", deleted: false },
    { no: 125, branch: 0, title: "", text: "제125조 삭제 <2022. 6. 10.>", deleted: true },
  ];
  const ranked = rankArticles(articles, lexicalTerms("올해 새로 생긴 방학 단기 육아휴직은 1년에 두 번까지, 최대 4주까지 쓸 수 있죠?"));
  assert.equal(ranked[0].a.no, 19);
  assert.ok(!ranked.some((r) => r.a.no === 125), "삭제된 조문은 말이 겹쳐도 고르지 않는다(인용된 경우만 넣는다)");
});

test("삭제된 조문을 알아보고, '삭제됐다'는 맞는 말을 거짓이라 하지 않는다", () => {
  assert.equal(isDeletedArticleText("제125조 삭제 <2022. 6. 10.>"), true);
  assert.equal(isDeletedArticleText("제19조(육아휴직) ① 사업주는 … 삭제한다"), false);
  const claim = { text: "산업재해보상보험법 제125조는 2022년 개정으로 삭제되었다", absence_of: "산업재해보상보험법 제125조", verdict: "false", existence: { status: "absent", target: "산업재해보상보험법 제125조", label: "산업재해보상보험법 제125조", deleted: true, sources: [] } };
  const r = applyStance(claim);
  assert.equal(r.verdict, "confirmed");
  assert.match(r.explanation, /삭제된 조문/);
});

test("지적은 글 문장과 조문 문장이 둘 다 실제로 있어야 남는다", () => {
  const answer = "근로자로 일하다 자영업자로 가입한 경우, 5년 이내 재가입하셨다면 합산할 수 있습니다.";
  const articles = [{ id: "A1", law: "고용보험법", no: 50, branch: null, text: "그 상실한 날부터 3년 이내에 자영업자로서 피보험자격을 다시 취득한 경우", url: "u" }];
  const kept = lockIssues(
    [
      { answer_quote: "5년 이내 재가입하셨다면", problem: "3년", article: "A1", article_quote: "상실한 날부터 3년 이내에", confidence: "high" },
      { answer_quote: "10년 이내라면", problem: "x", article: "A1", article_quote: "상실한 날부터 3년 이내에", confidence: "high" },
      { answer_quote: "5년 이내 재가입하셨다면", problem: "x", article: "A1", article_quote: "상실한 날부터 4년 이내에", confidence: "high" },
      { answer_quote: "합산할 수 있습니다", problem: "x", article: "A1", article_quote: "상실한 날부터 3년 이내에", confidence: "low" },
    ],
    answer,
    articles,
  );
  assert.equal(kept.length, 1);
  assert.equal(kept[0].law, "고용보험법");
});

test("합치기: 반론에서 살아남은 지적만 틀렸다고 하고, 놓친 오류는 새 주장으로 더한다", async () => {
  const text = "자녀 1명당 1년 이내입니다. 부모가 각각 3개월 이상 쓰면 6개월 추가됩니다. 방학 단기 육아휴직은 법정 제도가 아닙니다.";
  const claims = [
    { text: "자녀 1명당 1년 이내", quote: "자녀 1명당 1년 이내입니다", domain: "법률", verdict: "false", verified_via: "web", explanation: "1년 6개월까지 가능" },
    { text: "부모 각각 3개월 이상이면 6개월 추가", quote: "부모가 각각 3개월 이상 쓰면 6개월 추가됩니다", domain: "법률", verdict: "confirmed", verified_via: "official" },
  ];
  const review = {
    ran: true,
    articles: [{ id: "A1", law: "남녀고용평등과 일ㆍ가정 양립 지원에 관한 법률", no: 19, text: "…", url: "u19", block: "[A1] …" }],
    issues: [{ answer_quote: "방학 단기 육아휴직은 법정 제도가 아닙니다", problem: "제19조⑥에 법정 제도로 있다", kind: "denies_existing", article: "A1", article_quote: "1년에 1회에 한정하여", law: "남녀고용평등과 일ㆍ가정 양립 지원에 관한 법률", articleLabel: "제19조", url: "u19" }],
  };
  const defendFn = async (_t, _a, cands) =>
    cands.map((c) => (c.source === "claim" ? { ...c, decision: "ok", reason: "같은 글이 6개월 추가를 밝혔다", proof: { law: "남녀고용평등법", label: "제19조", url: "u19", quote: "1년 이내로 한다" } } : { ...c, decision: "error", reason: "제19조⑥이 정한 법정 제도다" }));
  const out = await applyStatuteReview(text, claims, review, { defendFn });
  assert.equal(out[0].verdict, "confirmed", "같은 글이 예외를 밝혔으면 맞는 말");
  assert.equal(out[0].withdrawn_verdict, "false");
  assert.equal(out[1].verdict, "confirmed");
  assert.equal(out.length, 3);
  assert.equal(out[2].verdict, "false");
  assert.equal(out[2].statute_review, "found");
  assert.match(out[2].explanation, /법정 제도/);
});

test("합치기: 반론 뒤 확정 못 한 법률 '사실과 다름'은 확인되지 않음으로 내린다, 부존재 판정은 건드리지 않는다", async () => {
  const claims = [
    { text: "육아휴직은 총 4회 분할 사용", quote: "총 4회 분할 사용 가능", domain: "법률", verdict: "false", verified_via: "official", explanation: "3회" },
    { text: "대법원 2099다12345", quote: "대법원 2099다12345", domain: "법률", verdict: "false", verified_via: "nec", explanation: "부존재" },
  ];
  const review = { ran: true, articles: [{ id: "A1", law: "x", no: 1, text: "", url: "u", block: "" }], issues: [] };
  const seen = [];
  const out = await applyStatuteReview("…", claims, review, { defendFn: async (_t, _a, cands) => { seen.push(...cands); return cands.map((c) => ({ ...c, decision: "unclear", reason: "해석이 갈림" })); } });
  assert.equal(seen.length, 1, "부존재(nec) 판정은 반론 검토 대상이 아니다");
  assert.equal(out[0].verdict, "uncertain");
  assert.equal(out[1].verdict, "false");
});

test("법령 전문 대조가 돌지 않았으면 주장 목록을 그대로 둔다", async () => {
  const claims = [{ text: "a", domain: "법률", verdict: "false", verified_via: "official" }];
  assert.deepEqual(await applyStatuteReview("a", claims, { ran: false }), claims);
});

test("같은 문장을 겹쳐 지목한 '사실과 다름'은 긴 것 하나만 남긴다", () => {
  const out = dedupeFalse([
    { quote: "자녀 1명당 최대 1년(12개월)의 육아휴직을 신청하여 사용할 수 있습니다", verdict: "false" },
    { quote: "최대 1년(12개월)의 육아휴직", verdict: "false" },
    { quote: "최대 1년(12개월)", verdict: "confirmed" },
  ]);
  assert.equal(out.length, 2);
  assert.equal(out[0].verdict, "false");
  assert.equal(out[1].verdict, "confirmed");
});
