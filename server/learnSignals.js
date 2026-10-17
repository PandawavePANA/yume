// 학습 신호 — 미르미(와 동의한 API 고객)의 실제 확인에서 유메가 배울 거리를 모은다(2026-10-18 대표 "미르미에서 쌓인 데이터가 유메를 발전시키는 구조").
//
// 무엇을 남기나 — 대화가 아니라 '사실 문장' 하나씩만. 개인정보처럼 보이면 남기지 않는다. 사용자 · 대화를 알 수 있는 값은 없다.
//   hedged   유메가 확인하지 못한 사실(출처를 못 찾음) → 밤사이 더 깊게 다시 찾아 확인된 사실 저장소에 넣는다
//   fixed    유메가 출처로 바로잡은 사실 → 무엇을 자주 틀리는지(분야별) 통계
//   reported 사용자가 '틀렸어요'로 신고했고 운영자가 맞다고 본 것 → 유메가 놓친 것. 다시 확인해 배우거나, 대표 검토로
// 보내는 쪽이 learn: true 로 요청했을 때만 남긴다(미르미는 사용자가 설정에서 끌 수 있고, 비밀 수첩은 보내지 않는다).
import crypto from "node:crypto";
import { all, one, run } from "./db.js";
import { CHECK_LEVELS, checkEverydayFacts } from "./answerCheck.js";
import { saveFacts } from "./factStore.js";

