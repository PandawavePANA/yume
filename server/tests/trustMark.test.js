// YUME 검증 마크 — 발급 기준과 원문 지문.
// 마크는 한 번이라도 틀린 글에 붙으면 전체의 값어치가 사라진다. 그래서 기준을 테스트로 못박는다.
import test from "node:test";
import assert from "node:assert/strict";
import { MARK_VALID_MS, badgeSvg, markEligibility, markHash, markSnapshot, markStatus, newMarkId, validMarkId } from "../trustMarkRules.js";

const claim = (over = {}) => ({ text: "대한민국의 수도는 서울이다", verdict: "confirmed", confidence: "high", verified_via: "web", sources: [{ title: "t", url: "https://e.x", quote: "수도 서울" }], ...over });
const view = (claims, status = "done") => ({ status, text: "본문", result: { claims } });

test("모든 주장이 원문으로 확인(high)돼야 발급한다", () => {
  assert.equal(markEligibility(view([claim(), claim({ verified_via: "official" })])).ok, true);

  const medium = markEligibility(view([claim(), claim({ confidence: "medium" })]));
  assert.equal(medium.ok, false, "원문을 직접 확인하지 못한 '확인됨'은 통과하지 못한다");
  assert.deepEqual(medium.blockers.map((b) => b.index), [1]);

  assert.equal(markEligibility(view([claim(), claim({ verdict: "false" })])).ok, false, "사실과 다름이 하나라도 있으면 안 된다");
  assert.equal(markEligibility(view([claim({ verdict: "uncertain", uncertain_reason: "no_evidence" })])).ok, false, "근거 없음도 안 된다");
});

test("사실 주장이 없거나 검사가 덜 끝난 문서에는 발급하지 않는다", () => {
  assert.match(markEligibility(view([])).reason, /사실 주장이 담긴 글에만/);
  assert.equal(markEligibility(view([claim()], "partial")).ok, false, "일부 조각을 검사하지 못했다");
  assert.equal(markEligibility(view([claim()], "pending")).ok, false);
});

test("원문 지문은 띄어쓰기·줄바꿈을 무시하고, 글자가 바뀌면 달라진다", () => {
  const a = markHash("대한민국의 수도는\n서울입니다.  2024년 합계출산율 0.72명.");
  assert.equal(markHash("대한민국의 수도는 서울입니다. 2024년 합계출산율 0.72명."), a, "웹 페이지로 옮겨도 같은 지문");
  assert.equal(markHash("대한민국의 수도는 서울입니다.​ 2024년 합계출산율 0.72명."), a, "보이지 않는 문자는 무시");
  assert.notEqual(markHash("대한민국의 수도는 서울입니다. 2024년 합계출산율 0.73명."), a, "숫자 하나가 바뀌면 다른 글");
});

test("공개 기록에는 기준 자료(비공개)의 내용을 싣지 않는다", () => {
  const [web, ref] = markSnapshot([
    claim({ evidence: { status: "verified", url: "https://kostat.go.kr", quote: "0.72명" } }),
    claim({ verified_via: "reference", sources: [{ title: "사내 자료", url: "https://intra.example/doc", quote: "내부 수치" }] }),
  ]);
  assert.equal(web.evidence.quote, "0.72명");
  assert.equal(ref.sources.length, 0);
  assert.equal(ref.evidence, null);
  assert.match(ref.via_label, /기준 자료/);
});

test("상태 — 유효 · 재확인 필요(기간 지남) · 철회", () => {
  const t = Date.now();
  assert.equal(markStatus({ expires_at: t + MARK_VALID_MS }, t), "valid");
  assert.equal(markStatus({ expires_at: t - 1 }, t), "expired");
  assert.equal(markStatus({ expires_at: t + MARK_VALID_MS, revoked_at: t }, t), "revoked");
  assert.match(badgeSvg("valid"), /검증됨/);
  assert.match(badgeSvg("expired"), /재확인 필요/);
});

test("마크 번호는 주소에 그대로 쓸 수 있는 모양이다", () => {
  for (let i = 0; i < 50; i++) assert.ok(validMarkId(newMarkId()));
  assert.equal(validMarkId("../etc"), false);
  assert.equal(validMarkId("ym<script>"), false);
});
