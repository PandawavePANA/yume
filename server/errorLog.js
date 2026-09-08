// 관리자 대시보드에서 "무슨 오류가 있었는지"까지 볼 수 있도록 서버 곳곳의
// catch 블록에서 발생한 오류를 메모리에 모아둔다. 프로토타입이라 여기도
// 재시작하면 초기화된다 — 실제 서비스로 넘어가면 Sentry 등 외부 로깅으로 교체.
const MAX_ENTRIES = 300;
const errors = [];

export function logError(source, error) {
  const message = error instanceof Error ? error.message : String(error);
  errors.unshift({ source, message, at: Date.now() });
  if (errors.length > MAX_ENTRIES) errors.length = MAX_ENTRIES;
}

export function listErrors(limit = 50) {
  return errors.slice(0, limit);
}
