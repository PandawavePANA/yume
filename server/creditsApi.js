import express from "express";
import { patchAsync } from "./asyncExpress.js";
import { requireUser } from "./auth.js";
import { audit } from "./audit.js";
import { clientIp, createLimiter, limitMiddleware } from "./security.js";
import { CREDIT_KRW, CREDIT_PACKS, PLAN_CREDITS, balance, ensureMonthlyGrant, listLedger, listUserCreditRequests, requestCreditPack } from "./credits.js";
import { POINTS, QUARTER_REWARDS, leaderboard, listLedger as listContribLedger, periodEndsAt, periodOf, rankOf, handleFor } from "./contribution.js";
import { effectivePlan } from "./usageStore.js";
import { listUserBounties, submitBounty } from "./bounty.js";
import { PLATFORMS } from "./shareLink.js";
import { referralSummary } from "./referral.js";
import { getVerification } from "./verificationStore.js";
import { now, one, run } from "./db.js";
import { logError } from "./errorLog.js";
import {
  CHANNEL_KEY, IDENTITY_CHANNEL_KEY, STORE_ID,
  confirmIdentity, confirmPayment, identityConfigured, paymentConfigured,
} from "./portone.js";
import { grant, packItem } from "./credits.js";
import crypto from "node:crypto";

const router = patchAsync(express.Router());
router.use(["/credits", "/bounty", "/credit-packs", "/referral", "/contribution", "/checkout", "/identity"], requireUser);

const bountyLimiter = createLimiter({ windowMs: 60 * 60 * 1000, max: 20 });
const purchaseLimiter = createLimiter({ windowMs: 60 * 60 * 1000, max: 10 });
const checkoutLimiter = createLimiter({ windowMs: 60 * 60 * 1000, max: 20 });

router.get("/credits", async (req, res) => {
  const userId = req.user.id;
  const plan = effectivePlan(req.user);
  // 화면을 열어본 김에 이번 달 구독분이 들어왔는지 확인한다. 이미 들어왔으면 아무 일도 없다.
  await ensureMonthlyGrant(req.user);
  res.json({
    balance: await balance(userId),
    creditKrw: CREDIT_KRW,
    plan,
    planCredits: PLAN_CREDITS[plan] ?? PLAN_CREDITS.free,
    packs: CREDIT_PACKS,
    ledger: await listLedger(userId),
    platforms: Object.entries(PLATFORMS).map(([key, p]) => ({ key, label: p.label, host: p.hosts[0] })),
    bounties: await listUserBounties(userId),
    purchases: await listUserCreditRequests(userId),
    reportPoints: POINTS.report,
  });
});

// 기여도 — 내 점수·순위와 전체 랭킹. 크레딧과 완전히 다른 값이라 응답도 따로 준다.
router.get("/contribution", async (req, res) => {
  const me = await rankOf(req.user.id);
  res.json({
    points: me.points,
    rank: me.rank,
    reward: me.reward,
    name: handleFor(req.user),
    scoring: POINTS,
    period: periodOf(),
    periodEndsAt: periodEndsAt(),
    rewards: QUARTER_REWARDS.map((r) => ({ from: r.from, to: r.to, kind: r.kind, label: r.label })),
    ledger: await listContribLedger(req.user.id, 30),
    leaderboard: await leaderboard(50),
  });
});

