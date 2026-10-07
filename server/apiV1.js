import express from "express";
import { patchAsync } from "./asyncExpress.js";
import { authenticateApiKey, finishApiUsage, isTrialKey, quotaUsage, recordApiUsage } from "./apiKeys.js";
import { getVerification, newVerificationId } from "./verificationStore.js";
import { startVerification, MAX_INPUT_CHARS } from "./verifyPipeline.js";
import { kstMonthStart, one } from "./db.js";
import { normalizeReferences, MAX_REFERENCES, MAX_REFERENCE_CHARS } from "./referenceCheck.js";
import { bodyHash, claimKey, readIdempotencyKey, releaseKey } from "./idempotency.js";
import { deliverWebhook, validateCallback } from "./webhooks.js";
import { documentInput, documentPayload, getDocumentView, newDocumentId, startDocument } from "./documents.js";
import { FileTextError } from "./fileText.js";

// 유메 검증 API(/v1) — AI 서비스를 운영하는 기업이 자기 서비스의 답변을 유메로 검증하는
// 공개 API. 계정의 "API 키" 메뉴에서 발급한 키로 인증한다(키는 해시로만 저장).
//
//   POST /v1/verify         { text, wait? }  → 202 { id, status: "pending" } 또는 200 결과
//   POST /v1/verify/batch   { items[], wait? } → 여러 건을 한 번에(최대 20건)
//   GET  /v1/verify/:id                        → 결과 조회(폴링)
//   GET  /v1/usage                             → 이번 달 사용량·한도
//
// 과금 단위는 "받아들여진 검증 요청 1건"이다(캐시 재사용 포함). 인증 실패·한도 초과·
// 입력 오류로 거절된 요청은 과금하지 않는다.
const router = patchAsync(express.Router());
const MAX_WAIT_SEC = 60;

