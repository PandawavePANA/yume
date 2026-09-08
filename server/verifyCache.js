import crypto from "node:crypto";

// 지라시는 토씨 하나 안 틀리고 여러 단톡방에 그대로 퍼진다 — 같은 텍스트가
// 100번 들어오면 지금까지는 100번 다 API를 새로 호출했다. 완전히 같은 텍스트는
// 이전 검증 결과를 그대로 재사용해서 웹검색·법제처 조회·Claude 호출 비용을
// 아낀다. 일부러 "거의 같음(fuzzy)"까지는 안 하고 정확히 같은 텍스트(공백만
// 정리)만 캐시 히트로 본다 — 자칫 조금 다른 두 주장을 같은 결과로 섞어버리면
// 팩트체크 서비스로서 신뢰를 해치기 때문.
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7일 — 지라시가 도는 기간을 넉넉히 덮는 값
const MAX_ENTRIES = 2000;
const cache = new Map();

function normalize(text) {
  return text.trim().replace(/\s+/g, " ");
}

function hashKey(text) {
  return crypto.createHash("sha256").update(normalize(text)).digest("hex");
}

export function getCached(text) {
  const entry = cache.get(hashKey(text));
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
    cache.delete(hashKey(text));
    return null;
  }
  return entry.data;
}

export function setCached(text, data) {
  const key = hashKey(text);
  cache.set(key, { data, cachedAt: Date.now() });
  if (cache.size > MAX_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    cache.delete(oldestKey);
  }
}
