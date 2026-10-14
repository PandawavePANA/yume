// 민재 — 경영지원팀장. 돈과 약속을 챙긴다.
//   · 입금 확인 요청 — 계약·감사 신청이 오면 "○○원 들어왔나요?" 결재를 올린다(은행 앱은 대표만 볼 수 있다).
//     승인하면 입금 처리 → 감사 주문은 감사 데스크에 건이 생기고 고객에게 확인 메일이 간다(b2bApi.confirmPayment).
//   · 유료 감사 보고서 발송 — 재확인이 끝난 유료 감사는 보고서 링크를 고객에게 보내는 결재를 올린다(마감일 함께).
//   · 견적 안부(견적만 받고 3일) · 입금 안내(신청 후 영업일 2일) — 각 1회. 자동 모드면 근무 시간에 바로 보낸다.
import { all } from "../../db.js";
import { AUDIT_RATES } from "../../apiRates.js";
import { auditDetail, reportPath, shareReport } from "../../auditDesk.js";
import { isAuditProduct, parseBilling, quoteById, quoteNumber } from "../../b2bDeals.js";
import { markDelivered, roundsOf } from "../../workList.js";
import { addBusinessDays, kstDate } from "../../businessDays.js";
import { COMPANY } from "../../renderPages.js";
import { base, htmlOf } from "./sales.js";

const DAY = 86_400_000;
const won = (n) => `${Number(n).toLocaleString("ko-KR")}원`;
const productLabel = (q) => AUDIT_RATES[q.product]?.label || { starter: "API 스타터", growth: "API 그로스", metered: "API 종량제" }[q.product] || q.product;
const quoteUrl = (q) => `${base()}/b2b/quote/${q.token}`;
const bank = () => String(process.env.B2B_BANK_ACCOUNT || "").trim();

