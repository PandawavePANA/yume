// 카카오톡은 스킬 요청 하나하나가 원래 독립적이라(이전 메시지를 기억 안 함),
// 사용자별로 최근 대화 몇 턴을 메모리에 들고 있다가 다음 요청에 같이 넣어줘서
// "대화가 이어지는" 것처럼 느껴지게 한다. 프로토타입이라 서버가 재시작되면
// (배포 재배포 포함) 대화 기록은 전부 사라진다 — 실제 서비스로 넘어가면 여기만
// Redis 등으로 교체하면 된다.
const store = new Map();
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
  if (store.size > MAX_USERS) {
    const oldestKey = store.keys().next().value;
    store.delete(oldestKey);
  }
}
