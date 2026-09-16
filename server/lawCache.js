// 법제처 응답 캐시.
//
// 같은 조문을 다시 받아오는 일이 계속 생긴다 — "민법 제750조"는 검증마다 나오고,
// 그때마다 법제처에 네트워크 왕복을 한다. 조문 본문은 그 사이 바뀌지 않는데도.
// 캐시하면 돈이 아니라 시간과 안정성을 번다(법제처는 우리 쪽 장애 원인 1순위였다).
// 그렇게 아낀 여유를 검증 품질에 쓰는 게 이 캐시의 목적이다.
//
// 안전장치 두 가지.
//
// 1) 키에 한국 날짜를 넣는다. 법령 개정은 시행일 0시에 적용되므로, 날짜가 바뀌면
//    캐시가 통째로 무효가 된다. TTL을 아무리 길게 잡아도 어제 조문을 오늘 쓰는 일은
//    생기지 않는다.
//
// 2) "못 찾음"은 짧게만 캐시한다. 찾은 것은 어제도 있었으니 오래 들고 있어도 되지만,
//    못 찾은 것은 부존재 신뢰도의 근거가 되어 "지어낸 것"이라는 판정으로 이어진다.
//    새로 등록된 법령을 오래된 캐시 때문에 없다고 하면 없는 죄를 씌우는 셈이다.
// 날짜 하나 때문에 db.js를 끌어오면 이 모듈을 쓰는 쪽마다 DB가 열린다(테스트가 바로 깨졌다).
// 계산이 세 줄이라 여기서 직접 구한다.
function kstDay() {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

const FOUND_TTL_MS = 6 * 60 * 60 * 1000;
const MISS_TTL_MS = 10 * 60 * 1000;
const MAX_ENTRIES = 2000;

const store = new Map();

function evictIfNeeded() {
  if (store.size < MAX_ENTRIES) return;
  // 가장 오래 안 쓰인 것부터 버린다(Map은 삽입 순서를 지키고, 조회할 때마다 뒤로 옮긴다).
  const drop = Math.ceil(MAX_ENTRIES * 0.2);
  let i = 0;
  for (const k of store.keys()) {
    store.delete(k);
    if (++i >= drop) break;
  }
}

export function cacheKey(path, params) {
  const clean = Object.entries(params || {})
    .filter(([k]) => k !== "OC") // 서버 전용 키는 캐시 키에 넣지 않는다
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  return `${kstDay()}|${path}|${clean}`;
}

export function getCached(key) {
  const hit = store.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    store.delete(key);
    return null;
  }
  // 최근 사용으로 갱신
  store.delete(key);
  store.set(key, hit);
  return hit.value;
}

// found=false인 응답은 짧게만 들고 있는다(위 2번).
export function setCached(key, value, { found = true } = {}) {
  evictIfNeeded();
  store.set(key, { value, expiresAt: Date.now() + (found ? FOUND_TTL_MS : MISS_TTL_MS) });
  return value;
}

export function cacheStats() {
  return { entries: store.size, max: MAX_ENTRIES };
}

export function clearLawCache() {
  store.clear();
}
