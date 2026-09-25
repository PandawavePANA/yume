// 판정 정정 — 유메가 틀렸다고 알려주는 문.
//
// 없던 것을 만든 이유. 어떤 사용자가 와인 평점 주장을 검증했더니 유메가 "사실과 다름"을
// 붙였는데, 대충 검색해도 그 평점은 실재했다. 그런데 그 사실을 우리에게 알릴 방법이
// 화면에 없었다. 제보(bounty.js)는 **남의 AI가 지어낸 인용**만 받게 되어 있어서,
// **우리가 틀린 것**을 받을 자리가 아니었다.
//
// 팩트체크 서비스가 자기 오류를 발견할 방법은 사실상 이것뿐이다. 우리가 스스로 잡을 수
// 있는 오류는 이미 파이프라인이 잡고 있고(claimGuard·reviewAccusations), 거기서 새는 것은
// 정의상 우리가 못 보는 것이다. 본 사람은 사용자뿐이다.
//
// 그래서 값을 제보와 비슷하게 매겼다(contribution.js의 POINTS.correction). 남의 AI가
// 틀린 것을 알려주는 값보다 우리가 틀린 것을 알려주는 값이 낮을 이유가 없다.
//
// 세 가지 규율은 제보에서 그대로 가져온다.
//   ① 점수는 "제출"이 아니라 "승인"에 준다. 제출만으로 점수면 아무 글이나 넣는 게 최적이 된다.
//   ② 같은 주장을 두 번 넣어 두 번 받을 수 없다.
//   ③ 검토 대기 건수에 상한을 둔다.
//
// ④는 여기만의 것이다. 승인하면 그 주장의 캐시를 지운다. 판정만 고치고 캐시를 두면
// 같은 주장이 다음 검증에서 그 틀린 판정으로 다시 나간다 — 고쳤다는 말이 거짓이 된다.
import { all, now, one, run } from "./db.js";
import { POINTS, award } from "./contribution.js";
import { claimKey, forgetClaim } from "./claimCache.js";
import { logError } from "./errorLog.js";

const MAX_PENDING_PER_USER = 10;
const MIN_NOTE = 10;
const MAX_NOTE = 1000;

// 사용자가 "맞다고 본 것"의 값. 유메의 판정 값과 같은 어휘를 쓴다.
const CORRECT_VERDICTS = new Set(["confirmed", "false", "uncertain"]);
export const VERDICT_LABEL = { confirmed: "사실로 확인됨", false: "사실과 다름", uncertain: "확인되지 않음" };

