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
import { checkAndConsume, refundOne, peekUsage, PLANS, FREE_DAILY_CHECKS } from "./usageStore.js";
import { CREDIT_PACKS, PLAN_CREDITS } from "./credits.js";
import { appendTurns } from "./chatHistory.js";
import { logError } from "./errorLog.js";
import { repairContext, MAX_TRANSCRIPT_CHARS, MIN_TRANSCRIPT_CHARS } from "./contextRepair.js";
import { fetchSharedChat, LinkError, supportedHosts } from "./chatLink.js";
import { audit } from "./audit.js";
import { runVerification, MAX_INPUT_CHARS } from "./verifyPipeline.js";
import { getVerification, newVerificationId, trimUserHistory } from "./verificationStore.js";
import authRouter, { attachUser, purgeExpiredAuth } from "./auth.js";
import accountRouter from "./accountApi.js";
import creditsRouter from "./creditsApi.js";
import portoneWebhookRouter from "./portoneWebhook.js";
import { auditRouter, getAuditReport, renderAuditReport } from "./auditApi.js";
import { inquiryRouter } from "./inquiryApi.js";
import { threadRouter } from "./threadApi.js";
import screenshotRouter from "./screenshotApi.js";
import { creditReferralOnActivity } from "./referral.js";
import { awardForVerification } from "./contribution.js";
import apiV1Router from "./apiV1.js";
import mcpRouter from "./mcp.js";
import adminApiRouter, { requireAdmin } from "./adminApi.js";
import { studioRouter } from "./studioApi.js";
import { deskRouter } from "./deskApi.js";
import { renderDeskPage } from "./renderDeskPage.js";
import { renderFunnelPage } from "./renderFunnelPage.js";
import { recordEvent, funnel, dailyCost } from "./events.js";
import { dailyBudgetUsd, todaySpendUsd, USD_KRW } from "./costGuard.js";
import { renderStudioPage } from "./renderStudioPage.js";
import { adminLogin, adminLogout, hasAdminCookie, renderLoginPage } from "./adminGate.js";
import { renderProductPage } from "./renderProductPage.js";
import { openExportDownload, purgeOldExportFiles } from "./dataset.js";
import { renderAdminPage } from "./renderAdminPage.js";
import { renderResetPasswordPage, renderTermsPage, renderPrivacyPage, renderRefundPage, renderProductsPage, renderAccountDeletionPage, renderApiDocsPage, renderExtensionPrivacyPage } from "./renderPages.js";
import { clientIp, createLimiter, limitMiddleware, sameOriginGuard, securityHeaders, IS_PROD } from "./security.js";
import { localizeResponses } from "./i18n.js";
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
// 오류·안내 문구를 사용자의 언어로 내보낸다. 라우터보다 앞에 붙어야 모든 응답을 덮는다.
// 한국어 요청에는 아무 일도 하지 않는다.
app.use(localizeResponses);

// 포트원 웹훅은 서명을 원문 그대로에 대해 확인한다. JSON 파서가 먼저 본문을 먹으면
// 원문이 사라져 검증이 깨지므로, 파서보다 앞에 붙인다.
app.use("/api", portoneWebhookRouter);

const jsonBody = express.json({ limit: "256kb" });
// 캡처 업로드와 의뢰 대화 사진만 큰 본문을 받는다. 전역 상한을 올리면 모든 엔드포인트가
// 같이 열리므로 이 경로들만 비켜 가게 하고, 각자 자기 파서를 따로 붙인다.
const BIG_BODY = /^\/api\/(screenshot|thread\/photo|admin\/desk\/\d+\/photo)$/;
app.use((req, res, next) => (BIG_BODY.test(req.path) ? next() : jsonBody(req, res, next)));

// 외부 개발자용 공개 API — 자체 CORS·키 인증을 쓰므로 쿠키 세션 미들웨어보다 먼저 붙인다.
app.use("/v1", apiV1Router);
// MCP — ChatGPT·클로드가 유메를 도구로 부르는 자리. /v1과 같은 키를 쓰므로 같은 칸에 둔다.
app.use(mcpRouter);

