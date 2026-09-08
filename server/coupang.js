import crypto from "node:crypto";

// 쿠팡파트너스 Open API로 "이 검색 URL을 내 파트너스 계정으로 추적되는
// 링크로 바꿔줘" 요청을 보낸다(딥링크 생성 API). ACCESS_KEY/SECRET_KEY가
// .env에 없으면 그냥 null을 돌려주고, 호출부는 지금처럼 일반 쿠팡 검색
// 링크로 폴백한다 — 즉 키가 없어도 서비스는 그대로 동작하고, 키를 넣는
// 순간부터 실제 제휴 링크로 바뀐다.
//
// 필요한 것: 쿠팡파트너스(partners.coupang.com) 가입 후 "Open API 이용신청"
// 메뉴에서 발급받는 ACCESS KEY / SECRET KEY 두 개. 서버 .env의
// COUPANG_ACCESS_KEY / COUPANG_SECRET_KEY 에 넣으면 된다. 실제 계정으로
// 아직 검증 못 해봤으니, 처음 켤 때 로그(console.error)에 실패 사유가
// 찍히는지 한 번 확인해보는 걸 권한다.
const API_HOST = "https://api-gateway.coupang.com";
const DEEPLINK_PATH = "/v2/providers/affiliate_open_api/apis/openapi/v1/deeplink";

function isConfigured() {
  return !!(process.env.COUPANG_ACCESS_KEY && process.env.COUPANG_SECRET_KEY);
}

function signedDate() {
  // 쿠팡 Open API가 요구하는 "YYMMDD'T'HHmmss'Z'" 형식(UTC).
  const iso = new Date().toISOString(); // 2026-09-08T12:34:56.789Z
  return iso.slice(2, 4) + iso.slice(5, 7) + iso.slice(8, 10) + "T" + iso.slice(11, 13) + iso.slice(14, 16) + iso.slice(17, 19) + "Z";
}

function authHeader(method, path) {
  const accessKey = process.env.COUPANG_ACCESS_KEY;
  const secretKey = process.env.COUPANG_SECRET_KEY;
  const datetime = signedDate();
  const message = datetime + method + path;
  const signature = crypto.createHmac("sha256", secretKey).update(message).digest("hex");
  return `CEA algorithm=HmacSHA256, access-key=${accessKey}, signed-date=${datetime}, signature=${signature}`;
}

// searchUrl 예: https://www.coupang.com/np/search?q=비타민C
// 성공하면 파트너스 추적이 붙은 shortenUrl을 돌려주고, 실패/미설정이면 null.
export async function getAffiliateLink(searchUrl) {
  if (!isConfigured()) return null;
  try {
    const res = await fetch(API_HOST + DEEPLINK_PATH, {
      method: "POST",
      headers: {
        Authorization: authHeader("POST", DEEPLINK_PATH),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ coupangUrls: [searchUrl] }),
    });
    if (!res.ok) {
      console.error("쿠팡파트너스 딥링크 생성 실패:", res.status, await res.text().catch(() => ""));
      return null;
    }
    const data = await res.json();
    const link = data?.data?.[0]?.shortenUrl;
    return link || null;
  } catch (e) {
    console.error("쿠팡파트너스 API 호출 오류:", e);
    return null;
  }
}

// related_products({keyword, reason}[])를 실제로 열 수 있는 URL이 붙은
// 형태로 바꾼다. 키가 설정돼 있으면 파트너스 추적 링크로, 아니면 그냥
// 일반 쿠팡 검색 링크로 폴백한다 — 어느 쪽이든 항상 눌러볼 수 있는
// 링크가 붙는다.
export async function resolveProductLinks(products) {
  if (!products || products.length === 0) return [];
  return Promise.all(
    products.map(async (p) => {
      const searchUrl = `https://www.coupang.com/np/search?q=${encodeURIComponent(p.keyword)}`;
      const affiliateUrl = await getAffiliateLink(searchUrl);
      return { ...p, url: affiliateUrl || searchUrl, isAffiliate: !!affiliateUrl };
    })
  );
}

export { isConfigured as isCoupangConfigured };