router.post("/bounty", limitMiddleware(bountyLimiter, (req) => `bounty:${req.user.id}`), async (req, res) => {
  const { verificationId, claimIdx, platform, shareUrl, consent } = req.body || {};
  // 보상은 사실상 데이터를 사는 것이라, 데이터셋 활용 동의 없이는 받지 않는다
  // (dataset.js가 동의한 데이터만 반출하므로 동의 없이 받으면 쓸 수가 없다).
  if (!consent) return res.status(400).json({ error: "제보한 내용을 유메가 데이터로 활용하는 데 동의해주세요." });

  const v = await getVerification(String(verificationId || ""));
  if (!v || v.user_id !== req.user.id) return res.status(404).json({ error: "검증 기록을 찾을 수 없어요." });

  const idx = Number(claimIdx);
  if (!Number.isInteger(idx) || idx < 0) return res.status(400).json({ error: "주장을 지정해주세요." });

  const { bounty, error, duplicate } = await submitBounty({ user: req.user, verification: v, claimIdx: idx, platform: String(platform || ""), shareUrl });
  if (error) return res.status(duplicate ? 409 : 400).json({ error });
  await audit(`user:${req.user.id}`, "bounty_submitted", `bounty:${bounty.id}`, { platform: bounty.platform, identifier: bounty.identifier_value }, clientIp(req));
  res.status(201).json({ bounty: { id: bounty.id, status: bounty.status, createdAt: bounty.created_at } });
});

// 크레딧 추가 구매 — 신청만 받는다. 결제 확인 전에는 크레딧이 늘지 않는다.
router.post("/credit-packs", limitMiddleware(purchaseLimiter, (req) => `pack:${req.user.id}`), async (req, res) => {
  const { packKey, contact } = req.body || {};
  const { request, error } = await requestCreditPack(req.user, String(packKey || ""), contact);
  if (error) return res.status(400).json({ error });
  await audit(`user:${req.user.id}`, "credit_pack_requested", `purchase:${request.id}`, { item: request.item_label, credits: request.credits }, clientIp(req));
  res.status(201).json({ request: { id: request.id, itemLabel: request.item_label, credits: request.credits, status: request.status } });
});

router.get("/referral", async (req, res) => {
  res.json(await referralSummary(req.user.id));
});


// ── 크레딧 결제 (포트원 V2 · KG이니시스) ────────────────────────────────────
// 흐름: 주문 생성 → 브라우저가 결제창 호출 → 서버가 포트원에 조회해 금액 대조 → 지급.
// 금액은 주문 생성 때 서버가 정하고, 지급은 서버 조회가 끝난 뒤에만 한다.

// 결제창을 띄우는 데 필요한 공개 값. 설정이 안 돼 있으면 화면은 예전처럼 "구매 신청"을 받는다.
router.get("/checkout/config", (req, res) => {
  res.json({
    payment: paymentConfigured() ? { storeId: STORE_ID, channelKey: CHANNEL_KEY } : null,
    identity: identityConfigured() ? { storeId: STORE_ID, channelKey: IDENTITY_CHANNEL_KEY } : null,
    identityVerified: !!req.user.identity_verified_at,
  });
});

