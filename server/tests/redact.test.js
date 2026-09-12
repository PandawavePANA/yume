// 데이터셋 가명처리 규칙 테스트 — 가려야 할 것은 가리고, 판정에 필요한 정보는 남기는지.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yume-redact-"));
process.env.DATA_DIR = dir;
process.env.PGLITE_DIR = "memory://";
delete process.env.DATABASE_URL;
const { redact } = await import("../dataset.js");

test("연락처·식별번호를 가린다", () => {
  const s = redact("연락처 010-1234-5678, 사무실 02-345-6789, 메일 kim@example.com, 주민번호 900101-1234567, 카드 1234-5678-9012-3456, 계좌 110-123-456789");
  for (const leak of ["1234-5678", "345-6789", "kim@example.com", "900101", "9012-3456", "123-456789"]) assert.ok(!s.includes(leak), leak);
});

test("이름은 호칭·당사자 지위와 함께 나올 때 가린다", () => {
  assert.equal(redact("김철수 씨는 계약했다"), "○○○ 씨는 계약했다");
  assert.equal(redact("홍길동님이 말했다"), "○○○님이 말했다");
  assert.equal(redact("피해자 이영희는 고소했다"), "피해자 ○○○는 고소했다");
  assert.equal(redact("박민수 변호사에 따르면"), "○○○ 변호사에 따르면");
});

test("일반 명사·법률 식별자·날짜는 보존한다", () => {
  const keep = [
    "성범죄 피해자는 신원 보호를 받는다",
    "대법원 2016다254467 판결",
    "민법 제750조",
    "2020-12-10 선고",
    "아가씨라는 호칭",
  ];
  for (const k of keep) assert.equal(redact(k), k);
});

test("주소 번지와 동·호수", () => {
  assert.equal(redact("테헤란로 123에 있다"), "테헤란로 [번지]에 있다");
  assert.equal(redact("101동 1203호"), "[동·호수]");
});
