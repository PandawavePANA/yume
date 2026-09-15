import { all, now, one, run, tx } from "./db.js";

// 크레딧 — 제보(바운티)·추천 보상으로 쌓이고, 상품 교환으로 빠져나가는 포인트.
//
// 절대 잊지 말 것: 크레딧은 실제 금전 가치가 있는 채무다. 그래서
//  · 지급·차감은 전부 원장(credit_ledger)에 남기고, 잔액은 원장 합으로만 계산한다.
//  · 교환은 서버가 물건을 사거나 돈을 보내지 않는다. "신청"만 받아 두고 운영자가
//    직접 확인해서 보내준다(관리자 대시보드 → 크레딧 탭). 자동 결제·송금은 넣지 말 것.
//  · 현금 환급은 넣지 않았다. 크레딧을 현금으로 바꿔주면 전자금융거래법상
//    선불전자지급수단에 해당해 금융위 등록 대상이 될 수 있다. 상품 교환만 연다.

// 1 크레딧 = 100원 상당(검증 토큰 1개와 같은 기준).
export const CREDIT_KRW = 100;

// 보상 금액 — 운영하면서 조정할 값이라 여기 모아둔다.
export const BOUNTY_CREDITS = 20; // 제보 1건 승인 시(2,000원 상당)
export const REFERRAL_CREDITS = 10; // 친구가 가입하고 첫 검증을 마쳤을 때(1,000원 상당)
export const REFERRAL_MONTHLY_CAP = 20; // 한 사람이 추천으로 한 달에 받을 수 있는 최대 건수

// 교환 상품 — 쿠팡에서 살 수 있는 물건 기준. 금·상품권은 시세가 움직이므로 여기 값은
// 출발점이고, 실제 교환은 신청 시점에 운영자가 가격을 확인하고 보낸다(화면에도 그렇게 적었다).
export const CATALOG = [
  { key: "cafe_5000", label: "카페 기프티콘 (5,000원권)", credits: 60, krw: 5000 },
  { key: "cvs_10000", label: "편의점 모바일 상품권 (10,000원권)", credits: 115, krw: 10000 },
  { key: "goldbar_1g", label: "미니 골드바 1g", credits: 1500, krw: 150000 },
  { key: "goldbar_3_75g", label: "미니 골드바 3.75g (한 돈)", credits: 5500, krw: 550000 },
];

export const catalogItem = (key) => CATALOG.find((i) => i.key === key) || null;

export async function balance(userId) {
  return (await one("SELECT COALESCE(SUM(delta), 0) AS n FROM credit_ledger WHERE user_id = :userId", { userId }))?.n || 0;
}

export function listLedger(userId, limit = 50) {
  return all("SELECT id, delta, reason, ref, memo, created_at FROM credit_ledger WHERE user_id = :userId ORDER BY id DESC LIMIT :limit", {
    userId,
    limit,
  });
}

// 지급. 같은 건으로 두 번 지급되지 않아야 하는 경우는 호출부에서 ref로 확인한다.
export async function grant(userId, delta, reason, { ref = null, memo = null, q = null } = {}) {
  const exec = q || { run };
  await exec.run("INSERT INTO credit_ledger (user_id, delta, reason, ref, memo, created_at) VALUES (:userId, :delta, :reason, :ref, :memo, :t)", {
    userId,
    delta,
    reason,
    ref,
    memo,
    t: now(),
  });
}

// 차감 — 잔액이 모자라면 아무것도 쓰지 않고 false를 돌려준다. 같은 사람이 동시에 두 번
// 신청해도 잔액이 음수로 내려가지 않도록, 회원 행을 잠가서 한 사람의 차감을 직렬화한다
// (합계에는 FOR UPDATE를 걸 수 없어 잠글 대상이 따로 필요하다).
export async function spend(userId, amount, reason, { ref = null, memo = null } = {}) {
  return tx(async (q) => {
    await q.one("SELECT id FROM users WHERE id = :userId FOR UPDATE", { userId });
    const cur = (await q.one("SELECT COALESCE(SUM(delta), 0) AS n FROM credit_ledger WHERE user_id = :userId", { userId }))?.n || 0;
    if (cur < amount) return false;
    await q.run("INSERT INTO credit_ledger (user_id, delta, reason, ref, memo, created_at) VALUES (:userId, :delta, :reason, :ref, :memo, :t)", {
      userId,
      delta: -amount,
      reason,
      ref,
      memo,
      t: now(),
    });
    return true;
  });
}

