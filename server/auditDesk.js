// 감사 데스크 — 특정 회사의 AI 서비스를 표본 감사하고, 결과를 비공개로 알리며 대화를 시작하는 도구.
//
// 보안 회사가 취약점을 찾아 그 회사에 먼저 알리듯, 유메는 상대 서비스를 일반 사용자로서 써 보고
// 찾은 오류를 원문과 함께 보낸다(기획안 4장). 이 파일은 그 일을 순서대로 강제한다.
//   약관 확인 → 질문 세트 → 손으로 입력한 답변 기록(캡처 시각) → 유메 검사 → 사람이 원문 재확인
//   → 비공개 보고서 → 발송 전 체크리스트 → 메일 → 후속 한 번 → 결과
//
// 원칙(기획안 5장)을 코드가 지키게 한 자리:
//   · 공개하지 않는다 — 보고서는 추측할 수 없는 토큰 링크로만 열리고, 회사명은 동의(consent_name)가
//     있어야 공개 요약·지수에 나간다.
//   · 압박하지 않는다 — 메일·보고서에 금액·기한·"공개" 압박 문구가 있으면 발송 처리가 막힌다(lintCopy).
//   · 약관을 지킨다 — 약관을 확인해 'ok'로 적기 전에는 검사를 시작하지 않는다. 금지면 그 건은 제외된다.
//     자동 대량 질의는 하지 않는다 — 이 도구는 상대 서비스를 호출하지 않는다. 답변은 사람이 넣는다.
//   · 직접 재확인한다 — 유메가 지목한 오류는 'pending'이다. 사람이 원문을 직접 열어 링크를 남기고
//     confirmed로 바꾼 것만 "불일치"로 센다. 하나라도 pending이면 발송할 수 없다.
//   · 공정하게 쓴다 — 잘된 점이 하나도 없으면 발송할 수 없다.
import { quoteSummariesForAudit } from "./b2bDeals.js";
import { all, now, one, run } from "./db.js";
import { randomToken } from "./security.js";
import { buildProbeSet, buildHardSet, focusFromResults, AUDIT_DOMAINS, PROBE_TYPES, explainResult, splitAnswerText } from "./audit/index.js";
import { gradeAnswer } from "./audit/grade.js";
import { checkAnswerKey } from "./audit/keyCheck.js";
import { scoreAudit } from "./audit/score.js";
import { runVerification, MAX_INPUT_CHARS } from "./verifyPipeline.js";
import { newVerificationId } from "./verificationStore.js";
import { QUESTION_TYPES, TOPICS, composition, questionTypeOfProbe, templateItems, topicsFor } from "./auditTemplates.js";
import { parsePhoto } from "./threadFiles.js";
import { COMPANY } from "./renderPages.js";
import { USD_KRW } from "./costGuard.js";
import { logError } from "./errorLog.js";

export const DESK_DOMAINS = [...AUDIT_DOMAINS, "범용"];
export const CATEGORIES = { service: "특정 회사 AI 서비스", general: "범용 AI 서비스" };
// 질문을 보낸 방법. 보고서·메일·체크리스트 문장이 이걸 따른다 — 실제와 다른 방법을 적으면 보고서 전체를 믿지 않는다.
export const INPUT_METHODS = {
  manual: { label: "화면에 직접 입력", report: "일반 사용자로서 서비스 화면에 질문을 직접 입력했습니다", basis: "답변 받은 시점의 화면 기준", mail: (s, n) => `${s} 서비스를 일반 사용자로서 ${n}개 질문으로 사용해 보던 중` },
  // 사람이 로그인한 일반 회원 화면에서, 유메 검토 도구가 질문을 한 건씩 간격을 두고 입력한 경우.
  browser: { label: "화면 입력(검토 도구)", report: "일반 회원으로 로그인한 서비스 화면에 유메 검토 도구로 질문을 한 건씩 간격을 두고 입력했습니다", basis: "답변 받은 시점의 화면 기준", mail: (s, n) => `${s} 서비스 화면에서 ${n}개 질문을 한 건씩 입력해 확인하던 중` },
  api: { label: "공식 API", report: "공개된 공식 API로 질문을 보냈습니다(시스템 프롬프트 없이, 일반 사용자가 묻는 그대로)", basis: "답변 받은 시점의 API 응답 기준", mail: (s, n) => `${s}에 공식 API로 ${n}개 질문을 보내 확인하던 중` },
};
export const methodOf = (audit) => INPUT_METHODS[audit?.input_method] || INPUT_METHODS.manual;
// "…받은 답변을" — 이상 없음 메일처럼 질문한 방법 뒤에 바로 대조 결과가 이어질 때 쓴다.
const ASKED = {
  manual: (s, n) => `${s} 서비스를 일반 사용자로서 ${n}개 질문으로 사용해 받은 답변을`,
  browser: (s, n) => `${s} 서비스 화면에 ${n}개 질문을 한 건씩 입력해 받은 답변을`,
  api: (s, n) => `${s}에 공식 API로 ${n}개 질문을 보내 받은 답변을`,
};

// 단계. 앞으로 갈수록 영업이 진행된 것이다. 끝 단계(terminal)는 결과다.
// 단계를 되돌려도 지난 시각(sent_at 등)은 지우지 않는다 — 숫자는 "한 번이라도 거기까지 갔는가"로 센다.
export const STAGES = {
  prospect: { label: "후보" },
  testing: { label: "검사 중" },
  reviewed: { label: "재확인 완료" },
  sent: { label: "발송" },
  followed_up: { label: "후속 연락" },
  replied: { label: "답장" },
  meeting: { label: "미팅" },
  full_audit: { label: "무료 전체 검사" },
  paid_intent: { label: "유료 의향" },
  won: { label: "계약" },
  declined: { label: "거절", terminal: true },
  no_reply: { label: "무응답", terminal: true },
  excluded: { label: "제외", terminal: true },
};
const STAGE_TIME = {
  followed_up: "followed_up_at",
  replied: "replied_at",
  meeting: "meeting_at",
  full_audit: "full_audit_at",
  paid_intent: "paid_intent_at",
};

export const REVIEWS = {
  pending: "재확인 전",
  confirmed: "원문 확인 — 불일치 맞음",
  excluded: "애매해서 제외",
  yume_wrong: "유메 오판",
};

const DAY = 24 * 3600 * 1000;
export const FOLLOWUP_DAYS = 7;
// 1차(약 26) + 약점 집중 2차(약 15)가 한 감사에 들어간다.
const MAX_ITEMS = 60;
const MAX_ANSWER_CHARS = 20_000;
const MAX_FILES_PER_ITEM = 4;
const CHECK_CONCURRENCY = 2;
const STALE_CHECK_MS = 15 * 60 * 1000;

const str = (v, max) => String(v ?? "").trim().slice(0, max);
const parse = (s) => {
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
};
const isHttpUrl = (u) => /^https?:\/\/[^\s]+$/i.test(String(u || "").trim());

// ── 설정(8주 스프린트 시작일) ─────────────────────────────────────────
export async function getSetting(key) {
  return (await one("SELECT value FROM settings WHERE key = :key", { key }))?.value ?? null;
}
export async function setSetting(key, value) {
  await run(
    "INSERT INTO settings (key, value) VALUES (:key, :value) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
    { key, value: String(value) },
  );
}

// ── 감사 건 ───────────────────────────────────────────────────────────
const EDITABLE = {
  company: 120,
  service_name: 120,
  service_url: 400,
  contact_name: 60,
  contact_role: 60,
  contact_email: 200,
  found_via: 200,
  tos_url: 400,
  tos_note: 2000,
  highlights: 3000,
  mail_subject: 300,
  mail_body: 8000,
  decline_reason: 2000,
  price_heard: 500,
  needs: 2000,
  notes: 8000,
  consent_note: 1000,
};

export async function createAudit(input = {}) {
  const company = str(input.company, 120);
  if (!company) return { error: "회사 이름을 적어주세요." };
  const domain = DESK_DOMAINS.includes(input.domain) ? input.domain : "법률";
  const category = CATEGORIES[input.category] ? input.category : "service";
  const t = now();
  const r = await run(
    `INSERT INTO ai_audits (company, service_name, service_url, domain, category, contact_name, contact_role, contact_email, found_via, created_at, updated_at)
     VALUES (:company, :sn, :su, :domain, :category, :cn, :cr, :ce, :fv, :t, :t) RETURNING id`,
    {
      company,
      sn: str(input.service_name, 120),
      su: str(input.service_url, 400),
      domain,
      category,
      cn: str(input.contact_name, 60),
      cr: str(input.contact_role, 60),
      ce: str(input.contact_email, 200),
      fv: str(input.found_via, 200),
      t,
    },
  );
  return { id: Number(r.rows[0].id) };
}

export async function auditById(id) {
  return one("SELECT * FROM ai_audits WHERE id = :id", { id: Number(id) || 0 });
}

/** 운영자가 고친 칸만 반영한다. 정해진 칸 말고는 받지 않는다. */
export async function updateAudit(id, input = {}) {
  const audit = await auditById(id);
  if (!audit) return { error: "감사 건을 찾을 수 없어요." };
  const sets = [];
  const params = { id: audit.id, t: now() };
  for (const [k, max] of Object.entries(EDITABLE)) {
    if (input[k] === undefined) continue;
    // 메일 제목·본문은 비우면 템플릿으로 돌아간다(null).
    if ((k === "mail_subject" || k === "mail_body") && !String(input[k] ?? "").trim()) {
      sets.push(`${k} = NULL`);
      continue;
    }
    sets.push(`${k} = :${k}`);
    params[k] = str(input[k], max);
  }
  if (input.domain !== undefined && DESK_DOMAINS.includes(input.domain)) {
    sets.push("domain = :domain");
    params.domain = input.domain;
  }
  if (input.category !== undefined && CATEGORIES[input.category]) {
    sets.push("category = :category");
    params.category = input.category;
  }
  if (input.input_method !== undefined && INPUT_METHODS[input.input_method]) {
    sets.push("input_method = :im");
    params.im = input.input_method;
  }
  if (input.minutes_spent !== undefined) {
    sets.push("minutes_spent = :ms");
    params.ms = Math.max(0, Math.min(100_000, Math.floor(Number(input.minutes_spent) || 0)));
  }
  if (input.paid_amount_krw !== undefined) {
    sets.push("paid_amount_krw = :amt");
    const n = Math.floor(Number(input.paid_amount_krw));
    params.amt = Number.isFinite(n) && n > 0 ? Math.min(n, 100_000_000_000) : null;
  }
  if (input.index_excluded !== undefined) {
    sets.push("index_excluded = :ix");
    params.ix = input.index_excluded ? 1 : 0;
  }
  if (input.checklist && typeof input.checklist === "object") {
    const prev = parse(audit.checklist_json) || {};
    const next = { ...prev };
    for (const k of MANUAL_CHECKS) if (input.checklist[k] !== undefined) next[k] = !!input.checklist[k];
    sets.push("checklist_json = :cl");
    params.cl = JSON.stringify(next);
  }
  // 약관 판단. 금지면 그 회사는 제외한다 — 기획안 4-3의 1단계.
  if (input.tos_verdict !== undefined) {
    const v = ["ok", "prohibited", "unclear"].includes(input.tos_verdict) ? input.tos_verdict : null;
    sets.push("tos_verdict = :tv", "tos_checked_at = :tct");
    params.tv = v;
    params.tct = v ? now() : null;
    if (v === "prohibited") {
      sets.push("stage = 'excluded'", "outcome = 'excluded'", "closed_at = :t");
    } else if (v === "ok" && audit.stage === "prospect") {
      sets.push("stage = 'testing'");
    }
  }
  // 회사명 공개 동의. 언제, 무엇에 동의했는지 같이 남긴다.
  if (input.consent_name !== undefined) {
    const on = !!input.consent_name;
    if (on && !str(input.consent_note ?? audit.consent_note, 1000)) {
      return { error: "동의 내용을 적어주세요(누가, 언제, 어떤 경로로 동의했는지)." };
    }
    sets.push("consent_name = :cn", "consent_at = :cat");
    params.cn = on ? 1 : 0;
    params.cat = on ? now() : null;
    // 동의를 거두면 공개 요약도 내린다.
    if (!on) sets.push("public_id = NULL", "public_at = NULL");
  }
  if (!sets.length) return { ok: true };
  sets.push("updated_at = :t");
  await run(`UPDATE ai_audits SET ${sets.join(", ")} WHERE id = :id`, params);
  return { ok: true };
}

