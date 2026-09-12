import { kstDay, now, one, run } from "./db.js";

// 요금제 정의 — 서버가 유일한 기준이다(프론트는 표시만). 결제 연동 전이라 유료 플랜은
// 관리자가 대시보드에서 직접 부여한다.
// dailyLimit: 하루 검증 횟수. 유료 플랜의 값은 "무제한" 대신 쓰는 공정 이용 한도.
export const PLANS = {
  free: { label: "무료", dailyLimit: 5, historyLimit: 50, apiMonthlyQuota: 100 },
  standard: { label: "스탠다드", dailyLimit: 200, historyLimit: null, apiMonthlyQuota: 1000 },
  expert: { label: "전문가", dailyLimit: 500, historyLimit: null, apiMonthlyQuota: 5000 },
  business: { label: "비즈니스", dailyLimit: 2000, historyLimit: null, apiMonthlyQuota: 50000 },
};
export const FREE_DAILY_LIMIT = PLANS.free.dailyLimit;
export const TOKEN_PRICE_KRW = 100;
// 무료 계정을 여러 개 만들어 한도를 우회하는 걸 막기 위한, 같은 IP 전체의 하루 상한.
const IP_DAILY_CEILING = 30;

export function effectivePlan(user) {
  if (!user) return "free";
  if (user.plan !== "free" && user.plan_expires_at && user.plan_expires_at < now()) return "free";
  return PLANS[user.plan] ? user.plan : "free";
}

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
// 무료 한도 → 보유 토큰 순으로 차감하고, 둘 다 없으면 막는다. 여러 요청이 동시에 와도
// 한도를 넘지 않도록 "한도 미만일 때만 +1" 하는 원자적 갱신으로 처리한다.
export async function checkAndConsume({ user = null, ip = null, kakaoId = null }) {
  const plan = effectivePlan(user);
  const limit = PLANS[plan].dailyLimit;
  const key = keyFor({ user, ip, kakaoId });
  const ipKey = ip ? `ipall:${ip}` : null;
  const anonymous = key.startsWith("ip:");

  if (user && plan === "free" && ipKey && (await usedToday(ipKey)) >= IP_DAILY_CEILING) {
    return { allowed: false, plan, reason: "ip_ceiling", remainingFree: 0, dailyLimit: limit, tokens: await walletBalance(key) };
  }

  const inc = await run(
    `INSERT INTO usage_daily (client_key, day, used) VALUES (:key, :day, 1)
     ON CONFLICT (client_key, day) DO UPDATE SET used = usage_daily.used + 1 WHERE usage_daily.used < :limit
     RETURNING used`,
    { key, day: kstDay(), limit },
  );
  if (inc.rows.length) {
    if (ipKey) await bump(ipKey);
    const used = inc.rows[0].used;
    return { allowed: true, plan, usedFree: plan === "free", remainingFree: limit - used, dailyLimit: limit, tokens: anonymous ? 0 : await walletBalance(key) };
  }

  // 토큰은 로그인 계정·카카오 사용자만 가질 수 있다(익명 IP에는 잔액을 두지 않는다).
  if (!anonymous) {
    const spent = await run("UPDATE wallets SET tokens = tokens - 1, updated_at = :at WHERE client_key = :key AND tokens > 0 RETURNING tokens", {
      key,
      at: now(),
    });
    if (spent.rows.length) {
      if (ipKey) await bump(ipKey);
      return { allowed: true, plan, usedFree: false, remainingFree: 0, dailyLimit: limit, tokens: spent.rows[0].tokens };
    }
  }
  return { allowed: false, plan, reason: "daily_limit", remainingFree: 0, dailyLimit: limit, tokens: anonymous ? 0 : await walletBalance(key) };
}

// 검증이 서버 오류로 실패하면 사용자가 한 번을 날리지 않도록 되돌려준다.
export async function refundOne({ user = null, ip = null, kakaoId = null, usedFree }) {
  const key = keyFor({ user, ip, kakaoId });
  if (usedFree === false) {
    await grantTokens(key, 1);
    return;
  }
  await run("UPDATE usage_daily SET used = GREATEST(0, used - 1) WHERE client_key = :key AND day = :day", { key, day: kstDay() });
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
    tokens: key.startsWith("ip:") ? 0 : await walletBalance(key),
  };
}
