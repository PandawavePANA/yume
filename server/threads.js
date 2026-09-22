// 의뢰 스레드 — 리머 사이트의 문의·대화·견적·결제를 한 줄로 잇는 곳.
//
// 지금까지 리머의 일 처리는 사이트 밖에서 일어났다. 문의는 양식으로 받지만 그다음은
// 메일과 전화로 흩어지고, 견적은 말로 오가고, 입금은 계좌번호를 불러 주는 식이다.
// 그래서 "어디까지 이야기했더라"가 사람 기억에만 남고, 의뢰인은 진행 상황을 물어봐야
// 알 수 있다. 여기서는 그 전부를 한 주소 안에 둔다.
//
// 의뢰인에게 계정을 만들게 하지 않는다. 개발을 맡기려고 회원가입부터 하라고 하면
// 대부분 거기서 그만둔다. 문의 한 건마다 긴 무작위 토큰을 만들고, 그 주소를 아는
// 사람만 들어온다 — 토큰이 곧 열쇠다. 대신 토큰 원문은 저장하지 않고 해시만 남긴다
// (세션·API 키와 같은 규칙). DB가 통째로 새어도 남의 대화를 열 수는 없어야 한다.
import crypto from "node:crypto";
import { now, one, all, run } from "./db.js";
import { sha256, randomToken } from "./security.js";
import { sendMail, mailConfigured } from "./mailer.js";
import { logError } from "./errorLog.js";
import { COMPANY } from "./renderPages.js";

// 의뢰인이 돌아올 주소. 리머 사이트는 별도 도메인의 정적 배포다.
const SITE = (process.env.REAMER_SITE_URL || "https://www.d-reamer.com").replace(/\/+$/, "");
// 관리자 데스크가 있는 곳(유메 서버).
const DESK = () => `${(process.env.PUBLIC_BASE_URL || "https://www.yume-reamer.com").replace(/\/+$/, "")}/admin/desk`;

// 토큰은 경로가 아니라 **해시(#)** 뒤에 붙인다. 해시는 서버로 전송되지 않고
// Referer 헤더에도 실리지 않는다. 경로에 두면 의뢰인이 이 페이지에서 바깥 링크를
// 한 번 누르는 순간 그 사이트의 접속 기록에 토큰이 남는다.
export const threadUrl = (token) => `${SITE}/t#${token}`;

const SENDERS = new Set(["client", "reamer", "system"]);
// 대화는 한 번에 여러 줄이 오간다. 줄마다 메일이 날아가면 알림을 꺼 버리게 된다.
const NOTIFY_GAP_MS = 10 * 60 * 1000;

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const looksEmail = (v) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(v || "").trim());
export const won = (n) => `${Number(n || 0).toLocaleString("ko-KR")}원`;
export const normalizeEmail = (v) => (looksEmail(v) ? String(v).trim().toLowerCase().slice(0, 200) : null);


// ── 링크 봉인 ──────────────────────────────────────────────────────────
//
// 조회는 해시로 한다(토큰을 아는 사람만 열린다). 그런데 알림 메일의 "이어서 보기"
// 버튼에는 토큰이 필요하고, 해시에서는 되돌릴 수 없다. 그래서 토큰을 서버 비밀값으로
// 한 번 더 봉해 따로 둔다.
//
// 이렇게 두면 DB만 새는 경우(백업 유출, 잘못 열린 읽기 권한)에는 남의 대화를 열 수 없고,
// 환경변수까지 함께 새야 열린다. 환경변수가 새면 DB 접속정보와 결제 시크릿도 같이
// 나가는 상황이라, 그 선을 넘은 뒤에 여기만 버티는 것은 의미가 없다.
//
// 비밀값이 없으면 봉인하지 않는다. 그 경우 알림 메일에는 링크 없이 "대화에 새 글이
// 있습니다"만 나가고, 링크는 재발급으로 받는다 — 평문으로 저장하지는 않는다.
const LINK_KEY = () =>
  process.env.THREAD_LINK_KEY || process.env.ADMIN_SECRET || process.env.ADMIN_COOKIE_SECRET || "";

const keyBytes = () => {
  const raw = LINK_KEY();
  return raw ? crypto.createHash("sha256").update(raw).digest() : null;
};

export function sealToken(token) {
  const key = keyBytes();
  if (!key) return null;
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([c.update(token, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), body]).toString("base64");
}

