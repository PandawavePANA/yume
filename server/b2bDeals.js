// 기업 견적 · 계약 신청 · 입금 확인.
//
// 기업 구매 담당자가 사려면 손에 쥐어야 하는 것이 있다 — 견적서(VAT 별도·유효기간·공급자 정보),
// 계약 조건, 데이터 처리 부속서, 그리고 세금계산서를 받을 정보를 적는 자리. 예전에는 이걸 대표가
// 문의마다 손으로 만들었다. 여기서는 사이트가 만든다.
//
//   견적(issued) ──계약 신청(고객)──▶ requested ──입금 확인(운영자)──▶ paid
//                                          └──────────취소(운영자)──────────▶ cancelled
//
// 금액은 서버만 정한다. 공개 요율이 있는 API 상품은 apiRates.js 표에서 계산하고, 감사·맞춤처럼
// 범위를 듣고 정하는 상품은 운영자(감사 데스크)만 금액을 넣어 견적을 낸다 — 고객 브라우저가 보낸
// 금액은 어디에도 쓰지 않는다.
//
// 세금계산서는 대표가 홈택스에서 직접 발급한다. 그래서 계약 신청 때 받는 값은 홈택스 건별 발급 화면의
// 칸과 같은 순서·이름으로 받고, 사업자등록번호는 검증번호까지 확인한다(틀린 번호로 발급하면
// 수정세금계산서를 다시 끊어야 한다).
import { now, one, run, all } from "./db.js";
import { API_RATES, AUDIT_LEAD_DAYS, AUDIT_ORDER_DOMAINS, AUDIT_PILOT_SEATS, AUDIT_RATES } from "./apiRates.js";
import { randomToken } from "./security.js";
import { addBusinessDays } from "./businessDays.js";

export const VAT_RATE = 0.1;
export const QUOTE_VALID_DAYS = 30;
// 계약 신청 때 동의받는 조건의 판. 문서(/b2b/terms·/b2b/dpa)를 고치면 함께 올린다 — 누가 어느 판에
// 동의했는지 남아야 나중에 다툴 일이 없다.
export const TERMS_VERSION = "B2B-2026-10-14";
const DAY = 86_400_000;

const tier = (key) => API_RATES.tiers.find((t) => t.key === key);

// 사이트에서 고객이 직접 견적을 받을 수 있는 상품 — 단가가 공개된 것만.
export const SELF_PRODUCTS = {
  starter: { label: `베리라인 검증 API ${tier("starter").label}`, spec: `월 ${tier("starter").calls.toLocaleString("ko-KR")}회`, unit: "개월", unitKrw: tier("starter").monthlyKrw, min: 1, max: 12, step: 1 },
  growth: { label: `베리라인 검증 API ${tier("growth").label}`, spec: `월 ${tier("growth").calls.toLocaleString("ko-KR")}회`, unit: "개월", unitKrw: tier("growth").monthlyKrw, min: 1, max: 12, step: 1 },
  // 종량제는 후불이다 — 견적의 수량은 "예상 월 호출 수"이고, 실제 사용량으로 매달 정산한다. 계약을 확정하면
  // 그 예상 물량을 월 상한으로 걸어 둔다(예상을 크게 넘는 청구가 고객 모르게 쌓이지 않게).
  metered: { label: "베리라인 검증 API 종량제 (후불 월 정산)", spec: "예상 월 건수(1,000자마다 1건) · 실제 사용량으로 정산", unit: "건", unitKrw: API_RATES.metered.unitKrw, min: 100, max: 100_000, step: 100 },
  // AI 감사 — 2026-10-14부터 사이트에서 바로 산다(정가 공개). 감사할 서비스 정보(order)를 같이 받는다.
  ...Object.fromEntries(Object.entries(AUDIT_RATES).map(([k, a]) => [k, { label: a.label, spec: a.spec, unit: a.unit, unitKrw: a.krw, min: 1, max: k === "audit_regular" ? 4 : 1, step: 1, kind: "audit" }])),
};

export const isAuditProduct = (key) => Boolean(AUDIT_RATES[key]);

/** 파일럿 남은 자리 — 계약 신청·입금된 파일럿만 자리를 차지한다(견적만 받은 것은 아님). */
export async function pilotSeatsLeft({ exceptId = null } = {}) {
  const r = await one(
    "SELECT COUNT(*) AS n FROM b2b_quotes WHERE product = 'audit_pilot' AND status IN ('requested','paid') AND id <> :ex",
    { ex: Number(exceptId) || 0 },
  );
  return Math.max(0, AUDIT_PILOT_SEATS - Number(r?.n || 0));
}

