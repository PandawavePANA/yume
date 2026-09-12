import { all, now, run } from "./db.js";

// 관리자 조치·계정 변경·데이터 반출 기록. 개인정보보호법상 개인정보 처리 기록과
// 제3자 제공 기록을 남겨야 하므로, 반출(data_export)과 권한 변경은 반드시 여기에 쓴다.
export async function audit(actor, action, target = null, detail = null, ip = null) {
  try {
    await run(
      "INSERT INTO audit_logs (actor, action, target, detail_json, ip, created_at) VALUES (:actor, :action, :target, :detail, :ip, :at)",
      { actor: String(actor), action, target: target == null ? null : String(target), detail: detail ? JSON.stringify(detail) : null, ip, at: now() },
    );
  } catch (e) {
    console.error("감사 로그 저장 실패:", action, e.message);
  }
}

export async function listAudit(limit = 100) {
  const rows = await all("SELECT * FROM audit_logs ORDER BY id DESC LIMIT :limit", { limit });
  return rows.map((r) => ({ ...r, detail: r.detail_json ? JSON.parse(r.detail_json) : null }));
}
