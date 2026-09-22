// 포트원(PortOne) V2 결제창·본인확인창 호출.
//
// 이 파일은 창을 띄우고 결과 번호를 서버에 넘기는 일만 한다. **결제됐는지 판단하지 않는다.**
// 결제창이 돌려주는 값은 고객 브라우저를 거치므로 금액을 바꿀 수 있다. 크레딧 지급 여부는
// 서버가 포트원에 직접 물어본 결과로만 정한다(server/portone.js).
//
// 취소는 실패가 아니다. 사용자가 창을 닫은 것뿐이라 오류 문구를 띄우지 않도록
// cancelled 표시를 붙여 던진다.
import { apiJson } from "./components/yume/api.js";

// SDK는 결제할 때만 필요하다. 첫 화면 번들에 넣지 않으려고 누를 때 가져온다.
const sdk = () => import("@portone/browser-sdk/v2");

const CANCEL_CODES = new Set(["USER_CANCEL", "PAY_PROCESS_CANCELED", "IDENTITY_VERIFICATION_CANCELLED"]);

function cancelled(message) {
  const e = new Error(message || "취소했어요.");
  e.cancelled = true;
  return e;
}

/**
 * 결제 전에 본인확인이 끝나 있게 만든다.
 *
 * 이니시스 V2는 구매자 이메일과 휴대폰 번호가 없으면 결제창을 열지 않는데, 그 번호는
 * 본인확인에서 받아 둔 값이다. 그래서 인증이 없으면 결제 자체가 불가능하다.
 *
 * 인증창을 먼저 띄우고, 끝나면 그 자리에서 결제창으로 넘어간다. 사용자가 "결제하기"를
 * 한 번 눌렀는데 인증만 하고 다시 눌러야 한다면 그건 중간에 끊긴 것이다.
 */
async function ensureIdentity() {
  const cfg = await apiJson("/api/checkout/config");
  if (cfg?.identityVerified) return;
  if (!cfg?.identity) throw new Error("본인확인이 아직 준비되지 않았어요. 잠시 후 다시 시도해주세요.");
  // 동의 항목이 생기기 전에 가입한 회원은 이 자리에서 동의를 받는다.
  await verifyIdentity({ agree: !cfg.identityAgreed });
}

/** 크레딧 팩 주문을 만든다. 결제창은 결제 화면(CheckoutPage)에서 연다. */
export async function orderPack(packKey) {
  await ensureIdentity();
  return apiJson("/api/checkout", { method: "POST", body: { packKey } });
}

/** 요금제 1개월 이용권 주문을 만든다. */
export async function orderPlan(plan) {
  await ensureIdentity();
  return apiJson("/api/checkout", { method: "POST", body: { plan } });
}

/**
 * 결제창을 연다. buyer는 결제 화면에서 받은 이름·휴대폰 번호다.
 *
 * 이니시스 V2는 이 둘이 비면 창을 열지 않는다. 본인확인으로 이미 알고 있으면 그대로 쓰고,
 * 모르면 화면에서 받아 채운다 — 번호를 저장하기 전에 인증한 회원이 여기에 해당한다.
 * 금액과 주문번호는 서버가 만든 주문 그대로다.
 */
export async function startCheckout(order, buyer) {
  const PortOne = await sdk();
  const res = await PortOne.requestPayment({
    storeId: order.storeId,
    channelKey: order.channelKey,
    paymentId: order.paymentId,
    orderName: order.orderName,
    totalAmount: order.totalAmount,
    currency: order.currency,
    payMethod: "CARD",
    customer: { ...(order.customer || {}), ...(buyer || {}) },
    // 모바일 결제창은 페이지를 떠났다가 돌아온다. 돌아올 곳을 지정하지 않으면 결과를 잃는다.
    redirectUrl: `${window.location.origin}/?checkout=${encodeURIComponent(order.paymentId)}`,
  });
  if (res?.code != null) {
    if (CANCEL_CODES.has(res.code)) throw cancelled(res.message);
    throw new Error(res.message || "결제에 실패했어요.");
  }
  return confirmCheckout(order.paymentId);
}

/** 예전 경로 — 주문 생성과 결제창 호출을 한 번에. 남은 호출부가 있으면 그대로 동작한다. */
export async function payForPack(packKey) {
  await ensureIdentity();
  const order = await apiJson("/api/checkout", { method: "POST", body: { packKey } });
  const PortOne = await sdk();
  const res = await PortOne.requestPayment({
    storeId: order.storeId,
    channelKey: order.channelKey,
    paymentId: order.paymentId,
    orderName: order.orderName,
    totalAmount: order.totalAmount,
    currency: order.currency,
    payMethod: "CARD",
    // 이니시스 V2 일반결제는 구매자 이메일이 없으면 창을 열지 않는다. 서버가 계정에서 꺼내 준 값이다.
    customer: order.customer,
    // 모바일 결제창은 페이지를 떠났다가 돌아온다. 돌아올 곳을 지정하지 않으면 결과를 잃는다.
    redirectUrl: `${window.location.origin}/?checkout=${encodeURIComponent(order.paymentId)}`,
  });
  if (res?.code != null) {
    if (CANCEL_CODES.has(res.code)) throw cancelled(res.message);
    throw new Error(res.message || "결제에 실패했어요.");
  }
  return confirmCheckout(order.paymentId);
}

