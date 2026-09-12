import crypto from "node:crypto";
import { all, now, one, run, tx } from "./db.js";

// 판정 로직이 바뀌면 예전 결과를 캐시로 재사용하면 안 되므로 해시에 엔진 버전을 섞는다.
export const ENGINE_VERSION = "2026.09-nec1";
const CACHE_TTL_MS = 7 * 24 * 3600 * 1000;

export const newVerificationId = () => crypto.randomBytes(8).toString("hex");

function normalize(text) {
  return String(text).trim().replace(/\s+/g, " ");
}

export function inputHash(text) {
  return crypto.createHash("sha256").update(`${ENGINE_VERSION}\n${normalize(text)}`).digest("hex");
}

export function createVerification({ id, source, userId = null, apiKeyId = null, clientKey = null, input, dataConsent = false }) {
  return run(
    `INSERT INTO verifications (id, source, user_id, api_key_id, client_key, input, input_hash, status, data_consent, created_at)
     VALUES (:id, :source, :userId, :apiKeyId, :clientKey, :input, :hash, 'pending', :dc, :t)`,
    { id, source, userId, apiKeyId, clientKey, input, hash: inputHash(input), dc: dataConsent ? 1 : 0, t: now() },
  );
}

export async function findCached(text) {
  const row = await one(
    `SELECT result_json FROM verifications
      WHERE input_hash = :hash AND status = 'done' AND from_cache = 0 AND created_at > :since
      ORDER BY created_at DESC LIMIT 1`,
    { hash: inputHash(text), since: now() - CACHE_TTL_MS },
  );
  return row ? JSON.parse(row.result_json) : null;
}

export async function completeVerification(id, result, { fromCache = false, elapsedMs = null } = {}) {
  const claims = Array.isArray(result.claims) ? result.claims : [];
  const t = now();
  await tx(async (q) => {
    await q.run(
      `UPDATE verifications SET status = 'done', result_json = :json, overall_domain = :domain, overall_tone = :tone,
              claim_count = :cc, false_count = :fc, uncertain_count = :uc, from_cache = :fromCache,
              elapsed_ms = :elapsed, completed_at = :t
        WHERE id = :id`,
      {
        id,
        json: JSON.stringify(result),
        domain: result.overall_domain || null,
        tone: result.overall?.tone || null,
        cc: claims.length,
        fc: claims.filter((c) => c.verdict === "false").length,
        uc: claims.filter((c) => c.verdict === "uncertain").length,
        fromCache: fromCache ? 1 : 0,
        elapsed: elapsedMs,
        t,
      },
    );
    // 캐시 재사용분은 주장 행을 다시 만들지 않는다 — 통계·데이터셋에 같은 주장이 중복 집계되지 않도록.
    if (fromCache) return;
    for (const [idx, c] of claims.entries()) {
      await q.run(
        `INSERT INTO claims (verification_id, idx, text, domain, verdict, verified_via, explanation, sources_json,
                             legal_ref_json, nec_json, nec_score, nec_grade, created_at)
         VALUES (:vid, :idx, :text, :domain, :verdict, :via, :expl, :sources, :legal, :nec, :necScore, :necGrade, :t)`,
        {
          vid: id,
          idx,
          text: String(c.text || ""),
          domain: c.domain || null,
          verdict: c.verdict || null,
          via: c.verified_via || "web",
          expl: c.explanation || null,
          sources: JSON.stringify(c.sources || []),
          legal: c.legal_ref ? JSON.stringify(c.legal_ref) : null,
          nec: c.nec ? JSON.stringify(c.nec) : null,
          necScore: c.nec ? c.nec.score : null,
          necGrade: c.nec ? c.nec.grade : null,
          t,
        },
      );
    }
  });
}

export function failVerification(id, message) {
  return run("UPDATE verifications SET status = 'error', error = :m, completed_at = :t WHERE id = :id", {
    id,
    m: String(message || "").slice(0, 500),
    t: now(),
  });
}

function hydrate(row) {
  if (!row) return null;
  const { result_json, ...rest } = row;
  return { ...rest, result: result_json ? JSON.parse(result_json) : null };
}

export async function getVerification(id) {
  return hydrate(await one("SELECT * FROM verifications WHERE id = :id", { id }));
}

export async function listUserHistory(userId, limit = 50) {
  const rows = await all(
    `SELECT id, input, overall_domain, overall_tone, claim_count, false_count, status, created_at
       FROM verifications WHERE user_id = :userId AND source = 'web' AND status = 'done'
      ORDER BY created_at DESC LIMIT :limit`,
    { userId, limit },
  );
  return rows.map((r) => ({
    id: r.id,
    preview: r.input.trim().slice(0, 36) + (r.input.trim().length > 36 ? "…" : ""),
    domain: r.overall_domain || "일반",
    tone: r.overall_tone,
    claimCount: r.claim_count,
    falseCount: r.false_count,
    timestamp: r.created_at,
  }));
}

export async function deleteUserVerification(userId, id) {
  return (await run("DELETE FROM verifications WHERE id = :id AND user_id = :userId", { id, userId })).changes > 0;
}

// 무료 플랜의 기록 보관 한도를 넘는 오래된 기록은 지운다(요금제 안내와 일치시키기 위해).
export async function trimUserHistory(userId, keep) {
  if (!keep) return;
  await run(
    `DELETE FROM verifications WHERE user_id = :userId AND source = 'web' AND id NOT IN (
       SELECT id FROM verifications WHERE user_id = :userId AND source = 'web' ORDER BY created_at DESC LIMIT :keep)`,
    { userId, keep },
  );
}