router.use((req, res, next) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Headers", "Authorization, X-API-Key, Content-Type, Idempotency-Key");
  res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

const UPGRADE_URL = `${(process.env.BUSINESS_URL || "https://business.yume-reamer.com").replace(/\/+$/, "")}/#pricing`;

function fail(res, status, code, message, extra = {}) {
  return res.status(status).json({ error: { code, message, ...extra } });
}

// 키별 분당 요청 제한(키마다 한도가 달라 여기서 따로 센다).
const minuteWindows = new Map();
export function withinRate(key) {
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
  // 원문 속 위치(글자 단위, start 포함·end 제외)와 그 부분 원문. 고객사 화면에서 밑줄을 긋는 데 쓴다.
  if (c.span) {
    out.quote = c.quote;
    out.span = c.span;
  }
  // "사실과 다름"일 때만: 판정 근거의 실제 값으로 고친 문장.
  if (c.verdict === "false" && c.suggested_fix) out.suggested_fix = c.suggested_fix;
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

export async function usageInfo(key) {
  const used = Number(await quotaUsage(key));
  const d = new Date(kstMonthStart() + 9 * 3600 * 1000);
  const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) - 9 * 3600 * 1000;
  return { used, quota: key.monthly_quota, remaining: Math.max(0, key.monthly_quota - used), resets_at: iso(next) };
}

// ── 멱등 키 · 웹훅 ─────────────────────────────────────────────────────────
// 둘 다 선택이다. 형식이 틀리면 아무것도 시작하지 않고 무엇이 틀렸는지 알려준다.
async function readExtras(req, res, key, endpoint) {
  const idem = readIdempotencyKey(req);
  if (idem.error) {
    await recordApiUsage(key.id, { endpoint, statusCode: 400 });
    fail(res, 400, "invalid_idempotency_key", idem.error);
    return null;
  }
  const cb = validateCallback(req.body?.callback_url, req.body?.callback_secret);
  if (cb.error) {
    await recordApiUsage(key.id, { endpoint, statusCode: 400 });
    fail(res, 400, "invalid_callback", cb.error);
    return null;
  }
  return { idemKey: idem.key, callback: cb.url ? cb : null };
}

// 같은 키로 다시 온 요청: 처음 시작한 검증을 그대로 돌려준다. 새로 시작하지도, 과금하지도 않는다.
async function replay(res, key, row, endpoint, hash) {
  if (row.body_hash !== hash) {
    await recordApiUsage(key.id, { endpoint, statusCode: 422 });
    return fail(res, 422, "idempotency_conflict", "같은 Idempotency-Key로 다른 내용을 보냈습니다. 새 요청이면 새 키를 쓰세요.");
  }
  await recordApiUsage(key.id, { endpoint, statusCode: 200 });
  res.set("Idempotent-Replayed", "true");
  const views = await Promise.all(row.refs.map(async (r) => ({ ref: r.ref, v: r.id ? await getVerification(r.id) : null })));
  if (row.kind === "single") {
    const v = views[0]?.v;
    if (!v) return fail(res, 409, "idempotency_in_progress", "같은 Idempotency-Key 요청을 아직 시작하는 중입니다. 잠시 후 다시 보내주세요.");
    return res.status(v.status === "pending" ? 202 : 200).json({ ...publicVerification(v), poll_url: `/v1/verify/${v.id}`, replayed: true, usage: await usageInfo(key) });
  }
  const results = views.map(({ ref, v }) =>
    v ? { ref, ...publicVerification(v), poll_url: `/v1/verify/${v.id}` } : { ref, status: "error", error: { code: "start_failed", message: "검증을 시작하지 못했습니다. 다시 보내주세요." } },
  );
  const pending = results.filter((r) => r.status === "pending").length;
  return res.status(pending ? 202 : 200).json({ count: results.length, pending, results, replayed: true, usage: await usageInfo(key) });
}

// 검증이 끝나면(실패해도) 고객사 주소로 결과를 보낸다. 응답은 기다리지 않는다.
function notifyWhenDone(callback, done, id, ref) {
  if (!callback || !id) return;
  Promise.resolve(done)
    .catch(() => null)
    .then(async () => {
      const v = await getVerification(id);
      if (!v) return;
      await deliverWebhook({ url: callback.url, secret: callback.secret, payload: { ...(ref != null ? { ref } : {}), ...publicVerification(v) } });
    })
    .catch(() => {});
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
  const ctx = normalizeReferences(req.body?.references, req.body?.organization);
  if (ctx.error) {
    await recordApiUsage(key.id, { endpoint: "POST /v1/verify", statusCode: 400 });
    return fail(res, 400, "invalid_references", ctx.error);
  }
  const extras = await readExtras(req, res, key, "POST /v1/verify");
  if (!extras) return;

  const id = newVerificationId();
  // 멱등 키는 한도 확인보다 먼저 본다. 이미 처리한 요청의 재시도는 한도와 무관하게 처음 결과를 돌려줘야 한다.
  const hash = bodyHash({ text, references: req.body?.references ?? null, organization: req.body?.organization ?? null, callback_url: req.body?.callback_url ?? null });
  if (extras.idemKey) {
    const claim = await claimKey(key.id, extras.idemKey, { hash, kind: "single", refs: [{ ref: null, id }] });
    if (!claim.fresh) {
      if (claim.row) return replay(res, key, claim.row, "POST /v1/verify", hash);
      return fail(res, 409, "idempotency_in_progress", "같은 Idempotency-Key 요청을 처리하는 중입니다. 잠시 후 다시 보내주세요.");
    }
  }
  const release = () => (extras.idemKey ? releaseKey(key.id, extras.idemKey) : null);

  const usage = await usageInfo(key);
  if (usage.remaining <= 0) {
    await release();
    await recordApiUsage(key.id, { endpoint: "POST /v1/verify", statusCode: 429 });
    // 이 응답을 받는 건 사람이 아니라 고객사의 서버다. 메일 주소 대신 요금표 주소를 준다 —
    // 개발자가 로그에서 이걸 보고 담당자에게 그대로 넘길 수 있어야 한다.
    const trial = isTrialKey(key);
    return fail(
      res, 429, "quota_exceeded",
      trial
        ? `이번 달 체험 호출 ${usage.quota}회(계정 전체)를 모두 사용했습니다. 요금제와 한도: ${UPGRADE_URL}`
        : `이번 달 호출 한도(${usage.quota}회)를 모두 사용했습니다. 한도 올리기: ${UPGRADE_URL}`,
      { usage, upgrade_url: UPGRADE_URL },
    );
  }

  // 한도는 과금 행 수로 센다. 결과를 기다린 뒤(최대 60초)에야 행을 남기면 그 사이에 들어온
  // 요청이 전부 한도 확인을 통과한다. 받아들이는 순간 먼저 잡아 둔다.
  const usageId = await recordApiUsage(key.id, { verificationId: id, endpoint: "POST /v1/verify", statusCode: 202, billable: true });
  let done;
  try {
    ({ done } = await startVerification({
      id,
      text,
      source: "api",
      userId: null,
      apiKeyId: key.id,
      clientKey: `key:${key.id}`,
      // 기준 자료를 함께 보낸 검증은 회사 고유의 사실이 섞여 있다. 데이터셋에 넣지 않는다.
      dataConsent: !!key.data_sharing && !ctx.refs.length,
      references: ctx.refs,
      organization: ctx.organization,
    }));
  } catch (e) {
    // 시작도 못 한 요청은 과금하지 않는다. 멱등 키도 놓아준다 — 다시 보내면 새로 시작해야 한다.
    if (usageId) await finishApiUsage(usageId, { statusCode: 500, cached: false, billable: false });
    await release();
    throw e;
  }
  notifyWhenDone(extras.callback, done, id, null);

  // wait를 주지 않아도 캐시 재사용분은 곧바로 끝나므로 아주 잠깐은 기다려 완료 상태로 돌려준다.
  const waitSec = req.body?.wait === true ? MAX_WAIT_SEC : Math.min(MAX_WAIT_SEC, Math.max(0, Number(req.body?.wait) || 0));
  await Promise.race([done.catch(() => null), new Promise((r) => setTimeout(r, waitSec > 0 ? waitSec * 1000 : 300))]);
  const v = await getVerification(id);
  const status = v.status === "pending" ? 202 : 200;
  if (usageId) await finishApiUsage(usageId, { statusCode: status, cached: !!v.from_cache });
  res.status(status).json({ ...publicVerification(v), poll_url: `/v1/verify/${id}`, usage: await usageInfo(key) });
});

