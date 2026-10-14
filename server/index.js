import "dotenv/config";
import app, { maintenance, markInterruptedJobs } from "./app.js";
import { closeDb, DB_DESCRIPTION, PERSISTENT_STORAGE } from "./db.js";
import { IS_PROD } from "./security.js";
import { startEngineWatch } from "./engineWatch.js";
import { startStaff } from "./staff/index.js";
import { loadBusinessAddress } from "./businessAddress.js";

// 서버가 재시작되면 진행 중이던 검증은 끝나지 않으므로 오류로 정리한다.
await markInterruptedJobs();
await maintenance();
setInterval(() => maintenance(), 60 * 60 * 1000).unref();
// 검사 엔진(Anthropic) 감시 — 잔액이 바닥나면 결제를 멈추고 운영자에게 메일을 보낸다(engineWatch.js).
startEngineWatch();
// AI 직원(server/staff/) — 정해진 때에 일하고, 대표에게는 결재만 올린다(/admin/staff).
// 사업장 주소가 바뀌어 있으면(할 일 "소재지 정정" 완료) 서버 화면에 먼저 반영해 둔다.
await loadBusinessAddress().catch(() => {});
startStaff();

if (IS_PROD && !PERSISTENT_STORAGE) {
  console.warn("⚠️  DATABASE_URL(Supabase)이 지정되지 않아 로컬 PGlite에 저장합니다. 배포 환경이라면 재배포 때 데이터가 사라집니다.");
}

const PORT = process.env.PORT || 8787;
const server = app.listen(PORT, () => console.log(`유메 서버 실행 중: http://localhost:${PORT} (DB: ${DB_DESCRIPTION})`));

function shutdown(signal) {
  console.log(`${signal} 수신 — 서버를 정리하고 종료합니다.`);
  server.close(async () => {
    await closeDb();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 10_000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
