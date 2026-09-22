// 의뢰인 쪽 API — 리머 사이트(별도 도메인)에서 부른다.
//
// 인증은 스레드 토큰 하나다. 계정도 쿠키도 없다. 그래서 두 가지를 지킨다.
//
//  1. 토큰은 **URL에 넣지 않는다.** 경로에 넣으면 프록시·서버 접속 로그에 그대로 남고,
//     로그를 볼 수 있는 사람은 누구나 남의 대화를 열 수 있게 된다. 헤더로 받는다.
//  2. 쿠키를 쓰지 않으므로 Access-Control-Allow-Credentials도 붙지 않는다. 이 라우터는
//     쿠키 세션 미들웨어(attachUser·sameOriginGuard)보다 **앞에** 얹혀야 한다.
//
// 교차 출처 관문은 반드시 경로마다 붙인다. router.use()로 달면 같은 /api 아래 다른
// 라우터의 프리플라이트까지 이 허용목록으로 판단해, 남의 양식이 조용히 죽는다.
import { Router } from "express";
import { patchAsync } from "./asyncExpress.js";
import { clientIp, createLimiter, limitMiddleware, crossOriginGate } from "./security.js";
import { now, one, run } from "./db.js";
import { logError } from "./errorLog.js";
import { COMPANY } from "./renderPages.js";
import { STORE_ID, CHANNEL_KEY, paymentConfigured } from "./portone.js";
import { newPaymentId, settleQuote } from "./quoteCheckout.js";
import { progressFor } from "./threadProgress.js";
import {
  addMessage,
  listMessages,
  listQuotes,
  mailOwnerNewClientMessage,
  mailOwnerQuoteAccepted,
  mailThreadLink,
  markRead,
  normalizeEmail,
  rotateToken,
  threadByToken,
  won,
} from "./threads.js";

export const threadRouter = patchAsync(Router());

// 문의 양식과 같은 허용목록을 쓴다. 두 기능 모두 리머 사이트에서만 부른다.
const cors = crossOriginGate("INQUIRY_ALLOWED_ORIGINS", "AUDIT_ALLOWED_ORIGINS");

const readLimiter = createLimiter({ windowMs: 60_000, max: 120 });
const writeLimiter = createLimiter({ windowMs: 10 * 60 * 1000, max: 25 });
const payLimiter = createLimiter({ windowMs: 10 * 60 * 1000, max: 12 });
const resendLimiter = createLimiter({ windowMs: 60 * 60 * 1000, max: 5 });
// 토큰을 찍어 맞히려는 시도. 32바이트 토큰은 사실상 맞힐 수 없지만, 틀린 토큰이
// 쏟아지는 것 자체가 신호라 문을 닫아 둔다.
const missLimiter = createLimiter({ windowMs: 60 * 60 * 1000, max: 30 });

const clean = (v, max) => String(v ?? "").trim().slice(0, max);
const money = (v) => Math.max(0, Math.min(Math.floor(Number(v) || 0), 100_000_000_000));

/** 헤더에서 토큰을 꺼내 스레드를 찾는다. 없으면 응답까지 끝낸다. */
async function load(req, res) {
  const token = clean(req.get("x-thread-token") || req.body?.token, 200);
  const thread = token ? await threadByToken(token) : null;
  if (!thread) {
    if (!missLimiter(`thread-miss:${clientIp(req)}`).allowed) {
      res.status(429).json({ error: "요청이 너무 많아요. 잠시 후 다시 시도해주세요." });
      return null;
    }
    res.status(404).json({ error: "링크가 만료되었거나 올바르지 않아요.", code: "NO_THREAD" });
    return null;
  }
  return { thread, token };
}

const publicMessage = (m) => ({
  id: m.id,
  sender: m.sender,
  kind: m.kind,
  body: m.body,
  quoteId: m.quote_id,
  at: Number(m.created_at),
});

