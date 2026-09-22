// 의뢰 데스크 API — 대화·견적·결제를 운영하는 쪽.
//
// 문은 새로 만들지 않고 adminApi의 requireAdmin을 그대로 쓴다. 관리자 화면이 여럿인데
// 문이 여럿이면, 한쪽 문만 잠그는 실수가 반드시 생긴다.
import express from "express";
import { patchAsync } from "./asyncExpress.js";
import { requireAdmin } from "./adminApi.js";
import { now, one, all, run } from "./db.js";
import { logError } from "./errorLog.js";
import {
  addMessage,
  createThread,
  listMessages,
  listQuotes,
  mailClientNewMessage,
  mailClientQuote,
  mailThreadLink,
  markRead,
  openToken,
  rotateToken,
  threadById,
  threadUrl,
  won,
} from "./threads.js";
import { taskKey } from "./threadProgress.js";

export const deskRouter = patchAsync(express.Router());
deskRouter.use(requireAdmin);

const str = (v, max) => {
  const s = String(v ?? "").trim();
  return s ? s.slice(0, max) : null;
};
const int = (v) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? n : 0;
};
const money = (v) => Math.max(0, Math.min(int(v), 100_000_000_000));
const DAY = 24 * 3600 * 1000;

// ── 목록 ───────────────────────────────────────────────────────────────
//
// 안 읽은 수를 스레드마다 따로 세면 대화 수만큼 질의가 나간다. 한 번에 세어
// 붙인다 — 이 화면은 하루에도 여러 번 열리는 곳이다.
deskRouter.get("/desk", async (req, res) => {
  const threads = await all("SELECT * FROM threads ORDER BY COALESCE(last_message_at, updated_at) DESC LIMIT 200");
  if (!threads.length) return res.json({ threads: [], summary: { open: 0, waiting: 0, unread: 0, paid: 0, pending: 0 } });

  // id는 방금 DB에서 읽어 온 정수다. 파라미터로 배열을 넘기는 방식은 드라이버마다
  // 타입 처리가 달라, 여기서는 확인된 정수를 그대로 박는다.
  const ids = `(${threads.map((t) => Number(t.id)).filter(Number.isInteger).join(",")})`;
  const [unreadRows, quoteRows, lastRows] = await Promise.all([
    // 안 읽은 것은 **의뢰인이 쓴 말**만 센다. 견적을 보냈다는 기록(system)은 우리가
    // 한 일이라, 그것까지 세면 내가 방금 한 행동이 내 알림으로 돌아온다.
    all(
      `SELECT m.thread_id, COUNT(*) AS n FROM thread_messages m
       JOIN threads t ON t.id = m.thread_id
       WHERE m.thread_id IN ${ids} AND m.sender = 'client' AND m.created_at > t.admin_read_at
       GROUP BY m.thread_id`,
    ),
    all(
      `SELECT thread_id,
              COALESCE(SUM(CASE WHEN status = 'paid' THEN amount_krw ELSE 0 END), 0) AS paid,
              COALESCE(SUM(CASE WHEN status IN ('sent', 'accepted') THEN amount_krw ELSE 0 END), 0) AS pending,
              COALESCE(SUM(CASE WHEN status = 'accepted' THEN amount_krw ELSE 0 END), 0) AS accepted
       FROM thread_quotes WHERE thread_id IN ${ids} GROUP BY thread_id`,
    ),
    // thread_id를 id로 별칭하지 않는다. ORDER BY는 출력 별칭을 먼저 찾으므로,
    // 별칭이 id면 "ORDER BY id DESC"가 메시지 번호가 아니라 스레드 번호를 가리켜
    // 미리보기에 **첫 줄**이 걸린다.
    all(
      `SELECT DISTINCT ON (thread_id) thread_id, id, body, sender, created_at
       FROM thread_messages WHERE thread_id IN ${ids} ORDER BY thread_id, id DESC`,
    ),
  ]);

  const unread = new Map(unreadRows.map((r) => [r.thread_id, Number(r.n)]));
  const quotes = new Map(quoteRows.map((r) => [r.thread_id, r]));
  const last = new Map(lastRows.map((r) => [r.thread_id, r]));

  const rows = threads.map((t) => {
    const q = quotes.get(t.id) || { paid: 0, pending: 0, accepted: 0 };
    const l = last.get(t.id);
    return {
      id: t.id,
      title: t.title,
      name: t.client_name,
      contact: t.client_contact,
      status: t.status,
      projectId: t.project_id,
      inquiryId: t.inquiry_id,
      unread: unread.get(t.id) || 0,
      // 마지막으로 말한 쪽이 의뢰인이면 우리가 답할 차례다. 이 한 칸이 데스크의 전부다.
      // system(견적 발송·결제 완료)은 우리가 움직인 것이라 차례를 넘기지 않는다.
      waiting: t.last_sender === "client",
      preview: l ? String(l.body).replace(/\s+/g, " ").slice(0, 80) : "",
      previewSender: l?.sender || null,
      at: Number(t.last_message_at || t.updated_at),
      paid: Number(q.paid || 0),
      pending: Number(q.pending || 0),
      accepted: Number(q.accepted || 0),
      // 메일 알림에 링크를 넣을 수 있는 상태인지. 비밀값이 없으면 봉인되지 않는다.
      linkable: !!openToken(t.link_enc),
    };
  });

  res.json({
    threads: rows,
    summary: {
      open: rows.filter((r) => r.status === "open").length,
      waiting: rows.filter((r) => r.status === "open" && r.waiting).length,
      unread: rows.reduce((a, r) => a + r.unread, 0),
      paid: rows.reduce((a, r) => a + r.paid, 0),
      pending: rows.reduce((a, r) => a + r.pending, 0),
    },
  });
});