// 무료 할루시네이션 점검 — 기업용 사이트(별도 도메인)에서 부르므로 자체 CORS를 쓴다.
// 쿠키 세션 미들웨어보다 먼저 붙여야 동일 출처 가드에 걸리지 않는다(/v1과 같은 이유).
app.use("/api", auditRouter);
app.use("/api", inquiryRouter);
// 의뢰 스레드(대화·견적·결제) — 리머 사이트가 부른다. 토큰 헤더로만 인증하므로
// 쿠키 세션 미들웨어보다 앞에 둔다(위 둘과 같은 이유).
app.use("/api", threadRouter);

app.use("/api", attachUser, sameOriginGuard);
app.use("/api", authRouter);
app.use("/api", accountRouter);
app.use("/api", creditsRouter);
// 캡처 읽기. 본문이 크므로 자기 파서를 달고 들어온다(위 전역 파서는 이 경로를 건너뛴다).
app.use("/api", express.json({ limit: "28mb" }), screenshotRouter);

const verifyLimiter = createLimiter({ windowMs: 60_000, max: 6 });

// 방문 한 줄(유입 측정). 화면이 세션마다 한 번 보낸다. 받는 값은 헤더의 익명 id와 출처뿐이다.
const evLimiter = createLimiter({ windowMs: 60_000, max: 20 });
app.post("/api/ev", limitMiddleware(evLimiter, (req) => `ev:${clientIp(req)}`), (req, res) => {
  if (req.body?.kind !== "visit") return res.status(400).json({ error: "알 수 없는 기록이에요." });
  recordEvent("visit", { req });
  res.status(204).end();
});
// 문맥 복구는 대화 전체를 통째로 보내므로 한 번이 무겁다. 검증보다 낮게 잡는다.
const repairLimiter = createLimiter({ windowMs: 60_000, max: 3 });
const chatLimiter = createLimiter({ windowMs: 60_000, max: 20 });
const chatDailyLimiter = createLimiter({ windowMs: 24 * 3600 * 1000, max: 150 });

// 한도에 걸린 사람은 방금 질문을 써 넣고 답을 못 받은 사람이다. 쓸 마음이 가장 큰 순간이라
// 두 가지를 꼭 말한다 — 언제 다시 풀리는지, 지금 풀려면 얼마인지. 그리고 사실만 말한다.
// 예전 문구는 "로그인하면 더 많이 확인할 수 있어요"였는데, 그때는 가입하면 오히려 줄었다.
const RESET_AT = "내일 0시(한국 시간)";
const cheapestPack = () => CREDIT_PACKS[0];
const packLine = () => `${cheapestPack().credits}크레딧 ${cheapestPack().krw.toLocaleString("ko-KR")}원부터`;

// 본인확인은 크레딧을 쓰기 시작할 때만 묻는다(usageStore checkAndConsume의 canSpendCredits).
// 화면은 이 코드를 받으면 인증 창을 띄우고, 마치면 방금 누른 확인을 그대로 이어서 한다.
const canSpend = (user) => !user || !!user.identity_verified_at;
const IDENTITY_FOR_CREDITS = {
  error: "오늘 무료 3회를 다 쓰셨어요. 크레딧으로 더 확인하려면 휴대폰 본인확인이 한 번 필요해요.",
  code: "IDENTITY_REQUIRED",
};

