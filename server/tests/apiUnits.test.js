// API는 1,000자마다 1건 — 한도와 정산이 같은 단위로 센다(2026-10-14 가격 개편).
import test from "node:test";
import assert from "node:assert/strict";
import { apiUnits, API_RATES, AUDIT_RATES } from "../apiRates.js";
import { addBusinessDays, businessDaysUntil, isBusinessDay } from "../businessDays.js";

test("글자 수 → 건수", () => {
  assert.equal(apiUnits(0), 1);
  assert.equal(apiUnits(640), 1);
  assert.equal(apiUnits(1000), 1);
  assert.equal(apiUnits(1001), 2);
  assert.equal(apiUnits(10_000), 10);
});

test("확정 가격(2026-10-14)", () => {
  assert.equal(API_RATES.metered.unitKrw, 1500);
  assert.deepEqual(API_RATES.tiers.map((t) => [t.key, t.monthlyKrw, t.calls]), [["starter", 490000, 400], ["growth", 1290000, 1200]]);
  assert.equal(AUDIT_RATES.audit.krw, 2_900_000);
  assert.equal(AUDIT_RATES.audit_pilot.krw, AUDIT_RATES.audit.krw / 2);
  assert.equal(AUDIT_RATES.audit_regular_year.krw, Math.round(AUDIT_RATES.audit_regular.krw * 4 * 0.9));
});

test("영업일: 주말과 공휴일을 건너뛴다", () => {
  const kst = (s) => Date.parse(`${s}+09:00`);
  // 2026-10-14(수) 오후 → 영업일 3일째는 10-19(월) 18시
  assert.equal(addBusinessDays(kst("2026-10-14T15:00:00"), 3), kst("2026-10-19T18:00:00"));
  // 2026-10-08(목) → 10-09 한글날 건너뛰고 10-12, 10-13, 10-14
  assert.equal(addBusinessDays(kst("2026-10-08T10:00:00"), 3), kst("2026-10-14T18:00:00"));
  assert.equal(isBusinessDay(kst("2026-10-10T12:00:00")), false, "토요일");
  assert.equal(businessDaysUntil(kst("2026-10-19T18:00:00"), kst("2026-10-14T15:00:00")), 3);
  assert.equal(businessDaysUntil(kst("2026-10-14T18:00:00"), kst("2026-10-14T09:00:00")), 0, "오늘 마감");
});