export async function run(ctx) {
  const notes = [];
  const t = Date.now();

  // ① 입금(계약) 확인 요청
  for (const q of await all("SELECT * FROM b2b_quotes WHERE status = 'requested' ORDER BY id ASC")) {
    const dedupe = `paid:quote:${q.id}`;
    if (await ctx.hasProposal(dedupe)) continue;
    const b = parseBilling(q) || {};
    const metered = q.product === "metered";
    const card = q.pay_method === "card";
    await ctx.propose({
      kind: "confirm_payment",
      title: metered ? `계약 확인 — ${b.bizName || q.company} (종량제)` : `입금 확인 — ${b.bizName || q.company} ${won(q.total_krw)}`,
      summary: [
        `${productLabel(q)} · 합계 ${won(q.total_krw)} (공급가 ${won(q.supply_krw)}) · ${quoteNumber(q)}`,
        metered
          ? "종량제는 후불이라 입금할 것이 없습니다. 승인하면 계약이 확정되고 고객 키에 월 한도가 걸립니다."
          : card
            ? "법인카드 결제를 골랐습니다. 결제 링크를 보내고 결제가 끝나면 승인하세요."
            : `${bank() || "계좌"}로 입금자명 '${quoteNumber(q)}' 또는 '${b.bizName || q.company}' 입금을 확인하고 승인하세요.`,
        isAuditProduct(q.product) ? "승인하면 감사 데스크에 감사 건이 생기고, 보고서 마감(영업일 3일)이 잡히며, 고객에게 확인 메일이 갑니다." : "",
      ].filter(Boolean).join("\n"),
      payload: { quoteId: Number(q.id) },
      ref: `quote:${q.id}`,
      dedupe,
    });
    await ctx.notify(`[유메 결재] ${metered ? "계약 확인" : "입금 확인"} — ${b.bizName || q.company} ${won(q.total_krw)}`, `${productLabel(q)} 신청이 왔습니다. 확인 후 결재해 주세요.\n${base()}/admin/staff`);
    await ctx.log(`${b.bizName || q.company} ${metered ? "계약" : "입금"} 확인 결재를 올렸어요`, { ref: `quote:${q.id}` });
    notes.push(`${q.company} 입금 확인 요청`);
  }

  // ② 유료 감사 보고서 발송
  for (const q of await all("SELECT * FROM b2b_quotes WHERE status = 'paid' AND audit_id IS NOT NULL ORDER BY due_at ASC")) {
    if (!isAuditProduct(q.product) || Number(q.rounds_done || 0) >= roundsOf(q)) continue;
    const round = Number(q.rounds_done || 0) + 1;
    const dedupe = `deliver:quote:${q.id}:${round}`;
    if (await ctx.hasProposal(dedupe)) continue;
    const d = await auditDetail(q.audit_id, { base: base() });
    if (!d || !d.results.reviewComplete || !d.results.answered) {
      if (q.due_at && Number(q.due_at) < t + DAY) await ctx.log(`${q.company} 감사 마감 임박(${kstDate(q.due_at)}) — 아직 재확인 전`, { level: "warn", ref: `quote:${q.id}` });
      continue;
    }
    const b = parseBilling(q) || {};
    // 대표가 결재 전에 읽을 비공개 보고서 링크(고객에게는 승인 뒤에만 나간다).
    const share = await shareReport(q.audit_id);
    if (share.error) {
      await ctx.log(`${q.company} 보고서 링크를 만들지 못했어요`, { level: "warn", detail: share.error, ref: `quote:${q.id}` });
      continue;
    }
    const reportUrl = `${base()}${reportPath(share.token)}`;
    const issues = d.findings.filter((f) => f.polarity === "issue" && f.review === "confirmed").length;
    await ctx.propose({
      kind: "deliver_report",
      title: `보고서 발송 — ${b.bizName || q.company}${roundsOf(q) > 1 ? ` (${round}/${roundsOf(q)}회차)` : ""}`,
      summary: `유료 감사 보고서를 고객에게 보냅니다. 답변 ${d.results.answered}개 · 확정 오류 ${issues}건 · 마감 ${q.due_at ? kstDate(q.due_at) : "-"}\n받는 사람: ${b.taxEmail || q.email}`,
      payload: { quoteId: Number(q.id), auditId: Number(q.audit_id), to: q.email || b.taxEmail, round, reportUrl },
      ref: `quote:${q.id}`,
      dedupe,
    });
    await ctx.notify(`[유메 결재] 보고서 발송 — ${b.bizName || q.company}`, `유료 감사 보고서가 준비됐습니다. 결재하면 고객에게 나갑니다.\n${base()}/admin/staff`);
    await ctx.log(`${q.company} 보고서 발송 결재를 올렸어요`, { ref: `quote:${q.id}` });
    notes.push(`${q.company} 보고서 발송 기안`);
  }

  // ③ 견적 안부 1회 — 견적만 받고 3일, 아직 유효한 것
  for (const q of await all("SELECT * FROM b2b_quotes WHERE status = 'issued' AND reminded_at IS NULL AND email IS NOT NULL AND created_at <= :c AND valid_until > :t ORDER BY id ASC LIMIT 10", { c: t - 3 * DAY, t })) {
    const mail = quoteReminder(q);
    await sendOrPropose(ctx, { kind: "quote_reminder", q, mail, column: "reminded_at", title: `견적 안부 — ${q.company}`, dedupe: `remind:quote:${q.id}` });
  }

  // ④ 입금 안내 1회 — 계좌이체 신청 후 영업일 2일
  for (const q of await all("SELECT * FROM b2b_quotes WHERE status = 'requested' AND pay_method = 'transfer' AND product <> 'metered' AND pay_reminded_at IS NULL ORDER BY id ASC LIMIT 10")) {
    if (addBusinessDays(Number(q.requested_at), 2) > t) continue;
    const mail = payReminder(q);
    await sendOrPropose(ctx, { kind: "pay_reminder", q, mail, column: "pay_reminded_at", title: `입금 안내 — ${q.company}`, dedupe: `payremind:quote:${q.id}` });
  }
  return { note: notes.length ? notes.join(" · ") : "챙길 주문 없음" };
}

async function sendOrPropose(ctx, { kind, q, mail, column, title, dedupe }) {
  if (await ctx.hasProposal(dedupe)) return;
  const payload = { quoteId: Number(q.id), to: mail.to, subject: mail.subject, body: mail.body, column };
  if (ctx.autonomy === "auto" && ctx.businessHours()) {
    const r = await sendCustomerMail(payload, {}, ctx.deps);
    await ctx.log(r.ok ? `${q.company}에 ${title.split(" — ")[0]} 메일을 보냈어요 (자동)` : `${q.company} 메일 실패: ${r.result}`, { level: r.ok ? "info" : "warn", ref: `quote:${q.id}` });
    return;
  }
  await ctx.propose({ kind, title, summary: `받는 사람: ${mail.to}\n제목: ${mail.subject}\n\n${mail.body}`, payload, ref: `quote:${q.id}`, dedupe });
  await ctx.log(`${q.company} ${title.split(" — ")[0]} 메일을 기안했어요`, { ref: `quote:${q.id}` });
}

