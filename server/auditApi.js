// 무료 할루시네이션 감사 API (B2B 리드).
//
// 문항의 정답(groundTruth·oracle)은 절대 발급 응답에 넣지 않는다. 정답이 딸려 나가면
// 그걸 그대로 자기 AI에 붙여넣어 만점을 만들 수 있고, 그러면 이 감사는 의미가 없다.
// 발급 때 만든 문항은 서버에 세션으로 두고, 채점 때 세션 id로 다시 꺼내 쓴다.
import { Router } from "express";
import { randomToken, clientIp, createLimiter, limitMiddleware } from "./security.js";
import { buildProbeSet, runAudit } from "./audit/index.js";
import { logError } from "./errorLog.js";
import { renderAuditReport } from "./renderAuditReport.js";

export const auditRouter = Router();

// 기업용 사이트는 별도 도메인에 따로 배포되므로, 감사 API는 교차 출처로 불린다.
// 이 엔드포인트들은 쿠키도 세션도 쓰지 않고 IP 레이트리밋만으로 보호되니 열어도 되지만,
// 아무 출처나 받지는 않는다 — AUDIT_ALLOWED_ORIGINS에 적힌 곳만 허용한다.
// 환경변수를 비워두면 아무 것도 추가되지 않아 같은 출처에서만 동작한다(기존과 동일).
const ALLOWED_ORIGINS = new Set(
  (process.env.AUDIT_ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);

auditRouter.use((req, res, next) => {
  const origin = req.get("origin");
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.set("Access-Control-Allow-Origin", origin);
    res.set("Vary", "Origin");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.set("Access-Control-Max-Age", "600");
  }
  if (req.method === "OPTIONS") return res.sendStatus(origin && ALLOWED_ORIGINS.has(origin) ? 204 : 403);
  next();
});

// 감사 세션은 짧게만 살아 있으면 된다. 문항을 받아 자기 AI에 넣고 붙여넣는 시간이면 충분하다.
const SESSION_TTL_MS = 2 * 60 * 60 * 1000;
const MAX_SESSIONS = 500;
const sessions = new Map();

function putSession(probes, meta) {
  if (sessions.size >= MAX_SESSIONS) {
    // 가장 오래된 것부터 정리한다.
    const oldest = [...sessions.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt).slice(0, 50);
    for (const [k] of oldest) sessions.delete(k);
  }
  const id = randomToken(18);
  sessions.set(id, { probes, meta, createdAt: Date.now() });
  return id;
}

function getSession(id) {
  const s = sessions.get(id);
  if (!s) return null;
  if (Date.now() - s.createdAt > SESSION_TTL_MS) {
    sessions.delete(id);
    return null;
  }
  return s;
}

// 채점 결과는 링크로 사내에 돌릴 수 있어야 리드 도구로 쓸모가 있다. 짧게 보관한다.
const reports = new Map();
const REPORT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function putReport(report) {
  if (reports.size >= MAX_SESSIONS) {
    const oldest = [...reports.entries()].sort((a, b) => a[1].at - b[1].at).slice(0, 50);
    for (const [k] of oldest) reports.delete(k);
  }
  const id = randomToken(12);
  reports.set(id, { report, at: Date.now() });
  return id;
}

export function getAuditReport(id) {
  const r = reports.get(id);
  if (!r) return null;
  if (Date.now() - r.at > REPORT_TTL_MS) {
    reports.delete(id);
    return null;
  }
  return r.report;
}

export { renderAuditReport };

const issueLimiter = createLimiter({ windowMs: 60 * 60 * 1000, max: 10 });
const gradeLimiter = createLimiter({ windowMs: 60 * 60 * 1000, max: 20 });

// ── 1단계: 문항 발급 ────────────────────────────────────────────────────
auditRouter.post(
  "/audit/probes",
  limitMiddleware(issueLimiter, (req) => `audit:issue:${clientIp(req)}`),
  async (req, res) => {
    const domain = ["법률", "의료", "금융", "일반"].includes(req.body?.domain) ? req.body.domain : "법률";
    const size = Math.min(Math.max(Number(req.body?.size) || 8, 4), 10);
    try {
      const probes = await buildProbeSet({ domain, size });
      if (probes.length === 0) {
        return res.status(503).json({ error: "지금은 문항을 만들 수 없어요. 공식 데이터 조회가 일시적으로 불안정합니다. 잠시 후 다시 시도해주세요." });
      }
      const sessionId = putSession(probes, { domain, subject: String(req.body?.subject || "").slice(0, 120) });
      res.json({
        session_id: sessionId,
        domain,
        expires_in_sec: Math.floor(SESSION_TTL_MS / 1000),
        instructions:
          "아래 질문을 귀사에서 쓰는 AI에 그대로 하나씩 넣고, 받은 답변을 그대로 붙여넣어 주세요. " +
          "답변을 다듬거나 요약하지 마시고 원문 그대로 주셔야 정확하게 채점됩니다.",
        // 정답은 내려보내지 않는다.
        probes: probes.map((p) => ({ id: p.id, type: p.type, domain: p.domain, question: p.question })),
      });
    } catch (e) {
      logError("audit:probes", e);
      res.status(500).json({ error: "문항을 만들지 못했어요. 잠시 후 다시 시도해주세요." });
    }
  },
);

// ── 2단계: 답변 채점 ────────────────────────────────────────────────────
auditRouter.post(
  "/audit/grade",
  limitMiddleware(gradeLimiter, (req) => `audit:grade:${clientIp(req)}`),
  async (req, res) => {
    const session = getSession(String(req.body?.session_id || ""));
    if (!session) {
      return res.status(410).json({ error: "감사 세션이 만료됐어요. 문항을 다시 발급받아 주세요." });
    }
    const answers = req.body?.answers;
    if (!answers || typeof answers !== "object") {
      return res.status(400).json({ error: "answers는 { 문항id: 답변 } 형태여야 해요." });
    }
    try {
      const report = await runAudit({
        probes: session.probes,
        answers,
        subject: req.body?.subject || session.meta.subject,
      });
      if (report.error) return res.status(400).json(report);
      // 채점이 끝나면 세션은 더 필요 없다.
      sessions.delete(String(req.body.session_id));
      const reportId = putReport(report);
      res.json({ ...report, report_id: reportId, report_url: `/audit/r/${reportId}` });
    } catch (e) {
      logError("audit:grade", e);
      res.status(500).json({ error: "채점에 실패했어요. 잠시 후 다시 시도해주세요." });
    }
  },
);
