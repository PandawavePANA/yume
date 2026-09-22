// 견적 결제 정산.
//
// 크레딧 결제(checkoutStore.js)와 같은 원칙으로 돌아간다. 브라우저가 "결제됐다"고
// 보내온 값은 믿지 않는다 — 결제창은 의뢰인 브라우저에서 뜨고, 그 결과가 우리 서버로
// 오는 길에 금액을 바꿀 수 있다. 서버가 포트원에 직접 물어보고, 우리가 적어 둔 견적
// 금액과 실제 결제 금액이 같을 때만 완료로 넘긴다.
//
// 지급(여기서는 "완료 처리")은 상태가 sent일 때만 통과하는 UPDATE 한 줄에서만 일어난다.
// 결제창이 돌아오는 길과 포트원 웹훅이 같은 결제를 두 번 들고 와도, 프로젝트 매출은
// 한 번만 올라간다.
import { now, one, run } from "./db.js";
import { confirmPayment } from "./portone.js";
import { logError } from "./errorLog.js";
import { addMessage, mailQuoteReceipt, threadById, won } from "./threads.js";
import { randomToken } from "./security.js";

// 포트원 주문번호. 견적 번호를 주문번호 안에 박아 둔다 — 콘솔에서 어디서 온 결제인지
// 바로 보이고, 아래 quoteForPayment가 이 번호만으로 견적을 되찾을 수 있다.
const PID = /^reamer_q(\d+)_/;
export const newPaymentId = (quoteId) => `reamer_q${quoteId}_${randomToken(8)}`;

/**
 * 주문번호로 견적을 찾는다.
 *
 * 표에 적힌 주문번호와 정확히 맞는 것이 우선이다. 맞지 않으면 번호에 박아 둔 견적
 * 번호로 되찾는다 — 이 길이 필요한 이유가 있다. 결제창을 닫았다가 다시 열면 주문번호를
 * 새로 발급하는데(포트원은 쓴 번호를 다시 받지 않는다), 의뢰인이 **먼저 연 창**에서
 * 결제를 마치면 표에는 나중 번호만 남아 있다. 그때 정확 일치만 보면 진짜 들어온 돈을
 * "모르는 주문"으로 흘려보내게 된다.
 */
export async function quoteByPaymentId(paymentId) {
  const p = String(paymentId);
  const exact = await one("SELECT * FROM thread_quotes WHERE payment_id = :p", { p });
  if (exact) return exact;
  const m = PID.exec(p);
  if (!m) return null;
  return (await one("SELECT * FROM thread_quotes WHERE id = :id", { id: Number(m[1]) })) || null;
}

/**
 * 결제를 포트원에 확인하고, 처음 확인된 경우에만 완료로 옮긴다.
 *
 * paymentId를 넘기면 그 번호로 확인한다(웹훅이 알려 준 번호가 표에 적힌 것보다 정확한
 * 경우). 금액 대조는 어느 쪽이든 우리가 적어 둔 견적 금액으로만 한다.
 * 반환: { ok, already, code, message }
 */
export async function settleQuote(quote, { paymentId } = {}) {
  if (!quote) return { ok: false, code: "NOT_FOUND", message: "견적을 찾을 수 없어요." };
  if (quote.status === "paid") return { ok: true, already: true };
  if (quote.status === "cancelled") return { ok: false, code: "CANCELLED", message: "취소된 견적이에요." };
  const pid = paymentId || quote.payment_id;
  if (!pid) return { ok: false, code: "NOT_STARTED", message: "결제가 시작되지 않았어요." };

  const r = await confirmPayment(pid, quote.amount_krw);
  if (!r.ok) {
    if (r.code !== "AWAITING_DEPOSIT") {
      logError("quote:confirm", new Error(`${r.code} :: ${r.message} :: quote ${quote.id}`));
    }
    return { ok: false, code: r.code, message: r.message };
  }

  // 여기가 유일한 완료 지점이다. 실제로 결제된 주문번호를 함께 적어 둔다 —
  // 영수증과 장부에 남는 번호가 포트원에 있는 번호와 달라지면 나중에 대조할 수 없다.
  const upd = await run(
    "UPDATE thread_quotes SET status = 'paid', method = :m, payment_id = :p, paid_at = :t, updated_at = :t WHERE id = :id AND status = 'accepted'",
    { id: quote.id, m: r.method, p: pid, t: now() },
  );
  if (!upd.changes) return { ok: true, already: true };

  const fresh = await one("SELECT * FROM thread_quotes WHERE id = :id", { id: quote.id });
  const thread = await threadById(quote.thread_id);

  // 받은 돈은 일감에 붙는다. 보드의 총 매출은 projects.paid_krw의 합이라,
  // 여기에 올려 두지 않으면 사이트로 들어온 결제가 매출에 잡히지 않는다.
  await attachToProject(thread, fresh).catch((e) => logError("quote:project", e));

  await addMessage(
    quote.thread_id,
    "system",
    `결제가 완료되었습니다 · ${won(fresh.amount_krw)} (${fresh.method || "카드"})`,
    { kind: "paid", quoteId: quote.id },
  ).catch((e) => logError("quote:message", e));

  if (thread) mailQuoteReceipt(thread, fresh);
  return { ok: true, method: r.method, amount: fresh.amount_krw };
}