router.post("/checkout", limitMiddleware(checkoutLimiter, (req) => `checkout:${req.user.id}`), async (req, res) => {
  if (!paymentConfigured()) return res.status(503).json({ error: "결제 연동이 아직 설정되지 않았어요." });
  const item = packItem(String(req.body?.packKey || ""));
  if (!item) return res.status(400).json({ error: "선택한 크레딧 팩을 찾을 수 없어요." });
  const paymentId = `yume-${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;
  await run(
    `INSERT INTO credit_orders (payment_id, user_id, pack_key, credits, amount, status, created_at)
     VALUES (:id, :uid, :key, :credits, :amount, 'pending', :t)`,
    { id: paymentId, uid: req.user.id, key: item.key, credits: item.credits, amount: item.krw, t: now() },
  );
  await audit(`user:${req.user.id}`, "credit_checkout_started", `order:${paymentId}`, { item: item.label, amount: item.krw }, clientIp(req));
  res.json({
    paymentId,
    storeId: STORE_ID,
    channelKey: CHANNEL_KEY,
    orderName: `유메 ${item.label}`,
    totalAmount: item.krw,
    currency: "CURRENCY_KRW",
  });
});

router.post("/checkout/confirm", limitMiddleware(checkoutLimiter, (req) => `confirm:${req.user.id}`), async (req, res) => {
  const paymentId = String(req.body?.paymentId || "");
  const order = await one("SELECT * FROM credit_orders WHERE payment_id = :id AND user_id = :uid", { id: paymentId, uid: req.user.id });
  if (!order) return res.status(404).json({ error: "주문을 찾을 수 없어요." });
  if (order.status === "paid") return res.json({ ok: true, credits: order.credits, already: true });

  const r = await confirmPayment(paymentId, order.amount);
  if (!r.ok) {
    if (r.code !== "AWAITING_DEPOSIT") {
      await run("UPDATE credit_orders SET status = 'failed' WHERE payment_id = :id AND status = 'pending'", { id: paymentId });
      logError("portone:confirm", new Error(`${r.code} :: ${r.message} :: order ${paymentId}`));
    }
    return res.status(r.code === "AWAITING_DEPOSIT" ? 202 : 400).json({ error: r.message, code: r.code });
  }

  // 같은 결제로 두 번 지급되지 않게, 상태가 pending일 때만 paid로 바꾸고 그 성공에만 지급한다.
  const upd = await run(
    "UPDATE credit_orders SET status = 'paid', method = :m, paid_at = :t WHERE payment_id = :id AND status = 'pending'",
    { id: paymentId, m: r.method, t: now() },
  );
  if (!upd.changes) return res.json({ ok: true, credits: order.credits, already: true });
  await grant(order.user_id, order.credits, "purchase", { ref: `purchase:${paymentId}`, memo: `크레딧 구매(${r.method})` });
  await audit(`user:${order.user_id}`, "credit_purchased", `order:${paymentId}`, { credits: order.credits, amount: order.amount, method: r.method }, clientIp(req));
  res.json({ ok: true, credits: order.credits, balance: await balance(order.user_id) });
});

// ── 본인확인 (KG이니시스 통합인증) ──────────────────────────────────────────
// 가입 때 받아 둔 동의(users.identity_agreed_at)가 있는 회원만 인증창을 연다.
// CI는 저장하지 않고 해시만 남긴다 — 같은 사람이 계정을 여러 개 만드는 것만 막는다.
router.post("/identity/start", limitMiddleware(checkoutLimiter, (req) => `identity:${req.user.id}`), (req, res) => {
  if (!identityConfigured()) return res.status(503).json({ error: "본인확인 연동이 아직 설정되지 않았어요." });
  if (!req.user.identity_agreed_at) return res.status(400).json({ error: "본인확인 정보(CI) 수집·이용에 먼저 동의해주세요." });
  res.json({
    identityVerificationId: `yume-id-${Date.now()}-${crypto.randomBytes(6).toString("hex")}`,
    storeId: STORE_ID,
    channelKey: IDENTITY_CHANNEL_KEY,
  });
});

router.post("/identity/confirm", limitMiddleware(checkoutLimiter, (req) => `identity-c:${req.user.id}`), async (req, res) => {
  const id = String(req.body?.identityVerificationId || "");
  if (!id) return res.status(400).json({ error: "본인확인 번호가 없어요." });
  const r = await confirmIdentity(id);
  if (!r.ok) {
    logError("portone:identity", new Error(`${r.code} :: ${r.message}`));
    return res.status(400).json({ error: r.message, code: r.code });
  }
  // 같은 사람이 다른 계정으로 이미 인증했다면 알려 준다. 막지는 않되 기록은 남긴다.
  const dup = await one("SELECT id FROM users WHERE identity_ci_hash = :h AND id != :uid", { h: r.ciHash, uid: req.user.id });
  await run("UPDATE users SET identity_verified_at = :t, identity_ci_hash = :h, identity_name = :n WHERE id = :uid", {
    t: now(), h: r.ciHash, n: r.name || null, uid: req.user.id,
  });
  await audit(`user:${req.user.id}`, "identity_verified", `user:${req.user.id}`, { duplicate: !!dup }, clientIp(req));
  res.json({ ok: true, name: r.name, duplicate: !!dup });
});

export default router;
