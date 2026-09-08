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
import { checkAndConsume, addTokensDemo, peekUsage, FREE_DAILY_LIMIT, TOKEN_PRICE_KRW } from "./usageStore.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, "..", "dist");

const app = express();
// Railway 등 프록시 뒤에서 req.ip가 프록시 자체의 내부 IP가 아니라 실제 접속자
// IP를 가리키게 하려면 이 설정이 필요하다 — 무료 플랜 하루 한도를 IP 기준으로
// 매길 건데, 이게 없으면 모든 사용자가 같은 IP(프록시)로 뭉뚱그려진다.
app.set("trust proxy", true);
app.use(cors());
app.use(express.json({ limit: "1mb" }));

// 웹사이트는 로그인이 진짜로 동작하지 않아서(데모 UI일 뿐) 사용자를 구분할 방법이
// IP뿐이다. 같은 사무실·공유기 뒤 여러 사람이 뭉뚱그려지거나 VPN으로 우회되는
// 한계는 있지만, 실제 계정 시스템이 생기기 전까지는 이 정도가 현실적인 선이다.
function webUsageKey(req) {
  return "web:" + (req.ip || "unknown");
}

app.post("/api/verify", async (req, res) => {
  const text = (req.body?.text || "").trim();
  if (!text) return res.status(400).json({ error: "검증할 텍스트를 입력해주세요." });
  const plan = req.body?.plan || "free";
  const startedAt = Date.now();

  // 무료 플랜에만 하루 한도 + 토큰 과금을 적용한다. 스탠다드/전문가는 그대로
  // 무제한(둘 다 어차피 데모 결제라 실제로 돈을 낸 상태를 서버가 검증하진
  // 못하지만, 적어도 무료 플랜에는 실질적인 제약이 생기는 게 목적이다).
  let usageInfo = null;
  if (plan === "free") {
    const usage = checkAndConsume(webUsageKey(req));
    if (!usage.allowed) {
      return res.status(402).json({
        error: `오늘 무료 확인 ${FREE_DAILY_LIMIT}회를 다 쓰셨어요. 토큰 1개(${TOKEN_PRICE_KRW}원)로 더 확인하거나, 스탠다드/전문가 플랜은 무제한이에요.`,
        limitReached: true,
        tokens: usage.tokens,
      });
    }
    usageInfo = { usedFree: usage.usedFree, remainingFree: usage.remainingFree, tokens: usage.tokens };
  }

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
      send("result", { ...cached, elapsedMs: Date.now() - startedAt, fromCache: true, usage: usageInfo });
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
    send("result", { ...payload, elapsedMs: Date.now() - startedAt, usage: usageInfo });
  } catch (e) {
    console.error(e);
    send("error", { error: e.message || "서버 오류가 발생했습니다." });
  } finally {
    res.end();
  }
});

// 현재 IP 기준 무료 확인 잔여 횟수 · 토큰 잔액 조회 (검증을 아직 안 했어도
// 입력창 옆에 미리 보여주기 위한 용도).
app.get("/api/usage", (req, res) => {
  res.json(peekUsage(webUsageKey(req)));
});

// 데모 토큰 충전 — 실제 결제는 없다. 실제 서비스로 넘어가면 이 엔드포인트를
// PG/카카오페이 등 결제 승인 이후에만 토큰을 지급하도록 바꿔야 한다.
app.post("/api/tokens/buy", (req, res) => {
  const count = Math.max(1, Math.min(20, parseInt(req.body?.count, 10) || 1));
  const tokens = addTokensDemo(webUsageKey(req), count);
  res.json({ tokens, demo: true });
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
