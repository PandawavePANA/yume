// 근거 잠금 — 유메가 단정하는 말은 근거 원문으로 떠받쳐져야 한다.
import test from "node:test";
import assert from "node:assert/strict";
import { classifySource, htmlToText, lockEvidence, quoteCoverage } from "../evidenceLock.js";

const PAGE = "민법 제766조(손해배상청구권의 소멸시효) ① 불법행위로 인한 손해배상의 청구권은 피해자나 그 법정대리인이 그 손해 및 가해자를 안 날로부터 3년간 이를 행사하지 아니하면 시효로 인하여 소멸한다. ".repeat(6);

test("근거 문장이 페이지에 있는지 — 공백·문장부호·따옴표가 달라도 같은 문장으로 본다", () => {
  assert.equal(quoteCoverage(PAGE, "손해 및 가해자를 안 날로부터 3년간 이를 행사하지 아니하면"), 1);
  assert.equal(quoteCoverage(PAGE, "손해  및 가해자를 안 날로부터, 3년간 이를 행사하지 아니하면…"), 1);
  assert.ok(quoteCoverage(PAGE, "손해 및 가해자를 안 날로부터 1년간 행사하지 않으면 소멸한다") < 0.85, "값이 바뀐 인용은 통째로 일치하지 않는다");
  assert.ok(quoteCoverage(PAGE, "교통사고 손해배상은 사고일로부터 일 년이 지나면 청구할 수 없다") < 0.3, "지어낸 인용");
});

test("출처 판정 — 확인됨 / 없음(지어냄) / 못 엶", () => {
  assert.equal(classifySource(PAGE, "가해자를 안 날로부터 3년간 이를 행사하지 아니하면"), "verified");
  assert.equal(classifySource(PAGE, "교통사고 손해배상은 사고일로부터 일 년이 지나면 청구할 수 없다"), "absent");
  assert.equal(classifySource(null, "아무 문장"), "unreachable");
  assert.equal(classifySource("<div id=root></div>", "아무 문장이나 길게 적은 것"), "unreachable", "껍데기만 온 동적 페이지");
});

test("HTML에서 본문만 — 스크립트·스타일·주석은 빼고 엔티티는 푼다", () => {
  const t = htmlToText("<html><head><style>p{}</style><script>var x='3년';</script></head><body><!-- 1년 --><p>소멸시효는&nbsp;3년&amp;10년</p></body></html>");
  assert.match(t, /소멸시효는 3년&10년/);
  assert.doesNotMatch(t, /var x|1년/);
});

const claim = (over) => ({ text: "손해배상청구권은 안 날로부터 3년", domain: "법률", verdict: "confirmed", verified_via: "web", explanation: "민법 제766조", sources: [{ title: "법령", url: "https://law.example/766", quote: "가해자를 안 날로부터 3년간 이를 행사하지 아니하면" }], ...over });
const fetchText = async (url) => (url.includes("dead") ? null : url.includes("other") ? "다른 이야기만 잔뜩 적힌 페이지입니다. ".repeat(30) : PAGE);

test("근거 원문이 확인되고 독립 검토도 같은 결론이면 high", async () => {
  const [c] = await lockEvidence([claim()], { fetchText, judge: async () => ["supports"] });
  assert.equal(c.verdict, "confirmed");
  assert.equal(c.confidence, "high");
  assert.equal(c.evidence.status, "verified");
  assert.equal(c.evidence.url, "https://law.example/766");
});

test("페이지는 열렸는데 근거 문장이 없으면(지어낸 인용) 판정을 거둔다", async () => {
  const [c] = await lockEvidence([claim({ sources: [{ url: "https://other.example/x", quote: "가해자를 안 날로부터 3년간 이를 행사하지 아니하면" }] })], { fetchText, judge: async () => ["supports"] });
  assert.equal(c.verdict, "uncertain");
  assert.equal(c.locked_out_verdict, "confirmed");
  assert.match(c.explanation, /출처 페이지에서 찾을 수 없어/);
});

test("근거 문장은 있는데 독립 검토가 다르게 보면 거둔다 — '확인됨'도, '사실과 다름'도", async () => {
  const [a] = await lockEvidence([claim()], { fetchText, judge: async () => ["unrelated"] });
  assert.equal(a.verdict, "uncertain");
  const [b] = await lockEvidence([claim({ verdict: "false", suggested_fix: "x" })], { fetchText, judge: async () => ["supports"] });
  assert.equal(b.verdict, "uncertain", "반박한다고 했는데 근거는 뒷받침한다 — 판정 보류");
  const [ok] = await lockEvidence([claim({ verdict: "false" })], { fetchText, judge: async () => ["contradicts"] });
  assert.equal(ok.verdict, "false");
  assert.equal(ok.confidence, "high");
});

test("페이지를 못 열었으면 판정은 두되 medium — 엄격 모드면 판정하지 않는다", async () => {
  const dead = claim({ sources: [{ url: "https://dead.example/x", quote: "가해자를 안 날로부터 3년간 이를 행사하지 아니하면" }] });
  const [m] = await lockEvidence([dead], { fetchText, judge: async () => ["supports"] });
  assert.equal(m.verdict, "confirmed");
  assert.equal(m.confidence, "medium");
  const [s] = await lockEvidence([dead], { fetchText, judge: async () => ["supports"], strict: true });
  assert.equal(s.verdict, "uncertain");
  assert.match(s.explanation, /엄격 모드/);
});

test("공식 대조·기준 자료·부존재 판정은 원문 자체가 근거 — high, 다시 흔들지 않는다", async () => {
  let called = 0;
  const judge = async () => { called += 1; return []; };
  const out = await lockEvidence(
    [claim({ verified_via: "official", sources: [] }), claim({ verified_via: "reference", sources: [] }), claim({ verdict: "false", verified_via: "nec", sources: [] }), claim({ verdict: "uncertain" })],
    { fetchText, judge, strict: true },
  );
  assert.deepEqual(out.map((c) => c.confidence), ["high", "high", "high", null]);
  assert.deepEqual(out.map((c) => c.verdict), ["confirmed", "confirmed", "false", "uncertain"]);
  assert.equal(called, 0);
});

test("검토자를 부르지 못해도 원문이 확인된 판정은 둔다(medium)", async () => {
  const [c] = await lockEvidence([claim()], { fetchText, judge: async () => { throw new Error("down"); } });
  assert.equal(c.verdict, "confirmed");
  assert.equal(c.confidence, "medium");
});