// 여러 건을 한 번에 보낸다.
//
// 기업이 실제로 하는 일은 한 건 검증이 아니라 "상담 기록 300건", "상품 설명 전부"처럼
// 묶음 검사다. 단건 API로 하려면 고객사가 반복·동시성·한도를 직접 다뤄야 하는데,
// 그 코드를 쓰다가 그만두는 곳이 많다. 그래서 묶음을 서버가 받는다.
//
// 과금은 단건과 같다 — 받아들인 항목 수만큼. 한도가 모자라면 **한 건도 시작하지 않는다.**
// 절반만 돌려주면 고객사는 무엇이 빠졌는지 맞춰 봐야 하고, 그게 가장 흔한 지원 문의가 된다.
const MAX_BATCH = 20;

router.post("/verify/batch", requireApiKey, async (req, res) => {
  const key = req.apiKey;
  const raw = Array.isArray(req.body?.items) ? req.body.items : null;
  if (!raw || raw.length === 0) {
    await recordApiUsage(key.id, { endpoint: "POST /v1/verify/batch", statusCode: 400 });
    return fail(res, 400, "invalid_request", "items 배열에 검증할 항목을 담아 보내주세요. 예: {\"items\":[{\"ref\":\"a1\",\"text\":\"...\"}]}");
  }
  if (raw.length > MAX_BATCH) {
    await recordApiUsage(key.id, { endpoint: "POST /v1/verify/batch", statusCode: 400 });
    return fail(res, 400, "too_many_items", `한 번에 ${MAX_BATCH}건까지 보낼 수 있습니다. 나눠서 보내주세요.`);
  }

  // 항목을 먼저 전부 검사한다. 하나라도 어긋나면 어느 항목인지 알려주고 아무것도 시작하지 않는다.
  const items = [];
  for (const [i, it] of raw.entries()) {
    const text = typeof it?.text === "string" ? it.text.trim() : "";
    const ref = String(it?.ref ?? i);
    if (!text) {
      await recordApiUsage(key.id, { endpoint: "POST /v1/verify/batch", statusCode: 400 });
      return fail(res, 400, "invalid_request", `items[${i}](ref: ${ref})에 text가 없습니다.`);
    }
    if (text.length > MAX_INPUT_CHARS) {
      await recordApiUsage(key.id, { endpoint: "POST /v1/verify/batch", statusCode: 413 });
      return fail(res, 413, "text_too_long", `items[${i}](ref: ${ref})의 text가 ${MAX_INPUT_CHARS.toLocaleString()}자를 넘습니다.`);
    }
    items.push({ ref, text });
  }
  // 기준 자료·자사명은 묶음 전체에 한 번만 받는다(항목마다 같은 회사의 글이다).
  const ctx = normalizeReferences(req.body?.references, req.body?.organization);
  if (ctx.error) {
    await recordApiUsage(key.id, { endpoint: "POST /v1/verify/batch", statusCode: 400 });
    return fail(res, 400, "invalid_references", ctx.error);
  }
  const extras = await readExtras(req, res, key, "POST /v1/verify/batch");
  if (!extras) return;

  // 항목마다 id를 먼저 정해 둔다. 멱등 키가 이 id들을 기억해야 재시도에 같은 결과를 돌려줄 수 있다.
  for (const it of items) it.id = newVerificationId();
  const hash = bodyHash({ items: items.map(({ ref, text }) => ({ ref, text })), references: req.body?.references ?? null, organization: req.body?.organization ?? null, callback_url: req.body?.callback_url ?? null });
  if (extras.idemKey) {
    const claim = await claimKey(key.id, extras.idemKey, { hash, kind: "batch", refs: items.map(({ ref, id }) => ({ ref, id })) });
    if (!claim.fresh) {
      if (claim.row) return replay(res, key, claim.row, "POST /v1/verify/batch", hash);
      return fail(res, 409, "idempotency_in_progress", "같은 Idempotency-Key 요청을 처리하는 중입니다. 잠시 후 다시 보내주세요.");
    }
  }

  const usage = await usageInfo(key);
  if (usage.remaining < items.length) {
    if (extras.idemKey) await releaseKey(key.id, extras.idemKey);
    await recordApiUsage(key.id, { endpoint: "POST /v1/verify/batch", statusCode: 429 });
    return fail(
      res, 429, "quota_exceeded",
      `이번 달 남은 호출이 ${usage.remaining}회인데 ${items.length}건을 요청했습니다. 나눠 보내거나 한도를 올려주세요: ${UPGRADE_URL}`,
      { usage, upgrade_url: UPGRADE_URL },
    );
  }

  const waitSec = req.body?.wait === true ? MAX_WAIT_SEC : Math.min(MAX_WAIT_SEC, Math.max(0, Number(req.body?.wait) || 0));
  const started = await Promise.all(
    items.map(async ({ ref, text, id }) => {
      const usageId = await recordApiUsage(key.id, { verificationId: id, endpoint: "POST /v1/verify/batch", statusCode: 202, billable: true });
      try {
        const { done } = await startVerification({
          id, text, source: "api", userId: null, apiKeyId: key.id,
          clientKey: `key:${key.id}`, dataConsent: !!key.data_sharing && !ctx.refs.length,
          references: ctx.refs, organization: ctx.organization,
        });
        // 웹훅은 항목마다 보낸다(ref를 붙여서). 묶음 전체를 기다리면 빠른 항목이 느린 항목을 기다린다.
        notifyWhenDone(extras.callback, done, id, ref);
        return { ref, id, usageId, done: done.catch(() => null) };
      } catch {
        // 시작도 못 한 항목은 과금하지 않는다.
        if (usageId) await finishApiUsage(usageId, { statusCode: 500, cached: false, billable: false });
        return { ref, id: null, usageId: null, done: Promise.resolve(null), failed: true };
      }
    }),
  );

  // wait를 주면 그만큼 다 같이 기다린다. 묶음 전체에 한 번만 기다리므로 20건이라고
  // 20배 걸리지 않는다(검증은 동시에 돈다).
  await Promise.race([
    Promise.all(started.map((s) => s.done)),
    new Promise((r) => setTimeout(r, waitSec > 0 ? waitSec * 1000 : 300)),
  ]);

  const results = await Promise.all(
    started.map(async (s) => {
      if (s.failed) return { ref: s.ref, status: "error", error: { code: "start_failed", message: "검증을 시작하지 못했습니다. 다시 보내주세요." } };
      const v = await getVerification(s.id);
      if (s.usageId) await finishApiUsage(s.usageId, { statusCode: v.status === "pending" ? 202 : 200, cached: !!v.from_cache });
      return { ref: s.ref, ...publicVerification(v), poll_url: `/v1/verify/${s.id}` };
    }),
  );

  const pending = results.filter((r) => r.status === "pending").length;
  res.status(pending ? 202 : 200).json({ count: results.length, pending, results, usage: await usageInfo(key) });
});