function limitMessage(usage, user) {
  // 오늘 준비한 무료분(AI 비용 상한, costGuard)이 다 찼다. 사람 탓이 아니라는 걸 먼저 말한다.
  if (usage.reason === "free_paused") {
    return user
      ? `오늘은 이용자가 많아 준비한 무료 확인이 모두 찼어요. ${RESET_AT}에 다시 열려요. 지금 더 확인하려면 크레딧이 필요해요(${packLine()}).`
      : `오늘은 이용자가 많아 준비한 무료 확인이 모두 찼어요. ${RESET_AT}에 다시 열려요. 가입하고 크레딧을 충전하면 지금도 확인할 수 있어요.`;
  }
  if (usage.reason === "ip_ceiling") return `같은 네트워크에서 오늘 쓸 수 있는 무료 확인 횟수를 모두 사용했어요. ${RESET_AT}에 다시 이용하실 수 있어요.`;
  // 크레딧 소진은 하루 한도와 다른 문제다 — 내일이 되어도 풀리지 않으니 그렇게 안내한다.
  if (usage.reason === "no_credits") {
    // 길이만큼 차감하므로, 잔액은 있는데 이번 입력에는 모자란 경우가 생긴다.
    // 그때 "모두 사용했다"고만 하면 화면의 잔액과 말이 어긋난다.
    return usage.credits > 0
      ? `이번 입력은 ${usage.needed}크레딧이 필요한데 ${usage.credits}크레딧이 남아 있어요. 더 짧게 나눠 넣거나 크레딧을 추가로 구매해주세요.`
      : `오늘 무료 확인 ${FREE_DAILY_CHECKS}회를 다 쓰셨어요. ${RESET_AT}에 다시 ${FREE_DAILY_CHECKS}회가 생겨요. 지금 더 확인하려면 크레딧이 필요해요(${packLine()}).`;
  }
  // 로그인한 사람이 하루 상한(무료분 + 크레딧분)까지 다 쓴 경우. 크레딧이 남아 있어도 오늘은 끝이다.
  if (user) return `오늘 이용 한도(${usage.dailyLimit}회)에 도달했어요. ${RESET_AT}에 다시 이용하실 수 있어요.`;
  return (
    `오늘 무료 확인 ${FREE_DAILY_CHECKS}회를 다 쓰셨어요. ${RESET_AT}에 다시 ${FREE_DAILY_CHECKS}회가 생겨요. ` +
    `가입하면 매일 무료 ${FREE_DAILY_CHECKS}회는 그대로이고 기록이 저장돼요. 휴대폰 본인확인까지 마치면 매달 ${PLAN_CREDITS.free}크레딧을 더 드려요.`
  );
}

