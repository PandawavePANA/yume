// AI 직원이 쓰는 두 가지 도구 — Claude에게 묻기(필요하면 웹 검색 포함)와 공개 웹페이지 글 읽기.
//
// 검사 엔진의 호출 함수(claude.js callClaude)는 엔진 안에서만 쓰는 모양이라 밖으로 내지 않았다. 직원은 판정이 아니라
// "찾아서 표로 정리"하는 일을 하므로 여기 작은 호출 하나를 따로 둔다. 상류 장애 기록(upstream)과 비용 장부(apiCost)는
// 엔진과 같은 것을 써서, 잔액이 바닥나면 엔진과 똑같이 멈춘 것으로 잡힌다.
import dns from "node:dns/promises";
import net from "node:net";
import { classifyUpstream, noteUpstreamFailure, noteUpstreamSuccess } from "../upstream.js";
import { newLedger, record, summarize } from "../apiCost.js";

const MODEL = process.env.STAFF_MODEL || process.env.CLAUDE_MODEL || "claude-sonnet-5";
const FAST_MODEL = process.env.CLAUDE_FAST_MODEL || "claude-haiku-4-5-20251001";
// Sonnet 5는 생각하는 데 쓴 토큰도 max_tokens에 든다(claude.js THINKING_FLOOR와 같은 이유).
const floorFor = (model, n) => (model === FAST_MODEL ? n : Math.max(n, 16000));

function lastJson(text) {
  const cleaned = String(text || "").replace(/```json|```/g, "");
  const end = cleaned.lastIndexOf("}");
  if (end < 0) throw new Error("JSON을 찾지 못했어요.");
  let depth = 0;
  let inStr = false;
  for (let i = end; i >= 0; i -= 1) {
    const ch = cleaned[i];
    if (inStr) {
      if (ch === '"' && cleaned[i - 1] !== "\\") inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "}") depth += 1;
    else if (ch === "{" && --depth === 0) return JSON.parse(cleaned.slice(i, end + 1));
  }
  throw new Error("JSON 짝이 맞지 않아요.");
}

/**
 * Claude에게 JSON 하나를 받는다. searches > 0이면 웹 검색 도구를 그 횟수까지 붙인다.
 * 반환: { json, usd } — usd는 이 호출의 비용(업무 일지에 적는다).
 */
export async function askJson({ system, user, searches = 0, maxTokens = 4000, fast = false, label = "staff" }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY가 없어요.");
  const model = fast ? FAST_MODEL : MODEL;
  const ledger = newLedger({ searchBudget: searches });
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model,
      max_tokens: floorFor(model, maxTokens),
      system,
      messages: [{ role: "user", content: user }],
      ...(searches > 0 ? { tools: [{ type: "web_search_20250305", name: "web_search", max_uses: searches }] } : {}),
    }),
    signal: AbortSignal.timeout(180_000),
  });
  const data = await res.json().catch(() => ({}));
  if (data.type === "error" || !res.ok) {
    throw noteUpstreamFailure(classifyUpstream(new Error(data.error?.message || `Claude API 오류 (${res.status})`), res.status));
  }
  noteUpstreamSuccess();
  record(ledger, { label, model, usage: data.usage });
  const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
  const usd = Number(summarize(ledger)?.usd || 0);
  return { json: lastJson(text), usd };
}

// ── 공개 웹페이지 글 읽기 ──────────────────────────────────────────────
// 약관 검토처럼 "그 페이지에 뭐라고 적혀 있나"만 본다. 내부망 주소(서버 자신, 클라우드 메타데이터)는 열지 않는다 —
// 주소는 AI가 찾아 온 값이라 그대로 믿지 않는다.
function privateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
  }
  const v = ip.toLowerCase();
  return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") || v.startsWith("::ffff:127.") || v.startsWith("::ffff:10.") || v.startsWith("::ffff:192.168.");
}

export async function assertPublicUrl(raw) {
  let u;
  try {
    u = new URL(String(raw));
  } catch {
    throw new Error("주소 형식이 아니에요.");
  }
  if (!/^https?:$/.test(u.protocol)) throw new Error("http(s) 주소만 열어요.");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  const ips = net.isIP(host) ? [host] : (await dns.lookup(host, { all: true })).map((r) => r.address);
  if (!ips.length || ips.some(privateIp)) throw new Error("내부망 주소는 열지 않아요.");
  return u;
}

const strip = (html) =>
  String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|li|h\d|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/[ \t\r\f\v]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();

/** 페이지 글(최대 maxChars)과 그 안의 링크 몇 개. 넘겨받은 주소로 리다이렉트도 한 번씩 다시 확인한다. */
export async function readPage(raw, { maxChars = 30_000 } = {}) {
  let url = await assertPublicUrl(raw);
  for (let hop = 0; hop < 4; hop += 1) {
    const res = await fetch(url, {
      redirect: "manual",
      headers: { "User-Agent": "YumeStaff/1.0 (+https://www.yume-reamer.com)", Accept: "text/html,text/plain" },
      signal: AbortSignal.timeout(12_000),
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = await assertPublicUrl(new URL(res.headers.get("location"), url).href);
      continue;
    }
    if (!res.ok) throw new Error(`페이지를 열지 못했어요 (${res.status}).`);
    const body = (await res.text()).slice(0, 600_000);
    const links = [...body.matchAll(/<a\s[^>]*href="([^"#]+)"[^>]*>([\s\S]*?)<\/a>/gi)]
      .map((m) => ({ href: (() => { try { return new URL(m[1], url).href; } catch { return null; } })(), text: strip(m[2]).slice(0, 60) }))
      .filter((l) => l.href && /^https?:/.test(l.href))
      .slice(0, 300);
    return { url: url.href, text: strip(body).slice(0, maxChars), links };
  }
  throw new Error("리다이렉트가 너무 많아요.");
}

export { MODEL };
