// 크레딧 유효기간 1년 — 이니시스 포인트충전 입점 조건.
// 먼저 적립한 것부터 쓰고, 1년이 지나도록 남은 것만 소멸한다. 내역의 잔여는 행마다 맞아야 한다.
import test from "node:test";
import assert from "node:assert/strict";
import { CREDIT_VALID_MS, EXPIRY_START, creditLots, dueExpiries, expiresAt, nextExpiry, withRunningBalance } from "../creditExpiry.js";

const DAY = 24 * 3600 * 1000;
const T0 = EXPIRY_START + 10 * DAY;
const row = (id, delta, at, reason = delta > 0 ? "purchase" : "verify", ref = null) => ({ id, delta, reason, ref, created_at: at });

test("먼저 충전한 것부터 쓰고, 1년이 지나 남은 것만 소멸한다", () => {
  const rows = [row(1, 20, T0), row(2, 60, T0 + 30 * DAY), row(3, -25, T0 + 40 * DAY)];
  // 25를 쓰면 첫 충전 20이 다 쓰이고 두 번째에서 5가 빠진다.
  const lots = creditLots(rows);
  assert.deepEqual(lots.map((l) => l.left), [0, 55]);
  // 첫 충전의 1년이 지나도 남은 게 없으니 소멸할 것이 없다.
  assert.deepEqual(dueExpiries(rows, T0 + CREDIT_VALID_MS + DAY), []);
  // 두 번째 충전의 1년이 지나면 남은 55가 소멸한다.
  const due = dueExpiries(rows, T0 + 30 * DAY + CREDIT_VALID_MS + DAY);
  assert.deepEqual(due.map((d) => [d.lotId, d.amount]), [[2, 55]]);
});

test("소멸 처리 뒤에는 같은 적립분을 다시 소멸시키지 않는다", () => {
  const rows = [row(1, 20, T0), row(2, -20, T0 + CREDIT_VALID_MS + DAY, "expire", "expire:1")];
  assert.deepEqual(dueExpiries(rows, T0 + 2 * CREDIT_VALID_MS), []);
});

test("결제 취소는 그 결제로 들어온 충전분을 지운다", () => {
  const rows = [
    row(1, 20, T0, "purchase", "purchase:a"),
    row(2, 60, T0 + DAY, "purchase", "purchase:b"),
    row(3, -60, T0 + 2 * DAY, "purchase_cancelled", "cancel:b"),
  ];
  assert.deepEqual(creditLots(rows).map((l) => l.left), [20, 0], "엉뚱한 첫 충전분이 줄어들면 안 된다");
});

test("도입 전에 적립한 크레딧은 도입일부터 1년을 센다", () => {
  const old = EXPIRY_START - 200 * DAY;
  assert.equal(expiresAt(old), EXPIRY_START + CREDIT_VALID_MS, "약속했던 '유효기간 없음'을 소급해 바로 지우지 않는다");
  assert.equal(expiresAt(T0), T0 + CREDIT_VALID_MS);
});

test("가장 먼저 소멸할 크레딧을 알려 준다", () => {
  const rows = [row(1, 20, T0), row(2, 60, T0 + 30 * DAY), row(3, -5, T0 + 31 * DAY)];
  const n = nextExpiry(rows, T0 + 40 * DAY);
  assert.equal(n.amount, 15);
  assert.equal(n.expiresAt, T0 + CREDIT_VALID_MS);
});

test("내역의 잔여는 거래마다 맞다 — 1만 충전, 1천 사용, 잔여 9천", () => {
  // 이니시스가 든 예시 그대로(크레딧 단위). 최신이 먼저 온다.
  const recent = [row(2, -1000, T0 + 4 * DAY), row(1, 10000, T0)];
  const out = withRunningBalance(recent, 9000);
  assert.deepEqual(out.map((l) => l.balance_after), [9000, 10000]);
  assert.equal(out[1].expires_at, T0 + CREDIT_VALID_MS, "충전 행에는 소멸일");
  assert.equal(out[0].expires_at, undefined, "사용 행에는 소멸일이 없다");
});
