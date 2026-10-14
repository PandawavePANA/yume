// AI 직원 운영 — 정해진 때에 일을 돌리고(스케줄러), 결재를 실행하고, 사무실 화면에 보여 줄 상태를 모은다.
//
// 서버 프로세스(index.js)에서만 startStaff()로 타이머를 띄운다(시험에서는 runStaff·approve를 직접 부른다).
// 실패해도 서버를 멈추지 않는다 — 그 직원의 상태가 "문제 있음"이 되고 업무 일지에 남는다.
import { one } from "../db.js";
import { sendMail } from "../mailer.js";
import { engineState, engineStopped } from "../upstream.js";
import { logError } from "../errorLog.js";
import { USD_KRW } from "../costGuard.js";
import { isBusinessDay } from "../businessDays.js";
import { askJson, askText, readPage } from "./ai.js";
import { fetchNew, gmailConfigured, markAnswered, sendReply } from "./gmail.js";
import * as store from "./store.js";
import { CEO, KINDS, ROSTER, TEAMS, lineFor } from "./roster.js";
import { defaults as prepDefaults } from "./jobs/prep.js";
import { heartbeat } from "./jobs/field.js";
import { loadOutreach, outreachFrom } from "./jobs/sales.js";
import * as todos from "./todos.js";

// 대표가 한 일도 업무 일지에 남는다(staff = "ceo") — 결재·반려·할 일·직원 설정, 그리고 대표가 직접 적은 일.
export const CEO_ID = "ceo";
const ceoLog = (title, opts = {}) => store.log(CEO_ID, title, opts).catch((e) => logError("staff:ceolog", e));

/** 대표 할 일 — 완료(확인이 필요한 일은 서버가 확인)·내일로·추가. */
export async function completeTodo(id, { deps = null } = {}) {
  const r = await todos.complete(id, deps || (await defaultDeps()));
  if (!r.error) {
    await loadOutreach().catch(() => {});
    if (r.title) await ceoLog(`할 일 완료 — ${r.title}`, { detail: r.result });
  }
  return r;
}
export async function snoozeTodo(id) {
  const r = await todos.snooze(id);
  if (!r.error) await ceoLog(`할 일 내일로 — ${r.title}`, { level: "note" });
  return r;
}
export async function addTodo(input) {
  const r = await todos.add(input);
  if (!r.error) await ceoLog(`할 일 추가 — ${String(input.title).slice(0, 150)}`, { level: "note" });
  return r;
}

/** 대표가 직접 적는 "내가 한 일". */
export async function addCeoLog({ title, detail = "" }) {
  const ti = String(title || "").trim();
  if (!ti) return { error: "한 일을 적어 주세요." };
  await store.log(CEO_ID, ti.slice(0, 200), { detail: String(detail || "").slice(0, 4000) || null, ref: "manual" });
  return { ok: true };
}

const KST = 9 * 3600_000;
const running = new Set();
// 직원 업무(리서치·약관·QA)의 하루 AI 예산. 감사 채점은 prep.js의 STAFF_AUDIT_BUDGET_USD로 따로 묶는다.
export const staffBudgetUsd = () => {
  const v = Number(process.env.STAFF_DAILY_BUDGET_USD);
  return Number.isFinite(v) && v > 0 ? v : 3;
};
const owner = () => process.env.STAFF_CEO_EMAIL || process.env.OPS_ALERT_TO || process.env.INQUIRY_TO || process.env.COMPANY_EMAIL || "reamer@d-reamer.com";

/** 이번 차례의 기준 시각(그 뒤에 실행된 적이 없으면 일한다). 근무 시간 밖이면 null. */
export function notBefore(def, t = Date.now()) {
  const k = new Date(t + KST);
  const mins = k.getUTCHours() * 60 + k.getUTCMinutes();
  const s = def.schedule || {};
  if (s.weekdays && !isBusinessDay(t)) return null;
  // 근무 시간대는 분 단위(예: [360, 1170] = 06:00~19:30).
  if (s.hours && (mins < s.hours[0] || mins >= s.hours[1])) return null;
  if (s.daily) {
    const at = store.kstDayStart(t) + (s.daily.h * 60 + s.daily.m) * 60_000;
    return t >= at ? at : null;
  }
  return t - (s.every || 3600_000);
}

export function businessHours(t = Date.now()) {
  const h = new Date(t + KST).getUTCHours();
  return isBusinessDay(t) && h >= 9 && h < 18;
}

