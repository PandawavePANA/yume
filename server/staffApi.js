// AI 본사(/admin/staff) API — 운영자 전용.
//   GET  /api/admin/staff                         사무실 상태(직원·결재함·업무 일지·요약)
//   POST /api/admin/staff/:id                     근무 on/off · 모드 · 하루 한도
//   POST /api/admin/staff/:id/run                 지금 일 시키기
//   GET  /api/admin/staff/approvals/:id/preview   첫 메일 미리보기(HTML)
//   POST /api/admin/staff/approvals/:id/approve   결재(입력: 받는 사람·확인 체크·항목별 결정·후보 선택)
//   POST /api/admin/staff/approvals/:id/reject    반려(사유)
import express, { Router } from "express";
import { requireAdmin } from "./adminApi.js";
import { audit as auditLog } from "./audit.js";
import { clientIp } from "./security.js";
import { logError } from "./errorLog.js";
import { addCeoLog, addTodo, approve, completeTodo, connectGmail, office, reject, runByCeo, snoozeTodo, updateStaff } from "./staff/index.js";
import { getApproval } from "./staff/store.js";
import { auditDetail } from "./auditDesk.js";
import { clientAuditMail } from "./auditClientMail.js";
import { renderFreeUseConsent } from "./renderFreeUseConsent.js";
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

// 대표 할 일(투두) — /staff/:id 보다 먼저 둔다("todos"를 직원 id로 읽지 않게).
staffRouter.post("/staff/todos", async (req, res) => {
  const r = await addTodo({ title: req.body?.title, steps: req.body?.steps, due_date: req.body?.due_date, link: req.body?.link, priority: req.body?.priority });
  log(req, "staff.todo.add", "owner_todo", { title: req.body?.title });
  if (r.error) return res.status(400).json({ error: r.error });
  res.status(201).json(r);
});
staffRouter.post("/staff/todos/:id/done", async (req, res) => {
  const r = await completeTodo(req.params.id, { note: req.body?.note });
  log(req, "staff.todo.done", `owner_todo:${req.params.id}`, { ok: !r.error });
  if (r.error) return res.status(400).json({ error: r.error });
  res.json(r);
});
staffRouter.post("/staff/todos/:id/snooze", async (req, res) => {
  const r = await snoozeTodo(req.params.id);
  if (r.error) return res.status(400).json({ error: r.error });
  res.json(r);
});

staffRouter.post("/staff/:id/run", async (req, res) => {
  log(req, "staff.run", `staff:${req.params.id}`);
  // 기다리지 않는다 — 리서치처럼 1~2분 걸리는 일이 있다. 화면은 "근무 중"으로 보였다가 끝나면 바뀐다.
  const r = await runByCeo(req.params.id);
  if (r.error) return res.status(400).json({ error: r.error });
  res.status(202).json({ ok: true });
});

// 메일함 연결 — 대표가 직접 넣은 앱 비밀번호로 접속을 시험하고, 성공하면 봉인해 저장한다(비밀번호는 기록하지 않는다).
staffRouter.post("/staff/gmail", async (req, res) => {
  const r = await connectGmail(req.body?.user, req.body?.password);
  log(req, "staff.gmail.connect", "gmail", { user: String(req.body?.user || "").slice(0, 120), ok: !r.error });
  if (r.error) return res.status(400).json({ error: r.error });
  res.json({ ok: true, user: r.user });
});

// 무상사용승낙서 — 할 일 "소재지 정정" 안의 칸(소유자 이름 등)을 POST로 받아 인쇄용 화면을 돌려준다(주소창에 개인정보를 싣지 않게).
// 받은 값은 저장하지 않는다.
staffRouter.post("/staff/docs/free-use", express.urlencoded({ extended: false, limit: "8kb" }), (req, res) => {
  const pick = (k, n) => String(req.body?.[k] || "").trim().slice(0, n);
  res.set("Content-Type", "text/html; charset=utf-8").set("Cache-Control", "no-store").set("X-Robots-Tag", "noindex");
  res.send(renderFreeUseConsent({ owner: pick("owner", 40), birth: pick("birth", 20), ownerAddr: pick("ownerAddr", 160), relation: pick("relation", 20), start: pick("start", 10) }));
});

// 대표가 직접 적는 "내가 한 일" — 업무 일지에 대표 이름으로 남는다.
staffRouter.post("/staff/log", async (req, res) => {
  const r = await addCeoLog({ title: req.body?.title, detail: req.body?.detail });
  if (r.error) return res.status(400).json({ error: r.error });
  res.status(201).json(r);
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
