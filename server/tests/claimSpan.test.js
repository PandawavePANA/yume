import { test } from "node:test";
import assert from "node:assert/strict";
import { attachSpans, locateQuote } from "../claimSpan.js";
import { sanitizeClaim } from "../claimGuard.js";

const doc = `당사 제품은 2019년에 출시됐습니다.
교통사고 손해배상 청구권은   사고일부터 1년이 지나면 소멸합니다.
“최초”라는 표현은 쓰지 않습니다.`;

test("발췌를 원문에서 그대로 찾으면 그 위치를 준다", () => {
  const s = locateQuote(doc, "당사 제품은 2019년에 출시됐습니다.");
  assert.deepEqual(s, { start: 0, end: "당사 제품은 2019년에 출시됐습니다.".length });
});

test("모델이 공백·줄바꿈을 다르게 옮겨도 원문 위치를 찾는다", () => {
  const q = "교통사고 손해배상 청구권은 사고일부터 1년이 지나면 소멸합니다.";
  const s = locateQuote(doc, q);
  assert.ok(s);
  assert.equal(doc.slice(s.start, s.end), "교통사고 손해배상 청구권은   사고일부터 1년이 지나면 소멸합니다.");
});

test("따옴표 모양이 달라도 같은 것으로 본다", () => {
  const s = locateQuote(doc, '"최초"라는 표현은 쓰지 않습니다.');
  assert.ok(s);
  assert.equal(doc.slice(s.start, s.end), "“최초”라는 표현은 쓰지 않습니다.");
});

test("원문에 없는 문장은 위치를 지어내지 않는다", () => {
  assert.equal(locateQuote(doc, "당사 제품은 2021년에 출시됐습니다."), null);
  assert.equal(locateQuote(doc, "당사"), null); // 너무 짧으면 엉뚱한 곳에 걸린다
});

test("attachSpans — 찾은 주장에만 위치를 달고, 못 찾은 발췌는 버린다", () => {
  const [a, b, c] = attachSpans(doc, [
    { text: "출시 2019년", quote: "당사 제품은 2019년에 출시됐습니다." },
    { text: "없는 문장", quote: "이 문장은 원문에 없습니다." },
    { text: "발췌 없음" },
  ]);
  assert.deepEqual(a.span, { start: 0, end: 21 });
  assert.equal(a.quote, "당사 제품은 2019년에 출시됐습니다.");
  assert.ok(!("quote" in b) && !("span" in b));
  assert.ok(!("span" in c));
});

test("고친 문장은 '사실과 다름'에만 남는다 — 판정이 내려가면 같이 지운다", () => {
  // 출처 없는 '사실과 다름'은 '확인되지 않음'으로 내려간다. 고친 문장도 함께 사라져야 한다.
  const demoted = sanitizeClaim({
    text: "x", domain: "일반", verdict: "false", explanation: "실제로는 3년", sources: [], suggested_fix: "3년이 지나면",
  });
  assert.equal(demoted.verdict, "uncertain");
  assert.ok(!("suggested_fix" in demoted));

  const kept = sanitizeClaim({
    text: "x", domain: "일반", verdict: "false", explanation: "실제로는 3년", sources: [{ title: "t", url: "https://e.x" }], suggested_fix: "3년이 지나면",
  });
  assert.equal(kept.verdict, "false");
  assert.equal(kept.suggested_fix, "3년이 지나면");
});