app.post("/api/verify", limitMiddleware(verifyLimiter, (req) => `verify:${clientIp(req)}`), async (req, res) => {
  const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  if (!text) return res.status(400).json({ error: "검증할 텍스트를 입력해주세요." });
  if (text.length > MAX_INPUT_CHARS) return res.status(413).json({ error: `한 번에 ${MAX_INPUT_CHARS.toLocaleString()}자까지 확인할 수 있어요. 나눠서 붙여넣어 주세요.` });

  const user = req.user;
  const ip = clientIp(req);

  // 휴대폰 본인확인은 크레딧을 쓰기 시작할 때만 요구한다.
  //
  // 크레딧·공헌도·분기 보상이 걸려 있어서 계정을 여러 개 만드는 것이 이득이 되는 구조이고,
  // 이메일과 달리 휴대폰 본인확인은 여러 개 만들 수 없다. 예전에는 가입하자마자 확인을 요구해
  // 확인 전에는 아무것도 못 했는데, 그러면 가입이 익명보다 불편한 단계가 된다. 하루 무료 3회는
  // 익명에게도 주는 것이라 계정마다 확인할 이유가 없고, 보상은 아래에서 확인된 계정에만 준다.
  // 같은 IP 하루 상한(usageStore IP_DAILY_CEILING)이 계정 여러 개로 무료분을 불리는 것을 막는다.
  const usage = await checkAndConsume({ user, ip, chars: text.length, canSpendCredits: canSpend(user) });
  if (usage.reason === "identity_required") return res.status(403).json(IDENTITY_FOR_CREDITS);
  if (usage.reason === "free_paused" && user && !canSpend(user)) return res.status(403).json(IDENTITY_FOR_CREDITS);
  if (!usage.allowed) return res.status(402).json({ error: limitMessage(usage, user), limitReached: true, loggedIn: !!user });
  recordEvent("check", { req, userId: user?.id || null });

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
      // 단계가 끝날 때마다 지금까지의 주장을 내보낸다. 화면은 이걸로 결과를 미리 그린다 —
      // 첫 판정이 5~8초에 보이고 나머지가 그 위에서 채워진다.
      onClaims: (claims) => send("claims", { claims }),
    });
    // 확인할 주장을 하나도 못 찾았으면 사용자는 아무것도 받지 못했다. 횟수를 돌려준다.
    //
    // 한 줄 질문을 열면서 이 경우가 흔해졌다 — "대한민국의 수도는 어디야?"처럼 확인할
    // 내용 없이 묻기만 하면 대조할 것이 없다. 처음 온 사람의 첫 시도가 그렇게 끝나는데
    // 무료 1회까지 사라지면, 잘못한 것도 없이 손해만 보고 나가게 된다.
    // 원가(추출 호출)는 우리가 떠안는다. 반복은 요청 제한이 막는다.
    if (!result?.claims?.length) {
      await refundOne({ user, ip, usedFree: usage.usedFree, creditsSpent: usage.creditsSpent }).catch((e) => logError("verify:refundEmpty", e));
    }

    // 여기부터는 검증이 이미 끝나 저장된 뒤의 부수 작업이다. 여기서 던지면 아래 catch가
    // 크레딧을 환급하고 오류를 보내는데, 결과는 이미 기록에 남아 있어 공짜 검증이 된다.
    // 결과는 그대로 내보내고 실패는 기록만 남긴다.
    if (user) {
      await trimUserHistory(user.id, PLANS[usage.plan].historyLimit).catch((e) => logError("verify:trimHistory", e));
    }
    // 보상은 본인확인을 마친 계정에만 준다. 무료 3회는 확인 없이 쓸 수 있게 됐으므로, 여기서 막지
    // 않으면 이메일만 바꿔 만든 계정들이 추천 크레딧과 공헌도(분기 보상)를 쌓는 길이 된다.
    if (user?.identity_verified_at) {
      // 추천으로 가입한 사람이 첫 검증을 마치면 추천한 사람에게 크레딧이 지급된다.
      await creditReferralOnActivity(user.id);
      // 공헌도 — 검증 10점, 사실과 다른 주장이 실제로 잡혔으면 발견 50점을 더한다.
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


// 문맥 복구 — 길어진 대화에서 AI가 앞부분을 잃고 틀린 말을 하기 시작할 때,
// 다시 붙여넣을 문맥 요약 프롬프트를 만들어 준다.
//
// 검증과 같은 문을 쓴다: 본인확인, 하루 한도, 크레딧. 다른 문을 새로 파면
// 한쪽만 조이는 실수가 나고, 실제로 이쪽이 더 비싼 호출이다.
// 어떤 서비스의 공유 링크를 읽을 수 있는지. 화면의 안내 문구가 서버와 어긋나지
// 않도록 목록은 한 곳에서만 들고 있는다.
app.get("/api/context-repair/sources", (req, res) => res.json({ sources: supportedHosts() }));

app.post("/api/context-repair", limitMiddleware(repairLimiter, (req) => `repair:${clientIp(req)}`), async (req, res) => {
  const link = typeof req.body?.url === "string" ? req.body.url.trim() : "";
  let text = typeof req.body?.transcript === "string" ? req.body.transcript.trim() : "";
  let source = null;

  // 링크가 오면 링크가 우선이다. 링크를 읽는 것이 이 기능의 기본 사용법이고,
  // 붙여넣기는 링크가 막혔을 때의 길이다.
  if (link) {
    try {
      const got = await fetchSharedChat(link, { minChars: MIN_TRANSCRIPT_CHARS });
      text = got.transcript.slice(0, MAX_TRANSCRIPT_CHARS);
      source = { service: got.service, via: got.via };
    } catch (e) {
      if (e instanceof LinkError) return res.status(e.code === "UPSTREAM" ? 502 : 400).json({ error: e.message, code: e.code });
      logError("context-repair:link", e);
      return res.status(502).json({ error: "링크를 여는 데 실패했어요. 대화를 직접 붙여넣어 주세요." });
    }
  }

  if (!text) return res.status(400).json({ error: "대화 공유 링크를 넣거나, 대화를 직접 붙여넣어 주세요." });
  if (text.length < MIN_TRANSCRIPT_CHARS) {
    return res.status(400).json({ error: "대화 내용이 너무 짧아요. 주고받은 내용을 조금 더 붙여넣어 주세요." });
  }
  if (text.length > MAX_TRANSCRIPT_CHARS) {
    if (link) text = text.slice(0, MAX_TRANSCRIPT_CHARS);
    else return res.status(413).json({ error: `한 번에 ${MAX_TRANSCRIPT_CHARS.toLocaleString()}자까지 볼 수 있어요. 최근 대화 위주로 잘라서 붙여넣어 주세요.` });
  }

  const user = req.user;
  const ip = clientIp(req);
  const usage = await checkAndConsume({ user, ip, chars: text.length, canSpendCredits: canSpend(user) });
  if (usage.reason === "identity_required") return res.status(403).json(IDENTITY_FOR_CREDITS);
  if (!usage.allowed) return res.status(402).json({ error: limitMessage(usage, user), limitReached: true, loggedIn: !!user });

  try {
    const result = await repairContext(text);
    res.json({ ...result, source, usage: { plan: usage.plan, remainingFree: usage.remainingFree, credits: usage.credits } });
  } catch (e) {
    if (e.code === "TOO_SHORT") return res.status(400).json({ error: e.message });
    logError("context-repair", e);
    res.status(502).json({ error: userMessageFor(e) });
  }
});

app.get("/api/usage", async (req, res) => res.json(await peekUsage({ user: req.user, ip: clientIp(req) })));
// 크레딧 팩 목록 — 로그인 전에도 보인다. 사기 전에 값을 보는 것이 먼저다(구매는 가입 뒤).
app.get("/api/packs", (req, res) => res.json({ packs: CREDIT_PACKS }));

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

// 유입·비용 화면(/admin/funnel)의 숫자. 같은 문(requireAdmin)을 쓴다.
app.get("/api/admin/funnel", requireAdmin, async (req, res) => {
  const days = Math.max(1, Math.min(90, Math.floor(Number(req.query.days) || 14)));
  const [rows, daysCost, todayUsd] = await Promise.all([funnel(days), dailyCost(days), todaySpendUsd({ fresh: true })]);
  res.json({ rows, days: daysCost, todayUsd, budgetUsd: dailyBudgetUsd(), usdKrw: USD_KRW });
});
app.use("/api/admin", adminApiRouter);
// 스튜디오 보드도 같은 문(requireAdmin)을 쓴다. 관리자 화면이 둘인데 문이 둘이면
// 한쪽만 잠그는 실수가 반드시 생긴다.
app.use("/api/admin", studioRouter);
app.use("/api/admin", deskRouter);

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
app.get("/admin/desk", attachUser, adminPage(renderDeskPage));
app.get("/admin/funnel", attachUser, adminPage(renderFunnelPage));
// 제품별 운영 화면. 화면 코드는 하나이고 제품 키만 다르다.
app.get("/admin/p/:key", attachUser, (req, res) => {
  const page = renderProductPage(String(req.params.key));
  // next()로 흘려보내면 SPA 폴백이 유메 화면을 200으로 돌려준다. 관리자 경로에서
  // 오타를 쳤는데 제품 화면 대신 앱이 뜨면 무엇이 잘못됐는지 알 수 없다.
  if (!page) return res.status(404).type("text/plain; charset=utf-8").send("그런 제품이 없어요.");
  return adminPage(() => page)(req, res);
});
app.get("/reset-password", (req, res) => html(res, renderResetPasswordPage()));
app.get("/terms", (req, res) => html(res, renderTermsPage()));
app.get("/privacy", (req, res) => html(res, renderPrivacyPage()));
// 크롬 웹스토어는 확장이 다루는 데이터만 적은 방침 주소를 따로 요구한다.
app.get("/extension-privacy", (req, res) => html(res, renderExtensionPrivacyPage()));
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
  // 검증 때 이미 풀어 둔 상품은 그대로 쓴다(resolveProductLinks가 isAffiliate 항목은 건너뛴다).
  // 쿠팡 검색은 1시간 10회뿐이라 페이지를 열 때마다 다시 물을 수 없다.
  const result = v.result ? { ...v.result, related_products: await resolveProductLinks(v.result.related_products || []) } : null;
  html(res, renderResultPage({ id: v.id, input: v.input, status: v.status, result, createdAt: v.created_at, ref: String(req.query.ref || "") }));
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
// 스토어(플레이·앱스토어)용 빌드. 앱이 여는 화면은 웹 루트가 아니라 이 경로다
// (capacitor.config.json의 server.url → /app/). 웹과 같은 코드로 만들지만 결과물이 따로라,
// 결제로 가는 길을 뺀 화면을 웹을 건드리지 않고 올릴 수 있다.
//
// 같은 도메인에 두는 이유는 로그인이다 — 다른 도메인이면 세션 쿠키가 교차 출처가 되어
// 앱에서 로그인이 풀린다. 이 경로는 웹 라우팅보다 먼저 붙어야 아래 catch-all에 먹히지 않는다.
// 정적 파일 캐시.
//
// 빌드가 만든 /assets/ 아래 파일은 이름에 내용 해시가 붙는다(index-C2KefLTS.js). 내용이 바뀌면
// 이름이 바뀌므로, 같은 이름의 파일은 영원히 같다. 그런데 1시간만 캐시하라고 보내고 있어서,
// 다시 온 사람의 브라우저가 한 시간마다 서버에 "바뀌었냐"고 물었다. 서버는 미국 동부에 있어서
// 그 한 번이 태평양 왕복이다. 해시 붙은 파일은 1년 동안 묻지도 말라고(immutable) 보낸다.
//
// 반대로 index.html은 절대 오래 들고 있으면 안 된다. 새 배포의 새 파일 이름이 거기 적혀
// 있어서, 옛 index.html을 쥐고 있으면 사라진 옛 JS를 찾다가 흰 화면이 된다.
// 파비콘·OG 이미지 같은 나머지는 이름이 고정이라 하루만 둔다.
const HASHED = /\/assets\//;
function staticFiles(dir) {
  return express.static(dir, {
    index: false,
    setHeaders(res, filePath) {
      const p = filePath.replace(/\\/g, "/");
      if (HASHED.test(p)) res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      else res.setHeader("Cache-Control", "public, max-age=86400");
    },
  });
}
// SPA 진입 파일 — 매번 새로 확인한다(no-cache는 "쓰지 말라"가 아니라 "쓰기 전에 물어보라"다).
const sendShell = (res, file) => res.set("Cache-Control", "no-cache").sendFile(file);

const appDir = path.join(__dirname, "..", "dist-app");
if (fs.existsSync(appDir)) {
  app.use("/app", staticFiles(appDir));
  app.get(/^\/app(\/.*)?$/, (req, res) => sendShell(res, path.join(appDir, "index.html")));
}

if (fs.existsSync(distDir)) {
  app.use(staticFiles(distDir));
  app.get(/^(?!\/(api|v1)\/).*/, (req, res) => sendShell(res, path.join(distDir, "index.html")));
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
