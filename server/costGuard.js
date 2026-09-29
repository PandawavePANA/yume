// 하루 AI 비용 차단기.
//
// 검증 한 건은 원가가 약 210원이고, 익명 방문자에게도 하루 3회를 무료로 준다. 광고로 사람이
// 한꺼번에 들어오면 결제가 한 건도 없는 채로 AI 비용이 먼저 불어난다 — 하루 1,000명이 평균
// 2회만 써도 40만 원이다. 그래서 오늘(한국 시간) 쓴 AI 비용이 상한을 넘으면 **무료 확인만**
// 멈춘다. 크레딧으로 쓰는 사람과 API 고객은 돈을 내고 쓰는 것이라 막지 않는다.
//
// 비용은 이미 기록되고 있다 — 검증 한 건의 원가(verifications.cost_usd)와 검증 밖의 호출
// (api_costs: 캡처 읽기 등). 둘을 오늘 0시부터 더한다. 매번 세면 검증마다 쿼리가 늘어나므로
// 1분 동안은 센 값을 그대로 쓴다(1분 사이에 조금 넘치는 것은 감수한다).
//
// 상한의 80%에 닿으면 운영자에게 메일을 한 번 보낸다 — 멈추기 전에 알아야 올릴지 정할 수 있다.
import { kstDay, one, now } from "./db.js";
import { sendMail, mailConfigured } from "./mailer.js";
import { logError } from "./errorLog.js";

export const USD_KRW = 1400;
// 기본 상한 70달러(약 10만 원). 광고 예산에 맞춰 Railway 환경변수 DAILY_AI_BUDGET_USD로 바꾼다.
export const dailyBudgetUsd = () => {
  const v = Number(process.env.DAILY_AI_BUDGET_USD);
  return Number.isFinite(v) && v > 0 ? v : 70;
};

const TTL_MS = 60 * 1000;
let cache = { at: 0, day: "", usd: 0 };
let alertedDay = "";

function kstMidnight() {
  const d = kstDay();
  return Date.parse(`${d}T00:00:00+09:00`);
}

export async function todaySpendUsd({ fresh = false } = {}) {
  const day = kstDay();
  if (!fresh && cache.day === day && now() - cache.at < TTL_MS) return cache.usd;
  const since = kstMidnight();
  const [a, b] = await Promise.all([
    one("SELECT COALESCE(SUM(cost_usd), 0) AS usd FROM verifications WHERE created_at >= :since AND cost_usd IS NOT NULL", { since }),
    one("SELECT COALESCE(SUM(cost_usd), 0) AS usd FROM api_costs WHERE created_at >= :since", { since }),
  ]);
  const usd = Number(a?.usd || 0) + Number(b?.usd || 0);
  cache = { at: now(), day, usd };
  return usd;
}

/** 오늘 무료 확인을 멈춰야 하는지. 세다가 실패하면 멈추지 않는다(차단기가 서비스를 끄면 안 된다). */
export async function freeUsePaused() {
  try {
    const usd = await todaySpendUsd();
    const cap = dailyBudgetUsd();
    maybeAlert(usd, cap);
    return usd >= cap;
  } catch (e) {
    logError("costGuard", e);
    return false;
  }
}

function maybeAlert(usd, cap) {
  const day = kstDay();
  if (usd < cap * 0.8 || alertedDay === day || !mailConfigured()) return;
  alertedDay = day;
  const to = process.env.INQUIRY_TO || process.env.COMPANY_EMAIL || "reamer@d-reamer.com";
  const krw = (n) => `${Math.round(n * USD_KRW).toLocaleString("ko-KR")}원`;
  sendMail({
    brand: "YUME",
    to,
    subject: `[유메 운영] 오늘 AI 비용이 상한의 ${Math.round((usd / cap) * 100)}%입니다`,
    text: [
      `오늘(한국 시간) AI 비용 $${usd.toFixed(2)} (약 ${krw(usd)}) / 상한 $${cap} (약 ${krw(cap)})`,
      "상한에 닿으면 무료 확인이 내일 0시까지 멈춥니다. 크레딧 사용자와 API 고객은 계속 쓸 수 있습니다.",
      "올리려면 Railway yume 서비스의 DAILY_AI_BUDGET_USD를 바꾸세요.",
    ].join("\n"),
  }).catch((e) => logError("costGuard:mail", e));
}

/** 테스트용 — 센 값을 버린다. */
export function _resetCostGuard() {
  cache = { at: 0, day: "", usd: 0 };
  alertedDay = "";
}
