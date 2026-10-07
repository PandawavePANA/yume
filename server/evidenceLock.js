// 근거 잠금 — "유메가 사실/사실과 다름이라고 하면 맞다"를 지키는 마지막 관문.
//
// 판정이 틀리는 길은 결국 하나로 모인다. 모델이 근거를 "봤다"고 말하지만 실제로는
//   ① 그 페이지에 그런 문장이 없거나(지어낸 인용),
//   ② 문장은 있는데 판정을 뒷받침하지 않는다(읽고 잘못 이해함).
// 둘 다 모델에게 "확실해?"라고 다시 물어서는 못 잡는다 — 같은 착각을 반복한다.
// 그래서 사람이 검수하듯 한다.
//
//   1. 원문 대조(기계적): 판정에 쓴 출처 페이지를 서버가 직접 열어, 모델이 옮긴 근거 문장이
//      정말 있는지 본다. 페이지는 열렸는데 문장이 없으면 그 판정은 거둔다.
//   2. 독립 판정: 원문에서 확인된 근거 문장만 보여 주고, 처음 판정을 모르는 검토자에게
//      "이 문장이 주장을 뒷받침하나, 반박하나, 상관없나"를 묻는다. 처음 판정과 다르면 거둔다.
//
// 이제까지는 "사실과 다름"만 다시 봤다(reviewAccusations). 하지만 틀린 것을 "확인됨"이라고
// 하는 것도 똑같이 위험하다 — 사용자는 그 말을 믿고 그대로 쓴다. 여기서는 둘 다 본다.
//
// 결과는 주장마다 confidence로 남긴다.
//   high   — 법제처 조문 대조, 기업 기준 자료, 부존재 신뢰도, 또는 근거 원문 확인 + 독립 판정 일치
//   medium — 판정은 있지만 근거 페이지를 직접 열어 확인하지 못함(차단·동적 페이지 등)
// strict(엄격 모드)이면 medium은 판정하지 않고 '확인되지 않음'으로 둔다 —
// 유메가 단정하는 것은 high뿐이다.
import { judgeEvidence as defaultJudge } from "./claude.js";
import { privateHost } from "./netGuard.js";

const FETCH_TIMEOUT_MS = 6_000;
const MAX_BYTES = 1_500_000;
const MAX_SOURCES_PER_CLAIM = 3;
const LOCKABLE_VIA = new Set(["web", "research"]);
const SELF_GROUNDED = new Set(["official", "reference", "nec"]);

// ── 페이지 글자 꺼내기 ──────────────────────────────────────────────────────
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
export function htmlToText(html) {
  return String(html)
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|li|h\d|tr|td|th|section|article)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => {
      if (e[0] !== "#") return ENT[e.toLowerCase()] ?? m;
      const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1));
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    })
    .replace(/[ \t ]+/g, " ");
}

function charsetOf(contentType, head) {
  const m = /charset=["']?([\w-]+)/i.exec(contentType || "") || /<meta[^>]+charset=["']?([\w-]+)/i.exec(head);
  const cs = (m?.[1] || "utf-8").toLowerCase();
  return ["euc-kr", "ks_c_5601-1987", "cp949", "x-windows-949"].includes(cs) ? "euc-kr" : cs;
}

export async function fetchPageText(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(u.protocol) || privateHost(u.hostname)) return null;
  try {
    const res = await fetch(u, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; YumeFactCheck/1.0; +https://www.yume-reamer.com)", Accept: "text/html,text/plain;q=0.9,*/*;q=0.5" },
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    // 넘겨받은 곳이 내부망이면 읽지 않는다(리다이렉트를 이용한 우회).
    if (!res.ok || privateHost(new URL(res.url || url).hostname)) return null;
    const type = res.headers.get("content-type") || "";
    if (!/text\/html|text\/plain|application\/xhtml/i.test(type)) return null;
    const reader = res.body.getReader();
    const parts = [];
    let size = 0;
    while (size < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value);
      size += value.length;
    }
    reader.cancel().catch(() => {});
    const buf = Buffer.concat(parts.map((p) => Buffer.from(p)));
    const head = buf.subarray(0, 4096).toString("latin1");
    let text;
    try {
      text = new TextDecoder(charsetOf(type, head)).decode(buf);
    } catch {
      text = buf.toString("utf8");
    }
    return /html/i.test(type) ? htmlToText(text) : text;
  } catch {
    return null;
  }
}

