// 지호 — 영업팀장. 재확인이 끝난 영업 감사의 첫 메일과, 7일 뒤 후속 메일 1회를 기안한다.
//
// 결재선: 기안 지호(영업) → 검토 도윤(법무 — 압박·과장 문구, 비공개 문장, 수신 거부 안내) → 결재 대표.
// 첫 메일은 언제나 대표 결재 후 발송한다. 발송 체크리스트의 "사람만 아는 세 줄"(손으로 물었는가, 애매한 걸 뺐는가,
// 받는 사람이 담당자 개인인가)을 대표가 결재 문서에서 체크해야 나간다. 후속 메일은 자동 모드면 근무 시간에 바로 보낸다.
//
// 보내는 주소는 유메 도메인(MAIL_FROM_YUME)이어야 한다 — 인증 전에는 결재까지만 올리고 발송은 막는다.
import { all } from "../../db.js";
import { auditDetail, lintCopy, markSent, MANUAL_CHECKS, setStage, shareReport, updateAudit } from "../../auditDesk.js";
import { clientAuditMail } from "../../auditClientMail.js";
import { COMPANY } from "../../renderPages.js";

export const base = () => (process.env.PUBLIC_BASE_URL || "https://www.yume-reamer.com").replace(/\/+$/, "");

/** 첫 연락·후속 메일의 보내는 사람. 유메 도메인이 인증돼 있을 때만(아니면 null). */
export function outreachFrom() {
  const raw = process.env.MAIL_FROM_OUTREACH || process.env.MAIL_FROM_YUME || "";
  const m = /<([^>]+)>/.exec(raw);
  const addr = (m ? m[1] : raw).trim();
  if (!addr || !/yume-reamer\.com$/i.test(addr)) return null;
  return process.env.MAIL_FROM_OUTREACH || `${COMPANY.ceo} (유메) <${addr}>`;
}

export const isPaidOrder = (a) => /유료 주문/.test(String(a.found_via || ""));

/** 법무 검토(도윤) — 발송 문구 점검. 통과 못 하면 결재에 올리지 않는다. */
export function legalReview(subject, body) {
  const hits = lintCopy(`${subject}\n${body}`);
  return hits.length ? { ok: false, note: hits.map((h) => `“${h.match}” — ${h.why}`).join(" / ") } : { ok: true, note: "압박·과장 표현 없음 · 비공개 문장·수신 거부 안내 확인" };
}

export async function run(ctx) {
  const notes = [];
  // ① 첫 메일 — 재확인이 끝나고, 사람만 확인할 수 있는 줄 말고는 체크리스트가 다 통과한 영업 건.
  const ready = await all(
    `SELECT * FROM ai_audits WHERE sent_at IS NULL AND closed_at IS NULL AND tos_verdict = 'ok' AND stage = 'reviewed' ORDER BY id ASC LIMIT 10`,
  );
  for (const a of ready) {
    if (isPaidOrder(a)) continue; // 유료 고객 보고서는 경영지원팀(민재)이 보낸다
    const dedupe = `send:audit:${a.id}`;
    if (await ctx.hasProposal(dedupe)) continue;
    let d = await auditDetail(a.id, { base: base() });
    const blocking = d.checklist.items.filter((c) => !c.ok && !MANUAL_CHECKS.includes(c.key));
    if (blocking.length) {
      await ctx.log(`${a.company} 첫 메일 보류 — ${blocking.map((c) => c.label).join(" / ")}`, { level: "warn", ref: `audit:${a.id}` });
      continue;
    }
    const legal = legalReview(d.mail.first.subject, d.mail.first.body);
    if (!legal.ok) {
      await ctx.log(`${a.company} 첫 메일 문구가 법무 검토에서 걸렸어요`, { level: "warn", detail: legal.note, ref: `audit:${a.id}` });
      continue;
    }
    // 대표가 결재 전에 보고서를 읽을 수 있게 비공개 링크를 미리 만든다(받는 사람에게는 승인 뒤에만 나간다).
    if (!d.audit.report_token) {
      const s = await shareReport(a.id);
      if (s.error) {
        await ctx.log(`${a.company} 보고서 링크를 만들지 못했어요`, { level: "warn", detail: s.error, ref: `audit:${a.id}` });
        continue;
      }
      d = await auditDetail(a.id, { base: base() });
    }
    await ctx.propose({
      kind: "send_first",
      title: `첫 메일 발송 — ${a.company}`,
      summary: `제목: ${d.mail.first.subject}\n받는 사람: ${a.contact_email || "(없음 — 결재 문서에서 적어 주세요)"}\n결과: 답변 ${d.results.answered}개 중 오류 ${new Set(d.findings.filter((f) => f.polarity === "issue" && f.review === "confirmed").map((f) => f.item_id)).size}개`,
      payload: { auditId: Number(a.id), to: a.contact_email || "", subject: d.mail.first.subject, legal: legal.note, reportUrl: d.reportUrl },
      ref: `audit:${a.id}`,
      dedupe,
    });
    await ctx.log(`${a.company} 첫 메일을 기안해 결재를 올렸어요`, { ref: `audit:${a.id}` });
    notes.push(`${a.company} 첫 메일 기안`);
  }

  // ② 후속 메일 1회 — 보낸 지 7일, 답이 없고 아직 후속을 안 보낸 건.
  const due = await all(
    `SELECT * FROM ai_audits WHERE sent_at IS NOT NULL AND replied_at IS NULL AND followed_up_at IS NULL AND closed_at IS NULL
        AND followup_due_at IS NOT NULL AND followup_due_at <= :t ORDER BY id ASC LIMIT 10`,
    { t: Date.now() },
  );
  for (const a of due) {
    const dedupe = `followup:audit:${a.id}`;
    if (await ctx.hasProposal(dedupe)) continue;
    const d = await auditDetail(a.id, { base: base() });
    const legal = legalReview(d.mail.followup.subject, d.mail.followup.body);
    if (!legal.ok) {
      await ctx.log(`${a.company} 후속 메일 문구가 법무 검토에서 걸렸어요`, { level: "warn", detail: legal.note, ref: `audit:${a.id}` });
      continue;
    }
    const payload = { auditId: Number(a.id), to: a.contact_email, subject: d.mail.followup.subject, body: d.mail.followup.body, legal: legal.note };
    if (ctx.autonomy === "auto" && ctx.businessHours() && outreachFrom()) {
      const r = await sendFollowup(payload, {}, ctx.deps);
      await ctx.log(r.ok ? `${a.company} 후속 메일을 보냈어요 (자동)` : `${a.company} 후속 메일 실패: ${r.result}`, { level: r.ok ? "info" : "warn", ref: `audit:${a.id}` });
      continue;
    }
    await ctx.propose({ kind: "send_followup", title: `후속 메일 1회 — ${a.company}`, summary: `제목: ${payload.subject}\n받는 사람: ${payload.to}\n\n${payload.body}`, payload, ref: `audit:${a.id}`, dedupe });
    await ctx.log(`${a.company} 후속 메일을 기안했어요`, { ref: `audit:${a.id}` });
    notes.push(`${a.company} 후속 기안`);
  }
  return { note: notes.length ? notes.join(" · ") : "보낼 메일 없음" };
}