const DAY = 24 * 3600 * 1000;
const PII = [/01[016789][-\s.]?\d{3,4}[-\s.]?\d{4}/, /\d{6}[-\s]?[1-4]\d{6}/, /\b\d{4}[-\s]\d{4}[-\s]\d{4}[-\s]\d{4}\b/, /[\w.+-]+@[\w-]+\.[\w.]+/, /\d+\s?동\s?\d+\s?호/, /\d{2,6}-\d{2,6}-\d{4,8}/];
export const hasPii = (t) => PII.some((re) => re.test(String(t || "")));
const norm = (s) => String(s || "").replace(/[\s"'“”‘’.,·]/g, "");
export const signalKey = (kind, field, claim) => crypto.createHash("sha1").update(`${kind}|${field || "general"}|${norm(claim)}`).digest("hex").slice(0, 24);
const usable = (t) => {
  const s = String(t || "").trim();
  return s.length >= 6 && s.length <= 400 && !hasPii(s);
};

async function upsert(sig, now) {
  await run(
    `INSERT INTO engine_signals (key, kind, field, claim, quote, note, url, client, hits, status, first_at, last_at)
     VALUES (:key, :kind, :field, :claim, :quote, :note, :url, :client, 1, 'open', :now, :now)
     ON CONFLICT (key) DO UPDATE SET hits = engine_signals.hits + 1, last_at = :now,
       note = CASE WHEN EXCLUDED.note <> '' THEN EXCLUDED.note ELSE engine_signals.note END,
       status = CASE WHEN engine_signals.status IN ('unresolvable') AND EXCLUDED.kind = 'reported' THEN 'open' ELSE engine_signals.status END`,
    { key: signalKey(sig.kind, sig.field, sig.claim), kind: sig.kind, field: sig.field || "general", claim: String(sig.claim).slice(0, 400), quote: String(sig.quote || sig.claim).slice(0, 400),
      note: String(sig.note || "").slice(0, 400), url: String(sig.url || "").slice(0, 500), client: String(sig.client || ""), now },
  );
}

/** answer-check 결과에서 신호를 뽑아 남긴다. 계산 · 요일 같은 코드 검산 결과는 배울 것이 아니라 빼고. 돌려주는 값: 남긴 수 */
export async function recordSignals(verification = {}, { client = "", now = Date.now() } = {}) {
  const sigs = [];
  for (const h of verification.hedged || []) {
    if (h.field === "law" && /사건번호|판례/.test(h.note || "")) continue; // 사건번호는 목록 대조라 다시 찾을 거리가 아니다
    const claim = h.claim || h.quote;
    if (usable(claim)) sigs.push({ kind: "hedged", field: h.field, claim, quote: h.quote });
  }
  for (const f of verification.fixes || []) {
    if (f.type === "math" || f.type === "date") continue;
    if (usable(f.quote)) sigs.push({ kind: "fixed", field: f.field || (f.type === "legal" ? "law" : "general"), claim: f.quote, quote: f.quote, note: f.problem, url: f.url });
  }
  let n = 0;
  for (const s of sigs.slice(0, 20)) {
    try {
      await upsert({ ...s, client }, now);
      n += 1;
    } catch (e) {
      console.error("[learn] 남기기 실패", e.message);
    }
  }
  return n;
}

/** 사용자가 신고하고 운영자가 맞다고 본 오류(유메가 놓친 것). */
export async function recordReport({ quote = "", claim = "", correct = "", url = "", note = "", field = "general" } = {}, { client = "", now = Date.now() } = {}) {
  const text = String(claim || quote).trim();
  if (!usable(text)) return { skipped: true, reason: "문장이 너무 짧거나 길거나, 개인정보로 보이는 부분이 있어요" };
  await upsert({ kind: "reported", field, claim: text, quote: quote || text, note: [correct && `바른 내용: ${correct}`, note].filter(Boolean).join(" · "), url, client }, now);
  return { ok: true };
}

/**
 * 밤사이 재확인 — 많이 나온 '확인 안 됨' · 신고된 문장을 더 깊게(한울 수준 검색) 다시 확인한다.
 * 확인되면(확인됨 · 틀림) 확인된 사실 저장소에 넣는다 → 다음에 같은 사실이 오면 바로 판정된다.
 * 신고된 문장을 유메가 '확인됨'이라고 보면(사용자와 엇갈림) 대표 검토로 남긴다.
 */
export async function recheckOpen({ limit = 10, now = Date.now(), check = checkEverydayFacts, save = saveFacts } = {}) {
  const rows = await all(
    `SELECT * FROM engine_signals WHERE status = 'open' AND kind IN ('hedged', 'reported') AND (recheck_at IS NULL OR recheck_at < :week)
      ORDER BY CASE WHEN kind = 'reported' THEN 0 ELSE 1 END, hits DESC, last_at DESC LIMIT :limit`,
    { week: now - 7 * DAY, limit },
  );
  const out = { checked: 0, learned: 0, disputed: 0, still: 0, unresolvable: 0 };
  for (const r of rows) {
    out.checked += 1;
    let res = null;
    try {
      const got = await check(r.quote || r.claim, { level: CHECK_LEVELS.standard });
      res = (got.results || []).find((x) => x.verdict === "supported" || x.verdict === "contradicted") || null;
    } catch {
      res = null;
    }
    const attempts = Number(r.attempts || 0) + 1;
    if (res) {
      await save([[{ claim: r.claim, field: r.field, quote: r.quote }, res]]).catch(() => 0);
      const status = r.kind === "reported" && res.verdict === "supported" ? "disputed" : "learned";
      out[status === "learned" ? "learned" : "disputed"] += 1;
      await run("UPDATE engine_signals SET status = :status, recheck_at = :now, attempts = :attempts, recheck_verdict = :v, recheck_url = :url, recheck_note = :note WHERE key = :key",
        { status, now, attempts, v: res.verdict, url: String(res.url || "").slice(0, 500), note: String(res.correct || res.note || "").slice(0, 400), key: r.key });
    } else {
      const status = attempts >= 3 ? "unresolvable" : "open";
      out[status === "open" ? "still" : "unresolvable"] += 1;
      await run("UPDATE engine_signals SET status = :status, recheck_at = :now, attempts = :attempts WHERE key = :key", { status, now, attempts, key: r.key });
    }
  }
  return out;
}

/** 본사 · 운영 화면용 현황. */
export async function signalStats(now = Date.now()) {
  const kinds = await all("SELECT kind, status, COUNT(*) AS n, COALESCE(SUM(hits), 0) AS hits FROM engine_signals GROUP BY kind, status");
  const gaps = await all("SELECT field, COUNT(*) AS n, COALESCE(SUM(hits), 0) AS hits FROM engine_signals WHERE kind = 'hedged' AND status IN ('open', 'unresolvable') GROUP BY field ORDER BY hits DESC LIMIT 8");
  const learned = await all("SELECT claim, field, recheck_verdict, recheck_url, recheck_at FROM engine_signals WHERE status = 'learned' ORDER BY recheck_at DESC LIMIT 10");
  const review = await all("SELECT key, claim, note, recheck_url, recheck_at FROM engine_signals WHERE status = 'disputed' ORDER BY recheck_at DESC LIMIT 20");
  const today = await one("SELECT COUNT(*) AS n FROM engine_signals WHERE last_at >= :d", { d: now - DAY });
  return {
    kinds: kinds.map((k) => ({ kind: k.kind, status: k.status, n: Number(k.n), hits: Number(k.hits) })),
    gaps: gaps.map((g) => ({ field: g.field, n: Number(g.n), hits: Number(g.hits) })),
    learned: learned.map((l) => ({ ...l, recheck_at: Number(l.recheck_at) })),
    review: review.map((l) => ({ ...l, recheck_at: Number(l.recheck_at) })),
    today: Number(today?.n || 0),
  };
}
