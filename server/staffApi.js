// AI 본사(/admin/staff) API — 운영자 전용.
//   GET  /api/admin/staff                         사무실 상태(직원·결재함·업무 일지·요약)
//   POST /api/admin/staff/:id                     근무 on/off · 모드 · 하루 한도
//   POST /api/admin/staff/:id/run                 지금 일 시키기
//   GET  /api/admin/staff/approvals/:id/preview   첫 메일 미리보기(HTML)
//   POST /api/admin/staff/approvals/:id/approve   결재(입력: 받는 사람·확인 체크·항목별 결정·후보 선택)
//   POST /api/admin/staff/approvals/:id/reject    반려(사유)
import { Router } from "express";
import { requireAdmin } from "./adminApi.js";
import { audit as auditLog } from "./audit.js";
import { clientIp } from "./security.js";
import { logError } from "./errorLog.js";
import { approve, office, reject, runStaff, updateStaff } from "./staff/index.js";
import { getApproval } from "./staff/store.js";
import { auditDetail } from "./auditDesk.js";
import { clientAuditMail } from "./auditClientMail.js";
import { base } from "./staff/jobs/sales.js";

export const staffRouter = Router();
staffRouter.use("/staff", requireAdmin);

const log = (req, action, target, detail = null) =>
  Promise.resolve(auditLog(req.adminActor || "admin", action, target, detail, clientIp(req))).catch((e) => logError("staff:audit", e));

staffRouter.get("/staff", async (_req, res) => {
  res.set("Cache-Control", "no-store").json(await office());
});

staffRouter.get("/staff/approvals/:id/preview", async (req, res) => {
  const a = await getApproval(req.params.id);
  if (!a || a.kind !== "send_first") return res.status(404).end();
  const d = await auditDetail(a.payload.auditId, { base: base() });
  if (!d) return res.status(404).end();
  const html = clientAuditMail(d).html;
  res.set("Content-Type", "text/html; charset=utf-8").set("Cache-Control", "no-store").set("X-Robots-Tag", "noindex").send(html);
});

staffRouter.post("/staff/approvals/:id/approve", async (req, res) => {
  const r = await approve(req.params.id, req.body?.input || {});
  log(req, "staff.approve", `staff_approval:${req.params.id}`, { ok: !r.error, result: r.result || r.error });
  if (r.error) return res.status(400).json({ error: r.error });
  res.json(r);
});

staffRouter.post("/staff/approvals/:id/reject", async (req, res) => {
  const r = await reject(req.params.id, String(req.body?.reason || "").slice(0, 300));
  log(req, "staff.reject", `staff_approval:${req.params.id}`, { reason: req.body?.reason || "" });
  if (r.error) return res.status(400).json({ error: r.error });
  res.json(r);
});

staffRouter.post("/staff/:id/run", async (req, res) => {
  log(req, "staff.run", `staff:${req.params.id}`);
  // 기다리지 않는다 — 리서치처럼 1~2분 걸리는 일이 있다. 화면은 "근무 중"으로 보였다가 끝나면 바뀐다.
  runStaff(req.params.id, { manual: true }).catch((e) => logError("staff:run", e));
  res.status(202).json({ ok: true });
});

staffRouter.post("/staff/:id", async (req, res) => {
  const patch = {};
  if (req.body?.enabled !== undefined) patch.enabled = !!req.body.enabled;
  if (req.body?.autonomy !== undefined) patch.autonomy = String(req.body.autonomy);
  if (req.body?.daily_cap !== undefined) patch.daily_cap = req.body.daily_cap;
  const r = await updateStaff(req.params.id, patch);
  log(req, "staff.update", `staff:${req.params.id}`, patch);
  if (r.error) return res.status(400).json({ error: r.error });
  res.json({ ok: true });
});
