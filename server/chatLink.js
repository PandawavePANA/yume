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

// ── 서비스별 어댑터 ──────────────────────────────────────────────────────
//
// ChatGPT 공유 페이지의 HTML에는 대화가 없다. 페이지가 뜬 뒤 브라우저가 따로
// 불러오는 구조라, 서버가 HTML만 받아서는 아무것도 못 읽는다(실제로 그랬다 —
// 521KB짜리 JSON이 박혀 있는데 그 안은 거의 전부 기능 플래그였다).
// 대신 페이지가 부르는 그 주소(/backend-api/share/…)를 직접 부른다.
//
// **다만 이 경로는 지금 서버에서 열리지 않는다.** 같은 주소·같은 헤더로 curl은
// 200을 받는데 Node의 fetch는 403을 받는다 — 헤더가 아니라 HTTP 클라이언트의
// 지문을 보고 막는 것이다. 다른 TLS 스택으로 우회하는 방법이 있지만 하지 않았다.
// 상대가 프로그램 접근을 막아 두었다는 뜻이고, 우회는 곧 깨질 뿐 아니라 해서는
// 안 되는 종류의 일이다. 그래서 여기서는 시도하고, 막히면 붙여넣기로 안내한다.
// (진짜로 필요해지면 헤드리스 브라우저로 여는 것이 정직한 해법이다.)
const CHATGPT_SHARE = /^\/share\/([A-Za-z0-9-]{8,})/;

// ChatGPT가 사용자 지정 지침 자리에 넣어 두는 문구. 대화가 아니라서 뺀다.
const NOISE = [/^Original custom instructions no longer available$/i];

function chatgptApiUrl(url) {
  const m = CHATGPT_SHARE.exec(url.pathname);
  if (!m) return null;
  return new URL(`/backend-api/share/${m[1]}`, url.origin);
}

function fromChatgptJson(raw) {
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return "";
  }
  // linear_conversation은 순서가 보장된다. mapping은 그래프라 순서를 다시 세워야 한다.
  const nodes = Array.isArray(data?.linear_conversation)
    ? data.linear_conversation
    : Object.values(data?.mapping || {});

  const out = [];
  for (const n of nodes) {
    const m = n?.message;
    if (!m) continue;
    const role = m.author?.role;
    // system은 모델에게 주는 지시라 대화가 아니다.
    if (role !== "user" && role !== "assistant") continue;
    const text = (m.content?.parts || [])
      .filter((x) => typeof x === "string")
      .join("\n")
      .trim();
    if (!text || NOISE.some((re) => re.test(text))) continue;
    out.push(`${role === "user" ? "나" : "AI"}: ${text}`);
  }
  return out.join("\n\n");
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

  // 전용 경로가 있으면 먼저 쓴다. HTML을 훑는 것보다 정확하고, 페이지 겉모습이
  // 바뀌어도 흔들리지 않는다.
  const api = service === "ChatGPT" ? chatgptApiUrl(url) : null;
  if (api) {
    try {
      const transcript = fromChatgptJson(await fetchHtml(api));
      if (transcript.length >= minChars) {
        return { transcript, service, url: url.toString(), via: "api" };
      }
    } catch (e) {
      // 공유가 꺼졌거나 없는 대화면 그대로 알린다.
      if (e instanceof LinkError && e.code === "NOT_FOUND") throw e;
      // 그 외(차단 포함)는 아래 일반 경로로 내려간다. 여기서 끝내지 않는다.
      if (!(e instanceof LinkError)) logError("chatLink:api", e);
    }
  }

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
    // 왜 못 읽었는지에 따라 사용자가 할 수 있는 일이 다르다. "읽지 못했어요"만
    // 던지면 링크를 고쳐 보려다 시간만 쓰게 된다.
    throw new LinkError(
      service === "ChatGPT"
        ? "ChatGPT 공유 링크는 지금 서버에서 읽을 수 없어요(ChatGPT가 프로그램 접근을 막고 있습니다). 대화를 직접 붙여넣어 주세요 — 아래 칸이 열려 있어요."
        : "링크는 열렸는데 대화 내용을 읽지 못했어요. 공유가 켜져 있는지 확인하시거나, 대화를 직접 붙여넣어 주세요.",
      "NO_CONTENT",
    );
  }
  return { transcript, service, url: url.toString(), via: structured.length >= minChars ? "structured" : "text" };
}
