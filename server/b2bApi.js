// 기업 견적·계약 신청 API.
//
//   POST /api/b2b/quote                 — 기업용 페이지의 "견적서 바로 받기"(공개 단가 상품만)
//   POST /api/b2b/quote/:token/request  — 견적서 화면의 계약 신청(세금계산서 정보·결제 방법·동의)
//   /api/admin/b2b/*                    — 운영자: 목록, 데스크 견적 발행, 입금 확인, 취소
//
// 기업용 페이지는 다른 도메인(business.)에도 배포되므로 견적 발행은 문의 API와 같은 허용목록으로 받는다.
// 계약 신청은 견적서 화면(같은 출처)에서만 오고, 추측할 수 없는 견적 토큰이 곧 열쇠다.
// 접수는 DB가 먼저이고 메일은 그다음이다 — 메일이 실패해도 신청은 남아 있다(inquiryApi와 같은 이유).
import { Router } from "express";
import { clientIp, createLimiter, limitMiddleware, crossOriginGate } from "./security.js";
import { requireAdmin } from "./adminApi.js";
import { audit as auditLog } from "./audit.js";
import { mailConfigured, sendMail } from "./mailer.js";
import { logError } from "./errorLog.js";
import { COMPANY, esc } from "./renderPages.js";
import {
  PAY_METHODS,
  STATUS_LABEL,
  cancelQuote,
  createQuote,
  hometaxBlock,
  isExpired,
  listQuotes,
  markPaid,
  parseBilling,
  quoteById,
  quoteNumber,
  requestContract,
} from "./b2bDeals.js";
import { productLabel } from "./renderB2bPages.js";
import { canIssueTaxInvoice, taxInvoiceFrom } from "./receiptInfo.js";

// 일반과세 시작 전(간이과세 기간)에는 세금계산서를 발급할 수 없다 — 운영자 안내에 붙인다.
const taxNote = (at = Date.now()) =>
  canIssueTaxInvoice(at)
    ? ""
    : `\n※ 일반과세 시작(${new Date(taxInvoiceFrom() + 9 * 3600_000).toISOString().slice(0, 10)}) 전 공급분은 세금계산서를 발급할 수 없습니다 — 지출증빙 현금영수증(위 사업자번호)으로 대신 발급하고 고객에게 알려 주세요.`;

export const b2bRouter = Router();
export const b2bAdminRouter = Router();

const PUBLIC = () => (process.env.PUBLIC_BASE_URL || "https://www.yume-reamer.com").replace(/\/+$/, "");
export const quoteUrl = (q) => `${PUBLIC()}/b2b/quote/${q.token}`;
const ownerMail = () => process.env.B2B_TO || process.env.INQUIRY_TO || process.env.COMPANY_EMAIL || "reamer@d-reamer.com";
const won = (n) => `${Number(n).toLocaleString("ko-KR")}원`;

const cors = crossOriginGate("B2B_ALLOWED_ORIGINS", "INQUIRY_ALLOWED_ORIGINS", "AUDIT_ALLOWED_ORIGINS");
b2bRouter.options("/b2b/quote", cors);

// 사람이 쓰는 양식이다. 견적을 몇 번 다시 뽑아 보는 건 정상이라 문의보다 조금 넉넉하게.
const quoteLimiter = createLimiter({ windowMs: 60 * 60 * 1000, max: 20 });
const requestLimiter = createLimiter({ windowMs: 60 * 60 * 1000, max: 10 });

function mailSafe(p) {
  if (!mailConfigured()) return;
  sendMail({ brand: "YUME", ...p }).catch((e) => logError("b2b:mail", e));
}

