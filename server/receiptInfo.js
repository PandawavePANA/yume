// 계좌이체 거래의 증빙 정보 — 세금계산서 또는 현금영수증.
//
// 대표가 세무사 없이 홈택스에서 직접 발급한다(2026-10-13 결정). 그래서 받는 값은 홈택스 발급 화면의
// 칸 그대로이고, 발급할 때 옮겨 적는 텍스트 블록을 함께 만든다. 카드 결제는 매출전표가 증빙이라
// 여기를 거치지 않는다(이중 발급 금지).
//
// 리머는 간이과세자로 개업했다가 간이과세 포기를 신고했다 — 일반과세가 시작되기 전 공급분은 세금계산서를
// 발급할 수 없다(신규 간이과세자). 그 기간에 기업이 증빙을 원하면 지출증빙 현금영수증으로 대신한다.
// 시작일은 TAX_INVOICE_FROM(YYYY-MM-DD, 한국 시간)으로 바꿀 수 있다.
import { formatBizNo, validBizNo } from "./b2bDeals.js";

export const RECEIPT_KINDS = {
  tax: "전자세금계산서 (사업자)",
  cash_personal: "현금영수증 — 소득공제용 (개인)",
  cash_business: "현금영수증 — 지출증빙용 (사업자)",
  none: "증빙 필요 없음",
};

const clean = (v, max) => String(v ?? "").trim().slice(0, max);
const looksEmail = (v) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);
const digits = (v) => String(v ?? "").replace(/\D/g, "");

/** 일반과세(세금계산서 발급 가능) 시작 시각. */
export function taxInvoiceFrom() {
  const d = String(process.env.TAX_INVOICE_FROM || "2026-11-01");
  const t = Date.parse(`${d}T00:00:00+09:00`);
  return Number.isFinite(t) ? t : 0;
}
export const canIssueTaxInvoice = (t = Date.now()) => t >= taxInvoiceFrom();

/** 증빙 정보를 검사하고 정리한다. 반환: { info } 또는 { error } */
export function readReceipt(body) {
  const kind = RECEIPT_KINDS[body?.kind] ? body.kind : "";
  if (!kind) return { error: "증빙 종류를 골라 주세요." };
  if (kind === "tax") {
    const info = {
      kind,
      bizNo: formatBizNo(clean(body?.bizNo, 20)),
      bizName: clean(body?.bizName, 100),
      ceo: clean(body?.ceo, 60),
      taxEmail: clean(body?.taxEmail, 200),
      address: clean(body?.address, 200),
    };
    if (!validBizNo(info.bizNo)) return { error: "사업자등록번호를 다시 확인해 주세요(10자리, 검증번호 불일치)." };
    if (!info.bizName) return { error: "상호(사업자등록증의 이름)를 입력해 주세요." };
    if (!info.ceo) return { error: "대표자 성명을 입력해 주세요." };
    if (!looksEmail(info.taxEmail)) return { error: "세금계산서를 받을 이메일을 정확히 입력해 주세요." };
    return { info };
  }
  if (kind === "cash_personal") {
    const phone = digits(body?.cashId);
    if (phone.length < 10 || phone.length > 11) return { error: "현금영수증을 받을 휴대폰 번호를 정확히 입력해 주세요." };
    return { info: { kind, cashId: phone } };
  }
  if (kind === "cash_business") {
    const no = formatBizNo(clean(body?.cashId, 20));
    if (!validBizNo(no)) return { error: "사업자등록번호를 다시 확인해 주세요(10자리, 검증번호 불일치)." };
    return { info: { kind, cashId: no } };
  }
  return { info: { kind } };
}

/** 부가세 포함 금액 → 공급가액(반올림)·세액(나머지). 합계가 늘 원래 금액과 같다. */
export function splitVat(total) {
  const supply = Math.round(Number(total) / 1.1);
  return { supply, vat: Number(total) - supply };
}

/** 운영자에게 보내는, 홈택스에 그대로 옮겨 적는 순서의 텍스트. */
export function receiptBlock(info, { title, totalKrw, ref, at = Date.now() }) {
  const won = (n) => `${Number(n).toLocaleString("ko-KR")}원`;
  const { supply, vat } = splitVat(totalKrw);
  if (!info || info.kind === "none") return `[증빙] 필요 없음 · ${ref} · ${won(totalKrw)}`;
  if (info.kind === "tax") {
    return [
      `[전자세금계산서 발급 정보 · ${ref}]`,
      `공급받는자 등록번호: ${info.bizNo}`,
      `상호: ${info.bizName}`,
      `성명(대표자): ${info.ceo}`,
      info.address ? `사업장 주소: ${info.address}` : null,
      `이메일: ${info.taxEmail}`,
      `품목: ${title}`,
      `공급가액: ${won(supply)} / 세액: ${won(vat)} / 합계: ${won(totalKrw)}`,
      "※ 입금 확인 후 '영수'로 발급. 작성일자는 공급시기(대금을 받기로 한 날 또는 납품일).",
      canIssueTaxInvoice(at) ? null : `※ 일반과세 시작(${new Date(taxInvoiceFrom() + 9 * 3600_000).toISOString().slice(0, 10)}) 전 공급분은 세금계산서를 발급할 수 없습니다 — 지출증빙 현금영수증(사업자번호 ${info.bizNo})으로 대신 발급하고 고객에게 알려 주세요.`,
    ].filter(Boolean).join("\n");
  }
  return [
    `[현금영수증 발급 정보 · ${ref}]`,
    `용도: ${info.kind === "cash_personal" ? "소득공제(개인)" : "지출증빙(사업자)"}`,
    `식별번호: ${info.cashId}`,
    `거래금액: ${won(totalKrw)} (공급가액 ${won(supply)} + 부가세 ${won(vat)})`,
    "※ 홈택스 → 현금영수증 발급(건별). 입금 확인한 날 발급.",
  ].join("\n");
}