// ── 결재 승인 후 실행 ────────────────────────────────────────────────
export async function sendFirst(payload, input = {}, deps = {}) {
  const from = outreachFrom();
  if (!from) return { ok: false, result: "유메 메일 주소(yume-reamer.com) 인증 전이라 보낼 수 없어요. 도메인 인증 후 다시 승인해 주세요." };
  const checks = input.checks || {};
  const missing = MANUAL_CHECKS.filter((k) => !checks[k]);
  if (missing.length) return { ok: false, result: "결재 문서의 확인 세 줄을 모두 체크해 주세요." };
  const to = String(input.to || payload.to || "").trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return { ok: false, result: "받는 사람 이메일을 적어 주세요." };
  await updateAudit(payload.auditId, { contact_email: to, checklist: Object.fromEntries(MANUAL_CHECKS.map((k) => [k, true])) });
  let d = await auditDetail(payload.auditId, { base: base() });
  if (!d.audit.report_token) {
    const s = await shareReport(payload.auditId);
    if (s.error) return { ok: false, result: s.error };
    d = await auditDetail(payload.auditId, { base: base() });
  }
  if (!d.checklist.passed) return { ok: false, result: `체크리스트 미통과: ${d.checklist.items.filter((c) => !c.ok).map((c) => c.label).join(" / ")}` };
  const mail = clientAuditMail(d);
  await (deps.sendMail)({ from, to, replyTo: COMPANY.email, subject: mail.subject, html: mail.html, text: mail.text });
  const m = await markSent(payload.auditId, { base: base() });
  if (m.error) return { ok: false, result: `메일은 보냈지만 발송 처리 실패: ${m.error}` };
  return { ok: true, result: `${to}로 보냄 · 후속 연락일 ${new Date(m.followup_due_at + 9 * 3600_000).toISOString().slice(5, 10)}` };
}

const htmlOf = (text) =>
  `<div style="font-family:-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;font-size:15px;line-height:1.75;color:#2b2735;white-space:pre-wrap">${String(text).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]))}</div>`;

export async function sendFollowup(payload, input = {}, deps = {}) {
  const from = outreachFrom();
  if (!from) return { ok: false, result: "유메 메일 주소 인증 전이라 보낼 수 없어요." };
  const to = String(input.to || payload.to || "").trim();
  if (!to) return { ok: false, result: "받는 사람이 없어요." };
  await (deps.sendMail)({ from, to, replyTo: COMPANY.email, subject: payload.subject, text: payload.body, html: htmlOf(payload.body) });
  const s = await setStage(payload.auditId, "followed_up");
  return s.error ? { ok: false, result: `보냈지만 단계 변경 실패: ${s.error}` } : { ok: true, result: `${to}로 후속 메일 보냄` };
}

export { htmlOf };