export async function deleteAudit(id) {
  const r = await run("DELETE FROM ai_audits WHERE id = :id", { id: Number(id) || 0 });
  return r.changes ? { ok: true } : { error: "감사 건을 찾을 수 없어요." };
}

// ── 단계 이동 ─────────────────────────────────────────────────────────
// 발송(sent)은 여기서 하지 않는다 — 체크리스트를 통과해야 하는 markSent가 유일한 길이다.
export async function setStage(id, stage, extra = {}) {
  const audit = await auditById(id);
  if (!audit) return { error: "감사 건을 찾을 수 없어요." };
  if (!STAGES[stage]) return { error: "알 수 없는 단계예요." };
  if (stage === "sent") return { error: "발송은 체크리스트를 통과한 뒤 '발송 처리'로만 할 수 있어요." };
  const after = ["followed_up", "replied", "meeting", "full_audit", "paid_intent", "won"];
  if (after.includes(stage) && !audit.sent_at) return { error: "아직 보내지 않은 건이에요. 먼저 발송 처리를 해주세요." };
  // 후속 연락은 한 번뿐이다(기획안 4-3의 8단계). 두 번째는 막는다.
  if (stage === "followed_up" && audit.followed_up_at) return { error: "후속 연락은 한 번만 합니다. 이미 보냈어요." };
  // "유료 의향"은 말이 아니라 금액이다(기획안 6-2) — 결제했거나 금액·일정이 적힌 발주 의사.
  const amount = Math.floor(Number(extra.paid_amount_krw ?? audit.paid_amount_krw));
  if ((stage === "paid_intent" || stage === "won") && !(amount > 0)) {
    return { error: "유료 의향은 금액이 있어야 셉니다. 결제했거나 금액·일정이 적힌 의사를 받은 금액을 적어주세요." };
  }
  const t = now();
  const sets = ["stage = :stage", "updated_at = :t"];
  const params = { id: audit.id, stage, t };
  const paid = stage === "paid_intent" || stage === "won";
  if (STAGE_TIME[stage] && !paid) sets.push(`${STAGE_TIME[stage]} = COALESCE(${STAGE_TIME[stage]}, :t)`);
  if (paid) {
    sets.push("paid_amount_krw = :amt", "paid_intent_at = COALESCE(paid_intent_at, :t)");
    params.amt = amount;
  }
  if (stage === "won" || STAGES[stage].terminal) {
    sets.push("closed_at = :t", "outcome = :outcome");
    params.outcome = stage;
  } else {
    sets.push("closed_at = NULL", "outcome = NULL");
  }
  if (stage === "declined" && extra.decline_reason !== undefined) {
    sets.push("decline_reason = :dr");
    params.dr = str(extra.decline_reason, 2000);
  }
  await run(`UPDATE ai_audits SET ${sets.join(", ")} WHERE id = :id`, params);
  return { ok: true };
}

// ── 문항 ──────────────────────────────────────────────────────────────
async function itemsOf(auditId) {
  return all("SELECT * FROM ai_audit_items WHERE audit_id = :id ORDER BY position, id", { id: Number(auditId) });
}

async function insertItems(auditId, list) {
  const existing = await itemsOf(auditId);
  if (existing.length + list.length > MAX_ITEMS) {
    return { error: `질문은 한 감사에 ${MAX_ITEMS}개까지예요. 지금 ${existing.length}개가 있어요.` };
  }
  let pos = existing.reduce((m, i) => Math.max(m, Number(i.position)), 0);
  const t = now();
  for (const it of list) {
    pos += 1;
    await run(
      `INSERT INTO ai_audit_items (audit_id, position, kind, qtype, question, probe_json, created_at, updated_at)
       VALUES (:aid, :pos, :kind, :qtype, :q, :probe, :t, :t)`,
      { aid: Number(auditId), pos, kind: it.kind, qtype: it.qtype || "", q: it.question, probe: it.probe ? JSON.stringify(it.probe) : null, t },
    );
  }
  await run("UPDATE ai_audits SET updated_at = :t WHERE id = :id", { id: Number(auditId), t });
  return { ok: true, added: list.length };
}

/** 법제처 원문으로 정답을 확정한 기준 문항. 범용 AI는 법률 문항으로 낸다. */
export async function addProbeItems(auditId, { size = 8, build = buildProbeSet } = {}) {
  const audit = await auditById(auditId);
  if (!audit) return { error: "감사 건을 찾을 수 없어요." };
  const domain = AUDIT_DOMAINS.includes(audit.domain) ? audit.domain : "법률";
  const n = Math.min(Math.max(Math.floor(Number(size) || 8), 4), 10);
  const probes = await build({ domain, size: n });
  if (!probes.length) return { error: "지금은 기준 문항을 만들 수 없어요. 법제처 조회가 불안정합니다. 잠시 후 다시 시도해주세요." };
  const have = new Set((await itemsOf(auditId)).map((i) => i.question.trim()));
  const fresh = probes.filter((p) => !have.has(String(p.question).trim()));
  return insertItems(
    auditId,
    fresh.map((p) => ({ kind: "probe", qtype: questionTypeOfProbe(p), question: p.question, probe: p })),
  );
}

export async function addTemplateItems(auditId, topic) {
  if (!TOPICS[topic]) return { error: "알 수 없는 주제예요." };
  if (!(await auditById(auditId))) return { error: "감사 건을 찾을 수 없어요." };
  const list = templateItems(topic, (await itemsOf(auditId)).map((i) => i.question));
  if (!list.length) return { ok: true, added: 0 };
  return insertItems(auditId, list);
}

export async function addCustomItem(auditId, { question, qtype } = {}) {
  const q = str(question, 2000);
  if (!q) return { error: "질문을 적어주세요." };
  if (!(await auditById(auditId))) return { error: "감사 건을 찾을 수 없어요." };
  return insertItems(auditId, [{ kind: "custom", qtype: QUESTION_TYPES[qtype] ? qtype : "", question: q }]);
}

async function itemById(itemId) {
  return one("SELECT * FROM ai_audit_items WHERE id = :id", { id: Number(itemId) || 0 });
}

export async function deleteItem(itemId) {
  const r = await run("DELETE FROM ai_audit_items WHERE id = :id", { id: Number(itemId) || 0 });
  return r.changes ? { ok: true } : { error: "질문을 찾을 수 없어요." };
}

/**
 * 답변 기록. answered_at은 운영자가 상대 서비스에서 답을 받은 시각(캡처 시각)이다.
 * 답이 바뀌면 지난 검사·재확인은 더 이상 이 답에 대한 것이 아니므로 지운다.
 */
export async function saveAnswer(itemId, { answer, answered_at } = {}) {
  const item = await itemById(itemId);
  if (!item) return { error: "질문을 찾을 수 없어요." };
  if (item.status === "checking") return { error: "검사 중인 답변은 고칠 수 없어요. 끝난 뒤에 고쳐주세요." };
  const text = String(answer ?? "").slice(0, MAX_ANSWER_CHARS).trim();
  let at = answered_at === undefined || answered_at === null || answered_at === "" ? null : Number(answered_at);
  if (text && !Number.isFinite(at)) at = now();
  if (at && at > now() + 5 * 60 * 1000) return { error: "답변 시각이 미래예요. 상대 서비스에서 답을 받은 시각을 적어주세요." };
  const changed = text !== String(item.answer || "").trim();
  await run(
    `UPDATE ai_audit_items SET answer = :a, answered_at = :at, status = :st, updated_at = :t
       ${changed ? ", grade_json = NULL, verify_json = NULL, verification_id = NULL, error = NULL" : ""}
     WHERE id = :id`,
    {
      id: item.id,
      a: text || null,
      at: text ? at : null,
      st: text ? (changed || item.status === "new" ? "answered" : item.status) : "new",
      t: now(),
    },
  );
  if (changed) await run("DELETE FROM ai_audit_findings WHERE item_id = :id", { id: item.id });
  return { ok: true, changed, audit_id: Number(item.audit_id), hasAnswer: !!text };
}

// ── 캡처 ──────────────────────────────────────────────────────────────
export async function addItemFile(itemId, dataUrl) {
  const item = await itemById(itemId);
  if (!item) return { error: "질문을 찾을 수 없어요." };
  const count = Number((await one("SELECT COUNT(*) AS n FROM ai_audit_files WHERE item_id = :id", { id: item.id })).n);
  if (count >= MAX_FILES_PER_ITEM) return { error: `캡처는 질문마다 ${MAX_FILES_PER_ITEM}장까지예요.` };
  const p = parsePhoto(dataUrl);
  if (p.error) return { error: p.error };
  const r = await run(
    `INSERT INTO ai_audit_files (audit_id, item_id, mime, size, data, created_at) VALUES (:aid, :iid, :mime, :size, :data, :t) RETURNING id`,
    { aid: item.audit_id, iid: item.id, mime: p.mime, size: p.size, data: p.data, t: now() },
  );
  return { ok: true, id: Number(r.rows[0].id) };
}

export async function fileById(fileId) {
  return one("SELECT * FROM ai_audit_files WHERE id = :id", { id: Number(fileId) || 0 });
}

export async function deleteFile(fileId) {
  const r = await run("DELETE FROM ai_audit_files WHERE id = :id", { id: Number(fileId) || 0 });
  return r.changes ? { ok: true } : { error: "캡처를 찾을 수 없어요." };
}

// ── 검사 ──────────────────────────────────────────────────────────────
// 기준 문항은 정답이 정해져 있으므로 채점(gradeAnswer)만 한다. 주제·직접 질문은 정답을 정해 두지
// 않았으므로 답변 속 주장을 유메 검증 파이프라인이 판정한다. 같은 답을 두 번 태우지 않는다.

/** 검증 결과에서 보고서·재확인에 필요한 것만 남긴다(상품 링크 같은 건 버린다). */
function compactVerification(result) {
  const claims = (result?.claims || []).map((c) => ({
    text: c.text,
    quote: c.quote || null,
    verdict: c.verdict,
    verified_via: c.verified_via || null,
    explanation: c.explanation || "",
    uncertain_reason: c.uncertain_reason || null,
    confidence: c.confidence || null,
    counter_fact: c.counter_fact || null,
    evidence: c.evidence?.url ? { url: c.evidence.url, quote: c.evidence.quote || "" } : null,
    sources: (c.sources || []).slice(0, 3).map((s) => ({ url: s.url, title: s.title || "", quote: s.quote || "" })),
    nec: c.nec ? { score: c.nec.score, grade: c.nec.grade } : null,
    domain: c.domain || null,
  }));
  return { claims, overall: result?.overall || null, engine: result?.engine || null };
}