/** 감사 주문서(감사할 서비스). 사람이 감사를 시작하려면 이것만 있으면 된다. */
export function readOrder(raw) {
  const serviceName = clean(raw?.serviceName, 120);
  let serviceUrl = clean(raw?.serviceUrl, 400);
  if (serviceUrl && !/^https?:\/\//i.test(serviceUrl)) serviceUrl = `https://${serviceUrl}`;
  const domain = AUDIT_ORDER_DOMAINS.includes(raw?.domain) ? raw.domain : "";
  const order = { serviceName, serviceUrl, domain, access: clean(raw?.access, 300), focus: clean(raw?.focus, 600) };
  if (!serviceName) return { error: "감사할 AI 서비스 이름을 입력해 주세요." };
  if (!/^https?:\/\/[^\s.]+\.[^\s]+/i.test(serviceUrl)) return { error: "감사할 서비스 주소(웹사이트·앱 링크)를 입력해 주세요." };
  if (!domain) return { error: "서비스 업종을 골라 주세요." };
  return { order };
}
export const parseOrder = (q) => {
  try {
    return q.order_json ? JSON.parse(q.order_json) : null;
  } catch {
    return null;
  }
};

// 범위를 듣고 운영자가 금액을 정하는 상품.
export const DESK_PRODUCTS = {
  audit: "AI 정밀 감사 (표본 감사 + 보고서 + 개선 회의 1회)",
  audit_regular: "AI 정기 감사 (분기 재감사 + 공개 감사 기록·배지)",
  poc: "2주 PoC (문서 검사 + 정확도 보고서)",
  custom: "맞춤",
};

export const PAY_METHODS = {
  transfer: "계좌이체 + 전자세금계산서",
  card: "법인카드 (결제 링크를 보내 드립니다)",
};

export const STATUS_LABEL = { issued: "견적 발행", requested: "계약 신청", paid: "입금 확인", cancelled: "취소" };

const clean = (v, max) => String(v ?? "").trim().slice(0, max);
const looksEmail = (v) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);
const intOf = (v) => (Number.isFinite(Number(v)) ? Math.floor(Number(v)) : NaN);

/** 공급가액 → 세액·합계. 세액은 원 미만 버림(홈택스 자동 계산과 같다). */
export function totals(items) {
  const supply = items.reduce((s, it) => s + it.amountKrw, 0);
  const vat = Math.floor(supply * VAT_RATE);
  return { supply, vat, total: supply + vat };
}

/** 공개 단가 상품의 견적 품목. 수량이 범위를 벗어나면 오류 문장을 돌려준다. */
export function priceSelf(product, qty) {
  const p = SELF_PRODUCTS[product];
  if (!p) return { error: "사이트에서 바로 견적을 받을 수 있는 상품이 아니에요." };
  // 수량이 하나뿐인 상품(감사 1회)은 수량을 안 보내도 1로 본다.
  const n = qty == null && p.min === p.max ? p.min : intOf(qty);
  if (!Number.isFinite(n) || n < p.min || n > p.max) {
    return { error: `수량은 ${p.min.toLocaleString("ko-KR")}~${p.max.toLocaleString("ko-KR")}${p.unit} 사이로 입력해 주세요.` };
  }
  if (n % p.step) return { error: `수량은 ${p.step.toLocaleString("ko-KR")}${p.unit} 단위로 입력해 주세요.` };
  const items = [{ name: p.label, spec: p.spec, qty: n, unit: p.unit, unitKrw: p.unitKrw, amountKrw: p.unitKrw * n }];
  return { items, ...totals(items) };
}

/** 운영자가 정한 품목(감사·맞춤). 금액이 0 이하이거나 이름이 없으면 받지 않는다. */
export function priceDesk(rawItems) {
  const items = (Array.isArray(rawItems) ? rawItems : [])
    .slice(0, 10)
    .map((it) => {
      const qty = intOf(it.qty ?? 1);
      const unitKrw = intOf(it.unitKrw);
      return { name: clean(it.name, 120), spec: clean(it.spec, 120), qty, unit: clean(it.unit, 10) || "식", unitKrw, amountKrw: qty * unitKrw };
    })
    .filter((it) => it.name && it.qty > 0 && it.unitKrw > 0);
  if (!items.length) return { error: "품목 이름과 금액(공급가액)을 넣어 주세요." };
  return { items, ...totals(items) };
}

