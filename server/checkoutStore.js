// 크레딧 주문 정산. 결제창이 돌아온 뒤(사용자 화면)와 포트원 웹훅(서버 간 통신) 두 곳에서
// 같은 함수를 부른다. 두 길로 같은 결제가 들어와도 크레딧은 한 번만 들어가야 하므로,
// 지급 여부는 주문 상태를 조건으로 건 UPDATE가 성공했는지로만 판단한다.
import { now, one, run } from "./db.js";
import { grant } from "./credits.js";
import { confirmPayment } from "./portone.js";
import { logError } from "./errorLog.js";
import { sendMail } from "./mailer.js";
import { COMPANY } from "./renderPages.js";

// 결제 완료 안내.
//
// 「전자상거래 등에서의 소비자보호에 관한 법률」 제13조는 계약 내용을 적은 서면을
// 주도록 하고 있고, 카드사·PG 심사도 이걸 확인한다. 화면에 한 번 보여 주는 것과
// 나중에 다시 꺼내 볼 수 있는 기록이 남는 것은 다르다.
//
// 이 메일은 실패해도 결제를 되돌리지 않는다. 돈은 이미 받았고 크레딧도 이미 들어갔다 —
// 메일이 안 갔다고 그걸 없던 일로 만들면 훨씬 큰 사고다. 그래서 기다리지 않고 보내고,
// 실패는 기록만 남긴다.
function sendReceipt(order, { method, planExpiresAt }) {
  (async () => {
    const user = await one("SELECT email, name FROM users WHERE id = :id", { id: order.user_id });
    if (!user?.email) return;

    const won = (n) => `${Number(n || 0).toLocaleString("ko-KR")}원`;
    const when = new Date(now()).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
    const item = order.kind === "plan"
      ? `유메 ${order.plan} 플랜 1개월 이용권`
      : `유메 크레딧 ${Number(order.credits || 0).toLocaleString("ko-KR")}개`;
    const until = planExpiresAt
      ? new Date(planExpiresAt).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })
      : null;

    const rows = [
      ["상품", item],
      ["결제 금액", `${won(order.amount)} (부가세 포함)`],
      ["결제 수단", method || "카드"],
      ["결제 일시", when],
      ["주문번호", order.payment_id],
      order.kind === "plan" && until ? ["이용 기간", `${until}까지 · 자동 갱신되지 않습니다`] : null,
    ].filter(Boolean);

    const esc = (v) => String(v).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
    const seller = [
      `상호 ${COMPANY.name}`,
      `대표 ${COMPANY.ceo}`,
      `사업자등록번호 ${COMPANY.regNo}`,
      COMPANY.mailOrderNo ? `통신판매업 신고 ${COMPANY.mailOrderNo}` : null,
      `주소 ${COMPANY.address}`,
      `전화 ${COMPANY.tel}`,
      `이메일 ${COMPANY.email}`,
    ].filter(Boolean).join(" · ");

    await sendMail({
      to: user.email,
      subject: `[유메] 결제가 완료되었습니다 · ${item}`,
      text: [
        `${user.name ? user.name + "님, " : ""}결제가 완료되었습니다.`,
        "",
        ...rows.map(([k, v]) => `${k}: ${v}`),
        "",
        "청약철회는 결제일부터 7일 이내에 가능합니다. 다만 이미 사용한 크레딧은",
        "전자상거래법 제17조 제2항 제5호에 따라 청약철회가 제한됩니다.",
        `환불 문의: ${COMPANY.email}`,
        "환불정책: https://www.yume-reamer.com/refund",
        "",
        seller,
      ].join("\n"),
      html: `<div style="font-family:system-ui,-apple-system,'Noto Sans KR',sans-serif;max-width:560px;color:#241F33;line-height:1.7">
  <p style="margin:0 0 6px;font-size:13px;color:#8577A8">유메 YUME</p>
  <h2 style="margin:0 0 18px;font-size:19px">결제가 완료되었습니다</h2>
  <table style="border-collapse:collapse;font-size:14px;width:100%">
    ${rows.map(([k, v]) => `<tr><td style="padding:7px 14px 7px 0;color:#8577A8;white-space:nowrap">${esc(k)}</td><td style="padding:7px 0"><b>${esc(v)}</b></td></tr>`).join("")}
  </table>
  <p style="margin:20px 0 0;font-size:13px;color:#54505E">
    청약철회는 결제일부터 <b>7일 이내</b>에 가능합니다. 다만 이미 사용한 크레딧은
    전자상거래법 제17조 제2항 제5호에 따라 청약철회가 제한됩니다.<br/>
    환불 문의 <a href="mailto:${esc(COMPANY.email)}">${esc(COMPANY.email)}</a> ·
    <a href="https://www.yume-reamer.com/refund">환불정책</a>
  </p>
  <p style="margin:18px 0 0;padding-top:14px;border-top:1px solid #E6DAF6;font-size:11.5px;color:#8577A8">${esc(seller)}</p>
</div>`,
    });
  })().catch((e) => logError("checkout:receipt", e));
}

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

  if (order.kind === "plan") {
    // 요금제는 1개월 이용권으로 판다. 남은 기간이 있으면 그 뒤에 붙인다 — 미리 사 둔 기간을
    // 결제 한 번으로 날리면 안 된다.
    const user = await one("SELECT plan, plan_expires_at FROM users WHERE id = :id", { id: order.user_id });
    const from = user?.plan === order.plan && user?.plan_expires_at > now() ? user.plan_expires_at : now();
    const until = from + 30 * 24 * 3600 * 1000;
    await run("UPDATE users SET plan = :plan, plan_expires_at = :until WHERE id = :id", {
      plan: order.plan,
      until,
      id: order.user_id,
    });
    // 이번 달 지급분은 검증을 시작할 때 ensureMonthlyGrant가 요금제 기준으로 넣는다.
    sendReceipt(order, { method: r.method, planExpiresAt: until });
    return { ok: true, plan: order.plan, planExpiresAt: until, method: r.method };
  }

  await grant(order.user_id, order.credits, "purchase", {
    ref: `purchase:${order.payment_id}`,
    memo: `크레딧 구매(${r.method})`,
  });
  sendReceipt(order, { method: r.method });
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

  if (order.kind === "plan") {
    // 요금제 결제가 취소되면 이 결제로 늘려 준 30일을 도로 깎는다. 남은 기간이 지금보다
    // 이르면 요금제를 바로 닫는다.
    const user = await one("SELECT plan_expires_at FROM users WHERE id = :id", { id: order.user_id });
    const until = Math.max(0, (user?.plan_expires_at || 0) - 30 * 24 * 3600 * 1000);
    if (until > now()) await run("UPDATE users SET plan_expires_at = :until WHERE id = :id", { until, id: order.user_id });
    else await run("UPDATE users SET plan = 'free', plan_expires_at = NULL WHERE id = :id", { id: order.user_id });
    return { ok: true, plan: order.plan };
  }
  await grant(order.user_id, -order.credits, "purchase_cancelled", {
    ref: `cancel:${order.payment_id}`,
    memo,
  });
  return { ok: true, credits: order.credits };
}
