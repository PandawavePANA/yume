// 수아 — 감사팀 QA. 채점이 끝난 감사의 오류 후보를 하나씩 법령 원문과 다시 대조해, 대표에게 "재확인 결재" 한 장으로 올린다.
//
// 오류 후보에는 채점 때 받아 둔 공식 원문(truth)과 법제처 링크(source_url)가 붙어 있다. 수아는 그것만 보고
// 판단한다(배경지식 금지) — 조금이라도 해석이 갈리면 "제외"를 권한다. 틀린 지적 하나가 보고서 전체를 무너뜨린다.
// 확정은 대표가 결재로 한다: 결재 문서에서 원문 링크를 열어 보고 항목마다 확정·제외를 바꿀 수 있다.
import { all } from "../../db.js";
import { isChecking, reviewFinding } from "../../auditDesk.js";

const SYSTEM = `당신은 AI 답변 감사의 QA 검수자입니다. 각 항목은 "질문, AI가 한 말, 공식 법령 원문, 1차 채점 이유"입니다.
AI가 한 말이 공식 원문과 실제로 어긋나는지 판단하세요. 공식 원문 밖의 배경지식으로 판단하지 마세요.
- "confirmed": 누가 봐도 원문과 다르다(숫자·기간·대상·처벌 종류가 다르거나, 없는 조문·제도를 있다고 함).
- "excluded": 해석이 갈리거나, 원문 일부만으로 단정하기 어렵거나, AI가 단서를 달아 틀렸다고 보기 애매하다.
- "yume_wrong": 1차 채점이 틀렸다(AI 말이 원문과 맞다).
조금이라도 망설여지면 excluded. title은 보고서 카드 제목(40자 이내, AI가 한 틀린 말을 큰따옴표로 짧게 인용).
JSON 하나만: {"items":[{"id":숫자,"verdict":"confirmed|excluded|yume_wrong","reason":"한 문장","title":""}]}`;

const clip = (s, n) => {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
};

/** 재확인 결재가 필요한 감사 — 오류 후보가 대기 중이고, 채점이 다 끝난 것. */
export async function ready() {
  const rows = await all(
    `SELECT a.id, a.company, MAX(f.id) AS last, COUNT(f.id) AS n FROM ai_audits a JOIN ai_audit_findings f ON f.audit_id = a.id
      WHERE f.polarity = 'issue' AND f.review = 'pending' AND a.closed_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM ai_audit_items i WHERE i.audit_id = a.id AND i.answer IS NOT NULL AND i.answer <> '' AND i.status <> 'checked')
      GROUP BY a.id, a.company ORDER BY a.id ASC`,
  );
  return rows.filter((r) => !isChecking(Number(r.id)));
}

export async function run(ctx) {
  let done = 0;
  for (const a of await ready()) {
    const dedupe = `review:audit:${a.id}:${a.last}`;
    if (await ctx.hasProposal(dedupe)) continue;
    const rows = await all(
      `SELECT f.*, i.question, i.answer FROM ai_audit_findings f JOIN ai_audit_items i ON i.id = f.item_id
        WHERE f.audit_id = :id AND f.polarity = 'issue' AND f.review = 'pending' ORDER BY f.item_id, f.id`,
      { id: a.id },
    );
    const items = rows.map((f) => ({
      id: Number(f.id),
      question: clip(f.question, 400),
      ai: clip(f.ai_quote || f.claim, 500),
      official: clip(f.truth, 1500),
      reason: clip(f.yume_reason, 400),
      url: /^https?:\/\//.test(f.source_url || "") ? f.source_url : "",
    }));
    const { json, usd } = await ctx.deps.ai({
      system: SYSTEM,
      user: items.map((x) => `[${x.id}]\n질문: ${x.question}\nAI가 한 말: ${x.ai}\n공식 원문: ${x.official || "(없음)"}\n1차 채점 이유: ${x.reason}`).join("\n\n"),
      maxTokens: 4000,
      label: "staff:qa",
    });
    const byId = new Map((Array.isArray(json?.items) ? json.items : []).map((r) => [Number(r.id), r]));
    const list = items.map((x) => {
      const r = byId.get(x.id) || {};
      let verdict = ["confirmed", "excluded", "yume_wrong"].includes(r.verdict) ? r.verdict : "excluded";
      let reason = String(r.reason || "QA 판단 없음 — 제외 권고").slice(0, 300);
      // 원문이나 원문 링크가 없으면 확정할 수 없다(감사 원칙: 직접 연 원문 링크).
      if (verdict === "confirmed" && (!x.official || !x.url)) {
        verdict = "excluded";
        reason = `원문${x.url ? "" : " 링크"}가 없어 확정할 수 없음 — ${reason}`;
      }
      return { ...x, qa: verdict, qaReason: reason, title: clip(r.title, 60) };
    });
    const c = list.filter((x) => x.qa === "confirmed").length;
    await ctx.propose({
      kind: "review_findings",
      title: `재확인 결재 — ${a.company} 오류 후보 ${list.length}건 (확정 권고 ${c})`,
      summary: `QA가 공식 원문과 다시 대조했습니다. 확정 권고 ${c} · 제외 ${list.filter((x) => x.qa === "excluded").length} · 유메 오판 ${list.filter((x) => x.qa === "yume_wrong").length}. 원문 링크를 열어 보고 항목별로 바꿀 수 있습니다.`,
      payload: { auditId: Number(a.id), items: list },
      ref: `audit:${a.id}`,
      dedupe,
    });
    await ctx.log(`${a.company} 오류 후보 ${list.length}건을 원문과 대조해 재확인 결재를 올렸어요`, { ref: `audit:${a.id}`, costUsd: usd });
    done += 1;
  }
  return { note: done ? `재확인 결재 ${done}건` : "재확인할 후보 없음" };
}

/** 결재 승인 — 대표가 고른 판정대로 반영한다. decisions: { [findingId]: "confirmed"|"excluded"|"yume_wrong" } */
export async function apply(payload, input = {}) {
  const decisions = input.decisions || {};
  const out = { confirmed: 0, excluded: 0, yume_wrong: 0, failed: 0 };
  for (const x of payload.items || []) {
    const v = decisions[x.id] || x.qa;
    const r = await reviewFinding(x.id, {
      review: v,
      ...(v === "confirmed" ? { checked_url: x.url, ...(x.title ? { report_title: x.title } : {}) } : {}),
      review_note: `QA(수아): ${x.qaReason}${decisions[x.id] && decisions[x.id] !== x.qa ? ` → 대표가 ${v}로 결정` : ""}`,
    });
    if (r.error) out.failed += 1;
    else out[v] += 1;
  }
  return { ok: out.failed === 0, result: `확정 ${out.confirmed} · 제외 ${out.excluded} · 유메 오판 ${out.yume_wrong}${out.failed ? ` · 실패 ${out.failed}` : ""}` };
}
