// API 체험 한도와 요율표. 아무것도 import 하지 않는다 — 서버(plans.js, apiKeys.js, apiV1.js)와
// 기업용 화면(src/BusinessPage.jsx)이 같은 값을 읽어야 요금표와 실제 한도가 어긋나지 않는다.
//
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
//
// 체험 한도는 **계정당**이다(apiKeys.js의 quotaUsage). 예전에는 키마다 붙어서, 계정당 키 10개를
// 만들면 매달 200회가 무료였다.
export const API_TRIAL_QUOTA = 20;

// API 요율표. 개인 요금제와 단가가 다른 이유는 고객이 다르기 때문이다 — 개인은 자기
// 답변을 확인하고, 기업은 자기 고객에게 나갈 답변을 거른다.
//
// 2026-10-14 대표 확정. 원가를 다시 쟀다 — 10/8 엔진 강화(근거 잠금·조건 복원) 뒤 검사 1건 원가는
// 보통 AI 답변(약 640자) 515원, 1,000자 840원(운영 DB 37건). 예전 단가(종량제 700원·그로스 건당
// 500원)는 210원 시절 값이라 그로스는 팔수록 손해였다.
//
// 그래서 1건을 **1,000자까지**로 정하고(긴 글은 1,000자마다 1건 — apiUnits), 640자 답변 기준 원가율
// 34~48%가 되게 올렸다. 한도도 같은 단위로 센다(apiKeys.js api_usage.units).
export const API_UNIT_CHARS = 1000;
/** 글자 수 → 과금 건수(1,000자마다 1건, 최소 1). */
export const apiUnits = (chars) => Math.max(1, Math.ceil((Number(chars) || 0) / API_UNIT_CHARS));

export const API_RATES = {
  trial: { label: "체험", calls: API_TRIAL_QUOTA, krw: 0 },
  metered: { label: "종량제", unitKrw: 1500 },
  tiers: [
    { key: "starter", label: "스타터", monthlyKrw: 490000, calls: 400 },
    { key: "growth", label: "그로스", monthlyKrw: 1290000, calls: 1200 },
  ],
  // 상담으로만 판다. 건당 900원 아래로는 받지 않는다(원가 절감 전에는 긴 답변에서 남는 게 없다).
  enterprise: { label: "엔터프라이즈", fromKrw: 3000000 },
};

// AI 감사 — 사이트에서 바로 사는 상품(2026-10-14 대표 확정). 금액은 공급가액(VAT 별도).
// 입금 확인 뒤 영업일 기준 1~3일 안에 보고서를 보낸다 — 운영자 작업 리스트(workList.js)의 마감일이 이 값이다.
export const AUDIT_LEAD = "영업일 기준 1~3일";
export const AUDIT_LEAD_DAYS = 3;
export const AUDIT_PILOT_SEATS = 3;
export const AUDIT_RATES = {
  audit: { label: "AI 정밀 감사", krw: 2900000, unit: "회", spec: "50문항(고난도 함정·공격형) · 사람 재확인 · 보고서 · 30분 설명 · 고친 뒤 재검사 1회", rounds: 1 },
  audit_pilot: { label: "AI 정밀 감사 — 파일럿", krw: 1450000, unit: "회", spec: "정밀 감사와 같은 범위 · 첫 3곳 50% · 결과 피드백 통화 30분", rounds: 1 },
  audit_regular: { label: "AI 정기 감사", krw: 1500000, unit: "분기", spec: "분기마다 30문항 · 법령 개정 추적 알림 · 공개 감사 기록·배지(동의 시)", rounds: 1 },
  audit_regular_year: { label: "AI 정기 감사 — 1년 선납", krw: 5400000, unit: "년", spec: "4분기 · 정기 감사 4회 값에서 10% 할인", rounds: 4 },
  audit_package: { label: "출시 전 패키지", krw: 3900000, unit: "식", spec: "정밀 감사 + API 스타터 3개월(월 400건)", rounds: 1 },
};
// 감사 주문서에서 고르는 업종(감사 데스크의 문항 은행 업종과 같은 이름).
export const AUDIT_ORDER_DOMAINS = ["법률", "인사", "의료", "금융", "커머스", "제조", "공공", "범용"];
