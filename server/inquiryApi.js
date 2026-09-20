// 개발 외주 문의 접수.
//
// 리머 소개 사이트는 별도 도메인에 정적으로 배포되어 서버가 없다. 그래서 문의는
// 여기(유메 서버)로 교차 출처 요청을 보내고, 허용한 출처만 받는다 — 감사 API와 같은 방식이다.
//
// 메일로만 보내지 않고 **먼저 DB에 남긴다.** 메일은 실패할 수 있고(발송 한도, 스팸 처리,
// 키 만료) 실패하면 문의가 그대로 사라진다. 일감 문의를 잃는 건 되돌릴 수 없으니,
// 저장이 성공하면 접수로 보고 메일 발송은 그다음에 시도한다. 메일이 실패해도
// 사용자에게는 접수됐다고 답한다 — 실제로 남아 있기 때문이다.
import { Router } from "express";
import { clientIp, createLimiter, limitMiddleware, crossOriginGate } from "./security.js";
import { now, run, all } from "./db.js";
import { mailConfigured, sendMail } from "./mailer.js";
import { logError } from "./errorLog.js";

export const inquiryRouter = Router();

// 감사 API와 같은 허용목록 방식. AUDIT_ALLOWED_ORIGINS를 물려받으므로, 두 사이트를 한 곳에
// 적어 두면 따로 설정하지 않아도 동작한다.
const cors = crossOriginGate("INQUIRY_ALLOWED_ORIGINS", "AUDIT_ALLOWED_ORIGINS");

inquiryRouter.options("/inquiry", cors);

// 사람이 직접 쓰는 양식이다. 분당 몇 번씩 보낼 일이 없으므로 넉넉하되 낮게 잡는다.
const limiter = createLimiter({ windowMs: 60 * 60 * 1000, max: 8 });

const clean = (v, max) => String(v ?? "").trim().slice(0, max);
const looksEmail = (v) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);

// 어떤 일인지 고르게 해 두면 회신할 때 무엇부터 물어야 하는지가 정해진다.
export const INQUIRY_KINDS = {
  web: "웹사이트 · 웹서비스",
  app: "모바일 앱",
  ai: "AI 기능 연동",
  automation: "업무 자동화 · 데이터",
  maintain: "기존 서비스 개선 · 유지보수",
  other: "그 외",
};

const BUDGETS = {
  "under-500": "500만원 미만",
  "500-1000": "500만~1,000만원",
  "1000-3000": "1,000만~3,000만원",
  "over-3000": "3,000만원 이상",
  undecided: "아직 미정",
};

inquiryRouter.post("/inquiry", cors, limitMiddleware(limiter, (req) => `inquiry:${clientIp(req)}`), async (req, res) => {
  const name = clean(req.body?.name, 60);
  const contact = clean(req.body?.contact, 200);
  const company = clean(req.body?.company, 100);
  const kind = clean(req.body?.kind, 30);
  const budget = clean(req.body?.budget, 30);
  const message = clean(req.body?.message, 4000);
  // 보이지 않는 칸이다. 사람은 비워 두고 자동 제출 봇은 채운다.
  const trap = clean(req.body?.website, 200);

  if (!name) return res.status(400).json({ error: "성함을 입력해주세요." });
  if (!contact) return res.status(400).json({ error: "연락받으실 이메일이나 전화번호를 입력해주세요." });
  if (message.length < 10) return res.status(400).json({ error: "어떤 걸 만들고 싶으신지 조금만 더 적어주세요." });

  // 봇이면 접수된 것처럼 답하고 아무것도 하지 않는다. 오류를 주면 무엇이 걸렸는지 알려 주는 셈이다.
  if (trap) return res.status(201).json({ ok: true });

  const kindLabel = INQUIRY_KINDS[kind] || INQUIRY_KINDS.other;
  const budgetLabel = BUDGETS[budget] || "아직 미정";

  const row = await run(
    `INSERT INTO inquiries (name, contact, company, kind, budget, message, ip, created_at)
     VALUES (:name, :contact, :company, :kind, :budget, :message, :ip, :t) RETURNING id`,
    { name, contact, company: company || null, kind: kindLabel, budget: budgetLabel, message, ip: clientIp(req), t: now() },
  );
  const id = row.rows[0]?.id;

  // 여기서부터는 실패해도 접수는 유효하다. 기다리게 하지 않고 바로 응답한다.
  res.status(201).json({ ok: true });

  if (!mailConfigured()) return;
  const to = process.env.INQUIRY_TO || process.env.COMPANY_EMAIL || "reamer@d-reamer.com";
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  sendMail({
    to,
    subject: `[리머 문의 #${id}] ${name} · ${kindLabel}`,
    text: [
      `이름: ${name}`,
      company ? `회사: ${company}` : null,
      `연락처: ${contact}`,
      `종류: ${kindLabel}`,
      `예산: ${budgetLabel}`,
      "",
      message,
    ].filter(Boolean).join("\n"),
    html: `<div style="font-family:system-ui,sans-serif;line-height:1.7;color:#141118">
      <p style="margin:0 0 14px;font-size:13px;color:#8B8694">리머 개발 문의 #${id}</p>
      <table style="border-collapse:collapse;font-size:14px">
        <tr><td style="padding:3px 14px 3px 0;color:#8B8694">이름</td><td><b>${esc(name)}</b></td></tr>
        ${company ? `<tr><td style="padding:3px 14px 3px 0;color:#8B8694">회사</td><td>${esc(company)}</td></tr>` : ""}
        <tr><td style="padding:3px 14px 3px 0;color:#8B8694">연락처</td><td>${esc(contact)}</td></tr>
        <tr><td style="padding:3px 14px 3px 0;color:#8B8694">종류</td><td>${esc(kindLabel)}</td></tr>
        <tr><td style="padding:3px 14px 3px 0;color:#8B8694">예산</td><td>${esc(budgetLabel)}</td></tr>
      </table>
      <p style="margin:18px 0 0;white-space:pre-wrap">${esc(message)}</p>
    </div>`,
  }).catch((e) => logError("inquiry:mail", e));
});

export function listInquiries(limit = 100) {
  return all("SELECT * FROM inquiries ORDER BY id DESC LIMIT :limit", { limit });
}
