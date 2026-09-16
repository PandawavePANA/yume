// 상류(Anthropic) 장애 분류.
//
// 실제로 겪은 일에서 나왔다 — API 결제 잔액이 0이 되자 모든 검증이 멈췄는데 사용자에게는
// "서버 오류가 발생했어요"만 보였고, 원인을 찾는 데 로그를 뒤져야 했다. 잔액 소진은
// 버그가 아니라 운영 상태이고, 사용자·운영자에게 할 말이 각각 다르다.
import test from "node:test";
import assert from "node:assert/strict";
import { UpstreamError, classifyUpstream, noteUpstreamFailure, noteUpstreamSuccess, upstreamStatus, userMessageFor, OPERATOR_NOTE } from "../upstream.js";

test("잔액 소진은 400으로 오지만 '우리가 잘못 보냈다'가 아니다", () => {
  // 상태 코드만 보면 invalid_request_error라 입력 오류로 분류된다. 문구까지 봐야 한다.
  const e = classifyUpstream(new Error("Your credit balance is too low to access the Anthropic API."), 400);
  assert.equal(e.code, "credit_exhausted");
  assert.match(OPERATOR_NOTE[e.code], /Plans & Billing/);
});

test("원인별로 나눈다", () => {
  assert.equal(classifyUpstream(new Error("rate_limit_error"), 429).code, "rate_limited");
  assert.equal(classifyUpstream(new Error("invalid x-api-key"), 401).code, "auth_failed");
  assert.equal(classifyUpstream(new Error("Overloaded"), 529).code, "overloaded");
  assert.equal(classifyUpstream(Object.assign(new Error("aborted"), { name: "TimeoutError" })).code, "timeout");
  assert.equal(classifyUpstream(new Error("무슨 일인지 모르겠다")).code, "unavailable");
});

test("사용자에게는 원문이 아니라 '당신 잘못이 아니다'가 간다", () => {
  const raw = "Your credit balance is too low to access the Anthropic API.";
  const msg = userMessageFor(classifyUpstream(new Error(raw), 400).code);
  assert.ok(!msg.includes("credit balance"), "원문을 그대로 보여주면 자기 계정 문제로 오해한다");
  assert.ok(!msg.includes("Anthropic"), "상류 이름도 사용자에게는 의미가 없다");
  assert.match(msg, /저희가 확인/);
});

test("기록 함수는 오류를 그대로 돌려준다", () => {
  // 호출부가 `throw noteUpstreamFailure(...)`로 쓴다. 기록용 객체를 돌려주면
  // UpstreamError가 아닌 게 던져져서 분류가 통째로 새고, 원문이 사용자에게 나간다.
  const err = classifyUpstream(new Error("Your credit balance is too low"), 400);
  const returned = noteUpstreamFailure(err);
  assert.ok(returned instanceof UpstreamError, "던질 수 있는 오류여야 한다");
  assert.equal(returned, err);
});

test("상태 점검에 원인과 대처가 드러난다", () => {
  noteUpstreamSuccess();
  assert.equal(upstreamStatus().ok, true);

  noteUpstreamFailure(classifyUpstream(new Error("Your credit balance is too low"), 400));
  const s = upstreamStatus();
  assert.equal(s.ok, false);
  assert.equal(s.code, "credit_exhausted");
  assert.match(s.note, /충전/, "운영자가 무엇을 해야 하는지까지 적혀야 한다");

  // 성공하면 바로 풀린다 — 서버가 살아난 걸 상태 점검이 붙들고 있으면 안 된다.
  noteUpstreamSuccess();
  assert.equal(upstreamStatus().ok, true);
});

test("이미 분류된 오류는 다시 분류하지 않는다", () => {
  const once = classifyUpstream(new Error("Overloaded"), 529);
  assert.equal(classifyUpstream(once), once);
});
