// 유나 — 비서실장. 매일 아침 대표에게 한 장짜리 브리핑을 보낸다: 결재 대기, 오늘 마감, 어제 들어온 돈, 직원들이 한 일, AI 비용.
// 대표에게 가는 내부 메일이라 결재 없이 보낸다.
import { all, one } from "../../db.js";
import { workList } from "../../workList.js";
import { engineState } from "../../upstream.js";
import { USD_KRW } from "../../costGuard.js";
import { kstDayStart, listApprovals } from "../store.js";
import { base } from "./sales.js";
import { inboxDigest } from "./inbox.js";
import { list as listTodos } from "../todos.js";

const won = (n) => `${Math.round(Number(n) || 0).toLocaleString("ko-KR")}원`;

export async function briefing(at = Date.now(), roster = {}) {
  const today = kstDayStart(at);
  const yesterday = today - 86_400_000;
  const approvals = await listApprovals({ status: "pending" });
  const w = await workList(at);
  const paid = await one("SELECT COUNT(*) AS n, COALESCE(SUM(total_krw), 0) AS krw FROM b2b_quotes WHERE paid_at >= :y AND paid_at < :t", { y: yesterday, t: today });
  const quoted = await one("SELECT COUNT(*) AS n FROM b2b_quotes WHERE created_at >= :y AND created_at < :t", { y: yesterday, t: today });
  const logs = await all("SELECT staff, COUNT(*) AS n, COALESCE(SUM(cost_usd), 0) AS usd FROM staff_log WHERE created_at >= :y AND created_at < :t AND level = 'info' GROUP BY staff", { y: yesterday, t: today });
  const audits = await one("SELECT COALESCE(SUM(cost_usd), 0) AS usd FROM verifications WHERE source = 'audit' AND created_at >= :y AND created_at < :t", { y: yesterday, t: today });
  const staffUsd = logs.reduce((s, r) => s + Number(r.usd), 0) + Number(audits?.usd || 0);
  const mails = await inboxDigest(yesterday).catch(() => []);
  const mailTotal = mails.reduce((n, r) => n + Number(r.n), 0);
  const mailReply = mails.reduce((n, r) => n + Number(r.r || 0), 0);
  const todoList = await listTodos().catch(() => []);
  const eng = engineState();
  const name = (id) => roster[id]?.name || id;
  const lines = [
    `대표님, 좋은 아침입니다. 비서실장 유나입니다.`,
    "",
    `■ 오늘 할 일 ${todoList.length}건 (대표님만 할 수 있는 일)`,
    ...todoList.slice(0, 8).map((t) => `  □ ${t.title}${t.age ? ` (${t.age}일째)` : ""}`),
    "",
    `■ 결재 대기 ${approvals.length}건`,
    ...approvals.slice(0, 8).map((a) => `  · ${a.title} (${name(a.staff)})`),
    approvals.length > 8 ? `  · 외 ${approvals.length - 8}건` : null,
    "",
    `■ 오늘 할 감사 ${w.now.length}건${w.now.some((c) => c.overdue) ? ` — 마감 지남 ${w.now.filter((c) => c.overdue).length}건` : ""}`,
    ...w.now.slice(0, 5).map((c) => `  · ${c.company} · ${c.productLabel} · ${c.overdue ? "마감 지남" : `영업일 ${c.daysLeft}일 남음`}`),
    `■ 입금 확인 기다림 ${w.pay.length}건`,
    `■ 메일(어제부터) ${mailTotal}통 — 답장 필요 ${mailReply}통은 초안과 함께 결재함에`,
    "",
    `■ 어제`,
    `  · 입금 확인 ${Number(paid?.n || 0)}건 ${won(paid?.krw)} · 새 견적 ${Number(quoted?.n || 0)}건`,
    ...logs.map((r) => `  · ${name(r.staff)}: ${r.n}건 처리`),
    `  · AI 비용 약 ${won(staffUsd * USD_KRW)} (직원 업무 + 감사 채점)`,
    "",
    eng.ok ? "■ 검사 엔진 정상" : `■ ⚠ 검사 엔진 멈춤 — ${eng.code === "credit_exhausted" ? "Anthropic 잔액 충전 필요" : "API 키 확인 필요"} (결제·감사가 막힙니다)`,
    "",
    `결재함: ${base()}/admin/staff`,
  ].filter((l) => l !== null);
  return { subject: `[베리라인 아침 브리핑] 할 일 ${todoList.length} · 결재 ${approvals.length} · 감사 ${w.now.length} · 입금 대기 ${w.pay.length}`, text: lines.join("\n") };
}

export async function run(ctx) {
  const b = await briefing(Date.now(), ctx.roster);
  await ctx.deps.sendMail({ brand: "YUME", to: ctx.owner(), subject: b.subject, text: b.text });
  await ctx.log("대표님께 아침 브리핑을 보냈어요", { detail: b.text });
  return { note: "아침 브리핑 발송" };
}
