// 스튜디오 운영 보드 API — 들어온 의뢰, 진행 중인 일, 끝난 일, 매출,
// 그리고 자사 제품 네 개의 진행 상황.
//
// 인증은 따로 만들지 않고 adminApi의 requireAdmin을 그대로 쓴다. 관리자 화면이
// 두 개인데 문이 두 개면, 한쪽 문만 잠그는 실수가 반드시 생긴다.
//
// 매출은 두 갈래를 나눠서 낸다. 외주는 실제로 받은 금액(paid_krw)만 합치고,
// 유메 결제는 credit_orders에서 결제 완료된 것만 합친다. 계약 금액으로 매출을
// 세면 아직 받지 못한 돈이 매출로 잡혀, 보고 판단을 틀리게 만든다.
import express from "express";
import { patchAsync } from "./asyncExpress.js";
import { requireAdmin } from "./adminApi.js";
import { now, all, one, run } from "./db.js";
import { collectProductRevenue } from "./productRevenue.js";

export const studioRouter = patchAsync(express.Router());
studioRouter.use(requireAdmin);

// 자사 제품. 키를 코드에 고정해 두는 이유는, 이 넷은 사용자가 추가하는 것이
// 아니라 회사가 운영하는 제품이어서다.
export const PRODUCTS = [
  { key: "yume", label: "유메", href: "https://www.yume-reamer.com/" },
  { key: "proba", label: "프로바", href: "https://proba.network/" },
  { key: "ballast", label: "밸러스트", href: "https://www.ballast-reamer.com/" },
  { key: "aipick", label: "아이픽", href: "https://www.aipick-reamer.com/" },
];
const PRODUCT_KEYS = new Set(PRODUCTS.map((p) => p.key));

// 제품도 일감도 아닌 목록. 개인 할 일은 사업 어디에도 속하지 않지만, 매일 여는
// 화면이 여기라 여기 있어야 실제로 쓰인다. 다른 앱에 따로 두면 안 보게 된다.
export const EXTRA_OWNERS = [{ key: "personal", label: "개인", sub: "개인 할 일" }];
const EXTRA_KEYS = new Set(EXTRA_OWNERS.map((o) => o.key));

// 체크리스트는 자사 제품뿐 아니라 외주 일감에도 붙는다. 키를 "project:12"처럼
// 두어 표를 하나로 쓴다 — 할 일은 어느 쪽이든 "제목과 상태" 하나뿐이라, 표를
// 둘로 나누면 같은 코드를 두 벌 쓰게 된다.
const PROJECT_KEY = /^project:(\d+)$/;

async function validOwner(key) {
  if (PRODUCT_KEYS.has(key) || EXTRA_KEYS.has(key)) return true;
  const m = PROJECT_KEY.exec(key);
  if (!m) return false;
  return !!(await one("SELECT id FROM projects WHERE id = :id", { id: Number(m[1]) }));
}

// lead(의뢰·상담) → active(진행 중) → done(완료). dropped는 무산된 건.
const PROJECT_STATUS = new Set(["lead", "active", "done", "dropped"]);
const TASK_STATE = new Set(["todo", "doing", "done"]);
const INQUIRY_STATUS = new Set(["new", "replied", "quoted", "won", "lost"]);

const str = (v, max) => {
  const s = String(v ?? "").trim();
  return s ? s.slice(0, max) : null;
};
const int = (v) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? n : 0;
};
const money = (v) => Math.max(0, Math.min(int(v), 100_000_000_000));
const ts = (v) => {
  if (v === null || v === "" || v === undefined) return null;
  const n = Number(v);
  if (Number.isFinite(n) && n > 0) return Math.floor(n);
  const d = Date.parse(String(v));
  return Number.isFinite(d) ? d : null;
};

// ── 전체 현황 ──────────────────────────────────────────────────────────
studioRouter.get("/studio", async (req, res) => {
  const [inquiries, projects, tasks] = await Promise.all([
    all("SELECT * FROM inquiries ORDER BY id DESC LIMIT 200"),
    all("SELECT * FROM projects ORDER BY COALESCE(updated_at, created_at) DESC LIMIT 300"),
    all("SELECT * FROM product_tasks ORDER BY product, sort, id"),
  ]);

  const by = (s) => projects.filter((p) => p.status === s);
  // 외주 매출은 받은 금액만. 계약했지만 아직 안 들어온 돈은 따로 보여 준다.
  const sum = (rows, k) => rows.reduce((a, r) => a + Number(r[k] || 0), 0);
  const outstanding = projects
    .filter((p) => p.status !== "dropped")
    .reduce((a, p) => a + Math.max(0, Number(p.amount_krw || 0) - Number(p.paid_krw || 0)), 0);

  // 유메 자체 결제. 웹훅이 취소를 되돌리므로 paid만 센다.
  const yume = await one(
    "SELECT COALESCE(SUM(amount), 0) AS krw, COUNT(*) AS n FROM credit_orders WHERE status = 'paid'",
  ).catch(() => ({ krw: 0, n: 0 }));

  // 형제 제품은 각자 자기 서버에 물어본다. 느리거나 죽어 있어도 이 화면은 뜬다.
  const external = await collectProductRevenue();
  const externalTotal = external
    .filter((e) => e.state === "ok" || e.state === "stale")
    .reduce((a, e) => a + Number(e.total || 0), 0);

  res.json({
    products: PRODUCTS,
    extras: EXTRA_OWNERS,
    external,
    summary: {
      inquiriesNew: inquiries.filter((i) => (i.status || "new") === "new").length,
      inquiriesTotal: inquiries.length,
      lead: by("lead").length,
      active: by("active").length,
      done: by("done").length,
      revenueOutsourcing: sum(projects, "paid_krw"),
      revenueYume: Number(yume.krw || 0),
      yumeOrders: Number(yume.n || 0),
      revenueProducts: externalTotal,
      contracted: sum(projects.filter((p) => p.status !== "dropped"), "amount_krw"),
      outstanding,
    },
    inquiries,
    projects,
    tasks,
  });
});

