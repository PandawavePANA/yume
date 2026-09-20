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

/** 크레딧 팩 결제. 성공하면 { credits } 또는 입금 대기면 { pending: true }. */
export async function payForPack(packKey) {
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

// 모바일 결제창은 결제를 마치고 주소에 결과를 달아 돌아온다. 그 자리에서 서버 확인까지
// 끝내 주지 않으면 결제는 됐는데 크레딧은 없는 상태로 남는다.
export async function resumeFromRedirect() {
  const q = new URLSearchParams(window.location.search);
  const paymentId = q.get("checkout");
  const identityId = q.get("identity");
  if (!paymentId && !identityId) return null;
  // 주소를 먼저 정리한다 — 새로고침할 때마다 같은 확인이 반복되지 않도록.
  const clean = new URL(window.location.href);
  clean.searchParams.delete("checkout");
  clean.searchParams.delete("identity");
  window.history.replaceState({}, "", clean.toString());
  try {
    if (paymentId) return { kind: "payment", ...(await confirmCheckout(paymentId)) };
    return { kind: "identity", ...(await apiJson("/api/identity/confirm", { method: "POST", body: { identityVerificationId: identityId } })) };
  } catch (e) {
    return { kind: paymentId ? "payment" : "identity", error: e.message };
  }
}

/** 요금제 1개월 이용권 결제. 성공하면 { plan, planExpiresAt }. */
export async function payForPlan(plan) {
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
