// 엔진(Anthropic API) 감시 — 멈추면 운영자에게 알리고, 조용할 때는 가끔 살아 있는지 확인한다.
//
// 멈춤(잔액 소진·키 오류)을 판단하는 규칙은 upstream.js에 있다. 여기서는 두 가지만 한다.
//   · 멈춤·회복을 메일로 알린다 — 같은 원인은 6시간에 한 번까지(충전 전까지 계속 오면 묻힌다)
//   · 배포 직후 한 번, 그리고 30분 넘게 성공 호출이 없으면 15분마다 확인 호출을 보낸다.
//     멈춰 있을 때는 5분마다 다시 확인해 충전하면 바로 풀리게 한다.
// 서버 프로세스(index.js)에서만 시작한다 — 시험에서는 타이머를 띄우지 않는다.
import { onEngineState, engineState, msSinceSuccess, OPERATOR_NOTE } from "./upstream.js";
import { probeEngine } from "./claude.js";
import { mailConfigured, sendMail } from "./mailer.js";
import { logError } from "./errorLog.js";

const ALERT_EVERY_MS = 6 * 60 * 60 * 1000;
const lastAlert = new Map();
const owner = () => process.env.OPS_ALERT_TO || process.env.INQUIRY_TO || process.env.COMPANY_EMAIL || "reamer@d-reamer.com";
const kst = (t) => new Date(t + 9 * 3600_000).toISOString().replace("T", " ").slice(0, 16);

function alert(subject, text, key) {
  const t = Date.now();
  if (key && t - (lastAlert.get(key) || 0) < ALERT_EVERY_MS) return;
  if (key) lastAlert.set(key, t);
  console.warn(`[엔진] ${subject}`);
  if (!mailConfigured()) return;
  sendMail({ brand: "VERILINE", to: owner(), subject, text }).catch((e) => logError("engine:alert", e));
}

export function wireEngineAlerts() {
  onEngineState({
    down: (s) =>
      alert(
        `[베리라인 긴급] 검사 엔진 멈춤 — ${s.code === "credit_exhausted" ? "Anthropic 잔액 소진" : "API 키 오류"}`,
        [
          `${kst(s.since)}(한국 시간)부터 검사 엔진이 멈췄습니다.`,
          "",
          `조치: ${OPERATOR_NOTE[s.code] || ""}`,
          "",
          "멈춘 동안 베리라인은 이렇게 동작합니다:",
          "· 크레딧 충전(카드 결제)을 받지 않습니다 — 돈을 받고 못 쓰는 일을 막습니다.",
          "· 웹 검사는 차감 없이 '잠시 후 다시' 안내를 보여 줍니다.",
          "· 기업 API는 과금하지 않는 503(engine_unavailable)을 돌려줍니다.",
          "· 5분마다 다시 확인해, 충전되면 저절로 풀리고 회복 메일을 보냅니다.",
          "",
          `원문: ${s.message}`,
        ].join("\n"),
        `down:${s.code}`,
      ),
    recover: (s) => {
      lastAlert.delete(`down:${s.code}`);
      alert("[베리라인] 검사 엔진 회복", `${kst(Date.now())}(한국 시간) 검사 엔진이 다시 동작합니다. 멈춘 시각: ${kst(s.since)}. 결제와 검사가 다시 열렸습니다.`, null);
    },
  });
}

export function startEngineWatch() {
  wireEngineAlerts();
  if (!process.env.ANTHROPIC_API_KEY) return;
  const tick = () => {
    const s = engineState();
    const stopped = !s.ok;
    // 멈춤 중이면 매 틱(5분)마다, 아니면 30분 넘게 조용할 때만 확인한다.
    if (stopped || msSinceSuccess() > 30 * 60 * 1000) probeEngine().catch((e) => logError("engine:probe", e));
  };
  setTimeout(tick, 20_000).unref();
  setInterval(tick, 5 * 60 * 1000).unref();
}
