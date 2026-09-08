import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import { extractAndVerify, chatReply } from "./claude.js";
import { resolveLegalClaims } from "./legalPipeline.js";
import { buildOverallVerdict } from "./overallVerdict.js";
import { kakaoSkillHandler } from "./kakaoWebhook.js";
import { getResult } from "./resultsStore.js";
import { renderResultPage } from "./renderResultPage.js";
import { getCached, setCached } from "./verifyCache.js";
import { resolveProductLinks } from "./coupang.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, "..", "dist");

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.post("/api/verify", async (req, res) => {
  const text = (req.body?.text || "").trim();
  if (!text) return res.status(400).json({ error: "검증할 텍스트를 입력해주세요." });
  const startedAt = Date.now();

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  try {
    const cached = getCached(text);
    if (cached) {
      send("progress", { message: "이전에 검증한 것과 똑같은 내용이라 저장된 결과를 바로 보여드려요…" });
      send("result", { ...cached, elapsedMs: Date.now() - startedAt, fromCache: true });
      return;
    }

    send("progress", { message: "AI 답변에서 사실 주장을 추출하는 중…" });
    const extracted = await extractAndVerify(text, (message) => send("progress", { message }));
    send("progress", { message: `${extracted.claims.length}개 주장을 찾았습니다. 법률 주장은 공식 데이터와 대조합니다…` });

    const claims = await resolveLegalClaims(extracted.claims, {
      onProgress: (message) => send("progress", { message }),
    });

    send("progress", { message: "결과를 정리하는 중…" });
    const overall = buildOverallVerdict(claims);
    const relatedProducts = await resolveProductLinks(extracted.related_products);
    const payload = { ...extracted, claims, overall, related_products: relatedProducts };
    setCached(text, payload);
    send("result", { ...payload, elapsedMs: Date.now() - startedAt });
  } catch (e) {
    console.error(e);
    send("error", { error: e.message || "서버 오류가 발생했습니다." });
  } finally {
    res.end();
  }
});

app.post("/api/chat", async (req, res) => {
  const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
  if (messages.length === 0) return res.status(400).json({ error: "메시지가 없습니다." });
  try {
    const reply = await chatReply(messages);
    res.json({ reply });
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

// 카카오톡 채널(카카오 i 오픈빌더) 스킬 서버 엔드포인트. 오픈빌더에서 이 URL을
// 스킬로 등록하면, 채널로 온 메시지가 여기로 그대로 전달된다. 실제 채널 생성과
// 오픈빌더 스킬 등록은 카카오 비즈니스 계정에서 직접 해야 하는 별도 절차다.
app.post("/api/kakao/skill", kakaoSkillHandler);

// 카카오톡 등 외부 채널로 보낸 검증 결과를 링크로 열어보는 읽기 전용 페이지.
// React 앱과 분리된 서버 렌더링 페이지라 새로고침·직접 접속 모두 그대로 동작한다.
app.get("/r/:id", (req, res) => {
  const entry = getResult(req.params.id);
  if (!entry) return res.status(404).send("결과를 찾을 수 없습니다. 링크가 만료되었을 수 있어요.");
  res.set("Content-Type", "text/html; charset=utf-8");
  res.send(renderResultPage({ id: req.params.id, input: entry.input, status: entry.status, result: entry.result, createdAt: entry.createdAt }));
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
