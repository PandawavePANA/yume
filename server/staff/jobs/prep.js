// 하린 — 감사 준비·채점. 약관이 통과된 감사에 질문 세트를 만들어 두고, 답이 들어오면 채점(검사)을 돌린다.
//
// 상대 서비스에 질문을 넣는 일은 하지 않는다 — 그건 사람(또는 대표 PC의 감사 도구)이 한다(감사 원칙). 그래서
// 질문이 준비되면 "대표 할 일: 답 수집"으로 넘기고, 답이 저장되면 다시 이어서 채점한다.
// 채점에서 나온 오류 후보의 재확인(원문 링크)도 사람이 한다. 하린은 그 앞뒤를 맡는다.
import { all, one } from "../../db.js";
import { addAttackSet, addTailoredQuestions, isChecking, startChecks } from "../../auditDesk.js";
import { kstDayStart } from "../store.js";

// 질문 수 — 유료 주문은 상품 범위대로, 먼저 감사해 보내는 영업 건은 12개 + 맞춤 4개(로무앤톡 2차와 같은 규모).
function sizeFor(audit) {
  const via = String(audit.found_via || "");
  if (/유료 주문/.test(via)) return /정기/.test(audit.needs || "") ? { attack: 26, tailored: 4 } : { attack: 44, tailored: 6 };
  return { attack: 12, tailored: 4 };
}

// 하루 채점 예산(달러). 답 하나 채점이 약 0.37달러(2026-10 실측)라 50문항 감사 하나가 약 18달러다.
const budgetUsd = () => {
  const v = Number(process.env.STAFF_AUDIT_BUDGET_USD);
  return Number.isFinite(v) && v > 0 ? v : 10;
};
const PER_ANSWER_USD = 0.4;

async function auditSpendToday() {
  const r = await one("SELECT COALESCE(SUM(cost_usd), 0) AS usd FROM verifications WHERE source = 'audit' AND created_at >= :since", { since: kstDayStart() });
  return Number(r?.usd || 0);
}

/** 질문이 아직 없는, 약관 통과한 감사(보내기 전·끝나지 않은 것). */
export const needQuestions = (limit) =>
  all(
    `SELECT a.* FROM ai_audits a
      WHERE a.tos_verdict = 'ok' AND a.sent_at IS NULL AND a.closed_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM ai_audit_items i WHERE i.audit_id = a.id)
      ORDER BY (a.found_via LIKE '유료 주문%') DESC, a.id ASC LIMIT :limit`,
    { limit },
  );

/** 질문은 있는데 답이 하나도 없는 감사(보내기 전). */
export const needAnswers = () =>
  all(
    `SELECT a.* FROM ai_audits a
      WHERE a.tos_verdict = 'ok' AND a.sent_at IS NULL AND a.closed_at IS NULL
        AND EXISTS (SELECT 1 FROM ai_audit_items i WHERE i.audit_id = a.id)
        AND NOT EXISTS (SELECT 1 FROM ai_audit_items i WHERE i.audit_id = a.id AND i.answer IS NOT NULL AND i.answer <> '')
      ORDER BY a.id ASC LIMIT 10`,
  );

/** 답은 들어왔는데 아직 채점하지 않은 감사와 그 답 수. */
export const needChecks = () =>
  all(
    `SELECT a.id, a.company, COUNT(i.id) AS n FROM ai_audits a JOIN ai_audit_items i ON i.audit_id = a.id
      WHERE a.tos_verdict = 'ok' AND a.closed_at IS NULL AND i.answer IS NOT NULL AND i.answer <> '' AND i.status <> 'checked'
      GROUP BY a.id, a.company ORDER BY a.id ASC`,
  );

export async function run(ctx) {
  const notes = [];
  for (const a of await needQuestions(ctx.cap(2))) {
    const size = sizeFor(a);
    const r1 = await ctx.deps.addAttackSet(a.id, { size: size.attack });
    const r2 = await ctx.deps.addTailoredQuestions(a.id, { count: size.tailored });
    const added = (r1?.added || r1?.count || 0) + (r2?.added || r2?.count || 0);
    if (r1?.error && r2?.error) {
      await ctx.log(`${a.company} 질문 세트를 만들지 못했어요`, { level: "warn", detail: `${r1.error} / ${r2.error}`, ref: `audit:${a.id}` });
      continue;
    }
    await ctx.log(`${a.company} 질문 세트를 준비했어요${added ? ` (${added}개)` : ""} — 답 수집은 대표 차례`, { ref: `audit:${a.id}` });
    notes.push(`${a.company} 질문 준비`);
  }

  // 질문은 준비됐는데 답이 하나도 없는 감사 — 상대 서비스에 묻는 일은 사람 몫이라 "답 수집 요청"을 대표에게 올린다.
  for (const a of await needAnswers()) {
    const dedupe = `collect:audit:${a.id}`;
    if (await ctx.hasProposal(dedupe)) continue;
    const qs = await all("SELECT position, question FROM ai_audit_items WHERE audit_id = :id ORDER BY position, id", { id: a.id });
    await ctx.propose({
      kind: "collect_answers",
      title: `답 수집 요청 — ${a.company} 질문 ${qs.length}개`,
      summary: `${a.service_name || a.company}(${a.service_url || "주소 없음"})에 아래 질문을 한 건씩 넣고 답을 저장해 주세요. 저장되면 감사팀이 바로 채점을 이어 갑니다.\n방법: 감사 데스크 '대화 붙여넣기'(질문별 자동 분리) 또는 대표 PC의 감사 도구(scripts/audit-runner.mjs).`,
      payload: { auditId: Number(a.id), questions: qs.map((q) => q.question), url: a.service_url },
      ref: `audit:${a.id}`,
      dedupe,
    });
    await ctx.log(`${a.company} 질문 ${qs.length}개 답 수집을 대표에게 요청했어요`, { ref: `audit:${a.id}` });
  }

  const left = budgetUsd() - (await auditSpendToday());
  for (const a of await needChecks()) {
    if (ctx.deps.isChecking(a.id)) continue;
    const est = Number(a.n) * PER_ANSWER_USD;
    if (est > left) {
      await ctx.log(`${a.company} 채점을 미뤘어요 — 오늘 채점 예산(${budgetUsd()}달러)이 모자라요`, { level: "warn", ref: `audit:${a.id}` });
      break;
    }
    const r = await ctx.deps.startChecks(a.id);
    if (r?.error) {
      await ctx.log(`${a.company} 채점을 시작하지 못했어요`, { level: "warn", detail: r.error, ref: `audit:${a.id}` });
      continue;
    }
    await ctx.log(`${a.company} 답 ${a.n}개 채점을 시작했어요 — 끝나면 재확인은 대표 차례`, { ref: `audit:${a.id}` });
    notes.push(`${a.company} 채점`);
    break; // 한 번에 한 감사씩(채점은 길고 비싸다)
  }
  return { note: notes.length ? notes.join(" · ") : "준비·채점할 감사 없음" };
}

export const defaults = { addAttackSet, addTailoredQuestions, startChecks, isChecking };
