// 상류(Anthropic API) 장애를 원인별로 구분한다.
//
// 오늘 실제로 겪은 일 — API 결제 잔액이 0이 되자 모든 검증이 멈췄는데, 사용자에게는
// "서버 오류가 발생했어요"만 보이고 운영자도 로그를 뒤져야 원인을 알 수 있었다.
// 잔액 소진은 버그가 아니라 운영 상태이고, 버그와 다르게 다뤄야 한다:
//
//   · 사용자에게는 "우리 잘못이고 곧 고친다"고 말해야 한다. 자기 입력이나 계정
//     문제라고 오해하고 같은 요청을 반복하게 두면 안 된다.
//   · 운영자에게는 원인이 한눈에 보여야 한다. 잔액 소진과 네트워크 장애와 잘못된 키는
//     대응이 전부 다르다.
//   · 상태 점검(/api/health)에 드러나야 한다. 서버는 멀쩡히 떠 있는데 검증만 죽는
//     상태가 제일 늦게 발견된다.
export class UpstreamError extends Error {
  constructor(code, message, { status = null, cause = null } = {}) {
    super(message);
    this.name = "UpstreamError";
    this.code = code;
    this.status = status;
    this.cause = cause;
  }
}

// 사용자에게 보일 문구. 어느 경우든 "당신 잘못이 아니다"가 먼저 와야 한다.
const USER_MESSAGE = {
  credit_exhausted: "지금은 확인을 처리할 수 없어요. 서비스 쪽 문제라 저희가 확인하고 있습니다. 잠시 후 다시 시도해주세요.",
  rate_limited: "요청이 몰려서 잠시 대기 중이에요. 30초쯤 뒤에 다시 시도해주세요.",
  auth_failed: "지금은 확인을 처리할 수 없어요. 서비스 설정 문제라 저희가 확인하고 있습니다.",
  overloaded: "지금 확인 요청이 많아 처리가 밀리고 있어요. 잠시 후 다시 시도해주세요.",
  timeout: "확인이 예상보다 오래 걸려 중단했어요. 내용을 조금 줄여서 다시 시도해보세요.",
  unavailable: "지금은 확인을 처리할 수 없어요. 잠시 후 다시 시도해주세요.",
};

// 운영자에게 보일 설명 — 무엇을 해야 하는지까지.
export const OPERATOR_NOTE = {
  credit_exhausted: "Anthropic API 결제 잔액이 소진됐습니다. console.anthropic.com → Plans & Billing에서 충전하세요. Auto-reload를 켜두면 반복되지 않습니다.",
  rate_limited: "Anthropic API 요청 한도에 걸렸습니다. 사용량이 한도를 넘었는지 확인하세요.",
  auth_failed: "ANTHROPIC_API_KEY가 잘못됐거나 폐기됐습니다. 키를 다시 발급해 환경변수를 교체하세요.",
  overloaded: "Anthropic 쪽이 과부하 상태입니다. 대개 저절로 풀립니다.",
  timeout: "Anthropic 응답이 제한 시간을 넘겼습니다. 반복되면 입력 길이나 타임아웃 값을 보세요.",
  unavailable: "Anthropic API 호출이 실패했습니다. 아래 원문을 확인하세요.",
};

export const userMessageFor = (code) => USER_MESSAGE[code] || USER_MESSAGE.unavailable;

// 잔액 소진은 4xx(invalid_request_error)로 오기 때문에, 상태 코드만 보면 "우리가 잘못
// 보냈다"로 분류된다. 문구까지 봐야 구분된다.
export function classifyUpstream(err, httpStatus = null) {
  if (err instanceof UpstreamError) return err;
  const raw = String(err?.message || err || "");
  const text = raw.toLowerCase();

  let code = "unavailable";
  if (text.includes("credit balance is too low") || text.includes("insufficient")) code = "credit_exhausted";
  else if (httpStatus === 429 || text.includes("rate_limit") || text.includes("rate limit")) code = "rate_limited";
  else if (httpStatus === 401 || httpStatus === 403 || text.includes("authentication") || text.includes("invalid x-api-key")) code = "auth_failed";
  else if (httpStatus === 529 || text.includes("overloaded")) code = "overloaded";
  else if (err?.name === "TimeoutError" || text.includes("timeout") || text.includes("aborted")) code = "timeout";

  return new UpstreamError(code, raw, { status: httpStatus, cause: err });
}

// 마지막 상류 장애를 기억해 둔다. 서버는 멀쩡한데 검증만 안 되는 상태를 상태 점검에
// 드러내기 위한 것이라, DB에 넣지 않고 프로세스 안에만 둔다(재시작하면 초기화되는 게 맞다).
let lastFailure = null;