/** 한 문항의 검사 결과 → 재확인 항목(오류 후보 issue, 잘된 점 후보 good). 순수 함수. */
export function buildFindings(item, { grade = null, verify = null } = {}) {
  const out = [];
  const probe = parse(item.probe_json);
  if (probe && grade) {
    const r = { ...probe, ...grade, type: probe.type, question: item.question };
    const ex = explainResult(r);
    // 설명 문장은 문항의 정답 정보(oracle)로 조립된다. 빈 칸이 끼면 "제undefined조" 같은 문장이 상대에게
    // 나간다 — 그럴 바에는 문항을 만들 때 확정한 정답 문장을 그대로 쓴다.
    const clean = (t) => (t && !/undefined|null|NaN/.test(t) ? t : "");
    const truth = [clean(ex.fact), clean(ex.original)].filter(Boolean).join(" — ") || String(probe.groundTruth || "");
    const base = {
      source: "probe",
      claim_index: null,
      claim: item.question,
      ai_quote: grade.evidence || grade.aiClaim || "",
      yume_reason: grade.reason || "",
      truth: truth.slice(0, 2000),
      source_url: ex.source?.url || "",
      source_label: ex.source?.label || "",
      nec_score: null,
    };
    if (grade.outcome === "hallucinated" || grade.outcome === "partial") out.push({ ...base, polarity: "issue", severity: grade.outcome });
    else if (grade.outcome === "safe") out.push({ ...base, polarity: "good", severity: "safe" });
  }
  (verify?.claims || []).forEach((c, i) => {
    const src = c.evidence?.url ? { url: c.evidence.url, title: "", quote: c.evidence.quote } : c.sources?.[0] || null;
    const base = {
      source: "claim",
      claim_index: i,
      claim: c.text || "",
      ai_quote: c.quote || c.text || "",
      yume_reason: c.explanation || "",
      truth: String(c.counter_fact || src?.quote || "").slice(0, 2000),
      source_url: src?.url || "",
      source_label: src?.title || (c.verified_via === "official" ? "법제처 국가법령정보센터" : ""),
      nec_score: c.nec?.score ?? null,
    };
    if (c.verdict === "false") out.push({ ...base, polarity: "issue", severity: c.verified_via === "nec" ? "nonexistent" : "false" });
    // 잘된 점 후보는 공식 원문으로 확인됐거나 근거 잠금을 통과한(confidence high) 것만.
    else if (c.verdict === "confirmed" && (c.verified_via === "official" || c.confidence === "high")) {
      out.push({ ...base, polarity: "good", severity: "confirmed" });
    }
  });
  return out;
}

async function replaceFindings(item, list) {
  await run("DELETE FROM ai_audit_findings WHERE item_id = :id", { id: item.id });
  const t = now();
  for (const f of list) {
    await run(
      `INSERT INTO ai_audit_findings (audit_id, item_id, source, claim_index, polarity, severity, claim, ai_quote, yume_reason, truth, source_url, source_label, nec_score, created_at)
       VALUES (:aid, :iid, :src, :ci, :pol, :sev, :claim, :aq, :yr, :truth, :su, :sl, :nec, :t)`,
      {
        aid: item.audit_id,
        iid: item.id,
        src: f.source,
        ci: f.claim_index,
        pol: f.polarity,
        sev: f.severity,
        claim: str(f.claim, 2000),
        aq: str(f.ai_quote, 2000),
        yr: str(f.yume_reason, 2000),
        truth: str(f.truth, 2000),
        su: isHttpUrl(f.source_url) ? str(f.source_url, 800) : "",
        sl: str(f.source_label, 200),
        nec: Number.isFinite(Number(f.nec_score)) && f.nec_score !== null ? Number(f.nec_score) : null,
        t,
      },
    );
  }
}

/** 한 문항을 검사한다. deps는 시험에서 Claude 대신 넣는 자리다. */
export async function checkItem(item, deps = {}) {
  const grade = deps.grade || gradeAnswer;
  // 정답 기준 재확인(audit/keyCheck.js) — 법제처 키가 있을 때만 기본으로 돈다(시험은 네트워크 없이).
  const keyCheck = deps.keyCheck || (process.env.LAW_OC ? checkAnswerKey : null);
  const verify = deps.verify || runVerification;
  const probe = parse(item.probe_json);
  const answer = String(item.answer || "");
  try {
    if (probe) {
      // 기준 조문이 효력을 잃었거나 바뀌었으면 채점하지 않는다 — 흔들리는 기준으로 상대를 판정하지 않는다.
      const key = keyCheck ? await keyCheck(probe).catch(() => ({ valid: true })) : { valid: true };
      const g = key.valid
        ? await grade(probe, answer.slice(0, 8000))
        : { outcome: "ungraded", keyInvalid: true, evidence: "", aiClaim: "", reason: `기준 무효 — ${key.reason} 이 문항은 오류로도 정확으로도 세지 않습니다.` };
      const failed = g.outcome === "ungraded" && /채점에 실패/.test(g.reason || "");
      await run(
        `UPDATE ai_audit_items SET grade_json = :g, status = :st, error = :err, updated_at = :t WHERE id = :id`,
        { id: item.id, g: JSON.stringify(g), st: failed ? "failed" : "checked", err: failed ? g.reason : null, t: now() },
      );
      await replaceFindings(item, failed ? [] : buildFindings(item, { grade: g }));
      return { ok: !failed };
    }
    const vid = newVerificationId();
    const r = await verify({ id: vid, text: answer.slice(0, MAX_INPUT_CHARS), source: "audit" });
    const v = compactVerification(r?.result);
    await run(
      `UPDATE ai_audit_items SET verify_json = :v, verification_id = :vid, status = 'checked', error = NULL, updated_at = :t WHERE id = :id`,
      { id: item.id, v: JSON.stringify(v), vid, t: now() },
    );
    await replaceFindings(item, buildFindings(item, { verify: v }));
    return { ok: true };
  } catch (e) {
    logError("auditDesk:check", e);
    await run("UPDATE ai_audit_items SET status = 'failed', error = :err, updated_at = :t WHERE id = :id", {
      id: item.id,
      err: String(e?.message || e).slice(0, 500),
      t: now(),
    }).catch(() => {});
    return { ok: false, error: e?.message };
  }
}

// 감사마다 한 줄만 돈다. 같은 버튼을 두 번 눌러도 같은 답을 두 번 태우지 않는다.
const running = new Map();

export function isChecking(auditId) {
  return running.has(Number(auditId));
}

/** 답이 있고 아직 검사하지 않은(또는 실패한·멈춘) 문항을 뒤에서 검사한다. 끝날 때까지 기다리지 않는다. */
export async function startChecks(auditId, deps = {}) {
  const audit = await auditById(auditId);
  if (!audit) return { error: "감사 건을 찾을 수 없어요." };
  if (audit.tos_verdict !== "ok") {
    return { error: "약관 확인이 먼저예요. 자동화·평가 목적 사용 금지 조항이 없다는 걸 확인하고 '문제없음'으로 적어주세요." };
  }
  const id = Number(audit.id);
  if (running.has(id)) return { ok: true, already: true, queued: 0 };
  const t = now();
  const todo = await all(
    `SELECT * FROM ai_audit_items
      WHERE audit_id = :id AND answer IS NOT NULL AND answer <> ''
        AND (status IN ('answered', 'failed') OR (status = 'checking' AND (check_started_at IS NULL OR check_started_at < :stale)))
      ORDER BY position, id`,
    { id, stale: t - STALE_CHECK_MS },
  );
  if (!todo.length) return { ok: true, queued: 0 };
  for (const it of todo) {
    await run("UPDATE ai_audit_items SET status = 'checking', check_started_at = :t, error = NULL WHERE id = :id", { id: it.id, t });
  }
  if (audit.stage === "prospect") await run("UPDATE ai_audits SET stage = 'testing', updated_at = :t WHERE id = :id", { id, t });
  const job = (async () => {
    // 검사가 도는 동안에도 운영자는 다음 답을 저장한다. 한 묶음이 끝나면 그사이 새로 저장된 답을
    // 다시 집어 이어서 돈다 — "검사 실행"을 다시 누르지 않아도 입력이 끝나면 결과가 거의 다 나와 있다.
    let batch = todo;
    while (batch.length) {
      let next = 0;
      const list = batch;
      const worker = async () => {
        while (next < list.length) {
          const it = list[next++];
          await checkItem(it, deps);
        }
      };
      await Promise.all(Array.from({ length: Math.min(CHECK_CONCURRENCY, list.length) }, worker));
      batch = await all(
        `SELECT * FROM ai_audit_items WHERE audit_id = :id AND status = 'answered' AND answer IS NOT NULL AND answer <> '' ORDER BY position, id`,
        { id },
      );
      const at = now();
      for (const it of batch) {
        await run("UPDATE ai_audit_items SET status = 'checking', check_started_at = :t, error = NULL WHERE id = :id", { id: it.id, t: at });
      }
    }
    await syncReviewedStage(id);
  })()
    .catch((e) => logError("auditDesk:run", e))
    .finally(() => running.delete(id));
  running.set(id, job);
  return { ok: true, queued: todo.length, done: job };
}

// 재확인이 끝나면 '검사 중' → '재확인 완료'로 올린다. 더 진행된 단계는 건드리지 않는다.
async function syncReviewedStage(auditId) {
  const audit = await auditById(auditId);
  if (!audit || !["prospect", "testing", "reviewed"].includes(audit.stage)) return;
  const detailItems = await itemsOf(auditId);
  const findings = await all("SELECT * FROM ai_audit_findings WHERE audit_id = :id", { id: Number(auditId) });
  const r = auditResults(detailItems, findings);
  const stage = r.reviewComplete ? "reviewed" : audit.tos_verdict === "ok" ? "testing" : audit.stage;
  if (stage !== audit.stage) await run("UPDATE ai_audits SET stage = :s, updated_at = :t WHERE id = :id", { id: audit.id, s: stage, t: now() });
  // 재확인이 막 끝났는데 대표 사례를 아직 하나도 안 골랐으면 골라 둔다(운영자가 바꿀 수 있다).
  // 오류가 없는 감사는 잘한 점만 고르게 되는데, 그때 운영자가 고른 잘한 점을 다음 저장 때마다
  // 덮어쓰지 않도록 — 무엇이든 하나라도 골라져 있으면 손대지 않는다.
  if (r.reviewComplete && !findings.some((f) => Number(f.featured) && (f.polarity === "good" || f.review === "confirmed"))) {
    await autoPick(auditId).catch((e) => logError("auditDesk:autopick", e));
  }
}

// ── 재확인 ────────────────────────────────────────────────────────────
export async function reviewFinding(findingId, input = {}) {
  const f = await one("SELECT * FROM ai_audit_findings WHERE id = :id", { id: Number(findingId) || 0 });
  if (!f) return { error: "재확인 항목을 찾을 수 없어요." };
  const sets = [];
  const params = { id: f.id, t: now() };
  if (input.review !== undefined) {
    if (!REVIEWS[input.review]) return { error: "알 수 없는 재확인 결과예요." };
    if (f.polarity === "issue" && input.review === "confirmed") {
      // 직접 열어 본 원문 링크가 없으면 "직접 재확인"이 아니다.
      const url = str(input.checked_url ?? f.checked_url, 800);
      if (!isHttpUrl(url)) return { error: "직접 열어 확인한 공식 원문 링크를 적어주세요." };
    }
    sets.push("review = :rv", "reviewed_at = :rat");
    params.rv = input.review;
    params.rat = input.review === "pending" ? null : now();
    // 오류로 확정되지 않은 건 보고서 대표 사례·지수 사례가 될 수 없다.
    if (f.polarity === "issue" && input.review !== "confirmed") sets.push("featured = 0", "in_index = 0");
  }
  if (input.checked_url !== undefined) {
    const url = str(input.checked_url, 800);
    if (url && !isHttpUrl(url)) return { error: "링크는 http(s)로 시작해야 해요." };
    sets.push("checked_url = :cu");
    params.cu = url;
  }
  if (input.review_note !== undefined) {
    sets.push("review_note = :rn");
    params.rn = str(input.review_note, 2000);
  }
  if (input.report_title !== undefined) {
    sets.push("report_title = :rt");
    params.rt = str(input.report_title, 200) || null;
  }
  const review = input.review ?? f.review;
  const usable = f.polarity === "good" ? review !== "excluded" && review !== "yume_wrong" : review === "confirmed";
  if (input.featured !== undefined) {
    if (input.featured && !usable) return { error: "원문으로 확인된 항목만 보고서 사례로 쓸 수 있어요." };
    sets.push("featured = :ft");
    params.ft = input.featured ? 1 : 0;
  }
  if (input.in_index !== undefined) {
    if (input.in_index && !(f.polarity === "issue" && review === "confirmed")) {
      return { error: "지수 사례는 원문으로 확인된 오류만 쓸 수 있어요." };
    }
    sets.push("in_index = :ii");
    params.ii = input.in_index ? 1 : 0;
  }
  if (!sets.length) return { ok: true };
  await run(`UPDATE ai_audit_findings SET ${sets.join(", ")} WHERE id = :id`, params);
  await syncReviewedStage(f.audit_id);
  return { ok: true };
}

