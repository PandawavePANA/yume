import { BUSINESS } from "../../businessInfo.js";

// 기업용 사이트는 별도 도메인에 배포되므로 유메 서버를 절대 주소로 불러야 한다.
// 유메 본체에서는 비워 두면 기존처럼 같은 출처로 나간다.
let API_BASE = "";

export function setApiBase(base) {
  API_BASE = String(base || "").replace(/\/+$/, "");
}

// 유메 서버가 내려준 경로(리포트 링크·API 문서)를 링크로 걸 때 쓴다. 기업용 사이트에서
// 상대 경로를 그대로 걸면 유메가 아니라 기업용 도메인으로 가 버린다.
export const apiUrl = (path) => API_BASE + path;

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
    // 서버가 주는 code(IDENTITY_REQUIRED 등)를 오류 자체에도 올려 둔다.
    // err.data.code로만 두면 부르는 쪽에서 err.code로 잘못 읽고 조용히 넘어간다.
    if (data && data.code) err.code = data.code;
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

// 사업자 정보와 같은 값이라 businessInfo.js 한 곳에서 가져온다.
export const CONTACT_EMAIL = BUSINESS.email;
