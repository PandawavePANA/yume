// 대표 메일함(reamer@d-reamer.com, Google Workspace) 연결 — IMAP으로 읽고 SMTP로 답장한다.
//
// OAuth 대신 앱 비밀번호를 쓴다. 개인용 OAuth 앱은 "테스트" 상태라 갱신 토큰이 7일마다 끊기고, Gmail 읽기 범위는
// 구글 심사 대상이라 1인 회사가 통과시키기 어렵다. 앱 비밀번호는 대표가 구글 계정에서 만들어 Railway에만 넣는다
// (GMAIL_USER, GMAIL_APP_PASSWORD). 코드·저장소·DB 어디에도 비밀번호를 남기지 않는다.
//
// 답장은 Gmail SMTP로 보낸다 — 대표 주소에서 나가고, 보낸편지함에 남고, In-Reply-To/References로 원래 대화에 붙는다.
import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";
import { simpleParser } from "mailparser";

export const gmailUser = () => String(process.env.GMAIL_USER || "").trim();
export const gmailConfigured = () => Boolean(gmailUser() && process.env.GMAIL_APP_PASSWORD);

function imap() {
  return new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: { user: gmailUser(), pass: String(process.env.GMAIL_APP_PASSWORD).replace(/\s+/g, "") },
    logger: false,
  });
}

const clip = (s, n) => String(s || "").replace(/\r/g, "").slice(0, n);

/**
 * 받은편지함에서 uid > sinceUid 인 메일(최대 limit통). 처음이면(sinceUid 0) 최근 days일만.
 * 반환: { uidValidity, messages: [{ uid, messageId, inReplyTo, references, from, fromName, to, subject, date, text }] }
 */
export async function fetchNew({ sinceUid = 0, uidValidity = null, limit = 30, days = 3 } = {}) {
  const client = imap();
  await client.connect();
  const lock = await client.getMailboxLock("INBOX");
  try {
    const box = client.mailbox;
    const validity = String(box.uidValidity);
    // UIDVALIDITY가 바뀌면 uid를 다시 센다(메일함이 재구성됨) — 최근 며칠만 다시 본다.
    const fresh = !sinceUid || (uidValidity && uidValidity !== validity);
    const range = fresh ? { since: new Date(Date.now() - days * 86_400_000) } : { uid: `${Number(sinceUid) + 1}:*` };
    const out = [];
    for await (const m of client.fetch(range, { uid: true, source: true, envelope: true }, { uid: true })) {
      if (!fresh && m.uid <= Number(sinceUid)) continue;
      const p = await simpleParser(m.source);
      const from = p.from?.value?.[0] || {};
      out.push({
        uid: m.uid,
        messageId: p.messageId || `<uid-${validity}-${m.uid}@imap>`,
        inReplyTo: p.inReplyTo || "",
        references: Array.isArray(p.references) ? p.references.join(" ") : p.references || "",
        from: String(from.address || "").toLowerCase(),
        fromName: from.name || "",
        to: (p.to?.value || []).map((x) => x.address).join(", "),
        subject: clip(p.subject, 300),
        date: p.date ? p.date.getTime() : Date.now(),
        text: clip(p.text || (p.html ? String(p.html).replace(/<[^>]+>/g, " ") : ""), 12_000),
        autoSubmitted: String(p.headers.get("auto-submitted") || "").toLowerCase(),
        listId: String(p.headers.get("list-id") || ""),
      });
      if (out.length >= limit) break;
    }
    return { uidValidity: validity, messages: out.sort((a, b) => a.uid - b.uid) };
  } finally {
    lock.release();
    await client.logout().catch(() => {});
  }
}

/** 답장한 메일에 '답장함' 표시(Gmail에서 화살표 아이콘). 실패해도 답장 자체는 끝난 것이라 삼킨다. */
export async function markAnswered(uid) {
  const client = imap();
  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      await client.messageFlagsAdd({ uid: String(uid) }, ["\\Answered", "\\Seen"], { uid: true });
    } finally {
      lock.release();
    }
  } catch {
    /* 표시만 못 한 것 */
  } finally {
    await client.logout().catch(() => {});
  }
}

let transport = null;
function smtp() {
  if (!transport) {
    transport = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: gmailUser(), pass: String(process.env.GMAIL_APP_PASSWORD).replace(/\s+/g, "") },
    });
  }
  return transport;
}

/** 대표 주소로 답장. 원래 메일의 Message-ID로 같은 대화에 붙인다. */
export async function sendReply({ to, subject, text, inReplyTo = "", references = "", fromName = "" }) {
  const subj = /^re:/i.test(subject) ? subject : `Re: ${subject}`;
  const info = await smtp().sendMail({
    from: fromName ? `"${fromName}" <${gmailUser()}>` : gmailUser(),
    to,
    subject: subj,
    text,
    ...(inReplyTo ? { inReplyTo, references: [references, inReplyTo].filter(Boolean).join(" ") } : {}),
  });
  return { messageId: info.messageId };
}
