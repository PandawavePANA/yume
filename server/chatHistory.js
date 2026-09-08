// 카카오톡은 스킬 요청 하나하나가 원래 독립적이라(이전 메시지를 기억 안 함),
// 사용자별로 최근 대화 몇 턴을 메모리에 들고 있다가 다음 요청에 같이 넣어줘서
// "대화가 이어지는" 것처럼 느껴지게 한다. 프로토타입이라 서버가 재시작되면
// (배포 재배포 포함) 대화 기록은 전부 사라진다 — 실제 서비스로 넘어가면 여기만
// Redis 등으로 교체하면 된다.
const store = new Map();
const lastActiveAt = new Map(); // userId -> timestamp, 관리자 대시보드 정렬용
const MAX_USERS = 500; // 메모리 무한 증가 방지 — 오래된 사용자부터 버린다.
const MAX_TURNS = 12; // user/assistant 합쳐서 최근 12개(대화 6번 왕복)까지만 기억

export function getHistory(userId) {
  if (!userId) return [];
  return store.get(userId) || [];
}

export function appendTurns(userId, turns) {
  if (!userId) return;
  const existing = store.get(userId) || [];
  store.set(userId, [...existing, ...turns].slice(-MAX_TURNS));
  lastActiveAt.set(userId, Date.now());
  if (store.size > MAX_USERS) {
    const oldestKey = store.keys().next().value;
    store.delete(oldestKey);
    lastActiveAt.delete(oldestKey);
  }
}

// 관리자 대시보드용 — 카카오 채널에서 현재 대화가 이어지고 있는 사용자 수와
// 누적 턴 수 요약.
export function getChatStats() {
  let totalTurns = 0;
  for (const turns of store.values()) totalTurns += turns.length;
  return { activeUsers: store.size, totalTurns };
}

// 관리자가 "지금 무슨 일이 일어나고 있는지" 전부 확인할 수 있도록 사용자별
// 대화 내용을 그대로 반환한다. requireAdmin으로 막힌 라우트에서만 쓴다.
export function listChatUsers(limit = 50) {
  return [...store.entries()]
    .map(([userId, turns]) => ({
      userId,
      type: userId.startsWith("web:") ? "web" : "kakao",
      turns,
      lastActiveAt: lastActiveAt.get(userId) || 0,
    }))
    .sort((a, b) => b.lastActiveAt - a.lastActiveAt)
    .slice(0, limit);
}
