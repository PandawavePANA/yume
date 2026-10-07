// 결과를 기다리지 않고 받는 길 — 웹훅.
//
// 검증 한 건은 10~40초가 걸린다. 지금까지 고객사는 둘 중 하나를 골라야 했다. 연결을 60초까지
// 붙잡고 있거나(wait), 몇 초마다 다시 묻거나(폴링). 둘 다 고객사가 코드를 더 써야 하고,
// 그 코드를 쓰다 멈추는 곳이 많다. 결과가 나오면 우리가 고객사 주소로 보내 준다.
//
// 지키는 것 셋.
//   ① 아무 주소로나 보내지 않는다. 내부망·사설 IP·localhost로 보내게 두면 우리 서버를
//      고객이 남의 내부망을 두드리는 발판으로 쓸 수 있다(SSRF). https 공인 주소만 받는다.
//   ② 받는 쪽이 진짜 유메가 보낸 것인지 확인할 수 있게 서명한다. 비밀값은 요청에 함께
//      보낸 callback_secret을 쓰고, 그 값은 저장하지 않는다(보내는 동안 메모리에만).
//   ③ 한 번 실패로 끝내지 않는다. 받는 쪽이 잠깐 내려가 있어도 몇 번 더 보낸다.
import crypto from "node:crypto";
import { logError } from "./errorLog.js";
import { privateHost } from "./netGuard.js";

const MAX_URL = 2000;
const MAX_SECRET = 200;
const TIMEOUT_MS = 10_000;
const BACKOFF_MS = [0, 2_000, 10_000, 60_000];

// 테스트에서는 로컬 수신 서버로 보내야 한다. 운영에서는 켜지 않는다.
const allowPrivate = () => process.env.YUME_WEBHOOK_ALLOW_PRIVATE === "1";

export { privateHost };

export function validateCallback(rawUrl, rawSecret) {
  if (rawUrl == null || rawUrl === "") return { url: null, secret: "" };
  if (typeof rawUrl !== "string" || rawUrl.length > MAX_URL) return { error: "callback_url은 2,000자 이하의 문자열이어야 합니다." };
  let u;
  try {
    u = new URL(rawUrl);
  } catch {
    return { error: "callback_url이 올바른 주소가 아닙니다." };
  }
  if (u.protocol !== "https:" && !(allowPrivate() && u.protocol === "http:")) return { error: "callback_url은 https 주소여야 합니다." };
  if (u.username || u.password) return { error: "callback_url에 계정 정보를 넣을 수 없습니다." };
  if (!allowPrivate() && privateHost(u.hostname)) return { error: "callback_url은 공인 주소여야 합니다(내부망·사설 IP·localhost 불가)." };
  if (rawSecret != null && (typeof rawSecret !== "string" || rawSecret.length > MAX_SECRET)) {
    return { error: "callback_secret은 200자 이하의 문자열이어야 합니다." };
  }
  return { url: u.toString(), secret: rawSecret || "" };
}

// 받는 쪽은 X-Yume-Signature가 hmac_sha256(secret, `${X-Yume-Timestamp}.${본문}`)과 같은지 본다.
// 시각을 함께 서명하는 건, 예전 요청을 그대로 다시 보내는 공격(재전송)을 막기 위해서다.
export function signPayload(secret, timestamp, body) {
  return `sha256=${crypto.createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export async function deliverWebhook({ url, secret = "", event = "verification.completed", payload, backoff = BACKOFF_MS }) {
  const body = JSON.stringify({ event, ...payload });
  const delivery = crypto.randomBytes(8).toString("hex");
  let last = null;
  for (const [n, delay] of backoff.entries()) {
    if (delay) await wait(delay);
    const ts = String(Math.floor(Date.now() / 1000));
    const headers = {
      "Content-Type": "application/json",
      "User-Agent": "YUME-Webhook/1",
      "X-Yume-Event": event,
      "X-Yume-Delivery": delivery,
      "X-Yume-Attempt": String(n + 1),
      "X-Yume-Timestamp": ts,
      ...(secret ? { "X-Yume-Signature": signPayload(secret, ts, body) } : {}),
    };
    try {
      const res = await fetch(url, { method: "POST", headers, body, redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (res.status >= 200 && res.status < 300) return { ok: true, attempts: n + 1, status: res.status };
      last = `HTTP ${res.status}`;
      // 받는 쪽이 요청 자체를 거절한 것(4xx, 단 시간 초과·과다 요청 제외)은 다시 보내도 같다.
      if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) break;
    } catch (e) {
      last = e?.name === "TimeoutError" ? "timeout" : e?.message || "network error";
    }
  }
  logError("webhook", new Error(`delivery ${delivery} to ${new URL(url).host} failed: ${last}`));
  return { ok: false, error: last };
}