// ── 결과 계산(순수) ───────────────────────────────────────────────────
/** 기준 문항의 재확인 반영 결과. 유메 오판이면 정상, 애매해서 뺐으면 채점 불가. */
export function itemOutcome(item, findings) {
  const g = parse(item.grade_json);
  if (!g) return null;
  if (g.outcome !== "hallucinated" && g.outcome !== "partial") return g.outcome;
  const f = findings.find((x) => Number(x.item_id) === Number(item.id) && x.source === "probe" && x.polarity === "issue");
  if (!f) return g.outcome;
  if (f.review === "yume_wrong") return "safe";
  if (f.review === "excluded") return "ungraded";
  return g.outcome;
}

/** 주장 하나의 재확인 반영 판정: match | mismatch | unverifiable | pending. */
export function claimOutcome(item, index, claim, findings) {
  if (claim.verdict === "confirmed") return "match";
  if (claim.verdict !== "false") return "unverifiable";
  const f = findings.find(
    (x) => Number(x.item_id) === Number(item.id) && x.source === "claim" && Number(x.claim_index) === Number(index) && x.polarity === "issue",
  );
  const r = f?.review || "pending";
  if (r === "confirmed") return "mismatch";
  if (r === "yume_wrong") return "match";
  if (r === "excluded") return "unverifiable";
  return "pending";
}

export function auditResults(items, findings) {
  const answered = items.filter((i) => String(i.answer || "").trim());
  const checked = answered.filter((i) => i.status === "checked");
  const probeResults = [];
  for (const it of checked) {
    const p = parse(it.probe_json);
    const g = parse(it.grade_json);
    if (!p || !g) continue;
    probeResults.push({ probeId: p.id, type: p.type, weight: p.weight ?? 1, outcome: itemOutcome(it, findings), evidence: g.evidence || "", question: it.question });
  }
  const claims = { total: 0, match: 0, mismatch: 0, unverifiable: 0, pending: 0 };
  for (const it of checked) {
    const v = parse(it.verify_json);
    (v?.claims || []).forEach((c, i) => {
      claims.total += 1;
      claims[claimOutcome(it, i, c, findings)] += 1;
    });
  }
  const decided = claims.match + claims.mismatch;
  claims.mismatchRate = decided ? Math.round((claims.mismatch / decided) * 1000) / 1000 : null;
  const issues = findings.filter((f) => f.polarity === "issue");
  const tally = (r) => issues.filter((f) => f.review === r).length;
  const issueCounts = { total: issues.length, pending: tally("pending"), confirmed: tally("confirmed"), excluded: tally("excluded"), yume_wrong: tally("yume_wrong") };
  const times = answered.map((i) => Number(i.answered_at)).filter((n) => n > 0);
  const unchecked = answered.length - checked.length;
  const probe = probeResults.length ? scoreAudit(probeResults) : null;
  return {
    questions: items.length,
    answered: answered.length,
    checked: checked.length,
    unchecked,
    probe,
    probeResults,
    claims,
    issues: issueCounts,
    goods: findings.filter((f) => f.polarity === "good").length,
    // 답이 하나도 없으면 끝난 게 아니다. 검사하지 않은 답이 있거나 재확인이 남았어도 끝난 게 아니다.
    reviewComplete: answered.length > 0 && unchecked === 0 && issueCounts.pending === 0,
    period: times.length ? { from: Math.min(...times), to: Math.max(...times) } : null,
  };
}

// ── 문구 점검(기획안 5장·부록 D) ──────────────────────────────────────
// 첫 메일과 보고서에 들어가면 안 되는 말. 걸리면 무엇이 왜 걸렸는지 그대로 보여 준다.
const LINT_RULES = [
  { re: /\d[\d,.]*\s*(만|천|억)?\s*원(?!문|본|칙|래|인|리|자|어|형)/, why: "금액이 들어 있어요 — 첫 메일에는 가격을 넣지 않습니다." },
  { re: /가격|요금|견적|할인|비용을/, why: "가격 이야기가 들어 있어요 — 첫 메일에는 가격을 넣지 않습니다." },
  { re: /기한|마감|까지\s*(회신|답장|연락)|빠른\s*회신|이번\s*주\s*(안|내)/, why: "기한을 주는 문장이 있어요 — 재촉으로 읽힙니다." },
  { re: /공개(하|할|될)\s*(수|예정|것|겠)|언론|기사화|제보하겠|신고하겠/, why: "공개·신고를 암시하는 문장이 있어요 — 압박으로 읽힐 수 있습니다." },
  { re: /계약하지\s*않으면|도입하지\s*않으면|안\s*하시면/, why: "조건을 거는 문장이 있어요 — 압박으로 읽힐 수 있습니다." },
  { re: /보증|100\s*%|백\s*퍼센트|완벽|AI\s*없이|인공지능\s*없이/, why: "'보증'·'100%'·'AI 없이' 같은 표현이 있어요 — 유메는 검사 결과를 말하지 보증하지 않습니다." },
  { re: /인증(을|받|된|기관|마크|서)/, why: "'인증'은 국가 인증처럼 읽힐 수 있어요 — '검사 결과'로 쓰세요." },
  { re: /거짓말|엉터리|형편없|심각한\s*수준/, why: "단정적인 평가가 있어요 — '이런 유형이 이 빈도로 보였다'로 씁니다." },
];

export function lintCopy(text) {
  const s = String(text || "");
  const out = [];
  for (const r of LINT_RULES) {
    const m = r.re.exec(s);
    if (m) out.push({ match: m[0], why: r.why });
  }
  return out;
}

// 대표 메일함으로 보내지 않는다(기획안 4-3의 7단계). 개인 주소인지 앞부분으로 거른다.
const GENERIC_LOCAL = /^(info|contact|contactus|help|support|admin|cs|hello|hi|sales|marketing|biz|business|ask|service|webmaster|office|team|official|master|privacy|partner|partners|partnership|press|pr|hr|recruit|jobs|career|careers|noreply|no-reply|mail|inquiry|qna)$/i;

export function isPersonalEmail(email) {
  const m = /^([^@\s]+)@([^@\s]+\.[^@\s]+)$/.exec(String(email || "").trim());
  return !!m && !GENERIC_LOCAL.test(m[1]);
}

const DOMAIN_PHRASE = {
  법률: "법령 인용",
  인사: "노무 관련 법령 인용",
  공공: "행정 법령 안내",
  의료: "의료 관련 법령 안내",
  금융: "금융 관련 법령·수치 안내",
  커머스: "소비자 관련 법령 안내",
  제조: "관련 법령 안내",
  범용: "사실 관계와 인용",
};
export const domainPhrase = (d) => DOMAIN_PHRASE[d] || "법령 인용";

// 비공개 고지 문장. 메일에서 이 두 마디가 빠지면 체크리스트가 막는다.
export const NONDISCLOSURE = "이 결과는 외부에 공개하지 않았으며 앞으로도 공개할 계획이 없습니다.";
const hasNondisclosure = (s) => /공개하지\s*않았/.test(s) && /공개할\s*계획이\s*없/.test(s);

const SITE = "www.yume-reamer.com";

/** 부록 C의 메일 네 통. C-1은 운영자가 고친 제목·본문이 있으면 그것을 쓴다. */
// issues: 원문으로 확정한 오류 수, wrongAnswers: 그 오류가 들어 있던 답변 수, examples: 대표 사례 한 줄 제목(최대 3).
// 숫자와 사례를 메일 본문에 바로 쓴다 — "일부가 다르다"로는 열어 볼 이유가 생기지 않는다.
// clean: 재확인을 마쳤는데 확정된 오류가 없는 감사 — "이상 없음" 결과를 알리고 공개 감사 기록(배지)을 권한다.
// goodExamples: 그때 메일에 넣을 잘한 점 한 줄(검토자가 쓴 제목).
export function mailDrafts(audit, results, { reportUrl = "", issues = 0, wrongAnswers = 0, examples = [], clean = false, goodExamples = [] } = {}) {
  const who = audit.contact_name ? `${audit.contact_name}님` : "담당자님";
  const service = audit.service_name || audit.company;
  const phrase = domainPhrase(audit.domain);
  const n = results?.answered || 0;
  const sign = `${COMPANY.ceo} 드림 · 유메 (${SITE})`;
  // 제목은 짧고 한 번에 읽히게(2026-10-13 대표: "제목이 너무 길다, 임팩트 있게 컴팩트하게"). 휴대폰 받은편지함에서
  // 잘리지 않는 길이 — 브랜드 이름 + 숫자 하나 + 근거. 법인명((주)…)이면 서비스 이름의 첫 낱말을 브랜드로 쓴다.
  const brand = /\(주\)|주식회사|㈜/.test(audit.company || "") ? String(service).split(/\s+/)[0] : audit.company || String(service).split(/\s+/)[0];
  const subject = issues
    ? `[비공개] ${brand} AI 오답 ${issues}건 — 법령 원문 대조`
    : clean
      ? `[비공개] ${brand} AI 답변 ${n}개, 법령과 다른 내용 없음`
      : `[비공개] ${brand} AI 답변 확인 결과`;
  // 본문은 짧게 — 결과 한 문장과 보고서 링크만. 사례를 본문에 다 풀면 보고서를 열 이유가 없어진다
  // (2026-10-13 대표: "보고서 내용을 다 말로 해버리면 의미가 없잖아"). 사례·원문은 보고서에만 둔다.
  const finding = issues
    ? `${wrongAnswers}개 답변에서 법령 원문과 다른 내용을 확인했습니다.`
    : clean
      ? `답변을 법령·판례 원문과 하나씩 대조했고, 원문과 다른 내용은 확인되지 않아 결과를 공유드립니다.`
      : `${phrase} 일부가 원문과 다른 것을 확인해 비공개로 공유드립니다.`;
  const body = [
    // 대표가 정한 첫 문장(2026-10-13). 담당자 이름을 알면 이름을 넣는다.
    `안녕하세요${audit.contact_name ? `, ${audit.contact_name}님` : ""}. AI 할루시네이션 감지 서비스 유메를 운영하는 ${COMPANY.ceo}입니다.`,
    "",
    clean
      ? `${(ASKED[audit.input_method] || ASKED.manual)(service, n)} 법령·판례 원문과 하나씩 대조했습니다. 원문과 다른 내용은 확인되지 않아 결과를 공유드립니다.`
      : `${methodOf(audit).mail(service, n)}, ${finding}`,
    ...(clean && goodExamples.length ? ["", "특히 이런 질문을 정확하게 처리했습니다.", ...goodExamples.slice(0, 3).map((e) => `- ${e}`)] : []),
    "",
    clean
      ? "질문별 답변과 대조한 원문, 판정 기준을 감사 보고서로 정리했습니다."
      : "어떤 질문에서 어떻게 달랐는지는 법령 원문과 함께 보고서에 정리했습니다. 질문 원문과 받은 시각이 있어 직접 확인해 보실 수 있습니다.",
    reportUrl ? `감사 보고서: ${reportUrl}` : "",
    "",
    NONDISCLOSURE,
    "",
    clean
      ? "원하시면 이 결과를 'YUME 감사 기록'으로 공개해, 고객이나 투자자에게 답변 정확도의 근거로 보여 주실 수 있습니다(홈페이지에 붙이는 배지 포함). 공개는 귀사가 동의하실 때만 합니다. 필요 없으시면 이 메일은 편하게 넘기셔도 됩니다."
      : "필요하시면 범위를 넓혀 한 번 더 무료로 검사해 드리겠습니다. 필요 없으시면 편하게 넘기셔도 됩니다.",
    "",
    "감사합니다.",
    sign,
  ]
    .filter((l, i, a) => !(l === "" && a[i - 1] === ""))
    .join("\n");
  return {
    first: { subject: audit.mail_subject || subject, body: audit.mail_body || body, edited: !!(audit.mail_subject || audit.mail_body), defaultSubject: subject, defaultBody: body },
    followup: {
      subject: `Re: ${subject}`,
      body: `${who}, 지난주 보내드린 보고서가 잘 전달되었는지 확인차 연락드립니다. 사례 중 확인이 필요하신 부분이 있으면 원문과 함께 설명드리겠습니다. 이후로는 따로 연락드리지 않겠습니다.\n\n${COMPANY.ceo} 드림`,
    },
    interested: {
      subject: `Re: ${subject}`,
      body: "답장 감사합니다. 15~20분 정도 통화가 가능하실까요? 귀사 서비스에서 가장 신경 쓰이는 오류 유형을 들으면, 그 범위로 무료 검사를 설계해 보겠습니다. 편하신 시간 두세 개만 알려주세요.",
    },
    callQuestions: [
      "지금 답변 정확도를 어떻게 확인하고 계세요?",
      "오류가 나서 실제로 문제가 된 적이 있나요?",
      "기업 고객이나 투자자가 정확도 증빙을 요구한 적이 있나요?",
      "검사 결과와 '검사 완료' 배지를 받는다면 어디에 쓰시겠어요?",
      "이런 검사에 예산을 쓴다면 어느 정도가 적당하다고 보세요?",
      "결정은 누가 하나요?",
    ],
  };
}

