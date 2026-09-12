export async function apiJson(path, { method = "GET", body } = {}) {
  const res = await fetch(path, {
    method,
    credentials: "same-origin",
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
