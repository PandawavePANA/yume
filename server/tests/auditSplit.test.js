// 무료 AI 점검 — 답변 전체를 한 번에 붙여넣으면 서버가 질문별로 나눈다.
// 잘못 나누면 남의 AI를 엉뚱한 질문으로 채점하게 되므로, 헷갈리기 쉬운 모양을 못박는다.
import test from "node:test";
import assert from "node:assert/strict";
import { copyInstructions, cutAtStarts, splitByMarkers, splitNumbered } from "../audit/splitAnswers.js";
import { splitAnswerText } from "../audit/index.js";

const probes = [
  { id: "p1", question: "근로기준법 제60조는 무엇을 규정하나요?" },
  { id: "p2", question: "대법원 2019다925296 판결의 요지는?" },
  { id: "p3", question: "직원 해고 예고 기간은?" },
];

test("복사 묶음에는 [답변 N]을 붙여 달라는 안내가 들어 있다", () => {
  const t = copyInstructions(probes);
  assert.match(t, /\[답변 1\], \[답변 2\]/);
  assert.match(t, /\[질문 3\] 직원 해고 예고 기간은\?/);
});

test("[답변 N] 표시로 나누고, 답 안의 1) 2) 목록에서는 자르지 않는다", () => {
  const raw = "[답변 1]\n제60조는 연차 유급휴가를 정합니다.\n1) 80% 이상 출근 시 15일\n2) 3년 이상이면 가산\n\n[답변 2] 해당 판례는 확인되지 않습니다.\n\n[답변 3] 30일 전에 예고해야 합니다.";
  const r = splitByMarkers(raw, 3);
  assert.equal(r.matched, 3);
  assert.match(r.parts[1], /2\) 3년 이상이면 가산/, "목록 항목이 1번 답에 그대로 남는다");
  assert.equal(r.parts[3], "30일 전에 예고해야 합니다.");
});

test("AI가 질문을 다시 옮겨 적어도 그 부분은 답에서 뺀다", () => {
  const raw = "[질문 1] 근로기준법 제60조는?\n[답변 1] 연차 유급휴가 규정입니다.\n[질문 2] 대법원 판결 요지는?\n[답변 2] 확인되지 않습니다.";
  const r = splitByMarkers(raw, 2);
  assert.equal(r.parts[1], "연차 유급휴가 규정입니다.");
  assert.equal(r.parts[2], "확인되지 않습니다.");
});

test("표시가 없으면 답의 첫 부분 위치로 원문을 그대로 자른다", () => {
  const raw = "연차 유급휴가를 규정합니다. 1년간 80% 이상…\n\n그 판결은 찾을 수 없습니다.\n\n해고하려면 30일 전에 알려야 합니다.";
  const r = cutAtStarts(raw, { 1: "연차 유급휴가를 규정합니다", 2: "그 판결은 찾을 수 없습니다", 3: "해고하려면 30일 전에 알려야" }, 3);
  assert.equal(r.matched, 3);
  assert.equal(r.parts[2], "그 판결은 찾을 수 없습니다.");
  assert.equal(cutAtStarts(raw, { 1: "원문에 없는 문장을 지어냄" }, 3), null, "원문에 없는 조각은 쓰지 않는다");
});

test("줄 맨 앞 번호 방식(예전 방식)도 여전히 된다", () => {
  const r = splitNumbered("1. 연차 규정\n2. 확인 불가\n3. 30일", 3);
  assert.equal(r.matched, 3);
  assert.equal(r.parts[3], "30일");
});

test("서버 나누기 — 표시가 있으면 모델을 부르지 않고, 없으면 위치만 묻는다", async () => {
  let called = 0;
  const call = async () => {
    called += 1;
    return { starts: { 1: "연차 유급휴가를 규정합니다", 3: "해고하려면 30일 전에" } };
  };
  const marked = await splitAnswerText("[답변 1] 가\n[답변 2] 나\n[답변 3] 다", probes, { call });
  assert.equal(marked.method, "markers");
  assert.equal(marked.answers.p2, "나");
  assert.equal(called, 0);

  const located = await splitAnswerText("연차 유급휴가를 규정합니다.\n\n해고하려면 30일 전에 알려야 합니다.", probes, { call });
  assert.equal(located.method, "located");
  assert.equal(called, 1);
  assert.equal(located.matched, 2);
  assert.equal(located.answers.p2, undefined, "답하지 않은 질문은 채점하지 않는다");
});
