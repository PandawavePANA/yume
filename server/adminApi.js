import crypto from "node:crypto";
import express from "express";
import { patchAsync } from "./asyncExpress.js";
import { all, DB_DESCRIPTION, kstDay, now, one, run, PERSISTENT_STORAGE } from "./db.js";
import { audit, listAudit } from "./audit.js";
import { listErrors } from "./errorLog.js";
import { listAllKeys, adminUpdateKey, monthlyBillingReport } from "./apiKeys.js";
import { listConversations, getConversation } from "./chatHistory.js";
import { getVerification } from "./verificationStore.js";
import { PLANS, grantTokens, walletBalance, effectivePlan } from "./usageStore.js";
import { datasetStats, previewDataset, createExport, listExports, revokeExport } from "./dataset.js";
import { clientIp } from "./security.js";

// 운영자 전용 API. 관리자 권한(role=admin, ADMIN_EMAILS로 지정) 세션이 있거나, 스크립트용으로
// X-Admin-Key 헤더에 ADMIN_SECRET을 보내야 한다. 개인정보를 열람·반출하는 동작은 전부
// audit_logs에 남긴다(개인정보 접속기록).
const router = patchAsync(express.Router());

export function requireAdmin(req, res, next) {
  if (req.user?.role === "admin") {
    req.adminActor = `user:${req.user.id}`;
    return next();
  }
  const secret = process.env.ADMIN_SECRET;
  const provided = req.get("x-admin-key") || "";
  if (secret && provided.length === secret.length && crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(secret))) {
    req.adminActor = "admin-secret";
    return next();
  }
  return res.status(401).json({ error: "관리자 로그인이 필요해요." });
}
router.use(requireAdmin);

const DAY = 24 * 3600 * 1000;
const toInt = (v, d) => (Number.isFinite(Number(v)) ? Math.floor(Number(v)) : d);

// KST 날짜 버킷(Postgres): 밀리초 타임스탬프 → 한국 시간 날짜 문자열
const KST_DAY = "to_char(to_timestamp(created_at / 1000.0) AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD')";

async function dailySeries(days = 30) {
  const since = now() - days * DAY;
  const rows = await all(
    `SELECT ${KST_DAY} AS day, source, COUNT(*) AS n FROM verifications WHERE created_at >= :since GROUP BY 1, 2`,
    { since },
  );
  const signups = await all(`SELECT ${KST_DAY} AS day, COUNT(*) AS n FROM users WHERE created_at >= :since GROUP BY 1`, { since });
  const out = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const day = kstDay(now() - i * DAY);
    const pick = (src) => rows.find((r) => r.day === day && r.source === src)?.n || 0;
    out.push({ day, web: pick("web"), kakao: pick("kakao"), api: pick("api"), signups: signups.find((s) => s.day === day)?.n || 0 });
  }
  return out;
}

