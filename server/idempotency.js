// API 멱등 키(Idempotency-Key). 같은 키로 다시 오면 처음 시작한 검증을 그대로 돌려준다.
//
// 순서가 중요하다. 검증을 시작하기 **전에** 키를 먼저 잡는다(INSERT). 시작한 뒤에 적으면,
// 고객사가 거의 동시에 보낸 재시도 두 건이 둘 다 "처음 보는 키"로 통과해 두 번 과금된다.
// 잡는 데 실패하면(이미 있는 키) 그 행을 읽어 처음 결과를 돌려준다.
import crypto from "node:crypto";
import { one, run, now } from "./db.js";

const TTL_MS = 24 * 3600 * 1000;
const MAX_KEY = 100;

export function readIdempotencyKey(req) {
  const raw = req.get("idempotency-key");
  if (raw == null) return { key: null };
  const key = String(raw).trim();
  if (!key || key.length > MAX_KEY || !/^[\x21-\x7e]+$/.test(key)) {
    return { error: "Idempotency-Key는 공백 없는 영문·숫자·기호 100자 이하여야 합니다." };
  }
  return { key };
}

export const bodyHash = (body) => crypto.createHash("sha256").update(JSON.stringify(body ?? null)).digest("hex");

// 키를 잡는다. 처음이면 { fresh: true }, 이미 있으면 { fresh: false, row }.
// 만료된 행은 덮어쓴다(하루가 지난 키는 새 요청으로 본다).
export async function claimKey(apiKeyId, idemKey, { hash, kind, refs }) {
  const t = now();
  const r = await run(
    `INSERT INTO api_idempotency (api_key_id, idem_key, body_hash, kind, refs_json, created_at)
     VALUES (:k, :i, :h, :kind, :refs, :t)
     ON CONFLICT (api_key_id, idem_key) DO UPDATE
       SET body_hash = EXCLUDED.body_hash, kind = EXCLUDED.kind, refs_json = EXCLUDED.refs_json, created_at = EXCLUDED.created_at
       WHERE api_idempotency.created_at < :expired
     RETURNING api_key_id`,
    { k: apiKeyId, i: idemKey, h: hash, kind, refs: JSON.stringify(refs), t, expired: t - TTL_MS },
  );
  if (r.rows?.length) return { fresh: true };
  const row = await one("SELECT * FROM api_idempotency WHERE api_key_id = :k AND idem_key = :i", { k: apiKeyId, i: idemKey });
  return { fresh: false, row: row ? { ...row, refs: JSON.parse(row.refs_json) } : null };
}

// 시작하지 못한 요청이면 키를 놓아준다 — 다시 보냈을 때 새로 시작할 수 있게.
export function releaseKey(apiKeyId, idemKey) {
  return run("DELETE FROM api_idempotency WHERE api_key_id = :k AND idem_key = :i", { k: apiKeyId, i: idemKey }).catch(() => {});
}
