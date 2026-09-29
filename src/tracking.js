// 유입 측정 — 이 브라우저가 처음 어디서 왔는지(광고 주소의 utm, 아니면 들어온 사이트)와
// 무작위 id 하나를 기억해 두고, 서버 요청마다 헤더로 싣는다(server/events.js).
//
// 사람을 알아보는 값은 없다. 이름·이메일·기기 정보는 싣지 않고, id는 이 브라우저에서 만든
// 무작위 문자열이다. 저장소가 막혀 있으면 이번 방문 동안만 쓰고 잊는다.
const ANON_KEY = "yume:anon";
const SRC_KEY = "yume:src";
const VISIT_KEY = "yume:visit-sent";

let memo = null;

function randomId() {
  const a = new Uint8Array(12);
  (window.crypto || window.msCrypto).getRandomValues(a);
  return Array.from(a, (b) => (b % 36).toString(36)).join("");
}

function firstTouch() {
  const q = new URLSearchParams(window.location.search);
  const utm = q.get("utm_source");
  if (utm) return [utm, q.get("utm_medium") || "", q.get("utm_campaign") || ""].join("|");
  // 광고 주소가 아니면 들어온 사이트 이름. 자기 사이트끼리 넘어온 것은 "직접"으로 친다.
  try {
    const ref = document.referrer ? new URL(document.referrer) : null;
    if (ref && ref.hostname && !ref.hostname.endsWith("yume-reamer.com")) {
      return [ref.hostname.replace(/^www\./, "").replace(/^m\./, ""), "referral", ""].join("|");
    }
  } catch {
    /* 잘못된 referrer는 직접 방문으로 */
  }
  return "direct||";
}

export function tracking() {
  if (memo) return memo;
  let anon = "";
  let src = "";
  try {
    anon = localStorage.getItem(ANON_KEY) || "";
    if (!anon) { anon = randomId(); localStorage.setItem(ANON_KEY, anon); }
    src = localStorage.getItem(SRC_KEY) || "";
    // 처음 들어온 출처만 기억한다. 단, 광고 주소로 새로 들어오면 그 광고를 따른다 — 어떤 광고가
    // 데려왔는지가 이 측정의 목적이다.
    const now = firstTouch();
    const fromAd = new URLSearchParams(window.location.search).has("utm_source");
    if (!src || fromAd) { src = now; localStorage.setItem(SRC_KEY, src); }
  } catch {
    anon = anon || randomId();
    src = src || firstTouch();
  }
  memo = { anon, src };
  return memo;
}

/** 모든 서버 요청에 붙일 헤더. */
export function trackingHeaders() {
  const { anon, src } = tracking();
  return { "X-Yume-Anon": anon, "X-Yume-Src": src.slice(0, 130) };
}

/** 방문 한 줄. 이 탭에서 한 번만. */
export function sendVisit(base = "") {
  try {
    if (sessionStorage.getItem(VISIT_KEY)) return;
    sessionStorage.setItem(VISIT_KEY, "1");
  } catch {
    /* 막혀 있어도 한 번은 보낸다 */
  }
  fetch(`${base}/api/ev`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...trackingHeaders() },
    body: JSON.stringify({ kind: "visit" }),
    keepalive: true,
  }).catch(() => {});
}