/** 봉인된 토큰을 연다. 비밀값이 바뀌었거나 없으면 null — 그때는 링크 없이 알린다. */
export function openToken(sealed) {
  const key = keyBytes();
  if (!key || !sealed) return null;
  try {
    const buf = Buffer.from(String(sealed), "base64");
    if (buf.length < 29) return null;
    const d = crypto.createDecipheriv("aes-256-gcm", key, buf.subarray(0, 12));
    d.setAuthTag(buf.subarray(12, 28));
    return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

// ── 스레드 ─────────────────────────────────────────────────────────────

/**
 * 문의 한 건에 대화방을 연다. 돌려주는 token은 이 순간에만 존재한다 —
 * 저장되는 것은 해시뿐이라, 여기서 받아 링크를 만들지 않으면 다시 알 수 없다.
 */
export async function createThread({ inquiryId = null, name, contact, title }) {
  const token = randomToken(32);
  const t = now();
  const row = await run(
    `INSERT INTO threads (token_hash, link_enc, inquiry_id, client_name, client_contact, client_email, title, status, last_message_at, created_at, updated_at)
     VALUES (:h, :enc, :iid, :name, :contact, :email, :title, 'open', :t, :t, :t) RETURNING id`,
    {
      h: sha256(token),
      enc: sealToken(token),
      iid: inquiryId,
      name: String(name || "").slice(0, 60) || null,
      contact: String(contact || "").slice(0, 200) || null,
      email: normalizeEmail(contact),
      title: String(title || "새 의뢰").slice(0, 120),
      t,
    },
  );
  return { id: row.rows[0]?.id, token, url: threadUrl(token) };
}

export function threadByToken(token) {
  if (typeof token !== "string" || token.length < 20 || token.length > 200) return Promise.resolve(null);
  return one("SELECT * FROM threads WHERE token_hash = :h", { h: sha256(token) });
}

/**
 * 토큰을 새로 발급한다(링크 재발급). 옛 토큰은 이 순간 죽는다 — 해시만 저장하므로
 * 옛 토큰을 다시 보내 줄 방법이 없고, 메일함이 털린 경우를 생각하면 바꾸는 쪽이 맞다.
 */
export async function rotateToken(threadId) {
  const token = randomToken(32);
  await run("UPDATE threads SET token_hash = :h, link_enc = :enc, updated_at = :t WHERE id = :id", {
    h: sha256(token),
    enc: sealToken(token),
    t: now(),
    id: Number(threadId),
  });
  return token;
}

export const threadById = (id) => one("SELECT * FROM threads WHERE id = :id", { id: Number(id) });

/**
 * 문의 한 건을 그대로 대화방으로 연다.
 *
 * 첫 줄은 의뢰인이 쓴 문의 내용 그대로다. 빈 화면에서 시작하면 서로 무슨 이야기를
 * 하던 중이었는지부터 다시 맞춰야 한다.
 */
export async function openThreadForInquiry(inquiry) {
  const t = await createThread({
    inquiryId: inquiry.id,
    name: inquiry.name,
    contact: inquiry.contact,
    // 목록에서 한 줄로 알아볼 수 있으면 된다. 회사명은 이제 묻지 않으므로 보내오면만 쓴다.
    title: [inquiry.company || `${inquiry.name}님`, inquiry.budget].filter(Boolean).join(" · ").slice(0, 120),
  });
  await addMessage(t.id, "client", inquiry.message, { kind: "inquiry" });
  return t;
}

export function listMessages(threadId, afterId = 0) {
  return all("SELECT * FROM thread_messages WHERE thread_id = :id AND id > :after ORDER BY id", {
    id: Number(threadId),
    after: Number(afterId) || 0,
  });
}

export const listQuotes = (threadId) =>
  all("SELECT * FROM thread_quotes WHERE thread_id = :id ORDER BY id DESC", { id: Number(threadId) });

/**
 * 한 줄 남긴다. 스레드의 마지막 시각과 마지막으로 말한 쪽도 같이 옮겨 둔다 —
 * 목록에서 "답장을 기다리는 중"과 "내가 답할 차례"를 가르는 것이 그 값이다.
 *
 * 쓴 사람은 자기가 쓴 것을 읽은 것으로 친다. 그래야 안 읽은 수가 자기 말까지 세지 않는다.
 */
export async function addMessage(threadId, sender, body, { kind = "text", quoteId = null } = {}) {
  if (!SENDERS.has(sender)) throw new Error(`알 수 없는 발신자: ${sender}`);
  const text = String(body || "").trim().slice(0, 5000);
  if (!text) throw new Error("빈 메시지");
  const t = now();
  const row = await run(
    `INSERT INTO thread_messages (thread_id, sender, kind, body, quote_id, created_at)
     VALUES (:tid, :s, :k, :b, :q, :t) RETURNING id`,
    { tid: Number(threadId), s: sender, k: kind, b: text, q: quoteId, t },
  );
  const readColumn =
    sender === "client" ? ", client_read_at = :t" : sender === "reamer" ? ", admin_read_at = :t" : "";
  await run(
    `UPDATE threads SET last_message_at = :t, last_sender = :s, updated_at = :t${readColumn} WHERE id = :tid`,
    { t, s: sender, tid: Number(threadId) },
  );
  return { id: row.rows[0]?.id, created_at: t };
}

export const markRead = (threadId, who) =>
  run(`UPDATE threads SET ${who === "client" ? "client_read_at" : "admin_read_at"} = :t WHERE id = :id`, {
    t: now(),
    id: Number(threadId),
  });

// ── 메일 알림 ──────────────────────────────────────────────────────────
//
// 메일은 실패해도 대화를 되돌리지 않는다. 말은 이미 DB에 남았고 그게 기준이다.
// 그래서 기다리지 않고 보내고, 실패는 기록만 남긴다.

const OWNER = () => process.env.INQUIRY_TO || process.env.COMPANY_EMAIL || COMPANY.email;
const fire = (label, p) => Promise.resolve(p).catch((e) => logError(label, e));

function shell(title, inner, cta) {
  return `<div style="font-family:system-ui,-apple-system,'Noto Sans KR',sans-serif;max-width:560px;color:#141118;line-height:1.7">
  <p style="margin:0 0 6px;font-size:12px;letter-spacing:.16em;color:#8B8694">REAMER</p>
  <h2 style="margin:0 0 16px;font-size:19px;font-weight:650">${esc(title)}</h2>
  ${inner}
  ${cta ? `<p style="margin:22px 0 0"><a href="${esc(cta.href)}" style="display:inline-block;padding:11px 20px;border-radius:10px;background:#141118;color:#fff;text-decoration:none;font-size:14px;font-weight:600">${esc(cta.label)}</a></p>` : ""}
  <p style="margin:20px 0 0;padding-top:14px;border-top:1px solid #E7E4EE;font-size:11.5px;color:#8B8694">
    ${esc(COMPANY.name)} · ${esc(COMPANY.tel)} · <a href="mailto:${esc(COMPANY.email)}" style="color:#8B8694">${esc(COMPANY.email)}</a>
  </p>
</div>`;
}

/** 의뢰인에게 "여기서 이어서 이야기하세요". 링크가 곧 열쇠라는 것도 함께 알린다. */
export function mailThreadOpened(thread, token) {
  if (!thread.client_email || !mailConfigured()) return;
  const url = threadUrl(token);
  fire("thread:mail-open", sendMail({
    to: thread.client_email,
    replyTo: COMPANY.email,
    subject: "[리머] 문의가 접수됐습니다 · 진행 상황은 이 링크에서",
    text: [
      `${thread.client_name || ""}님, 문의 감사합니다.`,
      "",
      "아래 주소에서 저희와 바로 이야기하실 수 있습니다. 견적과 결제도 같은 자리에서 진행됩니다.",
      url,
      "",
      "이 링크를 아는 사람은 대화를 볼 수 있으니 공유에 주의해주세요.",
      "영업일 기준 하루 안에 첫 답변을 드립니다.",
    ].join("\n"),
    html: shell(
      "문의가 접수됐습니다",
      `<p style="margin:0 0 10px">${esc(thread.client_name || "")}님, 감사합니다. 아래 버튼을 누르면 저희와 바로 이야기하실 수 있습니다. 견적과 결제도 같은 자리에서 진행됩니다.</p>
       <p style="margin:0;font-size:13px;color:#54505E">영업일 기준 하루 안에 첫 답변을 드립니다. 이 링크를 아는 사람은 대화를 볼 수 있으니 공유에 주의해주세요.</p>`,
      { href: url, label: "대화 열기" },
    ),
  }));
}

/** 링크를 잃어버린 의뢰인에게 다시 보낸다. 토큰은 저장돼 있지 않으므로 새로 발급된다. */
export function mailThreadLink(thread, token) {
  if (!thread.client_email || !mailConfigured()) return;
  fire("thread:mail-relink", sendMail({
    to: thread.client_email,
    replyTo: COMPANY.email,
    subject: "[리머] 요청하신 대화 링크입니다",
    text: `요청하신 대화 주소입니다.\n${threadUrl(token)}\n\n이전 링크는 더 이상 열리지 않습니다.`,
    html: shell(
      "요청하신 대화 링크입니다",
      `<p style="margin:0;font-size:13.5px;color:#54505E">보안을 위해 새 링크를 발급했습니다. 이전 링크는 더 이상 열리지 않습니다.</p>`,
      { href: threadUrl(token), label: "대화 열기" },
    ),
  }));
}

/** 우리 쪽에 새 소식. 대화가 오갈 때마다 보내지 않도록 간격을 둔다. */
export async function mailOwnerNewClientMessage(thread, body) {
  if (!mailConfigured()) return;
  if (Number(thread.notified_at || 0) > now() - NOTIFY_GAP_MS) return;
  await run("UPDATE threads SET notified_at = :t WHERE id = :id", { t: now(), id: thread.id });
  fire("thread:mail-owner", sendMail({
    to: OWNER(),
    replyTo: thread.client_email || undefined,
    subject: `[리머 대화] ${thread.client_name || "의뢰인"} · ${String(body).slice(0, 40)}`,
    text: `${thread.client_name || "의뢰인"}님이 메시지를 보냈습니다.\n\n${body}\n\n답장: ${DESK()}`,
    html: shell(
      `${thread.client_name || "의뢰인"}님의 새 메시지`,
      `<p style="margin:0;white-space:pre-wrap;padding:12px 14px;background:#F6F4FA;border-radius:10px">${esc(body)}</p>`,
      { href: DESK(), label: "데스크에서 답장" },
    ),
  }));
}

/**
 * 견적이 확정됐다는 알림.
 *
 * 결제가 아니라 **확정**에 알림을 붙이는 이유는, 그 시점이 일정을 잡아야 하는
 * 시점이기 때문이다. 입금은 그 뒤에 따라온다.
 */
export function mailOwnerQuoteAccepted(thread, quote, { undo = false } = {}) {
  if (!mailConfigured()) return;
  const who = thread.client_name || "의뢰인";
  fire("thread:mail-accepted", sendMail({
    to: OWNER(),
    replyTo: thread.client_email || undefined,
    subject: undo
      ? `[리머] 견적 확정 취소 · ${who}`
      : `[리머 확정] ${who} · ${quote.title} · ${won(quote.amount_krw)}`,
    text: `${who} / ${quote.title} / ${won(quote.amount_krw)}\n${undo ? "확정이 취소됐습니다." : "확정됐습니다. 결제 안내가 의뢰인 화면에 떠 있습니다."}\n\n${DESK()}`,
    html: shell(
      undo ? "견적 확정이 취소됐습니다" : "견적이 확정됐습니다",
      `<p style="margin:0">${esc(who)} · ${esc(quote.title)} · <b>${esc(won(quote.amount_krw))}</b></p>
       <p style="margin:10px 0 0;font-size:13px;color:#54505E">${undo ? "결제 전이라 되돌릴 수 있는 단계였습니다." : "의뢰인 화면에 결제 버튼이 떠 있습니다. 입금은 그 뒤에 들어옵니다."}</p>`,
      { href: DESK(), label: "데스크 열기" },
    ),
  }));
}

/** 의뢰인에게 답장이 왔다는 알림. 상대는 이 화면을 계속 보고 있지 않다. */
export function mailClientNewMessage(thread, body) {
  if (!thread.client_email || !mailConfigured()) return;
  const token = openToken(thread.link_enc);
  fire("thread:mail-client", sendMail({
    to: thread.client_email,
    replyTo: COMPANY.email,
    subject: "[리머] 답변이 도착했습니다",
    text: token ? `${body}\n\n이어서 보기: ${threadUrl(token)}` : `${body}\n\n대화 화면에서 이어서 보실 수 있습니다.`,
    html: shell(
      "답변이 도착했습니다",
      `<p style="margin:0;white-space:pre-wrap;padding:12px 14px;background:#F6F4FA;border-radius:10px">${esc(body)}</p>`,
      token ? { href: threadUrl(token), label: "이어서 보기" } : null,
    ),
  }));
}

/** 결제 요청 안내. 금액이 메일에도 남아야 나중에 "얼마라고 했었지"가 없다. */
export function mailClientQuote(thread, quote) {
  if (!thread.client_email || !mailConfigured()) return;
  const token = openToken(thread.link_enc);
  fire("thread:mail-quote", sendMail({
    to: thread.client_email,
    replyTo: COMPANY.email,
    subject: `[리머] 견적을 보내드렸습니다 · ${won(quote.amount_krw)}`,
    text: [
      quote.title,
      `금액 ${won(quote.amount_krw)} (부가세 포함)`,
      quote.weeks ? `기간 ${quote.weeks}` : null,
      "",
      quote.detail || "",
      "",
      token ? `확인하고 결제하기: ${threadUrl(token)}` : "대화 화면에서 확인하고 결제하실 수 있습니다.",
    ].filter(Boolean).join("\n"),
    html: shell(
      "견적을 보내드렸습니다",
      `<table style="border-collapse:collapse;font-size:14px;width:100%">
        <tr><td style="padding:6px 14px 6px 0;color:#8B8694;white-space:nowrap">항목</td><td><b>${esc(quote.title)}</b></td></tr>
        <tr><td style="padding:6px 14px 6px 0;color:#8B8694">금액</td><td><b>${esc(won(quote.amount_krw))}</b> <span style="color:#8B8694">(부가세 포함)</span></td></tr>
        ${quote.weeks ? `<tr><td style="padding:6px 14px 6px 0;color:#8B8694">기간</td><td>${esc(quote.weeks)}</td></tr>` : ""}
      </table>
      ${quote.detail ? `<p style="margin:14px 0 0;white-space:pre-wrap;padding:12px 14px;background:#F6F4FA;border-radius:10px;font-size:13.5px">${esc(quote.detail)}</p>` : ""}
      <p style="margin:14px 0 0;font-size:12.5px;color:#8B8694">확정한 금액은 이후에 바뀌지 않습니다. 결제 전 환불 조건을 화면에서 확인하실 수 있습니다.</p>`,
      token ? { href: threadUrl(token), label: "확인하고 결제하기" } : null,
    ),
  }));
}

/**
 * 결제 영수증. 전자상거래법 제13조가 계약 내용을 적은 서면을 주도록 하고 있고,
 * 화면에 한 번 보여 주는 것과 나중에 다시 꺼내 볼 기록이 남는 것은 다르다.
 */
export function mailQuoteReceipt(thread, quote) {
  if (!mailConfigured()) return;
  const to = quote.payer_email || thread.client_email;
  const when = new Date(Number(quote.paid_at) || now()).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
  const rows = [
    ["항목", quote.title],
    ["결제 금액", `${won(quote.amount_krw)} (부가세 포함)`],
    ["결제 수단", quote.method || "카드"],
    ["결제 일시", when],
    ["주문번호", quote.payment_id],
  ];
  const seller = [
    `상호 ${COMPANY.name}`,
    `대표 ${COMPANY.ceo}`,
    `사업자등록번호 ${COMPANY.regNo}`,
    COMPANY.mailOrderNo ? `통신판매업 신고 ${COMPANY.mailOrderNo}` : null,
    `주소 ${COMPANY.address}`,
    `전화 ${COMPANY.tel}`,
    `이메일 ${COMPANY.email}`,
  ].filter(Boolean).join(" · ");

  if (to) {
    fire("thread:mail-receipt", sendMail({
      to,
      replyTo: COMPANY.email,
      subject: `[리머] 결제가 완료되었습니다 · ${quote.title}`,
      text: [...rows.map(([k, v]) => `${k}: ${v}`), "", "작업 착수 안내는 대화에서 이어집니다.", "", seller].join("\n"),
      html: shell(
        "결제가 완료되었습니다",
        `<table style="border-collapse:collapse;font-size:14px;width:100%">
          ${rows.map(([k, v]) => `<tr><td style="padding:6px 14px 6px 0;color:#8B8694;white-space:nowrap">${esc(k)}</td><td><b>${esc(v)}</b></td></tr>`).join("")}
        </table>
        <p style="margin:16px 0 0;font-size:12.5px;color:#54505E">
          용역 제공이 시작되기 전에는 전액 환불됩니다. 착수 이후에는 이미 진행된 부분을 제외하고 환불해 드립니다(전자상거래법 제17조).<br/>
          환불 문의 <a href="mailto:${esc(COMPANY.email)}" style="color:#54505E">${esc(COMPANY.email)}</a>
        </p>
        <p style="margin:14px 0 0;font-size:11.5px;color:#8B8694">${esc(seller)}</p>`,
      ),
    }));
  }
  fire("thread:mail-paid-owner", sendMail({
    to: OWNER(),
    subject: `[리머 입금] ${won(quote.amount_krw)} · ${thread.client_name || "의뢰인"}`,
    text: `${thread.client_name || "의뢰인"} / ${quote.title} / ${won(quote.amount_krw)} / ${quote.method || "카드"}\n주문번호 ${quote.payment_id}`,
    html: shell(
      "결제가 들어왔습니다",
      `<p style="margin:0">${esc(thread.client_name || "의뢰인")} · ${esc(quote.title)} · <b>${esc(won(quote.amount_krw))}</b> · ${esc(quote.method || "카드")}</p>`,
      { href: DESK(), label: "데스크 열기" },
    ),
  }));
}
