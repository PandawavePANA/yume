import { timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { patchAsync } from "./asyncExpress.js";
import { now, one, run, PERSISTENT_STORAGE } from "./db.js";
import { chatReply } from "./claude.js";
import { kakaoSkillHandler } from "./kakaoWebhook.js";
import { renderResultPage } from "./renderResultPage.js";
import { resolveProductLinks } from "./coupang.js";
import { checkAndConsume, refundOne, peekUsage, PLANS } from "./usageStore.js";
import { appendTurns } from "./chatHistory.js";
import { logError } from "./errorLog.js";
import { audit } from "./audit.js";
import { runVerification, MAX_INPUT_CHARS } from "./verifyPipeline.js";
import { getVerification, newVerificationId, trimUserHistory } from "./verificationStore.js";
import authRouter, { attachUser, purgeExpiredAuth } from "./auth.js";
import accountRouter from "./accountApi.js";
import apiV1Router from "./apiV1.js";
import adminApiRouter from "./adminApi.js";
import { openExportDownload, purgeOldExportFiles } from "./dataset.js";
import { renderAdminPage } from "./renderAdminPage.js";
import { renderResetPasswordPage, renderTermsPage, renderPrivacyPage, renderApiDocsPage } from "./renderPages.js";
import { clientIp, createLimiter, limitMiddleware, sameOriginGuard, securityHeaders } from "./security.js";
import { mailConfigured } from "./mailer.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, "..", "dist");

const app = patchAsync(express());
// Railway 등 프록시 뒤에서 req.ip가 실제 접속자 IP를 가리키게 한다(무료 한도·요청 제한이 IP 기준).
app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(securityHeaders);
app.use(express.json({ limit: "256kb" }));

// 외부 개발자용 공개 API — 자체 CORS·키 인증을 쓰므로 쿠키 세션 미들웨어보다 먼저 붙인다.
app.use("/v1", apiV1Router);

app.use("/api", attachUser, sameOriginGuard);
app.use("/api", authRouter);
app.use("/api", accountRouter);

const verifyLimiter = createLimiter({ windowMs: 60_000, max: 6 });
const chatLimiter = createLimiter({ windowMs: 60_000, max: 20 });
const chatDailyLimiter = createLimiter({ windowMs: 24 * 3600 * 1000, max: 150 });

function limitMessage(usage, user) {
  if (usage.reason === "ip_ceiling") return "같은 네트워크에서 오늘 쓸 수 있는 무료 확인 횟수를 모두 사용했어요. 내일 다시 이용해주세요.";
  if (usage.plan !== "free") return `오늘 공정 이용 한도(${usage.dailyLimit}회)에 도달했어요. 내일 다시 이용해주세요.`;
  if (!user) return `오늘 무료 확인 ${usage.dailyLimit}회를 다 쓰셨어요. 로그인하면 기록이 저장되고, 요금제로 더 많이 확인할 수 있어요.`;
  return `오늘 무료 확인 ${usage.dailyLimit}회를 다 쓰셨어요. 내일 다시 이용하거나 요금제를 확인해주세요.`;
}

app.post("/api/verify", limitMiddleware(verifyLimiter, (req) => `verify:${clientIp(req)}`), async (req, res) => {
  const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  if (!text) return res.status(400).json({ error: "검증할 텍스트를 입력해주세요." });
  if (text.length > MAX_INPUT_CHARS) return res.status(413).json({ error: `한 번에 ${MAX_INPUT_CHARS.toLocaleString()}자까지 확인할 수 있어요. 나눠서 붙여넣어 주세요.` });

  const user = req.user;
  const ip = clientIp(req);
  const usage = await checkAndConsume({ user, ip });
  if (!usage.allowed) return res.status(402).json({ error: limitMessage(usage, user), limitReached: true, loggedIn: !!user });

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  const startedAt = Date.now();
  const id = newVerificationId();
  try {
    const { result, fromCache } = await runVerification({
      id,
      text,
      source: "web",
      userId: user?.id ?? null,
      clientKey: user ? `user:${user.id}` : `ip:${ip}`,
      dataConsent: !!user?.data_consent,
      onProgress: (message) => send("progress", { message }),
    });
    if (user) await trimUserHistory(user.id, PLANS[usage.plan].historyLimit);
    send("result", { ...result, id, elapsedMs: Date.now() - startedAt, fromCache, usage: await peekUsage({ user, ip }) });
  } catch (e) {
    await refundOne({ user, ip, usedFree: usage.usedFree }).catch(() => {});
    send("error", { error: e.message || "서버 오류가 발생했습니다." });
  } finally {
    res.end();
  }
});

app.get("/api/usage", async (req, res) => res.json(await peekUsage({ user: req.user, ip: clientIp(req) })));

app.post(
  "/api/chat",
  limitMiddleware(chatLimiter, (req) => `chat:${clientIp(req)}`),
  limitMiddleware(chatDailyLimiter, (req) => `chat-day:${clientIp(req)}`, "오늘 대화 한도에 도달했어요. 내일 다시 이용해주세요."),
  async (req, res) => {
    const messages = (Array.isArray(req.body?.messages) ? req.body.messages : [])
      .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .slice(-10)
      .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));
    if (messages.length === 0) return res.status(400).json({ error: "메시지가 없습니다." });
    try {
      const reply = await chatReply(messages);
      const last = messages[messages.length - 1];
      if (last.role === "user") {
        const clientKey = req.user ? `user:${req.user.id}` : `ip:${clientIp(req)}`;
        await appendTurns(clientKey, [{ role: "user", content: last.content }, { role: "assistant", content: reply }], { channel: "web", userId: req.user?.id ?? null });
      }
      res.json({ reply });
    } catch (e) {
      logError("web:/api/chat", e);
      res.status(500).json({ error: "지금은 답변하기 어려워요. 잠시 후 다시 시도해주세요." });
    }
  },
);

