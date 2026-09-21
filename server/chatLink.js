// AI 대화 공유 링크에서 대화 내용을 읽어 온다.
//
// 사용자가 준 주소를 서버가 직접 여는 기능이라, 먼저 막아야 하는 것은 SSRF다.
// 서버는 보통 사설망 안에 있어서, 주소를 그대로 열어 주면 바깥에서 닿을 수 없는
// 내부 주소(메타데이터 서버, 내부 API, DB 관리 화면)를 대신 열어 주는 도구가 된다.
// 그래서 "막을 것을 고르는" 대신 **열어도 되는 곳만 고른다** — 아는 서비스의
// 공유 주소만 허용하고, 리다이렉트를 따라갈 때마다 같은 검사를 다시 한다.
// 차단 목록 방식은 IP 표기법(10진수, 8진법, IPv6 매핑)마다 빠져나갈 구멍이 생긴다.
import { logError } from "./errorLog.js";

// 공유 링크를 지원하는 서비스. 호스트는 정확히 일치하거나 그 하위 도메인만 인정한다.
export const SUPPORTED = [
  { host: "chatgpt.com", label: "ChatGPT", how: "대화 우측 상단 ⋯ → 공유 → 링크 복사" },
  { host: "chat.openai.com", label: "ChatGPT", how: "대화 우측 상단 ⋯ → 공유 → 링크 복사" },
  { host: "claude.ai", label: "Claude", how: "대화 우측 상단 ⋯ → Share → 링크 복사" },
  { host: "gemini.google.com", label: "Gemini", how: "답변 아래 공유 아이콘 → 공유 → 링크 복사" },
  { host: "g.co", label: "Gemini", how: "답변 아래 공유 아이콘 → 공유 → 링크 복사" },
  { host: "www.perplexity.ai", label: "Perplexity", how: "우측 상단 Share → Copy Link" },
  { host: "perplexity.ai", label: "Perplexity", how: "우측 상단 Share → Copy Link" },
  { host: "poe.com", label: "Poe", how: "대화 우측 상단 공유 → 링크 복사" },
  { host: "grok.com", label: "Grok", how: "대화 하단 공유 → 링크 복사" },
];
const HOSTS = SUPPORTED.map((s) => s.host);

const MAX_BYTES = 4 * 1024 * 1024;
const TIMEOUT_MS = 15000;
const MAX_HOPS = 4;

export function supportedHosts() {
  // 화면에 안내를 뿌리려고 서비스 이름 기준으로 한 번만 묶어 준다.
  const seen = new Map();
  for (const s of SUPPORTED) if (!seen.has(s.label)) seen.set(s.label, { label: s.label, how: s.how });
  return [...seen.values()];
}

function allowed(u) {
  if (u.protocol !== "https:") return false;
  const h = u.hostname.toLowerCase();
  return HOSTS.some((base) => h === base || h.endsWith("." + base));
}

export class LinkError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

function parseLink(raw) {
  let u;
  try {
    u = new URL(String(raw || "").trim());
  } catch {
    throw new LinkError("링크 주소가 올바르지 않아요. https:// 로 시작하는 공유 링크를 넣어주세요.", "BAD_URL");
  }
  if (!allowed(u)) {
    const names = supportedHosts().map((s) => s.label).join(", ");
    throw new LinkError(`아직 ${names} 공유 링크만 읽을 수 있어요. 다른 서비스는 대화를 직접 붙여넣어 주세요.`, "UNSUPPORTED");
  }
  return u;
}

// 리다이렉트를 손으로 따라간다. fetch에 맡기면 중간에 허용하지 않은 주소로
// 넘어가도 알 수 없다.
async function fetchHtml(url) {
  let current = url;
  for (let hop = 0; hop < MAX_HOPS; hop += 1) {
    const res = await fetch(current, {
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        // 공유 페이지는 사람이 여는 것을 전제로 만들어져 있다.
        "User-Agent": "Mozilla/5.0 (compatible; YumeContextBot/1.0; +https://www.yume-reamer.com)",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "ko,en;q=0.8",
      },
    });

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) throw new LinkError("링크를 여는 중 길을 잃었어요. 주소를 다시 확인해주세요.", "REDIRECT");
      const next = new URL(loc, current);
      if (!allowed(next)) {
        throw new LinkError("링크가 알 수 없는 주소로 넘어가요. 공유 링크가 맞는지 확인해주세요.", "REDIRECT_OFF");
      }
      current = next;
      continue;
    }

    if (res.status === 404 || res.status === 410) {
      throw new LinkError("링크를 찾을 수 없어요. 공유가 해제됐거나 주소가 틀린 것 같아요.", "NOT_FOUND");
    }
    if (res.status === 401 || res.status === 403) {
      throw new LinkError("비공개 대화예요. 공유를 켜고 다시 시도하거나, 대화를 직접 붙여넣어 주세요.", "PRIVATE");
    }
    if (!res.ok) {
      throw new LinkError("링크를 여는 데 실패했어요. 잠시 후 다시 시도해주세요.", "UPSTREAM");
    }

    // 본문 크기를 제한한다. 끝까지 읽고 나서 자르면 이미 다 받은 뒤다.
    const reader = res.body?.getReader();
    if (!reader) throw new LinkError("링크에서 내용을 읽지 못했어요.", "EMPTY");
    const chunks = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_BYTES) {
        reader.cancel().catch(() => {});
        break;
      }
      chunks.push(value);
    }
    return new TextDecoder("utf-8").decode(Buffer.concat(chunks.map((c) => Buffer.from(c))));
  }
  throw new LinkError("링크가 너무 여러 번 돌아가요. 주소를 다시 확인해주세요.", "REDIRECT");
}

