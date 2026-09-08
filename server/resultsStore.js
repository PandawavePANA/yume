// 카카오톡 채널 등 외부 채널에서 "결과를 나중에 링크로 보내주는" 용도의 아주 단순한
// 저장소. 지금은 DB가 없는 프로토타입이라 메모리에만 들고 있는다 — 서버가
// 재시작되면(배포 재배포 포함) 그동안 만들어진 링크는 전부 사라진다. 실제 서비스로
// 넘어가면 이 부분만 Redis나 실제 DB로 교체하면 된다.
const store = new Map();
const MAX_ENTRIES = 500; // 메모리 무한 증가 방지 — 오래된 것부터 버린다.

export function saveResult(id, data) {
  store.set(id, { ...data, createdAt: Date.now() });
  if (store.size > MAX_ENTRIES) {
    const oldestKey = store.keys().next().value;
    store.delete(oldestKey);
  }
}

export function getResult(id) {
  return store.get(id) || null;
}