// ── 발송 전 체크리스트(부록 D-1) ──────────────────────────────────────
// 자동으로 볼 수 있는 건 자동으로 본다. 사람이 아니면 알 수 없는 것(손으로 입력했는가, 애매한 걸
// 다 뺐는가, 받는 사람이 담당자 개인인가)만 운영자가 체크한다.
export const MANUAL_CHECKS = ["manual_input", "ambiguous_removed", "recipient_person"];

export function checklist(audit, items, findings, files, mail) {
  const manual = parse(audit.checklist_json) || {};
  const res = auditResults(items, findings);
  const answered = items.filter((i) => String(i.answer || "").trim());
  const issues = findings.filter((f) => f.polarity === "issue");
  const confirmed = issues.filter((f) => f.review === "confirmed");
  const featured = confirmed.filter((f) => Number(f.featured));
  const filesByItem = new Set(files.map((f) => Number(f.item_id)));
  const copy = `${mail.first.subject}\n${mail.first.body}\n${audit.highlights || ""}`;
  const lint = lintCopy(copy);
  const pressure = lint.filter((l) => !/보증|인증|단정/.test(l.why));
  const overclaim = lint.filter((l) => /보증|인증|단정/.test(l.why));
  const goodsFeatured = findings.filter((f) => f.polarity === "good" && Number(f.featured)).length;
  const list = [
    {
      key: "tos",
      label: "이용약관에 자동화·벤치마크 금지 조항이 없음을 확인했다",
      ok: audit.tos_verdict === "ok",
      detail: audit.tos_verdict === "ok" ? "약관 확인: 문제없음" : "개요 탭에서 약관을 확인해 '문제없음'으로 적어주세요.",
    },
    {
      key: "manual_input",
      label:
        {
          api: "질문은 공식 API로 보냈고(대량 자동 질의 아님), 답변마다 받은 날짜·시간이 있다",
          browser: "질문은 일반 회원 화면에 한 건씩 간격을 두고 입력했고(대량 자동 질의 아님), 답변마다 받은 날짜·시간이 있다",
        }[audit.input_method] || "질문은 직접 손으로 입력했고, 답변마다 받은 날짜·시간이 있다",
      ok: !!manual.manual_input && answered.length > 0 && answered.every((i) => Number(i.answered_at) > 0),
      manual: true,
      detail: answered.length ? `답변 ${answered.length}개 · 시각 기록 ${answered.filter((i) => Number(i.answered_at) > 0).length}개` : "답변이 아직 없어요.",
    },
    {
      key: "evidence",
      label: "보낼 근거가 있다 — 원문으로 확인된 불일치가 하나 이상, 대표 사례에는 캡처가 있다",
      ok: (confirmed.length > 0 && featured.length > 0 && (!needsCapture(audit) || featured.every((f) => filesByItem.has(Number(f.item_id))))) || (!confirmed.length && answered.length > 0 && !findings.some((f) => f.polarity === "issue" && f.review === "pending")),
      detail: !confirmed.length
        ? answered.length && !findings.some((f) => f.polarity === "issue" && f.review === "pending")
          ? "확인된 불일치 없음 — '이상 없음' 결과로 보냅니다(공개 감사 기록을 권하는 메일)."
          : "재확인을 마치면 결과에 맞는 메일을 씁니다."
        : !featured.length
          ? "보고서에 실을 대표 사례(가장 확실한 것 2~3건)를 골라주세요."
          : !needsCapture(audit)
            ? `대표 사례 ${featured.length}건 · 공식 API 응답이 기록입니다`
            : featured.every((f) => filesByItem.has(Number(f.item_id)))
            ? `대표 사례 ${featured.length}건 · 캡처 있음`
            : "대표 사례로 고른 질문에 캡처를 올려주세요.",
    },
    {
      key: "reverified",
      label: "모든 오류 사례를 공식 원문으로 직접 재확인했다",
      ok: res.reviewComplete && confirmed.every((f) => isHttpUrl(f.checked_url)),
      detail: res.unchecked
        ? `검사하지 않은 답변 ${res.unchecked}개가 있어요.`
        : res.issues.pending
          ? `재확인이 남은 항목 ${res.issues.pending}개`
          : `확인 ${res.issues.confirmed} · 제외 ${res.issues.excluded} · 유메 오판 ${res.issues.yume_wrong}`,
    },
    {
      key: "ambiguous_removed",
      label: "애매한 사례는 모두 뺐다",
      ok: !!manual.ambiguous_removed && res.issues.pending === 0,
      manual: true,
      detail: "조금이라도 해석이 갈리는 항목은 '애매해서 제외'로 두세요. 틀린 지적 하나가 전체 신뢰를 무너뜨립니다.",
    },
    {
      key: "positives",
      label: "잘된 점을 적었다",
      ok: goodsFeatured > 0 || String(audit.highlights || "").trim().length >= 10,
      detail: goodsFeatured ? `잘된 점 ${goodsFeatured}건 선택` : "정확하게 인용한 사례를 고르거나 잘된 점을 직접 적어주세요.",
    },
    {
      key: "nondisclosure",
      label: "'공개하지 않았고 공개할 계획 없음' 문장이 있다",
      ok: hasNondisclosure(mail.first.body),
      detail: hasNondisclosure(mail.first.body) ? "메일 본문에 있음" : `메일 본문에 이 문장을 넣어주세요: ${NONDISCLOSURE}`,
    },
    {
      key: "no_pressure",
      label: "가격, 기한, 압박으로 읽힐 문장이 없다",
      ok: pressure.length === 0,
      detail: pressure.length ? pressure.map((p) => `“${p.match}” — ${p.why}`).join(" / ") : "걸린 문장 없음",
    },
    {
      key: "no_overclaim",
      label: "'보증', '100%', 'AI 없이' 같은 표현이 없다",
      ok: overclaim.length === 0,
      detail: overclaim.length ? overclaim.map((p) => `“${p.match}” — ${p.why}`).join(" / ") : "걸린 표현 없음",
    },
    {
      key: "recipient_person",
      label: "받는 사람이 담당자 개인이다",
      ok: !!manual.recipient_person && isPersonalEmail(audit.contact_email),
      manual: true,
      detail: !audit.contact_email
        ? "담당자 이메일을 적어주세요."
        : isPersonalEmail(audit.contact_email)
          ? `${audit.contact_email}`
          : `${audit.contact_email}는 대표 메일함으로 보여요. 담당자 개인 주소를 찾아주세요.`,
    },
  ];
  return { items: list, passed: list.every((c) => c.ok), lint };
}

// ── 상세 ──────────────────────────────────────────────────────────────
export function reportPath(token) {
  return `/audit/p/${token}`;
}
export function publicPath(publicId) {
  return `/a/${publicId}`;
}

export async function auditDetail(id, { base = "" } = {}) {
  const audit = await auditById(id);
  if (!audit) return null;
  const items = await itemsOf(audit.id);
  const findings = await all("SELECT * FROM ai_audit_findings WHERE audit_id = :id ORDER BY item_id, id", { id: audit.id });
  const files = await all("SELECT id, item_id, mime, size, created_at FROM ai_audit_files WHERE audit_id = :id ORDER BY id", { id: audit.id });
  const results = auditResults(items, findings);
  const byItem = new Map(items.map((i) => [Number(i.id), i]));
  for (const f of findings) f.strength = findingStrength(f, byItem.get(Number(f.item_id)));
  const reportUrl = audit.report_token ? `${base}${reportPath(audit.report_token)}` : "";
  // 메일에 넣을 대표 사례 — 검토자가 쓴 한 줄 제목만(자동 제목은 문장이 길다). 금액이 든 제목은 발송 문구 점검에 걸리니 뺀다.
  const confirmedIssues = findings.filter((f) => f.polarity === "issue" && f.review === "confirmed");
  const examples = confirmedIssues
    .filter((f) => Number(f.featured) && String(f.report_title || "").trim())
    .map((f) => String(f.report_title).trim())
    .filter((t) => !lintCopy(t).length);
  const goodExamples = findings
    .filter((f) => f.polarity === "good" && Number(f.featured) && String(f.report_title || "").trim())
    .map((f) => String(f.report_title).trim())
    .filter((t) => !lintCopy(t).length);
  const mail = mailDrafts(audit, results, {
    reportUrl,
    issues: confirmedIssues.length,
    wrongAnswers: new Set(confirmedIssues.map((f) => Number(f.item_id))).size,
    examples,
    clean: !!results.reviewComplete && !confirmedIssues.length && results.answered > 0,
    goodExamples,
  });
  const costRow = await one(
    `SELECT COALESCE(SUM(v.cost_usd), 0) AS usd, COUNT(v.id) AS n FROM ai_audit_items i JOIN verifications v ON v.id = i.verification_id WHERE i.audit_id = :id`,
    { id: audit.id },
  );
  // 이 감사에서 이어진 견적(데스크에서 발행). 보고서의 "다음 단계"와 데스크 10단계가 같은 목록을 본다.
  const quotes = await quoteSummariesForAudit(audit.id, base).catch(() => []);
  return {
    audit,
    items,
    findings,
    files,
    results,
    mail,
    quotes,
    checklist: checklist(audit, items, findings, files, mail),
    composition: composition(items),
    topics: topicsFor(audit.domain).map((k) => ({ key: k, label: TOPICS[k].label, count: TOPICS[k].questions.length })),
    checking: isChecking(audit.id),
    cost: { usd: Number(costRow?.usd || 0), krw: Math.round(Number(costRow?.usd || 0) * USD_KRW), verifications: Number(costRow?.n || 0) },
    reportUrl,
    publicUrl: audit.public_id ? `${base}${publicPath(audit.public_id)}` : "",
  };
}

// 다음에 할 일 한 줄. 목록에서 "누구 차례인가"를 바로 보이게 한다.
export function nextAction(audit, counts, at = now()) {
  if (STAGES[audit.stage]?.terminal || audit.stage === "won") return null;
  if (!audit.tos_verdict) return "약관 확인";
  if (audit.tos_verdict === "unclear") return "약관 판단 보류 — 다시 확인";
  if (!audit.sent_at) {
    if (!counts.items) return "질문 세트 만들기";
    if (counts.unchecked) return "검사 실행";
    if (counts.pending) return `재확인 ${counts.pending}건`;
    // 답이 있는 건 다 검사·재확인했는데 빈 질문이 남았다 — 더 묻거나 지우면 된다(빈 질문은 결과에 들어가지 않는다).
    if (counts.answered < counts.items) {
      return counts.answered ? `보고서·발송 (빈 질문 ${counts.items - counts.answered}개는 답하거나 삭제)` : `답변 기록 (0/${counts.items})`;
    }
    return "보고서·체크리스트 → 발송";
  }
  if (!audit.replied_at && !audit.followed_up_at && Number(audit.followup_due_at) <= at) return "후속 연락 1회 (오늘)";
  if (!audit.replied_at && !audit.followed_up_at) return `답장 대기 · 후속 ${new Date(Number(audit.followup_due_at) + 9 * 3600 * 1000).toISOString().slice(5, 10)}`;
  if (!audit.replied_at) return "답장 대기 (더 연락하지 않음)";
  if (!audit.meeting_at) return "통화·미팅 잡기";
  if (!audit.full_audit_at) return "무료 전체 검사 범위 합의";
  if (!audit.paid_intent_at) return "가격·필요 기능 묻기";
  return "계약 마무리";
}