router.get("/overview", async (req, res) => {
  const t = now();
  const todayStart = new Date(`${kstDay()}T00:00:00+09:00`).getTime();
  const monthStart = new Date(`${kstDay().slice(0, 7)}-01T00:00:00+09:00`).getTime();
  const k = await one(
    `SELECT
       (SELECT COUNT(*) FROM users) AS users,
       (SELECT COUNT(*) FROM users WHERE created_at >= :week) AS new_users_7d,
       (SELECT COUNT(*) FROM users WHERE plan != 'free' AND (plan_expires_at IS NULL OR plan_expires_at > :t)) AS paid_users,
       (SELECT COUNT(*) FROM users WHERE data_consent = 1 AND status = 'active') AS data_consent_users,
       (SELECT COUNT(*) FROM verifications WHERE created_at >= :today) AS verifications_today,
       (SELECT COUNT(*) FROM verifications WHERE created_at >= :week) AS verifications_7d,
       (SELECT COUNT(*) FROM verifications) AS verifications_total,
       (SELECT COUNT(DISTINCT client_key) FROM verifications WHERE created_at >= :today) AS active_clients_today,
       (SELECT COUNT(*) FROM verifications WHERE status = 'pending') AS pending,
       (SELECT COUNT(*) FROM verifications WHERE status = 'error' AND created_at >= :day) AS errors_24h,
       (SELECT COALESCE(AVG(from_cache), 0)::float8 FROM verifications WHERE status = 'done' AND created_at >= :week) AS cache_hit_rate_7d,
       (SELECT COALESCE(AVG(elapsed_ms), 0)::float8 FROM verifications WHERE status = 'done' AND from_cache = 0 AND created_at >= :week) AS avg_latency_7d,
       (SELECT COUNT(*) FROM api_keys WHERE status = 'active') AS api_keys_active,
       (SELECT COUNT(*) FROM api_usage WHERE billable = 1 AND created_at >= :month) AS api_calls_month,
       (SELECT COUNT(*) FROM claims) AS claims_total,
       (SELECT COUNT(*) FROM claims WHERE nec_json IS NOT NULL) AS nec_judged,
       (SELECT COUNT(*) FROM claims WHERE nec_grade = 'nonexistent') AS nec_nonexistent`,
    { t, week: t - 7 * DAY, today: todayStart, day: t - DAY, month: monthStart },
  );
  res.json({
    generatedAt: t,
    kpis: {
      users: k.users,
      newUsers7d: k.new_users_7d,
      paidUsers: k.paid_users,
      dataConsentUsers: k.data_consent_users,
      verificationsToday: k.verifications_today,
      verifications7d: k.verifications_7d,
      verificationsTotal: k.verifications_total,
      activeClientsToday: k.active_clients_today,
      pending: k.pending,
      errors24h: k.errors_24h,
      cacheHitRate7d: k.cache_hit_rate_7d,
      avgLatencyMs7d: Math.round(k.avg_latency_7d),
      apiKeysActive: k.api_keys_active,
      apiCallsThisMonth: k.api_calls_month,
      claimsTotal: k.claims_total,
      necJudged: k.nec_judged,
      necNonexistent: k.nec_nonexistent,
    },
    series: await dailySeries(30),
    verdicts: await all("SELECT verdict, COUNT(*) AS n FROM claims GROUP BY verdict"),
    domains: await all("SELECT domain, COUNT(*) AS n, COUNT(*) FILTER (WHERE verdict = 'false') AS false_n FROM claims GROUP BY domain ORDER BY n DESC"),
    via: await all("SELECT verified_via AS via, COUNT(*) AS n FROM claims GROUP BY verified_via"),
    plans: await all("SELECT plan, COUNT(*) AS n FROM users GROUP BY plan"),
  });
});

// ── 회원 ──
router.get("/users", async (req, res) => {
  const q = String(req.query.q || "").trim();
  const plan = String(req.query.plan || "");
  const page = Math.max(0, toInt(req.query.page, 0));
  const params = { limit: 50, offset: page * 50 };
  const where = [];
  if (q) {
    where.push("(email ILIKE :q OR name ILIKE :q OR company ILIKE :q)");
    params.q = `%${q}%`;
  }
  if (plan) {
    where.push("plan = :plan");
    params.plan = plan;
  }
  const w = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const rows = await all(
    `SELECT u.id, u.email, u.name, u.company, u.role, u.status, u.plan, u.plan_expires_at, u.data_consent, u.created_at, u.last_login_at,
            (SELECT COUNT(*) FROM verifications v WHERE v.user_id = u.id) AS verification_count,
            (SELECT COUNT(*) FROM api_keys k WHERE k.user_id = u.id AND k.status = 'active') AS key_count
       FROM users u ${w} ORDER BY u.created_at DESC LIMIT :limit OFFSET :offset`,
    params,
  );
  const { limit: _l, offset: _o, ...countParams } = params;
  const total = (await one(`SELECT COUNT(*) AS n FROM users u ${w}`, countParams)).n;
  const users = await Promise.all(rows.map(async (u) => ({ ...u, effectivePlan: effectivePlan(u), tokens: await walletBalance(`user:${u.id}`) })));
  res.json({ total, page, users });
});