// 기록만 남기고 오류 자체를 그대로 돌려준다 — 호출부가 `throw noteUpstreamFailure(...)`로
// 쓰기 때문에, 기록용 객체를 돌려주면 UpstreamError가 아닌 게 던져져서 분류가 통째로 샌다.
export function noteUpstreamFailure(err) {
  lastFailure = { code: err.code, message: err.message, at: Date.now() };
  if (HARD.has(err.code)) markHardDown(err.code, err.message);
  return err;
}

export function noteUpstreamSuccess() {
  lastFailure = null;
  lastSuccessAt = Date.now();
  if (hardDown) {
    const was = hardDown;
    hardDown = null;
    onRecover?.(was);
  }
}

// ── 엔진 정지(잔액 소진·키 오류) ─────────────────────────────────────
//
// 2026-10-13: 잔액이 0인 채로 하루가 갔다. 그 사이 결제가 열려 있었다면 사람들은 돈을 내고 쓰지
// 못했을 것이고, 기업 API 고객은 영문 모를 실패를 받았을 것이다. 과부하·시간 초과는 저절로
// 풀리지만 잔액 소진과 키 오류는 사람이 손대기 전까지 계속된다 — 이 둘은 "멈춤"으로 따로 다룬다.
//   · 멈춘 동안 새 결제(크레딧 충전)를 받지 않는다 — 돈을 받고 못 쓰게 하지 않는다
//   · 검사 요청은 차감하기 전에 바로 안내하고 돌려보낸다(API는 과금하지 않는 503)
//   · 운영자에게 메일을 한 번 보낸다(6시간에 한 번까지)
//   · 5분마다 한 요청은 그대로 통과시켜 다시 시도해 본다 — 충전하면 저절로 풀린다
const HARD = new Set(["credit_exhausted", "auth_failed"]);
const PROBE_EVERY_MS = 5 * 60 * 1000;
let hardDown = null; // { code, message, since, lastTry }
let lastSuccessAt = 0;
let onDown = null;
let onRecover = null;

/** 멈춤·회복 알림을 받는다(메일 발송은 app이 건다 — 이 모듈은 아무것도 import 하지 않는다). */
export function onEngineState({ down, recover } = {}) {
  onDown = down || null;
  onRecover = recover || null;
}

function markHardDown(code, message) {
  const t = Date.now();
  const fresh = !hardDown || hardDown.code !== code;
  hardDown = { code, message, since: fresh ? t : hardDown.since, lastTry: t };
  if (fresh) onDown?.(hardDown);
}

/**
 * 지금 엔진이 멈춘 상태면 그 원인 코드를, 아니면 null. 멈춘 뒤에도 5분마다 한 번은 null을 돌려
 * 실제 호출로 다시 확인하게 한다(그 호출이 성공하면 멈춤이 풀린다).
 */
export function engineGate({ probe = true } = {}) {
  if (!hardDown) return null;
  if (probe && Date.now() - hardDown.lastTry > PROBE_EVERY_MS) {
    hardDown.lastTry = Date.now();
    return null;
  }
  return hardDown.code;
}

/** 결제처럼 "되돌릴 수 없는 일" 앞에서 묻는다 — 시험 통과를 허락하지 않는다. */
export const engineStopped = () => (hardDown ? hardDown.code : null);
export const engineState = () => (hardDown ? { ...hardDown, lastSuccessAt } : { ok: true, lastSuccessAt });
export const msSinceSuccess = () => (lastSuccessAt ? Date.now() - lastSuccessAt : Infinity);

/** 시험용 — 상태를 처음으로 돌린다. */
export function resetEngineState() {
  hardDown = null;
  lastFailure = null;
  lastSuccessAt = 0;
}

// 최근 장애만 의미가 있다. 10분이 지나면 지나간 일로 본다.
export function upstreamStatus() {
  // 멈춤은 10분이 지나도 지나간 일이 아니다 — 풀릴 때(성공 호출)까지 그대로 보인다.
  if (hardDown) {
    return { ok: false, stopped: true, code: hardDown.code, note: OPERATOR_NOTE[hardDown.code], message: hardDown.message, at: hardDown.since };
  }
  if (!lastFailure || Date.now() - lastFailure.at > 10 * 60 * 1000) return { ok: true };
  return {
    ok: false,
    code: lastFailure.code,
    note: OPERATOR_NOTE[lastFailure.code] || OPERATOR_NOTE.unavailable,
    message: lastFailure.message,
    at: lastFailure.at,
  };
}
