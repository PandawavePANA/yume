import { all, now, run } from "./db.js";

// 호출한 쪽을 막지 않도록 기다리지 않아도 되게 만든다(실패해도 콘솔에만 남김).
export function logError(source, error) {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? (error.stack || "").slice(0, 4000) : null;
  return run("INSERT INTO error_logs (source, message, stack, created_at) VALUES (:source, :message, :stack, :at)", {
    source,
    message: message.slice(0, 2000),
    stack,
    at: now(),
  }).catch((e) => console.error("오류 로그 저장 실패:", e.message, "원래 오류:", message));
}

export function listErrors(limit = 50) {
  return all("SELECT id, source, message, stack, created_at FROM error_logs ORDER BY id DESC LIMIT :limit", { limit });
}
