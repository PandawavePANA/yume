// 기업용 사이트는 별도 도메인에 배포되므로 유메 서버를 절대 주소로 불러야 한다.
// 유메 본체에서는 비워 두면 기존처럼 같은 출처로 나간다.
let API_BASE = "";

export function setApiBase(base) {
  API_BASE = String(base || "").replace(/\/+$/, "");
}

export async function apiJson(path, { method = "GET", body } = {}) {
  const res = await fetch(API_BASE + path, {
    method,
    credentials: API_BASE ? "omit" : "same-origin",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `요청을 처리하지 못했어요 (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

// 출처 링크는 웹 검색 결과에서 오므로 http(s)만 허용한다.
export function safeUrl(u) {
  try {
    const url = new URL(String(u || ""));
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

export const CONTACT_EMAIL = "reamer@d-reamer.com";
