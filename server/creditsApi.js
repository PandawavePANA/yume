import express from "express";
import { patchAsync } from "./asyncExpress.js";
import { requireUser } from "./auth.js";
import { audit } from "./audit.js";
import { clientIp, createLimiter, limitMiddleware } from "./security.js";
import { BOUNTY_CREDITS, CATALOG, CREDIT_KRW, balance, listLedger, listUserRedemptions, requestRedemption } from "./credits.js";
import { listUserBounties, submitBounty } from "./bounty.js";
import { PLATFORMS } from "./shareLink.js";
import { referralSummary } from "./referral.js";
import { getVerification } from "./verificationStore.js";

const router = patchAsync(express.Router());
router.use(["/credits", "/bounty", "/redemptions", "/referral"], requireUser);

const bountyLimiter = createLimiter({ windowMs: 60 * 60 * 1000, max: 20 });
const redeemLimiter = createLimiter({ windowMs: 60 * 60 * 1000, max: 10 });

router.get("/credits", async (req, res) => {
  const userId = req.user.id;
  res.json({
    balance: await balance(userId),
    creditKrw: CREDIT_KRW,
    bountyCredits: BOUNTY_CREDITS,
    ledger: await listLedger(userId),
    catalog: CATALOG,
    platforms: Object.entries(PLATFORMS).map(([key, p]) => ({ key, label: p.label, host: p.hosts[0] })),
    bounties: await listUserBounties(userId),
    redemptions: await listUserRedemptions(userId),
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

router.post("/redemptions", limitMiddleware(redeemLimiter, (req) => `redeem:${req.user.id}`), async (req, res) => {
  const { itemKey, contact } = req.body || {};
  const { redemption, error } = await requestRedemption(req.user, String(itemKey || ""), contact);
  if (error) return res.status(400).json({ error });
  await audit(`user:${req.user.id}`, "redemption_requested", `redemption:${redemption.id}`, { item: redemption.item_label, credits: redemption.credits }, clientIp(req));
  res.status(201).json({ redemption: { id: redemption.id, itemLabel: redemption.item_label, credits: redemption.credits, status: redemption.status } });
});

router.get("/referral", async (req, res) => {
  res.json(await referralSummary(req.user.id));
});

export default router;