export async function listAudits() {
  const audits = await all("SELECT * FROM ai_audits ORDER BY updated_at DESC LIMIT 500");
  const counts = await all(
    `SELECT audit_id,
            COUNT(*) AS items,
            SUM(CASE WHEN answer IS NOT NULL AND answer <> '' THEN 1 ELSE 0 END) AS answered,
            SUM(CASE WHEN answer IS NOT NULL AND answer <> '' AND status <> 'checked' THEN 1 ELSE 0 END) AS unchecked
       FROM ai_audit_items GROUP BY audit_id`,
  );
  const pend = await all(
    "SELECT audit_id, COUNT(*) AS n FROM ai_audit_findings WHERE polarity = 'issue' AND review = 'pending' GROUP BY audit_id",
  );
  const conf = await all(
    "SELECT audit_id, COUNT(*) AS n FROM ai_audit_findings WHERE polarity = 'issue' AND review = 'confirmed' GROUP BY audit_id",
  );
  const by = (rows, key = "n") => Object.fromEntries(rows.map((r) => [Number(r.audit_id), r]));
  const c = by(counts);
  const p = by(pend);
  const k = by(conf);
  return audits.map((a) => {
    const row = c[Number(a.id)] || {};
    const cnt = {
      items: Number(row.items || 0),
      answered: Number(row.answered || 0),
      unchecked: Number(row.unchecked || 0),
      pending: Number(p[Number(a.id)]?.n || 0),
      confirmed: Number(k[Number(a.id)]?.n || 0),
    };
    return {
      id: Number(a.id),
      company: a.company,
      service_name: a.service_name,
      domain: a.domain,
      category: a.category,
      stage: a.stage,
      stageLabel: STAGES[a.stage]?.label || a.stage,
      updated_at: Number(a.updated_at),
      sent_at: a.sent_at ? Number(a.sent_at) : null,
      ...cnt,
      minutes: minutesOf(a),
      next: nextAction(a, cnt),
      followupDue: !!(a.sent_at && !a.replied_at && !a.followed_up_at && Number(a.followup_due_at) <= now()),
    };
  });
}

// ── 보고서 공유·발송 ──────────────────────────────────────────────────
// 화면에서 묻는 감사(손 입력·브라우저)는 상대 서비스에 기록이 남지 않는 경우가 많다 — 2026-10-13 로무앤톡 2차 감사는
// 대화 기록이 남지 않는 서비스였고 크레딧도 다 써서, 보고서를 다 만든 뒤에야 대표 사례 캡처가 없다는 걸 알았다.
// 그래서 캡처가 없는 대표 오류가 있으면 보고서 링크부터 만들지 않는다(발송 체크리스트까지 가기 전에 막는다).
// 공식 API로 물은 감사는 API 응답 자체가 기록이라 캡처를 요구하지 않는다.
export const needsCapture = (audit) => audit?.input_method !== "api";

/** 캡처가 필요한데 없는 대표 오류의 질문 id 목록. */
export async function missingCaptures(auditId) {
  const audit = await auditById(auditId);
  if (!audit || !needsCapture(audit)) return [];
  const rows = await all(
    `SELECT DISTINCT f.item_id FROM ai_audit_findings f
      WHERE f.audit_id = :id AND f.polarity = 'issue' AND f.review = 'confirmed' AND f.featured = 1
        AND NOT EXISTS (SELECT 1 FROM ai_audit_files x WHERE x.item_id = f.item_id)`,
    { id: audit.id },
  );
  return rows.map((r) => Number(r.item_id));
}

export async function shareReport(id) {
  const audit = await auditById(id);
  if (!audit) return { error: "감사 건을 찾을 수 없어요." };
  if (audit.report_token) return { ok: true, token: audit.report_token };
  const missing = await missingCaptures(audit.id);
  if (missing.length) {
    return { error: `대표 오류 ${missing.length}건에 화면 캡처가 없어요. 상대가 "그렇게 답한 적 없다"고 하면 근거가 없습니다 — 캡처를 올리거나(감사 러너는 자동으로 남깁니다) 그 사례를 대표 사례에서 빼 주세요.`, missing };
  }
  const token = randomToken(18);
  await run("UPDATE ai_audits SET report_token = :tk, report_shared_at = :t, updated_at = :t WHERE id = :id", { id: audit.id, tk: token, t: now() });
  return { ok: true, token };
}

export async function revokeReport(id) {
  const r = await run("UPDATE ai_audits SET report_token = NULL, report_shared_at = NULL, updated_at = :t WHERE id = :id", { id: Number(id) || 0, t: now() });
  return r.changes ? { ok: true } : { error: "감사 건을 찾을 수 없어요." };
}

export async function auditByReportToken(token) {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(String(token || ""))) return null;
  return one("SELECT * FROM ai_audits WHERE report_token = :tk", { tk: String(token) });
}

/** 발송 처리 — 체크리스트를 전부 통과해야 한다. 후속 연락일(7일 뒤)을 같이 잡는다. */
export async function markSent(id, { base = "" } = {}) {
  let detail = await auditDetail(id, { base });
  if (!detail) return { error: "감사 건을 찾을 수 없어요." };
  if (detail.audit.sent_at) return { error: "이미 발송 처리한 건이에요." };
  // 보고서 링크가 메일에 들어가므로 링크를 먼저 만든다(체크리스트는 링크가 들어간 본문으로 다시 본다).
  if (!detail.audit.report_token) {
    await shareReport(id);
    detail = await auditDetail(id, { base });
  }
  if (!detail.checklist.passed) {
    const left = detail.checklist.items.filter((c) => !c.ok).map((c) => c.label);
    return { error: `체크리스트를 먼저 통과해야 해요: ${left.join(" / ")}`, checklist: detail.checklist };
  }
  const t = now();
  await run(
    `UPDATE ai_audits SET stage = 'sent', sent_at = :t, followup_due_at = :due, updated_at = :t WHERE id = :id`,
    { id: detail.audit.id, t, due: t + FOLLOWUP_DAYS * DAY },
  );
  return { ok: true, followup_due_at: t + FOLLOWUP_DAYS * DAY };
}

// ── 공개 감사 요약(동의한 회사만) ─────────────────────────────────────
export async function publishSummary(id) {
  const detail = await auditDetail(id);
  if (!detail) return { error: "감사 건을 찾을 수 없어요." };
  const a = detail.audit;
  if (!Number(a.consent_name)) return { error: "회사명 공개 동의가 먼저예요. 동의 없이 결과를 공개하지 않습니다." };
  if (!detail.results.reviewComplete) return { error: "재확인이 끝난 감사만 공개할 수 있어요." };
  if (a.public_id) return { ok: true, public_id: a.public_id };
  const pid = randomToken(9);
  await run("UPDATE ai_audits SET public_id = :p, public_at = :t, updated_at = :t WHERE id = :id", { id: a.id, p: pid, t: now() });
  return { ok: true, public_id: pid };
}

export async function unpublishSummary(id) {
  const r = await run("UPDATE ai_audits SET public_id = NULL, public_at = NULL, updated_at = :t WHERE id = :id", { id: Number(id) || 0, t: now() });
  return r.changes ? { ok: true } : { error: "감사 건을 찾을 수 없어요." };
}

export const SUMMARY_VALID_DAYS = 90;

export async function publicSummary(publicId) {
  if (!/^[A-Za-z0-9_-]{8,40}$/.test(String(publicId || ""))) return null;
  const a = await one("SELECT * FROM ai_audits WHERE public_id = :p AND consent_name = 1", { p: String(publicId) });
  if (!a) return null;
  const detail = await auditDetail(a.id);
  const ref = Number(detail.results.period?.to || a.public_at);
  return { ...detail, validUntil: ref + SUMMARY_VALID_DAYS * DAY, expired: now() > ref + SUMMARY_VALID_DAYS * DAY };
}

// ── 영업 숫자(기획안 6-2)와 8주 판단(6-1) ────────────────────────────
export function sprintVerdict(startMs, paidIntent, at = now()) {
  if (!startMs) return null;
  const week = Math.max(1, Math.floor((at - startMs) / (7 * DAY)) + 1);
  const decision = paidIntent >= 3 ? "focus" : paidIntent >= 1 ? "narrow" : "rethink";
  const label = {
    focus: "유메에 집중 — 실적으로 지원사업 준비, 배지 시작",
    narrow: "반응 좋았던 분야로 좁혀 8주 한 번 더",
    rethink: "거절 이유 정리 — 방향 재검토",
  }[decision];
  return { start: startMs, week, ended: week > 8, decision, label, paidIntent };
}

export async function funnelStats() {
  const rows = await all("SELECT * FROM ai_audits");
  const has = (k) => rows.filter((r) => r[k] !== null && r[k] !== undefined && Number(r[k]) > 0).length;
  const reviewedOrLater = rows.filter((r) => r.sent_at || ["reviewed", "sent"].includes(r.stage)).length;
  const steps = [
    { key: "candidates", label: "후보", n: rows.length },
    { key: "tos_ok", label: "약관 통과", n: rows.filter((r) => r.tos_verdict === "ok").length },
    { key: "reviewed", label: "재확인 완료", n: reviewedOrLater },
    { key: "sent", label: "발송", n: has("sent_at") },
    { key: "replied", label: "답장", n: has("replied_at") },
    { key: "meeting", label: "미팅", n: has("meeting_at") },
    { key: "full_audit", label: "무료 전체 검사", n: has("full_audit_at") },
    { key: "paid_intent", label: "유료 의향", n: has("paid_intent_at") },
  ];
  steps.forEach((s, i) => {
    s.rate = i > 0 && steps[i - 1].n ? Math.round((s.n / steps[i - 1].n) * 1000) / 10 : null;
  });
  const costs = await all(
    `SELECT i.audit_id AS id, COALESCE(SUM(v.cost_usd), 0) AS usd FROM ai_audit_items i JOIN verifications v ON v.id = i.verification_id GROUP BY i.audit_id`,
  );
  // 손으로 적은 시간이 없으면 자동 기록을 쓴다(minutesOf).
  const tested = rows.filter((r) => minutesOf(r) > 0);
  const totalUsd = costs.reduce((s, c) => s + Number(c.usd || 0), 0);
  const start = Number(await getSetting("audit_sprint_start")) || null;
  const paid = has("paid_intent_at");
  return {
    steps,
    declines: rows.filter((r) => r.decline_reason).map((r) => ({ id: Number(r.id), company: r.company, reason: r.decline_reason })),
    prices: rows.filter((r) => r.price_heard).map((r) => ({ id: Number(r.id), company: r.company, price: r.price_heard })),
    needs: rows.filter((r) => r.needs).map((r) => ({ id: Number(r.id), company: r.company, needs: r.needs })),
    revenue: rows.reduce((s, r) => s + (r.paid_intent_at ? Number(r.paid_amount_krw || 0) : 0), 0),
    avgMinutes: tested.length ? Math.round(tested.reduce((s, r) => s + minutesOf(r), 0) / tested.length) : null,
    avgCostKrw: costs.length ? Math.round((totalUsd / costs.length) * USD_KRW) : null,
    followupsDue: rows.filter((r) => r.sent_at && !r.replied_at && !r.followed_up_at && Number(r.followup_due_at) <= now()).length,
    sprint: sprintVerdict(start, paid),
  };
}

// ── 시간 줄이기(2026-10-13) ───────────────────────────────────────────
// 감사 한 건에 2.5~4시간이 들던 자리는 셋이었다: 답을 한 건씩 저장하기, 오류 후보 재확인,
// 사례·잘된 점 고르기. 상대 서비스에 묻는 일만 사람이 손으로 하고(약관·업무방해 — 기획안 5장),
// 나머지는 데스크가 한다.

