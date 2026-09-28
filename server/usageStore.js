import { kstDay, now, one, run } from "./db.js";

export { PLANS, FREE_DAILY_LIMIT, FREE_DAILY_CHECKS, TOKEN_PRICE_KRW, effectivePlan, userDailyCap } from "./plans.js";
import { PLANS, FREE_DAILY_CHECKS, effectivePlan, userDailyCap } from "./plans.js";
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
// 누구나 하루 첫 3회(FREE_DAILY_CHECKS)는 무료다. 로그인한 사람은 그 위로 크레딧을 써서
// 더 확인할 수 있고, 하루 상한(userDailyCap)이 몰아 쓰기를 막는다(클로드가 월 한도와 별개로
// 짧은 구간 한도를 두는 것과 같은 이유).
//
// 로그인하지 않은 사람은 크레딧 원장을 가질 수 없으므로(계정이 없다) 하루 무료 횟수만으로
// 움직인다.
export async function checkAndConsume({ user = null, ip = null, kakaoId = null, chars = 0 }) {
  const plan = effectivePlan(user);
  // 익명·카카오는 무료분이 곧 하루 한도, 로그인한 사람은 무료분 + 크레딧분까지.
  const limit = user ? userDailyCap(plan) : PLANS[plan].dailyLimit;
  const key = keyFor({ user, ip, kakaoId });
  const ipKey = ip ? `ipall:${ip}` : null;

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

  // 오늘 첫 3회는 크레딧을 쓰지 않는다.
  if (used <= FREE_DAILY_CHECKS) {
    if (ipKey) await bump(ipKey);
    return {
      allowed: true, plan, usedFree: true, remainingFree: FREE_DAILY_CHECKS - used, dailyLimit: limit,
      credits: await creditBalance(user.id),
    };
  }

  await ensureMonthlyGrant(user);
  // 길이에 비례해 차감한다. 긴 입력은 주장도 검색도 많아 원가가 그만큼 더 든다.
  const spent = await spendForVerification(user.id, chars, null);
  if (!spent) {
    // 크레딧이 없으면 방금 올린 하루 사용량을 되돌린다 — 쓰지도 못했는데 한도만 깎이면 안 된다.
    await run("UPDATE usage_daily SET used = GREATEST(0, used - 1) WHERE client_key = :key AND day = :day", { key, day: kstDay() });
    return {
      allowed: false, plan, reason: "no_credits", remainingFree: 0, dailyLimit: limit,
      credits: await creditBalance(user.id), needed: creditsFor(chars),
    };
  }
  if (ipKey) await bump(ipKey);
  return { allowed: true, plan, usedFree: false, creditsSpent: spent, remainingFree: 0, dailyLimit: limit, credits: await creditBalance(user.id) };
}

// 검증이 서버 오류로 실패하면 사용자가 한 번을 날리지 않도록 되돌려준다.
// 크레딧과 하루 사용량 둘 다 되돌려야 한다 — 하나만 돌리면 다음 검증에서 어긋난다.
export async function refundOne({ user = null, ip = null, kakaoId = null, usedFree, creditsSpent = 1 }) {
  const key = keyFor({ user, ip, kakaoId });
  const day = kstDay();
  await run("UPDATE usage_daily SET used = GREATEST(0, used - 1) WHERE client_key = :key AND day = :day", { key, day });
  // checkAndConsume이 올린 IP 전체 사용량도 되돌린다. 안 돌리면 실패가 쌓일수록
  // 같은 네트워크의 다른 사람까지 IP 상한에 먼저 걸린다.
  if (ip) await run("UPDATE usage_daily SET used = GREATEST(0, used - 1) WHERE client_key = :key AND day = :day", { key: `ipall:${ip}`, day });
  if (user && usedFree === false) {
    // 차감한 만큼 그대로 돌려준다. 길이에 따라 2개 이상 빠졌을 수 있다.
    await grantCredits(user.id, Math.max(1, Number(creditsSpent) || 1), "refund", { memo: "검증 실패 환급" });
  }
}

export async function peekUsage({ user = null, ip = null, kakaoId = null }) {
  const plan = effectivePlan(user);
  const limit = user ? userDailyCap(plan) : PLANS[plan].dailyLimit;
  const key = keyFor({ user, ip, kakaoId });
  // 두 조회는 서로를 기다릴 이유가 없다. 예전에는 하나 끝나고 다음을 불렀는데, 앱 서버는
  // 미국 동부에 있고 DB는 서울에 있어서 조회 한 번이 태평양 왕복(~200ms)이다. 모든 화면이
  // 처음 뜰 때 부르는 자리라, 차례로 부르면 로그인한 사람만 그만큼 늦게 뜬다.
  const [used, credits] = await Promise.all([
    usedToday(key),
    user ? creditBalance(user.id) : 0,
  ]);
  return {
    plan,
    dailyLimit: limit,
    usedToday: used,
    // 화면의 "오늘 무료 n/3회 남음"은 무료분만 센다. 크레딧으로 더 쓸 수 있는 양은 잔액이 말한다.
    freeLimit: FREE_DAILY_CHECKS,
    remainingFree: Math.max(0, FREE_DAILY_CHECKS - used),
    credits,
  };
}