// ── 상품 교환 ──
// 신청 접수와 크레딧 차감은 한 트랜잭션으로 묶는다 — 차감만 되고 신청이 없거나,
// 신청만 남고 차감이 안 되는 상태가 생기면 정산이 어긋난다.
export async function requestRedemption(user, itemKey, contact) {
  const item = catalogItem(itemKey);
  if (!item) return { error: "선택한 상품을 찾을 수 없어요." };
  const to = String(contact || "").trim();
  if (to.length < 5) return { error: "받으실 연락처(휴대폰 번호 또는 이메일)를 입력해주세요." };
  if (to.length > 200) return { error: "연락처가 너무 길어요." };

  return tx(async (q) => {
    await q.one("SELECT id FROM users WHERE id = :userId FOR UPDATE", { userId: user.id });
    const cur = (await q.one("SELECT COALESCE(SUM(delta), 0) AS n FROM credit_ledger WHERE user_id = :userId", { userId: user.id }))?.n || 0;
    if (cur < item.credits) return { error: "크레딧이 부족해요." };
    const r = await q.run(
      `INSERT INTO redemptions (user_id, item_key, item_label, credits, contact, created_at)
       VALUES (:userId, :key, :label, :credits, :contact, :t) RETURNING *`,
      { userId: user.id, key: item.key, label: item.label, credits: item.credits, contact: to, t: now() },
    );
    const redemption = r.rows[0];
    await q.run("INSERT INTO credit_ledger (user_id, delta, reason, ref, memo, created_at) VALUES (:userId, :delta, 'redeem', :ref, :memo, :t)", {
      userId: user.id,
      delta: -item.credits,
      ref: `redemption:${redemption.id}`,
      memo: item.label,
      t: now(),
    });
    return { redemption };
  });
}

export function listUserRedemptions(userId, limit = 20) {
  return all("SELECT id, item_label, credits, status, created_at, handled_at FROM redemptions WHERE user_id = :userId ORDER BY id DESC LIMIT :limit", {
    userId,
    limit,
  });
}

export function listRedemptions(status = null, limit = 200) {
  return all(
    `SELECT r.*, u.email, u.name FROM redemptions r JOIN users u ON u.id = r.user_id
      ${status ? "WHERE r.status = :status" : ""} ORDER BY r.id DESC LIMIT :limit`,
    status ? { status, limit } : { limit },
  );
}

// 운영자가 물건을 실제로 보낸 뒤 처리 완료로 바꾼다. 취소하면 크레딧을 돌려준다.
export async function handleRedemption(id, decision, adminNote) {
  const row = await one("SELECT * FROM redemptions WHERE id = :id", { id });
  if (!row) return { error: "교환 신청을 찾을 수 없어요." };
  if (row.status !== "requested") return { error: "이미 처리된 신청이에요." };
  const status = decision === "fulfill" ? "fulfilled" : "cancelled";
  await run("UPDATE redemptions SET status = :status, admin_note = :note, handled_at = :t WHERE id = :id", {
    id,
    status,
    note: adminNote ? String(adminNote).slice(0, 500) : null,
    t: now(),
  });
  if (status === "cancelled") {
    await grant(row.user_id, row.credits, "redeem_cancel", { ref: `redemption:${id}`, memo: `교환 취소 — ${row.item_label}` });
  }
  return { ok: true, status };
}

export async function creditStats() {
  const issued = (await one("SELECT COALESCE(SUM(delta), 0) AS n FROM credit_ledger WHERE delta > 0"))?.n || 0;
  const spent = (await one("SELECT COALESCE(SUM(-delta), 0) AS n FROM credit_ledger WHERE delta < 0"))?.n || 0;
  const pendingRedemptions = (await one("SELECT COUNT(*) AS n FROM redemptions WHERE status = 'requested'"))?.n || 0;
  return { issued, spent, outstanding: issued - spent, outstandingKrw: (issued - spent) * CREDIT_KRW, pendingRedemptions };
}
