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
import creditsRouter from "./creditsApi.js";
import portoneWebhookRouter from "./portoneWebhook.js";
import { auditRouter, getAuditReport, renderAuditReport } from "./auditApi.js";
import { inquiryRouter } from "./inquiryApi.js";
import { creditReferralOnActivity } from "./referral.js";
import { awardForVerification } from "./contribution.js";
import apiV1Router from "./apiV1.js";
import adminApiRouter from "./adminApi.js";
import { studioRouter } from "./studioApi.js";
import { renderStudioPage } from "./renderStudioPage.js";
import { adminLogin, adminLogout, hasAdminCookie, renderLoginPage } from "./adminGate.js";
import { openExportDownload, purgeOldExportFiles } from "./dataset.js";
import { renderAdminPage } from "./renderAdminPage.js";
import { renderResetPasswordPage, renderTermsPage, renderPrivacyPage, renderRefundPage, renderProductsPage, renderAccountDeletionPage, renderApiDocsPage } from "./renderPages.js";
import { clientIp, createLimiter, limitMiddleware, sameOriginGuard, securityHeaders, IS_PROD } from "./security.js";
import { mailConfigured } from "./mailer.js";
import { UpstreamError, OPERATOR_NOTE, userMessageFor, upstreamStatus } from "./upstream.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, "..", "dist");

const app = patchAsync(express());
// Railway 등 프록시 뒤에서 req.ip가 실제 접속자 IP를 가리키게 한다(무료 한도·요청 제한이 IP 기준).
app.set("trust proxy", 1);
app.disable("x-powered-by");

// www 없는 주소로 들어오면 www로 넘긴다.
//
// 지금 apex(yume-reamer.com)는 호스팅 업체 파킹 페이지를 가리키고 있어 여기까지 오지도
// 않지만, DNS를 이 서버로 돌리는 순간 두 주소가 동시에 살아난다. 그러면 같은 사이트가
// 출처가 다른 두 곳이 되어 세션 쿠키가 갈리고, 공유 링크와 검색 색인도 둘로 쪼개진다.
// 미리 한 곳으로 모아 둔다.
const CANONICAL_HOST = process.env.CANONICAL_HOST || "www.yume-reamer.com";
const APEX_HOST = CANONICAL_HOST.replace(/^www\./, "");
app.use((req, res, next) => {
  // trust proxy가 켜져 있어 req.hostname은 프록시가 붙인 X-Forwarded-Host를 따른다.
  const host = String(req.hostname || "").toLowerCase();
  if (host !== APEX_HOST) return next();
  return res.redirect(301, `https://${CANONICAL_HOST}${req.originalUrl}`);
});
app.use(securityHeaders);

// 포트원 웹훅은 서명을 원문 그대로에 대해 확인한다. JSON 파서가 먼저 본문을 먹으면
// 원문이 사라져 검증이 깨지므로, 파서보다 앞에 붙인다.
app.use("/api", portoneWebhookRouter);

app.use(express.json({ limit: "256kb" }));

// 외부 개발자용 공개 API — 자체 CORS·키 인증을 쓰므로 쿠키 세션 미들웨어보다 먼저 붙인다.
app.use("/v1", apiV1Router);

// 무료 할루시네이션 점검 — 기업용 사이트(별도 도메인)에서 부르므로 자체 CORS를 쓴다.
// 쿠키 세션 미들웨어보다 먼저 붙여야 동일 출처 가드에 걸리지 않는다(/v1과 같은 이유).
app.use("/api", auditRouter);
app.use("/api", inquiryRouter);

app.use("/api", attachUser, sameOriginGuard);
app.use("/api", authRouter);
app.use("/api", accountRouter);
app.use("/api", creditsRouter);

const verifyLimiter = createLimiter({ windowMs: 60_000, max: 6 });
const chatLimiter = createLimiter({ windowMs: 60_000, max: 20 });
const chatDailyLimiter = createLimiter({ windowMs: 24 * 3600 * 1000, max: 150 });

