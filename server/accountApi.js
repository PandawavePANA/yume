import express from "express";
import { patchAsync } from "./asyncExpress.js";
import { requireUser, publicUser, listUserSessions } from "./auth.js";
import { all } from "./db.js";
import { PLANS, effectivePlan } from "./usageStore.js";
import { listUserHistory, getVerification, deleteUserVerification } from "./verificationStore.js";
import { createApiKey, listUserKeys, revokeUserKey } from "./apiKeys.js";
import { audit } from "./audit.js";
import { clientIp } from "./security.js";

const router = patchAsync(express.Router());
// /api에 붙는 라우터라, 이 파일의 경로에만 로그인 요구를 건다(다른 /api 경로는 통과).
router.use(["/history", "/account/api-keys", "/account/export"], requireUser);

router.get("/history", async (req, res) => {
  const limit = PLANS[effectivePlan(req.user)].historyLimit || 200;
  res.json({ items: await listUserHistory(req.user.id, limit) });
});

router.get("/history/:id", async (req, res) => {
  const v = await getVerification(String(req.params.id));
  if (!v || v.user_id !== req.user.id) return res.status(404).json({ error: "기록을 찾을 수 없어요." });
  res.json({ id: v.id, input: v.input, result: v.result, createdAt: v.created_at });
});

router.delete("/history/:id", async (req, res) => {
  if (!(await deleteUserVerification(req.user.id, String(req.params.id)))) return res.status(404).json({ error: "기록을 찾을 수 없어요." });
  res.json({ ok: true });
});

router.get("/account/api-keys", async (req, res) => {
  res.json({ keys: await listUserKeys(req.user.id) });
});

router.post("/account/api-keys", async (req, res) => {
  const { key, record, error } = await createApiKey(req.user, req.body?.label);
  if (error) return res.status(400).json({ error });
  await audit(`user:${req.user.id}`, "api_key_created", `api_key:${record.id}`, { label: record.label }, clientIp(req));
  res.status(201).json({ key, record });
});

router.delete("/account/api-keys/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || !(await revokeUserKey(req.user.id, id))) return res.status(404).json({ error: "키를 찾을 수 없거나 이미 폐기됐어요." });
  await audit(`user:${req.user.id}`, "api_key_revoked", `api_key:${id}`, null, clientIp(req));
  res.json({ ok: true });
});

// 개인정보 열람·이동 요구 대응 — 내 계정에 저장된 정보를 JSON으로 내려받는다.
router.get("/account/export", async (req, res) => {
  const uid = req.user.id;
  const verifications = await all("SELECT id, input, result_json, created_at FROM verifications WHERE user_id = :uid ORDER BY created_at", { uid });
  const payload = {
    exportedAt: new Date().toISOString(),
    profile: publicUser(req.user),
    consents: {
      termsAgreedAt: new Date(req.user.terms_agreed_at).toISOString(),
      privacyAgreedAt: new Date(req.user.privacy_agreed_at).toISOString(),
      dataConsent: !!req.user.data_consent,
      dataConsentChangedAt: req.user.data_consent_at ? new Date(req.user.data_consent_at).toISOString() : null,
    },
    sessions: await listUserSessions(uid),
    verifications: verifications.map((v) => ({
      id: v.id,
      input: v.input,
      result: v.result_json ? JSON.parse(v.result_json) : null,
      createdAt: new Date(v.created_at).toISOString(),
    })),
    chats: await all("SELECT role, content, created_at FROM chat_messages WHERE user_id = :uid ORDER BY id", { uid }),
    apiKeys: await listUserKeys(uid),
  };
  await audit(`user:${uid}`, "personal_data_exported", `user:${uid}`, null, clientIp(req));
  res.set("Content-Disposition", `attachment; filename="yume-my-data-${new Date().toISOString().slice(0, 10)}.json"`);
  res.json(payload);
});

export default router;
