// 감사 데스크·지수 발행 API(/api/admin/audits/*, /api/admin/index/*).
//
// 문은 새로 만들지 않고 adminApi의 requireAdmin을 쓴다 — 관리자 화면이 여럿인데 문이 여럿이면
// 한쪽만 잠그는 실수가 반드시 생긴다(deskApi와 같은 이유).
import express from "express";
import { patchAsync } from "./asyncExpress.js";
import { requireAdmin } from "./adminApi.js";
import { audit as auditLog } from "./audit.js";
import { clientIp } from "./security.js";
import {
  CATEGORIES,
  DESK_DOMAINS,
  INPUT_METHODS,
  PROBE_TYPES,
  QUESTION_TYPES,
  REVIEWS,
  STAGES,
  addCustomItem,
  addItemFile,
  addProbeItems,
  addTemplateItems,
  addQuickSet,
  addAttackSet,
  addTailoredQuestions,
  auditIdOf,
  copyQuestions,
  touchWork,
  workQueue,
  autoPick,
  excludeWeak,
  importProspects,
  importTranscript,
  auditDetail,
  createAudit,
  deleteAudit,
  deleteFile,
  deleteItem,
  fileById,
  funnelStats,
  getSetting,
  listAudits,
  markSent,
  publishSummary,
  reviewFinding,
  revokeReport,
  saveAnswer,
  setSetting,
  setStage,
  shareReport,
  startChecks,
  unpublishSummary,
  updateAudit,
} from "./auditDesk.js";
import {
  computeIndexData,
  correctIssue,
  createIssue,
  deleteDraft,
  issueById,
  listIssues,
  publishIssue,
  updateDraft,
} from "./hallucinationIndex.js";

export const auditDeskRouter = patchAsync(express.Router());
auditDeskRouter.use(requireAdmin);

// 감사 건에 손을 댄 시각을 남긴다(실제로 든 시간 자동 기록 — touchWork). 실패해도 본 요청은 그대로다.
const TOUCH = [
  [/^\/audits\/items\/(\d+)/, (m) => auditIdOf({ itemId: m[1] })],
  [/^\/audits\/findings\/(\d+)/, (m) => auditIdOf({ findingId: m[1] })],
  [/^\/audits\/file\/(\d+)/, (m) => auditIdOf({ fileId: m[1] })],
  [/^\/audits\/(\d+)(\/|$)/, (m) => Number(m[1])],
];
auditDeskRouter.use((req, res, next) => {
  if (req.method === "GET") return next();
  const hit = TOUCH.map(([re, f]) => [req.path.match(re), f]).find(([m]) => m);
  if (hit) {
    // 지우는 요청은 응답 전에 감사 건이 사라질 수 있으니, 어느 건인지는 먼저 알아 둔다.
    const idP = Promise.resolve(hit[1](hit[0])).catch(() => null);
    res.on("finish", () => {
      if (res.statusCode < 400) idP.then((id) => id && touchWork(id)).catch(() => null);
    });
  }
  next();
});

