// 한국 공식 데이터 직접 조회 — 검색 없이 기관 데이터베이스에서 값을 꺼내 대조한다.
//
// koreaSources.js가 "공식 기관 사이트에서 먼저 검색"이라면, 여기는 그보다 한 단계 앞이다: 키가 있으면
// 기관이 내놓은 Open API에서 원자료를 직접 받는다. 검색 결과 요약이 아니라 원자료라 더 정확하고, 검색비가 들지 않는다.
//   · 한국은행 ECOS 100대 통계지표(기준금리·환율·물가·성장률 등) — ECOS_API_KEY
//   · 식약처 의약품개요정보(e약은요: 효능·용법·주의·부작용) — DATA_GO_KR_KEY
// 키는 대표가 Railway에 직접 넣는다(할 일 목록 korea_data_keys). 키가 없거나 조회가 실패하면 조용히 건너뛰고
// 다음 단계(공식 사이트 검색)로 간다 — 이 단계가 없어도 확인은 돌아간다.
//
// 응답의 필드 이름은 기관이 바꿀 수 있어서 코드가 필드를 골라 쓰지 않는다. 받은 원자료를 그대로(잘라서) 판정
// 모델에 주고, 판정의 근거 문장이 그 원자료에 실제로 있는지 코드가 대조한다(quoteIn) — 없으면 인정하지 않는다.
const TIMEOUT = 12_000;
const cache = new Map(); // key → { at, value }

async function cached(key, ttlMs, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value;
  const value = await fn();
  if (value) cache.set(key, { at: Date.now(), value });
  return value;
}

async function getJson(url, fetchImpl) {
  const r = await fetchImpl(url, { signal: AbortSignal.timeout(TIMEOUT), headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const text = await r.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("JSON이 아닌 응답");
  }
}

const compact = (v, max) => JSON.stringify(v).slice(0, max);

/** 한국은행 ECOS 100대 통계지표 — 6시간 캐시. 돌려주는 값: { source, url, text } | null */
export async function ecosKeyStats({ fetchImpl = fetch } = {}) {
  const key = process.env.ECOS_API_KEY;
  if (!key) return null;
  return cached("ecos:key", 6 * 3600 * 1000, async () => {
    const data = await getJson(`https://ecos.bok.or.kr/api/KeyStatisticList/${encodeURIComponent(key)}/json/kr/1/100`, fetchImpl).catch(() => null);
    const rows = data?.KeyStatisticList?.row;
    if (!Array.isArray(rows) || !rows.length) return null;
    return { source: "한국은행 ECOS 100대 통계지표", url: "https://ecos.bok.or.kr/", text: compact(rows, 14000) };
  });
}

/** 식약처 e약은요 — 약 이름으로. 하루 캐시. 돌려주는 값: { source, url, text } | null */
export async function drugInfo(name, { fetchImpl = fetch } = {}) {
  const key = process.env.DATA_GO_KR_KEY;
  const n = String(name || "").trim().slice(0, 40);
  if (!key || n.length < 2) return null;
  return cached(`drug:${n}`, 24 * 3600 * 1000, async () => {
    const u = new URL("https://apis.data.go.kr/1471000/DrbEasyDrugInfoService/getDrbEasyDrugList");
    u.searchParams.set("serviceKey", key);
    u.searchParams.set("itemName", n);
    u.searchParams.set("type", "json");
    u.searchParams.set("numOfRows", "3");
    const data = await getJson(u.toString(), fetchImpl).catch(() => null);
    const items = data?.body?.items ?? data?.response?.body?.items;
    const list = Array.isArray(items) ? items : Array.isArray(items?.item) ? items.item : items ? [items] : [];
    if (!list.length) return null;
    return { source: `식약처 의약품개요정보(e약은요) — ${n}`, url: `https://nedrug.mfds.go.kr/searchDrug?itemName=${encodeURIComponent(n)}`, text: compact(list, 12000) };
  });
}

const ECON = /금리|기준금리|환율|원[\/·]달러|달러|물가|소비자물가|CPI|성장률|GDP|국내총생산|실업률|고용률|국고채|코스피|KOSPI|통화량|경상수지/;

/**
 * 주장들에 맞는 공식 원자료를 모은다. claims: [{ claim, quote, field, drug? }]
 * 돌려주는 값: [{ source, url, text }]
 */
export async function gatherKoreaData(claims, { fetchImpl = fetch } = {}) {
  const jobs = [];
  if (claims.some((c) => c.field === "economy" || c.field === "statistics" || ECON.test(c.claim || ""))) jobs.push(ecosKeyStats({ fetchImpl }));
  const drugs = [...new Set(claims.filter((c) => c.field === "medical" && c.drug).map((c) => String(c.drug).trim()))].slice(0, 2);
  for (const d of drugs) jobs.push(drugInfo(d, { fetchImpl }));
  const got = await Promise.all(jobs.map((j) => j.catch(() => null)));
  return got.filter(Boolean);
}

export const koreaDataEnabled = () => !!(process.env.ECOS_API_KEY || process.env.DATA_GO_KR_KEY);
export const _clearKoreaDataCache = () => cache.clear();