function limitMessage(usage, user) {
  if (usage.reason === "ip_ceiling") return "같은 네트워크에서 오늘 쓸 수 있는 무료 확인 횟수를 모두 사용했어요. 내일 다시 이용해주세요.";
  // 크레딧 소진은 하루 한도와 다른 문제다 — 내일이 되어도 풀리지 않으니 그렇게 안내한다.
  if (usage.reason === "no_credits") {
    // 길이만큼 차감하므로, 잔액은 있는데 이번 입력에는 모자란 경우가 생긴다.
    // 그때 "모두 사용했다"고만 하면 화면의 잔액과 말이 어긋난다.
    return usage.credits > 0
      ? `이번 입력은 ${usage.needed}크레딧이 필요한데 ${usage.credits}크레딧이 남아 있어요. 더 짧게 나눠 넣거나 크레딧을 추가로 구매해주세요.`
      : "이번 달 크레딧을 모두 사용했어요. 계정 설정 → 크레딧에서 추가로 구매하거나, 다음 달 지급을 기다려주세요.";
  }
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

  // 계정으로 쓰려면 휴대폰 본인확인을 마쳐야 한다.
  //
  // 크레딧·기여도·분기 보상이 걸려 있어서, 계정을 여러 개 만드는 것이 이득이 되는 구조다.
  // 이메일은 얼마든지 만들 수 있지만 휴대폰 본인확인은 그렇지 않다. 가입 자체를 막지 않고
  // 여기서 막는 이유는, 인증 창이 계정과 세션이 있어야 열리기 때문이다 —
  // 계정은 만들어지되 확인 전에는 아무것도 할 수 없다.
  //
  // 로그인하지 않은 사람은 예전처럼 하루 무료 횟수로 쓴다. 그쪽은 쌓이는 것이 없어
  // 계정을 여러 개 만들 이유가 없다.
  if (user && !user.identity_verified_at) {
    return res.status(403).json({
      error: "휴대폰 본인확인을 마치면 바로 이용하실 수 있어요.",
      code: "IDENTITY_REQUIRED",
    });
  }

  const usage = await checkAndConsume({ user, ip, chars: text.length });
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
    // 여기부터는 검증이 이미 끝나 저장된 뒤의 부수 작업이다. 여기서 던지면 아래 catch가
    // 크레딧을 환급하고 오류를 보내는데, 결과는 이미 기록에 남아 있어 공짜 검증이 된다.
    // 결과는 그대로 내보내고 실패는 기록만 남긴다.
    if (user) {
      await trimUserHistory(user.id, PLANS[usage.plan].historyLimit).catch((e) => logError("verify:trimHistory", e));
      // 추천으로 가입한 사람이 첫 검증을 마치면 추천한 사람에게 크레딧이 지급된다.
      await creditReferralOnActivity(user.id);
      // 기여도 — 검증 10점, 사실과 다른 주장이 실제로 잡혔으면 발견 50점을 더한다.
      await awardForVerification(user.id, id, result?.claims).catch((e) => logError("verify:contribution", e));
    }
    const usageAfter = await peekUsage({ user, ip }).catch(() => null);
    send("result", { ...result, id, elapsedMs: Date.now() - startedAt, fromCache, usage: usageAfter });
  } catch (e) {
    await refundOne({ user, ip, usedFree: usage.usedFree, creditsSpent: usage.creditsSpent }).catch(() => {});
    // 상류(Anthropic) 장애는 사용자 잘못이 아니다. 원문 오류를 그대로 보여주면
    // 자기 입력이나 계정 문제로 오해하고 같은 요청을 반복하게 되므로, 원인별 안내로
    // 바꿔 보내고 진짜 원인은 서버 로그에만 남긴다.
    if (e instanceof UpstreamError) {
      logError(`upstream:${e.code}`, new Error(`${OPERATOR_NOTE[e.code] || ""} :: ${e.message}`));
      send("error", { error: userMessageFor(e.code), upstream: true });
    } else {
      send("error", { error: e.message || "서버 오류가 발생했습니다." });
    }
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
    // 키가 설정돼 있어도 결제 잔액이 떨어지면 검증만 죽는다. 서버는 멀쩡히 떠 있어서
    // 제일 늦게 발견되는 상태라, 상태 점검에 원인과 대처를 함께 드러낸다.
    upstream: upstreamStatus(),
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

// 로그인·로그아웃은 관리자 라우터보다 **앞에** 둔다. 뒤에 두면 requireAdmin이
// 먼저 걸려서, 로그인하려면 이미 로그인해 있어야 하는 상태가 된다.
app.post("/api/admin/login", adminLogin);
app.post("/api/admin/logout", adminLogout);

app.use("/api/admin", adminApiRouter);
// 스튜디오 보드도 같은 문(requireAdmin)을 쓴다. 관리자 화면이 둘인데 문이 둘이면
// 한쪽만 잠그는 실수가 반드시 생긴다.
app.use("/api/admin", studioRouter);

app.use("/api", (req, res) => res.status(404).json({ error: "존재하지 않는 API예요." }));

// ── 서버 렌더링 페이지 ──
const html = (res, body) => res.set("Content-Type", "text/html; charset=utf-8").send(body);
// 관리자 화면. 들어갈 자격이 없으면 화면 대신 비밀번호를 묻는다.
// 유메 관리자 계정으로 로그인해 있으면 그대로 통과한다.
const adminPage = (render) => (req, res) => {
  res.set("Cache-Control", "no-store").set("X-Robots-Tag", "noindex, nofollow");
  const allowed = req.user?.role === "admin" || hasAdminCookie(req);
  html(res, allowed ? render() : renderLoginPage(req.path));
};
// attachUser는 /api에만 붙어 있어서 이 경로에서는 req.user가 비어 있다. 여기서
// 직접 붙여야 유메 관리자 계정으로 로그인한 사람이 비밀번호를 또 묻지 않는다.
app.get("/admin", attachUser, adminPage(renderAdminPage));
app.get("/admin/studio", attachUser, adminPage(renderStudioPage));
app.get("/reset-password", (req, res) => html(res, renderResetPasswordPage()));
app.get("/terms", (req, res) => html(res, renderTermsPage()));
app.get("/privacy", (req, res) => html(res, renderPrivacyPage()));
app.get("/refund", (req, res) => html(res, renderRefundPage()));
app.get("/products", (req, res) => html(res, renderProductsPage()));
app.get("/account-deletion", (req, res) => html(res, renderAccountDeletionPage()));
app.get("/docs/api", (req, res) => html(res, renderApiDocsPage(process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get("host")}`)));
// 서비스 소개 릴(화면 녹화용) — 빌드에 포함된 정적 파일을 확장자 없는 주소로도 열어준다.
app.get("/showreel", (req, res, next) => res.sendFile(path.join(distDir, "showreel.html"), (err) => (err ? next() : undefined)));

// 카카오톡 등 외부 채널로 보낸 검증 결과를 링크로 여는 읽기 전용 페이지.
// 감사 리포트 공유 링크 — 받은 쪽이 사내에 그대로 돌릴 수 있도록.
app.get("/audit/r/:id", async (req, res, next) => {
  const report = await getAuditReport(req.params.id);
  if (!report) return next();
  const base = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get("host")}`;
  html(res.set("X-Robots-Tag", "noindex, nofollow").set("Cache-Control", "no-store"), renderAuditReport(report, { baseUrl: base }));
});

app.get("/r/:id", async (req, res) => {
  const v = await getVerification(String(req.params.id));
  res.set("X-Robots-Tag", "noindex, nofollow"); // 이용자 원문이 담긴 페이지 — 검색 노출 금지
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
  if (!IS_PROD) console.error(`[express:${req.method} ${req.path}]`, err);
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
