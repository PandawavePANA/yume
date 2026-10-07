// 크레딧 유효기간 — 적립한 때부터 1년.
//
// KG이니시스 포인트충전 입점 조건이다. 충전한 포인트는 결제한 시점부터 1년 안에만 쓸 수 있고,
// 남은 것은 소멸해야 한다(1년 넘게 쓸 수 있으면 입점 불가). 그래서 적립 건마다 시계를 따로 둔다.
//
// 원장(credit_ledger)에는 잔액이 없고 증감만 있으므로, 어느 적립분이 얼마나 남았는지는 원장을
// 처음부터 다시 따라가며 구한다. 쓸 때는 **먼저 적립된 것부터** 쓴다 — 곧 소멸할 크레딧을 먼저
// 써야 사용자가 잃는 게 가장 적다. 만료와 결제 취소는 대상 적립분이 정해져 있으므로 그것부터 지운다.
//
// 이 파일은 db를 부르지 않는다. 계산만 하므로 테스트가 DB 없이 돈다.
export const CREDIT_VALID_DAYS = 365;
export const CREDIT_VALID_MS = CREDIT_VALID_DAYS * 24 * 3600 * 1000;

// 유효기간을 도입한 날(KST 2026-10-08 0시). 그 전에는 "유효기간 없음"으로 안내하고 적립했다.
// 그 적립분을 소급해 바로 지우면 약속을 어기는 것이므로, 이전 적립분은 이날부터 1년을 센다.
export const EXPIRY_START = Date.parse("2026-10-08T00:00:00+09:00");

export const expiresAt = (createdAt) => Math.max(Number(createdAt) || 0, EXPIRY_START) + CREDIT_VALID_MS;

/**
 * 적립분마다 남은 양을 구한다.
 * rows: 한 사람의 원장, id 오름차순. { id, delta, reason, ref, created_at }
 * 반환: [{ id, ref, at, amount, left, expiresAt }]
 */
export function creditLots(rows) {
  const lots = [];
  const byRef = new Map();
  const take = (lot, need) => {
    const n = Math.min(lot.left, need);
    lot.left -= n;
    return need - n;
  };
  for (const r of rows || []) {
    const delta = Number(r.delta) || 0;
    if (delta > 0) {
      const lot = { id: r.id, ref: r.ref || null, at: Number(r.created_at), amount: delta, left: delta, expiresAt: expiresAt(r.created_at) };
      lots.push(lot);
      if (r.ref) byRef.set(r.ref, lot);
      continue;
    }
    let need = -delta;
    if (need <= 0) continue;
    // 대상이 정해진 차감 — 만료는 그 적립분을, 결제 취소는 그 결제로 들어온 적립분을 먼저 지운다.
    let target = null;
    if (r.reason === "expire") target = lots.find((l) => `expire:${l.id}` === r.ref) || null;
    else if (r.reason === "purchase_cancelled") target = byRef.get(String(r.ref || "").replace(/^cancel:/, "purchase:")) || null;
    if (target) need = take(target, need);
    for (const lot of lots) {
      if (need <= 0) break;
      if (lot.left > 0) need = take(lot, need);
    }
  }
  return lots;
}

/** 지금 소멸시켜야 할 적립분. [{ lotId, amount, at, expiresAt }] */
export function dueExpiries(rows, at = Date.now()) {
  return creditLots(rows)
    .filter((l) => l.left > 0 && l.expiresAt <= at)
    .map((l) => ({ lotId: l.id, amount: l.left, at: l.at, expiresAt: l.expiresAt }));
}

/** 가장 먼저 소멸할 남은 크레딧. 없으면 null. { amount, expiresAt } */
export function nextExpiry(rows, at = Date.now()) {
  const alive = creditLots(rows).filter((l) => l.left > 0 && l.expiresAt > at);
  if (!alive.length) return null;
  const first = Math.min(...alive.map((l) => l.expiresAt));
  // 같은 날 소멸하는 것은 한 줄로 묶어 보여 준다.
  const day = (t) => new Date(t + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const amount = alive.filter((l) => day(l.expiresAt) === day(first)).reduce((s, l) => s + l.left, 0);
  return { amount, expiresAt: first };
}

/**
 * 최근 내역에 행마다 "이 거래 뒤 잔액"을 붙인다. 이니시스 조건: 충전·차감 내역과 잔여 포인트가
 * 함께 보이고 계산이 맞아야 한다(9/1 1만 충전 → 9/5 1천 사용 → 잔여 9천).
 * recent: id 내림차순(최신 먼저), total: 현재 잔액.
 */
export function withRunningBalance(recent, total) {
  let after = Number(total) || 0;
  return (recent || []).map((l) => {
    const row = { ...l, balance_after: after, ...(l.delta > 0 ? { expires_at: expiresAt(l.created_at) } : {}) };
    after -= Number(l.delta) || 0;
    return row;
  });
}