function quoteMailHtml(q, lead) {
  return `<div style="font-family:system-ui,sans-serif;line-height:1.7;color:#1d1a24;font-size:14.5px">
    <p style="margin:0 0 12px">${lead}</p>
    <table style="border-collapse:collapse;font-size:14px">
      <tr><td style="padding:3px 14px 3px 0;color:#857e98">견적번호</td><td><b>${esc(quoteNumber(q))}</b></td></tr>
      <tr><td style="padding:3px 14px 3px 0;color:#857e98">품목</td><td>${esc(productLabel(q.product))}</td></tr>
      <tr><td style="padding:3px 14px 3px 0;color:#857e98">합계</td><td><b>${won(q.total_krw)}</b> (공급가액 ${won(q.supply_krw)} + 부가세 ${won(q.vat_krw)})</td></tr>
    </table>
    <p style="margin:16px 0"><a href="${quoteUrl(q)}" style="display:inline-block;padding:11px 18px;border-radius:10px;background:#6b4fa8;color:#fff;text-decoration:none;font-weight:700">견적서 열기</a></p>
    <p style="margin:0;font-size:12.5px;color:#857e98">견적서 화면에서 인쇄·PDF 저장과 계약 신청을 할 수 있습니다. 문의: ${esc(COMPANY.email)} · ${esc(COMPANY.tel)}</p>
  </div>`;
}

b2bRouter.post("/b2b/quote", cors, limitMiddleware(quoteLimiter, (req) => `b2bq:${clientIp(req)}`), async (req, res) => {
  // 보이지 않는 칸 — 봇이면 된 것처럼 답하고 아무것도 하지 않는다.
  if (String(req.body?.website || "").trim()) return res.status(201).json({ ok: true, url: null });
  const r = await createQuote({
    product: String(req.body?.product || ""),
    qty: req.body?.qty,
    company: req.body?.company,
    contactName: req.body?.name,
    email: req.body?.email,
    phone: req.body?.phone,
    note: req.body?.note,
    source: "self",
    ip: clientIp(req),
  });
  if (r.error) return res.status(400).json({ error: r.error });
  const q = r.quote;
  res.status(201).json({ ok: true, url: quoteUrl(q), number: quoteNumber(q), total: q.total_krw });

  mailSafe({
    to: q.email,
    replyTo: COMPANY.email,
    subject: `[유메] 견적서 ${quoteNumber(q)} — ${productLabel(q.product)}`,
    text: `${q.company} ${q.contact_name || ""}님, 요청하신 견적서입니다.\n\n견적번호 ${quoteNumber(q)}\n합계 ${won(q.total_krw)} (부가세 포함)\n\n${quoteUrl(q)}\n\n견적서 화면에서 인쇄·PDF 저장과 계약 신청을 할 수 있습니다.`,
    html: quoteMailHtml(q, `${esc(q.company)} ${esc(q.contact_name || "")}님, 요청하신 견적서입니다.`),
  });
  mailSafe({
    to: ownerMail(),
    replyTo: q.email,
    subject: `[유메 견적 발행] ${q.company} · ${productLabel(q.product)} · ${won(q.total_krw)}`,
    text: `${q.company} / ${q.contact_name || "-"} / ${q.email}\n${productLabel(q.product)} · 합계 ${won(q.total_krw)}\n${quoteUrl(q)}${q.note ? `\n\n메모: ${q.note}` : ""}`,
  });
});

b2bRouter.post("/b2b/quote/:token/request", limitMiddleware(requestLimiter, (req) => `b2br:${clientIp(req)}`), async (req, res) => {
  const r = await requestContract(req.params.token, req.body || {}, { ip: clientIp(req) });
  if (r.error) return res.status(r.status || 400).json({ error: r.error });
  const q = r.quote;
  res.json({ ok: true, status: q.status });
  if (r.already) return;

  const b = parseBilling(q) || {};
  mailSafe({
    to: ownerMail(),
    replyTo: b.taxEmail || q.email,
    subject: `[유메 계약 신청] ${b.bizName || q.company} · ${won(q.total_krw)} · ${PAY_METHODS[q.pay_method] || ""}`,
    text: `${hometaxBlock(q)}${taxNote()}\n\n견적서: ${quoteUrl(q)}\n운영 화면: ${PUBLIC()}/admin/deals`,
  });
  const to = b.taxEmail || q.email;
  if (to) {
    mailSafe({
      to,
      replyTo: COMPANY.email,
      subject: `[유메] 계약 신청 접수 — 견적 ${quoteNumber(q)}`,
      text: `${b.bizName || q.company}의 계약 신청이 접수됐습니다.\n견적번호 ${quoteNumber(q)} · 합계 ${won(q.total_krw)}\n결제 방법: ${PAY_METHODS[q.pay_method]}\n\n진행 상태: ${quoteUrl(q)}`,
      html: quoteMailHtml(q, `${esc(b.bizName || q.company)}의 계약 신청이 접수됐습니다. 결제 방법: ${esc(PAY_METHODS[q.pay_method])}. 다음 단계는 견적서 화면에 안내돼 있습니다.`),
    });
  }
});

