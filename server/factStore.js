// 확인된 사실 저장소 — 한 번 출처로 확인한 사실을 DB 에 남겨, 다음 답에서는 다시 찾지 않고 바로 꺼내 쓴다.
//
// 2026-10-17 대표 "베리라인 엔진 자체를 발전" — 쓸수록 빨라지고 싸지며, 쌓인 저장소 자체가 한국 사실 데이터가 된다.
// 사실마다 유효 기간이 다르다: 법 · 의료는 길게, 금리 · 환율 · 시세처럼 매일 바뀌는 것은 하루, '현재 · 오늘'이 든 주장도 하루.
// 운영(DATABASE_URL)에서만 DB 를 쓴다 — 시험 · 로컬은 아무것도 남기지 않는다(메모리 캐시는 answerCheck.js 에 따로 있다).
const DAY = 24 * 3600 * 1000;
const TTL_DAYS = { law: 30, medical: 30, tax: 14, labor: 14, realestate: 14, welfare: 14, company: 7, statistics: 3, economy: 1, general: 7 };
const VOLATILE = /오늘|현재|지금|최근|요즘|이번\s?(주|달|해)|실시간|시세|환율|주가|금리|날씨/;

export const factKey = (c) => `${c.field || "general"}|${String(c.claim || "").replace(/[\s"'“”‘’.,·]/g, "")}`;
export function ttlFor(c) {
  if (VOLATILE.test(`${c.claim || ""} ${c.quote || ""}`)) return DAY;
  return (TTL_DAYS[c.field] ?? 7) * DAY;
}

const useDb = () => !!process.env.DATABASE_URL && process.env.NODE_ENV !== "test" && process.env.YUME_FACT_STORE !== "off";
let dbp = null;
const db = () => (dbp ||= import("./db.js"));

/** 저장소에서 아직 유효한 판정을 꺼낸다. 돌려주는 값: Map(key → 판정) */
export async function loadFacts(claims, now = Date.now()) {
  const out = new Map();
  if (!useDb() || !claims.length) return out;
  try {
    const { all, run } = await db();
    const keys = [...new Set(claims.map(factKey))];
    const rows = await all("SELECT key, verdict, correct, url, official, via, source_name, quote_src, note FROM verified_facts WHERE key = ANY(:keys) AND expires_at > :now", { keys, now });
    for (const r of rows) out.set(r.key, { verdict: r.verdict, correct: r.correct || "", url: r.url || "", official: !!Number(r.official), via: r.via || "", sourceName: r.source_name || "", quoteSrc: r.quote_src || "", note: r.note || "" });
    if (rows.length) await run("UPDATE verified_facts SET hits = hits + 1, last_hit_at = :now WHERE key = ANY(:keys)", { keys: rows.map((r) => r.key), now });
  } catch (e) {
    console.error("[facts] 꺼내기 실패", e.message);
  }
  return out;
}

/** 확인이 끝난 판정(확인됨 · 틀림)만 남긴다. 확인 안 됨은 남기지 않는다(다음에 다시 찾아보게). */
export async function saveFacts(pairs, now = Date.now()) {
  if (!useDb()) return 0;
  const keep = pairs.filter(([c, r]) => r && !r.cached && !r.stored && (r.verdict === "supported" || r.verdict === "contradicted"));
  if (!keep.length) return 0;
  try {
    const { run } = await db();
    for (const [c, r] of keep) {
      await run(
        `INSERT INTO verified_facts (key, field, claim, verdict, correct, url, official, via, source_name, quote_src, note, hits, checked_at, expires_at)
         VALUES (:key, :field, :claim, :verdict, :correct, :url, :official, :via, :source, :quote, :note, 0, :now, :exp)
         ON CONFLICT (key) DO UPDATE SET verdict = EXCLUDED.verdict, correct = EXCLUDED.correct, url = EXCLUDED.url, official = EXCLUDED.official,
           via = EXCLUDED.via, source_name = EXCLUDED.source_name, quote_src = EXCLUDED.quote_src, note = EXCLUDED.note, checked_at = EXCLUDED.checked_at, expires_at = EXCLUDED.expires_at`,
        { key: factKey(c), field: c.field || "general", claim: String(c.claim || "").slice(0, 500), verdict: r.verdict, correct: String(r.correct || "").slice(0, 500), url: String(r.url || "").slice(0, 500),
          official: r.official ? 1 : 0, via: r.via || "", source: String(r.sourceName || "").slice(0, 200), quote: String(r.quoteSrc || "").slice(0, 600), note: String(r.note || "").slice(0, 200), now, exp: now + ttlFor(c) },
      );
    }
    return keep.length;
  } catch (e) {
    console.error("[facts] 남기기 실패", e.message);
    return 0;
  }
}

/** 저장소 현황(운영 화면 · 본사용). */
export async function factStats(now = Date.now()) {
  if (!useDb()) return null;
  const { one } = await db();
  const r = await one("SELECT COUNT(*) AS n, COUNT(*) FILTER (WHERE expires_at > :now) AS live, COALESCE(SUM(hits), 0) AS hits, COUNT(*) FILTER (WHERE checked_at > :day) AS today FROM verified_facts", { now, day: now - DAY });
  return { total: Number(r?.n || 0), live: Number(r?.live || 0), hits: Number(r?.hits || 0), today: Number(r?.today || 0) };
}

// 질문과 관련해 이미 확인해 둔 사실(2026-10-18 미르미 "답 5초") — 답을 쓰기 전에 근거로 넘긴다.
// 질문의 낱말(두 글자 이상)이 주장에 들어 있는 것 중, 아직 유효하고 확인됨 · 틀림이 정해진 것을 많이 쓰인 순서로.
const STOP = new Set(["얼마", "얼마야", "얼마예요", "알려줘", "알려", "주세요", "뭐야", "무엇", "어떻게", "언제", "어디", "그리고", "이랑", "있어", "있나요", "인가요", "올해", "지금", "요즘", "정도", "관련", "대해", "대한"]);
export function factTerms(question) {
  const words = String(question || "").replace(/[^가-힣a-zA-Z0-9\s]/g, " ").split(/\s+/).map((w) => w.replace(/(은|는|이|가|을|를|에|의|로|으로|와|과|도|만|이랑|랑|까지|부터|에서|한테|이야|야|예요|이에요|인가요|나요|까요|해줘|해요)$/, "")).filter((w) => w.length >= 2 && !STOP.has(w));
  return [...new Set(words)].slice(0, 6);
}
export async function searchFacts(question, { limit = 8, now = Date.now() } = {}) {
  if (!useDb()) return [];
  const terms = factTerms(question);
  if (!terms.length) return [];
  try {
    const { all } = await db();
    const pats = terms.map((t) => `%${t}%`);
    const rows = await all(
      `SELECT claim, verdict, correct, url, source_name, quote_src, checked_at FROM verified_facts
        WHERE expires_at > :now AND verdict IN ('supported', 'contradicted') AND claim ILIKE ANY(:pats)
        ORDER BY hits DESC, checked_at DESC LIMIT :lim`,
      { now, pats, lim: limit },
    );
    return rows.map((r) => ({ claim: r.claim, verdict: r.verdict, correct: r.correct || "", url: r.url || "", source: r.source_name || "", quote: r.quote_src || "", checkedAt: Number(r.checked_at) || null }));
  } catch (e) {
    console.error("[facts] 찾기 실패", e.message);
    return [];
  }
}

