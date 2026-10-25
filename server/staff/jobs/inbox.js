// 서윤 — 비서실 메일 담당. 대표 메일함(reamer@d-reamer.com)을 10분마다 열어 새 메일을 분류하고,
// 답장이 필요한 메일은 답장 초안을 붙여 결재로 올린다(대표가 고치거나 그대로 승인하면 대표 주소로 나간다).
//
//   · 수신 거부 — 그 회사 감사 건을 '거절(수신 거부)'로 닫는다. 다시는 메일이 나가지 않는다.
//   · 감사 메일에 온 답장 — 감사 건을 '답장' 단계로 올리고 답장 초안을 결재로.
//   · 고객·문의 — 답장 초안을 결재로. 가격·일정은 아래 사실표에 있는 것만 쓴다.
//   · 알림·광고·자동 발송 — 분류만 하고 넘긴다(AI 비용도 쓰지 않는다).
import { all, now, one, run as exec } from "../../db.js";
import { getSetting, setSetting, setStage } from "../../auditDesk.js";
import { API_RATES, AUDIT_LEAD, AUDIT_RATES } from "../../apiRates.js";
import { COMPANY } from "../../renderPages.js";
import { gmailConfigured, gmailUser, loadGmailCreds } from "../gmail.js";
import { sync as syncTodos } from "../todos.js";

const won = (n) => `${Number(n).toLocaleString("ko-KR")}원`;
const FACTS = () => [
  `회사: ${COMPANY.name} (대표 ${COMPANY.ceo}), 서비스: 베리라인 — AI 답변을 법령 원문과 대조하는 할루시네이션 검사·감사.`,
  `감사(VAT 별도): ${Object.values(AUDIT_RATES).map((a) => `${a.label} ${won(a.krw)}`).join(", ")}. 입금 확인 후 ${AUDIT_LEAD} 안에 보고서.`,
  `API(VAT 별도, 1,000자마다 1건): 종량제 건당 ${won(API_RATES.metered.unitKrw)}, ${API_RATES.tiers.map((t) => `${t.label} 월 ${won(t.monthlyKrw)}(${t.calls}건)`).join(", ")}, 엔터프라이즈 상담.`,
  "구매: business.yume-reamer.com 에서 견적서를 바로 받고 신청. 결제는 계좌이체(전자세금계산서) 또는 법인카드.",
].join("\n");

const SYSTEM = () => `당신은 1인 스타트업 대표의 비서입니다. 대표 메일함에 온 메일 한 통을 분류하고, 답장이 필요하면 대표 이름으로 보낼 답장 초안을 씁니다.

분류(category): audit_reply(우리가 보낸 감사 결과 메일에 대한 답장) · customer(견적·주문·계약 중인 고객) · inquiry(새 문의·제휴 제안) · unsubscribe(그만 보내 달라, 수신 거부) · vendor(우리가 쓰는 서비스·거래처의 사람 메일) · notice(자동 알림·영수증·보안 알림) · spam(광고·스팸) · personal(대표 개인 용무) · other.
needs_reply: 사람이 보낸 메일이고 대표가 답해야 예의·거래가 이어지면 true. 자동 알림·광고·수신 거부는 false.

답장 초안 규칙:
- 한국어 존댓말, 짧고 구체적으로. 끝은 "감사합니다." 다음 줄에 "${COMPANY.ceo} 드림".
- 가격·일정·조건은 아래 사실표에 있는 것만. 없는 할인·기한·약속을 만들지 마세요. 모르는 사실은 [확인 필요: …]로 남기세요.
- '보증', '100%', '인증' 같은 표현과 압박하는 문장 금지. 감사 결과의 세부 내용은 보고서에 있는 것만.
- 통화·미팅을 원하면 상대가 편한 시간 두세 개를 알려 달라고 하세요.

사실표:
${FACTS()}

JSON 하나만: {"category":"","needs_reply":true,"urgency":"high|normal|low","summary":"한두 문장","draft":"답장 본문(needs_reply가 false면 빈칸)"}`;

