import { kstDay, now, one, run } from "./db.js";

export { PLANS, FREE_DAILY_LIMIT, TOKEN_PRICE_KRW, effectivePlan } from "./plans.js";
import { PLANS, effectivePlan } from "./plans.js";
import { ensureMonthlyGrant, spendForVerification, creditsFor, balance as creditBalance, grant as grantCredits } from "./credits.js";

// 무료 계정을 여러 개 만들어 한도를 우회하는 걸 막기 위한, 같은 IP 전체의 하루 상한.
const IP_DAILY_CEILING = 30;

const keyFor = ({ user, ip, kakaoId }) => (user ? `user:${user.id}` : kakaoId ? `kakao:${kakaoId}` : `ip:${ip}`);

async function usedToday(key) {
  return (await one("SELECT used FROM usage_daily WHERE client_key = :key AND day = :day", { key, day: kstDay() }))?.used || 0;
}

function bump(key) {
  return run(
    `INSERT INTO usage_daily (client_key, day, used) VALUES (:key, :day, 1)
     ON CONFLICT (client_key, day) DO UPDATE SET used = usage_daily.used + 1`,
    { key, day: kstDay() },
  );
}

export async function walletBalance(key) {
  return (await one("SELECT tokens FROM wallets WHERE client_key = :key", { key }))?.tokens || 0;
}

export async function grantTokens(key, count) {
  await run(
    `INSERT INTO wallets (client_key, tokens, updated_at) VALUES (:key, GREATEST(0, :n), :at)
     ON CONFLICT (client_key) DO UPDATE SET tokens = GREATEST(0, wallets.tokens + :n), updated_at = :at`,
    { key, n: count, at: now() },
  );
  return walletBalance(key);
}

// 검증 1건을 시작할 때 호출. identity는 { user, ip } 또는 { kakaoId }.
//
// 로그인한 사람은 크레딧으로 움직인다 — 요금제 월 지급분을 먼저 채우고, 1개를 쓴다.
// 그 위에 하루 공정 이용 한도를 얹어서, 월 크레딧이 남아 있어도 하루에 몰아 쓰지는
// 못하게 한다(클로드가 월 한도와 별개로 짧은 구간 한도를 두는 것과 같은 이유).
//
// 로그인하지 않은 사람은 크레딧 원장을 가질 수 없으므로(계정이 없다) 예전처럼
// 하루 무료 횟수만으로 움직인다.
export async function checkAndConsume({ user = null, ip = null, kakaoId = null, chars = 0 }) {
  const plan = effectivePlan(user);
  const limit = PLANS[plan].dailyLimit;
  const key = keyFor({ user, ip, kakaoId });
  const ipKey = ip ? `ipall:${ip}` : null;
  const anonymous = key.startsWith("ip:");

  if (user && plan === "free" && ipKey && (await usedToday(ipKey)) >= IP_DAILY_CEILING) {
    return { allowed: false, plan, reason: "ip_ceiling", remainingFree: 0, dailyLimit: limit, credits: await creditBalance(user.id) };
  }

  // 하루 한도부터 확인한다. 한도를 넘으면 크레딧이 남아 있어도 막는다 —
  // 크레딧이 있다고 하루에 다 태우게 두면 공정 이용 한도가 있으나 마나다.
  const inc = await run(
    `INSERT INTO usage_daily (client_key, day, used) VALUES (:key, :day, 1)
     ON CONFLICT (client_key, day) DO UPDATE SET used = usage_daily.used + 1 WHERE usage_daily.used < :limit
     RETURNING used`,
    { key, day: kstDay(), limit },
  );
  if (!inc.rows.length) {
    return {
      allowed: false,
      plan,
      reason: "daily_limit",
      remainingFree: 0,
      dailyLimit: limit,
      credits: user ? await creditBalance(user.id) : 0,
    };
  }
  const used = inc.rows[0].used;

  if (!user) {
    // 익명·카카오 사용자는 크레딧 없이 하루 무료 횟수로만 쓴다.
    if (ipKey) await bump(ipKey);
    return { allowed: true, plan, usedFree: true, remainingFree: limit - used, dailyLimit: limit, credits: 0 };
  }

  await ensureMonthlyGrant(user);
  // 길이에 비례해 차감한다. 긴 입력은 주장도 검색도 많아 원가가 그만큼 더 든다.
  const spent = await spendForVerification(user.id, chars, null);
  if (!spent) {
    // 크레딧이 없으면 방금 올린 하루 사용량을 되돌린다 — 쓰지도 못했는데 한도만 깎이면 안 된다.
    await run("UPDATE usage_daily SET used = GREATEST(0, used - 1) WHERE client_key = :key AND day = :day", { key, day: kstDay() });
    return {
      allowed: false, plan, reason: "no_credits", remainingFree: limit - used, dailyLimit: limit,
      credits: await creditBalance(user.id), needed: creditsFor(chars),
    };
  }
  if (ipKey) await bump(ipKey);
  return { allowed: true, plan, usedFree: false, creditsSpent: spent, remainingFree: limit - used, dailyLimit: limit, credits: await creditBalance(user.id) };
}

// 검증이 서버 오류로 실패하면 사용자가 한 번을 날리지 않도록 되돌려준다.
// 크레딧과 하루 사용량 둘 다 되돌려야 한다 — 하나만 돌리면 다음 검증에서 어긋난다.
export async function refundOne({ user = null, ip = null, kakaoId = null, usedFree, creditsSpent = 1 }) {
  const key = keyFor({ user, ip, kakaoId });
  await run("UPDATE usage_daily SET used = GREATEST(0, used - 1) WHERE client_key = :key AND day = :day", { key, day: kstDay() });
  if (user && usedFree === false) {
    // 차감한 만큼 그대로 돌려준다. 길이에 따라 2개 이상 빠졌을 수 있다.
    await grantCredits(user.id, Math.max(1, Number(creditsSpent) || 1), "refund", { memo: "검증 실패 환급" });
  }
}

export async function peekUsage({ user = null, ip = null, kakaoId = null }) {
  const plan = effectivePlan(user);
  const limit = PLANS[plan].dailyLimit;
  const key = keyFor({ user, ip, kakaoId });
  const used = await usedToday(key);
  return {
    plan,
    dailyLimit: limit,
    usedToday: used,
    remainingFree: Math.max(0, limit - used),
    credits: user ? await creditBalance(user.id) : 0,
  };
}
