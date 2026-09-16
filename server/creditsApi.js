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

const router = patchAsync(express.Router());
router.use(["/credits", "/bounty", "/credit-packs", "/referral", "/contribution"], requireUser);

const bountyLimiter = createLimiter({ windowMs: 60 * 60 * 1000, max: 20 });
const purchaseLimiter = createLimiter({ windowMs: 60 * 60 * 1000, max: 10 });

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

export default router;