// ── 근거 문장이 페이지에 있는가 ──────────────────────────────────────────────
// 공백·문장부호·따옴표 모양은 옮기면서 자주 달라진다. 글자만 남겨 비교한다.
const squash = (s) => String(s).normalize("NFC").toLowerCase().replace(/[\s"'“”‘’`.,·…:;!?()[\]{}<>~\-–—_/\\|*#]+/g, "");

// 0~1: 근거 문장의 몇 %가 페이지에 그대로 있는가. 통째로 있으면 1.
// 말줄임(…)으로 건너뛴 인용, 조사 하나 바뀐 인용을 버리지 않으려고 12글자 조각 단위로 센다.
export function quoteCoverage(pageText, quote) {
  const p = squash(pageText);
  const q = squash(quote);
  if (q.length < 8 || !p) return 0;
  if (p.includes(q)) return 1;
  const size = 12;
  let found = 0;
  let total = 0;
  for (let i = 0; i < q.length; i += size) {
    const piece = q.slice(i, i + size);
    if (piece.length < 6) continue;
    total += 1;
    if (p.includes(piece)) found += 1;
  }
  return total ? found / total : 0;
}

// 출처 하나를 대조한 결과.
//   verified    — 근거 문장이 페이지에 있다(85% 이상)
//   absent      — 페이지는 충분히 읽었는데 근거 문장이 거의 없다(30% 미만) → 지어낸 인용
//   unclear     — 그 사이(일부만 맞음)
//   unreachable — 페이지를 못 열었다(차단·시간 초과·PDF 등) → 판단하지 않음
export function classifySource(pageText, quote) {
  if (pageText == null) return "unreachable";
  if (squash(pageText).length < 300) return "unreachable"; // 껍데기만 온 동적 페이지
  const c = quoteCoverage(pageText, quote);
  if (c >= 0.85) return "verified";
  if (c < 0.3) return "absent";
  return "unclear";
}

const demote = (c, reason) => ({
  ...c,
  verdict: "uncertain",
  locked_out_verdict: c.verdict,
  confidence: null,
  explanation: `${reason}${c.explanation ? ` (처음 판단: ${c.explanation})` : ""}`,
});

export async function lockEvidence(claims, { fetchText = fetchPageText, judge = defaultJudge, onProgress = () => {}, ledger = null, strict = false } = {}) {
  const out = claims.map((c) => {
    if (c.verdict !== "confirmed" && c.verdict !== "false") return { ...c, confidence: null };
    if (SELF_GROUNDED.has(c.verified_via)) return { ...c, confidence: "high" };
    return c;
  });
  const targets = out
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => (c.verdict === "confirmed" || c.verdict === "false") && LOCKABLE_VIA.has(c.verified_via) && !c.from_claim_cache);

  if (targets.length) {
    onProgress(`판정 근거 ${targets.length}건의 원문을 직접 열어 대조하는 중…`);
    // 1. 원문 대조 — 출처 페이지를 열어 근거 문장을 찾는다.
    const pageCache = new Map();
    const page = (url) => {
      if (!pageCache.has(url)) pageCache.set(url, fetchText(url).catch(() => null));
      return pageCache.get(url);
    };
    const checked = await Promise.all(
      targets.map(async ({ c, i }) => {
        const srcs = (c.sources || []).filter((s) => s?.url && String(s.quote || "").trim()).slice(0, MAX_SOURCES_PER_CLAIM);
        const results = await Promise.all(srcs.map(async (s) => ({ s, status: classifySource(await page(s.url), s.quote) })));
        return { c, i, results };
      }),
    );

    const toJudge = [];
    for (const { c, i, results } of checked) {
      const verified = results.filter((r) => r.status === "verified");
      if (verified.length) {
        toJudge.push({ i, c, evidence: verified.map((r) => r.s) });
        continue;
      }
      // 연 페이지마다 근거 문장이 없었다 — 근거를 지어냈다. 판정을 거둔다.
      if (results.length && results.every((r) => r.status === "absent")) {
        out[i] = demote(c, "판정의 근거로 제시된 문장을 출처 페이지에서 찾을 수 없어 판정을 보류합니다.");
        continue;
      }
      out[i] = { ...c, confidence: "medium", evidence: { status: "unverified" } };
    }

    // 2. 독립 판정 — 원문에서 확인된 문장만 보여 주고, 처음 판정을 모르는 검토자에게 묻는다.
    if (toJudge.length) {
      let verdicts = null;
      try {
        verdicts = await judge(
          toJudge.map(({ c, evidence }) => ({ claim: c.text, excerpts: evidence.map((e) => e.quote) })),
          { ledger },
        );
      } catch {
        verdicts = null;
      }
      toJudge.forEach(({ i, c, evidence }, k) => {
        const v = verdicts?.[k];
        const want = c.verdict === "confirmed" ? "supports" : "contradicts";
        const ev = { status: "verified", url: evidence[0].url, quote: evidence[0].quote };
        if (!v) {
          out[i] = { ...c, confidence: "medium", evidence: ev }; // 검토자를 못 불렀다 — 원문은 확인됐으니 판정은 둔다
        } else if (v === want) {
          out[i] = { ...c, confidence: "high", evidence: ev };
        } else {
          out[i] = demote(
            c,
            v === "unrelated"
              ? "출처의 근거 문장이 이 주장을 직접 다루지 않아 판정을 보류합니다."
              : "출처의 근거 문장이 처음 판정과 반대 방향이라 판정을 보류합니다.",
          );
        }
      });
    }
  }

  // 캐시에서 온 판정은 처음에 이 관문을 거쳤다. 기록된 확신도를 쓰고, 없으면 medium.
  for (let i = 0; i < out.length; i++) {
    const c = out[i];
    if ((c.verdict === "confirmed" || c.verdict === "false") && !c.confidence) out[i] = { ...c, confidence: "medium" };
  }

  if (strict) {
    for (let i = 0; i < out.length; i++) {
      if (out[i].confidence === "medium") {
        out[i] = demote(out[i], "엄격 모드: 근거 원문을 직접 확인하지 못한 판정은 내리지 않습니다.");
      }
    }
  }
  return out;
}
