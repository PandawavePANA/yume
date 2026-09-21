// 형제 제품(밸러스트·아이픽·프로바)의 매출을 모아 온다.
//
// 제품마다 데이터베이스가 다르다. 유메는 이 서버의 Postgres, 밸러스트는 자기 Railway
// 프로젝트의 Postgres, 아이픽은 Supabase다. 한 화면에서 보려면 어떻게든 합쳐야 하는데,
// 방법이 둘이었다.
//
//  (1) 각 DB 접속정보를 이 서버 환경변수에 넣고 직접 조회한다.
//  (2) 각 제품이 "자기 매출 요약"만 내주는 읽기 전용 주소를 두고, 여기서 불러 모은다.
//
// (2)를 골랐다. (1)은 코드가 짧지만 이 서버 하나가 뚫리면 네 제품의 데이터베이스가
// 전부 같이 열린다. 유메 서버는 이미 회원과 결제를 들고 있어 가장 노려지는 곳이다.
// (2)는 각 제품이 자기 돈의 유일한 기준으로 남고, 새어 나가는 최악이 "합계 숫자"다.
// 스키마가 바뀌어도 그 제품 안에서 끝난다는 것도 (2)의 이점이다.
//
// 주소가 설정되지 않은 제품은 조용히 건너뛴다. 아직 연결하지 않은 것과 연결했는데
// 실패한 것은 화면에서 구분해서 보여 준다 — 0원이라고 적어 두면 장사가 안 되는 것처럼
// 읽히는데, 사실은 물어보지도 않은 것이다.
import { logError } from "./errorLog.js";

const TIMEOUT_MS = 6000;
// 보드를 열 때마다 형제 서버를 두드릴 이유가 없다. 매출은 초 단위로 변하지 않는다.
const TTL_MS = 60 * 1000;

export const EXTERNAL_PRODUCTS = [
  { key: "ballast", label: "밸러스트", env: "BALLAST_REVENUE_URL", site: "https://www.ballast-reamer.com/" },
  { key: "aipick", label: "아이픽", env: "AIPICK_REVENUE_URL", site: "https://www.aipick-reamer.com/" },
  { key: "proba", label: "프로바", env: "PROBA_REVENUE_URL", site: "https://proba.network/" },
];

const cache = new Map();

function token() {
  return process.env.PRODUCT_REVENUE_TOKEN || "";
}

async function fetchOne(p) {
  const url = process.env[p.env];
  // 아직 연결하지 않은 제품. 오류가 아니다.
  if (!url) return { key: p.key, label: p.label, site: p.site, state: "unlinked" };
  if (!token()) return { key: p.key, label: p.label, site: p.site, state: "error", error: "PRODUCT_REVENUE_TOKEN이 없어요." };

  const hit = cache.get(p.key);
  if (hit && hit.at > Date.now() - TTL_MS) return hit.value;

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token()}`, Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const d = await res.json();
    const value = {
      key: p.key,
      label: p.label,
      site: p.site,
      state: "ok",
      // 제품이 무엇을 세는지는 제품이 정한다. 여기서는 숫자만 받는다.
      total: Math.max(0, Math.floor(Number(d.total) || 0)),
      count: Math.max(0, Math.floor(Number(d.count) || 0)),
      currency: String(d.currency || "KRW").slice(0, 8),
      // 결제 연동이 없는 제품은 "완료된 건의 가격"을 보낸다. 입금 확인된 돈이 아니므로
      // 총 매출에 섞지 않는다 — 섞으면 보드의 총액이 통장과 어긋난다.
      unverified: d.unverified === true,
      note: typeof d.note === "string" ? d.note.slice(0, 120) : null,
      // 운영 화면에 쓰는 지표와 최근 내역. 제품이 자기에게 맞는 것을 골라 보낸다 —
      // 보드는 모양만 알고 무엇을 세는지는 알 필요가 없다.
      metrics: Array.isArray(d.metrics)
        ? d.metrics.slice(0, 12).map((m) => ({
            label: String(m?.label ?? "").slice(0, 24),
            value: m?.value,
            sub: m?.sub == null ? null : String(m.sub).slice(0, 16),
          })).filter((m) => m.label)
        : [],
      recent: Array.isArray(d.recent)
        ? d.recent.slice(0, 20).map((r) => ({
            title: String(r?.title ?? "").slice(0, 80),
            sub: String(r?.sub ?? "").slice(0, 40),
            amount: Number(r?.amount) || 0,
            when: String(r?.when ?? "").slice(0, 40),
            tone: ["good", "warn", "bad"].includes(r?.tone) ? r.tone : "",
          })).filter((r) => r.title)
        : [],
      at: Date.now(),
    };
    cache.set(p.key, { at: Date.now(), value });
    return value;
  } catch (e) {
    logError(`revenue:${p.key}`, e);
    // 직전에 성공한 값이 있으면 그걸 보여 주되 오래된 값임을 밝힌다.
    // 한 번 실패했다고 화면에서 매출이 사라지면 더 놀란다.
    const stale = cache.get(p.key);
    if (stale) return { ...stale.value, state: "stale", error: e.message };
    return { key: p.key, label: p.label, site: p.site, state: "error", error: e.message };
  }
}

export async function collectProductRevenue() {
  // 한 제품이 느려도 나머지는 기다리지 않는다.
  return Promise.all(EXTERNAL_PRODUCTS.map(fetchOne));
}

export function productByKey(key) {
  return EXTERNAL_PRODUCTS.find((p) => p.key === key) || null;
}

export async function fetchProduct(key) {
  const p = productByKey(key);
  return p ? fetchOne(p) : null;
}