const isAutomated = (m) =>
  (m.autoSubmitted && m.autoSubmitted !== "no") || !!m.listId || /no-?reply|mailer-daemon|notifications?@|alert/i.test(m.from);

/** 보낸 사람과 이어진 감사 건·견적(같은 주소, 없으면 같은 회사 도메인). */
async function contextOf(from) {
  const domain = from.split("@")[1] || "";
  const generic = /gmail\.com|naver\.com|daum\.net|hanmail\.net|kakao\.com|outlook\.com|hotmail\.com|icloud\.com/i.test(domain);
  const audit = await one(
    `SELECT * FROM ai_audits WHERE LOWER(contact_email) = :e ${generic || !domain ? "" : "OR LOWER(contact_email) LIKE :d OR LOWER(service_url) LIKE :h"} ORDER BY (sent_at IS NULL), id DESC LIMIT 1`,
    { e: from, d: `%@${domain}`, h: `%${domain}%` },
  );
  const quote = await one("SELECT * FROM b2b_quotes WHERE LOWER(email) = :e OR LOWER(billing_json) LIKE :j ORDER BY id DESC LIMIT 1", { e: from, j: `%${from}%` });
  return { audit, quote };
}

function contextLine({ audit, quote }) {
  const out = [];
  if (audit) out.push(`이 사람(회사)은 감사 #${audit.id} ${audit.company}(${audit.service_name})의 담당자로 보입니다. 단계: ${audit.stage}${audit.sent_at ? ", 우리가 감사 결과 메일을 보냈음" : ""}.`);
  if (quote) out.push(`견적·주문 고객입니다: 상품 ${quote.product}, 합계 ${won(quote.total_krw)}, 상태 ${quote.status}.`);
  return out.join(" ") || "우리 기록에 없는 새 상대입니다.";
}

