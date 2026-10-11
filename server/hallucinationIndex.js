// YUME 할루시네이션 지수 — 주기마다 발표하는 공개 지표.
//
// 기준을 만드는 쪽이 신뢰를 갖는다. 신용평가사가 부도율 통계를 해마다 내듯, 유메는 AI가 근거 없이
// 지어내는 비율을 같은 방법으로 반복해서 재고 공개한다. 그 숫자가 시장에서 인용되는 순간 "AI
// 할루시네이션의 기준 숫자를 내는 곳"이 된다. 그래서 이 파일의 규칙은 숫자의 위엄보다 정직함이 먼저다.
//
//   · 같은 방법(METHOD_VERSION)으로 잰다. 방법을 바꾸면 버전을 올리고 지수 페이지에 적는다.
//   · 표본이 작으면 비율을 싣지 않는다(MIN_CELL). 대표 숫자는 표본이 기준(MIN_HEADLINE)에 못 미치면
//     '예비'로 표시한다. 모든 비율에는 95% 신뢰구간(Wilson)이 붙는다.
//   · 재확인을 마친 감사만 센다. 사람이 원문으로 확인하지 않은 "오류 후보"는 숫자에 들어가지 않는다.
//   · 회사명은 동의한 곳만. 사례는 익명이고, 답변 속 회사·서비스명은 ○○로 가린다.
//   · 발행하면 얼린다. 발행본의 정규 JSON에 SHA-256 지문을 붙이고, 누구나 같은 JSON을 내려받아 지문을
//     다시 계산할 수 있다. 고칠 때는 덮어쓰지 않고 revision을 올리며 이전 지문과 사유를 남긴다.
import crypto from "node:crypto";
import { all, now, one, run } from "./db.js";
import { PROBE_TYPES } from "./audit/index.js";
import { wilsonInterval } from "./audit/score.js";
import { CATEGORIES, auditResults, claimOutcome, itemOutcome } from "./auditDesk.js";

export const METHOD_VERSION = "YHI-1.0";
export const MIN_CELL = 20;
export const MIN_HEADLINE = 100;

const FAIL = { safe: 0, partial: 0.5, hallucinated: 1 };
const r1 = (x) => Math.round(x * 1000) / 10; // 0.1234 → 12.3(%)

/** 문항 결과 묶음 → 비율 한 칸. 가중 비율과, 가중치 없는 실패 건수로 낸 Wilson 구간. */
export function rateCell(rows, { min = MIN_CELL } = {}) {
  const graded = rows.filter((r) => r.outcome in FAIL);
  const n = graded.length;
  const wsum = graded.reduce((s, r) => s + (r.weight ?? 1), 0);
  const wfail = graded.reduce((s, r) => s + (r.weight ?? 1) * FAIL[r.outcome], 0);
  const plain = graded.reduce((s, r) => s + FAIL[r.outcome], 0);
  const ci = wilsonInterval(plain, n);
  const cell = {
    n,
    hallucinated: graded.filter((r) => r.outcome === "hallucinated").length,
    partial: graded.filter((r) => r.outcome === "partial").length,
    safe: graded.filter((r) => r.outcome === "safe").length,
    suppressed: n < min,
  };
  if (n === 0 || n < min) return { ...cell, rate: null, low: null, high: null };
  return { ...cell, rate: r1(wfail / wsum), low: r1(ci.low), high: r1(ci.high) };
}

// 대표 숫자는 표본이 작아도 싣되(0건이 아니면) '예비'로 표시한다. 칸별 비율은 MIN_CELL 아래면 싣지 않는다.
function headlineCell(rows) {
  const c = rateCell(rows, { min: 1 });
  return { ...c, provisional: c.n < MIN_HEADLINE };
}

