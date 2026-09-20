// 크레딧 주문 정산. 결제창이 돌아온 뒤(사용자 화면)와 포트원 웹훅(서버 간 통신) 두 곳에서
// 같은 함수를 부른다. 두 길로 같은 결제가 들어와도 크레딧은 한 번만 들어가야 하므로,
// 지급 여부는 주문 상태를 조건으로 건 UPDATE가 성공했는지로만 판단한다.
import { now, one, run } from "./db.js";
import { grant } from "./credits.js";
import { confirmPayment } from "./portone.js";
import { logError } from "./errorLog.js";

export function getOrder(paymentId, userId = null) {
  return userId == null
    ? one("SELECT * FROM credit_orders WHERE payment_id = :id", { id: paymentId })
    : one("SELECT * FROM credit_orders WHERE payment_id = :id AND user_id = :uid", { id: paymentId, uid: userId });
}

/**
 * 결제를 포트원에 확인하고, 처음 확인된 경우에만 크레딧을 지급한다.
 * 반환: { ok, credits, already, code, message }
 */
export async function settleOrder(order) {
  if (!order) return { ok: false, code: "NOT_FOUND", message: "주문을 찾을 수 없어요." };
  if (order.status === "paid") return { ok: true, credits: order.credits, already: true };

  const r = await confirmPayment(order.payment_id, order.amount);
  if (!r.ok) {
    if (r.code !== "AWAITING_DEPOSIT") {
      await run("UPDATE credit_orders SET status = 'failed' WHERE payment_id = :id AND status = 'pending'", { id: order.payment_id });
      logError("portone:confirm", new Error(`${r.code} :: ${r.message} :: order ${order.payment_id}`));
    }
    return { ok: false, code: r.code, message: r.message };
  }

  // 여기가 유일한 지급 지점이다. 상태가 pending일 때만 paid로 바뀌고, 그 갱신에 성공한 쪽만 지급한다.
  const upd = await run(
    "UPDATE credit_orders SET status = 'paid', method = :m, paid_at = :t WHERE payment_id = :id AND status = 'pending'",
    { id: order.payment_id, m: r.method, t: now() },
  );
  if (!upd.changes) return { ok: true, credits: order.credits, already: true };
  await grant(order.user_id, order.credits, "purchase", {
    ref: `purchase:${order.payment_id}`,
    memo: `크레딧 구매(${r.method})`,
  });
  return { ok: true, credits: order.credits, method: r.method };
}

/**
 * 결제가 취소·환불된 경우. 지급했던 크레딧을 원장에서 되돌린다.
 * 이미 써 버린 뒤라면 잔액이 음수가 될 수 있는데, 그대로 둔다 — 쓴 만큼은 실제로 나간 비용이라
 * 없던 일로 만들 수 없고, 음수를 감추면 장부가 사실과 달라진다.
 */
export async function reverseOrder(order, { memo = "결제 취소" } = {}) {
  if (!order || order.status !== "paid") return { ok: false, code: "NOT_PAID" };
  const upd = await run("UPDATE credit_orders SET status = 'cancelled' WHERE payment_id = :id AND status = 'paid'", {
    id: order.payment_id,
  });
  if (!upd.changes) return { ok: true, already: true };
  await grant(order.user_id, -order.credits, "purchase_cancelled", {
    ref: `cancel:${order.payment_id}`,
    memo,
  });
  return { ok: true, credits: order.credits };
}
