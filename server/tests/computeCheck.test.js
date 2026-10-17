import test from "node:test";
import assert from "node:assert/strict";
import { checkArithmetic, checkThisYear, checkWeekdays, computeCheck, formatLike, parseKoreanNumber } from "../computeCheck.js";

const one = (t) => {
  const r = checkArithmetic(t);
  assert.equal(r.length, 1, `식 하나를 찾아야 함: ${t} → ${JSON.stringify(r)}`);
  return r[0];
};

test("숫자 읽기: 쉼표 · 만 · 억 · 단위", () => {
  assert.equal(parseKoreanNumber("2,156,880원"), 2156880);
  assert.equal(parseKoreanNumber("4,200만 원"), 42000000);
  assert.equal(parseKoreanNumber("1억 2,000만"), 120000000);
  assert.equal(parseKoreanNumber("209시간"), 209);
  assert.equal(parseKoreanNumber("1.5배"), 1.5);
});

test("맞는 계산은 그대로 둔다(반올림 · 버림 · 만 단위 · 퍼센트 · 괄호)", () => {
  assert.equal(one("월급은 10,320원 × 209시간 = 2,156,880원이에요.").ok, true);
  assert.equal(one("연봉은 (300만 + 50만) × 12 = 4,200만 원이에요.").ok, true);
  assert.equal(one("국민연금은 2,000,000원 × 9% = 180,000원이에요.").ok, true);
  assert.equal(one("시급으로는 2,500,000원 ÷ 209시간 ≈ 11,962원이에요.").ok, true);
  assert.equal(one("시급으로는 2,500,000원 ÷ 209시간 = 11,961원(원 미만 버림)").ok, true);
  assert.equal(one("퇴직금 = 100,000원 × 30일 × (1,095일 ÷ 365) = 9,000,000원").ok, true);
  assert.equal(one("일급은 10,320원 × 8시간 = 일급 82,560원").ok, true);
  assert.equal(one("비율은 45 ÷ 120 = 37.5%예요.").ok, true);
});

test("틀린 계산은 바른 값을 같은 꼴로 알려 준다", () => {
  const a = one("월급은 10,320원 × 209시간 = 2,165,880원이에요.");
  assert.equal(a.ok, false);
  assert.equal(a.correct, "2,156,880원");
  const b = one("연봉은 (300만 + 50만) × 12 = 4,300만 원");
  assert.equal(b.ok, false);
  assert.equal(b.correct, "4,200만 원");
  const c = one("2,000,000원 × 9% = 190,000원");
  assert.equal(c.correct, "180,000원");
  const d = one("45 ÷ 120 = 35.5%");
  assert.equal(d.ok, false);
  assert.equal(d.correct, "37.5%");
});

test("계산이 아닌 것은 보지 않는다(날짜 · 범위 · 전화번호 · 정의 · 코드)", () => {
  assert.deepEqual(checkArithmetic("시행일은 2026-10-17 = 금요일"), []);
  assert.deepEqual(checkArithmetic("3-4일 = 보통 사흘"), []);
  assert.deepEqual(checkArithmetic("1년 = 365일"), []);
  assert.deepEqual(checkArithmetic("평균임금 = 3개월 임금 총액 ÷ 3개월 총일수"), []);
  assert.deepEqual(checkArithmetic("```py\nx = 2 * 3 = 7\n```"), []);
});

test("요일 · 없는 날짜 · 올해", () => {
  const w = checkWeekdays("2026년 10월 17일(토)에 시행하고, 2026년 10월 19일은 월요일이에요.");
  assert.deepEqual(w.map((x) => x.ok), [true, true]);
  const bad = checkWeekdays("2026년 10월 17일(금) 마감");
  assert.equal(bad[0].ok, false);
  assert.match(bad[0].problem, /토요일/);
  assert.equal(checkWeekdays("2026년 2월 30일(월)")[0].ok, false);
  const now = Date.UTC(2026, 9, 17, 3);
  assert.equal(checkThisYear("올해(2025년) 최저임금은", now).length, 1);
  assert.equal(checkThisYear("올해(2026년) 최저임금은", now).length, 0);
  assert.equal(checkThisYear("1988년 올림픽", now).length, 0);
});

test("한 번에 보기: 틀린 곳만 fixes 로", () => {
  const r = computeCheck("10,320원 × 209시간 = 2,000,000원. 2026년 10월 17일(금).", { now: Date.UTC(2026, 9, 17) });
  assert.equal(r.checked, 2);
  assert.equal(r.fixes.length, 2);
  assert.equal(r.fixes[0].type, "math");
  assert.match(r.fixes[0].problem, /2,156,880원/);
  assert.equal(formatLike(42000000, "4,300만 원"), "4,200만 원");
});

test("계산처럼 보여도 아닌 글은 건드리지 않는다", () => {
  for (const t of ["3 × 3 매트릭스 = 9칸짜리 표", "A4 용지 = 210 × 297mm", "1/3 = 33%쯤", "9시 - 6시 = 9시간 근무", "3~5일 × 2 = 6~10일", "x = 2 + 3"]) {
    const r = checkArithmetic(t);
    assert.ok(r.every((x) => x.ok), `${t} → ${JSON.stringify(r)}`);
  }
  assert.equal(one("100 - 20 = 80점").ok, true);
});

test("확인할 사실이 없는 짧은 답은 사실 뽑기를 건너뛴다(숫자 · 이름 · 법 · 날짜가 있으면 늘 확인)", async () => {
  const { hasCheckableFacts } = await import("../answerCheck.js");
  assert.equal(hasCheckableFacts("안녕하세요! 오늘 기분 좋아 보이시네요. 무엇이든 편하게 물어보세요."), false);
  assert.equal(hasCheckableFacts("힘든 하루였겠어요. 잠깐 쉬면서 따뜻한 차 한 잔 어떠세요?"), false);
  assert.equal(hasCheckableFacts("연차는 1년에 15일이에요."), true);
  assert.equal(hasCheckableFacts("타이레놀의 성분은 아세트아미노펜이에요."), true);
  assert.equal(hasCheckableFacts("서울은 대한민국의 수도예요."), true);
  assert.equal(hasCheckableFacts("Apple 이 만든 기기예요."), true);
  assert.equal(hasCheckableFacts("가".repeat(600)), true);
});