async function defaultDeps() {
  const { confirmPayment } = await import("../b2bApi.js");
  return { ai: askJson, askText, readPage, sendMail, confirmPayment, gmailFetch: fetchNew, gmailSend: sendReply, gmailMarkAnswered: markAnswered, ...prepDefaults };
}

function contextFor(id, def, state, deps) {
  return {
    staff: { id, ...def },
    state,
    roster: ROSTER,
    autonomy: def.autoOnly ? "auto" : def.approveOnly ? "approve" : state.autonomy,
    cap: (d) => Number(state.daily_cap) || d,
    deps,
    owner,
    businessHours: () => businessHours(),
    // 경고(warn)는 하루 한 번만 — 같은 이유로 매 차례 보류되는 일이 일지를 덮지 않게.
    log: (title, opts = {}) => (opts.level === "warn" ? store.logOnce(id, title, opts) : store.log(id, title, opts)),
    hasProposal: (dedupe) => store.hasProposal(dedupe),
    propose: async (p) => {
      const pid = await store.propose(id, { ...p, payload: { ...(p.payload || {}), line: lineFor(p.kind) } });
      // 전결 문서는 대표에게 올리지 않고 그 자리에서 처리한다(기록은 결재 이력에 남는다).
      if (pid && KINDS[p.kind]?.auto) await approve(pid, {}, { deps, delegated: true });
      return pid;
    },
    notify: async (subject, text) => {
      try {
        await deps.sendMail({ brand: "YUME", to: owner(), subject, text });
      } catch (e) {
        logError("staff:notify", e);
      }
    },
  };
}

/** 직원 한 명에게 일을 시킨다. manual이면 근무 시간·차례와 상관없이(꺼져 있어도) 지금 한다. */
export async function runStaff(id, { manual = false, deps = null } = {}) {
  const def = ROSTER[id];
  if (!def) return { error: "없는 직원이에요." };
  const state = await store.getState(id, def.defaults);
  if (!manual && !Number(state.enabled)) return { skipped: "off" };
  if (def.ai && engineStopped()) {
    await store.setState(id, { last_status: "engine", last_note: "검사 엔진이 멈춰 쉬는 중 (Anthropic 잔액·키 확인)" });
    return { skipped: "engine" };
  }
  // 하루 AI 예산 — 직원 업무로 쓴 돈이 넘으면 AI 직원은 내일까지 쉰다(잔액이 바닥나면 결제·검사가 멈추므로).
  if (def.ai && !manual) {
    const spent = Object.values(await store.todayStats()).reduce((n, x) => n + x.usd, 0);
    if (spent >= staffBudgetUsd()) {
      await store.setState(id, { last_status: "idle", last_note: `오늘 AI 예산(${staffBudgetUsd()}달러)을 다 써서 내일 이어서 해요` });
      return { skipped: "budget" };
    }
  }
  if (running.has(id)) return { skipped: "busy" };
  running.add(id);
  await store.setState(id, { last_status: "working" });
  if (manual) await store.claimRun(id, Date.now() + 1);
  try {
    const ctx = contextFor(id, def, state, deps || (await defaultDeps()));
    const r = (await def.job.run(ctx)) || {};
    await store.setState(id, { last_status: "idle", last_note: r.note || "" });
    return { ok: true, note: r.note || "" };
  } catch (e) {
    logError(`staff:${id}`, e);
    const msg = String(e?.message || e).slice(0, 200);
    await store.setState(id, { last_status: "error", last_note: msg });
    await store.log(id, `일하다 문제가 생겼어요: ${msg}`, { level: "error" });
    return { error: msg };
  } finally {
    running.delete(id);
  }
}

/** 전결 종류인데 결재함에 남아 있는 문서(규칙이 바뀌기 전에 올라온 것)를 처리한다. */
export async function sweepDelegated(deps = null) {
  const left = (await store.listApprovals({ status: "pending" })).filter((a) => KINDS[a.kind]?.auto && !a.result);
  for (const a of left) await approve(a.id, {}, { deps: deps || (await defaultDeps()), delegated: true });
  return left.length;
}

