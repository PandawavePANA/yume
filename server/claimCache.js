// 주장 단위 캐시.
//
// 입력 전문이 같을 때만 재사용하던 것을 주장 단위로 내린다. AI 답변은 매번 다르지만
// 그 안의 주장은 겹친다 — "민법 제750조는 불법행위 책임을 규정한다"는 수많은 답변에
// 똑같이 등장한다. 답변이 다르다고 같은 주장을 매번 다시 판단할 이유가 없다.
//
// 정확도는 건드리지 않는다. 같은 주장에 같은 판정을 돌려줄 뿐이다. 대신 언제 재사용하면
// 안 되는지를 분명히 해 둔다.
//
//  1) 확인되지 않음은 캐시하지 않는다. 그건 "아직 못 찾았다"는 뜻이고, 다음번엔 찾을
//     수도 있다. 못 찾은 결과를 붙들고 있으면 영영 확인되지 않는 주장이 된다.
//
//  2) 법률 주장은 하루 안에서만 재사용한다. 법령 개정은 시행일 0시에 적용되므로 키에
//     한국 날짜를 넣으면 자정에 통째로 무효가 된다. 개정 전 조문을 근거로 "맞다"고
//     하는 건 유메가 잡으려는 실패(시점 붕괴) 바로 그것이라, TTL로 어림잡지 않고
//     경계에 맞춘다.
//
//  3) 엔진이 바뀌면 전부 무효다. 판정 로직이 달라졌는데 옛 판정을 돌려주면
//     고친 것이 반영되지 않는다.
import crypto from "node:crypto";
import { one, run, now } from "./db.js";
import { ENGINE_VERSION } from "./verificationStore.js";

// 비법률 주장은 하루를 넘겨 재사용해도 된다 — 사실이 자정에 바뀌지는 않는다.
// 다만 무한정은 아니다. 통계는 갱신되고 사건은 일어난다.
const GENERAL_TTL_MS = 3 * 24 * 60 * 60 * 1000;

function kstDay() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

const normalize = (t) => String(t || "").trim().replace(/\s+/g, " ");

// 판정을 가르는 것은 전부 키에 들어가야 한다. 인용이 다르면 다른 주장이다 —
// "민법 750조"와 "민법 751조"는 문장이 비슷해도 같은 판단이 아니다.
export function claimKey(claim) {
  const ref = claim.legal_ref
    ? [claim.legal_ref.type, claim.legal_ref.law_name, claim.legal_ref.article, claim.legal_ref.case_number].filter(Boolean).join("|")
    : "";
  const legal = claim.domain === "법률";
  const parts = [ENGINE_VERSION, claim.domain || "일반", normalize(claim.text), ref, legal ? kstDay() : "any"];
  return crypto.createHash("sha256").update(parts.join("\n")).digest("hex");
}

const cacheable = (claim) => claim.verdict === "confirmed" || claim.verdict === "false";

export async function findClaim(claim) {
  if (!claim?.text) return null;
  const legal = claim.domain === "법률";
  const row = await one(
    `SELECT * FROM claim_cache WHERE hash = :hash AND created_at > :since`,
    { hash: claimKey(claim), since: legal ? 0 : now() - GENERAL_TTL_MS },
  );
  if (!row) return null;
  // 적중 횟수는 캐시가 실제로 일하고 있는지 보려고 센다. 실패해도 검증은 계속돼야 한다.
  run("UPDATE claim_cache SET hits = hits + 1 WHERE hash = :hash", { hash: row.hash }).catch(() => {});
  return {
    ...claim,
    verdict: row.verdict,
    verified_via: row.verified_via || undefined,
    explanation: row.explanation || "",
    sources: row.sources_json ? JSON.parse(row.sources_json) : [],
    ...(row.nec_json ? { nec: JSON.parse(row.nec_json) } : {}),
    ...(row.effective_date ? { effective_date: row.effective_date } : {}),
    from_claim_cache: true,
  };
}

export async function saveClaim(claim) {
  if (!claim?.text || !cacheable(claim)) return false;
  await run(
    `INSERT INTO claim_cache (hash, verdict, verified_via, explanation, sources_json, nec_json, effective_date, created_at)
     VALUES (:hash, :verdict, :via, :explanation, :sources, :nec, :eff, :t)
     ON CONFLICT (hash) DO NOTHING`,
    {
      hash: claimKey(claim),
      verdict: claim.verdict,
      via: claim.verified_via || null,
      explanation: claim.explanation || "",
      sources: JSON.stringify(claim.sources || []),
      nec: claim.nec ? JSON.stringify(claim.nec) : null,
      eff: claim.effective_date || null,
      t: now(),
    },
  ).catch(() => {});
  return true;
}

// 캐시에 있는 주장은 이미 판정이 끝났다는 표시를 달아 보낸다. 뒤 단계(법률 조회·
// 심층 재확인·지목 재확인)는 이 표시를 보고 건너뛴다.
export async function applyCache(claims) {
  return Promise.all(
    claims.map(async (c) => {
      // 법률 주장은 추출 시점에 판정이 없으므로(pending_legal_check) 캐시를 먼저 본다.
      const hit = await findClaim(c).catch(() => null);
      return hit || c;
    }),
  );
}

export async function storeAll(claims) {
  await Promise.all(claims.filter((c) => !c.from_claim_cache).map((c) => saveClaim(c).catch(() => {})));
}

export async function claimCacheStats() {
  const row = await one("SELECT COUNT(*) AS n, COALESCE(SUM(hits), 0) AS hits FROM claim_cache");
  return { entries: Number(row?.n) || 0, hits: Number(row?.hits) || 0 };
}
