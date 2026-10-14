// 영업일 계산 — 감사 마감(입금 확인 + 영업일 3일)을 운영자 작업 리스트와 고객 안내에 같은 날로 찍는다.
// 아무것도 import 하지 않는다(b2bDeals·workList 어디서 불러도 순환이 없게).
//
// 공휴일은 대체공휴일까지 적은 표다. 해마다 연말에 다음 해 줄을 더할 것 — 빠지면 마감이 하루 당겨질
// 뿐이라(운영자가 더 일찍 끝내게 됨) 고객에게 늦는 쪽으로 틀리지는 않는다. 설 연휴처럼 헷갈리는 날은
// 넓게 잡았다.
const KR_HOLIDAYS = new Set([
  "2026-10-05", "2026-10-09", "2026-12-25",
  "2027-01-01", "2027-02-05", "2027-02-08", "2027-02-09", "2027-03-01", "2027-05-05", "2027-05-13",
  "2027-08-16", "2027-09-14", "2027-09-15", "2027-09-16", "2027-10-04", "2027-10-11", "2027-12-27",
]);
const KST = 9 * 3600_000;
const DAY = 86_400_000;

const ymd = (kstMs) => new Date(kstMs).toISOString().slice(0, 10);
export function isBusinessDay(ts) {
  const k = Number(ts) + KST;
  const dow = new Date(k).getUTCDay();
  return dow !== 0 && dow !== 6 && !KR_HOLIDAYS.has(ymd(k));
}

/** ts(한국 시각 기준) 다음 영업일부터 n일째 되는 날의 18:00(KST). */
export function addBusinessDays(ts, n) {
  const k = Number(ts) + KST;
  let dayStart = k - (k % DAY); // KST 자정(가짜 UTC 축)
  let left = Math.max(0, Math.floor(n));
  while (left > 0) {
    dayStart += DAY;
    if (isBusinessDay(dayStart - KST)) left -= 1;
  }
  return dayStart + 18 * 3600_000 - KST;
}

/** 남은 영업일(오늘 포함 안 함). 지났으면 음수 대신 0. */
export function businessDaysUntil(due, at = Date.now()) {
  let n = 0;
  const k0 = Number(at) + KST;
  let d = k0 - (k0 % DAY);
  const end = Number(due) + KST;
  while (d + DAY <= end - (end % DAY)) {
    d += DAY;
    if (isBusinessDay(d - KST)) n += 1;
  }
  return n;
}

export const kstDate = (t) => {
  const d = new Date(Number(t) + KST);
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`;
};
