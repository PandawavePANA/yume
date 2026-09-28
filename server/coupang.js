import crypto from "node:crypto";
import { one, run, now } from "./db.js";

// 쿠팡파트너스 Open API — 검증 결과의 "관련 상품" 키워드를 실제 상품 하나와 그 상품의
// 파트너스 추적 링크로 바꾼다. 파트너스 화면에서 상품 카드의 [링크 생성]을 누르는 것과 같은
// 일을 서버가 대신 한다.
//
// 순서:
//   1) 상품 검색 API → 1위 상품의 이름·가격·사진·추적 링크(productUrl, lptag가 붙어 있다)
//   2) 검색을 못 쓰면(한도·오류·결과 없음) 딥링크 API로 "쿠팡 검색 결과 페이지"를 추적 링크로
//   3) 그것도 안 되면 그냥 쿠팡 검색 링크 — 어느 경우든 눌러볼 수 있는 링크는 붙는다
//
// ⚠ 호출 한도가 아주 빡빡하다. 상품 검색은 **1시간 10회**, 모든 API 합쳐 1분 100회.
// 한 번이라도 넘기면 24시간 동안 API와 링크 생성이 모두 막히고, 세 번 넘기면 파트너스
// 활동 자체가 제한된다. 그래서
//   · 한도는 DB에 센다 — 재배포로 서버가 새로 떠도 숫자가 이어져야 한다.
//   · 쿠팡 한도보다 낮게(검색 8회/시간, 전체 60회/분) 잡는다.
//   · 같은 키워드는 하루 동안 DB에 담아 두고 다시 묻지 않는다.
// 키는 Railway 환경변수(COUPANG_ACCESS_KEY / COUPANG_SECRET_KEY)에만 있다. 저장소는 공개다.
const API_HOST = "https://api-gateway.coupang.com";
const BASE = "/v2/providers/affiliate_open_api/apis/openapi";
const SEARCH_PATH = `${BASE}/products/search`;
const DEEPLINK_PATH = `${BASE}/v1/deeplink`;

export const SEARCH_PER_HOUR = Number(process.env.COUPANG_SEARCH_PER_HOUR) || 8;
export const CALLS_PER_MINUTE = 60;
export const CACHE_TTL_MS = 24 * 3600 * 1000;

function isConfigured() {
  return !!(process.env.COUPANG_ACCESS_KEY && process.env.COUPANG_SECRET_KEY);
}

function signedDate() {
  // 쿠팡 Open API가 요구하는 "YYMMDD'T'HHmmss'Z'" 형식(UTC).
  const iso = new Date().toISOString(); // 2026-09-08T12:34:56.789Z
  return iso.slice(2, 4) + iso.slice(5, 7) + iso.slice(8, 10) + "T" + iso.slice(11, 13) + iso.slice(14, 16) + iso.slice(17, 19) + "Z";
}

// 서명에는 경로와 쿼리 문자열이 "?" 없이 이어 붙는다.
function authHeader(method, path, query = "") {
  const datetime = signedDate();
  const signature = crypto
    .createHmac("sha256", process.env.COUPANG_SECRET_KEY)
    .update(datetime + method + path + query)
    .digest("hex");
  return `CEA algorithm=HmacSHA256, access-key=${process.env.COUPANG_ACCESS_KEY}, signed-date=${datetime}, signature=${signature}`;
}

// ── 호출 한도 ───────────────────────────────────────────────────────────
// 하루 무료 횟수를 세는 usage_daily를 그대로 빌린다. day 칸에 시(時)나 분(分)을 넣으면
// 같은 원자적 "한도 안이면 +1" 한 문장으로 끝난다. 여러 요청이 동시에 와도 넘지 않는다.
const hourSlot = (t = now()) => new Date(t).toISOString().slice(0, 13); // 2026-09-28T10
const minuteSlot = (t = now()) => new Date(t).toISOString().slice(0, 16); // 2026-09-28T10:41

async function take(key, slot, limit) {
  const r = await run(
    `INSERT INTO usage_daily (client_key, day, used) VALUES (:key, :slot, 1)
     ON CONFLICT (client_key, day) DO UPDATE SET used = usage_daily.used + 1 WHERE usage_daily.used < :limit
     RETURNING used`,
    { key, slot, limit },
  );
  return r.rows.length > 0;
}

// 쿠팡이 한도 초과나 차단을 알려 오면 한 시간 동안 스스로 멈춘다. 막힌 상태에서 계속 두드리면
// 위반 횟수만 늘어난다. 이 값은 메모리에만 두어도 된다 — 재시작하면 DB 한도가 다시 막아 준다.
let pausedUntil = 0;

