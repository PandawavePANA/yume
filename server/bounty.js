import { all, now, one, run } from "./db.js";
import { BOUNTY_CREDITS, grant } from "./credits.js";
import { checkShareUrl, platformLabel, verifyShareLink } from "./shareLink.js";
import { logError } from "./errorLog.js";

// 할루시네이션 제보 — 사용자가 AI 답변을 검증했는데 "존재하지 않는 인용"이 나오면,
// 그 대화 공유 링크와 함께 제보하고 검토를 거쳐 크레딧을 받는다.
//
// 보상 대상을 NEC가 '부존재 확실'로 판정한 인용으로만 좁혔다. 웹검색으로 틀렸다고 본
// 주장까지 열면 "이게 정말 틀린 게 맞나"를 사람이 매번 따져야 해서 검토가 감당이 안 되고,
// 중복 판정 기준도 세울 수 없다. 존재하지 않는 판례·법령·논문은 식별자가 있어서
// 기계적으로 같은 건인지 가릴 수 있고, 데이터셋에서 제일 값나가는 표본이기도 하다.

const MAX_PENDING_PER_USER = 10;

// 검증 결과의 주장 하나가 제보 대상이 되는지 본다.
export function bountyEligibility(claim) {
  if (!claim) return { eligible: false, reason: "주장을 찾을 수 없어요." };
  const nec = claim.nec;
  if (!nec || nec.grade !== "nonexistent") {
    return { eligible: false, reason: "존재하지 않는 인용(판례·법령·논문)으로 판정된 주장만 제보할 수 있어요." };
  }
  const value = nec.identifier?.canonical || nec.identifier?.value;
  if (!value) return { eligible: false, reason: "인용 식별자를 확인할 수 없어요." };
  return { eligible: true, identifier: { type: nec.identifier.type, value }, necScore: nec.score };
}

const dedupKey = (platform, identifierValue) => `${platform}:${String(identifierValue).replace(/\s+/g, "").toLowerCase()}`;

export async function submitBounty({ user, verification, claimIdx, platform, shareUrl }) {
  const claim = verification?.result?.claims?.[claimIdx];
  const eligibility = bountyEligibility(claim);
  if (!eligibility.eligible) return { error: eligibility.reason };

  const link = checkShareUrl(platform, shareUrl);
  if (link.error) return { error: link.error };

  const pending = (await one("SELECT COUNT(*) AS n FROM bounty_claims WHERE user_id = :u AND status = 'pending'", { u: user.id }))?.n || 0;
  if (pending >= MAX_PENDING_PER_USER) {
    return { error: `검토 중인 제보가 ${MAX_PENDING_PER_USER}건이에요. 결과가 나온 뒤에 다시 제보해주세요.` };
  }

  const key = dedupKey(platform, eligibility.identifier.value);
  const dup = await one("SELECT id, user_id, status FROM bounty_claims WHERE dedup_key = :key AND status IN ('pending', 'approved')", { key });
  if (dup) {
    return {
      error:
        dup.user_id === user.id
          ? "이미 제보하신 인용이에요."
          : `${platformLabel(platform)}에서 나온 이 인용은 이미 다른 분이 제보해 등록돼 있어요. 아직 알려지지 않은 인용만 보상 대상이에요.`,
      duplicate: true,
    };
  }

  let row;
  try {
    const r = await run(
      `INSERT INTO bounty_claims (user_id, verification_id, claim_idx, platform, share_url, dedup_key, identifier_type,
                                  identifier_value, claim_text, nec_score, nec_grade, link_check, created_at)
       VALUES (:userId, :vid, :idx, :platform, :url, :key, :itype, :ivalue, :text, :score, 'nonexistent', 'checking', :t) RETURNING *`,
      {
        userId: user.id,
        vid: verification.id,
        idx: claimIdx,
        platform,
        url: link.url,
        key,
        itype: eligibility.identifier.type,
        ivalue: eligibility.identifier.value,
        text: String(claim.text || "").slice(0, 1000),
        score: eligibility.necScore ?? null,
        t: now(),
      },
    );
    row = r.rows[0];
  } catch (e) {
    if (e.code === "23505") return { error: "이미 접수된 인용이에요.", duplicate: true };
    throw e;
  }

  // 링크 확인은 시간이 걸리니 응답을 붙들지 않는다. 결과는 검토 화면에 표시된다.
  checkLinkLater(row.id, link.url, [eligibility.identifier.value, claim.text]);
  return { bounty: row };
}

async function checkLinkLater(id, url, needles) {
  try {
    const { result, note } = await verifyShareLink(url, needles.filter(Boolean));
    await run("UPDATE bounty_claims SET link_check = :r, link_check_note = :n WHERE id = :id", { id, r: result, n: String(note || "").slice(0, 300) });
  } catch (e) {
    logError("bounty:linkcheck", e);
    await run("UPDATE bounty_claims SET link_check = 'unreachable', link_check_note = :n WHERE id = :id", { id, n: String(e.message).slice(0, 300) }).catch(
      () => {},
    );
  }
}

export function listUserBounties(userId, limit = 30) {
  return all(
    `SELECT id, platform, identifier_type, identifier_value, claim_text, status, credits, reviewer_note, created_at, reviewed_at
       FROM bounty_claims WHERE user_id = :userId ORDER BY id DESC LIMIT :limit`,
    { userId, limit },
  );
}

export function listBounties(status = null, limit = 200) {
  return all(
    `SELECT b.*, u.email, u.name FROM bounty_claims b JOIN users u ON u.id = b.user_id
      ${status ? "WHERE b.status = :status" : ""} ORDER BY b.id DESC LIMIT :limit`,
    status ? { status, limit } : { limit },
  );
}

// 운영자 검토. 승인하면 그 자리에서 크레딧이 지급된다.
export async function reviewBounty(id, { decision, credits, note, reviewerId }) {
  const row = await one("SELECT * FROM bounty_claims WHERE id = :id", { id });
  if (!row) return { error: "제보를 찾을 수 없어요." };
  if (row.status !== "pending") return { error: "이미 처리된 제보예요." };

  const status = { approve: "approved", reject: "rejected", duplicate: "duplicate" }[decision];
  if (!status) return { error: "처리 방식이 올바르지 않아요." };

  const amount = status === "approved" ? Math.max(0, Math.min(1000, Number(credits) || BOUNTY_CREDITS)) : 0;
  await run(
    `UPDATE bounty_claims SET status = :status, credits = :credits, reviewer_note = :note, reviewed_by = :by, reviewed_at = :t
      WHERE id = :id`,
    { id, status, credits: amount, note: note ? String(note).slice(0, 500) : null, by: reviewerId, t: now() },
  );
  if (amount > 0) {
    await grant(row.user_id, amount, "bounty", {
      ref: `bounty:${id}`,
      memo: `${platformLabel(row.platform)} — ${row.identifier_value}`,
    });
  }
  return { ok: true, status, credits: amount };
}

export async function bountyStats() {
  const row = await one(
    `SELECT COUNT(*) FILTER (WHERE status = 'pending') AS pending,
            COUNT(*) FILTER (WHERE status = 'approved') AS approved,
            COUNT(*) FILTER (WHERE status = 'rejected') AS rejected,
            COUNT(*) AS total
       FROM bounty_claims`,
  );
  return { pending: row?.pending || 0, approved: row?.approved || 0, rejected: row?.rejected || 0, total: row?.total || 0 };
}
