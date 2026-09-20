// 포트원(PortOne) V2 — 결제 검증과 본인확인(KG이니시스 통합인증). 서버 전용.
//
// 브라우저가 "결제됐다"고 알려 주는 값은 믿지 않는다. 결제창은 고객 브라우저에서 뜨고
// 그 결과가 우리 서버로 오는 길에 금액을 바꿀 수 있다. 그래서 서버가 포트원에 직접 물어보고
// 우리가 아는 주문 금액과 실제 결제 금액이 같을 때만 크레딧을 지급한다.
//
// 환경변수 — 값은 Railway 설정 화면에만 넣는다. 저장소·대화에 두지 말 것.
//   VITE_PORTONE_STORE_ID            상점 아이디(브라우저에도 나가는 공개 값)
//   VITE_PORTONE_CHANNEL_KEY         결제 채널 키(공개 값). 테스트 채널은 MID INIpayTest
//   VITE_PORTONE_IDENTITY_CHANNEL_KEY 본인확인(통합인증) 채널 키(공개 값). 테스트 MID MIIiasTest
//   PORTONE_V2_API_SECRET            V2 API 시크릿 — **서버 전용. 절대 노출 금지**
//
// 시크릿은 결제 취소·조회가 가능한 값이다. 한 번이라도 노출되면 콘솔에서 폐기하고 재발급한다.
import crypto from "node:crypto";

const API = "https://api.portone.io";
const TIMEOUT_MS = 10_000;

export const STORE_ID = process.env.VITE_PORTONE_STORE_ID || process.env.PORTONE_STORE_ID || "";
export const CHANNEL_KEY = process.env.VITE_PORTONE_CHANNEL_KEY || process.env.PORTONE_CHANNEL_KEY || "";
export const IDENTITY_CHANNEL_KEY =
  process.env.VITE_PORTONE_IDENTITY_CHANNEL_KEY || process.env.PORTONE_IDENTITY_CHANNEL_KEY || "";
const SECRET = () => process.env.PORTONE_V2_API_SECRET || "";

// 셋 중 하나라도 비면 결제창을 띄우지 않는다. 절반만 설정된 상태로 결제창을 열면
// 사용자는 결제를 마쳤는데 우리는 확인할 수 없는, 가장 나쁜 상태가 된다.
export const paymentConfigured = () => !!(STORE_ID && CHANNEL_KEY && SECRET());
export const identityConfigured = () => !!(STORE_ID && IDENTITY_CHANNEL_KEY && SECRET());

async function get(path) {
  const secret = SECRET();
  if (!secret) return { ok: false, code: "NOT_CONFIGURED", message: "결제 연동이 아직 설정되지 않았어요." };
  try {
    const res = await fetch(`${API}${path}`, {
      headers: { Authorization: `PortOne ${secret}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, code: data?.type || `HTTP_${res.status}`, message: data?.message || "포트원 조회에 실패했어요." };
    return { ok: true, data };
  } catch (e) {
    return { ok: false, code: "NETWORK", message: e.message };
  }
}

// 결제 건 조회 + 금액 대조. paidAmount가 우리 주문 금액과 다르면 승인하지 않는다.
export async function confirmPayment(paymentId, expectedAmount) {
  const r = await get(`/payments/${encodeURIComponent(paymentId)}`);
  if (!r.ok) return r;
  const p = r.data;
  const status = String(p?.status || "");
  const total = Number(p?.amount?.total);
  if (status === "VIRTUAL_ACCOUNT_ISSUED") {
    // 가상계좌는 번호만 발급된 상태다. 입금 전에 크레딧을 주면 그냥 주는 것과 같다.
    return { ok: false, code: "AWAITING_DEPOSIT", message: "입금이 확인되면 크레딧이 지급돼요." };
  }
  if (status !== "PAID") return { ok: false, code: status || "NOT_PAID", message: "결제가 완료되지 않았어요." };
  if (!Number.isFinite(total) || total !== Number(expectedAmount)) {
    return { ok: false, code: "AMOUNT_MISMATCH", message: "결제 금액이 주문 금액과 달라요. 고객센터로 문의해주세요." };
  }
  const m = p?.method || {};
  const type = String(m.type || "").toUpperCase();
  const label = type.includes("CARD")
    ? m.card?.name
      ? `카드(${m.card.name})`
      : "카드"
    : type.includes("VIRTUAL")
      ? "가상계좌"
      : type.includes("TRANSFER")
        ? "계좌이체"
        : type.includes("MOBILE")
          ? "휴대폰"
          : type.includes("EASY")
            ? "간편결제"
            : type || "카드";
  return { ok: true, amount: total, method: label, paidAt: p?.paidAt || null };
}

// 본인확인 건 조회. CI는 사람마다 서비스와 무관하게 같은 값이라 그대로 저장하지 않는다 —
// 개인정보처리방침에 적은 대로 동일인 확인에만 쓰고, 저장은 해시로만 한다.
export async function confirmIdentity(identityVerificationId) {
  const r = await get(`/identity-verifications/${encodeURIComponent(identityVerificationId)}`);
  if (!r.ok) return r;
  const v = r.data;
  if (String(v?.status || "") !== "VERIFIED") {
    return { ok: false, code: v?.status || "NOT_VERIFIED", message: "본인확인이 완료되지 않았어요." };
  }
  const c = v.verifiedCustomer || {};
  if (!c.ci) return { ok: false, code: "NO_CI", message: "본인확인 결과에 연계정보(CI)가 없어요. 채널 설정을 확인해주세요." };
  return {
    ok: true,
    ciHash: hashCi(c.ci),
    name: c.name || "",
    // 생년월일·성별·통신사는 지금 쓰는 곳이 없어 저장하지 않는다. 필요해지면 그때 방침부터 고친다.
    phoneNumber: String(c.phoneNumber || "").replace(/\D/g, ""),
    verifiedAt: v.verifiedAt || null,
  };
}

// CI 해시. 같은 사람인지(중복 가입) 확인하는 데만 쓴다. 서버 비밀값을 섞어, DB만 유출돼도
// 다른 서비스의 CI 대조로 사람을 특정할 수 없게 한다.
export function hashCi(ci) {
  const pepper = process.env.CI_HASH_PEPPER || process.env.ADMIN_SECRET || "";
  return crypto.createHash("sha256").update(`${pepper}\n${ci}`).digest("hex");
}
