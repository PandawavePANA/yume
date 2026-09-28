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
// 하루 한도는 월 크레딧과 별개의 안전장치다. 월 지급분이 남아 있어도 하루에 몰아
// 쓰지 못하게 막는다. 예전에는 월 3,000 크레딧에 하루 200회처럼 한도가 서로 맞지
// 않아서, 한도가 걸리기 전에 원가가 먼저 터지는 구조였다. 이제 월 지급량의 절반쯤을
// 하루 상한으로 둔다 — 정상 사용은 걸리지 않고, 폭주만 걸린다.
// monthlyKrw는 공개 상품 안내(/products)와 카드사 심사에서 쓰는 판매가다. 화면의 요금제
// 카드는 src/YumeDashboard.jsx에 따로 있으니 가격을 고칠 때 두 곳을 같이 봐야 한다.
// 무료·비즈니스는 판매 상품이 아니라 0원이 아니라 null이다 — 심사는 0원 상품을 반려한다.
export const PLANS = {
  free: { label: "무료", dailyLimit: 3, historyLimit: 50, monthlyKrw: null },
  standard: { label: "스탠다드", dailyLimit: 15, historyLimit: null, monthlyKrw: 9900 },
  expert: { label: "전문가", dailyLimit: 40, historyLimit: null, monthlyKrw: 29000 },
  business: { label: "비즈니스", dailyLimit: 120, historyLimit: null, monthlyKrw: null },
};
export const FREE_DAILY_LIMIT = PLANS.free.dailyLimit;

// 누구나 매일 받는 무료 확인 횟수. 가입했든 안 했든, 어떤 요금제든 하루 첫 3회는 크레딧을
// 쓰지 않는다. 크레딧은 그 위로 더 쓰고 싶을 때 쓰는 것이다.
//
// 예전에는 로그인하면 첫 회부터 크레딧을 썼다. 무료 플랜은 한 달 5크레딧이라, 가입 안 한
// 사람(하루 3회, 한 달 ~90회)보다 가입한 사람이 94% 덜 썼다 — 한 걸음 더 들어온 사람이
// 덜 받는 구조였고, 유료 플랜도 같은 식으로 무료 3회를 잃었다. 원가로 보면 로그인한 사람
// 한 명이 무료로 쓸 수 있는 최대치가 익명과 같아질 뿐이라(하루 3회 × 약 210원), 이미 익명에게
// 열어 둔 범위 안이다.
export const FREE_DAILY_CHECKS = FREE_DAILY_LIMIT;

// 로그인한 사람의 하루 상한(무료분 + 크레딧분). 무료 플랜도 크레딧을 사서 더 쓸 수 있으므로
// 크레딧을 쓸 때의 상한은 스탠다드와 같은 선으로 둔다. 유료 플랜은 각자의 공정 이용 한도.
export function userDailyCap(plan) {
  return plan === "free" ? PLANS.standard.dailyLimit : (PLANS[plan] || PLANS.free).dailyLimit;
}
export const TOKEN_PRICE_KRW = 100;

// API 체험 한도와 요율표는 server/apiRates.js에 있다. 기업용 화면(src/BusinessPage.jsx)이
// 같은 값을 읽어 요금표를 그리는데, 이 파일은 db.js를 부르므로 브라우저 번들에 넣을 수 없다.
export { API_TRIAL_QUOTA, API_RATES } from "./apiRates.js";

export function effectivePlan(user) {
  if (!user) return "free";
  if (user.plan !== "free" && user.plan_expires_at && user.plan_expires_at < now()) return "free";
  return PLANS[user.plan] ? user.plan : "free";
}

