// 요금제 정의만 따로 둔다.
//
// 크레딧(credits.js)은 요금제별 월 지급량을 알아야 하고, 사용량 집계(usageStore.js)는
// 크레딧을 차감해야 한다. 요금제가 usageStore 안에 있으면 둘이 서로를 import 하게 되어
// 순환이 생기므로, 양쪽이 함께 바라보는 자리로 옮겼다.
import { now } from "./db.js";

// 요금제 정의 — 서버가 유일한 기준이다(프론트는 표시만). 결제 연동 전이라 유료 플랜은
// 관리자가 대시보드에서 직접 부여한다.
//
// 검증 1건에 크레딧 1개를 쓴다. 크레딧은 요금제마다 매달 정해진 양이 들어오고,
// 다 쓰면 최고 등급이라도 추가로 사야 한다(credits.js의 PLAN_CREDITS). 구독은
// 무제한이 아니다 — 클로드와 같은 구조다.
//
// dailyLimit은 그 위에 얹는 공정 이용 한도다. 월 크레딧이 남아 있어도 하루에
// 몰아 쓰는 건 막는다. 로그인하지 않은 사람은 크레딧이 없으니 이 한도만으로 움직인다.
export const PLANS = {
  free: { label: "무료", dailyLimit: 5, historyLimit: 50, apiMonthlyQuota: 100 },
  standard: { label: "스탠다드", dailyLimit: 200, historyLimit: null, apiMonthlyQuota: 1000 },
  expert: { label: "전문가", dailyLimit: 500, historyLimit: null, apiMonthlyQuota: 5000 },
  business: { label: "비즈니스", dailyLimit: 2000, historyLimit: null, apiMonthlyQuota: 50000 },
};
export const FREE_DAILY_LIMIT = PLANS.free.dailyLimit;
export const TOKEN_PRICE_KRW = 100;

export function effectivePlan(user) {
  if (!user) return "free";
  if (user.plan !== "free" && user.plan_expires_at && user.plan_expires_at < now()) return "free";
  return PLANS[user.plan] ? user.plan : "free";
}

