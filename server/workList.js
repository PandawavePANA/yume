// 대표 작업 리스트 — 돈이 들어왔거나 들어올 일 중에서 "지금 대표가 손을 대야 하는 것"만 모은다.
//
// 2026-10-14 대표: "기업이 들어가서 바로 결제하고 감사 리스트에 이름 올려놓게, 영업일 1~3일 소요라고 해 두고
// 내 작업 리스트 하나 만들자." 그래서 감사 상품은 사이트에서 바로 사고(견적서 → 계약 신청 → 입금), 신청하는
// 순간 이 리스트에 이름이 올라온다. 입금을 확인하면 감사 데스크에 그 회사 감사 건이 생기고, 마감(입금 확인 +
// 영업일 3일, b2bDeals.markPaid의 due_at)이 붙는다.
//
// 따로 표를 두지 않고 b2b_quotes에서 계산한다 — 상태가 두 군데에 있으면 반드시 어긋난다.
import { all, now, run } from "./db.js";
import { AUDIT_RATES } from "./apiRates.js";
import { createAudit, updateAudit } from "./auditDesk.js";
import { isAuditProduct, parseBilling, parseOrder, quoteById, quoteNumber } from "./b2bDeals.js";
import { businessDaysUntil, kstDate } from "./businessDays.js";

const DAY = 86_400_000;
// 정기 감사 다음 회차 — 지난 보고서 전달일에서 한 분기 뒤.
const QUARTER = 91 * DAY;

export const roundsOf = (q) => {
  if (q.product === "audit_regular") {
    try {
      return Math.max(1, Number(JSON.parse(q.items_json || "[]")[0]?.qty) || 1);
    } catch {
      return 1;
    }
  }
  return AUDIT_RATES[q.product]?.rounds || 1;
};

/**
 * 입금 확인된 감사 주문을 감사 데스크에 올린다(한 번만). 고객이 의뢰한 감사라 약관 확인은 "문제없음"으로,
 * 단계는 "검사 중"으로 시작한다 — 영업용(먼저 감사하고 보내는) 건과 같은 데스크에서 같은 도구로 일한다.
 */
export async function ensureAuditForQuote(quoteId) {
  const q = await quoteById(quoteId);
  if (!q || !isAuditProduct(q.product) || q.status !== "paid") return null;
  if (q.audit_id) return Number(q.audit_id);
  const o = parseOrder(q) || {};
  const b = parseBilling(q) || {};
  const made = await createAudit({
    company: b.bizName || q.company,
    service_name: o.serviceName || q.company,
    service_url: o.serviceUrl || "",
    domain: o.domain === "범용" ? "범용" : o.domain || "법률",
    contact_name: q.contact_name || b.contactName || "",
    contact_email: q.email || b.taxEmail || "",
    found_via: `유료 주문 ${quoteNumber(q)}`,
  });
  if (made.error) return null;
  const notes = [
    `[유료 주문 ${quoteNumber(q)}] ${AUDIT_RATES[q.product]?.label || q.product} · 마감 ${q.due_at ? kstDate(q.due_at) : "-"}`,
    o.access ? `접근 방법: ${o.access}` : null,
    o.focus ? `걱정하는 부분: ${o.focus}` : null,
  ].filter(Boolean).join("\n");
  await updateAudit(made.id, { tos_verdict: "ok", tos_note: `고객 의뢰 감사(유료 주문 ${quoteNumber(q)}) — 고객이 감사를 맡김`, needs: notes });
  const t = now();
  await run("UPDATE ai_audits SET stage = 'testing', paid_amount_krw = :amt, paid_intent_at = COALESCE(paid_intent_at, :t), updated_at = :t WHERE id = :id", {
    id: made.id,
    amt: Number(q.supply_krw),
    t,
  });
  // 동시에 두 번 눌러도 감사 건이 하나만 연결되게 비어 있을 때만 채운다.
  const linked = await run("UPDATE b2b_quotes SET audit_id = :aid, updated_at = :t WHERE id = :id AND audit_id IS NULL", { aid: made.id, id: q.id, t });
  if (!linked.changes) {
    await run("DELETE FROM ai_audits WHERE id = :id", { id: made.id });
    return Number((await quoteById(q.id)).audit_id);
  }
  return made.id;
}