function groupCells(rows, keyOf, labelOf) {
  const groups = new Map();
  for (const r of rows) {
    const k = keyOf(r);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  return [...groups.entries()]
    .map(([key, list]) => ({ key, label: labelOf(key), ...rateCell(list) }))
    .sort((a, b) => b.n - a.n || String(a.key).localeCompare(String(b.key)));
}

// 답변 속 회사·서비스 이름을 가린다. 사례는 익명이어야 한다.
export function anonymize(text, names = []) {
  let s = String(text || "");
  for (const n of names.filter((x) => String(x || "").trim().length >= 2)) {
    s = s.split(String(n).trim()).join("○○");
  }
  return s;
}

const typeLabel = (t) => PROBE_TYPES[t]?.label || t;

/** 기간 [start, end)의 지수 데이터. 발행 전에는 몇 번이고 다시 계산한다. */
export async function computeIndexData({ start, end }) {
  start = Number(start);
  end = Number(end);
  // ── 1) 유메 감사(사람이 원문으로 재확인을 마친 것만) ──
  const audits = await all("SELECT * FROM ai_audits WHERE index_excluded = 0 AND stage <> 'excluded'");
  const probeRows = [];
  const claims = { total: 0, match: 0, mismatch: 0, unverifiable: 0 };
  const named = [];
  const cases = [];
  let services = 0;
  for (const a of audits) {
    const items = await all("SELECT * FROM ai_audit_items WHERE audit_id = :id", { id: a.id });
    const findings = await all("SELECT * FROM ai_audit_findings WHERE audit_id = :id", { id: a.id });
    if (!auditResults(items, findings).reviewComplete) continue;
    const inPeriod = items.filter((i) => i.status === "checked" && Number(i.answered_at) >= start && Number(i.answered_at) < end);
    if (!inPeriod.length) continue;
    services += 1;
    const mine = [];
    for (const it of inPeriod) {
      const probe = it.probe_json ? JSON.parse(it.probe_json) : null;
      if (probe && it.grade_json) {
        const outcome = itemOutcome(it, findings);
        const row = { outcome, weight: probe.weight ?? 1, type: probe.type, domain: a.domain, category: a.category };
        probeRows.push(row);
        mine.push(row);
      }
      const v = it.verify_json ? JSON.parse(it.verify_json) : null;
      (v?.claims || []).forEach((c, i) => {
        const o = claimOutcome(it, i, c, findings);
        if (o === "pending") return; // 재확인이 끝난 감사만 오므로 오지 않지만, 와도 세지 않는다.
        claims.total += 1;
        claims[o] += 1;
      });
    }
    const names = [a.company, a.service_name];
    for (const f of findings.filter((x) => Number(x.in_index) && x.review === "confirmed" && x.polarity === "issue")) {
      const it = inPeriod.find((i) => Number(i.id) === Number(f.item_id));
      if (!it) continue;
      const probe = it.probe_json ? JSON.parse(it.probe_json) : null;
      cases.push({
        domain: a.domain,
        category: CATEGORIES[a.category] || a.category,
        type: probe ? typeLabel(probe.type) : null,
        question: anonymize(it.question, names),
        said: anonymize(f.ai_quote || f.claim, names),
        truth: anonymize(f.truth, names),
        source_url: f.source_url || f.checked_url || "",
        source_label: f.source_label || "",
        answered_at: Number(it.answered_at),
      });
    }
    if (Number(a.consent_name)) {
      named.push({
        company: a.company,
        service: a.service_name || a.company,
        domain: a.domain,
        public_id: a.public_id || null,
        ...rateCell(mine, { min: 1 }),
      });
    }
  }
  const decided = claims.match + claims.mismatch;
  const auditSection = {
    services,
    overall: headlineCell(probeRows),
    byType: groupCells(probeRows, (r) => r.type, typeLabel).map((c) => ({ ...c, meaning: PROBE_TYPES[c.key]?.meaning || "" })),
    byDomain: groupCells(probeRows, (r) => r.domain, (k) => k),
    byCategory: groupCells(probeRows, (r) => r.category, (k) => CATEGORIES[k] || k),
    claims: { ...claims, mismatchRate: decided >= MIN_CELL ? r1(claims.mismatch / decided) : null, suppressed: decided < MIN_CELL },
    named: named.sort((x, y) => x.company.localeCompare(y.company)),
    cases: cases.sort((x, y) => x.answered_at - y.answered_at).slice(0, 8).map(({ answered_at: _a, ...c }) => c),
  };

  // ── 2) 기업 자가 점검(무료 점검, 익명 문항 결과) ──
  const self = await all("SELECT domain, probe_type, outcome, weight FROM audit_outcomes WHERE created_at >= :s AND created_at < :e", { s: start, e: end });
  const selfRows = self.map((r) => ({ outcome: r.outcome, weight: Number(r.weight) || 1, type: r.probe_type, domain: r.domain }));
  const selfSection = {
    overall: headlineCell(selfRows),
    byType: groupCells(selfRows, (r) => r.type, typeLabel),
    byDomain: groupCells(selfRows, (r) => r.domain, (k) => k),
  };

  // ── 3) 유메 검사 현황(서비스에 들어온 글, 집계 숫자만) ──
  // 감사 데스크의 검사(source = 'audit')는 위 1)에서 이미 셌으므로 뺀다. 같은 결과를 재사용한 건(캐시)도 뺀다.
  const eng = await one(
    `SELECT COUNT(*) AS texts, COALESCE(SUM(claim_count), 0) AS claims, COALESCE(SUM(false_count), 0) AS f, COALESCE(SUM(uncertain_count), 0) AS u
       FROM verifications WHERE status = 'done' AND from_cache = 0 AND source <> 'audit' AND created_at >= :s AND created_at < :e`,
    { s: start, e: end },
  );
  const byDom = await all(
    `SELECT COALESCE(overall_domain, '일반') AS domain, COUNT(*) AS texts, COALESCE(SUM(claim_count), 0) AS claims, COALESCE(SUM(false_count), 0) AS f
       FROM verifications WHERE status = 'done' AND from_cache = 0 AND source <> 'audit' AND created_at >= :s AND created_at < :e
      GROUP BY 1 ORDER BY 2 DESC`,
    { s: start, e: end },
  );
  const tc = Number(eng?.claims || 0);
  const tf = Number(eng?.f || 0);
  const tu = Number(eng?.u || 0);
  const engine = {
    texts: Number(eng?.texts || 0),
    claims: tc,
    false: tf,
    uncertain: tu,
    confirmed: Math.max(0, tc - tf - tu),
    falseRate: tc >= MIN_CELL ? r1(tf / tc) : null,
    uncertainRate: tc >= MIN_CELL ? r1(tu / tc) : null,
    byDomain: byDom.map((d) => ({
      domain: d.domain,
      texts: Number(d.texts),
      claims: Number(d.claims),
      falseRate: Number(d.claims) >= MIN_CELL ? r1(Number(d.f) / Number(d.claims)) : null,
    })),
  };

  // 대표 숫자는 사람이 재확인한 감사가 먼저다. 감사가 없으면 자가 점검, 그것도 없으면 싣지 않는다.
  const headline = auditSection.overall.n > 0
    ? { source: "audits", ...auditSection.overall }
    : selfSection.overall.n > 0
      ? { source: "self", ...selfSection.overall }
      : null;

  return {
    method: METHOD_VERSION,
    period: { start, end },
    thresholds: { minCell: MIN_CELL, minHeadline: MIN_HEADLINE },
    headline,
    audits: auditSection,
    selfAudits: selfSection,
    engine,
  };
}

// ── 발행본 ────────────────────────────────────────────────────────────
// 키 순서를 고정한 JSON. 같은 내용이면 어느 언어로 다시 만들어도 같은 바이트가 나와야 지문이 의미가 있다.
export function stableStringify(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  return `{${Object.keys(v)
    .filter((k) => v[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(v[k])}`)
    .join(",")}}`;
}

/** 공개되는 정규 문서. 지문은 이 문자열의 SHA-256이다. */
export function canonicalIssue(issue) {
  return stableStringify({
    slug: issue.slug,
    title: issue.title,
    period_start: Number(issue.period_start),
    period_end: Number(issue.period_end),
    method_version: issue.method_version,
    revision: Number(issue.revision || 0),
    published_at: issue.published_at ? Number(issue.published_at) : null,
    commentary: issue.commentary || "",
    data: typeof issue.data_json === "string" ? JSON.parse(issue.data_json) : issue.data,
  });
}

export const sha256 = (s) => crypto.createHash("sha256").update(s, "utf8").digest("hex");

const SLUG = /^[a-z0-9][a-z0-9-]{2,31}$/;

export async function createIssue({ slug, title, start, end }) {
  slug = String(slug || "").trim().toLowerCase();
  if (!SLUG.test(slug)) return { error: "주소 이름은 영문 소문자·숫자·하이픈 3~32자로 적어주세요(예: 2026-q4)." };
  const s = Number(start);
  const e = Number(end);
  if (!Number.isFinite(s) || !Number.isFinite(e) || s >= e) return { error: "기간을 다시 확인해주세요 — 시작이 끝보다 앞이어야 해요." };
  const t = String(title || "").trim().slice(0, 120);
  if (!t) return { error: "제목을 적어주세요." };
  if (await one("SELECT id FROM index_issues WHERE slug = :slug", { slug })) return { error: "같은 주소 이름이 이미 있어요." };
  const data = await computeIndexData({ start: s, end: e });
  const at = now();
  const r = await run(
    `INSERT INTO index_issues (slug, title, period_start, period_end, data_json, method_version, created_at, updated_at)
     VALUES (:slug, :title, :s, :e, :d, :m, :t, :t) RETURNING id`,
    { slug, title: t, s, e, d: JSON.stringify(data), m: METHOD_VERSION, t: at },
  );
  return { ok: true, id: Number(r.rows[0].id) };
}

export async function issueById(id) {
  return one("SELECT * FROM index_issues WHERE id = :id", { id: Number(id) || 0 });
}

export async function listIssues({ publishedOnly = false } = {}) {
  return all(
    `SELECT id, slug, title, period_start, period_end, status, method_version, sha256, published_at, revision, created_at, updated_at
       FROM index_issues ${publishedOnly ? "WHERE status = 'published'" : ""} ORDER BY period_end DESC, id DESC`,
  );
}

export async function publishedIssue(slug) {
  return one("SELECT * FROM index_issues WHERE slug = :slug AND status = 'published'", { slug: String(slug || "").toLowerCase() });
}

export async function latestIssue() {
  return one("SELECT * FROM index_issues WHERE status = 'published' ORDER BY period_end DESC, id DESC LIMIT 1");
}

/** 초안 고치기·다시 계산. 발행본은 여기로 고치지 않는다(correctIssue). */
export async function updateDraft(id, { title, commentary, start, end, recompute = false } = {}) {
  const issue = await issueById(id);
  if (!issue) return { error: "지수를 찾을 수 없어요." };
  if (issue.status !== "draft") return { error: "발행한 지수는 정정 발행으로만 고칠 수 있어요." };
  const s = start !== undefined ? Number(start) : Number(issue.period_start);
  const e = end !== undefined ? Number(end) : Number(issue.period_end);
  if (!Number.isFinite(s) || !Number.isFinite(e) || s >= e) return { error: "기간을 다시 확인해주세요 — 시작이 끝보다 앞이어야 해요." };
  const periodChanged = s !== Number(issue.period_start) || e !== Number(issue.period_end);
  const data = recompute || periodChanged ? JSON.stringify(await computeIndexData({ start: s, end: e })) : issue.data_json;
  await run(
    `UPDATE index_issues SET title = :title, commentary = :c, period_start = :s, period_end = :e, data_json = :d, method_version = :m, updated_at = :t WHERE id = :id`,
    {
      id: issue.id,
      title: title !== undefined ? String(title).trim().slice(0, 120) || issue.title : issue.title,
      c: commentary !== undefined ? String(commentary).slice(0, 8000) : issue.commentary,
      s,
      e,
      d: data,
      m: recompute || periodChanged ? METHOD_VERSION : issue.method_version,
      t: now(),
    },
  );
  return { ok: true };
}

/** 발행 — 기간이 끝난 뒤에만. 발행 순간의 데이터로 다시 계산해 얼리고 지문을 붙인다. */
export async function publishIssue(id) {
  const issue = await issueById(id);
  if (!issue) return { error: "지수를 찾을 수 없어요." };
  if (issue.status !== "draft") return { error: "이미 발행한 지수예요." };
  if (Number(issue.period_end) > now()) return { error: "기간이 끝난 뒤에 발행할 수 있어요. 진행 중인 기간의 숫자는 얼리지 않습니다." };
  if (!String(issue.commentary || "").trim()) return { error: "해설을 적어주세요. 숫자만 내놓으면 읽는 사람이 무엇을 봐야 할지 모릅니다." };
  const data = await computeIndexData({ start: issue.period_start, end: issue.period_end });
  const at = now();
  const next = { ...issue, data_json: JSON.stringify(data), method_version: METHOD_VERSION, published_at: at, revision: 0, status: "published" };
  const hash = sha256(canonicalIssue(next));
  await run(
    `UPDATE index_issues SET status = 'published', data_json = :d, method_version = :m, published_at = :t, sha256 = :h, revision = 0, updated_at = :t WHERE id = :id AND status = 'draft'`,
    { id: issue.id, d: next.data_json, m: METHOD_VERSION, t: at, h: hash },
  );
  return { ok: true, sha256: hash };
}

/** 정정 발행 — 사유가 반드시 있어야 하고, 이전 지문을 정정 기록에 남긴다. */
export async function correctIssue(id, { note, commentary, recompute = false } = {}) {
  const issue = await issueById(id);
  if (!issue) return { error: "지수를 찾을 수 없어요." };
  if (issue.status !== "published") return { error: "발행한 지수만 정정할 수 있어요." };
  const why = String(note || "").trim().slice(0, 2000);
  if (!why) return { error: "정정 사유를 적어주세요. 사유는 지수 페이지에 그대로 공개됩니다." };
  const corrections = JSON.parse(issue.corrections_json || "[]");
  const at = now();
  corrections.push({ at, note: why, prev_sha256: issue.sha256, revision: Number(issue.revision) + 1 });
  const next = {
    ...issue,
    commentary: commentary !== undefined ? String(commentary).slice(0, 8000) : issue.commentary,
    data_json: recompute ? JSON.stringify(await computeIndexData({ start: issue.period_start, end: issue.period_end })) : issue.data_json,
    method_version: recompute ? METHOD_VERSION : issue.method_version,
    revision: Number(issue.revision) + 1,
  };
  const hash = sha256(canonicalIssue(next));
  await run(
    `UPDATE index_issues SET commentary = :c, data_json = :d, method_version = :m, revision = :rv, sha256 = :h, corrections_json = :cj, updated_at = :t WHERE id = :id`,
    { id: issue.id, c: next.commentary, d: next.data_json, m: next.method_version, rv: next.revision, h: hash, cj: JSON.stringify(corrections), t: at },
  );
  return { ok: true, sha256: hash, revision: next.revision };
}

export async function deleteDraft(id) {
  const r = await run("DELETE FROM index_issues WHERE id = :id AND status = 'draft'", { id: Number(id) || 0 });
  return r.changes ? { ok: true } : { error: "초안만 지울 수 있어요." };
}

// ── 공개 데이터 내려받기 ──────────────────────────────────────────────
const csvCell = (v) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function issueCsv(issue) {
  const d = JSON.parse(issue.data_json);
  const rows = [["section", "group", "key", "label", "n", "rate_pct", "ci_low_pct", "ci_high_pct", "hallucinated", "partial", "safe"]];
  const push = (section, group, c) => rows.push([section, group, c.key ?? "", c.label ?? "", c.n, c.rate, c.low, c.high, c.hallucinated, c.partial, c.safe]);
  if (d.audits?.overall) push("audits", "overall", { key: "all", label: "전체", ...d.audits.overall });
  for (const c of d.audits?.byType || []) push("audits", "type", c);
  for (const c of d.audits?.byDomain || []) push("audits", "domain", c);
  for (const c of d.audits?.byCategory || []) push("audits", "category", c);
  if (d.selfAudits?.overall) push("self_audits", "overall", { key: "all", label: "전체", ...d.selfAudits.overall });
  for (const c of d.selfAudits?.byType || []) push("self_audits", "type", c);
  for (const c of d.selfAudits?.byDomain || []) push("self_audits", "domain", c);
  rows.push(["engine", "overall", "claims", "검사한 주장", d.engine?.claims, d.engine?.falseRate, "", "", "", "", ""]);
  return "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
}

// ── 무료 자가 점검 결과를 익명으로 남긴다(auditApi.js가 채점 직후 부른다) ──
export async function recordSelfAuditOutcomes(domain, results) {
  const t = now();
  for (const r of results || []) {
    if (!(r.outcome in FAIL) && r.outcome !== "ungraded") continue;
    await run(
      "INSERT INTO audit_outcomes (domain, probe_type, outcome, weight, created_at) VALUES (:d, :p, :o, :w, :t)",
      { d: String(domain || "법률").slice(0, 20), p: String(r.type || "").slice(0, 40), o: r.outcome, w: Number(r.weight ?? 1) || 1, t },
    );
  }
}