// ── 긴 문서 (documents.js) ────────────────────────────────────────────────────
// 1만 자를 넘는 문서·파일(DOCX·HWPX·PDF·TXT)을 받아 문단 경계로 나눠 검사하고, 원문 기준
// 위치와 "고친 본문"을 돌려준다. 과금은 조각 수만큼. 이 경로만 큰 본문을 받는다(app.js BIG_BODY).
const docJson = express.json({ limit: "16mb" });

router.post("/documents", docJson, requireApiKey, async (req, res) => {
  const key = req.apiKey;
  const endpoint = "POST /v1/documents";
  let input;
  try {
    input = await documentInput(req.body);
  } catch (e) {
    if (!(e instanceof FileTextError)) throw e;
    await recordApiUsage(key.id, { endpoint, statusCode: 400 });
    return fail(res, 400, "invalid_file", e.message);
  }
  if (input.error) {
    await recordApiUsage(key.id, { endpoint, statusCode: 400 });
    return fail(res, 400, "invalid_request", input.error);
  }
  const ctx = normalizeReferences(req.body?.references, req.body?.organization);
  if (ctx.error) {
    await recordApiUsage(key.id, { endpoint, statusCode: 400 });
    return fail(res, 400, "invalid_references", ctx.error);
  }
  const extras = await readExtras(req, res, key, endpoint);
  if (!extras) return;

  const docId = newDocumentId();
  const hash = bodyHash({ text: input.text, references: req.body?.references ?? null, organization: req.body?.organization ?? null, callback_url: req.body?.callback_url ?? null });
  if (extras.idemKey) {
    const claim = await claimKey(key.id, extras.idemKey, { hash, kind: "document", refs: [{ ref: null, id: docId }] });
    if (!claim.fresh) {
      if (!claim.row) return fail(res, 409, "idempotency_in_progress", "같은 Idempotency-Key 요청을 처리하는 중입니다. 잠시 후 다시 보내주세요.");
      if (claim.row.body_hash !== hash) {
        await recordApiUsage(key.id, { endpoint, statusCode: 422 });
        return fail(res, 422, "idempotency_conflict", "같은 Idempotency-Key로 다른 내용을 보냈습니다. 새 요청이면 새 키를 쓰세요.");
      }
      const got = await getDocumentView(claim.row.refs[0].id);
      if (!got) return fail(res, 409, "idempotency_in_progress", "같은 Idempotency-Key 요청을 아직 시작하는 중입니다. 잠시 후 다시 보내주세요.");
      await recordApiUsage(key.id, { endpoint, statusCode: 200 });
      res.set("Idempotent-Replayed", "true");
      return res.status(got.view.status === "pending" ? 202 : 200).json({ ...got.view, poll_url: `/v1/documents/${got.view.id}`, replayed: true, usage: await usageInfo(key) });
    }
  }

  const started = await startDocument({
    key, text: input.text, title: input.title, refs: ctx.refs, organization: ctx.organization, endpoint, source: "api", docId,
    onAllDone: extras.callback
      ? async (id) => {
          const payload = await documentPayload(id);
          if (payload) await deliverWebhook({ url: extras.callback.url, secret: extras.callback.secret, event: "document.completed", payload });
        }
      : null,
  });
  if (started.error) {
    if (extras.idemKey) await releaseKey(key.id, extras.idemKey);
    const { status, code, message, extra } = started.error;
    return fail(res, status, code, code === "quota_exceeded" ? `${message} 한도 올리기: ${UPGRADE_URL}` : message, { ...(extra || {}), ...(code === "quota_exceeded" ? { upgrade_url: UPGRADE_URL } : {}) });
  }

  const waitSec = req.body?.wait === true ? MAX_WAIT_SEC : Math.min(MAX_WAIT_SEC, Math.max(0, Number(req.body?.wait) || 0));
  await Promise.race([started.all, new Promise((r) => setTimeout(r, waitSec > 0 ? waitSec * 1000 : 300))]);
  const { view } = await getDocumentView(started.id);
  res.status(view.status === "pending" ? 202 : 200).json({ ...view, poll_url: `/v1/documents/${view.id}`, usage: await usageInfo(key) });
});