// ── 의뢰 ───────────────────────────────────────────────────────────────
studioRouter.patch("/studio/inquiry/:id", async (req, res) => {
  const status = String(req.body?.status || "");
  if (!INQUIRY_STATUS.has(status)) return res.status(400).json({ error: "알 수 없는 상태예요." });
  const r = await run("UPDATE inquiries SET status = :s WHERE id = :id", { s: status, id: int(req.params.id) });
  if (!r.rowCount) return res.status(404).json({ error: "해당 문의가 없어요." });
  res.json({ ok: true });
});

// 의뢰를 일감으로 옮긴다. 문의 내용을 다시 타이핑하지 않게 하는 것이 목적이고,
// 옮긴 뒤에도 문의는 지우지 않는다 — 어디서 온 일인지가 나중에 필요하다.
studioRouter.post("/studio/inquiry/:id/convert", async (req, res) => {
  const id = int(req.params.id);
  const q = await one("SELECT * FROM inquiries WHERE id = :id", { id });
  if (!q) return res.status(404).json({ error: "해당 문의가 없어요." });

  const dup = await one("SELECT id FROM projects WHERE inquiry_id = :id", { id });
  if (dup) return res.status(409).json({ error: "이미 일감으로 옮긴 문의예요.", projectId: dup.id });

  const t = now();
  const row = await run(
    `INSERT INTO projects (title, client, contact, kind, status, amount_krw, paid_krw, progress, note, inquiry_id, created_at, updated_at)
     VALUES (:title, :client, :contact, :kind, 'lead', 0, 0, 0, :note, :iid, :t, :t) RETURNING id`,
    {
      title: str(q.company || q.name, 120) || "새 일감",
      client: str(q.name, 60),
      contact: str(q.contact, 200),
      kind: str(q.kind, 40),
      note: str(q.message, 4000),
      iid: id,
      t,
    },
  );
  await run("UPDATE inquiries SET status = 'won' WHERE id = :id", { id });
  res.status(201).json({ ok: true, id: row.rows[0]?.id });
});

// ── 일감 ───────────────────────────────────────────────────────────────
studioRouter.post("/studio/project", async (req, res) => {
  const title = str(req.body?.title, 120);
  if (!title) return res.status(400).json({ error: "이름을 적어주세요." });
  const t = now();
  const row = await run(
    `INSERT INTO projects (title, client, contact, kind, status, amount_krw, paid_krw, progress, started_at, due_at, note, created_at, updated_at)
     VALUES (:title, :client, :contact, :kind, :status, :amount, :paid, :progress, :started, :due, :note, :t, :t) RETURNING id`,
    {
      title,
      client: str(req.body?.client, 60),
      contact: str(req.body?.contact, 200),
      kind: str(req.body?.kind, 40),
      status: PROJECT_STATUS.has(req.body?.status) ? req.body.status : "lead",
      amount: money(req.body?.amount_krw),
      paid: money(req.body?.paid_krw),
      progress: Math.max(0, Math.min(100, int(req.body?.progress))),
      started: ts(req.body?.started_at),
      due: ts(req.body?.due_at),
      note: str(req.body?.note, 4000),
      t,
    },
  );
  res.status(201).json({ ok: true, id: row.rows[0]?.id });
});