// ── 대화 하나 ──────────────────────────────────────────────────────────
deskRouter.get("/desk/:id", async (req, res) => {
  const t = await threadById(int(req.params.id));
  if (!t) return res.status(404).json({ error: "대화를 찾을 수 없어요." });
  const [messages, quotes, project, inquiry, tasks] = await Promise.all([
    listMessages(t.id, Math.max(0, int(req.query.after))),
    listQuotes(t.id),
    t.project_id ? one("SELECT * FROM projects WHERE id = :id", { id: t.project_id }) : null,
    t.inquiry_id ? one("SELECT * FROM inquiries WHERE id = :id", { id: t.inquiry_id }) : null,
    t.project_id
      ? all("SELECT id, title, state, sort, shared FROM product_tasks WHERE product = :k ORDER BY sort, id", { k: taskKey(t.project_id) })
      : [],
  ]);
  // 읽을 것이 새로 있을 때만 쓴다. 이 주소는 데스크가 몇 초마다 다시 부른다.
  const unseen = messages.some((m) => m.sender === "client" && Number(m.created_at) > Number(t.admin_read_at || 0));
  if (unseen) await markRead(t.id, "admin").catch(() => {});
  res.json({
    thread: {
      id: t.id,
      title: t.title,
      name: t.client_name,
      contact: t.client_contact,
      email: t.client_email,
      status: t.status,
      projectId: t.project_id,
      openedAt: Number(t.created_at),
      linkable: !!openToken(t.link_enc),
    },
    messages,
    quotes,
    project,
    tasks,
    inquiry: inquiry ? { id: inquiry.id, kind: inquiry.kind, budget: inquiry.budget, message: inquiry.message } : null,
  });
});

deskRouter.post("/desk/:id/message", async (req, res) => {
  const t = await threadById(int(req.params.id));
  if (!t) return res.status(404).json({ error: "대화를 찾을 수 없어요." });
  const body = str(req.body?.body, 5000);
  if (!body) return res.status(400).json({ error: "내용을 입력해주세요." });
  const msg = await addMessage(t.id, "reamer", body);
  res.status(201).json({ ok: true, id: msg.id });
  mailClientNewMessage(t, body);
});

