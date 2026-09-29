// 유입 측정 — 광고비를 쓰기 전에 "어디서 온 사람이 어디까지 갔나"를 셀 수 있어야 한다.
//
// 외부 분석 도구를 붙이지 않는다. 방문자의 행동을 남의 서버로 보내지 않아도, 필요한 숫자는
// 넷뿐이다 — 방문, 첫 확인, 가입, 결제. 그걸 출처(광고 주소의 utm_source 등)별로 센다.
//
// 사람을 식별하지 않는다. 브라우저가 처음 들어올 때 만든 무작위 문자열(anon)과, 처음 들어온
// 출처만 받는다. IP·기기 정보·이메일은 여기 남기지 않는다. 결제는 가입 때 남긴 출처로 이어 센다
// (가입한 사람의 user_id로 잇는다).
import { all, kstDay, now, run } from "./db.js";
import { logError } from "./errorLog.js";

const ANON = /^[a-z0-9]{8,40}$/;
const clean = (v) => String(v || "").toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, 40) || null;

/** 요청 헤더에서 익명 id와 첫 유입 출처를 읽는다. 화면(api.js)이 모든 요청에 싣는다. */
export function trackingFrom(req) {
  const anon = String(req.get?.("x-yume-anon") || "");
  const [source, medium, campaign] = String(req.get?.("x-yume-src") || "").split("|");
  return {
    anon: ANON.test(anon) ? anon : null,
    source: clean(source) || "direct",
    medium: clean(medium),
    campaign: clean(campaign),
  };
}

/** 한 줄 남긴다. 실패해도 삼킨다 — 통계 한 줄 때문에 검증이나 결제를 오류로 만들 수 없다. */
export function recordEvent(kind, { req = null, userId = null, amount = null } = {}) {
  const tr = req ? trackingFrom(req) : { anon: null, source: null, medium: null, campaign: null };
  return run(
    `INSERT INTO events (day, kind, anon, user_id, source, medium, campaign, amount, created_at)
     VALUES (:day, :kind, :anon, :uid, :source, :medium, :campaign, :amount, :t)`,
    {
      day: kstDay(), kind, anon: tr.anon, uid: userId, source: req ? tr.source : null,
      medium: tr.medium, campaign: tr.campaign, amount: amount == null ? null : Math.round(Number(amount) || 0), t: now(),
    },
  ).catch((e) => logError(`events:${kind}`, e));
}

// ── 운영 화면용 집계 ────────────────────────────────────────────────────────
//
// 출처별로: 방문한 브라우저 수 → 확인을 한 번이라도 한 브라우저 수 → 가입 수 → 결제한 사람 수·금액.
// 결제는 가입 때 남은 출처로 돌린다. 추적을 붙이기 전에 가입한 사람의 결제는 "(기존 회원)"이다.
export async function funnel(days = 14) {
  const since = kstDay(now() - (days - 1) * 86400000);
  const [visits, checks, signups, buys] = await Promise.all([
    all("SELECT source, COUNT(DISTINCT anon) AS n FROM events WHERE kind = 'visit' AND day >= :since GROUP BY source", { since }),
    all(
      `SELECT v.source, COUNT(DISTINCT c.anon) AS n FROM events c
         JOIN (SELECT DISTINCT ON (anon) anon, source FROM events WHERE kind = 'visit' AND anon IS NOT NULL ORDER BY anon, id) v ON v.anon = c.anon
        WHERE c.kind = 'check' AND c.day >= :since GROUP BY v.source`,
      { since },
    ),
    all("SELECT source, COUNT(*) AS n FROM events WHERE kind = 'signup' AND day >= :since GROUP BY source", { since }),
    all(
      `SELECT COALESCE(s.source, '(기존 회원)') AS source, COUNT(DISTINCT p.user_id) AS n, COALESCE(SUM(p.amount), 0) AS krw
         FROM events p LEFT JOIN events s ON s.kind = 'signup' AND s.user_id = p.user_id
        WHERE p.kind = 'purchase' AND p.day >= :since GROUP BY COALESCE(s.source, '(기존 회원)')`,
      { since },
    ),
  ]);
  const rows = new Map();
  const at = (src) => {
    const k = src || "direct";
    if (!rows.has(k)) rows.set(k, { source: k, visits: 0, checkers: 0, signups: 0, buyers: 0, revenue: 0 });
    return rows.get(k);
  };
  visits.forEach((r) => { at(r.source).visits = Number(r.n); });
  checks.forEach((r) => { at(r.source).checkers = Number(r.n); });
  signups.forEach((r) => { at(r.source).signups = Number(r.n); });
  buys.forEach((r) => { const x = at(r.source); x.buyers = Number(r.n); x.revenue = Number(r.krw); });
  return [...rows.values()].sort((a, b) => b.visits - a.visits);
}

/** 날짜별 AI 비용(달러)과 확인 수. 광고 날짜와 나란히 놓고 보려는 것. */
export async function dailyCost(days = 14) {
  const out = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const day = kstDay(now() - i * 86400000);
    const from = Date.parse(`${day}T00:00:00+09:00`);
    const to = from + 86400000;
    const [a, b, c] = await Promise.all([
      all("SELECT COALESCE(SUM(cost_usd), 0) AS usd, COUNT(*) AS n FROM verifications WHERE created_at >= :from AND created_at < :to", { from, to }),
      all("SELECT COALESCE(SUM(cost_usd), 0) AS usd FROM api_costs WHERE created_at >= :from AND created_at < :to", { from, to }),
      all("SELECT COUNT(DISTINCT anon) AS n FROM events WHERE kind = 'visit' AND day = :day", { day }),
    ]);
    out.push({
      day,
      usd: Number(a[0]?.usd || 0) + Number(b[0]?.usd || 0),
      checks: Number(a[0]?.n || 0),
      visitors: Number(c[0]?.n || 0),
    });
  }
  return out;
}
