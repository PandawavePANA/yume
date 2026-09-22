// 리머 사이트 ↔ 유메 서버. 두 곳은 도메인이 다르므로 교차 출처 요청이고,
// 쿠키는 쓰지 않는다 — 인증은 스레드 토큰 하나뿐이다.
//
// 토큰은 주소창의 **해시(#)** 에만 둔다. 해시는 서버로 전송되지 않고 Referer에도
// 실리지 않아서, 링크를 아는 사람만 열린다는 성질이 브라우저 밖으로 새지 않는다.
// 서버로 보낼 때는 쿼리스트링이 아니라 헤더에 실어 접속 로그에 남지 않게 한다.
export const API = (import.meta.env?.VITE_YUME_API_ORIGIN || "https://www.yume-reamer.com").replace(/\/+$/, "");

const STORE_KEY = "reamer.thread.token";

/** 주소의 해시가 우선이고, 없으면 지난번에 열었던 것을 쓴다. */
export function readToken() {
  const fromHash = (window.location.hash || "").replace(/^#/, "").trim();
  if (fromHash.length >= 20) {
    try {
      localStorage.setItem(STORE_KEY, fromHash);
    } catch {
      /* 사생활 보호 모드 등 — 저장이 막혀도 이번 방문은 그대로 동작한다 */
    }
    return fromHash;
  }
  try {
    return localStorage.getItem(STORE_KEY) || "";
  } catch {
    return "";
  }
}

export function forgetToken() {
  try {
    localStorage.removeItem(STORE_KEY);
  } catch {
    /* 무시 */
  }
}

export async function call(path, { method = "GET", body, token } = {}) {
  const headers = {};
  if (token) headers["X-Thread-Token"] = token;
  if (body) headers["Content-Type"] = "application/json";

  const res = await fetch(`${API}/api${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || "요청을 처리하지 못했어요.");
    err.status = res.status;
    if (data.code) err.code = data.code;
    throw err;
  }
  return data;
}