/** 사업자등록번호 검증(국세청 검증번호 규칙). 하이픈은 있어도 없어도 된다. */
export function validBizNo(raw) {
  const d = String(raw ?? "").replace(/\D/g, "");
  if (d.length !== 10) return false;
  const w = [1, 3, 7, 1, 3, 7, 1, 3, 5];
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(d[i]) * w[i];
  sum += Math.floor((Number(d[8]) * 5) / 10);
  return (10 - (sum % 10)) % 10 === Number(d[9]);
}
export const formatBizNo = (raw) => {
  const d = String(raw ?? "").replace(/\D/g, "");
  return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}` : String(raw ?? "");
};

/** 견적번호 — 견적서·세금계산서 비고·입금자명 대조에 쓰는 사람이 읽는 번호. */
export function quoteNumber(q) {
  const d = new Date(Number(q.created_at) + 9 * 3600_000);
  const ymd = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  return `YM-${ymd}-${String(q.id).padStart(4, "0")}`;
}

export const parseItems = (q) => {
  try {
    return JSON.parse(q.items_json || "[]");
  } catch {
    return [];
  }
};
export const parseBilling = (q) => {
  try {
    return q.billing_json ? JSON.parse(q.billing_json) : null;
  } catch {
    return null;
  }
};

export const isExpired = (q, t = now()) => q.status === "issued" && Number(q.valid_until) < t;

/**
 * 견적을 만든다. product가 공개 단가 상품이면 qty로 계산하고, 아니면 items(운영자 입력)를 쓴다.
 * 반환: { quote } 또는 { error }
 */
export async function createQuote({ product, qty, items, company, contactName, email, phone, note, order = null, source = "self", auditId = null, ip = null }) {
  // 데스크가 품목·금액을 직접 넣어 내는 견적(감사 할인·맞춤 범위)은 공개 단가가 있어도 그 금액을 쓴다.
  const deskPriced = source === "desk" && Array.isArray(items) && items.length > 0;
  const isSelf = Boolean(SELF_PRODUCTS[product]) && !deskPriced;
  if (source === "self" && !isSelf) return { error: "이 상품은 범위를 듣고 견적을 드려요. 도입 문의로 보내 주세요." };
  if (!SELF_PRODUCTS[product] && !DESK_PRODUCTS[product]) return { error: "알 수 없는 상품이에요." };
  const priced = isSelf ? priceSelf(product, qty) : priceDesk(items);
  if (priced.error) return { error: priced.error };
  let orderJson = null;
  if (isAuditProduct(product) && source === "self") {
    const o = readOrder(order);
    if (o.error) return { error: o.error };
    orderJson = JSON.stringify(o.order);
    if (product === "audit_pilot" && !(await pilotSeatsLeft())) return { error: "파일럿 3곳이 모두 찼어요. 정밀 감사 정가로 신청해 주세요." };
  }

  const c = clean(company, 100);
  const name = clean(contactName, 60);
  const mail = clean(email, 200);
  if (!c) return { error: "회사명을 입력해 주세요." };
  if (source === "self" && !name) return { error: "담당자 성함을 입력해 주세요." };
  if (source === "self" && !looksEmail(mail)) return { error: "견적서를 받으실 이메일을 정확히 입력해 주세요." };

  const t = now();
  const row = await run(
    `INSERT INTO b2b_quotes (token, product, items_json, supply_krw, vat_krw, total_krw, company, contact_name, email, phone, note,
       order_json, source, audit_id, valid_until, status, ip, created_at, updated_at)
     VALUES (:token, :product, :items, :supply, :vat, :total, :company, :name, :email, :phone, :note,
       :order, :source, :auditId, :validUntil, 'issued', :ip, :t, :t) RETURNING id`,
    {
      token: randomToken(18),
      product,
      items: JSON.stringify(priced.items),
      supply: priced.supply,
      vat: priced.vat,
      total: priced.total,
      company: c,
      name: name || null,
      email: mail || null,
      phone: clean(phone, 40) || null,
      note: clean(note, 1000) || null,
      order: orderJson,
      source,
      auditId: auditId ? Number(auditId) : null,
      validUntil: t + QUOTE_VALID_DAYS * DAY,
      ip,
      t,
    },
  );
  const quote = await one("SELECT * FROM b2b_quotes WHERE id = :id", { id: row.rows[0].id });
  return { quote };
}

export const quotePath = (q) => `/b2b/quote/${q.token}`;

/** 감사 화면·보고서에 싣는 견적 요약(취소된 것 제외). url은 base를 붙인 견적서 주소. */
export async function quoteSummariesForAudit(auditId, base = "") {
  const rows = await all("SELECT * FROM b2b_quotes WHERE audit_id = :id AND status <> 'cancelled' ORDER BY id DESC", { id: Number(auditId) });
  return rows.map((q) => ({
    id: q.id,
    number: quoteNumber(q),
    status: q.status,
    statusLabel: STATUS_LABEL[q.status] || q.status,
    product: q.product,
    productLabel: SELF_PRODUCTS[q.product]?.label || DESK_PRODUCTS[q.product] || q.product,
    total_krw: Number(q.total_krw),
    expired: isExpired(q),
    url: `${base}${quotePath(q)}`,
  }));
}

export const quoteByToken = (token) => one("SELECT * FROM b2b_quotes WHERE token = :token", { token: String(token || "") });
export const quoteById = (id) => one("SELECT * FROM b2b_quotes WHERE id = :id", { id: Number(id) });
export const listQuotes = (limit = 200) => all("SELECT * FROM b2b_quotes ORDER BY id DESC LIMIT :limit", { limit });
export const quotesForAudit = (auditId) => all("SELECT * FROM b2b_quotes WHERE audit_id = :id ORDER BY id DESC", { id: Number(auditId) });

/**
 * 고객의 계약 신청. 세금계산서 발급 정보와 결제 방법, 조건 동의를 받는다.
 * 발행 상태이고 유효기간 안인 견적만 받는다 — 같은 견적에 두 번 신청해도 한 번만 남는다.
 */
export async function requestContract(token, body, { ip = null } = {}) {
  const q = await quoteByToken(token);
  if (!q) return { error: "견적서를 찾을 수 없어요.", status: 404 };
  if (q.status === "requested" || q.status === "paid") return { quote: q, already: true };
  if (q.status === "cancelled") return { error: "취소된 견적이에요. 새 견적을 받아 주세요.", status: 409 };
  if (isExpired(q)) return { error: "유효기간이 지난 견적이에요. 같은 조건으로 새 견적을 받아 주세요.", status: 409 };

  const billing = {
    bizNo: formatBizNo(clean(body?.bizNo, 20)),
    bizName: clean(body?.bizName, 100),
    ceo: clean(body?.ceo, 60),
    taxEmail: clean(body?.taxEmail, 200),
    address: clean(body?.address, 200),
    bizType: clean(body?.bizType, 60),
    bizItem: clean(body?.bizItem, 60),
    contactName: clean(body?.contactName, 60) || q.contact_name || "",
    contactPhone: clean(body?.contactPhone, 40),
    poNumber: clean(body?.poNumber, 60),
  };
  const payMethod = PAY_METHODS[body?.payMethod] ? body.payMethod : "";
  if (!validBizNo(billing.bizNo)) return { error: "사업자등록번호를 다시 확인해 주세요(10자리, 검증번호 불일치).", status: 400 };
  if (!billing.bizName) return { error: "상호(사업자등록증의 이름)를 입력해 주세요.", status: 400 };
  if (!billing.ceo) return { error: "대표자 성명을 입력해 주세요.", status: 400 };
  if (!looksEmail(billing.taxEmail)) return { error: "세금계산서를 받을 이메일을 정확히 입력해 주세요.", status: 400 };
  if (!payMethod) return { error: "결제 방법을 골라 주세요.", status: 400 };
  if (body?.agree !== true) return { error: "서비스 이용 조건과 데이터 처리 부속서에 동의해 주세요.", status: 400 };
  if (q.product === "audit_pilot" && !(await pilotSeatsLeft({ exceptId: q.id }))) {
    return { error: "그사이 파일럿 3곳이 모두 찼어요. 정밀 감사 정가로 새 견적을 받아 주세요.", status: 409 };
  }

  const t = now();
  const upd = await run(
    `UPDATE b2b_quotes SET status = 'requested', billing_json = :billing, pay_method = :pm, terms_version = :tv,
       agreed_at = :t, requested_at = :t, request_ip = :ip, updated_at = :t
     WHERE id = :id AND status = 'issued'`,
    { id: q.id, billing: JSON.stringify(billing), pm: payMethod, tv: TERMS_VERSION, t, ip },
  );
  const fresh = await quoteById(q.id);
  return { quote: fresh, already: !upd.changes };
}

/** 이 견적이 계약되면 API 키에 걸 월 한도. API 상품이 아니면 null. */
export function quotaFor(q) {
  const plan = tier(q.product);
  if (plan) return plan.calls;
  if (q.product === "audit_package") return tier("starter").calls;
  if (q.product === "metered") return parseItems(q)[0]?.qty || null;
  return null;
}

/**
 * 운영자의 입금(종량제는 계약) 확인. API 상품이면 고객 이메일과 같은 계정의 가장 최근 키에 월 한도를 건다 —
 * 계정이나 키를 못 찾으면 걸지 않고 그렇다고 알려 준다(엉뚱한 계정에 한도를 주지 않는다). 한도는 키마다
 * 따로 세므로 키 하나에만 건다 — 키가 여럿인 계정에 모두 걸면 약정의 몇 배가 열린다.
 */
export async function markPaid(id, { applyQuota = true } = {}) {
  const q = await quoteById(id);
  if (!q) return { error: "견적을 찾을 수 없어요." };
  if (q.status === "paid") return { quote: q, already: true, applied: null };
  if (q.status === "cancelled") return { error: "취소된 견적이에요." };
  const t = now();
  // 감사는 입금 확인 순간부터 영업일 기준 1~3일 — 마감을 그 자리에서 박아 둔다(작업 리스트·고객 메일이 같은 날을 쓴다).
  const due = isAuditProduct(q.product) ? addBusinessDays(t, AUDIT_LEAD_DAYS) : null;
  await run("UPDATE b2b_quotes SET status = 'paid', paid_at = :t, due_at = COALESCE(due_at, :due), updated_at = :t WHERE id = :id AND status IN ('issued','requested')", { id: q.id, t, due });
  let applied = null;
  const quota = quotaFor(q);
  if (applyQuota && quota) {
    const emails = [q.email, parseBilling(q)?.taxEmail].filter(Boolean).map((e) => e.toLowerCase());
    const user = emails.length
      ? await one(`SELECT id, email FROM users WHERE LOWER(email) IN (${emails.map((_, i) => `:e${i}`).join(",")}) ORDER BY id LIMIT 1`,
          Object.fromEntries(emails.map((e, i) => [`e${i}`, e])))
      : null;
    const key = user
      ? await one("SELECT id, prefix FROM api_keys WHERE user_id = :uid AND status = 'active' ORDER BY id DESC LIMIT 1", { uid: user.id })
      : null;
    if (key) await run("UPDATE api_keys SET monthly_quota = :quota WHERE id = :id", { quota, id: key.id });
    applied = { email: user?.email || null, key: key?.prefix || null, quota };
  }
  return { quote: await quoteById(q.id), applied };
}

export async function cancelQuote(id) {
  const t = now();
  const r = await run("UPDATE b2b_quotes SET status = 'cancelled', updated_at = :t WHERE id = :id AND status <> 'paid'", { id: Number(id), t });
  if (!r.changes) return { error: "입금 확인된 견적은 취소할 수 없어요(환불은 수정세금계산서와 함께 따로)." };
  return { quote: await quoteById(id) };
}

/** 홈택스 전자세금계산서 건별 발급 화면에 그대로 옮겨 적는 순서의 텍스트. */
export function hometaxBlock(q) {
  const b = parseBilling(q) || {};
  const items = parseItems(q);
  return [
    `[전자세금계산서 발급 정보 · 견적 ${quoteNumber(q)}]`,
    `공급받는자 등록번호: ${b.bizNo || ""}`,
    `상호: ${b.bizName || ""}`,
    `성명(대표자): ${b.ceo || ""}`,
    b.address ? `사업장 주소: ${b.address}` : null,
    b.bizType || b.bizItem ? `업태/종목: ${b.bizType || "-"} / ${b.bizItem || "-"}` : null,
    `이메일: ${b.taxEmail || ""}`,
    `품목: ${items.map((it) => `${it.name}${it.spec ? `(${it.spec})` : ""} ${it.qty.toLocaleString("ko-KR")}${it.unit}`).join(", ")}`,
    `공급가액: ${Number(q.supply_krw).toLocaleString("ko-KR")}원`,
    `세액: ${Number(q.vat_krw).toLocaleString("ko-KR")}원`,
    `합계: ${Number(q.total_krw).toLocaleString("ko-KR")}원`,
    `결제: ${PAY_METHODS[q.pay_method] || "-"}`,
    b.poNumber ? `고객 발주번호: ${b.poNumber}` : null,
    "※ 작성일자는 공급시기(납품일 또는 대가를 받기로 한 날). 입금 전이면 '청구', 입금 후면 '영수'.",
  ].filter(Boolean).join("\n");
}
