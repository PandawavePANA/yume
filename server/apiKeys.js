import crypto from "node:crypto";
import { all, kstMonthStart, now, one, run } from "./db.js";
import { sha256 } from "./security.js";
import { PLANS, effectivePlan } from "./usageStore.js";

// 외부 서비스용 검증 API(/v1) 키. 원문 키는 발급 순간 한 번만 보여주고 DB에는 SHA-256
// 해시만 저장한다 — DB가 유출돼도 키를 되살릴 수 없다.
const MAX_ACTIVE_KEYS_PER_USER = 10;
const KEY_PREFIX = "yume_live_";

export async function createApiKey(user, label) {
  const active = (await one("SELECT COUNT(*) AS n FROM api_keys WHERE user_id = :uid AND status = 'active'", { uid: user.id })).n;
  if (active >= MAX_ACTIVE_KEYS_PER_USER) return { error: `활성 키는 계정당 ${MAX_ACTIVE_KEYS_PER_USER}개까지 만들 수 있어요.` };
  const key = KEY_PREFIX + crypto.randomBytes(24).toString("hex");
  const quota = PLANS[effectivePlan(user)].apiMonthlyQuota;
  const r = await run(
    `INSERT INTO api_keys (user_id, label, prefix, key_hash, monthly_quota, created_at)
     VALUES (:uid, :label, :prefix, :hash, :quota, :t) RETURNING id`,
    {
      uid: user.id,
      label: String(label || "").trim().slice(0, 60) || "기본 키",
      prefix: key.slice(0, KEY_PREFIX.length + 6),
      hash: sha256(key),
      quota,
      t: now(),
    },
  );
  return { key, record: await getKeyForUser(user.id, r.rows[0].id) };
}

export function authenticateApiKey(raw) {
  if (!raw || !raw.startsWith(KEY_PREFIX)) return Promise.resolve(null);
  return one(
    `SELECT k.*, u.email AS owner_email, u.status AS owner_status
       FROM api_keys k JOIN users u ON u.id = k.user_id
      WHERE k.key_hash = :h AND k.status = 'active' AND u.status = 'active'`,
    { h: sha256(raw) },
  ).then((row) => row || null);
}

export async function monthlyUsage(keyId) {
  return (
    await one("SELECT COUNT(*) AS n FROM api_usage WHERE api_key_id = :id AND billable = 1 AND created_at >= :since", {
      id: keyId,
      since: kstMonthStart(),
    })
  ).n;
}

export async function recordApiUsage(keyId, { verificationId = null, endpoint, statusCode, billable = false, cached = false }) {
  const t = now();
  await run(
    `INSERT INTO api_usage (api_key_id, verification_id, endpoint, status_code, billable, cached, created_at)
     VALUES (:id, :vid, :ep, :sc, :b, :c, :t)`,
    { id: keyId, vid: verificationId, ep: endpoint, sc: statusCode, b: billable ? 1 : 0, c: cached ? 1 : 0, t },
  );
  await run("UPDATE api_keys SET last_used_at = :t WHERE id = :id", { id: keyId, t });
}

async function shape(k) {
  return {
    id: k.id,
    label: k.label,
    maskedKey: `${k.prefix}…`,
    monthlyQuota: k.monthly_quota,
    usedThisMonth: await monthlyUsage(k.id),
    ratePerMin: k.rate_per_min,
    dataSharing: !!k.data_sharing,
    status: k.status,
    createdAt: k.created_at,
    lastUsedAt: k.last_used_at,
  };
}

export async function getKeyForUser(userId, keyId) {
  const k = await one("SELECT * FROM api_keys WHERE id = :id AND user_id = :uid", { id: keyId, uid: userId });
  return k ? shape(k) : null;
}

export async function listUserKeys(userId) {
  const rows = await all("SELECT * FROM api_keys WHERE user_id = :uid ORDER BY created_at DESC", { uid: userId });
  return Promise.all(rows.map(shape));
}

export async function revokeUserKey(userId, keyId) {
  const r = await run("UPDATE api_keys SET status = 'revoked', revoked_at = :t WHERE id = :id AND user_id = :uid AND status = 'active'", {
    id: keyId,
    uid: userId,
    t: now(),
  });
  return r.changes > 0;
}

// ── 관리자용 ──
export async function listAllKeys(limit = 200) {
  const rows = await all(
    `SELECT k.*, u.email AS owner_email, u.company AS owner_company
       FROM api_keys k JOIN users u ON u.id = k.user_id ORDER BY k.created_at DESC LIMIT :limit`,
    { limit },
  );
  return Promise.all(rows.map(async (k) => ({ ...(await shape(k)), ownerEmail: k.owner_email, ownerCompany: k.owner_company, userId: k.user_id })));
}

export async function adminUpdateKey(keyId, { monthlyQuota, ratePerMin, dataSharing, status }) {
  const k = await one("SELECT * FROM api_keys WHERE id = :id", { id: keyId });
  if (!k) return null;
  const next = {
    id: keyId,
    quota: Number.isFinite(monthlyQuota) ? Math.max(0, Math.floor(monthlyQuota)) : k.monthly_quota,
    rate: Number.isFinite(ratePerMin) ? Math.max(1, Math.floor(ratePerMin)) : k.rate_per_min,
    ds: typeof dataSharing === "boolean" ? (dataSharing ? 1 : 0) : k.data_sharing,
    status: status === "revoked" || status === "active" ? status : k.status,
    revokedAt: status === "revoked" && k.status !== "revoked" ? now() : k.revoked_at,
  };
  await run(
    "UPDATE api_keys SET monthly_quota = :quota, rate_per_min = :rate, data_sharing = :ds, status = :status, revoked_at = :revokedAt WHERE id = :id",
    next,
  );
  return shape(await one("SELECT * FROM api_keys WHERE id = :id", { id: keyId }));
}

// 청구서용 월별 사용량 — 고객(계정)별 과금 대상 호출 수.
export function monthlyBillingReport(monthStartTs, monthEndTs) {
  return all(
    `SELECT u.id AS user_id, u.email, u.company, k.id AS key_id, k.label,
            COUNT(*) FILTER (WHERE a.billable = 1) AS billable_calls,
            COUNT(*) FILTER (WHERE a.cached = 1 AND a.billable = 1) AS cached_calls,
            COUNT(*) AS total_requests
       FROM api_usage a JOIN api_keys k ON k.id = a.api_key_id JOIN users u ON u.id = k.user_id
      WHERE a.created_at >= :from AND a.created_at < :to
      GROUP BY u.id, u.email, u.company, k.id, k.label ORDER BY billable_calls DESC`,
    { from: monthStartTs, to: monthEndTs },
  );
}