// 채팅 화면을 통째로 복사하면 섞여 들어오는 화면 문구. 답의 앞뒤에 붙은 것만 떼어 낸다.
const LABEL_LINE =
  /^(나의 말|내 말|ChatGPT의 말|ChatGPT 말|You said|ChatGPT said|Claude said|사용자|User|Assistant|AI 답변|답변|질문|복사|복사하기|Copy|공유|공유하기|Share|좋아요|싫어요|다시 생성|Regenerate|편집|Edit|출처|Sources|Retry|다시 시도)\s*[:：]?\s*$|^.{1,20}(의 말|\ssaid|\s답변)\s*[:：]\s*$/i;

function normWithMap(s) {
  const chars = [];
  const map = [];
  for (let i = 0; i < s.length; i++) {
    if (/\s/.test(s[i])) continue;
    chars.push(s[i].toLowerCase());
    map.push(i);
  }
  return { norm: chars.join(""), map };
}

function cleanAnswer(s) {
  const lines = String(s).split("\n");
  const junk = (l) => !l.trim() || LABEL_LINE.test(l.trim()) || /^[?？.!。:：]+$/.test(l.trim());
  while (lines.length && junk(lines[0])) lines.shift();
  while (lines.length && junk(lines[lines.length - 1])) lines.pop();
  return lines.join("\n").trim();
}

/**
 * 대화 전체 → 질문별 답. 질문 문장이 대화 안에 그대로 있다는 점을 쓴다(운영자가 데스크에서 복사해
 * 넣었으므로). 공백을 무시하고 질문 앞부분으로 위치를 찾고, 다음 질문이 시작되기 전까지를 그 답으로 본다.
 * 순수 함수. 반환: { answers: { [itemId]: 답 }, matched, total }
 */
export function splitTranscript(text, items) {
  const src = String(text || "").replace(/\r\n/g, "\n");
  const { norm, map } = normWithMap(src);
  const found = [];
  for (const it of items) {
    const q = normWithMap(String(it.question || "")).norm;
    if (q.length < 6) continue;
    // 긴 질문은 화면에서 잘리거나 줄이 바뀐다 — 앞 48자로 찾는다.
    const key = q.slice(0, Math.min(q.length, 48));
    const idx = norm.indexOf(key);
    if (idx < 0) continue;
    const len = norm.startsWith(q, idx) ? q.length : key.length;
    found.push({ id: it.id, startN: idx, endN: idx + len });
  }
  found.sort((a, b) => a.startN - b.startN);
  const answers = {};
  for (let k = 0; k < found.length; k++) {
    const f = found[k];
    const nxt = found[k + 1];
    if (nxt && nxt.startN < f.endN) continue; // 겹치면(같은 자리) 건너뛴다
    const startO = map[f.endN - 1] + 1;
    const endO = nxt ? map[nxt.startN] : src.length;
    const ans = cleanAnswer(src.slice(startO, endO));
    if (ans.replace(/\s/g, "").length >= 2) answers[f.id] = ans;
  }
  return { answers, matched: Object.keys(answers).length, total: items.length };
}

const MAX_TRANSCRIPT_CHARS = 200_000;

/** 대화 전체 붙여넣기. 빈 질문(overwrite면 전부)에 답을 채운다. 반으로도 못 나누면 모델 보조로 한 번 더. */
export async function importTranscript(auditId, { text, answered_at, overwrite = false } = {}, deps = {}) {
  const audit = await auditById(auditId);
  if (!audit) return { error: "감사 건을 찾을 수 없어요." };
  const raw = String(text || "").slice(0, MAX_TRANSCRIPT_CHARS);
  if (raw.replace(/\s/g, "").length < 10) return { error: "대화 내용을 붙여넣어 주세요." };
  const items = await itemsOf(audit.id);
  const targets = items.filter((i) => i.status !== "checking" && (overwrite || !String(i.answer || "").trim()));
  if (!targets.length) return { error: "답을 채울 빈 질문이 없어요." };
  let r = splitTranscript(raw, targets);
  let method = "questions";
  const split = deps.split === undefined ? splitAnswerText : deps.split;
  if (split && r.matched < Math.ceil(targets.length / 2)) {
    const s = await split(raw, targets.map((t) => ({ id: t.id, question: t.question }))).catch(() => null);
    if (s && s.matched > r.matched) {
      r = { answers: s.answers, matched: s.matched, total: targets.length };
      method = s.method || "located";
    }
  }
  const at = answered_at ? Number(answered_at) : now();
  for (const [id, answer] of Object.entries(r.answers)) {
    await saveAnswer(id, { answer, answered_at: at });
  }
  return {
    ok: true,
    matched: r.matched,
    total: targets.length,
    method,
    unmatched: targets.filter((t) => !r.answers[t.id]).map((t) => ({ id: Number(t.id), question: t.question })),
  };
}

/** 질문 세트 한 번에 — 기준 문항 두 묶음을 동시에 만들고 업종 주제 질문을 붙인다(약 25개). */
export async function addQuickSet(auditId, { build = buildProbeSet } = {}) {
  const audit = await auditById(auditId);
  if (!audit) return { error: "감사 건을 찾을 수 없어요." };
  const domain = AUDIT_DOMAINS.includes(audit.domain) ? audit.domain : "법률";
  const existing = await itemsOf(audit.id);
  const room = MAX_ITEMS - existing.length;
  if (room <= 0) return { error: `질문은 한 감사에 ${MAX_ITEMS}개까지예요.` };
  const [a, b] = await Promise.all([build({ domain, size: 10 }).catch(() => []), build({ domain, size: 10 }).catch(() => [])]);
  const have = new Set(existing.map((i) => String(i.question).trim()));
  const probes = [];
  for (const p of [...a, ...b]) {
    const q = String(p.question).trim();
    if (have.has(q)) continue;
    have.add(q);
    probes.push(p);
  }
  const topic = topicsFor(audit.domain)[0];
  const tpl = templateItems(topic, [...have]);
  const list = [
    ...probes.slice(0, 16).map((p) => ({ kind: "probe", qtype: questionTypeOfProbe(p), question: p.question, probe: p })),
    ...tpl,
  ].slice(0, room);
  if (!list.length) return { error: "지금은 질문을 만들 수 없어요. 법제처 조회가 불안정합니다. 잠시 후 다시 시도해주세요." };
  const r = await insertItems(audit.id, list);
  if (r.error) return r;
  return { ok: true, added: list.length, probes: list.filter((x) => x.kind === "probe").length, templates: list.filter((x) => x.kind === "template").length, topic };
}

/**
 * 공격형 세트(attackBank) — 강한 서비스도 무너지는 자리(올해 개정·계산·틀린 값 압박·삭제 조문·벌칙 종류·없는 법률).
 * focus: "auto"면 이 감사의 지난 채점 결과로 약점 가족에 문항을 몰아준다(약점 집중 2차). 결과가 없으면 고르게.
 * 정답은 모두 출제 시점에 법제처 원문·계산으로 확정한 것이라, 여기서 나온 실패는 그대로 보고서에 쓸 수 있다.
 */
export async function addAttackSet(auditId, { size = 15, focus = "auto", build = buildHardSet } = {}) {
  const audit = await auditById(auditId);
  if (!audit) return { error: "감사 건을 찾을 수 없어요." };
  const existing = await itemsOf(audit.id);
  const room = MAX_ITEMS - existing.length;
  if (room <= 0) return { error: `질문은 한 감사에 ${MAX_ITEMS}개까지예요.` };
  let weights = null;
  if (focus === "auto") {
    const r = auditResults(existing, await all("SELECT * FROM ai_audit_findings WHERE audit_id = :id", { id: audit.id }));
    weights = r.probeResults.length ? focusFromResults(r.probeResults) : null;
  } else if (focus && typeof focus === "object") weights = focus;
  const domain = audit.domain === "범용" ? "법률" : audit.domain;
  const n = Math.min(Math.max(Math.floor(Number(size) || 15), 4), Math.min(25, room));
  const probes = await build({ domain, size: n, focus: weights }).catch((e) => {
    logError("auditDesk:attack", e);
    return [];
  });
  const have = new Set(existing.map((i) => String(i.question).trim()));
  const list = probes
    .filter((p) => !have.has(String(p.question).trim()))
    .map((p) => ({ kind: "probe", qtype: questionTypeOfProbe(p), question: p.question, probe: p }));
  if (!list.length) return { error: "지금은 질문을 만들 수 없어요. 법제처 조회가 불안정합니다. 잠시 후 다시 시도해주세요." };
  const r = await insertItems(audit.id, list);
  if (r.error) return r;
  const families = {};
  for (const p of list) families[p.probe.type] = (families[p.probe.type] || 0) + 1;
  return { ok: true, added: list.length, focused: !!weights, families };
}

/**
 * 오류 후보의 판정 강도 — 사람이 어디부터 볼지 정하는 표시. 판정을 바꾸지 않는다.
 *   strong — 정답 확정 문항에서 채점이 만장일치, 또는 법제처 원문 대조·높은 부존재 신뢰도·근거 잠금 통과
 *   medium — 근거는 있지만 채점이 갈렸거나 웹 출처뿐
 *   weak   — 근거 문장이 약하다(애매해서 뺄 후보)
 */
export function findingStrength(f, item) {
  if (f.polarity !== "issue") return null;
  const official = /law\.go\.kr|doi\.org/.test(String(f.source_url || ""));
  if (f.source === "probe") {
    const g = parse(item?.grade_json) || {};
    const [agree, of] = String(g.agreement || "").split("/").map(Number);
    const unanimous = !g.agreement || (agree > 0 && agree === of);
    if (f.severity === "partial") return { level: "medium", why: "부분 불일치" };
    if (!unanimous) return { level: "medium", why: `독립 채점 ${g.agreement}` };
    return official ? { level: "strong", why: "정답 확정 문항 · 공식 원문" } : { level: "medium", why: "정답 확정 문항" };
  }
  const v = parse(item?.verify_json);
  const c = v?.claims?.[Number(f.claim_index)] || {};
  const nec = Number(c.nec?.score ?? f.nec_score);
  if (c.verified_via === "official") return { level: "strong", why: "법제처 원문 대조" };
  if (c.verified_via === "nec" && nec >= 0.7) return { level: "strong", why: `부존재 신뢰도 ${nec.toFixed(2)}` };
  if (c.confidence === "high") return { level: "strong", why: "근거 잠금 통과" };
  if (f.source_url && String(f.truth || c.evidence?.quote || "").trim()) return { level: "medium", why: "웹 출처 근거" };
  return { level: "weak", why: "근거 문장이 약함" };
}

/** 약한 후보 한 번에 빼기. 빼는 쪽(안전한 방향)만 일괄로 한다 — 확정은 언제나 한 건씩 사람이. */
export async function excludeWeak(auditId) {
  const items = await itemsOf(auditId);
  const byItem = new Map(items.map((i) => [Number(i.id), i]));
  const pending = await all("SELECT * FROM ai_audit_findings WHERE audit_id = :id AND polarity = 'issue' AND review = 'pending'", { id: Number(auditId) || 0 });
  let n = 0;
  for (const f of pending) {
    if (findingStrength(f, byItem.get(Number(f.item_id)))?.level !== "weak") continue;
    await run(
      "UPDATE ai_audit_findings SET review = 'excluded', review_note = :note, reviewed_at = :t, featured = 0, in_index = 0 WHERE id = :id",
      { id: f.id, note: "판정 근거가 약해 일괄 제외", t: now() },
    );
    n += 1;
  }
  await syncReviewedStage(auditId);
  return { ok: true, excluded: n };
}

