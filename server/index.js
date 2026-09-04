import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import { extractAndVerify } from "./claude.js";
import { resolveLegalClaims } from "./legalPipeline.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, "..", "dist");

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.post("/api/verify", async (req, res) => {
  const text = (req.body?.text || "").trim();
  if (!text) return res.status(400).json({ error: "검증할 텍스트를 입력해주세요." });

  try {
    const extracted = await extractAndVerify(text);
    const claims = await resolveLegalClaims(extracted.claims);
    res.json({ ...extracted, claims });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || "서버 오류가 발생했습니다." });
  }
});

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    claudeConfigured: !!process.env.ANTHROPIC_API_KEY,
    lawApiConfigured: !!process.env.LAW_OC,
  });
});

// 배포 환경: `npm run build`로 만든 프론트엔드 정적 파일을 같은 서버·같은 도메인에서 서빙한다.
// (로컬 개발 중에는 dist/가 없으므로 자동으로 건너뛰고, Vite 개발 서버가 프론트를 담당한다.)
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get(/^(?!\/api\/).*/, (req, res) => {
    res.sendFile(path.join(distDir, "index.html"));
  });
}

const PORT = process.env.PORT || 8787;
app.listen(PORT, () => console.log(`유메 서버 실행 중: http://localhost:${PORT}`));
