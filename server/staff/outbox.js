// 대표 주소로 나가는 메일 대기열.
//
// 2026-10-14 실제 발송에서 "Connection timeout": Railway는 메일 발송 포트(SMTP 465·587)를 막아 서버가 Gmail로 직접 보낼 수 없다
// (받기 — IMAP 993 — 는 된다). 그래서 대표가 답장을 결재하면 여기 넣고, 대표 PC의 현장 요원(scripts/field-agent.mjs)이 30초마다
// 꺼내 Gmail로 보낸다 — 대표 주소에서 나가고, 원래 대화에 붙고, 보낸편지함에 남는다. 보내면 결재 기록에 "보냄"을, 실패하면 결재를
// 다시 결재함으로 돌려 이유를 보여 준다.
import { all, now, one, run } from "../db.js";

export async function enqueue({ kind = "reply", to, subject = "", text = "", inReplyTo = "", references = "", fromName = "", uid = null, approvalId = null }) {
  const r = await run(
    `INSERT INTO mail_outbox (kind, to_addr, subject, body, in_reply_to, refs, from_name, uid, approval_id, created_at)
     VALUES (:k, :to, :s, :b, :ir, :rf, :fn, :uid, :ap, :t) RETURNING id`,
    { k: kind, to: String(to).slice(0, 300), s: String(subject).slice(0, 300), b: String(text).slice(0, 20_000), ir: inReplyTo || null, rf: references || null, fn: fromName || null, uid: uid || null, ap: approvalId || null, t: now() },
  );
  return { queued: true, id: Number(r.rows[0].id) };
}

/** 보낼 것 하나를 잡는다(두 대가 같은 메일을 보내지 않게). */
export async function claimNext() {
  const m = await one("SELECT * FROM mail_outbox WHERE status = 'queued' ORDER BY id ASC LIMIT 1");
  if (!m) return null;
  const r = await run("UPDATE mail_outbox SET status = 'sending' WHERE id = :id AND status = 'queued'", { id: m.id });
  return r.changes ? m : null;
}

const hhmm = (t) => new Date(t + 9 * 3600_000).toISOString().slice(11, 16);

export async function markSent(m) {
  const t = now();
  await run("UPDATE mail_outbox SET status = 'sent', sent_at = :t, error = NULL WHERE id = :id", { id: m.id, t });
  if (m.approval_id) await run("UPDATE staff_approvals SET status = 'done', result = :r WHERE id = :id", { id: m.approval_id, r: `${m.to_addr}에게 보냄 ${hhmm(t)} (대표 메일함 보낸편지함에 남음)` });
  await run("INSERT INTO staff_log (staff, title, ref, level, cost_usd, created_at) VALUES ('seoyun', :title, :ref, 'info', 0, :t)", { title: `답장을 보냈어요 — ${m.to_addr}: ${m.subject}`.slice(0, 200), ref: m.approval_id ? `approval:${m.approval_id}` : null, t });
}

export async function markFailed(m, error) {
  const msg = String(error?.message || error).slice(0, 300);
  await run("UPDATE mail_outbox SET status = 'failed', error = :e WHERE id = :id", { id: m.id, e: msg });
  // 결재함으로 되돌린다 — 대표가 이유를 보고 다시 승인(다시 대기열에 넣음)할 수 있게.
  if (m.approval_id) await run("UPDATE staff_approvals SET status = 'pending', result = :r WHERE id = :id", { id: m.approval_id, r: `발송 실패: ${msg}` });
}

export const pending = () => all("SELECT id, to_addr, subject, status, created_at FROM mail_outbox WHERE status IN ('queued','sending') ORDER BY id");