/**
 * 결제가 취소·환불된 경우. 일감에 올려 둔 금액을 도로 내린다.
 *
 * 견적 상태는 'refunded'로 남긴다 — 'sent'로 되돌리면 의뢰인 화면에 결제 버튼이
 * 다시 나타나, 환불받은 건을 또 결제할 수 있는 상태가 된다.
 */
export async function reverseQuote(quote, { memo = "결제 취소" } = {}) {
  if (!quote || quote.status !== "paid") return { ok: false, code: "NOT_PAID" };
  const upd = await run(
    "UPDATE thread_quotes SET status = 'refunded', updated_at = :t WHERE id = :id AND status = 'paid'",
    { id: quote.id, t: now() },
  );
  if (!upd.changes) return { ok: true, already: true };

  const thread = await threadById(quote.thread_id);
  if (thread?.project_id) {
    await run(
      "UPDATE projects SET paid_krw = GREATEST(0, paid_krw - :amt), updated_at = :t WHERE id = :id",
      { amt: Number(quote.amount_krw || 0), t: now(), id: thread.project_id },
    ).catch((e) => logError("quote:reverse-project", e));
  }
  await addMessage(quote.thread_id, "system", `${memo} · ${won(quote.amount_krw)}`, {
    kind: "refunded",
    quoteId: quote.id,
  }).catch(() => {});
  return { ok: true };
}

/**
 * 결제된 견적을 일감(projects)에 잇는다. 일감이 없으면 만든다.
 *
 * 돈이 들어왔는데 보드에 일감이 없는 상태를 남기지 않으려는 것이다. 결제는 일을
 * 시작한다는 뜻이고, 시작한 일은 보드에 있어야 한다.
 */
async function attachToProject(thread, quote) {
  if (!thread) return;
  const amount = Number(quote.amount_krw || 0);
  const t = now();

  if (thread.project_id) {
    const p = await one("SELECT * FROM projects WHERE id = :id", { id: thread.project_id });
    if (p) {
      const paid = Number(p.paid_krw || 0) + amount;
      await run(
        `UPDATE projects SET paid_krw = :paid, amount_krw = GREATEST(amount_krw, :paid),
           status = CASE WHEN status = 'lead' THEN 'active' ELSE status END,
           started_at = COALESCE(started_at, :t), updated_at = :t
         WHERE id = :id`,
        { paid, t, id: p.id },
      );
      return;
    }
  }

  const row = await run(
    `INSERT INTO projects (title, client, contact, kind, status, amount_krw, paid_krw, progress, started_at, note, inquiry_id, created_at, updated_at)
     VALUES (:title, :client, :contact, :kind, 'active', :amt, :amt, 0, :t, :note, :iid, :t, :t) RETURNING id`,
    {
      title: String(thread.title || quote.title || "새 일감").slice(0, 120),
      client: thread.client_name,
      contact: thread.client_contact,
      kind: "사이트 결제",
      amt: amount,
      note: quote.detail || null,
      iid: thread.inquiry_id,
      t,
    },
  );
  const id = row.rows[0]?.id;
  if (id) await run("UPDATE threads SET project_id = :pid, updated_at = :t WHERE id = :id", { pid: id, t, id: thread.id });
}