app.get("/api/health", async (req, res) => {
  let dbOk = false;
  try {
    dbOk = (await one("SELECT 1 AS ok")).ok === 1;
  } catch {
    dbOk = false;
  }
  res.status(dbOk ? 200 : 503).json({
    ok: dbOk,
    db: dbOk,
    claudeConfigured: !!process.env.ANTHROPIC_API_KEY,
    lawApiConfigured: !!process.env.LAW_OC,
    mailConfigured: mailConfigured(),
    persistentDb: PERSISTENT_STORAGE,
  });
});

// 카카오 i 오픈빌더 스킬 서버 — 채널 메시지를 오픈빌더가 이 URL로 넘겨준다.
// 스킬 요청에는 서명이 없어 누구나 가짜 사용자 ID로 호출할 수 있으므로, 오픈빌더 스킬 설정의
// 헤더에 X-Yume-Skill-Token(= KAKAO_SKILL_SECRET)을 넣고 여기서 확인한다.
function requireKakaoSecret(req, res, next) {
  const secret = process.env.KAKAO_SKILL_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") return res.status(503).json({ error: "카카오 스킬이 설정되지 않았어요." });
    return next();
  }
  // 오픈빌더에 값을 붙여넣을 때 앞뒤 공백이 섞이는 경우가 많아 양쪽을 다듬어 비교한다.
  const got = (req.get("x-yume-skill-token") || "").trim();
  const want = secret.trim();
  if (got.length !== want.length || !timingSafeEqual(Buffer.from(got), Buffer.from(want))) {
    // 값은 절대 남기지 않고, 무엇이 틀렸는지만 기록한다(관리자 대시보드 → 오류 탭).
    logError("kakao:auth", new Error(got ? `스킬 헤더 값 불일치 (받은 길이 ${got.length}자, 기대 ${want.length}자)` : "스킬 헤더 X-Yume-Skill-Token 없음"));
    return res.status(401).json({ error: "unauthorized" });
  }
  next();
}
app.post("/api/kakao/skill", requireKakaoSecret, kakaoSkillHandler);

app.use("/api/admin", adminApiRouter);

app.use("/api", (req, res) => res.status(404).json({ error: "존재하지 않는 API예요." }));