/** 한 바퀴 — 차례가 된 직원만 일한다(서버 여러 대여도 claimRun으로 한 대만). */
export async function tick(t = Date.now()) {
  await sweepDelegated().catch((e) => logError("staff:sweep", e));
  for (const [id, def] of Object.entries(ROSTER)) {
    const nb = notBefore(def, t);
    if (nb == null) continue;
    const state = await store.getState(id, def.defaults);
    if (!Number(state.enabled)) continue;
    if (!(await store.claimRun(id, nb, t))) continue;
    runStaff(id).catch((e) => logError(`staff:${id}`, e));
  }
}

export function startStaff() {
  if (process.env.STAFF_DISABLED === "1") return;
  setTimeout(() => tick().catch((e) => logError("staff:tick", e)), 45_000).unref();
  setInterval(() => tick().catch((e) => logError("staff:tick", e)), 60_000).unref();
}

// ── 결재 ─────────────────────────────────────────────────────────────
export async function approve(approvalId, input = {}, { deps = null, delegated = false } = {}) {
  const a = await store.getApproval(approvalId);
  if (!a) return { error: "결재 문서를 찾을 수 없어요." };
  if (a.status !== "pending") return { error: "이미 처리한 결재예요." };
  const kind = KINDS[a.kind];
  if (!kind) return { error: "알 수 없는 결재예요." };
  if (!(await store.decide(a.id, "approved"))) return { error: "이미 처리한 결재예요." };
  let r;
  try {
    r = await kind.apply(a.payload, input, deps || (await defaultDeps()));
  } catch (e) {
    logError(`staff:approve:${a.kind}`, e);
    r = { ok: false, result: String(e?.message || e).slice(0, 300) };
  }
  const who = delegated ? `${ROSTER[KINDS[a.kind].reviewer]?.name || "팀장"} 전결` : "대표 결재";
  if (delegated && r.ok) r.result = `전결 · ${r.result}`;
  await store.finish(a.id, r);
  await store.log(a.staff, r.ok ? `${who} 완료 — ${a.title}: ${r.result}` : `${who}는 났지만 실행 실패 — ${a.title}: ${r.result}`, { level: r.ok ? "info" : "warn", ref: a.ref });
  if (!delegated && r.ok) await ceoLog(`결재 승인 — ${a.title}`, { detail: r.result, ref: a.ref });
  return r.ok ? { ok: true, result: r.result } : { error: r.result };
}

export async function reject(approvalId, reason = "") {
  const a = await store.getApproval(approvalId);
  if (!a) return { error: "결재 문서를 찾을 수 없어요." };
  if (!(await store.decide(a.id, "rejected", reason || "반려"))) return { error: "이미 처리한 결재예요." };
  if (KINDS[a.kind]?.onReject) await KINDS[a.kind].onReject(a.payload).catch((e) => logError(`staff:reject:${a.kind}`, e));
  await store.log(a.staff, `대표 반려 — ${a.title}${reason ? `: ${reason}` : ""}`, { level: "warn", ref: a.ref });
  await ceoLog(`반려 — ${a.title}`, { detail: reason || null, ref: a.ref, level: "note" });
  return { ok: true };
}