// 근거 링크. 필수는 아니다 — 지면 기사나 구독자 전용 자료처럼 링크를 댈 수 없는 근거가
// 있고, 그게 바로 유메가 틀리는 자리이기 때문이다. 대신 무엇을 보고 그렇게 판단했는지를
// 글로 받는다. 링크를 넣는다면 실제로 열 수 있는 주소여야 한다.
function checkEvidenceUrl(raw) {
  const v = String(raw || "").trim();
  if (!v) return { url: null };
  let u;
  try {
    u = new URL(v);
  } catch {
    return { error: "근거 링크가 올바른 주소가 아니에요. 생략하고 설명만 적어주셔도 됩니다." };
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return { error: "근거 링크는 http 또는 https 주소만 넣을 수 있어요." };
  return { url: u.toString().slice(0, 1000) };
}

/** 이 주장이 정정 대상이 되는지. 판정이 붙어 있는 주장이면 모두 된다. */
export function correctionEligibility(claim) {
  if (!claim) return { eligible: false, reason: "주장을 찾을 수 없어요." };
  if (!VERDICT_LABEL[claim.verdict]) return { eligible: false, reason: "아직 판정이 붙지 않은 주장이에요." };
  return { eligible: true };
}

export async function submitCorrection({ user, verification, claimIdx, correctVerdict, evidenceUrl, note }) {
  const claim = verification?.result?.claims?.[claimIdx];
  const eligibility = correctionEligibility(claim);
  if (!eligibility.eligible) return { error: eligibility.reason };

  if (!CORRECT_VERDICTS.has(correctVerdict)) return { error: "맞는 판정을 골라주세요." };
  if (correctVerdict === claim.verdict) return { error: "유메가 낸 판정과 같아요. 다른 판정이어야 정정이 됩니다." };

  const body = String(note || "").trim();
  if (body.length < MIN_NOTE) return { error: `무엇이 왜 다른지 ${MIN_NOTE}자 이상 적어주세요. 근거가 없으면 확인할 수 없어요.` };

  const link = checkEvidenceUrl(evidenceUrl);
  if (link.error) return { error: link.error };

  const pending = (await one("SELECT COUNT(*) AS n FROM verdict_corrections WHERE user_id = :u AND status = 'pending'", { u: user.id }))?.n || 0;
  if (pending >= MAX_PENDING_PER_USER) {
    return { error: `검토 중인 정정이 ${MAX_PENDING_PER_USER}건이에요. 결과가 나온 뒤에 다시 보내주세요.` };
  }

  // 캐시 키를 지금 계산해 함께 저장한다. 승인 시점에 다시 계산하면 그때까지 엔진
  // 버전이 올라가 키가 달라져 있을 수 있는데, 그러면 지워야 할 것을 못 지운다.
  let claimHash = null;
  try {
    claimHash = claimKey(claim);
  } catch (e) {
    logError("correction:hash", e);
  }

  let row;
  try {
    const r = await run(
      `INSERT INTO verdict_corrections (user_id, verification_id, claim_idx, claim_text, claim_hash, yume_verdict,
                                        yume_explanation, correct_verdict, evidence_url, note, created_at)
       VALUES (:userId, :vid, :idx, :text, :hash, :verdict, :explanation, :correct, :url, :note, :t) RETURNING *`,
      {
        userId: user.id,
        vid: verification.id,
        idx: claimIdx,
        text: String(claim.text || "").slice(0, 1000),
        hash: claimHash,
        verdict: claim.verdict,
        explanation: String(claim.explanation || "").slice(0, 2000),
        correct: correctVerdict,
        url: link.url,
        note: body.slice(0, MAX_NOTE),
        t: now(),
      },
    );
    row = r.rows[0];
  } catch (e) {
    if (e.code === "23505") return { error: "이 주장은 이미 정정을 보내셨어요.", duplicate: true };
    throw e;
  }
  return { correction: row };
}

export function listUserCorrections(userId, limit = 30) {
  return all(
    `SELECT id, claim_text, yume_verdict, correct_verdict, status, points, reviewer_note, created_at, reviewed_at
       FROM verdict_corrections WHERE user_id = :userId ORDER BY id DESC LIMIT :limit`,
    { userId, limit },
  );
}

export function listCorrections(status = null, limit = 200) {
  return all(
    `SELECT c.*, u.email, u.name FROM verdict_corrections c JOIN users u ON u.id = c.user_id
      ${status ? "WHERE c.status = :status" : ""} ORDER BY c.id DESC LIMIT :limit`,
    status ? { status, limit } : { limit },
  );
}

/**
 * 운영자 검토.
 *
 * 받아들이면 두 가지가 일어난다 — 점수를 주고, 그 주장의 캐시를 지운다. 둘째가 없으면
 * 정정은 기록으로만 남고 다음 사람은 같은 틀린 판정을 받는다.
 */
export async function reviewCorrection(id, { decision, points, note, reviewerId }) {
  const row = await one("SELECT * FROM verdict_corrections WHERE id = :id", { id });
  if (!row) return { error: "정정을 찾을 수 없어요." };
  if (row.status !== "pending") return { error: "이미 처리된 정정이에요." };

  const status = { accept: "accepted", reject: "rejected" }[decision];
  if (!status) return { error: "처리 방식이 올바르지 않아요." };

  const amount = status === "accepted" ? Math.max(0, Math.min(5000, Number(points) || POINTS.correction)) : 0;
  await run(
    `UPDATE verdict_corrections SET status = :status, points = :points, reviewer_note = :note, reviewed_by = :by, reviewed_at = :t
      WHERE id = :id`,
    { id, status, points: amount, note: note ? String(note).slice(0, 500) : null, by: reviewerId, t: now() },
  );

  let cacheCleared = false;
  if (status === "accepted") {
    if (amount > 0) {
      await award(row.user_id, "correction", amount, {
        ref: `correction:${id}`,
        memo: String(row.claim_text || "").slice(0, 120),
      });
    }
    // 저장해 둔 키로 직접 지운다. 그때의 판정이 그 키에 들어 있다.
    if (row.claim_hash) {
      const r = await run("DELETE FROM claim_cache WHERE hash = :hash", { hash: row.claim_hash }).catch((e) => {
        logError("correction:cache", e);
        return null;
      });
      cacheCleared = !!r;
    } else {
      cacheCleared = await forgetClaim({ text: row.claim_text }).catch(() => false);
    }
  }
  return { ok: true, status, points: amount, cacheCleared };
}

export async function correctionStats() {
  const row = await one(
    `SELECT COUNT(*) FILTER (WHERE status = 'pending') AS pending,
            COUNT(*) FILTER (WHERE status = 'accepted') AS accepted,
            COUNT(*) FILTER (WHERE status = 'rejected') AS rejected,
            COUNT(*) AS total
       FROM verdict_corrections`,
  );
  return { pending: Number(row?.pending) || 0, accepted: Number(row?.accepted) || 0, rejected: Number(row?.rejected) || 0, total: Number(row?.total) || 0 };
}
