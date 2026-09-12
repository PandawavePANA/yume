import express from "express";
import { patchAsync } from "./asyncExpress.js";
import { authenticateApiKey, monthlyUsage, recordApiUsage } from "./apiKeys.js";
import { getVerification, newVerificationId } from "./verificationStore.js";
import { startVerification, MAX_INPUT_CHARS } from "./verifyPipeline.js";
import { kstMonthStart, one } from "./db.js";

// 유메 검증 API(/v1) — AI 서비스를 운영하는 기업이 자기 서비스의 답변을 유메로 검증하는
// 공개 API. 계정의 "API 키" 메뉴에서 발급한 키로 인증한다(키는 해시로만 저장).
//
//   POST /v1/verify         { text, wait? }  → 202 { id, status: "pending" } 또는 200 결과
//   GET  /v1/verify/:id                        → 결과 조회(폴링)
//   GET  /v1/usage                             → 이번 달 사용량·한도
//
// 과금 단위는 "받아들여진 검증 요청 1건"이다(캐시 재사용 포함). 인증 실패·한도 초과·
// 입력 오류로 거절된 요청은 과금하지 않는다.
const router = patchAsync(express.Router());
const MAX_WAIT_SEC = 60;

router.use((req, res, next) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Headers", "Authorization, X-API-Key, Content-Type");
  res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

function fail(res, status, code, message, extra = {}) {
  return res.status(status).json({ error: { code, message, ...extra } });
}

// 키별 분당 요청 제한(키마다 한도가 달라 여기서 따로 센다).
const minuteWindows = new Map();
function withinRate(key) {
  const t = Date.now();
  const w = minuteWindows.get(key.id);
  if (!w || w.resetAt <= t) {
    minuteWindows.set(key.id, { count: 1, resetAt: t + 60_000 });
    return { ok: true };
  }
  w.count += 1;
  return { ok: w.count <= key.rate_per_min, retryAfter: Math.ceil((w.resetAt - t) / 1000) };
}
setInterval(() => {
  const t = Date.now();
  for (const [k, w] of minuteWindows) if (w.resetAt <= t) minuteWindows.delete(k);
}, 120_000).unref();

async function requireApiKey(req, res, next) {
  const raw = req.get("x-api-key") || (req.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const key = await authenticateApiKey(raw.trim());
  if (!key) return fail(res, 401, "invalid_api_key", "유효한 API 키가 필요합니다. Authorization: Bearer <키> 헤더로 보내주세요.");
  const rate = withinRate(key);
  if (!rate.ok) {
    res.set("Retry-After", String(rate.retryAfter));
    return fail(res, 429, "rate_limited", `분당 요청 한도(${key.rate_per_min}회)를 초과했습니다.`);
  }
  req.apiKey = key;
  next();
}

const iso = (ts) => (ts ? new Date(ts).toISOString() : null);

function publicClaim(c) {
  const out = {
    text: c.text,
    domain: c.domain,
    verdict: c.verdict,
    verified_via: c.verified_via || "web",
    explanation: c.explanation,
    sources: c.sources || [],
  };
  if (c.effective_date) out.effective_date = c.effective_date;
  if (c.legal_ref) out.legal_ref = c.legal_ref;
  if (c.identifiers) out.identifiers = c.identifiers;
  if (c.nec) out.nec = c.nec;
  return out;
}

function publicVerification(v) {
  const r = v.result;
  return {
    id: v.id,
    status: v.status,
    cached: !!v.from_cache,
    created_at: iso(v.created_at),
    completed_at: iso(v.completed_at),
    result:
      v.status === "done" && r
        ? {
            verdict: r.overall,
            domain: r.overall_domain,
            summary: r.summary || null,
            claims: (r.claims || []).map(publicClaim),
            engine: r.engine || null,
          }
        : null,
    error: v.status === "error" ? { code: "verification_failed", message: v.error || "검증 중 오류가 발생했습니다." } : null,
  };
}

async function usageInfo(key) {
  const used = await monthlyUsage(key.id);
  const d = new Date(kstMonthStart() + 9 * 3600 * 1000);
  const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) - 9 * 3600 * 1000;
  return { used, quota: key.monthly_quota, remaining: Math.max(0, key.monthly_quota - used), resets_at: iso(next) };
}

router.post("/verify", requireApiKey, async (req, res) => {
  const key = req.apiKey;
  const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  if (!text) {
    await recordApiUsage(key.id, { endpoint: "POST /v1/verify", statusCode: 400 });
    return fail(res, 400, "invalid_request", "text 필드에 검증할 내용을 담아 보내주세요.");
  }
  if (text.length > MAX_INPUT_CHARS) {
    await recordApiUsage(key.id, { endpoint: "POST /v1/verify", statusCode: 413 });
    return fail(res, 413, "text_too_long", `text는 ${MAX_INPUT_CHARS.toLocaleString()}자 이하여야 합니다.`);
  }
  const usage = await usageInfo(key);
  if (usage.remaining <= 0) {
    await recordApiUsage(key.id, { endpoint: "POST /v1/verify", statusCode: 429 });
    return fail(res, 429, "quota_exceeded", "이번 달 호출 한도를 모두 사용했습니다. 한도 상향은 reamer@d-reamer.com으로 문의해주세요.", { usage });
  }

  const id = newVerificationId();
  const { done } = await startVerification({
    id,
    text,
    source: "api",
    userId: null,
    apiKeyId: key.id,
    clientKey: `key:${key.id}`,
    dataConsent: !!key.data_sharing,
  });

  // wait를 주지 않아도 캐시 재사용분은 곧바로 끝나므로 아주 잠깐은 기다려 완료 상태로 돌려준다.
  const waitSec = req.body?.wait === true ? MAX_WAIT_SEC : Math.min(MAX_WAIT_SEC, Math.max(0, Number(req.body?.wait) || 0));
  await Promise.race([done.catch(() => null), new Promise((r) => setTimeout(r, waitSec > 0 ? waitSec * 1000 : 300))]);
  const v = await getVerification(id);
  const status = v.status === "pending" ? 202 : 200;
  await recordApiUsage(key.id, { verificationId: id, endpoint: "POST /v1/verify", statusCode: status, billable: true, cached: !!v.from_cache });
  res.status(status).json({ ...publicVerification(v), poll_url: `/v1/verify/${id}`, usage: await usageInfo(key) });
});

router.get("/verify/:id", requireApiKey, async (req, res) => {
  const v = await getVerification(String(req.params.id));
  // 같은 계정이 발급한 키로 요청한 검증만 조회할 수 있다.
  const owner = v?.api_key_id ? await one("SELECT user_id FROM api_keys WHERE id = :id", { id: v.api_key_id }) : null;
  if (!v || owner?.user_id !== req.apiKey.user_id) return fail(res, 404, "not_found", "검증 결과를 찾을 수 없습니다.");
  await recordApiUsage(req.apiKey.id, { verificationId: v.id, endpoint: "GET /v1/verify/:id", statusCode: 200 });
  res.json(publicVerification(v));
});

router.get("/usage", requireApiKey, async (req, res) => {
  res.json({ key: { label: req.apiKey.label, prefix: `${req.apiKey.prefix}…` }, rate_per_min: req.apiKey.rate_per_min, month: await usageInfo(req.apiKey) });
});

router.get("/", (req, res) => {
  res.json({
    service: "YUME Fact-Check API",
    version: "v1",
    docs: "/docs/api",
    auth: "Authorization: Bearer <API 키> (유메 계정 > API 키에서 발급)",
    endpoints: [
      { method: "POST", path: "/v1/verify", body: { text: "string (최대 10,000자)", wait: "boolean | 초(최대 60) — 결과가 나올 때까지 기다림" } },
      { method: "GET", path: "/v1/verify/:id", desc: "검증 결과 조회" },
      { method: "GET", path: "/v1/usage", desc: "이번 달 사용량·한도" },
    ],
  });
});

router.use((req, res) => fail(res, 404, "not_found", "존재하지 않는 API 경로입니다. /v1 을 참고하세요."));

export default router;