async function coupangFetch(method, path, { query = "", body } = {}) {
  if (now() < pausedUntil) return null;
  if (!(await take("coupang:all", minuteSlot(), CALLS_PER_MINUTE))) return null;
  try {
    const res = await fetch(API_HOST + path + (query ? `?${query}` : ""), {
      method,
      headers: {
        Authorization: authHeader(method, path, query),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(5000),
    });
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch { /* 아래에서 실패로 처리 */ }
    if (!res.ok || !data || String(data.rCode ?? "0") !== "0") {
      if (res.status === 429 || res.status === 403) pausedUntil = now() + 3600 * 1000;
      console.error("쿠팡파트너스 API 실패:", path.split("/").pop(), res.status, text.slice(0, 200));
      return null;
    }
    return data;
  } catch (e) {
    console.error("쿠팡파트너스 API 호출 오류:", e?.message || e);
    return null;
  }
}

// ── 상품 검색 ───────────────────────────────────────────────────────────
const normalize = (k) => String(k || "").trim().replace(/\s+/g, " ").toLowerCase().slice(0, 50);

function pickProduct(d) {
  if (!d?.productUrl) return null;
  return {
    name: String(d.productName || ""),
    price: Number(d.productPrice) || null,
    image: d.productImage || null,
    url: d.productUrl,
    rocket: !!d.isRocket,
  };
}

async function readCache(keyword) {
  const row = await one("SELECT data_json, fetched_at FROM coupang_products WHERE keyword = :k", { k: keyword });
  if (!row || now() - Number(row.fetched_at) > CACHE_TTL_MS) return undefined;
  try { return JSON.parse(row.data_json); } catch { return undefined; }
}

async function writeCache(keyword, data) {
  await run(
    `INSERT INTO coupang_products (keyword, data_json, fetched_at) VALUES (:k, :d, :t)
     ON CONFLICT (keyword) DO UPDATE SET data_json = :d, fetched_at = :t`,
    { k: keyword, d: JSON.stringify(data), t: now() },
  );
}

// 키워드 하나 → { product, moreUrl } 또는 null(검색을 못 씀).
// 결과가 0개인 것도 담아 둔다 — 없는 걸 매시간 다시 물으면 한도만 탄다.
export async function searchProduct(keyword) {
  if (!isConfigured()) return null;
  const k = normalize(keyword);
  if (!k) return null;
  const cached = await readCache(k);
  if (cached !== undefined) return cached;
  if (now() < pausedUntil) return null;
  if (!(await take("coupang:search", hourSlot(), SEARCH_PER_HOUR))) return null;

  const query = `keyword=${encodeURIComponent(k)}&limit=3`;
  const data = await coupangFetch("GET", SEARCH_PATH, { query });
  if (!data) return null;
  const list = Array.isArray(data.data?.productData) ? data.data.productData : [];
  const result = { product: pickProduct(list[0]), moreUrl: data.data?.landingUrl || null };
  await writeCache(k, result);
  return result;
}

// 검색 URL을 추적 링크로(딥링크). 검색 한도가 찼을 때의 대안이다.
export async function getAffiliateLink(url) {
  if (!isConfigured()) return null;
  const data = await coupangFetch("POST", DEEPLINK_PATH, { body: { coupangUrls: [url] } });
  return data?.data?.[0]?.shortenUrl || null;
}

// related_products({keyword, reason}[]) → 눌러볼 수 있는 링크와, 찾았으면 실제 상품이 붙은 형태.
//   { keyword, reason, url, isAffiliate, product: {name, price, image, url, rocket} | null, moreUrl }
// 이미 풀어 둔 항목(isAffiliate)은 다시 묻지 않는다 — 결과 페이지를 열 때마다 부르는 자리다.
export async function resolveProductLinks(products) {
  if (!products || products.length === 0) return [];
  // 차례로 푼다. 한 결과에 키워드가 서넛이라 느리지 않고, 동시에 쏘면 한도 계산이 흐려진다.
  const out = [];
  for (const p of products) {
    if (p?.isAffiliate) { out.push(p); continue; }
    const searchUrl = `https://www.coupang.com/np/search?q=${encodeURIComponent(p.keyword)}`;
    const found = await searchProduct(p.keyword);
    if (found?.product) {
      out.push({ ...p, url: found.product.url, isAffiliate: true, product: found.product, moreUrl: found.moreUrl || null });
      continue;
    }
    const moreUrl = found?.moreUrl || (await getAffiliateLink(searchUrl));
    out.push({ ...p, url: moreUrl || searchUrl, isAffiliate: !!moreUrl, product: null, moreUrl: null });
  }
  return out;
}

export { isConfigured as isCoupangConfigured };

// 테스트용 — 스스로 건 일시 정지를 푼다.
export function _resetCoupangPause() { pausedUntil = 0; }
