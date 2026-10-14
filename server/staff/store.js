// AI 직원의 장부 — 근무 상태, 업무 일지, 결재함.
//
// 직원 한 명 = 서버가 정해진 때에 돌리는 일 하나(roster.js). 대표가 사람 직원 보듯 보려면 세 가지가 남아야 한다:
//   staff_state     — 근무 중인지(enabled), 혼자 처리해도 되는지(autonomy: approve | auto), 마지막으로 무엇을 했는지
//   staff_log       — 업무 일지. 한 일·쓴 돈(AI 비용)·문제
//   staff_approvals — 결재함. 밖으로 나가는 일(메일 발송·후보 등록·약관 판정)은 대표가 승인해야 실행된다
import { all, now, one, run } from "../db.js";

const KST = 9 * 3600_000;
export const kstDayStart = (t = now()) => {
  const k = t + KST;
  return k - (k % 86_400_000) - KST;
};

// ── 근무 상태 ─────────────────────────────────────────────────────────
export async function getState(id, defaults = {}) {
  const row = await one("SELECT * FROM staff_state WHERE id = :id", { id });
  if (row) return row;
  const t = now();
  await run(
    `INSERT INTO staff_state (id, enabled, autonomy, daily_cap, updated_at) VALUES (:id, :en, :au, :cap, :t)
     ON CONFLICT (id) DO NOTHING`,
    { id, en: defaults.enabled === false ? 0 : 1, au: defaults.autonomy || "approve", cap: defaults.dailyCap ?? null, t },
  );
  return one("SELECT * FROM staff_state WHERE id = :id", { id });
}

export async function setState(id, patch = {}) {
  const sets = ["updated_at = :t"];
  const params = { id, t: now() };
  if (patch.enabled !== undefined) {
    sets.push("enabled = :en");
    params.en = patch.enabled ? 1 : 0;
  }
  if (patch.autonomy !== undefined) {
    if (!["approve", "auto"].includes(patch.autonomy)) return { error: "모드는 '결재 후' 또는 '자동'이에요." };
    sets.push("autonomy = :au");
    params.au = patch.autonomy;
  }
  if (patch.daily_cap !== undefined) {
    const n = Math.floor(Number(patch.daily_cap));
    sets.push("daily_cap = :cap");
    params.cap = Number.isFinite(n) && n > 0 ? Math.min(n, 200) : null;
  }
  if (patch.last_status !== undefined) {
    sets.push("last_status = :ls");
    params.ls = String(patch.last_status).slice(0, 40);
  }
  if (patch.last_note !== undefined) {
    sets.push("last_note = :ln");
    params.ln = String(patch.last_note).slice(0, 300);
  }
  await run(`UPDATE staff_state SET ${sets.join(", ")} WHERE id = :id`, params);
  return { ok: true };
}

/**
 * 이번 차례를 잡는다. 서버가 여러 대여도 한 대만 일하게 마지막 실행 시각으로 비교·교체한다.
 * notBefore보다 앞서 실행된 적이 있으면(=아직 차례가 아니면) false.
 */
export async function claimRun(id, notBefore, t = now()) {
  const r = await run(
    "UPDATE staff_state SET last_run_at = :t WHERE id = :id AND (last_run_at IS NULL OR last_run_at < :nb)",
    { id, t, nb: notBefore },
  );
  return r.changes > 0;
}

// ── 업무 일지 ─────────────────────────────────────────────────────────
export async function log(staff, title, { detail = null, ref = null, level = "info", costUsd = 0 } = {}) {
  await run(
    `INSERT INTO staff_log (staff, title, detail, ref, level, cost_usd, created_at)
     VALUES (:s, :title, :detail, :ref, :level, :cost, :t)`,
    {
      s: staff,
      title: String(title).slice(0, 200),
      detail: detail ? String(detail).slice(0, 4000) : null,
      ref: ref ? String(ref).slice(0, 80) : null,
      level,
      cost: Number(costUsd) || 0,
      t: now(),
    },
  );
}

