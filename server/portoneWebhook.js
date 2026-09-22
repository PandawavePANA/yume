// 포트원 웹훅 — 결제 상태가 바뀌면 포트원이 이 주소로 알려 준다.
//
// 이게 없으면 가상계좌 입금은 사용자가 화면을 다시 열어야 크레딧이 들어오고, 결제 취소·환불은
// 아무도 모르게 지나간다. 결제창이 돌아오는 길(사용자 화면)과 이 길은 같은 정산 함수를 쓰므로
// 두 번 들어와도 크레딧은 한 번만 들어간다.
//
// 서명을 반드시 확인한다. 이 주소는 공개돼 있어서, 확인하지 않으면 누구나 "결제됐다"고 보내
// 크레딧을 받아 갈 수 있다. 포트원 공식 SDK가 Standard Webhooks 규격으로 검증한다.
//   PORTONE_WEBHOOK_SECRET — 포트원 콘솔 → 결제 연동 → 웹훅에서 발급(whsec_...)
import express from "express";
import { Webhook } from "@portone/server-sdk";
import { patchAsync } from "./asyncExpress.js";
import { audit } from "./audit.js";
import { getOrder, reverseOrder, settleOrder } from "./checkoutStore.js";
import { quoteByPaymentId, reverseQuote, settleQuote } from "./quoteCheckout.js";
import { logError } from "./errorLog.js";
import { clientIp } from "./security.js";

const router = patchAsync(express.Router());

// 서명은 원문 그대로에 대해 계산된다. JSON으로 파싱한 뒤 다시 문자열로 만들면 공백·순서가
// 달라져 검증이 깨지므로, 이 경로만 원문을 그대로 받는다.
router.post("/portone/webhook", express.raw({ type: "*/*", limit: "256kb" }), async (req, res) => {
  const secret = process.env.PORTONE_WEBHOOK_SECRET;
  if (!secret) return res.status(503).json({ error: "webhook not configured" });

  const raw = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : String(req.body || "");
  let event;
  try {
    event = await Webhook.verify(secret, raw, req.headers);
  } catch (e) {
    logError("portone:webhook-verify", new Error(`${e.message} :: ip ${clientIp(req)}`));
    return res.status(400).json({ error: "invalid signature" });
  }

  // 포트원이 30초 안에 응답을 기대한다. 처리에 실패해도 재시도는 포트원이 하므로,
  // 우리 쪽 오류는 기록만 남기고 상태 코드로 알린다.
  try {
    const type = String(event?.type || "");
    const paymentId = event?.data?.paymentId;
    if (!paymentId) return res.json({ ok: true, ignored: type });

    // 결제는 두 갈래다 — 유메 크레딧/요금제와, 리머 사이트에서 보낸 견적.
    // 주문번호가 어느 쪽 표에 있는지로 갈린다.
    const order = await getOrder(String(paymentId));
    if (!order) {
      const quote = await quoteByPaymentId(String(paymentId));
      if (!quote) return res.json({ ok: true, ignored: "unknown order" });

      if (type === "Transaction.Paid") {
        // 웹훅이 알려 준 번호가 기준이다. 결제창을 다시 연 경우 표에는 나중 번호가
        // 남아 있어서, 표를 믿으면 실제로 들어온 결제를 확인할 수 없다.
        const r = await settleQuote(quote, { paymentId: String(paymentId) });
        if (r.ok && !r.already) {
          await audit(`thread:${quote.thread_id}`, "quote_paid", `quote:${quote.id}`, { via: "webhook", amount: r.amount }, "portone");
        }
        return res.json({ ok: true });
      }
      if (type === "Transaction.Cancelled" || type === "Transaction.PartialCancelled") {
        // 부분 취소도 전액을 되돌린다. 견적은 쪼개 팔지 않으므로 절반만 돌려줄 대상이 없고,
        // 남은 금액은 사람이 보고 다시 청구해야 하는 종류의 일이다.
        const r = await reverseQuote(quote, { memo: type === "Transaction.PartialCancelled" ? "결제 부분 취소" : "결제 취소" });
        if (r.ok && !r.already) {
          await audit(`thread:${quote.thread_id}`, "quote_refunded", `quote:${quote.id}`, { via: "webhook" }, "portone");
        }
        return res.json({ ok: true });
      }
      return res.json({ ok: true, ignored: type });
    }

    if (type === "Transaction.Paid") {
      const r = await settleOrder(order);
      if (r.ok && !r.already) {
        await audit(`user:${order.user_id}`, "credit_purchased", `order:${order.payment_id}`, { via: "webhook", credits: r.credits }, "portone");
      }
      return res.json({ ok: true });
    }

    if (type === "Transaction.Cancelled" || type === "Transaction.PartialCancelled") {
      // 부분 취소도 지급분 전체를 되돌린다. 크레딧은 쪼개 팔지 않으므로 절반만 돌려줄 대상이 없다.
      const r = await reverseOrder(order, { memo: type === "Transaction.PartialCancelled" ? "결제 부분 취소" : "결제 취소" });
      if (r.ok && !r.already) {
        await audit(`user:${order.user_id}`, "credit_purchase_cancelled", `order:${order.payment_id}`, { via: "webhook", credits: r.credits }, "portone");
      }
      return res.json({ ok: true });
    }

    return res.json({ ok: true, ignored: type });
  } catch (e) {
    logError("portone:webhook", e);
    return res.status(500).json({ error: "internal" });
  }
});

export default router;