// 결제 수단·주문번호까지 의뢰인에게 보인다. 자기가 낸 돈의 기록이라 감출 이유가 없다.
const publicQuote = (q) => ({
  id: q.id,
  title: q.title,
  detail: q.detail,
  amount: Number(q.amount_krw || 0),
  weeks: q.weeks,
  status: q.status,
  method: q.method,
  paymentId: q.status === "paid" ? q.payment_id : null,
  paidAt: q.paid_at ? Number(q.paid_at) : null,
  expiresAt: q.expires_at ? Number(q.expires_at) : null,
  at: Number(q.created_at),
});

// ── 대화 읽기 ──────────────────────────────────────────────────────────
threadRouter.options("/thread", cors);
threadRouter.get("/thread", cors, limitMiddleware(readLimiter, (req) => `thread-read:${clientIp(req)}`), async (req, res) => {
  const found = await load(req, res);
  if (!found) return;
  const { thread } = found;
  const after = Math.max(0, Math.floor(Number(req.query.after) || 0));
  const [messages, quotes, progress] = await Promise.all([
    listMessages(thread.id, after),
    listQuotes(thread.id),
    progressFor(thread),
  ]);

  // 화면을 열어 두고 있으면 읽은 것으로 친다. 이 값이 데스크의 "답할 차례" 표시를 만든다.
  // 단, 읽을 것이 새로 있을 때만 쓴다 — 이 주소는 몇 초마다 다시 불리므로, 그냥 쓰면
  // 아무 일도 없는 화면이 계속 DB에 쓰기를 만든다.
  const unseen = messages.some((m) => m.sender === "reamer" && Number(m.created_at) > Number(thread.client_read_at || 0));
  if (unseen) await markRead(thread.id, "client").catch(() => {});

  res.json({
    thread: {
      title: thread.title,
      name: thread.client_name,
      status: thread.status,
      openedAt: Number(thread.created_at),
    },
    messages: messages.map(publicMessage),
    quotes: quotes.map(publicQuote),
    progress,
    // 결제창을 띄울 수 있는 상태인지. 반만 설정된 채로 버튼을 보여 주면,
    // 의뢰인은 눌렀는데 아무 일도 일어나지 않는 화면을 보게 된다.
    payable: paymentConfigured(),
    company: { name: COMPANY.name, email: COMPANY.email, tel: COMPANY.tel },
  });
});

// ── 말 남기기 ──────────────────────────────────────────────────────────
threadRouter.options("/thread/message", cors);
threadRouter.post(
  "/thread/message",
  cors,
  limitMiddleware(writeLimiter, (req) => `thread-write:${clientIp(req)}`),
  async (req, res) => {
    const found = await load(req, res);
    if (!found) return;
    const { thread } = found;
    if (thread.status === "closed") return res.status(409).json({ error: "종료된 대화예요. 새로 문의해주세요." });

    const body = clean(req.body?.body, 5000);
    if (!body) return res.status(400).json({ error: "내용을 입력해주세요." });

    const msg = await addMessage(thread.id, "client", body);
    res.status(201).json({ ok: true, message: publicMessage({ ...msg, sender: "client", kind: "text", body, quote_id: null }) });

    await mailOwnerNewClientMessage(thread, body).catch((e) => logError("thread:notify-owner", e));
  },
);