export const recentLogs = (limit = 60, staff = null) =>
  staff
    ? all("SELECT * FROM staff_log WHERE staff = :s ORDER BY id DESC LIMIT :limit", { s: staff, limit })
    : all("SELECT * FROM staff_log ORDER BY id DESC LIMIT :limit", { limit });

/** 오늘(한국 날짜) 직원별 처리 건수·AI 비용. 경고·오류 줄은 "한 일"로 세지 않는다. */
export async function todayStats(t = now()) {
  const rows = await all(
    `SELECT staff, SUM(CASE WHEN level = 'info' THEN 1 ELSE 0 END) AS done, COALESCE(SUM(cost_usd), 0) AS usd
       FROM staff_log WHERE created_at >= :since GROUP BY staff`,
    { since: kstDayStart(t) },
  );
  return Object.fromEntries(rows.map((r) => [r.staff, { done: Number(r.done || 0), usd: Number(r.usd || 0) }]));
}

// ── 결재함 ───────────────────────────────────────────────────────────
/** 결재 올리기. 같은 dedupe가 이미 있으면(대기·승인·반려 모두) 다시 올리지 않고 null. */
export async function propose(staff, { kind, title, summary = "", payload = {}, ref = null, dedupe = null }) {
  const r = await run(
    `INSERT INTO staff_approvals (staff, kind, title, summary, payload_json, ref, dedupe, created_at)
     VALUES (:s, :k, :title, :summary, :p, :ref, :d, :t)
     ON CONFLICT (dedupe) DO NOTHING RETURNING id`,
    {
      s: staff,
      k: kind,
      title: String(title).slice(0, 200),
      summary: String(summary || "").slice(0, 4000),
      p: JSON.stringify(payload || {}),
      ref,
      d: dedupe,
      t: now(),
    },
  );
  return r.rows?.[0]?.id ? Number(r.rows[0].id) : null;
}

export const hasProposal = async (dedupe) => Boolean(await one("SELECT 1 AS x FROM staff_approvals WHERE dedupe = :d", { d: dedupe }));

const shape = (a) => {
  let payload = {};
  try {
    payload = JSON.parse(a.payload_json || "{}");
  } catch {
    /* 깨진 값은 빈 것으로 */
  }
  return { ...a, id: Number(a.id), created_at: Number(a.created_at), decided_at: a.decided_at ? Number(a.decided_at) : null, payload, payload_json: undefined };
};

export async function listApprovals({ status = "pending", limit = 100 } = {}) {
  const rows = status === "all"
    ? await all("SELECT * FROM staff_approvals ORDER BY id DESC LIMIT :limit", { limit })
    : await all("SELECT * FROM staff_approvals WHERE status = :st ORDER BY id ASC LIMIT :limit", { st: status, limit });
  return rows.map(shape);
}

export async function getApproval(id) {
  const a = await one("SELECT * FROM staff_approvals WHERE id = :id", { id: Number(id) || 0 });
  return a ? shape(a) : null;
}

/** 대기 중인 결재만 바꾼다(두 번 눌러도 한 번만 실행되게). 바꿨으면 true. */
export async function decide(id, status, result = null) {
  const r = await run(
    "UPDATE staff_approvals SET status = :st, result = :res, decided_at = :t WHERE id = :id AND status = 'pending'",
    { id: Number(id) || 0, st: status, res: result ? String(result).slice(0, 2000) : null, t: now() },
  );
  return r.changes > 0;
}

/** 승인 뒤 실행 결과를 남긴다(실패면 다시 대기로 돌려 대표가 고쳐서 다시 승인할 수 있게). */
export async function finish(id, { ok, result }) {
  await run("UPDATE staff_approvals SET status = :st, result = :res WHERE id = :id", {
    id: Number(id),
    st: ok ? "done" : "pending",
    res: String(result || "").slice(0, 2000),
  });
}

export async function pendingCounts() {
  const rows = await all("SELECT staff, COUNT(*) AS n FROM staff_approvals WHERE status = 'pending' GROUP BY staff");
  return Object.fromEntries(rows.map((r) => [r.staff, Number(r.n)]));
}