router.get("/users/:id", async (req, res) => {
  const id = toInt(req.params.id, 0);
  const u = await one("SELECT * FROM users WHERE id = :id", { id });
  if (!u) return res.status(404).json({ error: "회원을 찾을 수 없어요." });
  const { password_hash: _p, ...user } = u;
  await audit(req.adminActor, "admin_view_user", `user:${id}`, null, clientIp(req));
  res.json({
    user: { ...user, effectivePlan: effectivePlan(u), tokens: await walletBalance(`user:${id}`) },
    verifications: await all(
      "SELECT id, source, status, overall_domain, overall_tone, claim_count, false_count, created_at, substr(input, 1, 80) AS preview FROM verifications WHERE user_id = :id ORDER BY created_at DESC LIMIT 30",
      { id },
    ),
    apiKeys: (await listAllKeys(500)).filter((k) => k.userId === id),
    sessions: await all("SELECT created_at, last_seen_at, ip, user_agent FROM sessions WHERE user_id = :id ORDER BY last_seen_at DESC", { id }),
  });
});

router.patch("/users/:id", async (req, res) => {
  const id = toInt(req.params.id, 0);
  const u = await one("SELECT * FROM users WHERE id = :id", { id });
  if (!u) return res.status(404).json({ error: "회원을 찾을 수 없어요." });
  const b = req.body || {};
  const changes = {};
  if (b.plan !== undefined) {
    if (!PLANS[b.plan]) return res.status(400).json({ error: "알 수 없는 요금제예요." });
    changes.plan = b.plan;
  }
  if (b.planExpiresAt !== undefined) changes.plan_expires_at = b.planExpiresAt ? Number(new Date(b.planExpiresAt)) || null : null;
  if (b.status !== undefined) {
    if (!["active", "suspended"].includes(b.status)) return res.status(400).json({ error: "상태 값이 올바르지 않아요." });
    if (id === req.user?.id && b.status !== "active") return res.status(400).json({ error: "자기 계정은 정지할 수 없어요." });
    changes.status = b.status;
  }
  if (b.role !== undefined) {
    if (!["user", "admin"].includes(b.role)) return res.status(400).json({ error: "역할 값이 올바르지 않아요." });
    if (id === req.user?.id && b.role !== "admin") return res.status(400).json({ error: "자기 관리자 권한은 해제할 수 없어요." });
    changes.role = b.role;
  }
  for (const [col, val] of Object.entries(changes)) await run(`UPDATE users SET ${col} = :val WHERE id = :id`, { val, id });
  if (changes.status === "suspended") await run("DELETE FROM sessions WHERE user_id = :id", { id });
  let tokens;
  if (Number.isFinite(Number(b.grantTokens)) && Number(b.grantTokens) !== 0) {
    tokens = await grantTokens(`user:${id}`, Math.trunc(Number(b.grantTokens)));
    changes.grantTokens = Math.trunc(Number(b.grantTokens));
  }
  await audit(req.adminActor, "admin_update_user", `user:${id}`, changes, clientIp(req));
  res.json({ ok: true, tokens });
});