// ── 견적 확정 ──────────────────────────────────────────────────────────
//
// 결제 버튼을 견적 옆에 바로 두지 않는다. 금액을 보자마자 카드번호를 넣게 만드는
// 화면은, 그 금액에 무엇이 포함되는지를 읽지 않게 만든다. 확정을 한 번 거치게 하면
// 두 가지가 생긴다 — 의뢰인에게는 범위를 읽고 결정할 자리가, 우리에게는 돈이
// 움직이기 전에 "이 견적으로 가기로 했다"는 기록이 남는다.
//
// 결제 전이면 확정은 되돌릴 수 있다. 되돌릴 수 없는 결정을 한 번의 클릭으로
// 만들어 두면, 누르기 전에 물어보느라 오히려 하루가 간다.
threadRouter.options("/thread/quote/:id/accept", cors);
threadRouter.post(
  "/thread/quote/:id/accept",
  cors,
  limitMiddleware(writeLimiter, (req) => `thread-accept:${clientIp(req)}`),
  async (req, res) => {
    const found = await load(req, res);
    if (!found) return;
    const { thread } = found;
    const quote = await one("SELECT * FROM thread_quotes WHERE id = :id AND thread_id = :tid", {
      id: Math.floor(Number(req.params.id) || 0),
      tid: thread.id,
    });
    if (!quote) return res.status(404).json({ error: "견적을 찾을 수 없어요." });

    const undo = req.body?.accept === false;
    const from = undo ? "accepted" : "sent";
    const to = undo ? "sent" : "accepted";
    if (quote.status === "paid") return res.status(409).json({ error: "이미 결제가 완료된 건이에요.", code: "ALREADY_PAID" });
    if (quote.status !== from) return res.status(409).json({ error: "지금은 바꿀 수 없는 견적이에요." });
    if (!undo && quote.expires_at && Number(quote.expires_at) < now()) {
      return res.status(409).json({ error: "견적 유효기간이 지났어요. 대화로 말씀해주시면 다시 보내드리겠습니다." });
    }

    const upd = await run(
      "UPDATE thread_quotes SET status = :to, updated_at = :t WHERE id = :id AND status = :from",
      { to, from, t: now(), id: quote.id },
    );
    if (!upd.changes) return res.status(409).json({ error: "방금 상태가 바뀌었어요. 새로고침 후 다시 시도해주세요." });

    await addMessage(
      thread.id,
      "system",
      undo ? `견적 확정을 취소했습니다 · ${quote.title}` : `견적을 확정했습니다 · ${quote.title} · ${won(quote.amount_krw)}`,
      { kind: undo ? "quote" : "accepted", quoteId: quote.id },
    );
    res.json({ ok: true, status: to });

    mailOwnerQuoteAccepted(thread, quote, { undo });
  },
);

// ── 결제 ───────────────────────────────────────────────────────────────
//
// 금액은 서버가 들고 있는 견적에서만 온다. 브라우저가 보낸 금액은 쳐다보지 않는다.
threadRouter.options("/thread/quote/:id/checkout", cors);
threadRouter.post(
  "/thread/quote/:id/checkout",
  cors,
  limitMiddleware(payLimiter, (req) => `thread-pay:${clientIp(req)}`),
  async (req, res) => {
    const found = await load(req, res);
    if (!found) return;
    const { thread } = found;

    // 이 견적이 이 스레드의 것인지부터 본다. 결제 설정 여부를 먼저 보면, 연동이 꺼진
    // 동안에는 남의 견적을 물어도 똑같이 503이 나와 권한 문제가 설정 문제에 가려진다.
    const quote = await one("SELECT * FROM thread_quotes WHERE id = :id AND thread_id = :tid", {
      id: Math.floor(Number(req.params.id) || 0),
      tid: thread.id,
    });
    if (!quote) return res.status(404).json({ error: "견적을 찾을 수 없어요." });

    // 견적 자체의 상태를 결제 설정보다 **먼저** 본다. 순서를 바꾸면 연동이 꺼져 있는
    // 동안 모든 질문에 503이 돌아가, 권한·상태 문제가 설정 문제에 가려진다.
    if (quote.status === "paid") return res.status(409).json({ error: "이미 결제가 완료된 건이에요.", code: "ALREADY_PAID" });
    // 확정을 거치지 않은 견적은 결제창을 열지 않는다. 화면에서는 버튼 순서로 막지만,
    // 화면은 우회할 수 있으므로 서버에서도 같은 순서를 강제한다.
    if (quote.status === "sent") {
      return res.status(409).json({ error: "견적을 먼저 확정해주세요.", code: "NOT_ACCEPTED" });
    }
    if (quote.status !== "accepted") return res.status(409).json({ error: "지금은 결제할 수 없는 견적이에요." });
    if (quote.expires_at && Number(quote.expires_at) < now()) {
      return res.status(409).json({ error: "견적 유효기간이 지났어요. 대화로 말씀해주시면 다시 보내드리겠습니다." });
    }

    if (!paymentConfigured()) return res.status(503).json({ error: "결제가 아직 준비되지 않았어요. 잠시 후 다시 시도해주세요." });

    // 이니시스 V2는 구매자 이름·이메일·휴대폰이 없으면 결제창을 열지 않는다.
    const name = clean(req.body?.name, 60) || thread.client_name || "";
    const email = normalizeEmail(req.body?.email) || thread.client_email;
    const phone = clean(req.body?.phone, 20).replace(/\D/g, "");
    if (!name) return res.status(400).json({ error: "결제자 성함을 입력해주세요." });
    if (!email) return res.status(400).json({ error: "영수증을 받으실 이메일을 입력해주세요." });
    if (phone.length < 10) return res.status(400).json({ error: "휴대폰 번호를 정확히 입력해주세요." });

    // 결제창을 다시 여는 경우가 있다(창을 닫았거나 실패). 주문번호는 그때마다 새로 만든다 —
    // 포트원에서 한 번 쓴 주문번호는 다시 쓸 수 없다.
    const paymentId = newPaymentId(quote.id);
    await run(
      "UPDATE thread_quotes SET payment_id = :p, payer_name = :n, payer_email = :e, updated_at = :t WHERE id = :id AND status = 'accepted'",
      { p: paymentId, n: name, e: email, t: now(), id: quote.id },
    );

    res.json({
      storeId: STORE_ID,
      channelKey: CHANNEL_KEY,
      paymentId,
      orderName: String(quote.title).slice(0, 60),
      totalAmount: money(quote.amount_krw),
      currency: "CURRENCY_KRW",
      customer: { fullName: name, email, phoneNumber: phone },
    });
  },
);

