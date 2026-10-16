import test from "node:test";
import assert from "node:assert/strict";
import { checkAnswer, checkEverydayFacts, prepareContext, appendCorrections, BLANKET_DISCLAIMER, normalizeAnswerReferences, _clearFactCache } from "../answerCheck.js";
test.beforeEach(() => _clearFactCache());
import { isOfficialUrl, officialDomainsFor } from "../koreaSources.js";

const article = { id: "A1", law: "고용보험법", no: 50, branch: null, title: "피보험기간", text: "상실한 날부터 3년 이내에", url: "u50", block: "[A1] 고용보험법 제50조\n상실한 날부터 3년 이내에", deleted: false };
const noFacts = async () => ({ claims: [], results: [] });

test("공식 출처 지도: 분야별 도메인, 하위 도메인·go.kr 인정, 블로그는 아님", () => {
  assert.ok(officialDomainsFor(["medical"]).includes("mfds.go.kr"));
  assert.ok(isOfficialUrl("https://nedrug.mfds.go.kr/pbp/CCBBB01"));
  assert.ok(isOfficialUrl("https://www.anything.go.kr/a"));
  assert.ok(!isOfficialUrl("https://blog.naver.com/x"));
});

test("질문 맥락: 법령 이야기가 아니면 조문을 찾지 않는다", async () => {
  let called = false;
  const r = await prepareContext("오늘 저녁 메뉴 추천해 줘", { deps: { gatherArticles: async () => ((called = true), { laws: [], articles: [] }) } });
  assert.equal(r.legal, false);
  assert.equal(called, false);
  const r2 = await prepareContext("연차는 며칠이에요?", { deps: { gatherArticles: async () => ({ laws: [{ name: "근로기준법" }], articles: [article] }) } });
  assert.equal(r2.legal, true);
  assert.match(r2.block, /\[현행 조문/);
  assert.equal(r2.articles[0].label, "제50조");
});

test("확인할 것이 없는 답은 그대로 돌려준다", async () => {
  const out = await checkAnswer({ question: "안녕", answer: "안녕하세요!", deps: { checkEverydayFacts: noFacts } });
  assert.equal(out.text, "안녕하세요!");
  assert.equal(out.changed, false);
  assert.equal(out.verification.facts_checked, 0);
});

test("법령: 반론 검토를 통과한 오류만 고친 답으로 돌려준다", async () => {
  const out = await checkAnswer({
    question: "고용보험 자영업자 피보험기간 합산 기준이 몇 년이에요?",
    answer: "자영업자 합산은 5년 이내입니다.",
    deps: {
      gatherArticles: async () => ({ laws: [{ name: "고용보험법", url: "u" }], articles: [article] }),
      reviewStatutes: async () => ({ ran: true, articles: [article], issues: [{ answer_quote: "5년 이내", problem: "3년", kind: "contradiction", article: "A1", article_quote: "상실한 날부터 3년 이내에", law: "고용보험법", articleLabel: "제50조", url: "u50" }] }),
      defend: async (_t, _a, cands) => cands.map((c) => ({ ...c, decision: "error", reason: "현행은 3년 이내" })),
      checkEverydayFacts: noFacts,
      revise: async ({ user }) => (assert.match(user, /틀림: "5년 이내"/), "자영업자 합산은 3년 이내입니다(고용보험법 제50조)."),
    },
  });
  assert.equal(out.text, "자영업자 합산은 3년 이내입니다(고용보험법 제50조).");
  assert.equal(out.changed, true);
  assert.equal(out.verification.fixes[0].law, "고용보험법");
});

test("고쳐 쓰기가 실패해도 틀린 답을 그대로 돌려주지 않는다", async () => {
  const out = await checkAnswer({
    answer: "에펠탑은 1899년에 완공됐어요.",
    deps: {
      checkEverydayFacts: async () => ({ claims: [], results: [{ quote: "1899년에 완공", verdict: "contradicted", correct: "1889년", url: "u", quoteSrc: "q" }] }),
      revise: async () => {
        throw new Error("down");
      },
    },
  });
  assert.match(out.text, /유메 확인 — 바로잡을 곳/);
  assert.equal(out.verification.revise_failed, true);
  assert.match(appendCorrections("a", { fixes: [], hedged: [{ quote: "x" }] }), /확인되지 않았어요/);
});

test("확인된 사실이 있는데 '기억에 의존' 같은 면책 문구가 있으면 다듬는다", async () => {
  assert.ok(BLANKET_DISCLAIMER.test("이 수치는 제가 확인 자료 없이 기억에 의존해 답한 것이라"));
  let asked = "";
  const out = await checkAnswer({
    answer: "에펠탑은 1889년에 완공됐어요. 다만 기억에 의존해 답한 것이에요.",
    deps: {
      checkEverydayFacts: async () => ({ claims: [], results: [{ quote: "1889년에 완공", claim: "완공 1889", verdict: "supported", url: "https://a.example", quoteSrc: "1889" }] }),
      revise: async ({ user }) => ((asked = user), "에펠탑은 1889년에 완공됐어요."),
    },
  });
  assert.match(asked, /확인됨: "1889년에 완공"/);
  assert.equal(out.text, "에펠탑은 1889년에 완공됐어요.");
});

test("분야가 있는 사실은 공식 기관 사이트에서 먼저, 남은 것만 웹 전체에서 찾는다", async () => {
  const calls = [];
  const json = async ({ label, tools }) => {
    if (label === "check_extract")
      return { json: { claims: [{ quote: "타이레놀 하루 최대 4,000mg", claim: "아세트아미노펜 성인 1일 최대 4,000mg", kind: "number", field: "medical" }, { quote: "높이는 330m", claim: "에펠탑 높이 330m", kind: "number", field: "general" }] }, urls: new Set() };
    calls.push({ label, allowed: tools?.[0]?.allowed_domains || null });
    if (label === "check_official") return { json: { results: [{ i: 1, verdict: "supported", url: "https://nedrug.mfds.go.kr/a", quote: "4,000mg" }] }, urls: new Set(["https://nedrug.mfds.go.kr/a"]) };
    return { json: { results: [{ i: 1, verdict: "supported", url: "https://w.example/b", quote: "330" }] }, urls: new Set(["https://w.example/b"]) };
  };
  const r = await checkEverydayFacts("타이레놀 하루 최대 4,000mg이에요. 에펠탑 높이는 330m예요.", { json });
  assert.equal(calls[0].label, "check_official");
  assert.ok(calls[0].allowed.includes("mfds.go.kr"));
  assert.equal(calls[1].label, "check_web");
  assert.equal(calls[1].allowed, null);
  assert.equal(r.results[0].official, true);
  assert.equal(r.results[1].official, false);
});

test("근거로 댄 주소가 이번 검색 결과에 없으면 확인 못 함으로 내린다(지어낸 출처 방지)", async () => {
  const json = async ({ label }) =>
    label === "check_extract"
      ? { json: { claims: [{ quote: "1899년에 완공", claim: "완공 1899", kind: "date", field: "general" }, { quote: "높이는 330m", claim: "높이 330m", kind: "number", field: "general" }] }, urls: new Set() }
      : { json: { results: [{ i: 1, verdict: "contradicted", correct: "1889년", url: "https://real.example/a", quote: "1889" }, { i: 2, verdict: "supported", url: "https://made-up.example/b", quote: "330" }] }, urls: new Set(["https://real.example/a"]) };
  const r = await checkEverydayFacts("에펠탑은 1899년에 완공됐고 높이는 330m예요.", { json });
  assert.equal(r.results[0].verdict, "contradicted");
  assert.equal(r.results[1].verdict, "unverified");
});

test("답 원문에 없는 문장을 사실로 뽑아 오면 버린다", async () => {
  const json = async ({ label }) => (label === "check_extract" ? { json: { claims: [{ quote: "답에 없는 말", claim: "x", kind: "other" }] }, urls: new Set() } : assert.fail("뽑힌 사실이 없으면 웹 확인을 부르지 않는다"));
  const r = await checkEverydayFacts("전혀 다른 답변입니다.", { json });
  assert.equal(r.claims.length, 0);
});

test("사용자 자료를 함께 주면 추출기에 넘기고, 자료는 잘라서 받는다", async () => {
  let seen = "";
  const json = async ({ label, user }) => (label === "check_extract" ? ((seen = user), { json: { claims: [] }, urls: new Set() }) : assert.fail());
  await checkEverydayFacts("월세는 50만 원이에요.", { json, references: [{ title: "계약서", text: "월세 50만 원" }] });
  assert.match(seen, /\[사용자 자료\]\n<계약서>\n월세 50만 원/);
  const refs = normalizeAnswerReferences([{ title: "a", text: "x".repeat(70_000) }, { text: "y" }]);
  assert.equal(refs.length, 1);
  assert.equal(refs[0].text.length, 60_000);
});

test("일상 사실: 답을 쓸 때 연 페이지 발췌로 먼저 확인하고, 웹 검색은 하지 않는다", async () => {
  const labels = [];
  const json = async ({ label }) => {
    labels.push(label);
    if (label === "check_extract") return { json: { claims: [{ claim: "2027학년도 전기 원서 접수는 11월 3일부터다", quote: "11월 3일부터", field: "general" }] } };
    if (label === "check_page") return { json: { results: [{ i: 1, verdict: "supported", src: 1, quote: "원서접수: 2026. 11. 3.(월) ~ 11. 14.(금)" }] } };
    throw new Error(`부르면 안 되는 단계 ${label}`);
  };
  const sources = [{ url: "https://gs.knu.ac.kr/notice/1", title: "경북대 대학원 모집요강", text: "2027학년도 전기 신입생 모집 — 원서접수: 2026. 11. 3.(월) ~ 11. 14.(금) 온라인" }];
  const r = await checkEverydayFacts("원서 접수는 11월 3일부터예요.", { json, sources, koreaData: async () => [] });
  assert.equal(r.results[0].verdict, "supported");
  assert.equal(r.results[0].via, "page");
  assert.deepEqual(labels, ["check_extract", "check_page"]);
});

test("일상 사실: 발췌에 없는 근거 문장은 인정하지 않는다(지어낸 근거 방지)", async () => {
  const json = async ({ label }) => {
    if (label === "check_extract") return { json: { claims: [{ claim: "접수는 11월 3일부터", quote: "11월 3일부터", field: "general" }] } };
    if (label === "check_page") return { json: { results: [{ i: 1, verdict: "supported", src: 1, quote: "11월 3일부터 접수" }] } };
    if (label === "check_web") return { json: { results: [] }, urls: new Set() };
    throw new Error(label);
  };
  const r = await checkEverydayFacts("접수는 11월 3일부터예요.", { json, sources: [{ url: "https://a.ac.kr/x", title: "x", text: "올해 모집 일정은 추후 공지합니다" }], koreaData: async () => [] });
  assert.equal(r.results[0].verdict, "unverified");
});

test("일상 사실: 웹 전체 확인(2차)이 실패해도 앞 단계 결과는 살고 전체 실패로 번지지 않는다", async () => {
  const json = async ({ label }) => {
    if (label === "check_extract") return { json: { claims: [
      { claim: "사과 값은 1천원이다", quote: "사과 값은 1천원", field: "general" },
      { claim: "배 값은 2천원이다", quote: "배 값은 2천원", field: "general" },
    ] } };
    if (label === "check_page") return { json: { results: [{ i: 1, verdict: "supported", src: 1, quote: "사과 값은 1천원입니다" }] } };
    if (label === "check_web") throw new Error("검색 장애");
    throw new Error(label);
  };
  const r = await checkEverydayFacts("사과 값은 1천원이고 배 값은 2천원이에요.", { json, sources: [{ url: "https://x.go.kr/a", title: "a", text: "공지: 사과 값은 1천원입니다. 자세한 것은 문의." }], koreaData: async () => [] });
  assert.equal(r.failed, undefined);
  assert.equal(r.results.find((x) => x.quote === "사과 값은 1천원").verdict, "supported");
  assert.equal(r.results.find((x) => x.quote === "사과 값은 1천원").official, true);
  assert.equal(r.results.find((x) => x.quote === "배 값은 2천원").verdict, "unverified");
});

test("확인한 사실은 6시간 기억해 같은 사실은 다시 검색하지 않는다", async () => {
  let webCalls = 0;
  const json = async ({ label }) => {
    if (label === "check_extract") return { json: { claims: [{ claim: "KTX 서울-부산은 약 2시간 30분 걸린다", quote: "2시간 30분", field: "general" }] } };
    if (label === "check_web") {
      webCalls += 1;
      return { json: { results: [{ i: 1, verdict: "supported", url: "https://www.letskorail.com/a", quote: "최단 2시간 17분" }] }, urls: new Set(["https://www.letskorail.com/a"]) };
    }
    throw new Error(label);
  };
  const a = await checkEverydayFacts("KTX로 2시간 30분쯤 걸려요.", { json, koreaData: async () => [] });
  const b = await checkEverydayFacts("보통 2시간 30분 정도예요.", { json, koreaData: async () => [] });
  assert.equal(a.results[0].verdict, "supported");
  assert.equal(b.results[0].verdict, "supported");
  assert.equal(b.results[0].cached, true);
  assert.equal(webCalls, 1);
});
