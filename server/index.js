import "dotenv/config";
import app, { maintenance, markInterruptedJobs } from "./app.js";
import { closeDb, DB_DESCRIPTION, PERSISTENT_STORAGE } from "./db.js";
import { IS_PROD } from "./security.js";

// 서버가 재시작되면 진행 중이던 검증은 끝나지 않으므로 오류로 정리한다.
await markInterruptedJobs();
await maintenance();
setInterval(() => maintenance(), 60 * 60 * 1000).unref();

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