// ── 사무실 화면 상태 ──────────────────────────────────────────────────
export async function office(t = Date.now()) {
  const [stats, pend, approvals, logs] = await Promise.all([store.todayStats(t), store.pendingCounts(), store.listApprovals({ status: "pending" }), store.recentLogs(80)]);
  await todos.seed().catch(() => {});
  const [todoList, todoNext] = await Promise.all([todos.list(), todos.upcoming()]);
  await loadOutreach().catch(() => {});
  const hb = await heartbeat();
  const auditUsd = Number((await one("SELECT COALESCE(SUM(cost_usd), 0) AS usd FROM verifications WHERE source = 'audit' AND created_at >= :s", { s: store.kstDayStart(t) }))?.usd || 0);
  const staff = [];
  for (const [id, def] of Object.entries(ROSTER)) {
    const s = await store.getState(id, def.defaults);
    const nb = notBefore(def, t);
    let st = !Number(s.enabled) ? "off" : running.has(id) ? "working" : def.ai && engineStopped() ? "engine" : s.last_status === "error" ? "error" : pend[id] ? "waiting" : "idle";
    // 현장 요원은 대표 PC에서 돈다 — PC의 심장 박동으로 상태를 정한다(질문을 넣는 중이면 근무 중, 끊기면 쉬는 중).
    if (id === "field" && st !== "off") st = !hb.alive ? "off" : /수집 중/.test(hb.note) ? "working" : st;
    staff.push({
      id,
      name: def.name,
      title: def.title,
      team: def.team,
      teamLabel: TEAMS[def.team].label,
      hue: TEAMS[def.team].hue,
      lead: !!def.lead,
      reportsTo: def.reportsTo || null,
      duty: def.duty,
      ai: !!def.ai,
      enabled: !!Number(s.enabled),
      autonomy: def.autoOnly ? "auto" : def.approveOnly ? "approve" : s.autonomy,
      autonomyFixed: !!(def.autoOnly || def.approveOnly),
      dailyCap: s.daily_cap ? Number(s.daily_cap) : def.defaults?.dailyCap || null,
      status: st,
      note: s.last_note || "",
      lastRunAt: s.last_run_at ? Number(s.last_run_at) : null,
      nextHint: nextHint(def, t, nb),
      doneToday: stats[id]?.done || 0,
      usdToday: stats[id]?.usd || 0,
      pending: pend[id] || 0,
    });
  }
  const usd = Object.values(stats).reduce((n, x) => n + x.usd, 0) + auditUsd;
  return {
    ceo: CEO,
    teams: TEAMS,
    staff,
    approvals: approvals.map((a) => ({ ...a, kindLabel: KINDS[a.kind]?.label || a.kind, urgent: !!KINDS[a.kind]?.urgent || a.payload?.urgency === "high", work: !!KINDS[a.kind]?.work })),
    logs: logs.map((l) => ({
      ...l,
      id: Number(l.id),
      created_at: Number(l.created_at),
      ceo: l.staff === CEO_ID,
      manual: l.staff === CEO_ID && l.ref === "manual",
      name: l.staff === CEO_ID ? CEO.name : ROSTER[l.staff]?.name || l.staff,
      team: l.staff === CEO_ID ? "ceo" : ROSTER[l.staff]?.team || "office",
    })),
    summary: {
      pending: approvals.length,
      urgent: approvals.filter((a) => KINDS[a.kind]?.urgent).length,
      // 직원들이 처리한 일(대표가 한 일은 따로 센다)
      doneToday: Object.entries(stats).filter(([k]) => k !== CEO_ID).reduce((n, [, x]) => n + x.done, 0),
      ceoToday: stats[CEO_ID]?.done || 0,
      costKrw: Math.round(usd * USD_KRW),
      engine: engineState(),
      gmail: gmailConfigured(),
      fieldAgent: hb.alive,
      outreachReady: Boolean(outreachFrom()),
      todos: todoList.length,
    },
    todos: todoList,
    todosNext: todoNext,
  };
}

function nextHint(def, t, nb) {
  const s = def.schedule || {};
  if (s.daily) return `매일 ${String(s.daily.h).padStart(2, "0")}:${String(s.daily.m).padStart(2, "0")}${s.weekdays ? " (평일)" : ""}`;
  const m = Math.round((s.every || 0) / 60_000);
  const hm = (x) => `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`;
  return `${m}분마다${s.hours ? ` (${hm(s.hours[0])}~${hm(s.hours[1])})` : ""}${nb == null ? " · 지금은 퇴근 시간" : ""}`;
}

export async function updateStaff(id, patch) {
  const def = ROSTER[id];
  if (!def) return { error: "없는 직원이에요." };
  await store.getState(id, def.defaults);
  if (patch.autonomy !== undefined && (def.autoOnly || def.approveOnly)) return { error: "이 직원은 모드를 바꿀 수 없어요." };
  const r = await store.setState(id, patch);
  const what = [patch.enabled !== undefined ? (patch.enabled ? "출근" : "퇴근") : null, patch.autonomy ? (patch.autonomy === "auto" ? "자동 처리" : "결재 후 처리") : null, patch.daily_cap !== undefined ? `하루 한도 ${patch.daily_cap}` : null].filter(Boolean).join(" · ");
  if (!r.error && what) await ceoLog(`직원 설정 — ${def.name}: ${what}`, { level: "note" });
  return r;
}

/** 대표가 "지금 일 시키기"를 눌렀다 — 일지에 남기고 시킨다. */
export async function runByCeo(id) {
  if (!ROSTER[id]) return { error: "없는 직원이에요." };
  await ceoLog(`지시 — ${ROSTER[id].name}에게 지금 일 시킴`, { level: "note" });
  runStaff(id, { manual: true }).catch((e) => logError("staff:run", e));
  return { ok: true };
}
