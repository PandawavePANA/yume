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
import { getSetting, setSetting } from "../auditDesk.js";
import { openToken, sealToken } from "../threads.js";

// 연결 정보는 두 곳 중 하나 — Railway 환경변수(GMAIL_USER·GMAIL_APP_PASSWORD), 또는 대표가 AI 본사 "오늘 할 일"에서
// 직접 넣은 값(접속 시험에 성공했을 때만, ADMIN_SECRET으로 봉인해 DB에 저장). 2026-10-14 대표가 원격이라 Railway에
// 못 들어가서 만든 길이다. 봉인한 값은 서버 비밀값이 있어야만 열린다(threads.js sealToken과 같은 방식).
const SETTING = "gmail:creds";
let stored = null; // { user, pass }

export async function loadGmailCreds() {
  const sealed = await getSetting(SETTING).catch(() => null);
  const raw = sealed ? openToken(sealed) : null;
  try {
    stored = raw ? JSON.parse(raw) : null;
  } catch {
    stored = null;
  }
  return Boolean(stored);
}

const creds = () =>
  process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD
    ? { user: String(process.env.GMAIL_USER).trim(), pass: String(process.env.GMAIL_APP_PASSWORD) }
    : stored;

export const gmailUser = () => String(creds()?.user || "").trim();
export const gmailConfigured = () => Boolean(creds()?.user && creds()?.pass);

function imapWith({ user, pass }) {
  return new ImapFlow({ host: "imap.gmail.com", port: 993, secure: true, auth: { user, pass: String(pass).replace(/\s+/g, "") }, logger: false });
}
const imap = () => imapWith(creds());

/** 이 계정·앱 비밀번호로 메일함에 실제로 들어가지는지(받은편지함을 열어 보고 바로 나온다). */
export async function testLogin(user, pass) {
  const client = imapWith({ user, pass });
  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    lock.release();
    return { ok: true };
  } catch (e) {
    const msg = String(e?.responseText || e?.message || e);
    return { ok: false, error: /AUTHENTICATIONFAILED|Invalid credentials|Application-specific/i.test(msg) ? "로그인 실패 — 계정 주소나 앱 비밀번호(16자리)를 확인해 주세요." : `메일함에 접속하지 못했어요: ${msg.slice(0, 160)}` };
  } finally {
    await client.logout().catch(() => {});
  }
}

/** 대표가 넣은 연결 정보 — 시험에 성공해야 봉인해 저장한다. 비밀번호는 어디에도 기록하지 않는다. */
export async function saveGmailCreds(user, pass, { test = testLogin } = {}) {
  const u = String(user || "").trim().toLowerCase();
  const p = String(pass || "").replace(/\s+/g, "");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(u)) return { error: "메일 주소를 확인해 주세요." };
  if (!/^[a-zA-Z]{16}$/.test(p)) return { error: "앱 비밀번호는 영문 16자리예요(띄어쓰기는 있어도 됩니다)." };
  const sealed = sealToken(JSON.stringify({ user: u, pass: p }));
  if (!sealed) return { error: "서버 비밀값이 없어 안전하게 저장할 수 없어요." };
  const r = await test(u, p);
  if (!r.ok) return { error: r.error };
  await setSetting(SETTING, sealed);
  stored = { user: u, pass: p };
  transport = null;
  return { ok: true, user: u };
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
      auth: { user: gmailUser(), pass: String(creds()?.pass || "").replace(/\s+/g, "") },
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