// ── 운영자 ──
b2bAdminRouter.use("/b2b", requireAdmin);
const log = (req, action, target, detail = null) =>
  Promise.resolve(auditLog(req.adminActor || "admin", action, target, detail, clientIp(req))).catch((e) => logError("b2b:audit", e));

const view = (q) => ({
  ...q,
  number: quoteNumber(q),
  url: quoteUrl(q),
  productLabel: productLabel(q.product),
  statusLabel: STATUS_LABEL[q.status] || q.status,
  payLabel: PAY_METHODS[q.pay_method] || null,
  billing: parseBilling(q),
  hometax: q.billing_json ? hometaxBlock(q) + taxNote(Number(q.requested_at) || Date.now()) : null,
  expired: isExpired(q),
  token: undefined,
  items_json: undefined,
  billing_json: undefined,
});

b2bAdminRouter.get("/b2b/quotes", async (req, res) => {
  const rows = await listQuotes();
  res.json({ quotes: rows.map(view) });
});

// 감사 데스크·관리자가 범위를 듣고 금액을 정해 내는 견적(감사·PoC·맞춤 물량, 또는 공개 상품 대리 발행).
b2bAdminRouter.post("/b2b/quotes", async (req, res) => {
  const r = await createQuote({
    product: String(req.body?.product || ""),
    qty: req.body?.qty,
    items: req.body?.items,
    company: req.body?.company,
    contactName: req.body?.name,
    email: req.body?.email,
    note: req.body?.note,
    source: "desk",
    auditId: req.body?.auditId || null,
    ip: clientIp(req),
  });
  if (r.error) return res.status(400).json({ error: r.error });
  log(req, "b2b.quote.create", `b2b_quote:${r.quote.id}`, { auditId: r.quote.audit_id, total: r.quote.total_krw });
  res.status(201).json({ quote: view(r.quote) });
});

b2bAdminRouter.post("/b2b/quotes/:id/paid", async (req, res) => {
  const r = await markPaid(req.params.id, { applyQuota: req.body?.applyQuota !== false });
  if (r.error) return res.status(400).json({ error: r.error });
  log(req, "b2b.quote.paid", `b2b_quote:${r.quote.id}`, { applied: r.applied });
  res.json({ quote: view(r.quote), applied: r.applied, already: Boolean(r.already) });
  if (!r.already) {
    const b = parseBilling(r.quote) || {};
    const to = b.taxEmail || r.quote.email;
    if (to) {
      mailSafe({
        to,
        replyTo: COMPANY.email,
        subject: `[유메] ${r.quote.product === "metered" ? "계약 확정" : "입금 확인"} — 견적 ${quoteNumber(r.quote)}`,
        text: `${r.quote.product === "metered" ? "계약이 확정됐습니다." : "입금이 확인됐습니다."} 전자세금계산서는 ${to}로 발급됩니다.\n${r.applied?.key ? `API 키(${r.applied.key}…)의 월 한도를 ${r.applied.quota.toLocaleString("ko-KR")}회로 설정했습니다.\n` : ""}\n${quoteUrl(r.quote)}`,
      });
    }
  }
});

b2bAdminRouter.post("/b2b/quotes/:id/cancel", async (req, res) => {
  const r = await cancelQuote(req.params.id);
  if (r.error) return res.status(400).json({ error: r.error });
  log(req, "b2b.quote.cancel", `b2b_quote:${r.quote.id}`);
  res.json({ quote: view(r.quote) });
});

export { quoteById };