// ── 대화 뽑아내기 ────────────────────────────────────────────────────────
// 서비스마다 담는 모양이 다르고 예고 없이 바뀐다. 그래서 특정 구조를 하나 찍어
// 두지 않고, 페이지 안의 JSON을 훑어 "사람/AI가 주고받은 것처럼 생긴 것"을 찾는다.
// 그것도 실패하면 태그를 걷어낸 본문 글로 떨어진다.
const ROLE_KEYS = ["role", "author", "sender", "speaker", "from"];
const TEXT_KEYS = ["text", "content", "message", "parts", "body", "value"];

function asText(v, depth = 0) {
  if (depth > 6) return "";
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.map((x) => asText(x, depth + 1)).filter(Boolean).join("\n");
  if (v && typeof v === "object") {
    for (const k of TEXT_KEYS) {
      if (k in v) {
        const t = asText(v[k], depth + 1);
        if (t) return t;
      }
    }
  }
  return "";
}

function roleOf(node) {
  for (const k of ROLE_KEYS) {
    const v = node[k];
    if (typeof v === "string") return v;
    if (v && typeof v === "object" && typeof v.role === "string") return v.role;
  }
  return "";
}

function harvest(node, out, depth = 0) {
  if (!node || depth > 12 || out.length > 400) return;
  if (Array.isArray(node)) {
    for (const x of node) harvest(x, out, depth + 1);
    return;
  }
  if (typeof node !== "object") return;

  const role = roleOf(node);
  if (role) {
    const text = asText(node);
    if (text && text.trim().length > 1) {
      const who = /user|human|you|사용자|나/i.test(role) ? "나" : "AI";
      out.push(`${who}: ${text.trim()}`);
      return; // 이 덩어리는 처리했으니 더 파고들지 않는다(같은 글이 두 번 들어간다).
    }
  }
  for (const k of Object.keys(node)) harvest(node[k], out, depth + 1);
}

function fromJsonBlobs(html) {
  const out = [];
  // <script> 안의 JSON과 type="application/json" 블록을 모두 후보로 본다.
  const re = /<script[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) && out.length < 400) {
    const body = m[1].trim();
    if (body.length < 40 || body.length > 3_000_000) continue;
    // 스크립트 안에 박힌 JSON 객체/배열만 골라 본다.
    const start = body.search(/[[{]/);
    if (start < 0) continue;
    const candidate = body.slice(start);
    try {
      harvest(JSON.parse(candidate), out);
    } catch {
      // 변수 대입 형태라면 = 뒤의 값만 다시 시도한다.
      const eq = body.indexOf("=");
      if (eq > 0 && eq < 200) {
        try {
          harvest(JSON.parse(body.slice(eq + 1).replace(/;\s*$/, "")), out);
        } catch { /* 이 블록은 JSON이 아니다 */ }
      }
    }
  }
  return out.join("\n\n");
}

function fromVisibleText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/(p|div|li|h[1-6]|br)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t ]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function fetchSharedChat(rawUrl, { minChars = 200 } = {}) {
  const url = parseLink(rawUrl);
  const service = SUPPORTED.find((s) => url.hostname.toLowerCase().endsWith(s.host))?.label || "AI";

  let html;
  try {
    html = await fetchHtml(url);
  } catch (e) {
    if (e instanceof LinkError) throw e;
    logError("chatLink:fetch", e);
    throw new LinkError("링크를 여는 데 실패했어요. 대화를 직접 붙여넣어 주세요.", "FETCH");
  }

  const structured = fromJsonBlobs(html);
  const transcript = structured.length >= minChars ? structured : fromVisibleText(html);

  if (transcript.length < minChars) {
    throw new LinkError(
      "링크는 열렸는데 대화 내용을 읽지 못했어요. 공유가 켜져 있는지 확인하시거나, 대화를 직접 붙여넣어 주세요.",
      "NO_CONTENT",
    );
  }
  return { transcript, service, url: url.toString(), via: structured.length >= minChars ? "structured" : "text" };
}