threadRouter.options("/thread/quote/:id/confirm", cors);
threadRouter.post(
  "/thread/quote/:id/confirm",
  cors,
  limitMiddleware(payLimiter, (req) => `thread-confirm:${clientIp(req)}`),
  async (req, res) => {
    const found = await load(req, res);
    if (!found) return;
    const { thread } = found;
    const quote = await one("SELECT * FROM thread_quotes WHERE id = :id AND thread_id = :tid", {
      id: Math.floor(Number(req.params.id) || 0),
      tid: thread.id,
    });
    if (!quote) return res.status(404).json({ error: "견적을 찾을 수 없어요." });

    // 브라우저가 알려 준 주문번호가 우리가 발급한 것과 다르면 그대로 끝낸다.
    const claimed = clean(req.body?.paymentId, 120);
    if (claimed && claimed !== quote.payment_id) {
      return res.status(409).json({ error: "주문번호가 맞지 않아요. 새로고침 후 다시 시도해주세요." });
    }

    const r = await settleQuote(quote);
    if (!r.ok) {
      if (r.code === "AWAITING_DEPOSIT") return res.status(202).json({ code: r.code, message: r.message });
      return res.status(402).json({ error: r.message || "결제를 확인하지 못했어요.", code: r.code });
    }
    res.json({ ok: true, already: !!r.already, method: r.method });
  },
);

// ── 링크 재발급 ────────────────────────────────────────────────────────
//
// 메일을 지웠거나 링크를 잃은 사람을 위한 길. 이메일이 맞든 아니든 같은 답을 준다 —
// "그 주소로 의뢰가 있다/없다"를 알려 주면 남의 이메일을 넣어 확인해 볼 수 있다.
//
// 새 토큰을 발급하고 옛 토큰은 그 자리에서 죽는다. 해시만 저장하므로 옛 토큰을
// 다시 보내 줄 방법이 애초에 없고, 메일함이 털린 경우를 생각하면 바꾸는 쪽이 낫다.
threadRouter.options("/thread/resend", cors);
threadRouter.post(
  "/thread/resend",
  cors,
  limitMiddleware(resendLimiter, (req) => `thread-resend:${clientIp(req)}`),
  async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    res.json({ ok: true });
    if (!email) return;
    try {
      const row = await one(
        "SELECT * FROM threads WHERE client_email = :e AND status = 'open' ORDER BY updated_at DESC LIMIT 1",
        { e: email },
      );
      if (!row) return;
      const token = await rotateToken(row.id);
      mailThreadLink(row, token);
    } catch (e) {
      logError("thread:resend", e);
    }
  },
);