// ── 검증 기록 ──
router.get("/verifications", async (req, res) => {
  const page = Math.max(0, toInt(req.query.page, 0));
  const params = { limit: 50, offset: page * 50 };
  const where = [];
  for (const [col, key] of [["source", "source"], ["status", "status"], ["overall_domain", "domain"], ["overall_tone", "tone"]]) {
    if (req.query[key]) {
      where.push(`${col} = :${key}`);
      params[key] = String(req.query[key]);
    }
  }
  if (req.query.q) {
    where.push("input ILIKE :q");
    params.q = `%${String(req.query.q)}%`;
  }
  if (req.query.userId) {
    where.push("user_id = :uid");
    params.uid = toInt(req.query.userId, 0);
  }
  const w = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const rows = await all(
    `SELECT v.id, v.source, v.status, v.user_id, v.api_key_id, v.client_key, v.overall_domain, v.overall_tone, v.claim_count,
            v.false_count, v.uncertain_count, v.from_cache, v.data_consent, v.elapsed_ms, v.created_at, substr(v.input, 1, 100) AS preview,
            u.email AS user_email
       FROM verifications v LEFT JOIN users u ON u.id = v.user_id ${w} ORDER BY v.created_at DESC LIMIT :limit OFFSET :offset`,
    params,
  );
  const { limit: _l, offset: _o, ...countParams } = params;
  const total = (await one(`SELECT COUNT(*) AS n FROM verifications ${w}`, countParams)).n;
  res.json({ total, page, items: rows });
});

router.get("/verifications/:id", async (req, res) => {
  const v = await getVerification(String(req.params.id));
  if (!v) return res.status(404).json({ error: "기록을 찾을 수 없어요." });
  await audit(req.adminActor, "admin_view_verification", `verification:${v.id}`, null, clientIp(req));
  res.json(v);
});

// ── API 고객·과금 ──
router.get("/api-keys", async (req, res) => res.json({ keys: await listAllKeys(500) }));

router.patch("/api-keys/:id", async (req, res) => {
  const b = req.body || {};
  const updated = await adminUpdateKey(toInt(req.params.id, 0), {
    monthlyQuota: b.monthlyQuota != null ? Number(b.monthlyQuota) : undefined,
    ratePerMin: b.ratePerMin != null ? Number(b.ratePerMin) : undefined,
    dataSharing: typeof b.dataSharing === "boolean" ? b.dataSharing : undefined,
    status: b.status,
  });
  if (!updated) return res.status(404).json({ error: "키를 찾을 수 없어요." });
  await audit(req.adminActor, "admin_update_api_key", `api_key:${req.params.id}`, b, clientIp(req));
  res.json({ key: updated });
});

function monthRange(ym) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(ym || "")) || /^(\d{4})-(\d{2})/.exec(kstDay());
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const from = Date.UTC(y, mo - 1, 1) - 9 * 3600 * 1000;
  const to = Date.UTC(y, mo, 1) - 9 * 3600 * 1000;
  return { from, to, label: `${m[1]}-${m[2]}` };
}

