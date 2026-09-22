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
export const TOKEN_PRICE_KRW = 100;

// API 호출 한도는 일반 크레딧과 완전히 다른 지갑이다.
//
// 개인 요금제(무료/스탠다드/전문가)는 웹·앱에서 직접 검증할 때 쓰는 크레딧을 준다.
// API는 남의 서비스 안에서 돌아가는 것이라 트래픽 규모도 단가도 다른 별개의 상품이고,
// 계약으로 한도를 정한다. 예전에는 개인 요금제에서 API 한도를 끌어다 썼는데, 그러면
// 29,000원짜리 개인 구독이 월 5,000회 API를 딸려 보내게 된다 — B2B를 팔 수 없다.
//
// 그래서 키를 만들면 누구나 같은 체험 한도로 시작하고, 그 위는 운영자가 계약에 따라
// 올린다(관리자 대시보드). 개인 크레딧이 줄어도 API 한도는 그대로이고, 반대도 같다.
// 100회는 원가로 21,000원이다. 키를 만들기만 하면 그만큼을 그냥 주는 셈이었다.
// 20회면 4,200원이고, 붙여서 응답 형식을 확인하는 데는 충분하다. 더 필요하면
// 계약으로 올린다 — 그게 이 한도를 개인 요금제와 따로 둔 이유다.
export const API_TRIAL_QUOTA = 20;

// API 요율표. 개인 요금제와 단가가 다른 이유는 고객이 다르기 때문이다 — 개인은 자기
// 답변을 확인하고, 기업은 자기 고객에게 나갈 답변을 거른다. 건당 원가는 같지만
// 한 건이 막아 주는 손해의 크기가 다르다.
//
// 아래 단가는 전부 실측 원가(검증 1건 약 210원)를 기준으로 잡았다. 종량제가 가장
// 비싸고 약정 물량이 클수록 싸지되, 가장 싼 구간도 원가율이 45%를 넘지 않게 두었다.
export const API_RATES = {
  trial: { label: "체험", calls: API_TRIAL_QUOTA, krw: 0 },
  metered: { label: "종량제", unitKrw: 700 },
  tiers: [
    { key: "starter", label: "스타터", monthlyKrw: 290000, calls: 500 },
    { key: "growth", label: "그로스", monthlyKrw: 900000, calls: 1800 },
  ],
};

export function effectivePlan(user) {
  if (!user) return "free";
  if (user.plan !== "free" && user.plan_expires_at && user.plan_expires_at < now()) return "free";
  return PLANS[user.plan] ? user.plan : "free";
}