/** 결제창이 돌아온 뒤 서버에 확인을 요청한다. 모바일 리다이렉트 복귀에서도 쓴다. */
export async function confirmCheckout(paymentId) {
  const r = await apiJson("/api/checkout/confirm", { method: "POST", body: { paymentId } });
  // 가상계좌는 번호만 발급된 상태(202)로 돌아온다. 실패가 아니라 입금 대기다.
  if (r.code === "AWAITING_DEPOSIT") return { pending: true };
  return r;
}

/**
 * 본인확인(KG이니시스 통합인증). 성공하면 { name }.
 * agree는 동의 항목이 생기기 전에 가입한 회원이 이 자리에서 동의를 누른 경우에만 true다.
 */
export async function verifyIdentity({ agree = false } = {}) {
  const start = await apiJson("/api/identity/start", { method: "POST", body: { agree } });
  const PortOne = await sdk();
  const res = await PortOne.requestIdentityVerification({
    storeId: start.storeId,
    channelKey: start.channelKey,
    identityVerificationId: start.identityVerificationId,
    redirectUrl: `${window.location.origin}/?identity=${encodeURIComponent(start.identityVerificationId)}`,
  });
  if (res?.code != null) {
    if (CANCEL_CODES.has(res.code)) throw cancelled(res.message);
    throw new Error(res.message || "본인확인에 실패했어요.");
  }
  return apiJson("/api/identity/confirm", { method: "POST", body: { identityVerificationId: start.identityVerificationId } });
}

/**
 * 비밀번호를 잊은 사람의 본인확인. 위 verifyIdentity와 다른 문을 쓴다 — 저쪽은 로그인한
 * 사람이 자기 계정에 인증을 붙이는 것이고, 이쪽은 아직 누구인지 모르는 사람이 자기가
 * 누구인지 밝히는 것이다. 그래서 서버에서도 세션이 아니라 CI로 계정을 찾는다.
 *
 * 성공하면 { name, accounts: [{ email, token }] }. 같은 명의로 계정이 여럿일 수 있어
 * 하나가 아니라 목록이다.
 */
export async function startIdentityReset() {
  const start = await apiJson("/api/auth/identity-reset/start", { method: "POST", body: { agree: true } });
  const PortOne = await sdk();
  const res = await PortOne.requestIdentityVerification({
    storeId: start.storeId,
    channelKey: start.channelKey,
    identityVerificationId: start.identityVerificationId,
    redirectUrl: `${window.location.origin}/?pwreset=${encodeURIComponent(start.identityVerificationId)}`,
  });
  if (res?.code != null) {
    if (CANCEL_CODES.has(res.code)) throw cancelled(res.message);
    throw new Error(res.message || "본인확인에 실패했어요.");
  }
  return confirmIdentityReset(start.identityVerificationId);
}

export function confirmIdentityReset(identityVerificationId) {
  return apiJson("/api/auth/identity-reset/confirm", { method: "POST", body: { identityVerificationId } });
}

// 모바일 결제창은 결제를 마치고 주소에 결과를 달아 돌아온다. 그 자리에서 서버 확인까지
// 끝내 주지 않으면 결제는 됐는데 크레딧은 없는 상태로 남는다.
export async function resumeFromRedirect() {
  const q = new URLSearchParams(window.location.search);
  const paymentId = q.get("checkout");
  const identityId = q.get("identity");
  // 비밀번호 재설정 본인확인은 로그인 전에 일어나므로 위 둘과 다른 표를 달고 돌아온다.
  const pwResetId = q.get("pwreset");
  if (!paymentId && !identityId && !pwResetId) return null;
  // 주소를 먼저 정리한다 — 새로고침할 때마다 같은 확인이 반복되지 않도록.
  const clean = new URL(window.location.href);
  clean.searchParams.delete("checkout");
  clean.searchParams.delete("identity");
  clean.searchParams.delete("pwreset");
  window.history.replaceState({}, "", clean.toString());
  try {
    if (paymentId) return { kind: "payment", ...(await confirmCheckout(paymentId)) };
    if (pwResetId) return { kind: "identityReset", ...(await confirmIdentityReset(pwResetId)) };
    return { kind: "identity", ...(await apiJson("/api/identity/confirm", { method: "POST", body: { identityVerificationId: identityId } })) };
  } catch (e) {
    return { kind: paymentId ? "payment" : pwResetId ? "identityReset" : "identity", error: e.message };
  }
}

/** 요금제 1개월 이용권 결제. 성공하면 { plan, planExpiresAt }. */
export async function payForPlan(plan) {
  await ensureIdentity();
  const order = await apiJson("/api/checkout", { method: "POST", body: { plan } });
  const PortOne = await sdk();
  const res = await PortOne.requestPayment({
    storeId: order.storeId,
    channelKey: order.channelKey,
    paymentId: order.paymentId,
    orderName: order.orderName,
    totalAmount: order.totalAmount,
    currency: order.currency,
    payMethod: "CARD",
    customer: order.customer,
    redirectUrl: `${window.location.origin}/?checkout=${encodeURIComponent(order.paymentId)}`,
  });
  if (res?.code != null) {
    if (CANCEL_CODES.has(res.code)) throw cancelled(res.message);
    throw new Error(res.message || "결제에 실패했어요.");
  }
  return confirmCheckout(order.paymentId);
}
