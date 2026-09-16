import crypto from "node:crypto";
import { all, kstMonthStart, now, one, run } from "./db.js";
import { REFERRAL_CREDITS, REFERRAL_MONTHLY_CAP, grant } from "./credits.js";
import { awardForReferral, POINTS as CONTRIBUTION_POINTS } from "./contribution.js";
import { logError } from "./errorLog.js";

// 친구 추천 — 내 링크로 가입한 친구가 실제로 검증을 한 번 마치면 추천한 사람에게
// 크레딧과 기여도 점수를 함께 준다. 두 가지를 같이 주는 이유는 둘이 서로 다른 것을
// 사기 때문이다. 크레딧은 더 써 볼 수 있게 하고, 기여도는 분기 랭킹에 반영된다.
// 찾아낼 수 있는 사람을 한 명 늘린 것도 제품을 나아지게 한 일이므로 점수판에 들어간다.
//
// 가입만으로 주지 않는 이유: 크레딧에 실제 금전 가치가 있어서, 가입 즉시 지급하면
// 이메일만 여러 개 만들어 자기 자신을 추천하는 게 제일 남는 장사가 된다. "가입 + 첫 검증"은
// 최소한 손이 더 가고, 같은 IP에서 이어진 가입은 표시해 두어 운영자가 걸러낼 수 있게 했다.

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 헷갈리는 0/O, 1/I 제외