studioRouter.patch("/studio/project/:id", async (req, res) => {
  const id = int(req.params.id);
  const cur = await one("SELECT * FROM projects WHERE id = :id", { id });
  if (!cur) return res.status(404).json({ error: "해당 일감이 없어요." });

  const b = req.body || {};
  const has = (k) => Object.prototype.hasOwnProperty.call(b, k);
  const status = has("status") && PROJECT_STATUS.has(b.status) ? b.status : cur.status;
  // 완료로 옮기는 순간을 기록한다. 이미 완료였다면 그때 시각을 지킨다.
  const doneAt = status === "done" ? Number(cur.done_at) || now() : null;

  await run(
    `UPDATE projects SET
       title = :title, client = :client, contact = :contact, kind = :kind,
       status = :status, amount_krw = :amount, paid_krw = :paid, progress = :progress,
       started_at = :started, due_at = :due, done_at = :done, note = :note, updated_at = :t
     WHERE id = :id`,
    {
      id,
      title: has("title") ? str(b.title, 120) || cur.title : cur.title,
      client: has("client") ? str(b.client, 60) : cur.client,
      contact: has("contact") ? str(b.contact, 200) : cur.contact,
      kind: has("kind") ? str(b.kind, 40) : cur.kind,
      status,
      amount: has("amount_krw") ? money(b.amount_krw) : Number(cur.amount_krw || 0),
      paid: has("paid_krw") ? money(b.paid_krw) : Number(cur.paid_krw || 0),
      progress: has("progress") ? Math.max(0, Math.min(100, int(b.progress))) : Number(cur.progress || 0),
      started: has("started_at") ? ts(b.started_at) : cur.started_at,
      due: has("due_at") ? ts(b.due_at) : cur.due_at,
      done: doneAt,
      note: has("note") ? str(b.note, 4000) : cur.note,
      t: now(),
    },
  );
  res.json({ ok: true });
});

studioRouter.delete("/studio/project/:id", async (req, res) => {
  const id = int(req.params.id);
  const r = await run("DELETE FROM projects WHERE id = :id", { id });
  if (!r.rowCount) return res.status(404).json({ error: "해당 일감이 없어요." });
  // 주인이 사라진 할 일은 어디에도 보이지 않으면서 자리만 차지한다.
  await run("DELETE FROM product_tasks WHERE product = :k", { k: `project:${id}` }).catch(() => {});
  res.json({ ok: true });
});

// ── 제품 진행 상황 ─────────────────────────────────────────────────────
studioRouter.post("/studio/task", async (req, res) => {
  const product = String(req.body?.product || "");
  if (!(await validOwner(product))) return res.status(400).json({ error: "알 수 없는 대상이에요." });
  const title = str(req.body?.title, 200);
  if (!title) return res.status(400).json({ error: "할 일을 적어주세요." });

  const last = await one("SELECT COALESCE(MAX(sort), 0) AS s FROM product_tasks WHERE product = :p", { p: product });
  const t = now();
  const row = await run(
    `INSERT INTO product_tasks (product, title, state, sort, created_at, updated_at)
     VALUES (:p, :title, 'todo', :sort, :t, :t) RETURNING id`,
    { p: product, title, sort: Number(last?.s || 0) + 1, t },
  );
  res.status(201).json({ ok: true, id: row.rows[0]?.id });
});

studioRouter.patch("/studio/task/:id", async (req, res) => {
  const id = int(req.params.id);
  const cur = await one("SELECT * FROM product_tasks WHERE id = :id", { id });
  if (!cur) return res.status(404).json({ error: "해당 항목이 없어요." });
  const b = req.body || {};
  const has = (k) => Object.prototype.hasOwnProperty.call(b, k);
  await run(
    "UPDATE product_tasks SET title = :title, state = :state, note = :note, updated_at = :t WHERE id = :id",
    {
      id,
      title: has("title") ? str(b.title, 200) || cur.title : cur.title,
      state: has("state") && TASK_STATE.has(b.state) ? b.state : cur.state,
      note: has("note") ? str(b.note, 1000) : cur.note,
      t: now(),
    },
  );
  res.json({ ok: true });
});

// 순서 바꾸기. 두 항목의 sort를 맞바꾼다.
studioRouter.post("/studio/task/:id/move", async (req, res) => {
  const id = int(req.params.id);
  const dir = req.body?.dir === "up" ? "up" : "down";
  const cur = await one("SELECT * FROM product_tasks WHERE id = :id", { id });
  if (!cur) return res.status(404).json({ error: "해당 항목이 없어요." });
  const neighbour = await one(
    dir === "up"
      ? "SELECT * FROM product_tasks WHERE product = :p AND (sort < :s OR (sort = :s AND id < :id)) ORDER BY sort DESC, id DESC LIMIT 1"
      : "SELECT * FROM product_tasks WHERE product = :p AND (sort > :s OR (sort = :s AND id > :id)) ORDER BY sort ASC, id ASC LIMIT 1",
    { p: cur.product, s: Number(cur.sort || 0), id },
  );
  if (!neighbour) return res.json({ ok: true, moved: false });
  const t = now();
  await run("UPDATE product_tasks SET sort = :s, updated_at = :t WHERE id = :id", { s: Number(neighbour.sort || 0), t, id });
  await run("UPDATE product_tasks SET sort = :s, updated_at = :t WHERE id = :id", { s: Number(cur.sort || 0), t, id: neighbour.id });
  res.json({ ok: true, moved: true });
});

studioRouter.delete("/studio/task/:id", async (req, res) => {
  const r = await run("DELETE FROM product_tasks WHERE id = :id", { id: int(req.params.id) });
  if (!r.rowCount) return res.status(404).json({ error: "해당 항목이 없어요." });
  res.json({ ok: true });
});