const baseOf = (req) => process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get("host")}`;
const send = (res, r, okStatus = 200) => (r?.error ? res.status(400).json(r) : res.status(okStatus).json(r));
// 발송·공개처럼 밖으로 나가는 동작은 누가 했는지 남긴다.
const log = (req, action, target, detail = null) => auditLog(req.adminActor || "admin", action, target, detail, clientIp(req));

auditDeskRouter.get("/audits/meta", (req, res) => {
  res.json({
    domains: DESK_DOMAINS,
    categories: CATEGORIES,
    inputMethods: Object.fromEntries(Object.entries(INPUT_METHODS).map(([k, v]) => [k, v.label])),
    stages: Object.fromEntries(Object.entries(STAGES).map(([k, v]) => [k, v.label])),
    reviews: REVIEWS,
    questionTypes: Object.fromEntries(Object.entries(QUESTION_TYPES).map(([k, v]) => [k, v.label])),
    probeTypes: Object.fromEntries(Object.entries(PROBE_TYPES).map(([k, v]) => [k, v.label])),
  });
});

auditDeskRouter.get("/audits", async (req, res) => {
  const [audits, funnel] = await Promise.all([listAudits(), funnelStats()]);
  res.json({ audits, funnel, queue: workQueue(audits) });
});

auditDeskRouter.post("/audits", async (req, res) => send(res, await createAudit(req.body || {}), 201));

auditDeskRouter.post("/audits/sprint", async (req, res) => {
  const at = Number(req.body?.start);
  if (!Number.isFinite(at) || at <= 0) return res.status(400).json({ error: "스프린트 시작일을 다시 확인해주세요." });
  await setSetting("audit_sprint_start", Math.floor(at));
  res.json({ ok: true });
});

auditDeskRouter.get("/audits/:id", async (req, res) => {
  const d = await auditDetail(req.params.id, { base: baseOf(req) });
  if (!d) return res.status(404).json({ error: "감사 건을 찾을 수 없어요." });
  // 캡처 원본은 따로 받는다(목록 응답을 무겁게 하지 않는다).
  res.json(d);
});

auditDeskRouter.patch("/audits/:id", async (req, res) => send(res, await updateAudit(req.params.id, req.body || {})));
auditDeskRouter.delete("/audits/:id", async (req, res) => {
  const r = await deleteAudit(req.params.id);
  if (!r.error) log(req, "audit_desk.delete", req.params.id);
  send(res, r);
});

auditDeskRouter.post("/audits/:id/stage", async (req, res) => {
  const r = await setStage(req.params.id, String(req.body?.stage || ""), req.body || {});
  if (!r.error) log(req, "audit_desk.stage", req.params.id, { stage: req.body?.stage });
  send(res, r);
});

auditDeskRouter.post("/audits/import", async (req, res) => send(res, await importProspects(String(req.body?.text || "")), 201));
auditDeskRouter.post("/audits/:id/quickset", async (req, res) => send(res, await addQuickSet(req.params.id)));
auditDeskRouter.post("/audits/:id/attack", async (req, res) => send(res, await addAttackSet(req.params.id, { size: req.body?.size, focus: req.body?.focus === "even" ? null : "auto" })));
auditDeskRouter.post("/audits/:id/transcript", async (req, res) => {
  const r = await importTranscript(req.params.id, req.body || {});
  if (r.error) return res.status(400).json(r);
  const started = r.matched ? await kick(req.params.id) : null;
  res.json({ ...r, checking: !!(started && !started.error) });
});
auditDeskRouter.post("/audits/:id/copy-to", async (req, res) => send(res, await copyQuestions(req.params.id, req.body?.ids)));
auditDeskRouter.post("/audits/:id/tailored", async (req, res) => send(res, await addTailoredQuestions(req.params.id, { count: req.body?.count })));
auditDeskRouter.post("/audits/:id/exclude-weak", async (req, res) => send(res, await excludeWeak(req.params.id)));
auditDeskRouter.post("/audits/:id/autopick", async (req, res) => send(res, await autoPick(req.params.id)));
auditDeskRouter.post("/audits/:id/probes", async (req, res) => send(res, await addProbeItems(req.params.id, { size: req.body?.size })));
auditDeskRouter.post("/audits/:id/template", async (req, res) => send(res, await addTemplateItems(req.params.id, String(req.body?.topic || ""))));
auditDeskRouter.post("/audits/:id/items", async (req, res) => send(res, await addCustomItem(req.params.id, req.body || {})));
// 답을 저장하면 바로 검사를 건다(약관 확인 전이면 조용히 넘어간다). 입력이 끝날 즈음 결과도 거의 나와 있다.
// Claude 키가 없으면(로컬·시험) 자동으로 걸지 않는다 — 걸어 봐야 전부 실패로 남는다.
const kick = (auditId) => (process.env.ANTHROPIC_API_KEY ? startChecks(auditId).catch(() => null) : Promise.resolve(null));
auditDeskRouter.patch("/audits/items/:itemId", async (req, res) => {
  const r = await saveAnswer(req.params.itemId, req.body || {});
  if (r.error) return res.status(400).json(r);
  const started = r.changed && r.hasAnswer ? await kick(r.audit_id) : null;
  res.json({ ok: true, changed: r.changed, checking: !!(started && !started.error) });
});
auditDeskRouter.delete("/audits/items/:itemId", async (req, res) => send(res, await deleteItem(req.params.itemId)));

auditDeskRouter.post("/audits/items/:itemId/file", express.json({ limit: "5mb" }), async (req, res) =>
  send(res, await addItemFile(req.params.itemId, req.body?.image), 201),
);
auditDeskRouter.get("/audits/file/:fileId", async (req, res) => {
  const f = await fileById(req.params.fileId);
  if (!f) return res.status(404).json({ error: "캡처를 찾을 수 없어요." });
  res.set("Content-Type", f.mime).set("Cache-Control", "private, max-age=3600").send(Buffer.from(f.data, "base64"));
});
auditDeskRouter.delete("/audits/file/:fileId", async (req, res) => send(res, await deleteFile(req.params.fileId)));

auditDeskRouter.post("/audits/:id/check", async (req, res) => {
  const r = await startChecks(req.params.id);
  if (r.error) return res.status(400).json(r);
  // 검사는 뒤에서 돈다. 약속(done)은 응답에 싣지 않는다.
  res.status(202).json({ ok: true, queued: r.queued, already: !!r.already });
});

auditDeskRouter.patch("/audits/findings/:findingId", async (req, res) => send(res, await reviewFinding(req.params.findingId, req.body || {})));

auditDeskRouter.post("/audits/:id/share", async (req, res) => {
  const r = await shareReport(req.params.id);
  if (!r.error) log(req, "audit_desk.share", req.params.id);
  send(res, r);
});
auditDeskRouter.delete("/audits/:id/share", async (req, res) => {
  const r = await revokeReport(req.params.id);
  if (!r.error) log(req, "audit_desk.unshare", req.params.id);
  send(res, r);
});
auditDeskRouter.post("/audits/:id/sent", async (req, res) => {
  const override = req.body?.override === true;
  const r = await markSent(req.params.id, { base: baseOf(req), override, reason: req.body?.reason });
  if (!r.error) log(req, override ? "audit_desk.sent_override" : "audit_desk.sent", req.params.id);
  send(res, r);
});
auditDeskRouter.post("/audits/:id/public", async (req, res) => {
  const r = await publishSummary(req.params.id);
  if (!r.error) log(req, "audit_desk.publish", req.params.id);
  send(res, r);
});
auditDeskRouter.delete("/audits/:id/public", async (req, res) => {
  const r = await unpublishSummary(req.params.id);
  if (!r.error) log(req, "audit_desk.unpublish", req.params.id);
  send(res, r);
});

// ── 지수 발행 ─────────────────────────────────────────────────────────
auditDeskRouter.get("/index", async (req, res) => {
  res.json({ issues: await listIssues(), next: (await getSetting("index_next")) || "" });
});
auditDeskRouter.post("/index/next", async (req, res) => {
  await setSetting("index_next", String(req.body?.next || "").trim().slice(0, 60));
  res.json({ ok: true });
});
auditDeskRouter.post("/index/preview", async (req, res) => {
  const s = Number(req.body?.start);
  const e = Number(req.body?.end);
  if (!Number.isFinite(s) || !Number.isFinite(e) || s >= e) return res.status(400).json({ error: "기간을 다시 확인해주세요 — 시작이 끝보다 앞이어야 해요." });
  res.json({ data: await computeIndexData({ start: s, end: e }) });
});
auditDeskRouter.post("/index", async (req, res) => send(res, await createIssue(req.body || {}), 201));
auditDeskRouter.get("/index/:id", async (req, res) => {
  const i = await issueById(req.params.id);
  if (!i) return res.status(404).json({ error: "지수를 찾을 수 없어요." });
  res.json({ issue: { ...i, data: JSON.parse(i.data_json), corrections: JSON.parse(i.corrections_json || "[]") } });
});
auditDeskRouter.patch("/index/:id", async (req, res) => send(res, await updateDraft(req.params.id, req.body || {})));
auditDeskRouter.delete("/index/:id", async (req, res) => send(res, await deleteDraft(req.params.id)));
auditDeskRouter.post("/index/:id/publish", async (req, res) => {
  const r = await publishIssue(req.params.id);
  if (!r.error) log(req, "index.publish", req.params.id, { sha256: r.sha256 });
  send(res, r);
});
auditDeskRouter.post("/index/:id/correct", async (req, res) => {
  const r = await correctIssue(req.params.id, req.body || {});
  if (!r.error) log(req, "index.correct", req.params.id, { sha256: r.sha256, revision: r.revision });
  send(res, r);
});