router.get("/billing", async (req, res) => {
  const { from, to, label } = monthRange(req.query.month);
  const rows = await monthlyBillingReport(from, to);
  if (req.query.format === "csv") {
    const esc = (v) => (/[",\n]/.test(String(v ?? "")) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? ""));
    const csv = ["월,회원ID,이메일,회사,키ID,키 이름,과금 호출,캐시 재사용 호출,전체 요청", ...rows.map((r) => [label, r.user_id, r.email, r.company, r.key_id, r.label, r.billable_calls, r.cached_calls, r.total_requests].map(esc).join(","))].join("\r\n");
    await audit(req.adminActor, "admin_billing_export", label, { rows: rows.length }, clientIp(req));
    res.set("Content-Type", "text/csv; charset=utf-8");
    res.set("Content-Disposition", `attachment; filename="yume-api-billing-${label}.csv"`);
    return res.send("﻿" + csv);
  }
  res.json({ month: label, rows });
});

// ── 데이터셋 ──
router.get("/dataset/stats", async (req, res) => res.json(await datasetStats()));

router.post("/dataset/preview", async (req, res) => res.json(await previewDataset(req.body?.filters || {})));

router.get("/dataset/exports", async (req, res) => res.json({ exports: await listExports() }));

router.post("/dataset/exports", async (req, res) => {
  const b = req.body || {};
  const r = await createExport({
    buyer: b.buyer,
    purpose: b.purpose,
    filters: b.filters || {},
    format: b.format,
    priceKrw: b.priceKrw,
    validDays: b.validDays,
    maxDownloads: b.maxDownloads,
    actor: req.adminActor,
  });
  if (r.error) return res.status(400).json({ error: r.error });
  await audit(req.adminActor, "data_export_created", `data_export:${r.id}`, { buyer: b.buyer, purpose: b.purpose, records: r.recordCount, filters: b.filters }, clientIp(req));
  const base = process.env.PUBLIC_BASE_URL ? process.env.PUBLIC_BASE_URL.replace(/\/$/, "") : `${req.protocol}://${req.get("host")}`;
  res.status(201).json({ ...r, downloadUrl: `${base}/datasets/download/${r.token}` });
});

router.post("/dataset/exports/:id/revoke", async (req, res) => {
  if (!(await revokeExport(toInt(req.params.id, 0)))) return res.status(404).json({ error: "반출 기록을 찾을 수 없어요." });
  await audit(req.adminActor, "data_export_revoked", `data_export:${req.params.id}`, null, clientIp(req));
  res.json({ ok: true });
});

// ── 대화·오류·감사 ──
router.get("/chats", async (req, res) => res.json({ conversations: await listConversations({ limit: 100, channel: req.query.channel || null }) }));

router.get("/chats/:clientKey", async (req, res) => {
  await audit(req.adminActor, "admin_view_chat", String(req.params.clientKey), null, clientIp(req));
  res.json({ messages: await getConversation(String(req.params.clientKey)) });
});

router.get("/errors", async (req, res) => res.json({ errors: await listErrors(200) }));
router.get("/audit", async (req, res) => res.json({ logs: await listAudit(300) }));

// ── DB ──
const TABLES = ["users", "sessions", "verifications", "claims", "api_keys", "api_usage", "usage_daily", "wallets", "chat_messages", "error_logs", "audit_logs", "data_exports", "settings"];

router.get("/db", async (req, res) => {
  const tables = [];
  for (const t of TABLES) tables.push({ name: t, rows: (await one(`SELECT COUNT(*) AS n FROM ${t}`)).n });
  const size = await one("SELECT pg_database_size(current_database()) AS bytes").catch(() => ({ bytes: 0 }));
  res.json({
    engine: DB_DESCRIPTION,
    sizeBytes: Number(size?.bytes || 0),
    tables,
    persistentHint: PERSISTENT_STORAGE
      ? "Supabase(PostgreSQL)에 저장 중 — 자동 백업은 Supabase 대시보드 Database → Backups에서 확인"
      : "로컬 개발용 PGlite — 배포 환경이면 DATABASE_URL(Supabase)을 지정하세요",
  });
});

// 논리 백업(NDJSON): 테이블별 모든 행을 한 줄씩. Supabase 자동 백업과 별개로 손에 쥘 수 있는 사본.
router.get("/db/backup", async (req, res) => {
  await audit(req.adminActor, "db_backup_downloaded", null, null, clientIp(req));
  res.set("Content-Type", "application/x-ndjson; charset=utf-8");
  res.set("Content-Disposition", `attachment; filename="yume-backup-${kstDay()}.ndjson"`);
  res.set("Cache-Control", "no-store");
  const ORDER = { usage_daily: "client_key, day", wallets: "client_key", settings: "key" };
  for (const table of TABLES) {
    const pk = ORDER[table] || "id";
    let offset = 0;
    for (;;) {
      const rows = await all(`SELECT * FROM ${table} ORDER BY ${pk} LIMIT 1000 OFFSET :offset`, { offset });
      for (const row of rows) res.write(JSON.stringify({ table, row }) + "\n");
      if (rows.length < 1000) break;
      offset += 1000;
    }
  }
  res.end();
});

export default router;