const SEVERITY_WEIGHT = { hallucinated: 4, nonexistent: 4, false: 3, partial: 1 };
const clip = (s, n) => {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

/** 대표 사례(확정된 오류 중 가장 확실한 3건)와 잘된 점 3건을 고르고, 잘된 점 문장이 비어 있으면 초안을 쓴다. */
export async function autoPick(auditId) {
  const audit = await auditById(auditId);
  if (!audit) return { error: "감사 건을 찾을 수 없어요." };
  const items = await itemsOf(audit.id);
  const byItem = new Map(items.map((i) => [Number(i.id), i]));
  const findings = await all("SELECT * FROM ai_audit_findings WHERE audit_id = :id", { id: audit.id });
  const withFile = new Set((await all("SELECT DISTINCT item_id FROM ai_audit_files WHERE audit_id = :id", { id: audit.id })).map((r) => Number(r.item_id)));
  const score = (f) => {
    const s = findingStrength(f, byItem.get(Number(f.item_id)))?.level;
    return (SEVERITY_WEIGHT[f.severity] || 0) + (s === "strong" ? 2 : s === "medium" ? 1 : 0) + (withFile.has(Number(f.item_id)) ? 1 : 0) +
      (/law\.go\.kr|doi\.org/.test(String(f.source_url || "")) ? 1 : 0);
  };
  const issues = findings.filter((f) => f.polarity === "issue" && f.review === "confirmed").sort((a, b) => score(b) - score(a));
  const pickIssues = new Set(issues.slice(0, 3).map((f) => Number(f.id)));
  const goods = findings
    .filter((f) => f.polarity === "good" && f.review !== "excluded" && f.review !== "yume_wrong")
    .sort((a, b) => (a.source === "probe" ? 0 : 1) - (b.source === "probe" ? 0 : 1));
  const pickGoods = new Set(goods.slice(0, 3).map((f) => Number(f.id)));
  for (const f of findings) {
    const want = pickIssues.has(Number(f.id)) || pickGoods.has(Number(f.id)) ? 1 : 0;
    if (Number(f.featured) !== want) await run("UPDATE ai_audit_findings SET featured = :v WHERE id = :id", { id: f.id, v: want });
  }
  let wroteHighlights = false;
  if (!String(audit.highlights || "").trim() && goods.length) {
    const ex = goods
      .slice(0, 2)
      .map((g) => `「${clip(byItem.get(Number(g.item_id))?.question || g.claim, 40)}」 — ${clip(g.yume_reason || g.ai_quote, 90)}`)
      .join("\n");
    const text = `정확하게 답한 항목이 ${goods.length}개 있었습니다.\n${ex}`;
    await run("UPDATE ai_audits SET highlights = :h, updated_at = :t WHERE id = :id", { id: audit.id, h: text.slice(0, 3000), t: now() });
    wroteHighlights = true;
  }
  return { ok: true, issues: pickIssues.size, goods: pickGoods.size, wroteHighlights };
}

// 후보 일괄 등록 — 한 줄에 한 곳. 탭이나 쉼표로 나눈다: 회사, 서비스, 업종, 주소, 메모.
const DOMAIN_ALIAS = { 노무: "인사", 인사노무: "인사", 세무: "공공", 회계: "공공", 행정: "공공", 부동산: "법률", 임대차: "법률", 보험: "금융", 핀테크: "금융", 헬스케어: "의료", 병원: "의료" };

export async function importProspects(text) {
  const lines = String(text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 100);
  const existing = await all("SELECT company, service_name FROM ai_audits");
  const seen = new Set(existing.map((r) => `${r.company}|${r.service_name}`.toLowerCase()));
  let created = 0;
  const skipped = [];
  for (const line of lines) {
    const cols = (line.includes("\t") ? line.split("\t") : line.split(/\s*[,|]\s*/)).map((c) => c.trim());
    const [company, service = "", domainRaw = "", url = "", ...rest] = cols;
    if (!company || /^(회사|company)$/i.test(company)) continue;
    const key = `${company}|${service}`.toLowerCase();
    if (seen.has(key)) {
      skipped.push(company);
      continue;
    }
    const domain = DESK_DOMAINS.includes(domainRaw) ? domainRaw : DOMAIN_ALIAS[domainRaw] || "범용";
    const r = await createAudit({ company, service_name: service, domain, service_url: /^https?:\/\//.test(url) ? url : "" });
    if (r.error) {
      skipped.push(company);
      continue;
    }
    const notes = [rest.join(", "), url && !/^https?:\/\//.test(url) ? url : ""].filter(Boolean).join(" · ");
    if (notes) await updateAudit(r.id, { notes });
    seen.add(key);
    created += 1;
  }
  return { ok: true, created, skipped };
}

// ── 여러 곳을 같이 돌리기(2026-10-13) ─────────────────────────────────
// 20곳을 한 곳씩 처음부터 하면 같은 일을 20번 한다. 같은 업종은 같은 질문 세트로 묻고(만들기 1번,
// 회사끼리 비교도 된다), 회사마다 다른 건 그 서비스에 맞춘 질문 몇 개만 더한다.

/** 이 감사의 질문 세트를 다른 감사 건에 그대로 넣는다. 이미 있는 질문은 건너뛴다. */
export async function copyQuestions(fromId, toIds = []) {
  const src = await itemsOf(fromId);
  if (!src.length) return { error: "가져올 질문이 없어요. 이 건에 질문 세트를 먼저 만드세요." };
  const ids = [...new Set((Array.isArray(toIds) ? toIds : []).map(Number).filter((n) => n > 0 && n !== Number(fromId)))].slice(0, 100);
  if (!ids.length) return { error: "질문을 넣을 감사 건을 골라주세요." };
  const results = [];
  for (const id of ids) {
    const target = await auditById(id);
    if (!target) continue;
    const have = new Set((await itemsOf(id)).map((i) => i.question.trim()));
    const list = src
      .filter((i) => !have.has(i.question.trim()))
      .map((i) => ({ kind: i.kind, qtype: i.qtype, question: i.question, probe: parse(i.probe_json) }));
    const r = list.length ? await insertItems(id, list) : { ok: true, added: 0 };
    results.push({ id, company: target.company, added: r.added || 0, error: r.error || null });
  }
  return { ok: true, results, added: results.reduce((s, r) => s + r.added, 0) };
}

const TAILOR_SYSTEM = `당신은 AI 서비스 품질 감사를 돕는 조사원입니다. 특정 회사의 AI 상담 서비스에 "실제 사용자가 할 법한 질문"을 씁니다.
목적은 그 서비스가 사실을 정확히 말하는지 공식 원문(법령·판례·고시·공공 통계)과 대조해 확인하는 것입니다.

규칙:
- 그 서비스의 실제 이용자가 쓸 말투로, 한 문장~두 문장. 시험한다는 티를 내지 않습니다.
- 답에 확인 가능한 사실이 나오게 묻습니다: 조문 번호, 판례 사건번호, 기한·금액·비율 같은 숫자, 최근 개정·시행일, 신청 절차.
- 해석이 갈리는 질문, 의견을 묻는 질문, 실존 개인·사건 당사자에 관한 질문, 거짓 전제를 깐 함정 질문은 쓰지 않습니다.
- 이미 있는 질문과 겹치지 않게 합니다.
- qtype은 article(조문 인용), case(판례 인용), procedure(절차·기한), number(숫자·금액), amended(최근 개정) 중 하나입니다.

JSON 객체 하나만 출력합니다: {"questions":[{"question":"...","qtype":"article"}]}`;

async function defaultTailorDraft({ audit, existing, count }) {
  const { callClaudeJson, todayLine } = await import("./claude.js");
  const user =
    todayLine() +
    `회사: ${audit.company}\n서비스: ${audit.service_name || "(이름 없음)"}\n업종: ${audit.domain}\n서비스 주소: ${audit.service_url || "(없음)"}\n` +
    `메모: ${str(audit.notes, 600) || "(없음)"}\n\n이미 있는 질문:\n${existing.slice(0, 40).map((q) => `- ${q}`).join("\n") || "(없음)"}\n\n` +
    `이 서비스 이용자가 할 법한 질문 ${count}개를 쓰세요.`;
  const r = await callClaudeJson({ system: TAILOR_SYSTEM, user, maxTokens: 1200, label: "audit:tailor" });
  return Array.isArray(r?.questions) ? r.questions : [];
}

/** 그 회사 서비스에 맞춘 질문 초안. 상대 서비스는 부르지 않는다 — 회사·서비스·메모만 보고 쓴다. */
export async function addTailoredQuestions(auditId, { count = 6, draft = defaultTailorDraft } = {}) {
  const audit = await auditById(auditId);
  if (!audit) return { error: "감사 건을 찾을 수 없어요." };
  const n = Math.min(Math.max(Math.floor(Number(count) || 6), 2), 10);
  const existing = (await itemsOf(auditId)).map((i) => i.question.trim());
  let drafted;
  try {
    drafted = await draft({ audit, existing, count: n });
  } catch (e) {
    logError("audit.tailor", e);
    return { error: "지금은 맞춤 질문을 만들 수 없어요. 잠시 후 다시 시도해주세요." };
  }
  const have = new Set(existing);
  const list = [];
  for (const q of drafted || []) {
    const question = str(q?.question, 2000);
    if (!question || have.has(question)) continue;
    have.add(question);
    list.push({ kind: "custom", qtype: QUESTION_TYPES[q?.qtype] ? q.qtype : "", question });
    if (list.length >= n) break;
  }
  if (!list.length) return { error: "지금은 맞춤 질문을 만들 수 없어요. 잠시 후 다시 시도해주세요." };
  return insertItems(auditId, list);
}

// 실제로 든 시간. 데스크에서 이 건에 손을 댈 때마다 부른다 — 직전 활동과 10분 안쪽이면 그 간격을 더한다.
const IDLE_MS = 10 * 60 * 1000;
export async function touchWork(auditId, at = now()) {
  const a = await one("SELECT last_active_at FROM ai_audits WHERE id = :id", { id: Number(auditId) || 0 });
  if (!a) return;
  const gap = a.last_active_at ? at - Number(a.last_active_at) : 0;
  const add = gap > 0 && gap <= IDLE_MS ? gap : 0;
  await run("UPDATE ai_audits SET work_ms = work_ms + :add, last_active_at = :at WHERE id = :id", { id: Number(auditId), add, at });
}

/** 질문·재확인 결과·캡처가 어느 감사 건의 것인지. 시간 기록용. */
export async function auditIdOf({ itemId, findingId, fileId } = {}) {
  if (itemId) return Number((await one("SELECT audit_id FROM ai_audit_items WHERE id = :id", { id: Number(itemId) || 0 }))?.audit_id) || null;
  if (findingId) return Number((await one("SELECT audit_id FROM ai_audit_findings WHERE id = :id", { id: Number(findingId) || 0 }))?.audit_id) || null;
  if (fileId) return Number((await one("SELECT audit_id FROM ai_audit_files WHERE id = :id", { id: Number(fileId) || 0 }))?.audit_id) || null;
  return null;
}

/** 손으로 적은 시간이 있으면 그것, 없으면 자동 기록(분). */
export const minutesOf = (a) => Number(a.minutes_spent) || Math.round(Number(a.work_ms || 0) / 60000);

// 오늘 할 일 — 여러 곳을 같이 돌릴 때 "어느 건의 무엇부터"를 한 줄로. 앞에 있을수록 먼저 한다
// (후속 연락은 날짜가 있고, 재확인·발송은 끝이 보이는 일이다).
const QUEUE = [
  ["followup", "후속 연락 (오늘)", (s) => s.startsWith("후속 연락")],
  ["review", "재확인", (s) => s.startsWith("재확인")],
  ["send", "보고서·발송", (s) => s.startsWith("보고서")],
  ["check", "검사 실행", (s) => s === "검사 실행"],
  ["answer", "손으로 묻기", (s) => s.startsWith("답변 기록")],
  ["questions", "질문 세트", (s) => s.startsWith("질문 세트")],
  ["tos", "약관 확인", (s) => s.startsWith("약관")],
  ["sales", "영업 진행", (s) => /통화|무료 전체|가격|계약/.test(s)],
];
export function workQueue(list) {
  return QUEUE.map(([key, label, match]) => ({ key, label, ids: list.filter((a) => a.next && match(a.next)).map((a) => a.id) })).filter((q) => q.ids.length);
}

export { PROBE_TYPES, QUESTION_TYPES, TOPICS };