// ── 서버 렌더링 페이지 ──
const html = (res, body) => res.set("Content-Type", "text/html; charset=utf-8").send(body);
app.get("/admin", (req, res) => html(res.set("Cache-Control", "no-store"), renderAdminPage()));
app.get("/reset-password", (req, res) => html(res, renderResetPasswordPage()));
app.get("/terms", (req, res) => html(res, renderTermsPage()));
app.get("/privacy", (req, res) => html(res, renderPrivacyPage()));
app.get("/docs/api", (req, res) => html(res, renderApiDocsPage(process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get("host")}`)));

// 카카오톡 등 외부 채널로 보낸 검증 결과를 링크로 여는 읽기 전용 페이지.
app.get("/r/:id", async (req, res) => {
  const v = await getVerification(String(req.params.id));
  if (!v) return res.status(404).send("결과를 찾을 수 없습니다. 링크가 올바른지 확인해주세요.");
  const result = v.result ? { ...v.result, related_products: await resolveProductLinks(v.result.related_products || []) } : null;
  html(res, renderResultPage({ id: v.id, input: v.input, status: v.status, result, createdAt: v.created_at }));
});

// 데이터셋 구매처가 받은 반출 링크.
app.get("/datasets/download/:token", async (req, res) => {
  const r = await openExportDownload(String(req.params.token));
  if (r.error) return res.status(r.status).send(r.error);
  await audit(`buyer:${r.exportRow.buyer}`, "data_export_downloaded", `data_export:${r.exportRow.id}`, null, clientIp(req));
  res.set("Cache-Control", "no-store");
  res.set("Content-Type", r.format === "csv" ? "text/csv; charset=utf-8" : "application/x-ndjson; charset=utf-8");
  res.set("Content-Disposition", `attachment; filename="${r.fileName}"`);
  res.send(r.content);
});

// 배포 환경: `npm run build`로 만든 프론트엔드를 같은 서버에서 서빙한다(로컬 개발 중엔 Vite가 담당).
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir, { index: false, maxAge: "1h" }));
  app.get(/^(?!\/(api|v1)\/).*/, (req, res) => res.sendFile(path.join(distDir, "index.html")));
}

// 잘못된 JSON 본문 등 — HTML 에러 페이지 대신 JSON으로.
app.use((err, req, res, _next) => {
  if (err.type === "entity.parse.failed") return res.status(400).json({ error: "JSON 형식이 올바르지 않아요." });
  if (err.type === "entity.too.large") return res.status(413).json({ error: "요청 본문이 너무 커요." });
  logError(`express:${req.method} ${req.path}`, err);
  res.status(500).json({ error: "서버 오류가 발생했어요." });
});

// ── 유지보수 ──
// 서버가 재시작되면 진행 중이던 검증은 끝나지 않으므로 오류로 정리한다.
export function markInterruptedJobs() {
  return run("UPDATE verifications SET status = 'error', error = '서버 재시작으로 중단됨', completed_at = :t WHERE status = 'pending'", { t: now() });
}
const DAY_MS = 24 * 3600 * 1000;
export async function maintenance() {
  try {
    await purgeExpiredAuth();
    await purgeOldExportFiles();
    // 개인정보처리방침의 보유 기간을 그대로 집행한다.
    await run("DELETE FROM verifications WHERE user_id IS NULL AND source IN ('web', 'kakao') AND created_at < :t", { t: now() - 180 * DAY_MS });
    await run("DELETE FROM verifications WHERE source = 'api' AND created_at < :t", { t: now() - 365 * DAY_MS });
    await run("DELETE FROM api_usage WHERE created_at < :t", { t: now() - 365 * DAY_MS });
    await run("DELETE FROM chat_messages WHERE created_at < :t", { t: now() - 180 * DAY_MS });
    await run("DELETE FROM error_logs WHERE created_at < :t", { t: now() - 90 * DAY_MS });
    await run("DELETE FROM usage_daily WHERE day < :d", { d: new Date(now() - 40 * 24 * 3600 * 1000).toISOString().slice(0, 10) });
    await run("UPDATE verifications SET status = 'error', error = '시간 초과', completed_at = :t WHERE status = 'pending' AND created_at < :cutoff", {
      t: now(),
      cutoff: now() - 10 * 60 * 1000,
    });
  } catch (e) {
    logError("maintenance", e);
  }
}

export default app;