// ── 견적(결제 요청) ────────────────────────────────────────────────────
//
// 보내는 순간 대화에도 한 줄이 남는다. 견적이 카드로만 따로 떠 있으면, 나중에
// 대화를 훑을 때 "언제 얼마를 불렀는지"가 흐름에서 빠져 버린다.
deskRouter.post("/desk/:id/quote", async (req, res) => {
  const t = await threadById(int(req.params.id));
  if (!t) return res.status(404).json({ error: "대화를 찾을 수 없어요." });

  const title = str(req.body?.title, 120);
  const amount = money(req.body?.amount_krw);
  if (!title) return res.status(400).json({ error: "항목 이름을 적어주세요." });
  if (amount < 1000) return res.status(400).json({ error: "금액을 1,000원 이상으로 적어주세요." });

  const days = Math.max(0, Math.min(int(req.body?.valid_days) || 14, 120));
  const ts = now();
  const row = await run(
    `INSERT INTO thread_quotes (thread_id, title, detail, amount_krw, weeks, status, expires_at, created_at, updated_at)
     VALUES (:tid, :title, :detail, :amt, :weeks, 'sent', :exp, :t, :t) RETURNING id`,
    {
      tid: t.id,
      title,
      detail: str(req.body?.detail, 4000),
      amt: amount,
      weeks: str(req.body?.weeks, 40),
      exp: days ? ts + days * DAY : null,
      t: ts,
    },
  );
  const id = row.rows[0]?.id;
  const quote = await one("SELECT * FROM thread_quotes WHERE id = :id", { id });

  await addMessage(t.id, "system", `견적을 보냈습니다 · ${title} · ${won(amount)}`, { kind: "quote", quoteId: id });
  res.status(201).json({ ok: true, id });
  mailClientQuote(t, quote);
});

// 견적 회수. 결제된 건은 여기서 못 지운다 — 돈이 오간 기록을 화면 조작으로
// 지울 수 있으면 장부가 사실과 달라진다. 환불은 포트원 콘솔에서 하고, 그 결과는
// 웹훅이 이 표에 되돌려 적는다.
//
// 확정된(accepted) 견적도 결제 전이면 회수할 수 있다. 확정은 합의이지 입금이 아니고,
// 조건이 바뀌면 다시 보내는 편이 금액을 고쳐 쓰는 것보다 깨끗하다.
deskRouter.patch("/desk/quote/:id", async (req, res) => {
  const q = await one("SELECT * FROM thread_quotes WHERE id = :id", { id: int(req.params.id) });
  if (!q) return res.status(404).json({ error: "견적을 찾을 수 없어요." });
  if (q.status !== "sent" && q.status !== "accepted") {
    return res.status(409).json({ error: "이미 결제되었거나 회수된 견적이에요." });
  }
  const upd = await run(
    "UPDATE thread_quotes SET status = 'cancelled', updated_at = :t WHERE id = :id AND status IN ('sent', 'accepted')",
    { t: now(), id: q.id },
  );
  if (!upd.changes) return res.status(409).json({ error: "방금 상태가 바뀌었어요. 새로고침 후 다시 시도해주세요." });
  await addMessage(q.thread_id, "system", `견적을 회수했습니다 · ${q.title}`, { kind: "quote_cancelled", quoteId: q.id });
  res.json({ ok: true });
});

// ── 진행 상황 ──────────────────────────────────────────────────────────
//
// 의뢰인에게 보이는 것은 이 일감에 달린 공개 체크리스트와 진행률, 미리보기 주소다.
// 체크리스트 자체는 스튜디오 보드와 같은 표(product_tasks)를 쓴다 — 두 벌로 나누면
// 반드시 한쪽만 갱신하게 된다.

/**
 * 대화에 일감을 붙인다. 이미 있으면 그걸 쓴다.
 *
 * 결제가 들어오면 자동으로 만들어지지만, 그 전에 진행 상황을 공유하고 싶을 때가 있다 —
 * 착수금 없이 먼저 시작하는 건이 그렇다.
 */
deskRouter.post("/desk/:id/project", async (req, res) => {
  const t = await threadById(int(req.params.id));
  if (!t) return res.status(404).json({ error: "대화를 찾을 수 없어요." });
  if (t.project_id) {
    const has = await one("SELECT id FROM projects WHERE id = :id", { id: t.project_id });
    if (has) return res.json({ ok: true, id: has.id, already: true });
  }
  const ts = now();
  const row = await run(
    `INSERT INTO projects (title, client, contact, kind, status, amount_krw, paid_krw, progress, started_at, note, inquiry_id, created_at, updated_at)
     VALUES (:title, :client, :contact, '외주', 'active', 0, 0, 0, :t, NULL, :iid, :t, :t) RETURNING id`,
    { title: str(t.title, 120) || `${t.client_name || "의뢰"} 건`, client: t.client_name, contact: t.client_contact, iid: t.inquiry_id, t: ts },
  );
  const id = row.rows[0]?.id;
  await run("UPDATE threads SET project_id = :pid, updated_at = :t WHERE id = :id", { pid: id, t: ts, id: t.id });
  res.status(201).json({ ok: true, id });
});