function newCode() {
  const bytes = crypto.randomBytes(8);
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

// 추천 코드는 처음 필요할 때 만든다(가입 시 전원에게 만들지 않아도 된다).
export async function ensureReferralCode(userId) {
  const row = await one("SELECT referral_code FROM users WHERE id = :id", { id: userId });
  if (row?.referral_code) return row.referral_code;
  for (let i = 0; i < 5; i += 1) {
    const code = newCode();
    try {
      await run("UPDATE users SET referral_code = :code WHERE id = :id AND referral_code IS NULL", { code, id: userId });
      const after = await one("SELECT referral_code FROM users WHERE id = :id", { id: userId });
      if (after?.referral_code) return after.referral_code;
    } catch (e) {
      if (e.code !== "23505") throw e; // 코드 충돌이면 다시 뽑는다
    }
  }
  throw new Error("추천 코드를 만들지 못했어요.");
}

export function findByCode(code) {
  const c = String(code || "").trim().toUpperCase();
  if (!/^[A-Z0-9]{6,16}$/.test(c)) return null;
  return one("SELECT id, email FROM users WHERE referral_code = :c", { c });
}

// 가입 시점에 연결만 해두고, 크레딧은 첫 검증 때 지급한다.
export async function attachReferral({ inviteeId, code, ip }) {
  try {
    const referrer = await findByCode(code);
    if (!referrer || referrer.id === inviteeId) return null;
    const sameIp = ip ? await one("SELECT 1 AS x FROM sessions WHERE user_id = :rid AND ip = :ip LIMIT 1", { rid: referrer.id, ip }) : null;
    await run("UPDATE users SET referred_by = :rid WHERE id = :iid", { rid: referrer.id, iid: inviteeId });
    await run(
      `INSERT INTO referrals (referrer_id, invitee_id, signup_ip, same_ip, created_at) VALUES (:rid, :iid, :ip, :same, :t)
       ON CONFLICT (invitee_id) DO NOTHING`,
      { rid: referrer.id, iid: inviteeId, ip: ip || null, same: sameIp ? 1 : 0, t: now() },
    );
    return referrer.id;
  } catch (e) {
    logError("referral:attach", e);
    return null; // 추천 연결이 실패해도 가입 자체는 막지 않는다
  }
}

// 피추천인이 검증을 마칠 때마다 불린다. 조건을 채웠으면 한 번만 지급한다.
export async function creditReferralOnActivity(userId) {
  try {
    const ref = await one("SELECT * FROM referrals WHERE invitee_id = :id AND status = 'pending'", { id: userId });
    if (!ref) return;
    // 같은 IP에서 이어진 가입은 자동 지급하지 않고 운영자가 보게 남겨둔다.
    if (ref.same_ip) {
      await run("UPDATE referrals SET status = 'review' WHERE id = :id", { id: ref.id });
      return;
    }
    const since = kstMonthStart();
    const month = (await one("SELECT COUNT(*) AS n FROM referrals WHERE referrer_id = :rid AND status = 'credited' AND credited_at > :since", {
      rid: ref.referrer_id,
      since,
    }))?.n || 0;
    if (month >= REFERRAL_MONTHLY_CAP) {
      await run("UPDATE referrals SET status = 'capped' WHERE id = :id", { id: ref.id });
      return;
    }
    const t = now();
    const upd = await run("UPDATE referrals SET status = 'credited', credited_at = :t WHERE id = :id AND status = 'pending'", { id: ref.id, t });
    if (!upd.changes) return; // 동시에 들어온 다른 요청이 이미 처리함
    await grant(ref.referrer_id, REFERRAL_CREDITS, "referral", { ref: `referral:${ref.id}`, memo: "친구 추천" });
    // 점수가 안 들어가도 크레딧은 이미 지급됐다. 여기서 던지면 위의 status 갱신까지
    // 되돌릴 방법이 없으므로, 실패는 기록만 남기고 삼킨다.
    await awardForReferral(ref.referrer_id, ref.id).catch((e) => logError("referral:contribution", e));
  } catch (e) {
    logError("referral:credit", e);
  }
}

export async function referralSummary(userId) {
  const code = await ensureReferralCode(userId);
  const rows = await all(
    `SELECT r.status, r.created_at, r.credited_at, u.email FROM referrals r JOIN users u ON u.id = r.invitee_id
      WHERE r.referrer_id = :id ORDER BY r.id DESC LIMIT 50`,
    { id: userId },
  );
  return {
    code,
    creditsPerReferral: REFERRAL_CREDITS,
    pointsPerReferral: CONTRIBUTION_POINTS.referral,
    monthlyCap: REFERRAL_MONTHLY_CAP,
    invited: rows.length,
    credited: rows.filter((r) => r.status === "credited").length,
    // 초대한 사람의 이메일 전체를 돌려주면 그쪽 개인정보가 새므로 앞부분만 보여준다.
    items: rows.map((r) => ({
      email: r.email.replace(/^(.{2}).*(@.*)$/, "$1***$2"),
      status: r.status,
      createdAt: r.created_at,
      creditedAt: r.credited_at,
    })),
  };
}

export function listReferralsForReview(limit = 100) {
  return all(
    `SELECT r.*, ru.email AS referrer_email, iu.email AS invitee_email
       FROM referrals r JOIN users ru ON ru.id = r.referrer_id JOIN users iu ON iu.id = r.invitee_id
      WHERE r.status IN ('review', 'pending') ORDER BY r.id DESC LIMIT :limit`,
    { limit },
  );
}

export async function resolveReferralReview(id, approve, reviewerId) {
  const ref = await one("SELECT * FROM referrals WHERE id = :id", { id });
  if (!ref) return { error: "추천 기록을 찾을 수 없어요." };
  if (ref.status === "credited") return { error: "이미 지급된 건이에요." };
  if (!approve) {
    await run("UPDATE referrals SET status = 'rejected' WHERE id = :id", { id });
    return { ok: true, status: "rejected" };
  }
  await run("UPDATE referrals SET status = 'credited', credited_at = :t WHERE id = :id", { id, t: now() });
  await grant(ref.referrer_id, REFERRAL_CREDITS, "referral", { ref: `referral:${id}`, memo: `친구 추천(검토 승인 · 관리자 ${reviewerId})` });
  await awardForReferral(ref.referrer_id, id).catch((e) => logError("referral:contribution", e));
  return { ok: true, status: "credited" };
}