export function quoteReminder(q) {
  return {
    to: q.email,
    subject: `[유메] 견적서 ${quoteNumber(q)} 관련해 궁금한 점이 있으신가요`,
    body: `${q.company} ${q.contact_name ? `${q.contact_name}님` : "담당자님"}, 유메 ${COMPANY.ceo}입니다.\n\n며칠 전 받아 가신 견적서(${productLabel(q)})와 관련해 궁금하신 점이 있으면 이 메일에 답장 주세요. 범위나 일정 조정도 함께 이야기할 수 있습니다.\n\n견적서: ${quoteUrl(q)}\n\n감사합니다.\n${COMPANY.ceo} 드림`,
  };
}

export function payReminder(q) {
  const b = parseBilling(q) || {};
  return {
    to: b.taxEmail || q.email,
    subject: `[유메] 입금 계좌 안내 — 견적 ${quoteNumber(q)}`,
    body: `${b.bizName || q.company} 담당자님, 유메 ${COMPANY.ceo}입니다.\n\n신청해 주신 ${productLabel(q)}(합계 ${won(q.total_krw)})의 입금 계좌를 다시 안내드립니다.\n입금 계좌: ${bank() || "(별도 안내)"}\n입금자명: ${quoteNumber(q)} 또는 회사명\n\n입금이 확인되면 전자세금계산서를 발급하고${isAuditProduct(q.product) ? " 영업일 기준 1~3일 안에 감사 보고서를 보내" : " 바로 이용을 시작하실 수 있게 해"} 드립니다. 이미 입금하셨다면 이 메일은 넘기셔도 됩니다.\n\n진행 상태: ${quoteUrl(q)}\n\n${COMPANY.ceo} 드림`,
  };
}

// ── 결재 승인 후 실행 ────────────────────────────────────────────────
export async function sendCustomerMail(payload, input = {}, deps = {}) {
  const to = String(input.to || payload.to || "").trim();
  if (!to) return { ok: false, result: "받는 사람이 없어요." };
  await deps.sendMail({ brand: "YUME", to, replyTo: COMPANY.email, subject: payload.subject, text: payload.body, html: htmlOf(payload.body) });
  if (payload.column === "reminded_at" || payload.column === "pay_reminded_at") {
    const { run } = await import("../../db.js");
    await run(`UPDATE b2b_quotes SET ${payload.column} = :t WHERE id = :id`, { id: payload.quoteId, t: Date.now() });
  }
  return { ok: true, result: `${to}로 보냄` };
}

export async function confirmPaid(payload, _input, deps = {}) {
  const r = await deps.confirmPayment(payload.quoteId);
  if (r.error) return { ok: false, result: r.error };
  if (r.already) return { ok: true, result: "이미 입금 확인된 주문" };
  const q = r.quote;
  return { ok: true, result: `${q.product === "metered" ? "계약 확정" : "입금 확인"}${r.auditId ? ` · 감사 #${r.auditId} 생성 · 마감 ${kstDate(q.due_at)}` : ""}${r.applied?.key ? ` · 키 한도 ${r.applied.quota}건` : ""}` };
}

export async function deliverReport(payload, input = {}, deps = {}) {
  const q = await quoteById(payload.quoteId);
  if (!q) return { ok: false, result: "주문을 찾을 수 없어요." };
  const s = await shareReport(payload.auditId);
  if (s.error) return { ok: false, result: s.error };
  const d = await auditDetail(payload.auditId, { base: base() });
  const to = String(input.to || payload.to || "").trim();
  if (!to) return { ok: false, result: "받는 사람이 없어요." };
  const b = parseBilling(q) || {};
  const body = `${b.bizName || q.company} 담당자님, 유메 ${COMPANY.ceo}입니다.\n\n의뢰하신 ${productLabel(q)} 보고서를 보내 드립니다.\n\n감사 보고서: ${d.reportUrl}\n\n답변 ${d.results.answered}개를 법령 원문과 대조했고, 사람이 공식 원문으로 다시 확인한 결과만 담았습니다. 보고서는 귀사에만 드리는 비공개 링크이며, 회수를 원하시면 알려 주세요.\n궁금하신 점은 이 메일에 답장 주시면 원문과 함께 설명드리겠습니다.\n\n감사합니다.\n${COMPANY.ceo} 드림`;
  await deps.sendMail({ brand: "YUME", to, replyTo: COMPANY.email, subject: `[유메] 감사 보고서 — ${quoteNumber(q)}`, text: body, html: htmlOf(body) });
  const m = await markDelivered(q.id);
  return m.error ? { ok: false, result: `보냈지만 전달 처리 실패: ${m.error}` } : { ok: true, result: `${to}로 보고서 보냄${m.finished ? "" : " · 다음 회차는 한 분기 뒤"}` };
}
