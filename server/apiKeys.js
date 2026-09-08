import crypto from "node:crypto";

// 유메 검증 API(/v1/*)용 API 키 발급·검증·호출량 관리.
// 지금은 수익모델(B2B/개발자 API)을 실제로 시연하기 위한 프로토타입이라:
//   - 키는 "데모 발급" 버튼 한 번으로 즉시 나온다(실제 가입/결제 없음).
//   - 메모리에만 저장되어 서버 재시작(재배포 포함) 시 전부 초기화된다.
//   - 하루 호출 한도는 남용 방지용으로 넉넉하게 잡은 데모 값이다 — 실제 유료
//     플랜별 한도/과금은 결제 연동 후에 붙이면 된다.
const API_DAILY_LIMIT = 200;
const MAX_KEYS = 1000;
const MAX_KEYS_PER_IP = 10;

const keys = new Map(); // apiKey -> { apiKey, label, createdAt, ip, requestCount, dailyCount, dailyDate }
const issuedByIp = new Map(); // ip -> count

function today() {
  return new Date().toISOString().slice(0, 10);
}

export function issueApiKey(label, ip) {
  const ipKey = ip || "unknown";
  const alreadyIssued = issuedByIp.get(ipKey) || 0;
  if (alreadyIssued >= MAX_KEYS_PER_IP) {
    return { error: "데모 키 발급 한도를 초과했어요. 잠시 후 다시 시도해주세요." };
  }
  const apiKey = "yume_demo_" + crypto.randomBytes(16).toString("hex");
  const record = {
    apiKey,
    label: (label || "").trim().slice(0, 60) || "이름 없는 키",
    createdAt: Date.now(),
    ip: ipKey,
    requestCount: 0,
    dailyCount: 0,
    dailyDate: today(),
  };
  keys.set(apiKey, record);
  issuedByIp.set(ipKey, alreadyIssued + 1);
  if (keys.size > MAX_KEYS) {
    const oldestKey = keys.keys().next().value;
    keys.delete(oldestKey);
  }
  return { record };
}

export function validateApiKey(apiKey) {
  if (!apiKey) return null;
  return keys.get(apiKey) || null;
}

// 검증 요청 1건마다 호출한다(캐시 히트여도 호출량으로 센다 — 실제 종량제 API도
// 보통 요청 단위로 과금하지 결과가 캐시됐다고 무료로 처리하진 않는다).
export function recordUsage(apiKey) {
  const record = keys.get(apiKey);
  if (!record) return { allowed: false };
  const d = today();
  if (record.dailyDate !== d) {
    record.dailyDate = d;
    record.dailyCount = 0;
  }
  if (record.dailyCount >= API_DAILY_LIMIT) {
    return { allowed: false, dailyCount: record.dailyCount, dailyLimit: API_DAILY_LIMIT };
  }
  record.dailyCount += 1;
  record.requestCount += 1;
  return { allowed: true, dailyCount: record.dailyCount, dailyLimit: API_DAILY_LIMIT, requestCount: record.requestCount };
}

export function peekApiKeyUsage(apiKey) {
  const record = keys.get(apiKey);
  if (!record) return null;
  const d = today();
  const dailyCount = record.dailyDate === d ? record.dailyCount : 0;
  return {
    label: record.label,
    createdAt: record.createdAt,
    requestCount: record.requestCount,
    dailyCount,
    dailyLimit: API_DAILY_LIMIT,
    remainingToday: Math.max(0, API_DAILY_LIMIT - dailyCount),
  };
}

// 관리자 대시보드용 — 발급된 키 목록. 화면에 전체 키를 그대로 노출하지 않도록
// 앞 12자만 보여주고 나머지는 마스킹한다.
export function listApiKeys() {
  const d = today();
  return [...keys.values()]
    .map((r) => ({
      maskedKey: r.apiKey.slice(0, 14) + "…" + r.apiKey.slice(-4),
      label: r.label,
      createdAt: r.createdAt,
      requestCount: r.requestCount,
      dailyCount: r.dailyDate === d ? r.dailyCount : 0,
    }))
    .sort((a, b) => b.createdAt - a.createdAt);
}

export { API_DAILY_LIMIT };
