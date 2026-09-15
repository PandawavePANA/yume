// AI 대화 공유 링크 확인 — 제보가 "정말 그 AI가 한 말"인지 가리는 유일한 근거다.
//
// 링크 없이 플랫폼 이름만 받으면, 사용자가 방금 지어낸 사건번호와 진짜 할루시네이션을
// 구분할 방법이 없다(둘 다 공식 DB에 없으니 똑같이 "부존재 확실"이 뜬다). 그래서 제보에는
// 공유 링크를 필수로 받고, 여기서 페이지를 가져와 문제의 식별자가 실제로 들어있는지 본다.
//
// 다만 이 검사는 보조 수단이다. 공유 페이지 대부분이 자바스크립트로 본문을 그리기 때문에
// 서버에서 그냥 받아오면 본문이 안 보일 수 있다. 그래서 "못 찾음"을 반려 사유로 쓰지 않고,
// 운영자 검토 화면에 그대로 표시만 한다. 판단은 사람이 한다.

const TIMEOUT_MS = 8000;
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 2;

// 허용된 공유 도메인만 연다. 임의 URL을 서버가 받아오게 두면 내부망을 긁는 통로(SSRF)가 된다.
export const PLATFORMS = {
  chatgpt: { label: "ChatGPT", hosts: ["chatgpt.com", "chat.openai.com"] },
  claude: { label: "Claude", hosts: ["claude.ai"] },
  gemini: { label: "Gemini", hosts: ["gemini.google.com", "g.co"] },
  copilot: { label: "Copilot", hosts: ["copilot.microsoft.com"] },
  perplexity: { label: "Perplexity", hosts: ["perplexity.ai", "www.perplexity.ai"] },
  wrtn: { label: "뤼튼", hosts: ["wrtn.ai", "agent.wrtn.ai"] },
  grok: { label: "Grok", hosts: ["grok.com", "x.com"] },
};

const ALL_HOSTS = new Set(Object.values(PLATFORMS).flatMap((p) => p.hosts));

export function platformLabel(key) {
  return PLATFORMS[key]?.label || key;
}

// 공유 링크가 그 플랫폼의 주소가 맞는지 확인한다.
export function checkShareUrl(platform, rawUrl) {
  const spec = PLATFORMS[platform];
  if (!spec) return { error: "지원하지 않는 플랫폼이에요." };
  let url;
  try {
    url = new URL(String(rawUrl || "").trim());
  } catch {
    return { error: "공유 링크 주소가 올바르지 않아요." };
  }
  if (url.protocol !== "https:") return { error: "공유 링크는 https 주소여야 해요." };
  const host = url.hostname.replace(/^www\./, "");
  if (!spec.hosts.some((h) => host === h.replace(/^www\./, ""))) {
    return { error: `${spec.label} 공유 링크가 아니에요. ${spec.hosts[0]} 주소를 넣어주세요.` };
  }
  return { url: url.toString() };
}

function allowedHost(url) {
  const host = new URL(url).hostname.replace(/^www\./, "");
  return ALL_HOSTS.has(host) || ALL_HOSTS.has(`www.${host}`);
}

async function fetchLimited(url) {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const res = await fetch(current, {
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "User-Agent": "YUME-FactCheck/1.0 (+https://www.yume-reamer.com)", "Accept-Language": "ko,en" },
    });
    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get("location");
      if (!next) return { status: res.status, body: "" };
      current = new URL(next, current).toString();
      // 리다이렉트를 타고 허용 목록 밖으로 나가면 더 따라가지 않는다.
      if (!allowedHost(current)) return { status: res.status, body: "", note: "허용되지 않은 주소로 이동" };
      continue;
    }
    if (!res.ok) return { status: res.status, body: "" };
    const reader = res.body?.getReader();
    if (!reader) return { status: res.status, body: await res.text() };
    const chunks = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      chunks.push(value);
      if (size > MAX_BYTES) {
        await reader.cancel().catch(() => {});
        break;
      }
    }
    return { status: res.status, body: Buffer.concat(chunks).toString("utf8") };
  }
  return { status: 0, body: "", note: "리다이렉트가 너무 많음" };
}

// HTML 안에 식별자가 들어있는지 본다. 공유 페이지가 JSON으로 본문을 실어 보내는 경우가 많아
// 태그를 벗기지 않고 원문 전체에서 찾되, 유니코드 이스케이프(\uXXXX)만 풀어준다.
function contains(body, needle) {
  if (!needle) return false;
  const decoded = body.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  const flat = (s) => s.replace(/\s+/g, "").toLowerCase();
  return flat(decoded).includes(flat(needle));
}

// 반환: found(식별자 확인됨) | not_found(페이지는 열렸지만 못 찾음) | unreachable(열지 못함)
export async function verifyShareLink(url, needles = []) {
  try {
    const { status, body, note } = await fetchLimited(url);
    if (!body) return { result: "unreachable", note: note || `응답 ${status}` };
    const hit = needles.find((n) => contains(body, n));
    if (hit) return { result: "found", note: `공유 페이지에서 '${hit}' 확인` };
    return { result: "not_found", note: "페이지는 열렸지만 해당 인용을 찾지 못함(자바스크립트로 그리는 페이지일 수 있음)" };
  } catch (e) {
    return { result: "unreachable", note: e.name === "TimeoutError" ? "응답 시간 초과" : e.message };
  }
}