export async function run(ctx) {
  // 대표 할 일 정리(비서 몫) — 서버가 확인할 수 있는 일은 됐으면 닫고, 오늘 보여 줄 목록을 맞춘다. AI를 쓰지 않는다.
  await loadGmailCreds().catch(() => {});
  const todos = await syncTodos(ctx.deps).catch(() => []);
  if (!gmailConfigured()) return { note: `대표 할 일 ${todos.length}건 정리 · 메일함 연결 전(대표 할 일에 있음)` };
  const lastUid = Number(await getSetting("gmail:last_uid").catch(() => 0)) || 0;
  const validity = await getSetting("gmail:uid_validity").catch(() => null);
  const { uidValidity, messages } = await ctx.deps.gmailFetch({ sinceUid: lastUid, uidValidity: validity });
  const me = gmailUser().toLowerCase();
  // 대표 개인 주소 목록(공개 저장소라 코드에 적지 않고 DB 설정에 둔다 — 쉼표로 구분).
  const ownerAddrs = String((await getSetting("owner_addresses").catch(() => "")) || "").toLowerCase().split(",").map((s) => s.trim()).filter(Boolean);
  let seen = 0;
  let replies = 0;
  let usd = 0;
  let maxUid = lastUid;
  for (const m of messages) {
    maxUid = Math.max(maxUid, Number(m.uid) || 0);
    if (m.from === me) continue;
    // 대표 본인이 보낸 메일(개인 주소로 시험해 본 답장 등)에는 답장 초안을 만들지 않는다 — 분류만 남긴다.
    const fromOwner = m.fromName === COMPANY.ceo || ownerAddrs.includes(m.from);
    if (await one("SELECT 1 AS x FROM mail_inbox WHERE message_id = :id", { id: m.messageId })) continue;
    seen += 1;
    const c = await contextOf(m.from);
    let r = { category: "notice", needs_reply: false, urgency: "low", summary: m.subject, draft: "" };
    if (fromOwner) r = { ...r, category: "personal", summary: `대표 본인 메일 — ${m.subject}` };
    else if (!isAutomated(m)) {
      const out = await ctx.deps.ai({
        system: SYSTEM(),
        user: `보낸 사람: ${m.fromName ? `${m.fromName} ` : ""}<${m.from}>\n받은 시각: ${new Date(m.date + 9 * 3600_000).toISOString().slice(0, 16).replace("T", " ")}\n제목: ${m.subject}\n우리 기록: ${contextLine(c)}\n\n본문:\n${m.text.slice(0, 6000)}`,
        maxTokens: 3000,
        label: "staff:inbox",
      });
      usd += out.usd || 0;
      r = { ...r, ...(out.json || {}) };
    }
    const category = String(r.category || "other").slice(0, 20);
    let approvalId = null;

    if (category === "unsubscribe" && c.audit && !c.audit.closed_at) {
      await exec("UPDATE ai_audits SET stage = 'declined', closed_at = :t, outcome = 'declined', decline_reason = :r, updated_at = :t WHERE id = :id", { id: c.audit.id, t: now(), r: `수신 거부(메일 회신 ${m.from})` });
      await ctx.log(`${c.audit.company} 수신 거부 — 감사 건을 닫고 더 연락하지 않게 했어요`, { ref: `audit:${c.audit.id}` });
    }
    if (category === "audit_reply" && c.audit?.sent_at && !c.audit.replied_at) {
      await setStage(c.audit.id, "replied").catch(() => {});
    }
    if (r.needs_reply && category !== "unsubscribe" && !fromOwner) {
      approvalId = await ctx.propose({
        kind: "reply_mail",
        title: `답장 — ${m.fromName || m.from}: ${m.subject || "(제목 없음)"}`,
        summary: `${r.summary || ""}${c.audit || c.quote ? `\n관련: ${contextLine(c)}` : ""}`,
        payload: {
          uid: m.uid,
          messageId: m.messageId,
          references: m.references,
          to: m.from,
          fromName: m.fromName,
          subject: m.subject,
          date: m.date,
          original: m.text.slice(0, 5000),
          draft: String(r.draft || "").slice(0, 5000),
          category,
          urgency: r.urgency || "normal",
        },
        ref: c.audit ? `audit:${c.audit.id}` : c.quote ? `quote:${c.quote.id}` : null,
        dedupe: `reply:${m.messageId}`,
      });
      replies += 1;
      if (r.urgency === "high") await ctx.notify(`[베리라인 결재] 급한 답장 — ${m.fromName || m.from}`, `${r.summary || m.subject}\n${(process.env.PUBLIC_BASE_URL || "https://www.yume-reamer.com").replace(/\/+$/, "")}/admin/staff`);
    }
    await exec(
      `INSERT INTO mail_inbox (message_id, uid, from_addr, from_name, subject, received_at, category, needs_reply, summary, ref, approval_id, created_at)
       VALUES (:mid, :uid, :f, :fn, :s, :d, :c, :nr, :sum, :ref, :ap, :t) ON CONFLICT (message_id) DO NOTHING`,
      {
        mid: m.messageId, uid: m.uid, f: m.from, fn: String(m.fromName || "").slice(0, 120), s: String(m.subject || "").slice(0, 300), d: m.date,
        c: category, nr: r.needs_reply ? 1 : 0, sum: String(r.summary || "").slice(0, 500), ref: c.audit ? `audit:${c.audit.id}` : c.quote ? `quote:${c.quote.id}` : null, ap: approvalId, t: now(),
      },
    );
  }
  await setSetting("gmail:last_uid", String(maxUid));
  await setSetting("gmail:uid_validity", String(uidValidity));
  if (seen) await ctx.log(`메일 ${seen}통을 정리했어요${replies ? ` — 답장 필요 ${replies}통은 초안과 함께 결재로` : ""}`, { costUsd: usd });
  return { note: seen ? `새 메일 ${seen}통 · 답장 결재 ${replies}` : "새 메일 없음" };
}

/** 오늘 받은 메일 분류 — 아침 브리핑용. */
export async function inboxDigest(since) {
  return all("SELECT category, COUNT(*) AS n, SUM(needs_reply) AS r FROM mail_inbox WHERE received_at >= :s GROUP BY category", { s: since });
}