/** 진행률·마감·미리보기 주소·완료 여부. 의뢰인 화면이 이 값으로 그려진다. */
deskRouter.patch("/desk/project/:id", async (req, res) => {
  const id = int(req.params.id);
  const p = await one("SELECT * FROM projects WHERE id = :id", { id });
  if (!p) return res.status(404).json({ error: "일감을 찾을 수 없어요." });
  const b = req.body || {};
  const has = (k) => Object.prototype.hasOwnProperty.call(b, k);
  const status = has("status") && ["lead", "active", "done", "dropped"].includes(b.status) ? b.status : p.status;

  await run(
    `UPDATE projects SET progress = :progress, preview_url = :preview, status = :status,
       done_at = :done, updated_at = :t WHERE id = :id`,
    {
      id,
      progress: has("progress") ? Math.max(0, Math.min(100, int(b.progress))) : Number(p.progress || 0),
      preview: has("preview_url") ? str(b.preview_url, 500) : p.preview_url,
      status,
      done: status === "done" ? Number(p.done_at) || now() : null,
      t: now(),
    },
  );

  // 완료로 옮기는 것은 의뢰인에게 알려야 하는 사건이다. 대화에 한 줄 남긴다.
  if (status === "done" && p.status !== "done") {
    const t = await one("SELECT id FROM threads WHERE project_id = :pid", { pid: id });
    if (t) {
      await addMessage(t.id, "system", "작업을 완료했습니다. 인수 내용을 확인해주세요.", { kind: "delivered" })
        .catch((e) => logError("desk:delivered", e));
    }
  }
  res.json({ ok: true });
});

/** 이 일감의 체크리스트 전체(내부용 포함). 무엇이 공개 중인지 함께 준다. */
deskRouter.get("/desk/project/:id/tasks", async (req, res) => {
  const rows = await all(
    "SELECT id, title, state, sort, shared FROM product_tasks WHERE product = :k ORDER BY sort, id",
    { k: taskKey(int(req.params.id)) },
  );
  res.json({ tasks: rows });
});

// ── 대화 관리 ──────────────────────────────────────────────────────────
deskRouter.patch("/desk/:id", async (req, res) => {
  const t = await threadById(int(req.params.id));
  if (!t) return res.status(404).json({ error: "대화를 찾을 수 없어요." });
  const b = req.body || {};
  const has = (k) => Object.prototype.hasOwnProperty.call(b, k);
  const status = has("status") && ["open", "closed"].includes(b.status) ? b.status : t.status;
  await run("UPDATE threads SET title = :title, status = :status, project_id = :pid, updated_at = :t WHERE id = :id", {
    id: t.id,
    title: has("title") ? str(b.title, 120) || t.title : t.title,
    status,
    pid: has("project_id") ? (int(b.project_id) || null) : t.project_id,
    t: now(),
  });
  res.json({ ok: true });
});

/**
 * 새 링크 발급. 옛 링크는 그 자리에서 죽는다.
 *
 * 링크를 화면에 한 번 보여 주는 이유는, 메일이 막힌 의뢰인에게 문자·카카오톡으로
 * 직접 건네야 할 때가 있어서다. 이 값은 이 응답에만 존재한다.
 */
deskRouter.post("/desk/:id/link", async (req, res) => {
  const t = await threadById(int(req.params.id));
  if (!t) return res.status(404).json({ error: "대화를 찾을 수 없어요." });
  const token = await rotateToken(t.id);
  if (req.body?.mail) mailThreadLink(t, token);
  res.json({ ok: true, url: threadUrl(token) });
});

/**
 * 문의 없이 대화를 먼저 연다. 전화로 먼저 들어온 일감을 여기에 올려 두고
 * 링크만 건네면, 그다음부터는 사이트 안에서 굴러간다.
 */
deskRouter.post("/desk", async (req, res) => {
  const name = str(req.body?.name, 60);
  const contact = str(req.body?.contact, 200);
  if (!name) return res.status(400).json({ error: "의뢰인 성함을 적어주세요." });
  const t = await createThread({ name, contact, title: str(req.body?.title, 120) || `${name}님 · 상담` });
  const first = str(req.body?.message, 5000);
  if (first) await addMessage(t.id, "reamer", first).catch((e) => logError("desk:first", e));
  res.status(201).json({ ok: true, id: t.id, url: t.url });
});
