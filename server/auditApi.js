// 무료 할루시네이션 감사 API (B2B 리드).
//
// 문항의 정답(groundTruth·oracle)은 절대 발급 응답에 넣지 않는다. 정답이 딸려 나가면
// 그걸 그대로 자기 AI에 붙여넣어 만점을 만들 수 있고, 그러면 이 감사는 의미가 없다.
// 발급 때 만든 문항은 서버에 세션으로 두고, 채점 때 세션 id로 다시 꺼내 쓴다.
import { Router } from "express";
import { randomToken, clientIp, createLimiter, limitMiddleware, crossOriginGate } from "./security.js";
import { buildProbeSet, runAudit } from "./audit/index.js";
import { logError } from "./errorLog.js";
import { now, run, one } from "./db.js";
import { renderAuditReport } from "./renderAuditReport.js";

export const auditRouter = Router();

// 기업용 사이트는 별도 도메인에 따로 배포되므로, 감사 API는 교차 출처로 불린다.
// 이 엔드포인트들은 쿠키도 세션도 쓰지 않고 IP 레이트리밋만으로 보호되니 열어도 되지만,
// 아무 출처나 받지는 않는다 — AUDIT_ALLOWED_ORIGINS에 적힌 곳만 허용한다.
// 환경변수를 비워두면 아무 것도 추가되지 않아 같은 출처에서만 동작한다(기존과 동일).
const cors = crossOriginGate("AUDIT_ALLOWED_ORIGINS");

// 감사 세션은 짧게만 살아 있으면 된다. 문항을 받아 자기 AI에 넣고 붙여넣는 시간이면 충분하다.
//
// 메모리가 아니라 DB에 둔다. Map에 두었더니 배포할 때마다 진행 중이던 감사가 전부
// 사라졌다 — 문항을 받아 자기 AI에 넣고 돌아온 사람이 "세션이 만료됐다"는 말을 듣고,
// 그 사람은 다시 오지 않는다. 배포는 앞으로도 계속 할 일이므로 저장소를 바꾼다.
const SESSION_TTL_MS = 2 * 60 * 60 * 1000;

async function putSession(probes, meta) {
  const id = randomToken(18);
  await run(
    "INSERT INTO audit_sessions (id, probes, meta, created_at) VALUES (:id, :p, :m, :t)",
    { id, p: JSON.stringify(probes), m: JSON.stringify(meta), t: now() },
  );
  // 지난 것들은 이때 같이 치운다. 따로 도는 청소 작업을 두지 않기 위해서다.
  await run("DELETE FROM audit_sessions WHERE created_at < :cut", { cut: now() - SESSION_TTL_MS }).catch(() => {});
  return id;
}

async function getSession(id) {
  if (!id) return null;
  const row = await one("SELECT * FROM audit_sessions WHERE id = :id", { id });
  if (!row) return null;
  if (now() - Number(row.created_at) > SESSION_TTL_MS) {
    await dropSession(id);
    return null;
  }
  try {
    return { probes: JSON.parse(row.probes), meta: JSON.parse(row.meta) };
  } catch (e) {
    logError("audit:session:parse", e);
    return null;
  }
}

function dropSession(id) {
  return run("DELETE FROM audit_sessions WHERE id = :id", { id }).catch(() => {});
}

// 채점 결과는 링크로 사내에 돌릴 수 있어야 리드 도구로 쓸모가 있다. 7일이라고 안내하므로
// 7일 동안 실제로 열려야 한다 — 메모리에 있을 때는 배포 한 번에 링크가 죽었다.
const REPORT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

async function putReport(report) {
  const id = randomToken(12);
  await run(
    "INSERT INTO audit_reports (id, report, created_at) VALUES (:id, :r, :t)",
    { id, r: JSON.stringify(report), t: now() },
  );
  await run("DELETE FROM audit_reports WHERE created_at < :cut", { cut: now() - REPORT_TTL_MS }).catch(() => {});
  return id;
}

export async function getAuditReport(id) {
  if (!id) return null;
  const row = await one("SELECT * FROM audit_reports WHERE id = :id", { id });
  if (!row) return null;
  if (now() - Number(row.created_at) > REPORT_TTL_MS) {
    await run("DELETE FROM audit_reports WHERE id = :id", { id }).catch(() => {});
    return null;
  }
  try {
    return JSON.parse(row.report);
  } catch (e) {
    logError("audit:report:parse", e);
    return null;
  }
}

export { renderAuditReport };

const issueLimiter = createLimiter({ windowMs: 60 * 60 * 1000, max: 10 });
const gradeLimiter = createLimiter({ windowMs: 60 * 60 * 1000, max: 20 });

// ── 1단계: 문항 발급 ────────────────────────────────────────────────────
auditRouter.options("/audit/probes", cors);
auditRouter.options("/audit/grade", cors);

auditRouter.post(
  "/audit/probes",
  cors,
  limitMiddleware(issueLimiter, (req) => `audit:issue:${clientIp(req)}`),
  async (req, res) => {
    const domain = ["법률", "의료", "금융", "일반"].includes(req.body?.domain) ? req.body.domain : "법률";
    const size = Math.min(Math.max(Number(req.body?.size) || 8, 4), 10);
    try {
      const probes = await buildProbeSet({ domain, size });
      if (probes.length === 0) {
        return res.status(503).json({ error: "지금은 문항을 만들 수 없어요. 공식 데이터 조회가 일시적으로 불안정합니다. 잠시 후 다시 시도해주세요." });
      }
      const sessionId = await putSession(probes, { domain, subject: String(req.body?.subject || "").slice(0, 120) });
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
  cors,
  limitMiddleware(gradeLimiter, (req) => `audit:grade:${clientIp(req)}`),
  async (req, res) => {
    const session = await getSession(String(req.body?.session_id || ""));
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
      await dropSession(String(req.body.session_id));
      const reportId = await putReport(report);
      res.json({ ...report, report_id: reportId, report_url: `/audit/r/${reportId}` });
    } catch (e) {
      logError("audit:grade", e);
      res.status(500).json({ error: "채점에 실패했어요. 잠시 후 다시 시도해주세요." });
    }
  },
);