router.get("/documents/:id", requireApiKey, async (req, res) => {
  const got = await getDocumentView(String(req.params.id));
  // 같은 계정의 키로 만든 문서만 조회할 수 있다.
  const owner = got?.doc.api_key_id ? await one("SELECT user_id FROM api_keys WHERE id = :id", { id: got.doc.api_key_id }) : null;
  if (!got || owner?.user_id !== req.apiKey.user_id) return fail(res, 404, "not_found", "문서를 찾을 수 없습니다.");
  await recordApiUsage(req.apiKey.id, { endpoint: "GET /v1/documents/:id", statusCode: 200 });
  res.json(got.view);
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
    idempotency: "Idempotency-Key 헤더 — 같은 키로 다시 보내면 처음 결과를 과금 없이 돌려줌(24시간)",
    endpoints: [
      {
        method: "POST", path: "/v1/verify",
        body: {
          text: "string (최대 10,000자) — AI가 쓴 글이든 사람이 쓴 글이든",
          references: `[{ title?, text }] (선택, 최대 ${MAX_REFERENCES}개·합계 ${MAX_REFERENCE_CHARS.toLocaleString()}자) — 자사 기준 자료. 다루는 주장은 이 자료와 먼저 대조`,
          organization: "string (선택) — 자사명. 자사에 관한 주장은 공개 기록이 없다는 이유로 '사실과 다름'이 되지 않는다",
          callback_url: "https 주소 (선택) — 끝나면 결과를 POST(웹훅). callback_secret을 주면 X-Yume-Signature로 서명",
          wait: "boolean | 초(최대 60) — 결과가 나올 때까지 기다림",
        },
        returns: "claims[]: verdict, explanation, sources, quote·span(원문 속 위치), suggested_fix(사실과 다름일 때 고친 문장)",
      },
      { method: "POST", path: "/v1/verify/batch", body: { items: "[{ ref?, text }] (최대 20건)", references: "선택, 묶음 전체에 적용", organization: "선택", wait: "boolean | 초(최대 60)" }, desc: "여러 건을 한 번에. 한도가 모자라면 한 건도 시작하지 않는다" },
      {
        method: "POST", path: "/v1/documents",
        body: { text: "string (최대 100,000자)", file: "{ name, content_base64 } — TXT·MD·CSV·DOCX·HWPX·PDF, 10MB까지", title: "선택", references: "선택", organization: "선택", callback_url: "선택", wait: "선택" },
        desc: "긴 문서·파일 검사. 문단 경계로 나눠 조각 수만큼 과금, 원문 기준 위치와 고친 본문(corrected_text)을 돌려준다",
      },
      { method: "GET", path: "/v1/documents/:id", desc: "문서 검사 결과 조회" },
      { method: "GET", path: "/v1/verify/:id", desc: "검증 결과 조회" },
      { method: "GET", path: "/v1/usage", desc: "이번 달 사용량·한도" },
    ],
  });
});

router.use((req, res) => fail(res, 404, "not_found", "존재하지 않는 API 경로입니다. /v1 을 참고하세요."));

export default router;