/** 보고서를 보냈다. 정기 감사는 회차를 하나 올리고 다음 마감을 한 분기 뒤로 잡는다. */
export async function markDelivered(quoteId) {
  const q = await quoteById(quoteId);
  if (!q) return { error: "주문을 찾을 수 없어요." };
  if (!isAuditProduct(q.product)) return { error: "감사 주문이 아니에요." };
  if (q.status !== "paid") return { error: "입금 확인 전 주문이에요." };
  const total = roundsOf(q);
  const done = Number(q.rounds_done || 0);
  if (done >= total) return { error: "이미 모든 회차의 보고서를 보냈어요." };
  const t = now();
  const next = done + 1 < total ? t + QUARTER : null;
  await run("UPDATE b2b_quotes SET rounds_done = :d, delivered_at = :t, due_at = COALESCE(:next, due_at), updated_at = :t WHERE id = :id", {
    id: q.id,
    d: done + 1,
    t,
    next,
  });
  return { quote: await quoteById(q.id), finished: done + 1 >= total };
}

const won = (n) => `${Number(n).toLocaleString("ko-KR")}원`;

function card(q, at) {
  const o = parseOrder(q) || {};
  const b = parseBilling(q) || {};
  const total = roundsOf(q);
  const done = Number(q.rounds_done || 0);
  return {
    id: Number(q.id),
    number: quoteNumber(q),
    url: `/b2b/quote/${q.token}`,
    company: b.bizName || q.company,
    product: q.product,
    productLabel: AUDIT_RATES[q.product]?.label || q.product,
    total_krw: Number(q.total_krw),
    supply_krw: Number(q.supply_krw),
    contact: [q.contact_name, q.email].filter(Boolean).join(" · "),
    service: o.serviceName || "",
    serviceUrl: o.serviceUrl || "",
    domain: o.domain || "",
    access: o.access || "",
    focus: o.focus || "",
    payMethod: q.pay_method || null,
    requested_at: Number(q.requested_at) || null,
    paid_at: Number(q.paid_at) || null,
    due_at: Number(q.due_at) || null,
    dueLabel: q.due_at ? kstDate(q.due_at) : null,
    daysLeft: q.due_at ? businessDaysUntil(q.due_at, at) : null,
    overdue: q.due_at ? Number(q.due_at) < at : false,
    audit_id: q.audit_id ? Number(q.audit_id) : null,
    rounds: total,
    roundsDone: done,
    waitingDays: q.requested_at ? Math.floor((at - Number(q.requested_at)) / DAY) : null,
    totalLabel: won(q.total_krw),
  };
}

/**
 * 작업 리스트.
 *   now      — 입금 확인된 감사 중 보고서를 아직 안 보낸 것(마감 빠른 순). 정기 감사는 다음 회차가 2주 안이면.
 *   pay      — 계약 신청이 와서 입금(또는 카드 결제 링크)을 기다리는 것. 감사·API 모두.
 *   later    — 정기 감사의 다음 회차(2주 넘게 남음).
 *   quoted   — 견적서만 받아 간 곳(최근 30일). 연락해 볼 후보.
 *   done     — 최근 보고서를 보낸 감사(30일).
 */
export async function workList(at = now()) {
  const rows = await all("SELECT * FROM b2b_quotes WHERE status <> 'cancelled' ORDER BY id DESC LIMIT 500");
  const out = { now: [], pay: [], later: [], quoted: [], done: [] };
  for (const q of rows) {
    const audit = isAuditProduct(q.product);
    if (q.status === "requested") {
      out.pay.push({ ...card(q, at), kind: audit ? "audit" : "api", productLabel: audit ? AUDIT_RATES[q.product].label : q.product });
      continue;
    }
    if (q.status === "issued") {
      if (Number(q.created_at) >= at - 30 * DAY && Number(q.valid_until) >= at) out.quoted.push({ ...card(q, at), kind: audit ? "audit" : "api" });
      continue;
    }
    if (q.status !== "paid" || !audit) continue;
    const c = card(q, at);
    if (c.roundsDone < c.rounds) {
      if (c.roundsDone === 0 || (c.due_at && c.due_at - at <= 14 * DAY)) out.now.push(c);
      else out.later.push(c);
    } else if (q.delivered_at && Number(q.delivered_at) >= at - 30 * DAY) {
      out.done.push(c);
    }
  }
  out.now.sort((a, b) => (a.due_at || Infinity) - (b.due_at || Infinity));
  out.later.sort((a, b) => (a.due_at || Infinity) - (b.due_at || Infinity));
  out.pay.sort((a, b) => (a.requested_at || 0) - (b.requested_at || 0));
  return out;
}

/** 관리자 상단 숫자(작업 리스트 배지). */
export async function workCounts(at = now()) {
  const w = await workList(at);
  return { now: w.now.length, overdue: w.now.filter((c) => c.overdue).length, pay: w.pay.length };
}

