// 카카오톡 채널의 하루 무료 확인 한도 + 유료 토큰 잔액을 카카오 사용자 ID
// 기준으로 관리한다. 웹사이트 쪽 구독(무료/스탠다드/전문가)은 그대로 두고,
// 이건 실제 신원(카카오 user id)이 있는 카카오 채널에만 적용하는 별도 장치다.
//
// 프로토타입 단계라 메모리에만 있고(서버 재시작하면 초기화), 토큰 "충전"도
// 실제 결제 없이 데모 명령으로만 채운다 — 진짜 결제(카카오페이 등) 연동은
// 별도로 붙여야 한다. 절대 이 모듈 안에서 실제 돈을 움직이지 않는다.
const FREE_DAILY_LIMIT = 5;
const TOKEN_PRICE_KRW = 100;
const MAX_USERS = 2000;

const usage = new Map(); // userId -> { date: "YYYY-MM-DD", freeUsed: number, tokens: number }

function today() {
  return new Date().toISOString().slice(0, 10);
}

function getEntry(userId) {
  const existing = usage.get(userId);
  const d = today();
  if (existing && existing.date === d) return existing;
  // 날짜가 바뀌면 무료 횟수만 리셋하고, 토큰은 그대로 이월한다.
  const entry = { date: d, freeUsed: 0, tokens: existing ? existing.tokens : 0 };
  usage.set(userId, entry);
  if (usage.size > MAX_USERS) {
    const oldestKey = usage.keys().next().value;
    usage.delete(oldestKey);
  }
  return entry;
}

// 검증 1건을 시도할 때 호출한다. userId가 없으면(테스트 등) 막지 않는다.
export function checkAndConsume(userId) {
  if (!userId) return { allowed: true, usedFree: true, remainingFree: Infinity, tokens: 0 };
  const e = getEntry(userId);
  if (e.freeUsed < FREE_DAILY_LIMIT) {
    e.freeUsed += 1;
    return { allowed: true, usedFree: true, remainingFree: FREE_DAILY_LIMIT - e.freeUsed, tokens: e.tokens };
  }
  if (e.tokens > 0) {
    e.tokens -= 1;
    return { allowed: true, usedFree: false, remainingFree: 0, tokens: e.tokens };
  }
  return { allowed: false, usedFree: false, remainingFree: 0, tokens: e.tokens };
}

// 데모 충전 — 실제 결제 없이 토큰을 바로 채운다("토큰충전 N" 명령용).
export function addTokensDemo(userId, count) {
  const e = getEntry(userId);
  e.tokens += count;
  return e.tokens;
}

export function peekUsage(userId) {
  if (!userId) return { freeUsed: 0, remainingFree: FREE_DAILY_LIMIT, tokens: 0 };
  const e = getEntry(userId);
  return { freeUsed: e.freeUsed, remainingFree: Math.max(0, FREE_DAILY_LIMIT - e.freeUsed), tokens: e.tokens };
}

// 관리자 대시보드용 — 웹/카카오 사용자 수, 오늘 무료 사용량, 토큰 보유 총량을
// 한눈에 보여준다. userId 자체가 "web:"+IP 또는 카카오 user id라서 접두사로
// 구분한다.
export function getUsageStats() {
  const d = today();
  let webUsers = 0, kakaoUsers = 0, totalFreeUsedToday = 0, totalTokens = 0;
  for (const [id, e] of usage) {
    if (id.startsWith("web:")) webUsers += 1; else kakaoUsers += 1;
    if (e.date === d) totalFreeUsedToday += e.freeUsed;
    totalTokens += e.tokens;
  }
  return { totalUsers: usage.size, webUsers, kakaoUsers, totalFreeUsedToday, totalTokens };
}

export function listUsageEntries(limit = 50) {
  const d = today();
  return [...usage.entries()]
    .map(([id, e]) => ({
      id,
      type: id.startsWith("web:") ? "web" : "kakao",
      freeUsedToday: e.date === d ? e.freeUsed : 0,
      tokens: e.tokens,
    }))
    .sort((a, b) => (b.freeUsedToday - a.freeUsedToday) || (b.tokens - a.tokens))
    .slice(0, limit);
}

export { FREE_DAILY_LIMIT, TOKEN_PRICE_KRW };
